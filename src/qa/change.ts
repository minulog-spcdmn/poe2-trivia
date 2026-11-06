// Where a change shows: the places (a scene's first state, a state with a
// key of its own, a piece's first state) that run the lines it changes, what
// the QA desk's "This change" lists. The scene map (npm run sweep -- --map
// writes src/data/sceneFiles.json) holds, for every file's every line, the
// places that ran it, from the browser's coverage, and the class names each
// place's page ever had. A changed line counts for the places that ran it;
// a changed CSS rule for the places whose page had its classes. What more
// than about a third of the places run changes every screen: it's named
// once and lights none. The map is made at a commit of its own, so a
// change's lines are carried to the map's through git's diff first.
// Pure: the dev server (qaServer.ts) and the beta's build
// (scripts/qa-change.mjs) read git and call placesTouched; the desk shows
// the result.

// ---- the map ------------------------------------------------------------------

/** The scene map as src/data/sceneFiles.json holds it. */
export interface PlaceMap {
  /** The commit it was made at. */
  commit: string;
  /** Files that differed from the commit as it was made: each one's content then, as a git blob. */
  dirty?: Record<string, string>;
  /** Every place's key: a scene's or a state's (`game/turns-right`), or a piece's (`avatar`, no slash). */
  places: string[];
  /** The sets of places, each by their indices in `places`, once each. */
  sets: number[][];
  /** Each file's lines, as runs: a line, what it and the lines after it up to the next run's are (a set, or NO_CODE, or MODULE), and so on. */
  files: Record<string, number[]>;
  /** Each class name the places' pages ever had: the set of the places that had it. */
  classes: Record<string, number>;
  /** Each scene's place's print, what it builds (builds.ts), as the commit had it. */
  builds?: Record<string, string>;
}

/** A line of no code (a comment, a type, a blank). */
export const NO_CODE = -1;
/** A line whose code runs as its module loads: what imports it runs it. */
export const MODULE = -2;

/** A map as made: a set of places' keys for each line in a function (empty: no place ran it), or `module`. */
export interface RawMap {
  commit: string;
  dirty?: Record<string, string>;
  places: string[];
  files: Map<string, Map<number, Set<string> | 'module'>>;
  classes: Map<string, Set<string>>;
  builds?: Record<string, string>;
}

/** The map as JSON: one place, set, file or class a line, so a merge conflict is easy to see. */
export function encodeMap(raw: RawMap): string {
  const index = new Map(raw.places.map((k, i) => [k, i]));
  const sets: number[][] = [];
  const ids = new Map<string, number>();
  const idOf = (keys: Set<string>) => {
    const s = [...keys].map((k) => index.get(k)).filter((i): i is number => i !== undefined).sort((a, b) => a - b);
    const id = s.join(',');
    if (!ids.has(id)) ids.set(id, sets.push(s) - 1);
    return ids.get(id)!;
  };
  const files: [string, number[]][] = [];
  for (const file of [...raw.files.keys()].sort()) {
    const lines = raw.files.get(file)!;
    if (!lines.size) continue;
    const last = Math.max(...lines.keys());
    const runs: number[] = [];
    let was: number | null = null;
    for (let l = 1; l <= last + 1; l++) {
      const v = lines.get(l);
      const now = v === undefined ? NO_CODE : v === 'module' ? MODULE : idOf(v);
      if (now !== was) runs.push(l, now);
      was = now;
    }
    files.push([file, runs]);
  }
  const classes = [...raw.classes].filter(([, ks]) => ks.size).sort(([a], [b]) => (a < b ? -1 : 1)).map(([c, ks]) => [c, idOf(ks)] as const);
  const builds = Object.entries(raw.builds ?? {}).filter(([k]) => index.has(k));
  const list = (items: string[]) => (items.length ? `\n${items.map((x) => `    ${x}`).join(',\n')}\n  ` : '');
  return [
    '{',
    `  "commit": ${JSON.stringify(raw.commit)},`,
    ...(raw.dirty && Object.keys(raw.dirty).length ? [`  "dirty": ${JSON.stringify(raw.dirty)},`] : []),
    `  "places": [${list(raw.places.map((k) => JSON.stringify(k)))}],`,
    `  "sets": [${list(sets.map((s) => JSON.stringify(s)))}],`,
    `  "files": {${list(files.map(([f, r]) => `${JSON.stringify(f)}: ${JSON.stringify(r)}`))}},`,
    `  "classes": {${list(classes.map(([c, id]) => `${JSON.stringify(c)}: ${id}`))}}${builds.length ? ',' : ''}`,
    ...(builds.length ? [`  "builds": {${list(builds.map(([k, b]) => `${JSON.stringify(k)}: ${JSON.stringify(b)}`))}}`] : []),
    '}',
    '',
  ].join('\n');
}

