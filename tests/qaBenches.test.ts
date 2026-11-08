import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { useItems } from '../src/qa/build/engine.ts';
import { PIECES } from '../src/qa/benches/pieces.ts';
import { stateAt, stateValues, valuesOf, valuesQuery, type Control } from '../src/qa/bench.ts';
import { benchesTouched, placeOfState } from '../src/qa/change.ts';
import { fakes, items } from './helpers.ts';

useItems(items, fakes);
const { benches } = await import('../src/qa/benches/index.ts');
const { catalog } = await import('../src/qa/scenes/index.ts');

// The QA desk's benches (src/qa/benches): a state that sets a control the
// piece doesn't have, or a value it can't take, would show something else
// than its name says, and no one would notice.
test('every piece has its controls, states and actions in order', () => {
  const keys = new Set<string>();
  for (const p of PIECES) {
    assert.ok(!keys.has(p.key), `two pieces are called ${p.key}`);
    keys.add(p.key);
    const controls = new Map(p.controls.map((c) => [c.key, c]));
    assert.equal(controls.size, p.controls.length, `${p.key} has two controls of one name`);
    assert.ok(p.states.length > 0, `${p.key} has no states`);
    for (const c of p.controls) assert.equal(valuesOf([c], { [c.key]: c.default })[c.key], c.default, `${p.key}'s ${c.key} starts at ${c.default}, which it can't be`);
    const seen = new Set<string>();
    for (const s of p.states) {
      for (const [k, v] of Object.entries(s.values)) {
        const c = controls.get(k);
        assert.ok(c, `${p.key}'s state “${s.label}” sets ${k}, which isn't one of its controls`);
        assert.ok(!c.view, `${p.key}'s state “${s.label}” sets ${k}, which is the view's own`);
        assert.equal(valuesOf([c], { [k]: v })[k], v, `${p.key}'s state “${s.label}” sets ${k} to ${v}, which it can't be`);
      }
      // The view's own controls aside, which a state doesn't change.
      const v = stateValues(p, s);
      const full = JSON.stringify(p.controls.filter((c) => !c.view).map((c) => v[c.key]));
      assert.ok(!seen.has(full), `${p.key}'s state “${s.label}” is the same as another`);
      seen.add(full);
    }
    assert.equal(new Set((p.actions ?? []).map((a) => a.key)).size, (p.actions ?? []).length, `${p.key} has two actions of one name`);
    for (const f of p.files) assert.ok(existsSync(f), `${p.key} names ${f}, which isn't there`);
    // Its own files, which This change finds it by.
    for (const f of [`src/qa/benches/${p.key}.ts`, `src/qa/benches/${p.key[0].toUpperCase()}${p.key.slice(1)}View.svelte`]) assert.ok(existsSync(f), `${p.key} has no ${f}`);
  }
});

test('every scene is on one bench, a screen each, and no two benches share a key', () => {
  const all = benches();
  assert.equal(new Set(all.map((b) => b.key)).size, all.length);
  const of = new Map<string, number>();
  for (const b of all) if (b.kind === 'scenes') for (const s of b.scenes) of.set(s.key, (of.get(s.key) ?? 0) + 1);
  for (const s of catalog()) assert.equal(of.get(s.key), 1, `${s.key} is on ${of.get(s.key) ?? 0} benches`);
});

test("a piece's controls read from the address as they're written to it", () => {
  const controls: Control[] = [
    { kind: 'range', key: 'size', label: 'Size', min: 16, max: 96, default: 36 },
    { kind: 'toggle', key: 'dim', label: 'Offline', default: false },
    { kind: 'choice', key: 'name', label: 'Name', default: 'A', options: [{ value: 'A', label: 'A' }, { value: '', label: 'None' }] },
  ];
  const v = { size: 56, dim: true, name: '' };
  const written = Object.fromEntries(valuesQuery(controls, v));
  assert.deepEqual(written, { size: '56', dim: '1', name: '' });
  assert.deepEqual(valuesOf(controls, written), v);
  // Out of range, or not a choice there is: the nearest it can be, or the default.
  assert.deepEqual(valuesOf(controls, { size: '500', name: 'Z' }), { size: 96, dim: false, name: 'A' });
  // The defaults aren't written at all.
  assert.deepEqual(valuesQuery(controls, valuesOf(controls)), []);
});

test('the desk knows which state the controls are in, whatever the view is set to', () => {
  for (const p of PIECES) p.states.forEach((s, i) => assert.equal(stateAt(p, stateValues(p, s)), i, `${p.key}'s “${s.label}”`));
  const avatar = PIECES.find((p) => p.key === 'avatar')!;
  assert.equal(stateAt(avatar, { ...stateValues(avatar, avatar.states[0]), size: 77 }), -1);
  // The view's own controls (its name beside it) stay as they were set from state to state.
  const named = !avatar.controls.find((c) => c.key === 'named')!.default;
  const moved = stateValues(avatar, avatar.states[1], { named, size: 77 });
  assert.equal(moved.named, named);
  assert.notEqual(moved.size, 77);
  assert.equal(stateAt(avatar, moved), 1);
});

test('a change touches the benches its places are on, and a piece not in the map yet by its files', () => {
  const all = benches();
  const game = all.find((b) => b.kind === 'scenes' && b.key === 'game');
  assert.ok(game?.kind === 'scenes');
  const place = placeOfState(game.states[0])!;
  const got = benchesTouched({ places: [{ key: place, why: 'runs it' }, { key: 'avatar', why: 'shows it' }, { key: 'gone/away', why: 'no longer there' }], mapped: ['avatar', place], files: ['src/components/DailyStreak.svelte'] }, all);
  assert.deepEqual(got.benches.map((b) => b.key), ['game', 'avatar', 'streak']);
  assert.deepEqual(got.places.map((p) => p.key), [place, 'avatar', 'streak']);
  assert.match(got.places[2].why, /DailyStreak\.svelte/);
  // A piece in the map counts only by what it ran.
  assert.deepEqual(benchesTouched({ places: [], mapped: ['streak'], files: ['src/components/DailyStreak.svelte'] }, all).benches, []);
  // Every state with a key is its own place; a scene's first is its scene's.
  for (const b of all) if (b.kind === 'scenes') for (const st of b.states) if (st.key) assert.equal(placeOfState(st), st.key);
});

// A piece's frame loads only its own file (benches/<key>.ts, frame/piece.ts),
// so the code before a change that adds or alters one piece still shows the rest.
test('every piece is in a file named after it', async () => {
  for (const p of PIECES) {
    const file = new URL(`../src/qa/benches/${p.key}.ts`, import.meta.url);
    assert.ok(existsSync(file), `the piece ${p.key} isn't in src/qa/benches/${p.key}.ts`);
    const mod: Record<string, unknown> = await import(file.href);
    assert.ok(Object.values(mod).includes(p), `src/qa/benches/${p.key}.ts doesn't export the piece ${p.key}`);
  }
});
