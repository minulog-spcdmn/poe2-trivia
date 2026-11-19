// The Slayer aura (lib/auraKinds.ts): the Duelist's Slayer in his blood
// stance, spinning in the red whirlwind the 1.0 reveal showed (a blade that
// spins on itself and drags its wielder round with it). He fights with two
// blades, and both whirl round the token, each on its own plane, sideways
// out from him: worn dark steel (a picture, turned and foreshortened with
// its plane, under the face on the far side of its turn and over it on the
// near side), lit only by the edge that catches the light and by the blood
// round it. Each leaves a slash of light along its swing, a short wet sheen
// of blood behind it, and behind that the cyclone's trail: streaks of the
// swing drawn out along a great part of the turn, each at its own radius
// and of its own length, fading as they go. At rest that is all: the blood
// stays on the steel and in the swirl. It flies only when something
// happens (below): drops thrown off the edges, each stretching in flight
// into a thin tail with a bead at its head, dark where it is thick and
// catching the light where it is wet; and blood landing on his face in
// streaks, near black where it lies thick, thin and see-through at its
// edges, running a little before it fades. Round him the whirlwind of
// blood rises in threads, wide rather than tall. A deep glow seeps out
// from behind the token, and round it the page goes darker, wider than tall
// (slayer.glsl.ts draws the light; the blades, the blood on the face and
// the dark are page layers).
//
// It is never one loop. The blades speed through the near side of each turn
// and ease round the far side; every few seconds one of them flourishes
// (whips round), checks (hitches and goes on), the swing's plane tilts and
// rolls to a new angle, or the blades close up and part again.
//
// He lives on what he kills:
// - arrive: he draws: the blades fade in still and the whirl spins up, the
//   cuts unfurling and the whirlwind gathering;
// - vote: a flourish, both blades whipping round, blood thrown off them;
// - score: the culling strike. The whirl winds up hard, then both blades
//   leave it in two strokes crossing over the token; blood sprays hard off
//   them sideways, arterial jets arcing out and breaking into drops, and
//   is flung across his face, running; a moment on, the blood is drawn in
//   from all round to feed him
//   (leech): the whirlwind pulls in tight and the blades
//   come back round faster. The streak builds it: more whirlwind, faster,
//   the cuts longer and wetter, more jets and more spray, more blood thrown
//   off the edges;
// - miss: the whirl falters, slowing almost to a stop, the blades sagging
//   on their planes and dripping, the steel dull and the whirlwind thin;
// - hurt: the same, harder and longer, the dark closing in, and the blood
//   is his own: a wound opens on his face and bleeds down it, dripping off
//   his chin; with no lives left he stays slow and dull a long while;
// - win: the strike, and the whirlwind at its fullest;
// - touch: a flourish, one blade throwing blood.

import dither from '../../../assets/dither.png';
import { budget, particle } from '../core';
import { Shape } from '../particles';
import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** How far past the token's edge its rim reaches (px). */
const RIM = 3;
/**
 * How far the blade's flat is canted out of its swing's plane (rad): its
 * edge still leads, but the flat is turned enough toward the eye that the
 * blade shows its width on both sides of the turn (flat in the plane, it
 * would be edge on to the eye at one side).
 */
const CANT = 0.7;
/** The whirlwind's threads: at rest, and at most (the shader draws up to 8). */
const WIND = 4;
// (No more than six: stacked any thicker, the threads read as rings.)
const MOST = 6;
/** The whirl's speed at rest on a small token (rad/s), and the cyclone trail's length (rad). */
const SPEED = 1.75;
const TRAIL = 3.6;
/** The culling strike: its wind-up, the stroke, its wake (s), and the second blade's stroke after the first. */
const WINDUP = 0.32;
const STROKE = 0.16;
const DRAWN = 0.6;
const CROSS = 0.1;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Its form on a token `w` px across: the disc's radius (the token and its
 * rim) and the point's on the whirl's plane. A smaller token's blades are
 * shorter for its size, so a row of them doesn't run together and a name
 * beside one isn't struck through.
 */
function form(w: number) {
  const R = w / 2;
  const D = R + RIM;
  return { R, D, E: D + 1 + R * (0.8 + 0.22 * smooth(11, 26, R)) + 1.5 };
}

// A blade, drawn pointing right: pommel, grip, guard at x 56 of 240, the
// blade from 58 to its point. Worn dark steel: the upper bevel catching a
// little light, the lower in shadow, an edge worn bright in places and
// nicked; pitted and scratched (a grain along the blade); blood dried dark
// toward the point. A heavy iron crossguard and a pear pommel, a thick grip
// of black leather. Nothing bright: the light on it is the shader's.
const BLADE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 48" preserveAspectRatio="none">
<defs>
<linearGradient id="u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d9094"/><stop offset=".35" stop-color="#5d6064"/><stop offset="1" stop-color="#3b3d41"/></linearGradient>
<linearGradient id="l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26282b"/><stop offset=".7" stop-color="#1c1d20"/><stop offset="1" stop-color="#4c4d50"/></linearGradient>
<linearGradient id="a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".4" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".05"/></linearGradient>
<linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a0403" stop-opacity="0"/><stop offset=".5" stop-color="#420504" stop-opacity=".8"/><stop offset="1" stop-color="#5c0806" stop-opacity=".95"/></linearGradient>
<linearGradient id="i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c6863"/><stop offset=".4" stop-color="#3c3936"/><stop offset="1" stop-color="#1c1a19"/></linearGradient>
<filter id="g" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency=".35 2.2" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.6 -0.75"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<clipPath id="c"><path d="M58 16L198 18Q222 20 239 24Q222 28 198 30L58 32Z"/></clipPath>
</defs>
<path d="M58 16L198 18Q222 20 239 24Q222 28 198 30L58 32Z" fill="#0b0b0c" stroke="#0b0b0c" stroke-width="1.4" stroke-linejoin="round"/>
<g clip-path="url(#c)">
<rect x="58" y="15" width="182" height="9" fill="url(#u)"/>
<rect x="58" y="24" width="182" height="9" fill="url(#l)"/>
<path d="M62 23.3L176 23.6L176 24.6L62 24.9Z" fill="#141518"/>
<rect x="58" y="15" width="182" height="18" fill="url(#a)"/>
<rect x="58" y="15" width="182" height="18" fill="#000" filter="url(#g)" opacity=".55"/>
<path d="M58 16.4L120 17.2L150 17.5M163 17.7L198 18.3Q215 19.6 230 22" fill="none" stroke="#b9bbbd" stroke-width=".7" stroke-opacity=".55"/>
<path d="M146 30.6Q170 28.6 198 29.6Q222 28 239 24L233 25.2Q215 27.4 196 28.2Q176 27.6 160 29Z" fill="url(#b)"/>
<path d="M120 31L123 29.6L126 31ZM171 30.1L173.5 28.9L176 30Z" fill="#0b0b0c"/>
</g>
<path d="M24 19.2Q38 18.2 51 19.4L51 28.6Q38 29.8 24 28.8Z" fill="#1d1513" stroke="#090606" stroke-width=".7"/>
<path d="M27 19L30.5 29M32 18.8L35.5 29.2M37 18.7L40.5 29.3M42 18.8L45.5 29.2M47 19L50 28.8" stroke="#33251f" stroke-width="1.6"/>
<path d="M50 10Q51 6.5 54.5 5.5L58.5 6.5Q56.5 9 56.8 13L57.2 35Q56.5 39 58.5 41.5L54.5 42.5Q51 41.5 50 38Z" fill="url(#i)" stroke="#0b0a09" stroke-width=".8"/>
<path d="M51.2 11Q52 8 54.6 7.2" fill="none" stroke="#8b8680" stroke-width=".7" stroke-opacity=".5"/>
<rect x="50" y="18.4" width="10" height="11.2" rx="1.4" fill="url(#i)" stroke="#0b0a09" stroke-width=".6"/>
<path d="M24.5 24Q24 16.5 17 15.6Q9.5 16.5 9 24Q9.5 31.5 17 32.4Q24 31.5 24.5 24Z" fill="url(#i)" stroke="#0b0a09" stroke-width=".8"/>
<path d="M11.5 20.5Q13.5 17.6 17 17.4" fill="none" stroke="#8b8680" stroke-width=".7" stroke-opacity=".6"/>
</svg>`;
const BLADE_URL = `data:image/svg+xml,${encodeURIComponent(BLADE_SVG)}`;
/** The guard's place along the picture, and the share of its length that is blade. */
const GUARD_AT = 56 / 240;
const BLADE = (239 - 58) / 240;

// Blood on the face: pictures drawn once, from fixed seeds, so each has its
// own shape. Real blood is near black-red where it lies thick and thin and
// see-through at its edges, where its red shows; wet, it holds a small,
// soft gloss. Never pink or orange, never a flat stamped shape: every drop
// is shaded thick to thin, and the whole is roughened (a turbulence filter
// pushing its edges about) so no outline is a clean curve.
const svgUrl = (body: string, w: number, h: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${body}</svg>`)}`;
/** A small seeded random (mulberry32), so the pictures are the same each time. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const n1 = (v: number) => v.toFixed(1);
/**
 * What every picture of blood shares: `t`, a drop's shading along it (laid
 * over each drop's own length: deep red where it struck and lies thick,
 * thinning to a see-through red at its tail); `r`, the roughening, by
 * `seed`; `s`, a gloss's softening.
 */
const bloodDefs = (seed: number, rough: number) =>
  `<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a040b" stop-opacity=".95"/><stop offset=".3" stop-color="#55060e" stop-opacity=".92"/><stop offset=".7" stop-color="#6e0912" stop-opacity=".7"/><stop offset="1" stop-color="#8a0e16" stop-opacity=".25"/></linearGradient><filter id="r" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".11" numOctaves="2" seed="${seed}"/><feDisplacementMap in="SourceGraphic" scale="${rough}" xChannelSelector="R" yChannelSelector="G"/></filter><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".4"/></filter></defs>`;
