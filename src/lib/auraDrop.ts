// An aura's card turning up in the deal (a try-out: ChooseCategory's
// auraAt, the QA desk's game/delve-aura-card): what's heard and seen as its
// face comes up, and as it lands. ChooseCategory calls these two; what they
// play is this file's.
//
// The Mirror of Kalandra's is the rarest find there is, and turns up as one,
// in the Mirror's own light (its aura, fx/auras/mirror.ts) grown from the
// token to the table. As its face comes up, PoE2's own sound of a Mirror
// dropping swells (soundDesign's mirrorDrop); as it lands, its edge lights
// silver and motes of light are drawn in to the glass's rim. At the sound's
// height the glass catches the light there: the Mirror's four-pointed star
// bursts on the rim, its fine silver line laid through the token and across
// the card, and the glass turns, its sheen sweeping over the item; the
// glitter along the line flares as the light runs out to it, and cold light
// pools on the table under the card. As the swell breaks off the star is
// gone; the glitter twinkles out with the sound's long shimmer, drifting,
// and the glass turns twice more as it rings. The item in the token stays
// in sight throughout: the star's heart is small, on the rim, and its light
// is a line, not a haze.

import { after, boxOf, fxActive, particle, shape, task, type Box, type Point, type Vec3 } from './fx/core';
import { outline } from './fx/effects';
import { Shape } from './fx/particles';
import { ShapeType } from './fx/renderer';
import type { Plane } from './fx/plane';
import { auraFeels } from './fx/playerAura';
import { light } from './lights';
import { AURA_GLOW, type AuraKind } from './auraKinds';
import { sfx } from './sound';

const dim = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** When the Mirror's face last came up and its sound began (performance.now(), ms): its moment keeps time with it. */
let faceUpAt = -Infinity;

/**
 * Halfway through its turn, as its face comes up (`card`: the card, its
 * face in it). The Mirror of Kalandra's to PoE2's own sound of a Mirror
 * dropping (soundDesign's mirrorDrop): a bright swell that peaks about half
 * a second on (SOUND_PEAK), breaks off at three quarters, and rings on.
 */
export function auraTurning(card: Element, aura: AuraKind) {
  if (aura !== 'mirror') return;
  faceUpAt = performance.now();
  sfx('mirrorDrop', { from: { from: card } });
}

/**
 * Landed face up (`frame`: its face; `seat`: the circle its aura burns in,
 * which arrives as this plays). Its edge lit once in its aura's colour; the
 * Mirror's, all of its moment (mirrorLanded). Called on the cards' layer
 * (behind the UI), so all of it ends with the cards.
 */
export function auraLanded(frame: Element, seat: Element | null, aura: AuraKind) {
  if (!fxActive()) return;
  if (aura === 'mirror') return mirrorLanded(frame, seat ?? frame);
  outline(frame, { color: dim(AURA_GLOW[aura].main, 0.75), width: 10, intensity: 0.8, life: 1.2, fadeIn: 0.12 });
}

// ---- the Mirror of Kalandra ----------------------------------------------

/**
 * When the glass catches the light, s after its face came up and its sound
 * began (auraTurning): the sound's height (measured on the recording: up by
 * 0.18 s, loudest 0.44 to 0.62 s, breaking off at 0.75 s).
 */
const SOUND_PEAK = 0.44;
/** When the card lands, s after its face came up: the turn's second half (ChooseCategory's TURN, 0.46 s). */
const FACE_TO_LAND = 0.23;
/** When the swell breaks off, s after the peak (0.75 s into the sound). */
const MIRROR_BREAK = 0.31;

const SILVER = AURA_GLOW.mirror.main;
const PALE = AURA_GLOW.mirror.pale;
/** The glitter's cold silver, as the aura's own falling glass has it, and what it cools to. */
const GLITTER: Vec3 = [1.3, 1.4, 1.6];
const GLITTER_COOL: Vec3 = [0.6, 0.75, 1.1];

/**
 * A plane flat to the screen, turned `angle` (rad, clockwise) about a point
 * `off` (px) from the middle of `at`: a shape on it is drawn there, turned,
 * so a flare's streak (always laid sideways) is laid at any angle, and
 * swings as the angle changes.
 */
function turned(at: Element, angle: () => number, off: Point = { x: 0, y: 0 }): Plane {
  // (Where it last was, once the cards have gone with its light still fading: not the corner a box of nothing is in.)
  let last: Box | null = null;
  const box = () => {
    if (at.isConnected || !last) {
      const b = boxOf(at);
      last = { ...b, x: b.x + off.x, y: b.y + off.y };
    }
    return last;
  };
  return {
    box,
    clip: () => null,
    about(x, y, out, o) {
      const b = box();
      const a = angle();
      const c = Math.cos(a);
      const s = Math.sin(a);
      out[o] = b.x + c * x - s * y;
      out[o + 1] = b.y + s * x + c * y;
      // (The map by columns: where its x and its y fall on screen; nothing foreshortened.)
      out[o + 2] = c;
      out[o + 3] = s;
      out[o + 4] = -s;
      out[o + 5] = c;
      out[o + 6] = 0;
      out[o + 7] = 0;
    },
    drop() {},
  };
}

