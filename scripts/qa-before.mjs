// The QA desk's "before and after" on the beta (docs/qa.md, B): the code
// before this change, built beside the beta, at poe2.quest/beta/before/. It is
// main where this branch left it (the merge base), with this checkout's QA
// harness (src/qa/ and qa.html) laid over it, so both sides' frames speak the
// same protocol and know the same scenes: the beta's half of what the dev
// server does with a second Vite server (qaBefore.ts).
//
//   VITE_CHANNEL=beta node scripts/qa-before.mjs dist/before            # the beta deploy, after the beta's own build
//   VITE_CHANNEL=beta node scripts/qa-before.mjs out --base <commit>    # from another commit, to try it
//
// A scene or a piece that uses something only this change has can't be built
// as the code before is, so where it reaches for that, the build puts in
// something that fails as the frame loads, saying so (the frame then tells the
// desk it can't show here, as on the dev server): a file that isn't there
// becomes a module that throws, and a name a module doesn't export becomes one
// that throws once it's used. Every other scene and piece builds as it was.
//
// It builds in a worktree of its own in the system's temp folder, removed
// again once done. It makes nothing when the branch is main as it is.

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const INNER = '.qa-before-build.mjs';

if (process.argv[2] === '--inner') await inner(process.argv[3]);
else outer();

function outer() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--base');
  const out = args.find((a, i) => !a.startsWith('--') && i !== at + 1);
  if (!out) {
    console.error('Usage: node scripts/qa-before.mjs <out dir> [--base <commit>]');
    process.exit(2);
  }
  const root = process.cwd();
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const base = at >= 0 ? git('rev-parse', args[at + 1]) : git('merge-base', 'origin/main', 'HEAD');
  if (base === git('rev-parse', 'HEAD')) {
    console.log('This is main as it is: no code before to build.');
    return;
  }
  const dir = join(tmpdir(), `poe2-qa-before-${process.pid}`);
  const partial = `${resolve(root, out)}.partial`;
  console.log(`The code before: main at ${base.slice(0, 7)}, in ${dir}`);
  rmSync(dir, { recursive: true, force: true });
  git('worktree', 'add', '--detach', dir, base);
  try {
    // This checkout's QA harness over it: src/qa/ afresh (so files gone here go there too), qa.html beside it.
    rmSync(join(dir, 'src', 'qa'), { recursive: true, force: true });
    cpSync(join(root, 'src', 'qa'), join(dir, 'src', 'qa'), { recursive: true });
    cpSync(join(root, 'qa.html'), join(dir, 'qa.html'));

    // Its packages: this checkout's while the lockfile is the same (line ends aside), else its own.
    const lf = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    if (lf(join(dir, 'package-lock.json')) === lf(join(root, 'package-lock.json'))) symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'junction');
    else run('npm', ['ci', '--no-audit', '--no-fund'], dir);

    // Built by its own Vite, from its own vite.config.ts: this file, copied in, so `vite` resolves there.
    // (Into a folder beside it first, so a build that fails halfway leaves none.)
    cpSync(fileURLToPath(import.meta.url), join(dir, INNER));
    run(process.execPath, [INNER, '--inner', partial], dir);
    if (!existsSync(join(partial, 'qa.html'))) throw new Error(`main at ${base.slice(0, 7)} builds no qa.html: it's from before the QA desk`);
    rmSync(resolve(root, out), { recursive: true, force: true });
    renameSync(partial, resolve(root, out));
    console.log(`Built into ${out}`);
  } finally {
    rmSync(partial, { recursive: true, force: true });
    // (The link to this checkout's packages undone first, so the delete never reaches through it.)
    const modules = join(dir, 'node_modules');
    if (existsSync(modules) && lstatSync(modules).isSymbolicLink()) unlinkSync(modules);
    try {
      git('worktree', 'remove', '--force', dir);
    } catch {
      rmSync(dir, { recursive: true, force: true });
      git('worktree', 'prune');
    }
  }
}

