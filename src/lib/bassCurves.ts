// The low end of the game's sounds, worked out from the sounds themselves:
// each rendered offline as the mix plays it (its layers' levels, speeds,
// delays and filters, and the mix's level), under BASS_HZ, as a curve of
// how loud it is each STEP. What the view's tremor follows (lib/tremor.ts),
// heard or not: a moment's curve plays from when it's heard (lib/sound.ts
// onSounded), muted from when it would have been; the tunnel's rumble at
// the place in its loop being heard (loopHeard), or, unheard, at a place of
// its own. Only while a vein is felt (feelVein): its curves are worked out
// as it's entered, and a moment with none yet is worked out as it first
// sounds (and felt from the next time).

import { whenIdle } from './idle';
import { caveIn, filter, loopHeard, onSounded, type Sfx } from './sound';
import { CAVE_IN, MIX, MOMENTS, VEIN_AMBIENCE, type BedLayer, type Layer } from './soundDesign';

/** Below this (Hz) is a sound's low end: its rumble, thumps and booms, not the crackle over them. */
const BASS_HZ = 120;
/** The rate the curves are worked out at: ample for what's under BASS_HZ. */
const RATE = 8000;
/** A curve's step (s): its mean square over each. */
const STEP = 0.01;

/** The tunnel's loop that is felt: its rumble (the others have next to no low end). */
const RUMBLE_LAYER = VEIN_AMBIENCE.layers.find((l) => l.file === VEIN_AMBIENCE.swell.file)!;
/** The moments a vein's ground is felt to shake with, worked out as it's entered. */
const VEIN_FELT: readonly Sfx[] = ['veinStrike', 'veinMined', 'veinStrain1', 'veinStrain2', 'caveIn', 'lifeLost', 'wardShatter', 'wrong'];

let feeling = false;
const decoded = new Map<string, Promise<AudioBuffer>>();
const momentCurves = new Map<Sfx, Float32Array | 'working'>();
let rumbleCurve: Float32Array | 'working' | null = null;
/** Moments sounding: their curve, from when (performance ms), at what level (a power ratio). */
const going: { curve: Float32Array; at: number; k: number }[] = [];
/** Unheard, the rumble's own place: when (performance ms) its loop was at its start. */
let rumbleFrom: number | null = null;

onSounded((s) => {
  if (!feeling) return;
  const c = momentCurves.get(s.name);
  if (c instanceof Float32Array) going.push({ curve: c, at: s.at, k: 10 ** (s.gainDb / 10) });
  else if (!c) void momentCurve(s.name);
});

/** A vein entered (its curves worked out, if they aren't, in idle moments), or left (what sounds is let go of). */
export function feelVein(on: boolean) {
  feeling = on;
  if (!on) {
    going.length = 0;
    rumbleFrom = null;
    return;
  }
  if (!rumbleCurve) whenIdle(() => void loopCurve(RUMBLE_LAYER), { fallback: 200 });
  for (const name of VEIN_FELT) if (!momentCurves.has(name)) whenIdle(() => void momentCurve(name), { fallback: 200 });
}

/**
 * How loud the low end of the moments sounding is at `now` (performance
 * ms), in dBFS as the mix has it. -Infinity with none (or none worked out yet).
 */
export function momentsBass(now: number): number {
  let p = 0;
  for (let i = going.length - 1; i >= 0; i--) {
    const g = going[i];
    const k = Math.floor((now - g.at) / 1000 / STEP);
    if (k >= g.curve.length) going.splice(i, 1);
    else if (k >= 0) p += g.curve[k] * g.k;
  }
  return 10 * Math.log10(p);
}

/**
 * How loud the tunnel's rumble is under BASS_HZ at `now` (performance ms),
 * in dBFS as the mix has it, `swellDb` louder as it swells
 * (VEIN_AMBIENCE.swell). -Infinity until it's worked out.
 */
