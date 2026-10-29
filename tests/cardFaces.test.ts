// The category cards' faces (ChooseCategory, docs/category-cards.md): what
// keeps them sharp in Chromium, and cheap to tilt, read from their CSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss, { type AtRule, type Declaration, type Rule } from 'postcss';

const SOURCE = readFileSync('src/components/ChooseCategory.svelte', 'utf8');
const CSS = postcss.parse(SOURCE.slice(SOURCE.indexOf('<style>') + '<style>'.length, SOURCE.lastIndexOf('</style>')));
const APP = postcss.parse(readFileSync('src/app.css', 'utf8'));

const decls = (root: postcss.Root, prop: RegExp) => {
  const out: Declaration[] = [];
  root.walkDecls(prop, (d) => void out.push(d));
  return out;
};
const mediaOf = (d: Declaration | Rule) => (d.parent?.type === 'atrule' ? (d.parent as AtRule).params : d.parent?.parent?.type === 'atrule' ? (d.parent.parent as AtRule).params : null);
/** The selectors of a rule that style the face itself (their last part is .frame). */
const faceSelectors = (r: Rule) => r.selectors.filter((s) => /\.frame(?=$|[:.])/.test(s.trim().split(/\s+/).pop()!));

// ---- the face's transforms and filters --------------------------------------
// Chrome keeps the face's twice-size drawing only under a 3D transform, so
// every state that moves the face has one in the sharp block; and the face's
// own `filter` is the sharp filter's, so a state that filters it gives it
// back there.

const sharpBlock = (() => {
  let block: AtRule | undefined;
  CSS.walkRules((r) => {
    if (r.selector === '.sharp .frame' && r.parent?.type === 'atrule') block = r.parent as AtRule;
  });
  assert.ok(block, 'the sharp block (.sharp .frame, in its @media) is there');
  return block;
})();
const inSharp = (selector: string) => {
  const found: Declaration[] = [];
  sharpBlock.walkRules((r) => {
    if (r.selectors.includes(`.sharp ${selector}`)) r.walkDecls((d) => void found.push(d));
  });
  return found;
};
/** Rules the sharp block stands in for: all but the rows' (narrow screens), which are never sharp. */
const covered = (d: Declaration) => {
  const media = mediaOf(d);
  return d.parent?.type === 'rule' && (media === null || media === sharpBlock.params) && !(d.parent as Rule).selector.startsWith('.sharp');
};

