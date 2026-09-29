// Sound effects: one short CC0 recording per moment (see public/sfx/CREDITS.txt),
// played through a generated stone-hall reverb. The files are trimmed and
// loudness-matched; the volume, pitch and echo below were picked by ear.

export type Sfx =
  | 'hover'
  | 'click'
  | 'yourTurn'
  | 'turn'
  | 'pick'
  | 'reveal'
  | 'select'
  | 'correct'
  | 'wrong'
  | 'tick'
  | 'join'
  | 'start'
  | 'deathmatch'
  | 'victory'
  | 'defeat';

type Voice = {
  file: string;
  /** Volume in dB. */
  gain: number;
  /** Playback speed: below 1 is lower and slower. */
  rate: number;
  /** Reverb send, 0..1. */
  echo: number;
};

const VOICES: Record<Sfx, Voice> = {
  hover: { file: 'hover', gain: -35, rate: 1.5, echo: 0.25 },
  click: { file: 'click', gain: -19, rate: 0.89, echo: 0.3 },
  yourTurn: { file: 'your-turn', gain: -22, rate: 1.42, echo: 0.2 },
  turn: { file: 'turn', gain: -23, rate: 0.98, echo: 0.1 },
  pick: { file: 'pick', gain: -16, rate: 1, echo: 0.15 },
  reveal: { file: 'reveal', gain: -16, rate: 0.84, echo: 0.25 },
  select: { file: 'select', gain: -23, rate: 1.2, echo: 0.35 },
  correct: { file: 'correct', gain: -18, rate: 1.22, echo: 0.15 },
  wrong: { file: 'wrong', gain: -20, rate: 0.86, echo: 0.25 },
  tick: { file: 'tick', gain: -14, rate: 1, echo: 0.1 },
  join: { file: 'join', gain: -27, rate: 1.07, echo: 0.45 },
  start: { file: 'start', gain: -13, rate: 0.79, echo: 0.45 },
  deathmatch: { file: 'deathmatch', gain: -13, rate: 1.01, echo: 0.45 },
  victory: { file: 'victory', gain: -20, rate: 1, echo: 0.85 },
  defeat: { file: 'defeat', gain: -13, rate: 0.86, echo: 0.65 },
};

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
const buffers = new Map<string, AudioBuffer>();

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
    master.gain.value = 0.9;
    master.connect(comp).connect(ac.destination);

    const reverb = ac.createConvolver();
    reverb.buffer = hall(ac, 2.8);
    const wet = ac.createGain();
    wet.gain.value = 0.5;
    wet.connect(reverb).connect(master);

    bus = { ac, dry: master, wet };
    for (const { file } of Object.values(VOICES)) {
      fetch(new URL(`${import.meta.env.BASE_URL}sfx/${file}.mp3`, document.baseURI))
        .then((r) => r.arrayBuffer())
        .then((data) => ac.decodeAudioData(data))
        .then((buf) => buffers.set(file, buf))
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

let lastHover = -1;

export function sfx(name: Sfx) {
  if (muted) return;
  if (name === 'hover') {
    // Sweeping across a row of buttons shouldn't turn into a rattle.
    const now = performance.now();
    if (now - lastHover < 70) return;
    lastHover = now;
  }
  const b = audio();
  const v = VOICES[name];
  const buf = buffers.get(v.file);
  if (!b || !buf) return;
  const { ac } = b;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = v.rate;
  const g = ac.createGain();
  g.gain.value = Math.pow(10, v.gain / 20);
  src.connect(g).connect(b.dry);
  const send = ac.createGain();
  send.gain.value = v.echo;
  g.connect(send).connect(b.wet);
  src.start();
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
  // Load the sounds with the first interaction, so they're ready by the first one that plays.
  const warm = () => {
    if (!muted) audio();
  };
  addEventListener('pointerdown', warm, { once: true, capture: true });
  addEventListener('keydown', warm, { once: true, capture: true });
}
