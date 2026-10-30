// The redraw check (docs/qa.md, “Redraws”): what Chrome draws again, read
// from a trace of a QA frame at rest and of the card bench's moments, by
// the sweep (scripts/sweep.mjs --redraws). Every stutter of October 2026 was
// the same bug: something animated on the page's thread, with no layer of
// its own, had Chrome draw a big layer round it again on every frame (the
// emblems' kindle each sharp card face, the camera shake the whole page),
// while the screen looked nearly still. The page is watched on fixed frames
// (each 16.7 ms of its own time, however long it takes to draw), so what's
// drawn again is the same on any machine, CI's in software included, and
// the same run to run.
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
 * The CSS backdrop a page without WebGL falls back to (Background.svelte's
 * .bg, class:css): not drawn where WebGL is refused, so the page is watched
 * over the backdrop as players with WebGL have it (scripts/sweep.mjs,
 * refuseWebGL).
 */
export const CSS_BACKDROP = '.bg.css';

/**
 * The scenes watched at rest with WebGL on as well as off: one for each
 * screen whose effects (src/lib/fx/) change what the page itself does.
 * The rest refuse WebGL: drawn in software, as the check is, the backdrop
 * and the effects take a second or more a frame (25 ms without), and they
 * draw on canvases of their own, not on what Chrome draws again. Without
 * WebGL the page paints the backdrop's shadows in CSS, and its CSS
 * backdrop isn't drawn (CSS_BACKDROP).
 */
export const WEBGL_SCENES: { scene: string; why: string }[] = [
  { scene: 'game/delve-dig', why: 'A vein shakes the page (tremor.ts through fx/core.ts’s shake, a translate on .shell every frame): the effects’ own, so without WebGL it never runs. The October shake was this.' },
  { scene: 'home/returning', why: 'The start page’s daily streak lights in WebGL with the effects on and in CSS without (DailyStreak, onFxChange).' },
  { scene: 'over/n-lost', why: 'GameOver plays its lights in WebGL with the effects on and in CSS without (fxActive), and the winner’s row ignites in the effects.' },
  { scene: 'settings/key', why: 'Settings turns the effects on and off (html[data-still] holds the decorations still), and its seals light with them.' },
];

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

