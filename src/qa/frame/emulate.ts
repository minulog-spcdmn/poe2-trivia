// A frame of the QA desk pretends to be the device of its size (../sizes.ts):
// its pixel ratio, and a touch screen's lack of hover and its coarse pointer
// (or a mouse's hover and fine pointer, whatever the desk itself runs on).
// The game asks in three ways: window.devicePixelRatio, matchMedia, and CSS
// @media rules (the PostCSS step in vite.config.ts puts every :hover in one).
// matchMedia and the stylesheets get the device's features written into
// their queries as always-true or always-false tests, so a query that also
// asks about width still asks the real frame. The lab's reduced-motion
// switch (src/lab/motion.ts) works the same way.
//
// Only an approximation: the page is still drawn at the desk's own pixel
// ratio, a mouse stays a mouse (pointerType), and image sets pick by the
// real ratio. The sweep (scripts/sweep.mjs) is the real thing: each size in a
// browser emulating that device.
//
// Imported before any module of the game, which reads some of these once.

import type { Size } from '../sizes.ts';
import { realFrame } from './freeze.ts';

/** Always true and always false on a screen, valid anywhere a media feature is. */
const ALWAYS = '(min-width: 0px)';
const NEVER = '(max-width: 0px)';

/** The device's answer for each media feature it decides, as a test of a feature's value. */
function features(size: Size): [RegExp, (value: string) => boolean][] {
  const hover = !size.touch;
  const pointer = size.touch ? 'coarse' : 'fine';
  const dppx = (v: string) => {
    const m = /^([\d.]+)\s*(dppx|x|dpi|dpcm)?$/.exec(v.trim());
    if (!m) return NaN;
    const n = Number(m[1]);
    return m[2] === 'dpi' ? n / 96 : m[2] === 'dpcm' ? (n * 2.54) / 96 : n;
  };
  return [
    [/\(\s*(?:any-)?hover\s*:\s*([a-z]+)\s*\)/g, (v) => (v === 'hover') === hover],
    [/\(\s*(?:any-)?pointer\s*:\s*([a-z]+)\s*\)/g, (v) => v === pointer],
    [/\(\s*min-resolution\s*:\s*([^)]+)\)/g, (v) => size.dpr >= dppx(v)],
    [/\(\s*max-resolution\s*:\s*([^)]+)\)/g, (v) => size.dpr <= dppx(v)],
    [/\(\s*resolution\s*:\s*([^)]+)\)/g, (v) => size.dpr === dppx(v)],
    [/\(\s*-webkit-min-device-pixel-ratio\s*:\s*([^)]+)\)/g, (v) => size.dpr >= Number(v)],
    [/\(\s*-webkit-max-device-pixel-ratio\s*:\s*([^)]+)\)/g, (v) => size.dpr <= Number(v)],
  ];
}

/** `query` with the device's features answered (the rest left to the frame). */
export function answered(query: string, size: Size): string {
  let out = query;
  for (const [re, test] of features(size)) out = out.replace(re, (_, v: string) => (test(v) ? ALWAYS : NEVER));
  return out;
}

function rewrite(rules: CSSRuleList, size: Size) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) {
      const text = rule.media.mediaText;
      const next = answered(text, size);
      if (next !== text) rule.media.mediaText = next;
    }
    if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) rewrite((rule as CSSGroupingRule).cssRules, size);
  }
}

/** From now on, this frame answers as `size`'s device. */
export function emulate(size: Size) {
  Object.defineProperty(window, 'devicePixelRatio', { get: () => size.dpr, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => (size.touch ? 5 : 0), configurable: true });
  // A phone's scrollbar shows over the page only while it scrolls, and takes no room.
  if (size.touch) {
    const style = document.createElement('style');
    style.textContent = 'html { scrollbar-width: none; scrollbar-gutter: auto; }';
    document.head.append(style);
  }

  const real = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => real(answered(query, size));

  const rewriteAll = () => {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        rewrite(sheet.cssRules, size);
      } catch {
        /* not readable (another origin): the game has none */
      }
    }
  };
  // Stylesheets come and go as components load (and, in dev, as they reload).
  let queued = false;
  const soon = () => {
    if (queued) return;
    queued = true;
    realFrame(() => {
      queued = false;
      rewriteAll();
    });
  };
  new MutationObserver(soon).observe(document.head, { childList: true, subtree: true, characterData: true });
  document.addEventListener('load', soon, true);
  rewriteAll();
}
