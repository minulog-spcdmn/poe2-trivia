// Sound effects: layered CC0 recordings (see public/sfx/CREDITS.txt), each
// layer filtered on its own, all sharing one stone-hall reverb, over a quiet
// ambience loop (a roaring fire over it during a deathmatch, and in Delve
// darker and lower the deeper the run, over a rumble). What plays
// for each moment lives in soundDesign.ts; this file is the mixer, and
// matches the audition page the design was tuned on.

import { descent } from './descent.ts';
import { AMBIENCE, CAVE_IN, DEPTH, FIRE, MIX, MOMENTS, RUMBLE, type Layer } from './soundDesign.ts';
import { readStored, writeStored } from './storage.ts';

export type Sfx =
  | 'hover'
  | 'click'
  | 'yourTurn'
  | 'turn'
  | 'pick'
  | 'reveal'
  | 'burn'
  | 'select'
  | 'correct'
  | 'fill'
  | 'wrong'
  | 'tick'
  | 'join'
  | 'start'
  | 'deathmatch'
  | 'victory'
  | 'defeat'
  /** Delve: a named depth reached. */
  | 'stratum'
  /** Delve: a life's ember bursts out of the phial. */
  | 'lifeLost'
  /** Delve: the run is over; no victory, just the last ember going out. */
  | 'fallen'
  /** Delve: a flare strikes and burns as the clock hits 0, for more time. */
  | 'flare'
  /** Delve: a stick of dynamite's fuse hisses. */
  | 'fuse'
  /** Delve: the dynamite goes off. */
  | 'blast'
  /** Delve: a deeper depth's cards are dealt and the scene sinks. */
  | 'plunge'
  /** Delve: an Azurite Ward takes a loss in place of a life. */
  | 'wardShatter'
  /** Delve: a find answered right; its sparks reach the item's slot. */
  | 'findReward'
  /** Delve together: a vote cast for a card. */
  | 'vote'
  /** Delve together: the draw lands on the card to play. */
  | 'draw'
  /** Delve together: a teammate's wrong pick strikes an answer for everyone. */
  | 'struck'
  /** Delve together: a life given to a teammate who perished. */
  | 'revive'
  /** Delve: an Azurite Vein answered wrong caves in (two losses at once). */
  | 'caveIn';

let muted = (() => {
  return readStored('muted') === '1';
})();

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  writeStored('muted', value ? '1' : '0');
  updateAmbience();
}

/** The player's volume, 0 to 1, on top of the mix level (desktop slider). */
let volume = (() => {
  const v = parseFloat(readStored('volume') ?? '');
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
})();

export function getVolume() {
  return volume;
}

export function setVolume(value: number) {
  volume = Math.min(1, Math.max(0, value));
  writeStored('volume', String(volume));
  if (bus) bus.user.gain.setTargetAtTime(userGain(), bus.ac.currentTime, 0.03);
}

/** Squared, so the slider feels even to the ear rather than bunching up at the top. */
const userGain = () => volume * volume;

type Bus = { ac: AudioContext; master: AudioNode; user: GainNode; wet: AudioNode };
let bus: Bus | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();
/** Decoded and ready to play right now. */
const ready = new Map<string, AudioBuffer>();

const db = (d: number) => Math.pow(10, d / 20);

