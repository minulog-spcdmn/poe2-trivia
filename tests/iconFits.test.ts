import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// The category cards' baked fits (scripts/bake-icons.mjs, lib/iconFit).
const fits = JSON.parse(readFileSync(new URL('../src/data/iconFits.json', import.meta.url), 'utf8')) as Record<string, Record<string, number>>;

test("every baked icon fit is a picture the site serves, measured whole", () => {
  assert.ok(Object.keys(fits).length > 0);
  for (const [path, f] of Object.entries(fits)) {
    assert.ok(existsSync(new URL(`../public/${path}`, import.meta.url)), `${path} isn't in public/`);
    for (const key of ['iw', 'ih', 'x', 'y', 'w', 'h']) assert.ok(Number.isFinite(f[key]), `${path}: ${key}`);
    assert.ok(f.w > 0 && f.h > 0 && f.iw > 0 && f.ih > 0, path);
  }
});
