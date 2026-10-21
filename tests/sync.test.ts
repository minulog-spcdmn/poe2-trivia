import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { codeInHash, codeKey, codeLink, newCode, peerName, prove, proves, readCode, shownCode } from '../src/lib/sync/code.ts';
import { ALIGN, DOT, EYE, qrMarks } from '../src/lib/sync/qr.ts';
import {
  KEEP_DEVICES,
  UNMET_MS,
  clearCopies,
  copiesOf,
  deviceId,
  homeOnMeeting,
  keepCopy,
  lapsed,
  loadPairing,
  meeting,
  pairingAfterUnpair,
  pairingAnew,
  pairingNow,
  pairingTaking,
  readCopies,
  savePairing,
} from '../src/lib/sync/store.ts';
import { ownNow, takeIn, takenNow } from '../src/lib/sync/shared.ts';
import { combineCodex, emptyCodex, loadCodex, loadPractice, parseCodex, recordEncounter, recordPractice, serializeCodex, type Codex } from '../src/lib/codex.ts';
import { DELVE_RECORD_KEY, addRun, bestOf, combineRecords, emptyRecords, loadRecords, recordRun, serializeRecords, tallyOf, type DelveRun } from '../src/lib/delveRecord.ts';
import { ACHIEVEMENTS, ACHIEVEMENTS_KEY, WINS_KEY, absorbAchievements, absorbWins, loadAchievements, loadWins, serializeStore, serializeWins } from '../src/lib/achievements.ts';
import { SIGILS_KEY, absorbSigils, loadSigils, serializeSigils } from '../src/lib/sigils.ts';
import { DAILY_KEY, absorbDaily, loadDaily } from '../src/lib/daily.ts';
import { DELVE_RULESET } from '../src/lib/delve.ts';
import { storeKey } from '../src/lib/storage.ts';
import { memoryStorage } from './helpers.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);
// (The copies' cache hears of them going as clearCopies lets go of them, not of the store emptied under it.)
beforeEach(() => {
  clearCopies();
  store.clear();
});

const ITEM = 'aaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbb';
const PHONE = 'phone0000001';
const TABLET = 'tablet000001';

// ---- the code ----------------------------------------------------------------------

test('a code is sixteen of Crockford base32, read back however it is typed', () => {
  const code = newCode();
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{16}$/);
  assert.notEqual(newCode(), code);
  assert.equal(shownCode('K7QXM2PA9FHE3TDW'), 'K7QX-M2PA-9FHE-3TDW');
  assert.equal(readCode(' k7qx-m2pa 9fhe-3tdw '), 'K7QXM2PA9FHE3TDW');
  // O for 0, I and L for 1: none of them is in the code.
  assert.equal(readCode('O0IL-0000-0000-0000'), '0011000000000000');
  assert.equal(readCode('K7QX-M2PA-9FHE-3TD'), null);
  assert.equal(readCode('K7QX-M2PA-9FHE-3TDU'), null);
});

test("a pairing link holds the code after its hash, the site's address before it", () => {
  const link = codeLink('K7QXM2PA9FHE3TDW', 'https://poe2.quest/beta/?x=1#settings');
  assert.equal(link, 'https://poe2.quest/beta/#sync=K7QX-M2PA-9FHE-3TDW');
  assert.equal(codeInHash(new URL(link).hash), 'K7QXM2PA9FHE3TDW');
  assert.equal(codeInHash('#settings'), null);
  assert.equal(codeInHash('#sync=nope'), null);
});

test('the meeting name and the proof key come from the code, and give it away to nobody', async () => {
  const a = 'K7QXM2PA9FHE3TDW';
  const b = 'K7QXM2PA9FHE3TDX';
  const name = await peerName(a);
  assert.match(name, /^[0-9a-z]{20}$/);
  assert.equal(await peerName(a), name);
  assert.notEqual(await peerName(b), name);
  assert.ok(!name.includes(a.toLowerCase().slice(0, 6)));
  const proof = await prove(await codeKey(a), 'h|1|2');
  assert.ok(await proves(await codeKey(a), 'h|1|2', proof));
  assert.ok(!(await proves(await codeKey(a), 'g|1|2', proof)), 'not for another challenge');
  assert.ok(!(await proves(await codeKey(b), 'h|1|2', proof)), 'not under another code');
  assert.ok(!(await proves(await codeKey(a), 'h|1|2', 42)));
});

