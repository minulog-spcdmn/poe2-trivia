// The Twilight Order aura (lib/auraKinds.ts). The token is the Order's
// lantern, the pierced golden orb their heralds carry on the crescent of
// their staves, a candle inside it: round its waist a ring of lancet windows
// glazed like those of their church in Arastas. It hangs tilted, all but
// still, throwing shafts of violet, gold, azure and crimson light out through
// its windows into the incense round it, which alone shows them; each shaft
// keeps its own time, wandering, gathering and thinning away on its own, so
// nothing turns round together. Dust turns in them. Those from the far side leave from
// behind the token, those from the near side start on its face, where the
// windows show lit. Round it hangs the light of dusk. One shape draws it all
// (twilight.glsl.ts); this keeps its time, swings it and listens.
//
// It hangs as a censer does, on a spring: a moment sets it swinging, and it
// settles. What happens to its player is the hour it keeps:
// - arrive: the lantern is lit, pane by pane round the orb, as the bell tolls.
// - vote: one swing of the censer, the incense puffed out, the bell once.
// - score: the bell tolls, light running out along every shaft, and the
//   lantern blazes. A streak brings the dawn the Order promises: each right
//   answer in a row lights more windows (the oculi above and below the
//   waist), lengthens the shafts and warms the dusk toward gold.
// - miss: it gutters, the panes flickering, its turning stalled, and the
//   dusk cools toward night before it steadies; the streak's dawn is lost.
// - hurt: night falls on it. Every pane goes dark and it relights only so
//   far: fewer panes for each life lost, a single pair with none left.
// - win: dawn. Every pane lit, the bell tolling, the lantern swinging wide.
// - touch: a swing and the incense stirred.

import type { AuraContext, AuraEvent, Burning } from './common';
import { auraShape } from './common';

const TAU = Math.PI * 2;
/** The lantern's turn at rest (rad/s): once round in a minute and a half, all but still; its shafts move on their own (twilight.glsl.ts), never carried round together. */
const TURN = TAU / 90;
/** Its tilt toward us (rad): enough that the ring of windows round its waist, and the light they throw, open out in perspective. */
const PITCH = 0.42;
/** The swing's pace (rad/s) and how fast it settles (1/s). */
const SWING_W = 2.4;
const SWING_DAMP = 0.55;
/** Panes lit at rest (the equator's eight), and all of them. */
const PANES = 8;
const ALL = 16;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number, to: number, dt: number, tau: number) => x + (to - x) * (1 - Math.exp(-dt / tau));

