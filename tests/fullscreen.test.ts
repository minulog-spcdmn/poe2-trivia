import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fullscreenKeys, installHow, isDesktop, isFullscreen, surelyFullscreen, type Env } from '../src/lib/fullscreen.ts';

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
    innerHeight: 970,
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

test('a Mac fullscreen window stopping below the notch still counts', () => {
  const mac = { userAgent: MAC, screen: { width: 1512, height: 982 }, outerWidth: 1512 };
  assert.equal(isFullscreen(env({ ...mac, outerHeight: 950 })), true);
  assert.equal(isFullscreen(env({ ...mac, outerHeight: 875 })), false);
  assert.equal(isFullscreen(env({ outerWidth: 1920, outerHeight: 1050 })), false);
});

test('only a window without toolbars is surely fullscreen: a maximized one filling the screen keeps its scrollbar', () => {
  const fills = { outerWidth: 1920, outerHeight: 1080 };
  assert.equal(surelyFullscreen(env({ ...fills, innerHeight: 1080 })), true);
  assert.equal(surelyFullscreen(env({ ...fills, innerHeight: 990 })), false);
  assert.equal(isFullscreen(env({ ...fills, innerHeight: 990 })), true);
  assert.equal(surelyFullscreen(env({ innerHeight: 1056 })), false);
  assert.equal(surelyFullscreen(env({ fullscreenElement: {} })), true);
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

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_WEBVIEW = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36';
const INSTAGRAM = `${IPHONE} Instagram 350.0.0.0`;

test('a phone or tablet is told how to add the game to its home screen, until it has', () => {
  assert.equal(installHow(env({ userAgent: ANDROID, media: [] })), 'android');
  assert.equal(installHow(env({ userAgent: IPHONE, media: [] })), 'ios');
  assert.equal(installHow(env({ userAgent: MAC, maxTouchPoints: 5, media: [] })), 'ios');
  assert.equal(installHow(env({ userAgent: ANDROID, media: ['(display-mode: fullscreen)'] })), null);
  assert.equal(installHow(env({ userAgent: ANDROID, media: ['(display-mode: standalone)'] })), null);
  assert.equal(installHow(env({ userAgent: IPHONE, media: [], standalone: true })), null);
});

test("no home screen tip on a desktop, a Chromebook or an app's own browser", () => {
  assert.equal(installHow(env()), null);
  assert.equal(installHow(env({ userAgent: MAC })), null);
  assert.equal(installHow(env({ userAgent: CHROMEBOOK })), null);
  assert.equal(installHow(env({ userAgent: ANDROID_WEBVIEW, media: [] })), null);
  assert.equal(installHow(env({ userAgent: INSTAGRAM, media: [] })), null);
});
