// A find-the-art answer ran at about 12 fps on an iPhone for close to a
// second: what changes on screen there changed in ways that had big things
// painted or worked out again on every frame. What keeps it cheap, and the
// same to see as before, read from the CSS and the markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss, { type Declaration, type Rule } from 'postcss';

const parse = (file: string) => {
  const source = readFileSync(file, 'utf8');
  const css = postcss.parse(source.slice(source.indexOf('<style>') + '<style>'.length, source.lastIndexOf('</style>')));
  return { markup: source.slice(0, source.indexOf('<style>')), css };
};
/** Every declaration of `prop` in rules that have `selector` among theirs, outside any @media. */
const declsOf = (root: postcss.Root, selector: string, prop: string) => {
  const out: Declaration[] = [];
  root.walkRules((r) => {
    if (r.parent?.type !== 'root' || !r.selectors.includes(selector)) return;
    r.walkDecls(prop, (d) => void out.push(d));
  });
  return out;
};
const one = (root: postcss.Root, selector: string, prop: string) => {
  const found = declsOf(root, selector, prop);
  assert.equal(found.length, 1, `${selector} { ${prop} } is set once`);
  return found[0]!.value;
};
/** Shadows in a box-shadow list (split at the commas between them, not those in colours). */
const shadows = (value: string) => value.split(/,(?![^(]*\))/).map((s) => s.trim().replace(/\s+/g, ' '));

// ---- the pictures: their fades and turns never move the shadowed element ----

const art = parse('src/components/ArtImage.svelte');

test("a picture's fades and turn are on its box, never on the picture with its shadow", () => {
  const img = art.markup.match(/<img\b[^>]*>/g);
  assert.equal(img?.length, 1, 'ArtImage draws one <img>');
  assert.doesNotMatch(img![0], /\b(in|out|transition|animate):|class:unflip/, 'the <img> carries the drop shadow: a fade or a turn on it has WebKit composite it, its shadow live on every frame; put it on .shot');
  const shot = art.markup.match(/<span class="shot"[^>]*>\s*<img\b/);
  assert.ok(shot, 'the picture is alone in its .shot');
  assert.match(shot[0], /in:fade/);
  assert.match(shot[0], /out:fade/);
  assert.match(shot[0], /class:unflip/);
});

test('in ArtImage only the picture has a filter, and the picture never animates', () => {
  let filters = 0;
  art.css.walkRules((r: Rule) => {
    const props = new Set(r.nodes.filter((n): n is Declaration => n.type === 'decl').map((d) => d.prop));
    const onImg = r.selectors.every((s) => /\bimg$/.test(s.trim()));
    if (props.has('filter')) {
      filters++;
      assert.ok(onImg, `${r.selector} has a filter: only the picture itself may, so that what fades or turns has none`);
    }
    if (onImg) for (const p of ['animation', 'transition', 'transform', 'translate', 'scale', 'rotate']) assert.ok(!props.has(p), `${r.selector} { ${p} }: the picture with its shadow must sit still`);
  });
  assert.equal(filters, 1, "the picture's drop shadow is there, once");
});

test("the reveal's light takes a picture's turn from its box too, where ArtImage turns it", () => {
  // The flare and rays round a picture (moments.ts reveal, `clear`) keep to
  // its outline, mirrored while the picture still is: silhouetteOf reads
  // the img's own transform and its parent's, the .shot it turns in (above).
  const fx = readFileSync('src/lib/fx/effects.ts', 'utf8');
  const from = fx.indexOf('function silhouetteOf(');
  assert.ok(from >= 0, 'fx/effects.ts has silhouetteOf');
  const body = fx.slice(from, fx.indexOf('\n}\n', from));
  assert.match(body, /flips\(el\)\s*!==\s*flips\(el\.parentElement\)/, "silhouetteOf reads a picture's mirroring from it and its box (.shot), or the light shines round it unmirrored as it turns");
});

// ---- the tooltip's verdict: a fade on its rims, the same as the easing was ----

const qv = parse('src/components/QuestionView.svelte');

test("the tooltip's verdict colours only fade (on the rims), never ease on the tooltip", () => {
  assert.equal(declsOf(qv.css, '.tooltip', 'transition').length, 0, '.tooltip eases nothing where CSS paints it: a colour eased on the tooltip has all of it painted again every frame; fade a rim instead');
  // (The glow's colour eases for the backdrop alone, which draws it from --bs1-color.)
  for (const part of one(qv.css, '.tooltip:global([data-bs-on])', 'transition').split(','))
    assert.match(part.trim(), /^--bs1-color\b/, `.tooltip[data-bs-on] transitions ${part.trim()}: only the glow's colour, which the backdrop reads`);
  assert.doesNotMatch(one(qv.css, '.tooltip', 'box-shadow'), /--bs1-color/, "the glow CSS paints is the rims', so the tooltip's own box-shadow never changes");
  for (const tone of ['good', 'bad'])
    for (const prop of ['border-color', 'box-shadow', 'border']) assert.equal(declsOf(qv.css, `.tooltip.${tone}`, prop).length, 0, `.tooltip.${tone} sets ${prop}: that's the rim's`);
  for (const part of one(qv.css, '.verdict-rim', 'transition').split(',')) assert.match(part.trim(), /^(opacity|visibility)\b/, `.verdict-rim transitions ${part.trim()}`);
});

