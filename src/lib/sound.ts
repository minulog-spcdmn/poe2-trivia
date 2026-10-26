// Sound effects: layered CC0 recordings (see public/sfx/CREDITS.txt), each
// layer filtered on its own, all sharing one stone-hall reverb, over a quiet
// ambience loop (a roaring fire over it during a deathmatch, and in Delve
// darker and lower the deeper the run, over a rumble, with a bed of its own
// for each place, cross-fading as the scene turns). What plays for each
// moment lives in soundDesign.ts; this file is the mixer, and matches the
// audition page and the ambience mix board the design was tuned on. Each
// sound is placed where it happens on screen, the ambience spread wide and
// each place in Delve given a room of its own in place of the hall, by the
// placer (lib/spatial.svelte.ts, see Placer).

import { archetypeAt } from './backdrops.ts';
import { descent, hallTurn, STRATA, strataAt } from './descent.ts';
import { AMBIENCE, ARCHETYPE_AMBIENCE, CAVE_IN, DEPTH, FIRE, MIX, MOMENTS, RUMBLE, VEIN_AMBIENCE, VEIN_DUCK, ZONE_AMBIENCE, type Bed, type BedLayer, type Layer } from './soundDesign.ts';
import { whenIdle } from './idle.ts';
import { fillRumble, rumbleLength } from './rumbleNoise.ts';
import type { RumbleJob } from './rumbleWorker.ts';
import { caveInLength, caveInParts } from './caveInNoise.ts';
import type { CaveInJob } from './caveInWorker.ts';
import { HALL_SECONDS, fillHall, hallLength } from './hallNoise.ts';
import type { HallAnswer, HallJob } from './hallWorker.ts';
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
  /** Delve together: a teammate perishes; the same, heard from far off. */
  | 'fallenFar'
  /** Delve: a flare strikes and burns as the clock hits 0, for more time. */
  | 'flare'
  /**
   * Delve: a stick of dynamite's fuse burning, once and held (sfx's
   * `holdMs`) over the clock's last seconds before it goes off, or as
   * Detonate is pressed; cut as it goes off.
   */
  | 'fuse'
  /** Delve: the dynamite goes off, blasting the question away. */
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
  | 'caveIn'
  /** Delve: an Azurite Vein's card chosen, for any of its strikes. */
  | 'veinStrike'
  /** Delve: a vein's strike answered right; the azurite breaks free (over the right-answer sound). */
  | 'veinMined'
  /** Delve: the dig runs on after strike 1; the walls crack. */
  | 'veinStrain1'
  /** ...and after strike 2, worse. */
  | 'veinStrain2'
  /** Delve: a Dynamite Cache answered wrong; its blast destroys something the player carries. */
  | 'itemBlown'
  /** Delve: a new zone's title card (components/zonecard): a soft tick as each letter of its name lands. */
  | 'zoneTick'
  /** Delve: the zone's name locks in, on its sound's second swell: a whoosh, a low thump and a ring. */
  | 'zoneLock'
  /** Delve: the chime over the zone's name, on its sound's loudest note. */
  | 'zoneSting'
  /** Delve: the zone's name leaves, as its place has it: burning away, */
  | 'zoneBurn'
  /** ...shattering like ice, */
  | 'zoneShatter'
  /** ...drifting off on the air, */
  | 'zoneDrift'
  /** ...or pulled into the void. */
  | 'zoneVoid';

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
  changed();
}

/** Whoever shows the sound's settings (the settings page, which reads back what it sets), told when one changes. */
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());
/** Calls `fn` whenever muting, the volume or the ambience's changes; returns the way to stop. */
export function onSoundChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
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
  changed();
}

/** Squared, so the slider feels even to the ear rather than bunching up at the top. */
const userGain = () => volume * volume;

/**
 * The ambience's own level, 0 to 1, under the volume (the settings page): every
 * loop (the hall, the fire, Delve's rumble, beds and tunnel) and nothing else.
 */
let ambience = (() => {
  const v = parseFloat(readStored('ambience') ?? '');
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
})();

export function getAmbience() {
  return ambience;
}

export function setAmbience(value: number) {
  ambience = Math.min(1, Math.max(0, value));
  writeStored('ambience', String(ambience));
  if (bus) for (const [l, p] of playing) shape(l, p, bus.ac.currentTime, 0.03);
  // Turned down to nothing the loops stop (and the context can sleep); up from it they start.
  updateAmbience();
  changed();
}

/** Squared, as the volume is. */
const ambienceGain = () => ambience * ambience;

/** The whole mix's lift (dB, MIX.lift): another only on the levels page (levels.html), to hear it against. */
let liftDb = MIX.lift;

export function setLift(value: number) {
  liftDb = value;
  if (bus) bus.lift.gain.setTargetAtTime(liftGain(), bus.ac.currentTime, 0.03);
}

/**
 * Each moment's offset (dB) on top of its design: none in the game; only the
 * levels page (levels.html) sets them, to play a moment at its level before a change.
 */
let trims: Partial<Record<Sfx, number>> = {};

export function setTrims(value: Partial<Record<Sfx, number>>) {
  trims = value;
}

/** The limiter's automatic makeup gain adds about 1.7 dB of its own, counted in the lift. */
const liftGain = () => db(liftDb - 1.7);

/**
 * `reverb`: the hall, fed by `wet` (its impulse response set a moment after
 * the bus is made, see audio). `hall` (and `hallWet`, its reverb send,
 * muffled by `hallWetLp`) is what Delve's zone loops play through: ducked and
 * muffled while an Azurite Vein is dug (see veinAmbience). `veinWet`: the
 * reverb send of the vein's own sounds (its tunnel's loops, and its moments
 * while in it), for the placer to ring in the vein's room; without one, the
 * hall's.
 */
type Bus = {
  ac: AudioContext;
  master: AudioNode;
  lift: GainNode;
  user: GainNode;
  wet: AudioNode;
  reverb: ConvolverNode;
  hall: GainNode;
  hallLp: BiquadFilterNode;
  hallWet: GainNode;
  hallWetLp: BiquadFilterNode;
  veinWet: GainNode;
};
let bus: Bus | null = null;

/**
 * Where a sound comes from on screen: an element (its centre), a point
 * (client px), both (half way between them), or a screen edge (-1 the
 * left, 1 the right). With `to` and `seconds` it travels there over that
 * long from its start, as sparks flying to a slot. `far`: a teammate's, not
 * yours. `speed`: how fast (px/s) the pointer came over the control it
 * hovers. Only the placer reads it (setPlacer); without one every sound
 * plays centred.
 */
export type SoundPlace = { from?: Element | null; x?: number; speed?: number; edge?: -1 | 1; to?: Element | null; seconds?: number; far?: boolean };

/**
 * Places sounds in space: the game's spatial sound (lib/spatial.svelte.ts),
 * set as the game starts. `mount` is handed the bus once it is up: its mix,
 * its reverb send, its hall (`reverb`, fed by the send and playing into the
 * mix) and its output (`out`, otherwise straight to the speakers), to route
 * through its own. `place` gives the nodes a moment's layers play into, dry
 * and to the reverb, in place of the mix's; null leaves it as it is.
 * `widen` is put on each ambience loop (mono) before its filter, to spread
 * it (null: left as it is): it may hand back a second take of the loop
 * (`take`, not started), which is started half a loop on, follows the
 * loop's rate and stops with it. `depth` hears Delve's depth as the ambience does
 * (depthAmbience), once mounted and on every change, for its rooms. `veinWet`
 * (mount) is the send of an Azurite Vein's own sounds, for its room; `wetTo`
 * (place) a send other than the bus's for a moment's reverb (a vein moment's,
 * in the vein).
 */
