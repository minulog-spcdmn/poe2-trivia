// The session's rules about guests and saves (lib/sessionRules.ts): which
// answers come too quick to be a human's, how a hello is turned down and in
// what order, which tokens a full room forgets, which state a guest takes,
// and what a save from an older build picks up as.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, createGame, type GameState, type Item, type Settings } from '../src/lib/game.ts';
import { PROTOCOL_VERSION } from '../src/lib/protocol.ts';
import {
  MIN_HUMAN_MS,
  helloRefusal,
  noPrivate,
  parseSaved,
  privateFrom,
  rememberSecret,
  soloHotSeat,
  takesState,
  tooFast,
  type HostPrivate,
} from '../src/lib/sessionRules.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));

// ---- too quick to count --------------------------------------------------

const ASKED = 5000;
/** What the host has seen of the guest and the question, as tooFast takes it. */
type Seen = Parameters<typeof tooFast>[2];
/** A question asked at ASKED, its clock started at `clockAt` (null: not yet). */
const asking = (clockAt: number | null = ASKED + 100, phase = 'question') =>
  ({ phase, question: { askedAt: ASKED, ...(clockAt === null ? {} : { clockAt }) } }) as unknown as GameState;
/** The guest was sent the key to its art at 6000, on a 50 ms link; nothing failed, no clock seen. */
const sent: Seen = { artFailedFor: 0, mediaAt: { qid: ASKED, at: 6000 }, clockAt: 0, rtt: 50, now: 0 };
const at = (now: number, o: Partial<Seen> = {}): Seen => ({ ...sent, ...o, now });

test("an answer is too quick until the art's key had a round trip and a human's moment to reach them", () => {
  const s = asking();
  const enough = 6000 + 50 + MIN_HUMAN_MS;
  assert.equal(tooFast(s, ASKED, at(6000)), true);
  assert.equal(tooFast(s, ASKED, at(enough - 1)), true);
  assert.equal(tooFast(s, ASKED, at(enough)), false);
  // An answer that doesn't say which question it is for is taken for this one.
  assert.equal(tooFast(s, undefined, at(enough - 1)), true);
  // The link's round trip counts: on a faster one the same moment is human enough.
  assert.equal(tooFast(s, ASKED, at(enough - 1, { rtt: 0 })), false);
});

test('before the key to its art reached them, any answer is too quick', () => {
  const s = asking();
  assert.equal(tooFast(s, ASKED, at(1e9, { mediaAt: null })), true);
  // The key they were sent was for another question.
  assert.equal(tooFast(s, ASKED, at(1e9, { mediaAt: { qid: ASKED - 1, at: 0 } })), true);
});

test('the wait counts from the clock starting when it started after the key went out', () => {
  const s = asking();
  // A Delve clock the host's reload held still starts later than the art arrived.
  const clockAt = 9000;
  assert.equal(tooFast(s, ASKED, at(clockAt + 50 + MIN_HUMAN_MS - 1, { clockAt })), true);
  assert.equal(tooFast(s, ASKED, at(clockAt + 50 + MIN_HUMAN_MS, { clockAt })), false);
  // A clock seen before the key doesn't shorten the wait.
  assert.equal(tooFast(s, ASKED, at(6000 + 50 + MIN_HUMAN_MS - 1, { clockAt: 1000 })), true);
});

test("never too quick where the engine drops the answer itself, nor when the art couldn't go out", () => {
  const quick = at(6001, { mediaAt: null });
  assert.equal(tooFast(null, ASKED, quick), false);
  // Its clock hasn't started: the engine turns every answer down, without a word.
  assert.equal(tooFast(asking(null), ASKED, quick), false);
  // Revealed already, or for a question gone by: "Too late!" is the engine's to say.
  assert.equal(tooFast(asking(ASKED + 100, 'reveal'), ASKED, quick), false);
  assert.equal(tooFast(asking(), ASKED - 1, quick), false);
  // No art reached anyone: answers aren't held back waiting for it.
  assert.equal(tooFast(asking(), ASKED, { ...quick, artFailedFor: ASKED }), false);
  assert.equal(tooFast(asking(), ASKED, { ...quick, artFailedFor: ASKED - 1 }), true);
});

