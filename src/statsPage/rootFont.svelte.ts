// The root's font size in px, kept as the screen changes: Analytics sizes
// the root from the screen, so a chart's
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
    addEventListener('resize', read);
    return () => removeEventListener('resize', read);
  });
  return {
    /** The size of a chart's labels, in px. */
    get label() {
      return Math.round(px * (phone ? 0.85 : 1.05));
    },
  };
}
