// The item tally (lib/itemTally.ts) in a browser at the live game's address
// (globals set before count.ts loads, as `counting` is settled then): what
// the codex takes in goes out as one message to the matchmaking server's
// /tally, as a game or run ends, as the page is hidden or left, or once
// forty are held, a batch the server was too busy for going again with the
// next, as it was; nothing from a browser that opted out, those held before
// included. Loaded and started once, by whichever part of the page asks
// first (tallyLoader.ts).
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import './asVite.ts';
import { items, memoryStorage } from './helpers.ts';

const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
const held = new Map<string, string>();
let visibility = 'visible';
const onDocument = new Map<string, () => void>();
const onPage = new Map<string, () => void>();
set('location', { hostname: 'poe2.quest', pathname: '/', href: 'https://poe2.quest/', hash: '', search: '' });
set('navigator', { webdriver: false, sendBeacon: () => true });
set('document', {
  get visibilityState() {
    return visibility;
  },
  referrer: '',
  title: 'PoE2.Quest',
  documentElement: { hasAttribute: () => false },
  addEventListener: (type: string, fn: () => void) => void onDocument.set(type, fn),
  removeEventListener: () => {},
});
/** How often each of the page's events was listened for. */
const listened = new Map<string, number>();
set('addEventListener', (type: string, fn: () => void) => {
  onPage.set(type, fn);
  listened.set(type, (listened.get(type) ?? 0) + 1);
});
set('removeEventListener', () => {});
set('localStorage', memoryStorage(held));
const sent: { url: string; init: RequestInit }[] = [];
/** What the server answers next (204 once these run out). */
const statuses: number[] = [];
set('fetch', async (url: string, init: RequestInit) => (sent.push({ url, init }), new Response(null, { status: statuses.shift() ?? 204 })));
mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });

const { recordEncounter, recordWhenCalm } = await import('../src/lib/codex.ts');
const itemTally = await import('../src/lib/itemTally.ts');
const { MAX_BATCH, TALLY_URL, TALLY_VERSION, notePractice, sendTally, startTally } = itemTally;
const { loadTally, tallyAsked } = await import('../src/lib/tallyLoader.ts');
/** The page's pagehide listeners before the tally was loaded. */
let before = 0;
const { counting } = await import('../src/lib/count.ts');
const { setCountOptedOut } = await import('../src/lib/countOptOut.ts');
const { OWN_SIGNAL_HOST } = await import('../src/lib/signalHost.ts');
type Encounter = Parameters<typeof recordEncounter>[0];

const [a, b] = items;
let at = 1;
const answer = (itemId: string, depth: number, ok: boolean): Encounter => ({
  at: at++,
  itemId,
  mode: 'name',
  difficulty: 'merciless',
  race: false,
  delve: { depth, run: 500 },
  answer: { ok, pickedId: null, pickedLabel: null },
});
const bodies = () => sent.map((s) => JSON.parse(String(s.init.body)));
/** What each message carried but its batch id (16 random hex characters, checked here). */
const batches = () =>
  bodies().map(({ id, ...rest }) => {
    assert.match(id, /^[0-9a-f]{16}$/);
    return rest;
  });

beforeEach(() => {
  sent.length = 0;
  setCountOptedOut(false);
});

test('the loader loads and starts the tally once, however many parts of the page ask', async () => {
  assert.equal(counting, true, 'the live game’s page counts');
  assert.equal(tallyAsked(), null, 'nothing loaded before it’s asked for');
  // (Others on the page listen for it too.)
  before = listened.get('pagehide') ?? 0;
  const first = loadTally();
  assert.equal(loadTally(), first, 'one load for all who ask');
  assert.equal(tallyAsked(), first);
  assert.equal(await first, itemTally);
  assert.equal(await loadTally(), itemTally);
  assert.equal(listened.get('pagehide'), before + 1, 'started once');
});

test('what the codex takes in goes out as one message when sent, to the matchmaking server’s own host', () => {
  startTally();
  startTally();
  assert.equal(listened.get('pagehide'), before + 1, 'started once still');
  recordEncounter(answer(a.id, 3, false));
  recordEncounter(answer(a.id, 12, true));
  recordEncounter(answer(b.id, 40, true));
  assert.equal(sent.length, 0, 'held');
  sendTally();
  assert.equal(sent.length, 1);
  assert.equal(TALLY_URL, `https://${OWN_SIGNAL_HOST}/tally`);
  assert.equal(sent[0].url, TALLY_URL);
  assert.equal(sent[0].init.method, 'POST');
  assert.equal(sent[0].init.keepalive, true);
  assert.equal(new Headers(sent[0].init.headers).get('Content-Type'), 'text/plain', 'no preflight');
  assert.deepEqual(batches(), [
    {
      v: TALLY_VERSION,
      a: [
        [a.id, 'n', 'd1', 1, 'w'],
        [a.id, 'n', 'd2', 0, 'r'],
        [b.id, 'n', 'd4', 1, 'r'],
      ],
    },
  ]);
});

test('sent as the page is hidden or left, and once forty are held', () => {
  recordEncounter(answer(a.id, 5, true));
  visibility = 'visible';
  onDocument.get('visibilitychange')!();
  assert.equal(sent.length, 0, 'not while seen');
  visibility = 'hidden';
  onDocument.get('visibilitychange')!();
  assert.equal(sent.length, 1);
  recordEncounter(answer(a.id, 5, true));
  onPage.get('pagehide')!();
  assert.equal(sent.length, 2);
  for (let i = 0; i < MAX_BATCH; i++) recordEncounter(answer(b.id, 20, false));
  assert.equal(sent.length, 3);
  assert.equal(bodies()[2].a.length, MAX_BATCH);
});

test('nothing goes from a browser that opted out, not even what was held before it did', () => {
  recordEncounter(answer(a.id, 5, true));
  setCountOptedOut(true);
  sendTally();
  recordEncounter(answer(a.id, 6, true));
  onPage.get('pagehide')!();
  assert.equal(sent.length, 0);
  setCountOptedOut(false);
  sendTally();
  assert.equal(sent.length, 0, 'what was held is gone');
});

test('practice goes too; a batch the server was busy for goes again with the next, as it was, one it refused doesn’t', async () => {
  notePractice(a.id, 'art', false);
  statuses.push(503);
  sendTally();
  await new Promise((done) => setImmediate(done));
  recordEncounter(answer(b.id, 1, true));
  statuses.push(400);
  sendTally();
  await new Promise((done) => setImmediate(done));
  sendTally();
  assert.deepEqual(
    batches().map((x) => x.a),
    [[[a.id, 'a', 'practice', 0, 'w']], [[a.id, 'a', 'practice', 0, 'w']], [[b.id, 'n', 'd1', 0, 'r']]],
  );
  assert.equal(sent[1].init.body, sent[0].init.body, 'its id and all');
  assert.notEqual(bodies()[2].id, bodies()[0].id, 'the new answer a batch of its own');
});

// (Last: the first wait for calm has lib/idle.ts listen too, in place of the tally's here.)
test('an answer still waiting for calm goes as the page is left, whichever listener comes first', () => {
  const away = onPage.get('pagehide')!;
  recordWhenCalm(answer(b.id, 7, false));
  away();
  assert.deepEqual(
    bodies().map((x) => x.a),
    [[[b.id, 'n', 'd1', 0, 'w']]],
  );
});
