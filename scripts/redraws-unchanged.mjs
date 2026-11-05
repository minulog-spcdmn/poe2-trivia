// Whether a pull request changes nothing the redraw check sees (docs/qa.md,
// "Redraws"), so its check passes without watching every scene again. Run
// in CI on the pull request's merge commit (HEAD: the pull request merged
// onto main, main its first parent); writes same=true or same=false to
// $GITHUB_OUTPUT, and why to the job's summary.
//
// The same when the merge changes none of the files that can change what
// the check watches or how (matters()), and the beta built from it is the
// beta built from main, byte for byte. The check would then watch the same
// pages with the same code as on main: whatever it found there, this pull
// request didn't bring.
//
//   node scripts/redraws-unchanged.mjs   # in a clean checkout of the merge commit, its parents fetched (CI)

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBeta } from './beta-build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = '.github/workflows/redraws.yml';
const THIS = 'scripts/redraws-unchanged.mjs';

/** git's output, trimmed; null when it fails. */
const git = (/** @type {string[]} */ ...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim();
  } catch {
    return null;
  }
};

/**
 * The sweep and every file it imports, and theirs, with any file under
 * scripts/ one of them or the workflow names (a helper it reads or runs by
 * its path, as find-banding.py, or a step's, as shell-packages.sh): the
 * check's own code, which no build has. Paths from the root, with forward
 * slashes.
 */
export function sweepFiles(root = ROOT) {
  const files = new Set();
  let text = '';
  const walk = (/** @type {string} */ file) => {
    const found = [file, `${file}.ts`, `${file}.js`, `${file}.mjs`, path.join(file, 'index.ts')].find((f) => existsSync(f) && statSync(f).isFile());
    if (!found) return;
    const rel = path.relative(root, found).replaceAll('\\', '/');
    if (files.has(rel)) return;
    files.add(rel);
    if (!/\.(m?js|ts)$/.test(found)) return;
    const code = readFileSync(found, 'utf8');
    // (The game's own files name scripts only to say what made them, and change the check whatever they say.)
    if (!rel.startsWith('src/')) text += code;
    for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) walk(path.join(path.dirname(found), m[1] ?? ''));
  };
  walk(path.join(root, 'scripts', 'sweep.mjs'));
  text += readFileSync(path.join(root, WORKFLOW), 'utf8');
  for (const e of readdirSync(path.join(root, 'scripts'), { recursive: true, withFileTypes: true })) {
    if (e.isFile() && new RegExp(`(?<![\\w.-])${e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text)) files.add(path.relative(root, path.join(e.parentPath, e.name)).replaceAll('\\', '/'));
  }
  return files;
}

/**
 * Whether a change to `file` (a path from the root) can change what the
 * check watches or how, with no need to build to tell: the game's own files
 * (src/, public/), any file at the root but markdown (the pages, the
 * configs, package.json and the lock, which has Chrome's version), the
 * workflow, this script, and the sweep with what it imports (`own`). Any
 * other file (docs, tests, the other scripts) is left to the builds to tell.
 */
export function matters(/** @type {string} */ file, /** @type {Set<string>} */ own) {
  return /^(src|public)\//.test(file) || (!file.includes('/') && !file.endsWith('.md')) || file === WORKFLOW || file === THIS || own.has(file);
}

/** Each file under `dir`, by its path from there, with its contents' hash. */
function filesOf(/** @type {string} */ dir) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue;
    const file = path.join(e.parentPath, e.name);
    out.set(path.relative(dir, file).replaceAll('\\', '/'), createHash('sha256').update(readFileSync(file)).digest('hex'));
  }
  return out;
}

/** The first file the two builds differ in, or null when they're the same. */
function firstDifference(/** @type {Map<string, string>} */ a, /** @type {Map<string, string>} */ b) {
  for (const [file, hash] of a) if (b.get(file) !== hash) return file;
  for (const file of b.keys()) if (!a.has(file)) return file;
  return null;
}

/** Whether the merge commit checked out changes nothing the check sees, and why. */
export function unchanged() {
  const parents = git('rev-list', '--parents', '-n', '1', 'HEAD')?.split(' ').slice(1) ?? [];
  if (parents.length !== 2) return { same: false, why: 'HEAD isn’t a pull request merged onto main (its parents not fetched?)' };
  const main = /** @type {string} */ (parents[0]);
  const head = git('rev-parse', 'HEAD');
  const changed = git('diff', '--name-only', '--no-renames', '-z', main, 'HEAD')?.split('\0').filter(Boolean);
  if (!head || !changed) return { same: false, why: 'git couldn’t say what it changes' };
  const own = sweepFiles();
  const hit = changed.find((f) => matters(f, own));
  if (hit) return { same: false, why: `it changes ${hit}` };
  if (!changed.length) return { same: true, why: 'it changes no file' };
  if (git('status', '--porcelain', '--untracked-files=no')) return { same: false, why: 'the checkout has changes of its own, so main’s can’t be checked out to build' };
  if (!existsSync(path.join(ROOT, 'node_modules', 'vite'))) {
    const r = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) return { same: false, why: 'npm ci failed' };
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), 'redraws-unchanged-'));
  try {
    const after = path.join(dir, 'after');
    const before = path.join(dir, 'before');
    if (buildBeta(ROOT, after) !== 0) return { same: false, why: 'its beta didn’t build' };
    if (git('checkout', '-q', '--detach', main) === null) return { same: false, why: 'main couldn’t be checked out' };
    try {
      if (buildBeta(ROOT, before) !== 0) return { same: false, why: 'main’s beta didn’t build' };
    } finally {
      git('checkout', '-q', '--detach', head);
    }
    const differs = firstDifference(filesOf(after), filesOf(before));
    if (differs) return { same: false, why: `its beta differs from main’s (${differs})` };
    return { same: true, why: `its beta is main’s, byte for byte, and the check’s own code is the same (it changes ${changed.length === 1 ? changed[0] : `${changed.length} files`})` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { same, why } = unchanged();
  const text = same ? `Nothing the redraw check sees changed: ${why}. It passes without watching the scenes again.` : `The redraw check runs in full: ${why}.`;
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Redraws\n\n${text}\n`);
  // (Written last, so a job that fails along the way says nothing.)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `same=${same}\n`);
}
