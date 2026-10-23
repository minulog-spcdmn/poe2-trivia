// Paints the deathmatch's plate (lib/plates/duel.ts) for the effects'
// sigil (ShapeType.Sigil in renderer.ts) to draw: on black, each of its
// three parts in a channel of its own (the sword red, the rings and all
// within the band green, the band blue), so the shader draws each in at its
// own time from one texture. Shared by the worker that paints it
// (duelArtWorker.ts) and the page, where no worker can (duelArt.ts).

import type { DuelPlate } from '../plates/duel.ts';

/** The stage's line weights (ArcaneStage), in the plate's units. */
const WEIGHT: Record<string, number> = { '': 0.5, thin: 0.35, hair: 0.22, sign: 0.42, hatch: 0.2 };
/**
 * The plate's units across the picture: its 200, and a margin round them, so
 * the coarse levels its glow is drawn from (renderer.ts) never hold its rim
 * at their edge, which is smeared out past it where the sigil reaches.
 */
export const DUEL_SPAN = 220;
/** Each part's channel. */
const CHANNEL: [keyof DuelPlate, string][] = [
  ['sword', '#f00'],
  ['rings', '#0f0'],
  ['band', '#00f'],
];

/** Paints `plate` on a canvas `size` px square, DUEL_SPAN units across. */
export function paintDuel(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, size: number, plate: DuelPlate) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.scale(size / DUEL_SPAN, size / DUEL_SPAN);
  ctx.translate(DUEL_SPAN / 2, DUEL_SPAN / 2);
  // (Opaque throughout, so the channels add without any of them touching the others.)
  ctx.globalCompositeOperation = 'lighter';
  ctx.miterLimit = 12;
  for (const [part, colour] of CHANNEL) {
    ctx.strokeStyle = colour;
    for (const [cls, d] of Object.entries(plate[part])) {
      const round = cls === 'sign' || cls === 'hatch';
      ctx.lineWidth = WEIGHT[cls] ?? WEIGHT[''];
      ctx.lineCap = round ? 'round' : 'butt';
      ctx.lineJoin = round ? 'round' : 'miter';
      ctx.stroke(new Path2D(d));
    }
  }
  ctx.restore();
}
