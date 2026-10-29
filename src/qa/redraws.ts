// The redraw check (docs/qa.md, “Redraws”): what Chrome draws again, read
// from a trace of a QA frame at rest and of the card bench's moments, by
// the sweep (scripts/sweep.mjs --redraws). Every stutter of October 2026 was
// the same bug: something animated on the page's thread, with no layer of
// its own, had Chrome draw a big layer round it again on every frame (the
// emblems' kindle each sharp card face, the camera shake the whole page),
// while the screen looked nearly still. How often a layer is drawn again,
// and how much of it, doesn't depend on how fast the machine is, so it holds
// in CI as fps doesn't.
//
// Read from the trace's raster tasks (each a tile of a layer drawn for a
// commit of the page's) and the frame viewer's snapshots of the layer tree
// (each layer's name and size, each tile's rect, what each commit
// invalidated), both of the page's renderer only.

/** A trace event, as much of it as is read here. */
export interface TraceEvent {
  name: string;
  ph: string;
  pid: number;
  ts: number;
  /** (Whatever each event carries.) */
  args?: any;
}

/** The events of a trace that are read here, from its JSON (the trace's own one-event-a-line form, else parsed whole). */
export function readTrace(json: string): TraceEvent[] {
  const wanted = (line: string) => line.includes('"RasterTask"') || line.includes('"cc::LayerTreeHostImpl"');
  const out: TraceEvent[] = [];
  for (const line of json.split('\n')) {
    if (!wanted(line)) continue;
    try {
      out.push(JSON.parse(line.trim().replace(/,$/, '')));
    } catch {
      // Not one event a line after all.
      const all = JSON.parse(json);
      return ((Array.isArray(all) ? all : all.traceEvents) as TraceEvent[]).filter((e) => e.name === 'RasterTask' || e.name === 'cc::LayerTreeHostImpl');
    }
  }
  return out;
}

/** One layer's redraws over the time traced. */
export interface LayerRedraws {
  id: number;
  /** As Chrome names it, its element's tag and classes (`div.stage`), or what it is (`the page's background`). */
  name: string;
  /** Its size (CSS pixels, as laid out). */
  w: number;
  h: number;
  /** The DOM node it draws (a backend node id), if any. */
  node: number | null;
  /** How many of the page's commits drew some of it again. */
  commits: number;
  /** Device pixels drawn. */
  px: number;
  /** Of those, the pixels of tiles drawn already in the time traced: drawn again, rather than first shown. */
  again: number;
}

export interface Redraws {
  layers: LayerRedraws[];
  /** Over every layer. */
  px: number;
  again: number;
}

type Rect = [number, number, number, number];
const area = (r: Rect) => Math.max(0, r[2]) * Math.max(0, r[3]);
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
const rects = (flat: number[] | undefined): Rect[] => {
  const out: Rect[] = [];
  for (let i = 0; flat && i + 3 < flat.length; i += 4) out.push([flat[i]!, flat[i + 1]!, flat[i + 2]!, flat[i + 3]!]);
  return out;
};

/**
 * A layer's name as Chrome gives it ("LayoutFlexibleBox (relative
 * positioned) DIV class='stage svelte-2yhvza'"), short: its element's tag
 * and classes, Svelte's own left out (`div.stage`).
 */
