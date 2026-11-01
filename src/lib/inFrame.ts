// Measuring what has just mounted or changed, in the frame's animation frame
// rather than there and then. Read as a screen mounts (an action, an effect,
// a MutationObserver's callback), a size has the browser lay the new screen
// out in the middle of being made, and again once it is: a turn's banner
// fitted to its line, the scoreboard's names to their rows, each held a
// screen change's frame up by 6 to 18 ms at 4K (traced, #331). In the
// animation frame the backdrop's own reads have laid the page out once
// already (whatever reads first pays for it), so a read there is free, and
// it's still before the frame is painted: nothing shows unfitted.

/**
 * Runs `f` once the fonts the page uses are in, asked in the next animation
 * frame: asking whether they are (document.fonts.ready) has Chrome lay the
 * page out there and then, as a size does. Asked there, the fonts the frame
 * has just been laid out with are counted, a font only a new title asks for
 * among them. Returns what takes it back.
 */
export function onceFontsIn(f: () => void): () => void {
  let live = true;
  const asked = requestAnimationFrame(() => void document.fonts?.ready.then(() => live && f()));
  return () => {
    live = false;
    cancelAnimationFrame(asked);
  };
}

/**
 * Runs `f` in the next animation frame, once however often it's asked for
 * before then. `soon` asks; `cancel` takes back what's asked.
 */
export function inFrame(f: () => void): { soon: () => void; cancel: () => void } {
  let asked = 0;
  return {
    soon() {
      if (asked) return;
      asked = requestAnimationFrame(() => {
        asked = 0;
        f();
      });
    },
    cancel() {
      cancelAnimationFrame(asked);
      asked = 0;
    },
  };
}
