// An aura's card's colours (a try-out: ChooseCategory's auraAt): a plain
// card's gold, every part of it (its lines, the window's glow, its frame and
// light, its item, its name and tag), in a colour of the aura's own.
//
// Each is set by hand from the aura's character, in OKLCH (lightness,
// chroma, hue): about as calm as a find's ink (the azurite vein's chroma,
// 0.09), and within a family of auras one deep, one mid, one light, so the
// cards stay apart. Taken from AURA_GLOW alone, every card was as bright and
// as strong as its light, and the reds, the violets, the greens and the
// golds each came out alike (ΔE2000 about 4 between neighbours).
//
// The card is seen with its aura's light over it, which pulls every hue
// toward the light's and adds to its strength: so where two auras' lights
// are alike (the Remnants' and the herald's blues, the three reds), their
// inks part by lightness, and where a light floods the face (the Vaal's,
// Chayula's, the Abyss's), its ink is calmer. Measured on the cards as
// seen (screens/cards/cardde.py, on a shot of every card).

import type { AuraKind } from './auraKinds';

/** Each aura's card ink: OKLCH lightness, chroma, hue (degrees). */
export const AURA_INK: Record<AuraKind, readonly [number, number, number]> = {
  // Reds (their lights alike): the Ritual's blood, the Vaal's dark crimson, the Slayer's pale rust.
  ritual: [0.66, 0.085, 28],
  corrupted: [0.52, 0.075, 12],
  slayer: [0.8, 0.06, 50],
  // Violets: the Breach's magenta, the Lich's violet, Chayula's deep dusk, the Twilight Order's pale glass.
  breach: [0.7, 0.1, 330],
  lich: [0.73, 0.09, 296],
  chayula: [0.55, 0.06, 285],
  twilight: [0.86, 0.045, 300],
  // Greens: the Abyss's sick green, the Shadow's jade, the Azmeri spirits' teal.
  abyss: [0.72, 0.075, 128],
  shadow: [0.79, 0.09, 160],
  azmeri: [0.68, 0.08, 182],
  // Blues (the first two lights alike): the Remnants' deep cyan, the herald's pale ice, the Chronomancer's blue.
  expedition: [0.62, 0.08, 200],
  ice: [0.88, 0.055, 232],
  chronomancer: [0.67, 0.1, 264],
  // Golds: Precursor copper, the black sun's old gold, the djinn's pale sand, the Arbiter's lightning.
  tower: [0.6, 0.08, 45],
  blacksun: [0.6, 0.08, 80],
  runeseal: [0.86, 0.045, 75],
  divine: [0.9, 0.095, 108],
  // Near white: the Delirium's grey fog, the Mirror's silver.
  delirium: [0.66, 0.012, 250],
  mirror: [0.89, 0.03, 255],
};

/** sRGB (0 to 1 each) from OKLCH, clipped to the screen's colours. */
function rgbOf(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const gam = (v: number) => Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
const byte = (v: number) => Math.round(v * 255);
const hex = (L: number, C: number, h: number) => `#${rgbOf(L, C, h).map((v) => byte(v).toString(16).padStart(2, '0')).join('')}`;
const rgba = (L: number, C: number, h: number, k: number) => `rgba(${rgbOf(L, C, h).map(byte).join(', ')}, ${k})`;

/**
 * The card's colours as the stylesheet reads them (a find's, ChooseCategory:
 * --ink and on), for its `style`: its lines the ink, the rest from it, its
 * light a little stronger, its dark the plain card's own, tinted.
 */
export function auraInk(aura: AuraKind): string {
  const [L, C, h] = AURA_INK[aura];
  const light = Math.min(0.66, L);
  return Object.entries({
    '--ink': hex(L, C, h),
    '--warm': hex(0.56, C * 1.3, h),
    '--f': hex(Math.min(0.92, L + 0.05), C * 1.05, h),
    '--f-hi': hex(0.95, C * 0.35, h),
    '--f-border': hex(L * 0.62, C * 0.85, h),
    '--f-pulse': rgba(light, C * 1.4, h, 0.34),
    '--f-glow': rgba(light, C * 1.4, h, 0.2),
    '--f-glyph': `linear-gradient(180deg, ${hex(0.95, C * 0.3, h)} 0%, ${hex(L - 0.02, C * 0.95, h)} 45%, ${hex(0.34, C * 0.7, h)} 100%)`,
    '--e-glow': rgba(light, C * 1.4, h, 0.4),
    // Its note under the cards (on the page, not the card): light whatever the ink, so a deep one still reads.
    '--a-note': hex(Math.max(0.8, L), C * 0.75, h),
    '--a-lead': hex(Math.max(0.87, L + 0.03), C * 0.9, h),
    '--a-face': hex(0.22, Math.min(0.03, C * 0.4), h),
    '--a-deep': hex(0.13, Math.min(0.02, C * 0.3), h),
  })
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}