/** Browsers refuse audio before the first click or key press; sounds queued until then would all fire at once. */
function allowed() {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

function audio(): Bus | null {
  if (typeof AudioContext === 'undefined' || !allowed()) return null;
  if (!bus) {
    const ac = new AudioContext();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    // "Warmth": take a little off the top of the whole mix.
    const shelf = ac.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 5000;
    shelf.gain.value = -MIX.warmth;
    const master = ac.createGain();
    master.gain.value = 0.9 * db(MIX.volume);
    const user = ac.createGain();
    user.gain.value = userGain();
    master.connect(shelf).connect(comp).connect(user).connect(ac.destination);

    // The hall's impulse takes a moment to work out: not in the tap that
    // starts the sound (the first sounds just play dry).
    const reverb = ac.createConvolver();
    setTimeout(() => (reverb.buffer = hall(ac, 2.8)), 300);
    const wet = ac.createGain();
    wet.gain.value = 0.5;
    wet.connect(reverb).connect(master);

    bus = { ac, master, user, wet };
    const files = new Set(Object.values(MOMENTS).flatMap((m) => m.layers.map((l) => l.file)));
    for (const file of files) if (!GENERATED[file]) void load(file).catch(() => {});
    // Already in a Delve: work out its sounds now (see depthAmbience).
    if (depth > 0) prepareDelve(bus);
  }
  // iOS also parks the context as 'interrupted' after a call or a trip to the lock screen.
  if (bus.ac.state !== 'running') void bus.ac.resume().catch(() => {});
  return bus;
}

function load(file: string) {
  let p = buffers.get(file);
  if (!p) {
    const ac = bus!.ac;
    const made = GENERATED[file];
    const decoded = made
      ? Promise.resolve().then(() => made(ac))
      : fetch(new URL(`${import.meta.env.BASE_URL}sfx/${file}.mp3`, document.baseURI))
            .then((r) => r.arrayBuffer())
            .then((data) => ac.decodeAudioData(data));
    p = decoded.then((buf) => {
      ready.set(file, buf);
      return buf;
    });
    buffers.set(file, p);
  }
  return p;
}

/** Runs `f` when the page has a moment to spare. */
const idle = (f: () => void) => ((globalThis as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((g: () => void) => setTimeout(g, 200)))(f);

/**
 * The sample rate the cave-in is worked out at: its layer is lowpassed at 7
 * kHz (CAVE_IN's moment), so 22.05 kHz loses nothing, and it is half the
 * work of 44.1 kHz (the browser resamples it as it plays).
 */
export const CAVE_IN_RATE = 22050;

/** Sounds worked out here rather than loaded, by the name the moments give them. */
const GENERATED: Record<string, (ac: AudioContext) => AudioBuffer | Promise<AudioBuffer>> = {
  [RUMBLE.file]: (ac) => rumble(ac),
  [CAVE_IN.file]: (ac) => inIdleSteps(caveInSteps(ac)),
};

/** Runs `steps` a step per idle moment, so no one step holds up the page for long. */
function inIdleSteps<T>(steps: Generator<void, T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const next = () => {
      try {
        const r = steps.next();
        if (r.done) resolve(r.value);
        else idle(next);
      } catch (e) {
        reject(e);
      }
    };
    next();
  });
}

/** A dark stone-hall impulse response: stereo noise that decays and loses its highs as it goes. */
function hall(ac: AudioContext, seconds: number) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const p = i / len;
      // One-pole lowpass whose cutoff falls over the tail.
      lp += (0.45 - 0.4 * p) * (Math.random() * 2 - 1 - lp);
      const onset = Math.min(1, i / (ac.sampleRate * 0.015));
      d[i] = lp * onset * Math.pow(1 - p, 3);
    }
  }
  return buf;
}

/**
 * Delve's rumble: brown noise, lowpassed twice, that loops without a seam
 * (its end is faded into its start). Its level is about AMBIENCE's file's,
 * so RUMBLE's gain compares with AMBIENCE's. One channel is worked out; the
 * other plays the same loop half a turn on, which sounds as wide and is
 * seamless too.
 */
export function rumble(ac: Pick<BaseAudioContext, 'sampleRate' | 'createBuffer'>) {
  const seconds = 6;
  const fade = Math.floor(ac.sampleRate * 0.75);
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  const k = 1 - Math.exp((-2 * Math.PI * RUMBLE.lp) / ac.sampleRate);
  const raw = new Float32Array(len + fade);
  let brown = 0;
  let a = 0;
  let b = 0;
  let sum = 0;
  for (let i = 0; i < raw.length; i++) {
    brown = (brown + 0.02 * (Math.random() * 2 - 1)) * 0.998;
    a += k * (brown - a);
    b += k * (a - b);
    raw[i] = b;
    sum += b * b;
  }
  // About -26 dB RMS, like the ambience file's -29 mean with a little more weight.
  const scale = 0.05 / Math.sqrt(sum / raw.length || 1);
  const left = buf.getChannelData(0);
  const right = buf.getChannelData(1);
  const half = len >> 1;
  for (let i = 0; i < len; i++) {
    // The tail past the end crossfades into the start, so the loop point is
    // seamless. Equal power: the two halves are unrelated noise, so a straight
    // fade would dip.
    const t = i < fade ? i / fade : 1;
    left[i] = (raw[i] * Math.sqrt(t) + (i < fade ? raw[len + i] * Math.sqrt(1 - t) : 0)) * scale;
  }
  for (let i = 0; i < len; i++) right[i] = left[(i + half) % len];
  return buf;
}

