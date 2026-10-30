// The category cards' plate prints (lib/platePrint.svelte.ts,
// docs/category-cards.md, “The plates' prints”): drawn once from their svg,
// so what the svg is styled with must be what the print reads, and they're
// shown only where the faces are sharp, which Chrome rasters at their
// laid-out size, so a print is drawn pixel for pixel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss, { type Rule } from 'postcss';

const styleOf = (file: string) => {
  const source = readFileSync(file, 'utf8');
  return { source, css: postcss.parse(source.slice(source.indexOf('<style>') + '<style>'.length, source.lastIndexOf('</style>'))) };
};
const ENGRAVING = styleOf('src/components/CardEngraving.svelte');
const CHOOSE = styleOf('src/components/ChooseCategory.svelte');

/** The stroke classes (cardEngraving's Cls). */
const CLASSES = [...readFileSync('src/lib/cardEngraving.ts', 'utf8').match(/export type Cls = ([^;]+);/)![1]!.matchAll(/'(\w+)'/g)].map((m) => m[1]!);
/** What a print reads off each path (platePrint's pathsOf). */
const READ = new Set(['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity']);
/** Svgs of the engraving that aren't printed: drawn as they are. */
const UNPRINTED = /^\.(window|solid|gilt|lamp|glint|through|drawing)\b|^path\.ko$|\.(cut|part|glass|body|tint)\b|^\[data-find/;

test("every style on a printed layer's paths is one its print reads", () => {
  assert.ok(CLASSES.length >= 9, 'found the stroke classes');
  let seen = 0;
  ENGRAVING.css.walkRules((r) => {
    for (const s of r.selectors) {
      const last = s.trim().split(/\s+/).pop()!;
      const onPath = last === 'path' || CLASSES.some((c) => last === `.${c}`);
      if (!onPath || UNPRINTED.test(s.trim())) continue;
      r.walkDecls((d) => {
        seen++;
        assert.ok(READ.has(d.prop), `${s} { ${d.prop}: ${d.value} }: a plate's print is drawn from its paths' ${[...READ].join(', ')} only; teach ${d.prop} to pathsOf and the worker (lib/platePrint), or put it on the layer`);
      });
    }
  });
  assert.ok(seen >= 15, 'found the paths’ styles');
});

test('no style reaches a printed layer only as an svg', () => {
  for (const { css } of [ENGRAVING, CHOOSE])
    css.walkRules((r) => {
      for (const s of r.selectors)
        assert.doesNotMatch(s, /svg\.(glow|lines)\b|\.engraving\)?\s*>?\s*svg\b/, `${s}: a printed layer is an img once its print is in; style it by its class (.glow, .lines)`);
    });
});

// ---- only where the faces are sharp ---------------------------------------------
// ChooseCategory prints where `sharp` and not TURN.across (the rows); its
// sharp block's media must be exactly the other screens, or a print would be
// shown on a face Chrome rasters larger as it grows, and blur.

type Screen = { w: number; h: number };
/** Whether a media query list of (min-|max-)(width|height) and orientation features holds on a screen. */
const holds = (list: string, { w, h }: Screen) =>
  list.split(',').some((q) =>
    [...q.matchAll(/\(([\w-]+):\s*([\w.]+?)(px)?\)/g)].every(([, f, v]) => {
      const n = Number(v);
      if (f === 'orientation') return (v === 'portrait') === h >= w;
      return { 'min-width': w >= n, 'max-width': w <= n, 'min-height': h >= n, 'max-height': h <= n }[f!] ?? assert.fail(`unknown media feature ${f}`);
    }),
  );

test("the prints' screens are the sharp faces' screens", () => {
  const across = CHOOSE.source.match(/across: '([^']+)'/)?.[1];
  assert.ok(across, 'found TURN.across');
  assert.match(CHOOSE.source, /const printed = \$derived\(sharp && !rows\.current\);/, 'ChooseCategory prints where sharp and not in rows');
  assert.match(CHOOSE.source, /const rows = new MediaQuery\(TURN\.across\);/, 'the rows are TURN.across');
  let sharp: string | undefined;
  CHOOSE.css.walkRules((r: Rule) => {
    if (r.selector === '.sharp .frame' && r.parent?.type === 'atrule') sharp = (r.parent as postcss.AtRule).params;
  });
  assert.ok(sharp, 'found the sharp block');
  for (let w = 300; w <= 1400; w += 10)
    for (let h = 300; h <= 1400; h += 10) assert.equal(holds(sharp, { w, h }), !holds(across, { w, h }), `at ${w} x ${h}: the faces are ${holds(sharp, { w, h }) ? '' : 'not '}sharp, but the cards ${holds(across, { w, h }) ? 'are' : "aren't"} rows`);
});
