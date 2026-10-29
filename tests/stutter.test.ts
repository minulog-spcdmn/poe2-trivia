import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FrameTally,
  GameFrames,
  MIN_MS,
  bucketOf,
  deviceOf,
  framesEvent,
  readFramesPath,
  type FrameClock,
  type Verdict,
} from '../src/lib/stutter.ts';

test('a game is smooth under 1% of its time in frames over 50 ms, stutters some to 5%, many from there', () => {
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

test('a frame of exactly 50 ms is no stutter; one over it is', () => {
  const t = new FrameTally();
  t.add(50, 'deal');
  t.add(51, 'reveal');
  assert.deepEqual(t.long, { deal: 0, question: 0, reveal: 51 });
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
  assert.equal(framesEvent('ios', { bucket: 'smooth', worst: null }), 'frames/ios/smooth');
  assert.equal(framesEvent('desktop-chrome', { bucket: 'many', worst: 'deal' }), 'frames/desktop-chrome/many/deal');
  assert.deepEqual(readFramesPath('frames/android/some/reveal'), { device: 'android', bucket: 'some', worst: 'reveal' });
  assert.deepEqual(readFramesPath('frames/desktop-other/smooth'), { device: 'desktop-other', bucket: 'smooth', worst: null });
  assert.equal(readFramesPath('frames/toaster/smooth'), null);
  assert.equal(readFramesPath('frames/ios/awful'), null);
  assert.equal(readFramesPath('frames/ios/some/lobby'), null);
  assert.equal(readFramesPath('play/race'), null);
});

/** A browser's animation frames, stepped by hand: `step(ms)` draws the next frame `ms` after the last. */
function fakeClock() {
  let t = 0;
  let next: ((t: number) => void) | null = null;
  let seen = true;
  const clock: FrameClock = {
    frame: (cb) => ((next = cb), 1),
    cancel: () => void (next = null),
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
