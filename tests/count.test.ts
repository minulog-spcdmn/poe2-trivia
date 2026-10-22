import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GameCounts,
  Steps,
  flipSkip,
  isToggleHash,
  type SkipStore,
  campaignOf,
  countArrival,
  countEvent,
  countReach,
  countScriptErrors,
  countTime,
  countVisit,
  countPage,
  countStep,
  cohortEvent,
  failedImport,
  openedAsApp,
  ownScript,
  takeCampaign,
  countsOn,
  delveEndEvent,
  gameEvents,
  reachEvents,
  recencyEvent,
  referrerOf,
  timeMarksPassed,
} from '../src/lib/count.ts';
import { LEGACY_VERSION_TEXT, PROTOCOL_VERSION, isVersionRefusal, parseHostMsg, versionProblem } from '../src/lib/protocol.ts';
import { DEFAULT_SETTINGS, createGame, type GameState, type Player } from '../src/lib/game.ts';
import { COUNTER_ORIGIN } from '../src/lib/counter.ts';
import { playedIn } from '../src/lib/lastPlayed.ts';
import { isoWeek, isoWeekOfDay, weekMonday } from '../src/lib/isoWeek.ts';
import { emptyCodex } from '../src/lib/codex.ts';

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
    countVisit(() => null, 'reddit');
    countPage();
    countStep('reach/played');
    assert.equal(takeCampaign(), null);
    countEvent('play/race');
    countArrival('open/invite-link');
    countReach('reach/codex');
    countTime();
    countScriptErrors();
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
  assert.deepEqual(gameEvents(lobby, started), ['play/race', 'size/race-4p']);
  assert.deepEqual(gameEvents(started, { ...started, phase: 'question' }), []);
  const over = { ...started, phase: 'over' as const };
  assert.deepEqual(gameEvents(started, over), ['end/race']);
  assert.deepEqual(gameEvents(over, over), []);
  // The next game in the room starts from the last one's end.
  assert.deepEqual(gameEvents(over, { ...over, phase: 'choosing' }), ['play/race', 'size/race-4p']);
  const sizes = [1, 2, 5, 12].map((n) => gameEvents(game('turns', n), game('turns', n, 'choosing'))[1]);
  assert.deepEqual(sizes, ['size/turns-1p', 'size/turns-2p', 'size/turns-5p', 'size/turns-12p']);
});

test("a game with players at the host's screen says so as it starts", () => {
  const lobby = game('turns', 3);
  const seated = { ...lobby, players: lobby.players.map((p, i) => (i ? { ...p, local: true as const } : p)) };
  assert.deepEqual(gameEvents(seated, { ...seated, phase: 'choosing' }), ['play/turns', 'size/turns-3p', 'screen/turns']);
  assert.ok(!gameEvents(lobby, { ...lobby, phase: 'choosing' }).includes('screen/turns'));
});

test('a game picked up after a reload counts nothing, not even an end it had reached', () => {
  assert.deepEqual(gameEvents(null, game('race', 2, 'choosing')), []);
  assert.deepEqual(gameEvents(null, delve(game('delve', 1, 'reveal'), ['p0'], { p0: [3, 5, 8] })), []);
});

test('a Delve run ends as its last life goes, at the depth it went, once', () => {
  const run = delve(game('delve', 1, 'question'), ['p0'], { p0: [3, 5] });
  const fell = delve(game('delve', 1, 'reveal'), ['p0'], { p0: [3, 5, 24] });
  assert.deepEqual(gameEvents(run, fell), ['end/delve', delveEndEvent(23)]);
  assert.equal(delveEndEvent(23), 'delve/depth-20-29');
  // Looking at the results afterwards ends nothing more.
  assert.deepEqual(gameEvents(fell, { ...fell, phase: 'over' }), []);
});

test('a run ends as the engine ends it: once nobody seated stands, whoever left', () => {
  // p1 left the room still standing; p0, the one seated, has just perished.
  const run = { ...delve(game('delve', 2, 'question'), ['p0', 'p1'], { p0: [2, 3] }), players: [player('p0')] };
  const fell = { ...delve(game('delve', 2, 'reveal'), ['p0', 'p1'], { p0: [2, 3, 7] }), players: [player('p0')] };
  assert.deepEqual(gameEvents(run, fell), ['end/delve', 'delve/depth-0-9']);
});

