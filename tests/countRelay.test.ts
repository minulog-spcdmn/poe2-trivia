// The visitor counts' way round a blocker (src/lib/countRelay.ts): counts
// held and sent in batches, again when the network or a busy server turned
// one down, given up on once the server hasn't the path or a batch was turned
// down too often (handing back what never left), never once the player opted
// out. Where count.ts sends them this way: countRoute.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GATHER_MS, MAX_RELAYED, RETRIES, Relay, hitOf, relayBody, type Hit, type Posted } from '../src/lib/countRelay.ts';
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

/** A relay whose batches are noted and answered as `statuses` say (204 once they're used up), and what it handed back each time it gave up. */
function relay(statuses: Posted[] = [], allowed = () => true) {
  const c = clock();
  const sent: string[] = [];
  const back: Hit[][] = [];
  const r = new Relay(
    allowed,
    async (body) => (sent.push(body), statuses.length ? (statuses.shift() as Posted) : 204),
    c,
    (h) => back.push(h),
  );
  return { r, c, sent, back };
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

test('a batch the network or a busy server turned down goes again with the next, as it was, twice more at most, then the relay gives up', async () => {
  const { r, c, sent, back } = relay([null, 429, 503]);
  r.add(hit('play/race'));
  r.send();
  await settled();
  r.send();
  await settled();
  r.add(hit('end/race'));
  r.send();
  await settled();
  r.add(hit('screen/race'));
  r.send();
  await settled();
  assert.deepEqual(sent.slice(0, 2), Array(2).fill(relayBody([hit('play/race')])));
  assert.equal(sent[2], relayBody([hit('play/race')]), 'its last time, ahead of the one counted since');
  assert.equal(sent.length, 4);
  // (Its last answer in after what was counted since had gone: that one taken, nothing left to hand back.)
  assert.deepEqual(back, [[]], 'given up; it may have got there');
  r.add(hit('end/race'));
  c.tick(GATHER_MS);
  r.send();
  assert.equal(sent.length, 4, 'nothing more goes');
});

test('a batch turned down as it is (400, 413) never goes again, and the relay goes on', async () => {
  const { r, sent, back } = relay([400, 413]);
  r.add(hit('play/race'));
  r.send();
  await settled();
  r.add(hit('end/race'));
  r.send();
  await settled();
  r.add(hit('screen/race'));
  r.send();
  await settled();
  assert.deepEqual(sent, [relayBody([hit('play/race')]), relayBody([hit('end/race')]), relayBody([hit('screen/race')])]);
  assert.deepEqual(back, []);
});

test('a server without the path (an older one, or one without the key) is let go of for good, what never left handed back', async () => {
  const { r, c, sent, back } = relay([404]);
  r.add(hit('play/race'));
  r.send();
  r.add(hit('end/race'));
  await settled();
  assert.deepEqual(back, [[hit('play/race'), hit('end/race')]], 'the batch turned away, and the one waiting');
  r.add(hit('screen/race'));
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

test('a relay given up on once the player has opted out hands back nothing', async () => {
  let out = false;
  const { r, back } = relay([404], () => !out);
  r.add(hit('play/race'));
  r.send();
  out = true;
  await settled();
  assert.deepEqual(back, [[]]);
});

test('a second batch on its way as the server is found without the path is handed back too', async () => {
  // (One turned down before, sent again with a new one: both turned away.)
  const { r, back } = relay([null, 404, 404]);
  r.add(hit('play/race'));
  r.send();
  await settled();
  r.add(hit('end/race'));
  r.send();
  await settled();
  assert.deepEqual(back.flat(), [hit('play/race'), hit('end/race')]);
});
