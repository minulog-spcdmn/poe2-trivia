import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const skip = new Set(['node_modules', 'dist', '.git', '.bot']);
const text = new Set(['.ts', '.mjs', '.js', '.svelte', '.css', '.html', '.md', '.json', '.yml', '.svg']);

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (text.has(extname(e.name))) yield p;
  }
}

// The dash itself, its HTML entities and its JS escape, built from parts so
// this file doesn't match itself.
const emDash = new RegExp([String.fromCharCode(0x2014), '&' + 'mdash;', '&#' + '8212;', '\\\\u' + '2014'].join('|'), 'i');

test('no em dashes anywhere in the project (use • or ; instead)', () => {
  const bad: string[] = [];
  for (const f of files(root)) {
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (emDash.test(line)) bad.push(`${relative(root, f)}:${i + 1}`);
      });
  }
  assert.deepEqual(bad, []);
});