function run(cmd, args, cwd) {
  // (npm is npm.cmd on Windows, which Node only starts through a shell.)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm' });
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} failed (exit ${r.status})`);
}

/** In the before tree: its build, into `out`, with what only this change has failing where it's reached for. */
async function inner(out) {
  const { build } = await import('vite');
  const MISSING = '\0qa-before-missing:';
  /** The files asked for that the code before doesn't have, numbered the same in every pass. */
  const gone = new Map();
  /** By module (its id, forward slashes): names asked of it that it doesn't export. */
  const unexported = new Map();
  const slash = (id) => id.replace(/\\/g, '/');
  const fail = (what) => `new Error(${JSON.stringify(`${what} isn't in the code before this change`)})`;

  const plugin = {
    name: 'qa-before-missing',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || importer.startsWith('\0') || !/^\.{0,2}\//.test(source)) return null;
      const found = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (found) return found;
      const path = slash(source.startsWith('/') ? source.slice(1) : relative(process.cwd(), join(dirname(importer), source))).split('?')[0];
      if (!gone.has(path)) gone.set(path, gone.size);
      // (Its id says nothing of the file's kind, so no other plugin takes it for CSS or an image.)
      return `${MISSING}${gone.get(path)}`;
    },
    load(id) {
      if (!id.startsWith(MISSING)) return null;
      const n = Number(id.slice(MISSING.length));
      // (Thrown from a function: code after a bare throw is dropped as unreachable, the exports put after it with it.)
      return `(() => { throw ${fail([...gone.keys()][n])}; })();`;
    },
    transform: {
      order: 'post',
      handler(code, id) {
        const names = unexported.get(slash(id));
        if (!names) return null;
        // Each a thing that throws once it's called, read or built: as the dev server's code before fails on it.
        // (Under a name of their own, exported as the one asked for: the module may have that name already, unexported.)
        const lines = [...names].map((name, i) => {
          const value = `new Proxy(function () {}, { get() { throw ${fail(name)}; }, apply() { throw ${fail(name)}; }, construct() { throw ${fail(name)}; } })`;
          return `const __qaBeforeMissing${i} = ${value};\nexport { __qaBeforeMissing${i} as ${name} };`;
        });
        return { code: `${code}\n${lines.join('\n')}\n`, map: null };
      },
    },
  };

  // A build that fails on names not exported says them all at once: given them, it's built again.
  for (let pass = 1; ; pass++) {
    try {
      await build({
        configFile: 'vite.config.ts',
        cacheDir: '.vite',
        logLevel: 'warn',
        plugins: [plugin],
        build: { outDir: out, emptyOutDir: true },
      });
      break;
    } catch (e) {
      const found = missingExports(e);
      const fresh = found.filter(({ exporter, name }) => !unexported.get(exporter)?.has(name));
      if (pass >= 4 || !fresh.length) throw e;
      console.log(`Building it again, with what the code before doesn't export (${fresh.length} more)`);
      for (const { exporter, name } of fresh) unexported.set(exporter, (unexported.get(exporter) ?? new Set()).add(name));
    }
  }
  for (const file of gone.keys()) console.log(`  not in the code before: ${file}`);
  for (const [exporter, names] of unexported)
    if (!exporter.startsWith(MISSING)) console.log(`  not exported by the code before's ${slash(relative(process.cwd(), exporter))}: ${[...names].join(', ')}`);

  /** The names a build said aren't exported, and by which module. */
  function missingExports(e) {
    const errors = [e, ...(e?.errors ?? []), ...(e?.cause?.errors ?? [])];
    return errors.flatMap((x) => {
      if (x?.code !== 'MISSING_EXPORT' || !x.exporter) return [];
      // (The name only in the message: `"name" is not exported by "file"`, in colour.)
      const name = /"([^"]+)" is not exported by/.exec(String(x.message).replace(/\x1b\[[0-9;]*m/g, ''))?.[1];
      return name && /^[A-Za-z_$][\w$]*$/.test(name) ? [{ exporter: slash(x.exporter), name }] : [];
    });
  }
}