/**
 * A drop as it struck, `rr` round at (x, y), drawn out to a point `len` on
 * toward angle `a` (deg): thick where it hit, its tail thinning, and a
 * see-through rim all round where it lies thin.
 */
const teardrop = (x: number, y: number, a: number, rr: number, len: number) =>
  `<path d="M0 ${n1(-rr)}C${n1(len * 0.45)} ${n1(-rr * 0.9)} ${n1(len * 0.78)} ${n1(-rr * 0.2)} ${n1(len)} 0C${n1(len * 0.78)} ${n1(rr * 0.2)} ${n1(len * 0.45)} ${n1(rr * 0.9)} 0 ${n1(rr)}A${n1(rr)} ${n1(rr)} 0 0 1 0 ${n1(-rr)}Z" transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(a)})" fill="url(#t)" stroke="#8a0e16" stroke-opacity=".35" stroke-width="${n1(Math.min(1.4, 0.25 + rr * 0.2))}" stroke-linejoin="round"/>`;
/**
 * Pools of blood, run together into one mass: each (x, y, rx, ry, angle)
 * filled flat deep red, over the same a little larger in see-through red,
 * so the mass is thick through and thin only at its edge. (Shaded one by
 * one they would ring like petals where they overlap.)
 */
const pools = (list: [number, number, number, number, number][]) => {
  const one = (grow: number) =>
    list.map(([x, y, rx, ry, a]) => `<ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(rx + grow)}" ry="${n1(ry + grow)}" transform="rotate(${n1(a)} ${n1(x)} ${n1(y)})"/>`).join('');
  return `<g fill="#8a0e16" fill-opacity=".38">${one(1.3)}</g><g fill="#5a0710" fill-opacity=".85">${one(0.5)}</g><g fill="#40040a">${one(-0.4)}</g>`;
};
/** A soft gloss on a drop of radius `rr` at (x, y), on its upper side. */
const glossOn = (x: number, y: number, rr: number) =>
  `<ellipse cx="${n1(x - rr * 0.2)}" cy="${n1(y - rr * 0.42)}" rx="${n1(rr * 0.42)}" ry="${n1(rr * 0.16)}" fill="#fff" fill-opacity=".32" filter="url(#s)"/>`;

/**
 * Blood flung onto the face toward +x, as a swung blade throws it: picture
 * 120 by 80, struck at (16, 40). One heavy drop hit there and slid on: a
 * broad impact spot drawn out into a long tail that thins to nothing; a
 * second, smaller beside it, and a few satellite drops strung out ahead
 * along the same line, smaller the further they went. Deep red, thick
 * where they struck and see-through where they thin; a soft gloss on the
 * heavy one.
 */
function flungSvg(seed: number) {
  const r = seeded(seed);
  let drops = '';
  const gloss: string[] = [];
  // The heavy drop, and its tail.
  const rr = 7 + 3 * r();
  const tilt = (r() - 0.5) * 8;
  drops += teardrop(16, 40, tilt, rr, rr * (4.5 + 2 * r()));
  gloss.push(glossOn(16 + rr * 0.3, 40, rr * 0.8));
  // A smaller one beside it.
  const side = r() < 0.5 ? -1 : 1;
  const r2 = rr * (0.4 + 0.2 * r());
  const y2 = 40 + side * (rr + 3 + 5 * r());
  drops += teardrop(24 + 10 * r(), y2, tilt + side * (3 + 6 * r()), r2, r2 * (4 + 2 * r()));
  // Satellites strung out ahead.
  const n = 4 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const u = (i + r() * 0.8) / n;
    const x = 52 + 58 * u;
    const y = 40 + (x - 16) * Math.tan((tilt * Math.PI) / 180) + (r() - 0.5) * (4 + 10 * u);
    const s = Math.max(0.6, 2.6 * (1 - 0.7 * u) * (0.5 + 0.6 * r()));
    const len = s * (2 + 2.5 * r());
    if (x + len > 118 || y < 3 + s || y > 77 - s) continue;
    drops += teardrop(x, y, tilt + (r() - 0.5) * 10, s, len);
  }
  return svgUrl(`${bloodDefs(seed % 97, 2)}<g filter="url(#r)">${drops}</g>${gloss.join('')}`, 120, 80);
}

/**
 * A wound's blood where it welled up on the face: picture 80 by 80, its
 * middle at (40, 40). Pools run together, thick and near black, with a
 * few drops spattered round them, thrown off as it was struck.
 */
