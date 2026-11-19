// The shadow aura: the Shadow's dark, engulfing the wearer and never the
// same from one half second to the next. It is ink more than cloud, as the
// game draws his Darkness: black with a body, its edges combed into spikes
// and streaks, born on him and torn away along a flow that parts at an
// upright axis and streams off to both sides. One stuff, drawn by the
// shader inside the token and outside it (shadow.glsl.ts), from one field:
//
// - Its light (the effects' canvas, added over the page): ink standing in
//   front of lit wisps of jade and mint, black where their light stops.
// - Its shade (the canvas under that one, laid over the page:
//   lib/fx/shade.ts): the same ink as darkness. Outside the token it is
//   black where the light stops, which a lit row of a list shows. Over the
//   token it is the body come round in front of it, on one side, which
//   wanders: black and whole over the rim, drawn out toward the middle into
//   streaks along the flow that are torn to scraps and gone; see-through
//   where it is thin, a dull jade on a streak's upper edge, and its soft
//   shadow on the face beside it. The letter reads between, and the
//   player's colour stays theirs.
//
// Nothing of it is the page's own any more: no pictures, no layers. Where
// the shade can't be drawn (no WebGL2 left for it) it is its light alone:
// the smoke round the token, the face clear.
//
// What it does when something happens to its player:
// - arrive: he comes out of his Shroud. A blot of ink with a fur of spikes
//   bursts round the token and over its rim, and the smoke gathers out of
//   it, heavy at first.
// - vote: his dash. A straight feathered black streak is left off one side,
//   the blade's cold line beside it, and tears away; the smoke is swept on.
// - score: the Eclipse, then a cut. The realm's light rushes in from the
//   sides (sage lines, silver hairlines, a jade glow behind the token, the
//   ink black against it) and holds for half a second; one dark beat, in
//   which the ink over the face draws in and blackens; then a white star
//   and one thick lune swept along one side of the wearer in a tenth of a
//   second, lying against the smoke: white-hot, then mint, then bottle
//   green, then black in the same shape, torn away, with a Shroud's burst
//   of ink under it. The realm outlasts the cut by a third of a second and
//   is gone; nothing of it stays at rest. Each right answer in a row makes
//   it a greater cut: the lune a fan of two, then three nested leaves of
//   the one sweep, wider, further out and held longer; from the third a
//   second cut from the other side once the first has cooled, never two
//   white arcs at once; and it leaves the smoke heavier for a while, over
//   the face too.
// - miss: the smoke falters. Its flow stalls, holes open in it, over the
//   face as round it, and its light drains grey; then it draws up again.
// - hurt: it is torn. The flow recoils into him, the side that reached
//   furthest is ripped away and grows back slowly, and with each life lost
//   there is less of it.
// - win: the longest Eclipse, three cuts in a row, and the smoke at its
//   heaviest for a long while.
// - touch: it flinches. A small burst of ink and the flow hurries on.
//
// Its cost: one shape at all times (larger for the second or so of a
// score), drawn twice: its light, and its shade within two radii of the
// token. No layers of the page, nothing painted, nothing written to the
// page in a frame.

import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** The token's rim (px at 32 px across), as the avatar draws it. */
const RIM = 3;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (x: number, to: number, rate: number, dt: number) => x + (to - x) * (1 - Math.exp(-dt * rate));
/** Two numbers (0 to 1) in one, as the shader takes them apart (sh_pair). */
const pack = (a: number, b: number) => Math.round(clamp01(a) * 1000) + Math.min(clamp01(b), 0.999);

/** A number (0 to 1) that wanders: now and then it picks somewhere new to go, and eases there. */
class Wander {
  x: number;
  private y: number;
  private to: number;
  private next = Math.random() * 3;
  private high = Math.random() < 0.5;
  /** `ends`: it keeps to either end of its range rather than the middle, and seldom to the same end twice running. */
  constructor(private ends = false) {
    this.x = this.y = this.to = this.pick();
  }
  private pick() {
    const r = Math.random();
    if (!this.ends) return r;
    if (Math.random() < 0.8) this.high = !this.high;
    return this.high ? 1 - 0.3 * r : 0.3 * r;
  }
  step(dt: number) {
    this.next -= dt;
    if (this.next <= 0) {
      this.to = this.pick();
      this.next = this.ends ? 1.8 + Math.random() * 2.4 : 2.5 + Math.random() * 3.5;
    }
    const k = 1 - Math.exp(-dt * 1.1);
    this.y += (this.to - this.y) * k;
    this.x += (this.y - this.x) * k;
  }
  /** Sent to `to` at once and kept from wandering for `s` seconds. */
  send(to: number, s: number) {
    this.to = this.y = to;
    this.next = s;
  }
}

