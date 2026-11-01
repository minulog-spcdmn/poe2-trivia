// The redraw check (docs/qa.md, “Redraws”): what Chrome draws again, read
// from a trace of a QA frame at rest and of the card bench's moments, by
// the sweep (scripts/sweep.mjs --redraws). Every stutter of October 2026 was
// the same bug: something animated on the page's thread, with no layer of
// its own, had Chrome draw a big layer round it again on every frame (the
// emblems' kindle each sharp card face, the camera shake the whole page),
// while the screen looked nearly still. The page is watched on fixed frames
// (each 16.7 ms of its own time, however long it takes to draw), so what's
// drawn again plays out as at 60 fps on any machine, CI's in software
// included, and at rest the same run to run.
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

/** The events read here. */
const READ = ['RasterTask', 'cc::LayerTreeHostImpl'];
const isRead = (e: TraceEvent | undefined) => !!e && READ.includes(e.name);

/** A trace's bytes as Playwright gives them (Node's Buffer): as much of one as is used here. */
export interface TraceBytes {
  length: number;
  indexOf(text: string, from?: number): number;
  lastIndexOf(text: string, from?: number): number;
  toString(encoding: 'utf8', start: number, end: number): string;
}

/**
 * The events of a trace that are read here, from its JSON: one event a
 * line, as Chrome writes it, and only the lines that name one are made
 * into strings. (A watch with WebGL traces 200 MB; past about 512 MB the
 * whole would be longer than V8 makes a string.) Not one event a line
 * after all, it's parsed whole.
 */
