import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { playerText, straightApostrophe, straightQuotes } from './playerText.ts';

const root = join(import.meta.dirname, '..');
const text = new Set(['.ts', '.mjs', '.js', '.svelte', '.css', '.html', '.md', '.json', '.yml', '.svg', '.py', '.txt']);

/**
 * The project's own files: tracked or new, but not ignored (node_modules,
 * screenshots, the bot's build) and not other worktrees under .claude/.
 * Without git (or outside a checkout), the folders git would leave out are
 * skipped by name.
 */
function files(): string[] {
  let listed: string[];
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
    listed = out.split('\0');
  } catch {
    listed = [...walk(root)].map((p) => relative(root, p).replaceAll('\\', '/'));
  }
  return listed.filter((f) => f && !f.endsWith('/') && text.has(extname(f)) && existsSync(join(root, f)));
}

const SKIP = new Set(['node_modules', 'dist', '.git', '.bot', '.phone', '.claude', '.venv-art', '.preview', '__pycache__']);

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    // (Capture runs, scripts/capture-screens.mjs, at the top only.)
    if (SKIP.has(e.name) || p === join(root, 'screens')) continue;
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// The dash itself, its HTML entities and its JS escape, built from parts so
// this file doesn't match itself.
const emDash = new RegExp([String.fromCharCode(0x2014), '&' + 'mdash;', '&#' + '8212;', '\\\\u' + '2014'].join('|'), 'i');

test('no em dashes anywhere in the project (use • or ; instead)', () => {
  const all = files();
  assert.ok(all.includes('CLAUDE.md') && all.includes('tests/style.test.ts'), 'the project is listed');
  const bad: string[] = [];
  for (const f of all) {
    readFileSync(join(root, f), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (emDash.test(line)) bad.push(`${f}:${i + 1}`);
      });
  }
  assert.deepEqual(bad, []);
});

test('player text uses curly apostrophes and quotes (’ “ ”), never straight ones', () => {
  const texts = playerText();
  assert.ok(texts.some((t) => t.file === 'src/components/Lobby.svelte') && texts.some((t) => t.file === 'index.html'), 'the player text is found');
  const bad: string[] = [];
  for (const { file, src, pieces } of texts) {
    const at = (i: number) => `${file}:${src.slice(0, i).split('\n').length}`;
    const quoted = new Set<string>();
    for (const p of pieces) {
      const raw = src.slice(p.start, p.end);
      if (straightApostrophe(raw, p.afterExpr)) bad.push(`${at(p.start)} ' → ’: ${raw.trim().slice(0, 80)}`);
      if (!quoted.has(p.whole) && straightQuotes(p.whole)) {
        quoted.add(p.whole);
        bad.push(`${at(p.start)} " → “ ”: ${p.whole.trim().slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