// ---- hellos --------------------------------------------------------------

const NO_SEAL = 'no seal';
/** A join budget that counts how often it is asked, with room or `busy`. */
function budget(busy: string | null = null) {
  const b = { asked: 0, admit: () => (b.asked++, busy) };
  return b;
}

test('a hello is turned down for its version first, then for sealing, then a kick, then the join budget', () => {
  const v = PROTOCOL_VERSION;
  const b = budget('Lots of people are joining right now.');
  // Everything wrong at once: the version is what it's told, as such.
  const behind = helloRefusal(v - 1, false, true, b.admit, NO_SEAL);
  assert.equal(behind?.t, 'error');
  assert.equal(behind?.t === 'error' && behind.version, true);
  const ahead = helloRefusal(v + 1, false, true, b.admit, NO_SEAL);
  assert.equal(ahead?.t === 'error' && ahead.version, true);
  assert.notEqual(behind?.t === 'error' && behind.message, ahead?.t === 'error' && ahead.message);
  assert.deepEqual(helloRefusal(v, false, true, b.admit, NO_SEAL), { t: 'error', message: NO_SEAL });
  assert.deepEqual(helloRefusal(v, true, true, b.admit, NO_SEAL), { t: 'kicked' });
  // None of those paid out of the join budget.
  assert.equal(b.asked, 0);
  assert.deepEqual(helloRefusal(v, true, false, b.admit, NO_SEAL), { t: 'busy', message: 'Lots of people are joining right now.' });
  assert.equal(b.asked, 1);
});

test('a hello that passes everything goes to its seat, having asked the join budget once', () => {
  const b = budget();
  assert.equal(helloRefusal(PROTOCOL_VERSION, true, false, b.admit, NO_SEAL), null);
  assert.equal(b.asked, 1);
});

// ---- remembered tokens ---------------------------------------------------

test("past the most remembered, the oldest token of someone gone is forgotten, never one of someone here", () => {
  const secrets: [string, string][] = [
    ['s1', 'here1'],
    ['s2', 'gone1'],
    ['s3', 'gone2'],
  ];
  // Room for it: nothing forgotten.
  assert.equal(rememberSecret(secrets, 's4', 'new', new Set(['here1', 'new']), 4), null);
  assert.equal(rememberSecret(secrets, 's5', 'new2', new Set(['here1', 'new', 'new2']), 4), 's2');
  assert.deepEqual(secrets.map(([s]) => s), ['s1', 's3', 's4', 's5']);
  assert.equal(rememberSecret(secrets, 's6', 'new3', new Set(['here1', 'new', 'new2', 'new3']), 4), 's3');
  // Everyone remembered is here: the list runs over rather than forget one of them.
  assert.equal(rememberSecret(secrets, 's7', 'new4', new Set(['here1', 'new', 'new2', 'new3', 'new4']), 4), null);
  assert.deepEqual(secrets.map(([s]) => s), ['s1', 's4', 's5', 's6', 's7']);
});

// ---- the host's private data ---------------------------------------------

test("a host's saved private data is taken up as its own copy, lists a build saved without starting empty", () => {
  const old = { myPlayerId: 'me', secrets: [['s', 'p']], bannedSecrets: ['x'], bannedPeers: ['peer'] } as unknown as HostPrivate;
  const p = privateFrom(old);
  assert.deepEqual(p, { myPlayerId: 'me', secrets: [['s', 'p']], bannedSecrets: ['x'], bannedPeers: ['peer'], bannedNames: [], blockedPeers: [] });
  p.secrets.push(['t', 'q']);
  p.bannedSecrets.push('y');
  p.bannedPeers.push('peer2');
  assert.deepEqual(old.secrets, [['s', 'p']]);
  assert.deepEqual(old.bannedSecrets, ['x']);
  assert.deepEqual(old.bannedPeers, ['peer']);
  const full: HostPrivate = { ...noPrivate('me'), bannedNames: ['ash'], blockedPeers: ['b'] };
  assert.deepEqual(privateFrom(full), full);
  assert.notEqual(privateFrom(full).bannedNames, full.bannedNames);
});

