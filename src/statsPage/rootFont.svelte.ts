// The root's font size in px, kept as the screen changes: Analytics sizes
// the root from the screen, so a chart's
// SVG labels, and the room left for them, grow with the text around them.
// The board sizes it by a class on the root (Analytics' html.board), which
// no resize comes with where full screen isn't had (Back into it, a
// reload, an iPad), so a change of class reads it again too.
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
    const classed = new MutationObserver(read);
    classed.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      removeEventListener('resize', read);
      classed.disconnect();
    };
  });
  return {
    /** The root's font size, in px. */
    get px() {
      return px;
    },
    /** The size of a chart's labels, in px. */
    get label() {
      return Math.round(px * (phone ? 0.85 : 1.05));
    },
  };
}
