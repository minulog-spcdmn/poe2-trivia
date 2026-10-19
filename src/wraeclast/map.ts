// The Wraeclast run's region (wraeclast.html, src/wraeclast): v5's open map
// of 14 places, the camp to the lair. Which places, what each is and the
// links between them are a constant here (the v5 handoff's table: the links
// are the Gabriel graph of the real spots, none cross); where each sits comes
// from src/data/wraeclast.json (the owner's placements, left as they are),
// scaled to these 14 places' box. A place's ring is how many links it lies
// from the lair: the corruption spreads out ring by ring. Pure.

import mapData from '../data/wraeclast.json' with { type: 'json' };

export type PlaceKind = 'camp' | 'town' | 'zone' | 'lair';

export interface RegionPlace {
  id: string;
  name: string;
  kind: PlaceKind;
  /** Where it sits in the region's box, 0 to 1 across and down (the screen adds its own inset for the labels). */
  x: number;
  y: number;
  /** Links from the lair (the lair 0). */
  ring: number;
  links: string[];
}

/** The region, as the v5 handoff lists it: each place's kind and the places next to it. */
const TABLE: [id: string, kind: PlaceKind, links: string[]][] = [
  ['clearfell-encampment', 'camp', ['the-red-vale', 'maraketh', 'the-halani-gates']],
  ['the-red-vale', 'zone', ['clearfell-encampment', 'kaom-s-stronghold']],
  ['maraketh', 'zone', ['clearfell-encampment', 'the-halani-gates']],
  ['kaom-s-stronghold', 'zone', ['the-red-vale', 'the-library', 'kriar-village']],
  ['the-halani-gates', 'zone', ['clearfell-encampment', 'maraketh', 'ziggurat-encampment', 'the-fellshrine-ruins']],
  ['the-library', 'zone', ['kaom-s-stronghold', 'ziggurat-encampment', 'kriar-village', 'the-weaver-s-chambers']],
  ['kriar-village', 'zone', ['kaom-s-stronghold', 'the-library', 'the-weaver-s-chambers', 'the-karui-fortress']],
  ['ziggurat-encampment', 'town', ['the-halani-gates', 'the-library', 'the-fellshrine-ruins', 'the-weaver-s-chambers', 'the-forest-encampment']],
  ['the-fellshrine-ruins', 'zone', ['the-halani-gates', 'ziggurat-encampment', 'heart-of-the-tribe']],
  ['the-weaver-s-chambers', 'zone', ['the-library', 'ziggurat-encampment', 'kriar-village', 'the-forest-encampment', 'the-karui-fortress']],
  ['the-karui-fortress', 'zone', ['kriar-village', 'the-weaver-s-chambers', 'the-forest-encampment']],
  ['the-forest-encampment', 'town', ['ziggurat-encampment', 'the-weaver-s-chambers', 'the-karui-fortress', 'the-cathedral-rooftop']],
  ['heart-of-the-tribe', 'zone', ['the-fellshrine-ruins', 'the-cathedral-rooftop']],
  ['the-cathedral-rooftop', 'lair', ['heart-of-the-tribe', 'the-forest-encampment']],
];

const SPOTS = new Map((mapData as { nodes: { id: string; name: string; x: number; y: number }[] }).nodes.map((n) => [n.id, n]));

function build() {
  const raw = TABLE.map(([id, kind, links]) => {
    const spot = SPOTS.get(id);
    if (!spot) throw new Error(`wraeclast.json has no ${id}`);
    return { id, name: spot.name, kind, sx: spot.x, sy: spot.y, links };
  });
  const xs = raw.map((p) => p.sx);
  const ys = raw.map((p) => p.sy);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const lair = raw.find((p) => p.kind === 'lair')!;
  // Rings: a breadth-first walk from the lair.
  const ring = new Map([[lair.id, 0]]);
  const byRaw = new Map(raw.map((p) => [p.id, p]));
  for (let queue = [lair.id]; queue.length; ) {
    const id = queue.shift()!;
    for (const to of byRaw.get(id)!.links) if (!ring.has(to)) ring.set(to, ring.get(id)! + 1), queue.push(to);
  }
  const places: RegionPlace[] = raw.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    x: (p.sx - x0) / Math.max(1e-6, x1 - x0),
    y: (p.sy - y0) / Math.max(1e-6, y1 - y0),
    ring: ring.get(p.id) ?? 99,
    links: p.links,
  }));
  const byId = new Map(places.map((p) => [p.id, p]));
  return { places, byId, camp: places.find((p) => p.kind === 'camp')!, lair: byId.get(lair.id)! };
}