export type Placer = {
  mount(b: { ac: AudioContext; master: AudioNode; wet: AudioNode; reverb: ConvolverNode; out: GainNode; veinWet: GainNode }): void;
  place(ac: AudioContext, name: Sfx, start: number, where: SoundPlace | undefined, wetTo?: AudioNode): { dry: AudioNode; wet: AudioNode } | null;
  widen(ac: AudioContext, buf: AudioBuffer): { input: AudioNode; output: AudioNode; take?: AudioBufferSourceNode } | null;
  depth(d: number): void;
};
let placer: Placer | null = null;

/** Sets the placer (see Placer), once, as the game starts. */
export function setPlacer(p: Placer) {
  placer = p;
  if (bus) {
    p.mount({ ac: bus.ac, master: bus.master, wet: bus.wet, reverb: bus.reverb, out: bus.user, veinWet: bus.veinWet });
    p.depth(depth);
  }
}
/** Loaded or loading. Delve's beds are let go of once they fall silent (see evict); every other sound is kept. */
const buffers = new Map<string, Promise<AudioBuffer>>();
/** Decoded and ready to play right now. */
const ready = new Map<string, AudioBuffer>();
/** The files the moments play (see sfx). */
const MOMENT_FILES = new Set(Object.values(MOMENTS).flatMap((m) => m.layers.map((l) => l.file)));

export const db = (d: number) => Math.pow(10, d / 20);

/** Browsers refuse audio before the first click or key press; sounds queued until then would all fire at once. */
function allowed() {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

function audio(): Bus | null {
  if (typeof AudioContext === 'undefined' || !allowed()) return null;
  const b = build();
  if (!primed) prime(b);
  // iOS also parks the context as 'interrupted' after a call or a trip to the lock screen.
  if (b.ac.state !== 'running') wake(b.ac);
  return b;
}

/** How many wakes wait for their frame (see wake). */
let waking = 0;
/** Whether a frame is asked for, for the wakes waiting (see watchFrames). */
let watching = false;
/** When (performance ms) the last frame the wakes watched for called back (see watchFrames). */
let frameAt = -Infinity;
/** How long a wake waits for the frame in hand at most (ms), on a page that draws none (out of sight). */
export const WAKE_WAIT = 250;
/** When (performance ms) the page last heard a press, a click or a key (installUiSounds). */
let pressedAt = -Infinity;

/**
 * Wakes the context once the frame in hand is drawn, not in the tap that
 * wants it. On an iPhone waking it holds the page while the system starts
 * its audio session, 40 to 50 ms the first time, and the first tap is mostly
 * one that brings a new screen in (New game): woken in it, the new screen's
 * first frame came that much later. Now the first frame begun after the
 * tap's last event (its click), the new screen's, is drawn first, and the
 * wake holds up one of its own. It waits on timers, as they carry the tap's
 * gesture on (for a second), which iOS asks of a context starting; what
 * plays meanwhile is heard as it wakes.
 *
 * Each call waits on timers of its own and resumes the context from them,
 * though another wake is waiting already, as that one may carry no gesture.
 * On iOS 15 to 16.3 (no navigator.userActivation, so allowed() holds from
 * the first touch) the first tap's context is made, and woken, in the idle
 * moment after its pointerdown, which iOS doesn't count a gesture; its
 * touchend and click come in while that wake waits, and were theirs dropped
 * for it, the context's first start would be asked for without one, and
 * refused. (Nor do only the latest call's timers resume it: that idle moment
 * may come after a quick tap's pointerup, which wakes it in a gesture.)
 * Asked again, resume() does no harm: refused, it does nothing, and on a
 * context already on its way up it only waits with the first. And a wake
 * waits for a frame begun after the last press, whenever that came: a press
 * between that frame and the wake's next look brings a screen of its own.
 */
function wake(ac: AudioContext) {
  const from = performance.now();
  waking++;
  watchFrames();
  // (A timer comes after the whole of a frame, its drawing too, never in the middle of one.)
  const go = () => {
    const drawn = typeof requestAnimationFrame === 'undefined' || frameAt > Math.max(from, pressedAt);
    if (!drawn && performance.now() - from < WAKE_WAIT) return void setTimeout(go, 4);
    waking--;
    if (ac.state !== 'running') void ac.resume().catch(() => {});
  };
  setTimeout(go, 0);
}

/** Notes when each frame begins (frameAt), for as long as a wake waits for one. */
function watchFrames() {
  if (watching || typeof requestAnimationFrame === 'undefined') return;
  watching = true;
  const frame = () => {
    // When it's called back, not the frame's own stamp: a browser may stamp a
    // frame with the vsync it began on, before a press that it draws.
    frameAt = performance.now();
    if (waking > 0) requestAnimationFrame(frame);
    else watching = false;
  };
  requestAnimationFrame(frame);
}

/**
 * When (performance ms) the speakers play the context's time `t` (s): by
 * the context's own stamp of what it's playing when, or else by its clock
 * and latency.
 */
function heardAt(ac: AudioContext, t: number): number {
  const ts = ac.getOutputTimestamp?.();
  if (ts?.performanceTime && ts.contextTime !== undefined) return ts.performanceTime + (t - ts.contextTime) * 1000;
  return performance.now() + (t - ac.currentTime + (ac.outputLatency || ac.baseLatency || 0)) * 1000;
}

/** The context's time (s) the speakers play at `now` (performance ms): heardAt the other way. */
function heardTime(ac: AudioContext, now: number): number {
  const ts = ac.getOutputTimestamp?.();
  if (ts?.performanceTime && ts.contextTime !== undefined) return ts.contextTime + (now - ts.performanceTime) / 1000;
  return ac.currentTime - (ac.outputLatency || ac.baseLatency || 0) + (now - performance.now()) / 1000;
}

/**
 * A moment's sound, as it goes: which, when it's heard from (performance
 * ms), and its level against the moment's own (dB, as varied). Told heard
 * or not: muted, it's when it would have been (lib/bassCurves.ts, for the
 * view's tremor, shakes it all the same).
 */
export type Sounded = { name: Sfx; at: number; gainDb: number };
const soundedListeners = new Set<(s: Sounded) => void>();
/** Calls `fn` for each moment's sound as it goes (see Sounded); returns the way to stop. */
export function onSounded(fn: (s: Sounded) => void) {
  soundedListeners.add(fn);
  return () => void soundedListeners.delete(fn);
}
const sounded = (s: Sounded) => soundedListeners.forEach((fn) => fn(s));

/**
 * How far round its loop (0 to 1) the loop playing `file` is heard at `now`
 * (performance ms), or null while none plays it (muted, or not wanted). (A
 * share, not seconds: decoded at another rate, a file can come out a few ms
 * longer or shorter.)
 */
export function loopHeard(file: string, now = performance.now()): number | null {
  if (!bus) return null;
  for (const [l, p] of playing) {
    if (l.file !== file) continue;
    const d = p.takes[0].buffer?.duration ?? 0;
    if (!(d > 0)) return null;
    const into = p.from + (heardTime(bus.ac, now) - p.startedAt) * p.takes[0].playbackRate.value;
    return (((into % d) + d) % d) / d;
  }
  return null;
}

/**
 * The bus, made if it isn't yet. Making it needs no gesture: made before one,
 * its context waits, suspended, until audio() wakes it. (Making the context is
 * the slow part, 25 to 65 ms: the browser holds the page while it asks the
 * system for the speakers' rate, starting its audio process first if it
 * isn't running, so it's made in an idle moment: see buildSoon.) What it
 * plays is loaded only once it may play (prime): a touch that only scrolled
 * loads nothing.
 */
function build(): Bus {
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
    const lift = ac.createGain();
    lift.gain.value = liftGain();
    // Holds the peaks just under full scale.
    const limit = ac.createDynamicsCompressor();
    limit.threshold.value = -3;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.001;
    limit.release.value = 0.15;
    const user = ac.createGain();
    user.gain.value = userGain();
    master.connect(shelf).connect(comp).connect(lift).connect(limit).connect(user).connect(ac.destination);

    // Its impulse is worked out once sound may play (prime).
    const reverb = ac.createConvolver();
    const wet = ac.createGain();
    wet.gain.value = 0.5;
    wet.connect(reverb).connect(master);

    // The hall Delve's zone loops play in (see Bus).
    const zone = ac.createGain();
    const zoneLp = filter(ac, 'lowpass', 20000);
    zone.connect(zoneLp).connect(master);
    // Its echo too: heard from the hall, ducked and muffled with it.
    const zoneWet = ac.createGain();
    const zoneWetLp = filter(ac, 'lowpass', 20000);
    zoneWet.connect(zoneWetLp).connect(wet);
    const veinWet = ac.createGain();
    veinWet.connect(wet);

    bus = { ac, master, lift, user, wet, reverb, hall: zone, hallLp: zoneLp, hallWet: zoneWet, hallWetLp: zoneWetLp, veinWet };
    placer?.mount({ ac, master, wet, reverb, out: user, veinWet });
    placer?.depth(depth);
    // Sound starting in a vein: the hall is already behind.
    if (inTunnel()) shapeHall(bus, 0.001);
  }
  return bus;
}

