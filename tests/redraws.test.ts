// The redraw check's reading of a trace (src/qa/redraws.ts; the sweep's
// --redraws traces the pages): which layers were drawn again, how much, and
// what fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSS_BACKDROP, FLOOR, MARK, MOMENTS, PAGE_FLOOR, WEBGL_SCENES, atRest, layerName, overBaseline, pageAtRest, readTrace, redraws, slackOf, unread, withoutMark, type TraceEvent } from '../src/qa/redraws.ts';
import { SCREENS } from '../src/qa/scene.ts';

test('a layer is named by its element, Svelte’s classes left out', () => {
  assert.equal(layerName("LayoutFlexibleBox (relative positioned) DIV class='shell svelte-1n46o8q'"), 'div.shell');
  assert.equal(layerName("LayoutSVGRoot (positioned, block) svg class='lamp svelte-18b6r65'"), 'svg.lamp');
  assert.equal(layerName("LayoutBlockFlow (relative positioned) BUTTON class='card svelte-ndz93z special mine'"), 'button.card.special.mine');
  assert.equal(layerName('LayoutBlockFlow (positioned, children-inline) ::before'), '::before');
  assert.equal(layerName('Scrolling background of LayoutView #document'), 'the page’s background');
  assert.equal(layerName(undefined), 'a layer of no element');
});

const PAGE = 7;
const snapshot = (ts: number, frame: number, tiles: [string, number, number[]][], invalidation?: number[]): TraceEvent => ({
  name: 'cc::LayerTreeHostImpl',
  ph: 'O',
  pid: PAGE,
  ts,
  args: {
    snapshot: {
      active_tiles: tiles.map(([id, layer, rect]) => ({ id: `cc::Tile/${id}`, layer_id: layer, content_rect: rect, contents_scale: 1 })),
      active_tree: {
        source_frame_number: frame,
        layers: [
          { layer_id: 1, layer_name: 'Scrolling background of LayoutView #document', bounds: { width: 800, height: 600 } },
          { layer_id: 5, layer_name: "LayoutBlockFlow SPAN class='frame svelte-x'", bounds: { width: 200, height: 100 }, owner_node: 42, invalidation },
        ],
      },
    },
  },
});
const raster = (ts: number, frame: number, tile: string, layer = 5, pid = PAGE): TraceEvent => ({ name: 'RasterTask', ph: 'X', pid, ts, args: { tileData: { layerId: layer, sourceFrameNumber: frame, tileId: { id_ref: tile } } } });

test('each raster task counts its tile, or only what its commit invalidated of a tile already there', () => {
  const r = redraws([
    // The face's two tiles, drawn for commit 1; then all of the left one again (2); then a corner of it (3).
    raster(10, 1, '0xa'),
    raster(11, 1, '0xb'),
    snapshot(20, 1, [
      ['0xa', 5, [0, 0, 100, 100]],
      ['0xb', 5, [100, 0, 100, 100]],
    ]),
    raster(30, 2, '0xa'),
    snapshot(40, 2, [['0xa', 5, [0, 0, 100, 100]]]),
    raster(50, 3, '0xa'),
    snapshot(60, 3, [['0xa', 5, [0, 0, 100, 100]]], [0, 0, 10, 20]),
    // Another tab's renderer, and a tile whose address is used again by another layer.
    raster(55, 3, '0xa', 5, 99),
  ]);
  assert.equal(r.layers.length, 1);
  const face = r.layers[0]!;
  assert.equal(face.name, 'span.frame');
  assert.equal(face.node, 42);
  assert.equal(face.commits, 3);
  assert.equal(face.px, 10000 + 10000 + 10000 + 200);
  assert.equal(face.again, 10000 + 200, 'drawn again: the left tile the second and third time');
});

test('a tile’s address used again is matched to the tile of that layer at the time', () => {
  const r = redraws([raster(10, 1, '0xa'), snapshot(20, 1, [['0xa', 5, [0, 0, 50, 50]]]), raster(30, 2, '0xa'), snapshot(40, 2, [['0xa', 5, [0, 0, 300, 10]]])]);
  assert.equal(r.layers[0]!.px, 2500 + 3000);
});

