// The corrupted aura (lib/auraKinds.ts): corruption itself, not a thing that
// carries it. Round the token lives a growth of tendrils full of dark, heavy
// blood, translucent and lit from within: each grows out tip first along a
// path of its own, curling so it wreathes round the token (behind it above,
// over its edge below) and over the others, writhes a while with the blood
// pulsing out along it, then dies back from the tip, and grows again
// elsewhere; each at its own pace, so some sprout while others wither. They
// sprawl sideways and keep close above and below. Now and then one reaches
// in over the rim and wraps round the face (low on it, or down a side,
// clear of the letter), grips, the face darkening with blood and veined
// under it, then lets go and dies back as another takes hold. A dark seep of blood
// clings to the rim and stains the face's edge. Every so often the
// corruption draws: blood surges out from the rim along every tendril.
//
// What happens to the player happens to the growth:
// - arrive: it grows out from behind the token.
// - vote: one draw.
// - score: the corruption takes hold deeper: a strong draw surges out from
//   the rim, and the tendrils grow quicker, reach further and thicken; a
//   streak deepens it more, and it stays, ebbing over half a minute; a free
//   tendril reaches for the face.
// - miss: it is thrown back: the tendrils shrink back toward the token and
//   dull, then grow again; what grips the face lets go.
// - hurt: it tears: the tendrils break into lengths and the growth draws in
//   and darkens; the fewer lives left, the thinner it stays.
// - win: corruption at its deepest, drawing in again and again.
// - touch: a small draw.
//
// The light is the shader's (corrupted.glsl.ts); the darkness the growth
// lies in is a page layer under the token (light can't darken), dithered.

import dither from '../../../assets/dither.png';
import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** How far the token's own rim reaches past its face (Avatar.svelte), px. */
const RIM = 3;
/** Seconds between draws at rest. */
const REST = 3.4;
/** How long the taint takes to bloom out on arriving (s). */
const BLOOM = 1.6;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const smooth = (x: number) => x * x * (3 - 2 * x);

