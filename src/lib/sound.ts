// Sound effects: short recorded foley (leather, cloth, coins, blades, doors,
// bells; CC0, see public/sfx/CREDITS.txt), played quietly through a dark
// stone-hall reverb. Pitching samples down makes them heavier and darker.

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
  | 'pick'
  | 'tick'
  | 'deathmatch';

const SAMPLES = [
  'hover-1',
  'hover-2',
  'click-1',
  'click-2',
  'select',
  'card',
  'page',
  'blade',
  'bell',
  'coins',
  'coins-small',
  'thud',
  'heartbeat',
  'door-open',
  'door-close',
  'clash',
] as const;
type Sample = (typeof SAMPLES)[number];

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

type Bus = { ac: AudioContext; dry: AudioNode; wet: AudioNode };
let bus: Bus | null = null;
const buffers = new Map<Sample, AudioBuffer>();

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
    const master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(comp).connect(ac.destination);

    const reverb = ac.createConvolver();
    reverb.buffer = hall(ac, 2.8);
    const wet = ac.createGain();
    wet.gain.value = 0.5;
    wet.connect(reverb).connect(master);

    bus = { ac, dry: master, wet };
    for (const name of SAMPLES) {
      fetch(new URL(`${import.meta.env.BASE_URL}sfx/${name}.mp3`, document.baseURI))
        .then((r) => r.arrayBuffer())
        .then((data) => ac.decodeAudioData(data))
        .then((buf) => buffers.set(name, buf))
        .catch(() => {
          /* that sound just stays silent */
        });
    }
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
      lp += (0.45 - 0.4 * p) * (Math.random() * 2 - 1 - lp);
      const onset = Math.min(1, i / (ac.sampleRate * 0.015));
      d[i] = lp * onset * Math.pow(1 - p, 3);
    }
  }
  return buf;
}

type Play = {
  /** Seconds from now. */
  at?: number;
  gain?: number;
  /** Playback speed: below 1 is lower and slower. */
  rate?: number;
  /** Reverb send, 0..1. */
  send?: number;
  /** Lowpass cutoff in Hz. */
  cutoff?: number;
  pan?: number;
  /** Cut the sample short (with a fade) after this many seconds. */
  length?: number;
};

function play(b: Bus, name: Sample, { at = 0, gain = 1, rate = 1, send = 0.15, cutoff, pan, length }: Play = {}) {
  const buf = buffers.get(name);
  if (!buf) return;
  const { ac } = b;
  const t = ac.currentTime + at;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ac.createGain();
  g.gain.value = gain;
  let node: AudioNode = src;
  if (cutoff) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = 0.5;
    node = node.connect(f);
  }
  node = node.connect(g);
  if (length) {
    g.gain.setValueAtTime(gain, t + length * 0.4);
    g.gain.linearRampToValueAtTime(0, t + length);
  }
  if (pan && ac.createStereoPanner) {
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    node = node.connect(p);
  }
  node.connect(b.dry);
  if (send > 0) {
    const s = ac.createGain();
    s.gain.value = send;
    node.connect(s).connect(b.wet);
  }
  src.start(t);
  if (length) src.stop(t + length + 0.02);
}

/** A small random detune so repeated UI sounds don't sound machine-gunned. */
const vary = (x: number, amount = 0.04) => x * (1 + (Math.random() * 2 - 1) * amount);
const either = <T>(a: T, b: T) => (Math.random() < 0.5 ? a : b);

let lastHover = -1;

