import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOST_ODDS, answerDelay, blasts, chooseAnswer, chooseCard, findAppetite, guessChance, misclicks, moodOf, movesOn, panic, pickDelay, rethinks, staysOn, tiredness, urgentSeconds, withTheHerd, knowChance, makePersona, pickCategory, weighted, wrongPick, type Ask, type Persona } from '../src/bot/brain.ts';
import { createGame, rulesFor, type GameState, type Item, type Preset } from '../src/lib/game.ts';
import { PLAIN_HAND } from '../src/bot/motion.ts';
import { readFileSync } from 'node:fs';
import { MODES, NAMES, buildOf, fiddled, identityOf, leaningsOf, lonelyLength, modesFrom, namesFor, nextName, otherPrefs, rollPrefs, shiftLength } from '../src/bot/identities.ts';
import { joinable, makesWay, nextRole, wanted } from '../src/bot/wanted.ts';
import type { RoomInfo } from '../src/lib/roomInfo.ts';
import { PROTOCOL_VERSION } from '../src/lib/protocol.ts';
import { afterHosting, afterVisit, appeal, hesitation, joinsAfter, keenTo, opensRoom, playsOn, settlesFor, sourNow, urgeToHost } from '../src/bot/choice.ts';
import { MAX_NAME, cleanName, isHeldName, nameProblem, nameSkeleton } from '../src/lib/names.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const plain: Persona = { skill: 0, pace: 1, affinity: { Rings: 0.02, Flasks: -0.05 }, finds: 0.8, boldness: 0.5, haste: 0, nerve: 1, favourites: [], temper: 0, herd: 0.3, impatience: 0.5, dither: 0.1, hosting: 0.3, sociable: 0.5, picky: 0.5, hand: PLAIN_HAND };
const plainRules = rulesFor({ difficulty: 'cruel' });
const ask = (over: Partial<Ask> = {}): Ask => ({ rules: plainRules, category: 'Rings', veil: 0, gray: false, mirrored: false, clock: 32, mode: 'turns', ...over });
/** A question as a preset room asks it (a deathmatch's with `harder`). */
const preset = (difficulty: Preset, harder = false): Ask => {
  const rules = rulesFor({ difficulty }, harder);
  return ask({ rules, veil: rules.veil?.share ?? 0, gray: rules.grayscale === 'all', category: 'Helmets' });
};

test('a persona rolls every category, within bounds', () => {
  const p = makePersona(['A', 'B', 'C'], seeded(1));
  assert.deepEqual(Object.keys(p.affinity), ['A', 'B', 'C']);
  for (const a of Object.values(p.affinity)) assert.ok(a >= -0.07 && a <= 0.025);
  assert.ok(p.skill >= -0.06 && p.skill <= 0.015);
  assert.ok(p.pace >= 0.75 && p.pace <= 1.35);
  for (const k of ['finds', 'boldness', 'haste', 'nerve'] as const) assert.ok(p[k] >= 0 && p[k] <= 1, k);
  assert.ok(p.temper >= -1 && p.temper <= 1 && p.herd >= 0.1 && p.herd <= 0.5);
  assert.ok(p.impatience >= 0 && p.impatience <= 1 && p.dither >= 0 && p.dither <= 0.3);
  for (const k of ['hosting', 'sociable', 'picky'] as const) assert.ok(p[k] >= 0 && p[k] <= 1, k);
});

test('items shown plainly are nearly always known, even by the weakest', () => {
  assert.ok(knowChance(plain, preset('cruel')) >= 0.98);
  assert.ok(knowChance({ ...plain, skill: -0.06, affinity: { Helmets: -0.07 } }, preset('cruel')) >= 0.85);
});

test('harder questions are known less often', () => {
  const cruel = knowChance(plain, preset('cruel'));
  const merciless = knowChance(plain, preset('merciless'));
  const eternal = knowChance(plain, preset('eternal'));
  assert.ok(cruel > merciless && merciless > eternal, `${cruel} ${merciless} ${eternal}`);
  // A deathmatch asks one step harder.
  assert.ok(knowChance(plain, preset('cruel', true)) < cruel);
  for (const over of [{ veil: 0.5 }, { gray: true }, { mirrored: true }, { mode: 'race' as const }])
    assert.ok(knowChance(plain, ask(over)) < knowChance(plain, ask()), JSON.stringify(over));
  assert.ok(knowChance(plain, ask({ category: 'Flasks' })) < knowChance(plain, ask({ category: 'Rings' })));
});

