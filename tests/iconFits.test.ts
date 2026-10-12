import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { cardPictures, categoryArt } from '../src/lib/categoryArt.ts';
import { Engine, type Item } from '../src/lib/game.ts';

// The category cards' baked fits (scripts/bake-icons.mjs, lib/iconFit).
const fits = JSON.parse(readFileSync(new URL('../src/data/iconFits.json', import.meta.url), 'utf8')) as Record<string, Record<string, number> & { mask?: string }>;

test("every baked icon fit is a picture the site serves, measured whole, with its mask", () => {
  assert.ok(Object.keys(fits).length > 0);
  for (const [path, f] of Object.entries(fits)) {
    assert.ok(existsSync(new URL(`../public/${path}`, import.meta.url)), `${path} isn't in public/`);
    for (const key of ['iw', 'ih', 'x', 'y', 'w', 'h']) assert.ok(Number.isFinite(f[key]), `${path}: ${key}`);
    assert.ok(f.w > 0 && f.h > 0 && f.iw > 0 && f.ih > 0, path);
    // Its clean mask, baked with it.
    assert.equal(typeof f.mask, 'string', `${path}: no mask`);
    assert.ok(existsSync(new URL(`../public/${f.mask}`, import.meta.url)), `${path}: its mask ${f.mask} isn't in public/`);
  }
});

test('every picture a category card shows is baked: a data refresh that picks another needs npm run bake-icons', () => {
  const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
  const arts = categoryArt(new Engine(items).byCategory);
  assert.equal(arts.size, new Engine(items).categories.length);
  const shown = cardPictures(arts.values());
  for (const path of shown) assert.ok(fits[path], `${path} isn't baked; run npm run bake-icons`);
  // And nothing baked that no card shows (its mask would ship for nothing).
  for (const path of Object.keys(fits)) assert.ok(shown.includes(path), `${path} is baked but no card shows it`);
});
