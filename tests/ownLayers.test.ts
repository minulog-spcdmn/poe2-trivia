// What Chrome draws again on every frame of an animation, read from the CSS
// (docs/qa.md, “Redraws”): an animation of anything but its transform or
// opacity (a filter, a custom property, a colour, a shadow, a stroke) runs on
// the page's thread, and each frame it draws again the layer it's painted
// on, which may be a whole card face or the whole page. On an element with
// a layer of its own (will-change), that layer is only as big as the
// element. The emblems' kindle and the way out's lamp each drew a sharp
// card face again every frame (rule 7 in docs/category-cards.md); this
// widens that rule to every component. What may animate so without a layer
// of its own, and why, is src/qa/redraws.ts' PAINTED. The sweep's redraw
// check (scripts/sweep.mjs --redraws) measures what this can only guess.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { PAINTED } from '../src/qa/redraws.ts';

const root = join(import.meta.dirname, '..');

/** Every stylesheet of the game's: its .css files and its components' <style>s, by path. */
function sheets(): { file: string; css: postcss.Root }[] {
  const out: { file: string; css: postcss.Root }[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(svelte|css)$/.test(e.name)) {
        const src = readFileSync(p, 'utf8');
        const style = e.name.endsWith('.css') ? src : /<style[^>]*>([\s\S]*?)<\/style>/.exec(src)?.[1];
        if (style) out.push({ file: relative(root, p).replaceAll('\\', '/'), css: postcss.parse(style) });
      }
    }
  };
  walk(join(root, 'src'));
  return out;
}

/** What the compositor animates by itself, and what changes only in steps (drawn again once a step, not every frame). */
const NOT_PAINTED = new Set(['transform', 'translate', 'rotate', 'scale', 'opacity', 'animation-timing-function', 'visibility', 'display', 'pointer-events', 'z-index', 'content']);
/** will-change values that give an element a layer of its own. */
const LAYER = /\b(transform|translate|rotate|scale|opacity|filter)\b/;

const unwrap = (s: string) => s.replace(/:global\(((?:[^()]|\([^()]*\))*)\)/g, '$1');
type Target = { tag: string; classes: string[]; pseudo: string };
/** The elements a selector styles: its last compound's (or each of a last :is()'s) tag, classes and pseudo-element. */
const targets = (selector: string): Target[] => {
  const u = unwrap(selector).trim();
  const is = /:is\(([^()]*)\)$/.exec(u);
  return (is ? is[1]!.split(',') : [u.split(/[\s>+~]+/).pop()!]).map((part) => {
    const p = part.trim();
    return { tag: /^[a-z][\w-]*/.exec(p)?.[0] ?? '', classes: [...p.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!), pseudo: /::[\w-]+/.exec(p)?.[0] ?? '' };
  });
};
/** Whether `layer` (a will-change rule's target) is on every element `t` is: the same pseudo-element and tag, and no class `t` lacks. */
const covers = (layer: Target, t: Target) => layer.pseudo === t.pseudo && (!layer.tag || layer.tag === t.tag) && (layer.classes.length > 0 || layer.tag !== '') && layer.classes.every((c) => t.classes.includes(c));

/** Every animation of what's painted, and whether its element has a layer of its own. */
function painted() {
  const all = sheets();
  const keyframes = (css: postcss.Root) => {
    const out = new Map<string, string[]>();
    css.walkAtRules(/keyframes$/, (k) => {
      const props = new Set<string>();
      k.walkDecls((d) => void props.add(d.prop));
      out.set(k.params.replace(/^-global-/, ''), [...props].filter((p) => !NOT_PAINTED.has(p)));
    });
    return out;
  };
  // Keyframes are a component's own, else app.css's (or a component's -global- ones).
  const global = new Map<string, string[]>();
  for (const { file, css } of all) for (const [name, props] of keyframes(css)) if (file === 'src/app.css' || css.toString().includes(`-global-${name}`)) global.set(name, props);
  const found: { file: string; keyframes: string; props: string[]; selector: string; value: string; layered: boolean }[] = [];
  for (const { file, css } of all) {
    const own = keyframes(css);
    const layers: Target[] = [];
    css.walkDecls('will-change', (d) => {
      if (LAYER.test(d.value) && d.parent?.type === 'rule') for (const s of (d.parent as Rule).selectors) layers.push(...targets(s));
    });
    css.walkDecls(/^animation(-name)?$/, (d) => {
      if (d.parent?.type !== 'rule') return;
      const rule = d.parent as Rule;
      for (const name of d.value.split(/[\s,]+/)) {
        const props = own.get(name) ?? global.get(name);
        if (!props?.length) continue;
        const layered = rule.selectors.flatMap(targets).every((t) => layers.some((l) => covers(l, t)));
        found.push({ file, keyframes: name, props, selector: rule.selector.replace(/\s+/g, ' '), value: d.value, layered });
      }
    });
  }
  return found;
}

const found = painted();

test('the animations of what is painted are found', () => {
  // (The emblems' kindle and the timer's lamp, at least.)
  assert.ok(found.some((f) => f.file === 'src/components/ChooseCategory.svelte' && f.keyframes === 'kindle'), 'found the kindle');
  assert.ok(found.some((f) => f.file === 'src/components/TimerRing.svelte' && f.keyframes === 'lamp'), 'found the timer’s lamp');
  assert.ok(found.filter((f) => f.layered).length >= 5, 'found the ones with a layer of their own');
});

test('what animates anything but its transform or opacity has a layer of its own, or a reason', () => {
  const allowed = (f: (typeof found)[number]) => PAINTED.some((p) => p.file === f.file && p.keyframes.includes(f.keyframes));
  const missing = found.filter((f) => !f.layered && !allowed(f));
  assert.deepEqual(
    missing.map((f) => `${f.file}: @keyframes ${f.keyframes} animates ${f.props.join(', ')} on ${f.selector} (animation: ${f.value})`),
    [],
    'Chrome draws the layer under each of these again on every frame it runs. Give the element will-change (transform, opacity or filter, whichever fits) so it has a layer of its own, or add it to PAINTED in src/qa/redraws.ts with what the redraw check measured (npm run sweep -- --redraws --only <scene>)',
  );
});

test('PAINTED names only animations still there and still without a layer of their own', () => {
  for (const p of PAINTED)
    for (const k of p.keyframes) {
      const here = found.filter((f) => f.file === p.file && f.keyframes === k);
      assert.ok(here.length, `PAINTED names ${p.file}'s @keyframes ${k}, which no longer animates anything painted there: take it out`);
      assert.ok(
        here.some((f) => !f.layered),
        `${p.file}'s @keyframes ${k} now has a layer of its own wherever it runs: take it out of PAINTED`,
      );
    }
});