/**
 * The Mirror's card has landed, by ChooseCategory's timer: its moment (see
 * the top of this file), kept to the turn's own clock and its sound's.
 * That timer can go off before the face has even come up (by 0.4 s,
 * measured, on a deal's long first frame), so it waits for the face, then
 * starts as the card lands (FACE_TO_LAND after it), the glass catching the
 * light at the sound's height. Where the face's coming up isn't seen within
 * a second (a long frame carried the card past it, and no sound played),
 * it starts then. A task, so all it makes is the cards' (their group, and
 * behind the UI).
 */
function mirrorLanded(frame: Element, seat: Element) {
  const calledAt = performance.now();
  task(
    (_dt, age) => {
      // Seconds since its face came up.
      const seen = faceUpAt > calledAt - 1000;
      if (!seen && age < 1) return true;
      const s = seen ? (performance.now() - faceUpAt) / 1000 : FACE_TO_LAND;
      if (s < FACE_TO_LAND) return true;
      // (Come long after the sound's height, the effects only now under way: its edge lit, as another aura's.)
      if (s > SOUND_PEAK + 0.5) outline(frame, { color: dim(SILVER, 0.5), width: 10, intensity: 0.8, life: 1.2, fadeIn: 0.12 });
      else mirrorMoment(frame, seat, Math.max(0, SOUND_PEAK - s));
      return false;
    },
    { life: 2 },
  );
}

/**
 * The Mirror's card, landed face up; the glass catches the light `peak` s
 * from now. Laid along the deal: across the card where the cards lie side
 * by side, and upright through them where they're stacked as rows (a phone
 * held upright), so the line runs over the cards' pictures and never
 * through a name. All of it sized from the card and its token.
 */
function mirrorMoment(frame: Element, seat: Element, peak: number) {
  const card = boxOf(frame);
  const token = boxOf(seat);
  const R = Math.max(18, token.w / 2);
  // The cards as rows (wider than tall): all of it laid upright.
  const rows = card.w > card.h * 1.2;
  const along = rows ? Math.PI / 2 : 0;
  // The card's size, whichever way it lies.
  const S = rows ? card.h * 1.4 : card.w;
  const view = typeof innerWidth === 'number' ? innerWidth : 1440;
  // The star's line, each way from the rim: most of a card's width, or a
  // little into the rows above and below.
  const line = rows ? 0.8 * card.h : Math.min(card.w, 0.3 * view);
  // Where the glass catches the light: on its rim, high on the left, as the aura's own glint.
  const rim = { x: -0.6 * R, y: -0.76 * R };
  const glint = { x: token.x + rim.x, y: token.y + rim.y };

  // Landing: its edge lit silver, held while the sound rings; the light
  // gathers into the glass, drawn in to where it will catch.
  outline(frame, { color: dim(SILVER, 0.5), width: 11, intensity: 0.75, life: 3.4, fadeIn: 0.12 });
  gather(glint, card, rows, peak);

  after(peak, () => {
    // The four-pointed star on the rim: sharp to come, held through the
    // swell's last loud stretch, gone soon after it breaks off.
    const starLight = (age: number) => smooth(0, 0.05, age) * (age < MIRROR_BREAK ? 1 - 0.25 * (age / MIRROR_BREAK) : 0.75 * Math.exp(-(age - MIRROR_BREAK) / 0.12));
    const grow = (age: number) => 0.7 + 0.3 * smooth(0, 0.25, age);
    // Its fine line, laid through the token and across the card.
    shape({
      type: ShapeType.Flare,
      at: seat,
      plane: turned(seat, () => along, rim),
      life: MIRROR_BREAK + 0.45,
      color: PALE,
      update(f, _t, age) {
        f.hw = line * grow(age);
        f.hh = Math.max(R * 3, f.hw * 0.3);
        f.k = 1.1 * starLight(age);
        // Core, the line's half length and thickness; no spikes: the Mirror's
        // star has four points. A small heart, so its haze leaves the item be.
        f.q[0] = R * 0.07;
        f.q[1] = f.hw;
        f.q[2] = Math.max(1.4, R * 0.045);
        f.q[3] = 0;
      },
    });
    // Its other two points, across the line, shorter.
    const arm = 1.6 * R;
    shape({
      type: ShapeType.Flare,
      at: seat,
      plane: turned(seat, () => along + Math.PI / 2, rim),
      life: MIRROR_BREAK + 0.45,
      color: PALE,
      update(f, _t, age) {
        f.hw = arm * grow(age);
        f.hh = Math.max(R * 2, f.hw * 0.4);
        f.k = 1.1 * starLight(age);
        // (The heart is the line's; this one's stays a point.)
        f.q[0] = R * 0.035;
        f.q[1] = f.hw;
        f.q[2] = Math.max(1.6, R * 0.05);
        f.q[3] = 0;
      },
    });
    // The light pooling on the table round the card.
    light(seat, { color: [0.75, 0.82, 1], radius: Math.max(S * 2.2, 220), intensity: 1, attack: 0.12, hold: MIRROR_BREAK + 0.2, decay: 2.8 });
    flareGlitter(glint, along, S, line);
    // In the token, the glass turns once, quickly, its sheen sweeping over
    // the item (the aura's answer to a vote). Not its win, whose flash
    // whitens the whole glass at a card's size and hides the item. And twice
    // more as the sound rings on, so the glass stays alive while it does.
    auraFeels(seat, { kind: 'vote' });
    after(1.3, () => auraFeels(seat, { kind: 'vote' }));
    after(2.5, () => auraFeels(seat, { kind: 'vote' }));
  });
}

