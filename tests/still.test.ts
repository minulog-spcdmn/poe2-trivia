// No player sees the game held still (src/lib/still.ts): it doesn't ask
// whether the system wants reduced motion, which Windows says whenever its
// own animations are off, and it has no setting for it. The still mode is
// the checks' own: a scripted browser asking for reduced motion gets it.
// So: the build turns every @media (prefers-reduced-motion: reduce) into
// the mode's mark (stillMark.ts), no script asks the system but still.ts,
// still.ts answers only a scripted browser, and nothing in the settings
// waits on the mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import postcss, { type Node } from 'postcss';
import { marked, stillMark } from '../stillMark.ts';

const through = (css: string) => postcss([stillMark]).process(css, { from: undefined }).css;
const flat = (css: string) => css.replace(/\s+/g, ' ').trim();

const files = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else out.push(path.replaceAll('\\', '/'));
  }
  return out;
};
const SRC = files('src');
/** A component's style sheet and the rest of it, apart. */
const parts = (path: string) => {
  const src = readFileSync(path, 'utf8');
  const at = src.indexOf('<style');
  if (!path.endsWith('.svelte') || at < 0) return { script: src, style: '' };
  const end = src.lastIndexOf('</style>');
  return { script: src.slice(0, at) + src.slice(end), style: src.slice(src.indexOf('>', at) + 1, end) };
};
/** A component's sheet as the build's step meets it: Svelte has taken its :global() wrappers off by then (html[data-saver] .x, where the component wrote :global(html[data-saver]) .x). */
const compiled = (style: string) => style.replace(/:global\(((?:[^()]|\([^()]*\))*)\)/g, '$1');

test('a rule for reduced motion becomes a rule under the still mode’s mark, weighing what it did', () => {
  assert.equal(flat(through('@media (prefers-reduced-motion: reduce) { .a, .b .c { animation: none; } }')), ':where(html[data-still]) .a, :where(html[data-still]) .b .c { animation: none; }');
  // (Every element, as app.css cuts all animation short: the root is one of them, and its ::before.)
  assert.equal(
    flat(through('@media (prefers-reduced-motion: reduce) { *, *::before { animation-duration: 0.01ms !important; } }')),
    ':where(html[data-still], html[data-still] *), :where(html[data-still], html[data-still] *)::before { animation-duration: 0.01ms !important; }',
  );
  assert.equal(marked('* > .a'), ':where(html[data-still], html[data-still] *) > .a');
  // A selector from the root takes the mark on the root.
  assert.equal(marked('html[data-saver] .x'), 'html:where([data-still])[data-saver] .x');
  assert.equal(marked(':root'), ':root:where([data-still])');
  assert.equal(marked('.html-box'), ':where(html[data-still]) .html-box');
  assert.equal(marked("[data-kind='html'] .x"), ":where(html[data-still]) [data-kind='html'] .x");
  // A component's selector from the root, as Svelte hands it on.
  assert.equal(flat(through(compiled('@media (prefers-reduced-motion: reduce) { :global(html[data-saver]) .gleam, :global(.dark) .a { animation: none; } }'))), 'html:where([data-still])[data-saver] .gleam, :where(html[data-still]) .dark .a { animation: none; }');
  // However the query is cased.
  assert.equal(flat(through('@media (PREFERS-REDUCED-MOTION: REDUCE) { .a { top: 0; } }')), ':where(html[data-still]) .a { top: 0; }');
});

test('other conditions stay as the rule’s @media, wherever the reduced motion stands', () => {
  assert.equal(flat(through('@media (min-width: 700px) and (prefers-reduced-motion: reduce) { .a { top: 0; } }')), '@media (min-width: 700px) { :where(html[data-still]) .a { top: 0; } }');
  assert.equal(flat(through('@media (min-width: 700px) { @media (prefers-reduced-motion: reduce) { .a { top: 0; } } }')), '@media (min-width: 700px) { :where(html[data-still]) .a { top: 0; } }');
  assert.equal(flat(through('@media (prefers-reduced-motion: reduce) { @media (hover: hover) { .a:hover { top: 0; } } }')), '@media (hover: hover) { :where(html[data-still]) .a:hover { top: 0; } }');
});

