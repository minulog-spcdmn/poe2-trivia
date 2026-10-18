// Spatial sound: each of the game's sounds comes from where it happens on
// the screen, and rings in a room of its place's own. lib/sound.ts plays
// every sound centred, in its one stone hall, unless a placer is set
// (setPlacer); this is the game's, set as it starts (main.ts; the lab's
// pages too, which tune it: src/lab/spatial.svelte.ts). Each call site says
// where its sound comes from (SoundPlace: a card, an answer, the clock, a
// player's entry, a screen edge, or a path the sparks fly); sounds that
// belong to the whole scene (the plunge, the verdict) say nothing and stay
// centred. A blast and a cave-in fill the space round where they happen
// (Size), as an Azurite Vein's walls do when they crack. The ambience is
// spread wide, and in Delve each place has a room of its own
// (lib/acoustics.ts) in place of the hall; a vein being dug has one too,
// for its own sounds.
//
// A sound's place across the game's screen (-1 its left edge, 1 its right)
// times the width is its azimuth, as a fraction of 90°: a monitor spans about
// ±30° from where you sit, about where a pair of stereo speakers stands. The
// mix was chosen by ear on the lab's pages (CHOSEN).

import { HALL_SECONDS, VEIN_NEAR, db, filter, setPlacer, type Placer, type SoundPlace, type Sfx } from './sound';
import { hoverStep, roomPlan, screenX, travel } from './spatialPlan';
import { whenIdle } from './idle';
import { BLAST_IN_DELAY_MS } from './blastAway';
import { ROOMS, roomSeed, roomSteps } from './acoustics';

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
  /**
   * The hover (the most frequent sound, now placed so it stands out more:
   * heard apart from the ambience, and from a new place each time): its
   * level (dB, against its own), dry (close and small: no brightening at the
   * near ear, no side reverb and little room), and quieter on repeats (each
   * in a quick sweep across controls a step quieter, spatialPlan.ts
   * hoverStep). Its direction is as any sound's from the same control.
   */
  hoverDb: number;
  hoverDry: boolean;
  hoverRepeats: boolean;
};

