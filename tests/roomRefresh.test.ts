// How the open rooms list eases off (lib/roomRefresh.ts): its timed refresh
// later with nobody about and while rooms or the server don't answer, and the
// rooms whose slots a scan didn't hear from kept as last heard (scan after
// scan against the server in memory: tests/rooms.test.ts). And the sums behind it:
// how many start pages a room's share of pings carries, and how many scans
// (each a socket on our own server) a page left open makes.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { KEEP_UNHEARD_MS, LastHeard, REFRESH_LATEST_MS, REFRESH_MS, RefreshPace, Refresher } from '../src/lib/roomRefresh.ts';
import { ProbeDesk } from '../src/lib/probeDesk.ts';
import type { RoomInfo } from '../src/lib/roomInfo.ts';

const room = (code: string): RoomInfo => ({ code, host: 'Ash', players: 1, maxPlayers: 12, spectators: 0, maxSpectators: 8, mode: 'turns', difficulty: 'merciless', target: 10, phase: 'lobby' });

/** The waits before each of a page's next `n` timed refreshes, in seconds; `about`: a sign of its player before each. */
function gaps(pace: RefreshPace, n: number, about = false) {
  return Array.from({ length: n }, () => {
    if (about) pace.seen();
    const gap = pace.gap();
    pace.timed();
    pace.scanned(false);
    return Math.round(gap / 1000);
  });
}

test('with its player about and every room answering, the list refreshes every 20 s', () => {
  assert.equal(REFRESH_MS, 20_000);
  assert.deepEqual(gaps(new RefreshPace(), 5, true), [20, 20, 20, 20, 20]);
});

test('with no sign of its player each timed refresh waits half as long again, to ten minutes; a sign brings it back', () => {
  const pace = new RefreshPace();
  assert.deepEqual(gaps(pace, 11), [20, 30, 45, 68, 101, 152, 228, 342, 513, 600, 600]);
  assert.equal(REFRESH_LATEST_MS, 600_000);
  assert.equal(pace.idling, true);
  assert.equal(pace.seen(), true, 'brings the next one forward');
  assert.equal(pace.gap(), REFRESH_MS);
  assert.equal(pace.idling, false);
  assert.equal(pace.seen(), false, 'nothing to bring forward with them about already');
});

test('a strained scan doubles the wait, to eight times; each scan that is not halves it again', () => {
  const pace = new RefreshPace();
  const after = (strained: boolean) => (pace.scanned(strained), pace.gap() / 1000);
  assert.deepEqual([true, true, true, true].map(after), [40, 80, 160, 160]);
  assert.equal(pace.seen(), false);
  assert.equal(pace.gap(), 160_000, "the player being about doesn't make the rooms answer");
  assert.deepEqual([false, false, true, false, false, false].map(after), [80, 40, 80, 40, 20, 20]);
});

test('strained with nobody about, the wait still ends at ten minutes', () => {
  const pace = new RefreshPace();
  for (let i = 0; i < 20; i++) {
    pace.timed();
    pace.scanned(true);
  }
  assert.equal(pace.gap(), REFRESH_LATEST_MS);
});

/**
 * A list on a page in sight or not (`page.hidden`), its clock the test's: each
 * refresh asked for is a scan that ends `scanMs` later (strained if
 * `page.strained`), and `scans` says when each began, in seconds from the
 * start. `page.asked`: how often the list asked whether it's in sight.
 */
function list(scanMs = 1000) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const page = { hidden: false, strained: false, asked: 0 };
  const scans: number[] = [];
  const scan = () => {
    refresher.began();
    scans.push(Date.now() / 1000);
    setTimeout(() => refresher.ended(page.strained), scanMs);
  };
  const refresher = new Refresher(scan, () => (page.asked++, page.hidden));
  /** The clock on by `s` seconds, a step at a time: what a timer sets off is then on time too. */
  const run = (s: number) => {
    for (let left = s * 1000; left > 0; left -= 100) mock.timers.tick(Math.min(100, left));
    mock.timers.tick(0);
  };
  return { page, scans, scan, refresher, run };
}

test('the list scans as the page opens, then 20 s after each scan ends, later each time while nobody is about', () => {
  const { scans, refresher, run } = list();
  try {
    refresher.start();
    run(130);
    assert.deepEqual(scans, [0, 21, 52, 98]);
  } finally {
    mock.timers.reset();
  }
});

test('out of sight, a page scans nothing: not as it opens, and not as a refresh comes due; shown again, it does at once', () => {
  const { page, scans, refresher, run } = list();
  try {
    page.hidden = true;
    refresher.start();
    run(600);
    assert.deepEqual(scans, [], 'a tab opened in the background');
    page.hidden = false;
    refresher.seen();
    assert.deepEqual(scans, [600]);
    run(10);
    page.hidden = true;
    run(3600);
    assert.deepEqual(scans, [600], 'none in an hour behind another tab');
    refresher.seen();
    assert.deepEqual(scans, [600], 'nor for a sign that is not the page being shown');
    page.hidden = false;
    refresher.seen();
    assert.deepEqual(scans, [600, 4210]);
    // And from there as with its player about.
    run(22);
    assert.deepEqual(scans, [600, 4210, 4231]);
  } finally {
    mock.timers.reset();
  }
});

