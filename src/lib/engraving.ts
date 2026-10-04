// The engraver's hand for the category cards' plates (CardPlate on the
// face, CardBack on the back): points and lines, eight-pointed stars, wavy
// rays and the crescent moon, as SVG path data.

export type Pt = [number, number];

export const f = (v: number) => v.toFixed(2);
export const rad = (a: number) => (a * Math.PI) / 180;
export const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
/** The point at `a` degrees clockwise from the top, `r` from `c`. */
export const at = (c: Pt, a: number, r: number): Pt => [c[0] + r * Math.sin(rad(a)), c[1] - r * Math.cos(rad(a))];
export const seg = (p: Pt, q: Pt) => `M${pt(p)}L${pt(q)}`;

/** An eight-pointed star of radius `r`, its points long and short in turn. */
export const star = (c: Pt, r: number) =>
  'M' +
  Array.from({ length: 16 }, (_, k) => at(c, (k / 16) * 360, k % 4 === 0 ? r : k % 2 === 0 ? r * 0.55 : r * 0.2))
    .map(pt)
    .join('L') +
  'Z';
/** The star's ridges, from its centre out to each point. */
export const ridges = (c: Pt, r: number) => Array.from({ length: 8 }, (_, k) => seg(c, at(c, k * 45, k % 2 ? r * 0.55 : r))).join('');

/**
 * A wavy ray from `r0` to `r1` out of `c` at `a` degrees: a line that
 * swings `amp` either side, a half wave every `half`, in quadratic curves.
 */
export const wavy = (c: Pt, a: number, r0: number, r1: number, amp: number, half: number) => {
  const n = Math.max(1, Math.round((r1 - r0) / half));
  const step = (r1 - r0) / n;
  let d = `M${pt(at(c, a, r0))}`;
  for (let i = 0; i < n; i++) {
    // The control point twice as far out as the wave reaches.
    const m = at(c, a, r0 + (i + 0.5) * step);
    const side = (i % 2 ? -1 : 1) * 2 * amp;
    const ctl: Pt = [m[0] + Math.cos(rad(a)) * side, m[1] + Math.sin(rad(a)) * side];
    d += `Q${pt(ctl)} ${pt(at(c, a, r0 + (i + 1) * step))}`;
  }
  return d;
};

/** A ring of `n` rays about `c` from `r0`, straight and wavy in turn, the straight ones long and short. */
export const glory = (c: Pt, n: number, r0: number, [long, short, wave]: [number, number, number], amp: number, half: number) =>
  Array.from({ length: n }, (_, k) => {
    const a = ((k + 0.5) / n) * 360;
    if (k % 2) return wavy(c, a, r0, wave, amp, half);
    return seg(at(c, a, r0), at(c, a, k % 4 ? short : long));
  }).join('');

/**
 * Luna, about the origin with her horns to the left: a disc of radius `r`
 * less a disc of radius `cut` set `off` to the left. Turn and place her
 * with a transform. Returns her outline, her shading (strokes down the
 * thick of the crescent, its lower part) and where a star sits in her horns.
 */
export const crescent = (r: number, cut: number, off: number) => {
  const x = (r * r - cut * cut + off * off) / (-2 * off);
  const y = Math.sqrt(r * r - x * x);
  const outline = `M${f(x)} ${f(-y)}A${r} ${r} 0 1 1 ${f(x)} ${f(y)}A${cut} ${cut} 0 1 0 ${f(x)} ${f(-y)}Z`;
  const inner = cut - off;
  const shade = Array.from({ length: 6 }, (_, i) => {
    const sx = inner + 0.6 + i * ((r - inner - 1) / 5);
    const y1 = Math.sqrt(Math.max(0, r * r - sx * sx)) - 0.7;
    return y1 > -1 ? seg([sx, -r * 0.14], [sx, y1]) : '';
  }).join('');
  return { outline, shade, star: [-off - 1, 0] as Pt };
};