test("a run's end counts once, even if someone comes back standing and falls again", () => {
  const counts = new GameCounts();
  const run = { ...delve(game('delve', 2, 'question'), ['p0', 'p1'], { p0: [2, 3] }), players: [player('p0')] };
  const fell = { ...delve(game('delve', 2, 'reveal'), ['p0', 'p1'], { p0: [2, 3, 7] }), players: [player('p0')] };
  assert.equal(counts.events(run, fell).length, 2);
  const back = delve(game('delve', 2, 'question'), ['p0', 'p1'], { p0: [2, 3, 7], p1: [4] });
  const fellAgain = delve(game('delve', 2, 'reveal'), ['p0', 'p1'], { p0: [2, 3, 7], p1: [4, 8, 9] });
  assert.deepEqual(counts.events(fell, back), []);
  assert.deepEqual(counts.events(back, fellAgain), []);
  // The next run ends on its own.
  const next = delve(game('delve', 2, 'question'), ['p0', 'p1'], { p0: [1], p1: [1, 2] }, 2);
  assert.equal(counts.events(next, delve(game('delve', 2, 'reveal'), ['p0', 'p1'], { p0: [1, 2, 3], p1: [1, 2, 3] }, 2)).length, 2);
});

test('a run together ends once nobody stands, not while someone does', () => {
  const one = delve(game('delve', 2, 'reveal'), ['p0', 'p1'], { p0: [2, 3, 4], p1: [3] });
  const both = delve(game('delve', 2, 'reveal'), ['p0', 'p1'], { p0: [2, 3, 4], p1: [3, 5, 12] });
  assert.deepEqual(gameEvents(delve(game('delve', 2, 'question'), ['p0', 'p1'], { p0: [2, 3], p1: [3] }), one), []);
  assert.deepEqual(gameEvents(one, both), ['end/delve', 'delve/depth-10-19']);
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

test('a lobby counts as reached as it is first seen, made, joined or picked up after a reload', () => {
  const lobby = game('race', 2);
  assert.deepEqual(reachEvents(null, lobby), ['reach/lobby']);
  assert.deepEqual(reachEvents(lobby, { ...lobby, players: [...lobby.players, player('p9')] }), []);
  assert.deepEqual(reachEvents({ ...lobby, phase: 'over' }, lobby), ['reach/lobby']);
});

test("a page's second and fifth game are marked, and no others", () => {
  const steps = new Steps();
  const lobby = game('race', 2);
  const started = { ...lobby, phase: 'choosing' as const };
  const over = { ...started, phase: 'over' as const };
  const marks: string[] = [];
  for (let i = 0; i < 6; i++) {
    marks.push(...steps.events(i ? over : lobby, started).filter((e) => e.startsWith('reach/games-')));
    steps.events(started, over);
  }
  assert.deepEqual(marks, ['reach/games-2', 'reach/games-5']);
});

test('time on the page passes its marks once each', () => {
  assert.deepEqual(timeMarksPassed(0, 5_000), []);
  assert.deepEqual(timeMarksPassed(115_000, 120_000), ['reach/time-2m']);
  assert.deepEqual(timeMarksPassed(120_000, 125_000), []);
  assert.deepEqual(timeMarksPassed(595_000, 600_000), ['reach/time-10m']);
  assert.deepEqual(timeMarksPassed(1_795_000, 1_800_000), ['reach/time-30m']);
});

test('a visit says how long ago the game was last played here, and nothing while its visit is still open', () => {
  const now = Date.UTC(2026, 9, 21, 12);
  const at = (hoursAgo: number) => ({ first: now - 1_000 * 86_400_000, last: now - hoursAgo * 3_600_000 });
  assert.equal(recencyEvent(null, now), 'visit/new');
  // Played two hours ago: GoatCounter is still in that visit, marked then.
  assert.equal(recencyEvent(at(2), now), null);
  assert.equal(recencyEvent(at(12), now), 'visit/back-1d');
  assert.equal(recencyEvent(at(24), now), 'visit/back-1d');
  assert.equal(recencyEvent(at(72), now), 'visit/back-7d');
  assert.equal(recencyEvent(at(20 * 24), now), 'visit/back-30d');
  assert.equal(recencyEvent(at(90 * 24), now), 'visit/back-later');
});

test('a device is followed by the ISO week it first played in', () => {
  assert.equal(isoWeek(Date.UTC(2026, 9, 21)), '2026-W43');
  // The first days of a January in the last week of the year before, and a December's last in the next's first.
  assert.equal(isoWeek(Date.UTC(2027, 0, 1)), '2026-W53');
  assert.equal(isoWeek(Date.UTC(2025, 11, 29)), '2026-W01');
  assert.equal(isoWeek(Date.UTC(2026, 0, 5)), '2026-W02');
  assert.equal(cohortEvent(null), null);
  assert.equal(cohortEvent({ first: Date.UTC(2026, 9, 16), last: Date.UTC(2026, 9, 21) }), 'cohort/2026-W42');
});

test("the save's play is the first and last answers across this device's codex and its paired devices', leaving out a clock far ahead", () => {
  const now = Date.UTC(2026, 9, 21, 12);
  const entry = (first: number, last: number) => ({ seen: 1, first, last, name: { n: 1, ok: 1 }, art: { n: 0, ok: 0 }, mixed: {} });
  const codex = { ...emptyCodex(), items: { aaaaaaaaaaaa: entry(now - 5e8, now - 4e8), bbbbbbbbbbbb: entry(now - 3e8, now - 1e8), cccccccccccc: entry(now + 5 * 3_600_000, now + 5 * 3_600_000) } };
  assert.deepEqual(playedIn([codex], now), { first: now - 5e8, last: now - 1e8 });
  assert.equal(playedIn([null], now), null);
  assert.equal(playedIn([emptyCodex()], now), null);
  // A phone that never played, paired with the computer that did: the player's, not new; their first week the computer's.
  const phone = { ...emptyCodex(), items: { dddddddddddd: entry(now - 2e8, now - 2e7) } };
  assert.deepEqual(playedIn([null, codex], now), { first: now - 5e8, last: now - 1e8 });
  assert.deepEqual(playedIn([phone, codex], now), { first: now - 5e8, last: now - 2e7 });
  // One whose last answer came from a clock ahead (a copy's, combined with this device's) still counts its first.
  const ahead = { ...emptyCodex(), items: { eeeeeeeeeeee: entry(now - 9e8, now + 5 * 3_600_000) } };
  assert.deepEqual(playedIn([ahead], now), { first: now - 9e8, last: now - 9e8 });
});

test("only the game's own built scripts' errors count, and a module an update removed", () => {
  const assets = 'https://poe2.quest/assets/';
  assert.ok(ownScript('https://poe2.quest/assets/index-abc.js', assets));
  assert.ok(ownScript('TypeError: x\n    at f (https://poe2.quest/assets/game-1.js:1:2)', assets));
  // An extension's or a userscript's put into the page names the page, or itself.
  assert.ok(!ownScript('https://poe2.quest/', assets));
  assert.ok(!ownScript('chrome-extension://abc/content.js', assets));
  assert.ok(failedImport('Failed to fetch dynamically imported module: https://poe2.quest/assets/Codex-1.js'));
  assert.ok(failedImport('Importing a module script failed.'));
  assert.ok(!failedImport('Network error'));
});

test("a link's tag is its campaign only when it's a plain short word, so nothing else in an address goes along", () => {
  assert.equal(campaignOf('?ref=reddit-oct'), 'reddit-oct');
  assert.equal(campaignOf('?room=ABC123&ref=twitch_x'), 'twitch_x');
  assert.equal(campaignOf('?room=ABC123'), null);
  assert.equal(campaignOf(''), null);
  assert.equal(campaignOf('?ref=a%20b'), null);
  assert.equal(campaignOf('?ref=https://evil.example/'), null);
  assert.equal(campaignOf(`?ref=${'x'.repeat(41)}`), null);
});

test("a visit opened from the home screen counts as the app's: iOS's, Android's fullscreen, not a desktop's F11", () => {
  const env = (userAgent: string, modes: string[], standalone?: boolean) => ({ userAgent, standalone, matches: (q: string) => modes.some((m) => q === `(display-mode: ${m})`) });
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
  const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
  assert.ok(openedAsApp(env(android, ['fullscreen'])));
  assert.ok(openedAsApp(env('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', ['browser'], true)));
  assert.ok(openedAsApp(env(windows, ['standalone'])));
  assert.ok(!openedAsApp(env(windows, ['fullscreen'])));
  assert.ok(!openedAsApp(env(android, ['browser'])));
});

test('a week the game names is read back to its Monday, every day of five years, New Year included', () => {
  for (let ms = Date.UTC(2025, 0, 1); ms < Date.UTC(2030, 0, 1); ms += 86_400_000) {
    const week = isoWeek(ms);
    const monday = weekMonday(week);
    assert.ok(monday, week);
    const offset = (Date.parse(`${monday}T00:00:00Z`) - ms) / 86_400_000;
    // The day falls in the six days after its week's Monday, and the Monday is in that week.
    assert.ok(offset <= 0 && offset > -7, `${new Date(ms).toISOString()} ${week} ${monday}`);
    assert.equal(isoWeekOfDay(monday!), week);
  }
  // A week its year doesn't have: 2025 ends in week 52.
  assert.equal(weekMonday('2025-W53'), null);
  assert.equal(weekMonday('2026-W53'), '2026-12-28');
  assert.equal(weekMonday('2026-W00'), null);
});
