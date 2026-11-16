// The lab's "held still" switch: the still mode (src/lib/still.ts), which
// the checks run in and no player gets, to look at by hand. With the switch
// on, the page is marked as this loads; it is imported first (src/lab/main.ts
// and the other tuning pages'), before any module of the game reads the
// mark, and switching it reloads the page.

import { readStored, writeStored } from '../lib/storage';

const NAME = 'labReduceMotion';
/** The lab holds the page still. */
export const reduceMotion = readStored(NAME) === '1';

export function setReduceMotion(on: boolean) {
  writeStored(NAME, on ? '1' : '0');
  location.reload();
}

if (reduceMotion) document.documentElement.setAttribute('data-still', '');
