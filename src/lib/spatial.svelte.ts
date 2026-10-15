// Spatial sound: each of the game's sounds comes from where it happens on
// the screen, and rings in a room of its place's own. lib/sound.ts plays
// every sound centred, in its one stone hall, unless a placer is set
// (setPlacer); this is the game's, set as it starts (main.ts; the lab's
// pages too, which tune it: src/lab/spatial.svelte.ts). Each call site says
// where its sound comes from (SoundPlace: a card, an answer, the clock, a
// player's entry, a screen edge, or a path the sparks fly); sounds that
// belong to the whole scene (the plunge, the verdict) say nothing and stay
// centred. A blast and a cave-in fill the space round where they happen
// (Size). The ambience is spread wide, and in Delve each place has a room
// of its own (lib/acoustics.ts) in place of the hall.
//
// A sound's place across the game's screen (-1 its left edge, 1 its right)
// times the width is its azimuth, as a fraction of 90°: a monitor spans about
// ±30° from where you sit, about where a pair of stereo speakers stands. The
// mix was chosen by ear on the lab's pages (CHOSEN).

import { bedsAt, hall, setPlacer, type Placer, type SoundPlace, type Sfx } from './sound';
import { whenIdle } from './idle';
import { BLAST_IN_DELAY_MS } from './blastAway';
import { ROOMS, roomSteps } from './acoustics';

/**
 * How a sound is placed. pan: equal-power panning (by level). haas: by time
 * (the precedence effect: the far side a few ms late, the ear follows the
 * first). head: a spherical head (the far ear a fraction of a millisecond
 * late and duller). hrtf: the browser's binaural panner (PannerNode, HRTF).
 */
export type Renderer = 'pan' | 'haas' | 'head' | 'hrtf';

export type Spatial = {
  /** As the game plays today: every sound centred in its hall, nothing below applies. */
  today: boolean;
  renderer: Renderer;
  /** How far round the screen's edges are heard, 0 to 1 (1: 90°, beside you). */
  width: number;
  /** Sounds that travel (sparks to a slot, a life given, a flare's streak, a blast's shockwave) move as they play; otherwise they sit where they land. */
  moving: boolean;
  /** How far off (0 to 1) a teammate's sounds are: quieter, duller, more of the room. */
  far: number;
  /** The reverb is fed from the sound's side, so the room answers from there. */
  sideReverb: boolean;
  /** A blast and a cave-in fill the space round where they happen, instead of sounding from a point. */
  size: boolean;
  /** The ambience loops are spread wide (each ear hears its own take of the loop, half a loop apart), so they surround you. */
  wideBeds: boolean;
  /** Each place in Delve has a room of its own (lib/acoustics.ts), in place of the game's one hall. */
  rooms: boolean;
  /** Headphones: a little of each side, delayed and dulled, bleeds into the other ear, as from speakers. */
  crossfeed: boolean;
  /** Heard as one speaker would (a phone's): both sides summed. */
  mono: boolean;
};

/** The mix chosen by ear (on the lab's pages): the head model at ±45°, teammates 35% off, everything else on but crossfeed (for headphones only). */
export const CHOSEN: Spatial = {
  today: false,
  renderer: 'head',
  width: 0.5,
  moving: true,
  far: 0.35,
  sideReverb: true,
  size: true,
  wideBeds: true,
  rooms: true,
  crossfeed: false,
  mono: false,
};

/** The settings in play: the chosen mix; the lab's pages change them to tune it. */
export const spatial = $state<Spatial>({ ...CHOSEN });

/** A sound as it is placed, for the lab's half circle: when it starts (the audio clock), for how long, its azimuth over time (a fraction of 90°), how far off, and whether it fills the space. */
export type Blip = { begin: number; seconds: number; az: (t: number) => number; far: number; wide: boolean };
let listener: ((b: Blip) => void) | null = null;
/** Hears every sound as it is placed (the lab draws them). */
export function onPlaced(f: (b: Blip) => void) {
  listener = f;
}
/** The audio clock, and the room sounds ring in now (for the lab's controls). */
export const heard = $state<{ now: () => number; room: string }>({ now: () => 0, room: 'The game’s hall' });