/** The mix chosen by ear (on the lab's pages): the head model at ±36°, teammates 35% off, everything else on but crossfeed (for headphones only), and the hover a touch quieter, dry and quieter on repeats. */
export const CHOSEN: Spatial = {
  today: false,
  renderer: 'head',
  width: 0.4,
  moving: true,
  far: 0.35,
  sideReverb: true,
  size: true,
  wideBeds: true,
  rooms: true,
  crossfeed: false,
  mono: false,
  hoverDb: -2.5,
  hoverDry: true,
  hoverRepeats: true,
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

/** Sounds that, with Size on, fill the space round where they happen: a blast, a cave-in, and a vein's walls cracking all round. */
const WIDE = new Set<Sfx>(['blast', 'caveIn', 'veinStrain1', 'veinStrain2']);
/** Heard from far off already (lib/soundDesign.ts's distant()): no more distance on top. */
const DISTANT = new Set<Sfx>(['fallenFar']);

const HEAD = 0.0875;
const SOUND = 343;
/** Haas: how late (s) the far side is at 90°. */
const HAAS = 0.004;
const SIDE_REVERB = 0.7;
const CROSSFEED = { gain: db(-8), delay: 0.0003, lp: 700 };
const STEP = 0.03;
/** A blast's shockwave: from its edge in toward the middle (to 0.3 of the way from it), over the time the new question takes to start in. */
const BLAST_SWEEP = { to: 0.3, seconds: BLAST_IN_DELAY_MS / 1000 };

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
function headModel(ac: AudioContext, plain = false): Place {
  const e = ears(ac, 0.002);
  return {
    input: e.input,
    output: e.output,
    at(az, t, r) {
      const theta = clamp1(az) * (Math.PI / 2);
      const s = Math.abs(Math.sin(theta));
      // (`plain`: the near ear not brightened, for a dry hover.)
      e.set(clamp1(az), t, r, (HEAD / SOUND) * (Math.abs(theta) + s), -10 * s, 1 - 0.3 * s, plain ? 0 : 2 * s);
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

/** The renderers; `plain` asks for no brightening (only the head model has any). */
const PLACES: Record<Renderer, (ac: AudioContext, plain?: boolean) => Place> = { pan: panned, haas, head: headModel, hrtf: binaural };

/** A dry hover's share of the room (a little: it is close). */
const HOVER_ROOM = 0.3;
/** The pointer's last hover, for its next to step down from in a sweep (spatialPlan.ts hoverStep). */
let lastHover: ReturnType<typeof hoverStep> | null = null;

/** The game's screen (the whole window, or left of the lab's panel), measured once and again only after it changes size: not for every sound. */
let screenBox: DOMRect | null = null;
let screenWatched = false;
function screen() {
  if (screenBox) return screenBox;
  const app = document.getElementById('app');
  const r = app?.getBoundingClientRect();
  screenBox = r && r.width ? r : new DOMRect(0, 0, innerWidth, innerHeight);
  if (app && !screenWatched) {
    screenWatched = true;
    const stale = () => (screenBox = null);
    new ResizeObserver(stale).observe(app);
    addEventListener('resize', stale);
  }
  return screenBox;
}

/** A place on screen as -1..1 across the game's screen (spatialPlan.ts screenX), or null for none. */
const pointOf = (el: Element | null | undefined, x?: number) => screenX(el ? el.getBoundingClientRect() : null, x, screen());

/** The context and the mix, once mounted: for scripts to listen in on (the lab hands them out). */
let bus: { ac: AudioContext; master: AudioNode } | null = null;
export const spatialMix = () => bus;

/**
 * The mix's output (`user`, the bus's), straight to the speakers, or while
 * crossfeed or one speaker is on (the lab's listening aids, `aids`, built
 * the first time) through them, their switches set; the game has both off,
 * so its mix never runs through them.
 */
type Aids = { input: GainNode; plain: GainNode; crossed: GainNode; stereo: GainNode; mono: GainNode };
/**
 * `straight`: the mix to the speakers as it is, faded out while it goes
 * through the aids (their `input` faded in), so a switch never clicks; the
 * mix is hooked to the aids (`linked`) only while one is on, or fading.
 */
type Out = { ac: AudioContext; user: GainNode; straight: GainNode; aids: Aids | null; through: boolean; linked: boolean; unlink?: ReturnType<typeof setTimeout> };
let out: Out | null = null;

/** The listening aids: crossfeed (or not), then a sum to one speaker (or not), to the speakers. */
function aids(ac: AudioContext): Aids {
  const input = gainNode(ac, 0);
  const plain = gainNode(ac, 1);
  const crossed = gainNode(ac, 0);
  input.connect(plain);
  const split = ac.createChannelSplitter(2);
  const merge = ac.createChannelMerger(2);
  input.connect(split);
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
  return { input, plain, crossed, stereo, mono };
}
/** The ambience loops spread wide, playing now (widen): how much of each is centred and how much spread. */
const spreads = new Set<{ centred: GainNode; spread: GainNode }>();
const spreadWanted = () => spatial.wideBeds && !spatial.today;
// The mix and the reverb send of the bus, as mount was handed them.
let mix: AudioNode | null = null;
let send: AudioNode | null = null;
const mixOf = (ac: AudioContext) => mix ?? ac.destination;
const wetOf = (ac: AudioContext) => send ?? ac.destination;

/** Takes up a change to the settings that act on the whole mix (crossfeed, one speaker, the ambience's spread, the rooms). */
function applyMix() {
  if (!out) return;
  const t = out.ac.currentTime;
  const cross = spatial.crossfeed && !spatial.today;
  const through = cross || spatial.mono;
  if (through) {
    const a = (out.aids ??= aids(out.ac));
    a.plain.gain.setTargetAtTime(cross ? 0 : 1, t, 0.02);
    a.crossed.gain.setTargetAtTime(cross ? 1 : 0, t, 0.02);
    a.stereo.gain.setTargetAtTime(spatial.mono ? 0 : 1, t, 0.02);
    a.mono.gain.setTargetAtTime(spatial.mono ? 1 : 0, t, 0.02);
  }
  if (through !== out.through) {
    out.through = through;
    const o = out;
    const input = o.aids!.input;
    clearTimeout(o.unlink);
    // Faded across, both running meanwhile; once off, the aids are let go of the mix, so they don't run.
    if (through && !o.linked) {
      o.user.connect(input);
      o.linked = true;
    }
    o.straight.gain.setTargetAtTime(through ? 0 : 1, t, 0.02);
    input.gain.setTargetAtTime(through ? 1 : 0, t, 0.02);
    if (!through)
      o.unlink = setTimeout(() => {
        o.user.disconnect(input);
        o.linked = false;
      }, 200);
  }
  const wide = spreadWanted();
  for (const s of spreads) {
    s.centred.gain.setTargetAtTime(wide ? 0 : 1, t, 0.3);
    s.spread.gain.setTargetAtTime(wide ? 1 : 0, t, 0.3);
  }
  tuneRooms();
}

// ---------- the rooms ----------

/**
 * The reverb: the game's hall (`hallConv`, fed by the send while `hallFed`,
 * at `hall`'s level), and the rooms of the places sounding now, each at its
 * share. `like`: the energy a room is worked out to, the hall's as heard.
 */
type Rooms = {
  ac: AudioContext;
  hallConv: ConvolverNode;
  hall: GainNode;
  hallFed: boolean;
  parking?: ReturnType<typeof setTimeout>;
  like: number;
  playing: Map<string, { conv: ConvolverNode; gain: GainNode; idle?: ReturnType<typeof setTimeout> }>;
};
let rooms: Rooms | null = null;
/** The rooms of the places sounding now and the next one down, once worked out: a megabyte or two each, let go of once their places have gone by. */
const roomBufs = new Map<string, AudioBuffer>();
const working = new Set<string>();
/** Delve's depth as the ambience hears it (0: not in Delve, the hall). */
let depthNow = 0;
/**
 * An Azurite Vein's room (ROOMS.vein), for the vein's own sounds (their send,
 * lib/sound.ts veinWet): `gate` lets them through to the rest of the reverb
 * instead, until the room is worked out (from VEIN_NEAR down, ahead of the
 * first vein) and whenever the rooms are off.
 */
type VeinRoom = { send: GainNode; gate: GainNode; conv?: ConvolverNode; gain?: GainNode; working?: boolean };
let veinRoom: VeinRoom | null = null;

/** How fast (s, a time constant) one room gives way to the next: about as the beds cross-fade. */
const ROOM_EASE = 0.8;

/** The rooms at the depth now (spatialPlan.ts roomPlan): sounding, next and worth keeping. */
const plan = () => roomPlan(depthNow, spatial.rooms && !spatial.today);

/** Brings the rooms to the depth and the settings: each place's at its share, the hall making up the rest (and standing in for one not yet worked out). */
function tuneRooms() {
  const r = rooms;
  if (!r) return;
  const t = r.ac.currentTime;
  const { wanted, next, kept } = plan();
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
      if (!plan().kept.has(place)) roomBufs.delete(place);
    }, 12_000);
  }
  // The next place's room, worked out ahead; any other not playing, let go of.
  if (next) work(next);
  for (const place of roomBufs.keys()) if (!r.playing.has(place) && !kept.has(place)) roomBufs.delete(place);
  tuneVein(r);
  const hallShare = Math.sqrt(Math.max(0, 1 - covered));
  r.hall.gain.setTargetAtTime(hallShare, t, ROOM_EASE);
  feedHall(r, hallShare > 0.001);
  heard.room = wanted.length ? wanted.map((w) => ROOMS[w.place].name).join(' into ') : spatial.rooms && !spatial.today ? 'The game’s hall (not in Delve)' : 'The game’s hall';
}

/**
 * The hall heard (fed by the send), or not: once rooms have its whole share,
 * it stops being fed, after its level has faded and its tail rung out, so it
 * isn't convolving the send for nothing; fed again at once when wanted.
 */
function feedHall(r: Rooms, wanted: boolean) {
  if (wanted) {
    clearTimeout(r.parking);
    r.parking = undefined;
    if (!r.hallFed) wetOf(r.ac).connect(r.hallConv);
    r.hallFed = true;
  } else if (r.hallFed && !r.parking) {
    r.parking = setTimeout(
      () => {
        r.parking = undefined;
        wetOf(r.ac).disconnect(r.hallConv);
        r.hallFed = false;
      },
      (ROOM_EASE * 6 + HALL_SECONDS) * 1000,
    );
  }
}

/** The vein's room in or out: its own once worked out, with the rooms on; otherwise its sounds go with everything else. */
function tuneVein(r: Rooms) {
  const v = veinRoom;
  if (!v) return;
  const t = r.ac.currentTime;
  const on = spatial.rooms && !spatial.today;
  if (on && depthNow >= VEIN_NEAR && !v.conv && !v.working) {
    v.working = true;
    const steps = roomSteps(r.ac, ROOMS.vein, r.like, roomSeed('vein'));
    const next = () => {
      const s = steps.next();
      if (!s.done) return whenIdle(next, { fallback: 300 });
      v.working = false;
      v.conv = new ConvolverNode(r.ac, { disableNormalization: true });
      v.conv.buffer = s.value;
      v.gain = gainNode(r.ac, 0);
      // At the send's level into the rooms (lib/sound.ts: the bus's send is at half).
      v.send.connect(gainNode(r.ac, 0.5)).connect(v.conv).connect(v.gain).connect(mixOf(r.ac));
      tuneVein(r);
    };
    whenIdle(next, { fallback: 300 });
  }
  const own = on && !!v.conv;
  v.gate.gain.setTargetAtTime(own ? 0 : 1, t, 0.05);
  v.gain?.gain.setTargetAtTime(own ? 1 : 0, t, 0.05);
}

/** Works a place's room out a little at a time while the page is idle (lib/acoustics.ts roomSteps), then keeps it (bringing it in), if its place still sounds or comes next. */
function work(place: string) {
  const r = rooms;
  if (!r || roomBufs.has(place) || working.has(place)) return;
  working.add(place);
  const steps = roomSteps(r.ac, ROOMS[place], r.like, roomSeed(place));
  const next = () => {
    const s = steps.next();
    if (!s.done) return whenIdle(next, { fallback: 300 });
    working.delete(place);
    if (!plan().kept.has(place)) return;
    roomBufs.set(place, s.value);
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
   * The mix's output, to the speakers as it is (through the listening aids
   * only while one is on, applyMix); the reverb send, through the game's
   * hall at its share and the rooms beside it; and the vein's own send,
   * into its room (tuneVein).
   */
  mount({ ac, master, wet, reverb, out: user, veinWet }) {
    mix = master;
    send = wet;
    // The vein's own sounds: through to the rest of the reverb until its room is ready (tuneVein).
    veinWet.disconnect();
    const gate = gainNode(ac, 1);
    veinWet.connect(gate).connect(wet);
    veinRoom = { send: veinWet, gate };
    user.disconnect();
    const straight = gainNode(ac, 1);
    user.connect(straight).connect(ac.destination);
    out = { ac, user, straight, aids: null, through: false, linked: false };

    // The game's own hall (its response set a moment after, lib/sound.ts audio), at its share, and the rooms beside it.
    reverb.disconnect();
    const hallGain = gainNode(ac, 1);
    reverb.connect(hallGain).connect(master);
    rooms = { ac, hallConv: reverb, hall: hallGain, hallFed: true, like: heardEnergy(Math.floor(ac.sampleRate * HALL_SECONDS), ac.sampleRate), playing: new Map() };

    heard.now = () => ac.currentTime;
    bus = { ac, master };
    applyMix();
  },

  place(ac, name, start, where: SoundPlace | undefined, wetTo?: AudioNode) {
    const s = spatial;
    if (s.today) return null;
    const edge = where?.edge;
    const from = edge ? edge : pointOf(where?.from, where?.x);
    const to = edge ? edge * BLAST_SWEEP.to : where?.to ? pointOf(where.to) : null;
    const seconds = to !== null ? (edge ? BLAST_SWEEP.seconds : (where?.seconds ?? 0)) : 0;
    const big = s.size && WIDE.has(name);
    const far = where?.far && !DISTANT.has(name) ? s.far : 0;
    if (from === null && to === null && !big && !far) {
      listener?.({ begin: start, seconds: 0.8, az: () => 0, far: 0, wide: false });
      return null;
    }

    // Where it is at t s from its start: travelling, or where it lands (a blast: where it bursts in).
    const xAt = travel(from, to, seconds, s.moving, !!edge);
    const az = (t: number) => xAt(t) * s.width;

    const hover = name === 'hover';
    const dryHover = hover && s.hoverDry;
    const place = big ? wide(ac) : PLACES[s.renderer](ac, dryHover);
    place.output.connect(mixOf(ac));
    // Dry: far off (duller, quieter), then placed.
    const dry = ac.createGain();
    let chain: AudioNode = dry;
    if (far) chain = chain.connect(filter(ac, 'lowpass', 20000 * Math.pow(1200 / 20000, far))).connect(gainNode(ac, db(-9 * far)));
    chain.connect(place.input);
    // Wet: as far off, with more of the room the farther; from its side, or the middle.
    const wet = ac.createGain();
    const sendPan = ac.createStereoPanner();
    let toRoom: AudioNode = wet;
    if (far) toRoom = toRoom.connect(filter(ac, 'lowpass', 20000 * Math.pow(1200 / 20000, far))).connect(gainNode(ac, db(-9 * far) * (1 + 0.6 * far)));
    toRoom.connect(sendPan).connect(wetTo ?? wetOf(ac));
    const sendAz = (t: number) => (s.sideReverb && !dryHover ? clamp1(az(t)) * SIDE_REVERB : 0);
    if (hover) {
      // At its level, a step quieter in a pointer's sweep (not the draw's hops, which pass no pointer), dry and close.
      let level = s.hoverDb;
      if (s.hoverRepeats && where?.x !== undefined) {
        lastHover = hoverStep(lastHover, start);
        level += lastHover.db;
      }
      dry.gain.value = db(level);
      wet.gain.value = db(level) * (dryHover ? HOVER_ROOM : 1);
    }

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
 * The energy (each channel's) of an impulse response `length` samples long
 * as a normalizing convolver plays it, as the game's hall is played: the Web
 * Audio spec scales it to 0.00125 over its RMS, times 44100 over the sample
 * rate, which comes to this whatever is in it. A room, played as it is, is
 * worked out to the same, so the reverb keeps its weight.
 */
function heardEnergy(length: number, sampleRate: number) {
  return length * ((0.00125 * 44100) / sampleRate) ** 2;
}

/**
 * An ambience loop spread wide: its left the loop, its right a second take
 * of it half a loop on (`take`, which lib/sound.ts starts there, keeps at the
 * loop's rate and stops with it). Nothing is filtered or piled up, so it
 * keeps its tone; and what passes on one side only comes by on the other
 * half a loop later, too far apart to be heard as an echo. A loop that
 * starts with the spread off is left as it is (null), with no second take
 * to play; one that starts with it on can be brought back to the middle
 * and out again (applyMix: the lab's Today and Wide ambience), the two ways
 * side by side. Once the loop has stopped, it is let go of.
 */
function widen(ac: AudioContext, buf: AudioBuffer) {
  if (!spreadWanted()) return null;
  const input = ac.createGain();
  const output = ac.createGain();
  const way = { centred: gainNode(ac, 0), spread: gainNode(ac, 1) };
  input.connect(way.centred).connect(output);
  const take = ac.createBufferSource();
  take.buffer = buf;
  take.loop = true;
  const merge = ac.createChannelMerger(2);
  input.connect(merge, 0, 0);
  take.connect(merge, 0, 1);
  merge.connect(way.spread).connect(output);
  spreads.add(way);
  take.addEventListener('ended', () => {
    spreads.delete(way);
    output.disconnect();
  });
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
