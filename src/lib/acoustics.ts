// Delve's acoustics: a reverb for each place, worked out here rather than
// recorded, in place of the one stone hall the rest of the game rings in
// (lib/sound.ts hall; played by lib/spatial.svelte.ts). Each is an impulse
// response in stereo: a few early
// reflections off the nearest walls (the part that tells the ear how big a
// place is and what it is made of), a slap or two off far walls where there
// are any, a flutter between close parallel walls (ice), and a diffuse tail
// whose lows, mids and highs die away at their own pace. Keyed as the beds
// are (lib/sound.ts placeAt): z0 to z9 the zones, a0 to a11 the endgame's
// kinds of place.

/**
 * A room. `rt`: how long (s) its mids take to die away by 60 dB; `low` and
 * `high`: the lows' and highs' time as a share of it (a dark room's highs
 * die first). `size`: over how long (ms) the early reflections arrive, and
 * `er` how loud they are (0 to 1); `pre`: the gap (ms) before the tail.
 * `slaps`: distinct echoes off far walls (ms, level). `flutter`: a ringing
 * between close parallel walls, its period (ms) and level. `level`: the
 * whole of it against the game's hall (1: as loud).
 */
export type Room = {
  name: string;
  rt: number;
  low: number;
  high: number;
  size: number;
  er: number;
  pre: number;
  slaps?: [number, number][];
  flutter?: [number, number];
  level?: number;
};

export const ROOMS: Record<string, Room> = {
  // The zones, in their order down.
  z0: { name: 'The Mines', rt: 1.1, low: 1.25, high: 0.45, size: 18, er: 0.8, pre: 6, slaps: [[140, 0.18]] },
  z1: { name: 'Magma Fissure', rt: 2.4, low: 1.3, high: 0.4, size: 45, er: 0.5, pre: 18, slaps: [[260, 0.15]] },
  z2: { name: 'Frozen Hollow', rt: 3.4, low: 0.9, high: 0.9, size: 30, er: 0.7, pre: 12, flutter: [9, 0.35] },
  z3: { name: 'Fungal Caverns', rt: 1.3, low: 1.1, high: 0.3, size: 25, er: 0.3, pre: 8, level: 0.85 },
  z4: { name: 'Vaal Outpost', rt: 2.6, low: 1.0, high: 0.65, size: 35, er: 0.9, pre: 14, slaps: [[95, 0.2], [190, 0.1]] },
  z5: { name: 'Abyssal Depths', rt: 5.5, low: 1.2, high: 0.35, size: 120, er: 0.15, pre: 60 },
  z6: { name: 'Petrified Forest', rt: 1.6, low: 0.9, high: 0.6, size: 80, er: 0.6, pre: 10 },
  z7: { name: 'Sulphur Vents', rt: 1.9, low: 1.2, high: 0.45, size: 30, er: 0.5, pre: 10 },
  z8: { name: 'Abyssal City', rt: 3.8, low: 1.1, high: 0.5, size: 90, er: 0.4, pre: 30, slaps: [[320, 0.22], [540, 0.12]] },
  z9: { name: 'Primeval Ruins', rt: 1.4, low: 0.9, high: 0.55, size: 60, er: 0.5, pre: 15, slaps: [[210, 0.14]] },
  // The endgame's kinds of place.
  a0: { name: 'Drowned temple', rt: 3.0, low: 1.0, high: 0.7, size: 40, er: 0.7, pre: 15, flutter: [14, 0.15] },
  a1: { name: 'Ember forge', rt: 1.8, low: 1.1, high: 0.5, size: 25, er: 0.7, pre: 8 },
  a2: { name: 'Void bloom', rt: 4.5, low: 1.2, high: 0.4, size: 100, er: 0.2, pre: 50 },
  a3: { name: 'Frozen abyss', rt: 4.8, low: 0.9, high: 0.85, size: 70, er: 0.4, pre: 30, flutter: [11, 0.2] },
  a4: { name: 'Sulphur marsh', rt: 1.2, low: 1.1, high: 0.4, size: 60, er: 0.25, pre: 20, level: 0.85 },
  a5: { name: 'Lantern necropolis', rt: 2.8, low: 1.0, high: 0.6, size: 22, er: 0.85, pre: 8, slaps: [[120, 0.15]] },
  a6: { name: 'Sunken garden', rt: 2.0, low: 1.0, high: 0.55, size: 50, er: 0.4, pre: 18 },
  a7: { name: 'Blood eclipse', rt: 3.5, low: 1.15, high: 0.45, size: 80, er: 0.3, pre: 35 },
  a8: { name: 'Glacial pyre', rt: 2.6, low: 0.95, high: 0.8, size: 40, er: 0.6, pre: 14, flutter: [10, 0.2] },
  a9: { name: 'Ashen reliquary', rt: 3.2, low: 1.0, high: 0.6, size: 30, er: 0.8, pre: 12 },
  a10: { name: 'Starfall abyss', rt: 6.0, low: 1.1, high: 0.5, size: 150, er: 0.1, pre: 70 },
  a11: { name: 'Witchfire grove', rt: 1.3, low: 0.95, high: 0.5, size: 70, er: 0.45, pre: 12 },
};