/** Sounds that, with Size on, fill the space round where they happen. */
const WIDE = new Set<Sfx>(['blast', 'caveIn']);
/** Heard from far off already (lib/soundDesign.ts's distant()): no more distance on top. */
const DISTANT = new Set<Sfx>(['fallenFar']);

const db = (d: number) => Math.pow(10, d / 20);
const HEAD = 0.0875;
const SOUND = 343;
/** Haas: how late (s) the far side is at 90°. */
const HAAS = 0.004;
const SIDE_REVERB = 0.7;
const CROSSFEED = { gain: db(-8), delay: 0.0003, lp: 700 };
const STEP = 0.03;
/** A blast's shockwave: from its edge in toward the middle (to 0.3 of the way from it), over the time the new question takes to start in. */
const BLAST_SWEEP = { to: 0.3, seconds: BLAST_IN_DELAY_MS / 1000 };

function filter(ac: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.707, gain = 0) {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}
function gainNode(ac: BaseAudioContext, value: number) {
  const g = ac.createGain();
  g.gain.value = value;
  return g;
}

/** Sets or ramps an AudioParam. */
function move(p: AudioParam, v: number, t: number, ramp: boolean) {
  if (ramp) p.linearRampToValueAtTime(v, t);
  else p.setValueAtTime(v, t);
}

/** One way of placing a sound: mono in, stereo out, put at an azimuth (a fraction of 90°) at a time, or moved there by then. */
type Place = { input: AudioNode; output: AudioNode; at(az: number, t: number, ramp: boolean): void };

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

function panned(ac: AudioContext): Place {
  const p = ac.createStereoPanner();
  return { input: p, output: p, at: (az, t, r) => move(p.pan, clamp1(az), t, r) };
}

/** Two ears, each delayed, shelved and levelled, for the renderers that place by time. */
function ears(ac: AudioContext, maxDelay: number) {
  const input = ac.createGain();
  const merger = ac.createChannelMerger(2);
  const each = [0, 1].map((ch) => {
    const delay = ac.createDelay(maxDelay);
    const shelf = filter(ac, 'highshelf', 1600);
    const gain = ac.createGain();
    input.connect(delay).connect(shelf).connect(gain).connect(merger, 0, ch);
    return { delay, shelf, gain };
  });
  /** Sets the far ear (the left for a sound on the right) late by `late` s, shaded by `shade` dB and at `level`; the near one as it is but `bright` dB. */
  const set = (az: number, t: number, r: boolean, late: number, shade: number, level: number, bright: number) => {
    const far = az > 0 ? 0 : 1;
    each.forEach((e, ch) => {
      const isFar = ch === far && az !== 0;
      move(e.delay.delayTime, isFar ? late : 0, t, r);
      move(e.shelf.gain, isFar ? shade : bright, t, r);
      move(e.gain.gain, isFar ? level : 1, t, r);
    });
  };
  return { input, output: merger, set };
}

/**
 * The precedence (Haas) effect: the far side hears the sound a few
 * milliseconds after the near one (up to HAAS at 90°) and only a little
 * quieter; the ear takes the side it hears first. Natural on speakers; on
 * one speaker the two copies comb (a hollow tone), and on headphones a
 * delay this long can sound like two.
 */
function haas(ac: AudioContext): Place {
  const e = ears(ac, HAAS + 0.001);
  return {
    input: e.input,
    output: e.output,
    at(az, t, r) {
      const a = Math.abs(clamp1(az));
      e.set(clamp1(az), t, r, HAAS * a, 0, 1 - 0.2 * a, 0);
    },
  };
}

