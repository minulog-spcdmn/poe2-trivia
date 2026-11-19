// The delirium aura (lib/auraKinds.ts): the wearer walks in the Delirium
// Mirror's fog. Its light (delirium.glsl.ts) is a vortex of pale fog on a
// tilted plane round the token, its far half behind the token and its near
// half drifting across the face, with a cold haze seeping out from behind;
// pieces of the broken mirror ride the vortex, no two alike, passing behind
// the token and in front of it, turning and mirroring the fog round them.
// Layers over the face drain the colour from it, as the fog drains the
// world it covers.
//
// It answers in the Delirium's own terms. The deeper a player goes (their
// streak), the deeper the fog: wider, thicker, more shards, their edges
// coloured as the game's deep shards are, more of the face greyed. A score
// draws the fog and the shards in, as if the mirror were mending, then
// breaks them out again in a surge, the shards catching the light one after
// another round the vortex. A miss or a lost life is the fog running out,
// as it does in the game: it shrinks back to the token, thins and stalls,
// and the grey floods the face; after a lost life with one or none left it
// stays frail until they score. Arriving, the fog spills out of the token;
// a vote lights every shard at once; a touch flings the shards out to swing
// back and spins the vortex; a win takes it as deep as it goes.

import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** Smoothstep over 0-1, clamped. */
const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** How far past the face the grey reaches (px): over the token's own rim ring, no further. */
const RIM = 3;
/** How long a surge's billow takes to run out (s), after the fog is drawn in for INHALE. */
const SURGE = 1.4;
const INHALE = 0.25;

/** A layer over the face that greys it, shown through `mask` (none: all of it). Its rounded corners keep it to the token's disc and rim. */
function drainLayer(mask?: string): HTMLElement {
  const d = document.createElement('div');
  Object.assign(d.style, {
    position: 'absolute',
    inset: `-${RIM}px`,
    borderRadius: '50%',
    pointerEvents: 'none',
    backdropFilter: 'grayscale(1) brightness(0.84)',
    webkitBackdropFilter: 'grayscale(1) brightness(0.84)',
    opacity: '0',
    display: 'none',
  });
  if (mask) Object.assign(d.style, { maskImage: mask, webkitMaskImage: mask });
  return d;
}

/** Sets a layer's opacity when it has changed, hiding it while it is clear. */
function fade(el: HTMLElement, was: { v: number }, v: number) {
  const o = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
  if (o === was.v) return;
  if (o > 0 !== was.v > 0) el.style.display = o > 0 ? '' : 'none';
  was.v = o;
  el.style.opacity = String(o);
}

