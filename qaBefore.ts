// The QA desk's "before and after" (qa.html, docs/qa.md), the dev server's
// half: the game as it was where this branch left main (the merge base),
// served by a second Vite dev server of its own, so the desk can frame the
// same bench, state and size from the code before and the code now; and
// shots of any frame from one headless Chromium, for the desk's pixel diff.
// Dev server only.
//
// The before tree is the base commit's files, unpacked into the system's
// temp folder (poe2-qa-before/<this checkout>/<sha>/: not under
// node_modules, where Vite would neither watch it nor scan it as the app's
// own code), with this checkout's own QA harness
// (src/qa/ and qa.html) laid over it and kept in step as it is edited: the
// frames then run today's harness against the old game, so the desk and both
// sides' frames speak the same protocol and know the same scenes. Its
// packages are this checkout's (a junction to node_modules) while the
// lockfile is the same, or installed for it with npm ci when not.

import { spawn } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import type { Connect, ViteDevServer } from 'vite';
import type { Browser } from 'playwright-core';

type Res = Parameters<Connect.NextHandleFunction>[1];
type Status = { state: 'preparing'; base: string; step: string } | { state: 'ready'; base: string; origin: string } | { state: 'failed'; base?: string; error: string };

export const json = (res: Res, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

/** A command's run, its stderr's last line as the error when it fails. */
function run(cmd: string, args: string[], cwd: string, input?: NodeJS.ReadableStream): Promise<void> {
  return new Promise((resolve, reject) => {
    // (npm is npm.cmd on Windows, which Node only starts through a shell.)
    const child = spawn(cmd, args, { cwd, shell: process.platform === 'win32' && cmd === 'npm', stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => (err = (err + chunk).slice(-4000)));
    if (input) input.pipe(child.stdin!.on('error', () => {}));
    child.once('error', (e) => reject(new Error(`${cmd}: ${e.message}`)));
    child.once('close', (code) => {
      const tail = err.split('\n').map((l) => l.trim()).filter(Boolean).pop();
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} failed${tail ? `: ${tail}` : ` (exit ${code})`}`));
    });
  });
}

/** The base commit's files, unpacked into dir: git archive piped into tar, run from inside dir so no drive letter reaches tar. */
async function unpack(root: string, base: string, dir: string) {
  const partial = `${dir}.partial`;
  rmSync(partial, { recursive: true, force: true });
  mkdirSync(partial, { recursive: true });
  const git = spawn('git', ['archive', '--format=tar', base], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let gitErr = '';
  git.stderr.setEncoding('utf8').on('data', (chunk: string) => (gitErr += chunk));
  const gitDone = new Promise<void>((resolve, reject) => {
    git.once('error', reject);
    git.once('close', (code) => (code === 0 ? resolve() : reject(new Error(`git archive failed: ${gitErr.trim().split('\n').pop() ?? `exit ${code}`}`))));
  });
  await Promise.all([gitDone, run('tar', ['-xf', '-'], partial, git.stdout)]);
  renameSync(partial, dir);
}

/** A file as it was in a commit, or null when it wasn't there. */
const gitShow = (root: string, spec: string) =>
  new Promise<string | null>((resolve) => {
    const git = spawn('git', ['show', spec], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    git.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    git.once('error', () => resolve(null));
    git.once('close', (code) => resolve(code === 0 ? out : null));
  });

const isLink = (path: string) => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

/**
 * The trees of bases gone by (main has moved on since), deleted once this
 * one's is up: each its packages' link undone first, and the tree left alone
 * if it won't go, so a delete never reaches through it into this checkout's
 * node_modules. In the background, so the dev server doesn't wait on it.
 */
async function prune(cacheRoot: string, keep: string) {
  let names: string[];
  try {
    names = readdirSync(cacheRoot);
  } catch {
    return;
  }
  for (const name of names) {
    const dir = join(cacheRoot, name);
    if (dir === keep) continue;
    const modules = join(dir, 'node_modules');
    try {
      if (isLink(modules)) unlinkSync(modules);
      if (isLink(modules)) continue;
      await rm(dir, { recursive: true, force: true });
    } catch {
      // (In use, or half gone: tried again when the next base comes.)
    }
  }
}

/** A free port on localhost, for the before server (it then listens with strictPort, so a race shows as a failure, not a wrong port). */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createNetServer()
      .once('error', reject)
      .listen(0, 'localhost', () => {
        const { port } = probe.address() as { port: number };
        probe.close(() => resolve(port));
      });
  });

/** One preparation of the before tree for one base, and its server once it runs. */
type Job = { base: string; dir: string; status: Status; overlaid: boolean; server?: ViteDevServer };

export function qaBefore(root: string, server: ViteDevServer, mergeBase: () => string | null) {
  const cacheRoot = join(tmpdir(), 'poe2-qa-before', createHash('sha1').update(root).digest('hex').slice(0, 8));
  let job: Job | null = null;

  // The merge base, looked up at most every two seconds however often the desk asks.
  let baseSeen: { at: number; base: string | null } | null = null;
  const currentBase = () => {
    if (!baseSeen || Date.now() - baseSeen.at > 2000) baseSeen = { at: Date.now(), base: mergeBase() };
    return baseSeen.base;
  };

  const close = (j: Job | null) => {
    if (j?.server) void j.server.close().catch(() => {});
    if (j) j.server = undefined;
  };

  // This checkout's QA harness over the before tree: src/qa/ copied afresh (so files gone here go there too), qa.html beside it.
  const overlay = (dir: string) => {
    rmSync(join(dir, 'src', 'qa'), { recursive: true, force: true });
    cpSync(join(root, 'src', 'qa'), join(dir, 'src', 'qa'), { recursive: true, preserveTimestamps: true });
    cpSync(join(root, 'qa.html'), join(dir, 'qa.html'), { preserveTimestamps: true });
  };

  async function prepare(j: Job) {
    const step = (text: string) => {
      if (job !== j) throw new Error('superseded');
      j.status = { state: 'preparing', base: j.base, step: text };
    };
    try {
      if (!existsSync(join(j.dir, 'package.json'))) {
        step(`Taking main at ${j.base.slice(0, 7)}`);
        rmSync(j.dir, { recursive: true, force: true });
        await unpack(root, j.base, j.dir);
      }
      step('Laying the QA desk over it');
      overlay(j.dir);
      j.overlaid = true;

      // Its packages: this checkout's while the lockfile is the same (line ends aside), else its own.
      const shown = await gitShow(root, `${j.base}:package-lock.json`);
      const lf = (text: string) => text.replace(/\r\n/g, '\n');
      const same = shown !== null && lf(shown) === lf(readFileSync(join(root, 'package-lock.json'), 'utf8'));
      const modules = join(j.dir, 'node_modules');
      if (same) {
        if (!existsSync(modules) && !isLink(modules)) {
          step('Linking packages: the lockfile is the same');
          symlinkSync(join(root, 'node_modules'), modules, 'junction');
        }
      } else if (isLink(modules) || !existsSync(join(modules, '.package-lock.json'))) {
        step('Installing packages: the lockfile changed');
        if (isLink(modules)) unlinkSync(modules);
        await run('npm', ['ci', '--no-audit', '--no-fund'], j.dir);
      }

      step('Starting its server');
      const port = await freePort();
      const { createServer } = await import('vite');
      const before = await createServer({
        root: j.dir,
        configFile: join(j.dir, 'vite.config.ts'),
        // Its own optimizer cache: its node_modules may be this checkout's, but its code isn't.
        cacheDir: join(j.dir, '.vite'),
        // Packages through the junction resolve to their real paths, in this checkout's node_modules.
        server: { host: 'localhost', port, strictPort: true, fs: { allow: [j.dir, join(root, 'node_modules')] } },
        clearScreen: false,
        logLevel: 'warn',
      });
      j.server = before;
      if (job !== j) throw new Error('superseded');
      await before.listen();
      if (job !== j) throw new Error('superseded');
      j.status = { state: 'ready', base: j.base, origin: `http://localhost:${port}` };
      void prune(cacheRoot, j.dir);
    } catch (e) {
      if (job !== j) return close(j);
      close(j);
      j.status = { state: 'failed', base: j.base, error: e instanceof Error ? e.message.split('\n')[0] : String(e) };
    }
  }

  // Edits to the harness here go over to the before tree, gathered for a tenth of a second, file by file. Each
  // gathered file is looked at again half a second later: a second write hard on the heels of the first can
  // come without an event of its own, and a copy keeps its source's mtime, so a stale one shows.
  const qaDir = join(root, 'src', 'qa') + sep;
  const qaHtml = join(root, 'qa.html');
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const sync = (dir: string, path: string) => {
    const to = join(dir, relative(root, path));
    try {
      const from = statSync(path, { throwIfNoEntry: false });
      const was = statSync(to, { throwIfNoEntry: false });
      if (!from) rmSync(to, { recursive: true, force: true });
      else if (from.isDirectory()) mkdirSync(to, { recursive: true });
      else if (!was || was.size !== from.size || was.mtimeMs !== from.mtimeMs) {
        mkdirSync(dirname(to), { recursive: true });
        cpSync(path, to, { preserveTimestamps: true });
      }
    } catch {
      // (A file gone again by the time it is copied: its own unlink is on its way.)
    }
  };
  const mirror = () => {
    timer = null;
    const j = job;
    const paths = [...pending];
    pending.clear();
    if (!j?.overlaid) return;
    for (const path of paths) sync(j.dir, path);
    setTimeout(() => {
      if (job === j) for (const path of paths) sync(j.dir, path);
    }, 500);
  };
  server.watcher.on('all', (_event, file) => {
    const path = join(file);
    if (!job?.overlaid || (path !== qaHtml && !path.startsWith(qaDir))) return;
    pending.add(path);
    timer ??= setTimeout(mirror, 100);
  });

  const shutdown = () => {
    process.off('exit', shutdown);
    close(job);
    job = null;
  };
  server.httpServer?.once('close', shutdown);
  process.once('exit', shutdown);

  /** GET /__qa/before: starts preparing the first time (or when the base has moved, or with ?retry after a failure) and says how far it is. */
  return (req: Connect.IncomingMessage, res: Res) => {
    const base = currentBase();
    if (!base) return json(res, 200, { state: 'failed', error: 'No merge base with main' } satisfies Status);
    const retry = new URL(req.url ?? '/', 'http://x').searchParams.has('retry');
    if (!job || job.base !== base || (job.status.state === 'failed' && retry)) {
      close(job);
      job = { base, dir: join(cacheRoot, base.slice(0, 12)), status: { state: 'preparing', base, step: 'Starting' }, overlaid: false };
      setImmediate(prepare, job);
    }
    json(res, 200, job.status);
  };
}

/** A frame that couldn't start, and why: answered 422, so the desk can tell it from a shot that failed. */
class CantShow extends Error {}

/** Shots of frames, from one headless Chromium launched the first time and kept until the server closes; four at once, the rest queued. */
export function qaShots(server: ViteDevServer) {
  let browser: Promise<Browser> | null = null;
  const launch = () =>
    (browser ??= import('playwright-core').then(async ({ chromium }) => {
      const b = await chromium.launch(process.env.CHROMIUM || process.env.BOT_CHROMIUM ? { executablePath: process.env.CHROMIUM || process.env.BOT_CHROMIUM } : { channel: 'chromium' });
      b.once('disconnected', () => (browser = null));
      return b;
    }).catch((e: unknown) => {
      // (Not kept: the next shot tries again, once Chromium is there.)
      browser = null;
      throw e;
    }));
  const shutdown = () => {
    const b = browser;
    browser = null;
    void b?.then((x) => x.close()).catch(() => {});
  };
  server.httpServer?.once('close', shutdown);

  let running = 0;
  const queue: (() => void)[] = [];
  const slot = () => (running < 4 ? (running++, Promise.resolve()) : new Promise<void>((resolve) => queue.push(resolve)));
  const free = () => {
    const next = queue.shift();
    next ? next() : running--;
  };

  async function shoot(url: string, width: number, height: number, deviceScaleFactor: number, gone: () => boolean) {
    await slot();
    try {
      // (The desk gave up on it while it waited, having moved on: not shot.)
      if (gone()) throw new Error('No longer wanted');
      const context = await (await launch()).newContext({ viewport: { width, height }, deviceScaleFactor, reducedMotion: 'reduce' });
      try {
        // WebGL hidden, so the effects stay off (CLAUDE.md: in software they make every step crawl).
        await context.addInitScript('delete window.WebGL2RenderingContext; delete window.WebGLRenderingContext;');
        const page = await context.newPage();
        // (The before server, just started, builds the frame's modules as it first asks for them: that can take a while.)
        await page.goto(url, { timeout: 120000 });
        // (Given up on while the page came: its slot goes to a shot still wanted.)
        if (gone()) throw new Error('No longer wanted');
        // The frame sets window.__qa once it has come to rest and been checked.
        await page.waitForFunction('!!window.__qa', undefined, { timeout: 60000, polling: 100 });
        // Or it couldn't start (src/qa/main.ts): no shot, but why.
        const failed = (await page.evaluate('window.__qa.failed ?? null')) as string | null;
        if (failed) throw new CantShow(failed);
        await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
        return await page.screenshot({ type: 'png' });
      } finally {
        await context.close().catch(() => {});
      }
    } finally {
      free();
    }
  }

  /** GET /__qa/shot?url=<a localhost frame>&w=<css px>&h=<css px>&dpr=<1>: the frame's viewport as a PNG. */
  return (req: Connect.IncomingMessage, res: Res) => {
    const q = new URL(req.url ?? '/', 'http://x').searchParams;
    let url: URL;
    try {
      url = new URL(q.get('url') ?? '');
    } catch {
      return json(res, 400, { error: 'url is not a URL' });
    }
    const w = Number(q.get('w'));
    const h = Number(q.get('h'));
    const dpr = Number(q.get('dpr') ?? 1);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) return json(res, 400, { error: 'Only http://localhost or 127.0.0.1 frames' });
    if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w <= 8000 && h <= 8000 && dpr > 0 && dpr <= 4)) return json(res, 400, { error: 'w and h are whole CSS pixels, dpr up to 4' });
    let gone = false;
    res.once('close', () => (gone = !res.writableFinished));
    shoot(url.href, w, h, dpr, () => gone).then(
      (png) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store');
        res.end(png);
      },
      (e: Error) => json(res, e instanceof CantShow ? 422 : 500, { error: e.message.split('\n')[0] }),
    );
  };
}
