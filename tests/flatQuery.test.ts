import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { FLAT } from '../src/lib/layout.ts';

const root = join(import.meta.dirname, '..');

function* sources(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* sources(p);
    else if (/\.(svelte|css|ts)$/.test(e.name)) yield p;
  }
}

// A phone on its side (lib/layout.ts FLAT) is written out in the components'
// CSS; every copy, and every shorter step of it, keeps FLAT's width floor, or
// a short window just under it would be laid out flat in one place and
// narrow in another (the category cards' rows inside a game fitted flat).
test("every phone-on-its-side query keeps FLAT's width floor", () => {
  const floor = Number(/\(min-width: (\d+)px\)/.exec(FLAT)?.[1]);
  assert.ok(floor, 'FLAT has a min-width');
  const off: string[] = [];
  for (const f of sources(join(root, 'src'))) {
    if (f.endsWith(join('lib', 'layout.ts'))) continue;
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\(orientation: landscape\) and \(max-height: \d+px\)( and \(min-width: (\d+)px\))?/g)) {
      if (!m[2] || Number(m[2]) < floor) off.push(`${relative(root, f)}: ${m[0]}`);
    }
  }
  assert.deepEqual(off, []);
});
