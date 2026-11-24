import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countOptedOut, setCountOptedOut } from '../src/lib/countOptOut.ts';

test("the privacy page's opt-out is kept in this browser, and taken back", () => {
  const held = new Map<string, string>();
  const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => held.get(k) ?? null, setItem: (k: string, v: string) => void held.set(k, v), removeItem: (k: string) => void held.delete(k) },
  });
  try {
    assert.equal(countOptedOut(), false);
    assert.ok(setCountOptedOut(true));
    assert.equal(countOptedOut(), true);
    assert.deepEqual([...held.keys()], ['poe2trivia-shared.noCount']);
    assert.ok(setCountOptedOut(false));
    assert.equal(countOptedOut(), false);
    assert.equal(held.size, 0);
  } finally {
    if (was) Object.defineProperty(globalThis, 'localStorage', was);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('without storage nobody is taken for opted out, and setting it says it failed', () => {
  const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('blocked');
    },
  });
  try {
    assert.equal(countOptedOut(), false);
    assert.equal(setCountOptedOut(true), false);
  } finally {
    if (was) Object.defineProperty(globalThis, 'localStorage', was);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test("the privacy page's switch says where it stands, in both languages", async () => {
  const { switchText } = await import('../src/lib/countOptOut.ts');
  for (const lang of ['de', 'en'] as const) {
    const on = switchText(lang, { out: false, failed: false });
    const off = switchText(lang, { out: true, failed: false });
    const failed = switchText(lang, { out: false, failed: true });
    assert.notEqual(on.state, off.state);
    assert.ok(on.button && off.button && on.button !== off.button);
    assert.notEqual(failed.state, on.state);
    assert.equal(failed.button, on.button);
  }
  assert.equal(switchText('de', { out: false, failed: false }).button, 'Zählung abschalten');
  assert.equal(switchText('en', { out: true, failed: false }).button, 'Count again');
});

test("only an iOS home-screen app opens the privacy page over the game", async () => {
  const { installedApp } = await import('../src/lib/installedApp.ts');
  assert.equal(installedApp({ standalone: true } as unknown as Navigator), true);
  assert.equal(installedApp({ standalone: false } as unknown as Navigator), false);
  assert.equal(installedApp({} as Navigator), false);
  assert.equal(installedApp(undefined), false);
});

test('an opt-out kept where #toggle-goatcounter used to keep it still holds, and is cleared with the new one', () => {
  const held = new Map<string, string>([['poe2trivia.skipCount', 't']]);
  const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => held.get(k) ?? null, setItem: (k: string, v: string) => void held.set(k, v), removeItem: (k: string) => void held.delete(k) },
  });
  try {
    assert.equal(countOptedOut(), true);
    assert.ok(setCountOptedOut(false));
    assert.equal(countOptedOut(), false);
    assert.equal(held.size, 0);
  } finally {
    if (was) Object.defineProperty(globalThis, 'localStorage', was);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