type Ctx = Pick<BaseAudioContext, 'sampleRate' | 'createBuffer'>;

/** A place's seed for its room (FNV-1a of its key): its own, so no two rooms share their noise. */
export function roomSeed(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A small seeded random, so a room sounds the same each time it is worked out. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** One-pole lowpass coefficient for a cutoff (Hz). */
const pole = (hz: number, sr: number) => 1 - Math.exp((-2 * Math.PI * hz) / sr);

/** The energy (sum of squares) of a channel, to level rooms against each other and the hall. */
export function energy(d: Float32Array) {
  let e = 0;
  for (let i = 0; i < d.length; i++) e += d[i] * d[i];
  return e;
}

/**
 * The room's impulse response, its energy matched to `like` (the hall's,
 * per channel) times its level, so the reverb send keeps its weight.
 */
export function roomIR(ac: Ctx, r: Room, like: number, seed = 1): AudioBuffer {
  const steps = roomSteps(ac, r, like, seed);
  for (;;) {
    const s = steps.next();
    if (s.done) return s.value;
  }
}

/** How many samples of the tail are worked out between pauses (roomSteps): a few ms of work on a phone. */
const STRIDE = 24_000;

/**
 * roomIR in steps, pausing (a yield) every STRIDE samples of its tail and
 * between its parts, so it can be worked out a little at a time while the
 * page is idle.
 */
export function* roomSteps(ac: Ctx, r: Room, like: number, seed = 1): Generator<void, AudioBuffer> {
  const sr = ac.sampleRate;
  const longest = r.rt * Math.max(1, r.low);
  const len = Math.ceil(sr * (r.pre / 1000 + longest * 1.05 + 0.05));
  const buf = ac.createBuffer(2, len, sr);
  const lowP = pole(250, sr);
  const highP = pole(2500, sr);
  // 60 dB down over each band's time.
  const fall = (t: number) => -6.91 / t;
  const kLow = fall(r.rt * r.low);
  const kMid = fall(r.rt);
  const kHigh = fall(r.rt * r.high);
  const pre = Math.round((r.pre / 1000) * sr);
  // How fast the tail grows dense once it starts (a big place takes longer).
  const build = Math.max(0.004, r.size / 1000 / 2);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const rand = seeded(seed * 7919 + ch * 104729 + 1);
    // The lows are one noise for both ears, as in a real room (their waves are
    // longer than a head is wide), so a deep sound never leans to a side.
    const shared = seeded(seed * 7919 + 7);
    // The tail: noise split in three bands, each fading at its own pace.
    let lo = 0;
    let hi = 0;
    let lows = 0;
    for (let i = pre; i < len; i++) {
      const n = rand() * 2 - 1;
      lo += lowP * (n - lo);
      hi += highP * (n - hi);
      lows += lowP * (shared() * 2 - 1 - lows);
      const low = lows;
      const high = n - hi;
      const mid = n - lo - high;
      const t = (i - pre) / sr;
      d[i] = (low * Math.exp(kLow * t) + mid * Math.exp(kMid * t) + high * Math.exp(kHigh * t)) * (1 - Math.exp(-t / build));
      if ((i - pre) % STRIDE === STRIDE - 1) yield;
    }
    // The tail at an energy of 1; each part after it gets its share against that.
    scale(d, 1);
    // Early reflections and slaps reach both ears (see walls): the same ones, from the same seed.
    const walls = seeded(seed * 7919 + 13);
    const early = new Float32Array(len);
    const taps = Math.round(10 + r.size / 6);
    for (let j = 0; j < taps; j++) {
      // A dozen or more reflections over `size` ms, the first ones loudest, off walls to either side in turn.
      const u = (j + walls()) / taps;
      const at = (0.002 + (u * u * r.size) / 1000) * sr;
      wall(early, ch, at, (j % 2 ? 1 : -1) * (0.3 + 0.7 * walls()), (1 - 0.7 * u) * (walls() < 0.5 ? -1 : 1), r.high, sr);
    }
    add(d, early, r.er * r.er * 0.8);
    yield;
    (r.slaps ?? []).forEach(([ms, g], j) => {
      // A slap off a far wall, smeared a little as rough stone does, off one side and then the other.
      const slap = new Float32Array(len);
      const side = (j % 2 ? 1 : -1) * 0.5;
      for (let k = 0; k < 4; k++) wall(slap, ch, (ms / 1000 + walls() * 0.004) * sr, side, k ? 0.4 : 1, r.high, sr);
      add(d, slap, g * g * 2);
    });
    if (r.flutter) {
      // Ringing between two close walls: evenly spaced, dying away, each side a touch apart.
      const [ms, g] = r.flutter;
      const ring = new Float32Array(len);
      for (let k = 1; k < 30; k++) tap(ring, Math.round(((ms * k + (ch ? ms / 2 : 0)) / 1000) * sr), Math.exp(-k / 9) * (k % 2 ? 1 : -1), 0.9, sr);
      add(d, ring, g * g * 1.5);
    }
  }
  // Matched to the hall's energy (each channel), times the room's level.
  for (let ch = 0; ch < 2; ch++) scale(buf.getChannelData(ch), like * (r.level ?? 1) ** 2);
  return buf;
}

