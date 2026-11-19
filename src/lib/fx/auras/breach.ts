// The breach aura (lib/auraKinds.ts). A breach lies open on the ground under
// the token, as one does round a player who has touched the hand: a torn ring
// of violet light seen tilted, its far side behind the token, purple swirling
// in the dark within it. Out of it rises one of Xesht's hands and holds the
// token from behind, its long fingers rising past the rim and hooking over
// it, their claws and the thumb's coming round in front to press on the face.
// The breach's light seeps out from behind the token, so the hand stands dark
// against it. Its light is the shader's (breach.glsl.ts); over the face, where
// light can't darken, the claws' dark flesh is the page's (over the face, cut
// to it). Each token is held from its own side.
//
// The hand is never still and never moves as one: each finger follows the
// grip a little late, by its own lag, drifts on its own, and now and then
// lifts and comes down again (sometimes twice; sometimes they drum, little
// finger to index); every so often the hand lets go a little and shifts its
// grip round the token. Left alone, the breach starves: now and then it
// narrows a little and slowly opens again.
//
// It answers what happens to its player as a breach does:
// - arrive: the hand rises out of the opening breach and closes on the token.
// - vote: the hand squeezes, and a pulse runs round the breach's edge.
// - score: the breach grows, as kills make it grow, the hand tightens on the
//   token and splinters are thrown up out of it; a streak keeps it wider and
//   the grip harder, trembling, and from the third right answer a second
//   hand claws up out of it beside the token.
// - miss: the breach shrinks and its light falters; the hand flinches, its
//   fingers springing loose, and grips again.
// - hurt: the hand loses its hold and slips down into the breach, lower and
//   looser with each life lost; the breach shrinks and its light stutters.
// - win: the breach opens wide, both hands up, the hand clutching the token,
//   splinters flying.
// - touch: the fingers flex open and snap shut on the token again, and the
//   breach's edge flares.

import { budget, particle, type Box } from '../core';
import { rand } from '../effects';
import { Shape } from '../particles';
import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** How far the token's own rim reaches past its face (Avatar.svelte), px, at 32 px across. */
const RIM = 3;
/** How long a streak keeps the breach wide after the last right answer (s). */
const HOLD = 9;

// The hand, as the shader draws it (breach.glsl.ts: keep the two in step),
// in the ball's radii, +y down, for a hand whose thumb is to the left: the
// palm's centre; each finger's knuckle (from the palm), its way, length,
// girth and curl; each bone's length and girth; how each bone turns round
// the ball as it grips, and how much.
const PALM = [-0.08, 0.3];
const KNUCKLE = [
  [-0.5, 0.18],
  [-0.36, -0.68],
  [-0.08, -0.82],
  [0.2, -0.76],
  [0.43, -0.6],
];
const ANG = [-2.45, -1.86, -1.62, -1.36, -1.1];
const LEN = [0.8, 0.94, 1.05, 0.97, 0.78];
const GIRTH = [1.25, 1.0, 1.02, 0.96, 0.86];
const CURL = [1.0, 1.0, 0.8, 0.62, 0.45];
const BONE = [0.6, 0.4, 0.3, 0.36];
const THICK = [0.11, 0.092, 0.08, 0.066, 0.04, 0.006];
const HOOK = [0, -0.3, 1.35, 1.6];
const AIM = [0, 0.8, 1, 1];
/** The holding hand's size, in the token's radii (with its rim) to the ball's. */
const HS = 1.12;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** The turn from one angle to another, the short way round. */
const toward = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** A damped spring (x toward a target, v its speed), stepped in small steps so a long frame can't throw it. */
type Spring = { x: number; v: number };
function pull(s: Spring, target: number, w: number, z: number, dt: number) {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (-w * w * (s.x - target) - 2 * z * w * s.v) * h;
    s.x += s.v * h;
  }
}

/** A finger's bone in the hand's frame: where it starts, its way (rad), its length, and how far along the finger it starts. */
type Bone = { x: number; y: number; a: number; len: number; s: number };

/**
 * One finger as the shader builds it, at grip g, round the ball at (cx, cy)
 * of radius r (hand frame): its last bone and its claw, and how far along it
 * passes the ball's edge (in front of it from there).
 */
