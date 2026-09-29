// Synthesized sound effects (no audio files to ship), voiced for a dark
// fantasy mood: struck bells with a minor-third hum, war drums, low brass
// drones and whooshes, all through a shared stone-hall reverb.

export type Sfx =
  | 'correct'
  | 'wrong'
  | 'turn'
  | 'yourTurn'
  | 'reveal'
  | 'victory'
  | 'defeat'
  | 'start'
  | 'join'
  | 'hover'
  | 'click'
  | 'select'
  | 'tick'
  | 'deathmatch';

let muted = (() => {
  try {
    return localStorage.getItem('poe2trivia.muted') === '1';
  } catch {
    return false;
  }
})();

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem('poe2trivia.muted', value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

type Bus = { ac: AudioContext; dry: AudioNode; wet: AudioNode; noise: AudioBuffer };
let bus: Bus | null = null;

/** Browsers refuse audio before the first click or key press; sounds queued until then would all fire at once. */
function allowed() {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

function audio(): Bus | null {
  if (typeof AudioContext === 'undefined' || !allowed()) return null;
  if (!bus) {
    const ac = new AudioContext();
    // Everything meets in a gentle compressor so stacked voices never clip.
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    const master = ac.createGain();
    master.gain.value = 0.9;
    // Take the digital edge off: nothing in here should sound bright or chiptune.
    const warm = ac.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 7000;
    warm.Q.value = 0.5;
    master.connect(warm).connect(comp).connect(ac.destination);

    const reverb = ac.createConvolver();
    reverb.buffer = hall(ac, 3.2);
    const wet = ac.createGain();
    wet.gain.value = 0.55;
    wet.connect(reverb).connect(master);

    const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    bus = { ac, dry: master, wet, noise };
  }
  if (bus.ac.state === 'suspended') void bus.ac.resume();
  return bus;
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
      const k = 0.55 - 0.45 * p;
      lp += k * (Math.random() * 2 - 1 - lp);
      // Soft 12 ms onset so the first reflection doesn't click.
      const onset = Math.min(1, i / (ac.sampleRate * 0.012));
      d[i] = lp * onset * Math.pow(1 - p, 2.6);
    }
  }
  return buf;
}

const vary = (x: number, amount = 0.04) => x * (1 + (Math.random() * 2 - 1) * amount);

type Voice = {
  gain?: number;
  attack?: number;
  /** Seconds after which the level has faded out. */
  dur: number;
  /** Reverb send, 0..1. */
  send?: number;
  pan?: number;
};

/** Envelope + routing shared by every voice. Returns the node to feed. */
function out(b: Bus, t: number, { gain = 0.1, attack = 0.005, dur, send = 0.2, pan = 0 }: Voice) {
  const { ac } = b;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
  let node: AudioNode = g;
  if (pan && ac.createStereoPanner) {
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    node = g.connect(p);
  }
  node.connect(b.dry);
  if (send > 0) {
    const s = ac.createGain();
    s.gain.value = send;
    node.connect(s).connect(b.wet);
  }
  return g;
}

function osc(
  b: Bus,
  freq: number,
  start: number,
  v: Voice & { type?: OscillatorType; to?: number; glide?: number; detune?: number; cutoff?: number; cutoffTo?: number },
) {
  const { ac } = b;
  const t = ac.currentTime + start;
  const o = ac.createOscillator();
  o.type = v.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (v.to) o.frequency.exponentialRampToValueAtTime(v.to, t + (v.glide ?? v.dur));
  if (v.detune) o.detune.value = v.detune;
  let src: AudioNode = o;
  if (v.cutoff) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(v.cutoff, t);
    if (v.cutoffTo) f.frequency.exponentialRampToValueAtTime(v.cutoffTo, t + v.dur);
    src = o.connect(f);
  }
  src.connect(out(b, t, v));
  o.start(t);
  o.stop(t + v.dur + 0.05);
}

function noise(
  b: Bus,
  start: number,
  v: Voice & { filter?: BiquadFilterType; freq: number; to?: number; q?: number },
) {
  const { ac } = b;
  const t = ac.currentTime + start;
  const src = ac.createBufferSource();
  src.buffer = b.noise;
  const f = ac.createBiquadFilter();
  f.type = v.filter ?? 'bandpass';
  f.Q.value = v.q ?? 1;
  f.frequency.setValueAtTime(v.freq, t);
  if (v.to) f.frequency.exponentialRampToValueAtTime(v.to, t + v.dur);
  src.connect(f).connect(out(b, t, v));
  src.start(t, Math.random() * 1.5);
  src.stop(t + v.dur + 0.05);
}

/**
 * A struck bell. Church-bell partials: hum an octave down, a minor-third
 * tierce (what makes bells sound solemn), a fifth and the nominal above.
 */
