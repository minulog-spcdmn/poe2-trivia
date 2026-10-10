import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fullscreenKeys, isDesktop, isFullscreen, type Env } from '../src/lib/fullscreen.ts';

const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const CHROMEBOOK = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

const mouse = ['(hover: hover) and (pointer: fine)'];
const env = (o: Partial<Env> & { media?: string[] } = {}): Env => {
  const media = o.media ?? mouse;
  return {
    outerWidth: 1936,
    outerHeight: 1056,
    screen: { width: 1920, height: 1080 },
    fullscreenElement: null,
    userAgent: WINDOWS,
    maxTouchPoints: 0,
    ...o,
    matches: (q) => media.includes(q),
  };
};

test('a maximized window is not fullscreen; one filling the screen is', () => {
  assert.equal(isFullscreen(env()), false);
  assert.equal(isFullscreen(env({ outerWidth: 1920, outerHeight: 1080 })), true);
  assert.equal(isFullscreen(env({ outerWidth: 1919, outerHeight: 1079 })), true);
  assert.equal(isFullscreen(env({ outerWidth: 960, outerHeight: 1080 })), false);
});

test('fullscreen by the page or the display mode counts too', () => {
  assert.equal(isFullscreen(env({ fullscreenElement: {} })), true);
  assert.equal(isFullscreen(env({ media: [...mouse, '(display-mode: fullscreen)'] })), true);
});

test('desktop: a mouse, and not a phone, an iPad, a Chromebook or an installed app', () => {
  assert.equal(isDesktop(env()), true);
  assert.equal(isDesktop(env({ userAgent: MAC })), true);
  assert.equal(isDesktop(env({ media: [] })), false);
  assert.equal(isDesktop(env({ userAgent: ANDROID })), false);
  assert.equal(isDesktop(env({ userAgent: CHROMEBOOK })), false);
  assert.equal(isDesktop(env({ userAgent: MAC, maxTouchPoints: 5 })), false);
  assert.equal(isDesktop(env({ media: [...mouse, '(display-mode: standalone)'] })), false);
});

test('the Mac gets its own keys', () => {
  assert.equal(fullscreenKeys(env()), 'F11');
  assert.equal(fullscreenKeys(env({ userAgent: MAC })), '⌃⌘F');
});
