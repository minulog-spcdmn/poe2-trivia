// Where an error in the game's own scripts came from, for its count
// (count.ts countScriptErrors): "lib/codex.ts:loadCodex", the source module
// and the named function of the first frame of its stack that is the game's
// own code, or "node_modules/peerjs" when only a package's code is on it.
//
// The built scripts are minified, so their names say nothing. The build
// writes a table beside each script (whereMaps.ts, `<script>.where.json`):
// for each stretch of the script, the module and function it was built from.
// It's fetched only once an error has happened, and only the label from it is
// sent: never the error's message, an address, a query or anything a player
// typed. The labels are the build's own, so their number is bounded by the
// code; where it can't tell, the count stays plain "error/script".

/** A place in one of the game's built scripts: its file in assets/, and its line and column (1-based, as browsers give them). */
export interface Frame {
  file: string;
  line: number;
  col: number;
}

/** Where an error was: its stack, and an error event's file and place (for an error with no stack). */
export interface ErrorPlace {
  stack?: string;
  file?: string;
  line?: number;
  col?: number;
}

/**
 * A script's table, as whereMaps.ts writes it: the labels, and for each of
 * the script's lines (0-based) the stretches it is made of, as pairs of the
 * column each starts at (counted on from the last's) and its label's index
 * (-1: none, the bundler's own code).
 */
export interface WhereTable {
  labels: string[];
  lines: number[][];
}

/** The frames looked through, from the top: past these it's the start's or the framework's, which say nothing more. */
const MAX_FRAMES = 8;
/** A built script's file name in assets/: no folders, no query. */
const SCRIPT_FILE = /^[\w.-]+\.js$/;
/** A frame's address and place, as Chrome ("at f (url:1:2)"), Safari and Firefox ("f@url:1:2") write it. */
const FRAME = /(https?:\/\/[^\s()@]+?):(\d+):(\d+)/g;
/** A label as the build makes it: a module's path and maybe a function's name, nothing else. */
export const LABEL = /^[\w@.$/-]{1,80}(?::[\w$.]{1,40})?$/;

/** The game's own scripts' frames of an error (as ErrorPlace has it), top first, at most MAX_FRAMES. */
export function ownFrames(from: ErrorPlace, assets: string): Frame[] {
  const out: Frame[] = [];
  const add = (url: string, line: number, col: number) => {
    if (out.length >= MAX_FRAMES || !url.startsWith(assets) || !(line > 0) || !(col > 0)) return;
    const file = url.slice(assets.length).replace(/[?#].*$/, '');
    if (SCRIPT_FILE.test(file)) out.push({ file, line, col });
  };
  if (typeof from.stack === 'string') for (const m of from.stack.matchAll(FRAME)) add(m[1], Number(m[2]), Number(m[3]));
  if (!out.length && from.file) add(from.file, from.line ?? 0, from.col ?? 0);
  return out;
}

/** Whether a fetched table is in the shape whereMaps.ts writes. */
export const isWhereTable = (t: unknown): t is WhereTable =>
  typeof t === 'object' && t !== null && Array.isArray((t as WhereTable).labels) && Array.isArray((t as WhereTable).lines) && (t as WhereTable).labels.every((l) => typeof l === 'string');

/** The label of a place in a script, by its table; null where it has none. */
export function placeIn(table: WhereTable, line: number, col: number): string | null {
  const row = table.lines[line - 1];
  if (!Array.isArray(row)) return null;
  let at = 0;
  let found = -1;
  for (let i = 0; i + 1 < row.length; i += 2) {
    at += row[i];
    if (at > col - 1) break;
    found = row[i + 1];
  }
  const label = found >= 0 ? table.labels[found] : undefined;
  return typeof label === 'string' && LABEL.test(label) ? label : null;
}

/** A package's label (node_modules/<name>): its code, not the game's. */
const fromPackage = (label: string) => label.startsWith('node_modules/');

/**
 * Where the error was, from its frames and each script's table (`table`,
 * null when it can't be had): the first frame in the game's own source, or
 * failing that the first in a package's; null when no frame tells.
 */
export async function whereOf(frames: Frame[], table: (file: string) => Promise<WhereTable | null>): Promise<string | null> {
  // (Each script's table asked for at once, so the frames' scripts don't wait on each other within WHERE_MS.)
  const tables = new Map<string, Promise<WhereTable | null>>();
  for (const f of frames) if (!tables.has(f.file)) tables.set(f.file, table(f.file).catch(() => null));
  let fallback: string | null = null;
  for (const f of frames) {
    const t = await tables.get(f.file)!;
    const label = t ? placeIn(t, f.line, f.col) : null;
    if (!label) continue;
    if (!fromPackage(label)) return label;
    fallback ??= label;
  }
  return fallback;
}

/** A script's table, fetched from beside it in `assets`. */
export const fetchWhereTable = (assets: string) => (file: string) =>
  fetch(`${assets}${file}.where.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((t: unknown) => (isWhereTable(t) ? t : null));