test('what stands in one of its rules follows that rule, and a block in a block is marked once', () => {
  assert.equal(flat(through('@media (prefers-reduced-motion: reduce) { .a { .b { top: 0; } @media (hover: hover) { top: 1px; } } }')), ':where(html[data-still]) .a { .b { top: 0; } @media (hover: hover) { top: 1px; } }');
  assert.equal(flat(through('@media (prefers-reduced-motion: reduce) { @media (prefers-reduced-motion: reduce) { .a { top: 0; } } }')), ':where(html[data-still]) .a { top: 0; }');
});

test('what can’t be said as a mark stops the build', () => {
  for (const params of ['(prefers-reduced-motion: no-preference)', 'not (prefers-reduced-motion: reduce)', 'print, (prefers-reduced-motion: reduce)', '(prefers-reduced-motion)', '(prefers-reduced-motion: reduce) and (hover: hover) or (pointer: fine)'])
    assert.throws(() => through(`@media ${params} { .a { top: 0; } }`), /still mode/, params);
  // Said wrongly, each of these would hold for every player (the first three), or for none.
  for (const css of [
    // In a rule (CSS nesting): its declarations would become the rule's own, its rules the rule's.
    '.a { @media (prefers-reduced-motion: reduce) { animation: none; } }',
    '.a { @media (prefers-reduced-motion: reduce) { .b { animation: none; } } }',
    '@media (min-width: 700px) { .a { @media (prefers-reduced-motion: reduce) { animation: none; } } }',
    // No condition: lifted out, it would stand for all, a @keyframes in the real one's place.
    '@media (prefers-reduced-motion: reduce) { @keyframes k { from { opacity: 0; } } }',
    '@media (prefers-reduced-motion: reduce) { @supports (top: 0) { @font-face { font-family: x; } } }',
    // The root, from past the selector's start: under the mark it would match nothing.
    '@media (prefers-reduced-motion: reduce) { ::view-transition-old(root) { animation: none; } }',
    '@media (prefers-reduced-motion: reduce) { :is(html, body) .a { animation: none; } }',
  ])
    assert.throws(() => through(css), /still mode/, css);
});

/** How many selectors `css` has under the mark. */
const underMark = (css: string) => {
  let n = 0;
  postcss.parse(css).walkRules((rule) => void (n += rule.selectors.filter((s) => s.includes('[data-still]')).length));
  return n;
};
/** How many selectors the reduced-motion blocks of `css` hold in rules of their own. */
const written = (css: string) => {
  let n = 0;
  postcss.parse(css).walkAtRules('media', (at) => {
    if (!/prefers-reduced-motion/i.test(at.params)) return;
    at.walkRules((rule) => {
      for (let p: Node | undefined = rule.parent; p && p !== at; p = p.parent) if (p.type === 'rule') return;
      n += rule.selectors.length;
    });
  });
  return n;
};

