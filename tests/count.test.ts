import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameCounts, flipSkip, isToggleHash, type SkipStore, countArrival, countEvent, countVisit, countsOn, delveEndEvent, gameEvents, reachEvents, referrerOf } from '../src/lib/count.ts';
import { LEGACY_VERSION_TEXT, PROTOCOL_VERSION, isVersionRefusal, parseHostMsg, versionProblem } from '../src/lib/protocol.ts';
import { DEFAULT_SETTINGS, createGame, type GameState, type Player } from '../src/lib/game.ts';
import { COUNTER_ORIGIN } from '../src/lib/counter.ts';

const player = (id: string): Player => ({ ...createGame(null).players[0], id, name: id, score: 0, connected: true }) as Player;
const game = (mode: 'turns' | 'race' | 'delve', seats: number, phase: GameState['phase'] = 'lobby'): GameState => ({
  ...createGame('p0', { ...DEFAULT_SETTINGS, mode }),
  players: Array.from({ length: seats }, (_, i) => player(`p${i}`)),
  phase,
});
/** A Delve run of `entrants`, with each one's losses (three lose every life). */
const delve = (s: GameState, entrants: string[], losses: Record<string, number[]> = {}, startedAt = 1): GameState => ({
  ...s,
  delve: { ...(s.delve ?? {}), entrants, losses, startedAt, revives: [] } as unknown as GameState['delve'],
});

test('only the live game counts, on its own page, with no robot driving it', () => {
  const at = (hostname: string, pathname = '/') => ({ hostname, pathname });
  assert.ok(countsOn(at('poe2.quest'), 'live', false));
  assert.ok(countsOn(at('poe2.quest', '/index.html'), 'live', false));
  assert.ok(!countsOn(at('poe2.quest', '/beta/'), 'beta', false));
  assert.ok(!countsOn(at('poe2.quest', '/beta/'), 'live', false));
  assert.ok(!countsOn(at('poe2.quest', '/lab.html'), 'live', false));
  assert.ok(!countsOn(at('localhost'), 'local', false));
  assert.ok(!countsOn(at('localhost'), 'live', false));
  assert.ok(!countsOn(at('poe2.quest'), 'live', true));
});

test('outside a browser nothing is counted, and nothing throws', () => {
  assert.doesNotThrow(() => {
    countVisit();
    countEvent('play/race-online');
    countArrival('open/invite-link');
  });
});

test('the CSP lets the counts out', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /connect-src[^\n]*\$\{COUNTER_ORIGIN\}/);
  assert.match(config, /img-src[^\n]*\$\{COUNTER_ORIGIN\}/);
  assert.ok(COUNTER_ORIGIN.startsWith('https://'));
});

test('a referrer is another site without its query; this site, which may carry a room code, is none', () => {
  // Only the site: a path may name a private thread or a document.
  assert.equal(referrerOf('https://www.reddit.com/r/PathOfExile2/comments/abc/?utm_source=x#top', 'https://poe2.quest/'), 'https://www.reddit.com');
  assert.equal(referrerOf('https://docs.google.com/document/d/secret-id/edit', 'https://poe2.quest/'), 'https://docs.google.com');
  assert.equal(referrerOf('https://poe2.quest/?room=ABC123', 'https://poe2.quest/'), '');
  assert.equal(referrerOf('', 'https://poe2.quest/'), '');
  // An app's has no origin: its name, not "null".
  assert.equal(referrerOf('android-app://com.reddit.frontpage/', 'https://poe2.quest/'), 'android-app://com.reddit.frontpage');
});

test("a join turned down for the versions counts apart from one turned down by the room", () => {
  // Flagged, whatever its words (a later build may say it otherwise).
  assert.ok(isVersionRefusal({ message: 'Anything at all.', version: true }));
  // From hosts older than the flag, by the words they used.
  assert.ok(isVersionRefusal({ message: versionProblem(PROTOCOL_VERSION - 1)! }));
  assert.ok(isVersionRefusal({ message: versionProblem(PROTOCOL_VERSION + 1)! }));
  assert.ok(isVersionRefusal({ message: LEGACY_VERSION_TEXT }));
  assert.ok(!isVersionRefusal({ message: 'The lobby is full.' }));
  // The flag goes through the guest's check of what a host sends.
  assert.deepEqual(parseHostMsg({ t: 'error', message: 'x', version: true }), { t: 'error', message: 'x', version: true });
  assert.equal(parseHostMsg({ t: 'error', message: 'x', version: 'yes' }), null);
});

test('a game counts as it starts, with how many play, and as it ends, under the same key', () => {
  const lobby = game('race', 4);
  const started = { ...lobby, phase: 'choosing' as const };
  assert.deepEqual(gameEvents(lobby, started, false), ['play/race-online', 'size/race-online-4p']);
  assert.deepEqual(gameEvents(started, { ...started, phase: 'question' }, false), []);
  const over = { ...started, phase: 'over' as const };
  assert.deepEqual(gameEvents(started, over, false), ['end/race-online']);
  assert.deepEqual(gameEvents(over, over, false), []);
  // The next game in the room starts from the last one's end.
  assert.deepEqual(gameEvents(over, { ...over, phase: 'choosing' }, false), ['play/race-online', 'size/race-online-4p']);
  const sizes = [1, 2, 5, 12].map((n) => gameEvents(game('turns', n), game('turns', n, 'choosing'), true)[1]);
  assert.deepEqual(sizes, ['size/turns-hotseat-1p', 'size/turns-hotseat-2p', 'size/turns-hotseat-5p', 'size/turns-hotseat-12p']);
});

