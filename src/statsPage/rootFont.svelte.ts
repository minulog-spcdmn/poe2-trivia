// The root's font size in px, kept as the screen changes: Analytics sizes
// the root from the screen (and the board by its own rule), so a chart's
// SVG labels, and the room left for them, grow with the text around them.
// `phone`: a screen 600px wide or less, where the labels are a size smaller.
// Call it while a component sets up.
export function rootFont() {
  let px = $state(16);
  let phone = $state(false);
  $effect(() => {
    const narrow = matchMedia('(max-width: 600px)');
    const read = () => {
      px = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      phone = narrow.matches;
    };
    read();
    // The board's class on the root changes its size without a resize.
    const seen = new MutationObserver(read);
    seen.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', read);
    return () => {
      seen.disconnect();
      removeEventListener('resize', read);
    };
  });
  return {
    /** The size of a chart's labels, in px. */
    get label() {
      return Math.round(px * (phone ? 0.85 : 1.05));
    },
  };
}