test('the chance of knowing stays away from never and always', () => {
  assert.equal(knowChance({ ...plain, skill: 5 }, ask()), 0.99);
  assert.equal(knowChance({ ...plain, skill: -5 }, ask()), 0.3);
});

test('a guess narrows the options down, less so among look-alikes', () => {
  const easy = guessChance(preset('cruel'));
  const hard = guessChance(preset('eternal'));
  assert.equal(easy, 0.5);
  assert.ok(hard < easy && hard >= 1 / 8, `${hard}`);
});

test('a bot that knows always picks right; one that guesses is right as often as its guess', () => {
  const names = ['Ventor\'s Gamble', 'Ventor\'s Gambit', 'Kaom\'s Heart', 'Andvarius'];
  const rng = seeded(37);
  for (let i = 0; i < 200; i++) assert.equal(chooseAnswer(names, 0, true, ask(), [], rng), 0);
  let right = 0;
  for (let i = 0; i < 4000; i++) if (chooseAnswer(names, 0, false, ask(), [], rng) === 0) right++;
  assert.ok(Math.abs(right / 4000 - guessChance(ask())) < 0.03, `${right}`);
});

test('answers take a human time, mostly well inside the clock', () => {
  const rng = seeded(7);
  let late = 0;
  for (let i = 0; i < 1000; i++) {
    const d = answerDelay(plain, ask({ clock: 8 }), true, rng)!;
    assert.ok(d >= 1000, `delay ${d}`);
    if (d > 8000) late++;
  }
  // A plain question known: only now and then too slow for a short clock.
  assert.ok(late < 20, `late ${late}`);
});

test('in Delve an unsure bot always tries (a time-out costs the life as well)', () => {
  const rng = seeded(41);
  for (let i = 0; i < 500; i++) assert.notEqual(answerDelay(plain, ask({ mode: 'delve', clock: 8 }), false, rng), null);
});

test('finds are taken as readily as the appetite for each says, and only those on offer', () => {
  const rng = seeded(43);
  let taken = 0;
  // Helmets a category this player would never pick for itself, so every Helmets is the find taken.
  const p = { ...plain, affinity: { ...plain.affinity, Helmets: -10 } };
  for (let i = 0; i < 2000; i++) if (chooseCard(p, ['Rings', 'Flasks', 'Helmets'], [{ category: 'Helmets', appetite: 0.7 }, { category: 'Belts', appetite: 1 }], rng) === 'Helmets') taken++;
  assert.ok(Math.abs(taken / 2000 - 0.7) < 0.05, `${taken}`);
  for (let i = 0; i < 200; i++) assert.notEqual(chooseCard(plain, ['Rings', 'Flasks'], [{ category: 'Belts', appetite: 1 }], rng), 'Belts');
});

test('a find is welcome while lives are to spare, risky on the last one and deep down', () => {
  const stake = { lives: 3, wards: 0, losses: 1, depth: 10, teammates: 0 };
  const safe = findAppetite(plain, stake);
  assert.equal(safe, plain.finds);
  const lastLife = findAppetite(plain, { ...stake, lives: 1 });
  const lastLifeDeep = findAppetite(plain, { ...stake, lives: 1, depth: 80 });
  assert.ok(lastLife < safe / 2 && lastLifeDeep < lastLife, `${lastLife} ${lastLifeDeep}`);
  // Two lives against an Azurite Vein (two losses on a miss) is a last life; a ward makes it one to spare.
  assert.equal(findAppetite(plain, { ...stake, lives: 2, losses: 2 }), lastLife);
  assert.ok(findAppetite(plain, { ...stake, lives: 2, losses: 2, wards: 1 }) > lastLife);
  // Teammates standing make it braver.
  assert.ok(findAppetite(plain, { ...stake, lives: 1, teammates: 2 }) > lastLife);
  // Deeper down, even full lives are a little more careful.
  assert.ok(findAppetite(plain, { ...stake, depth: 80 }) < safe);
});

test('bold players detonate more', () => {
  const rng = seeded(47);
  const rate = (f: () => boolean) => Array.from({ length: 2000 }, f).filter(Boolean).length / 2000;
  assert.ok(rate(() => blasts({ ...plain, boldness: 0.9 }, rng)) > rate(() => blasts({ ...plain, boldness: 0.4 }, rng)) + 0.4);
});

