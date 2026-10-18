import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import type { Item } from '../src/lib/game.ts';
import { useItems } from '../src/qa/build/engine.ts';
import { SIZES, WALK_SIZES, isSizeKey, PRESETS } from '../src/qa/sizes.ts';
import { SCREENS, seatLabel } from '../src/qa/scene.ts';
import { matches, sizesFor, walk } from '../src/qa/desk/walk.ts';
import { answered } from '../src/qa/frame/emulate.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));
useItems(items, fakes);
const { catalog } = await import('../src/qa/scenes/index.ts');

// The QA desk (qa.html) walks every scene from every seat at every size; a
// scene that can't be built, or names a seat or a size that isn't there,
// would only show up as a blank frame.
test('every scene builds, and every seat is someone in it', () => {
  const all = catalog();
  assert.ok(all.length > 0);
  for (const s of all) {
    let built;
    try {
      built = s.build();
    } catch (e) {
      assert.fail(`${s.key} doesn't build: ${(e as Error).message}`);
    }
    assert.ok(s.seats.length > 0, `${s.key} has no seat`);
    for (const seat of s.seats) {
      // Out of a game (the start page, the codex): nobody in particular.
      if (!built.state) {
        assert.equal(seat.me, null, `${s.key} has no room, but a seat is someone`);
        continue;
      }
      assert.notEqual(seat.mode, 'none', `${s.key} has a room, but a seat is in none`);
      if (seat.mode === 'local') continue;
      const ids = [...built.state.players, ...(built.state.spectators ?? [])].map((p) => p.id);
      assert.ok(ids.includes(seat.me!), `${s.key}: seat ${seat.me} isn't in the room`);
      assert.ok(seatLabel(seat, built.state));
    }
  }
});

test('scene keys are unique and well formed, and scenes come in the order of the screens', () => {
  const all = catalog();
  const keys = all.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length, 'two scenes share a key');
  for (const s of all) {
    assert.match(s.key, /^[a-z]+\/[a-z0-9-]+$/, `${s.key} isn't screen/slug`);
    assert.ok(s.key.startsWith(`${s.screen}/`), `${s.key} isn't under its screen ${s.screen}`);
  }
  const order = SCREENS.map((x) => x.key);
  const seen = all.map((s) => order.indexOf(s.screen));
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
});

test("every size a scene names is a size, and every board is the design's", () => {
  for (const s of catalog()) {
    for (const k of s.sizes ?? []) assert.ok(isSizeKey(k), `${s.key} names size ${k}`);
    for (const [k, board] of Object.entries(s.boards ?? {})) {
      assert.ok(isSizeKey(k), `${s.key} has a board at size ${k}`);
      assert.ok(existsSync(`docs/handoff/end-screen/screens/${board}.webp`), `${s.key}'s board ${board} isn't in the handoff`);
    }
  }
});

test('the walk stops at every scene, at the walk sizes and its own, a seat at a time on large screens', () => {
  const all = catalog();
  const stops = walk(all);
  assert.equal(new Set(stops.map((s) => s.id)).size, stops.length, 'two stops share an id');
  for (const s of all) {
    const sizes = sizesFor(s);
    for (const k of WALK_SIZES) assert.ok(sizes.includes(k), `${s.key} isn't walked at ${k}`);
    for (const k of sizes) assert.ok(stops.some((t) => t.scene === s && t.size === k), `${s.key} has no stop at ${k}`);
  }
  assert.ok(matches(all[0], all[0].label.split(' ')[0].toUpperCase()));
  assert.ok(!matches(all[0], 'zzzz-nothing-like-it'));
});

test('the sizes are one list: unique keys, a 4K screen at each scaling, the design canvas in the quick set', () => {
  const keys = SIZES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const [w, h, dpr] of [[3840, 2160, 1], [2560, 1440, 1.5], [1920, 1080, 2]]) assert.ok(SIZES.some((s) => s.w === w && s.h === h && s.dpr === dpr), `no 4K size ${w}x${h} at ${dpr}`);
  for (const k of Object.values(PRESETS).flat()) assert.ok(isSizeKey(k));
  // docs/design-rules.md: 1440 x 900, 1440 x 725 and 390 x 844.
  const quick = PRESETS.quick.map((k) => SIZES.find((s) => s.key === k)!).map((s) => `${s.w}x${s.h}`);
  assert.deepEqual(quick.sort(), ['1440x725', '1440x900', '390x844']);
});

test("a frame answers media queries as its device would, and leaves width to the frame", () => {
  const phone = SIZES.find((s) => s.key === 'phone')!;
  const desk = SIZES.find((s) => s.key === 'desktop')!;
  const yes = '(min-width: 0px)';
  const no = '(max-width: 0px)';
  assert.equal(answered('(hover: hover)', phone), no);
  assert.equal(answered('(hover: hover)', desk), yes);
  assert.equal(answered('(hover: none) and (pointer: coarse)', phone), `${yes} and ${yes}`);
  assert.equal(answered('(any-pointer: fine)', desk), yes);
  assert.equal(answered('(min-resolution: 2dppx)', phone), yes);
  assert.equal(answered('(min-resolution: 2dppx)', desk), no);
  assert.equal(answered('(min-resolution: 192dpi)', phone), yes);
  assert.equal(answered('(max-width: 700px) and (hover:hover)', phone), `(max-width: 700px) and ${no}`);
  assert.equal(answered('(prefers-reduced-motion: reduce)', phone), '(prefers-reduced-motion: reduce)');
});