export function burn(ctx: AuraContext): Burning {
  // The darkness the growth lies in: round the token, thinning out to
  // nothing past the taint, in % of the token's box so it scales with it.
  const dark = document.createElement('div');
  Object.assign(dark.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    // (Wide and low: it sprawls sideways with the growth, not into the rows above and below.)
    width: '300%',
    height: '135%',
    borderRadius: '50%',
    pointerEvents: 'none',
    imageRendering: 'pixelated',
    transform: 'translate(-50%, -50%) scale(0.5)',
    willChange: 'transform, opacity',
    opacity: '0',
    background: `radial-gradient(closest-side, rgba(5, 0, 2, 0.8) 40%, rgba(6, 0, 2, 0.5) 58%, rgba(4, 0, 1, 0.18) 78%, rgba(0, 0, 0, 0)), url(${dither})`,
  });
  ctx.under.append(dark);

  // The corruption in the token's own face: dark blood seeping in over it
  // from its edge, more on one side than the other (light added over a
  // bright face would only turn it pink, and a red multiplied into a blue
  // one turns it purple); the letter in the middle stays clear. It turns
  // slowly, deepens with a streak and floods in as a draw lands.
  const stain = document.createElement('div');
  Object.assign(stain.style, {
    position: 'absolute',
    inset: '0',
    borderRadius: '50%',
    pointerEvents: 'none',
    imageRendering: 'pixelated',
    willChange: 'transform, opacity',
    opacity: '0',
    background: `radial-gradient(closest-side at 42% 46%, rgba(96, 8, 16, 0) 54%, rgba(88, 6, 14, 0.42) 76%, rgba(62, 2, 9, 0.8) 100%), url(${dither})`,
  });
  ctx.over.append(stain);
  let stainTurn = rand(0, 360);

  // The two tendrils that grasp the face: now and then one reaches in over
  // the rim and wraps round the face (low on it mostly, or down a side,
  // clear of the letter), grips it, and lets go and dies back; the shader
  // draws it, and here the face darkens with blood under its grip, in the
  // arc it holds. Their lives are kept here so the stain can follow them.
  const grips = [0, 1].map((j) => {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      inset: '0',
      borderRadius: '50%',
      pointerEvents: 'none',
      imageRendering: 'pixelated',
      willChange: 'opacity',
      opacity: '0',
    });
    ctx.over.append(el);
    return {
      el,
      bg: '',
      /** Where it reaches in (of 64 round the token), how far it curls (0-7), which way, which side. */
      k: 0,
      c: 0,
      dir: 1,
      side: 1,
      /** Its age and its life (s of the growth's time; 0: none now), and the wait for the next. */
      age: 0,
      life: 0,
      rest: j === 0 ? rand(0.4, 2) : rand(3.5, 6),
    };
  });
  type Grip = (typeof grips)[number];

  const seize = (g: Grip, other: Grip) => {
    // On the other side from the other one, if it's holding.
    const side = other.life > 0 ? -other.side : Math.random() < 0.5 ? -1 : 1;
    let a0: number;
    if (Math.random() < 0.65) {
      // Low on the face, across under the letter.
      a0 = Math.PI / 2 + side * rand(0.75, 1.45);
      g.dir = -side;
    } else {
      // From high on a side, down round it.
      a0 = -Math.PI / 2 + side * rand(0.5, 1.0);
      g.dir = side;
    }
    g.side = side;
    g.k = ((Math.round((a0 / (2 * Math.PI)) * 64) % 64) + 64) % 64;
    g.c = Math.floor(rand(0, 8));
    g.age = 0;
    g.life = rand(7, 10);
  };
  /** How far a grip is through its life, 0-1. */
  const lifeOf = (g: Grip) => (g.life > 0 ? clamp(g.age / g.life) : 0);
  /** Its packing for the shader (corrupted.glsl.ts). */
  const packed = (g: Grip) => (g.life > 0 ? g.dir * (1 + g.k + 64 * g.c + 0.998 * lifeOf(g)) : 0);
  const letGo = () => {
    for (const g of grips) if (g.life > 0) g.age = Math.max(g.age, 0.76 * g.life);
  };

  let clock = 0;
  /** The growth's own time (s), which its tendrils live by, and how fast it runs now. */
  let flow = rand(0, 200);
  let flowRate = 1;
  /** How deep the corruption runs: lasting (a streak's) and a moment's. */
  let deep = 0;
  let surge = 0;
  /** The last draw: its age and strength; seconds to the next at rest. */
  let drawAge = 99;
  let drawK = 0;
  let untilDraw = rand(0.5, REST);
  /** Draws to come (a win): when (clock, s) and how strong. */
  let queued: { at: number; k: number }[] = [];
  /** Thrown back (a miss), torn (a lost life), the life left, how far it has spread. */
  let thrown = 0;
  let torn = 0;
  let vigor = 1;
  let spread = 0;

  const draw = (k: number) => {
    drawAge = 0;
    drawK = k;
  };

  const react = (e: AuraEvent) => {
    switch (e.kind) {
      case 'arrive':
        spread = 0;
        queued = [];
        untilDraw = BLOOM + 0.2;
        break;
      case 'vote':
        draw(0.9);
        untilDraw = REST;
        break;
      case 'score': {
        const n = Math.max(1, e.streak);
        deep = Math.max(deep, clamp(0.22 * n, 0, 1.2));
        surge = 0.5 + 0.06 * Math.min(n, 6);
        thrown = 0;
        // It takes hold: a tendril that's free reaches for the face now.
        for (const g of grips) if (g.life === 0) g.rest = Math.min(g.rest, 0.15);
        draw(1.3 + 0.08 * Math.min(n, 6));
        untilDraw = REST;
        break;
      }
      case 'miss':
        // Thrown back: flung out, the tendrils creeping outward, dulled.
        thrown = 1;
        deep *= 0.5;
        surge = 0;
        flowRate = -2.2;
        letGo();
        queued = [];
        untilDraw = REST * 1.2;
        break;
      case 'hurt': {
        // Torn: the tendrils break and the growth draws in; lives lost thin it for good.
        const left = Math.max(0, e.left);
        torn = 1;
        deep = 0;
        surge = 0;
        queued = [];
        flowRate = 0.3;
        letGo();
        vigor = left === 0 ? 0.4 : left === 1 ? 0.65 : Math.min(vigor, 0.85);
        untilDraw = REST * 1.4;
        break;
      }
      case 'win':
        deep = 1.5;
        surge = 0.8;
        thrown = 0;
        torn = 0;
        vigor = 1;
        queued = [0, 1, 2, 3].map((j) => ({ at: clock + j * 0.7, k: 1.5 }));
        for (const [j, g] of grips.entries()) if (g.life === 0) g.rest = Math.min(g.rest, 0.1 + 0.8 * j);
        untilDraw = REST;
        break;
      case 'touch':
        draw(0.7);
        untilDraw = REST;
        break;
    }
  };

  const light = auraShape(ctx, (f, age, b) => {
    const R = b.w / 2 + RIM * (b.w / 32) ** 0.5;
    // (The growth sprawls sideways at most 2.4 radii past the rim, and keeps
    // close above and below: it's gone inside the ellipse the quad holds,
    // 0.72 of it.)
    f.hw = 4.8 * R;
    f.hh = 2.6 * R;
    f.k = clamp(age / 0.4);
    f.q[0] = R;
    f.q[1] = flow;
    f.q[2] = deep + surge;
    f.q[3] = drawAge;
    f.q[4] = thrown;
    f.q[5] = torn;
    f.q[6] = vigor;
    f.q[7] = smooth(clamp(spread));
    f.q[9] = drawK;
    f.q[10] = packed(grips[0]);
    f.q[11] = packed(grips[1]);
    // Drawn at half the rate on a phone while it only seeps.
    f.calm = drawAge > 1.6 && thrown < 0.05 && torn < 0.05 && spread >= 1 && surge < 0.05;
  });

  return {
    react,
    step(dt, b) {
      clock += dt;
      drawAge += dt;
      spread = Math.min(1, spread + dt / BLOOM);
      deep = Math.max(0, deep - dt / 30);
      surge *= Math.exp(-dt / 1.2);
      thrown *= Math.exp(-dt / 1.1);
      torn *= Math.exp(-dt / 2.2);

      // The growth's own time: a second a second at rest, quicker the deeper
      // the corruption runs (the tendrils grow and wreathe faster); after a
      // throw it runs backward for a moment (they shrink back) and settles.
      const want = (1 + 0.55 * Math.min(deep + surge, 1.5)) * (0.6 + 0.4 * vigor);
      flowRate += (want - flowRate) * (1 - Math.exp(-dt / 0.9));
      flow += flowRate * dt;

      // The draws: off the rhythm when queued, now and then at rest.
      if (queued.length && clock >= queued[0].at) draw(queued.shift()!.k);
      untilDraw -= dt;
      if (untilDraw <= 0 && spread >= 1) {
        draw(0.45 + 0.3 * Math.min(deep, 1));
        untilDraw = REST * (1 - 0.25 * Math.min(deep, 1)) + rand(-0.4, 0.4);
      }

      // The darkness: out with the taint, flung wider by a throw, drawn in by a tear.
      const R = b.w / 2 + RIM * (b.w / 32) ** 0.5;
      const small = 1 - smooth(clamp((R - 12) / 22));
      const reach = smooth(clamp(spread)) * (1 + 0.15 * thrown - 0.12 * torn) * (0.85 + 0.15 * vigor) * (1 - 0.18 * small);
      const op = (smooth(clamp(spread)) * (0.68 + 0.2 * torn) * (1 - 0.4 * small)).toFixed(3);
      const tf = `translate(-50%, -50%) scale(${(0.5 + 0.5 * reach).toFixed(3)})`;
      if (dark.style.opacity !== op) dark.style.opacity = op;
      if (dark.style.transform !== tf) dark.style.transform = tf;

      // The stain in the face: it turns slowly with the creep, deepens with a
      // streak, floods in as a draw lands, shrinks back from a throw.
      stainTurn = (stainTurn + dt * (4 + 10 * Math.min(deep + surge, 1.5)) * (thrown > 0.3 ? -1 : 1)) % 360;
      const landed = drawAge < 0.42 ? 0 : Math.exp(-Math.max(drawAge - 0.52, 0) / 0.5) * smooth(clamp((drawAge - 0.42) / 0.1));
      const sOp = smooth(clamp(spread)) * (0.5 + 0.25 * Math.min(deep + surge, 1) + 0.3 * landed * drawK + 0.25 * torn) * (1 - 0.6 * thrown);
      const so = clamp(sOp).toFixed(3);
      const st = `rotate(${stainTurn.toFixed(1)}deg)`;
      if (stain.style.opacity !== so) stain.style.opacity = so;
      if (stain.style.transform !== st) stain.style.transform = st;

      // The grips: their lives (never run backward: a throw makes them let
      // go instead), and the blood darkening the face in the arc each holds.
      for (const [j, g] of grips.entries()) {
        if (g.life === 0) {
          g.rest -= dt;
          if (g.rest <= 0 && spread >= 1) seize(g, grips[1 - j]);
        } else {
          g.age += Math.max(flowRate, 0.6) * dt;
          if (g.age >= g.life) {
            g.life = 0;
            g.rest = rand(1.5, 5) * (1 - 0.4 * Math.min(deep, 1));
          }
        }
        const u = lifeOf(g);
        const held = g.life > 0 ? smooth(clamp((u - 0.12) / 0.3)) * (1 - smooth(clamp((u - 0.72) / 0.24))) : 0;
        const gOp = clamp(held * smooth(clamp(spread)) * (1 - 0.6 * thrown) * 0.95).toFixed(3);
        if (g.el.style.opacity !== gOp) g.el.style.opacity = gOp;        if (g.life > 0 && held > 0) {
          // Blood pooling in the face along the arc it lies on, from where it
          // comes over the rim to its tip (as the shader's path,
          // corrupted_at, about 0.7 of the face out), soft blots that run
          // together; thinner toward the tip.
          const a0 = (g.k / 64) * 2 * Math.PI;
          const curl = 1.5 + 0.14 * g.c;
          const grown = Math.max(smooth(clamp(u / 0.4)), 0.3);
          const blots: string[] = [];
          for (let n = 0; n < 5; n++) {
            const s = 0.3 + ((grown - 0.3) * n) / 4;
            const a = a0 + g.dir * curl * s;
            const x = 50 + 35 * Math.cos(a);
            const y = 50 + 35 * Math.sin(a);
            const size = (b.w * (0.23 - 0.022 * n)).toFixed(1);
            blots.push(`radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, rgba(72, 2, 11, 0.95), rgba(66, 2, 10, 0.75) ${(+size * 0.5).toFixed(1)}px, rgba(66, 2, 10, 0) ${size}px)`);
          }
          const bg = `${blots.join(', ')}, url(${dither})`;
          if (g.bg !== bg) {
            g.bg = bg;
            g.el.style.background = bg;
          }
        }
      }
    },
    stop() {
      light.stop();
      dark.remove();
      stain.remove();
      for (const g of grips) g.el.remove();
    },
  };
}
