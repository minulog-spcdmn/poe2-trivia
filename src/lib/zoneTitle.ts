// Delve: what the title card that names a new zone says, and how it moves
// (components/zonecard/ZoneCard.svelte plays it in the plunge into the zone,
// lib/zoneTitleTiming.ts times it). Pure, so it can be tested: for any depth
// that opens a zone, its name, a subtitle of one line, a meta line, what is
// new from there on (up to three things, each with a mark), and its
// treatment: the family of motion it is shown with (embers off a fire zone,
// rime on an ice one, the void pulling its letters together...), which every
// zone and every kind of place past depth 100 takes after its own look.

import { accentAt, stratumName } from './descent.ts';
import { biomeAt } from './backdrops.ts';
import { delveLockout, delveRules, delveTimer, findChance, opensZone, shownDepth, FIND_FADE_FROM, FINDS_IN_ORDER, type FindKind } from './delve.ts';
import { roman } from './roman.ts';
import type { Sfx } from './sound.ts';

/**
 * The families of motion a zone's name can be shown with: it burns (ember),
 * frosts over and shatters (rime), drifts in on the air like spores (spore),
 * is pulled together out of fragments (void), is lit like lamps (light), or
 * rises out of fumes (fume).
 */
export type Family = 'ember' | 'rime' | 'spore' | 'void' | 'light' | 'fume';

/**
 * A family's variations, each a few parameters rather than a motion of its
 * own: blue fire (Primeval Ruins), fire under the ice (Glacial pyre), green
 * witchfire, a red eclipse, lamps lit by unseen hands, a drowned temple's
 * ripple, falling stars, and stone that crumbles (Petrified Forest).
 */
export type Variant = 'blue' | 'pyre' | 'witchfire' | 'eclipse' | 'lanterns' | 'tide' | 'starfall' | 'crumble';

export type Treatment = {
  family: Family;
  variants: Variant[];
  /** The name's letter-spacing (em). */
  track: number;
  /** The name's colour: the zone's accent, this share of it, mixed into this light. */
  nameMix: [number, string];
  /** The glow under the name: how soft (px) and how bright at the lock (0 to 1). */
  glowBlur: number;
  glowPeak: number;
  /** How long each letter of the name takes to come in (ms). */
  letterMs: number;
  /** The sound it leaves with. */
  tint: Sfx;
};

const T = (family: Family, variants: Variant[], track: number, nameMix: [number, string], glowBlur: number, glowPeak: number): Treatment => ({
  family,
  variants,
  track,
  nameMix,
  glowBlur,
  glowPeak,
  // Spores drift in slowly, the void pulls, fumes rise; lamps are lit at a touch.
  letterMs: { ember: 560, rime: 560, spore: 760, void: 620, light: 220, fume: 680 }[family],
  tint: family === 'ember' ? 'zoneBurn' : family === 'rime' ? 'zoneShatter' : family === 'void' ? 'zoneVoid' : 'zoneDrift',
});

const EMBER = (v: Variant[] = []) => T('ember', v, 0.08, [40, '#fff1d6'], 14, 0.6);
const RIME = (v: Variant[] = []) => T('rime', v, 0.12, [25, '#eef4ff'], 10, 0.45);
const SPORE = (v: Variant[] = []) => T('spore', v, 0.08, [35, '#f4f0d0'], 18, 0.5);
const VOID = (v: Variant[] = []) => T('void', v, 0.06, [30, '#f2f6e8'], 12, 0.55);
const LIGHT = (v: Variant[] = []) => T('light', v, 0.1, [30, '#f6e7c4'], 10, 0.5);
const FUME = (v: Variant[] = []) => T('fume', v, 0.08, [30, '#f1ead0'], 18, 0.45);

/**
 * Each place's treatment, by what lib/backdrops.ts biomeAt calls it: a zone's
 * name, or past the zones its archetype's kind (lib/archetypes.ts), after the
 * look it is drawn with.
 */
