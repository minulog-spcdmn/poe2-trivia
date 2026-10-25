// Injected after the summoning: each line layer drawn at 4x and averaged down
// (coverage, then the linear-light remap) into a canvas of the device's size.
async (dpr) => {
  const S = 4, EXP = 0.69;
  const svgs = [...document.querySelectorAll('.summon .layer > svg:not(.glow)')];
  for (const svg of svgs) {
    const w = svg.clientWidth, h = svg.clientHeight;
    if (!w || !h || !svg.querySelector('path,circle')) continue;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    const clone = svg.cloneNode(true);
    const src = [...svg.querySelectorAll('*')], dst = [...clone.querySelectorAll('*')];
    src.forEach((el, i) => {
      const cs = getComputedStyle(el), d = dst[i];
      for (const p of ['fill', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity', 'visibility', 'display', 'fill-rule']) d.style.setProperty(p, cs.getPropertyValue(p));
      d.style.setProperty('stroke', cs.stroke === 'none' ? 'none' : '#fff');
      if (cs.fill !== 'none') d.style.setProperty('fill', '#fff');
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', W * S);
    clone.setAttribute('height', H * S);
    clone.removeAttribute('style');
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    const img = new Image();
    img.src = url;
    await img.decode();
    const big = new OffscreenCanvas(W * S, H * S).getContext('2d', { willReadFrequently: true });
    big.drawImage(img, 0, 0);
    const a = big.getImageData(0, 0, W * S, H * S).data;
    const color = getComputedStyle(svg).color.match(/\d+(\.\d+)?/g).map(Number);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const out = g.createImageData(W, H);
    const o = out.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let j = 0; j < S; j++) { let r = ((y * S + j) * W * S + x * S) * 4 + 3; for (let i = 0; i < S; i++, r += 4) sum += a[r]; }
      const cov = sum / (S * S * 255);
      const k = (y * W + x) * 4;
      o[k] = color[0]; o[k + 1] = color[1]; o[k + 2] = color[2];
      o[k + 3] = Math.round(255 * Math.pow(cov, EXP));
    }
    g.putImageData(out, 0, 0);
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    svg.replaceWith(c);
    URL.revokeObjectURL(url);
  }
  return svgs.length;
}
