// The achievements' metals (lib/achievements.ts tiers): how each seal is
// struck and how light passes over it. A module of its own, with nothing to
// import, so the seal (AchievementSeal.svelte, which every notice shows) can
// read it without pulling the achievements, the codex and the Delve records
// into the first download.

/** How hard an achievement is: the seal's metal, lead (the very easy ones), copper, silver or gold. */
export type Tier = 0 | 1 | 2 | 3;

/**
 * Each tier's metal: its name, the colour its seal is struck in, and, where
 * the glow under the lines differs from the plain one, its sheen. Lead and
 * silver sit far apart: lead a dark, dull grey whose soft paler lustre keeps
 * it metal rather than stone, silver near white with a bright white lustre.
 * Gold is pale gold over a deep amber glow, like gilding.
 *
 * `light`: how light passes over an earned seal of the metal (lib/glint.ts),
 * every `every` ms, taking `sweep` to cross, a band `band`% either side of
 * its middle, in `gleam` at `strength`; gold's leaves a spark on the rim.
 * Dull lead gleams seldom, slowly and faintly; silver flashes quick, narrow
 * and white.
 */
export interface Metal {
  name: string;
  color: string;
  /** Its name's colour on the page, where the seal's own would be too dark to read. */
  label?: string;
  sheen?: { color: string; opacity: number };
  light: { every: number; sweep: number; band: number; gleam: string; strength: number; spark?: true };
}

export const METALS: Record<Tier, Metal> = {
  0: {
    name: 'Lead',
    color: '#6e7073',
    label: '#a2a7ac',
    sheen: { color: '#a2a7ac', opacity: 0.38 },
    light: { every: 13000, sweep: 2400, band: 26, gleam: '#d9dde1', strength: 0.35 },
  },
  1: { name: 'Copper', color: '#cf9366', light: { every: 11000, sweep: 1700, band: 18, gleam: '#ffd9b8', strength: 0.6 } },
  2: {
    name: 'Silver',
    color: '#eef1f4',
    sheen: { color: '#ffffff', opacity: 0.38 },
    light: { every: 8000, sweep: 1000, band: 10, gleam: '#ffffff', strength: 0.95 },
  },
  3: {
    name: 'Gold',
    color: '#f6d688',
    sheen: { color: '#e8962e', opacity: 0.5 },
    light: { every: 7000, sweep: 1400, band: 15, gleam: '#fff4cf', strength: 1, spark: true },
  },
};

/** The tiers, easiest first. */
export const TIERS: Tier[] = [0, 1, 2, 3];
