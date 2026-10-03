// Builds public/sfx/burn.mp3, a patch of veiled art fizzling into being: a
// soft breath of noise that rises as the magic spreads, a glitter of tiny
// high pings while its grains glint in, crackles cut from the fire ambience
// (amb-6) as sparks fly off it, a faint bell-like shimmer swelling under it
// and a low warmth beneath. Synthesised here so it can follow the effect's
// timing. Needs ffmpeg. Run: node scripts/make-burn.mjs
import { execFileSync } from 'node:child_process';

const RATE = 44100;
const LENGTH = 1.5;
const out = 'public/sfx/burn.mp3';
const N = Math.ceil(RATE * LENGTH);
const mix = new Float32Array(N);

// Seeded, so the file only changes when this script does.
let seed = 11;
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rand = (a, b) => a + random() * (b - a);

/** A smooth swell: up over `rise` seconds from `at`, held, then down to nothing by `end`. */
const swell = (t, at, rise, hold, end) => {
  if (t < at || t > end) return 0;
  if (t < at + rise) return Math.sin(((t - at) / rise) * (Math.PI / 2)) ** 2;
  if (t < hold) return 1;
  return Math.cos(((t - hold) / (end - hold)) * (Math.PI / 2)) ** 2;
};

// The breath: white noise through a band-pass whose centre rises from 500 Hz
// to 2.4 kHz as the magic spreads (RBJ biquad, retuned every 32 samples).
{
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let b0 = 0;
  let b2 = 0;
  let a1 = 0;
  let a2 = 0;
  for (let i = 0; i < N; i++) {
    const t = i / RATE;
    if (i % 32 === 0) {
      const f = 500 * Math.pow(2400 / 500, Math.min(1, t / 0.8));
      const w = (2 * Math.PI * f) / RATE;
      const alpha = Math.sin(w) / (2 * 1.1);
      const a0 = 1 + alpha;
      b0 = alpha / a0;
      b2 = -alpha / a0;
      a1 = (-2 * Math.cos(w)) / a0;
      a2 = (1 - alpha) / a0;
    }
    const x = random() * 2 - 1;
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    mix[i] += y * 0.32 * swell(t, 0, 0.22, 0.55, 1.3);
  }
}

// The glitter: tiny high pings, densest while the grains glint in.
for (let k = 0; k < 120; k++) {
  // Onsets bunched around 0.2 to 0.8 s (the sum of three uniforms is roughly bell-shaped).
  const at = Math.max(0.02, Math.min(1.2, ((random() + random() + random()) / 3) * 1.1));
  const f = rand(3000, 9000);
  const chirp = rand(-0.25, 0.05);
  const decay = rand(0.005, 0.016);
  const gain = rand(0.04, 0.16) * swell(at, 0, 0.2, 0.7, 1.25);
  const phase = rand(0, Math.PI * 2);
  const o = Math.round(at * RATE);
  const n = Math.round(decay * 7 * RATE);
  for (let i = 0; i < n && o + i < N; i++) {
    const t = i / RATE;
    const inst = f * (1 + chirp * Math.min(1, t / 0.05));
    mix[o + i] += Math.sin(phase + 2 * Math.PI * inst * t) * gain * Math.exp(-t / decay) * Math.min(1, i / 20);
  }
}

// The crackles: single crackles out of the fire ambience, pitched up.
{
  const decode = (af) => {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', 'public/sfx/amb-6.mp3', '-af', af, '-ac', '1', '-ar', `${RATE}`, '-f', 'f32le', '-'], {
      maxBuffer: 1e9,
    });
    return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
  };
  const fire = decode('highpass=f=900');
  const sizzle = decode('highpass=f=3500,highpass=f=3500');
  const W = 88;
  const env = [];
  for (let i = 0; i + W < sizzle.length; i += W) {
    let s = 0;
    for (let j = 0; j < W; j++) s += sizzle[i + j] ** 2;
    env.push(Math.sqrt(s / W));
  }
  const peaks = [];
  for (let k = 12; k < env.length - 12; k++) {
    const around = env.slice(k - 12, k + 12).sort((a, b) => a - b)[12];
    if (env[k] > 5 * around && env[k] >= env[k - 1] && env[k] >= env[k + 1]) peaks.push({ at: k * W, level: env[k] });
  }
  peaks.sort((a, b) => b.level - a.level);
  const picked = [];
  for (const p of peaks) {
    if (picked.every((q) => Math.abs(q.at - p.at) > RATE * 0.05)) picked.push(p);
    if (picked.length === 12) break;
  }
  picked.forEach((p, idx) => {
    const t0 = 0.08 + (idx / picked.length) * 0.85 + rand(-0.03, 0.03);
    const rate = rand(1.3, 2.1);
    const gain = rand(0.25, 0.55) * (0.5 + 0.5 * swell(t0, 0, 0.15, 0.7, 1.2));
    const start = Math.max(0, p.at - Math.round(RATE * 0.003));
    const g = new Float32Array(Math.floor((RATE * 0.05) / rate));
    for (let i = 0; i < g.length; i++) {
      const pos = start + i * rate;
      const a = Math.floor(pos);
      g[i] = (fire[a] + (fire[a + 1] - fire[a]) * (pos - a)) * Math.min(1, i / (RATE * 0.0008)) * Math.exp(-i / (RATE * 0.01));
    }
    const peak = g.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
    const o = Math.round(t0 * RATE);
    for (let i = 0; i < g.length && o + i < N; i++) mix[o + i] += (g[i] / peak) * gain;
  });
}

// The shimmer: a bell-like chord (inharmonic partials over C6) swelling in
// as the magic gathers, with a slow vibrato, fading as it settles.
{
  const partials = [
    [1046.5, 0.05],
    [2103, 0.03],
    [2889, 0.022],
    [4259, 0.012],
  ];
  for (const [f, gain] of partials) {
    const phase = rand(0, Math.PI * 2);
    for (let i = 0; i < N; i++) {
      const t = i / RATE;
      const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t);
      mix[i] += Math.sin(phase + 2 * Math.PI * f * vib * t) * gain * swell(t, 0.05, 0.4, 0.55, 1.45);
    }
  }
}

// The warmth: a low tone rising a little, under the whole thing.
{
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / RATE;
    const f = 130 + 50 * Math.min(1, t / 0.6);
    ph += (2 * Math.PI * f) / RATE;
    mix[i] += (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * 0.09 * swell(t, 0, 0.18, 0.5, 1.2);
  }
}

// Short fades at both ends, then normalised and encoded.
for (let i = 0; i < 220; i++) {
  mix[i] *= i / 220;
  mix[N - 1 - i] *= i / 220;
}
const peak = mix.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
for (let i = 0; i < N; i++) mix[i] *= 0.9 / peak;
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', `${RATE}`, '-ac', '1', '-i', '-', '-b:a', '96k', out], {
  input: Buffer.from(mix.buffer),
});
console.log(`${out}: ${LENGTH} s`);