export const TREATMENTS: Record<string, Treatment> = {
  'The Mines': LIGHT(),
  'Magma Fissure': EMBER(),
  'Frozen Hollow': RIME(),
  'Fungal Caverns': SPORE(),
  'Vaal Outpost': LIGHT(),
  'Abyssal Depths': VOID(),
  'Petrified Forest': { ...FUME(['crumble']), nameMix: [20, '#d9d6e0'] },
  'Sulphur Vents': FUME(),
  'Abyssal City': LIGHT(['lanterns']),
  'Primeval Ruins': EMBER(['blue']),
  'Drowned temple': LIGHT(['tide']),
  'Ember forge': EMBER(),
  'Void bloom': VOID(),
  'Frozen abyss': RIME(),
  'Sulphur marsh': FUME(),
  'Lantern necropolis': LIGHT(['lanterns']),
  'Sunken garden': SPORE(),
  'Blood eclipse': VOID(['eclipse']),
  'Glacial pyre': RIME(['pyre']),
  'Ashen reliquary': EMBER(),
  'Starfall abyss': LIGHT(['lanterns', 'starfall']),
  'Witchfire grove': SPORE(['witchfire']),
};

/**
 * One line under each place's name, as players will read it a hundred
 * times: one concrete thing seen there, said flat. No jokes, no warnings,
 * no place that remembers or waits, no mood words, and never the name over
 * again. Never more than SUBTITLE_MOST characters (one line on a 375 px
 * phone), with no full stop. Past depth 100 a kind of place's line goes
 * under every name it takes (lib/archetypes.ts), so it holds for all of them.
 */
export const SUBTITLES: Record<string, string> = {
  'The Mines': 'The Eternals left in a hurry',
  'Magma Fissure': 'Stone that never set',
  'Frozen Hollow': 'Ice holds the last footprints',
  'Fungal Caverns': 'Caps grow where miners fell',
  'Vaal Outpost': 'Blood channels in the floor',
  'Abyssal Depths': 'Light stops short of the floor',
  'Petrified Forest': 'Sap set hard mid-drip',
  'Sulphur Vents': 'Yellow crust on every lamp',
  'Abyssal City': 'Streets laid with bone',
  'Primeval Ruins': 'Blue fire in the old halls',
  'Drowned temple': 'Bells ring under the water',
  'Ember forge': 'Tongs left in the coals',
  'Void bloom': 'Petals that cast no shadow',
  'Frozen abyss': 'Snow falls and never lands',
  'Sulphur marsh': 'Gas rising from old graves',
  'Lantern necropolis': 'A lamp for every grave',
  'Sunken garden': 'Vines holding up the ceiling',
  'Blood eclipse': 'A red sun with no heat',
  'Glacial pyre': 'Flames that melt nothing',
  'Ashen reliquary': 'Relics under a foot of ash',
  'Starfall abyss': 'Stars falling the wrong way',
  'Witchfire grove': 'Green flame on bare branches',
};

/** The longest a subtitle may be (characters). */
export const SUBTITLE_MOST = 32;

/** The stratum a depth lies in: 0 for depths 1 to 10, 1 for 11 to 20, and so on. */
const stratumOf = (d: number) => Math.max(0, Math.floor((Math.max(1, Math.floor(d)) - 1) / 10));

/** The treatment of the place depth `d` lies in. */
export const treatmentAt = (d: number): Treatment => TREATMENTS[biomeAt(stratumOf(d))] ?? LIGHT();

/** The subtitle of the place depth `d` lies in. */
export const subtitleAt = (d: number): string => SUBTITLES[biomeAt(stratumOf(d))] ?? '';

/**
 * The meta line over the name: the depth as players count it and the zone's
 * number ("Depth 10 • Zone II"), or, alone at a depth past your best, that
 * instead of the zone ("Depth 40 • Deeper than ever").
 */