export function sfx(name: Sfx) {
  if (muted) return;
  const b = audio();
  if (!b) return;
  switch (name) {
    case 'hover': {
      // The faintest brush of cloth, clipped short. It happens constantly, so it must stay in the background.
      const now = performance.now();
      if (now - lastHover < 70) return;
      lastHover = now;
      play(b, either('hover-1', 'hover-2'), { gain: 0.045, rate: vary(0.95, 0.06), cutoff: 2200, length: 0.12, send: 0.05 });
      break;
    }
    case 'click':
      play(b, either('click-1', 'click-2'), { gain: 0.16, rate: vary(0.9), cutoff: 3500, send: 0.08 });
      break;
    case 'select':
      // Setting an answer down on the table.
      play(b, 'select', { gain: 0.25, rate: vary(0.85, 0.03), cutoff: 3000, send: 0.15 });
      break;
    case 'pick':
      play(b, 'card', { gain: 0.45, rate: vary(0.9, 0.03), send: 0.15 });
      play(b, 'select', { gain: 0.15, rate: 0.7, cutoff: 1500, send: 0.15, at: 0.03 });
      break;
    case 'turn':
      play(b, 'page', { gain: 0.3, rate: vary(0.9, 0.03), cutoff: 5000, send: 0.2 });
      break;
    case 'yourTurn':
      play(b, 'blade', { gain: 0.3, rate: 0.9, cutoff: 6000, send: 0.3 });
      play(b, 'bell', { at: 0.12, gain: 0.07, rate: 0.5, cutoff: 1800, send: 0.5 });
      break;
    case 'reveal':
      // A low, distant resonance as the unidentified item appears.
      play(b, 'bell', { gain: 0.08, rate: 0.35, cutoff: 900, send: 0.6 });
      break;
    case 'correct':
      // Loot hitting the floor.
      play(b, 'coins', { gain: 0.4, rate: vary(0.95, 0.03), cutoff: 7000, send: 0.3 });
      play(b, 'bell', { gain: 0.1, rate: 0.75, cutoff: 3000, send: 0.5 });
      break;
    case 'wrong':
      play(b, 'thud', { gain: 0.45, rate: 0.7, cutoff: 900, send: 0.3 });
      play(b, 'clash', { at: 0.02, gain: 0.08, rate: 0.45, cutoff: 1200, send: 0.5 });
      break;
    case 'join':
      // Someone comes in.
      play(b, 'door-open', { gain: 0.25, rate: 0.9, cutoff: 4000, send: 0.35 });
      break;
    case 'start':
      // The gate shuts behind you and a bell tolls: the hunt begins.
      play(b, 'door-close', { gain: 0.28, rate: 0.8, cutoff: 2500, send: 0.45 });
      play(b, 'bell', { at: 0.25, gain: 0.18, rate: 0.5, cutoff: 2000, send: 0.6 });
      break;
    case 'victory':
      play(b, 'bell', { gain: 0.3, rate: 0.6, cutoff: 3000, send: 0.6, pan: -0.15 });
      play(b, 'coins', { at: 0.15, gain: 0.4, send: 0.35, pan: 0.2 });
      play(b, 'bell', { at: 0.45, gain: 0.16, rate: 0.9, cutoff: 4000, send: 0.6, pan: 0.15 });
      play(b, 'coins-small', { at: 0.7, gain: 0.3, rate: 0.9, send: 0.4, pan: -0.25 });
      break;
    case 'defeat':
      // One low toll.
      play(b, 'bell', { gain: 0.3, rate: 0.42, cutoff: 1200, send: 0.7 });
      break;
    case 'tick':
      // A heartbeat, as the timer runs out.
      play(b, 'heartbeat', { gain: 0.3, rate: 0.75, cutoff: 400, send: 0.1 });
      break;
    case 'deathmatch':
      // Steel drawn, a blow, and a deep bell.
      play(b, 'blade', { gain: 0.3, rate: 0.8, cutoff: 6000, send: 0.35 });
      play(b, 'clash', { at: 0.35, gain: 0.3, rate: 0.6, cutoff: 3000, send: 0.5 });
      play(b, 'thud', { at: 0.37, gain: 0.4, rate: 0.55, cutoff: 700, send: 0.4 });
      play(b, 'bell', { at: 0.6, gain: 0.3, rate: 0.38, cutoff: 1500, send: 0.7 });
      break;
  }
}

const HOVERABLE = 'button:not(:disabled), a[href], select:not(:disabled), input[type="checkbox"]:not(:disabled)';

/**
 * UI sounds for every control: a faint brush when the mouse moves onto one,
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
  // Load the samples with the first interaction, so they're ready by the first sound.
  const warm = () => {
    if (!muted) audio();
  };
  addEventListener('pointerdown', warm, { once: true, capture: true });
  addEventListener('keydown', warm, { once: true, capture: true });
}
