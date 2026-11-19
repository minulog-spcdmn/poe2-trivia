// The ritual aura (lib/auraKinds.ts): the wearer as the altar of a Ritual
// site, as Path of Exile lays one out. A sacrificial circle on the ground, its
// runes drawn in blood; a pool of blood round the altar's foot that the slain
// are drained into, waves of it passing through; candles standing in clusters
// on it, lit one by one as the tribute comes in (an altar lights up kill by
// kill); the altar's violet light seeping out from behind the wearer, in the
// King in the Mists' darkness. Now and then the locusts the game sends out of
// a finished altar to point the way to the next pour out of the wearer as one
// stream, make a turn far out to one side, and come home diving into the face,
// the tribute taken (ritual.glsl.ts draws all of it).
//
// What happens to the player is what happens at an altar:
// - arrive: the candles are lit one after another, and the swarm comes home
//   from far off.
// - vote: the locusts show the way: a full swarm streams out to one side and back.
// - score: tribute. Blood runs in across the floor to the altar's foot, the
//   runes and the light flare, another candle is lit and the swarm goes out.
//   A streak lights more and more of them (all ten by six in a row); the
//   kept ones burn down one by one over the next half minute.
//   It gathers more blood, too: the pool spreads.
// - miss: a draught: the flames bow, one candle goes out with a thread of
//   smoke, and the dark closes in; it's lit again after a while.
// - hurt: a gust bows every flame and snuffs all but a few; the wearer bleeds
//   into the pool; fewer candles stay lit as lives run out.
// - touch: the flames bow away from it and a few locusts dart out and back.
// - win: every candle is lit, the runes blaze, and the swarm goes out both ways.
//
// The darkness is the page's, under the token: dithered dark lobes lying wide
// across it, sliding slowly against each other so it never sits still or bands.

import dither from '../../../assets/dither.png';
import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** How far the token's own rim reaches past its face (Avatar.svelte), px. */
const RIM = 3;
/** How long a streak's kept candles last (s, to 1/e). */
const KEEP = 30;
/** The candles there are (ritual.glsl.ts). */
const CANDLES = 10;
/** The sortie's phase past which no locust is out any more (the head home at 2, its tail 0.7 behind). */
const HOME = 2.8;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
/** How far a token `w` px across is from small (32 px and under: 0) to large (64 and up: 1). */
const grown = (w: number) => smooth(clamp((w - 32) / 32));
/** Eases `x` toward `to` at `rate` (1/s). */
const ease = (x: number, to: number, rate: number, dt: number) => x + (to - x) * (1 - Math.exp(-dt * rate));

/** A swell: up in `rise` s, held `hold` s, then dying away over `fall` s; a new one starts from where the last has got to. */
class Swell {
  amp = 0;
  age = 99;
  hold = 0;
  constructor(
    private rise: number,
    private fall: number,
  ) {}
  hit(amp: number, hold = 0) {
    const now = this.value();
    this.amp = Math.max(amp, now);
    this.hold = hold;
    this.age = this.rise * Math.min(1, now / Math.max(this.amp, 1e-6));
  }
  step(dt: number) {
    this.age += dt;
  }
  value() {
    if (this.age < this.rise) return this.amp * smooth(clamp(this.age / this.rise));
    return this.amp * Math.exp(-Math.max(0, this.age - this.rise - this.hold) / this.fall);
  }
}

/** A flight of the locusts: how many (0-1), how fast its phase runs (1/s), whether half go the other way, and to which side. */
type Sortie = { amt: number; speed: number; both: boolean; side: number; from?: number };

const div = (style: Record<string, string>) => {
  const d = document.createElement('div');
  Object.assign(d.style, { position: 'absolute', pointerEvents: 'none', ...style });
  return d;
};