export const PAINTED: Painted[] = [
  // ---- once, as something shows: small, and over in a second or less
  { file: 'src/app.css', keyframes: ['filigree-in', 'edge-light'], why: 'Once, as a panel rises (0.5 s, its corner filigree drawn out) or a dialog opens (0.9 s, the light along its edge): a pseudo-element on the panel, nothing under it moving.' },
  { file: 'src/components/codex/CodexMedallion.svelte', keyframes: ['fill-arc'], why: 'Once, 1.6 s, as a medallion’s arc fills in the codex: a ring of a few dozen px.' },
  { file: 'src/components/DailyStreak.svelte', keyframes: ['warm'], why: 'Once, 0.45 s, as the streak warms on the start page: the streak’s own small box.' },
  { file: 'src/components/NamePlate.svelte', keyframes: ['spark'], why: 'Once, about a second, as a right answer’s spark runs along a name plate’s rules: thin strokes of a small svg.' },
  { file: 'src/components/Inventory.svelte', keyframes: ['lit', 'crumble'], why: 'Once, about a second, as a find in the pack lights up or crumbles: its count’s small icon.' },
  { file: 'src/components/RunsChart.svelte', keyframes: ['sink'], why: 'Once, as the chart’s shafts sink in on the end screen: each shaft its own clip.' },
  { file: 'src/components/Scoreboard.svelte', keyframes: ['down', 'bump'], why: 'Once, 0.7 s, as a score changes: one number’s colour and glow.' },
  { file: 'src/components/TimerRing.svelte', keyframes: ['flare-up'], why: 'Once, 0.8 s, as the clock flares: its number’s glow, inside the ring (56 × 56).' },
  { file: 'src/components/Toasts.svelte', keyframes: ['ignite', 'burn'], why: 'A toast’s edge kindling once (1.4 s), and its fuse burning down for as long as it shows: a line 1 px tall on the toast, now and then over a game.' },
  { file: 'src/components/VerdictSign.svelte', keyframes: ['draw'], why: 'Once, 0.35 s, as the verdict’s sign draws itself: one small svg path.' },
  { file: 'src/components/QuestionView.svelte', keyframes: ['verdict-in', 'verdict-sheen', 'verdict-ripple', 'verdict-flare', 'verdict-word', 'key-ripple'], why: 'Once, under a second, as the verdict shows (its box, its glyph, its word) or an option’s key is hovered: the verdict’s own box, about 300 × 60.' },
  { file: 'src/components/Phial.svelte', keyframes: ['shatter', 'blown'], why: 'Once, under a second, as a phial shatters: its pieces.' },
  {
    file: 'src/components/Game.svelte',
    keyframes: ['past-in', 'arrive', 'arrive-line'],
    why: 'Once, 0.7 to 0.9 s, as the banner’s heading arrives (each turn) and the line past it: measured in the deal, the heading (h2.start, 384 × 114) drawn again for about a third of the deal’s frames, 17k px a frame, the most of the deal’s baseline.',
  },
  { file: 'src/components/Lobby.svelte', keyframes: ['mode-off', 'mode-on'], why: 'No time at all (0 s): the WebGL backdrop’s fill for a mode, set as it changes.' },
  // ---- for as long as it shows
  { file: 'src/components/DelveLadder.svelte', keyframes: ['comet', 'reveal', 'draw', 'blend-stroke', 'blend-fill', 'blend-halo', 'blend-glory'], why: 'The ladder draws itself once as it shows (the comet, the reveal, the stars’ lines); a star for two bests drifts from gold to red and back, 7 s each way, for as long as it shows: a star’s lines on the ladder.' },
  { file: 'src/components/GameOver.svelte', keyframes: ['ignite'], why: 'Once, 1.2 s, as the winner’s row is set down: its edge kindles (its border’s colour), the row’s own box.' },
  { file: 'src/components/Phial.svelte', keyframes: ['glint'], why: 'A phial’s glint runs along its edge now and then, for as long as it shows: a stroke 16 px long on a small svg.' },
  { file: 'src/components/QuestionView.svelte', keyframes: ['glow'], why: 'An option picked and waiting for the verdict glows, 1 s a breath, for the moment the verdict takes: the WebGL backdrop’s shadow under it (custom properties it reads), not drawn by Chrome.' },
  { file: 'src/components/TimerRing.svelte', keyframes: ['lamp'], why: 'A vein’s lamp, the clock’s ring, flickers for as long as the clock runs: measured at rest in game/delve-dig, Chrome gives its circle a layer while the filter runs (56 × 56, a filter it animates by itself), and nothing is drawn again on most frames.' },
];

// ---- moments ----------------------------------------------------------------

/**
 * The moments that should cost a known amount, on the card bench's stage
 * (cards.html?stage): each is measured from when it's set off until it's
 * over, as the pixels drawn again a frame (`again` over the frames), and
 * fails past SLACK times its baseline (src/qa/redrawBaselines.json).
 * `webgl`: watched with the effects drawing (the deal, where the cards'
 * effects play), else with WebGL refused, as WEBGL_SCENES says why.
 */
export const MOMENTS = [
  { key: 'deal', label: 'A deal of three cards', webgl: true },
  { key: 'dig', label: 'A dig’s deal: the vein and the way out', webgl: false },
  { key: 'pick', label: 'A card picked', webgl: false },
] as const;
export type MomentKey = (typeof MOMENTS)[number]['key'];

/** How far past its baseline a moment may go. */
export const SLACK = 1.5;

/** A moment's measure against its baseline (taken as FLOOR at least, so one that costs next to nothing isn't failed for a little noise): what's wrong, else null. */
export function overBaseline(key: string, perFrame: number, baseline: number | undefined): string | null {
  if (baseline === undefined) return null;
  const limit = SLACK * Math.max(baseline, FLOOR);
  return perFrame > limit ? `${kpx(perFrame)} drawn again a frame, past ${SLACK}× its baseline of ${kpx(baseline)} (src/qa/redrawBaselines.json, “${key}”)` : null;
}

/** Pixels, short: 1.2M px, 34k px. */
export const kpx = (px: number) => (px >= 1e6 ? `${(px / 1e6).toFixed(1)}M px` : px >= 1e3 ? `${Math.round(px / 1e3)}k px` : `${Math.round(px)} px`);