export function metaLine(d: number, deeper = false): string {
  return `Depth ${shownDepth(d)} • ${deeper ? 'Deeper than ever' : `Zone ${roman(stratumOf(d) + 1)}`}`;
}

// ---- what is new here --------------------------------------------------------

/**
 * One thing a zone brings, shown under its name as a mark and a label. Its
 * mark is a find's item (its icon, components/ItemGlyph), a count (the
 * number, its unit in the label), or an engraved sign (lib/alchemy.ts).
 * `all`: a rule that from here holds on every question (its mark gets a
 * third ring).
 */
export type News = {
  key: string;
  /** Where in the zone it comes. */
  depth: number;
  /** How much it matters: 1 finds, 2 a rule starting, 3 a rule reaching every question, 4 a step, 5 the clock. */
  rank: number;
  mark: { find: FindKind } | { count: number } | { sign: NewsSign };
  all: boolean;
  label: string;
  /** As said to a screen reader. */
  spoken: string;
};
export type NewsSign = 'mirror' | 'unveil' | 'gray' | 'looks' | 'names' | 'fakes' | 'scarce';

/** At most this many things are shown under a zone's name. */
export const NEWS_MOST = 3;

const FIND_NAMES: Record<FindKind, string> = { dynamite: 'Dynamite Cache', flare: 'Flare Cache', azurite: 'Azurite Vein' };

/** The share of a depth's questions a rule that rises with depth holds for. */
const share = {
  mirror: (d: number) => delveRules(d).mirror,
  unveil: (d: number) => (delveRules(d).veil ? 1 : 0),
  gray: (d: number) => delveRules(d).grayChance ?? 0,
  looks: (d: number) => delveRules(d).lookalikes ?? 0,
  names: (d: number) => delveRules(d).similarNames,
  fakes: (d: number) => delveRules(d).moreFakes ?? 0,
};
/** What each says as it starts, and as it reaches every question (undefined: never said). */
const SAYS: Record<keyof typeof share, [string | undefined, string | undefined]> = {
  mirror: ['Mirrored art', 'All art mirrored'],
  unveil: ['Art burns in', undefined],
  gray: ['Art without colour', 'All art without colour'],
  looks: ['Look-alike art', 'All look-alikes by art'],
  names: [undefined, 'All names look alike'],
  fakes: ['A fourth made-up name', 'Always four made-up names'],
};

/** Every change between depth `x - 1` and `x` worth telling, unranked. */
function changesAt(x: number): News[] {
  const out: News[] = [];
  for (const f of FINDS_IN_ORDER) {
    const [a, b, c] = [findChance(f.kind, x - 2), findChance(f.kind, x - 1), findChance(f.kind, x)];
    if (c > 0 && b === 0) out.push({ key: `find:${f.kind}`, depth: x, rank: 1, mark: { find: f.kind }, all: false, label: FIND_NAMES[f.kind], spoken: FIND_NAMES[f.kind] });
    // Past FIND_FADE_FROM they thin out, depth by depth, and then hold.
    if (x > FIND_FADE_FROM && c < b && b >= a && !out.some((n) => n.key === 'scarce'))
      out.push({ key: 'scarce', depth: x, rank: 1, mark: { sign: 'scarce' }, all: false, label: 'Finds grow scarce', spoken: 'finds grow scarce' });
    if (x > FIND_FADE_FROM && c < b && findChance(f.kind, x + 1) === c && !out.some((n) => n.key === 'scarcest'))
      out.push({ key: 'scarcest', depth: x, rank: 1, mark: { sign: 'scarce' }, all: true, label: 'Finds at their scarcest', spoken: 'finds at their scarcest' });
  }
  for (const k of Object.keys(share) as (keyof typeof share)[]) {
    const [was, now] = [share[k](x - 1), share[k](x)];
    const [starts, everywhere] = SAYS[k];
    if (starts && was === 0 && now > 0) out.push({ key: `${k}:start`, depth: x, rank: 2, mark: { sign: k }, all: false, label: starts, spoken: starts.toLowerCase() });
    if (everywhere && was < 1 && now >= 1) out.push({ key: `${k}:all`, depth: x, rank: 3, mark: { sign: k }, all: true, label: everywhere, spoken: everywhere.toLowerCase() });
  }
  const steps: [string, (d: number) => number, string, string][] = [
    ['options', (d) => delveRules(d).options, 'Options', 'options'],
    ['fakes', (d) => delveRules(d).fakes, 'Made-up names', 'made-up names'],
    ['lockout', delveLockout, 'Turns of lockout', 'turns of lockout'],
  ];
  for (const [key, at, label, spoken] of steps) {
    const n = at(x);
    if (n > at(x - 1)) out.push({ key, depth: x, rank: 4, mark: { count: n }, all: false, label, spoken: `${n} ${spoken}` });
  }
  return out;
}

