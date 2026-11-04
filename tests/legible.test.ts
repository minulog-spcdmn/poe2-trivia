// The game's text reads (docs/design-rules.md, "Secondary text"): no light
// grey text colour in the game's own styles is dimmer than --muted, the
// dimmest grey it sets text in, on the page's own dark (src/qa/legible.ts,
// APCA), and the game's italic, the voice of its secondary lines, is a real
// italic drawn to read at a note's size: Andada Pro's, in the text font beside
// Manuale's upright (app.css), never one the browser slants and smears for it.
// Greys only: a colour (gold, the unique orange, a state's) is the house's or
// a meaning's, judged on screen by the QA desk, against what's actually behind
// the text (src/qa/frame/checks.ts, the sweep's --faint). Each rule is read
// alone; an SVG's text is painted with its fill, read where the rule sets a
// font too (a fill alone is a shape's).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import postcss, { type Declaration, type Rule } from 'postcss';
import { FLOOR, MUTED, PAGE, lc, luminance, over, type RGB } from '../src/qa/legible.ts';

const root = join(import.meta.dirname, '..');

/** The game's own styles: its components' and app.css (not the dev pages or the QA desk). */
function sources(): { file: string; css: postcss.Root }[] {
  const out: { file: string; css: postcss.Root }[] = [];
  const add = (abs: string) => {
    const src = readFileSync(abs, 'utf8');
    const file = relative(root, abs).replaceAll('\\', '/');
    if (abs.endsWith('.css')) return out.push({ file, css: postcss.parse(src) });
    for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) out.push({ file, css: postcss.parse(m[1]) });
  };
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.svelte')) add(p);
    }
  };
  walk(join(root, 'src', 'components'));
  for (const f of ['App.svelte', 'Root.svelte', 'app.css']) add(join(root, 'src', f));
  return out;
}

/** app.css's own colours and fonts, by name (--muted: #...). */
const TOKENS = new Map<string, string>();
postcss
  .parse(readFileSync(join(root, 'src', 'app.css'), 'utf8'))
  .walkRules(':root', (r) => r.walkDecls(/^--/, (d) => void TOKENS.set(d.prop, d.value.trim())));