/** A mote of the Mirror's glitter: its four-pointed star, drifting. */
function mote(x: number, y: number, o: { size: number; life: number; delay?: number; k?: number; drift?: number }) {
  const d = o.drift ?? 6;
  particle({
    x,
    y,
    vx: rand(-d, d),
    vy: rand(-d, d * 0.6),
    life: o.life,
    size: o.size,
    sizeEnd: 0.4,
    color: dim(GLITTER, o.k ?? 1),
    colorEnd: dim(GLITTER_COOL, 0.5),
    shape: Shape.Glint,
    rot: Math.PI / 4 + rand(-0.15, 0.15),
    spin: rand(-0.4, 0.4),
    flicker: 0.45,
    fadeIn: 0.25,
    drag: 0.4,
    delay: o.delay,
  });
}

/**
 * As it lands, through the swell: motes of light drawn in to where the glass
 * will catch it (`to`), each on a curve, the last arriving as it does (`peak`
 * s from now). Side by side, they come from either side and from within the
 * card's own height, never through the heading or the notes; stacked as
 * rows, from above and below, over the pictures, never through a name.
 */
function gather(to: Point, card: Box, rows: boolean, peak: number) {
  if (peak < 0.08) return;
  const top = card.y - card.h / 2;
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const x = rows ? Math.max(4, to.x + rand(-0.4, 0.8) * card.h) : to.x + side * rand(0.35, 0.85) * card.w;
    const y = rows ? to.y + side * rand(0.6, 1.4) * card.h : top + rand(0.05, 0.95) * card.h;
    // Bowed a little, one way or the other, so they come in curling.
    const bow = rand(0.15, 0.35) * (i % 2 ? 1 : -1);
    const mx = (x + to.x) / 2 - (y - to.y) * bow;
    const my = (y + to.y) / 2 + (x - to.x) * bow;
    const life = peak * rand(0.75, 1);
    particle({
      x,
      y,
      life,
      delay: peak - life,
      size: rand(0.8, 1.4),
      color: dim(GLITTER, 1.1),
      colorEnd: dim(PALE, 0.8),
      shape: Shape.Spark,
      stretch: 0.04,
      fadeIn: 0.6,
      seek: { cx: mx, cy: my, tx: to.x, ty: to.y },
    });
  }
}

/**
 * The glass catches the light (`at`, where it does; the line laid at
 * `along`, `line` long each way): the glitter along it flares as the light
 * runs out to it (each the later the further out), and twinkles out over
 * the sound's shimmer, the last drifting. Kept close to the line, clear of
 * the names and notes. `S`: the card's size.
 */
function flareGlitter(at: Point, along: number, S: number, line: number) {
  const run = line / 0.35;
  const ux = Math.cos(along);
  const uy = Math.sin(along);
  /** A place for a mote, and how far along the line it lies. */
  const spread = (wide: number): Point & { u: number } => {
    const u = rand(-1, 1) * wide;
    const v = rand(-1, 1) * S * 0.28;
    return { x: at.x + ux * u - uy * v, y: at.y + uy * u + ux * v, u };
  };
  const scale = Math.sqrt(S / 220);
  for (let i = 0; i < 42; i++) {
    const p = spread(line * 0.95);
    mote(p.x, p.y, { size: rand(4, 9) * scale, life: rand(0.5, 1.1), delay: Math.abs(p.u) / run });
  }
  // The shimmer: fewer and fainter as it rings out.
  for (let i = 0; i < 16; i++) {
    const p = spread(line * 0.85);
    const when = MIRROR_BREAK + Math.pow(i / 16, 1.4) * 2.4;
    mote(p.x, p.y, { size: rand(2.5, 5.5) * scale, life: rand(0.5, 0.9), delay: when, k: 1 - 0.6 * (i / 16), drift: 10 });
  }
}