function bell(b: Bus, freq: number, start: number, { gain = 0.1, decay = 2.5, send = 0.4, pan = 0 } = {}) {
  const partials: [number, number, number][] = [
    // ratio, level, decay factor
    [0.5, 0.55, 1],
    [1, 1, 0.8],
    [1.2, 0.45, 0.6],
    [1.5, 0.3, 0.5],
    [2, 0.35, 0.4],
    [2.51, 0.15, 0.25],
    [3.01, 0.1, 0.18],
  ];
  for (const [r, l, k] of partials) {
    osc(b, freq * r, start, { gain: gain * l, attack: 0.003, dur: decay * k, send, pan, detune: (Math.random() - 0.5) * 6 });
  }
  // The strike itself: a muffled metal tap.
  noise(b, start, { freq: freq * 3, q: 3, gain: gain * 0.35, dur: 0.05, send: send * 0.5, pan });
}

/** A war drum: a pitched-down thump under a skin slap. */
function drum(b: Bus, start: number, { freq = 70, gain = 0.4, dur = 0.6, send = 0.3 } = {}) {
  osc(b, freq * 2.2, start, { to: freq, glide: 0.08, gain, attack: 0.002, dur, send });
  noise(b, start, { filter: 'lowpass', freq: 900, to: 200, gain: gain * 0.4, dur: 0.12, send });
}

/** Low, slow chord of detuned saws behind a closing filter: brass/choir drone. */
function pad(
  b: Bus,
  freqs: number[],
  start: number,
  { gain = 0.03, attack = 0.5, dur = 2.5, cutoff = 500, cutoffTo = 1200, send = 0.5 } = {},
) {
  freqs.forEach((f, i) => {
    const pan = freqs.length > 1 ? (i / (freqs.length - 1) - 0.5) * 0.6 : 0;
    for (const detune of [-9, 9]) {
      osc(b, f, start, { type: 'sawtooth', detune, gain, attack, dur, cutoff, cutoffTo, send, pan });
    }
  });
}

// Pitches (D natural minor: the key everything here lives in).
const D1 = 36.71, A1 = 55, D2 = 73.42, F2 = 87.31, A2 = 110, D3 = 146.83, F3 = 174.61, Fs3 = 185, A3 = 220;
const D4 = 293.66, A4 = 440, D5 = 587.33;

let lastHover = -1;

