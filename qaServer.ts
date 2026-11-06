// The dev server's side of the QA desk (qa.html, docs/qa.md): where this
// branch's change shows, for its "This change" (src/qa/change.ts, from git
// and the scene map); the signalling server its live
// rooms meet on; saving a live room's moment as a scene; and its "before and
// after", the game before this branch served beside it and shots of frames
// for the pixel diff (qaBefore.ts). Dev server only
// (the beta's This change is written as it is built, scripts/qa-change.mjs
// from .github/workflows/deploy.yml; its live rooms meet on the PeerJS cloud).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { json, qaBefore, qaShots } from './qaBefore.ts';
import { QA_PEER_PATH, QA_PEER_PORT } from './src/qa/live/signal.ts';
import { hunksOf, placesTouched, type Change, type FileChange, type Hunk, type PlaceMap } from './src/qa/change.ts';

const gitIn = (root: string) => (...args: string[]) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

/** Where this checkout left main: the merge base with origin/main, or main. */
export function mergeBase(root: string): string | null {
  const git = gitIn(root);
  return git('merge-base', 'origin/main', 'HEAD') ?? git('merge-base', 'main', 'HEAD');
}

/** Git's output as it is (a file's content, a diff), or null where git fails. */
const gitRaw = (root: string, ...args: string[]) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  return r.status === 0 ? r.stdout : null;
};
const known = (root: string, ref: string) => spawnSync('git', ['cat-file', '-e', ref], { cwd: root }).status === 0;

/** Each of `files` at `rev` (null: not there), from one call of git's. */
function showAll(root: string, rev: string, files: string[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  if (!files.length) return out;
  const r = spawnSync('git', ['cat-file', '--batch'], { cwd: root, input: `${files.map((f) => `${rev}:${f}`).join('\n')}\n`, maxBuffer: 1 << 28 });
  const buf = r.stdout;
  let at = 0;
  for (const f of files) {
    const nl = buf.indexOf(10, at);
    if (nl < 0) break;
    const head = /^\S+ (\w+) (\d+)$/.exec(buf.subarray(at, nl).toString());
    at = nl + 1;
    if (!head) {
      out.set(f, null);
      continue;
    }
    const size = Number(head[2]);
    out.set(f, head[1] === 'blob' ? buf.subarray(at, at + size).toString('utf8') : null);
    at += size + 1;
  }
  return out;
}

/**
 * How the lines of `files` moved from the scene map's to `to`'s (a commit,
 * or the working tree): from the map's commit, or for a file it was made
 * of as changed since, that content then (`dirty`, a blob). By file: git's
 * hunks, null where the same, 'unknown' where git can't tell.
 */
export function linesSinceMap(root: string, map: Pick<PlaceMap, 'commit' | 'dirty'>, files: string[], to: string | 'tree'): Map<string, Hunk[] | null | 'unknown'> {
  const out = new Map<string, Hunk[] | null | 'unknown'>();
  const ok = !!map.commit && known(root, `${map.commit}^{commit}`);
  const plain = files.filter((f) => !map.dirty?.[f]);
  if (plain.length) {
    const diff = ok && to !== map.commit ? gitRaw(root, 'diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', map.commit, ...(to === 'tree' ? [] : [to]), '--', 'src') : '';
    const hunks = hunksOf(diff ?? '');
    for (const f of plain) out.set(f, !ok || diff === null ? 'unknown' : (hunks.get(f) ?? null));
  }
  const git = gitIn(root);
  for (const f of files.filter((f) => map.dirty?.[f])) {
    const blob = map.dirty![f];
    const now = to === 'tree' ? (existsSync(join(root, f)) ? git('hash-object', '-w', '--', f) : null) : git('rev-parse', '--verify', '-q', `${to}:${f}`);
    if (!now || !known(root, blob)) out.set(f, 'unknown');
    else if (now === blob) out.set(f, null);
    else {
      const diff = gitRaw(root, 'diff', '-U0', '--no-color', '--no-ext-diff', blob, now);
      out.set(f, diff === null ? 'unknown' : ([...hunksOf(diff).values()][0] ?? []));
    }
  }
  return out;
}

/** The scene map (npm run sweep -- --map), or null where there's none of lines yet. */
export function readSceneMap(root: string): PlaceMap | null {
  const file = join(root, 'src', 'data', 'sceneFiles.json');
  if (!existsSync(file)) return null;
  const map = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(map.places) ? map : null;
}

const EMPTY_MAP: PlaceMap = { commit: '', places: [], sets: [], files: {}, classes: {} };

/** Where this branch's change shows (src/qa/change.ts): what the desk's This change lists. */
export type ChangeHere = Change & {
  /** Where it left main, and the files it changes. */
  base: string;
  files: string[];
  /** The scene map's commit, and its places. */
  map: string | null;
  mapped: string[];
};

/**
 * Where this checkout's change since it left main shows: the places that
 * run its lines, by the scene map. `to`: the working tree (committed or
 * not, untracked files too), or HEAD (the beta's, whose tree its build has
 * added to).
 */
export function changeHere(root: string, to: 'tree' | 'HEAD' = 'tree'): ChangeHere | null {
  const git = gitIn(root);
  const base = mergeBase(root);
  if (!base) return null;
  const head = to === 'HEAD' ? ['HEAD'] : [];
  const lines = (out: string | null) => (out ?? '').split('\n').filter(Boolean);
  const untracked = to === 'tree' ? lines(git('ls-files', '--others', '--exclude-standard')) : [];
  const files = [...new Set([...lines(git('diff', '--name-only', '--no-renames', base, ...head)), ...untracked])].sort();
  const map = readSceneMap(root);
  const hunks = hunksOf(gitRaw(root, 'diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', base, ...head, '--') ?? '');
  const code = files.filter((f) => /^src\/.*\.(svelte|css|ts|js|mjs)$/.test(f));
  const before = showAll(root, base, code);
  const after = to === 'HEAD' ? showAll(root, 'HEAD', code) : new Map(code.map((f) => [f, existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null]));
  const mapped = map ? code.filter((f) => f in map.files) : [];
  const toBase = map ? linesSinceMap(root, map, mapped, base) : new Map<string, null>();
  const toNow = map ? linesSinceMap(root, map, mapped, to === 'tree' ? 'tree' : 'HEAD') : new Map<string, null>();
  const changes: FileChange[] = files.map((file) => {
    const now = after.get(file) ?? null;
    const added: Hunk[] | null = untracked.includes(file) && now !== null ? [{ old: [0, 0], new: [1, now.split('\n').length] }] : null;
    return { file, hunks: added ?? hunks.get(file) ?? [], before: before.get(file) ?? null, after: now, toBase: toBase.get(file) ?? null, toNow: toNow.get(file) ?? null };
  });
  return { base, files, map: map?.commit ?? null, mapped: map?.places ?? [], ...placesTouched(changes, map ?? EMPTY_MAP) };
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

export function qaServer(root: string): Plugin {
  return {
    name: 'qa-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__qa/change', (_req, res) => json(res, 200, changeHere(root)));
      server.middlewares.use('/__qa/before', qaBefore(root, server, () => mergeBase(root)));
      server.middlewares.use('/__qa/shot', qaShots(server));
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