export function burn(ctx: AuraContext): Burning {
  // The rim always drained; deeper in, more of the face; on a blow, all of it.
  const rim = drainLayer('radial-gradient(closest-side, transparent 38%, #000 88%)');
  const deep = drainLayer('radial-gradient(closest-side, transparent 12%, #000 62%)');
  const flood = drainLayer();
  ctx.over.append(rim, deep, flood);
  const shown = [{ v: 0 }, { v: 0 }, { v: 0 }];

  let flow = Math.random() * Math.PI * 2;
  let turn = Math.random() * Math.PI * 2;
  /** How deep in the Delirium: eases toward `deepTo`, which a streak raises and which ebbs slowly. */
  let depth = 0;
  let deepTo = 0;
  /** Extra turn of the vortex (rad/s), from a vote or a touch, dying away. */
  let spin = 0;
  /** Since the fog spilled out (s): when it first burns, and when the player arrives. */
  let spilled = 0;
  let surgeAge = -1;
  let surgeK = 0;
  let sweepLen = 0.8;
  /** The outward throw of the shards still to come when the fog breaks out (a score, a win). */
  let burst = 0;
  /** All the shards face on (a vote, a touch), dying away. */
  let flash = 0;
  let retreatAge = -1;
  let retreatLen = 2.4;
  let retreatK = 0;
  /** Left frail by a lost life with one or none to spare: until they score. */
  let frail = 0;
  /** The grey over the whole face: rising to `drainTo`, which ebbs. */
  let drain = 0;
  let drainTo = 0;
  /** The shards flung out (a share of the radius), on a spring. */
  let fling = 0;
  let flingV = 0;

  // What step works out for the shapes.
  let ringMul = 1;
  let shardMul = 1;
  let swell = 0;
  let surgePhase = -1;
  let sweep = -1;
  let retreat = 0;
  let spread = 0;

  const surge = (k: number, len = 0.8) => {
    surgeAge = 0;
    surgeK = k;
    sweepLen = len;
  };
  const runOut = (k: number, len: number) => {
    retreatAge = 0;
    retreatK = Math.max(k, retreat);
    retreatLen = len;
    surgeAge = -1;
    burst = 0;
  };

  /** How many shards: fewer on a small token, more on a large one and deeper in. */
  const shardCount = (w: number) => Math.min(14, (w < 24 ? 6 : w < 48 ? 9 : 12) + 2 * depth);

  /** Its own clock for the slow wandering below, from a random point so no two tokens keep step. */
  let clock = Math.random() * 600;
  /** Slow beats that never line up, folded into one value in 0-1: the fog's gusts never repeat. */
  const beats = (t: number, o: number) =>
    0.5 + 0.25 * Math.sin(t * 0.37 + o) + 0.15 * Math.sin(t * 0.61 + 2 * o + 2) + 0.1 * Math.sin(t * 1.13 + 3 * o + 4);
  /** The fog's swells: now and then it thickens and rolls out wider for a few seconds. Time to the next (s), how far into this one, how long it lasts, how strong. */
  let swellIn = 3 + Math.random() * 6;
  let swellAge = -1;
  let swellLen = 4;
  let swellK = 1;
  /** How swollen the fog is now (0-1). */
  let mist = 0;
  // The vortex's plane leans and rolls a little as it turns, wandering.
  let tilt = 0.38;
  let roll = -0.16;

  /** A score or a win: the shards drawn in with the fog, to break out as it surges. */
  const mend = (k: number) => {
    flingV -= 1.5 * k;
    burst = 2.2 * k;
  };

  const fog = auraShape(ctx, (f, _age, b) => {
    const R = b.w / 2;
    const ring = R * (1.42 + 0.4 * depth + 0.14 * mist) * ringMul * spread;
    const base = R * (2.6 + 0.6 * depth + 0.5 * swell);
    // A swell rolls it out sideways; up and down it keeps to the base reach.
    const reach = base + R * 0.9 * mist;
    // Flatter than wide (DELIRIUM_FLAT in the shader): up and down it reaches
    // only as far as the surge's brief billow.
    f.hw = reach / 0.72 + 1;
    f.hh = (base * 0.66 + 0.6 * R) / 0.72 + 1;
    f.k = ease(spilled / 0.7) * (1 - 0.4 * retreat) * (1 - 0.3 * frail) * (1 + 0.3 * swell + 0.12 * mist);
    f.q[0] = R;
    f.q[1] = ring;
    f.q[2] = flow;
    f.q[3] = depth;
    f.q[4] = surgePhase;
    f.q[5] = mist;
    f.q[6] = retreat;
    f.q[7] = 0;
    f.q[9] = reach;
    f.q[10] = tilt;
    f.q[11] = roll;
  });

  const shards = auraShape(ctx, (f, _age, b) => {
    const R = b.w / 2;
    // (They hold their orbit more than the fog does, so none crowd the face.)
    const ring = R * (1.5 + 0.35 * depth) * shardMul * (0.8 + 0.2 * spread);
    const out = ring * (1 + Math.max(0, fling) * 1.3) * 1.4;
    f.hw = (out + R * 1.4) / 0.72;
    f.hh = (out * 0.5 + R * 1.5) / 0.72;
    f.k = ease(spilled / 1.1) * (1 - 0.5 * retreat) * (1 - 0.3 * frail);
    f.q[0] = -R;
    f.q[1] = ring;
    f.q[2] = turn;
    f.q[3] = shardCount(b.w);
    f.q[4] = flash;
    f.q[5] = fling;
    f.q[6] = sweep;
    f.q[7] = depth;
    f.q[9] = 0;
    f.q[10] = tilt;
    f.q[11] = roll;
  });

  return {
    step(dt) {
      spilled += dt;
      spread = 0.3 + 0.7 * ease(spilled / 1.3);
      depth += (deepTo - depth) * (1 - Math.exp(-dt / 0.6));
      deepTo *= Math.exp(-dt / 150);
      spin *= Math.exp(-dt * 1.3);
      flash *= Math.exp(-dt * 2.6);
      if (flash < 0.003) flash = 0;

      // The surge: drawn in, then out in a billow, the shards catching in turn.
      ringMul = 1;
      swell = 0;
      surgePhase = -1;
      sweep = -1;
      if (surgeAge >= 0) {
        surgeAge += dt;
        const t = surgeAge;
        const drawnIn = t < INHALE ? ease(t / INHALE) : 1 - ease((t - INHALE) / 0.25);
        const ph = (t - INHALE) / SURGE;
        swell = ph > 0 && ph < 1 ? Math.sin(Math.PI * ph) : 0;
        ringMul = 1 - 0.12 * surgeK * drawnIn + 0.32 * surgeK * swell;
        if (ph >= 0 && ph < 1) surgePhase = ph;
        if (burst > 0 && t >= INHALE) {
          flingV += burst;
          burst = 0;
        }
        const sw = (t - INHALE) / sweepLen;
        if (sw >= 0 && sw < 1.2) sweep = sw;
        if (ph >= 1 && sw >= 1.2) surgeAge = -1;
      }

      // A swell of fog at irregular times: a wait of seven to twenty-odd
      // seconds, then three to six seconds of thickening and thinning back.
      // A fog running out holds it off.
      if (swellAge >= 0) {
        swellAge += dt;
        const ph = swellAge / swellLen;
        mist = ph < 1 ? swellK * ease(Math.sin(Math.PI * ph) * 1.25) : 0;
        if (ph >= 1) {
          swellAge = -1;
          swellIn = 7 + Math.random() * 14 + Math.random() * Math.random() * 8;
        }
      } else {
        mist = 0;
        swellIn -= dt * (retreatAge >= 0 ? 0 : 1);
        if (swellIn <= 0) {
          swellAge = 0;
          swellLen = 3 + Math.random() * 3;
          swellK = 0.65 + Math.random() * 0.35;
        }
      }
      mist *= 1 - retreat;

      // Running out: in fast, back slowly.
      retreat = 0;
      if (retreatAge >= 0) {
        retreatAge += dt;
        const t = retreatAge;
        retreat = retreatK * (t < 0.3 ? ease(t / 0.3) : 1 - ease((t - 0.3) / retreatLen));
        if (t > 0.3 + retreatLen) retreatAge = -1;
      }
      shardMul = (1 + (ringMul - 1) * 0.6) * (1 - 0.12 * retreat);
      ringMul *= 1 - 0.38 * retreat;

      // The vortex turns, faster deeper in, stalling as it runs out, in gusts
      // that rise and fall and never repeat; the shards ride it more slowly,
      // on gusts of their own.
      clock += dt;
      const gust = 0.7 + 0.6 * beats(clock, 0);
      const speed = Math.max(0.03, (0.34 + 0.3 * depth) * gust + spin - 0.32 * retreat);
      flow += dt * speed;
      turn += dt * (speed * 0.5 * (0.75 + 0.5 * beats(clock * 0.8, 1.7)) + 0.06);
      tilt = 0.38 + 0.05 * Math.sin(clock * 0.17) + 0.03 * Math.sin(clock * 0.41 + 1.3);
      roll = -0.16 + 0.08 * Math.sin(clock * 0.12 + 0.7) + 0.04 * Math.sin(clock * 0.31 + 2.1);

      // The flung shards swing back on a spring, overshooting a little (in
      // short steps, so a long frame can't throw it).
      const w = 7;
      for (let left = dt; left > 0; left -= 1 / 60) {
        const h = Math.min(left, 1 / 60);
        flingV += (-w * w * fling - 2 * 0.45 * w * flingV) * h;
        fling += flingV * h;
      }

      drain += (drainTo - drain) * (1 - Math.exp(-dt / 0.12));
      drainTo *= Math.exp(-dt / 1.8);

      const lit = ease(spilled / 0.9);
      fade(rim, shown[0], lit * (1 - 0.3 * retreat));
      fade(deep, shown[1], lit * Math.min(1, 1.1 * depth + 0.5 * frail));
      fade(flood, shown[2], Math.max(drain, 0.35 * frail));
    },
    react(e: AuraEvent) {
      switch (e.kind) {
        case 'arrive':
          spilled = 0;
          surge(0.8, 1);
          break;
        case 'vote':
          flash = 1;
          spin += 1.1;
          break;
        case 'score': {
          const s = Math.max(1, e.streak);
          deepTo = Math.max(deepTo, 1 - Math.pow(0.8, s));
          frail = 0;
          retreatAge = -1;
          surge(0.55 + (0.45 * Math.min(s, 5)) / 5, 0.7 + 0.06 * Math.min(s, 5));
          mend(0.6 + (0.4 * Math.min(s, 5)) / 5);
          break;
        }
        case 'miss':
          deepTo *= 0.35;
          runOut(0.65, 2.4);
          drainTo = Math.max(drainTo, 0.55);
          break;
        case 'hurt':
          deepTo = 0;
          runOut(1, 3.6);
          drainTo = 1;
          if (e.left <= 1) frail = 1;
          break;
        case 'win':
          deepTo = 1;
          frail = 0;
          retreatAge = -1;
          surge(1.3, 1.4);
          mend(1.2);
          break;
        case 'touch':
          flingV += 2.4;
          spin += 1.8;
          flash = Math.max(flash, 0.55);
          drainTo = Math.max(drainTo, 0.4);
          break;
      }
    },
    stop() {
      fog.stop();
      shards.stop();
      rim.remove();
      deep.remove();
      flood.remove();
    },
  };
}
