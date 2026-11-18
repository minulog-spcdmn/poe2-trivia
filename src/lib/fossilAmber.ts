// The fossils' amber, for what the fx renderer and the backdrop's lights draw
// (lib/fx, lib/lights.ts): the same palette as app.css's --fossil-*, which
// every fossil surface's CSS reads (tests/fossilPalette.test.ts holds the two
// together). HDR: a gain past 1 is light brighter than a colour can hold.

import type { Vec3 } from './fx/core.ts';

export const FOSSIL_AMBER = {
  core: '#ffe066',
  mid: '#ffaa2c',
  edge: '#ec6a10',
  resin: '#5a2004',
  fleck: '#fff2c4',
  rareCore: '#ffc43a',
  rareMid: '#f27c1c',
  rareEdge: '#c8300c',
  rareResin: '#4a1204',
} as const;

/** A palette colour as the fx's light, `gain` times as bright. */
export function amberLight(name: keyof typeof FOSSIL_AMBER, gain = 1): Vec3 {
  const n = parseInt(FOSSIL_AMBER[name].slice(1), 16);
  return [(((n >> 16) & 255) / 255) * gain, (((n >> 8) & 255) / 255) * gain, ((n & 255) / 255) * gain];
}