test('the QR code drawn reads back as the link, its seal and all, with the reader the camera uses where the browser has none', () => {
  for (const [site, px] of [['https://poe2.quest/', 3], ['https://poe2.quest/beta/', 6], ['http://localhost:5207/', 11]] as const) {
    const link = codeLink(newCode(), site);
    const { size, dots, eyes, aligns, heart } = qrMarks(link);
    assert.ok(heart, `a seal at the heart of ${site}'s code`);
    // As drawn, at 3, 6 and 11 px a module: ink dots and rounded eyes on the gilded field, the heart left bare for the seal.
    const w = size * px;
    const rgba = new Uint8ClampedArray(w * w * 4).fill(255);
    const ink = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      rgba[i] = 40;
      rgba[i + 1] = 28;
      rgba[i + 2] = 14;
    };
    /** Inside a rounded square at (x, y) (in modules), `s` across with corners of radius `r`. */
    const inRound = (u: number, v: number, x: number, y: number, s: number, r: number) => {
      const dx = Math.max(x + r - u, 0, u - (x + s - r));
      const dy = Math.max(y + r - v, 0, v - (y + s - r));
      return u >= x && u <= x + s && v >= y && v <= y + s && Math.hypot(dx, dy) <= r;
    };
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / px;
        const v = (y + 0.5) / px;
        for (const [eye, at] of [...eyes.map((e) => [EYE, e] as const), ...aligns.map((e) => [ALIGN, e] as const)]) {
          const on = (e: readonly [number, number, number]) => inRound(u, v, at[0] + e[0], at[1] + e[0], e[1], e[2]);
          if ((on(eye.out) && !on(eye.in)) || on(eye.pupil)) ink(x, y);
        }
      }
    for (const [mx, my] of dots)
      for (let y = my * px; y < (my + 1) * px; y++)
        for (let x = mx * px; x < (mx + 1) * px; x++) if (Math.hypot((x + 0.5) / px - mx - 0.5, (y + 0.5) / px - my - 0.5) <= DOT) ink(x, y);
    assert.equal(jsQR(rgba, w, w)?.data, link, site);
  }
});

// ---- what is kept ------------------------------------------------------------------

test('copies are kept for the devices heard from last, a few at most', () => {
  for (let i = 0; i < KEEP_DEVICES + 3; i++) keepCopy('practice', `dev${String(i).padStart(9, '0')}`, { at: 100 + i, raw: 'x' });
  const kept = readCopies('practice');
  assert.equal(Object.keys(kept).length, KEEP_DEVICES);
  assert.ok(!kept['dev000000000'], 'the one heard from longest ago goes');
  assert.ok(kept[`dev${String(KEEP_DEVICES + 2).padStart(9, '0')}`]);
});

test('a pairing that met nobody keeps when it was made, and the code it came from', () => {
  savePairing({ code: 'K7QXM2PA9FHE3TDW', met: false, at: 5, home: 'AAAABBBBCCCCDDDD' });
  assert.deepEqual(loadPairing(), { code: 'K7QXM2PA9FHE3TDW', met: false, at: 5, home: 'AAAABBBBCCCCDDDD' });
  savePairing({ code: 'K7QXM2PA9FHE3TDW', met: true });
  assert.deepEqual(loadPairing(), { code: 'K7QXM2PA9FHE3TDW', met: true });
});

// ---- who goes where ----------------------------------------------------------------

const HOME = 'AAAABBBBCCCCDDDD';
const NEW = 'K7QXM2PA9FHE3TDW';
const OTHER_CODE = 'ZZZZYYYYXXXXWWWW';

test('a code that meets nobody in ten minutes is let go of, back home if it came from one', () => {
  const at = 1_000_000;
  const waiting = { code: NEW, met: false, at };
  assert.equal(pairingNow(waiting, at + UNMET_MS), waiting, 'still waiting: the same pairing');
  assert.equal(pairingNow(waiting, at + UNMET_MS + 1), null);
  assert.deepEqual(pairingNow({ ...waiting, home: HOME }, at + UNMET_MS + 1), { code: HOME, met: true });
  const met = { code: NEW, met: true };
  assert.equal(pairingNow(met, at + 10 * UNMET_MS), met, 'a met one never lapses');
  // Stamped ahead of the clock (set back since): counted from now, not kept for good.
  assert.deepEqual(pairingNow({ ...waiting, at: at + 30 * 86_400_000 }, at), { ...waiting, at });
});