export function rumbleBass(now: number, swellDb = 0): number {
  if (!(rumbleCurve instanceof Float32Array)) return -Infinity;
  const n = rumbleCurve.length;
  const heard = loopHeard(RUMBLE_LAYER.file, now);
  let round: number;
  if (heard !== null) {
    rumbleFrom = null;
    round = heard;
  } else {
    rumbleFrom ??= now - Math.random() * n * STEP * 1000;
    round = (((now - rumbleFrom) / 1000 / STEP) % n) / n;
  }
  return 10 * Math.log10(rumbleCurve[Math.min(n - 1, Math.floor(round * n))]) + swellDb;
}

/** A sound file at RATE (the cave-in worked out, not fetched); fetched again next time if it fails. */
function decode(file: string): Promise<AudioBuffer> {
  let p = decoded.get(file);
  if (!p) {
    const ac = new OfflineAudioContext(1, 1, RATE);
    p =
      file === CAVE_IN.file
        ? Promise.resolve().then(() => caveIn(ac))
        : fetch(new URL(`${import.meta.env.BASE_URL}sfx/${file}.mp3`, document.baseURI))
            .then((r) => {
              if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
              return r.arrayBuffer();
            })
            .then((data) => ac.decodeAudioData(data));
    p.catch(() => decoded.delete(file));
    decoded.set(file, p);
  }
  return p;
}

/** An offline context `seconds` long, and the mix's input in it: its level, then only what's under BASS_HZ. */
function mix(seconds: number) {
  const ac = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
  const master = ac.createGain();
  master.gain.value = 0.9 * 10 ** (MIX.volume / 20);
  master.connect(filter(ac, 'lowpass', BASS_HZ)).connect(filter(ac, 'lowpass', BASS_HZ)).connect(ac.destination);
  return { ac, master };
}

/** A layer's sound through its own filters and level, into `to`. */
function play(ac: OfflineAudioContext, buf: AudioBuffer, l: Layer | BedLayer, to: AudioNode, loop = false) {
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = loop;
  src.playbackRate.value = l.rate;
  let head: AudioNode = src;
  if (l.hp) head = head.connect(filter(ac, 'highpass', l.hp));
  for (const band of ('eq' in l && l.eq) || []) head = head.connect(filter(ac, band.type, band.f, band.q, band.g));
  const g = ac.createGain();
  g.gain.value = 10 ** (l.gain / 20);
  head.connect(filter(ac, 'lowpass', l.lp)).connect(g).connect(to);
  return src;
}

/** The mean square of each STEP of `out` from `from` (s) on, `n` of them. */
function steps(out: Float32Array, from: number, n: number): Float32Array {
  const per = Math.round(STEP * RATE);
  const curve = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    const at = Math.round(from * RATE) + k * per;
    for (let i = at; i < at + per && i < out.length; i++) sum += out[i] * out[i];
    curve[k] = sum / per;
  }
  return curve;
}

async function momentCurve(name: Sfx) {
  momentCurves.set(name, 'working');
  try {
    const m = MOMENTS[name];
    const bufs = await Promise.all(m.layers.map((l) => decode(l.file)));
    const ends = m.layers.map((l, i) => l.delay / 1000 + Math.min(bufs[i].duration, l.len ?? Infinity) / l.rate);
    const seconds = Math.max(...ends) + 0.2;
    const { ac, master } = mix(seconds);
    m.layers.forEach((l, i) => {
      const src = play(ac, bufs[i], l, master);
      src.start(l.delay / 1000);
      if (l.len) src.stop(ends[i]);
    });
    momentCurves.set(name, steps((await ac.startRendering()).getChannelData(0), 0, Math.floor(seconds / STEP)));
  } catch {
    momentCurves.delete(name);
  }
}

/** A loop's curve, one time round (worked out over two, so its filters have settled where the second begins). */
async function loopCurve(l: BedLayer) {
  rumbleCurve = 'working';
  try {
    const buf = await decode(l.file);
    const d = buf.duration / l.rate;
    const { ac, master } = mix(2 * d);
    play(ac, buf, l, master, true).start(0);
    rumbleCurve = steps((await ac.startRendering()).getChannelData(0), d, Math.floor(d / STEP));
  } catch {
    rumbleCurve = null;
  }
}