/** Whether the bus is to be made in the next idle moment (buildSoon), and whether the ambience is to start with it. */
let building = false;
let ambienceToo = false;

/**
 * Makes the bus in the next idle moment rather than in the handler that
 * wants it (making it holds the page up: see build), then, if sound may
 * play, wakes and primes it, and with `ambience` starts the ambience.
 */
function buildSoon(ambience: boolean) {
  ambienceToo ||= ambience;
  if (building) return;
  building = true;
  whenIdle(
    () => {
      building = false;
      const start = ambienceToo;
      ambienceToo = false;
      if (muted) return;
      build();
      if (allowed()) {
        audio();
        if (start) updateAmbience();
      }
    },
    { timeout: 200 },
  );
}

/** Whether the bus has been primed: sound may play, and its sounds are loading (see prime). */
let primed = false;

/** Once sound may play: loads the moments' sounds and works out the hall. */
function prime(b: Bus) {
  primed = true;
  // The hall's impulse takes a moment to work out: not in the tap that
  // starts the sound (the first sounds just play dry), and away from the
  // page (hallThere), as that tap's screen comes in. The reverb takes it in
  // an idle moment (taking it in works it over again), or within half a
  // second where the page never idles (a busy Delve on a slow phone).
  // (Should it fail, the context closed meanwhile, the sound stays dry.)
  setTimeout(() => void hallThere(b.ac).then((buf) => whenIdle(() => (b.reverb.buffer = buf), { timeout: 500, fallback: 200 }), () => {}), 300);
  for (const file of MOMENT_FILES) if (!GENERATED[file]) void load(file).catch(() => {});
  // Already in a Delve: work out its sounds now (see depthAmbience).
  if (depth > 0) prepareDelve(b);
}

/**
 * Files that failed to load: when last, and how long (ms) to wait before
 * trying again. Every tap and key press asks for the ambience (see
 * installUiSounds), so offline a failed file would be fetched again and again;
 * instead the wait starts at RETRY_FIRST and doubles each time, up to RETRY_MAX.
 */
const failed = new Map<string, { at: number; wait: number }>();
const RETRY_FIRST = 10_000;
const RETRY_MAX = 120_000;

/** A file that failed to load a moment ago, and isn't to be tried again yet. */
function backingOff(file: string) {
  const f = failed.get(file);
  return !!f && performance.now() - f.at < f.wait;
}

/** A file to load ahead of need: neither held nor loading, and not failed a moment ago. */
const toFetch = (file: string) => !buffers.has(file) && !backingOff(file);

function load(file: string) {
  let p = buffers.get(file);
  if (!p) {
    if (backingOff(file)) return Promise.reject(new Error(`${file}: failed a moment ago`));
    const ac = bus!.ac;
    const made = GENERATED[file];
    const decoded = made
      ? Promise.resolve().then(() => made(ac))
      : fetch(new URL(`${import.meta.env.BASE_URL}sfx/${file}.mp3`, document.baseURI))
            .then((r) => {
              if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
              return r.arrayBuffer();
            })
            .then((data) => ac.decodeAudioData(data));
    const loading: Promise<AudioBuffer> = decoded.then(
      (buf) => {
        failed.delete(file);
        // Let go of while it loaded (see evict): whoever asked gets it, but it isn't held.
        if (buffers.get(file) === loading) ready.set(file, buf);
        return buf;
      },
      (e: unknown) => {
        // Not kept: asked for again (a Delve bed, the next depth), it tries again once its wait is over.
        if (buffers.get(file) === loading) {
          buffers.delete(file);
          const wait = failed.has(file) ? Math.min(RETRY_MAX, failed.get(file)!.wait * 2) : RETRY_FIRST;
          failed.set(file, { at: performance.now(), wait });
        }
        throw e;
      },
    );
    buffers.set(file, (p = loading));
  }
  return p;
}

/** Runs `f` when the page has a moment to spare. */
const idle = (f: () => void) => void whenIdle(f, { fallback: 200 });

/**
 * The sample rate the cave-in is worked out at: its layer is lowpassed at 7
 * kHz (CAVE_IN's moment), so 22.05 kHz loses nothing, and it is half the
 * work of 44.1 kHz (the browser resamples it as it plays).
 */
export const CAVE_IN_RATE = 22050;

/** Sounds worked out here rather than loaded, by the name the moments give them. */
const GENERATED: Record<string, (ac: AudioContext) => AudioBuffer | Promise<AudioBuffer>> = {
  [RUMBLE.file]: (ac) => rumbleThere(ac),
  [CAVE_IN.file]: (ac) => caveInThere(ac),
};

/**
 * Runs `steps` a step per idle moment, so no one step holds up the page for
 * long; a step waits at most half a second for one, on a page that never
 * idles, so the whole still comes in time.
 */