test("every transform a card's face takes has a 3D twin in the sharp block", () => {
  const states = decls(CSS, /^transform$/).filter(covered);
  assert.ok(states.length >= 4, 'found the face states (hover, chosen, faded, voted)');
  for (const d of states)
    for (const s of faceSelectors(d.parent as Rule)) {
      const twin = inSharp(s).filter((t) => t.prop === 'transform');
      assert.ok(twin.length, `${s} sets transform: ${d.value}, but .sharp ${s} in the sharp block doesn't (a flat transform blurs the sharp face)`);
      for (const t of twin) assert.match(t.value, /^perspective\(900px\) rotateX\(/, `.sharp ${s}'s transform must start perspective(900px) rotateX(...): Chrome keeps the twice-size drawing only under a 3D one`);
    }
});

test("every filter on a card's face is given back to the sharp filter in the sharp block", () => {
  for (const d of decls(CSS, /^filter$/).filter(covered))
    for (const s of faceSelectors(d.parent as Rule)) {
      const twin = inSharp(s).filter((t) => t.prop === 'filter');
      assert.ok(twin.some((t) => t.value === 'var(--face-filter)'), `${s} sets filter: ${d.value}; in the sharp block .sharp ${s} must keep filter: var(--face-filter) (put the effect on another element, as the dim is on .sides)`);
    }
});

// ---- images on a card -------------------------------------------------------
// Chrome repaints a card's whole face on every frame it tilts if an image on
// it comes through var(), or shares an element's background with gradients
// (measured: five times the GPU's time). Each image is alone on an element of
// its own, written out (.grain), or written on the element from the script
// (.corners). A mask through var() measured fine (the emblems' --src, --fine).

/** Custom properties that hold an image, here or in app.css. */
const imageVars = new Set(
  [...decls(CSS, /^--/), ...decls(APP, /^--/)].filter((d) => /url\(/.test(d.value)).map((d) => d.prop),
);
for (const m of SOURCE.matchAll(/style:(--[\w-]+)=["{][^"}]*url\(/g)) imageVars.add(m[1]!);

test('no background on a card takes an image through a custom property', () => {
  assert.ok(imageVars.has('--filigree'), 'app.css --filigree is seen as an image');
  for (const d of decls(CSS, /^background(-image)?$/))
    for (const [, name] of d.value.matchAll(/var\((--[\w-]+)/g))
      assert.ok(!imageVars.has(name!), `${(d.parent as Rule).selector} { ${d.prop}: … var(${name}) … }: an image through var() has Chrome repaint the tilting card every frame; put it on an element of its own, written out`);
});

test('no background or mask on a card holds an image beside gradients', () => {
  for (const d of decls(CSS, /^(-webkit-)?(background|mask)(-image)?$/))
    assert.ok(!(/url\(/.test(d.value) && /gradient\(/.test(d.value)), `${(d.parent as Rule).selector} { ${d.prop} }: an image beside gradients has Chrome repaint the tilting card every frame; give the image an element of its own`);
});

test("the cards' corners are --filigree's images, in its order and size", () => {
  const filigree = decls(APP, /^--filigree$/)[0]!.value;
  const layers = [...filigree.matchAll(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)\s*([^/,]+?)\s*\/\s*([^,]+?)\s+no-repeat/g)];
  assert.equal(layers.length, 4, 'app.css --filigree is four corners, each url(…) <position> / <size> no-repeat');
  const corners = (prop: string, sel = '.corners') => decls(CSS, new RegExp(`^${prop}$`)).find((d) => (d.parent as Rule).selector === sel && mediaOf(d) === null)?.value;
  const order = layers.map((l) => l[1]!.trim()).join(', ');
  assert.equal(corners('background-position'), order);
  assert.equal(corners('mask-position', '.card.dm .corners'), order);
  for (const l of layers) assert.equal(l[2]!.trim(), corners('background-size'));
});

// ---- what kindles on a face -------------------------------------------------
// Chrome draws a sharp face again, at twice its size through the filter, on
// every frame anything painted on it changes, unless that thing has a layer
// of its own: the emblems' kindle, a filter animated on the page's thread,
// held the GPU most of a deal. What kindles or swells (a filter, or the
// kindle's numbers it reads) has will-change under .sharp, always; so does
// the way out's lamp (CardEngraving), which breathes beside its gilt.

const unwrap = (s: string) => s.replace(/:global\(((?:[^()]|\([^()]*\))*)\)/g, '$1');
/** The classes a selector styles: its last compound's, or those of a last :is(). */
const targets = (s: string) => {
  const u = unwrap(s).trim();
  const is = u.match(/:is\(([^()]*)\)$/);
  return (is ? is[1]!.split(',') : [u.split(/[\s>+~]+/).pop()!]).map((p) => p.trim().match(/^\.([\w-]+)/)?.[1]).filter((c) => c !== undefined);
};

/** The classes `root`'s animations of a filter, or of the kindle's numbers, run on. */
const kindled = (root: postcss.Root) => {
  const painted = new Set<string>();
  root.walkAtRules('keyframes', (k) => k.walkDecls((d) => void ((d.prop === 'filter' || d.prop.startsWith('--kindle-')) && painted.add(k.params))));
  const out = new Set<string>();
  for (const d of decls(root, /^animation(-name)?$/))
    if (d.value.split(/[\s,]+/).some((t) => painted.has(t))) for (const s of (d.parent as Rule).selectors) for (const c of targets(s)) out.add(c);
  return out;
};
const ENGRAVING = readFileSync('src/components/CardEngraving.svelte', 'utf8');

test('what kindles or swells on a sharp face is on a layer of its own', () => {
  const animated = kindled(CSS);
  for (const c of kindled(postcss.parse(ENGRAVING.slice(ENGRAVING.indexOf('<style>') + '<style>'.length, ENGRAVING.lastIndexOf('</style>'))))) animated.add(c);
  const layered = new Set<string>();
  CSS.walkRules((r) => {
    const wc = r.nodes.find((n): n is Declaration => n.type === 'decl' && n.prop === 'will-change');
    if (wc && /filter/.test(wc.value) && /opacity/.test(wc.value)) for (const s of r.selectors) if (s.startsWith('.sharp ')) for (const c of targets(s)) layered.add(c);
  });
  for (const c of ['icon', 'gilt', 'window']) assert.ok(animated.has(c), `found what kindles or swells (.${c})`);
  for (const c of [...animated, 'lamp']) assert.ok(layered.has(c), `.${c} kindles, swells or breathes on the face; give it will-change: filter, opacity under .sharp, always, or Chrome redraws the whole sharp face every frame it changes`);
});

// ---- face down in the deal --------------------------------------------------
// The CSS reads .down from the card itself, so the deal must put it there:
// once the turn sat inside .sides, a class on the turn's parent landed on
// .sides, and the cards were dealt with no back, their faces mirrored and
// upside down (WebKit) or blank (Chromium) until they stood on edge. And the
// sides swap on the turn's own clock: a timer counted from the deal ran ahead
// of the turn, which starts only after the mount's long frame.

const SCRIPT = SOURCE.slice(0, SOURCE.indexOf('<style>'));
const DEAL = (() => {
  const from = SCRIPT.indexOf('function deal(');
  assert.ok(from >= 0, 'the deal transition (function deal) is there');
  return SCRIPT.slice(from, SCRIPT.indexOf('\n  }\n', from));
})();

test('every .down in the CSS is read from the card itself', () => {
  let seen = 0;
  CSS.walkRules((r) => {
    for (const s of r.selectors)
      for (const part of s.split(/\s+|[>+~]/))
        if (part.includes(':global(.down)')) {
          seen++;
          assert.match(part, /^\.card(?=[.:]|$)/, `${s}: .down is put on the card (.card:global(.down)), so it must be read there`);
        }
  });
  assert.ok(seen >= 10, 'found the face-down rules');
});

test("the deal puts .down on the card, and takes it off on the turn's own clock", () => {
  const holder = DEAL.match(/(\w+)\??\.classList\.add\('down'\)/)?.[1];
  assert.ok(holder, 'the deal adds .down');
  assert.ok(DEAL.includes(`const ${holder} = node.closest('.card');`), `the deal adds .down to ${holder}, which must be node.closest('.card'): the CSS reads it from the card, and the turn sits inside .sides`);
  assert.doesNotMatch(DEAL, /setTimeout\([^;]*'down'/, "a timer counted from the deal runs ahead of the turn; take .down off in the transition's tick");
  assert.match(DEAL, /tick: \([^)]*\) => \{[\s\S]*classList\.remove\('down'\)/, "the deal takes .down off in its tick, on the turn's own clock");
});