export function burn(ctx: AuraContext): Burning {
  // The darkness: three dark lobes, long ellipses lying across the token
  // (wide, not tall: in a list the next player is above and below), each
  // drifting slowly to and fro along it.
  const holder = div({ inset: '0', willChange: 'transform, opacity', opacity: '0' });
  const lobes = [0, 1, 2].map((i) => {
    const l = div({
      left: '50%',
      top: '50%',
      width: `${260 + 45 * i}%`,
      height: `${132 + 10 * ((i + 1) % 3)}%`,
      imageRendering: 'pixelated',
      background: `radial-gradient(closest-side, rgba(2, 2, 3, 0.8) 30%, rgba(2, 2, 3, 0.5) 58%, rgba(1, 1, 2, 0.16) 82%, rgba(0, 0, 0, 0) 100%), url(${dither})`,
      willChange: 'transform',
    });
    holder.append(l);
    return l;
  });
  ctx.under.append(holder);

  const seed = Math.random();
  const flare = new Swell(0.3, 1.3);
  /** The streak's candles kept (0-1), ebbing over half a minute. */
  let kept = 0;
  /** The candles that burn at rest: four, fewer as lives run out. */
  let base = 4;
  /** The candles lit (candle n burns as this passes n), and how fast more are lit. */
  let lit = base;
  let kindle = 2.2;
  /** No candle is lit again until this runs out (s): after a draught or a gust. */
  let hold = 0;
  /** A candle burning down is let go out only this often (s). */
  let burnDown = 0;
  /** Candles going out: down to this many lit, how fast; the snuffing's age and where it began. */
  let dropTo = lit;
  let dropRate = 2.5;
  let snuffAge = 9;
  let snuffFrom = 0;
  /** The flames' bow, a damped sway (+ to the right), its speed, and when the next small draught comes. */
  let lean = 0;
  let leanV = 0;
  let draught = 2 + Math.random() * 4;
  /** The pool (1 at rest). */
  let blood = 1;
  let bloodTo = 1;
  /** Since the tribute began to flow in (s), or the wearer to bleed (as -s); 99 neither. */
  let flow = 99;
  let bleeding = false;
  /** The dark closing in (a miss, a lost life: 1 at the blow, ebbing). */
  let closing = 0;
  let closeRate = 1;
  /** The light waking (0 out, 1 lit), from arriving. */
  let wake = 1;
  /** The locusts: the flight they're on (its number and phase), how many fly, the next flight waiting, and the wait before going out unbidden. */
  let flightNo = Math.floor(Math.random() * 400);
  let ph = 9;
  let fly: Sortie = { amt: 0.5, speed: 0.6, both: false, side: Math.random() < 0.5 ? -1 : 1 };
  let amt = 0;
  let pending: Sortie | null = null;
  let wait = 1.5 + Math.random() * 4;
  let age = 0;

  const send = (s: Sortie) => {
    // Just gone out: this one goes with it, gathering more.
    if (ph < 0.5 && s.from === undefined) {
      fly = { ...fly, amt: Math.max(fly.amt, s.amt), speed: Math.max(fly.speed, s.speed), both: fly.both || s.both };
      return;
    }
    if (ph < HOME) {
      pending = s;
      return;
    }
    flightNo = (flightNo + 1) % 400;
    fly = s;
    ph = s.from ?? 0;
    amt = s.from === undefined ? s.amt : 0;
  };
  const otherSide = () => (Math.random() < 0.72 ? -fly.side : fly.side);
  /** `n` candles go out at once (or down to `to`), and none is lit again for `wait` s. */
  const douse = (to: number, waitS: number) => {
    const now = Math.ceil(lit - 1e-3);
    if (to >= now) return;
    snuffFrom = Math.max(now, snuffAge < 1.5 ? snuffFrom : 0);
    snuffAge = 0;
    dropTo = Math.max(0, to);
    dropRate = 7;
    hold = Math.max(hold, waitS);
  };
  const kick = (v: number) => {
    leanV += v;
  };

  const busy = () => flare.value() > 0.04 || closing > 0.05 || wake < 1 || ph < HOME || Math.abs(lean) > 0.05 || flow < 3.2 || Math.abs(blood - 1) > 0.03 || Math.abs(lit - dropTo) > 0.01;

  const light = auraShape(ctx, (f, _age, b) => {
    const tok = b.w / 2 + RIM * (b.w / 32) ** 0.5;
    // The site keeps within two radii to the sides and about one up and down;
    // only the locusts' flights go further, for a few seconds at a time.
    const out = ph < HOME ? 4.7 : 2.9;
    f.hw = (out * tok + 4) / 0.72;
    f.hh = (1.75 * tok + 4) / 0.72;
    // (Small tokens sit packed in lists, where neighbours' light adds up: theirs is softer.)
    f.k = 0.65 + 0.35 * grown(b.w);
    f.calm = !busy();
    const w = smooth(wake);
    f.q[0] = tok;
    f.q[1] = smooth(clamp((b.w - 18) / 40));
    f.q[2] = lit;
    f.q[3] = lean;
    f.q[4] = flightNo * 10 + Math.min(ph, 9);
    f.q[5] = fly.side * (clamp(amt, 0.001, 1) + (fly.both ? 2 : 0));
    f.q[6] = blood;
    f.q[7] = bleeding ? -Math.max(flow, 1e-3) : flow;
    f.q[9] = ((0.75 + 0.25 * kept) * (0.55 + 0.45 * (base / 4)) * (1 - 0.6 * clamp(closing)) + flare.value()) * w;
    f.q[10] = snuffAge;
    f.q[11] = snuffFrom;
  });

  return {
    react(e: AuraEvent) {
      switch (e.kind) {
        case 'arrive':
          wake = 0;
          lit = 0;
          dropTo = 0;
          kindle = 3;
          hold = 0.4;
          send({ amt: 0.85, speed: 0.7, both: false, side: otherSide(), from: 0.95 });
          break;
        case 'vote':
          flare.hit(0.2);
          send({ amt: 0.95, speed: 1.05, both: false, side: Math.random() < 0.5 ? -1 : 1 });
          break;
        case 'score': {
          const k = clamp(e.streak / 6);
          kept = Math.max(kept, k);
          hold = 0;
          kindle = 2.4 + 2 * k;
          flare.hit(0.45 + 0.5 * k, 0.2 + 0.4 * k);
          flow = 0;
          bleeding = false;
          bloodTo = Math.max(bloodTo, 1 + 0.3 * k);
          blood = Math.max(blood, 1 + 0.1 * k);
          closing = 0;
          send({ amt: 0.55 + 0.45 * k, speed: 0.8 + 0.3 * k, both: false, side: otherSide() });
          break;
        }
        case 'miss':
          closing = 1;
          closeRate = 1.4;
          kept *= 0.5;
          kick((Math.random() < 0.5 ? -1 : 1) * 3.2);
          douse(Math.ceil(lit - 1e-3) - 1, 2.5);
          bloodTo = Math.min(bloodTo, 0.8);
          break;
        case 'hurt':
          closing = 1.25;
          closeRate = e.left <= 0 ? 3.5 : e.left === 1 ? 2.2 : 1.5;
          kept = 0;
          base = e.left <= 0 ? 1 : e.left === 1 ? 2 : e.left === 2 ? 3 : 4;
          kick((Math.random() < 0.5 ? -1 : 1) * 8);
          douse(base - 1, 3.5);
          flow = 0;
          bleeding = true;
          bloodTo = 1.35;
          break;
        case 'win':
          base = 4;
          kept = 1;
          hold = 0;
          kindle = 7;
          closing = 0;
          flare.hit(1.1, 2);
          flow = 0;
          bleeding = false;
          bloodTo = 1.3;
          send({ amt: 1, speed: 0.75, both: true, side: otherSide() });
          break;
        case 'touch':
          kick((Math.random() < 0.5 ? -1 : 1) * 3.5);
          flare.hit(0.15);
          send({ amt: 0.3, speed: 1.0, both: false, side: otherSide() });
          break;
      }
    },
    step(dt) {
      age += dt;
      flare.step(dt);
      wake = Math.min(1, wake + dt / 1.4);
      closing *= Math.exp(-dt / closeRate);
      kept *= Math.exp(-dt / KEEP);
      flow = Math.min(flow + dt, 99);
      if (flow > 8) bleeding = false;
      blood = ease(blood, bloodTo, 1.2, dt);
      bloodTo = ease(bloodTo, 1, 0.12, dt);
      snuffAge = Math.min(snuffAge + dt, 9);

      // The candles: lit one after another up to what the altar holds now;
      // going out at a blow, or burning down one at a time when a streak's
      // kept light ebbs.
      hold = Math.max(0, hold - dt);
      burnDown = Math.max(0, burnDown - dt);
      const want = Math.min(CANDLES, base + (CANDLES - base) * kept);
      if (lit > dropTo + 1e-4) {
        lit = Math.max(dropTo, lit - dt * dropRate);
      } else if (hold <= 0 && lit < want - 1e-3) {
        lit = Math.min(want, lit + dt * kindle);
        dropTo = lit;
      } else if (lit > want + 0.5 && burnDown <= 0 && hold <= 0) {
        // The newest goes out, quietly, with its smoke.
        snuffFrom = Math.ceil(lit - 1e-3);
        snuffAge = 0;
        dropTo = snuffFrom - 1;
        dropRate = 2;
        burnDown = 1.8;
      }
      kindle = ease(kindle, 2.2, 0.3, dt);

      // The flames: a damped sway back upright after a blow; now and then a
      // small draught of its own, never on a beat.
      leanV += (-49 * lean - 4.5 * leanV) * dt;
      lean += leanV * dt;
      draught -= dt;
      if (draught <= 0) {
        kick((Math.random() - 0.5) * 1.6);
        draught = 2.5 + Math.random() * 6;
      }

      // The locusts: out on a flight, home, and out again unbidden after a
      // while (each time a while of its own), mostly to the other side.
      amt = ease(amt, fly.amt, 3, dt);
      if (ph < HOME) {
        ph += dt * fly.speed;
      } else if (pending) {
        const s = pending;
        pending = null;
        send(s);
      } else {
        wait -= dt;
        if (wait <= 0) {
          send({ amt: 0.45 + 0.3 * kept, speed: 0.55 + 0.1 * Math.random(), both: false, side: otherSide() });
          wait = 4.5 + Math.random() * 8;
        }
      }

      // The dark: deeper as it closes in, further off (to the sides) as the
      // light is kept or flares; its lobes drift to and fro, each its own way.
      const fl = flare.value();
      const deep = clamp((0.5 + 0.45 * closing + 0.25 * (1 - base / 4)) * (1 - 0.5 * fl) * (1 - 0.2 * kept));
      const far = 1 + 0.15 * kept + 0.25 * fl - 0.18 * clamp(closing);
      holder.style.opacity = deep.toFixed(3);
      holder.style.transform = `scale(${far.toFixed(3)}, ${(1 - 0.1 * clamp(closing)).toFixed(3)})`;
      lobes.forEach((l, i) => {
        const off = 12 * Math.sin(age * (0.13 + 0.05 * i) + i * 2.1 + seed * 9);
        const tilt = 5 * Math.sin(age * (0.09 + 0.04 * i) + i + seed * 5);
        l.style.transform = `translate(-50%, -50%) translateX(${off.toFixed(1)}%) rotate(${tilt.toFixed(1)}deg)`;
      });
    },
    stop() {
      light.stop();
      holder.remove();
    },
  };
}