test('a pairing let go of lapsed when its code met nobody in time, here or in another tab; not when the player let go', () => {
  const at = 1_000_000;
  const waiting = { code: NEW, met: false, at };
  // Here: read, and nothing left of it.
  assert.equal(lapsed(waiting, null, at, at + UNMET_MS + 1), true);
  // Gone in another tab: past its time, it lapsed there; before it, the player let go of it.
  assert.equal(lapsed(null, null, at, at + UNMET_MS + 1), true);
  assert.equal(lapsed(null, null, at, at + 60_000), false);
  // Met, nothing was waiting: let go of by the player.
  assert.equal(lapsed(null, null, null, at + 10 * UNMET_MS), false);
  // Still paired (back home, say): not let go of at all.
  assert.equal(lapsed(waiting, { code: HOME, met: true }, at, at + UNMET_MS + 1), false);
});

test('a synced device that takes a new code brings that device home; a new one goes where it is brought', () => {
  // The synced phone took the computer's new code: it says where home is, and the computer, new, says so.
  const phone = { code: NEW, met: false, home: HOME };
  const computer = { code: NEW, met: false, home: null };
  assert.deepEqual(meeting(phone), { home: HOME });
  assert.deepEqual(meeting(computer), { fresh: true });
  assert.equal(homeOnMeeting(phone, meeting(computer)), HOME);
  assert.equal(homeOnMeeting(computer, meeting(phone)), HOME, 'both go to the same code');
  // Met already, a device says nothing of itself, and neither moves.
  const synced = { code: NEW, met: true, home: null };
  assert.deepEqual(meeting(synced), {});
  assert.equal(homeOnMeeting(phone, meeting(synced)), null);
  assert.equal(homeOnMeeting(synced, meeting(phone)), null);
  // Two devices each bringing one home: neither goes to the other's.
  const tablet = { code: NEW, met: false, home: OTHER_CODE };
  assert.equal(homeOnMeeting(phone, meeting(tablet)), null);
  assert.equal(homeOnMeeting(tablet, meeting(phone)), null);
  // Only a code is gone to.
  assert.equal(homeOnMeeting(computer, { home: 'not a code' }), null);
});

test('taking a code keeps the one a synced device came from; its own home taken again is home, met', () => {
  const now = 42;
  assert.deepEqual(pairingTaking(NEW, { code: null, met: false, home: null }, now), { code: NEW, met: false, at: now, took: true }, 'taken, not made');
  assert.deepEqual(pairingTaking(NEW, { code: HOME, met: true, home: null }, now), { code: NEW, met: false, at: now, home: HOME });
  // Took one, then another before meeting anybody: home is still the code it was synced under.
  assert.deepEqual(pairingTaking(OTHER_CODE, { code: NEW, met: false, home: HOME }, now), { code: OTHER_CODE, met: false, at: now, home: HOME });
  assert.deepEqual(pairingTaking(HOME, { code: NEW, met: false, home: HOME }, now), { code: HOME, met: true });
  assert.equal(pairingTaking(NEW, { code: NEW, met: true, home: null }, now), null, 'the code it has: as it is');
});

test('a device started over is never taken home: one of the group it left that takes its code comes to it', () => {
  const now = 42;
  // Started over: out of its group, on a new code that waits for good.
  const anew = pairingAnew(NEW, now);
  assert.deepEqual(anew, { code: NEW, met: false, at: now, anew: true });
  assert.equal(pairingNow(anew, now + 10 * UNMET_MS), anew, 'waits however long the others take');
  savePairing(anew);
  assert.deepEqual(loadPairing(), anew);
  const left = { code: NEW, met: false, home: null, anew: true };
  assert.deepEqual(meeting(left), { fresh: true, anew: true });
  // A device of the old group takes the new code: neither goes back to the old one.
  const computer = { code: NEW, met: false, home: HOME };
  assert.equal(homeOnMeeting(computer, meeting(left)), null);
  assert.equal(homeOnMeeting(left, meeting(computer)), null, 'both stay on the new code');
  // A plain new device is still brought home, as ever.
  const phone = { code: NEW, met: false, home: null };
  assert.equal(homeOnMeeting(computer, meeting(phone)), HOME);
  // Met there, the code is like any other: a device taking it is no longer told it is new.
  assert.deepEqual(meeting({ code: NEW, met: true, home: null, anew: false }), {});
  // Taking another's code, it is new no more.
  assert.deepEqual(pairingTaking(OTHER_CODE, left, now), { code: OTHER_CODE, met: false, at: now, took: true });
});

