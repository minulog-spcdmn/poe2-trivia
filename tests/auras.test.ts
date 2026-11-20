// The player auras a player owns and wears (lib/auraStore.ts), how paired
// devices share them (lib/sync/shared.ts), what erasing the codex leaves of
// them, how the one worn goes round a room (lib/protocol.ts, lib/game.ts),
// the one rule for what is shown (lib/auraKinds.ts shownAura), and which
// class auras can be found with which sigil (findableWith).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AURAS, BENCHED, CLASS_AURAS, WORN, findableWith, shownAura } from '../src/lib/auraKinds.ts';
import {
  AURAS_KEY,
  AURAS_VERSION,
  absorbAuras,
  emptyAuras,
  gain,
  gainAura,
  loadAuras,
  mergeAuras,
  ownedAuras,
  parseAuras,
  serializeAuras,
  wear,
  wearAura,
  wornAura,
  type AuraStore,
} from '../src/lib/auraStore.ts';
import { forgetOwn, takeIn, takenNow } from '../src/lib/sync/shared.ts';
import { clearCopies } from '../src/lib/sync/store.ts';
import { resetCodex } from '../src/lib/codex.ts';
import { resetRecords } from '../src/lib/delveRecord.ts';
import { resetAchievements } from '../src/lib/achievements.ts';
import { resetFossils } from '../src/lib/fossilStore.ts';
import { parseClientMsg } from '../src/lib/protocol.ts';
import { createGame } from '../src/lib/game.ts';
import { lobby, memoryStorage, playTurn } from './helpers.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);
beforeEach(() => store.clear());

test('the class auras pair with classes, and none is benched', () => {
  assert.deepEqual(CLASS_AURAS, { chronomancer: 'sorceress', slayer: 'gladiator', shadow: 'assassin', chayula: 'monk' });
  for (const k of Object.keys(CLASS_AURAS)) assert.ok(WORN.includes(k as never), k);
});

test('the one rule for what is shown: any aura owned, a class one with any sigil, none for unknown or benched', () => {
  assert.equal(shownAura('breach', undefined), 'breach');
  assert.equal(shownAura('breach', 'witch'), 'breach');
  assert.equal(shownAura('chronomancer', 'sorceress'), 'chronomancer');
  assert.equal(shownAura('chronomancer', 'witch'), 'chronomancer');
  assert.equal(shownAura('chronomancer', undefined), 'chronomancer');
  assert.equal(shownAura('chayula', 'sorceress'), 'chayula');
  for (const b of BENCHED) assert.equal(shownAura(b, undefined), undefined, b);
  assert.equal(shownAura('from-a-newer-build', undefined), undefined);
  assert.equal(shownAura(undefined, 'monk'), undefined);
  assert.equal(shownAura(7, undefined), undefined);
});

test('a class aura is found only with its own sigil; any other with any sigil or none', () => {
  assert.ok(findableWith('chronomancer', 'sorceress'));
  assert.ok(findableWith('slayer', 'gladiator'));
  assert.ok(findableWith('shadow', 'assassin'));
  assert.ok(findableWith('chayula', 'monk'));
  assert.ok(!findableWith('chronomancer', 'witch'));
  assert.ok(!findableWith('shadow', 'gladiator'));
  assert.ok(!findableWith('chayula', null));
  assert.ok(!findableWith('slayer', undefined));
  for (const k of WORN.filter((a) => !CLASS_AURAS[a])) {
    assert.ok(findableWith(k, undefined), k);
    assert.ok(findableWith(k, 'witch'), k);
  }
});

test('gaining keeps the first find and never wears it; only one owned, and not benched, can be worn', () => {
  let s = gain(emptyAuras(), 'breach', { at: 100, mode: 'delve', depth: 12 });
  assert.deepEqual(s, { owned: { breach: { at: 100, mode: 'delve', depth: 12 } }, worn: null });
  assert.equal(gain(s, 'breach', { at: 50 }), s, 'the first find stands');
  s = gain(s, 'lich', { at: 200 });
  assert.equal(wear(s, 'ritual'), s, 'not owned');
  assert.equal(wear(s, 'lich'), s, 'benched');
  s = wear(s, 'breach');
  assert.equal(s.worn, 'breach');
  assert.equal(wear(s, null).worn, null);
  assert.deepEqual(ownedAuras(s), ['breach', 'lich']);
});

