// Which scenes a change touches, from the files it changes: what the QA
// desk's "This change" walks. Each scene's files come from running it with
// the browser's coverage on (npm run qa -- --map writes
// src/data/sceneFiles.json): a file counts for a scene once some function of
// it ran there, beyond its module's top level, so App.svelte's imports don't
// put every file in every scene. Files nearly every scene runs (the app's
// frame, its stylesheet) are `global`: a change to one walks one scene of
// each screen. A changed scene file walks its screen's scenes.

import { SCREENS, type Screen } from './scene.ts';

/** What npm run qa -- --map found: every file's scenes, and the files almost every scene runs. */
export interface SceneFiles {
  global: string[];
  files: Record<string, string[]>;
}

/** Files that change how everything looks or runs, whatever the map says. */
// (src/qa/tweaks.ts and src/qa/build/ too: the scene map leaves out src/qa/, and they build every screen's scenes.)
const EVERYWHERE = [/^src\/app\.css$/, /^src\/main\.ts$/, /^src\/(App|Root)\.svelte$/, /^vite\.config\.ts$/, /^package(-lock)?\.json$/, /^src\/assets\/fonts\//, /^index\.html$/, /^src\/qa\/(tweaks\.ts$|build\/)/];
/** Scene files, by the screen whose scenes they hold. */
const SCENE_FILE = /^src\/qa\/scenes\/(\w+)\.ts$/;
const FILE_SCREEN: Record<string, Screen> = { home: 'home', lobby: 'lobby', game: 'game', over: 'over', codex: 'codex', settings: 'settings', overlays: 'overlay' };

export interface Touched {
  /** The scenes to walk, in the catalog's order, each with why. */
  scenes: { key: string; why: string }[];
  /** Changed files of the game's that no scene runs. */
  uncovered: string[];
}

/**
 * The scenes `changed` touches (paths from the repository's root, forward
 * slashes), among `scenes` (keys and screens, in the catalog's order).
 */
export function touched(changed: string[], map: SceneFiles, scenes: { key: string; screen: Screen }[]): Touched {
  const why = new Map<string, string>();
  const add = (key: string, reason: string) => {
    if (!why.has(key)) why.set(key, reason);
  };
  const global = new Set(map.global);
  const uncovered: string[] = [];
  for (const file of changed) {
    const sceneFile = SCENE_FILE.exec(file);
    if (sceneFile) {
      const screen = FILE_SCREEN[sceneFile[1]];
      for (const s of scenes) if (s.screen === screen) add(s.key, `its scenes changed (${file})`);
      continue;
    }
    if (EVERYWHERE.some((re) => re.test(file)) || global.has(file)) {
      for (const { key } of SCREENS) {
        const first = scenes.find((s) => s.screen === key);
        if (first) add(first.key, `${file} changes every screen: one scene of each`);
      }
      continue;
    }
    const keys = map.files[file];
    if (keys?.length) for (const k of keys) add(k, `runs ${file}`);
    else if (/^src\/.*\.(ts|svelte|css)$/.test(file) && !file.startsWith('src/qa/')) uncovered.push(file);
  }
  return { scenes: scenes.filter((s) => why.has(s.key)).map((s) => ({ key: s.key, why: why.get(s.key)! })), uncovered };
}

/** What every piece's bench runs on: a change to one touches them all. */
const PIECE_FILES = ['src/qa/bench.ts', 'src/qa/benches/pieces.ts', 'src/qa/frame/PieceHost.svelte', 'src/qa/frame/piece.ts', 'src/qa/frame/pieceState.svelte.ts'];

/** A bench a change touches, and why. */
export interface BenchTouched {
  key: string;
  why: string;
}

/**
 * The benches `changed` touches: a piece through the files it names, its
 * own (in src/qa/benches/) and those every piece runs on, a screen of
 * scenes through any of its scenes `touched` found. Its `uncovered`: the changed files of the game's that no
 * scene runs and no piece names, which no bench shows.
 */
export function benchesTouched(
  changed: string[],
  scenes: Touched,
  benches: ({ kind: 'piece'; key: string; files: string[] } | { kind: 'scenes'; key: string; scenes: { key: string }[] })[],
): { benches: BenchTouched[]; uncovered: string[] } {
  const why = new Map(scenes.scenes.map((s) => [s.key, s.why]));
  const named = new Set<string>();
  const out: BenchTouched[] = [];
  for (const b of benches) {
    if (b.kind === 'piece') {
      const own = [`src/qa/benches/${b.key}.ts`, `src/qa/benches/${b.key[0].toUpperCase()}${b.key.slice(1)}View.svelte`, ...PIECE_FILES];
      const hit = changed.find((f) => b.files.includes(f) || own.includes(f));
      for (const f of changed) if (b.files.includes(f)) named.add(f);
      if (hit) out.push({ key: b.key, why: `shows ${hit}` });
    } else {
      const s = b.scenes.find((s) => why.has(s.key));
      if (s) out.push({ key: b.key, why: why.get(s.key)! });
    }
  }
  return { benches: out, uncovered: scenes.uncovered.filter((f) => !named.has(f)) };
}
