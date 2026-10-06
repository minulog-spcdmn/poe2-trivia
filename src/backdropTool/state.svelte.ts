// The backdrop tool's state: a draft of src/data/backdrops.json (the zones'
// looks and motions, the endgame's settings and pinned seeds), the look
// being worked on for one zone, and what the generator is set to. Every
// change is shown at once: the draft, with the look being worked on in its
// zone's place and a seed being tried for an endgame stratum, goes to the
// game's own backdrop through setBackdrops (lib/backdrops.ts, its hook).
// Drafts keep in this page's own storage (lib/storage.ts, data-backdrop-tool).

import { SHIPPED, setBackdrops, seedAt } from '../lib/backdrops';
import { backdropsErrors, cloneData, formatBackdrops, withTones, type Backdrops, type GenSettings, type Group, type Look, type MotionTweak } from '../lib/backdropData';
import { DEFAULT_SETTINGS, freshSeed, generate, hueOf, keepLocked, variationSeed, wrap } from '../lib/backdropGen';
import { calibrateLight, setDescent } from '../lib/descent';
import { PROFILE_NAMES, profileOf, tweakOf } from '../lib/emberProfiles';
import { readStored, writeStored } from '../lib/storage';

export type Tab = 'zones' | 'endgame';
type Work = { look: Look; motion: MotionTweak };

export const ZONES = SHIPPED.zones.length;
/** How deep the depth slider goes. */
export const MAX_DEPTH = 250;
/** Where the zone looks alone, settled: its first depth. */
export const depthOfStratum = (k: number) => 10 * k + 1;
const NAMES = SHIPPED.zones.map((z) => z.name);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** A look without its light (worked out, see lit). */
const unlit = (l: Look) => ({ ...l, lightK: 0 });

interface Saved {
  draft: Backdrops;
  zone: number;
  work: Work;
  seed: number | null;
  strip: number;
  settings: GenSettings;
  locked: (Group | 'motion')[];
  depth: number;
  tab: Tab;
  stratum: number;
}

function load(): Saved | null {
  try {
    const s = JSON.parse(readStored('draft') ?? 'null') as Saved | null;
    if (!s) return null;
    // (A draft kept from before the details had colours of their own keeps the ones it was drawn in.)
    withTones(s.draft);
    withTones({ zones: [{ look: s.work?.look }] });
    if (backdropsErrors(s.draft, NAMES, PROFILE_NAMES).length) return null;
    return s;
  } catch {
    return null;
  }
}

const saved = load();
const workOf = (draft: Backdrops, k: number): Work => cloneData({ look: draft.zones[k].look, motion: draft.zones[k].motion });

export const tool = $state({
  tab: (saved?.tab ?? 'zones') as Tab,
  /** What Save, Copy and Download write. */
  draft: saved?.draft ?? cloneData(SHIPPED),
  /** The zone being worked on, and the look and motion it is being given (not in the draft until "Use for this zone"). */
  zone: saved?.zone ?? 0,
  work: saved?.work ?? workOf(SHIPPED, 0),
  /** The seed the work was generated from (null: as the zone has it, or tweaked by hand since). */
  seed: saved?.seed ?? (null as number | null),
  /** The seed the variations strip is made from. */
  strip: saved?.strip ?? freshSeed(),
  /** The zones' generator settings (the endgame's are in the draft). */
  settings: saved?.settings ?? cloneData(DEFAULT_SETTINGS),
  locked: saved?.locked ?? ([] as (Group | 'motion')[]),
  depth: saved?.depth ?? 1,
  /** The endgame stratum shown (k: 10 is stratum 11, depths 101 to 110), and a seed being tried for it (null: its own). */
  stratum: saved?.stratum ?? ZONES,
  trial: null as number | null,
  walking: false,
  message: '',
  /** Bumped as what is shown changes (the brightness curve follows it). */
  shownVersion: 0,
});

// ---- what is shown -------------------------------------------------------------

/** The work's look, lit: as the zone has it, its own light; changed, worked out where it shows (calibrateLight). */
function lit(k: number, look: Look): Look {
  const shipped = SHIPPED.zones[k].look;
  if (same(unlit(look), unlit(shipped))) return { ...look, lightK: shipped.lightK };
  return { ...look, lightK: calibrateLight(look, k) };
}