test('only the device that made a code is brought home: one that took it too stays, and its taker with it', () => {
  const now = 42;
  // A started over on NEW; tablet B of the old group took it, and so did the player's new phone D. B and D meet first.
  const tablet = { code: NEW, met: false, home: HOME };
  const took = pairingTaking(NEW, { code: null, met: false, home: null }, now)!;
  savePairing(took);
  assert.deepEqual(loadPairing(), took, 'kept as taken');
  const phone = { code: NEW, met: false, home: null, took: true };
  assert.deepEqual(meeting(phone), { fresh: true, took: true });
  assert.equal(homeOnMeeting(tablet, meeting(phone)), null, 'the tablet stays on the new code');
  assert.equal(homeOnMeeting(phone, meeting(tablet)), null, "the phone doesn't follow the tablet's home");
  // The plain way: a new device shows its code, a synced one scans it, and both go home.
  const shown = { code: NEW, met: false, home: null };
  const scanned = pairingTaking(NEW, { code: HOME, met: true, home: null }, now)!;
  const synced = { code: scanned.code, met: false, home: scanned.home ?? null };
  assert.equal(homeOnMeeting(synced, meeting(shown)), HOME);
  assert.equal(homeOnMeeting(shown, meeting(synced)), HOME);
});

test('unpairing a code taken but not met goes back home; otherwise it lets go', () => {
  assert.deepEqual(pairingAfterUnpair({ code: NEW, met: false, home: HOME }), { code: HOME, met: true });
  assert.equal(pairingAfterUnpair({ code: NEW, met: false, home: null }), null);
  assert.equal(pairingAfterUnpair({ code: NEW, met: true, home: null }), null);
  assert.equal(pairingAfterUnpair({ code: NEW, met: false, home: null, anew: true }), null, 'started over, cancelled');
});

test('a device keeps one name, and one copy of each other device', () => {
  const me = deviceId();
  assert.match(me, /^[0-9a-z]{12}$/);
  assert.equal(deviceId(), me);
  assert.ok(keepCopy('practice', PHONE, { at: 5, raw: 'a' }));
  assert.ok(keepCopy('practice', PHONE, { at: 9, raw: 'b' }));
  assert.ok(keepCopy('practice', TABLET, { at: 3, raw: 'c' }));
  assert.deepEqual(readCopies('practice'), { [PHONE]: { at: 9, raw: 'b' }, [TABLET]: { at: 3, raw: 'c' } });
  clearCopies();
  assert.deepEqual(readCopies('practice'), {});
});

test("a device's own progress is stamped with when it last changed, later every time it does", () => {
  assert.equal(ownNow('practice'), null);
  recordPractice(true);
  const one = ownNow('practice')!;
  assert.equal(ownNow('practice')!.at, one.at, 'unchanged, the same');
  recordPractice(false);
  const two = ownNow('practice')!;
  assert.ok(two.at > one.at);
  assert.equal(two.raw, store.get(storeKey('practice')));
});

// ---- the codex -----------------------------------------------------------------------

const answered = (at: number, ok: boolean, itemId = ITEM) => ({ at, itemId, mode: 'name' as const, difficulty: 'custom' as const, race: false, answer: { ok, pickedId: null, pickedLabel: null, ms: ok ? at : undefined } });

/** A codex of the answers given, as a device would have recorded them. */
function codexOf(answers: ReturnType<typeof answered>[]): Codex {
  store.clear();
  for (const a of answers) recordEncounter(a);
  return loadCodex();
}

test('codexes add up: what each counted, the best of each best, all the answers in one log', () => {
  const pc = codexOf([answered(100, true), answered(200, true), answered(300, false, OTHER)]);
  const phone = codexOf([answered(150, true), answered(250, true), answered(350, true), answered(400, true)]);
  const both = combineCodex(pc, [phone]);
  assert.equal(both.items[ITEM].seen, 6);
  assert.deepEqual(both.items[ITEM].name, { n: 6, ok: 6 });
  assert.equal(both.items[ITEM].first, 100);
  assert.equal(both.items[ITEM].last, 400);
  assert.deepEqual(both.items[OTHER].name, { n: 1, ok: 0 });
  assert.deepEqual(both.byDifficulty.custom, { n: 7, ok: 6 });
  assert.deepEqual(both.log.map((a) => a.t), [100, 150, 200, 250, 300, 350, 400]);
  // The answers in a row now are the phone's, which answered last; the best is its four.
  assert.equal(both.streak, 4);
  assert.equal(both.best, 4);
  assert.equal(both.fastest?.ms, 100);
  // Neither is changed by it.
  assert.equal(pc.items[ITEM].seen, 2);
  assert.equal(phone.items[ITEM].seen, 4);
});

