// Delve's dynamite blows a question into parts (lib/blastParts.ts, measure):
// its children, and those of anything big or a list of three or more. A
// tooltip holds its verdict's rims (QuestionView), the size of it and hidden
// until the verdict, which a blast never waits for: they are no parts and
// don't make the plate and the art a list, so the tooltip flies whole where
// it covers half the question or less, and is still the part that cracks.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { at, measure } = await import('../src/lib/blastParts.ts');

type Fake = { name: string; children: Fake[]; hidden: boolean; getBoundingClientRect: () => DOMRect };
/** An element laid out at x, y, w by h (on screen, unzoomed), with its children. */
const el = (name: string, [x, y, w, h]: number[], children: Fake[] = [], hidden = false): Fake => ({
  name,
  children,
  hidden,
  getBoundingClientRect: () => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }) as DOMRect,
});
(globalThis as { getComputedStyle?: unknown }).getComputedStyle = (e: Fake) => ({ visibility: e.hidden ? 'hidden' : 'visible', display: 'block' });

/** A tooltip at `box`: its two rims (hidden, before the verdict), then its plate and its art. */
const tooltip = ([x, y, w, h]: number[]) =>
  el('tooltip', [x, y, w, h], [el('rim good', [x - 1, y - 1, w + 2, h + 2], [], true), el('rim bad', [x - 1, y - 1, w + 2, h + 2], [], true), el('head', [x, y, w, 90]), el('art', [x, y + 90, w, h - 90])]);

/** What `measure` makes of `question`: each part and hollow element by name, and the biggest part's. */
function blown(question: Fake) {
  const root = question as unknown as Element;
  const r = question.getBoundingClientRect();
  const { parts, hollow } = measure(root, r.width * r.height, 1);
  const name = (path: number[]) => (at(root, path) as unknown as Fake).name;
  const big = parts.reduce((m, p) => (p.rect.width * p.rect.height > m.rect.width * m.rect.height ? p : m));
  return { parts: parts.map((p) => name(p.path)), hollow: hollow.map(name), big: name(big.path) };
}

test('a tooltip beside its answers, under half the question, flies whole and is the part that cracks', () => {
  // A name question on a desktop, or a phone on its side: the item and its answers side by side.
  const options = [0, 1, 2, 3].map((i) => el(`option ${i}`, [506, 60 + i * 132, 474, 124]));
  const question = el('question', [0, 0, 980, 700], [el('task', [0, 0, 980, 40]), el('stage', [0, 60, 980, 520], [tooltip([0, 60, 474, 520]), el('options', [506, 60, 474, 520], options)]), el('footer', [0, 600, 980, 52])]);
  const b = blown(question);
  assert.deepEqual(b.hollow, ['stage', 'options']);
  assert.deepEqual(b.parts, ['task', 'tooltip', 'option 0', 'option 1', 'option 2', 'option 3', 'footer']);
  assert.equal(b.big, 'tooltip', 'the item card is the part cracked in three where the blast strikes');
});

test('a tooltip over half the question goes hollow, its plate and art flying apart, never its hidden rims', () => {
  // A phone upright: the item over its answers, most of the question.
  const question = el('question', [0, 0, 375, 640], [el('task', [0, 0, 375, 30]), tooltip([0, 40, 375, 360]), el('options', [0, 410, 375, 120], [el('a', [0, 410, 375, 60]), el('b', [0, 470, 375, 60])]), el('footer', [0, 540, 375, 40])]);
  const b = blown(question);
  assert.deepEqual(b.hollow, ['tooltip']);
  assert.deepEqual(b.parts, ['task', 'head', 'art', 'options', 'footer'], 'the plate and the art found where they are, past the rims (at walks the children by their place)');
  assert.equal(b.big, 'art');
});

test('what a hidden element holds still flies, if it shows', () => {
  const question = el('question', [0, 0, 400, 400], [el('veil', [0, 0, 400, 100], [el('line', [0, 0, 400, 30])], true), el('rest', [0, 100, 400, 100])]);
  assert.deepEqual(blown(question).parts, ['line', 'rest']);
});
