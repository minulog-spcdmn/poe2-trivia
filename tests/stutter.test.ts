import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BEGIN_MS,
  FrameTally,
  GameFrames,
  LONG_MS,
  MIN_MS,
  SOFTWARE,
  bucketOf,
  deviceOf,
  framesEvent,
  readFramesPath,
  type FrameClock,
  type Verdict,
} from '../src/lib/stutter.ts';

test('a game is smooth under 1% of its time in frames over 40 ms, stutters some to 5%, many from there', () => {
  const minute = 60_000;
  assert.equal(bucketOf(0, minute), 'smooth');
  assert.equal(bucketOf(590, minute), 'smooth');
  assert.equal(bucketOf(600, minute), 'some');
  assert.equal(bucketOf(2_999, minute), 'some');
  assert.equal(bucketOf(3_000, minute), 'many');
  assert.equal(bucketOf(0, 0), 'smooth');
});

test('the same hitches make the same bucket at 60 Hz and at 240 Hz: it goes by time, not by frames', () => {
  const at = (hz: number) => {
    const t = new FrameTally();
    for (let i = 0; i < 60 * hz; i++) t.add(1000 / hz, 'question');
    // A 120 ms hitch at each of twelve screen changes in the minute.
    for (let i = 0; i < 12; i++) t.add(120, 'reveal');
    return t.verdict();
  };
  assert.deepEqual(at(60), { bucket: 'some', worst: 'reveal' });
  assert.deepEqual(at(240), at(60));
});

test('a frame of exactly 40 ms is no stutter; one over it is', () => {
  assert.equal(LONG_MS, 40);
  const t = new FrameTally();
  t.add(40, 'deal');
  t.add(41, 'reveal');
  assert.deepEqual(t.long, { begin: 0, deal: 0, question: 0, reveal: 41 });
});

test("the hitches #331 found count: two frames missed at 60 Hz, a 42 ms frame at 240 Hz; a 30 Hz page's frames don't", () => {
  const t = new FrameTally();
  // At 60 Hz, two frames missed: 50 ms, give or take the timer.
  t.add(3 * (1000 / 60) - 0.4, 'question');
  // At 240 Hz, ten frames' time: the PC's screen-change frames.
  t.add(10 * (1000 / 240), 'reveal');
  // At 30 Hz (Low Power Mode, Energy Saver), every frame, with its jitter.
  t.add(1000 / 30 + 3, 'deal');
  assert.ok(t.long.question > 0 && t.long.reveal > 0);
  assert.equal(t.long.deal, 0);
});

test("the PC's hitch at every step sits about the line: one counted frame a step is smooth, two are some", () => {
  /** A minute at 240 Hz with `n` frames of 46 ms at each step, one every 5 seconds. */
  const minute = (n: number) => {
    const t = new FrameTally();
    for (let step = 0; step < 12; step++) {
      for (let i = 0; i < n; i++) t.add(46, 'question');
      for (let ms = 46 * n; ms < 5_000; ms += 1000 / 240) t.add(1000 / 240, 'question');
    }
    return t.verdict()?.bucket;
  };
  assert.equal(minute(1), 'smooth');
  assert.equal(minute(2), 'some');
});

test('a game seen for less than 20 seconds says nothing', () => {
  const t = new FrameTally();
  for (let ms = 0; ms < MIN_MS - 1000; ms += 500) t.add(500, 'question');
  assert.equal(t.verdict(), null);
  for (let ms = 0; ms < 1000; ms += 16) t.add(16, 'question');
  assert.ok(t.verdict());
});

test('a gap counts as a second at most: a page held still is no minute of stutter', () => {
  const t = new FrameTally();
  for (let ms = 0; ms < 60_000; ms += 16) t.add(16, 'question');
  t.add(30_000, 'question');
  assert.equal(t.long.question, 1_000);
  assert.equal(t.verdict()?.bucket, 'some');
});

test('a game that stuttered names the moment most of it fell in; a smooth one names none', () => {
  const t = new FrameTally();
  for (let ms = 0; ms < 30_000; ms += 16) t.add(16, 'question');
  t.add(400, 'deal');
  t.add(300, 'reveal');
  t.add(300, 'reveal');
  assert.deepEqual(t.verdict(), { bucket: 'some', worst: 'reveal' });
  const smooth = new FrameTally();
  for (let ms = 0; ms < 30_000; ms += 16) smooth.add(16, 'reveal');
  assert.deepEqual(smooth.verdict(), { bucket: 'smooth', worst: null });
});