test('round-trips, and keeps kinds this build does not know', () => {
  const s: AuraStore = { owned: { ritual: { at: 5, mode: 'turns' }, breach: { at: 3, mode: 'delve', depth: 40 } }, worn: 'ritual', wornAt: 9 };
  assert.deepEqual(parseAuras(serializeAuras(s)), s);
  // As a newer build writes it: an aura this one lacks, owned and worn.
  const newer = `{"v":${AURAS_VERSION},"owned":{"breach":{"at":3},"starforge":{"at":7,"mode":"wisdom","depth":2},"Bad Name":{"at":1},"tower":{"at":-1},"abyss":{"at":4,"mode":"NOT A MODE","depth":0}},"worn":"starforge","wornAt":11}`;
  const read = parseAuras(newer)!;
  assert.deepEqual(read, { owned: { breach: { at: 3 }, starforge: { at: 7, mode: 'wisdom', depth: 2 }, abyss: { at: 4 } }, worn: 'starforge', wornAt: 11 });
  assert.equal(wornAura(read), null, 'worn here as none');
  assert.deepEqual(ownedAuras(read), ['breach', 'abyss']);
  // Written again by this build, the unknown one is still there, owned and worn.
  assert.deepEqual(parseAuras(serializeAuras(read)), read);
  // Worn but not owned reads as none; another version, or nonsense, as nothing.
  assert.equal(parseAuras(JSON.stringify({ v: AURAS_VERSION, owned: {}, worn: 'breach' }))!.worn, null);
  assert.equal(parseAuras(JSON.stringify({ v: AURAS_VERSION + 1, owned: {}, worn: null })), null);
  assert.equal(parseAuras('nope'), null);
  // A benched one worn is kept as stored, and worn here as none.
  assert.equal(wornAura(parseAuras(JSON.stringify({ v: AURAS_VERSION, owned: { lich: { at: 1 } }, worn: 'lich' }))!), null);
});

test('gains and wears in storage; gaining keeps an unknown kind another build stored', () => {
  store.set(AURAS_KEY, JSON.stringify({ v: AURAS_VERSION, owned: { starforge: { at: 7 } }, worn: 'starforge', wornAt: 8 }));
  gainAura('ritual', { at: 20, mode: 'race' });
  let s = loadAuras();
  assert.deepEqual(s, { owned: { starforge: { at: 7 }, ritual: { at: 20, mode: 'race' } }, worn: 'starforge', wornAt: 8 }, 'not worn by gaining');
  s = wearAura('ritual')!;
  assert.equal(s.worn, 'ritual');
  assert.ok(s.wornAt! > 8, 'stamped as put on');
  assert.equal(wearAura('breach')!.worn, 'ritual', 'not owned');
  assert.equal(loadAuras().owned.starforge?.at, 7);
});

test("never writes over a newer build's", () => {
  const newer = JSON.stringify({ v: AURAS_VERSION + 1, owned: { breach: { at: 1 } }, worn: 'breach', more: true });
  store.set(AURAS_KEY, newer);
  assert.equal(gainAura('ritual', { at: 2 }), null);
  assert.equal(absorbAuras(serializeAuras({ owned: { ice: { at: 3 } }, worn: null })), false);
  assert.equal(store.get(AURAS_KEY), newer);
});

test('two devices as one: every aura either owns at the earlier find, unknown ones too, and the one put on latest', () => {
  const mine: AuraStore = { owned: { breach: { at: 10, mode: 'delve', depth: 5 }, ritual: { at: 30 } }, worn: 'breach', wornAt: 100 };
  const theirs: AuraStore = { owned: { breach: { at: 20 }, ritual: { at: 25, mode: 'turns' }, starforge: { at: 40 } }, worn: 'starforge', wornAt: 200 };
  assert.deepEqual(mergeAuras(mine, theirs), {
    owned: { breach: { at: 10, mode: 'delve', depth: 5 }, ritual: { at: 25, mode: 'turns' }, starforge: { at: 40 } },
    worn: 'starforge',
    wornAt: 200,
  });
  // Put on earlier: theirs is owned, mine stays worn.
  const merged = mergeAuras(mine, { ...theirs, wornAt: 50 });
  assert.equal(merged.worn, 'breach');
  assert.equal(merged.wornAt, 100);
  // Taken off later: none worn.
  assert.equal(mergeAuras(mine, { owned: {}, worn: null, wornAt: 300 }).worn, null);
  // Nothing new: the same store.
  assert.equal(mergeAuras(mine, { owned: { breach: { at: 15 } }, worn: null, wornAt: 1 }), mine);
});

