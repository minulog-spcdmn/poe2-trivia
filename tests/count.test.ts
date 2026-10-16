import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countArrival, countEvent, countVisit, countsOn, delveEndEvent, gameEvents, referrerOf } from '../src/lib/count.ts';
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
  assert.equal(referrerOf('https://www.reddit.com/r/PathOfExile2/comments/abc/?utm_source=x#top', 'https://poe2.quest/'), 'https://www.reddit.com/r/PathOfExile2/comments/abc/');
  assert.equal(referrerOf('https://poe2.quest/?room=ABC123', 'https://poe2.quest/'), '');
  assert.equal(referrerOf('', 'https://poe2.quest/'), '');
});

test('a game counts as it starts, with how many play, and as it ends, under the same key', () => {
  const lobby = game('race', 4);
  const started = { ...lobby, phase: 'choosing' as const };
  assert.deepEqual(gameEvents(lobby, started, false), ['play/race-online', 'size/race-online-3-4p']);
  assert.deepEqual(gameEvents(started, { ...started, phase: 'question' }, false), []);
  const over = { ...started, phase: 'over' as const };
  assert.deepEqual(gameEvents(started, over, false), ['end/race-online']);
  assert.deepEqual(gameEvents(over, over, false), []);
  // The next game in the room starts from the last one's end.
  assert.deepEqual(gameEvents(over, { ...over, phase: 'choosing' }, false), ['play/race-online', 'size/race-online-3-4p']);
  const sizes = [1, 2, 5, 12].map((n) => gameEvents(game('turns', n), game('turns', n, 'choosing'), true)[1]);
  assert.deepEqual(sizes, ['size/turns-hotseat-1p', 'size/turns-hotseat-2p', 'size/turns-hotseat-5-8p', 'size/turns-hotseat-9-12p']);
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

test("a Delve run with the host sitting it out still ends: it's the entrants' lives that count", () => {
  const run = delve(game('delve', 2, 'question'), ['p1'], { p1: [4, 6] });
  const fell = delve(game('delve', 2, 'reveal'), ['p1'], { p1: [4, 6, 9] });
  assert.deepEqual(gameEvents(run, fell, false), ['end/delve-online', 'delve/depth-0-9']);
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