test('in a race, an unsure bot mostly sits the question out', () => {
  const rng = seeded(5);
  let out = 0;
  for (let i = 0; i < 1000; i++) if (answerDelay(plain, ask({ mode: 'race', clock: 16 }), false, rng) === null) out++;
  assert.ok(out > 500 && out < 700, `sat out ${out}`);
});

test('a wrong pick is never the answer nor ruled out, and favours look-alikes', () => {
  const names = ['Ventor\'s Gamble', 'Ventor\'s Gambit', 'Kaom\'s Heart', 'Andvarius'];
  const rng = seeded(9);
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 2000; i++) counts[wrongPick(names, 0, [], rng)!]++;
  assert.equal(counts[0], 0);
  assert.ok(counts[1] > counts[2] && counts[1] > counts[3], `${counts}`);
  for (let i = 0; i < 200; i++) assert.equal(wrongPick(names, 0, [1, 2], rng), 3);
  assert.equal(wrongPick(names, 0, [1, 2, 3], rng), null);
});

test('categories it knows best are picked most', () => {
  const rng = seeded(13);
  const counts: Record<string, number> = { Rings: 0, Flasks: 0 };
  for (let i = 0; i < 1000; i++) counts[pickCategory(plain, ['Rings', 'Flasks'], rng)]++;
  assert.ok(counts.Rings > counts.Flasks * 1.3, JSON.stringify(counts));
});

test('weighted picks follow the weights', () => {
  const rng = seeded(17);
  const counts = [0, 0, 0];
  for (let i = 0; i < 3000; i++) counts[weighted([1, 0, 3], rng)]++;
  assert.equal(counts[1], 0);
  assert.ok(counts[2] > counts[0] * 2);
});

test('every name passes the name checks as it is, and none looks like another or says bot', () => {
  const skeletons = new Set<string>();
  for (const n of NAMES) {
    assert.equal(cleanName(n), n);
    assert.ok(Array.from(n).length <= MAX_NAME, n);
    assert.equal(nameProblem(n, []), null, n);
    assert.ok(!isHeldName(n), n);
    assert.ok(!/bot/i.test(n), n);
    assert.ok(!skeletons.has(nameSkeleton(n)), n);
    skeletons.add(nameSkeleton(n));
  }
});

test('a name is always the same person', () => {
  const cats = ['A', 'B', 'C'];
  assert.deepEqual(identityOf('Morgrim', cats), identityOf('Morgrim', cats));
  assert.notDeepEqual(identityOf('Morgrim', cats).persona, identityOf('Velka', cats).persona);
  const prefs = NAMES.map((n) => identityOf(n, cats).prefs);
  // Not all alike: some race, and not everyone plays the same difficulty.
  assert.ok(prefs.some((p) => p.mode === 'race') && prefs.some((p) => p.mode === 'turns'));
  assert.ok(new Set(prefs.map((p) => p.difficulty)).size > 1);
  for (const p of prefs) assert.ok(p.timer > 0 && p.target >= 1);
});

test('the last few on rest before coming on again', () => {
  const rng = seeded(21);
  const recent = NAMES.slice(0, 8);
  for (let i = 0; i < 300; i++) assert.ok(!recent.includes(nextName(recent, rng)));
});

test('shifts and waits stay within their bounds', () => {
  const rng = seeded(23);
  for (let i = 0; i < 500; i++) {
    const shift = shiftLength(rng) / 60000;
    const lonely = lonelyLength(rng) / 60000;
    assert.ok(shift >= 20 && shift <= 120, `shift ${shift}`);
    assert.ok(lonely >= 6 && lonely <= 15, `lonely ${lonely}`);
  }
});

test('a host who waited in vain tries a different mode or difficulty', () => {
  const rng = seeded(31);
  for (let i = 0; i < 200; i++) {
    const now = rollPrefs(rng);
    const next = otherPrefs(now, rng)!;
    assert.ok(next.mode !== now.mode || (next.mode !== 'delve' && next.difficulty !== now.difficulty));
  }
  // Delve alone has nothing else to try; Delve and take turns can only swap modes or difficulties.
  assert.equal(otherPrefs(rollPrefs(rng, ['delve']), rng, ['delve']), null);
  for (let i = 0; i < 100; i++) assert.ok(['delve', 'turns'].includes(otherPrefs(rollPrefs(rng, ['delve', 'turns']), rng, ['delve', 'turns'])!.mode));
});