/**
 * An Azurite Vein caving in (CAVE_IN in soundDesign.ts), worked out like the
 * rumble: about 1.3 s of stereo. A sharp crack as the rock gives, a deep
 * rumble that swells in at once and dies away, a couple of heavy thumps of
 * boulders landing, and a collapse of stones, each a short knock of filtered
 * noise, bigger and lower first and then smaller, higher and sparser as it
 * settles. Each side gets its own stones, so it sounds wide. Peaks at about
 * -1 dB; CAVE_IN's gain sets its level in the mix. Worked out at no more
 * than CAVE_IN_RATE, and only once a Delve starts (see prepareDelve).
 */
export function caveIn(ac: Pick<BaseAudioContext, 'sampleRate' | 'createBuffer'>) {
  const steps = caveInSteps(ac);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** caveIn in three parts (the rumble, then each side's stones), so it can be worked out a part per idle moment. */
function* caveInSteps(ac: Pick<BaseAudioContext, 'sampleRate' | 'createBuffer'>): Generator<void, AudioBuffer> {
  const sr = Math.min(ac.sampleRate, CAVE_IN_RATE);
  const seconds = CAVE_IN.seconds;
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(2, len, sr);
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const at = (t: number) => Math.floor(t * sr);
  /** A knock of noise at `t0` (s), ringing at `hz` with decay `tau` (s), at `amp`, added to `d`. */
  const knock = (d: Float32Array, t0: number, hz: number, tau: number, amp: number) => {
    const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr;
    // A two-pole resonator: rings at hz, wider the shorter it is.
    const r = Math.exp(-1 / (tau * sr * 0.35));
    const [c1, c2] = [2 * r * Math.cos(w), -r * r];
    // Its peak gain at hz is about 1 / ((1 - r) * sqrt(1 - 2r cos 2w + r^2)): set it back to 1.
    const norm = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * w) + r * r);
    let [y1, y2] = [0, 0];
    const start = at(t0);
    const end = Math.min(len, start + at(tau * 6));
    for (let i = start; i < end; i++) {
      const k = (i - start) / sr;
      const x = (Math.random() * 2 - 1) * Math.exp(-k / tau) * Math.min(1, k / 0.0015);
      const y = x + c1 * y1 + c2 * y2;
      y2 = y1;
      y1 = y;
      d[i] += y * norm * amp;
    }
  };
  /** A low thud at `t0`: a sine falling from `hz` that dies away over `tau`. */
  const thud = (d: Float32Array, t0: number, hz: number, tau: number, amp: number) => {
    let phase = 0;
    const start = at(t0);
    const end = Math.min(len, start + at(tau * 6));
    for (let i = start; i < end; i++) {
      const k = (i - start) / sr;
      phase += (2 * Math.PI * hz * (0.75 + 0.25 * Math.exp(-k / 0.06))) / sr;
      d[i] += Math.sin(phase) * Math.exp(-k / tau) * Math.min(1, k / 0.004) * amp;
    }
  };
  // The rumble: noise kept to the low end (two lowpasses at 120 Hz, the
  // subsonic taken out), swelling in at once and dying away. The same in
  // both ears, as it fills the hall.
  const lp = 1 - Math.exp((-2 * Math.PI * 120) / sr);
  const hp = 1 - Math.exp((-2 * Math.PI * 35) / sr);
  let [a, b, lo] = [0, 0, 0];
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    a += lp * (Math.random() * 2 - 1 - a);
    b += lp * (a - b);
    lo += hp * (b - lo);
    const env = Math.min(1, t / 0.03) * Math.exp(-t / 0.45);
    ch[0][i] += (b - lo) * env * CAVE_IN.rumble;
    ch[1][i] += (b - lo) * env * CAVE_IN.rumble;
  }
  for (let side = 0; side < 2; side++) {
    yield;
    const d = ch[side];
    // The crack as the rock gives, and the heavy blocks coming down.
    knock(d, 0.002 * side, 2600, 0.012, 0.9);
    knock(d, 0.004, 900, 0.03, 0.7);
    thud(d, 0.01, 62, 0.16, 0.9);
    thud(d, 0.16 + 0.04 * side, 48, 0.2, 0.75);
    // The collapse: stones, big and low first, smaller, higher and sparser as it settles.
    let t = 0.03 + Math.random() * 0.02;
    while (t < seconds - 0.12) {
      const u = t / seconds;
      const size = Math.pow(1 - u, 1.5) * (0.5 + Math.random() * 0.5);
      knock(d, t, 300 + 2800 * (1 - size) * (0.6 + Math.random() * 0.8), 0.006 + 0.03 * size, (0.18 + 0.75 * size) * CAVE_IN.stones);
      t += 0.012 + 0.09 * Math.pow(u, 1.2) * (0.4 + Math.random() * 1.2);
    }
  }
  // To about -1 dB at the peak, fading out over the last moment.
  let peak = 0;
  for (const d of ch) for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = 0.89 / (peak || 1);
  const tail = at(0.15);
  for (const d of ch) for (let i = 0; i < len; i++) d[i] *= k * Math.min(1, (len - i) / tail);
  return buf;
}