export function sfx(name: Sfx) {
  if (muted) return;
  const b = audio();
  if (!b) return;
  switch (name) {
    case 'hover': {
      // A soft breath of cloth: barely there, and never stacked on itself.
      const now = performance.now();
      if (now - lastHover < 45) return;
      lastHover = now;
      noise(b, 0, { freq: vary(1700, 0.1), to: 900, q: 1.4, gain: 0.06, attack: 0.012, dur: 0.09, send: 0.12 });
      osc(b, vary(330, 0.03), 0, { gain: 0.022, attack: 0.01, dur: 0.12, send: 0.2 });
      break;
    }
    case 'click':
      // Knuckle on carved stone.
      osc(b, vary(190), 0, { to: 95, glide: 0.06, gain: 0.2, attack: 0.002, dur: 0.12, send: 0.15 });
      noise(b, 0, { freq: vary(1400), q: 2, gain: 0.08, dur: 0.04, send: 0.1 });
      break;
    case 'select':
      // Setting a heavy piece down: a thud and a short metallic ring.
      osc(b, vary(150), 0, { to: 70, glide: 0.1, gain: 0.22, attack: 0.002, dur: 0.25, send: 0.25 });
      noise(b, 0, { freq: 800, to: 300, q: 1.5, gain: 0.08, dur: 0.1, send: 0.2 });
      bell(b, vary(A3, 0.01), 0.01, { gain: 0.035, decay: 1.1, send: 0.35 });
      break;
    case 'correct':
      // A clear bell in a warm swell, like good loot hitting the floor.
      bell(b, D4, 0, { gain: 0.12, decay: 2.8, send: 0.5, pan: -0.1 });
      bell(b, A4, 0.14, { gain: 0.08, decay: 2.4, send: 0.55, pan: 0.15 });
      pad(b, [D3, A3, D4], 0.02, { gain: 0.014, attack: 0.25, dur: 1.8, cutoff: 900, cutoffTo: 400 });
      noise(b, 0.05, { freq: 5500, to: 8000, q: 4, gain: 0.02, attack: 0.2, dur: 1.2, send: 0.7 });
      break;
    case 'wrong':
      // A dull blow and a sour, sinking drone.
      drum(b, 0, { freq: 58, gain: 0.3, dur: 0.5 });
      osc(b, A2, 0.02, { type: 'sawtooth', to: A2 * 0.94, gain: 0.04, attack: 0.02, dur: 0.9, cutoff: 600, cutoffTo: 180, send: 0.35, pan: -0.2 });
      osc(b, A2 * 1.06, 0.02, { type: 'sawtooth', to: A2, gain: 0.035, attack: 0.02, dur: 0.9, cutoff: 600, cutoffTo: 180, send: 0.35, pan: 0.2 });
      noise(b, 0, { filter: 'lowpass', freq: 500, to: 120, gain: 0.08, dur: 0.3, send: 0.2 });
      break;
    case 'turn':
      // A distant bell somewhere down the hall.
      bell(b, A3, 0, { gain: 0.045, decay: 1.8, send: 0.8 });
      break;
    case 'yourTurn':
      // A blade drawn from its sheath, then the call.
      noise(b, 0, { freq: 1200, to: 6500, q: 7, gain: 0.05, attack: 0.08, dur: 0.38, send: 0.35 });
      osc(b, 2350, 0.3, { gain: 0.012, attack: 0.002, dur: 0.7, send: 0.5 });
      osc(b, 3130, 0.3, { gain: 0.007, attack: 0.002, dur: 0.5, send: 0.5 });
      bell(b, D3, 0.28, { gain: 0.09, decay: 2, send: 0.5 });
      break;
    case 'reveal':
      // A portal tearing open.
      noise(b, 0, { filter: 'lowpass', freq: 180, to: 2200, q: 4, gain: 0.07, attack: 0.3, dur: 0.75, send: 0.6 });
      osc(b, A1, 0, { to: D2, gain: 0.14, attack: 0.25, dur: 0.8, send: 0.3 });
      osc(b, A3, 0.05, { type: 'triangle', to: D4, gain: 0.012, attack: 0.3, dur: 0.8, send: 0.8 });
      break;
    case 'join':
      // A waystone humming awake.
      noise(b, 0, { freq: 600, to: 2400, q: 3, gain: 0.025, attack: 0.15, dur: 0.4, send: 0.6 });
      bell(b, A4, 0.12, { gain: 0.04, decay: 1.6, send: 0.7 });
      break;
    case 'start':
      // Drum and war horn: the hunt begins.
      drum(b, 0, { freq: 55, gain: 0.45, dur: 0.9, send: 0.4 });
      pad(b, [D2, A2], 0.08, { gain: 0.035, attack: 0.25, dur: 1.6, cutoff: 250, cutoffTo: 900 });
      osc(b, D3, 0.08, { type: 'sawtooth', to: D3 * 1.01, gain: 0.03, attack: 0.3, dur: 1.4, cutoff: 400, cutoffTo: 1300, send: 0.5 });
      break;
    case 'victory':
      // A great gong, three rising bells and a hall full of brass.
      drum(b, 0, { freq: 48, gain: 0.45, dur: 1.2, send: 0.5 });
      bell(b, D2, 0, { gain: 0.14, decay: 5, send: 0.6 });
      pad(b, [D2, A2, D3, Fs3, A3], 0.1, { gain: 0.016, attack: 0.9, dur: 3.8, cutoff: 350, cutoffTo: 1600 });
      [D4, A4, D5].forEach((f, i) => bell(b, f, 0.45 + i * 0.38, { gain: 0.08 - i * 0.012, decay: 3, send: 0.6, pan: (i - 1) * 0.25 }));
      break;
    case 'defeat':
      // Someone else takes the crown: one low toll and a minor drone.
      bell(b, D2, 0, { gain: 0.12, decay: 4.5, send: 0.6 });
      pad(b, [D2, A2, D3, F3], 0.15, { gain: 0.015, attack: 0.8, dur: 3.5, cutoff: 700, cutoffTo: 250 });
      break;
    case 'tick':
      // A heartbeat, as the timer runs out.
      osc(b, 62, 0, { to: 45, glide: 0.08, gain: 0.3, attack: 0.004, dur: 0.18, send: 0.1 });
      osc(b, 55, 0.14, { to: 40, glide: 0.08, gain: 0.2, attack: 0.004, dur: 0.16, send: 0.1 });
      break;
    case 'deathmatch':
      // Three war-drum blows, a gong and a rising dirge.
      [0, 0.3, 0.6].forEach((t, i) => drum(b, t, { freq: 62 - i * 5, gain: 0.45, dur: 0.7, send: 0.35 }));
      bell(b, D1 * 2, 0.9, { gain: 0.12, decay: 4, send: 0.6 });
      pad(b, [D1, D2, A2, F3], 0.9, { gain: 0.02, attack: 0.7, dur: 2.6, cutoff: 200, cutoffTo: 900 });
      break;
  }
}

const HOVERABLE = 'button:not(:disabled), a[href], select:not(:disabled), input[type="checkbox"]:not(:disabled)';

/**
 * UI sounds for every control: a soft breath when the mouse moves onto one,
 * and a click when it's pressed. Controls that play their own sound (or none)
 * opt out of the click with `data-sfx="none"`.
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
}