function finger(f: number, g: number, cx: number, cy: number, r: number) {
  let x = PALM[0] + KNUCKLE[f][0];
  let y = PALM[1] + KNUCKLE[f][1];
  let a = ANG[f];
  let s = 0;
  let past = 1e3;
  let rp = Math.hypot(x - cx, y - cy);
  let last: Bone = { x, y, a, len: 0, s };
  let claw: Bone = last;
  for (let j = 0; j < 4; j++) {
    const bend = j === 0 ? 0 : j === 1 ? 0.22 + 0.42 * g : j === 2 ? 0.3 + 0.5 * g : 0.55 + 0.6 * g;
    a += CURL[f] * bend;
    const want = Math.atan2(x - cx, -(y - cy)) + HOOK[j] * (1 + 0.6 * Math.max(g - 1, 0));
    a += Math.min(1, AIM[j] * Math.max(g, 0)) * toward(a, want);
    const len = BONE[j] * LEN[f] * (j === 1 ? 1 - 0.22 * g : j === 2 ? 1 - 0.3 * g : 1);
    if (j === 3) {
      claw = { x, y, a, len, s };
      break;
    }
    if (j === 2) last = { x, y, a, len, s };
    const nx = x + len * Math.cos(a);
    const ny = y + len * Math.sin(a);
    const r2 = Math.hypot(nx - cx, ny - cy);
    if (past > 999 && r2 > r) past = s + len * clamp((r - rp) / Math.max(r2 - rp, 1e-4));
    rp = r2;
    x = nx;
    y = ny;
    s += len;
  }
  return { last, claw, past };
}

/** A finger's own motion: how it follows the grip, drifts, lifts and flinches. */
type Finger = {
  /** Its grip, following the hand's, and the grip it is given (with all the rest). */
  base: number;
  g: number;
  lag: number;
  w1: number;
  w2: number;
  p1: number;
  p2: number;
  /** When it next lifts, how long since it last did (s), and whether it comes down twice. */
  tapAt: number;
  tapT: number;
  twice: boolean;
  /** Letting go a little as the hand shifts (s since, or below 0 to come). */
  looseT: number;
  /** A flinch opening it, and one still to come (at kickAt). */
  kick: number;
  kickNext: number;
  kickAt: number;
  /** Its dark flesh over the face: the last bone and the claw, and what they were last given. */
  bone: HTMLElement;
  talon: HTMLElement;
  tb: string;
  tt: string;
  ob: string;
  ot: string;
};

/** A lift and fall, t s after it starts: up quickly, down slowly. */
const lift = (t: number) => (t < 0 || t > 0.5 ? 0 : t < 0.1 ? smooth(0, 0.1, t) : 1 - smooth(0.1, 0.5, t));

/** How many breaches have burned (each claw's gradient its own name). */
let burned = 0;