/**
 * What is new in the zone that depth `d0` opens, through its ten depths
 * (each compared with the one before): finds that turn up, or thin out past
 * depth 100; rules that start, or reach every question; the steps in the
 * options, the made-up names and the lockout, each at the zone's last; and
 * the clock, at its shortest, if it is shorter by the zone's end. The
 * NEWS_MOST that matter most (by rank, then depth), in the order they come.
 */
export function zoneNews(d0: number): News[] {
  const all: News[] = [];
  for (let x = d0; x < d0 + 10; x++) {
    for (const n of changesAt(x)) {
      // A step that comes twice in a zone is said once, at its last.
      const i = all.findIndex((m) => m.key === n.key);
      if (i >= 0 && n.rank === 4) all.splice(i, 1);
      if (i < 0 || n.rank === 4) all.push(n);
    }
  }
  const [was, end] = [delveTimer(d0 - 1), delveTimer(d0 + 9)];
  if (end < was) {
    let at = d0;
    while (delveTimer(at) > end) at++;
    all.push({ key: 'clock', depth: at, rank: 5, mark: { count: end }, all: false, label: 'Seconds to answer', spoken: `${end} seconds to answer` });
  }
  return all
    .map((n, i) => ({ n, i }))
    .sort((a, b) => a.n.rank - b.n.rank || a.n.depth - b.n.depth || a.i - b.i)
    .slice(0, NEWS_MOST)
    .sort((a, b) => a.n.depth - b.n.depth || a.n.rank - b.n.rank)
    .map(({ n }) => n);
}

// ---- the card ----------------------------------------------------------------

/** Everything the card for the zone depth `d` opens shows. */
export type ZoneTitle = {
  /** The zone (its stratum's name, lib/descent.ts). */
  name: string;
  subtitle: string;
  meta: string;
  /** The place its sigil is drawn for (lib/zoneSigils.ts sigilOf). */
  sigil: string;
  /** Its colour (lib/descent.ts accentAt), which tints all of it. */
  accent: string;
  treatment: Treatment;
  news: News[];
  /** All of it, as a screen reader says it. */
  spoken: string;
};

/**
 * The card for depth `d`, which opens a zone (lib/delve.ts opensZone).
 * `deeper`: alone, past your best (its meta line says so).
 */
export function zoneTitleAt(d: number, deeper = false): ZoneTitle {
  const name = stratumName(stratumOf(d));
  const subtitle = subtitleAt(d);
  const news = opensZone(d) ? zoneNews(d) : [];
  const said = [
    `Depth ${shownDepth(d)}: ${name}.`,
    deeper ? 'Deeper than ever.' : '',
    subtitle ? `${subtitle}.` : '',
    news.length ? `New here: ${news.map((n) => n.spoken).join(', ')}.` : '',
  ];
  return {
    name,
    subtitle,
    meta: metaLine(d, deeper),
    sigil: name,
    accent: accentAt(d),
    treatment: treatmentAt(d),
    news,
    spoken: said.filter(Boolean).join(' '),
  };
}
