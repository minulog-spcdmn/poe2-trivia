// The abyss aura (lib/auraKinds.ts): an Abyssal lich lord standing behind
// the wearer, watching over them. Its skull, modelled and lit in three
// dimensions (abyss.glsl.ts), peers over the token, the token hiding its
// teeth, rising out of a dark pall behind it. It is lit from below by
// the Abyss's green as PoE2 lights the Abyss, the lich's fire burning deep in
// its sockets, and above its brow it is lost in the dark, so at rest what
// rises over the rim is its face alone and in a list it keeps well clear of
// the row above; only for a moment (a right answer) does it rise taller.
//
// The page adds the dark it looms in: a dithered shade under the token,
// round the skull, so it stays in darkness over a lighter panel too.
//
// At rest it watches, turning its head slowly to look about, now and then,
// as a lich would, never quick. What happens to the player moves it:
// - arrive: it rises from behind the token, the Well's light surging up
//   through it, and its fire kindles.
// - vote: it bows its head toward the card, its fire flaring.
// - score: the Well's light surges up round the token and through the skull
//   as it rears back, its fire blazing toward white; each right answer in a
//   row grows its crown of spines further (a fan of them sweeping out
//   sideways from behind its temples, as spines grow from the skull of
//   Amanamu's Tithe), until a miss.
// - miss: it turns its face away and sinks a little, the fire going grey;
//   the crown withers.
// - hurt: it shudders and a crack opens across its brow, the Abyss's green in
//   it; it stays, and a second opens when one life is left. It sinks a
//   little lower behind the token as lives run out.
// - win: crowned in full, it rises a little, its fire blazing.
// - touch: it turns to look straight out at whoever touched it.

import dither from '../../../assets/dither.png';
import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const easeOut = (t: number) => 1 - (1 - clamp(t)) ** 3;
/** Up over `rise` seconds, then down with time constant `fall`. */
const env = (a: number, rise: number, fall: number) => (a < 0 ? 0 : a < rise ? easeOut(a / rise) : Math.exp(-(a - rise) / fall));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A soft dark ellipse's mask, dithered so it doesn't band (as in components/zonecard/fume.ts). */
const DITHER_MEAN = 5 / 255;
function shadeMask(peak: number) {
  const fade = (r: number) => peak * Math.exp((-r * r) / 0.3) * (1 - r ** 8) ** 2;
  const weight = (r: number) => Math.min(1, fade(r) / DITHER_MEAN);
  const radial = (fn: (r: number) => number) =>
    `radial-gradient(closest-side, ${Array.from({ length: 41 }, (_, i) => `rgb(0 0 0 / ${fn(i / 40).toFixed(4)}) ${i * 2.5}%`).join(', ')})`;
  return [
    radial((r) => {
      const k = DITHER_MEAN * weight(r);
      return (fade(r) - k) / (1 - k);
    }),
    `url(${dither})`,
    radial(weight),
  ].join(',');
}

/** What one moment does to the skull: its turn and bow (rad, added), its lift (token radii), flare, ash, and a shudder. */
type Push = { yaw: number; pitch: number; lift: number; flare: number; ash: number; shake: number; face: boolean };
type Moment = { e: AuraEvent; age: number; side: number };
const none = (): Push => ({ yaw: 0, pitch: 0, lift: 0, flare: 0, ash: 0, shake: 0, face: false });