test('the trace is read a line an event, keeping only what is read, from its text or its bytes', () => {
  const lines = ['{"traceEvents":[', `${JSON.stringify(raster(1, 1, '0xa'))},`, '{"name":"Other","ph":"X","pid":7,"ts":2,"args":{"of":"RasterTask"}},', `${JSON.stringify(snapshot(3, 1, []))}`, ']}'];
  for (const trace of [lines.join('\n'), Buffer.from(lines.join('\n'))]) {
    assert.deepEqual(
      readTrace(trace).map((e) => e.name),
      ['RasterTask', 'cc::LayerTreeHostImpl'],
    );
  }
  assert.deepEqual(
    readTrace(JSON.stringify({ traceEvents: [raster(1, 1, '0xa'), snapshot(3, 1, [])] })).map((e) => e.name),
    ['RasterTask', 'cc::LayerTreeHostImpl'],
    'not one event a line: parsed whole',
  );
});

test('a trace that doesn’t read as one always does fails, and the mark is left out of what’s measured', () => {
  const withMark = (e: TraceEvent): TraceEvent => {
    e.args.snapshot.active_tree.layers.push({ layer_id: 9, layer_name: "LayoutBlockFlow (positioned) DIV id='redraw-mark'", bounds: { width: 8, height: 8 } });
    e.args.snapshot.active_tiles.push({ id: 'cc::Tile/0xm', layer_id: 9, content_rect: [0, 0, 8, 8], contents_scale: 1 });
    return e;
  };
  const read = redraws([raster(10, 1, '0xa'), raster(11, 1, '0xm', 9), withMark(snapshot(20, 1, [['0xa', 5, [0, 0, 100, 100]]]))]);
  assert.equal(unread(read), null);
  assert.equal(MARK, 'div#redraw-mark');
  const r = withoutMark(read);
  assert.deepEqual(
    r.layers.map((l) => l.name),
    ['span.frame'],
  );
  assert.equal(r.px, 10000);
  assert.match(unread(redraws([])) ?? '', /the trace has nothing of the page’s renderer/, 'an empty trace');
  assert.match(unread(redraws([snapshot(20, 1, [])])) ?? '', /the trace has no tile drawn/, 'layer trees, but no raster tasks');
  assert.match(unread(redraws([raster(10, 1, '0xa'), snapshot(20, 1, [['0xa', 5, [0, 0, 100, 100]]])])) ?? '', /the trace has no tile of the mark/, 'tiles, but not the mark’s');
});

test('at rest, a layer drawn again FLOOR px a frame or more, over the frames watched, fails', () => {
  const l = { id: 5, name: 'div.stage', w: 1393, h: 594, node: 1, commits: 300, px: 300 * 400_000, again: 300 * 400_000 };
  assert.match(atRest(l, 300) ?? '', /div\.stage \(1393×594\) drawn again 400k px a frame at rest, on 100% of the frames/);
  // (GameOver's gleam before it had a layer: the page round it, a quarter of the frames.)
  assert.match(atRest({ ...l, name: 'div.shell', commits: 72, again: 72 * 280_000 }, 300) ?? '', /div\.shell .* on 24% of the frames/, 'a light passing over a big layer, for its share of the time');
  assert.equal(atRest({ ...l, name: 'svg.glow', w: 156, h: 108, px: 300 * 21_000, again: 300 * 21_000 }, 300), null, 'a light on a small layer of its own');
  assert.equal(atRest({ ...l, again: 300 * FLOOR - 1 }, 300), null, 'just under the floor');
});

