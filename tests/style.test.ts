import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = join(import.meta.dirname, '..');
const text = new Set(['.ts', '.mjs', '.js', '.svelte', '.css', '.html', '.md', '.json', '.yml', '.svg', '.py', '.txt']);

/**
 * The project's own files: tracked or new, but not ignored (node_modules,
 * screenshots, the bot's build) and not other worktrees under .claude/.
 */
function files(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  return out
    .split('\0')
    .filter((f) => f && !f.endsWith('/') && text.has(extname(f)) && existsSync(join(root, f)));
}

// The dash itself, its HTML entities and its JS escape, built from parts so
// this file doesn't match itself.
const emDash = new RegExp([String.fromCharCode(0x2014), '&' + 'mdash;', '&#' + '8212;', '\\\\u' + '2014'].join('|'), 'i');

test('no em dashes anywhere in the project (use • or ; instead)', () => {
  const all = files();
  assert.ok(all.includes('CLAUDE.md') && all.includes('tests/style.test.ts'), 'git lists the project');
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
