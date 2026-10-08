#!/usr/bin/env node
// Ranks every item's art against the rest of its group (the pool a question
// draws its options from) and writes each item's closest look-alikes to
// src/data/looks.json, for questions whose wrong pictures look like the right
// one. Needs ffmpeg (to decode the WebP art). Deterministic: the same art and
// ffmpeg give the same file.
//
// Usage: npm run looks (after npm run fetch-data)

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR = path.join(ROOT, 'public', 'items');
const ITEMS_FILE = path.join(ROOT, 'src', 'data', 'items.json');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'looks.json');

/**
 * Look-alikes kept per item: ten options need nine decoys, plus some to
 * spare so picks still vary (as many as game.ts lookalikes looks through).
 */
const KEEP = 14;
/**
 * How much each likeness counts. Shape and edges come first: deep in Delve,
 * where look-alike pictures switch on, all art is grayscale and mirrored, so
 * outline and structure are what the player compares; colour still helps the
 * player recall a decoy name's art.
 */
const WEIGHTS = { shape: 0.45, edges: 0.35, colour: 0.2 };
/** Side of the square every picture is fitted into before comparing. */
const N = 32;
/** Alpha (of 255) below which a pixel is glow or shadow, not the item: it doesn't count toward the bounds. */
const SOLID = 24;

/** Decodes a picture to straight RGBA through ffmpeg's PAM output. */
function decode(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'image2pipe', '-c:v', 'pam', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1e8 });
  const end = buf.indexOf('ENDHDR\n');
  const head = Object.fromEntries(buf.toString('latin1', 0, end).trim().split('\n').map((l) => l.split(' ')));
  return { w: +head.WIDTH, h: +head.HEIGHT, px: buf.subarray(end + 7) };
}

/**
 * The picture trimmed to the item and fitted, centred, into an N x N square,
 * keeping its aspect (a long sword stays long), as premultiplied RGBA in
 * [0, 1]. Trimming makes art drawn on different inventory sizes (1x1, 2x3…)
 * comparable. `flip` mirrors it.
 */
function fit({ w, h, px }, flip) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > SOLID) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) [x0, y0, x1, y1] = [0, 0, w - 1, h - 1];
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.max(bw, bh);
  const ox = Math.floor((side - bw) / 2), oy = Math.floor((side - bh) / 2);
  const out = new Float64Array(N * N * 4);
  const count = new Float64Array(N * N);
  // Box filter: each cell averages the source pixels that fall in it, the padding as transparent.
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const c = Math.floor((y * N) / side) * N + Math.floor((x * N) / side);
      count[c]++;
      const sx = x - ox, sy = y - oy;
      if (sx < 0 || sy < 0 || sx >= bw || sy >= bh) continue;
      const p = ((y0 + sy) * w + (flip ? x1 - sx : x0 + sx)) * 4;
      const a = px[p + 3] / 255;
      for (let k = 0; k < 3; k++) out[c * 4 + k] += (px[p + k] / 255) * a;
      out[c * 4 + 3] += a;
    }
  for (let c = 0; c < N * N; c++) for (let k = 0; k < 4; k++) out[c * 4 + k] /= count[c] || 1;
  return out;
}

/** Averages an N x N map of `ch` channels down to n x n. */
function shrink(map, ch, n) {
  const f = N / n;
  const out = new Float64Array(n * n * ch);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      for (let k = 0; k < ch; k++) out[(Math.floor(y / f) * n + Math.floor(x / f)) * ch + k] += map[(y * N + x) * ch + k] / (f * f);
  return out;
}

/**
 * Edge directions on the luminance over black, as a 4 x 4 grid of 8-bin
 * gradient histograms (unit length). Grayscale doesn't change it, and the
 * silhouette's own outline counts as an edge too.
 */
function edges(lum) {
  const BINS = 8, CELLS = 4;
  const hist = new Float64Array(CELLS * CELLS * BINS);
  const at = (x, y) => lum[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const m = Math.hypot(gx, gy);
      if (!m) continue;
      const angle = (Math.atan2(gy, gx) + Math.PI) % Math.PI; // unsigned: a light-on-dark edge matches a dark-on-light one
      const bin = Math.min(BINS - 1, Math.floor((angle / Math.PI) * BINS));
      hist[(Math.floor((y * CELLS) / N) * CELLS + Math.floor((x * CELLS) / N)) * BINS + bin] += m;
    }
  const len = Math.hypot(...hist) || 1;
  return hist.map((v) => v / len);
}

function features(img, flip) {
  const sq = fit(img, flip);
  const alpha = new Float64Array(N * N), lum = new Float64Array(N * N), rgb = new Float64Array(N * N * 3);
  for (let c = 0; c < N * N; c++) {
    alpha[c] = sq[c * 4 + 3];
    lum[c] = 0.299 * sq[c * 4] + 0.587 * sq[c * 4 + 1] + 0.114 * sq[c * 4 + 2];
    for (let k = 0; k < 3; k++) rgb[c * 3 + k] = sq[c * 4 + k];
  }
  // Coarse grids, so a slightly different pose or crop still overlaps.
  return { mask: shrink(alpha, 1, 16), edges: edges(lum), colour: shrink(rgb, 3, 8) };
}

/** Soft intersection over union of two coverage masks. */
function overlap(a, b) {
  let both = 0, either = 0;
  for (let i = 0; i < a.length; i++) {
    both += Math.min(a[i], b[i]);
    either += Math.max(a[i], b[i]);
  }
  return either ? both / either : 1;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** 1 for the same colour layout, 0 from an RMS distance of half the range on. */
function colourLikeness(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.max(0, 1 - 2 * Math.sqrt(s / a.length));
}

const likeness = (a, b) =>
  WEIGHTS.shape * overlap(a.mask, b.mask) + WEIGHTS.edges * dot(a.edges, b.edges) + WEIGHTS.colour * colourLikeness(a.colour, b.colour);

/**
 * In [0, 1]. Mirror-blind: options flip on their own rolls, and a decoy that
 * is the answer's mirror image fools the eye as well as one drawn the same way.
 * Every pairing counts, so the score is the same either way round (the
 * pixel grid makes a flipped fit differ slightly from a flipped picture).
 */
const similarity = (a, b) =>
  Math.max(likeness(a.plain, b.plain), likeness(a.plain, b.mirrored), likeness(a.mirrored, b.plain), likeness(a.mirrored, b.mirrored));

function main() {
  const items = JSON.parse(readFileSync(ITEMS_FILE, 'utf8'));
  const feats = new Map();
  for (const it of items) {
    const img = decode(path.join(IMG_DIR, `${it.id}.webp`));
    feats.set(it.id, { plain: features(img, false), mirrored: features(img, true) });
  }

  const looks = {};
  for (const it of items) {
    looks[it.id] = items
      .filter((o) => o !== it && o.group === it.group)
      .map((o) => ({ id: o.id, score: similarity(feats.get(it.id), feats.get(o.id)) }))
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
      .slice(0, KEEP)
      .map(({ id, score }) => [id, Math.round(score * 100) / 100]);
  }

  // One item per line keeps diffs readable when the art changes.
  const lines = items.map((it) => `  ${JSON.stringify(it.id)}: ${JSON.stringify(looks[it.id])}`);
  const json = `{\n "v": 1,\n "looks": {\n${lines.join(',\n')}\n }\n}\n`;
  writeFileSync(OUT_FILE, json);
  console.log(`${items.length} items, ${(json.length / 1024).toFixed(1)} KiB written to ${path.relative(ROOT, OUT_FILE)}`);
}

main();
