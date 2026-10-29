// The redraw check's reading of a trace (src/qa/redraws.ts; the sweep's
// --redraws traces the pages): which layers were drawn again, how much, and
// what fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLOOR, SLACK, atRest, layerName, overBaseline, readTrace, redraws, type TraceEvent } from '../src/qa/redraws.ts';

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

test('the trace is read a line an event, keeping only what is read', () => {
  const lines = ['{"traceEvents":[', `${JSON.stringify(raster(1, 1, '0xa'))},`, '{"name":"Other","ph":"X","pid":7,"ts":2},', `${JSON.stringify(snapshot(3, 1, []))}`, ']}'];
  const events = readTrace(lines.join('\n'));
  assert.deepEqual(
    events.map((e) => e.name),
    ['RasterTask', 'cc::LayerTreeHostImpl'],
  );
});

test('at rest, a layer drawn again on nearly every frame fails', () => {
  const l = { id: 5, name: 'div.stage', w: 1393, h: 594, node: 1, commits: 19, px: 20 * 400_000, again: 19 * 400_000 };
  assert.match(atRest('game/delve-dig', l, 20) ?? '', /div\.stage \(1393×594\) drawn again on 95% of the frames at rest, 400k px a frame/);
  assert.equal(atRest('game/delve-dig', { ...l, commits: 14 }, 20), null, 'a light that sweeps now and then');
  assert.equal(atRest('game/delve-dig', l, 4), null, 'too few frames to tell');
  assert.equal(atRest('home/returning', { ...l, name: 'svg.glow', w: 156, h: 108, px: 20 * 21_000, again: 19 * 21_000 }, 20), null, 'too small to feel');
  assert.equal(atRest('settings/key', { ...l, name: 'div.shell' }, 20), null, 'allowed there');
  assert.match(atRest('game/turns-question', { ...l, name: 'div.shell' }, 20) ?? '', /div\.shell/, 'but not elsewhere');
});

test('a moment fails past its baseline, taken as at least the floor', () => {
  assert.equal(overBaseline('deal', 30_000, 22_000), null);
  assert.equal(overBaseline('deal', SLACK * FLOOR - 1, 1000), null, 'a moment that costs next to nothing is held to the floor');
  assert.match(overBaseline('deal', 666_000, 22_000) ?? '', /666k px drawn again a frame, past 1\.5× its baseline of 22k px/);
  assert.equal(overBaseline('new', 1e9, undefined), null, 'none yet');
});