test('sync passes them on and takes them in; the backup carries what sync passes', () => {
  gainAura('breach', { at: 10 });
  const raw = takenNow().auras;
  assert.ok(raw, 'passed on, and so kept by the passkey backup (backup.svelte.ts entryNow)');
  assert.deepEqual(parseAuras(raw)!.owned, { breach: { at: 10 } });
  const theirs = serializeAuras({ owned: { breach: { at: 5 }, starforge: { at: 6 } }, worn: 'breach', wornAt: Date.now() + 1000 });
  assert.deepEqual(takeIn({ auras: theirs }), ['auras']);
  const s = loadAuras();
  assert.deepEqual(s.owned, { breach: { at: 5 }, starforge: { at: 6 } });
  assert.equal(s.worn, 'breach');
  assert.deepEqual(takeIn({ auras: theirs }), [], 'nothing new the second time');
});

test('erasing the codex keeps the auras', () => {
  gainAura('ice', { at: 1, mode: 'delve', depth: 3 });
  wearAura('ice');
  const before = store.get(AURAS_KEY);
  // As the codex's Erase does (Codex.svelte reset, with eraseSync's).
  clearCopies();
  forgetOwn();
  resetCodex();
  resetRecords();
  resetAchievements();
  resetFossils();
  assert.equal(store.get(AURAS_KEY), before);
  assert.equal(loadAuras().worn, 'ice');
});

test("a guest's hello and aura action carry the aura it wears; one unknown or benched is none", () => {
  const hello = { t: 'hello', secret: 'a'.repeat(24), name: 'Wren', v: 1 };
  assert.equal((parseClientMsg({ ...hello, aura: 'ritual' }) as { aura?: string }).aura, 'ritual');
  for (const aura of ['starforge', 'lich', 3]) {
    const m = parseClientMsg({ ...hello, aura });
    assert.ok(m && !('aura' in m), String(aura));
  }
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'aura', aura: 'ice', playerId: 'someone' } }), { t: 'action', action: { type: 'aura', aura: 'ice' } });
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'aura', aura: 'blacksun' } }), { t: 'action', action: { type: 'aura' } });
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'aura', aura: 'starforge' } }), { t: 'action', action: { type: 'aura' } });
});

test('the aura comes with a join, stays with a spectator who takes a seat, changes in the lobby only, and the recap keeps it', () => {
  let { engine, s } = lobby(['Ash']);
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren', sigil: 'witch', aura: 'ritual' }, 'w');
  assert.equal(s.players.find((p) => p.id === 'w')?.aura, 'ritual');
  s = engine.apply(s, { type: 'aura', aura: 'ice' }, 'w');
  assert.equal(s.players.find((p) => p.id === 'w')?.aura, 'ice');
  s = engine.apply(s, { type: 'aura', aura: 'breach', playerId: 'p0' }, 'w');
  assert.equal(s.players.find((p) => p.id === 'p0')?.aura, undefined, 'a guest names only itself');
  assert.equal(s.players.find((p) => p.id === 'w')?.aura, 'breach');
  s = engine.apply(s, { type: 'aura', aura: 'ice' }, 'w');
  // Stepping aside to watch keeps it, and so does taking the seat again.
  s = engine.apply(s, { type: 'watch', watch: true }, 'w');
  assert.equal(s.spectators!.find((o) => o.id === 'w')?.aura, 'ice');
  s = engine.apply(s, { type: 'watch', watch: false }, 'w');
  assert.equal(s.players.find((p) => p.id === 'w')?.aura, 'ice');
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'aura', aura: 'breach' }, 'w');
  assert.equal(s.players.find((p) => p.id === 'w')?.aura, 'ice', 'mid-game the one it began with');
  s = engine.apply(s, { type: 'join', playerId: 'late', name: 'Late', aura: 'abyss' }, 'late');
  assert.deepEqual(s.spectators, [{ id: 'late', name: 'Late', aura: 'abyss' }]);
  for (let i = 0; i < 4; i++) s = playTurn(engine, s, () => true);
  assert.equal(s.recap?.people?.w?.aura, 'ice');
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.equal(s.players.find((p) => p.id === 'late')?.aura, 'abyss');
  // Coming back without one: taken off meanwhile. One unknown or benched is none.
  s = engine.apply(s, { type: 'connection', playerId: 'w', connected: false }, null);
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren', returning: true }, 'w');
  assert.equal(s.players.find((p) => p.id === 'w')?.aura, undefined);
  s = engine.apply(s, { type: 'join', playerId: 'x', name: 'Xan', aura: 'lich' }, 'x');
  assert.equal(s.players.find((p) => p.id === 'x')?.aura, undefined);
  let local = createGame(null);
  local = engine.apply(local, { type: 'join', playerId: 'a', name: 'Ash' }, null);
  local = engine.apply(local, { type: 'aura', aura: 'tower', playerId: 'a' }, null);
  assert.equal(local.players[0].aura, 'tower');
});

test('every aura is named for the store and the protocol', () => {
  for (const k of AURAS) assert.match(k, /^[a-z][a-z0-9-]{0,39}$/);
});