/**
 * A spherical head (Woodworth's delay): the far ear hears it up to about
 * 0.65 ms late (at 90°), its highs shaded by the head and a little quieter;
 * the near ear a touch brighter. No change in tone for a sound in front,
 * unlike HRTF.
 */
function headModel(ac: AudioContext): Place {
  const e = ears(ac, 0.002);
  return {
    input: e.input,
    output: e.output,
    at(az, t, r) {
      const theta = clamp1(az) * (Math.PI / 2);
      const s = Math.abs(Math.sin(theta));
      e.set(clamp1(az), t, r, (HEAD / SOUND) * (Math.abs(theta) + s), -10 * s, 1 - 0.3 * s, 2 * s);
    },
  };
}

/** The browser's binaural panner: the source on a circle round you at ear height, never quieter for distance. */
function binaural(ac: AudioContext): Place {
  const p = new PannerNode(ac, { panningModel: 'HRTF', distanceModel: 'linear', rolloffFactor: 0, refDistance: 1, maxDistance: 10 });
  return {
    input: p,
    output: p,
    at(az, t, r) {
      const theta = clamp1(az) * (Math.PI / 2);
      move(p.positionX, Math.sin(theta), t, r);
      move(p.positionY, 0, t, r);
      move(p.positionZ, -Math.cos(theta), t, r);
    },
  };
}

/** Below this (Hz) a spread sound stays alike in both ears: spread, its lows would come out of step between them (hollow, and gone on one speaker). */
const SPREAD_FROM = 250;

/**
 * A sound filling the space round where it happens: its lows as they are,
 * in both ears, and above SPREAD_FROM each ear's through its own allpass
 * filters, so the two sides differ in phase but not in tone or level (no
 * copies of it piled up, which would colour it). Then leaned toward its
 * place. Split as a Linkwitz-Riley crossover (two filters each way).
 */
function wide(ac: AudioContext): Place {
  const input = ac.createGain();
  const p = ac.createStereoPanner();
  input.connect(filter(ac, 'lowpass', SPREAD_FROM)).connect(filter(ac, 'lowpass', SPREAD_FROM)).connect(p);
  const highs = input.connect(filter(ac, 'highpass', SPREAD_FROM)).connect(filter(ac, 'highpass', SPREAD_FROM));
  const merger = ac.createChannelMerger(2);
  const FREQS = [
    [420, 1150, 2900, 6400],
    [610, 1700, 3900, 8800],
  ];
  FREQS.forEach((fs, ch) => {
    let node: AudioNode = highs;
    for (const f of fs) node = node.connect(filter(ac, 'allpass', f, 0.6));
    node.connect(merger, 0, ch);
  });
  merger.connect(p);
  return { input, output: p, at: (az, t, r) => move(p.pan, clamp1(az), t, r) };
}

const PLACES: Record<Renderer, (ac: AudioContext) => Place> = { pan: panned, haas, head: headModel, hrtf: binaural };

/** The game's screen (the whole window, or left of the lab's panel). */
function screen() {
  const r = document.getElementById('app')?.getBoundingClientRect();
  return r && r.width ? r : new DOMRect(0, 0, innerWidth, innerHeight);
}

/** A place on screen as -1..1 across the game's screen (left to right), or null for none: an element's middle, a point, or half way between the two. */
function pointOf(el: Element | null | undefined, x?: number) {
  let cx = x;
  if (el) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    const mid = r.left + r.width / 2;
    cx = x === undefined ? mid : (mid + x) / 2;
  }
  if (cx === undefined) return null;
  const s = screen();
  return { x: clamp1(((cx - s.left) / s.width) * 2 - 1) };
}

const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** The context and the mix, once mounted: for scripts to listen in on (the lab hands them out). */
let bus: { ac: AudioContext; master: AudioNode } | null = null;
export const spatialMix = () => bus;