export function burn(ctx: AuraContext): Burning {
  const made = ++burned;
  /** The side the hand holds from: each token its own. */
  const side = Math.random() < 0.5 ? -1 : 1;
  let age = 0;
  /** How far the breach is open (1 at rest), the hand's grip and how far it has risen, as springs. */
  const open: Spring = { x: 1, v: 0 };
  const grip: Spring = { x: 1, v: 0 };
  const rise: Spring = { x: 1, v: 0 };
  /** How far the hand has shifted round the token (rad), and where it is shifting to. */
  const turn: Spring = { x: 0, v: 0 };
  let turnTo = 0;
  let shiftAt = rand(3, 8);
  /** Left alone, the breach now and then narrows a little and opens again: by how much now, how much this time, till when, and when next. */
  let ebb = 0;
  let ebbBy = 0;
  let ebbUntil = -1;
  let ebbAt = rand(4, 10);
  let rollAt = rand(6, 14);
  /** The second hand (0 down, 1 up). */
  let second = 0;
  /** Energy (0 calm), the light's faltering (0-1). */
  let energy = 0;
  let falter = 0;
  /** A pulse running round the edge: its progress (1 and over: none). */
  let pulse = 1;
  let streak = 0;
  let heldUntil = -1;
  let won = false;
  let lives = 3;
  let box: Box | null = null;

  const unit = (w: number) => w / 2 + RIM * Math.sqrt(w / 32);

  // The claws' dark flesh over the face: in a layer cut to the face, so it
  // never darkens anything else; the shader's light lies over it.
  const NS = 'http://www.w3.org/2000/svg';
  const face = document.createElement('div');
  Object.assign(face.style, { position: 'absolute', inset: '0', borderRadius: '50%', overflow: 'hidden', pointerEvents: 'none', opacity: '0' });
  ctx.over.append(face);
  const flesh = 'linear-gradient(to bottom, rgba(6,1,11,0.92), rgba(42,11,58,0.78) 50%, rgba(6,1,11,0.92))';
  const fingers: Finger[] = KNUCKLE.map((_, f) => {
    const bone = document.createElement('div');
    Object.assign(bone.style, { position: 'absolute', left: '50%', top: '50%', background: flesh });
    const talon = document.createElementNS(NS, 'svg') as unknown as HTMLElement;
    Object.assign(talon.style, { position: 'absolute', left: '50%', top: '50%', overflow: 'visible' });
    face.append(bone, talon);
    return {
      base: 1,
      g: 1,
      lag: f === 0 ? 0.07 : rand(0.03, 0.12),
      w1: rand(0.2, 0.45),
      w2: rand(0.55, 0.95),
      p1: rand(0, 7),
      p2: rand(0, 7),
      tapAt: f === 0 ? Infinity : rand(1, 7),
      tapT: 9,
      twice: false,
      looseT: 9,
      kick: 0,
      kickNext: 0,
      kickAt: 0,
      bone,
      talon,
      tb: '',
      tt: '',
      ob: '',
      ot: '',
    };
  });
  /** The size the flesh was last shaped for (px across). */
  let shapedFor = 0;
  /** Shapes each finger's dark flesh for a token w px across: the bone's box, the claw's outline. */
  const shape = (w: number) => {
    shapedFor = w;
    const U = unit(w);
    const girth = 1.4 - 0.4 * smooth(14, 40, U);
    const k = HS * U;
    fingers.forEach((fg, f) => {
      const G = GIRTH[f] * girth * k;
      // The last bone, at its length when holding (stretched a little as it moves).
      const ra = THICK[2] * G;
      const len = BONE[2] * LEN[f] * 0.7 * k;
      Object.assign(fg.bone.style, {
        width: `${(len + 2 * ra).toFixed(2)}px`,
        height: `${(2 * ra).toFixed(2)}px`,
        borderRadius: `${ra.toFixed(2)}px`,
        transformOrigin: `${ra.toFixed(2)}px ${ra.toFixed(2)}px`,
      });
      // The claw, in two halves, hooking as it goes: its outline round its
      // base (at 0, 0, pointing along +x).
      const L = BONE[3] * LEN[f] * k;
      const r0 = THICK[3] * G;
      const r1 = THICK[4] * G;
      const h = 0.3 + 0.15 * CURL[f];
      const mx = L / 2;
      const tx = mx + (L / 2) * Math.cos(h);
      const ty = (L / 2) * Math.sin(h);
      const nx = -Math.sin(h / 2);
      const ny = Math.cos(h / 2);
      const ext = L + r0 + 1;
      const f2 = (n: number) => n.toFixed(2);
      const d = `M0 ${f2(-r0)} Q${f2(mx - nx * r1 * 1.4)} ${f2(-ny * r1 * 1.4)} ${f2(tx)} ${f2(ty)} Q${f2(mx + nx * r1 * 1.4)} ${f2(ny * r1 * 1.4)} 0 ${f2(r0)} A${f2(r0)} ${f2(r0)} 0 0 1 0 ${f2(-r0)}Z`;
      fg.talon.setAttribute('viewBox', `${f2(-ext)} ${f2(-ext)} ${f2(2 * ext)} ${f2(2 * ext)}`);
      Object.assign(fg.talon.style, { width: `${f2(2 * ext)}px`, height: `${f2(2 * ext)}px`, margin: `${f2(-ext)}px 0 0 ${f2(-ext)}px` });
      // (Translucent, darkest at its root, the breach's colour showing
      // through toward its point.)
      const id = `breach-claw-${made}-${f}`;
      fg.talon.innerHTML = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${f2(tx)}" y2="${f2(ty)}"><stop offset="0" stop-color="#0a0212" stop-opacity="0.95"/><stop offset="1" stop-color="#3a0d4e" stop-opacity="0.75"/></linearGradient></defs><path d="${d}" fill="url(#${id})"/>`;
    });
  };

  /** Lays each finger's dark flesh where the shader draws it now, if it is in front of the face. */
  const lay = (b: Box) => {
    const U = unit(b.w);
    const k = HS * U;
    const oy = (1 - rise.x) * 0.95;
    const t = 0.18 * (1 - rise.x) + turn.x;
    const c = Math.cos(t);
    const s = Math.sin(t);
    // The ball in the hand's frame, and a point of the hand's frame on the page (px from the token's centre).
    const cx = (s * oy) / HS;
    const cy = (-c * oy) / HS;
    const toPage = (x: number, y: number): [number, number] => {
      const px = (c * x + s * y) * HS;
      const py = (-s * x + c * y) * HS;
      return [side * px * U, (oy + py) * U];
    };
    const half = b.w / 2;
    fingers.forEach((fg, f) => {
      const { last, claw, past } = finger(f, fg.g, cx, cy, 1 / HS);
      const place = (bn: Bone, el: HTMLElement, isBone: boolean) => {
        const [x, y] = toPage(bn.x, bn.y);
        const [x2, y2] = toPage(bn.x + Math.cos(bn.a), bn.y + Math.sin(bn.a));
        const ang = Math.atan2(y2 - y, x2 - x);
        // (Only what lies over the face matters; past it, nothing to darken.)
        const near = Math.hypot(x, y) < half + bn.len * k + 2;
        const op = near ? smooth(past, past + 0.1, bn.s + 0.03) : 0;
        if (isBone) {
          const ra = THICK[2] * GIRTH[f] * (1.4 - 0.4 * smooth(14, 40, U)) * k;
          return {
            tf: `translate(${(x - ra).toFixed(2)}px,${(y - ra).toFixed(2)}px) rotate(${ang.toFixed(3)}rad) scaleX(${((bn.len * k + 2 * ra) / (BONE[2] * LEN[f] * 0.7 * k + 2 * ra)).toFixed(3)})`,
            op: op.toFixed(2),
          };
        }
        return { tf: `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${ang.toFixed(3)}rad) scaleY(${side})`, op: op.toFixed(2) };
      };
      const pb = place(last, fg.bone, true);
      const pt = place(claw, fg.talon, false);
      if (pb.tf !== fg.tb) fg.bone.style.transform = fg.tb = pb.tf;
      if (pb.op !== fg.ob) fg.bone.style.opacity = fg.ob = pb.op;
      if (pt.tf !== fg.tt) fg.talon.style.transform = fg.tt = pt.tf;
      if (pt.op !== fg.ot) fg.talon.style.opacity = fg.ot = pt.op;
    });
  };
  let faceOp = '';

  const light = auraShape(ctx, (f, _age, b) => {
    const U = unit(b.w);
    // Its furthest light: the breach's edge and its glow, the hand's fingers
    // (further as they open), the second hand.
    let loosest = 1;
    for (const fg of fingers) loosest = Math.min(loosest, fg.g);
    const reach = Math.max(1.6 * open.x + 0.6, 1.6 + clamp(1 - loosest, 0, 1.15), 2.3 + (second > 0.01 ? 0.3 : 0));
    f.hw = f.hh = (reach * U + 4) / 0.72;
    f.k = 1;
    f.q[0] = U * side;
    f.q[1] = open.x;
    f.q[2] = energy;
    // (How far the hand has risen, and the second hand, in one: see the shader.)
    f.q[3] = Math.round(clamp(second) * 255) * 4 + clamp(rise.x, -0.9, 2.9) + 1;
    f.q[4] = fingers[1].g;
    f.q[5] = fingers[2].g;
    f.q[6] = fingers[3].g;
    f.q[7] = fingers[4].g;
    f.q[9] = fingers[0].g;
    // (The pulse and the faltering, in one.)
    f.q[10] = Math.round(clamp(falter) * 63) + Math.min(pulse, 0.999);
    f.q[11] = turn.x;
  });

  /** Splinters thrown up out of the breach's edge: n of them (scaled to the device). */
  const splinters = (n: number, spread: number) => {
    const b = box;
    if (!b) return;
    const U = unit(b.w);
    const sc = b.w / 32;
    const count = Math.round((n * budget(100)) / 100);
    for (let i = 0; i < count; i++) {
      const a = rand(0.15, Math.PI - 0.15);
      const x = b.x + Math.cos(a) * 1.3 * open.x * U;
      const y = b.y + 1.1 * U + Math.sin(a) * 0.3 * open.x * U;
      const v = rand(40, 80) * Math.sqrt(sc) * spread;
      particle({
        x,
        y,
        vx: Math.cos(a) * v * 0.35,
        vy: -v,
        life: rand(0.6, 1.0),
        size: rand(1.0, 1.8) * Math.sqrt(sc),
        sizeEnd: 0.5,
        color: [2.4, 0.75, 2.3],
        colorEnd: [0.5, 0.08, 0.8],
        gravity: 120 * Math.sqrt(sc),
        drag: 1.6,
        shape: Shape.Shard,
        rot: rand(0, Math.PI * 2),
        spin: rand(-8, 8),
        fadeIn: 0.03,
        delay: rand(0, 0.15),
      });
    }
  };

  /** Every finger flinches open by about `by`, each a moment apart. */
  const flinch = (by: number) => {
    for (const fg of fingers) {
      fg.kickNext = by * rand(0.6, 1.1);
      fg.kickAt = age + rand(0, 0.09);
    }
  };

  return {
    step(dt, b) {
      age += dt;
      box = b;
      const held = age < heldUntil;
      if (!held && !won) streak = 0;
      // How wide it stands: wider with a streak, wide for the winner, smaller with few lives left.
      const wide = won ? 0.28 : held ? 0.06 * Math.min(streak, 5) : 0;
      const weak = 0.07 * Math.max(0, 3 - lives);
      // Left alone, it starves: now and then, at no steady beat, it narrows
      // a little and slowly opens again. (A score feeds it open at once.)
      const idle = !held && !won;
      if (idle && age >= ebbAt) {
        ebbBy = rand(0.18, 0.42);
        ebbUntil = age + rand(1.4, 3.4);
        ebbAt = ebbUntil + rand(4, 12);
      }
      ebb += ((idle && age < ebbUntil ? ebbBy : 0) - ebb) * (1 - Math.exp(-dt / 0.8));
      pull(open, 1 + wide - weak - ebb, 4, 0.55, dt);
      // How hard it holds: tighter as a streak grows, clutching for the
      // winner, looser with each life lost.
      const tight = won ? 0.25 : held ? 0.05 * Math.min(streak, 5) : 0;
      pull(grip, 1 + tight - 0.1 * Math.max(0, 3 - lives), 9, 0.45, dt);
      pull(rise, 1 - 0.14 * Math.max(0, 3 - lives), 3.5, 0.7, dt);
      pull(turn, turnTo, 5, 0.75, dt);
      const up = won || (held && streak >= 3) ? 1 : 0;
      second += (up - second) * (1 - Math.exp(-dt * (up ? 1.4 : 0.9)));
      const floor = (held ? 0.12 * Math.min(streak, 5) : 0) + (won ? 0.6 : 0);
      energy = floor + (energy - floor) * Math.exp(-dt / 1.2);
      falter *= Math.exp(-dt / 1.3);
      if (pulse < 1) pulse = Math.min(1, pulse + dt / 1.1);

      // Now and then the hand lets go a little and shifts round the token,
      // each finger letting go and taking hold again in its own time.
      if (age >= shiftAt) {
        shiftAt = age + rand(4.5, 11);
        turnTo = clamp(turnTo + rand(-0.07, 0.07), -0.09, 0.09);
        for (const fg of fingers) fg.looseT = -rand(0, 0.18);
      }
      // Now and then they drum, little finger to index, never quite evenly.
      if (age >= rollAt) {
        rollAt = age + rand(9, 22);
        let at = age;
        for (let f = 4; f >= 1; f--) {
          fingers[f].tapAt = at;
          at += rand(0.08, 0.16);
        }
      }
      const press = Math.max(grip.x - 1, 0);
      fingers.forEach((fg, f) => {
        fg.base += (grip.x - fg.base) * (1 - Math.exp(-dt / fg.lag));
        let g = fg.base + 0.07 * (0.6 * Math.sin(age * fg.w1 + fg.p1) + 0.4 * Math.sin(age * fg.w2 + fg.p2));
        // A finger lifts and comes down again, on its own uneven time.
        if (age >= fg.tapAt) {
          fg.tapT = 0;
          fg.twice = Math.random() < 0.3;
          fg.tapAt = age + rand(2.2, 8);
        }
        fg.tapT += dt;
        g -= 0.55 * (lift(fg.tapT) + (fg.twice ? 0.7 * lift(fg.tapT - 0.32) : 0));
        fg.looseT += dt;
        if (fg.looseT > 0 && fg.looseT < 0.55) g -= 0.32 * Math.sin((Math.PI * fg.looseT) / 0.55);
        if (fg.kickNext > 0 && age >= fg.kickAt) {
          fg.kick += fg.kickNext;
          fg.kickNext = 0;
        }
        fg.kick *= Math.exp(-dt / 0.2);
        g -= fg.kick;
        // Squeezing hard, it trembles.
        g += press * 0.05 * Math.sin(age * (19 + 3 * f) + f * 2.1);
        fg.g = clamp(g, -0.15, 1.45);
      });

      // The claws' dark flesh: only on a token large enough to show it.
      const show = 0.88 * smooth(26, 36, b.w) * (1 - 0.35 * falter);
      const op = show.toFixed(2);
      if (op !== faceOp) face.style.opacity = faceOp = op;
      if (show > 0) {
        if (Math.abs(b.w - shapedFor) > 0.5) shape(b.w);
        lay(b);
      }
    },
    react(e: AuraEvent) {
      switch (e.kind) {
        case 'arrive':
          // The breach opens from nothing and the hand rises out of it, open, closing on the token.
          lives = 3;
          won = false;
          open.x = 0.15;
          open.v = 0;
          rise.x = 0;
          rise.v = 0;
          grip.x = -0.1;
          grip.v = 0;
          for (const fg of fingers) fg.base = -0.1;
          energy += 0.8;
          pulse = 0;
          break;
        case 'vote':
          grip.v += 2.2;
          energy += 0.35;
          pulse = 0;
          break;
        case 'score':
          // As kills keep a breach growing: it surges wider, splinters thrown
          // up out of it, and the hand tightens on the token, harder with
          // the streak.
          streak = e.streak;
          heldUntil = age + HOLD;
          ebb = 0;
          ebbUntil = -1;
          ebbAt = age + HOLD + rand(3, 8);
          open.v += 1.4 + 0.25 * Math.min(streak, 5);
          grip.v += 1.4 + 0.5 * Math.min(streak, 5);
          energy += 0.7 + 0.2 * Math.min(streak, 5);
          falter = 0;
          pulse = 0;
          splinters(4 + 3 * Math.min(streak, 5), 1 + 0.1 * Math.min(streak, 5));
          break;
        case 'miss':
          // It falters: shrinks, its light unsteady; the hand flinches, its
          // fingers springing loose, and grips again.
          streak = 0;
          heldUntil = -1;
          falter = 1;
          open.v -= 1.6;
          grip.v -= 3.5;
          rise.v -= 0.5;
          flinch(0.45);
          energy *= 0.3;
          break;
        case 'hurt':
          // The hand loses its hold and slips down into the breach, its
          // light stuttering.
          streak = 0;
          heldUntil = -1;
          lives = e.left;
          falter = 1;
          open.v -= 2.2;
          rise.v -= 1.6;
          grip.v -= 4.5;
          flinch(0.7);
          energy = 0;
          break;
        case 'win':
          // It clutches its prize.
          won = true;
          heldUntil = age + HOLD;
          lives = Math.max(lives, 1);
          open.v += 2.2;
          grip.v += 4.5;
          energy += 1.5;
          pulse = 0;
          splinters(24, 1.4);
          break;
        case 'touch':
          // The fingers flex open, then snap shut on the token again.
          grip.x = Math.min(grip.x, 0.4);
          grip.v = 1;
          flinch(0.25);
          open.v += 1.2;
          energy += 0.5;
          pulse = 0;
          break;
      }
    },
    stop() {
      light.stop();
      face.remove();
    },
  };
}