function push(m: Moment): Push {
  const a = m.age;
  const p = none();
  switch (m.e.kind) {
    case 'arrive':
      // Risen from behind the token, the fire kindling as it comes up.
      p.lift = -1.1 * (1 - easeOut((a - 0.1) / 1.3));
      p.flare = 0.6 * env(a - 1.1, 0.15, 0.6) - 0.75 * (1 - easeOut((a - 0.6) / 0.6));
      break;
    case 'vote':
      // A slow bow toward the card.
      p.pitch = 0.38 * env(a, 0.3, 0.7);
      p.flare = 0.55 * env(a - 0.15, 0.12, 0.6);
      break;
    case 'score': {
      // It rears back, its fire blazing.
      const k = env(a, 0.22, 1.1);
      // (It rises tall over the wearer for the moment, then sinks back to watch.)
      p.pitch = -0.3 * k;
      p.lift = 0.32 * k;
      p.flare = 1.3 * env(a, 0.12, 1.0);
      break;
    }
    case 'miss': {
      // It turns its face away and sinks, the fire going grey.
      const k = env(a, 0.4, 1.5);
      p.yaw = 0.6 * m.side * k;
      p.pitch = 0.12 * k;
      p.lift = -0.1 * k;
      p.ash = env(a, 0.2, 1.6);
      break;
    }
    case 'hurt': {
      // A shudder, sinking, the fire guttering.
      const k = env(a, 0.1, 1.4);
      p.lift = -0.2 * k;
      p.shake = Math.exp(-a * 3.5);
      p.ash = 0.7 * k;
      p.flare = -0.5 * k;
      break;
    }
    case 'win': {
      // Risen a little, its fire blazing, a slow pulse in it.
      const hold = a < 0.8 ? easeOut(a / 0.8) : a < 6 ? 1 : 0.5 + 0.5 * Math.exp(-(a - 6) / 2);
      p.lift = 0.08 * hold;
      p.pitch = -0.1 * hold;
      p.flare = 0.7 * hold + 0.35 * env(a % 2.4, 0.2, 0.7);
      break;
    }
    case 'touch':
      // It turns to look straight out at whoever touched it.
      p.face = a < 1.6;
      p.flare = 0.6 * env(a - 0.2, 0.12, 0.6);
      break;
  }
  return p;
}

/** How long each moment plays (s). */
const LASTS: Record<AuraEvent['kind'], number> = { arrive: 3, vote: 2.5, score: 4.5, miss: 5, hurt: 5, win: 12, touch: 2.2 };