test('hosts pick only among the modes allowed, each by their own taste', () => {
  const cats = ['A', 'B', 'C'];
  for (const n of NAMES) assert.equal(identityOf(n, cats, ['delve']).prefs.mode, 'delve');
  const mixed = NAMES.map((n) => identityOf(n, cats, ['turns', 'delve']).prefs.mode);
  assert.ok(mixed.includes('turns') && mixed.includes('delve') && !mixed.includes('race'));
  // Who someone is doesn't change with the modes allowed.
  assert.deepEqual(identityOf('Morgrim', cats, ['delve']).persona, identityOf('Morgrim', cats).persona);
});

test('modes are read from a list, all of them when it names none', () => {
  assert.deepEqual(modesFrom('delve'), ['delve']);
  assert.deepEqual(modesFrom(' Delve, turns '), ['turns', 'delve']);
  assert.deepEqual(modesFrom(''), [...MODES]);
  assert.deepEqual(modesFrom('nonsense'), [...MODES]);
  assert.deepEqual(modesFrom(null), [...MODES]);
});

const room = (phase: RoomInfo['phase'], players = 2): RoomInfo => ({
  code: 'ABCDEF',
  host: 'Someone',
  players,
  maxPlayers: 12,
  spectators: 0,
  maxSpectators: 8,
  mode: 'turns',
  difficulty: 'cruel',
  target: 10,
  phase,
  v: PROTOCOL_VERSION,
});

test('a room can be joined only in its lobby, with a seat free', () => {
  assert.ok(joinable(room('lobby')));
  assert.ok(!joinable(room('lobby', 12)));
  assert.ok(!joinable(room('locked')));
  for (const phase of ['choosing', 'question', 'reveal', 'over'] as const) assert.ok(!joinable(room(phase)));
  // A host on another version: nobody arriving here can join it.
  assert.ok(!joinable({ ...room('lobby'), v: PROTOCOL_VERSION - 1 }));
  assert.ok(!joinable({ ...room('lobby'), v: undefined }));
});

test('room 1 opens only when no room is listed', () => {
  assert.ok(wanted(1, []));
  assert.ok(!wanted(1, [room('question')]));
  assert.ok(!wanted(1, [room('lobby')]));
});

test('every room after opens only while every room listed is mid-game', () => {
  assert.ok(wanted(2, []));
  assert.ok(wanted(2, [room('question'), room('reveal'), room('locked'), room('lobby', 12)]));
  assert.ok(!wanted(2, [room('question'), room('lobby')]));
  // And the fifth, the same way.
  assert.ok(wanted(5, [room('question'), room('reveal'), room('choosing')]));
});

test('an empty lobby makes way for any other room to join', () => {
  assert.ok(makesWay([room('lobby')]));
  assert.ok(!makesWay([room('question')]));
  assert.ok(!makesWay([]));
});

test("a crowded lobby of our own makes room for another, someone else's never does", () => {
  const ours = new Set(['OURS22']);
  const our = (players: number) => ({ ...room('lobby', players), code: 'OURS22' });
  // Host and one guest: still looking for players, so no new room and an empty one makes way.
  assert.ok(!wanted(2, [our(2)], ours));
  assert.ok(makesWay([our(2)], ours));
  // Host and two or more: busy, so another room opens and an empty one stays.
  assert.ok(wanted(2, [our(3)], ours));
  assert.ok(wanted(4, [our(5), room('question')], ours));
  assert.ok(!makesWay([our(3)], ours));
  // Someone else's lobby, however busy: never.
  assert.ok(!wanted(2, [room('lobby', 6)], ours));
  assert.ok(makesWay([room('lobby', 6)], ours));
  // Room 1 still only when nothing is listed.
  assert.ok(!wanted(1, [our(3)], ours));
});

test('rooms running at once never share a name', () => {
  for (const rooms of [1, 2, 3, 4]) {
    const shares = Array.from({ length: rooms }, (_, i) => namesFor(i + 1, rooms));
    assert.deepEqual(shares.flat().sort(), [...NAMES].sort());
    for (const share of shares) assert.ok(share.length >= 8);
  }
  // Anything off: the whole cast.
  assert.deepEqual(namesFor(3, 2), NAMES);
  const rng = seeded(29);
  const mine = namesFor(2, 2);
  for (let i = 0; i < 300; i++) assert.ok(mine.includes(nextName(mine.slice(0, 3), rng, mine)));
});

const mean = (f: () => number | null, n = 3000) => {
  let sum = 0;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const v = f();
    if (v !== null) (sum += v), k++;
  }
  return sum / k;
};