export function burn(ctx: AuraContext): Burning {
  let clock = 0;
  let spin = Math.random() * TAU;
  let pace = 1;
  // The swing (roll, rad) and its speed; a smaller sway of its tilt with it.
  let roll = 0;
  let rollV = 0;
  let sway = 0;
  let swayV = 0;
  let drift = 0;
  // Panes lit now; the most a lost life leaves lit.
  let open = 0;
  let cap = ALL;
  // Whether its player has won: the dawn, every window lit.
  let won = false;
  // While `dark` runs down nothing relights (a hurt's night).
  let dark = 0;
  // The hour (-1 night, 0 dusk, 1 dawn), and how deep a miss or a lost life
  // has made the night (0-1; it passes).
  let hour = 0;
  let night = 0;
  // The streak's glory: right answers in a row past the first (0-7), which
  // lights more panes and brings the dawn; it ebbs over a few minutes.
  let glory = 0;
  let flare = 0;
  let gut = 0;
  let toll = 99;
  let puff = 0;

  const swing = (k: number) => {
    // Pushed the way it is already going, so a swing builds and never jars.
    const dir = rollV >= 0 ? 1 : -1;
    rollV += dir * k;
    swayV += k * 0.5;
  };
  const ring = () => {
    toll = 0;
  };

  const light = auraShape(ctx, (f, _age, b) => {
    const R = b.w / 2;
    const big = clamp01((b.w - 34) / 30);
    // The shafts' reach: past the token about one and a half radii at rest,
    // further with the streak and the flare; a little less on a big token,
    // which would cover the page.
    // (Shorter on a small token in a row, so its shafts don't join its neighbours' in one bar.)
    const small = clamp01((36 - b.w) / 12);
    const reach = R * (0.95 - 0.25 * small + 0.07 * Math.min(glory, 5) + 0.2 * Math.min(flare, 1.5)) * (1 - 0.18 * big);
    // (The incense, and with it every shaft, is gone by R + 2.3 reach; the
    // quad's own fade begins at 0.72 of its half size.)
    // Up and down it stays within twice the radius (a flare's moment aside),
    // where in a list the next player sits.
    f.hw = (R + reach * 2.3) / 0.7;
    f.hh = (R * (2 + 0.6 * flare)) / 0.7;
    f.k = 1;
    f.q[0] = R;
    f.q[1] = spin;
    f.q[2] = roll + drift;
    f.q[3] = 1 + flare;
    f.q[4] = reach;
    f.q[5] = open;
    f.q[6] = hour;
    f.q[7] = gut;
    f.q[9] = PITCH + sway;
    f.q[10] = toll;
    f.q[11] = 1 + puff;
    f.calm = big === 0 || (toll > 2 && Math.abs(rollV) < 0.05 && gut <= 0);
  });

  return {
    step(dt) {
      clock += dt;
      toll += dt;
      // The swing: a damped pendulum, its tilt swaying with it.
      rollV += (-SWING_W * SWING_W * roll - 2 * SWING_DAMP * rollV) * dt;
      roll += rollV * dt;
      swayV += (-SWING_W * SWING_W * 1.3 * sway - 2 * SWING_DAMP * swayV) * dt;
      sway += swayV * dt;
      // At rest it never hangs quite still (a drift outside the spring's).
      drift = 0.05 * Math.sin(clock * 0.55) + 0.025 * Math.sin(clock * 0.31 + 1.7);
      // Panes kindle one after another (about six a second), or go dark.
      if (dark > 0) {
        dark -= dt;
        open = Math.max(0, open - dt * 24);
      } else {
        // (A streak lights the oculi two at a time, at most four of them: all
        // sixteen windows at once would throw light every way, and only the
        // win's dawn earns that.)
        const to = Math.min(won ? ALL : PANES + 2 * Math.min(glory, 2), cap);
        open = open < to ? Math.min(to, open + dt * 6) : Math.max(to, open - dt * 3);
      }
      // A lost life's limit lifts again over a minute or so, the glory ebbs,
      // and night and a guttering pass.
      cap = Math.min(ALL, cap + dt / 6);
      glory = Math.max(0, glory - dt / 25);
      night = Math.max(0, night - dt / 5);
      hour = ease(hour, night > 0 ? -night : Math.min(1, glory / 4), dt, 1.4);
      flare *= Math.exp(-dt * 1.1);
      gut = Math.max(0, gut - dt / 2.2);
      puff *= Math.exp(-dt * 0.8);
      pace = Math.min(1, pace + dt / 2.5);
      spin = (spin + dt * TURN * pace * (1 + 0.06 * Math.min(glory, 5) + 0.4 * flare)) % TAU;
    },
    react(e: AuraEvent) {
      switch (e.kind) {
        case 'arrive':
          open = 0;
          dark = 0.15;
          ring();
          swing(0.5);
          break;
        case 'vote':
          swing(0.9);
          puff = Math.min(1.5, puff + 0.8);
          ring();
          flare = Math.max(flare, 0.25);
          break;
        case 'touch':
          swing(0.7);
          puff = Math.min(1.5, puff + 0.6);
          break;
        case 'score': {
          const n = Math.min(Math.max(e.streak, 1), 8);
          glory = n - 1;
          night = 0;
          flare = Math.max(flare, 0.5 + 0.07 * n);
          ring();
          swing(0.4);
          break;
        }
        case 'miss':
          glory = 0;
          night = 0.7;
          gut = 1;
          pace = 0;
          flare = 0;
          break;
        case 'hurt': {
          glory = 0;
          night = 1;
          gut = 0.6;
          pace = 0;
          flare = 0;
          dark = e.left <= 0 ? 1.6 : 0.8;
          cap = e.left <= 0 ? 2 : Math.max(2, Math.min(PANES, 2 * e.left + 2));
          swing(1.1);
          break;
        }
        case 'win':
          glory = 7;
          won = true;
          cap = ALL;
          dark = 0;
          night = 0;
          flare = 1.2;
          ring();
          swing(1.3);
          break;
      }
    },
    stop() {
      light.stop();
    },
  };
}