/** Scales a channel to an energy of `e`. */
function scale(d: Float32Array, e: number) {
  const g = Math.sqrt(e / (energy(d) || 1));
  for (let i = 0; i < d.length; i++) d[i] *= g;
}

/** Adds `part` to `d`, scaled to an energy of `e` first. */
function add(d: Float32Array, part: Float32Array, e: number) {
  scale(part, e);
  for (let i = 0; i < d.length; i++) d[i] += part[i];
}

/**
 * A reflection off a wall to one side (`side`, -1 the left to 1 the right)
 * as ear `ch` hears it: the near ear first and louder, the far one up to
 * half a millisecond later and quieter.
 */
function wall(d: Float32Array, ch: number, at: number, side: number, gain: number, bright: number, sr: number) {
  const near = side > 0 ? 1 : 0;
  const far = ch !== near ? Math.abs(side) : 0;
  tap(d, Math.round(at + far * 0.0005 * sr), gain * (1 - 0.5 * far), bright, sr);
}

/** One reflection: a short pulse, softer and wider the darker the room (`bright` 0 to 1). */
function tap(d: Float32Array, at: number, gain: number, bright: number, sr: number) {
  const width = Math.max(1, Math.round((0.00025 + 0.0008 * (1 - Math.min(1, bright))) * sr));
  for (let i = -width; i <= width; i++) {
    const j = at + i;
    if (j < 0 || j >= d.length) continue;
    // A raised cosine, its area about the same whatever its width.
    d[j] += (gain * (0.5 + 0.5 * Math.cos((Math.PI * i) / (width + 1)))) / width;
  }
}

/** How long (s) a buffer takes to die away by 60 dB, from its first 5 dB to 25 dB down (Schroeder's backward integration, T20). */
export function rt60(d: Float32Array, sr: number) {
  const e = new Float64Array(d.length);
  let acc = 0;
  for (let i = d.length - 1; i >= 0; i--) e[i] = acc += d[i] * d[i];
  const db = (i: number) => 10 * Math.log10(e[i] / e[0]);
  let a = -1;
  let b = -1;
  for (let i = 0; i < d.length; i++) {
    if (a < 0 && db(i) <= -5) a = i;
    if (db(i) <= -25) {
      b = i;
      break;
    }
  }
  return a < 0 || b < 0 ? NaN : ((b - a) / sr) * 3;
}
