import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FOSSIL_AMBER } from '../src/lib/fossilAmber.ts';

// One amber for every fossil surface: app.css's --fossil-* for the CSS,
// lib/fossilAmber.ts for the fx and the lights, the same colours.

const css = readFileSync('src/app.css', 'utf8');
const defined = new Map([...css.matchAll(/^\s*(--fossil-[a-z-]+):\s*(#[0-9a-f]{6});/gim)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
const kebab = (k: string) => `--fossil-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

test('the fx amber is app.css’s', () => {
  for (const [k, hex] of Object.entries(FOSSIL_AMBER)) assert.equal(defined.get(kebab(k)), hex, kebab(k));
});

test('every --fossil-* read is one app.css defines', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : /\.(svelte|css|ts)$/.test(d.name) ? [join(dir, d.name)] : []));
  for (const f of files('src')) {
    for (const m of readFileSync(f, 'utf8').matchAll(/var\((--fossil-[a-z-]+)/g)) assert.ok(defined.has(m[1]!), `${f}: ${m[1]}`);
  }
});
