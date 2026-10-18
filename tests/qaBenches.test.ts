import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { useItems } from '../src/qa/build/engine.ts';
import { PIECES } from '../src/qa/benches/pieces.ts';
import { stateAt, stateValues, valuesOf, valuesQuery, type Control } from '../src/qa/bench.ts';
import { benchesTouched, type Touched } from '../src/qa/change.ts';
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
    const seen = new Set<string>();
    for (const s of p.states) {
      for (const [k, v] of Object.entries(s.values)) {
        const c = controls.get(k);
        assert.ok(c, `${p.key}'s state “${s.label}” sets ${k}, which isn't one of its controls`);
        assert.equal(valuesOf([c], { [k]: v })[k], v, `${p.key}'s state “${s.label}” sets ${k} to ${v}, which it can't be`);
      }
      const full = JSON.stringify(stateValues(p, s));
      assert.ok(!seen.has(full), `${p.key}'s state “${s.label}” is the same as another`);
      seen.add(full);
    }
    assert.equal(new Set((p.actions ?? []).map((a) => a.key)).size, (p.actions ?? []).length, `${p.key} has two actions of one name`);
    for (const f of p.files) assert.ok(existsSync(f), `${p.key} names ${f}, which isn't there`);
  }
});

test('every scene is a state of one bench, and no two benches share a key', () => {
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

test('the desk knows which state the controls are in', () => {
  const avatar = PIECES.find((p) => p.key === 'avatar')!;
  avatar.states.forEach((s, i) => assert.equal(stateAt(avatar, stateValues(avatar, s)), i));
  assert.equal(stateAt(avatar, { ...stateValues(avatar, avatar.states[0]), size: 77 }), -1);
});

test('a change touches the pieces showing its files and the screens running them', () => {
  const scenes: Touched = { scenes: [{ key: 'game/turns-question', why: 'runs src/components/Avatar.svelte' }], uncovered: ['src/lib/nowhere.ts'] };
  const all = benches();
  const got = benchesTouched(['src/components/Avatar.svelte', 'src/lib/nowhere.ts'], scenes, all);
  const keys = got.benches.map((b) => b.key);
  assert.ok(keys.includes('avatar'));
  assert.ok(keys.includes('game/take-turns'));
  assert.ok(!keys.includes('streak'));
  assert.deepEqual(got.uncovered, ['src/lib/nowhere.ts']);
  // A bench's own files touch it.
  assert.deepEqual(benchesTouched(['src/qa/benches/StreakView.svelte'], { scenes: [], uncovered: [] }, all).benches.map((b) => b.key), ['streak']);
});
