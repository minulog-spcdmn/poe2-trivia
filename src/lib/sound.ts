// Tiny synthesized sound effects (no audio files to ship).

export type Sfx =
  | 'correct'
  | 'wrong'
  | 'turn'
  | 'yourTurn'
  | 'reveal'
  | 'victory'
  | 'join'
  | 'click'
  | 'tick'
  | 'deathmatch';

let ctx: AudioContext | null = null;
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

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(
  ac: AudioContext,
  freq: number,
  start: number,
  dur: number,
  { type = 'sine' as OscillatorType, gain = 0.15, slide = 0 } = {},
) {
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export function sfx(name: Sfx) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  switch (name) {
    case 'correct':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, f, i * 0.07, 0.5, { type: 'triangle', gain: 0.12 }));
      break;
    case 'wrong':
      tone(ac, 196, 0, 0.45, { type: 'sawtooth', gain: 0.06, slide: 0.6 });
      tone(ac, 98, 0, 0.5, { type: 'sine', gain: 0.18, slide: 0.7 });
      break;
    case 'turn':
      tone(ac, 392, 0, 0.25, { type: 'triangle', gain: 0.06 });
      break;
    case 'yourTurn':
      tone(ac, 392, 0, 0.2, { type: 'triangle', gain: 0.1 });
      tone(ac, 587.33, 0.12, 0.35, { type: 'triangle', gain: 0.1 });
      break;
    case 'reveal':
      tone(ac, 220, 0, 0.6, { type: 'sine', gain: 0.12, slide: 2 });
      tone(ac, 330, 0.05, 0.6, { type: 'triangle', gain: 0.05, slide: 2 });
      break;
    case 'victory':
      [392, 523.25, 659.25, 783.99, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(ac, f, i * 0.12, i === 6 ? 1.2 : 0.3, { type: 'triangle', gain: 0.1 }),
      );
      break;
    case 'join':
      tone(ac, 659.25, 0, 0.15, { type: 'sine', gain: 0.08 });
      tone(ac, 880, 0.08, 0.2, { type: 'sine', gain: 0.08 });
      break;
    case 'click':
      tone(ac, 900, 0, 0.05, { type: 'square', gain: 0.02 });
      break;
    case 'deathmatch':
      // Three war-drum hits and a low swell.
      [0, 0.28, 0.56].forEach((t, i) => tone(ac, 70 - i * 6, t, 0.35, { type: 'sine', gain: 0.35, slide: 0.5 }));
      tone(ac, 110, 0.8, 1.4, { type: 'sawtooth', gain: 0.05, slide: 0.8 });
      tone(ac, 164.8, 0.8, 1.4, { type: 'triangle', gain: 0.05, slide: 0.8 });
      break;
    case 'tick':
      tone(ac, 1200, 0, 0.04, { type: 'square', gain: 0.025 });
      break;
  }
}
