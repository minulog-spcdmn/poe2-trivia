// The visitor counts' way round a blocker (src/lib/countRelay.ts): counts
// held and sent in batches, again when the network or a busy server turned
// one down, never once the server hasn't the path or the player opted out.
// Where count.ts sends them this way: countRoute.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GATHER_MS, MAX_RELAYED, RETRIES, Relay, hitOf, relayBody, type Posted } from '../src/lib/countRelay.ts';
import { COUNTER_ORIGIN } from '../src/lib/counter.ts';

/** A clock moved on by hand. */
function clock() {
  let at = 0;
  let next = 1;
  const timers = new Map<number, { at: number; f: () => void }>();
  return {
    set: (f: () => void, ms: number) => (timers.set(next, { at: at + ms, f }), next++),
    clear: (t: unknown) => void timers.delete(t as number),
    tick(ms: number) {
      at += ms;
      for (const [id, t] of [...timers]) if (t.at <= at) (timers.delete(id), t.f());
    },
  };
}

/** A relay whose batches are noted and answered as `statuses` say (204 once they're used up). */
function relay(statuses: Posted[] = [], allowed = () => true) {
  const c = clock();
  const sent: string[] = [];
  const r = new Relay(
    allowed,
    async (body) => (sent.push(body), statuses.length ? (statuses.shift() as Posted) : 204),
    c,
  );
  return { r, c, sent };
}
const settled = () => new Promise((r) => setImmediate(r));
const hit = (p: string) => ({ p, t: p, e: 'true' });

test("a count's parameters are those it would have gone to GoatCounter with, without the cache-buster", () => {
  const url = `${COUNTER_ORIGIN}/count?${new URLSearchParams({ p: 'play/race', t: 'play/race', e: 'true', ns: 'true', rnd: 'x1y2' })}`;
  assert.deepEqual(hitOf(url), { p: 'play/race', t: 'play/race', e: 'true', ns: 'true' });
});

test('counts gather for a few seconds and go as one batch; forty go at once', () => {
  const { r, c, sent } = relay();
  r.add(hit('play/race'));
  c.tick(GATHER_MS - 1);
  r.add(hit('size/race-2p'));
  assert.equal(sent.length, 0);
  c.tick(1);
  assert.deepEqual(sent, [relayBody([hit('play/race'), hit('size/race-2p')])]);
  for (let i = 0; i < MAX_RELAYED; i++) r.add(hit(`n/${i}`));
  assert.equal(sent.length, 2, 'a full batch at once');
  c.tick(GATHER_MS);
  assert.equal(sent.length, 2, 'nothing left to go');
});

test('a batch the network or a busy server turned down goes again with the next, as it was, twice more at most', async () => {
  const { r, sent } = relay([null, 429, 503]);
  r.add(hit('play/race'));
  r.send();
  await settled();
  r.send();
  await settled();
  r.send();
  await settled();
  r.send();
  await settled();
  assert.deepEqual(sent, Array(1 + RETRIES).fill(relayBody([hit('play/race')])));
  assert.deepEqual(r.size, { held: 0, turnedDown: 0 });
});

test('a server without the path (an older one, or one without the key) is let go of for good', async () => {
  const { r, c, sent } = relay([404]);
  r.add(hit('play/race'));
  r.send();
  await settled();
  r.add(hit('end/race'));
  c.tick(GATHER_MS);
  r.send();
  assert.equal(sent.length, 1);
  assert.deepEqual(r.size, { held: 0, turnedDown: 0 });
});

test('nothing goes once the player has opted out, what was held and turned down included', async () => {
  let out = false;
  const { r, c, sent } = relay([null], () => !out);
  r.add(hit('play/race'));
  r.send();
  await settled();
  r.add(hit('end/race'));
  out = true;
  c.tick(GATHER_MS);
  r.send();
  assert.equal(sent.length, 1);
  assert.deepEqual(r.size, { held: 0, turnedDown: 0 });
});