export function layerName(raw: string | undefined): string {
  if (!raw) return 'a layer of no element';
  if (raw.includes('LayoutView #document')) return 'the page’s background';
  const m = raw.match(/(?:^|\s)([A-Za-z][\w-]*|::[\w-]+)((?: (?:id|class)='[^']*')*)$/);
  if (!m) return raw;
  const id = m[2]!.match(/id='([^']*)'/)?.[1];
  const classes = (m[2]!.match(/class='([^']*)'/)?.[1] ?? '').split(/\s+/).filter((c) => c && !/^svelte-/.test(c));
  return `${m[1]!.startsWith('::') ? m[1] : m[1]!.toLowerCase()}${id ? `#${id}` : ''}${classes.map((c) => `.${c}`).join('')}`;
}

/** The renderer the page draws in: the one whose layer tree has the document. */
function pageRenderer(events: TraceEvent[]): number | null {
  for (const e of events) if (e.name === 'cc::LayerTreeHostImpl' && e.args?.snapshot?.active_tree?.layers?.some((l: { layer_name?: string }) => l.layer_name?.includes('#document'))) return e.pid;
  return null;
}

/**
 * Every layer drawn again in `events` (readTrace's), and how much: each
 * raster task a tile of its layer, as large as the tile, or where the tile
 * was there already and its commit invalidated only part of it, that part
 * (Chrome draws only that again).
 */
export function redraws(events: TraceEvent[]): Redraws {
  const pid = pageRenderer(events);
  const mine = events.filter((e) => e.pid === pid).sort((a, b) => a.ts - b.ts);
  type Tile = { layer: number; rect: Rect; scale: number };
  /** Each snapshot's time and tiles by id. (An id is the tile's address, used again for another tile once it's gone.) */
  const snaps: { ts: number; tiles: Map<string, Tile> }[] = [];
  type Layer = { name: string; named: boolean; w: number; h: number; node: number | null };
  const layers = new Map<number, Layer>();
  /** What each commit (its source frame number) invalidated, by layer. */
  const invalid = new Map<number, Map<number, Rect[]>>();
  for (const e of mine) {
    if (e.name !== 'cc::LayerTreeHostImpl') continue;
    const snap = e.args?.snapshot;
    const tree = snap?.active_tree;
    if (!tree) continue;
    const tiles = new Map<string, Tile>();
    for (const t of snap.active_tiles ?? []) if (t.content_rect) tiles.set(String(t.id).replace(/^.*\//, ''), { layer: t.layer_id, rect: t.content_rect, scale: t.contents_scale ?? 1 });
    snaps.push({ ts: e.ts, tiles });
    const byLayer = new Map<number, Rect[]>();
    for (const l of tree.layers ?? []) {
      // (Named in some snapshots only.)
      if (!layers.has(l.layer_id) || (l.layer_name && !layers.get(l.layer_id)!.named)) layers.set(l.layer_id, { name: layerName(l.layer_name), named: !!l.layer_name, w: l.bounds?.width ?? 0, h: l.bounds?.height ?? 0, node: l.owner_node ?? null });
      if (l.invalidation?.length) byLayer.set(l.layer_id, rects(l.invalidation));
    }
    if (!invalid.has(tree.source_frame_number)) invalid.set(tree.source_frame_number, byLayer);
  }
  /** The first snapshot after `ts`. */
  const after = (ts: number) => {
    let lo = 0;
    let hi = snaps.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (snaps[mid]!.ts <= ts) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  /** The tile a raster task drew: the one of its id and layer in the snapshot next after it (drawn for the tree to come, it shows there), else the nearest before; and whether it was there already, as large, before. */
  const tileOf = (id: string, layer: number, ts: number) => {
    const at = after(ts);
    for (const i of [at, at + 1, at + 2, at - 1, at - 2]) {
      const t = snaps[i]?.tiles.get(id);
      if (t?.layer !== layer) continue;
      const before = snaps[Math.min(at, i) - 1]?.tiles.get(id);
      return { tile: t, there: !!before && before.layer === layer && before.rect.join() === t.rect.join() };
    }
    return null;
  };
  const out = new Map<number, LayerRedraws & { at: Set<number> }>();
  const drawn = new Set<string>();
  for (const e of mine) {
    if (e.name !== 'RasterTask') continue;
    const d = e.args?.tileData;
    if (!d) continue;
    const found = tileOf(String(d.tileId?.id_ref), d.layerId, e.ts);
    const tile = found?.tile;
    const layer = layers.get(d.layerId);
    let px: number;
    if (!tile) px = layer ? Math.min(layer.w * layer.h, 256 * 256) : 256 * 256;
    else {
      px = area(tile.rect);
      // A tile there before this commit, drawn again only where the commit invalidated it.
      const inv = invalid.get(d.sourceFrameNumber)?.get(d.layerId);
      if (inv && found.there) {
        const part = inv.reduce((a, r) => a + overlap([r[0] * tile.scale, r[1] * tile.scale, r[2] * tile.scale, r[3] * tile.scale], tile.rect), 0);
        if (part > 0) px = Math.min(px, part);
      }
    }
    const key = `${d.layerId}|${tile ? tile.rect.join(',') : d.tileId?.id_ref}`;
    const again = drawn.has(key);
    drawn.add(key);
    const r = out.get(d.layerId) ?? { id: d.layerId, name: layer?.name ?? `layer ${d.layerId}`, w: layer?.w ?? 0, h: layer?.h ?? 0, node: layer?.node ?? null, commits: 0, px: 0, again: 0, at: new Set<number>() };
    r.at.add(d.sourceFrameNumber);
    r.commits = r.at.size;
    r.px += px;
    if (again) r.again += px;
    out.set(d.layerId, r);
  }
  const list = [...out.values()].map(({ at: _, ...r }) => r).sort((a, b) => b.px - a.px);
  return { layers: list, px: list.reduce((a, l) => a + l.px, 0), again: list.reduce((a, l) => a + l.again, 0) };
}

// ---- at rest ----------------------------------------------------------------

/** At rest, a layer drawn again in more than this share of the frames is drawn every frame, near enough. */
export const MOST_FRAMES = 0.5;
/** Fewer frames than this in the time watched and nothing can be said (a page that stalled). */
export const FEWEST_FRAMES = 8;

/**
 * What may be drawn again on most frames at rest, and why. `layer` is the
 * layer's short name (layerName); `scenes` the scenes it may be in (all if
 * none); `px` the most it may draw a frame, so a small thing allowed here
 * doesn't let something big on the same layer through.
 */
export interface Allowed {
  layer: RegExp;
  scenes?: RegExp;
  px: number;
  why: string;
}

export const ALLOWED: Allowed[] = [];

/** A layer drawn again on most of `frames` frames at rest, unless allowed: what's wrong, else null. */
export function atRest(scene: string, l: LayerRedraws, frames: number): string | null {
  if (frames < FEWEST_FRAMES || l.commits <= frames * MOST_FRAMES) return null;
  const perFrame = l.px / frames;
  if (ALLOWED.some((a) => a.layer.test(l.name) && (!a.scenes || a.scenes.test(scene)) && perFrame <= a.px)) return null;
  return `${l.name} (${l.w}×${l.h}) drawn again on ${Math.round((Math.min(l.commits, frames) / frames) * 100)}% of the frames at rest, ${kpx(perFrame)} a frame`;
}

// ---- what's painted ---------------------------------------------------------

/**
 * The animations of what's painted (anything but a transform or opacity) on
 * an element with no layer of its own, which tests/ownLayers.test.ts lets
 * through, and why: each draws again, every frame it runs, the layer it's
 * painted on, so each says how much that is, from the redraw check where it
 * measured it. A new one gets will-change instead, unless it's as small.
 */
export interface Painted {
  /** The stylesheet (a component's, or a .css file), from the repository's root. */
  file: string;
  keyframes: string[];
  why: string;
}

export const PAINTED: Painted[] = [];

// ---- moments ----------------------------------------------------------------

/**
 * The moments that should cost a known amount, on the card bench's stage
 * (cards.html?stage): each is measured from when it's set off until it's
 * over, as the pixels drawn again a frame (`again` over the frames), and
 * fails past SLACK times its baseline (src/qa/redraws.json).
 */
export const MOMENTS = [
  { key: 'deal', label: 'A deal of three cards' },
  { key: 'dig', label: 'A dig’s deal: the vein and the way out' },
  { key: 'pick', label: 'A card picked' },
] as const;
export type MomentKey = (typeof MOMENTS)[number]['key'];

/** How far past its baseline a moment may go. */
export const SLACK = 1.5;
/** A baseline is taken as at least this (device pixels a frame: a 220 px square), so a moment that costs next to nothing isn't failed for a little noise. */
export const FLOOR = 50_000;

/** A moment's measure against its baseline: what's wrong, else null. */
export function overBaseline(key: string, perFrame: number, baseline: number | undefined): string | null {
  if (baseline === undefined) return null;
  const limit = SLACK * Math.max(baseline, FLOOR);
  return perFrame > limit ? `${kpx(perFrame)} drawn again a frame, past ${SLACK}× its baseline of ${kpx(baseline)} (src/qa/redraws.json, “${key}”)` : null;
}

/** Pixels, short: 1.2M px, 34k px. */
export const kpx = (px: number) => (px >= 1e6 ? `${(px / 1e6).toFixed(1)}M px` : px >= 1e3 ? `${Math.round(px / 1e3)}k px` : `${Math.round(px)} px`);
