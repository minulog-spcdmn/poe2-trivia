// An SVG background tile shown from a bitmap of itself. Chrome draws an SVG
// background image's tiles once more, whole, a while after it first draws
// them, at a moment of its own (any SVG: one of a plain square does it too):
// for the CSS backdrop's grain that's the whole screen again, 1.57M px, as
// likely as not in the middle of a dig (measured by the redraw check,
// docs/qa.md, "Redraws"). A bitmap it draws once. So the SVG is drawn once
// into a canvas at the screen's scale, as Chrome draws it there, and shown
// from that; drawn again when the scale changes (a zoom, another screen).
// Until the bitmap is ready, and where it can't be made, the SVG shows as
// it is.
//
// Its tile is `n` of the screen's pixels, `n` the SVG's size times the
// scale rounded, shown at `n / dpr` CSS px. Where the SVG's size times the
// scale is whole (1, 1.25, 1.5, 2, 3…), that's the SVG's own size, and the
// bitmap is the SVG to the pixel (measured on the GPU). Where it isn't
// (2.625 or 1.125, the eighths: 472.5 px, which no bitmap can be), Chrome
// draws the SVG's tiles at 473 px and lays them at whole pixels, 0, 472,
// 945… A bitmap of 472.5 would be resampled, a quarter of its detail lost.
// One of 473 at 180.19 CSS px comes close: Chrome keeps a background's
// size on a grid of 1/64 CSS px (no nudge of it moves a pixel), so it lays
// the tiles a hundredth of a pixel short, and resamples them only that
// much: 98% of the SVG's detail, the noise 0.1% larger, which no one can
// see in a grain. (One of 2 × 2 tiles, 360 px, would be exact there, but
// isn't worth the code.)

/** Svelte action: `node`'s background image, an SVG its CSS gives it, shown from a bitmap of it at the screen's scale. */
export function bitmapBackground(node: HTMLElement) {
  const svg = /^url\("(data:image\/svg\+xml,[^"]*)"\)$/.exec(getComputedStyle(node).backgroundImage)?.[1];
  if (!svg) return;
  let url = '';
  let run = 0;
  let scale: MediaQueryList | null = null;
  const draw = async () => {
    const mine = ++run;
    const dpr = devicePixelRatio;
    // (Heard again once the scale is no longer this one.)
    scale?.removeEventListener('change', draw);
    scale = matchMedia(`(resolution: ${dpr}dppx)`);
    scale.addEventListener('change', draw);
    try {
      const tile = new Image();
      tile.src = svg;
      await tile.decode();
      const c = document.createElement('canvas');
      // (A whole number of the screen's pixels, shown at that over the scale: above.)
      c.width = Math.round(tile.naturalWidth * dpr);
      c.height = Math.round(tile.naturalHeight * dpr);
      c.getContext('2d')?.drawImage(tile, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>((done) => c.toBlob(done));
      if (!blob || mine !== run) return;
      const next = URL.createObjectURL(blob);
      // Decoded before it's shown, so no frame goes without it.
      const shown = new Image();
      shown.src = next;
      await shown.decode();
      if (mine !== run) return URL.revokeObjectURL(next);
      node.style.backgroundImage = `url("${next}")`;
      node.style.backgroundSize = `${c.width / dpr}px ${c.height / dpr}px`;
      if (url) URL.revokeObjectURL(url);
      url = next;
    } catch {
      // (The SVG stays.)
    }
  };
  void draw();
  return {
    destroy() {
      run++;
      scale?.removeEventListener('change', draw);
      if (url) URL.revokeObjectURL(url);
    },
  };
}