function inIdleSteps<T>(steps: Generator<void, T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const next = () => {
      try {
        const r = steps.next();
        if (r.done) resolve(r.value);
        else whenIdle(next, { timeout: 500, fallback: 200 });
      } catch (e) {
        reject(e);
      }
    };
    next();
  });
}

/** How long (s) the hall's impulse response is. */
export { HALL_SECONDS };

/** How many parts each channel of the hall's impulse is worked out in (see hallSteps). */
const HALL_PARTS = 4;

/**
 * The hall's impulse (lib/hallNoise.ts: stereo noise that decays and loses
 * its highs as it goes), worked out here where no worker can (hallThere): a
 * quarter of a channel per step, from the first idle moment on.
 */
export function* hallSteps(ac: Pick<BaseAudioContext, 'sampleRate' | 'createBuffer'>): Generator<void, AudioBuffer> {
  // Nothing before the first idle moment (inIdleSteps runs a first step at once).
  yield;
  const len = hallLength(ac.sampleRate);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let part = 0; part < HALL_PARTS; part++) {
      if (ch || part) yield;
      lp = fillHall(d, ac.sampleRate, Math.floor((len * part) / HALL_PARTS), Math.floor((len * (part + 1)) / HALL_PARTS), lp);
    }
  }
  return buf;
}

/**
 * The hall's impulse worked out in a worker of its own (lib/hallWorker.ts),
 * which then stops; here a step per idle moment (hallSteps) where there's
 * none or it fails. On an iPhone its steps here held the page over the
 * second after the first tap, as the screen that tap brought came in.
 */
function hallThere(ac: AudioContext): Promise<AudioBuffer> {
  const here = () => inIdleSteps(hallSteps(ac));
  if (typeof Worker === 'undefined') return here();
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = new Worker(new URL('./hallWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(here());
      return;
    }
    w.onmessage = ({ data }: MessageEvent<HallAnswer>) => {
      w.terminate();
      try {
        const buf = ac.createBuffer(data.channels.length, data.channels[0].length, ac.sampleRate);
        data.channels.forEach((c, i) => buf.getChannelData(i).set(c));
        resolve(buf);
      } catch (e) {
        reject(e);
      }
    };
    // (Failed to load, say: worked out here instead.)
    const instead = () => {
      w.terminate();
      resolve(here());
    };
    w.onerror = instead;
    w.onmessageerror = instead;
    w.postMessage({ sampleRate: ac.sampleRate } satisfies HallJob);
  });
}

/**
 * Delve's rumble: brown noise, lowpassed twice, that loops without a seam
 * (its end is faded into its start). Its level is about AMBIENCE's file's,
 * so RUMBLE's gain compares with AMBIENCE's. One channel is worked out; the
 * other plays the same loop half a turn on, which sounds as wide and is
 * seamless too. (The samples themselves: fillRumble.)
 */
export function rumble(ac: Pick<BaseAudioContext, 'sampleRate' | 'createBuffer'>) {
  const buf = ac.createBuffer(2, rumbleLength(ac.sampleRate), ac.sampleRate);
  fillRumble(ac.sampleRate, RUMBLE.lp, buf.getChannelData(0), buf.getChannelData(1));
  return buf;
}

/** What a sound's worker answers (lib/rumbleWorker.ts, lib/caveInWorker.ts): its two channels. */
type Channels = { left: Float32Array; right: Float32Array };

/**
 * A sound worked out in a worker made for the one job (`start` makes it),
 * which then stops, its channels put in a buffer at `sampleRate`; worked out
 * `here` instead where there's no worker, or it fails.
 */
function inWorker(ac: AudioContext, start: () => Worker, job: unknown, sampleRate: number, here: () => AudioBuffer | Promise<AudioBuffer>): Promise<AudioBuffer> {
  if (typeof Worker === 'undefined') return Promise.resolve(here());
  return new Promise((resolve, reject) => {
    const onPage = () => {
      try {
        resolve(here());
      } catch (e) {
        reject(e);
      }
    };
    let w: Worker;
    try {
      w = start();
    } catch {
      onPage();
      return;
    }
    w.onmessage = ({ data }: MessageEvent<Channels>) => {
      w.terminate();
      try {
        const buf = ac.createBuffer(2, data.left.length, sampleRate);
        buf.getChannelData(0).set(data.left);
        buf.getChannelData(1).set(data.right);
        resolve(buf);
      } catch (e) {
        reject(e);
      }
    };
    // (Failed to load, say: worked out here instead.)
    const instead = () => {
      w.terminate();
      onPage();
    };
    w.onerror = instead;
    w.onmessageerror = instead;
    w.postMessage(job);
  });
}

/**
 * The rumble worked out in a worker of its own (lib/rumbleWorker.ts); here,
 * as rumble, where there's none or it fails. On an iPhone it held the page
 * for about 75 ms here, just after Begin.
 */
function rumbleThere(ac: AudioContext): Promise<AudioBuffer> {
  const start = () => new Worker(new URL('./rumbleWorker.ts', import.meta.url), { type: 'module' });
  return inWorker(ac, start, { sampleRate: ac.sampleRate, lp: RUMBLE.lp } satisfies RumbleJob, ac.sampleRate, () => rumble(ac));
}

/**
 * An Azurite Vein caving in (CAVE_IN in soundDesign.ts), worked out like the
 * rumble: about 1.3 s of stereo. A sharp crack as the rock gives, a deep
 * rumble that swells in at once and dies away, a couple of heavy thumps of
 * boulders landing, and a collapse of stones, each a short knock of filtered
 * noise, bigger and lower first and then smaller, higher and sparser as it
 * settles. Each side gets its own stones, so it sounds wide. Peaks at about
 * -1 dB; CAVE_IN's gain sets its level in the mix. Worked out at no more
 * than CAVE_IN_RATE, and only once a Delve starts (see prepareDelve). (The
 * samples themselves: caveInParts.)
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
  const buf = ac.createBuffer(2, caveInLength(sr), sr);
  yield* caveInParts(sr, buf.getChannelData(0), buf.getChannelData(1));
  return buf;
}

/**
 * The cave-in worked out in a worker of its own (lib/caveInWorker.ts); here,
 * a part per idle moment, where there's none or it fails. On an iPhone each
 * part held the page 48 to 65 ms here, a frame each, as a Delve began.
 */
function caveInThere(ac: AudioContext): Promise<AudioBuffer> {
  const sampleRate = Math.min(ac.sampleRate, CAVE_IN_RATE);
  const start = () => new Worker(new URL('./caveInWorker.ts', import.meta.url), { type: 'module' });
  return inWorker(ac, start, { sampleRate } satisfies CaveInJob, sampleRate, () => inIdleSteps(caveInSteps(ac)));
}