export function readTrace(trace: string | TraceBytes): TraceEvent[] {
  const text = (start: number, end: number) => (typeof trace === 'string' ? trace.slice(start, end) : trace.toString('utf8', start, end));
  const lines = new Set<number>();
  for (const name of READ) for (let i = trace.indexOf(`"${name}"`); i >= 0; i = trace.indexOf(`"${name}"`, i + 1)) lines.add(trace.lastIndexOf('\n', i) + 1);
  const whole = (all: any) => ((Array.isArray(all) ? all : all.traceEvents) as TraceEvent[]).filter(isRead);
  const out: TraceEvent[] = [];
  for (const start of [...lines].sort((a, b) => a - b)) {
    const end = trace.indexOf('\n', start);
    let e;
    try {
      e = JSON.parse(text(start, end < 0 ? trace.length : end).trim().replace(/,$/, ''));
    } catch {
      return whole(JSON.parse(text(0, trace.length)));
    }
    // (The whole trace on one line; or a line that names one only in another event's arguments.)
    if (Array.isArray(e) || e?.traceEvents) return whole(e);
    if (isRead(e)) out.push(e);
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
  /** What was read: whether the trace had the page's renderer, how many of its layer trees and tiles drawn (unread() says what's missing). */
  read: { renderer: boolean; snapshots: number; tiles: number };
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
  const read = { renderer: pid !== null, snapshots: snaps.length, tiles: mine.filter((e) => e.name === 'RasterTask' && e.args?.tileData).length };
  return { layers: list, px: list.reduce((a, l) => a + l.px, 0), again: list.reduce((a, l) => a + l.again, 0), read };
}

/**
 * The layer the sweep draws in every watch (scripts/sweep.mjs, mark), so
 * a trace always has a tile drawn that's known: its name as layerName
 * gives it.
 */
export const MARK = 'div#redraw-mark';

/**
 * Whether `r` read what the trace of a watch always has: the page's
 * renderer, its layer trees, tiles drawn, and among them the mark's (MARK).
 * If not, what's missing, else null: a trace read as nothing would pass
 * every limit, so it fails instead (its format changed, as an update to
 * Chrome or Playwright can make it).
 */
export function unread(r: Redraws): string | null {
  const missing = !r.read.renderer
    ? 'nothing of the page’s renderer (no layer tree with the document)'
    : !r.read.snapshots
      ? 'no layer tree'
      : !r.read.tiles
        ? 'no tile drawn'
        : !r.layers.some((l) => l.name === MARK)
          ? `no tile of the mark (${MARK}), drawn in every watch`
          : null;
  return missing && `the trace has ${missing}: its format may have changed (an update to Chrome or Playwright); src/qa/redraws.ts reads it`;
}

/** `r` with the mark (MARK) left out: it's the sweep's, not the page's. */
export function withoutMark(r: Redraws): Redraws {
  const mark = r.layers.filter((l) => l.name === MARK);
  const sum = (k: 'px' | 'again') => mark.reduce((a, l) => a + l[k], 0);
  return { ...r, layers: r.layers.filter((l) => l.name !== MARK), px: r.px - sum('px'), again: r.again - sum('again') };
}

// ---- at rest ----------------------------------------------------------------

/**
 * The least a layer may draw again a frame (device pixels: a 220 px square)
 * before it counts, at rest and in a moment: nothing a frame's budget feels.
 */
export const FLOOR = 50_000;

/**
 * At rest, a layer drawn again FLOOR px a frame or more, over the frames
 * watched: what's wrong, else null. At rest nothing big should be drawn
 * again at all, so there's no share of the frames it may take: a light
 * that passes over a big layer now and then counts for the time it takes
 * (GameOver's gleam drew the page again a quarter of the time, 67k px a
 * frame), and one that keeps to a small layer of its own is let be.
 */
export function atRest(l: LayerRedraws, frames: number): string | null {
  const perFrame = l.again / Math.max(1, frames);
  if (perFrame < FLOOR) return null;
  return `${l.name} (${l.w}×${l.h}) drawn again ${kpx(perFrame)} a frame at rest, on ${Math.round((Math.min(l.commits, frames) / frames) * 100)}% of the frames`;
}

/**
 * The most the whole page may draw again a frame at rest, its layers
 * together: two layers' FLOOR. Each layer is held to FLOOR, but many small
 * ones each under it (three cards at 40k, twenty rows at 10k) cost a frame
 * as much as a big one. (The most a scene draws again in CI is GameOver's
 * gleam, on two layers of its own: 76k px a frame with WebGL, when a whole
 * pass falls in the 2 s watched.)
 */
export const PAGE_FLOOR = 2 * FLOOR;

/** At rest, the page drawn again PAGE_FLOOR px a frame or more, its layers together (`again` over `frames`): what's wrong, else null. */
export function pageAtRest(again: number, frames: number, layers: LayerRedraws[]): string | null {
  const perFrame = again / Math.max(1, frames);
  if (perFrame < PAGE_FLOOR) return null;
  const most = [...layers]
    .sort((a, b) => b.again - a.again)
    .slice(0, 4)
    .map((l) => `${l.name} ${kpx(l.again / Math.max(1, frames))}`)
    .join(', ');
  return `the page drawn again ${kpx(perFrame)} a frame at rest, its layers together (most: ${most})`;
}

/**
 * The CSS backdrop a page without WebGL falls back to (Background.svelte's
 * .bg, class:css): not drawn where WebGL is refused, so the page is watched
 * over the backdrop as players with WebGL have it (scripts/sweep.mjs,
 * refuseWebGL). Drawn, it has the Codex's empty Delve pages draw their rune
 * circle again, a cost only a player without WebGL has: #339.
 */
export const CSS_BACKDROP = '.bg.css';

/**
 * The scenes watched at rest with WebGL on as well as off: one for each
 * screen whose effects (src/lib/fx/) change what the page itself does.
 * The rest refuse WebGL: the backdrop and the effects draw on canvases of
 * their own, not on what Chrome draws again, and drawn in software, as the
 * check is, they're the slowest part of a frame. Without
 * WebGL the page paints the backdrop's shadows in CSS, and its CSS
 * backdrop isn't drawn (CSS_BACKDROP).
 */
export const WEBGL_SCENES: { scene: string; why: string }[] = [
  { scene: 'game/delve-dig', why: 'A vein shakes the page (tremor.ts through fx/core.ts’s shake, a translate on .shell every frame): the effects’ own, so without WebGL it never runs. The October shake was this.' },
  { scene: 'home/returning', why: 'The start page’s daily streak lights in WebGL with the effects on and in CSS without (DailyStreak, onFxChange).' },
  { scene: 'over/n-lost', why: 'GameOver plays its lights in WebGL with the effects on and in CSS without (fxActive), and the winner’s row ignites in the effects.' },
  { scene: 'settings/key', why: 'Settings turns the effects on and off (html[data-still] holds the decorations still), and its seals light with them.' },
  { scene: 'lobby/room', why: 'The lobby lights its seats in the effects as players arrive (fx/moments.ts creatorArrived, playerArrived): the effects’ own, so without WebGL they never run.' },
  { scene: 'codex/item', why: 'An item’s art lights in the effects as it’s revealed (CodexItem, fx/moments.ts artRevealed).' },
];

// ---- moments ----------------------------------------------------------------

/**
 * The moments that should cost a known amount, each watched for `seconds`
 * of the page's time from when it's set off, a window as long as the
 * moment with its pen's last stroke (written from script, so no animation
 * says when it's over), and the same length each run: what it draws again
 * a 60th of a second over that window, failed past SLACK times its
 * baseline (src/qa/redrawBaselines.json). A fixed window, so a moment that
 * grows longer (a fade added after it) can't thin what it draws over more
 * frames. On the card bench's stage (cards.html?stage) but the plate, on
 * its bench (qa.html?b=plate). `webgl`: watched with the effects drawing
 * (the deal, where the cards' effects play), else with WebGL refused, as
 * WEBGL_SCENES says why. `hz`: the screen's rate it's watched at. The
 * plate's at 240, a fast screen's: its lines drew in by CSS animations,
 * which Chrome draws at the screen's rate, where the pen draws at its own
 * (lib/drawIn), so at 60 the two cost the same and only a fast screen
 * tells them apart.
 */
export const MOMENTS = [
  { key: 'deal', label: 'A deal of three cards', webgl: true, hz: 60, seconds: 3 },
  { key: 'dig', label: 'A dig’s deal: the vein and the way out', webgl: false, hz: 60, seconds: 3 },
  { key: 'pick', label: 'A card picked', webgl: false, hz: 60, seconds: 4 },
  { key: 'glare', label: 'The pointer across a card', webgl: false, hz: 60, seconds: 2 },
  { key: 'plate', label: 'A name plate drawn in, at 240 Hz', webgl: false, hz: 240, seconds: 3 },
] as const;

/**
 * How far past its baseline a moment may go. On virtual time from before
 * the page loads, with its chance and date seeded, a moment measures the
 * same run to run: in two runs on CI the pick, the pointer and the plate
 * never moved, the dig moved 0.7% and the deal (with WebGL) 1.7%. A tenth
 * is six times the widest of those; the least of October's stutters was
 * three times its moment's cost (the plate's lines).
 */
export const SLACK = 1.1;

/**
 * A moment's measure against its baseline: what's wrong, else null. With
 * none (a new moment, or the baselines at another size than the one
 * watched), what's wrong if `required` (in CI), else null.
 */
export function overBaseline(key: string, perFrame: number, baseline: number | undefined, required = false): string | null {
  if (baseline === undefined) return required ? `no baseline at this size in src/qa/redrawBaselines.json for “${key}”: add the measure from this job’s summary` : null;
  return perFrame > SLACK * baseline ? `${kpx(perFrame)} drawn again a 60th of a second, past ${SLACK}× its baseline of ${kpx(baseline)} (src/qa/redrawBaselines.json, “${key}”)` : null;
}

/** Pixels, short: 1.2M px, 34k px. */
export const kpx = (px: number) => (px >= 1e6 ? `${(px / 1e6).toFixed(1)}M px` : px >= 1e3 ? `${Math.round(px / 1e3)}k px` : `${Math.round(px)} px`);