function filter(ac: AudioContext, type: BiquadFilterType, frequency: number, q = 0.707, gain = 0) {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

/**
 * One layer: high-pass, low-pass and the "soften" dip around 3.2 kHz, then
 * level and reverb send. Returns its source and level, to stop it early (see sfx).
 */
function playLayer(b: Bus, buf: AudioBuffer, l: Layer, soften: number, pitch: number, gainDb: number) {
  const { ac } = b;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = l.rate * pitch;
  const g = ac.createGain();
  g.gain.value = db(l.gain + gainDb);
  src
    .connect(filter(ac, 'highpass', l.hp))
    .connect(filter(ac, 'lowpass', l.lp))
    .connect(filter(ac, 'peaking', 3200, 1, -soften))
    .connect(g)
    .connect(b.master);
  const send = ac.createGain();
  send.gain.value = l.send;
  g.connect(send).connect(b.wet);
  src.start(ac.currentTime + l.delay / 1000);
  return { src, gain: g };
}

/** How long (s) a sound stopped early takes to fade out (see sfx). */
const STOP_FADE = 0.05;

/**
 * Sounds that can come in bursts, and how close together (ms) they may play:
 * sweeping across a row of buttons, or a veiled picture that shows up with
 * several patches already in, shouldn't turn into a rattle.
 */
const MIN_GAP: Partial<Record<Sfx, number>> = { hover: 70, burn: 120 };
const lastPlayed = new Map<Sfx, number>();

/**
 * Plays a moment's sound. Returns a function that stops it early, fading it
 * out over STOP_FADE (50 ms) and then stopping it: for a sound cut short,
 * like a fuse's hiss when its dynamite goes off or is snuffed. Calling it
 * after the sound has ended, or twice, does nothing. Returns undefined when
 * nothing played (muted, out of sight, too soon after the last, or before
 * the first click).
 */
export function sfx(name: Sfx): (() => void) | undefined {
  // Out of sight (a co-op tab in the background) nothing plays: a sound
  // would wake the audio context that rest() put to sleep, and keep it running.
  if (muted || (typeof document !== 'undefined' && document.hidden)) return undefined;
  const gap = MIN_GAP[name];
  if (gap) {
    const now = performance.now();
    if (now - (lastPlayed.get(name) ?? -Infinity) < gap) return undefined;
    lastPlayed.set(name, now);
  }
  const b = audio();
  if (!b) return undefined;
  const m = MOMENTS[name];
  // One random nudge for the whole moment, so its layers stay together.
  const pitch = 1 + (Math.random() * 2 - 1) * m.varyPitch;
  const gainDb = (Math.random() * 2 - 1) * m.varyGain;
  const layers: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
  for (const l of m.layers) {
    // Only layers that have loaded: a late layer would land out of step.
    const buf = ready.get(l.file);
    if (buf) layers.push(playLayer(b, buf, l, m.soften, pitch, gainDb));
  }
  if (!layers.length) return undefined;
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const now = b.ac.currentTime;
    for (const { src, gain } of layers) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + STOP_FADE);
      try {
        src.stop(now + STOP_FADE);
      } catch {
        // Already stopped (an older Safari throws on a second stop).
      }
    }
  };
}