/** The region: its places, each by id, the camp and the lair. */
export const REGION = build();

/** The links, each once (a before b by the table's order), for drawing. */
export const LINKS: [string, string][] = REGION.places.flatMap((p, i) => p.links.filter((to) => REGION.places.findIndex((q) => q.id === to) > i).map((to) => [p.id, to] as [string, string]));

// ---- Laying the region out on a screen ----

/** The plate's sizes: each place's mark, its label's font and widest line, and the inset that keeps labels inside. */
export const PLATE = { node: 24, big: 30, font: 11, lineH: 12.5, labelMax: 86, insetX: 44, insetTop: 34, insetBottom: 34, gap: 3 };

export type LabelSide = 'below' | 'above' | 'right' | 'left';

export interface RegionLayout {
  /** Each place's centre, px. */
  at: Record<string, { x: number; y: number }>;
  /** Each place's label: its side, its lines (as estimated), its box. */
  labels: Record<string, { side: LabelSide; lines: string[]; x: number; y: number; w: number; h: number }>;
}

/** About how wide a run of text sets at the label's font (EB Garamond's average letter). */
const textW = (text: string) => text.length * PLATE.font * 0.5;

/** A name in lines of at most labelMax, word by word. */
function wrap(name: string): string[] {
  const lines: string[] = [];
  for (const w of name.split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && textW(`${last} ${w}`) <= PLATE.labelMax) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  return lines;
}

type Box = { x: number; y: number; w: number; h: number };
const meets = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The region on a plate `width` by `height` px: each place where the owner
 * placed it, scaled into the plate less its inset, and each label below its
 * mark, or above, right or left where below would cover another mark or
 * label (the first side clear, in that order; below when none is).
 */
export function layoutRegion(width: number, height: number): RegionLayout {
  const z = PLATE;
  const at: RegionLayout['at'] = {};
  for (const p of REGION.places) {
    at[p.id] = { x: z.insetX + p.x * Math.max(0, width - 2 * z.insetX), y: z.insetTop + p.y * Math.max(0, height - z.insetTop - z.insetBottom) };
  }
  const size = (p: RegionPlace) => (p.kind === 'zone' ? z.node : z.big);
  const taken: Box[] = REGION.places.map((p) => ({ x: at[p.id].x - size(p) / 2, y: at[p.id].y - size(p) / 2, w: size(p), h: size(p) }));
  const labels: RegionLayout['labels'] = {};
  // Top to bottom, so a label above finds the ones over it laid already.
  for (const p of [...REGION.places].sort((a, b) => a.y - b.y)) {
    const lines = wrap(p.name);
    const w = Math.min(z.labelMax, Math.max(...lines.map(textW))) + 8;
    const h = lines.length * z.lineH + 3;
    const { x, y } = at[p.id];
    const r = size(p) / 2 + z.gap;
    const boxes: Record<LabelSide, Box> = {
      below: { x: x - w / 2, y: y + r, w, h },
      above: { x: x - w / 2, y: y - r - h, w, h },
      right: { x: x + r, y: y - h / 2, w, h },
      left: { x: x - r - w, y: y - h / 2, w, h },
    };
    const inside = (b: Box) => b.x >= 0 && b.y >= 0 && b.x + b.w <= width && b.y + b.h <= height;
    const own = REGION.places.indexOf(p);
    const others = taken.filter((_, i) => i !== own);
    const side = (['below', 'above', 'right', 'left'] as const).find((sd) => inside(boxes[sd]) && !others.some((o) => meets(o, boxes[sd]))) ?? 'below';
    const box = boxes[side];
    taken.push(box);
    labels[p.id] = { side, lines, ...box };
  }
  return { at, labels };
}