test('one answer logged on two devices (one question, both in the room) is in the log once', () => {
  const a = codexOf([answered(100, true)]);
  const both = combineCodex(a, [a]);
  assert.equal(both.log.length, 1);
});

test("the codex is read with the other devices' copies; its own stays its own", () => {
  const phone = serializeCodex(codexOf([answered(150, true), answered(250, false)]));
  store.clear();
  recordEncounter(answered(100, true));
  keepCopy('codex', PHONE, { at: 1, raw: phone });
  assert.equal(loadCodex().items[ITEM].seen, 3);
  recordEncounter(answered(300, true));
  assert.equal(loadCodex().items[ITEM].seen, 4);
  // What this device stores is its own answers alone: that's what it passes on.
  assert.equal(parseCodex(store.get(storeKey('codex2'))!)!.items[ITEM].seen, 2);
  // A copy this build can't read is left out, not read as nothing.
  keepCopy('codex', TABLET, { at: 1, raw: JSON.stringify({ v: 99 }) });
  assert.equal(loadCodex().items[ITEM].seen, 4);
});

test("practice adds up the devices' tallies", () => {
  recordPractice(true);
  keepCopy('practice', PHONE, { at: 1, raw: JSON.stringify({ v: 1, n: 5, ok: 3 }) });
  assert.deepEqual(loadPractice(), { n: 6, ok: 4 });
});

test('copies are parsed again only when they change', () => {
  keepCopy('codex', PHONE, { at: 1, raw: serializeCodex(emptyCodex()) });
  const first = copiesOf('codex', parseCodex);
  assert.equal(copiesOf('codex', parseCodex), first);
  keepCopy('codex', PHONE, { at: 2, raw: serializeCodex(emptyCodex()) });
  assert.notEqual(copiesOf('codex', parseCodex), first);
});

// ---- the Delve records -------------------------------------------------------------

const run = (o: Partial<DelveRun>): DelveRun => ({ id: 1, at: 1, depth: 10, players: 1, ruleset: DELVE_RULESET, mixed: false, losses: [3, 6, 10], ...o });

test("records add up: every device's runs, the deepest of each kind, the tallies summed", () => {
  const pc = [run({ id: 1, at: 10, depth: 12, losses: [4, 8, 12] }), run({ id: 2, at: 30, depth: 7, losses: [2, 5, 7] })].reduce((r, x) => addRun(r, x).records, emptyRecords());
  const phone = addRun(emptyRecords(), run({ id: 3, at: 20, depth: 20, losses: [5, 9, 20] })).records;
  const both = combineRecords(pc, [phone]);
  assert.deepEqual(both.runs.map((x) => x.id), [1, 3, 2]);
  assert.equal(bestOf(both, true)?.depth, 20);
  assert.deepEqual(tallyOf(both, true).ends, { 7: 1, 12: 1, 20: 1 });
  assert.deepEqual(both.climbs[`${DELVE_RULESET}:solo`].map((f) => f.depth), [12, 20]);
  assert.deepEqual(both.frontier.map((f) => f.depth), [12, 20]);
});

test("a run measures up against the player's other devices too: a best is the deepest anywhere", () => {
  keepCopy('delve', PHONE, { at: 1, raw: serializeRecords(addRun(emptyRecords(), run({ id: 3, at: 20, depth: 20, losses: [5, 9, 20] })).records) });
  const first = recordRun(run({ id: 1, at: 30, depth: 12, losses: [4, 8, 12] }))!;
  assert.deepEqual(first, { previousBest: 20, best: false });
  const deeper = recordRun(run({ id: 2, at: 40, depth: 25, losses: [4, 8, 25] }))!;
  assert.deepEqual(deeper, { previousBest: 20, best: true });
  assert.equal(bestOf(loadRecords(), true)?.depth, 25);
  // What this device stores is its own runs alone.
  assert.equal(JSON.parse(store.get(DELVE_RECORD_KEY)!).runs.length, 2);
});

// ---- what is taken in -----------------------------------------------------------------