test('favourites are known cold and named quickly, even on hard questions', () => {
  const hard = preset('eternal');
  assert.ok(knowChance(plain, { ...hard, favourite: true }) >= 0.95);
  assert.ok(knowChance(plain, { ...hard, favourite: true }) > knowChance(plain, hard) + 0.05);
  const rng = seeded(53);
  assert.ok(mean(() => answerDelay(plain, { ...hard, favourite: true }, true, rng)) < mean(() => answerDelay(plain, hard, true, rng)) * 0.7);
});

test('trigger-happy players answer sooner, a little sloppier, and sit out less', () => {
  const rng = seeded(59);
  const hasty = { ...plain, haste: 1 };
  assert.ok(mean(() => answerDelay(hasty, ask(), true, rng)) < mean(() => answerDelay(plain, ask(), true, rng)) * 0.8);
  assert.ok(knowChance(hasty, preset('merciless')) < knowChance(plain, preset('merciless')));
  const out = (p: Persona) => mean(() => (answerDelay(p, ask({ mode: 'race', clock: 16 }), false, rng) === null ? 1 : 0));
  assert.ok(out(hasty) < out(plain) - 0.3);
});

test('the urgent ticking panics the nervous, not the calm, and only once it ticks', () => {
  const rng = seeded(61);
  const a = ask({ clock: 16 });
  const lateMs = 14000;
  const rate = (p: Persona, ms: number) => mean(() => (panic(p, a, ms, rng) ? 1 : 0));
  assert.ok(rate({ ...plain, nerve: 0.1 }, lateMs) > 0.5);
  assert.equal(rate({ ...plain, nerve: 1 }, lateMs), 0);
  // An answer due before the ticking starts never panics.
  assert.equal(rate({ ...plain, nerve: 0 }, 9000), 0);
  for (let i = 0; i < 200; i++) {
    const p = panic({ ...plain, nerve: 0 }, a, lateMs, rng);
    if (p) assert.ok(p.at >= 11000 && p.at <= 12200, `${p.at}`);
  }
  // Delve ticks for 35% of a short clock (3 to 5 s), like the game's ring.
  assert.equal(urgentSeconds({ clock: 8, mode: 'delve' }), 3);
  assert.equal(urgentSeconds({ clock: 16, mode: 'delve' }), 5);
  assert.equal(urgentSeconds({ clock: 32, mode: 'turns' }), 5);
});

test('a build: much of one weapon kind and a handful of others, the same for the same name', () => {
  const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
  const byId = new Map(items.map((it) => [it.id, it]));
  const a = identityOf('Morgrim', ['A'], undefined, items).persona.favourites;
  assert.deepEqual(a, identityOf('Morgrim', ['A'], undefined, items).persona.favourites);
  assert.ok(a.length >= 9 && a.length <= 28, `${a.length}`);
  const weapon = byId.get(a[0])!;
  assert.ok(weapon.category.endsWith('Weapons'));
  assert.ok(a.filter((id) => byId.get(id)!.group === weapon.group).length >= 1);
  assert.notDeepEqual(a, identityOf('Velka', ['A'], undefined, items).persona.favourites);
  assert.deepEqual(buildOf([], seeded(1)), []);
});

test('a run of misses tilts the hot-tempered and steadies the calm, mildly', () => {
  const rng = seeded(67);
  const a = preset('merciless');
  const hot = { ...plain, temper: -1 };
  const cool = { ...plain, temper: 1 };
  // No run of misses: temper makes no difference.
  assert.equal(knowChance(hot, a), knowChance(cool, a));
  const tilted = { ...a, tilt: 1 };
  assert.ok(knowChance(hot, tilted) < knowChance(hot, a) && knowChance(hot, a) - knowChance(hot, tilted) <= 0.03 + 1e-9);
  assert.ok(knowChance(cool, tilted) > knowChance(cool, a));
  assert.ok(mean(() => answerDelay(hot, tilted, true, rng)) < mean(() => answerDelay(hot, a, true, rng)));
  assert.ok(mean(() => answerDelay(cool, tilted, true, rng)) > mean(() => answerDelay(cool, a, true, rng)));
});

test('an item seen revealed earlier mostly sticks', () => {
  const a = preset('eternal');
  const before = knowChance(plain, a);
  const after = knowChance(plain, { ...a, remembered: true });
  assert.ok(after > before && after < 0.99 && Math.abs(after - (before + (0.99 - before) * 0.4)) < 1e-9);
});