/** The map as made again from its JSON (for npm run sweep -- --map --only, which maps a few places and keeps the rest). */
export function decodeMap(map: PlaceMap): RawMap {
  const keys = (id: number) => new Set(map.sets[id].map((i) => map.places[i]));
  const files = new Map<string, Map<number, Set<string> | 'module'>>();
  for (const [file, runs] of Object.entries(map.files)) {
    const lines = new Map<number, Set<string> | 'module'>();
    for (let r = 0; r < runs.length; r += 2) {
      const v = runs[r + 1];
      if (v === NO_CODE) continue;
      const end = r + 2 < runs.length ? runs[r + 2] : runs[r] + 1;
      for (let l = runs[r]; l < end; l++) lines.set(l, v === MODULE ? 'module' : keys(v));
    }
    files.set(file, lines);
  }
  return { commit: map.commit, dirty: map.dirty, places: [...map.places], files, classes: new Map(Object.entries(map.classes).map(([c, id]) => [c, keys(id)])), builds: map.builds };
}

/** What line `line` of a file's runs is: a set's index, NO_CODE or MODULE. */
function lineIn(runs: number[], line: number): number {
  let lo = 0;
  let hi = runs.length / 2 - 1;
  if (hi < 0 || line < runs[0]) return NO_CODE;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (runs[mid * 2] <= line) lo = mid;
    else hi = mid - 1;
  }
  return runs[lo * 2 + 1];
}

// ---- git's diffs ----------------------------------------------------------------

/** A hunk of git's diff: where it is on the old side and the new, each a start and a count, as git writes them (a count of 0 starts at the line before). */
export interface Hunk {
  old: [number, number];
  new: [number, number];
}

/** The hunks of `git diff -U0`, by file (the new side's path, or for a file gone the old's). */
export function hunksOf(diff: string): Map<string, Hunk[]> {
  const out = new Map<string, Hunk[]>();
  let minus: string | null = null;
  let hunks: Hunk[] | null = null;
  for (const raw of diff.split('\n')) {
    const l = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (l.startsWith('diff ')) {
      minus = null;
      hunks = null;
    } else if (l.startsWith('--- ') && !hunks) minus = l.slice(4);
    else if (l.startsWith('+++ ') && !hunks) {
      const plus = l.slice(4);
      const file = (plus === '/dev/null' ? (minus ?? '') : plus).replace(/^[ab]\//, '');
      hunks = out.get(file) ?? [];
      out.set(file, hunks);
    } else if (hunks && l.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(l);
      if (m) hunks.push({ old: [Number(m[1]), m[2] === undefined ? 1 : Number(m[2])], new: [Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] });
    }
  }
  return out;
}

/** Where line `line` of one side of a diff is on the other side; null where the diff changed it. */
export function carry(line: number, hunks: Hunk[], from: 'old' | 'new'): number | null {
  let shift = 0;
  for (const h of hunks) {
    const [fs, fc] = from === 'old' ? h.old : h.new;
    const [ts, tc] = from === 'old' ? h.new : h.old;
    const fb = fc ? fs : fs + 1;
    const tb = tc ? ts : ts + 1;
    if (line < fb) break;
    if (line < fb + fc) return null;
    shift = tb + tc - (fb + fc);
  }
  return line + shift;
}

// ---- reading the code -------------------------------------------------------------

/** A rule of a stylesheet, or an at-rule: its prelude (`.a, .b`, `@media ...`), the lines it spans, what's in it. */
export interface CssNode {
  prelude: string;
  /** The prelude's first line, and the line of its closing brace (or semicolon). */
  line: number;
  end: number;
  children: CssNode[];
  parent: CssNode | null;
  /** Its own text, its children's left out (the declarations). */
  own: string;
}

/** The rules of `css`, its first line numbered `first`. */
export function cssTree(css: string, first = 1): CssNode[] {
  const top: CssNode[] = [];
  const stack: CssNode[] = [];
  let line = first;
  let pre = '';
  let preLine = -1;
  const own = (s: string) => {
    if (stack.length) stack[stack.length - 1].own += s;
  };
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '\n') line++;
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? css.length : end + 2;
      for (let j = i; j < stop; j++) if (css[j] === '\n') line++;
      i = stop - 1;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c && css[j] !== '\n') j += css[j] === '\\' ? 2 : 1;
      const s = css.slice(i, j + 1);
      pre += s;
      own(s);
      i = j;
      continue;
    }
    if (c === '{') {
      const node: CssNode = { prelude: pre.trim(), line: preLine < 0 ? line : preLine, end: line, children: [], parent: stack[stack.length - 1] ?? null, own: '' };
      (node.parent?.children ?? top).push(node);
      stack.push(node);
      pre = '';
      preLine = -1;
    } else if (c === '}') {
      const node = stack.pop();
      if (node) node.end = line;
      pre = '';
      preLine = -1;
    } else if (c === ';') {
      own(c);
      if (pre.trim().startsWith('@')) (stack[stack.length - 1]?.children ?? top).push({ prelude: pre.trim(), line: preLine < 0 ? line : preLine, end: line, children: [], parent: stack[stack.length - 1] ?? null, own: '' });
      pre = '';
      preLine = -1;
    } else {
      if (preLine < 0 && !/\s/.test(c)) preLine = line;
      pre += c;
      own(c);
    }
  }
  return top;
}

