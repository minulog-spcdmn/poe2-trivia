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
