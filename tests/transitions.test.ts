// Svelte's transitions with their styles read together (lib/transitions.ts):
// the same transitions as Svelte's own, made once the flush is done, the
// styles of all waiting read one after another, never between writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './asVite.ts';

/** The computed style each fake element has, and the reads made of them, in order. */
const styles = new Map<object, Record<string, string>>();
const reads: object[] = [];
(globalThis as { getComputedStyle?: unknown }).getComputedStyle = (node: object) => {
  reads.push(node);
  return styles.get(node) ?? {};
};
const el = (style: Record<string, string>) => {
  const node = {};
  styles.set(node, style);
  return node as Element;
};

const own = await import('svelte/transition');
const batched = await import('../src/lib/transitions.ts');

/** A config's frames as Svelte would lay them down, to tell two apart. */
const frames = (c: { css?: (t: number, u: number) => string; delay?: number; duration?: number; easing?: (t: number) => number }) => ({
  delay: c.delay,
  duration: c.duration,
  eased: [0, 0.3, 1].map((t) => c.easing?.(t)),
  css: [0, 0.25, 0.5, 1].map((t) => c.css?.(t, 1 - t).replace(/\s+/g, ' ').trim()),
});

test('the same transitions as Svelte makes, as each element stands', () => {
  const a = el({ opacity: '0.5', transform: 'none' });
  const b = el({ opacity: '1', transform: 'matrix(1, 0, 0, 1, 4, 0)' });
  const cases = [
    [batched.fade(a, { duration: 200, delay: 120 }), own.fade(a, { duration: 200, delay: 120 })],
    [batched.fly(b, { y: 10, duration: 400, delay: 250 }), own.fly(b, { y: 10, duration: 400, delay: 250 })],
    [batched.scale(a, { start: 0.85, duration: 450 }), own.scale(a, { start: 0.85, duration: 450 })],
    [batched.fly(a, { x: 40 }), own.fly(a, { x: 40 })],
  ] as const;
  for (const [made, svelte] of cases) assert.deepEqual(frames(made()), frames(svelte));
});

test("a flush's transitions read nothing as they're made, then all at once, each once", async () => {
  const nodes = [el({ opacity: '1' }), el({ opacity: '0.4' }), el({ opacity: '1', transform: 'none' })];
  reads.length = 0;
  const made = [batched.fade(nodes[0]), batched.fly(nodes[1], { y: 6 }), batched.scale(nodes[2])];
  assert.equal(reads.length, 0, 'nothing read as the flush makes them');
  // Svelte asks for the second first (they're asked for in the order their effects ran, not always the page's).
  const second = made[1]();
  assert.deepEqual(reads, nodes, 'the first asked for reads every one waiting, one after another');
  assert.equal(made[1](), second, 'the same config each time, so one turned round goes back from where it was');
  made[0]();
  made[2]();
  assert.equal(reads.length, 3, 'never read again');
  await Promise.resolve();
  assert.equal(reads.length, 3);
});

test('one Svelte never asks for (cut short) is read by the end of the flush, not kept waiting', async () => {
  reads.length = 0;
  batched.fade(el({ opacity: '1' }));
  await new Promise((r) => queueMicrotask(() => r(null)));
  assert.equal(reads.length, 1);
  // The next flush's start afresh.
  const later = batched.fade(el({ opacity: '0.2' }));
  assert.equal(reads.length, 1);
  assert.equal(later().css?.(1, 0), 'opacity: 0.2');
});