const isRule = (n: CssNode) => !n.prelude.startsWith('@');
const descendants = (n: CssNode): CssNode[] => n.children.flatMap((c) => [c, ...descendants(c)]);

/** The rules lines `lines` of `tree` change: a changed declaration's rule, a changed @keyframes' users, all of a changed @media's. */
export function rulesAt(tree: CssNode[], lines: number[]): CssNode[] {
  const all = tree.flatMap((n) => [n, ...descendants(n)]);
  const out = new Set<CssNode>();
  for (const l of lines) {
    let at: CssNode | undefined;
    for (const n of all) if (n.line <= l && l <= n.end && (!at || (n.line >= at.line && n.end <= at.end))) at = n;
    if (!at) continue;
    if (isRule(at)) out.add(at);
    else if (/^@(-\w+-)?keyframes\b/.test(at.prelude)) {
      const name = at.prelude.split(/\s+/)[1];
      const uses = new RegExp(`animation(-name)?\\s*:[^;]*(^|[\\s,])${name.replace(/[^\w-]/g, '\\$&')}($|[\\s,;])`);
      for (const n of all) if (isRule(n) && uses.test(n.own)) out.add(n);
    } else {
      const inner = descendants(at).filter(isRule);
      // (One of declarations, as @font-face, is itself; one of rules, as @media, its rules where its prelude changed, none between them.)
      if (!inner.length) out.add(at);
      else if (l === at.line) for (const n of inner) out.add(n);
    }
  }
  return [...out];
}

/** Splits `s` at `sep` outside brackets. */
function splitTop(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && sep.test(c)) {
      out.push(s.slice(from, i));
      from = i + 1;
    }
  }
  out.push(s.slice(from));
  return out.map((x) => x.trim()).filter(Boolean);
}

/**
 * The classes a page has to have for `selector` to match anything: each of
 * its compounds' (`.seat .name`, both), outside a `:not()`, an `:is()` or an
 * attribute's value; none for one without (`:root`, `p`).
 */
export function selectorClasses(selector: string): string[] {
  // (:global(.a) is .a.)
  let bare = selector;
  for (let at = bare.indexOf(':global('); at >= 0; at = bare.indexOf(':global(')) {
    let depth = 0;
    let end = at + 7;
    for (; end < bare.length; end++) {
      if (bare[end] === '(') depth++;
      else if (bare[end] === ')' && --depth === 0) break;
    }
    bare = `${bare.slice(0, at)} ${bare.slice(at + 8, end)} ${bare.slice(end + 1)}`;
  }
  let flat = '';
  let depth = 0;
  for (const c of bare) {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (!depth) flat += c;
  }
  return [...new Set([...flat.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]))];
}