test('devices are told apart by class alone', () => {
  const ua = {
    winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
    winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
    macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
    iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1',
    android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    androidFirefox: 'Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
    linuxDesktopSite: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  };
  assert.equal(deviceOf({ userAgent: ua.winChrome }), 'desktop-chrome');
  assert.equal(deviceOf({ userAgent: ua.winEdge }), 'desktop-chrome');
  assert.equal(deviceOf({ userAgent: ua.winFirefox }), 'desktop-other');
  assert.equal(deviceOf({ userAgent: ua.macSafari, maxTouchPoints: 0 }), 'desktop-other');
  // An iPad says it's a Mac, one that can be touched.
  assert.equal(deviceOf({ userAgent: ua.macSafari, maxTouchPoints: 5 }), 'ios');
  assert.equal(deviceOf({ userAgent: ua.iphone }), 'ios');
  assert.equal(deviceOf({ userAgent: ua.iphoneChrome }), 'ios');
  assert.equal(deviceOf({ userAgent: ua.android }), 'android');
  assert.equal(deviceOf({ userAgent: ua.androidFirefox }), 'android');
  // Android's Chrome asked for the desktop site.
  assert.equal(deviceOf({ userAgent: ua.linuxDesktopSite, userAgentData: { platform: 'Android', brands: [{ brand: 'Chromium' }] } }), 'android');
  // A Chromium browser that says so, whatever its user agent.
  assert.equal(deviceOf({ userAgent: ua.winChrome, userAgentData: { platform: 'Windows', brands: [{ brand: 'Not)A;Brand' }, { brand: 'Chromium' }, { brand: 'Brave' }] } }), 'desktop-chrome');
});

test('a game counts under one path: the class, the bucket and, for one that stuttered, its worst moment', () => {
  assert.equal(framesEvent('ios', { bucket: 'smooth', worst: null }), 'frames2/ios/smooth');
  assert.equal(framesEvent('desktop-chrome', { bucket: 'many', worst: 'deal' }), 'frames2/desktop-chrome/many/deal');
  assert.equal(framesEvent('ios', { bucket: 'some', worst: 'begin' }), 'frames2/ios/some/begin');
  assert.deepEqual(readFramesPath('frames2/android/some/reveal'), { device: 'android', bucket: 'some', worst: 'reveal' });
  assert.deepEqual(readFramesPath('frames2/ios/many/begin'), { device: 'ios', bucket: 'many', worst: 'begin' });
  assert.deepEqual(readFramesPath('frames2/desktop-other/smooth'), { device: 'desktop-other', bucket: 'smooth', worst: null });
  assert.equal(readFramesPath('frames2/toaster/smooth'), null);
  assert.equal(readFramesPath('frames2/ios/awful'), null);
  assert.equal(readFramesPath('frames2/ios/some/lobby'), null);
  assert.equal(readFramesPath('play/race'), null);
});

test("a game drawn in software counts as that alone, never its frames' bucket", () => {
  assert.equal(framesEvent('desktop-chrome', SOFTWARE), 'frames2/desktop-chrome/software');
  assert.deepEqual(readFramesPath('frames2/desktop-other/software'), { device: 'desktop-other', bucket: SOFTWARE, worst: null });
  assert.equal(readFramesPath('frames2/desktop-chrome/software/deal'), null);
});

test('counts of the older generation (by 50 ms, no begin) are no frames of this one: old and new never mix', () => {
  assert.equal(readFramesPath('frames/ios/smooth'), null);
  assert.equal(readFramesPath('frames/android/some/reveal'), null);
  assert.equal(readFramesPath('frames3/ios/smooth'), null);
});

/** A browser's animation frames, stepped by hand: `step(ms)` draws the next frame `ms` after the last. */
function fakeClock() {
  let t = 0;
  let next: ((t: number) => void) | null = null;
  let seen = true;
  const clock: FrameClock = {
    frame: (cb) => ((next = cb), 1),
    cancel: () => void (next = null),
    now: () => t,
    seen: () => seen,
  };
  return {
    clock,
    step(ms: number, times = 1) {
      for (let i = 0; i < times; i++) {
        t += ms;
        // (Hidden, a browser draws nothing.)
        if (!seen) continue;
        const cb = next;
        next = null;
        cb?.(t);
      }
    },
    running: () => next !== null,
    hide(h: boolean) {
      seen = !h;
    },
  };
}

test('frames are measured only while a game is under way, and its verdict goes once, as it ends', () => {
  const c = fakeClock();
  const out: Verdict[] = [];
  const f = new GameFrames(c.clock, (v) => out.push(v));
  // The lobby: nothing runs.
  f.at(null);
  assert.equal(c.running(), false);
  f.at('deal');
  c.step(16, 600);
  f.at('question');
  c.step(16, 1200);
  f.at('reveal');
  c.step(200);
  c.step(16, 300);
  assert.equal(out.length, 0, 'nothing goes while the game is on');
  f.at(null);
  assert.equal(c.running(), false, 'the loop stops with the game');
  assert.deepEqual(out, [{ bucket: 'smooth', worst: null }]);
  // The next game is a tally of its own.
  f.at('deal');
  c.step(16, 2000);
  c.step(400, 3);
  f.end();
  assert.deepEqual(out[1], { bucket: 'some', worst: 'deal' });
});

