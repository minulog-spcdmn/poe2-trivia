// The QA desk (qa.html): every scene of the game (src/qa/scenes), shown one
// at a time in the real app, walked with the arrow keys (docs/qa.md). The
// same page is the desk and each of its frames (qa.html?frame=<slot>&...).
// Either way it first marks the page for storage (src/lib/storage.ts' QA),
// before anything that reads storage loads: so nothing is imported here but
// the channel, and the rest comes in after. Dev server and beta only.

import { BETA } from '../lib/channel.ts';

if (!(import.meta.env.DEV || BETA)) throw new Error('The QA desk only runs on the dev server and the beta.');

const asked = new URLSearchParams(location.search);
const slot = asked.get('frame');
document.documentElement.dataset.qa = slot === null ? 'desk' : slot.replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'frame';
if (slot !== null) void import('./frame/boot.ts').then(({ boot }) => boot(asked));
else void import('./desk/start.ts');
