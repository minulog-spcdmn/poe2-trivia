// The privacy page's "Stop counting" / "Zählung abschalten"
// (lib/countOptOut.ts), in its German section and its English one. Without
// JavaScript the switches stay hidden, and the text around them never
// mentions them.

import { OPT_OUT_KEY, countOptedOut, privacySignal, setCountOptedOut, switchText } from '../lib/countOptOut.ts';
import { onStoredElsewhere } from '../lib/storage.ts';

const toggles = [...document.querySelectorAll<HTMLElement>('[data-count-toggle]')];
let failed = false;

function show() {
  for (const el of toggles) {
    const lang = el.closest('[lang]')?.getAttribute('lang') === 'en' ? 'en' : 'de';
    const t = switchText(lang, { out: countOptedOut(), signal: privacySignal(), failed });
    const state = el.querySelector('.state');
    const button = el.querySelector('button');
    if (!state || !button) continue;
    state.textContent = t.state;
    button.hidden = t.button === null;
    button.textContent = t.button ?? '';
    el.hidden = false;
  }
}

for (const el of toggles) {
  el.querySelector('button')?.addEventListener('click', () => {
    failed = !setCountOptedOut(!countOptedOut());
    show();
  });
}
// Another tab may set it too.
onStoredElsewhere({ [OPT_OUT_KEY]: show });
show();