test('the time a page is hidden is no frame, however long', () => {
  const c = fakeClock();
  const out: Verdict[] = [];
  const f = new GameFrames(c.clock, (v) => out.push(v));
  f.at('question');
  c.step(16, 1500);
  c.hide(true);
  f.shown();
  assert.equal(c.running(), false, 'nothing runs unseen');
  c.step(16, 5000);
  c.hide(false);
  f.shown();
  c.step(16, 1);
  c.step(16, 1500);
  f.end();
  assert.deepEqual(out, [{ bucket: 'smooth', worst: null }]);
});

test('a game left before 20 seconds were seen counts nothing', () => {
  const c = fakeClock();
  const out: Verdict[] = [];
  const f = new GameFrames(c.clock, (v) => out.push(v));
  f.at('deal');
  c.step(100, 100);
  f.end();
  assert.deepEqual(out, []);
});

test("a game's begin runs from the state change that starts it, so building its screen counts, and lasts its first seconds", () => {
  const c = fakeClock();
  const out: Verdict[] = [];
  const f = new GameFrames(c.clock, (v) => out.push(v));
  f.at('deal');
  // The game screen built: 300 ms to the first frame.
  c.step(300);
  c.step(16, 60);
  // A hitch in the first hand's deal, still within the begin.
  c.step(200);
  c.step(16, Math.ceil(BEGIN_MS / 16));
  // One after it is the deal's.
  c.step(100);
  f.at('question');
  c.step(16, 1300);
  f.end();
  assert.deepEqual(out, [{ bucket: 'some', worst: 'begin' }]);
});

test("the first frame's own time can be from before the screen was built: the build is timed by the clock", () => {
  let t = 0;
  let next: ((t: number) => void) | null = null;
  const clock: FrameClock = { frame: (cb) => ((next = cb), 1), cancel: () => void (next = null), now: () => t, seen: () => true };
  const out: Verdict[] = [];
  const f = new GameFrames(clock, (v) => out.push(v));
  f.at('deal');
  // 600 ms building; the frame then says it was due 16 ms in.
  t = 600;
  next!(16);
  for (let i = 0; i < 1250; i++) {
    t += 16;
    next!(t);
  }
  f.end();
  // 600 ms of 20.6 s, some; counted again from the frame's own time, 1.2 s of 21.2, it would be many.
  assert.deepEqual(out, [{ bucket: 'some', worst: 'begin' }]);
});

test('a page hidden as the game starts times no build: its first frame then is no measure of it', () => {
  const c = fakeClock();
  const out: Verdict[] = [];
  const f = new GameFrames(c.clock, (v) => out.push(v));
  c.hide(true);
  f.at('deal');
  c.step(5_000);
  c.hide(false);
  f.shown();
  c.step(16, 1500);
  f.end();
  assert.deepEqual(out, [{ bucket: 'smooth', worst: null }]);
});

test('a game counts as the page is hidden, and not again when it comes back and the game ends', () => {
  const c = fakeClock();
  const out: Verdict[] = [];
  const f = new GameFrames(c.clock, (v) => out.push(v));
  f.at('question');
  c.step(16, 1500);
  c.hide(true);
  f.shown();
  f.leave();
  assert.deepEqual(out, [{ bucket: 'smooth', worst: null }], 'counted at once: a phone may drop the tab');
  c.hide(false);
  f.shown();
  f.at('reveal');
  assert.equal(c.running(), false, 'nothing more of that game is measured');
  c.step(16, 1500);
  f.leave();
  f.at(null);
  assert.equal(out.length, 1);
  // The next game is counted again.
  f.at('deal');
  c.step(16, 1500);
  f.at(null);
  assert.equal(out.length, 2);
});

test('a game hidden before 20 seconds were seen carries on when it comes back, counted once', () => {
  const c = fakeClock();
  const out: Verdict[] = [];
  const f = new GameFrames(c.clock, (v) => out.push(v));
  f.at('question');
  c.step(16, 800);
  c.hide(true);
  f.shown();
  f.leave();
  assert.deepEqual(out, []);
  c.hide(false);
  f.shown();
  c.step(16, 800);
  f.at(null);
  assert.deepEqual(out, [{ bucket: 'smooth', worst: null }]);
});
