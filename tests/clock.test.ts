import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASK_AGAIN_MS, CLOSE_ENOUGH_MS, errorOf, makeClock, serverTimeOf } from '../src/lib/clock.ts';

const HOUR = 3_600_000;
const T = Date.parse('2026-10-11T12:00:00Z');
const reply = (date: string | null, init: ResponseInit = {}) => new Response(null, { ...init, headers: date ? { date } : {} });

test("a plain reply from the site says the server's time; an error, a redirect or no header says nothing", () => {
  assert.equal(serverTimeOf(reply(new Date(T).toUTCString())), T);
  assert.equal(serverTimeOf(reply(new Date(T).toUTCString(), { status: 404 })), null);
  assert.equal(serverTimeOf(reply(null)), null);
  assert.equal(serverTimeOf(reply('not a date')), null);
  // A login page in the way: followed to another address.
  const moved = reply(new Date(T).toUTCString());
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

/** A clock whose device time is `dev.t` and whose server answers with `answer`. */
function rig(answer: () => Promise<Response>) {
  const dev = { t: T - 10 * HOUR, asked: 0 };
  const clock = makeClock(() => {
    dev.asked++;
    return answer();
  }, () => dev.t);
  return { dev, clock };
}

test("the time is the device's own until the server says, then the server's, and stays so as the device's moves", async () => {
  const { dev, clock } = rig(async () => reply(new Date(T).toUTCString()));
  assert.equal(clock.now(), T - 10 * HOUR);
  assert.equal(clock.known(), false);
  await clock.sync();
  assert.equal(clock.known(), true);
  assert.ok(Math.abs(clock.now() - T) <= 1000);
  dev.t += HOUR;
  assert.ok(Math.abs(clock.now() - (T + HOUR)) <= 1000);
});

test("no answer (offline, blocked, a request that can't be made) leaves the device's clock", async () => {
  for (const answer of [() => Promise.reject(new TypeError('offline')), () => { throw new Error('no document'); }, async () => reply(null, { status: 500 })]) {
    const { dev, clock } = rig(answer as () => Promise<Response>);
    await clock.sync();
    assert.equal(clock.known(), true);
    assert.equal(clock.now(), dev.t);
  }
});

test('asked once at a time, and again only once the answer is old', async () => {
  const { dev, clock } = rig(async () => reply(new Date(T).toUTCString()));
  await Promise.all([clock.sync(), clock.sync()]);
  assert.equal(dev.asked, 1);
  assert.equal(clock.syncIfOld(), undefined);
  dev.t += ASK_AGAIN_MS;
  await clock.syncIfOld();
  assert.equal(dev.asked, 2);
  // The device's clock set back a day: old too.
  dev.t -= 24 * HOUR;
  await clock.syncIfOld();
  assert.equal(dev.asked, 3);
});

test('an answer waits for the server no longer than it is told', async () => {
  const { clock } = rig(() => new Promise<Response>(() => {}));
  const t0 = performance.now();
  await clock.ready(30);
  assert.ok(performance.now() - t0 < 1000);
  assert.equal(clock.known(), false);
});
