// What every player aura (lib/auraKinds.ts) is given and gives back. Each
// aura is two files of its own in this folder: `<kind>.ts`, its `burn`, and
// `<kind>.glsl.ts`, the light it draws in the effects shader (shaders.ts).

import { shape, type Box, type ShapeFrame, type ShapeHandle } from '../core';
import type { Plane } from '../plane';
import { ShapeType } from '../renderer';
import { hasShade, shadeAlive, shadeThere } from '../shade';

/** What an aura burns on. */
export type AuraContext = {
  /** The avatar (round, its size as drawn): shapes and particles go by it. */
  el: HTMLElement;
  /**
   * A layer of the page's own under the avatar's face, and one over it, each
   * the avatar's box (overflow shows): for what light can't do (darkness, a
   * picture). Under shows only outside the token and its rim (the face covers
   * the rest). Empty until the aura puts something in them.
   */
  under: HTMLElement;
  over: HTMLElement;
  /** A copy of the avatar as it looks now (for a reflection, an after-image): placed at the top left of its box, without the aura's layers or what it says to screen readers. */
  copyFace: () => HTMLElement;
  /** Its number in the effects shader. */
  slot: number;
  /** What its light is held in, none of it falling past (an aura's card: its face); none on an avatar. */
  clip?: Element;
  /** The plane it lies in, turned in 3D with it (an aura's card's face, held in it: in place of `clip`); none on an avatar. */
  plane?: Plane;
  /** It burns in a card's circle, not round an avatar (playerAura's `bare`): what it lays round it falls on the card's face, not the page. */
  bare?: boolean;
};

/** What happens to the player whose avatar it is (from lib/fx/moments.ts), or to the token itself. */
export type AuraEvent =
  /** They come into the lobby. */
  | { kind: 'arrive' }
  /** Their vote lands on a card (Delve together: the avatar is the vote's mark). */
  | { kind: 'vote' }
  /** They score; `streak`: right answers in a row, this one counted. */
  | { kind: 'score'; streak: number }
  /** They lose a point (a wrong guess in a race). */
  | { kind: 'miss' }
  /** They lose a life (Delve); `left`: lives still left. */
  | { kind: 'hurt'; left: number }
  /** They won the game (the end screen's crown). */
  | { kind: 'win' }
  /** Someone taps or clicks the token. */
  | { kind: 'touch' };

/**
 * One aura burning on one avatar: `step` each frame, given its box and its
 * size over 32 px; `react` when something happens to its player (optional);
 * `stop` takes away whatever it made.
 */
export type Burning = { step: (dt: number, b: Box, sc: number) => void; react?: (e: AuraEvent) => void; stop: () => void };

/**
 * A shape drawn by this aura's own light (its `aura_<kind>` in the shader),
 * on the avatar for as long as it burns. `update` sets the quad's half size
 * (f.hw, f.hh: the light fades out over its outer 28%), its brightness (f.k)
 * and the aura's parameters: f.q[0..7] and f.q[9..11] (f.q[8] is the slot,
 * set here). Light is added over the page: it can't darken.
 *
 * An aura with a shade of its own (its `shade_<kind>`: shaders.ts) has that
 * drawn from the same shape, under its light and over the page
 * (lib/fx/shade.ts): on the same quad, given the same numbers in the same
 * frame, as strong as f.k (up to 1) and fading out round as the light does.
 * That is how it darkens.
 */
export function auraShape(ctx: AuraContext, update: (f: ShapeFrame, age: number, b: Box) => void, o: { calm?: boolean; behind?: boolean } = {}): ShapeHandle {
  const shaded = hasShade(ctx.slot);
  return shape({
    type: ShapeType.Aura,
    at: ctx.el,
    life: Infinity,
    followOpacity: true,
    calm: o.calm ?? true,
    behind: o.behind,
    clip: ctx.clip,
    plane: ctx.plane,
    color: [1, 1, 1],
    update(f, _t, age, b) {
      update(f, age, b);
      f.q[8] = ctx.slot;
      // (Its shade is drawn only while a shape that has one says so.)
      if (shaded) shadeAlive();
    },
  });
}

/**
 * Whether this aura's shade is drawn, or on its way: false for an aura that
 * has none, and where it can't be drawn (no WebGL2 left for it, its context
 * lost, its program failed), so the aura can do without, or lay its dark
 * some other way. Asked whenever it matters: a context can go and come back.
 */
export function shadeDrawn(ctx: AuraContext): boolean {
  return shadeThere(ctx.slot);
}
