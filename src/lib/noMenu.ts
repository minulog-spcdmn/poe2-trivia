// What a press would bring up of the browser's own, page-wide, that the
// game has no use for: its menu on a right click, an image's ghost on a
// drag. Installed by the game's page (src/main.ts) and by the QA desk's
// frames as they mount the game (src/qa/frame/boot.ts and piece.ts,
// src/qa/live/seat.ts), so a bench presses as the game does.

/** What the last press was made with: Safari's contextmenu is a plain MouseEvent, with no pointer type to read. */
let pressedWith = '';

export function installNoMenu() {
  addEventListener('pointerdown', (e) => (pressedWith = e.pointerType), { capture: true, passive: true });
  // No browser menu on a right click: it brings the system's cursor, and the
  // game has no use for it. Text fields keep theirs, where it's how many
  // paste, and links theirs (open in a new tab, copy the address). The codes
  // players pass on (data-copy: the room code, the sync code) keep theirs
  // only when held with a finger or a pen: there the same event is a long
  // press, and preventing it takes away the Copy that Android Chrome shows
  // over the selection. A mouse has no need of it on them (a click selects
  // the whole code, or copies the room code outright), so a right click
  // there stays without a menu, as everywhere else.
  addEventListener('contextmenu', (e) => {
    const on = e.target as Element | null;
    if (on?.closest('input, textarea, [contenteditable], a[href]')) return;
    if (pressedWith !== 'mouse' && on?.closest('[data-copy]')) return;
    e.preventDefault();
  });
  // No image lifts off the page as a ghost when pressed and moved: nothing in
  // the game is dropped anywhere. (A dragstart, not draggable="false" on each,
  // so an image added later is covered too.)
  addEventListener('dragstart', (e) => {
    if (e.target instanceof HTMLImageElement) e.preventDefault();
  });
}