test('in a team, some votes follow the herd', () => {
  const rng = seeded(71);
  assert.equal(withTheHerd(plain, 'Rings', [], rng), 'Rings');
  let followed = 0;
  for (let i = 0; i < 2000; i++) if (withTheHerd({ ...plain, herd: 0.4 }, 'Rings', ['Helmets', 'Helmets', 'Flasks'], rng) === 'Helmets') followed++;
  assert.ok(Math.abs(followed / 2000 - 0.4) < 0.04, `${followed}`);
});

test('winners now and then stay longer, heavy losers now and then leave', () => {
  const s: GameState = { ...createGame('a'), phase: 'over', winners: ['a'] };
  s.settings = { ...s.settings, targetScore: 5 };
  s.players = [
    { id: 'a', name: 'A', score: 5, recent: [], connected: true, hue: 0 },
    { id: 'b', name: 'B', score: 3, recent: [], connected: true, hue: 1 },
    { id: 'c', name: 'C', score: 1, recent: [], connected: true, hue: 2 },
  ];
  assert.equal(moodOf(s, 'a'), 'won');
  assert.equal(moodOf(s, 'b'), 'even');
  assert.equal(moodOf(s, 'c'), 'lost');
  assert.equal(moodOf({ ...s, delve: {} as GameState['delve'] }, 'c'), 'even');
  const rng = seeded(73);
  const rate = (mood: 'won' | 'lost' | 'even', what: string) => mean(() => (staysOn(mood, rng) === what ? 1 : 0));
  assert.ok(Math.abs(rate('won', 'longer') - 0.4) < 0.04 && Math.abs(rate('lost', 'leave') - 0.5) < 0.04);
  assert.equal(rate('even', 'as planned'), 1);
  // A host, whose leaving closes the room on everyone, leaves after a heavy loss far less often.
  const host = (mood: 'won' | 'lost', what: string) => mean(() => (staysOn(mood, rng, HOST_ODDS) === what ? 1 : 0));
  assert.ok(Math.abs(host('won', 'longer') - 0.4) < 0.04 && Math.abs(host('lost', 'leave') - 0.15) < 0.03);
});

test('picking a card mostly takes seconds, now and then a while longer, never past the idle skip', () => {
  const rng = seeded(79);
  const times = Array.from({ length: 4000 }, () => pickDelay({ ...plain, pace: 1.35 }, rng));
  assert.ok(Math.max(...times) < 30000, `${Math.max(...times)}`);
  const long = times.filter((t) => t > 5200).length / times.length;
  assert.ok(long > 0.08 && long < 0.25, `${long}`);  // A single card (a deathmatch's): taken straight away.
  const one = Array.from({ length: 400 }, () => pickDelay(plain, rng, 1));
  assert.ok(Math.max(...one) <= 1100 && Math.min(...one) >= 400);
});

test('misclicks are rare, likelier for the hasty', () => {
  const rng = seeded(83);
  const calm = mean(() => (misclicks(plain, rng) ? 1 : 0), 20000);
  const hasty = mean(() => (misclicks({ ...plain, haste: 1 }, rng) ? 1 : 0), 20000);
  assert.ok(calm < 0.01 && hasty > calm && hasty < 0.03, `${calm} ${hasty}`);
});

test('the impatient move on from a reveal themselves, the indecisive change their votes', () => {
  const rng = seeded(89);
  assert.equal(mean(() => (movesOn({ ...plain, impatience: 0 }, rng) === null ? 0 : 1)), 0);
  assert.ok(Math.abs(mean(() => (movesOn({ ...plain, impatience: 1 }, rng) === null ? 0 : 1)) - 0.6) < 0.04);
  assert.equal(mean(() => (rethinks({ ...plain, dither: 0 }, rng) === null ? 0 : 1)), 0);
  assert.ok(mean(() => (rethinks({ ...plain, dither: 0.3 }, rng) === null ? 0 : 1)) > 0.25);
});

test('a little slower while warming up, a little slower and sloppier after a long time on', () => {
  const rng = seeded(97);
  const a = preset('merciless');
  assert.ok(mean(() => answerDelay(plain, { ...a, warming: true }, true, rng)) > mean(() => answerDelay(plain, a, true, rng)) * 1.1);
  assert.equal(tiredness(30), 0);
  assert.equal(tiredness(120), 1);
  assert.ok(knowChance(plain, { ...a, tired: 1 }) < knowChance(plain, a));
  assert.ok(mean(() => answerDelay(plain, { ...a, tired: 1 }, true, rng)) > mean(() => answerDelay(plain, a, true, rng)));
});

