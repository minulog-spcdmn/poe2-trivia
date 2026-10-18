// The dev server's side of the QA desk (qa.html, docs/qa.md): what the last
// sweep found (scripts/qa.mjs writes screens/qa-latest.json) and its shots,
// for the desk to mark the stops it found something at; the files this
// branch changes, for its "This change"; the signalling server its live
// rooms meet on; and saving a live room's moment as a scene. Dev server only
// (the beta's change list is written as it is built, see
// .github/workflows/deploy.yml; its live rooms meet on the PeerJS cloud).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import type { Connect, Plugin } from 'vite';
import { QA_PEER_PATH, QA_PEER_PORT } from './src/qa/live/signal.ts';

/**
 * The files this checkout changes since it left main (the merge base with
 * origin/main, or main), committed or not, untracked ones included; paths
 * from the root, forward slashes.
 */
export function changedFiles(root: string): { base: string; files: string[] } | null {
  const git = (...args: string[]) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const base = git('merge-base', 'origin/main', 'HEAD') ?? git('merge-base', 'main', 'HEAD');
  if (!base) return null;
  const lines = (out: string | null) => (out ?? '').split('\n').filter(Boolean);
  const files = new Set([...lines(git('diff', '--name-only', base)), ...lines(git('ls-files', '--others', '--exclude-standard'))]);
  return { base, files: [...files].sort() };
}

/**
 * PeerJS's own signalling server (the `peer` package), started the first
 * time a live room asks, on loopback only. Ids it hasn't seen expire after
 * half a second rather than five, so the open-room list scans in a second or
 * two (the spike measured 10 s at the default). Another worktree's dev
 * server may have it running already: then the rooms share it, each under
 * its own start (lib/peer.ts).
 */
let signalling: Promise<void> | null = null;
function startSignalling(): Promise<void> {
  return (signalling ??= (async () => {
    // (PeerServer keeps its http server to itself: a port in use would throw where nothing can catch it, so look first.)
    const free = await new Promise<boolean>((resolve) => {
      const probe = createNetServer()
        .once('error', () => resolve(false))
        .once('listening', () => probe.close(() => resolve(true)))
        .listen(QA_PEER_PORT, 'localhost');
    });
    if (!free) return;
    const { PeerServer } = await import('peer');
    await new Promise<void>((resolve) => PeerServer({ host: 'localhost', port: QA_PEER_PORT, path: QA_PEER_PATH, expire_timeout: 500, alive_timeout: 60000 }, () => resolve()));
  })());
}

/**
 * Whether a sweep was taken from other code than the checkout's now: another
 * commit, or a file of the game's changed since (`at`). Its marks would
 * point at problems already fixed, or miss new ones.
 */
function sweepStale(root: string, head: string, at: string): boolean {
  const git = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout?.trim() ?? '';
  if (git('rev-parse', 'HEAD') !== head) return true;
  const since = Date.parse(at);
  return git('status', '--porcelain')
    .split('\n')
    .map((l) => l.slice(3).trim())
    .filter((f) => /^(src|index\.html|qa\.html)/.test(f))
    .some((f) => {
      try {
        return statSync(join(root, f)).mtimeMs > since;
      } catch {
        return true;
      }
    });
}

const json = (res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

export function qaServer(root: string): Plugin {
  const screens = join(root, 'screens');
  return {
    name: 'qa-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__qa/latest', (_req, res) => {
        const file = join(screens, 'qa-latest.json');
        if (!existsSync(file)) return json(res, 404, null);
        const sweep = JSON.parse(readFileSync(file, 'utf8')) as { head: string; at: string };
        json(res, 200, { ...sweep, stale: sweepStale(root, sweep.head, sweep.at) });
      });
      server.middlewares.use('/__qa/change', (_req, res) => json(res, 200, changedFiles(root)));
      // A shot of a sweep: /__qa/shot/qa-<when>/<file>.png, and nothing else under screens/.
      server.middlewares.use('/__qa/shot/', (req, res) => {
        const m = /^\/(qa-[\w-]+)\/([\w.-]+\.png)$/.exec(decodeURIComponent((req.url ?? '').split('?')[0]));
        const file = m && join(screens, m[1], m[2]);
        if (!file || !existsSync(file)) return json(res, 404, null);
        res.setHeader('Content-Type', 'image/png');
        res.end(readFileSync(file));
      });
      server.middlewares.use('/__qa/peer', (_req, res) => {
        startSignalling().then(
          () => json(res, 200, { port: QA_PEER_PORT, path: QA_PEER_PATH }),
          (e: Error) => json(res, 500, { error: e.message }),
        );
      });
      // A live room's moment, kept as a scene: src/qa/captured/<name>.json. JSON from the desk itself only.
      server.middlewares.use('/__qa/scenes/save', (req, res) => {
        const origin = req.headers.origin;
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
        if (!String(req.headers['content-type']).startsWith('application/json') || (origin && new URL(origin).host !== req.headers.host)) return json(res, 403, { error: 'JSON from the desk itself only' });
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 5_000_000) req.destroy();
        });
        req.on('end', () => {
          let scene: { name?: unknown; protocol?: unknown; label?: unknown; state?: unknown; seats?: unknown };
          try {
            scene = JSON.parse(body);
          } catch {
            return json(res, 400, { error: 'not JSON' });
          }
          const name = typeof scene.name === 'string' ? scene.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) : '';
          if (!name || typeof scene.protocol !== 'number' || typeof scene.label !== 'string' || typeof scene.state !== 'object' || !Array.isArray(scene.seats)) return json(res, 400, { error: 'not a scene' });
          const dir = join(root, 'src', 'qa', 'captured');
          mkdirSync(dir, { recursive: true });
          const { name: _, ...kept } = scene;
          writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(kept, null, 1)}\n`);
          json(res, 200, { saved: `src/qa/captured/${name}.json` });
        });
      });
    },
  };
}