/** A value with app.css's names put in (a name it doesn't have, its fallback or nothing). */
function resolve(value: string, depth = 0): string | null {
  const m = /^var\((--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value.trim());
  if (!m) return value.trim();
  if (depth > 5) return null;
  const named = TOKENS.get(m[1]) ?? m[2];
  return named === undefined ? null : resolve(named, depth + 1);
}

/** A literal colour (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba()) as rgba; anything else (a mix, a gradient, inherit) null. */
function colour(value: string): [number, number, number, number] | null {
  const v = value.trim().toLowerCase();
  let h = /^#([0-9a-f]{3,8})$/.exec(v)?.[1];
  if (h) {
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h!.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const f = /^rgba?\(([^)]+)\)$/
    .exec(v)?.[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(parseFloat);
  return f && f.length >= 3 ? [f[0], f[1], f[2], f[3] ?? 1] : null;
}

const declsOf = (rule: Rule) => {
  const d = new Map<string, string>();
  rule.each((n) => void (n.type === 'decl' && d.set((n as Declaration).prop, (n as Declaration).value)));
  return d;
};
const inKeyframes = (rule: Rule) => rule.parent?.type === 'atrule' && /keyframes$/.test((rule.parent as postcss.AtRule).name);
/** Text that's off (a disabled control's) may be dim. */
const OFF = /:disabled|\[disabled\]|\[aria-disabled|\.disabled\b|\.off\b/;
/** A rule that says in a comment of its own that it's dim on purpose (a thing not found yet, a tab not chosen), or that its colour isn't text's. */
const meant = (rule: Rule) => rule.nodes.some((n) => n.type === 'comment' && /^\((Dim on purpose|Not text)\b/.test(n.text.trim()));
/** A field's hint before anything is typed in it may sit under --muted, down to where the game's are (app.css .field's, Lc 21): never gone. */
const HINT = 20;

test('no light grey text is dimmer than var(--muted), the dimmest grey the game sets text in', () => {
  assert.equal(resolve('var(--muted)'), `#${MUTED.map((v) => v.toString(16).padStart(2, '0')).join('')}`, "src/qa/legible.ts's MUTED is app.css's --muted");
  const bad: string[] = [];
  for (const { file, css } of sources()) {
    css.walkRules((rule) => {
      if (inKeyframes(rule)) return;
      const d = declsOf(rule);
      const raw = d.get('color') ?? (d.has('font-size') || d.has('font-family') ? d.get('fill') : undefined);
      if (!raw || OFF.test(rule.selector) || meant(rule)) return;
      const value = resolve(raw);
      const c = value && colour(value);
      if (!c) return;
      const opacity = Number(resolve(d.get('opacity') ?? '1') ?? 1);
      const seen: RGB = over([c[0], c[1], c[2], c[3] * (Number.isFinite(opacity) ? opacity : 1)], PAGE);
      // (Dark text sits on something light, a gold button: it's left out. Only near black, so a grey far under the floor can't pass for it.)
      if (luminance(seen) < 0.03) return;
      if (Math.max(...c.slice(0, 3)) - Math.min(...c.slice(0, 3)) > 50) return;
      const v = lc(seen, PAGE);
      const floor = /::?placeholder/.test(rule.selector) ? HINT : FLOOR;
      if (v < floor) bad.push(`${file} ${rule.selector.replace(/\s+/g, ' ')}: ${raw} reads at Lc ${v.toFixed(0)}, under ${floor.toFixed(0)}`);
    });
  }
  assert.deepEqual(bad, []);
});

test("the text font's every style and script is a face of its own: Manuale upright, Andada Pro's italic at Manuale's height", () => {
  const css = postcss.parse(readFileSync(join(root, 'src', 'app.css'), 'utf8'));
  const family = resolve('var(--font-body)')!.split(',')[0].replace(/["']/g, '').trim();
  const facesIn = (root: postcss.Root, name?: string) => {
    const faces: Map<string, string>[] = [];
    root.walkAtRules('font-face', (r) => {
      const d = new Map<string, string>();
      r.walkDecls((decl) => void d.set(decl.prop, decl.value));
      if (!name || d.get('font-family')?.replace(/["']/g, '') === name) faces.push(d);
    });
    return faces;
  };
  const faces = facesIn(css, family);
  const script = (d: Map<string, string>) => /-(latin|latin-ext|vietnamese)-wght-/.exec(d.get('src') ?? '')?.[1];
  const range = (d: Map<string, string>) => d.get('unicode-range')?.replace(/\s+/g, '');
  const size = (d: Map<string, string>) => parseFloat(d.get('size-adjust') ?? '100');
  for (const [style, font] of [
    ['normal', 'manuale'],
    ['italic', 'andada-pro'],
  ]) {
    const mine = faces.filter((d) => d.get('font-style') === style);
    // Each script's unicode-range as @fontsource has it, in its order: where ranges overlap (a combining accent) the
    // face declared last wins, the Latin one a page already has. (A script missing from a style would fall to EB
    // Garamond for it: a name's ł in another face than its other letters.)
    const theirs = facesIn(
      postcss.parse(readFileSync(join(root, 'node_modules', '@fontsource-variable', font, style === 'italic' ? 'wght-italic.css' : 'wght.css'), 'utf8')),
    );
    assert.deepEqual(
      mine.map(script),
      ['vietnamese', 'latin-ext', 'latin'],
      `${family} has a ${style} face for each of Vietnamese, Latin Extended and Latin, in that order`,
    );
    assert.deepEqual(
      mine.map(range),
      mine.map((d) => range(theirs.find((t) => script(t) === script(d))!)),
      `its ${style} faces' unicode-ranges are @fontsource's`,
    );
    for (const d of mine) {
      assert.match(d.get('src')!, new RegExp(`@fontsource-variable/${font}/files/${font}-`), `its ${style} faces are ${font}'s`);
      // (A weight the face doesn't span the browser makes up: bold smeared wider, never the drawn bold.)
      const [lo, hi] = d.get('font-weight')!.split(/\s+/).map(Number);
      assert.ok(lo <= 400 && hi >= 700, `its ${style} faces span 400 to 700, not ${d.get('font-weight')}`);
    }
  }
  // The same size for every face of a style; the italic 4% under the upright, so its small letters stand as tall as Manuale's.
  const upright = faces.filter((d) => d.get('font-style') === 'normal');
  const italic = faces.filter((d) => d.get('font-style') === 'italic');
  assert.equal(new Set(upright.map(size)).size, 1, 'every upright face at one size');
  assert.equal(new Set(italic.map(size)).size, 1, 'every italic face at one size');
  assert.ok(Math.abs(size(italic[0]) / size(upright[0]) - 0.96) < 0.01, `the italic at 96% of the upright, not ${size(italic[0])}% of ${size(upright[0])}%`);
});