/** The mix's output switches, and how much of each ambience loop is centred and how much spread (driving every loop's at once). */
type Out = { ac: AudioContext; plain: GainNode; crossed: GainNode; stereo: GainNode; mono: GainNode; centred: ConstantSourceNode; spread: ConstantSourceNode };
let out: Out | null = null;
// The mix and the reverb send of the bus, as mount was handed them.
let mix: AudioNode | null = null;
let reverb: AudioNode | null = null;
const mixOf = (ac: AudioContext) => mix ?? ac.destination;
const wetOf = (ac: AudioContext) => reverb ?? ac.destination;

/** Takes up a change to the settings that act on the whole mix (crossfeed, one speaker, the ambience's spread, the rooms). */
function applyMix() {
  if (!out) return;
  const t = out.ac.currentTime;
  const cross = spatial.crossfeed && !spatial.today;
  out.plain.gain.setTargetAtTime(cross ? 0 : 1, t, 0.02);
  out.crossed.gain.setTargetAtTime(cross ? 1 : 0, t, 0.02);
  out.stereo.gain.setTargetAtTime(spatial.mono ? 0 : 1, t, 0.02);
  out.mono.gain.setTargetAtTime(spatial.mono ? 1 : 0, t, 0.02);
  const wideBeds = spatial.wideBeds && !spatial.today;
  out.centred.offset.setTargetAtTime(wideBeds ? 0 : 1, t, 0.3);
  out.spread.offset.setTargetAtTime(wideBeds ? 1 : 0, t, 0.3);
  tuneRooms();
}

// ---------- the rooms ----------

/** The reverb: the game's hall, and the rooms of the places sounding now, each at its share. */
type Rooms = { ac: AudioContext; hall: GainNode; like: number; playing: Map<string, { conv: ConvolverNode; gain: GainNode; idle?: ReturnType<typeof setTimeout> }> };
let rooms: Rooms | null = null;
/** Each place's room, once worked out (they keep: a few hundred kB each). */
const roomBufs = new Map<string, AudioBuffer>();
const working = new Set<string>();
/** Delve's depth as the ambience hears it (0: not in Delve, the hall). */
let depthNow = 0;
/** How fast (s, a time constant) one room gives way to the next: about as the beds cross-fade. */
const ROOM_EASE = 0.8;

/** The places sounding at the depth, with their shares (as the beds have them), or none outside Delve or with rooms off. */
function roomsWanted() {
  if (spatial.today || !spatial.rooms || depthNow < 1) return [];
  return bedsAt(depthNow).beds.filter((b) => ROOMS[b.place]);
}

/** Brings the rooms to the depth and the settings: each place's at its share, the hall making up the rest (and standing in for one not yet worked out). */
function tuneRooms() {
  const r = rooms;
  if (!r) return;
  const t = r.ac.currentTime;
  const wanted = roomsWanted();
  let covered = 0;
  for (const { place, weight } of wanted) {
    const buf = roomBufs.get(place);
    if (!buf) {
      work(place);
      continue;
    }
    let p = r.playing.get(place);
    if (!p) {
      const conv = new ConvolverNode(r.ac, { disableNormalization: true });
      conv.buffer = buf;
      const gain = gainNode(r.ac, 0);
      wetOf(r.ac).connect(conv).connect(gain).connect(mixOf(r.ac));
      p = { conv, gain };
      r.playing.set(place, p);
    }
    clearTimeout(p.idle);
    p.idle = undefined;
    p.gain.gain.setTargetAtTime(weight, t, ROOM_EASE);
    covered += weight * weight;
  }
  // Rooms no longer sounding fade out and are let go of once their tails are over.
  for (const [place, p] of r.playing) {
    if (wanted.some((w) => w.place === place) || p.idle) continue;
    p.gain.gain.setTargetAtTime(0, t, ROOM_EASE);
    p.idle = setTimeout(() => {
      wetOf(r.ac).disconnect(p.conv);
      p.gain.disconnect();
      r.playing.delete(place);
    }, 12_000);
  }
  r.hall.gain.setTargetAtTime(Math.sqrt(Math.max(0, 1 - covered)), t, ROOM_EASE);
  heard.room = wanted.length ? wanted.map((w) => ROOMS[w.place].name).join(' into ') : spatial.rooms && !spatial.today ? 'The game’s hall (not in Delve)' : 'The game’s hall';
}

