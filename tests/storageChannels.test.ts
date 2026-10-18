// Whose keys lib/storage.ts reads and writes: each channel (live, beta,
// local) and each page apart from the game (the lab, the bot, the QA desk's
// frames and seats) starts its keys its own way, so none reaches another's
// saves; and only the live game itself reads or clears the keys it wrote
// before. Every build is set once, as its page loads, so each case runs in a
// process of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const LEGACY = 'poe2trivia.session.v3';

/** The page as a build sees it: its channel, the marks on its <html>, and its window's name. */
type Page = { channel?: 'live' | 'beta' | 'local'; marks?: Record<string, string>; windowName?: string };

/** What storage.ts makes of `page`: its keys' start, the desk room, and whether a key from before is read, and cleared. */
async function storageOn(page: Page): Promise<{ store: string; qaRoom: string | null; legacy: string | null; cleared: boolean }> {
  const child = `
    const page = JSON.parse(process.env.PAGE);
    const marks = page.marks ?? {};
    globalThis.document = { documentElement: { hasAttribute: (a) => a in marks, getAttribute: (a) => marks[a] ?? null } };
    if (page.windowName) globalThis.window = { name: page.windowName };
    const kept = new Map([[${JSON.stringify(LEGACY)}, 'old game']]);
    globalThis.localStorage = globalThis.sessionStorage = {
      getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v), removeItem: (k) => kept.delete(k),
    };
    await import(${JSON.stringify(new URL('./asVite.ts', import.meta.url).href)});
    const s = await import(${JSON.stringify(new URL('../src/lib/storage.ts', import.meta.url).href)});
    const legacy = s.readLegacy(${JSON.stringify(LEGACY)});
    s.removeLegacy(${JSON.stringify(LEGACY)});
    console.log(JSON.stringify({ store: s.STORE, qaRoom: s.QA_ROOM, legacy, cleared: !kept.has(${JSON.stringify(LEGACY)}) }));
  `;
  const env = { ...process.env, PAGE: JSON.stringify(page), VITE_CHANNEL: page.channel ?? '' };
  const { stdout } = await run(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', child], { env });
  return JSON.parse(stdout);
}

test("each channel's keys start its own way, and only the live game reads and clears the keys from before", async () => {
  const [live, beta, local] = await Promise.all([storageOn({ channel: 'live' }), storageOn({ channel: 'beta' }), storageOn({ channel: 'local' })]);
  assert.deepEqual(live, { store: 'poe2trivia.', qaRoom: null, legacy: 'old game', cleared: true });
  assert.deepEqual(beta, { store: 'poe2trivia.beta.', qaRoom: null, legacy: null, cleared: false });
  assert.deepEqual(local, { store: 'poe2trivia.local.', qaRoom: null, legacy: null, cleared: false });
});

test('pages apart from the game keep keys of their own, and leave the keys from before alone', async () => {
  const cases: [Page, string][] = [
    [{ marks: { 'data-lab': '' } }, 'poe2trivia.lab.'],
    [{ marks: { 'data-lab': '', 'data-zones': '' } }, 'poe2trivia.lab.zones.'],
    [{ marks: { 'data-backdrop-tool': '' } }, 'poe2trivia.backdrops.'],
    [{ marks: { 'data-bot': '' } }, 'poe2trivia.bot.'],
    [{ marks: { 'data-qa': 'desk' } }, 'poe2trivia.qa.desk.'],
    // A frame's slot keeps only what a key can hold.
    [{ marks: { 'data-qa': 'seat 2/../x' } }, 'poe2trivia.qa.seat2x.'],
    [{ channel: 'beta', marks: { 'data-lab': '' } }, 'poe2trivia.beta.lab.'],
  ];
  const got = await Promise.all(cases.map(([page]) => storageOn(page)));
  got.forEach((g, i) => {
    assert.equal(g.store, cases[i][1], JSON.stringify(cases[i][0]));
    assert.equal(g.legacy, null);
    assert.equal(g.cleared, false);
  });
});

test("a QA desk seat's window name counts on the beta and the dev server, never in the live game", async () => {
  const windowName = 'qa:room7:seat2';
  const [live, beta, local] = await Promise.all([
    storageOn({ channel: 'live', windowName }),
    storageOn({ channel: 'beta', windowName }),
    storageOn({ channel: 'local', windowName }),
  ]);
  assert.deepEqual([live.store, live.qaRoom, live.legacy], ['poe2trivia.', null, 'old game']);
  assert.deepEqual([beta.store, beta.qaRoom], ['poe2trivia.beta.qa.seat2.', 'room7']);
  assert.deepEqual([local.store, local.qaRoom], ['poe2trivia.local.qa.seat2.', 'room7']);
});