test('a game picked up after a reload counts nothing, not even an end it had reached', () => {
  assert.deepEqual(gameEvents(null, game('race', 2, 'choosing'), false), []);
  assert.deepEqual(gameEvents(null, delve(game('delve', 1, 'reveal'), ['p0'], { p0: [3, 5, 8] }), true), []);
});

test('a Delve run ends as its last life goes, at the depth it went, once', () => {
  const run = delve(game('delve', 1, 'question'), ['p0'], { p0: [3, 5] });
  const fell = delve(game('delve', 1, 'reveal'), ['p0'], { p0: [3, 5, 24] });
  assert.deepEqual(gameEvents(run, fell, true), ['end/delve-hotseat', delveEndEvent(23)]);
  assert.equal(delveEndEvent(23), 'delve/depth-20-29');
  // Looking at the results afterwards ends nothing more.
  assert.deepEqual(gameEvents(fell, { ...fell, phase: 'over' }, true), []);
});

test('a run ends as the engine ends it: once nobody seated stands, whoever left', () => {
  // p1 left the room still standing; p0, the one seated, has just perished.
  const run = { ...delve(game('delve', 2, 'question'), ['p0', 'p1'], { p0: [2, 3] }), players: [player('p0')] };
  const fell = { ...delve(game('delve', 2, 'reveal'), ['p0', 'p1'], { p0: [2, 3, 7] }), players: [player('p0')] };
  assert.deepEqual(gameEvents(run, fell, false), ['end/delve-online', 'delve/depth-0-9']);
});

test("a run's end counts once, even if someone comes back standing and falls again", () => {
  const counts = new GameCounts();
  const run = { ...delve(game('delve', 2, 'question'), ['p0', 'p1'], { p0: [2, 3] }), players: [player('p0')] };
  const fell = { ...delve(game('delve', 2, 'reveal'), ['p0', 'p1'], { p0: [2, 3, 7] }), players: [player('p0')] };
  assert.equal(counts.events(run, fell, false).length, 2);
  const back = delve(game('delve', 2, 'question'), ['p0', 'p1'], { p0: [2, 3, 7], p1: [4] });
  const fellAgain = delve(game('delve', 2, 'reveal'), ['p0', 'p1'], { p0: [2, 3, 7], p1: [4, 8, 9] });
  assert.deepEqual(counts.events(fell, back, false), []);
  assert.deepEqual(counts.events(back, fellAgain, false), []);
  // The next run ends on its own.
  const next = delve(game('delve', 2, 'question'), ['p0', 'p1'], { p0: [1], p1: [1, 2] }, 2);
  assert.equal(counts.events(next, delve(game('delve', 2, 'reveal'), ['p0', 'p1'], { p0: [1, 2, 3], p1: [1, 2, 3] }, 2), false).length, 2);
});

test('a run together ends once nobody stands, not while someone does', () => {
  const one = delve(game('delve', 2, 'reveal'), ['p0', 'p1'], { p0: [2, 3, 4], p1: [3] });
  const both = delve(game('delve', 2, 'reveal'), ['p0', 'p1'], { p0: [2, 3, 4], p1: [3, 5, 12] });
  assert.deepEqual(gameEvents(delve(game('delve', 2, 'question'), ['p0', 'p1'], { p0: [2, 3], p1: [3] }), one, false), []);
  assert.deepEqual(gameEvents(one, both, false), ['end/delve-online', 'delve/depth-10-19']);
});

test('a Delve run counts by the ten depths it ended in, as players see them', () => {
  assert.equal(delveEndEvent(0), 'delve/depth-0-9');
  assert.equal(delveEndEvent(9), 'delve/depth-0-9');
  assert.equal(delveEndEvent(10), 'delve/depth-10-19');
  assert.equal(delveEndEvent(-1), 'delve/depth-0-9');
});

test("GoatCounter's #toggle-goatcounter switches this browser's counting, with or without the dash", () => {
  for (const h of ['#toggle-goatcounter', '#togglegoatcounter', '#Toggle-GoatCounter']) assert.ok(isToggleHash(h), h);
  for (const h of ['', '#', '#codex', '#toggle-goatcounter?x', '#toggle']) assert.ok(!isToggleHash(h), h);
});

test('a toggle flips the opt-out both ways, and says so when the browser cannot keep it', () => {
  let skip = false;
  let works = true;
  const store: SkipStore = {
    skipped: () => skip,
    set: (s) => (works ? ((skip = s), true) : false),
  };
  assert.equal(flipSkip(store), 'skipped');
  assert.equal(skip, true);
  assert.equal(flipSkip(store), 'counted');
  assert.equal(skip, false);
  works = false;
  assert.equal(flipSkip(store), 'unsaved');
  assert.equal(skip, false);
});

test('every device in a game marks the steps its visitor reached: played, then finished', () => {
  const lobby = game('race', 4);
  const started = { ...lobby, phase: 'choosing' as const };
  const over = { ...started, phase: 'over' as const };
  assert.deepEqual(reachEvents(lobby, started), ['reach/played']);
  assert.deepEqual(reachEvents(started, { ...started, phase: 'question' }), []);
  assert.deepEqual(reachEvents(started, over), ['reach/finished']);
  assert.deepEqual(reachEvents(over, over), []);
  assert.deepEqual(reachEvents(over, { ...over, phase: 'choosing' }), ['reach/played']);
  // A game picked up after a reload was counted before.
  assert.deepEqual(reachEvents(null, started), []);
});