test('a host fiddling with the rules nudges the target or the timer a step', () => {
  const rng = seeded(101);
  const now = { mode: 'turns' as const, difficulty: 'cruel' as const, target: 10, timer: 32 };
  for (let i = 0; i < 200; i++) {
    const next = fiddled(now, rng);
    assert.equal(next.mode, 'turns');
    assert.equal(next.difficulty, 'cruel');
    const changed = (next.target !== now.target ? 1 : 0) + (next.timer !== now.timer ? 1 : 0);
    assert.equal(changed, 1);
    assert.ok([7, 15].includes(next.target) || [16, 64].includes(next.timer));
  }
});

test('more bots than names: the latecomers share the whole cast', () => {
  assert.deepEqual(namesFor(NAMES.length + 5, NAMES.length + 5), NAMES);
  assert.equal(namesFor(1, NAMES.length + 5).length, 1);
});

test('everyone likes hosting their own amount: most would rather join, a few love it', () => {
  const all = NAMES.map((n) => leaningsOf(n).hosting);
  assert.ok(all.every((h) => h >= 0 && h <= 1));
  assert.deepEqual(leaningsOf('Morgrim'), leaningsOf('Morgrim'));
  const p = identityOf('Morgrim', ['A']).persona;
  assert.deepEqual({ hosting: p.hosting, sociable: p.sociable, picky: p.picky }, leaningsOf('Morgrim'));
  const keen = all.filter((h) => h > 0.6).length;
  const shy = all.filter((h) => h < 0.3).length;
  assert.ok(keen >= 5 && shy > keen, `${keen} keen, ${shy} shy`);
});

const HOUR = 3600000;
const now = 10 * HOUR;

test('the urge to host: their leaning, tipped by habit, a long stint lately, a bad time as a guest, and too little time', () => {
  const p = { hosting: 0.5 };
  const base = urgeToHost(p, {}, now, 60);
  assert.equal(base, 0.5);
  assert.ok(urgeToHost(p, { last: 'host' }, now, 60) > base);
  assert.ok(urgeToHost(p, { last: 'join' }, now, 60) < base);
  // Had their fill: a two-hour stint just now, much less so three hours on.
  const tired = urgeToHost(p, afterHosting({}, 120, now), now, 60);
  assert.ok(tired < base - 0.2, `${tired}`);
  assert.ok(urgeToHost(p, afterHosting({}, 120, now - 3 * HOUR), now, 60) > tired);
  // A host who never started: they'd sooner run a room themselves; it wears off.
  const sour = afterVisit({}, 'never started', 'Kessa', now);
  assert.ok(urgeToHost(p, sour, now, 60) > base + 0.05);
  assert.ok(sourNow(sour, now + 2 * HOUR) < sourNow(sour, now) / 3);
  assert.ok(urgeToHost(p, {}, now, 15) < base - 0.2);
  for (const m of [{}, sour, afterHosting({}, 500, now)]) for (const h of [0, 1]) assert.ok(urgeToHost({ hosting: h }, m, now, 60) >= 0 && urgeToHost({ hosting: h }, m, now, 60) <= 1);
});

test('a visit is remembered: the host, kindly or not, and only so many hosts', () => {
  let m = afterVisit({}, 'won', 'Kessa', now);
  assert.equal(m.last, 'join');
  assert.ok(m.hosts!.Kessa > 0);
  m = afterVisit(m, 'never started', 'Ralv', now);
  assert.ok(m.hosts!.Ralv < 0);
  for (let i = 0; i < 30; i++) m = afterVisit(m, 'played', `host${i}`, now);
  assert.ok(Object.keys(m.hosts!).length <= 12);
});

test('those who feel like hosting are the likelier to come on to host, the rest to join', () => {
  assert.ok(keenTo(0.9, 'host') > 5 * keenTo(0.05, 'host'));
  assert.ok(keenTo(0.05, 'join') > 5 * keenTo(0.9, 'join'));
  // Never quite never.
  assert.ok(keenTo(0, 'host') > 0 && keenTo(1, 'join') > 0);
  const pool = ['a', 'b'];
  const rng = seeded(4);
  let a = 0;
  for (let i = 0; i < 1000; i++) if (nextName([], rng, pool, (n) => (n === 'a' ? 3 : 1)) === 'a') a++;
  assert.ok(a > 680 && a < 820, `${a}`);
});

