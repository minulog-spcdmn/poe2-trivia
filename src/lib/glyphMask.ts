// An element's text as a shape: each glyph drawn at the place the browser
// laid it out, for masks that follow the letters (the backdrop's drop shadows,
// lib/backdropDropShadow.ts; the dithered glows, lib/ditheredGlow.ts).

export type Glyph = { ch: string; cx: number; cy: number; el: Element };

/**
 * The text glyphs inside `node` with their centres in local px, from the
 * browser's own layout. `accept` can leave out the text of some elements.
 */
export function glyphsOf(
  node: HTMLElement,
  toLocal: (x: number, y: number) => [number, number],
  accept?: (el: Element) => boolean,
): Glyph[] {
  const glyphs: Glyph[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    const el = t.parentElement;
    if (!el || (accept && !accept(el))) continue;
    const text = t.data;
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      range.setStart(t, i);
      range.setEnd(t, i + 1);
      const r = range.getBoundingClientRect();
      if (!r.width) continue;
      const [cx, cy] = toLocal(r.left + r.width / 2, r.top + r.height / 2);
      glyphs.push({ ch: text[i], cx, cy, el });
    }
  }
  return glyphs;
}

function textTransform(ch: string, tt: string) {
  if (tt === 'uppercase') return ch.toUpperCase();
  if (tt === 'lowercase') return ch.toLowerCase();
  return ch;
}

/** Draws the glyphs in black, each in its own element's font, through the context's current transform. */
export function drawGlyphs(ctx: CanvasRenderingContext2D, glyphs: Glyph[]) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  let last: Element | null = null;
  let ls = 0;
  let tt = '';
  for (const g of glyphs) {
    if (g.el !== last) {
      last = g.el;
      const cs = getComputedStyle(g.el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ls = parseFloat(cs.letterSpacing) || 0;
      tt = cs.textTransform;
    }
    const ch = textTransform(g.ch, tt);
    const m = ctx.measureText(ch);
    // The glyph's layout box spans the font's ascent + descent (plus the
    // letter-spacing the browser adds after it), centred on its rect.
    const baseline = g.cy + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
    ctx.fillText(ch, g.cx - ls / 2, baseline);
  }
}