test("a rim's glow is the one --bs1 makes, in the verdict's colour, under the tooltip's ring", () => {
  const [oy, blur] = one(qv.css, '.tooltip', '--bs1').split(/\s+/);
  const ring = shadows(one(qv.css, '.tooltip', 'box-shadow'))[0];
  assert.equal(ring, '0 0 0 1px #000');
  const border = one(qv.css, '.tooltip', 'border').match(/^(\d+)px solid /);
  assert.ok(border, '.tooltip has a solid border in px');
  // The rim's box is the tooltip's padding box (inside its border), so its
  // ring and glow spread the border's width further to reach as far as the
  // tooltip's do from its border box.
  const width = Number(border[1]);
  for (const tone of ['good', 'bad']) {
    const color = one(qv.css, `.tooltip.${tone}`, '--bs1-color');
    // (Listed first, the ring is drawn over the glow, as on the tooltip.)
    assert.deepEqual(
      shadows(one(qv.css, `.verdict-rim.${tone}`, 'box-shadow')),
      [`0 0 0 ${width + 1}px #000`, `0 ${oy!.replace(/^0px$/, '0')} ${blur} ${width}px ${color}`],
      `.verdict-rim.${tone}'s ring is the tooltip's and its glow 0 var(--bs1) var(--bs1-color) as .tooltip.${tone} has them, both from the tooltip's border box`,
    );
    assert.match(one(qv.css, `.verdict-rim.${tone}`, 'outline-color'), /^#[0-9a-f]{6}$/i, 'an opaque border, faded in over the plain one');
    for (const prop of ['border', 'border-color']) assert.equal(declsOf(qv.css, `.verdict-rim.${tone}`, prop).length, 0, `.verdict-rim.${tone} sets ${prop}: its border is an outline`);
  }
  // The verdict's border is an outline round the tooltip's padding box: a
  // browser rounds an outline's width to device pixels as it does the
  // tooltip's border, and never an inset, so the outline lies on the
  // border's pixels whatever the zoom. A border on a box an inset of -1px
  // out fell a device pixel outside it on some edges at fractional zooms.
  assert.equal(one(qv.css, '.verdict-rim', 'inset'), '0');
  assert.equal(one(qv.css, '.verdict-rim', 'outline'), `${width}px solid`);
  assert.equal(one(qv.css, '.verdict-rim', 'outline-offset'), '0');
  assert.equal(declsOf(qv.css, '.verdict-rim', 'border').length, 0, '.verdict-rim has no border of its own');
  assert.equal(one(qv.css, '.tooltip', 'position'), 'relative');
});

test('every tooltip has its rims first, so all that is in it is drawn over them', () => {
  const tooltips = [...qv.markup.matchAll(/<div\s+class="tooltip[^"]*"[^>]*>([\s\S]{0,80})/g)];
  assert.equal(tooltips.length, 2, 'the name question and the art question each have a tooltip');
  for (const t of tooltips) assert.match(t[1]!, /^\s*\{@render rims\(\)\}/, 'the tooltip opens with {@render rims()}');
});

test('only the two rims carry their class, so their rules hide nothing else in QuestionView', () => {
  // Svelte keeps a rule to its component, not to the tooltip: .verdict-rim
  // hides whatever in QuestionView has the class. Named rim at first, the
  // rims' rules hid the gold outline of Delve's lost-life vials as well, a
  // <path class="rim"> in the same component.
  const carriers = (markup: string) =>
    [...markup.matchAll(/\bclass(?:="([^"]*)"|:([\w-]+))/g)].filter((m) => m[2] === 'verdict-rim' || (m[1] ?? '').split(/\s+/).includes('verdict-rim')).length;
  const rims = qv.markup.match(/\{#snippet rims\(\)\}([\s\S]*?)\{\/snippet\}/);
  assert.ok(rims, 'QuestionView has its rims() snippet');
  assert.equal(carriers(rims[1]!), 2, 'the snippet draws the two rims, good and bad');
  assert.equal(carriers(qv.markup), 2, 'nothing but the two rims has the class verdict-rim');
});

test('the task line and the banner stay over the tooltip, now positioned, and the cards leaving over them, as they were', () => {
  const task = Number(one(qv.css, '.task', 'z-index'));
  assert.ok(task >= 1, ".task needs a z-index: the tooltip is positioned (for its rims), and its soft shadows reach up over the task's line");
  const game = parse('src/components/Game.svelte');
  assert.ok(Number(one(game.css, '.head', 'z-index')) >= 1, "Game's .head (the banner) needs a z-index: the tooltip comes later, and where CSS paints its soft shadows they reach up to the banner");
  assert.ok(Number(one(game.css, '.cards-slot:global(.leaving)', 'z-index')) > task, "the cards fade out over the question, its task line too: their z-index tops .task's");
});