test("achievements are taken in: what the other earned, at the earlier time of two", () => {
  const [a, b, c] = ACHIEVEMENTS;
  store.set(ACHIEVEMENTS_KEY, serializeStore({ earned: { [a.id]: 50, [b.id]: 10 } }));
  assert.ok(absorbAchievements(serializeStore({ earned: { [a.id]: 20, [b.id]: 30, [c.id]: 40, 'from-a-newer-build': 5 } })));
  assert.deepEqual(loadAchievements().earned, { [a.id]: 20, [b.id]: 10, [c.id]: 40, 'from-a-newer-build': 5 });
  assert.ok(!absorbAchievements(serializeStore({ earned: { [a.id]: 20 } })), 'nothing new');
  assert.ok(!absorbAchievements('nope'));
  // Names it doesn't know (a newer build's), only a few of them.
  const junk = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`junk-${i}`, 1]));
  absorbAchievements(serializeStore({ earned: junk }));
  assert.equal(Object.keys(loadAchievements().earned).filter((id) => id.startsWith('junk-')).length, 31);
});

test("the longest run of wins is taken in; the run now stays this device's own", () => {
  store.set(WINS_KEY, serializeWins({ now: 2, best: 3, last: 9 }));
  assert.ok(absorbWins(serializeWins({ now: 0, best: 5, last: 4 })));
  assert.deepEqual(loadWins(), { now: 2, best: 5, last: 9 });
  assert.ok(!absorbWins(serializeWins({ now: 4, best: 4, last: 12 })));
});

test('sigils are taken in: every one unlocked, and the one put on last is worn', () => {
  store.set(SIGILS_KEY, serializeSigils({ unlocked: ['witch'], worn: 'witch', wornAt: 100 }));
  assert.ok(absorbSigils(serializeSigils({ unlocked: ['monk'], worn: 'monk', wornAt: 50 })));
  assert.deepEqual(loadSigils(), { unlocked: ['witch', 'monk'], worn: 'witch', wornAt: 100 });
  assert.ok(absorbSigils(serializeSigils({ unlocked: ['monk'], worn: 'monk', wornAt: 200 })));
  assert.deepEqual(loadSigils(), { unlocked: ['witch', 'monk'], worn: 'monk', wornAt: 200 });
  assert.ok(!absorbSigils(serializeSigils({ unlocked: ['witch'], worn: null, wornAt: 150 })), 'taken off earlier: still worn');
});

test("today's unique is taken in from a device that answered later; never from the future", () => {
  const today = 20_000;
  store.set(DAILY_KEY, JSON.stringify({ day: today - 1, picked: 0, ok: true, streak: 4, ended: 0 }));
  assert.ok(!absorbDaily(JSON.stringify({ day: today - 2, picked: 1, ok: true, streak: 3, ended: 0 }), today));
  assert.ok(absorbDaily(JSON.stringify({ day: today, picked: 2, ok: true, streak: 5, ended: 0 }), today));
  assert.equal(loadDaily()?.day, today);
  assert.ok(!absorbDaily(JSON.stringify({ day: today + 5, picked: 2, ok: true, streak: 9, ended: 0 }), today));
  // The same day answered on two devices: never a right answer over a wrong one.
  store.set(DAILY_KEY, JSON.stringify({ day: today, picked: 1, ok: false, streak: 0, ended: 4 }));
  assert.ok(!absorbDaily(JSON.stringify({ day: today, picked: 2, ok: true, streak: 5, ended: 0 }), today));
  store.set(DAILY_KEY, JSON.stringify({ day: today, picked: 2, ok: true, streak: 1, ended: 0 }));
  assert.ok(absorbDaily(JSON.stringify({ day: today, picked: 2, ok: true, streak: 6, ended: 0 }), today), 'the longer run, the same verdict');
});

test('what is sent to be taken in is what is stored; what comes in is checked', () => {
  store.set(ACHIEVEMENTS_KEY, serializeStore({ earned: { [ACHIEVEMENTS[0].id]: 1 } }));
  assert.deepEqual(Object.keys(takenNow()), ['achievements']);
  store.clear();
  assert.deepEqual(takeIn({ achievements: serializeStore({ earned: { [ACHIEVEMENTS[0].id]: 1 } }), nonsense: 'x', sigils: 42 }), ['achievements']);
  assert.deepEqual(takeIn({ achievements: 'x'.repeat(200_000) }), []);
  assert.deepEqual(takeIn(null), []);
});