function woundSvg(seed: number) {
  const r = seeded(seed);
  const mass: [number, number, number, number, number][] = [];
  const gloss: string[] = [];
  for (let i = 0; i < 5; i++) {
    const x = 40 + (r() - 0.5) * 16;
    const y = 40 + (r() - 0.5) * 10;
    const rx = 4 + 6 * r();
    const ry = rx * (0.55 + 0.35 * r());
    mass.push([x, y, rx, ry, (r() - 0.5) * 50]);
    if (i === 1) gloss.push(glossOn(x, y, ry));
  }
  let body = pools(mass);
  const side = r() < 0.5 ? 0 : 180;
  for (let i = 0; i < 14; i++) {
    const a = side + (r() + r() - 1) * 70;
    const d = 12 + 22 * Math.pow(r(), 0.8);
    const x = 40 + Math.cos((a * Math.PI) / 180) * d;
    const y = 40 + Math.sin((a * Math.PI) / 180) * d * 0.8;
    const rr = Math.max(0.35, 1.8 * (1 - d / 40) * (0.4 + 0.6 * r()));
    body += teardrop(x, y, a, rr, rr * (1.4 + 1.8 * r()));
  }
  return svgUrl(`${bloodDefs(seed % 97, 3)}<g filter="url(#r)">${body}</g>${gloss.join('')}`, 80, 80);
}

/**
 * A run of blood down the face (stretched to its length, so drawn 8 by
 * 100): dark down its middle where it runs thick, see-through red at its
 * edges, its sides wavering, thinning as it goes. And the bead at its foot.
 */
const RUN_URL = svgUrl(
  `<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a0a12" stop-opacity=".2"/><stop offset=".35" stop-color="#3a0309" stop-opacity=".8"/><stop offset=".6" stop-color="#2a0206" stop-opacity=".85"/><stop offset="1" stop-color="#7a0a12" stop-opacity=".2"/></linearGradient></defs><path d="M.6 0Q-.2 12 1.6 24Q3.4 37 2 50Q.9 63 2.6 76Q3.6 88 3.1 100L4.9 100Q5.6 88 5.2 76Q4.6 63 5.8 50Q7 37 6.2 24Q5.2 12 7.4 0Z" fill="url(#t)"/>`,
  8,
  100,
);
const BEAD_URL = svgUrl(
  `<defs><radialGradient id="b" cx=".46" cy=".62" r=".56"><stop offset="0" stop-color="#140103"/><stop offset=".55" stop-color="#2a0206"/><stop offset=".85" stop-color="#4e050c" stop-opacity=".85"/><stop offset="1" stop-color="#7a0a12" stop-opacity=".35"/></radialGradient><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".35"/></filter></defs><path d="M5 0C5.6 3.5 9.6 6.2 9.6 9.4A4.6 4.6 0 0 1 .4 9.4C.4 6.2 4.4 3.5 5 0Z" fill="url(#b)"/><ellipse cx="3.6" cy="8.4" rx="1.2" ry=".6" fill="#fff" fill-opacity=".35" filter="url(#s)"/>`,
  10,
  14,
);
const FLUNG = [11, 42, 77, 131, 208, 333].map(flungSvg);
const WOUNDS = [19, 53, 88].map(woundSvg);

/**
 * Flying blood, as light added over the dark page (so dark blood is dim
 * light): fresh, the wearer's own (darker), as it dries in the air, and
 * the gloss on a drop's head.
 */
const RED: [number, number, number] = [0.5, 0.012, 0.02];
const OWN: [number, number, number] = [0.36, 0.008, 0.016];
const DRIED: [number, number, number] = [0.14, 0.003, 0.008];
const GLOSS: [number, number, number] = [0.55, 0.4, 0.38];

/** One of his two blades as it whirls. */
type Blade = {
  /** Its angle on its plane (rad), its own extra speed (rad/s, falling back), and its share of the point's radius. */
  head: number;
  boost: number;
  reach: number;
  /** Its plane: height over width, roll (rad), its centre below the token's (share of the disc's radius); now and where it is going. */
  tilt: number;
  roll: number;
  at: number;
  toTilt: number;
  toRoll: number;
  /** Where in its turn it is fastest (rad): about the near side. */
  phase: number;
  /** Its culling stroke's age (s, null for none) and angle. */
  strike: number | null;
  strikeAngle: number;
  /** How far the strike has it out of the whirl (0 to 1). */
  out: number;
  /** Its two pictures: under the face and over it. */
  far: HTMLImageElement;
  near: HTMLImageElement;
  /** Its speed now (rad/s); the blood owed to the air off its edge (drops); a gush's strength (a flourish's), falling back. */
  speed: number;
  owed: number;
  gush: number;
};

/** Blood on the face: flung across it or welling from a wound, and the runs down from it. */
type Stain = {
  el: HTMLImageElement;
  /** Its age and how long it lasts (s), when it starts fading, and how dark it is at most. */
  age: number;
  life: number;
  fade: number;
  peak: number;
  /** Where it struck (layout px from the box's top left), its angle and its size (px). */
  x: number;
  y: number;
  rot: number;
  w: number;
  h: number;
  /** Where it is struck in the picture (share of its width), and whether it is mirrored across its flight (-1). */
  ox: number;
  flip: number;
  runs: Run[];
};
type Run = {
  trail: HTMLImageElement;
  bead: HTMLImageElement;
  x: number;
  y: number;
  /** Its length at most (px), when it starts and how long it takes to get there (s), its width (px). */
  len: number;
  at: number;
  dur: number;
  w: number;
  /** Whether it drips off the token's edge when it reaches it (and has). */
  drips: boolean;
  dripped: boolean;
};