/** A score under way: the Eclipse, and the cuts still to come. */
type Score = { t: number; at: number; hold: number; lev: number; amp: number; cuts: number; gap: number; done: number };

export function burn(ctx: AuraContext): Burning {
  /** How far it has come in (0 to 1), and how long that takes (s). */
  let come = 0;
  let comeTime = 1.2;
  /** The flow's clock (s) and its pace: 1 at rest, stalled by a falter, backward in a recoil, hurried by a touch. */
  let flow = Math.random() * 40;
  let speed = 1;
  /** The ink: how much there is now; what a streak has left on it; how much the lives left allow. */
  let heft = 0;
  let extra = 0;
  let vigor = 1;
  /** How torn it is (0 to 1), and how fast that mends (1/s). */
  let torn = 0;
  let mend = 0.9;
  /** A burst under way (its kind as the shader has it; 0: none). */
  const burst = { kind: 0, t: 0, dur: 0.65 };
  /** The realm: its strength, its lines' travel (trips) and their pace. */
  const realm = { dens: 0, flow: Math.random() * 300, speed: 1.6 };
  /** The cut under way (t 0: none). */
  const cut = { idx: 0, lev: 0, t: 0 };
  let sc: Score | null = null;
  /** The dark beat before a cut (0 to 1): the ink over the face draws in and blackens. */
  let beat = 0;
  /** The shape's size: 0 at rest, 1 with room for a score. */
  let room = 0;

  const reachL = new Wander(true);
  const reachR = new Wander(true);
  const tiltL = new Wander();
  const tiltR = new Wander();
  const wellTop = new Wander();
  const wellFoot = new Wander();

  const burstNow = (kind: number) => {
    burst.kind = kind;
    burst.t = 0;
    burst.dur = kind >= 5 ? 0.5 : 0.65;
  };
  const cutNow = (lev: number) => {
    cut.idx = Math.floor(Math.random() * 64);
    cut.lev = lev;
    cut.t = 0.001;
  };
  const busy = () => !!sc || realm.dens > 0.002 || cut.t > 0 || burst.kind > 0 || torn > 0.03 || Math.abs(speed - 1) > 0.25;

  // Its one shape: the light, and from the same numbers the shade.
  const light = auraShape(ctx, (f, _age, b) => {
    const R = b.w / 2;
    const tok = R + RIM * (b.w / 32) ** 0.5;
    f.hw = mix((2.9 * R + 4) / 0.72, tok * 4.8, room);
    f.hh = mix((1.7 * R + 4) / 0.72, tok * 3.4, room);
    f.k = come;
    f.calm = !busy();
    f.q[0] = R;
    f.q[1] = flow;
    f.q[2] = pack(reachL.x, reachR.x);
    f.q[3] = pack(tiltL.x, tiltR.x);
    f.q[4] = pack(wellTop.x, wellFoot.x);
    f.q[5] = heft;
    f.q[6] = pack(torn, beat);
    f.q[7] = burst.kind > 0 ? burst.kind + Math.min(burst.t / burst.dur, 0.999) : 0;
    f.q[9] = realm.dens;
    f.q[10] = realm.flow;
    f.q[11] = cut.t > 0 ? cut.idx * 64 + cut.lev * 8 + Math.min(cut.t, 7.9) : 0;
  });

  const react = (e: AuraEvent) => {
    switch (e.kind) {
      case 'arrive':
        // Out of his Shroud: the blot bursts and the smoke gathers out of it.
        come = 0;
        comeTime = 0.5;
        heft = 0;
        extra = Math.max(extra, 0.5);
        burstNow(3);
        break;
      case 'vote':
        // His dash: a black streak left off one side; the smoke swept on.
        burstNow(Math.random() < 0.5 ? 5 : 6);
        speed = Math.max(speed, 2.4);
        break;
      case 'score': {
        // The Eclipse, then the cut; greater with each right answer in a row.
        const lev = Math.min(Math.max(1, e.streak) - 1, 3);
        sc = { t: 0, at: 0.5 + 0.08 * lev, hold: 0.32 + 0.1 * lev, lev, amp: 0.95 + 0.13 * lev, cuts: 1, gap: 0, done: 0 };
        realm.speed = 5;
        torn = 0;
        speed = Math.max(speed, 1.5);
        break;
      }
      case 'miss':
        // It falters: the flow stalls, holes open, the light drains.
        sc = null;
        torn = 0.85;
        mend = 0.9;
        speed = 0.08;
        extra *= 0.4;
        break;
      case 'hurt': {
        // Torn: the flow recoils into him, the side that reached furthest is
        // ripped away, and less of it is left with each life lost.
        sc = null;
        torn = 1;
        mend = 0.55;
        speed = -3;
        extra = 0;
        // (Less, but always a body: without one it is strands, not his dark.)
        vigor = e.left <= 0 ? 0.66 : e.left === 1 ? 0.8 : Math.min(vigor, 0.9);
        (reachL.x > reachR.x ? reachL : reachR).send(0, 2.5);
        break;
      }
      case 'win':
        // The longest Eclipse, three cuts, and the smoke at its heaviest.
        vigor = 1;
        torn = 0;
        sc = { t: 0, at: 0.6, hold: 1.1, lev: 3, amp: 1.4, cuts: 3, gap: 0.85, done: 0 };
        realm.speed = 6;
        break;
      case 'touch':
        // It flinches: a small burst of ink, and the flow hurries on.
        if (!burst.kind) burstNow(1);
        speed = Math.max(speed, 2.6);
        break;
    }
  };

  return {
    react,
    step(dt) {
      come = Math.min(1, come + dt / comeTime);
      speed = ease(speed, 1, 1.6, dt);
      flow += dt * speed;
      for (const w of [reachL, reachR, tiltL, tiltR, wellTop, wellFoot]) w.step(dt);

      // The score: the realm rushes in and holds; a dark beat; the cut (a
      // Shroud's burst under it), which leaves the ink heavier; the realm
      // holds a little longer and is gone.
      let realmTo = 0;
      let rate = 9;
      if (sc) {
        sc.t += dt;
        const last = sc.at + sc.gap * (sc.cuts + sc.done - 1);
        if (sc.t < sc.at - 0.06) realmTo = sc.amp;
        else if (sc.t < sc.at) {
          realmTo = 0.25 * sc.amp;
          rate = 30;
          beat = 1;
        } else if (sc.t < last + sc.hold) realmTo = sc.amp;
        if (sc.cuts > 0 && sc.t >= sc.at + sc.gap * sc.done) {
          sc.cuts--;
          sc.done++;
          cutNow(sc.lev);
          burstNow(1 + Math.min(sc.lev, 2));
          extra = Math.min(1, extra + 0.3 + 0.15 * sc.lev);
          speed = Math.max(speed, 2.2);
        }
        if (sc.cuts === 0 && sc.t > last + sc.hold + 0.5) sc = null;
      }
      realm.dens = ease(realm.dens, realmTo, realmTo > realm.dens ? 16 : rate, dt);
      if (realmTo === 0 && realm.dens < 0.004) realm.dens = 0;
      realm.speed = ease(realm.speed, 1.6, 2.5, dt);
      realm.flow += dt * realm.speed;
      beat = Math.max(0, beat - dt * 9);
      if (cut.t > 0) {
        cut.t += dt;
        if (cut.t > 1.9) cut.t = 0;
      }
      if (burst.kind) {
        burst.t += dt;
        if (burst.t >= burst.dur) burst.kind = 0;
      }
      room = ease(room, sc || realm.dens > 0.002 || cut.t > 0 || burst.kind >= 5 ? 1 : 0, 14, dt);

      // The ink: what a streak left ebbs over a quarter of a minute (a win's, far longer).
      extra *= Math.exp(-dt / (vigor >= 1 && extra > 0.6 ? 14 : 8));
      heft = ease(heft, come * (vigor + extra), 4, dt);
      torn = Math.max(0, torn - dt * mend);
    },
    stop() {
      light.stop(0.4);
    },
  };
}