// ---- the state a guest is sent -------------------------------------------

test('a guest takes a state as new as the one shown or newer, and a restart’s whatever its count', () => {
  const v = (version: number) => ({ version }) as GameState;
  assert.equal(takesState(null, v(3)), true);
  assert.equal(takesState(v(3), v(4)), true);
  assert.equal(takesState(v(3), v(3)), true);
  // One that passed a newer one on the way (a reconnect) is left.
  assert.equal(takesState(v(4), v(3)), false);
  // A restart counts from 0 again.
  assert.equal(takesState(v(40), v(0)), true);
});

// ---- saves ---------------------------------------------------------------

const local = { mode: 'local', state: createGame(null) };
const hosted = { mode: 'host', code: 'ABCD', state: createGame('p0'), priv: noPrivate('p0') };
const guest = { mode: 'client', code: 'ABCD', name: 'Ash', watch: true };

test('a save is picked up as it was, whatever it was', () => {
  for (const saved of [local, hosted, guest]) assert.deepEqual(parseSaved(JSON.stringify(saved), null), saved);
  // The save there is the one: an older one beside it isn't looked at.
  assert.deepEqual(parseSaved(JSON.stringify(guest), JSON.stringify(local)), guest);
});

test('of a save from before per-room tokens, only a hot-seat game carries on', () => {
  assert.deepEqual(parseSaved(null, JSON.stringify(local)), local);
  assert.equal(parseSaved(null, JSON.stringify(hosted)), null);
  assert.equal(parseSaved(null, JSON.stringify(guest)), null);
});

test('no save, or a damaged one, is nothing to pick up', () => {
  assert.equal(parseSaved(null, null), null);
  assert.equal(parseSaved('{"mode":"lo', null), null);
  assert.equal(parseSaved(null, 'not json'), null);
});

const DELVE: Settings = { targetScore: 10, timer: 0, difficulty: 'merciless', mode: 'delve', public: false, locked: false };

function delveRun(names: string[]) {
  const engine = new Engine(items, { rng: () => 0.5 });
  let s = createGame('p0', DELVE);
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
  s = engine.apply(s, { type: 'start' }, 'p0');
  return { engine, s };
}

test("a group's hot-seat Delve run saved by an older build goes back to its lobby, and says so", () => {
  // Hot-seat runs together are refused now; an older build saved one as a room's run with no host.
  const { engine, s: online } = delveRun(['Ash', 'Brea']);
  const old: GameState = { ...online, hostId: null };
  let told = 0;
  const back = soloHotSeat(old, engine, () => told++);
  assert.equal(back.phase, 'lobby');
  assert.deepEqual(back.players.map((p) => p.name), ['Ash', 'Brea']);
  assert.equal(told, 1);
});

test('a run alone, a game over or in its lobby, and a room’s run together all carry on as saved', () => {
  let told = 0;
  const turned = () => told++;
  const alone = delveRun(['Ash']);
  const soloHotSeatRun: GameState = { ...alone.s, hostId: null };
  assert.equal(soloHotSeat(soloHotSeatRun, alone.engine, turned), soloHotSeatRun);
  const together = delveRun(['Ash', 'Brea']);
  assert.equal(soloHotSeat(together.s, together.engine, turned), together.s);
  const over: GameState = { ...together.s, hostId: null, phase: 'over' };
  assert.equal(soloHotSeat(over, together.engine, turned), over);
  const lobby: GameState = { ...together.s, hostId: null, phase: 'lobby' };
  assert.equal(soloHotSeat(lobby, together.engine, turned), lobby);
  const notDelve = createGame(null);
  assert.equal(soloHotSeat(notDelve, together.engine, turned), notDelve);
  assert.equal(told, 0);
});