/** Whether a zone's look is the one the corrections were measured with. */
const measuredFor = (k: number, look: Look) => SHIPPED.zones[k].measured && same(look, SHIPPED.zones[k].look);

/** The draft as shown: the work in its zone's place, the seed being tried pinned. */
export function shown(): Backdrops {
  const data = cloneData($state.snapshot(tool.draft)) as Backdrops;
  const k = tool.zone;
  const look = lit(k, $state.snapshot(tool.work.look) as Look);
  data.zones[k] = { ...data.zones[k], look, motion: $state.snapshot(tool.work.motion) as MotionTweak, measured: measuredFor(k, look) };
  if (tool.trial !== null) data.endgame.pinned[String(tool.stratum + 1)] = tool.trial;
  return data;
}

/** The work's light as it will be used (for the panel). */
export const workLight = () => lit(tool.zone, $state.snapshot(tool.work.look) as Look).lightK;

let queued = false;
/** Shows the draft (once a frame at most) and keeps it. */
export function apply() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    setBackdrops(shown());
    tool.shownVersion++;
    keep();
  });
}

let keepTimer = 0;
/** Keeps the draft and the panel's settings on this device (a moment after the last change). */
export function keep() {
  clearTimeout(keepTimer);
  keepTimer = window.setTimeout(() => {
    const s: Saved = $state.snapshot({
      draft: tool.draft,
      zone: tool.zone,
      work: tool.work,
      seed: tool.seed,
      strip: tool.strip,
      settings: tool.settings,
      locked: tool.locked,
      depth: tool.depth,
      tab: tool.tab,
      stratum: tool.stratum,
    }) as Saved;
    writeStored('draft', JSON.stringify(s));
  }, 300);
}

/** Switches tabs: the endgame's shows its stratum; leaving it drops a seed being tried. */
export function showTab(tab: Tab) {
  tool.tab = tab;
  if (tab === 'endgame') return showStratum(tool.stratum);
  tool.trial = null;
  setDepth(depthOfStratum(tool.zone));
  apply();
}

export function setDepth(d: number) {
  tool.depth = Math.max(1, Math.min(MAX_DEPTH, Math.round(d)));
  setDescent(tool.depth);
  keep();
}

// ---- zones ---------------------------------------------------------------------

/** Whether the work differs from what the draft has for the zone. */
export const unused = () => !same($state.snapshot(tool.work), workOf($state.snapshot(tool.draft) as Backdrops, tool.zone));
/** Whether the draft's zone differs from the file's. */
export const zoneChanged = (k: number) => !same(tool.draft.zones[k].look, SHIPPED.zones[k].look) || !same(tool.draft.zones[k].motion, SHIPPED.zones[k].motion);

export function pickZone(k: number) {
  tool.zone = k;
  tool.work = workOf($state.snapshot(tool.draft) as Backdrops, k);
  tool.seed = null;
  setDepth(depthOfStratum(k));
  apply();
}

/** Puts the work into the draft for its zone. */
export function useForZone() {
  const k = tool.zone;
  const look = lit(k, $state.snapshot(tool.work.look) as Look);
  tool.draft.zones[k] = { ...tool.draft.zones[k], look, motion: $state.snapshot(tool.work.motion) as MotionTweak, measured: measuredFor(k, look) };
  tool.work.look.lightK = look.lightK;
  note(`${NAMES[k]}: this look is used for it now.`);
  apply();
}

/** Back to what the draft has for the zone, or the file's. */
export function revertWork(toFile = false) {
  tool.work = workOf(toFile ? SHIPPED : ($state.snapshot(tool.draft) as Backdrops), tool.zone);
  tool.seed = null;
  apply();
}

/** A field of the work changed by hand. */
export function changed() {
  tool.seed = null;
  apply();
}

export function setProfile(name: string) {
  tool.work.motion = tweakOf(profileOf(name));
  changed();
}