test('a sign of the player brings a refresh put off for want of one to 20 s after the last scan, at once if that is past', () => {
  const { scans, refresher, run } = list();
  try {
    refresher.start();
    run(100);
    assert.deepEqual(scans, [0, 21, 52, 98], 'the next not before 167');
    // 99 is when the last scan ended: 20 s after it is still to come.
    run(5);
    refresher.seen();
    run(13);
    assert.deepEqual(scans, [0, 21, 52, 98]);
    run(1);
    assert.deepEqual(scans, [0, 21, 52, 98, 119]);
    // Left alone again, later each time; the sign then comes long after 20 s have passed.
    run(150);
    assert.deepEqual(scans, [0, 21, 52, 98, 119, 150, 196, 264.5], 'the next not before 366');
    run(40);
    refresher.seen();
    run(0);
    assert.equal(scans.at(-1), 309);
    // A pointer that keeps moving doesn't scan more often than every 20 s.
    for (let i = 0; i < 100; i++) {
      run(0.5);
      refresher.seen();
    }
    assert.deepEqual(scans.slice(-3), [309, 330, 351]);
  } finally {
    mock.timers.reset();
  }
});

test('a pointer moving with nothing put off costs nothing: the page is asked whether it is in sight only when a refresh hangs on it', () => {
  const { page, scans, refresher, run } = list();
  try {
    refresher.start();
    run(5);
    const before = page.asked;
    for (let i = 0; i < 1000; i++) refresher.seen();
    assert.equal(page.asked, before);
    // The first timed refresh has come: later ones wait on a sign of the player, and the first sign is the one that counts.
    run(20);
    assert.deepEqual(scans, [0, 21]);
    const then = page.asked;
    for (let i = 0; i < 1000; i++) refresher.seen();
    assert.equal(page.asked, then + 1);
  } finally {
    mock.timers.reset();
  }
});

test("a clock set back doesn't put the next refresh off: it comes no later than its wait after a sign of the player", () => {
  const { scans, refresher, run } = list();
  try {
    refresher.start();
    run(30);
    assert.deepEqual(scans, [0, 21], 'the next at 52, or at 42 with a sign of the player');
    // The device's clock goes back half a minute (set by hand, or put right by the network).
    mock.timers.setTime(0);
    refresher.seen();
    run(19);
    assert.equal(scans.length, 2);
    run(1);
    assert.equal(scans.length, 3, '20 s after the sign at the latest');
  } finally {
    mock.timers.reset();
  }
});

test('a scan by hand stands for the timed one on its way, and the next comes in its time after it', () => {
  const { scans, scan, refresher, run } = list();
  try {
    refresher.start();
    run(10);
    scan();
    run(15);
    assert.deepEqual(scans, [0, 10], 'not at 21 as well');
    run(20);
    assert.deepEqual(scans, [0, 10, 31]);
  } finally {
    mock.timers.reset();
  }
});

test('while scans come back strained the list asks later, to every 160 s with its player about; a list left is asked for nothing more', () => {
  const { page, scans, refresher, run } = list();
  try {
    page.strained = true;
    refresher.start();
    for (let t = 0; t < 600; t += 5) {
      refresher.seen();
      run(5);
    }
    assert.deepEqual(scans, [0, 41, 122, 283, 444]);
    refresher.stop();
    run(3600);
    refresher.seen();
    assert.equal(scans.length, 5);
  } finally {
    mock.timers.reset();
  }
});

/** Rooms A, B and C shown, heard in slots 1, 2 and 3 at 1, 2 and 3 s; then what the list shows after a scan that `found` these codes (a new one's slot: 9) while these slots kept `silent`. */
function shownAfter(found: string[], silent: number[], now = 5000) {
  const last = new LastHeard();
  const before = ['AAAAAA', 'BBBBBB', 'CCCCCC'].map(room);
  before.forEach((r, i) => last.heard(r.code, i + 1, 1000 * (i + 1)));
  for (const code of found) last.heard(code, before.findIndex((r) => r.code === code) + 1 || 9, now);
  const after = (at = now) => last.after(before, new Map(found.map((code) => [code, room(code)])), silent, at).map((r) => r.code);
  return { last, before, after };
}

test('a room stays as last heard only while its own slot keeps silent: one whose slot spoke is gone, whatever else kept silent', () => {
  assert.deepEqual(shownAfter(['CCCCCC'], []).after(), ['CCCCCC'], 'every slot answered: what was not found is gone');
  // A, asked too often, answers nothing; B, heard later than A, closed, and its slot is free.
  assert.deepEqual(shownAfter(['CCCCCC'], [1]).after(), ['CCCCCC', 'AAAAAA'], 'the busy room kept, not the closed one');
  // B's slot silent: B itself, or whoever took the slot since. No telling, so it stays.
  assert.deepEqual(shownAfter(['AAAAAA', 'CCCCCC', 'DDDDDD'], [2]).after(), ['AAAAAA', 'CCCCCC', 'DDDDDD', 'BBBBBB']);
  // Two slots silent, B's not: B goes.
  assert.deepEqual(shownAfter(['DDDDDD'], [1, 3]).after(), ['DDDDDD', 'AAAAAA', 'CCCCCC']);
});

