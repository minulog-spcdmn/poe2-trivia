// count.ts in a browser at the live game's address (globals set before it
// loads, as `counting` is settled then): with the privacy page's opt-out set,
// nothing goes out, the counts held for an unseen page included.
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

const sent: string[] = [];
const held = new Map<string, string>();
let visibility = 'hidden';
const listeners: (() => void)[] = [];
const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
set('location', { hostname: 'poe2.quest', pathname: '/', href: 'https://poe2.quest/' });
set('navigator', { webdriver: false, sendBeacon: (url: string) => (sent.push(url), true) });
set('document', {
  get visibilityState() {
    return visibility;
  },
  referrer: '',
  title: 'PoE2.Quest',
  documentElement: { hasAttribute: () => false },
  addEventListener: (_: string, fn: () => void) => listeners.push(fn),
  removeEventListener: () => {},
});
set('localStorage', { getItem: (k: string) => held.get(k) ?? null, setItem: (k: string, v: string) => void held.set(k, v), removeItem: (k: string) => void held.delete(k) });

const { countEvent } = await import('../src/lib/count.ts');
const { setCountOptedOut } = await import('../src/lib/countOptOut.ts');

/** The page comes into view (count.ts holds its counts until it has been). */
const show = () => {
  visibility = 'visible';
  for (const fn of listeners) fn();
};
beforeEach(() => {
  sent.length = 0;
  setCountOptedOut(false);
});

test('counts held while unseen are dropped if the opt-out was set meanwhile', () => {
  // (First: count.ts was loaded with the page unseen.)
  countEvent('play/race-online');
  assert.equal(sent.length, 0);
  setCountOptedOut(true);
  show();
  assert.equal(sent.length, 0);
});

test('counts held while unseen go out once the page is seen, when not opted out', async () => {
  visibility = 'hidden';
  // A page of its own, loaded unseen.
  const { countEvent: count } = await import('../src/lib/count.ts?unseen');
  count('play/race-online');
  assert.equal(sent.length, 0, 'held');
  show();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /p=play%2Frace-online/);
});

test('nothing is sent while the browser sends Global Privacy Control', () => {
  show();
  const nav = globalThis.navigator as unknown as { globalPrivacyControl?: boolean };
  nav.globalPrivacyControl = true;
  countEvent('play/race-online');
  delete nav.globalPrivacyControl;
  assert.equal(sent.length, 0);
});

test('nothing is sent while opted out, and counting resumes once taken back', () => {
  show();
  setCountOptedOut(true);
  countEvent('play/race-online');
  assert.equal(sent.length, 0);
  setCountOptedOut(false);
  countEvent('play/race-online');
  assert.equal(sent.length, 1);
  assert.match(sent[0], /p=play%2Frace-online/);
});
