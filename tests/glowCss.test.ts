import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glowDecls, splitShadows } from '../src/lib/glowCss.ts';

test('a text glow moves into --text-glow, the crisp shadow stays', () => {
  assert.deepEqual(glowDecls('text-shadow', '0 1px 2px rgba(0, 0, 0, 0.7), 0 0 12px rgba(241, 217, 155, 0.55)'), [
    { prop: '--text-glow', value: '0 0 12px rgba(241, 217, 155, 0.55)' },
    { prop: 'text-shadow', value: '0 1px 2px rgba(0, 0, 0, 0.7), var(--text-glow-paint, 0 0 12px rgba(241, 217, 155, 0.55))' },
  ]);
});

test('a text shadow with nothing soft only clears --text-glow', () => {
  assert.deepEqual(glowDecls('text-shadow', 'none'), [
    { prop: '--text-glow', value: 'none' },
    { prop: 'text-shadow', value: 'none' },
  ]);
  assert.deepEqual(glowDecls('text-shadow', '0 1px 2px #000'), [
    { prop: '--text-glow', value: 'none' },
    { prop: 'text-shadow', value: '0 1px 2px #000' },
  ]);
});

test('a glow whose colour is a variable is still a glow; one whose blur is a variable stays with CSS', () => {
  assert.equal(glowDecls('text-shadow', '0 0 12px var(--glow)')![0].value, '0 0 12px var(--glow)');
  assert.equal(glowDecls('text-shadow', '0 0 10px color-mix(in srgb, var(--accent) 35%, transparent)')![0].value, '0 0 10px color-mix(in srgb, var(--accent) 35%, transparent)');
  const kept = glowDecls('box-shadow', 'var(--bs-soft-paint, 0 var(--bs1) var(--bs1-color))')!;
  assert.deepEqual(kept.slice(0, 2).map((d) => d.value), ['none', 'none']);
  assert.equal(kept[2].value, 'var(--bs-soft-paint, 0 var(--bs1) var(--bs1-color))');
});

test('box shadows: crisp inset, soft inset, crisp outer, soft outer', () => {
  const v = 'inset 0 1px 0 rgba(255, 230, 170, 0.18), inset 0 -10px 16px -8px rgba(0, 0, 0, 0.55), 0 0 0 1px red, 0 2px 10px rgba(0, 0, 0, 0.5)';
  assert.deepEqual(glowDecls('box-shadow', v), [
    { prop: '--box-glow-in', value: 'inset 0 -10px 16px -8px rgba(0, 0, 0, 0.55)' },
    { prop: '--box-glow-out', value: '0 2px 10px rgba(0, 0, 0, 0.5)' },
    {
      prop: 'box-shadow',
      value: 'inset 0 1px 0 rgba(255, 230, 170, 0.18), var(--box-glow-in-paint, inset 0 -10px 16px -8px rgba(0, 0, 0, 0.55)), 0 0 0 1px red, var(--box-glow-out-paint, 0 2px 10px rgba(0, 0, 0, 0.5))',
    },
  ]);
});

test('already rewritten values are left alone, and lists split at top-level commas only', () => {
  assert.equal(glowDecls('text-shadow', 'var(--text-glow-paint, 0 0 9px red)'), null);
  assert.deepEqual(splitShadows('0 0 4px rgba(1, 2, 3, 0.5), 1px 1px color(srgb 1 0 0 / 0.5)'), ['0 0 4px rgba(1, 2, 3, 0.5)', '1px 1px color(srgb 1 0 0 / 0.5)']);
});