test('a room is kept ten minutes at most from when it was last heard, however often its slot keeps silent, and forgotten once gone', () => {
  assert.equal(KEEP_UNHEARD_MS, 600_000);
  assert.deepEqual(shownAfter([], [1, 2, 3]).after(1999 + KEEP_UNHEARD_MS), ['BBBBBB', 'CCCCCC']);
  assert.deepEqual(shownAfter([], [1, 2, 3]).after(3000 + KEEP_UNHEARD_MS), []);
  // Kept by one scan, it's no fresher for the next.
  const { last, after } = shownAfter([], [3]);
  assert.deepEqual(after(), ['CCCCCC']);
  const kept = [room('CCCCCC')];
  const next = (at: number, silent = [3]) => last.after(kept, new Map(), silent, at).map((r) => r.code);
  assert.deepEqual(next(2999 + KEEP_UNHEARD_MS), ['CCCCCC']);
  assert.deepEqual(next(3000 + KEEP_UNHEARD_MS), []);
  assert.deepEqual(next(6000), [], 'gone, it is not back for its slot keeping silent');
  // And A, dropped by the first of these scans, isn't kept for a slot it was once heard in.
  assert.deepEqual(last.after([room('AAAAAA')], new Map(), [1], 6000), []);
});

test('a room heard in another slot since is kept by that one', () => {
  const last = new LastHeard();
  const a = room('AAAAAA');
  last.heard(a.code, 4, 1000);
  last.heard(a.code, 1, 2000);
  assert.deepEqual(last.after([a], new Map(), [4], 3000), [], 'slot 1 spoke, and it was not there');
  last.heard(a.code, 1, 2000);
  assert.deepEqual(last.after([a], new Map(), [1], 3000), [a]);
});

// The sums. A scan lasts about 3 s where others scan too (the server's word
// on the free slots that end it comes within 6 s of the first to ask), so a
// page scans every 23 s or so at the list's quickest.
const SCAN_MS = 3000;

/**
 * How many of their pings a room answers `tabs` start pages scanning it once
 * every `everyMs`, spread evenly, each scan from a peer of its own: over a
 * minute, after one to settle in.
 */
function answered(tabs: number, everyMs: number) {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    const desk = new ProbeDesk(() => room('AAAAAA'));
    const next = Array.from({ length: tabs }, (_, i) => (i / tabs) * everyMs);
    let sent = 0;
    let got = 0;
    for (let t = 0; t < 120_000; t += 50) {
      mock.timers.setTime(t);
      for (let i = 0; i < tabs; i++) {
        if (next[i] > t) continue;
        next[i] += everyMs;
        if (t < 60_000) desk.answerPing(`${i}-${t}`, null, () => {});
        else {
          sent++;
          desk.answerPing(`${i}-${t}`, null, () => got++);
        }
      }
    }
    return got / sent;
  } finally {
    mock.timers.reset();
  }
}

test("a room's share of pings (60 in 10 s) carries about 140 start pages at the list's quickest, and about 1,000 once they've eased off", () => {
  const quickest = REFRESH_MS + SCAN_MS;
  assert.equal(answered(130, quickest), 1);
  assert.ok(answered(150, quickest) < 1);
  // Past it, the share is what gets answered: of 500 pages' pings about a quarter, of 2,000 about one in fourteen.
  assert.ok(Math.abs(answered(500, quickest) - (6 * 23) / 500) < 0.02);
  assert.ok(Math.abs(answered(2000, quickest) - (6 * 23) / 2000) < 0.01);
  // Strained, a page waits eight times as long, and a scan that waits out a silent slot's second ping lasts 7.5 s.
  const pace = new RefreshPace();
  for (let i = 0; i < 3; i++) pace.scanned(true);
  const easedOff = pace.gap() + 7500;
  assert.equal(answered(1000, easedOff), 1);
  assert.ok(answered(1100, easedOff) < 1);
});

/** The scans a page makes in `forMs` from its first, with nothing strained (each a socket on our own server, tests/rooms.test.ts). */
function scans(forMs: number, about: boolean) {
  const pace = new RefreshPace();
  let n = 1;
  for (let t = SCAN_MS; ; n++) {
    if (about) pace.seen();
    t += pace.gap() + SCAN_MS;
    if (t > forMs) return n;
    pace.timed();
    pace.scanned(false);
  }
}

test('a page left open in sight scans 13 times in its first hour and 6 an hour from then on, where one with its player about scans 157 times', () => {
  const HOUR = 3_600_000;
  assert.equal(scans(HOUR, true), 157);
  assert.equal(scans(HOUR, false), 13);
  assert.equal(scans(5 * 60_000, false), 6);
  assert.equal(scans(4 * HOUR, false) - scans(3 * HOUR, false), 6);
});
