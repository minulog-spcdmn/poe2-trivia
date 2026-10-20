// The PoE2 classes' sigils (public/classes/, from pathofexile2.com's class
// icons: gold on transparent, 288 x 360), worn on a player's avatar behind
// their initial (components/Avatar.svelte). Each is earned with an
// achievement (lib/sigils.ts).

import { absoluteUrl } from './ui-paths.ts';

export const CLASSES = [
  'warrior',
  'mercenary',
  'ranger',
  'huntress',
  'sorceress',
  'witch',
  'monk',
  'druid',
  'templar',
  'marauder',
  'gladiator',
  'assassin',
] as const;

export type PlayerClass = (typeof CLASSES)[number];

export const isPlayerClass = (v: unknown): v is PlayerClass => typeof v === 'string' && (CLASSES as readonly string[]).includes(v);

/** Its name, as the game writes it. */
export const className = (c: PlayerClass) => c[0].toUpperCase() + c.slice(1);

/** Its sigil's picture, as a whole URL: it goes in a custom property (--sigil). */
export const sigilUrl = (c: PlayerClass) => absoluteUrl(`classes/${c}.webp`);

/**
 * Each sigil fitted to the token, as fractions of its size: the picture's
 * width and height, and where its top left goes, so every glyph (its opaque
 * bounds in the picture) fits 84% high or 80% wide, centred.
 */
export const SIGIL_FITS: Record<PlayerClass, [w: number, h: number, x: number, y: number]> = {
  assassin: [0.815, 1.018, 0.09, -0.013],
  druid: [0.909, 1.137, 0.042, -0.075],
  gladiator: [0.846, 1.057, 0.074, 0.015],
  huntress: [0.806, 1.008, 0.094, 0.021],
  marauder: [0.911, 1.138, 0.043, -0.091],
  mercenary: [0.846, 1.057, 0.076, 0.03],
  monk: [0.914, 1.143, 0.04, -0.125],
  ranger: [0.804, 1.005, 0.098, 0.013],
  sorceress: [0.82, 1.025, 0.087, -0.017],
  templar: [0.817, 1.022, 0.089, -0.016],
  warrior: [0.964, 1.205, 0.016, -0.097],
  witch: [0.899, 1.124, 0.047, -0.067],
};

/** Below this size (px) the letter on a sigil is white, outlined in black, and the gold line goes: the clearest that small. */
export const SMALL_INK = 26;

/** A class for a name, the same each time: the QA desk's stand-in for one worn (qa/tweaks.ts). */
export function classOf(name: string): PlayerClass {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return CLASSES[h % CLASSES.length];
}