export function filter(ac: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.707, gain = 0) {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

/** A layer cut short (Layer's `len`) dies away over at most this long (s), as the sound board cuts it. */
const CUT_FADE = 1.5;

/**
 * One layer: high-pass, low-pass and the "soften" dip around 3.2 kHz, then
 * level and reverb send. Returns its source and level, to stop it early (see sfx).
 * A layer with a `len` stops there, dying away over its last CUT_FADE s
 * ((1 - p)³, a sound settling) on a level of its own, which stopping early leaves be.
 * `hold` (s): the layer lasts that long from the moment's start, looped
 * should its recording run out sooner, and then fades out. `at` (s): the
 * moment starts that long from now, on the audio clock.
 */
function playLayer(b: Bus, buf: AudioBuffer, l: Layer, soften: number, pitch: number, gainDb: number, hold?: number, at = 0, into: { dry: AudioNode; wet: AudioNode } | null = null) {
  const { ac } = b;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = l.rate * pitch;
  const begin = ac.currentTime + at;
  const start = begin + l.delay / 1000;
  if (hold !== undefined && buf.duration / src.playbackRate.value < hold - l.delay / 1000) {
    // Too short to last: it loops, round its middle (the onset and the tail left out).
    src.loop = true;
    src.loopStart = Math.min(buf.duration * 0.15, 0.2);
    src.loopEnd = Math.max(src.loopStart + 0.05, buf.duration - Math.min(buf.duration * 0.1, 0.1));
  }
  const g = ac.createGain();
  g.gain.value = db(l.gain + gainDb);
  let head: AudioNode = src
    .connect(filter(ac, 'highpass', l.hp))
    .connect(filter(ac, 'lowpass', l.lp))
    .connect(filter(ac, 'peaking', 3200, 1, -soften));
  const cut = l.len ? l.len / src.playbackRate.value : 0;
  if (cut > 0) {
    const fade = Math.min(CUT_FADE, cut * 0.43);
    const out = ac.createGain();
    out.gain.setValueCurveAtTime(Float32Array.from({ length: 64 }, (_, i) => (1 - i / 63) ** 3), start + cut - fade, fade);
    head = head.connect(out);
  }
  head.connect(g).connect(into?.dry ?? b.master);
  const send = ac.createGain();
  send.gain.value = l.send;
  g.connect(send).connect(into?.wet ?? b.wet);
  src.start(start);
  if (cut > 0) src.stop(start + cut);
  if (hold !== undefined) {
    const end = Math.max(start, begin + hold);
    g.gain.setValueAtTime(g.gain.value, end);
    g.gain.linearRampToValueAtTime(0, end + STOP_FADE);
    src.stop(end + STOP_FADE);
  }
  return { src, gain: g };
}

/**
 * How far behind the page the speakers are (ms, at most 150): what a
 * picture timed to a sound waits, so the two land together (a zone's name
 * locking on its swell, heard through a Bluetooth headset). 0 before any
 * sound has started.
 */
export function audioLead(): number {
  const ac = bus?.ac;
  if (!ac || !primed) return 0;
  return Math.round(Math.min(0.15, Math.max(0, ac.outputLatency || ac.baseLatency || 0)) * 1000);
}

/** How long (s) a sound stopped early takes to fade out (see sfx). */
const STOP_FADE = 0.05;

/**
 * Sounds that can come in bursts, and how close together (ms) they may play:
 * sweeping across a row of buttons, or a veiled picture that shows up with
 * several patches already in, shouldn't turn into a rattle.
 */
const MIN_GAP: Partial<Record<Sfx, number>> = { hover: 70, burn: 120 };
/** An Azurite Vein's own moments: in the vein, they ring in its room. */
const VEIN_MOMENTS = new Set<Sfx>(['veinStrike', 'veinMined', 'veinStrain1', 'veinStrain2', 'caveIn']);
const lastPlayed = new Map<Sfx, number>();

/**
 * Plays a moment's sound. Returns a function that stops it early, fading it
 * out over STOP_FADE (50 ms) and then stopping it: for a sound cut short,
 * like a fuse's when its dynamite goes off. Calling it after the sound has
 * ended, or twice, does nothing. Returns undefined when nothing played
 * (muted, out of sight, too soon after the last, or before the first
 * click). `holdMs`: the sound lasts that long and then fades out, each
 * layer looped should its recording be shorter (a fuse burning for as long
 * as it has left). `inMs`: it starts that long from now, timed on the audio
 * clock rather than a timer (a row of ticks keeps its spacing however busy
 * the page is). `from`: where on screen it comes from (SoundPlace), for the
 * placer to put it there.
 */
export function sfx(name: Sfx, opts: { holdMs?: number; inMs?: number; from?: SoundPlace } = {}): (() => void) | undefined {
  // Out of sight (a co-op tab in the background) nothing plays: a sound
  // would wake the audio context that rest() put to sleep, and keep it running.
  if (typeof document !== 'undefined' && document.hidden) return undefined;
  // (Muted, it's still told as it would sound: see Sounded.)
  if (muted) return void sounded({ name, at: performance.now() + Math.max(0, opts.inMs ?? 0), gainDb: 0 });
  const gap = MIN_GAP[name];
  if (gap) {
    const now = performance.now();
    if (now - (lastPlayed.get(name) ?? -Infinity) < gap) return undefined;
    lastPlayed.set(name, now);
  }
  const m = MOMENTS[name];
  if (!bus) {
    // No bus yet, so nothing of it has loaded (load needs the bus) and
    // nothing could play: it's made in a moment (buildSoon), not here, where
    // it would hold up the hover or press that wants it.
    if (typeof AudioContext === 'undefined' || !allowed()) return undefined;
    buildSoon(false);
    return void sounded({ name, at: performance.now() + Math.max(0, opts.inMs ?? 0), gainDb: (Math.random() * 2 - 1) * m.varyGain + (trims[name] ?? 0) });
  }
  const b = audio();
  if (!b) return undefined;
  // One random nudge for the whole moment, so its layers stay together.
  const pitch = 1 + (Math.random() * 2 - 1) * m.varyPitch;
  const gainDb = (Math.random() * 2 - 1) * m.varyGain + (trims[name] ?? 0);
  const layers: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
  const inS = Math.max(0, opts.inMs ?? 0) / 1000;
  sounded({ name, at: heardAt(b.ac, b.ac.currentTime + inS), gainDb });
  // In a vein, its own moments ring in its room (Bus veinWet).
  const wetTo = inTunnel() && VEIN_MOMENTS.has(name) ? b.veinWet : undefined;
  const into = placer && m.layers.some((l) => ready.has(l.file)) ? placer.place(b.ac, name, b.ac.currentTime + inS, opts.from, wetTo) : null;
  for (const l of m.layers) {
    // Only layers that have loaded: a late layer would land out of step.
    const buf = ready.get(l.file);
    if (buf)
      layers.push(
        playLayer(b, buf, l, m.soften, pitch, gainDb, opts.holdMs === undefined ? undefined : Math.max(0, opts.holdMs) / 1000, inS, into ?? (wetTo ? { dry: b.master, wet: wetTo } : null)),
      );
  }
  // One that failed to load as sound started (offline for a moment) is tried
  // again for next time, once its wait is over (see load).
  for (const l of m.layers) if (!ready.has(l.file)) void load(l.file).catch(() => {});
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

/** A looping sound: AMBIENCE, FIRE, RUMBLE or a layer of a Delve place's bed (which has a rate and a send of its own). */
type Loop = { file: string; gain: number; lp: number; rate?: number; send?: number };
/** `takes`: the loop, and a second take of it when the placer spreads it (Placer.widen). */
/** A loop playing: its sources, nodes, and where in its file (`from`, s) it started at the context's `startedAt`. */
type Playing = { takes: AudioBufferSourceNode[]; gain: GainNode; lp: BiquadFilterNode; send: GainNode; stop: () => void; from: number; startedAt: number };

/** Delve's depth (0 outside it), and how fast (s) the sound follows it: about the backdrop's two seconds a depth. */
let depth = 0;
const DEPTH_EASE = 1.5;

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
/**
 * A Delve bed's layers come and go with the depth, as the scene turns (a
 * layer that loads late fades in the same way); muted or out of sight they
 * go as quickly as AMBIENCE.
 */
const BED_FADE = { up: DEPTH_EASE, down: DEPTH_EASE };
/**
 * Delve: an Azurite Vein's tunnel loops (VEIN_AMBIENCE), over the zone's
 * from its hall (see veinAmbience). They come and go over its fadeIn and
 * fadeOut (time constants of a third of each: most of the way by then).
 */
const VEIN_LAYERS = new Set<Loop>(VEIN_AMBIENCE.layers);
const VEIN_FADE = { up: VEIN_AMBIENCE.fadeIn / 3, down: VEIN_AMBIENCE.fadeOut / 3 };
/**
 * The depth from which the tunnel's loops are fetched ahead and kept: a few
 * before the first vein can turn up (from 26; delve.ts FINDS).
 */
export const VEIN_NEAR = 20;
/** The strike of the vein being dug (1 on), 0 out of one (see veinAmbience). */
let vein = 0;
/** In a vein's tunnel, in Delve. */
const inTunnel = () => vein > 0 && depth > 0;
/** The tunnel's loop that swells as the clock runs out (VEIN_AMBIENCE.swell), and how far it has, 0 to 1 (veinStrain). */
const SWELLS = VEIN_AMBIENCE.layers.find((l) => l.file === VEIN_AMBIENCE.swell.file);
let strain = 0;

/**
 * How far a vein's strike has strained, 0 to 1 (its clock run down, as the
 * dark has it): the tunnel's rumble swells with it (VEIN_AMBIENCE.swell), a
 * quarter of a second behind. Called each frame; moves only on a step worth
 * hearing.
 */
export function veinStrain(v: number) {
  const next = Math.min(1, Math.max(0, v));
  if (Math.abs(next - strain) < 0.02 && (next > 0 || strain === 0)) return;
  strain = next;
  const p = SWELLS && playing.get(SWELLS);
  if (p && bus) shape(SWELLS, p, bus.ac.currentTime, 0.25);
}
const playing = new Map<Loop, Playing>();
const starting = new Set<Loop>();
let fire = false;

// ---------- Delve's beds ----------

/** Delve: the places whose beds sound at a depth, how much each (0 to 1), and how much of AMBIENCE stays lit. */
export type Beds = { beds: { place: string; bed: Bed; weight: number }[]; fire: number };

/**
 * Delve: the place stratum `k` is, by the mix board's names: a zone's for
 * the first ten ('z0', The Mines, to 'z9'), past them its archetype's ('a0'
 * to 'a11', ARCHETYPES' index; see archetypeAt).
 */
export function placeAt(k: number): string {
  return k < STRATA.length ? `z${Math.max(0, k)}` : `a${archetypeAt(k)}`;
}

/** A place's bed (see placeAt): ZONE_AMBIENCE's or ARCHETYPE_AMBIENCE's. */
export function bedOf(place: string): Bed {
  return (place[0] === 'z' ? ZONE_AMBIENCE : ARCHETYPE_AMBIENCE)[Number(place.slice(1))];
}

/**
 * Delve: whose beds sound at depth `d` and how much, as the mix board has
 * them. The place the scene is turning from (strataAt) and the one it is
 * turning into, on the curve of the backdrop's hall (hallTurn: half way at
 * a zone's 10th depth, the rest of the way into the next zone), equal power:
 * cos and sin of its quarter turn, so their squares always add up to 1. A
 * settled depth is one place alone. `fire` is how much of AMBIENCE's level
 * stays lit: each place's share of its bed's fire (0 where none has any),
 * added up in power, as the beds are: the shares are of one fire, so added
 * up as they are they would swell it by up to 3 dB half way through a turn
 * between two places with the same fire, which this keeps level. Outside
 * Delve (depth 0) there are no beds and AMBIENCE is lit in full.
 */
export function bedsAt(d: number): Beds {
  if (!(d >= 1)) return { beds: [], fire: 1 };
  const { stratum, turn } = strataAt(d);
  const w = (hallTurn(turn) * Math.PI) / 2;
  const sounding = [
    { k: stratum - 1, weight: Math.cos(w) },
    { k: stratum, weight: Math.sin(w) },
  ]
    .filter((p) => p.weight > 0.001)
    .map(({ k, weight }) => {
      const place = placeAt(k);
      return { place, bed: bedOf(place), weight };
    });
  // hypot of one share is that share exactly, so a settled depth keeps its place's fire as it is.
  const lit = Math.hypot(...sounding.map(({ bed, weight }) => (bed.fire === null ? 0 : weight * db(bed.fire))));
  return { beds: sounding, fire: lit };
}

/** The beds' layers sounding at the current depth, with how much (see bedsAt), and how much of AMBIENCE stays lit there. */
let beds = new Map<Loop, number>();
let hearth = 1;

/**
 * Delve's beds are fetched only as a run nears them (they are about 360 KB
 * each): those sounding now as they are wanted (updateLoop; one that loads
 * late joins then, fading in), and the next place's when the page has a
 * moment to spare, from the first depth of the zone before it. Its turn into
 * the next begins at the 6th, and is heard from the 8th, most of it as the
 * next zone arrives.
 */
function prefetchBeds(b: Bus) {
  // And, as veins come near, the tunnel's.
  const ahead = [...nextBed().layers, ...(depth >= VEIN_NEAR ? VEIN_AMBIENCE.layers : [])];
  for (const { file } of ahead) if (toFetch(file)) idle(() => bus === b && void load(file).catch(() => {}));
}

/** Delve: the next place's bed, fetched ahead (see prefetchBeds). */
/** The next place down from Delve's depth `d`: the next zone's (its bed fetched ahead, and its room worked out ahead: lib/spatialPlan.ts). */
export const nextPlaceAt = (d: number) => placeAt(Math.floor((d - 1) / 10) + 1);
const nextBed = () => bedOf(nextPlaceAt(depth));

/** Never let go of (see evict): every sound but Delve's beds and a vein's tunnel. */
const KEPT = new Set([AMBIENCE.file, FIRE.file, RUMBLE.file, CAVE_IN.file, ...MOMENT_FILES]);

/**
 * Lets go of the beds no longer wanted, once one falls silent: decoded, each
 * is several MB, and a long run passes through a couple of dozen. Kept are
 * those sounding or about to (at this depth, or loading to), still fading
 * out, the next place's, and the tunnel's where veins turn up; asked for again later, a bed is fetched from
 * the browser's cache. One let go of while it loads is handed to whoever
 * asked for it but not held (see load).
 */
function evict() {
  const held = new Set(KEPT);
  for (const l of [...playing.keys(), ...starting, ...beds.keys()]) held.add(l.file);
  for (const { file } of fading.values()) held.add(file);
  if (depth > 0) for (const { file } of nextBed().layers) held.add(file);
  if (depth >= VEIN_NEAR) for (const { file } of VEIN_AMBIENCE.layers) held.add(file);
  for (const file of buffers.keys()) {
    if (held.has(file)) continue;
    buffers.delete(file);
    ready.delete(file);
  }
}

// ---------- the loops ----------

/** Stokes the ambience into a roaring fire for as long as a deathmatch lasts. */
export function fireAmbience(on: boolean) {
  fire = on;
  updateAmbience();
}

/**
 * Delve: the ambience darkens and lowers with the depth of the run, over a
 * rumble, and each place's bed cross-fades into the next as the scene turns
 * (0: the usual ambience, no beds).
 */
export function depthAmbience(d: number) {
  if (d === depth) return;
  depth = d;
  placer?.depth(d);
  const now = bedsAt(d);
  beds = new Map(now.beds.flatMap(({ bed, weight }) => bed.layers.map((l): [Loop, number] => [l, weight])));
  hearth = now.fire;
  if (d > 0 && bus) prepareDelve(bus);
  updateAmbience();
  if (!bus) return;
  for (const [l, p] of playing) shape(l, p, bus.ac.currentTime, DEPTH_EASE);
  shapeHall(bus, DEPTH_EASE);
}

/**
 * Delve: in an Azurite Vein's tunnel at `strike` (1 on; lib/vein.ts
 * veinStrike), or out of one (0): a side passage off the zone. In it the
 * zone's loops duck and muffle behind, in the hall (VEIN_AMBIENCE, evened
 * out by VEIN_DUCK), more muffled each strike, and the tunnel's own play
 * over them, all coming in over its fadeIn and going over its fadeOut.
 */
export function veinAmbience(strike: number) {
  const next = Math.max(0, Math.floor(strike) || 0);
  if (next === vein) return;
  const turning = next > 0 !== vein > 0;
  vein = next;
  // A strike further in, the hall muffling as quickly as the board has it.
  if (bus) shapeHall(bus, turning ? (next ? VEIN_AMBIENCE.fadeIn : VEIN_AMBIENCE.fadeOut) / 3 : 0.4);
  if (turning) updateAmbience();
}

/** A place's correction to the tunnel's duck (VEIN_DUCK), by its name (see placeAt). */
const duckOf = (place: string) => (place[0] === 'z' ? VEIN_DUCK.zones : VEIN_DUCK.archetypes)[Number(place.slice(1))] ?? 0;

/**
 * How far (dB) the zone ducks behind a vein at Delve's depth `d`: VEIN_AMBIENCE's
 * duck with the place's correction, between two places their corrections by
 * the share each sounds (bedsAt's weights, squared: power), never above 0.
 */
export function veinDuckAt(d: number): number {
  const { beds: sounding } = bedsAt(d);
  const total = sounding.reduce((sum, { weight }) => sum + weight * weight, 0);
  const corr = total > 0 ? sounding.reduce((sum, { place, weight }) => sum + weight * weight * duckOf(place), 0) / total : 0;
  return Math.min(0, VEIN_AMBIENCE.duck + corr);
}

/** The zone's cutoff (Hz) behind a vein at strike `strike` (VEIN_AMBIENCE's muffles; past the last, the last). */
export const veinMuffleAt = (strike: number) => VEIN_AMBIENCE.muffles[Math.min(Math.max(1, strike), VEIN_AMBIENCE.muffles.length) - 1];

/** Moves the hall the zone's loops play in toward where the tunnel has it (`tc`: time constant in s). */
function shapeHall(b: Bus, tc: number) {
  const at = b.ac.currentTime;
  const k = inTunnel() ? db(veinDuckAt(depth)) : 1;
  const f = inTunnel() ? veinMuffleAt(vein) : 20000;
  b.hall.gain.setTargetAtTime(k, at, tc);
  b.hallWet.gain.setTargetAtTime(k, at, tc);
  b.hallLp.frequency.setTargetAtTime(f, at, tc);
  b.hallWetLp.frequency.setTargetAtTime(f, at, tc);
}

/**
 * Delve's own sounds, the rumble and the cave-in, take a moment to work out:
 * done when the page has one to spare as a run starts (or as sound starts
 * during one), not in the tap that plays them, and not for a visitor who
 * never delves. Each in its own idle moment, so neither holds up the page
 * for long.
 */
function prepareDelve(b: Bus) {
  for (const file of [RUMBLE.file, CAVE_IN.file]) if (toFetch(file)) idle(() => bus === b && void load(file).catch(() => {}));
}

/** The rumble comes in a few depths down. */
const rumbles = () => descent(depth).deep > 0.12;

/** Sound is on and the tab is visible. */
const audible = () => !muted && document.visibilityState === 'visible';

/**
 * Each loop plays while audible (the fire only during a deathmatch, the
 * rumble only deep in Delve, a bed only while its place sounds, the tunnel's
 * only in a vein).
 */
const wanted = (l: Loop) =>
  audible() && ambience > 0 && (l !== FIRE || fire) && (l !== RUMBLE || rumbles()) && (FADES.has(l) || beds.has(l) || (VEIN_LAYERS.has(l) && inTunnel()));

/** A loop's level, cutoff, speed and reverb send at the current depth, at the ambience's level. */
function target(l: Loop) {
  const t = mixTarget(l);
  return { ...t, gain: t.gain * ambienceGain() };
}

/** The same as the mix has it, before the player's ambience level. */
function mixTarget(l: Loop) {
  if (l === AMBIENCE) {
    const { deep } = descent(depth);
    return {
      // In Delve, as much as its places keep lit.
      gain: hearth * db(l.gain + DEPTH.gain * deep),
      // Down in octaves, so the highs go evenly rather than all at the end.
      lp: l.lp * Math.pow(DEPTH.lp / l.lp, deep),
      rate: 1 + (DEPTH.rate - 1) * deep,
      send: DEPTH.send * deep,
    };
  }
  if (l === RUMBLE) return { gain: db(l.gain + RUMBLE.abyss * descent(depth).abyss), lp: l.lp, rate: 1, send: 0.3 };
  if (VEIN_LAYERS.has(l)) return { gain: db(l.gain + (l === SWELLS ? VEIN_AMBIENCE.swell.db * strain : 0)), lp: l.lp, rate: l.rate ?? 1, send: l.send ?? 0 };
  // The fire, or a bed's layer as much as its place sounds.
  return { gain: (l === FIRE ? 1 : (beds.get(l) ?? 0)) * db(l.gain), lp: l.lp, rate: l.rate ?? 1, send: l.send ?? 0 };
}

/** Moves a playing loop toward its target (`tc`: time constant in s). */
function shape(l: Loop, p: Playing, at: number, tc: number) {
  const t = target(l);
  p.gain.gain.setTargetAtTime(t.gain, at, tc);
  p.lp.frequency.setTargetAtTime(t.lp, at, tc);
  for (const s of p.takes) s.playbackRate.setTargetAtTime(t.rate, at, tc);
  p.send.gain.setTargetAtTime(t.send, at, tc);
}

/** Starts the loops that should play and fades out the ones that shouldn't. */
function updateAmbience() {
  for (const l of new Set([...FADES.keys(), ...playing.keys(), ...beds.keys(), ...VEIN_LAYERS])) updateLoop(l);
  if (!audible()) hurry();
  if (!wanted(AMBIENCE)) rest();
  else if (bus && depth > 0) prefetchBeds(bus);
}

/** Muted or out of sight, the loops fade as quickly as AMBIENCE does, so all are silent before the context sleeps (rest). */
const QUICK = FADES.get(AMBIENCE)!.down;

/** Loops fading out until they stop, by the file each plays, and whether they fade quickly (see hurry). */
const fading = new Map<Playing, { file: string; quick: boolean }>();

/** Muted or out of sight: the loops already fading slowly (a deathmatch's fire, a bed left behind) go quickly too. */
function hurry() {
  if (!bus) return;
  for (const [p, f] of fading) {
    if (f.quick) continue;
    f.quick = true;
    p.gain.gain.setTargetAtTime(0, bus.ac.currentTime, QUICK);
  }
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
  const fade = FADES.get(l) ?? (VEIN_LAYERS.has(l) ? VEIN_FADE : BED_FADE);
  if (!wanted(l)) {
    const p = playing.get(l);
    if (!p || !bus) return;
    playing.delete(l);
    // The fire dies down, the rumble sinks and a bed left behind fades with the
    // depth; muted or hidden each goes before the context sleeps (rest), which
    // would cut a slower fade short.
    const quick = !audible();
    const down = quick ? QUICK : fade.down;
    p.gain.gain.setTargetAtTime(0, bus.ac.currentTime, down);
    fading.set(p, { file: l.file, quick });
    setTimeout(() => {
      p.stop();
      fading.delete(p);
      if (!FADES.has(l)) evict();
    }, down * 7000);
    return;
  }
  if (playing.has(l) || starting.has(l)) return;
  const b = audio();
  if (!b) return;
  starting.add(l);
  load(l.file)
    .then((buf) => {
      starting.delete(l);
      if (playing.has(l)) return;
      if (!wanted(l)) {
        // A bed whose place went by while it loaded (see evict).
        if (!FADES.has(l)) evict();
        return;
      }
      const { ac } = b;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = filter(ac, 'lowpass', l.lp);
      const gain = ac.createGain();
      gain.gain.value = 0;
      const send = ac.createGain();
      send.gain.value = 0;
      // A layer's own high-pass and EQ, where it has them, ahead of its low-pass (as the sound board has them).
      const { hp, eq = [] } = l as Partial<BedLayer>;
      const shaping = [...(hp ? [filter(ac, 'highpass', hp)] : []), ...eq.map((band) => filter(ac, band.type, band.f, band.q, band.g))];
      let into: AudioNode = lp;
      for (const node of shaping.reverse()) {
        node.connect(into);
        into = node;
      }
      // (The rumble is wide already, worked out in stereo.)
      const wide = placer && l !== RUMBLE ? placer.widen(ac, buf) : null;
      if (wide) {
        src.connect(wide.input);
        wide.output.connect(into);
      } else src.connect(into);
      lp.connect(gain);
      const takes = wide?.take ? [src, wide.take] : [src];
      // The tunnel's loops play close; every other in the hall, behind it while in a vein.
      const tunnel = VEIN_LAYERS.has(l);
      gain.connect(tunnel ? b.master : b.hall);
      gain.connect(send).connect(tunnel ? b.veinWet : b.hallWet);
      const nodes: AudioScheduledSourceNode[] = [...takes];
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
      const p: Playing = { takes, gain, lp, send, stop: () => nodes.forEach((n) => n.stop()), from: 0, startedAt: ac.currentTime };
      // In place at once, then the level fades up to where the depth wants it.
      shape(l, p, ac.currentTime, 0.001);
      gain.gain.cancelScheduledValues(ac.currentTime);
      gain.gain.setValueAtTime(0, ac.currentTime);
      gain.gain.setTargetAtTime(target(l).gain, ac.currentTime, fade.up);
      // The rumble and the beds start anywhere in their loop, so no two runs sound alike.
      const from = l === AMBIENCE || l === FIRE ? 0 : Math.random() * buf.duration;
      src.start(0, from);
      p.from = from;
      p.startedAt = ac.currentTime;
      wide?.take?.start(0, (from + buf.duration / 2) % buf.duration);
      playing.set(l, p);
    })
    .catch(() => {
      starting.delete(l);
    });
}

const HOVERABLE = 'button:not(:disabled), a[href], select:not(:disabled), input[type="checkbox"]:not(:disabled)';

/**
 * How fast (px/s) the pointer came to (`x`, `y`) at `t` (ms) over its last
 * moves (`trail`, oldest first): from the oldest within 60 ms. The hover
 * comes before the move that brought the pointer over its control, so that
 * move is (`x`, `y`) itself, not in the trail; with no move that recent (it
 * rested, then jumped there at once), the jump is taken as one quick move.
 */
export function pointerSpeed(trail: readonly { x: number; y: number; t: number }[], x: number, y: number, t: number): number {
  const from = trail.find((p) => t - p.t < 60) ?? trail.at(-1);
  if (!from) return 0;
  const dt = Math.min(Math.max(t - from.t, 8), 60) / 1000;
  return Math.hypot(x - from.x, y - from.y) / dt;
}

/**
 * UI sounds for every control: a faint brush when the mouse moves onto one,
 * and a click when it's pressed. Controls that play their own sound (or none)
 * opt out of the click with `data-sfx="none"`. Also starts the ambience with
 * the first interaction.
 */
export function installUiSounds() {
  let hovered: Element | null = null;
  // The pointer's last few moves (client px, ms), for how fast it came over a control.
  const trail: { x: number; y: number; t: number }[] = [];
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      trail.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (trail.length > 8) trail.shift();
    },
    { passive: true },
  );
  addEventListener(
    'pointerover',
    (e) => {
      // Touch "hovers" right before the tap, which already clicks.
      if (e.pointerType !== 'mouse') return;
      const el = (e.target as Element | null)?.closest?.(HOVERABLE) ?? null;
      // Half way between the control's middle and the pointer: a wide one sounds
      // a little to the side it is hovered on, not at the edge it came in over.
      if (el && el !== hovered) sfx('hover', { from: { from: el, x: e.clientX, speed: pointerSpeed(trail, e.clientX, e.clientY, e.timeStamp) } });
      hovered = el;
    },
    { passive: true },
  );
  addEventListener(
    'click',
    (e) => {
      pressedAt = performance.now();
      const el = (e.target as Element | null)?.closest?.('button, a[href]');
      if (!el || (el as HTMLButtonElement).disabled || el.closest('[data-sfx="none"]')) return;
      sfx('click', { from: { from: el } });
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
  // The first press doesn't make the context in its own handler, though: that
  // takes 25 to 65 ms (see build), which the press would show late by. It's
  // made in the idle moment after, while the button or finger is still down
  // (a quick tap's pointerup makes it there and then if that moment hasn't come).
  // Either way it's made before the click, not in the screen the click brings
  // in, and woken once that screen is drawn (see wake). (Nor any sooner, as the
  // page loads: a context made before any gesture is one Chrome warns of, and
  // may let run from then on, playing nothing.)
  const warm = (e: Event) => {
    pressedAt = performance.now();
    if (muted) return;
    if (!bus && e.type === 'pointerdown') {
      if (typeof AudioContext !== 'undefined') buildSoon(true);
      return;
    }
    audio();
    updateAmbience();
  };
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
    addEventListener(type, warm, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', updateAmbience);
}