export function burn(ctx: AuraContext): Burning {
  // The dark round the token (light can't darken): a pool of shadow, wider
  // than tall, fading out past the whirl, dithered (app.css, --dither:
  // imported, since an inline style can't resolve the variable's url) so it
  // can't band, and masked so the dither goes no further than the dark.
  // Sized round the token in px, again when it's drawn at another size; it
  // deepens and spreads by opacity and transform alone.
  const dark = document.createElement('div');
  Object.assign(dark.style, { position: 'absolute', borderRadius: '50%', pointerEvents: 'none', imageRendering: 'pixelated', willChange: 'transform, opacity' });
  ctx.under.append(dark);

  // The face, for the blood that lands on it: the token's own round, so
  // nothing on it shows past its edge; under the blades as they pass in
  // front. Its pictures are made once and reused, moved by transform alone.
  const face = document.createElement('div');
  Object.assign(face.style, { position: 'absolute', inset: '0', borderRadius: '50%', overflow: 'hidden', pointerEvents: 'none' });
  ctx.over.prepend(face);
  const still = (src: string, origin: string) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    Object.assign(img.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', transformOrigin: origin, opacity: '0', maxWidth: 'none' });
    face.append(img);
    return img;
  };
  const spareStains: HTMLImageElement[] = [];
  const spareRuns: [HTMLImageElement, HTMLImageElement][] = [];
  for (let i = 0; i < 6; i++) spareStains.push(still(FLUNG[0], '0 50%'));
  for (let i = 0; i < 5; i++) spareRuns.push([still(RUN_URL, '50% 0'), still(BEAD_URL, '50% 0')]);
  const stains: Stain[] = [];

  const picture = () => {
    const img = document.createElement('img');
    img.src = BLADE_URL;
    img.alt = '';
    img.decoding = 'async';
    Object.assign(img.style, { position: 'absolute', pointerEvents: 'none', transformOrigin: '0 50%', willChange: 'transform, opacity', opacity: '0', maxWidth: 'none' });
    return img;
  };
  const blade = (head: number, reach: number, tilt: number, roll: number, at: number, phase: number): Blade => {
    const b: Blade = {
      head,
      boost: 0,
      reach,
      tilt,
      roll,
      at,
      toTilt: tilt,
      toRoll: roll,
      phase,
      strike: null,
      strikeAngle: 0,
      out: 0,
      far: picture(),
      near: picture(),
      speed: SPEED,
      owed: 0,
      gush: 0,
    };
    ctx.under.append(b.far);
    ctx.over.append(b.near);
    return b;
  };
  // (The right hand's at his waist, the left's a little higher and shorter,
  // on planes of their own, half a turn apart to begin with.)
  const start = Math.random() * Math.PI * 2;
  const blades = [blade(start, 1, 0.3, -0.1, 0.2, Math.PI / 2), blade(start + Math.PI, 0.9, 0.26, 0.14, -0.08, Math.PI / 2 + 0.6)];

  /** The blades' picture size (layout px) and the token size it was made for. */
  let sizedFor = -1;
  let L = 0;
  let H = 0;
  const size = (w: number) => {
    if (Math.abs(w - sizedFor) < 0.25) return;
    sizedFor = w;
    const { R, D, E } = form(w);
    // (Wider than tall: the players above and below are close in a list.)
    const Vx = E * 1.75;
    const Vy = E * 1.05;
    dark.style.inset = `${(R - Vy).toFixed(2)}px ${(R - Vx).toFixed(2)}px`;
    dark.style.background = `radial-gradient(closest-side, rgba(8,0,0,0.72) 0%, rgba(8,0,0,0.58) 35%, rgba(8,0,0,0.28) 62%, rgba(8,0,0,0.09) 82%, rgba(8,0,0,0) 100%), url(${dither})`;
    const mask = 'radial-gradient(closest-side, #000 80%, transparent 100%)';
    dark.style.maskImage = mask;
    dark.style.webkitMaskImage = mask;
    L = (E - (D + 1)) / BLADE;
    // (A small blade is drawn a little thicker for its length, so it stays more than a hairline.)
    H = L * (72 / 240) * Math.min(1.3, Math.max(1, 30 / L));
    for (const b of blades)
      for (const s of [b.far, b.near]) {
        const l = L * b.reach;
        const h = H * (0.85 + 0.15 * b.reach);
        s.style.left = `${R.toFixed(2)}px`;
        s.style.top = `${(R - h / 2).toFixed(2)}px`;
        s.style.width = `${l.toFixed(2)}px`;
        s.style.height = `${h.toFixed(2)}px`;
      }
  };

  /** How many whirlwind threads there are, and are to be, and the whirlwind's own turn. */
  let n = WIND;
  let target = WIND;
  let wind = Math.random() * Math.PI * 2;
  /** The streak's standing glory (0 to 1), a moment's rush of blood. */
  let glory = 0;
  let rush = 0;
  /** How hard the token draws blood in (a kill), falling back. */
  let leech = 0;
  /** How dull and slow it is, how fast that lifts (s), and what it lifts to (out of lives). */
  let dull = 0;
  let dullFor = 1.5;
  let floor = 0;
  /** Extra speed for the whole whirl (rad/s, falling back; below 0 a falter). */
  let boost = 0;
  /** The cuts' length, by share of TRAIL: short when it falters. */
  let trail = 1;
  /** How far drawn the blades are (0 to 1): the whirl spins up from still as he arrives. */
  let drawn = 1;
  let drawing = false;
  /** The strike's wind-up (s left; null for none), and when the blood comes in. */
  let windup: number | null = null;
  let feedAt = Infinity;
  let feedCount = 0;
  /** The second blade's offset behind the first (rad), and where it is going. */
  let gap = Math.PI;
  let toGap = Math.PI;
  /** When the whirl next does something of its own at rest, and when the streak's whirlwind next moves toward rest. */
  let nextMove = rand(2.5, 5);
  let restAt = Infinity;
  let age = 0;
  let fast = false;
  let box = { x: 0, y: 0, w: 32 };

  /** A blade's plane: its centre's offset (px, on a token `D` px in radius), sagging as he falters. */
  const centre = (b: Blade, D: number) => D * (b.at + 0.22 * Math.max(dull, floor));
  /** Where on screen (px from the token's centre) a point at radius `r` and angle `th` on a blade's plane lies. */
  const onPlane = (b: Blade, D: number, r: number, th: number) => {
    const x = r * Math.cos(th);
    const y = centre(b, D) + b.tilt * r * Math.sin(th);
    const c = Math.cos(b.roll);
    const s = Math.sin(b.roll);
    return [c * x - s * y, s * x + c * y];
  };

  /** A drop's weight: most are fine, a few heavy (0.3 to 2.3). */
  const weight = () => 0.3 + 2.1 * Math.pow(Math.random(), 2.1);

  /**
   * One drop of blood in flight, from (x, y) on the page (px): `heavy` its
   * weight (as weight() gives), `sc` the token's scale. A drop stretches as
   * it flies: a bead at its head and a thin tail drawn out behind it (two
   * lights riding together: the tail, and the bead at its front), the
   * faster the longer; heavy ones fly slower, keep their way through the
   * air and fall, a soft gloss on the bead. The finest is a speck of mist
   * that hangs and is gone. `grow`: how much bigger it gets as it flies
   * (toward the eye: more than 1).
   */
  const drop = (x: number, y: number, vx: number, vy: number, heavy: number, sc: number, o: { life?: number; delay?: number; own?: boolean; grow?: number } = {}) => {
    const life = o.life ?? rand(0.3, 0.5) + 0.4 * Math.min(1, heavy);
    const gravity = (120 + 200 * Math.min(1, heavy)) * sc;
    const drag = heavy < 0.55 ? 4.5 : heavy < 1.1 ? 1.5 : 0.5;
    const shade = rand(0.6, 1.3);
    const c = o.own ? OWN : RED;
    const grow = o.grow ?? 1;
    const col = (k: number): [number, number, number] => [c[0] * shade * k, c[1] * shade * k, c[2] * shade * k];
    const base = { vx, vy, life, delay: o.delay, gravity, drag, colorEnd: DRIED, fadeIn: 0.02 };
    if (heavy < 0.55) {
      particle({ ...base, x, y, size: heavy * sc * 0.8, color: col(0.6), shape: Shape.Glow });
      return;
    }
    const bead = heavy * sc * 0.72;
    // The tail: thin, long, its light strongest toward the bead.
    const stretch = 0.05 - 0.012 * Math.min(1.5, heavy);
    particle({ ...base, x, y, size: Math.max(0.3 * sc, bead * 0.36), sizeEnd: bead * 0.28 * grow, color: col(0.75), shape: Shape.Spark, stretch });
    // The bead at its head, a little drawn out itself.
    const hx = x + vx * stretch * 0.45;
    const hy = y + vy * stretch * 0.45;
    particle({ ...base, x: hx, y: hy, size: bead, sizeEnd: bead * 0.85 * grow, color: col(1), shape: Shape.Spark, stretch: 0.008 });
    if (heavy > 1.0)
      particle({ ...base, x: hx - 0.22 * bead, y: hy - 0.3 * bead, size: bead * 0.32, sizeEnd: bead * 0.25 * grow, color: GLOSS, colorEnd: [0.14, 0.06, 0.06], shape: Shape.Spark, stretch: 0.006 });
  };

  /**
   * `count` drops thrown off a blade's edge just behind it, as a swung blade
   * sheds blood: each leaves along the swing at the edge's own speed there
   * (faster toward the point), thrown outward a little, more or less, and
   * `hard` times as hard. At the sides of the turn the swing runs toward the
   * eye or away, so a drop thrown there swells or shrinks as it flies. None
   * starts over the face or flies in across it.
   */
  const shed = (bl: Blade, count: number, hard: number) => {
    const { D, E } = form(box.w);
    const sc = Math.sqrt(box.w / 32);
    const G = D + 1;
    const tip = E * bl.reach;
    const cr = Math.cos(bl.roll);
    const sr = Math.sin(bl.roll);
    const om = Math.max(1.3, bl.speed);
    for (let i = 0; i < count; i++) {
      const r = G + (tip - G) * (1 - 0.8 * Math.pow(Math.random(), 2));
      const th = bl.head - rand(0, 0.32);
      const [x, y] = onPlane(bl, D, r, th);
      const rad = Math.hypot(x, y);
      if (rad < D + 0.5) continue;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const tx = cr * -s - sr * (bl.tilt * c);
      const ty = sr * -s + cr * (bl.tilt * c);
      const ox = cr * c - sr * (bl.tilt * s);
      const oy = sr * c + cr * (bl.tilt * s);
      const heavy = weight();
      const out = rand(0.25, 0.85);
      const spd = om * r * rand(0.6, 1.2) * hard * (1.15 - 0.25 * Math.min(1, heavy));
      // (A little scatter off its line, the fine ones most.)
      const j = rand(-1, 1) * (0.06 + 0.12 * (1 - Math.min(1, heavy)));
      let vx = (tx + out * ox + j * ty) * spd;
      let vy = (ty + out * oy - j * tx) * spd - rand(0, 18) * sc;
      if (vx * x + vy * y < 0.2 * Math.hypot(vx, vy) * rad) {
        // (Flying in across the face: thrown straight out instead.)
        vx = (x / rad) * spd * 0.7;
        vy = (y / rad) * spd * 0.7;
      }
      drop(box.x + x, box.y + y, vx, vy, heavy, sc, { grow: 1 + 0.7 * c });
    }
  };

  /** A few heavy drops falling off a blade's edge, as it sags (a miss). */
  const dripFrom = (bl: Blade, count: number) => {
    const { D, E } = form(box.w);
    const sc = Math.sqrt(box.w / 32);
    for (let i = 0; i < count; i++) {
      const [x, y] = onPlane(bl, D, E * bl.reach * rand(0.6, 0.97), bl.head - rand(0, 0.2));
      if (Math.hypot(x, y) < D + 0.5) continue;
      drop(box.x + x, box.y + y, rand(-6, 6) * sc, rand(0, 12) * sc, rand(1.1, 1.9), sc, { life: rand(0.6, 0.9), delay: rand(0, 0.5) });
    }
  };

  /**
   * The culling strokes' blood: a hard spray off both sides of the token
   * as the strokes cross it, and arterial jets: from a point on the rim
   * each throws a stream that arcs out sideways and breaks into drops, the
   * first fastest, the rest weaker as the pulse spends itself. `k`: the
   * streak, which grows it.
   */
  const burst = (k: number) => {
    const { D } = form(box.w);
    const sc = Math.sqrt(box.w / 32);
    const more = 1 + 0.12 * Math.min(k, 8);
    const count = budget(18 + 7 * Math.min(k, 8));
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      // (Mostly sideways, some up, some down.)
      const a = (side > 0 ? 0 : Math.PI) + side * (rand(-1, 1) * 0.75 - 0.15);
      const at = a + rand(-0.4, 0.4);
      const x = Math.cos(at) * (D + 0.5);
      const y = Math.sin(at) * (D + 0.5);
      const heavy = weight();
      const spd = rand(80, 300) * sc * more * (1.15 - 0.3 * Math.min(1, heavy));
      drop(box.x + x, box.y + y, Math.cos(a) * spd, Math.sin(a) * spd - rand(0, 40) * sc, heavy, sc, { delay: rand(0, 0.1) });
    }
    const jets = 1 + Math.min(3, Math.floor(k / 2));
    for (let j = 0; j < jets; j++) {
      const side = j % 2 === 0 ? (Math.random() < 0.5 ? -1 : 1) : -1;
      const at = (side > 0 ? 0 : Math.PI) + side * rand(-0.8, 0.3);
      const a = (side > 0 ? 0 : Math.PI) - side * rand(0.15, 0.5);
      const x = Math.cos(at) * (D + 0.5);
      const y = Math.sin(at) * (D + 0.5);
      const m = budget(7 + 2 * Math.min(k, 6));
      const start = j * rand(0.05, 0.12);
      for (let i = 0; i < m; i++) {
        const t = i / m;
        const spd = (320 - 200 * t) * sc * more * rand(0.92, 1.08);
        const aa = a + rand(-0.05, 0.05) + 0.25 * side * t;
        drop(box.x + x, box.y + y, Math.cos(aa) * spd, Math.sin(aa) * spd, t < 0.2 ? rand(1.2, 2.0) : weight() * 0.8 + 0.3, sc, { delay: start + t * 0.28, life: rand(0.5, 0.8) });
      }
    }
  };

  /** The wearer's own blood off the token's lower rim: drops gathering and falling, one after another. */
  const bleed = (count: number, over: number) => {
    const { D } = form(box.w);
    const sc = Math.sqrt(box.w / 32);
    for (let i = 0; i < count; i++) {
      const a = Math.PI / 2 + rand(-0.75, 0.75);
      drop(box.x + Math.cos(a) * (D - 1), box.y + Math.sin(a) * (D - 1), rand(-4, 4) * sc, rand(0, 10) * sc, rand(1.0, 2.0), sc, { own: true, life: rand(0.6, 0.9), delay: rand(0, over) });
    }
  };

  /** A hit's spatter: a short spray of his own blood off one side of the token. */
  const spatter = (count: number) => {
    const { D } = form(box.w);
    const sc = Math.sqrt(box.w / 32);
    const side = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < count; i++) {
      const a = (side > 0 ? 0 : Math.PI) + rand(-0.9, 0.6) * side;
      const spd = rand(60, 200) * sc;
      drop(box.x + Math.cos(a) * (D + 0.5), box.y + Math.sin(a) * (D + 0.5), Math.cos(a) * spd, Math.sin(a) * spd - 20 * sc, weight(), sc, { own: true, delay: rand(0, 0.06) });
    }
  };

  /**
   * Blood landing on the face (layout px, `R` the token's radius): blood
   * flung across it, its heavy end at (x, y) from the centre, flying at
   * angle `rot`, `size` across; or, when `wound` is set, a wound's blood
   * welling up there. It lasts `life` s, at most `peak` strong, with `runs`
   * running down from it (each reaching `reach` of R, and dripping off the
   * edge if it gets there, as his `own` blood), after `delay` s.
   */
  const stain = (R: number, x: number, y: number, rot: number, size: number, o: { life: number; peak: number; runs?: number; reach?: number; wound?: boolean; own?: boolean; delay?: number }) => {
    // (The oldest makes way when they are all in use.)
    if (!spareStains.length) end(stains[0]);
    const el = spareStains.pop();
    if (!el) return;
    const pick = o.wound ? WOUNDS : FLUNG;
    el.src = pick[Math.floor(Math.random() * pick.length)];
    const w = size;
    const h = o.wound ? size : size * (80 / 120);
    const ox = o.wound ? 0.5 : 0.15;
    // (Mirrored across its flight half the time, so no two look the same.)
    const flip = Math.random() < 0.5 ? -1 : 1;
    Object.assign(el.style, { width: `${w.toFixed(1)}px`, height: `${h.toFixed(1)}px`, transformOrigin: `${ox * 100}% 50%` });
    const s: Stain = { el, age: -(o.delay ?? 0), life: o.life, fade: o.life * rand(0.45, 0.6), peak: o.peak, x: R + x, y: R + y, rot, w, h, ox, flip, runs: [] };
    for (let i = 0; i < (o.runs ?? 0) && spareRuns.length; i++) {
      const pair = spareRuns.pop();
      if (!pair) break;
      const [trail, bead] = pair;
      const rw = Math.max(1.0, R * rand(0.05, 0.08));
      const len = R * (o.reach ?? 0.5) * rand(0.7, 1.15);
      Object.assign(trail.style, { width: `${rw.toFixed(2)}px`, height: `${len.toFixed(1)}px` });
      Object.assign(bead.style, { width: `${(rw * 1.15).toFixed(2)}px`, height: `${(rw * 1.6).toFixed(2)}px` });
      const sx = R + x + rand(-0.12, 0.12) * size;
      s.runs.push({ trail, bead, x: sx, y: R + y + rand(-0.05, 0.12) * size, len, at: rand(0.15, 0.5), dur: rand(1.0, 2.2), w: rw, drips: (o.reach ?? 0) > 0.9, dripped: false });
    }
    stains.push(s);
  };
  /** A stain gone: its pictures back for the next. */
  const end = (s: Stain | undefined) => {
    if (!s) return;
    s.el.style.opacity = '0';
    spareStains.push(s.el);
    for (const r of s.runs) {
      r.trail.style.opacity = r.bead.style.opacity = '0';
      spareRuns.push([r.trail, r.bead]);
    }
    stains.splice(stains.indexOf(s), 1);
  };
  /** Each stain as it spreads, runs and fades (layout px; `R` the token's radius). */
  const stepStains = (dt: number, R: number) => {
    for (let i = stains.length - 1; i >= 0; i--) {
      const s = stains[i];
      s.age += dt;
      if (s.age >= s.life) {
        end(s);
        continue;
      }
      // It strikes and spreads in a blink, holds, then dries and fades.
      const spread = 0.55 + 0.45 * smooth(0, 0.08, s.age);
      const k = s.peak * Math.min(1, Math.max(0, s.age / 0.03)) * (1 - smooth(s.fade, s.life, s.age));
      s.el.style.opacity = k.toFixed(3);
      s.el.style.transform = `translate(${(s.x - s.ox * s.w).toFixed(2)}px,${(s.y - s.h / 2).toFixed(2)}px) rotate(${s.rot.toFixed(3)}rad) scale(${spread.toFixed(3)},${(spread * s.flip).toFixed(3)})`;
      for (const r of s.runs) {
        // A run gathers, then creeps down, quick at first and slowing as it thins.
        const t = Math.max(0, s.age - r.at) / r.dur;
        const p = Math.min(1, (1 - Math.exp(-3 * t)) / (1 - Math.exp(-3)));
        const l = r.len * p;
        // (The bead gathers as the run sets off, never a ball sitting there before it.)
        r.trail.style.opacity = (t > 0 ? k : 0).toFixed(3);
        r.bead.style.opacity = (k * smooth(0.04, 0.3, p)).toFixed(3);
        r.trail.style.transform = `translate(${(r.x - r.w / 2).toFixed(2)}px,${r.y.toFixed(2)}px) scaleY(${Math.max(0.001, p).toFixed(4)})`;
        r.bead.style.transform = `translate(${(r.x - r.w * 0.575).toFixed(2)}px,${(r.y + l - r.w * 0.85).toFixed(2)}px)`;
        // (Off the token's edge it drops away.)
        if (r.drips && !r.dripped && Math.hypot(r.x - R, r.y + l - R) > R - 1) {
          r.dripped = true;
          const sc = Math.sqrt(box.w / 32);
          const u = box.w / (2 * R);
          drop(box.x + (r.x - R) * u, box.y + (r.y + l - R) * u, 0, 10 * sc, rand(1.3, 1.9), sc, { own: true, life: 0.8 });
        }
      }
    }
  };

  /**
   * Blood drawn in to him (leech): `count` drops from all round the whirl,
   * wide of him, each flying in on a curve with the whirl's turn to the
   * token's rim, where it sinks in.
   */
  const feed = (count: number) => {
    const { D, R, E } = form(box.w);
    const sc = box.w / 32;
    const k = budget(count);
    for (let i = 0; i < k; i++) {
      const th = rand(0, Math.PI * 2);
      const r = rand(D * 1.3, E * 1.4);
      let x = Math.cos(th) * r;
      let y = 0.2 * D + 0.32 * Math.sin(th) * r + rand(-0.4, 0.2) * D;
      // (None from over the face.)
      const out = Math.hypot(x, y);
      if (out < 1.2 * D) {
        x *= (1.2 * D) / Math.max(out, 1e-3);
        y *= (1.2 * D) / Math.max(out, 1e-3);
      }
      const land = Math.atan2(y, x) + 0.5;
      // (Its curve round the outside, never across the face.)
      const cth = Math.atan2(y, x) + 0.35;
      const cr = Math.max(Math.hypot(x, y), 1.35 * D);
      particle({
        x: box.x + x,
        y: box.y + y,
        life: rand(0.45, 0.75),
        delay: rand(0, 0.25),
        size: weight() * 0.75 * Math.sqrt(sc),
        sizeEnd: 0.4 * Math.sqrt(sc),
        color: [1.05, 0.035, 0.045],
        colorEnd: [0.45, 0.01, 0.02],
        shape: Shape.Spark,
        stretch: 0.04,
        fadeIn: 0.15,
        // (Into the rim, not over the face, where red light would only turn its colour pale.)
        seek: {
          cx: box.x + Math.cos(cth) * cr,
          cy: box.y + Math.sin(cth) * cr,
          tx: box.x + Math.cos(land) * (R + 1.5),
          ty: box.y + Math.sin(land) * (R + 1.5),
        },
      });
    }
  };

  const strokeProgress = (b: Blade) => (b.strike === null || b.strike < 0 ? 0 : b.strike < STROKE ? b.strike / STROKE : 1 + (b.strike - STROKE) / DRAWN);

  // The light of each blade: its slash, its cut and its culling stroke.
  const bladeLights = blades.map((bl) =>
    auraShape(ctx, (f, _age, b) => {
      const { D, E } = form(b.w);
      const hc = centre(bl, D);
      const striking = bl.strike !== null && bl.strike >= 0;
      const reach = striking ? 2.4 * D : 0;
      f.hw = Math.max(E * bl.reach + 6, reach) / 0.72;
      f.hh = Math.max(Math.abs(hc) + bl.tilt * E + 0.3 * E * Math.abs(Math.sin(bl.roll)) + 6, reach) / 0.72;
      f.k = 1;
      f.q[0] = D;
      f.q[1] = E * bl.reach;
      f.q[2] = bl.head;
      f.q[3] = hc;
      f.q[4] = TRAIL * trail * drawn * (1 + 0.3 * glory) * (1 - 0.9 * bl.out);
      f.q[5] = 0.5 + 0.5 * glory + rush;
      f.q[6] = Math.max(dull, floor);
      // (A blade's light: its roll, said as its kind; see slayer.glsl.ts.)
      f.q[7] = -2 - bl.roll;
      f.q[9] = strokeProgress(bl);
      f.q[10] = bl.strikeAngle;
      f.q[11] = bl.tilt;
      f.calm = !fast;
    }),
  );
  // The light of the whirlwind and the glow.
  const whirl = auraShape(ctx, (f, _age, b) => {
    const { D, E } = form(b.w);
    f.hw = (Math.max(1.95 * D, E) + 6) / 0.72;
    f.hh = (1.25 * D + 6) / 0.72;
    f.k = 1;
    f.q[0] = D;
    f.q[1] = E;
    f.q[2] = wind;
    f.q[3] = centre(blades[0], D);
    f.q[4] = 0;
    f.q[5] = 0.5 + 0.5 * glory + rush;
    f.q[6] = Math.max(dull, floor);
    f.q[7] = Math.max(0, n) * drawn;
    f.q[9] = 0;
    f.q[10] = 0;
    f.q[11] = leech;
    f.calm = !fast;
  });

  const strike = () => {
    // (Down across the token, the two strokes crossing: one each way.)
    const a = rand(0.42, 0.62);
    const first = Math.random() < 0.5 ? 1 : -1;
    blades[0].strike = 0;
    blades[0].strikeAngle = a * first;
    blades[1].strike = -CROSS;
    blades[1].strikeAngle = -a * first;
  };

  /** Something of the whirl's own at rest, so it never runs as one loop. */
  const move = () => {
    const b = blades[Math.random() < 0.5 ? 0 : 1];
    const pick = Math.random();
    if (pick < 0.3) b.boost = Math.max(b.boost, rand(2.2, 3.4));
    else if (pick < 0.5) b.boost = Math.min(b.boost, -rand(1.0, 1.5));
    else if (pick < 0.8) {
      for (const c of blades) {
        c.toTilt = rand(0.22, 0.38);
        c.toRoll = rand(-0.28, 0.28);
      }
    } else toGap = [Math.PI, 2.3, 0.75, 4.0][Math.floor(Math.random() * 4)];
  };

  return {
    step(dt, b) {
      age += dt;
      box = b;
      size(ctx.el.offsetWidth || b.w);
      const w0 = ctx.el.offsetWidth || b.w;
      const { E } = form(b.w);
      const { D: D0 } = form(w0);

      // The culling strike: the wind-up, then the strokes; the blood bursts
      // off as they cross and is drawn in a moment on.
      if (windup !== null) {
        windup -= dt;
        if (windup <= 0) {
          windup = null;
          strike();
          burst(feedCount);
          feedAt = age + 0.42;
          // The strike flings blood across his face: in from one side,
          // sideways along the swing, heavy where it struck and streaking
          // on finer, above the letter or below it; more on a streak, some
          // running. (Never along the strokes: lines crossing the token
          // would cross it out, a mark of the wrong answer.)
          const R0 = w0 / 2;
          const flung = 1 + Math.min(1, Math.floor(feedCount / 3));
          let below = Math.random() < 0.6 ? 1 : -1;
          for (let i = 0; i < flung; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            stain(R0, side * rand(0.6, 0.8) * R0, below * rand(0.32, 0.55) * R0, (side > 0 ? Math.PI : 0) + rand(-0.3, 0.3) * below, R0 * rand(1.5, 2.0), {
              life: rand(2.6, 3.4),
              peak: 0.92,
              runs: Math.random() < 0.6 ? 1 : 0,
              reach: 0.5,
              delay: STROKE * 0.4 + i * rand(0.04, 0.1),
            });
            below = -below;
          }
        }
      }
      if (age >= feedAt) {
        feedAt = Infinity;
        feed(12 + 3 * Math.min(feedCount, 6));
        leech = 1;
        rush = Math.max(rush, 0.9 + 0.12 * Math.min(feedCount, 6));
      }
      for (const bl of blades) {
        if (bl.strike !== null) {
          bl.strike += dt;
          if (bl.strike > STROKE + DRAWN) bl.strike = null;
        }
        const s = bl.strike;
        bl.out = s === null || s < 0 ? 0 : s < STROKE + 0.15 ? smooth(0, 0.05, s) : 1 - smooth(STROKE + 0.15, STROKE + DRAWN, s);
      }

      // The whirlwind's threads come in and fall away by degrees.
      if (n < target) n = Math.min(target, n + dt * 1.4);
      else if (n > target) n = Math.max(target, n - dt * 0.9);
      if (age >= restAt && target !== WIND) {
        target += target > WIND ? -1 : 1;
        restAt = target === WIND ? Infinity : age + (target > WIND ? 12 : 3);
      }
      if (drawing) {
        drawn = Math.min(1, drawn + dt / 1.3);
        if (drawn >= 1) drawing = false;
      }

      rush *= Math.exp(-dt / 1.2);
      leech *= Math.exp(-dt / 0.9);
      glory *= Math.exp(-dt / 60);
      dull *= Math.exp(-dt / dullFor);
      floor *= Math.exp(-dt / 30);
      boost *= Math.exp(-dt / (boost < 0 ? dullFor : 0.7));
      const hushed = Math.max(dull, floor);
      trail += (Math.min(1, 1 - 0.7 * hushed) - trail) * (1 - Math.exp(-dt / 0.5));
      if (age >= nextMove) {
        nextMove = age + rand(2.8, 6.5) * (1 - 0.4 * glory);
        if (hushed < 0.3 && windup === null) move();
      }
      gap += (toGap - gap) * (1 - Math.exp(-dt / 1.6));

      // Calmer on a big token, so a point never moves too fast for the eye.
      const scale = Math.min(1, Math.max(0.5, 30 / E));
      const spinUp = drawn * drawn * (3 - 2 * drawn);
      // (Winding up for the strike: faster and faster.)
      const wound = windup === null ? 0 : 1 - windup / WINDUP;
      const base = (SPEED * scale * (1 + 0.4 * glory) * (1 - 0.85 * hushed) + boost + 6 * wound * wound) * spinUp;
      wind += dt * Math.max(0.03, base * 0.8);
      fast = windup !== null || blades.some((bl) => bl.strike !== null || bl.boost > 0.6) || boost > 0.6 || base * E > 80;

      // (More blood off a bigger token's blades, less where the device can't spare it.)
      const shedK = (budget(100) / 100) * Math.min(1.6, Math.max(0.6, b.w / 32));
      blades.forEach((bl, i) => {
        bl.boost *= Math.exp(-dt / (bl.boost < 0 ? 0.45 : 0.6));
        // (Fastest through the near side of its turn, easing round the far.)
        const surge = 1 + 0.28 * Math.sin(bl.head - bl.phase + Math.PI / 2);
        const w = Math.max(0.03, base * surge + bl.boost * spinUp);
        if (i === 0) bl.head += dt * w;
        else {
          // (The second keeps its own pace, but is drawn toward its place behind the first.)
          const want = blades[0].head - gap;
          let d = (want - bl.head) % (Math.PI * 2);
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          bl.head += dt * (w + 0.9 * d);
        }
        const k = 1 - Math.exp(-dt / 1.1);
        const sag = 0.12 * hushed;
        bl.tilt += (bl.toTilt + sag - bl.tilt) * k;
        bl.roll += (bl.toRoll - bl.roll) * k;

        // Blood off its edge only when something happens: a gush as it
        // whips round (a vote, a touch), and after a kill while the rush
        // lasts. At rest the blood stays on the steel and in the swirl.
        bl.speed = w;
        bl.gush *= Math.exp(-dt / 0.18);
        const rate = (55 * bl.gush + 30 * Math.max(0, Math.min(rush, 1.5) - 0.4)) * shedK * (1 - 0.85 * hushed) * spinUp * (1 - bl.out);
        bl.owed += rate * dt;
        if (bl.owed >= 1) {
          const c = Math.floor(bl.owed);
          bl.owed -= c;
          shed(bl, c, 1 + 0.35 * glory + 0.5 * bl.gush);
        }

        // Its pictures: on its plane, point outward along its radius, edge
        // first: the picture's lower edge leads along the swing, its flat
        // lying nearly in the plane, canted a little toward upright (layout px).
        const c = Math.cos(bl.head);
        const s = Math.sin(bl.head);
        const cr = Math.cos(bl.roll);
        const sr = Math.sin(bl.roll);
        const turn = (x: number, y: number) => [cr * x - sr * y, sr * x + cr * y];
        const [ax, ay] = turn(c, bl.tilt * s);
        const up = Math.sqrt(1 - bl.tilt * bl.tilt);
        // (Across the blade: the way it swings, foreshortened, and a little of upright.)
        const [bx, by] = turn(-Math.cos(CANT) * s, Math.cos(CANT) * bl.tilt * c - Math.sin(CANT) * up);
        const rs = D0 + 1 - GUARD_AT * L * bl.reach;
        const [px, py] = turn(rs * c, centre(bl, D0) + bl.tilt * rs * s);
        const m = `matrix(${ax.toFixed(4)},${ay.toFixed(4)},${bx.toFixed(4)},${by.toFixed(4)},${px.toFixed(2)},${py.toFixed(2)})`;
        bl.far.style.transform = m;
        bl.near.style.transform = m;
        // Nearer, brighter; dull when he falters; gone for its stroke.
        const seen = spinUp * (1 - 0.35 * hushed) * (1 - bl.out);
        const nk = smooth(-0.15, 0.25, s);
        bl.far.style.opacity = (seen * (0.6 + 0.4 * nk)).toFixed(3);
        // (Solid steel in front of the face all through the near half; none
        // of it over the face once it has passed behind, so the hilt never
        // shows through the token: the one under the face, cut round it,
        // takes over at the sides.)
        bl.near.style.opacity = (seen * smooth(0.0, 0.08, s)).toFixed(3);
      });

      stepStains(dt, w0 / 2);

      const darkK = 0.62 + 0.3 * hushed - 0.1 * Math.min(rush, 1);
      dark.style.opacity = (Math.min(1, darkK) * (0.4 + 0.6 * spinUp)).toFixed(3);
      dark.style.transform = `scale(${(1 + 0.25 * hushed).toFixed(3)})`;
    },
    react(e: AuraEvent) {
      switch (e.kind) {
        case 'arrive':
          n = 0;
          target = Math.max(target, WIND);
          drawn = 0;
          drawing = true;
          trail = 0.3;
          rush = Math.max(rush, 0.3);
          break;
        case 'vote':
          for (const bl of blades) {
            bl.boost = Math.max(bl.boost, 3.4);
            bl.gush = 1;
          }
          rush = Math.max(rush, 0.3);
          break;
        case 'score': {
          const k = Math.max(1, e.streak);
          windup = WINDUP;
          feedCount = k;
          target = Math.min(MOST, WIND + Math.ceil(k / 2));
          glory = Math.max(glory, Math.min(1, k / 5));
          boost = Math.max(boost, 1.4 + 0.25 * Math.min(k, 6));
          dull = floor = 0;
          restAt = age + 40;
          break;
        }
        case 'miss':
          target = Math.min(target, WIND - 1);
          dull = Math.max(dull, 0.85);
          dullFor = 1.6;
          boost = -SPEED;
          rush = 0;
          leech = 0;
          glory = 0;
          restAt = age + 4;
          // (The blades sag and drip.)
          for (const bl of blades) dripFrom(bl, budget(3));
          break;
        case 'hurt': {
          // A wound opens on his face and bleeds down it, off his chin; a
          // spatter of his own blood off one side.
          const R0 = (ctx.el.offsetWidth || box.w) / 2;
          const last = e.left <= 0;
          // (High on the face, to one side of the letter.)
          const th = (Math.random() < 0.5 ? -1 : 1) * rand(0.45, 1.0) - Math.PI / 2;
          const rr = R0 * rand(0.45, 0.62);
          stain(R0, Math.cos(th) * rr, Math.sin(th) * rr, rand(-0.5, 0.5), R0 * rand(1.3, 1.6), {
            life: last ? 6.5 : 4.5,
            peak: 0.92,
            runs: last ? 2 : 1 + Math.round(Math.random()),
            reach: 1.1,
            own: true,
            wound: true,
          });
          spatter(budget(12));
          bleed(budget(last ? 9 : 5), last ? 4 : 2.5);
          // And he falters as for a miss, harder.
          target = e.left <= 0 ? 1 : WIND - 1;
          dull = 1;
          dullFor = e.left <= 0 ? 5 : 3;
          floor = Math.max(floor, e.left <= 0 ? 0.6 : e.left === 1 ? 0.25 : 0);
          boost = -SPEED * 1.2;
          rush = 0;
          leech = 0;
          glory = 0;
          restAt = age + (e.left <= 0 ? 20 : 6);
          break;
        }
        case 'win':
          target = MOST;
          rush = 1.8;
          glory = 1;
          dull = floor = 0;
          boost = 2.5;
          windup = WINDUP + 0.4;
          feedCount = 8;
          restAt = age + 60;
          break;
        case 'touch': {
          const bl = blades[Math.random() < 0.5 ? 0 : 1];
          bl.boost = 3.2;
          bl.gush = 1;
          break;
        }
      }
    },
    stop() {
      for (const l of bladeLights) l.stop();
      whirl.stop();
      dark.remove();
      face.remove();
      for (const bl of blades) {
        bl.far.remove();
        bl.near.remove();
      }
    },
  };
}