/** Generates the work from `seed` (the locked groups kept). */
export function generateWork(seed: number) {
  const g = generate(seed, $state.snapshot(tool.settings) as GenSettings);
  const next = keepLocked(g, $state.snapshot(tool.work) as Work, new Set(tool.locked));
  tool.work = cloneData(next);
  tool.seed = seed;
  apply();
}

/** A new seed, and a new strip of variations made from it. */
export function generateNew() {
  const seed = freshSeed();
  tool.strip = seed;
  generateWork(seed);
}

export const stripSeeds = () => Array.from({ length: 6 }, (_, i) => variationSeed(tool.strip, i));

export function toggleLock(g: Group | 'motion') {
  tool.locked = tool.locked.includes(g) ? tool.locked.filter((x) => x !== g) : [...tool.locked, g];
  keep();
}

/** The zones' generator around the zone's own hue (30 degrees either way). */
export function aroundZoneHue() {
  const h = Math.round(hueOf(tool.work.look.smoke).hue);
  tool.settings.hue = [wrap(h - 30), wrap(h + 30)];
  keep();
}

// ---- the endgame -----------------------------------------------------------------

export const stratumSeed = () => tool.trial ?? seedAt(tool.stratum);
export const pinnedSeed = () => tool.draft.endgame.pinned[String(tool.stratum + 1)] as number | undefined;

export function showStratum(k: number) {
  tool.stratum = Math.max(ZONES, k);
  tool.trial = null;
  setDepth(depthOfStratum(tool.stratum));
  apply();
}

export function tryStratumSeed(seed: number | null) {
  tool.trial = seed;
  apply();
}

export function pin() {
  tool.draft.endgame.pinned[String(tool.stratum + 1)] = stratumSeed();
  tool.trial = null;
  note(`Stratum ${tool.stratum + 1} keeps seed ${stratumSeed()} now.`);
  apply();
}

export function unpin(n = tool.stratum + 1) {
  delete tool.draft.endgame.pinned[String(n)];
  if (n === tool.stratum + 1) tool.trial = null;
  apply();
}

// ---- saving ------------------------------------------------------------------------

export function note(text: string) {
  tool.message = text;
}

const text = () => formatBackdrops($state.snapshot(tool.draft) as Backdrops);

/** Whether the draft differs from the file. */
export const draftChanged = () => !same(tool.draft, SHIPPED);

/** Dev server only: writes src/data/backdrops.json (vite.config.ts's backdropSave). */
export async function saveToFile() {
  try {
    const res = await fetch('/__backdrops/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text() });
    const body = (await res.json()) as { saved?: string; errors?: string[] };
    note(res.ok ? `Saved ${body.saved}. The page reloads with it.` : `Not saved: ${(body.errors ?? [res.statusText]).slice(0, 4).join('; ')}`);
  } catch (e) {
    note(`Not saved: ${(e as Error).message}`);
  }
}

export async function copyJson() {
  try {
    await navigator.clipboard.writeText(text());
    note('Copied: paste it over src/data/backdrops.json.');
  } catch {
    note('Copying was refused here; use Download instead.');
  }
}

export function downloadJson() {
  const url = URL.createObjectURL(new Blob([text()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'backdrops.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  note('Downloaded: put it in src/data/ in place of backdrops.json.');
}

export async function importJson(file: File) {
  try {
    const data = withTones(JSON.parse(await file.text()) as Backdrops);
    const errors = backdropsErrors(data, NAMES, PROFILE_NAMES);
    if (errors.length) return note(`Not imported: ${errors.slice(0, 4).join('; ')}`);
    tool.draft = data;
    tool.work = workOf(data, tool.zone);
    tool.seed = null;
    tool.trial = null;
    note(`Imported ${file.name}.`);
    apply();
  } catch (e) {
    note(`Not imported: ${(e as Error).message}`);
  }
}

/** The draft thrown away: the file's again. */
export function discardDraft() {
  tool.draft = cloneData(SHIPPED);
  tool.work = workOf(SHIPPED, tool.zone);
  tool.seed = null;
  tool.trial = null;
  note('The draft is the file again.');
  apply();
}

/** Shows what was kept, at the depth it was at (main.ts calls it before anything is drawn). */
export function boot() {
  setBackdrops(shown());
  setDescent(tool.depth);
}
