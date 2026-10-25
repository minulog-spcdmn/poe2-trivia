import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE_ENOUGH_MS, GIVE_UP_MS, RETRY_MS, errorOf, makeClock, serverTimeOf } from '../src/lib/clock.ts';

const HOUR = 3_600_000;
const T = Date.parse('2026-10-11T12:00:00Z');
const reply = (date: string | null, init: ResponseInit = {}) => new Response(null, { ...init, headers: date ? { date } : {} });
const at = (t: number) => reply(new Date(t).toUTCString());
/** Lets settled promises run on (setImmediate isn't among the timers mocked). */
const flush = () => new Promise((r) => setImmediate(r));

test("a plain reply from the site says the server's time; an error, a redirect or no header says nothing", () => {
  assert.equal(serverTimeOf(at(T)), T);
  assert.equal(serverTimeOf(reply(new Date(T).toUTCString(), { status: 404 })), null);
  assert.equal(serverTimeOf(reply(null)), null);
  assert.equal(serverTimeOf(reply('not a date')), null);
  // A login page in the way: followed to another address.
  const moved = at(T);
  Object.defineProperty(moved, 'redirected', { value: true });
  assert.equal(serverTimeOf(moved), null);
});

test("the device clock's error is taken halfway through the request, and a clock close enough is left alone", () => {
  // Ten hours slow, the reply 200 ms on the way and back.
  assert.equal(errorOf(T, T - 10 * HOUR - 100, T - 10 * HOUR + 100), 10 * HOUR + 500);
  assert.equal(errorOf(T, T - 100, T + 100), 0);
  assert.equal(errorOf(T, T + CLOSE_ENOUGH_MS - 1000, T + CLOSE_ENOUGH_MS - 1000), 0);
  assert.notEqual(errorOf(T, T - CLOSE_ENOUGH_MS - 1000, T - CLOSE_ENOUGH_MS - 1000), 0);
});

/**
 * A clock on a device whose own clock reads `dev.wall` (ten hours slow) and
 * whose steady clock reads `dev.steady`; the server answers with `answer`.
 */
function rig(answer: (signal: AbortSignal) => Promise<Response>) {
  const dev = { wall: T - 10 * HOUR, steady: 0, asked: 0, server: T };
  const clock = makeClock(
    (signal) => {
      dev.asked++;
      return answer(signal);
    },
    () => dev.wall,
    () => dev.steady,
  );
  /** Time passes for both of the device's clocks (and the server's). */
  const pass = (ms: number) => {
    dev.wall += ms;
    dev.steady += ms;
    dev.server += ms;
  };
  return { dev, clock, pass };
}

test("the time is the device's own until the server says, then the server's, and stays so as time passes", async () => {
  const { dev, clock, pass } = rig(async () => at(T));
  assert.equal(clock.now(), T - 10 * HOUR);
  assert.equal(clock.known(), false);
  await clock.sync();
  assert.equal(clock.known(), true);
  assert.equal(clock.trusted(), true);
  assert.ok(Math.abs(clock.now() - T) <= 1000);
  pass(HOUR);
  assert.ok(Math.abs(clock.now() - (T + HOUR)) <= 1000);
  assert.equal(dev.asked, 1);
});

test("no answer (offline, blocked, a request that can't be made) leaves the device's clock", async () => {
  for (const answer of [() => Promise.reject(new TypeError('offline')), () => { throw new Error('no document'); }, async () => reply(null, { status: 500 })]) {
    const { dev, clock } = rig(answer as () => Promise<Response>);
    await clock.sync();
    assert.equal(clock.known(), true);
    assert.equal(clock.trusted(), false);
    assert.equal(clock.now(), dev.wall);
  }
});

test('a request with no reply is given up, and asked again later', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  const { dev, clock } = rig((s) => {
    signal = s;
    return new Promise((_, fail) => s.addEventListener('abort', () => fail(new Error('aborted'))));
  });
  const synced = clock.sync();
  await flush();
  t.mock.timers.tick(GIVE_UP_MS - 1);
  assert.equal(signal?.aborted, false, 'not yet');
  t.mock.timers.tick(1);
  await synced;
  assert.equal(signal?.aborted, true);
  assert.equal(clock.known(), true);
  assert.equal(clock.trusted(), false);
  // Not again at once, but a minute on.
  assert.equal(clock.refresh(), undefined);
  dev.steady += RETRY_MS;
  dev.wall += RETRY_MS;
  assert.notEqual(clock.refresh(), undefined);
  await Promise.resolve();
  assert.equal(dev.asked, 2);
});

test('asked once at a time, and again only when the device clock jumps (set by hand, or the device slept)', async () => {
  const { dev, clock, pass } = rig(async () => at(dev.server));
  await Promise.all([clock.sync(), clock.sync(), clock.refresh()]);
  assert.equal(dev.asked, 1);
  // Time passing as it does: nothing to ask.
  pass(5 * HOUR);
  assert.equal(clock.refresh(), undefined);
  // Its clock set right meanwhile: the error known is wrong now, so the server's time doesn't hold until asked again.
  assert.ok(clock.sure());
  dev.wall += 10 * HOUR;
  assert.ok(clock.trusted() && !clock.sure());
  await clock.refresh();
  assert.ok(clock.sure());
  assert.equal(dev.asked, 2);
  assert.ok(Math.abs(clock.now() - dev.server) <= 1000);
  // Asleep for the night (its steady clock stood): asked again too.
  dev.wall += 8 * HOUR;
  dev.server += 8 * HOUR;
  await clock.refresh();
  assert.equal(dev.asked, 3);
  assert.ok(Math.abs(clock.now() - dev.server) <= 1000);
});

test('an answer waits for the server no longer than it is told', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { clock } = rig((s) => new Promise((_, fail) => s.addEventListener('abort', () => fail(new Error('aborted')))));
  let ready = false;
  void clock.ready(30).then(() => (ready = true));
  t.mock.timers.tick(29);
  await flush();
  assert.equal(ready, false);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(ready, true);
  assert.equal(clock.known(), false);
});
