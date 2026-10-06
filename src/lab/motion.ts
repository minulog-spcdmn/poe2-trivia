// The lab's "reduced motion" switch. The game reads the system setting in two
// ways: matchMedia (most of it once, as a module or component loads) and CSS
// @media rules. With the switch on, both answer "reduce": matchMedia through a
// wrapper, and the stylesheets by rewriting their media rules (new ones too,
// as components load). It is imported first (src/lab/main.ts), before any
// module of the game asks, and switching it reloads the page.

import { readStored, writeStored } from '../lib/storage';

const NAME = 'labReduceMotion';
/** The lab pretends the system asks for reduced motion. */
export const reduceMotion = readStored(NAME) === '1';

export function setReduceMotion(on: boolean) {
  writeStored(NAME, on ? '1' : '0');
  location.reload();
}

const REDUCE = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/g;
const NO_PREFERENCE = /\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/g;
/** Always true and always false on a screen, valid anywhere a media feature is. */
const ALWAYS = '(min-width: 0px)';
const NEVER = '(max-width: 0px)';

function rewrite(rules: CSSRuleList) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) {
      const text = rule.media.mediaText;
      const next = text.replace(REDUCE, ALWAYS).replace(NO_PREFERENCE, NEVER);
      if (next !== text) rule.media.mediaText = next;
    }
    if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) rewrite((rule as CSSGroupingRule).cssRules);
  }
}

function rewriteAll() {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      rewrite(sheet.cssRules);
    } catch {
      /* not readable (another origin): the game has none */
    }
  }
}

if (reduceMotion) {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => {
    const list = real(query);
    if (!/prefers-reduced-motion/.test(query)) return list;
    const matches = /reduce/.test(query) && !/no-preference/.test(query);
    return new Proxy(list, {
      get(target, key) {
        if (key === 'matches') return matches;
        const v = Reflect.get(target, key, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  };
  // Stylesheets come and go as components load (and, in dev, as they reload).
  let queued = false;
  const soon = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      rewriteAll();
    });
  };
  new MutationObserver(soon).observe(document.head, { childList: true, subtree: true, characterData: true });
  document.addEventListener('load', soon, true);
  rewriteAll();
}