/** Works a place's room out a little at a time while the page is idle (lib/acoustics.ts roomSteps), then brings it in. */
function work(place: string) {
  const r = rooms;
  if (!r || roomBufs.has(place) || working.has(place)) return;
  working.add(place);
  const steps = roomSteps(r.ac, ROOMS[place], r.like, place.length * 31 + place.charCodeAt(1));
  const next = () => {
    const s = steps.next();
    if (!s.done) return whenIdle(next, { fallback: 300 });
    roomBufs.set(place, s.value);
    working.delete(place);
    tuneRooms();
  };
  whenIdle(next, { fallback: 300 });
}

const placer: Placer = {
  widen,
  depth(d) {
    depthNow = d;
    tuneRooms();
  },
  /**
   * The mix's output, through crossfeed (or not) and a sum to one speaker
   * (or not), to the speakers; and the reverb send, through the hall and
   * the rooms in place of the game's own hall.
   */
  mount({ ac, master, wet, out: user }) {
    mix = master;
    reverb = wet;
    user.disconnect();
    const plain = gainNode(ac, 1);
    const crossed = gainNode(ac, 0);
    user.connect(plain);
    const split = ac.createChannelSplitter(2);
    const merge = ac.createChannelMerger(2);
    user.connect(split);
    for (const ch of [0, 1]) {
      split.connect(merge, ch, ch);
      const delay = ac.createDelay(0.01);
      delay.delayTime.value = CROSSFEED.delay;
      split.connect(filter(ac, 'lowpass', CROSSFEED.lp), ch).connect(delay).connect(gainNode(ac, CROSSFEED.gain)).connect(merge, 0, 1 - ch);
    }
    merge.connect(gainNode(ac, 1 / (1 + CROSSFEED.gain * 0.5))).connect(crossed);
    const stereo = gainNode(ac, 1);
    const mono = gainNode(ac, 0);
    mono.channelCount = 1;
    mono.channelCountMode = 'explicit';
    mono.channelInterpretation = 'speakers';
    for (const o of [plain, crossed]) {
      o.connect(stereo);
      o.connect(mono);
    }
    stereo.connect(ac.destination);
    mono.connect(ac.destination);
    const centred = new ConstantSourceNode(ac, { offset: 1 });
    const spread = new ConstantSourceNode(ac, { offset: 0 });
    centred.start();
    spread.start();
    out = { ac, plain, crossed, stereo, mono, centred, spread };

    // The game's hall, as it has it, and the rooms beside it.
    wet.disconnect();
    const hallBuf = hall(ac, 2.8);
    const conv = new ConvolverNode(ac, { disableNormalization: false });
    conv.buffer = hallBuf;
    const hallGain = gainNode(ac, 1);
    wet.connect(conv).connect(hallGain).connect(master);
    rooms = { ac, hall: hallGain, like: heardEnergy(hallBuf), playing: new Map() };

    heard.now = () => ac.currentTime;
    bus = { ac, master };
    applyMix();
  },

  place(ac, name, start, where: SoundPlace | undefined) {
    const s = spatial;
    if (s.today) return null;
    const edge = where?.edge;
    const from = edge ? { x: edge } : pointOf(where?.from, where?.x);
    const to = edge ? { x: edge * BLAST_SWEEP.to } : where?.to ? pointOf(where.to) : null;
    const seconds = to ? (edge ? BLAST_SWEEP.seconds : (where?.seconds ?? 0)) : 0;
    const big = s.size && WIDE.has(name);
    const far = where?.far && !DISTANT.has(name) ? s.far : 0;
    if (!from && !big && !far) {
      listener?.({ begin: start, seconds: 0.8, az: () => 0, far: 0, wide: false });
      return null;
    }

    // Where it is at t s from its start: travelling, or where it lands (a blast: where it bursts in).
    const a = from ?? to ?? { x: 0 };
    const b = to ?? a;
    const along = (t: number) => (seconds > 0 && s.moving ? ease(Math.min(1, t / seconds)) : to && !edge ? 1 : 0);
    const xAt = (t: number) => a.x + (b.x - a.x) * along(t);
    const az = (t: number) => xAt(t) * s.width;

    const place = big ? wide(ac) : PLACES[s.renderer](ac);
    place.output.connect(mixOf(ac));
    // Dry: far off (duller, quieter), then placed.
    const dry = ac.createGain();
    let chain: AudioNode = dry;
    if (far) chain = chain.connect(filter(ac, 'lowpass', 20000 * Math.pow(1200 / 20000, far))).connect(gainNode(ac, db(-9 * far)));
    chain.connect(place.input);
    // Wet: as far off, with more of the room the farther; from its side, or the middle.
    const wet = ac.createGain();
    const sendPan = ac.createStereoPanner();
    let send: AudioNode = wet;
    if (far) send = send.connect(filter(ac, 'lowpass', 20000 * Math.pow(1200 / 20000, far))).connect(gainNode(ac, db(-9 * far) * (1 + 0.6 * far)));
    send.connect(sendPan).connect(wetOf(ac));
    const sendAz = (t: number) => (s.sideReverb ? clamp1(az(t)) * SIDE_REVERB : 0);

    const set = (t: number, ramp: boolean) => {
      place.at(az(t), start + t, ramp);
      move(sendPan.pan, sendAz(t), start + t, ramp);
    };
    set(0, false);
    if (s.moving && seconds > 0) for (let t = STEP; t < seconds + STEP; t += STEP) set(Math.min(t, seconds), true);

    listener?.({ begin: start, seconds: Math.max(0.8, seconds + 0.4), az, far, wide: big });
    return { dry, wet };
  },
};

