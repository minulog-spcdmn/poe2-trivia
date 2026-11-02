// Engraves the category cards' plates (lib/cardEngraving) away from the
// page's main thread, for a hand being dealt (lib/engraveAhead): the same
// engrave() as the page's, so the same strokes to the last digit.

import { engrave, type Engraved } from './cardEngraving.ts';
import { findVariant } from './findEngraving.ts';
import { LANTERN_PLATE } from './wayOut/lanternPlate.ts';
import type { FindKind } from './delve.ts';

/** A plate's variant by name: none, a find's, or the way out's. */
export type VariantName = 'plain' | FindKind | 'out';
export type EngraveJob = { id: number; side: 'face' | 'back'; w: number; h: number; variant: VariantName };
/** The plate, or nothing if it couldn't be engraved here. */
export type EngraveAnswer = { id: number; plate?: Engraved };

const variantOf = (name: VariantName) => (name === 'plain' ? undefined : name === 'out' ? LANTERN_PLATE : findVariant(name));

self.onmessage = ({ data: { id, side, w, h, variant } }: MessageEvent<EngraveJob>) => {
  const answer: EngraveAnswer = { id };
  try {
    answer.plate = engrave(side, w, h, variantOf(variant));
  } catch {
    // (Answered with nothing: the page engraves it.)
  }
  self.postMessage(answer);
};
