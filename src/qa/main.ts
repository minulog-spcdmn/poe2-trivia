// The QA desk (qa.html): every scene of the game (src/qa/scenes), shown one
// at a time in the real app, walked with the arrow keys (docs/qa.md). The
// same page is the desk, each of its frames (qa.html?frame=<slot>&...) and
// each seat of a live room (qa.html?seat).
// Either way it first marks the page for storage (src/lib/storage.ts' QA),
// before anything that reads storage loads: so nothing is imported here but
// the channel, and the rest comes in after. Dev server and beta only.

import { BETA } from '../lib/channel.ts';

if (!(import.meta.env.DEV || BETA)) throw new Error('The QA desk only runs on the dev server and the beta.');

const asked = new URLSearchParams(location.search);
const slot = asked.get('frame');
// A seat of a live room ("Play from here", ./live) keeps the storage its frame's name gives it (storage.ts' QA_SEAT).
if (asked.has('seat')) void import('./live/seat.ts').then(({ seat }) => seat());
else {
  document.documentElement.dataset.qa = slot === null ? 'desk' : slot.replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'frame';
  if (slot !== null) void import('./frame/boot.ts').then(({ boot }) => boot(asked));
  else void import('./desk/start.ts');
}