// ---------- ambience ----------

type Loop = typeof AMBIENCE;
type Playing = { src: AudioBufferSourceNode; gain: GainNode; lp: BiquadFilterNode; send: GainNode; stop: () => void };

/**
 * How fast (time constants in s) each loop fades in and out: the fire swells
 * up with the deathmatch intro and dies down slowly, and Delve's rumble
 * comes up from below over a few seconds.
 */
const FADES = new Map<Loop, { up: number; down: number }>([
  [AMBIENCE, { up: 0.8, down: 0.2 }],
  [FIRE, { up: 1.5, down: 1 }],
  [RUMBLE, { up: 3, down: 1.5 }],
]);
const playing = new Map<Loop, Playing>();
const starting = new Set<Loop>();
let fire = false;
/** Delve's depth (0 outside it), and how fast (s) the sound follows it: about the backdrop's two seconds a depth. */
let depth = 0;
const DEPTH_EASE = 1.5;

/** Stokes the ambience into a roaring fire for as long as a deathmatch lasts. */
export function fireAmbience(on: boolean) {
  fire = on;
  updateAmbience();
}

/** Delve: the ambience darkens and lowers with the depth of the run, over a rumble (0: the usual ambience). */
export function depthAmbience(d: number) {
  if (d === depth) return;
  depth = d;
  if (d > 0 && bus) prepareDelve(bus);
  updateAmbience();
  if (!bus) return;
  for (const [l, p] of playing) shape(l, p, bus.ac.currentTime, DEPTH_EASE);
}

/**
 * Delve's own sounds, the rumble and the cave-in, take a moment to work out:
 * done when the page has one to spare as a run starts (or as sound starts
 * during one), not in the tap that plays them, and not for a visitor who
 * never delves. Each in its own idle moment, so neither holds up the page
 * for long.
 */
function prepareDelve(b: Bus) {
  for (const file of [RUMBLE.file, CAVE_IN.file])
    if (!buffers.has(file)) idle(() => bus === b && void load(file).catch(() => {}));
}

/** The rumble comes in a few depths down. */
const rumbles = () => descent(depth).deep > 0.12;

/** Each loop plays while sound is on and the tab is visible (the fire only during a deathmatch, the rumble only deep in Delve). */
const wanted = (l: Loop) =>
  !muted && document.visibilityState === 'visible' && (l !== FIRE || fire) && (l !== RUMBLE || rumbles());

/** A loop's level, cutoff, speed and reverb send at the current depth. */
function target(l: Loop) {
  const { deep, abyss } = descent(depth);
  if (l === AMBIENCE)
    return {
      gain: db(l.gain + DEPTH.gain * deep),
      // Down in octaves, so the highs go evenly rather than all at the end.
      lp: l.lp * Math.pow(DEPTH.lp / l.lp, deep),
      rate: 1 + (DEPTH.rate - 1) * deep,
      send: DEPTH.send * deep,
    };
  if (l === RUMBLE) return { gain: db(l.gain + RUMBLE.abyss * abyss), lp: l.lp, rate: 1, send: 0.3 };
  return { gain: db(l.gain), lp: l.lp, rate: 1, send: 0 };
}

/** Moves a playing loop toward its target (`tc`: time constant in s). */
function shape(l: Loop, p: Playing, at: number, tc: number) {
  const t = target(l);
  p.gain.gain.setTargetAtTime(t.gain, at, tc);
  p.lp.frequency.setTargetAtTime(t.lp, at, tc);
  p.src.playbackRate.setTargetAtTime(t.rate, at, tc);
  p.send.gain.setTargetAtTime(t.send, at, tc);
}

/** Starts the loops that should play and fades out the ones that shouldn't. */
function updateAmbience() {
  for (const l of FADES.keys()) updateLoop(l);
  if (!wanted(AMBIENCE)) rest();
}