test('with no room to play in, the keen open one soon, the rest later or not at all', () => {
  const rng = seeded(5);
  const mean = (urge: number) => Array.from({ length: 200 }, () => hesitation(urge, rng)).reduce((a, b) => a + b) / 200;
  const keen = mean(1);
  const shy = mean(0);
  assert.ok(keen > 1000 && keen < 3000, `${keen}`);
  assert.ok(shy > 15000 && shy < 30000, `${shy}`);
  const opens = (urge: number) => Array.from({ length: 2000 }, () => opensRoom(urge, rng)).filter((ms) => ms !== null).length / 2000;
  assert.equal(opens(1), 1);
  assert.ok(opens(0) > 0.18 && opens(0) < 0.32, `${opens(0)}`);
});

test('after hosting, those who feel like it less are likelier to stay on and join someone', () => {
  const rng = seeded(6);
  const rate = (urge: number, exit: Parameters<typeof joinsAfter>[1]) => Array.from({ length: 2000 }, () => joinsAfter(urge, exit, rng)).filter(Boolean).length / 2000;
  assert.ok(rate(0, 'made way') > 0.7);
  assert.ok(rate(0, 'made way') > rate(0, 'nobody came') && rate(0, 'nobody came') > rate(0, 'done'));
  assert.ok(rate(0.8, 'made way') < 0.25);
  assert.equal(rate(0, 'sulking'), 0);
  assert.equal(rate(1, 'made way'), 0);
});

test('after a visit, a let-down sends them looking more often than a good time, and nobody without the time', () => {
  const rng = seeded(7);
  const rate = (visit: Parameters<typeof playsOn>[0]) => Array.from({ length: 2000 }, () => playsOn(visit, 60, rng)).filter(Boolean).length / 2000;
  assert.ok(rate('never started') > rate('played') && rate('played') > rate('lost heavily'));
  assert.ok(!playsOn('turned away', 5, () => 0));
});

test('a room appeals by its rules, its company and its host, and they settle for less the longer they look', () => {
  const taste = { mode: 'turns' as const, difficulty: 'cruel' as const };
  const room = (over: Partial<RoomInfo> = {}) => ({ mode: 'turns' as const, difficulty: 'cruel' as const, players: 1, ...over });
  const picky = { sociable: 0.5, picky: 1 };
  const easy = { sociable: 0.5, picky: 0 };
  assert.equal(appeal(picky, taste, room()), 1);
  // The picky mind other rules, Delve against the rest most; the easy-going hardly.
  assert.ok(appeal(picky, taste, room({ difficulty: 'merciless' })) > appeal(picky, taste, room({ mode: 'race' })));
  assert.ok(appeal(picky, taste, room({ mode: 'race' })) > appeal(picky, taste, room({ mode: 'delve' })));
  assert.equal(appeal(easy, taste, room({ mode: 'delve' })), 1);
  // Company: the sociable warm to a busy room, the rest to a host on their own.
  assert.ok(appeal({ sociable: 1, picky: 0 }, taste, room({ players: 3 })) > appeal({ sociable: 1, picky: 0 }, taste, room()));
  assert.ok(appeal({ sociable: 0, picky: 0 }, taste, room({ players: 3 })) < appeal({ sociable: 0, picky: 0 }, taste, room()));
  // A host they got on with, or didn't.
  assert.ok(appeal(picky, taste, room(), 1) > appeal(picky, taste, room()) && appeal(picky, taste, room(), -1) < appeal(picky, taste, room()));
  // A picky one waits a while for a Delve fan's room, then settles.
  const delve = appeal(picky, { mode: 'delve', difficulty: 'cruel' }, room());
  assert.ok(delve < settlesFor(0) && delve >= settlesFor(5), `${delve}`);
  assert.ok(settlesFor(60) >= 0.3);
});

test('a seat opens the lowest numbered room free, as many as it takes, or up to a limit', () => {
  assert.equal(nextRole([]), 1);
  assert.equal(nextRole([1]), 2);
  assert.equal(nextRole([2]), 1);
  assert.equal(nextRole([1, 2, 3, 5]), 4);
  assert.equal(nextRole([1, 2, 3, 4, 5, 6, 7, 8]), 9);
  assert.equal(nextRole([1], 1), null);
  assert.equal(nextRole([1], 2), 2);
  assert.equal(nextRole([1, 2], 2), null);
  assert.equal(nextRole([], 0), null);
});
