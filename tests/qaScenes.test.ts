import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { Item } from '../src/lib/game.ts';
import { useItems } from '../src/qa/build/engine.ts';
import { useCaptured } from '../src/qa/scenes/captured.ts';
import { SIZES, WALK_SIZES, isSizeKey, PRESETS } from '../src/qa/sizes.ts';
import { SCREENS, seatLabel, seatsIn, type Scene } from '../src/qa/scene.ts';
import { sceneStateAt, valuesOf, type Values } from '../src/qa/bench.ts';
import { TWEAK_KEYS, buildScene } from '../src/qa/tweaks.ts';
import { matches, sizesFor } from '../src/qa/desk/walk.ts';
import { answered } from '../src/qa/frame/emulate.ts';
import { fakes, items } from './helpers.ts';

useItems(items, fakes);
// The scenes saved from live rooms, as the desk has them (src/qa/captured).
const capturedDir = new URL('../src/qa/captured/', import.meta.url);
useCaptured(Object.fromEntries((existsSync(capturedDir) ? readdirSync(capturedDir) : []).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(readFileSync(new URL(f, capturedDir), 'utf8'))])));
const { catalog } = await import('../src/qa/scenes/index.ts');
const { benches } = await import('../src/qa/benches/index.ts');

// The QA desk (qa.html) walks every scene from every seat at every size; a
// scene that can't be built, or names a seat or a size that isn't there,
// would only show up as a blank frame.
/** `s` built with `given`, its seats each someone in it (out of a game: nobody in particular). */
function builds(s: Scene, given: Values, what: string) {
  let built;
  try {
    built = buildScene(s, given).built;
  } catch (e) {
    assert.fail(`${s.key} (${what}) doesn't build: ${(e as Error).message}`);
  }
  const seats = seatsIn(s, built);
  assert.ok(seats.length > 0, `${s.key} (${what}) has no seat`);
  for (const seat of seats) {
    if (!built.state) {
      assert.equal(seat.me, null, `${s.key} has no room, but a seat is someone`);
      continue;
    }
    assert.notEqual(seat.mode, 'none', `${s.key} has a room, but a seat is in none`);
    if (seat.mode === 'local') continue;
    const ids = [...built.state.players, ...(built.state.spectators ?? [])].map((p) => p.id);
    assert.ok(ids.includes(seat.me!), `${s.key} (${what}): seat ${seat.me} isn't in the room`);
    assert.ok(seatLabel(seat, built.state));
  }
  return built;
}

test('every scene builds in every named state, and every seat is someone in it', () => {
  const all = catalog();
  assert.ok(all.length > 0);
  for (const s of all) {
    assert.ok(s.seats.length > 0, `${s.key} has no seat`);
    builds(s, {}, 'as it comes');
    for (const st of s.states ?? []) builds(s, st.values, st.label);
  }
});

test("every control's ends and choices build, its own and any game's, and its default is one it can be", () => {
  for (const s of catalog()) {
    const { controls } = buildScene(s);
    const own = (s.controls ?? []).map((c) => c.key);
    assert.equal(new Set(own).size, own.length, `${s.key} has two controls of one name`);
    for (const k of own) assert.ok(!TWEAK_KEYS.includes(k), `${s.key}'s control ${k} is one every game has`);
    for (const c of controls) {
      assert.deepEqual(valuesOf([c], { [c.key]: c.default }), { [c.key]: c.default }, `${s.key}: ${c.key} starts at ${c.default}, which it can't be`);
      const tried = c.kind === 'range' ? [c.min, c.max] : c.kind === 'toggle' ? [true, false] : c.options.map((o) => o.value);
      for (const x of tried) builds(s, { [c.key]: x }, `${c.key}=${x}`);
    }
  }
});

test('a named state sets only controls its scene has, to values they can be, and the desk finds it again', () => {
  for (const b of benches()) {
    if (b.kind !== 'scenes') continue;
    for (const [i, st] of b.states.entries()) {
      const { controls, values } = buildScene(st.scene, st.values);
      for (const [k, x] of Object.entries(st.values)) {
        const c = controls.find((c) => c.key === k);
        assert.ok(c, `${st.scene.key}'s “${st.label}” sets ${k}, which it hasn't`);
        assert.equal(valuesOf([c], { [k]: x })[k], x, `${st.scene.key}'s “${st.label}” sets ${k} to ${x}, which it can't be`);
      }
      assert.equal(sceneStateAt(b, st.scene, controls, values), i, `${st.scene.key}'s “${st.label}” is the same as another, or isn't found`);
    }
  }
});

test('the controls every game has change only what they say, and leave who is seen from be', () => {
  const won = catalog().find((s) => s.key === 'over/n-won')!;
  const as = buildScene(won).built.state!;
  const gone = buildScene(won, { offline: '*' }).built.state!;
  assert.deepEqual(
    gone.players.filter((p) => p.connected).map((p) => p.name),
    ['Kalguur'],
  );
  // (The scene's own state isn't changed in place: built again, it's as it was.)
  assert.ok(buildScene(won).built.state!.players.every((p) => p.connected));
  const watched = buildScene(won, { joining: 5, watching: 3 }).built.state!;
  assert.equal(watched.spectators!.filter((o) => !o.stay).length, 5);
  assert.equal(watched.spectators!.filter((o) => o.stay).length, 3);
  const long = buildScene(won, { names: 'long' }).built.state!;
  assert.deepEqual(
    long.players.map((p) => p.id),
    as.players.map((p) => p.id),
  );
  assert.ok(long.players.every((p, i) => p.name !== as.players[i].name));
  // A spectator seen from stays, however few watch.
  const spec = catalog().find((s) => s.key === 'over/n-spec')!;
  assert.ok(buildScene(spec, { joining: 0 }).built.state!.spectators!.some((o) => o.id === spec.seats[0].me));
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

test('every scene is walked at the walk sizes and its own, smallest first, and the search finds by words', () => {
  const all = catalog();
  const order = SIZES.map((s) => s.key);
  for (const s of all) {
    const sizes = sizesFor(s);
    for (const k of WALK_SIZES) assert.ok(sizes.includes(k), `${s.key} isn't walked at ${k}`);
    for (const k of s.sizes ?? []) assert.ok(sizes.includes(k), `${s.key} isn't walked at its own ${k}`);
    assert.deepEqual(sizes, [...sizes].sort((a, b) => order.indexOf(a) - order.indexOf(b)), `${s.key}'s sizes are out of order`);
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

// A frame loads only its own screen's scenes (scenes/one.ts), so the code
// before a change that adds what one screen uses still shows the others.
test('a frame finds every scene from its own screen file alone', async () => {
  const { sceneOf } = await import('../src/qa/scenes/one.ts');
  for (const s of catalog()) {
    const found = await sceneOf(s.key);
    assert.equal(found?.key, s.key, `${s.key} isn't found from its screen's file (scenes/one.ts)`);
    assert.equal(found.label, s.label);
  }
});