test('at rest, the page drawn again PAGE_FLOOR px a frame or more, its layers together, fails', () => {
  const row = (i: number) => ({ id: i, name: `div.row${i}`, w: 300, h: 100, node: i, commits: 300, px: 300 * 30_000, again: 300 * 30_000 });
  const rows = [row(1), row(2), row(3), row(4)];
  assert.equal(rows.map((l) => atRest(l, 300)).filter(Boolean).length, 0, 'each under the floor');
  assert.match(pageAtRest(4 * 300 * 30_000, 300, rows) ?? '', /the page drawn again 120k px a frame at rest, its layers together \(most: div\.row1 30k px/);
  assert.equal(pageAtRest(300 * PAGE_FLOOR - 1, 300, rows), null, 'just under');
});

const workflow = readFileSync(new URL('../.github/workflows/redraws.yml', import.meta.url), 'utf8');
const jobArgs = [...workflow.matchAll(/args: '([^']*)'/g)].map((m) => m[1]!);
const only = (a: string) => new RegExp(a.match(/--only "([^"]+)"/)?.[1] ?? '.');

test('CI watches each WebGL scene with WebGL, and every moment', () => {
  for (const { scene } of WEBGL_SCENES) assert.ok(jobArgs.some((a) => a.includes('--webgl') && only(a).test(scene)), `no job watches ${scene} with WebGL`);
  for (const { key } of MOMENTS) assert.equal(jobArgs.filter((a) => a.includes('--moments') && only(a).test(key)).length, 1, `the ${key} moment in one job`);
});

test('CI’s parts of the scenes at rest are each of them once, of one count', () => {
  const shards = jobArgs.map((a) => a.match(/--shard (\d+)\/(\d+)/)).filter((m) => m !== null);
  const counts = new Set(shards.map((m) => Number(m[2])));
  assert.equal(counts.size, 1, `the parts are of one count, not ${[...counts].join(' and ')}`);
  assert.deepEqual(
    shards.map((m) => Number(m[1])).sort((a, b) => a - b),
    Array.from({ length: [...counts][0]! }, (_, i) => i + 1),
  );
  for (const a of jobArgs) if (a.includes('--shard')) assert.ok(!/--only|--webgl|--moments/.test(a), `a part of the scenes at rest is all of its scenes, WebGL refused: ${a}`);
});

test('CI runs the canary, and every moment has its window and a baseline at CI’s size', () => {
  assert.match(workflow, /if: \$\{\{ matrix\.canary \}\}\n\s+run: npm run sweep -- --redraws --canary .*--only/);
  assert.equal([...workflow.matchAll(/canary: true/g)].length, 1, 'in one job');
  const baseline = JSON.parse(readFileSync(new URL('../src/qa/redrawBaselines.json', import.meta.url), 'utf8'));
  assert.equal(baseline.size, 'desktop');
  for (const m of MOMENTS) {
    assert.ok(m.seconds > 0, `${m.key}’s window`);
    assert.ok(m.slack > 1 && m.slack <= 1.25, `${m.key}’s slack: from how far it moves run to run, not a floor`);
    assert.equal(typeof baseline.moments[m.key], 'number', `${m.key}’s baseline`);
  }
});

test('the CSS backdrop the check leaves undrawn without WebGL is still Background.svelte’s', () => {
  const bg = readFileSync(new URL('../src/components/Background.svelte', import.meta.url), 'utf8');
  assert.equal(CSS_BACKDROP, '.bg.css');
  assert.match(bg, /<div class="bg" class:css=\{!webgl\}/);
});

test('a moment fails past its slack times its baseline, and in CI with none', () => {
  assert.equal(overBaseline('deal', 22_000 * slackOf('deal'), 22_000), null);
  assert.ok(overBaseline('deal', 22_000 * slackOf('deal') + 1, 22_000));
  assert.match(overBaseline('dig', 7_000, 5_000) ?? '', new RegExp(`7k px drawn again a 60th of a second, past ${slackOf('dig')}× its baseline of 5k px`), 'no floor: a cheap moment grown fails too');
  assert.equal(overBaseline('new', 1e9, undefined), null, 'none yet, here');
  assert.match(overBaseline('new', 1, undefined, true) ?? '', /no baseline at this size .* “new”/, 'none, in CI');
});

// ---- what the effects can do to the page ------------------------------------

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rel = (file: string) => path.relative(ROOT, file).replaceAll(path.sep, '/');

/** The game's own files `file` imports, statically or lazily. */
function importsOf(file: string): string[] {
  const out: string[] = [];
  for (const m of readFileSync(file, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const to = path.resolve(path.dirname(file), m[1]!);
    const found = [to, `${to}.ts`, `${to}.svelte`, `${to}.js`, path.join(to, 'index.ts')].find((f) => /\.(ts|js|svelte)$/.test(f) && existsSync(f));
    if (found) out.push(found);
  }
  return out;
}

/** Every file `roots` run, through what they import. */
function reach(roots: string[]): Set<string> {
  const seen = new Set<string>();
  const next = roots.map((r) => path.join(ROOT, r));
  while (next.length) {
    const f = next.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    next.push(...importsOf(f));
  }
  return new Set([...seen].map(rel));
}

/**
 * Each screen's own components (App.svelte mounts them), for each of
 * src/qa/scene.ts SCREENS. The overlays are App's dialogs over the game
 * screen, its effects under them.
 */
const SCREEN_ROOTS: Record<string, string[]> = {
  home: ['src/components/Home.svelte'],
  lobby: ['src/components/Lobby.svelte'],
  game: ['src/components/Game.svelte', 'src/components/zonecard/ZoneCard.svelte'],
  over: ['src/components/GameOver.svelte'],
  codex: ['src/components/Codex.svelte'],
  settings: ['src/components/Settings.svelte'],
  overlay: [],
};

test('every screen that runs the effects has a scene watched with WebGL', () => {
  assert.deepEqual(
    Object.keys(SCREEN_ROOTS),
    SCREENS.map((s) => s.key),
    'a screen for each of SCREENS',
  );
  for (const [screen, roots] of Object.entries(SCREEN_ROOTS)) {
    for (const r of roots) assert.ok(existsSync(path.join(ROOT, r)), `${r}, ${screen}’s, is gone: say which component the screen is now`);
    const fx = [...reach(roots)].filter((f) => f.startsWith('src/lib/fx/'));
    if (!fx.length) continue;
    assert.ok(
      WEBGL_SCENES.some((w) => w.scene.startsWith(`${screen}/`)),
      `The ${screen} screen runs the effects (${fx.slice(0, 3).join(', ')}), and what they do to it is seen only with WebGL: add one of its scenes to WEBGL_SCENES (src/qa/redraws.ts) and to a WebGL job in .github/workflows/redraws.yml.`,
    );
  }
});

/**
 * Every place the effects (src/lib/fx/) write to the page itself, and why
 * it's seen: the shake, on App's .shell, every screen's, which a scene
 * that shakes watches (game/delve-dig, with WebGL); and their own canvas,
 * a layer of its own drawn in WebGL (moved or hidden, it draws nothing
 * else again). Anything else they write could draw the page again with
 * WebGL only, on whichever screen runs it: listed here once looked at.
 */
const FX_WRITES: Record<string, string> = {
  "if (layered) el.style.willChange = 'translate';": 'the shake',
  "el.style.translate = '';": 'the shake',
  "el.style.willChange = '';": 'the shake',
  "t.el.style.translate = x || y ? `${(x * t.k).toFixed(2)}px ${(y * t.k).toFixed(2)}px` : '';": 'the shake',
  "if (layer !== layered) t.el.style.willChange = layer ? 'translate' : '';": 'the shake',
  "canvas.style.visibility = on ? 'visible' : 'hidden';": 'their canvas',
  "if (canvas) canvas.style.visibility = 'hidden';": 'their canvas',
  "canvas.style.position = setInPage ? 'absolute' : '';": 'their canvas',
  'canvas.style.translate = at;': 'their canvas',
};

test('the effects write to the page only through the shake and their own canvas', () => {
  const dir = path.join(ROOT, 'src', 'lib', 'fx');
  const WRITE = /\.style\b|classList|(?:set|toggle|remove)Attribute|\.animate\(|dataset|className|innerHTML|textContent|\.(?:append|prepend|before|after|replaceWith|replaceChildren)\(|appendChild|insertBefore|\.remove\(\)/;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    readFileSync(path.join(dir, f), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*') || !WRITE.test(code)) return;
        assert.ok(FX_WRITES[code], `src/lib/fx/${f}:${i + 1} writes to the page: ${code}\nIf the effects can do it every frame, each screen that runs it needs a scene watched with WebGL (WEBGL_SCENES); then list it in FX_WRITES (tests/redraws.test.ts) with why it’s seen.`);
      });
  }
});