/**
 * While muted or out of sight, the audio context is suspended once the loops
 * have faded out: a running one keeps the audio hardware and its render
 * thread busy even when all it plays is silence. The next sound (or the
 * ambience coming back) resumes it (see audio()).
 */
let resting: ReturnType<typeof setTimeout> | undefined;
function rest() {
  clearTimeout(resting);
  resting = setTimeout(() => {
    if (bus && !wanted(AMBIENCE) && bus.ac.state === 'running') void bus.ac.suspend().catch(() => {});
  }, 1500);
}

function updateLoop(l: Loop) {
  const fade = FADES.get(l)!;
  if (!wanted(l)) {
    const p = playing.get(l);
    if (!p || !bus) return;
    playing.delete(l);
    p.gain.gain.setTargetAtTime(0, bus.ac.currentTime, fade.down);
    setTimeout(p.stop, fade.down * 7000);
    return;
  }
  if (playing.has(l) || starting.has(l)) return;
  const b = audio();
  if (!b) return;
  starting.add(l);
  load(l.file)
    .then((buf) => {
      starting.delete(l);
      if (playing.has(l) || !wanted(l)) return;
      const { ac } = b;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = filter(ac, 'lowpass', l.lp);
      const gain = ac.createGain();
      gain.gain.value = 0;
      const send = ac.createGain();
      send.gain.value = 0;
      src.connect(lp).connect(gain).connect(b.master);
      gain.connect(send).connect(b.wet);
      const nodes: AudioScheduledSourceNode[] = [src];
      if (l === RUMBLE) {
        // The rumble breathes: a slow swell and ebb on its level.
        const breath = ac.createGain();
        breath.gain.value = 1 - RUMBLE.breath / 2;
        const lfo = ac.createOscillator();
        lfo.frequency.value = 1 / RUMBLE.period;
        const depthOf = ac.createGain();
        depthOf.gain.value = RUMBLE.breath / 2;
        lfo.connect(depthOf).connect(breath.gain);
        lp.disconnect();
        lp.connect(breath).connect(gain);
        lfo.start();
        nodes.push(lfo);
      }
      const p: Playing = { src, gain, lp, send, stop: () => nodes.forEach((n) => n.stop()) };
      // In place at once, then the level fades up to where the depth wants it.
      shape(l, p, ac.currentTime, 0.001);
      gain.gain.cancelScheduledValues(ac.currentTime);
      gain.gain.setValueAtTime(0, ac.currentTime);
      gain.gain.setTargetAtTime(target(l).gain, ac.currentTime, fade.up);
      src.start(0, l === RUMBLE ? Math.random() * buf.duration : 0);
      playing.set(l, p);
    })
    .catch(() => {
      starting.delete(l);
    });
}

const HOVERABLE = 'button:not(:disabled), a[href], select:not(:disabled), input[type="checkbox"]:not(:disabled)';

/**
 * UI sounds for every control: a faint brush when the mouse moves onto one,
 * and a click when it's pressed. Controls that play their own sound (or none)
 * opt out of the click with `data-sfx="none"`. Also starts the ambience with
 * the first interaction.
 */
export function installUiSounds() {
  let hovered: Element | null = null;
  addEventListener(
    'pointerover',
    (e) => {
      // Touch "hovers" right before the tap, which already clicks.
      if (e.pointerType !== 'mouse') return;
      const el = (e.target as Element | null)?.closest?.(HOVERABLE) ?? null;
      if (el && el !== hovered) sfx('hover');
      hovered = el;
    },
    { passive: true },
  );
  addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button, a[href]');
      if (!el || (el as HTMLButtonElement).disabled || el.closest('[data-sfx="none"]')) return;
      sfx('click');
    },
    { capture: true },
  );
  // iOS mutes Web Audio with the ring/silent switch unless the page says it plays media.
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
  // Load the sounds and start the ambience with the first interaction, and wake
  // the context again whenever the phone has suspended it. A touch pointerdown
  // doesn't count as a user gesture yet (pointerup and touchend do), so listen
  // for all of them rather than only the first.
  const warm = () => {
    if (muted) return;
    audio();
    updateAmbience();
  };
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
    addEventListener(type, warm, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', updateAmbience);
}