/**
 * The energy (each channel's) of an impulse response as a normalizing
 * convolver plays it, as the game's hall is played: the Web Audio spec
 * scales it to 0.00125 over its RMS, times 44100 over the sample rate, which
 * comes to this whatever is in it. A room, played as it is, is worked out to
 * the same, so the reverb keeps its weight.
 */
function heardEnergy(buf: AudioBuffer) {
  return buf.length * ((0.00125 * 44100) / buf.sampleRate) ** 2;
}

/**
 * An ambience loop, centred as the game has it, or spread: its left the
 * loop, its right a second take of it half a loop on (`take`, which
 * lib/sound.ts starts there and keeps at the loop's rate). Nothing is
 * filtered or piled up, so it keeps its tone; and what passes on one side
 * only comes by on the other half a loop later, too far apart to be heard
 * as an echo. The two ways run side by side, their levels driven by Out's
 * centred and spread, so a change reaches loops already playing.
 */
function widen(ac: AudioContext, buf: AudioBuffer) {
  const input = ac.createGain();
  const output = ac.createGain();
  const centred = gainNode(ac, 0);
  const spread = gainNode(ac, 0);
  out?.centred.connect(centred.gain);
  out?.spread.connect(spread.gain);
  if (!out) centred.gain.value = 1;
  input.connect(centred).connect(output);
  const take = ac.createBufferSource();
  take.buffer = buf;
  take.loop = true;
  const merge = ac.createChannelMerger(2);
  input.connect(merge, 0, 0);
  take.connect(merge, 0, 1);
  merge.connect(spread).connect(output);
  return { input, output, take };
}

/** Places the game's sounds from now on (main.ts, and the lab's pages), and takes up any change to the settings. */
export function installSpatial() {
  setPlacer(placer);
  $effect.root(() => {
    $effect(() => {
      // Every setting read, so any change is taken up.
      void JSON.stringify(spatial);
      applyMix();
    });
  });
}
