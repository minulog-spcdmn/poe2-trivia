// What a press would bring up of the browser's own, page-wide, that the
// game has no use for: its menu on a right click, an image's ghost on a
// drag. Installed by the game's page (src/main.ts) and by the QA desk's
// frames as they mount the game (src/qa/frame/boot.ts and piece.ts,
// src/qa/live/seat.ts), so a bench presses as the game does.

export function installNoMenu() {
  // No browser menu on a right click, or on a long press (the same event): it
  // brings the system's cursor, and the game has no use for it. Text fields
  // keep theirs, where it's how many paste, and links theirs (open in a new
  // tab, copy the address). The codes players pass on have none either: a
  // tap or a click copies them (lib/copyPress.svelte.ts).
  addEventListener('contextmenu', (e) => {
    if ((e.target as Element | null)?.closest('input, textarea, [contenteditable], a[href]')) return;
    e.preventDefault();
  });
  // No image lifts off the page as a ghost when pressed and moved: nothing in
  // the game is dropped anywhere. (A dragstart, not draggable="false" on each,
  // so an image added later is covered too.)
  addEventListener('dragstart', (e) => {
    if (e.target instanceof HTMLImageElement) e.preventDefault();
  });
}
