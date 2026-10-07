// Builds public/sfx/fill-sparks.mp3, the sparks of a point landing on the
// scoreboard bar: single crackles cut out of a fire recording, pitched up and
// scattered across 0.6 s (FILL_SPAN), over a faint sizzle from the same fire.
// The fire was the game's old ambience, amb-6.mp3 (felix.blume's "Wood fire
// crackling near flames", see public/sfx/CREDITS.txt), no longer shipped:
// it is still in the history (git log -- public/sfx/amb-6.mp3).
// Needs ffmpeg. Run: node scripts/make-sparks.mjs path/to/amb-6.mp3
import { execFileSync } from 'node:child_process';

const RATE = 44100;
const SPAN = 0.6;
const GRAINS = 18;
const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/make-sparks.mjs path/to/amb-6.mp3');
  process.exit(1);
}
const out = 'public/sfx/fill-sparks.mp3';

const decode = (af) => {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', src, ...(af ? ['-af', af] : []), '-ac', '1', '-ar', `${RATE}`, '-f', 'f32le', '-'], { maxBuffer: 1e9 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
};
const fire = decode('highpass=f=700');
const sizzle = decode('highpass=f=3500,highpass=f=3500');

// Seeded, so the file only changes when this script does.
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rand = (a, b) => a + random() * (b - a);

// Crackles: 2 ms windows much louder than the 50 ms around them (high-passed, so the roar doesn't count).
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
  if (picked.length === GRAINS) break;
}

const len = Math.ceil(RATE * (SPAN + 0.15));
const mix = new Float32Array(len);

/** One crackle, `rate` times faster and higher, peaking at 1 times `gain`, starting `t` seconds in. */
function grain(at, t, rate, gain) {
  const start = Math.max(0, at - Math.round(RATE * 0.003));
  const n = Math.round(RATE * 0.05);
  const g = new Float32Array(Math.floor(n / rate));
  for (let i = 0; i < g.length; i++) {
    const pos = start + i * rate;
    const a = Math.floor(pos);
    const s = fire[a] + (fire[a + 1] - fire[a]) * (pos - a);
    const fadeIn = Math.min(1, i / (RATE * 0.0008));
    g[i] = s * fadeIn * Math.exp(-i / (RATE * 0.012));
  }
  const peak = g.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const o = Math.round(t * RATE);
  for (let i = 0; i < g.length && o + i < len; i++) mix[o + i] += (g[i] / peak) * gain;
}

picked.forEach((p, i) => {
  // Spread evenly across the span with some jitter, a touch denser and brighter as the bar fills.
  const u = i / (GRAINS - 1);
  const t = Math.max(0, Math.min(SPAN, SPAN * Math.pow(u, 0.9) + rand(-0.02, 0.02)));
  grain(p.at, t, rand(1.25, 1.9) + u * 0.2, rand(0.35, 0.8) * (0.75 + 0.25 * u));
});

// The sizzle: a stretch of the high-passed fire swelling in and out under the crackles.
const from = Math.round(RATE * 12);
for (let i = 0; i < len; i++) {
  const p = i / (RATE * SPAN);
  const shape = p < 1 ? Math.sin(Math.PI * Math.min(1, p * 1.2)) ** 0.7 : Math.max(0, 1 - (p - 1) * 4) * 0.15;
  mix[i] += sizzle[from + i] * 4 * shape;
}

const peak = mix.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
for (let i = 0; i < len; i++) mix[i] *= 0.9 / peak;
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', `${RATE}`, '-ac', '1', '-i', '-', '-b:a', '96k', out], {
  input: Buffer.from(mix.buffer),
});
console.log(`${out}: ${picked.length} crackles`);