export function burn(ctx: AuraContext): Burning {
  const seed = Math.random();
  let age = 0;
  let moments: Moment[] = [];
  // The streak (right answers in a row), the cracks lives' loss left (0-2), how sunk it is for lives lost, and whether they won.
  let streak = 0;
  let cracks = 0;
  let sunk = 0;
  let won = false;

  // Where it looks: the turn it's easing toward, now and its speed (a slow,
  // heavy turn, as a lich's), and when it next looks somewhere else.
  const head = { yaw: (seed - 0.5) * 0.5, pitch: 0.1, vy: 0, vp: 0 };
  let want = { yaw: head.yaw, pitch: 0.1 };
  let nextGlance = rand(2, 5);
  let crown = 0;
  let crack = 0;
  /** Seconds since the Well's light last surged up through it (below 0: one to come). */
  let surge = 99;
  let lift = 0;
  let out = { yaw: 0, pitch: 0, roll: 0, lift: 0, flare: 0, ash: 0 };

  // Under the token: a box eight radii across, centred on it, cut clear of
  // the token itself, and in it the dark the skull looms in.
  const holder = document.createElement('div');
  const hole = 'radial-gradient(circle closest-side, transparent 25.05%, #000 25.65%)';
  Object.assign(holder.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: '400%',
    height: '400%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    maskImage: hole,
    webkitMaskImage: hole,
    opacity: '0',
  });
  // (A pall the skull rises out of, hugging the rim: centred 1.3 radii above
  // the token's centre, 1.1 radii either side, wider than tall, and 0.45 up
  // and down, so it stays close.)
  const SHADE_H = 0.45;
  const shade = document.createElement('div');
  Object.assign(shade.style, {
    position: 'absolute',
    left: `${((4 - 1.1) / 8) * 100}%`,
    top: `${((4 - 1.3 - SHADE_H) / 8) * 100}%`,
    width: `${((2 * 1.1) / 8) * 100}%`,
    height: `${((2 * SHADE_H) / 8) * 100}%`,
    background: '#000',
    maskImage: shadeMask(0.7),
    maskSize: '100% 100%,auto,100% 100%',
    maskRepeat: 'no-repeat,repeat,no-repeat',
    maskComposite: 'add,intersect',
    imageRendering: 'pixelated',
    willChange: 'transform',
  });
  holder.append(shade);
  ctx.under.append(holder);
  let holderAt = -1;
  let shadeAt = '';

  const light = auraShape(
    ctx,
    (f, _age, b) => {
      const R = b.w / 2;
      // (Wide and tall enough for the skull and its short crown at their
      // highest, and the Well's light round the token.)
      f.hw = (2.2 * R + 6) / 0.72;
      f.hh = (2.7 * R + 6) / 0.72;
      f.k = easeOut((age - 0.05) / 0.8);
      f.q[0] = R;
      f.q[1] = surge;
      f.q[2] = (1 - 0.3 * sunk) * (won ? 1.1 : 1);
      f.q[3] = out.flare;
      f.q[4] = out.yaw;
      f.q[5] = out.pitch;
      f.q[6] = out.lift;
      f.q[7] = crown;
      f.q[9] = out.roll;
      f.q[10] = out.ash;
      f.q[11] = crack;
      // Calm (30fps on phones) but while a moment is moving fast.
      f.calm = !moments.some((m) => m.age < 1.6) && surge > 1.2;
    },
    { calm: true },
  );

  return {
    react(e) {
      if (e.kind === 'score') streak = e.streak;
      if (e.kind === 'miss' || e.kind === 'hurt') streak = 0;
      if (e.kind === 'hurt') {
        cracks = Math.max(cracks, e.left <= 1 ? 2 : 1);
        sunk = e.left <= 0 ? 1 : e.left === 1 ? 0.5 : Math.max(sunk, 0.2);
      }
      if (e.kind === 'win') {
        won = true;
        sunk = 0;
      }
      // The Well's light surges up through it as it rises, and with every right answer.
      if (e.kind === 'score' || e.kind === 'win') surge = 0;
      if (e.kind === 'arrive') surge = -0.9;
      // A new moment of a kind replaces the last of that kind (a streak's scores come quick).
      moments = moments.filter((m) => m.e.kind !== e.kind);
      moments.push({ e, age: 0, side: head.yaw > 0 ? 1 : -1 });
    },
    step(dt) {
      age += dt;
      surge += dt;
      for (const m of moments) m.age += dt;
      moments = moments.filter((m) => m.age < LASTS[m.e.kind]);

      const p = none();
      for (const m of moments) {
        const x = push(m);
        p.yaw += x.yaw;
        p.pitch += x.pitch;
        p.lift += x.lift;
        p.flare += x.flare;
        p.ash = Math.max(p.ash, x.ash);
        p.shake = Math.max(p.shake, x.shake);
        p.face ||= x.face;
      }

      // Now and then it looks somewhere else: a little to one side or the
      // other, down at the room or the wearer, or straight out.
      nextGlance -= dt;
      if (nextGlance <= 0) {
        nextGlance = rand(3.5, 7.5);
        want = Math.random() < 0.3 ? { yaw: 0, pitch: 0.06 } : { yaw: rand(-0.55, 0.55), pitch: rand(-0.04, 0.3) };
      }
      const aim = p.face ? { yaw: 0, pitch: 0.04 } : want;
      // A heavy head: a spring, critically damped, turning in about a second.
      const w0 = p.face ? 7 : 3.2;
      head.vy += (w0 * w0 * (aim.yaw - head.yaw) - 2 * w0 * head.vy) * dt;
      head.vp += (w0 * w0 * (aim.pitch - head.pitch) - 2 * w0 * head.vp) * dt;
      head.yaw += head.vy * dt;
      head.pitch += head.vp * dt;

      // The crown follows the streak, growing a spine a second; it withers faster.
      const crownTo = won ? 5 : Math.min(streak, 5);
      crown += clamp(crownTo - crown, -dt * 2.5, dt * 1.2);
      crack += clamp(cracks - crack, 0, dt * 2.5);
      // Lives lost sink it lower behind the token.
      // (Never so low that its sockets' fire goes under the rim at rest.)
      const restLift = -0.12 * sunk + (won ? 0.06 : 0);
      lift += (restLift - lift) * (1 - Math.exp(-dt * 1.5));

      const sway = Math.sin(age * 0.29 + seed * 11) * 0.05 + Math.sin(age * 0.13 + seed * 4) * 0.04;
      const shake = p.shake * Math.sin(age * 41) * 0.12;
      out = {
        yaw: head.yaw + p.yaw + shake,
        pitch: head.pitch + p.pitch + 0.03 * Math.sin(age * 0.37 + seed * 6),
        roll: sway + shake * 0.6,
        lift: lift + p.lift + 0.03 * Math.sin(age * 0.5 + seed * 3),
        flare: Math.max(-0.6, p.flare + 0.07 * Math.min(streak, 5) + (won ? 0.2 : 0)),
        ash: clamp(p.ash),
      };

      // The dark comes in with it and follows it up and down.
      const under = easeOut((age - 0.1) / 1);
      if (Math.abs(under - holderAt) > 0.01) {
        holderAt = under;
        holder.style.opacity = under.toFixed(2);
      }
      const t = `translateY(${(-out.lift * (100 / (2 * SHADE_H))).toFixed(1)}%)`;
      if (t !== shadeAt) {
        shadeAt = t;
        shade.style.transform = t;
      }
    },
    stop() {
      light.stop();
      holder.remove();
    },
  };
}
