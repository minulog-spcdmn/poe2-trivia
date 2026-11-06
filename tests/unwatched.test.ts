import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UNWATCHED, ignoredFolders, unwatched } from '../unwatched.ts';

const root = join(import.meta.dirname, '..');

test('the dev server watches none of the folders git ignores, where the scripts put their builds, runs and profiles', () => {
  const folders = readFileSync(join(root, '.gitignore'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!') && line.endsWith('/'))
    // (As .gitignore has it: a leading / for the root only.)
    .map((line) => line.replace(/\/$/, ''));
  assert.ok(folders.includes('.phone'), 'read the folders from .gitignore');
  for (const folder of folders) assert.ok(UNWATCHED.includes(folder), `${folder} (in .gitignore) is missing from UNWATCHED in unwatched.ts`);
});

test('it skips those folders and nothing else, from the checkout down, even when the checkout is a worktree inside .claude', () => {
  for (const at of ['C:/projects/poe2-trivia', 'C:\\projects\\poe2-trivia\\.claude\\worktrees\\some-task', '/home/me/dist/poe2-trivia']) {
    const skip = unwatched(at, () => []);
    const path = (rel: string) => (at.includes('\\') ? `${at}\\${rel.split('/').join('\\')}` : `${at}/${rel}`);
    // The app's own files, wherever the checkout is (the folders above it never count).
    for (const rel of ['src/App.svelte', 'src/lib', 'public/icons/a.avif', 'index.html', 'vite.config.ts', 'src/qa/screens/a.ts', 'scripts/relay/.wrangler.ts']) {
      assert.equal(skip(path(rel)), false, `${rel} watched in ${at}`);
    }
    assert.equal(skip(at), false, 'the root itself is watched');
    // The scripts' folders: at the root only for those .gitignore anchors there, else anywhere.
    for (const rel of ['.phone', '.phone/run/index.html', '.claude/worktrees/other/src/App.svelte', 'screens/qa-build/index.html', 'dist/index.html', 'relay/.wrangler/state.json', 'scripts/__pycache__/a.pyc']) {
      assert.equal(skip(path(rel)), true, `${rel} skipped in ${at}`);
    }
  }
  // Either case on Windows, as paths come.
  assert.equal(unwatched('C:\\Projects\\Poe2', () => [])('c:\\projects\\poe2\\.phone\\a'), true);
  // Outside the checkout, nothing.
  assert.equal(unwatched('C:/projects/poe2', () => [])('C:/projects/other/.phone/a'), false);
});

test('and every folder git ignores where it runs, by any of its rules, asked once', () => {
  const at = mkdtempSync(join(tmpdir(), 'unwatched-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: at, stdio: 'ignore' });
    const write = (rel: string, text: string) => {
      mkdirSync(join(at, rel, '..'), { recursive: true });
      writeFileSync(join(at, rel), text);
    };
    write('.gitignore', 'out/\n');
    write('trailer/.gitignore', 'sfx/\n');
    write('.git/info/exclude', 'scratch/\n');
    // A venv says so itself.
    write('.venv-cuda/.gitignore', '*\n');
    for (const rel of ['out/a.js', 'trailer/sfx/a.wav', 'scratch/a.txt', 'src/app.ts', 'node_modules/x/index.js']) write(rel, '');
    assert.deepEqual(ignoredFolders(at).sort(), ['/.venv-cuda', '/out', '/scratch', '/trailer/sfx']);
    let asked = 0;
    const skip = unwatched(at, () => (asked++, ignoredFolders(at)));
    assert.equal(asked, 0, 'not till the watcher asks');
    assert.equal(skip(join(at, 'trailer', 'sfx', 'a.wav')), true);
    assert.equal(skip(join(at, '.venv-cuda', 'Lib', 'site.py')), true);
    assert.equal(skip(join(at, 'src', 'app.ts')), false);
    assert.equal(skip(join(at, 'trailer', 'cut.ts')), false);
    assert.equal(asked, 1);
    // No git there: only the folders above.
    assert.deepEqual(ignoredFolders(join(at, 'nowhere')), []);
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

test('the dev server uses it, from where its config is', () => {
  const config = readFileSync(join(root, 'vite.config.ts'), 'utf8');
  assert.match(config, /watch:\s*\{\s*ignored:\s*unwatched\(fileURLToPath\(new URL\('\.', import\.meta\.url\)\)\)\s*\}/);
});
