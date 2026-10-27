// The notice stack (lib/toasts.svelte.ts) and how achievements are announced
// in it (lib/achievementToasts.ts): a notice repeated restarts the one up
// rather than stacking, the oldest give way past the most shown, a notice
// held under the pointer keeps the time it had left, and what one moment
// earns comes as one burst a little after it.
import './asVite.ts';
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

mock.timers.enable({ apis: ['setTimeout', 'Date'] });
const { toasts } = await import('../src/lib/toasts.svelte.ts');
const { announceAchievements, payOwed } = await import('../src/lib/achievementToasts.ts');
const { ACHIEVEMENTS } = await import('../src/lib/achievements.ts');

const INFO_MS = 5600;
const DELAY_MS = 1400;
const messages = () => toasts.list.map((t) => t.message);

beforeEach(() => {
  for (const t of [...toasts.list]) toasts.dismiss(t.id);
  toasts.setMax(6);
  // Whatever an earlier test left owing, and any burst still waiting.
  payOwed();
  mock.timers.tick(DELAY_MS);
  for (const t of [...toasts.list]) toasts.dismiss(t.id);
});

test('the same notice again restarts the one up instead of stacking a copy', () => {
  const first = toasts.show('Not your turn', 'warn', { title: 'Refused' });
  mock.timers.tick(5000);
  const again = toasts.show('Not your turn', 'warn', { title: 'Refused' });
  assert.notEqual(again, first);
  assert.deepEqual(messages(), ['Not your turn']);
  // Its time starts over: a warning's 7.5 s from the repeat, not from the first.
  mock.timers.tick(7499);
  assert.deepEqual(messages(), ['Not your turn']);
  mock.timers.tick(1);
  assert.deepEqual(messages(), []);
});

test("notices that differ in kind, title or whom they're about each stand", () => {
  toasts.show('Ash', 'info', { title: 'Player joined', who: { name: 'Ash', hue: 1 } });
  toasts.show('Ash', 'info', { title: 'Player left', who: { name: 'Ash', hue: 1 } });
  toasts.show('Ash', 'warn', { title: 'Player left', who: { name: 'Ash', hue: 1 } });
  toasts.show('Ash', 'info', { title: 'Player joined', who: { name: 'Bo', hue: 2 } });
  assert.equal(toasts.list.length, 4);
});

test('past the most shown, the oldest give way and the newest stay', () => {
  toasts.setMax(3);
  for (const n of [1, 2, 3, 4, 5]) toasts.show(`notice ${n}`);
  assert.deepEqual(messages(), ['notice 3', 'notice 4', 'notice 5']);
  // Fewer allowed: the stack is cut down at once.
  toasts.setMax(1);
  assert.deepEqual(messages(), ['notice 5']);
  // The ones that gave way are gone for good; their timers don't touch the one left.
  mock.timers.tick(INFO_MS - 1);
  assert.deepEqual(messages(), ['notice 5']);
});

test('none allowed still keeps the newest: a sticky reason shown then stays', () => {
  toasts.show('Spectator joined');
  toasts.setMax(0);
  toasts.show('No room has the code ABCD.', 'error', { title: 'No such room', sticky: true });
  assert.deepEqual(messages(), ['No room has the code ABCD.']);
  mock.timers.tick(60_000);
  assert.deepEqual(messages(), ['No room has the code ABCD.']);
});

test('news after a sticky reason gives way to it, where only one is shown', () => {
  // A phone on its side: a failed join's reason, then the start page's news.
  toasts.setMax(1);
  toasts.show('Couldn’t connect to the matchmaking server.', 'error', { title: 'No connection', sticky: true });
  toasts.show('1 earned in your past games.', 'info', { title: 'Achievements' });
  assert.deepEqual(messages(), ['Couldn’t connect to the matchmaking server.']);
  // A second reason still takes the first one's place.
  toasts.show('No room has the code ABCD.', 'error', { title: 'No such room', sticky: true });
  assert.deepEqual(messages(), ['No room has the code ABCD.']);
});

test('a notice held under the pointer keeps the time it had left, however long it is held', () => {
  const id = toasts.show('Room closed');
  mock.timers.tick(2000);
  toasts.hold(id);
  mock.timers.tick(60_000);
  assert.deepEqual(messages(), ['Room closed']);
  assert.equal(toasts.list[0].held, true);
  toasts.release(id);
  mock.timers.tick(INFO_MS - 2000 - 1);
  assert.deepEqual(messages(), ['Room closed']);
  mock.timers.tick(1);
  assert.deepEqual(messages(), []);
});

test('a sticky notice stays until closed, and clearing the errors takes down only errors', () => {
  toasts.show('You were removed from the room.', 'error', { sticky: true });
  toasts.show('Could not join', 'error');
  toasts.show('Ash joined');
  mock.timers.tick(60_000);
  assert.deepEqual(messages(), ['You were removed from the room.']);
  toasts.show('Ash joined');
  toasts.clearErrors();
  assert.deepEqual(messages(), ['Ash joined']);
});

const byTier = (tier: number) => ACHIEVEMENTS.filter((a) => a.tier === tier);
const [low, low2, low3] = byTier(0);
const [high] = byTier(3);

test('what a moment earns is announced a little after it, a notice each, an achievement once however often it came', () => {
  announceAchievements({ earned: [low], first: false }, 'game');
  announceAchievements({ earned: [low, low2], first: false }, 'game');
  assert.deepEqual(messages(), [], 'not with the moment itself');
  mock.timers.tick(DELAY_MS);
  assert.deepEqual(messages(), [low.title, low2.title]);
  assert.ok(toasts.list.every((t) => t.title === 'Achievement earned'));
  assert.deepEqual(toasts.list[0].seal, { sign: low.sign, tier: low.tier });
});

test('more than two at once come as one notice naming them all, under the hardest one’s seal', () => {
  announceAchievements({ earned: [low, high, low2, low3], first: false }, 'game');
  mock.timers.tick(DELAY_MS);
  assert.equal(toasts.list.length, 1);
  const [t] = toasts.list;
  assert.equal(t.title, '4 achievements earned');
  assert.equal(t.message, [low, high, low2, low3].map((a) => a.title).join(' • '));
  assert.deepEqual(t.seal, { sign: high.sign, tier: high.tier });
});

test('the quiet first check is told on the start page: at once there, owed from a game, never from the codex', () => {
  announceAchievements({ earned: [low, high], first: true }, 'start');
  assert.deepEqual(messages(), ['2 earned in your past games. See them in the Codex.']);
  assert.deepEqual(toasts.list[0].seal, { sign: high.sign, tier: high.tier });
  toasts.dismiss(toasts.list[0].id);

  announceAchievements({ earned: [low, low2, low3], first: true }, 'game');
  mock.timers.tick(DELAY_MS);
  assert.deepEqual(messages(), [], 'not in the game');
  payOwed();
  assert.deepEqual(messages(), ['3 earned in your past games. See them in the Codex.']);
  payOwed();
  assert.equal(toasts.list.length, 1, 'told once');
  toasts.dismiss(toasts.list[0].id);

  announceAchievements({ earned: [low], first: true }, 'codex');
  mock.timers.tick(DELAY_MS);
  payOwed();
  assert.deepEqual(messages(), []);
});

test('a moment that came with a quiet first check announces its own, and the past ones as owed', () => {
  announceAchievements({ earned: [high], first: false, past: [low, low2] }, 'game');
  mock.timers.tick(DELAY_MS);
  assert.deepEqual(messages(), [high.title]);
  payOwed();
  assert.deepEqual(messages(), [high.title, '2 earned in your past games. See them in the Codex.']);
});
