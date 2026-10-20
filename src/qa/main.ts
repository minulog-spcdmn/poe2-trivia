// The QA desk (qa.html): a bench for each thing of the game's to try out
// (src/qa/benches), live, in every state that matters (docs/qa.md). The
// same page is the desk, each of its frames (qa.html?frame=<slot>&...: a
// scene's, or with &b= a piece's) and each seat of a live room (qa.html?live).
// Either way it first marks the page for storage (src/lib/storage.ts' QA),
// before anything that reads storage loads: so nothing is imported here but
// the channel, and the rest comes in after. Dev server and beta only.

import { BETA, LOCAL } from '../lib/channel.ts';

if (!(import.meta.env.DEV || BETA)) throw new Error('The QA desk only runs on the dev server and the beta.');

const asked = new URLSearchParams(location.search);
const slot = asked.get('frame');

/**
 * A frame that couldn't start says why: on the page, to the desk, and to a
 * shot of it (window.__qa, the dev server's /__qa/shot). On the code before
 * this change (the desk's before and after) that's a scene or a piece using
 * something only the change has.
 */
function failed(e: unknown) {
  console.error(e);
  const error = (e instanceof Error ? e.message : String(e)).split('\n')[0];
  const p = document.createElement('p');
  p.textContent = `This can't show here: ${error}`;
  p.style.cssText = 'margin: 0; padding: 1.5rem; font: 15px/1.5 sans-serif; color: #e0c9a6; background: #0a0908; min-height: 100vh; box-sizing: border-box;';
  document.documentElement.style.background = '#0a0908';
  document.body.style.margin = '0';
  document.body.replaceChildren(p);
  (window as Window & { __qa?: unknown }).__qa = { failed: error };
  void import('./messages.ts').then(({ deskOrigin }) => parent !== window && parent.postMessage({ qa: 'failed', slot: slot ?? '', error }, deskOrigin(asked)));
}

// A seat of a live room ("Play from here", ./live) keeps the storage its frame's name gives it (storage.ts' QA_SEAT).
// (Only in the dev server's channel and the beta's, where it gets rooms of its own: never among the live game's, as under npm run dev:live.)
if (asked.has('live')) {
  if (!(BETA || LOCAL)) throw new Error("A live seat of the QA desk runs only in the dev server's channel and the beta's, never the live game's.");
  void import('./live/seat.ts').then(({ seat }) => seat());
}
else {
  document.documentElement.dataset.qa = slot === null ? 'desk' : slot.replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'frame';
  if (slot !== null && asked.has('b')) import('./frame/piece.ts').then(({ bootPiece }) => bootPiece(asked)).catch(failed);
  else if (slot !== null) import('./frame/boot.ts').then(({ boot }) => boot(asked)).catch(failed);
  else void import('./desk/start.ts');
}
