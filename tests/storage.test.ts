import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const src = join(import.meta.dirname, '..', 'src');

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(ts|svelte)$/.test(e.name)) yield p;
  }
}

// The beta shares the live game's origin; src/lib/storage.ts gives its keys
// their own start. Storage used anywhere else could skip that.
test('only src/lib/storage.ts touches localStorage and sessionStorage', () => {
  const bad: string[] = [];
  for (const f of files(src)) {
    if (relative(src, f) === join('lib', 'storage.ts')) continue;
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/\b(local|session)Storage\s*[.[]/.test(line)) bad.push(`${relative(src, f)}:${i + 1}`);
      });
  }
  assert.deepEqual(bad, []);
});