test('every style sheet of the game comes through with each of its rules under the mark, and no question to the system left', () => {
  let found = 0;
  for (const path of SRC.filter((p) => /\.(css|svelte)$/.test(p))) {
    const style = path.endsWith('.css') ? readFileSync(path, 'utf8') : compiled(parts(path).style);
    if (!/prefers-reduced-motion/i.test(style)) continue;
    const out = through(style);
    assert.doesNotMatch(out, /prefers-reduced-motion/i, path);
    // (Gone is not enough: a block dissolved with nothing marked is gone too, and holds for every player.)
    const rules = written(style);
    assert.ok(rules > 0, `${path}: a block with no rule of its own`);
    assert.equal(underMark(out) - underMark(style), rules, `${path}: every rule of its blocks under the mark`);
    found += rules;
  }
  assert.ok(found >= 40, 'found the rules written for reduced motion');
  assert.match(readFileSync('vite.config.ts', 'utf8'), /postcss:\s*\{\s*plugins:\s*\[[^\]]*\bstillMark\b/, 'the build runs the step');
});

test('no script asks the system for reduced motion but lib/still.ts, and no tool stands in for its answer', () => {
  const asking = SRC.filter((p) => /\.(ts|svelte)$/.test(p) && /prefers-reduced-motion/i.test(parts(p).script));
  assert.deepEqual(asking, ['src/lib/still.ts']);
  // (A script that made the page's matchMedia answer for it measured a game that no longer listens: scripts/measure-luminance.mjs did.)
  const standIns = files('scripts').filter((p) => /\.(mjs|js|ts)$/.test(p) && /prefers-reduced-motion/i.test(readFileSync(p, 'utf8')) && /matchMedia/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(standIns, []);
});

/** The modules of the game's that `file` loads, at once or later (import()); types aside. */
const KNOWN = new Set(SRC);
const loads = (file: string) =>
  [
    ...readFileSync(file, 'utf8')
      .replace(/\b(?:import|export)\s+type\s[^;]*?from\s*['"][^'"]+['"]/g, '')
      .matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g),
  ].flatMap(([, spec]) => {
    const base = join(dirname(file), spec.split('?')[0]).replaceAll('\\', '/');
    const found = ['', '.ts', '.svelte', '.svelte.ts', '/index.ts'].map((tail) => base + tail).find((p) => KNOWN.has(p));
    return found ? [found] : [];
  });
/** Whether loading `from` comes to load `to`. */
const reaches = (from: string, to: string) => {
  const seen = new Set<string>();
  for (const todo = [from]; todo.length; ) {
    const file = todo.pop()!;
    if (file === to) return true;
    if (seen.has(file) || !/\.(ts|svelte)$/.test(file)) continue;
    seen.add(file);
    todo.push(...loads(file));
  }
  return false;
};

test('whatever loads app.css loads lib/still.ts too: its rules for the still mode read the mark only that sets', () => {
  // (hover.html and levels.html loaded the sheet and nothing that came to still.ts: in a check their animations ran on.)
  const sheets = SRC.filter((p) => /\.(ts|svelte)$/.test(p) && /\bimport\s*\(?\s*['"][^'"]*\/app\.css['"]/.test(readFileSync(p, 'utf8')));
  assert.ok(sheets.length >= 10, 'found the pages that load the sheet');
  assert.deepEqual(
    sheets.filter((p) => !reaches(p, 'src/lib/still.ts')),
    [],
  );
  // (The check itself: a page with the sheet and no way to the mark is found out.)
  assert.ok(!reaches('src/lib/storage.ts', 'src/lib/still.ts'));
});

/** lib/still.ts loaded afresh on a made-up page. */
async function page(name: string, { asks, driven, marked: was = false }: { asks: boolean; driven: boolean; marked?: boolean }) {
  const attrs = new Set(was ? ['data-still'] : []);
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: { hasAttribute: (n: string) => attrs.has(n), setAttribute: (n: string) => void attrs.add(n) } };
  g.matchMedia = (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' && asks });
  Object.defineProperty(globalThis, 'navigator', { value: { webdriver: driven }, configurable: true });
  const { STILL } = (await import(`../src/lib/still.ts?${name}`)) as typeof import('../src/lib/still.ts');
  return { STILL, marked: attrs.has('data-still') };
}

test('a player’s page is never held still, whatever the system asks', async () => {
  assert.deepEqual(await page('player-asks', { asks: true, driven: false }), { STILL: false, marked: false });
  assert.deepEqual(await page('player', { asks: false, driven: false }), { STILL: false, marked: false });
});

test('a scripted browser that asks for reduced motion gets the still mode, and the page its mark', async () => {
  assert.deepEqual(await page('check-asks', { asks: true, driven: true }), { STILL: true, marked: true });
  assert.deepEqual(await page('check', { asks: false, driven: true }), { STILL: false, marked: false });
});

test('a page marked before it loads (the lab’s switch) is held still', async () => {
  assert.deepEqual(await page('lab', { asks: false, driven: false, marked: true }), { STILL: true, marked: true });
});

test('nothing in the settings waits on the still mode', () => {
  // (The battery saver's row did, and was gone for whoever had Windows' animations off. Where it shows: tests/saver.test.ts.)
  assert.doesNotMatch(parts('src/components/Settings.svelte').script, /\{#if[^}]*motion\.(reduced|still)/);
});