/** The lines (from 1) of a Svelte file's <style>, and of its <script>s; the rest is its template. */
export function svelteParts(text: string): { style: [number, number] | null; scripts: [number, number][] } {
  const lines = text.split('\n');
  let style: [number, number] | null = null;
  const scripts: [number, number][] = [];
  let open: { kind: 'style' | 'script'; at: number } | null = null;
  lines.forEach((l, i) => {
    if (!open) {
      const m = /^<(style|script)[\s>]/.exec(l);
      if (m) open = { kind: m[1] as 'style' | 'script', at: i + 1 };
    }
    if (open && l.includes(`</${open.kind}>`)) {
      if (open.kind === 'style') style = [open.at, i + 1];
      else scripts.push([open.at, i + 1]);
      open = null;
    }
  });
  return { style, scripts };
}

/** The function (or method, or arrow kept in a name) line `line` of `text` is in, as far as its indentation tells. */
export function enclosingName(text: string, line: number): string | null {
  const lines = text.split('\n');
  const indent = (s: string) => /^\s*/.exec(s)![0].length;
  const DECL = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+([\w$]+)|^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:\$derived\.by\(\s*)?(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*(?::\s*[^=]+)?=>|^\s*(?:(?:public|private|static|async|get|set)\s+)*([\w$]+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/;
  const name = (l: string) => {
    const m = DECL.exec(l);
    const n = m && (m[1] ?? m[2] ?? m[3]);
    return n && !['if', 'for', 'while', 'switch', 'catch', 'function', 'return'].includes(n) ? n : null;
  };
  let i = line - 1;
  while (i < lines.length && !lines[i]?.trim()) i++;
  if (i >= lines.length) return null;
  const own = name(lines[i]);
  if (own) return own;
  let at = indent(lines[i]);
  for (let j = i - 1; j >= 0 && j > i - 400 && at > 0; j--) {
    if (!lines[j].trim()) continue;
    const ind = indent(lines[j]);
    if (ind >= at) continue;
    const n = name(lines[j]);
    if (n) return n;
    if (/^<(script|style)/.test(lines[j])) return null;
    at = ind;
  }
  return null;
}

// ---- a change's places --------------------------------------------------------------

/** A file a change changes, as git has it. */
export interface FileChange {
  /** Its path from the repository's root, forward slashes. */
  file: string;
  /** Its hunks, from the merge base (old) to now (new). */
  hunks: Hunk[];
  /** It at the merge base, and now (null: not there). */
  before: string | null;
  after: string | null;
  /**
   * How its lines moved from the map's to the merge base's (git diff -U0
   * <map's commit> <merge base>) and to now's: null where the same,
   * 'unknown' where git can't tell (the map's commit isn't here).
   */
  toBase: Hunk[] | null | 'unknown';
  toNow: Hunk[] | null | 'unknown';
}

export interface PlaceTouched {
  key: string;
  /** The most telling of what it runs that changed ("Desk.svelte: goState (line 171)"). */
  why: string;
  /** How much of the change it alone shows: each part of the change shared among the places it lights. */
  score: number;
}

/** Where a change shows. */
export interface Change {
  /** The places, those the change is most their own first. */
  places: PlaceTouched[];
  /** What changes every screen (or every piece): named once, lighting none. */
  everywhere: { file: string; why: string; of: 'screens' | 'pieces' }[];
  /** Changed files of the game's no place runs. */
  uncovered: string[];
  /** Changed code in files places run that none of them ran (a handler never set off, a rule whose classes never showed). */
  unrun: { file: string; what: string }[];
}

/** Files that change how everything looks or runs, whatever the map says. */
const EVERYWHERE = [/^package(-lock)?\.json$/, /^vite\.config\.ts$/, /^svelte\.config\.js$/, /^src\/assets\/fonts\//, /^(index|qa)\.html$/, /^src\/main\.ts$/];
/** The app's stylesheet: a rule of it without a class (`:root`, `body`) is everywhere's. */
const APP_CSS = 'src/app.css';
/** A file of the game's (src/qa/'s are the desk's own): changed, one no place runs is listed. */
const GAME_FILE = /^src\/(?!qa\/).*\.(ts|js|svelte|css)$/;
/** The desk's scenes (but one.ts, which finds a frame its scene): a change to them changes only what places build. */
export const SCENE_CODE = /^src\/qa\/(scenes\/(?!one\.ts$)|tweaks\.ts$)/;

const base = (file: string) => file.slice(file.lastIndexOf('/') + 1);
const span = (start: number, count: number) => (count > 1 ? `lines ${start}-${start + count - 1}` : `line ${start}`);

/**
 * Where `files` show, by `map`: each changed line's places, and each
 * changed CSS rule's. What more than `share` of the scenes' places (or of
 * the pieces') run is everywhere's. With what each place builds now
 * (`builds`, builds.ts) and the map's, a change to the scenes' code counts
 * only for the places it builds differently, and a place the map hasn't
 * got is new: the fold of a dozen scenes into one, building each as it
 * did, lights none.
 */
export function placesTouched(files: FileChange[], map: PlaceMap, share = 1 / 3, builds?: Record<string, string>): Change {
  const isPiece = (i: number) => !map.places[i].includes('/');
  const totals = { scenes: map.places.filter((k) => k.includes('/')).length, pieces: map.places.filter((k) => !k.includes('/')).length };
  const lit = new Map<number, { score: number; why: string; size: number }>();
  const everywhere = new Map<string, Change['everywhere'][number]>();
  const uncovered: string[] = [];
  const unrun: Change['unrun'] = [];

  const filePlaces = new Map<string, Set<number>>();
  const placesOf = (file: string) => {
    if (!filePlaces.has(file)) filePlaces.set(file, new Set((map.files[file] ?? []).filter((v, i) => i % 2 === 1 && v >= 0).flatMap((id) => map.sets[id])));
    return filePlaces.get(file)!;
  };
  const classPlaces = (c: string) => (c in map.classes ? map.sets[map.classes[c]] : []);
  const prints = builds && map.builds ? { now: builds, was: map.builds } : null;
  /** `places` but those that build as they did. */
  const builtAnew = (places: Set<number>) => new Set([...places].filter((i) => !prints || prints.now[map.places[i]] === undefined || prints.now[map.places[i]] !== prints.was[map.places[i]]));

  /** `places` light up for `why`, but those of a group they're more than `share` of, which go to everywhere. */
  function light(file: string, places: Set<number>, why: string) {
    const scenes = [...places].filter((i) => !isPiece(i));
    const pieces = [...places].filter(isPiece);
    const kept: number[] = [];
    for (const [of, group, total] of [['screens', scenes, totals.scenes], ['pieces', pieces, totals.pieces]] as const) {
      if (group.length > total * share && group.length > 1) {
        if (!everywhere.has(`${of}|${file}`)) everywhere.set(`${of}|${file}`, { file, why, of });
      } else kept.push(...group);
    }
    for (const i of kept) {
      const was = lit.get(i);
      if (!was) lit.set(i, { score: 1 / kept.length, why, size: kept.length });
      else {
        was.score += 1 / kept.length;
        if (kept.length < was.size) Object.assign(was, { why, size: kept.length });
      }
    }
  }

  for (const f of files) {
    const { file } = f;
    if (EVERYWHERE.some((re) => re.test(file))) {
      everywhere.set(`screens|${file}`, { file, why: `${base(file)} changes everything`, of: 'screens' });
      continue;
    }
    const css = file.endsWith('.css');
    const svelte = file.endsWith('.svelte');
    const runs = map.files[file];
    if (!css && !runs) {
      if (GAME_FILE.test(file) && /\.(ts|js|svelte)$/.test(file)) uncovered.push(file);
      continue;
    }
    if (!css && !/\.(ts|js|mjs|svelte)$/.test(file)) continue;
    const partsBefore = svelte && f.before !== null ? svelteParts(f.before) : null;
    const partsAfter = svelte && f.after !== null ? svelteParts(f.after) : null;
    const inStyle = (parts: ReturnType<typeof svelteParts> | null, l: number) => css || (!!parts?.style && parts.style[0] < l && l < parts.style[1]);
    const inTemplate = (parts: ReturnType<typeof svelteParts> | null, l: number) => !!parts && !inStyle(parts, l) && !(parts.style && (l === parts.style[0] || l === parts.style[1])) && !parts.scripts.some(([a, b]) => a <= l && l <= b);
    const treeBefore = css || partsBefore?.style ? cssOf(f.before, css ? null : partsBefore!.style) : [];
    const treeAfter = css || partsAfter?.style ? cssOf(f.after, css ? null : partsAfter!.style) : [];
    let lightsAny = false;
    // (The scenes' code: what it changes is what places build, so none it builds as it did, and no line unrun.)
    const scenes = !!prints && SCENE_CODE.test(file);

    for (const h of f.hunks) {
      const sideLines = ([s, c]: [number, number]) => (c > 0 ? Array.from({ length: c }, (_, i) => s + i) : [s, s + 1].filter((l) => l >= 1));
      const where = h.new[1] > 0 ? span(h.new[0], h.new[1]) : `around line ${Math.max(1, h.new[0])}`;
      // The script and the template: the places that ran the changed lines, looked up on the side the map has them as they were.
      if (!css && runs) {
        const lookup = (lines: number[], drift: Hunk[] | null | 'unknown', parts: ReturnType<typeof svelteParts> | null) => {
          if (drift === 'unknown') return null;
          const at: { m: number; template: boolean }[] = [];
          for (const l of lines) {
            if (inStyle(parts, l)) continue;
            const m = drift ? carry(l, drift, 'new') : l;
            if (m === null) return null;
            at.push({ m, template: inTemplate(parts, l) });
          }
          return at;
        };
        // (Not the side a file added or gone hasn't got.)
        const there = ([s, c]: [number, number]) => s > 0 || c > 0;
        const found = (there(h.old) && lookup(sideLines(h.old), f.toBase, partsBefore)) || (there(h.new) && lookup(sideLines(h.new), f.toNow, partsAfter)) || null;
        const fn = (h.new[1] > 0 && f.after !== null ? enclosingName(f.after, h.new[0]) : null) ?? (f.before !== null ? enclosingName(f.before, Math.max(1, h.old[0])) : null);
        const named = `${base(file)}: ${fn ? `${fn} (${where})` : where}`;
        if (!found) {
          // Changed since the map too: wherever the file runs.
          if (sideLines(h.old).some((l) => !inStyle(partsBefore, l)) || sideLines(h.new).some((l) => !inStyle(partsAfter, l))) {
            const p = scenes ? builtAnew(placesOf(file)) : placesOf(file);
            if (p.size) light(file, p, `${named}, changed since the scene map`), (lightsAny = true);
          }
        } else if (found.length) {
          const places = new Set<number>();
          let code = false;
          for (const { m, template } of found) {
            const v = lineIn(runs, m);
            if (v >= 0) {
              code = true;
              for (const i of map.sets[v]) places.add(i);
            } else if (v === MODULE || (v === NO_CODE && template)) for (const i of placesOf(file)) places.add(i);
          }
          const shown = scenes ? builtAnew(places) : places;
          if (shown.size) light(file, shown, named), (lightsAny = true);
          else if (code && !scenes) unrun.push({ file, what: fn ? `${fn} (${where})` : where });
        }
      }
      // The style: the changed rules, by the classes they name.
      if (css || partsBefore?.style || partsAfter?.style) {
        // (A rule changed on both sides once.)
        const rules = new Map<string, CssNode>();
        const add = (r: CssNode) => rules.set(`${r.parent?.prelude ?? ''}|${r.prelude}`, r);
        if (h.old[1] > 0) rulesAt(treeBefore, sideLines(h.old).filter((l) => inStyle(partsBefore, l))).forEach(add);
        if (h.new[1] > 0) rulesAt(treeAfter, sideLines(h.new).filter((l) => inStyle(partsAfter, l))).forEach(add);
        for (const rule of rules.values()) {
          const shown = rule.prelude.replace(/\s+/g, ' ');
          const why = `${base(file)}: ${shown.length > 60 ? `${shown.slice(0, 57)}...` : shown}`;
          const own = svelte && !rule.prelude.includes(':global');
          const places = new Set<number>();
          let classless = !isRule(rule);
          for (const sel of isRule(rule) ? splitTop(rule.prelude, /,/) : []) {
            let classes = selectorClasses(sel);
            // (A nested rule's `&` is its parent's.)
            for (let up = rule.parent; !classes.length && up && isRule(up); up = up.parent) classes = splitTop(up.prelude, /,/).flatMap(selectorClasses);
            if (!classes.length) {
              classless = true;
              continue;
            }
            let have = new Set(classPlaces(classes[0]));
            for (const c of classes.slice(1)) have = new Set(classPlaces(c).filter((i) => have.has(i)));
            for (const i of have) places.add(i);
          }
          if (own) for (const i of [...places]) if (!placesOf(file).has(i)) places.delete(i);
          if (classless) {
            if (file === APP_CSS) {
              if (!everywhere.has(`screens|${file}`)) everywhere.set(`screens|${file}`, { file, why, of: 'screens' });
              lightsAny = true;
              continue;
            }
            if (svelte) for (const i of placesOf(file)) places.add(i);
          }
          if (places.size) light(file, places, why), (lightsAny = true);
          else if (runs || GAME_FILE.test(file)) unrun.push({ file, what: shown });
        }
      }
    }
    if (css && !lightsAny && GAME_FILE.test(file) && !unrun.some((u) => u.file === file)) uncovered.push(file);
  }
  // A place the map hasn't got, with the scenes' code changed: new, all of it the change's.
  const added = prints && files.some((f) => SCENE_CODE.test(f.file)) ? Object.keys(prints.now).filter((k) => !(k in prints.was)) : [];
  const places = [
    ...added.map((key) => ({ key, why: 'new on the desk', score: 1 })),
    ...[...lit].sort(([a, x], [b, y]) => y.score - x.score || a - b).map(([i, p]) => ({ key: map.places[i], why: p.why, score: Math.round(p.score * 1000) / 1000 })),
  ];
  return { places, everywhere: [...everywhere.values()], uncovered, unrun };
}

/** The rules of a stylesheet, or of a Svelte file's <style> (its lines `style`). */
function cssOf(text: string | null, style: [number, number] | null): CssNode[] {
  if (text === null) return [];
  if (!style) return cssTree(text);
  const lines = text.split('\n');
  return cssTree(lines.slice(style[0], style[1] - 1).join('\n'), style[0] + 1);
}

// ---- on the desk's benches --------------------------------------------------------------

/** A bench a change touches, and why. */
export interface BenchTouched {
  key: string;
  why: string;
}

type BenchLike = { kind: 'piece'; key: string; files: string[] } | { kind: 'scenes'; key: string; scenes: { key: string; states?: { key?: string }[] }[] };

/**
 * The places of `change` and the benches they're on, in its order. A piece
 * the map hasn't got yet (new since it was made) counts by the files it
 * names (its `files`), if any of `changed` is one.
 */
export function benchesTouched(change: { places: { key: string; why: string }[]; mapped?: string[]; files?: string[] }, benches: BenchLike[]): { places: { key: string; why: string }[]; benches: BenchTouched[] } {
  const mapped = new Set(change.mapped ?? []);
  const places = [...change.places];
  for (const b of benches) {
    if (b.kind !== 'piece' || mapped.has(b.key) || places.some((p) => p.key === b.key)) continue;
    const hit = (change.files ?? []).find((f) => b.files.includes(f));
    if (hit) places.push({ key: b.key, why: `shows ${base(hit)} (not in the scene map yet)` });
  }
  const benchOf = (key: string) =>
    benches.find((b) => (b.kind === 'piece' ? b.key === key : b.scenes.some((s) => s.key === key || s.states?.some((st) => st.key === key))));
  const out: BenchTouched[] = [];
  for (const p of places) {
    const b = benchOf(p.key);
    if (b && !out.some((o) => o.key === b.key)) out.push({ key: b.key, why: p.why });
  }
  return { places: places.filter((p) => benchOf(p.key)), benches: out };
}

/** The place a screen's state is, if it's one: a state's own key, or its scene's for its first state. */
export function placeOfState(st: { key?: string; values: object; scene: { key: string; states?: { values: object }[] } }): string | undefined {
  if (st.key) return st.key;
  return !st.scene.states?.length || st.scene.states[0].values === st.values ? st.scene.key : undefined;
}
