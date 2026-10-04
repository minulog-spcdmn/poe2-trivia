import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DUTY, FULL_AT, GAP, GRAND_AT, MOTES, SHOW, auraEnvelope, auraForm, nextGap, orbitPoint } from '../src/lib/fx/orbit.ts';

// Every avatar size the game draws: race markers (18 on phones), the
// deathmatch strip, toasts, standings, the scoreboard, the lobby, the
// deathmatch intro and the victory crown.
const SIZES = [18, 22, 24, 28, 30, 32, 36, 56, 110];

test('avatars get the reduced, full or grand aura by size', () => {
  for (const s of SIZES) {
    const f = auraForm(s);
    assert.equal(f.tier, s < FULL_AT ? 'small' : s < GRAND_AT ? 'full' : 'grand', `${s}px`);
    // Only the bigger ones get embers, so small faces stay clear of what's beside them.
    assert.equal(f.embers > 0, f.tier !== 'small', `${s}px embers`);
    assert.ok(f.motes >= 1 && f.motes <= MOTES.length, `${s}px motes`);
  }
});

test('the orbit clears the avatar', () => {
  for (const s of SIZES) {
    const f = auraForm(s);
    assert.ok(f.disc > s / 2, `${s}px: the disc covers the avatar and its ring`);
    assert.ok(f.radius > f.disc + 4, `${s}px: the orbit is outside the avatar`);
  }
});

test('the near side of the orbit is the lower half, and passes in front of the avatar below its letter', () => {
  const f = auraForm(36);
  const front = orbitPoint(f, (3 * Math.PI) / 2);
  const back = orbitPoint(f, Math.PI / 2);
  assert.equal(front.depth, 1);
  assert.equal(back.depth, -1);
  assert.ok(front.y > 0 && back.y < 0);
  // The roll raises the orbit's right end.
  assert.ok(orbitPoint(f, 0).y < 0 && orbitPoint(f, Math.PI).y > 0);
  for (const s of SIZES) {
    const g = auraForm(s);
    // Where the near side crosses the avatar's middle: below the letter (half of Cinzel's cap height).
    let best = { x: Infinity, y: 0 };
    for (let a = Math.PI; a <= 2 * Math.PI; a += 0.0005) {
      const p = orbitPoint(g, a);
      if (Math.abs(p.x) < Math.abs(best.x)) best = p;
    }
    assert.ok(best.y > 0.7 * 0.45 * s * 0.5, `${s}px: the near side crosses at ${best.y.toFixed(1)}px`);
  }
});

test('the far side passes behind the avatar and comes out at its sides', () => {
  for (const s of SIZES) {
    const f = auraForm(s);
    const hidden = (a: number) => {
      const p = orbitPoint(f, a);
      return p.depth < 0 && Math.hypot(p.x, p.y) < f.disc;
    };
    assert.ok(hidden(Math.PI / 2), `${s}px: hidden at the top of the far side`);
    assert.ok(!hidden(0) && !hidden(Math.PI), `${s}px: seen at the ends`);
    assert.ok(!hidden((3 * Math.PI) / 2), `${s}px: seen in front`);
  }
});

test('orbit points scale with the size the avatar is drawn at', () => {
  const f = auraForm(32);
  const a = orbitPoint(f, 1.1);
  const b = orbitPoint(f, 1.1, 0.5);
  assert.ok(Math.abs(b.x - a.x / 2) < 1e-9 && Math.abs(b.y - a.y / 2) < 1e-9);
});

test('the motes move calmly enough for phones to draw them at 30fps', () => {
  for (const s of SIZES) {
    const f = auraForm(s);
    assert.ok(f.radius * f.speed < 90, `${s}px: ${(f.radius * f.speed).toFixed(0)}px/s`);
  }
});

test('the shader places the motes as MOTES does', () => {
  const src = readFileSync(join(import.meta.dirname, '../src/lib/fx/renderer.ts'), 'utf8');
  const floats = (name: string) => src.match(new RegExp(`const float ${name}\\[3\\] = float\\[3\\]\\(([^)]*)\\)`))?.[1].split(',').map(Number);
  assert.deepEqual(floats('LAG'), MOTES.map((m) => m.lag));
  assert.deepEqual(floats('SIZE'), MOTES.map((m) => m.size));
});

test('a showing fades in, holds and fades out', () => {
  assert.equal(auraEnvelope(0), 0);
  assert.equal(auraEnvelope(SHOW.life), 0);
  assert.equal(auraEnvelope(SHOW.life / 2), 1);
  let last = -1;
  for (let t = 0; t <= SHOW.fadeIn; t += 0.05) {
    const k = auraEnvelope(t);
    assert.ok(k >= last && k >= 0 && k <= 1);
    last = k;
  }
  // A shorter one (an avatar that joins late) still fades both ways.
  assert.equal(auraEnvelope(0, 4), 0);
  assert.equal(auraEnvelope(4, 4), 0);
  assert.ok(auraEnvelope(2, 4) > 0.9);
});

test('showings come in turns with a short breath between, when the effects loop can sleep', () => {
  assert.equal(nextGap(0), GAP[0]);
  assert.equal(nextGap(1), GAP[1]);
  for (let i = 0; i < 100; i++) {
    const g = nextGap();
    assert.ok(g >= GAP[0] && g <= GAP[1]);
  }
  assert.ok(DUTY > 0.7 && DUTY < 0.9, `out ${(DUTY * 100).toFixed(0)}% of the time`);
});
