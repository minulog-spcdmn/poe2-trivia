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
// A seat of a live room ("Play from here", ./live) keeps the storage its frame's name gives it (storage.ts' QA_SEAT).
// (Only in the dev server's channel and the beta's, where it gets rooms of its own: never among the live game's, as under npm run dev:live.)
if (asked.has('live')) {
  if (!(BETA || LOCAL)) throw new Error("A live seat of the QA desk runs only in the dev server's channel and the beta's, never the live game's.");
  void import('./live/seat.ts').then(({ seat }) => seat());
}
else {
  document.documentElement.dataset.qa = slot === null ? 'desk' : slot.replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'frame';
  if (slot !== null && asked.has('b')) void import('./frame/piece.ts').then(({ bootPiece }) => bootPiece(asked));
  else if (slot !== null) void import('./frame/boot.ts').then(({ boot }) => boot(asked));
  else void import('./desk/start.ts');
}
