/**
 * A recording of how someone plays, to tune the room bots' hands by
 * (src/bot/habits.ts, reach.ts): their pointer, finely, beside what the game
 * was showing. Beta and dev builds only, switched on with `?record` in the
 * address (`?record=off` stops it) and kept on for the tab
 * (components/Recorder.svelte). Nothing leaves the device: the player saves
 * the file and hands it over themselves. Typing isn't recorded, nor names.
 */
import { BETA, LOCAL } from './channel.ts';
import { removeStored, readStored, writeStored } from './storage.ts';
import { livesOf } from './delve.ts';
import type { GameState } from './game.ts';

/** Pointer samples closer together than this are dropped (ms): about 120 a second, plenty for a hand's speed. */
export const MOVE_EVERY_MS = 8;
/** What the pointer is over (cursors.ts anchors) is noted at most this often (ms). */
export const AT_EVERY_MS = 33;

const FLAG = 'record';

/** Whether this tab records: asked for in the address, or earlier in the tab. Strips the ask from the address. */
export function wantsRecording(): boolean {
  if (!BETA && !LOCAL) return false;
  const url = new URL(location.href);
  const ask = url.searchParams.get(FLAG);
  if (ask !== null) {
    if (ask === 'off') removeStored(FLAG, 'session');
    else writeStored(FLAG, '1', 'session');
    url.searchParams.delete(FLAG);
    history.replaceState(history.state, '', url);
  }
  return readStored(FLAG, 'session') === '1';
}

export function stopRecording() {
  removeStored(FLAG, 'session');
}

/** Where things were on screen: each anchor's box, in page pixels of the window. */
export interface Layout {
  t: number;
  w: number;
  h: number;
  scrollY: number;
  boxes: Record<string, [number, number, number, number]>;
}

/** What the game showed, as far as a hand cares. */
export interface Scene {
  t: number;
  phase: GameState['phase'];
  mode: GameState['settings']['mode'];
  round: number;
  /** Whose turn it is (index into the players), and whether it's this player's. */
  turn: number;
  mine: boolean;
  players: number;
  lives?: number;
  offered: string[];
  question?: {
    mode: string;
    category: string;
    labels: (string | null)[];
    prompt: string | null;
    find?: string;
    /** Host clock (ms since 1970); `started` maps it onto the recording's. */
    askedAt: number;
    deadline: number | null;
    clockAt?: number;
  };
  reveal?: { correctIndex: number; chosenIndex: number | null; correct: boolean; timedOut: boolean; at?: number };
}

export function sceneOf(s: GameState, me: string | null, t: number): Scene {
  const q = s.question;
  const r = s.reveal;
  const turn = s.turn;
  return {
    t,
    phase: s.phase,
    mode: s.settings.mode,
    round: s.round,
    turn,
    mine: !me || s.players[turn]?.id === me,
    players: s.players.length,
    // Hot seat (no `me`): whoever's turn it is.
    ...(s.delve && (me ?? s.players[turn]?.id) ? { lives: livesOf(s, me ?? s.players[turn].id) } : {}),
    offered: s.offered,
    ...(q
      ? {
          question: {
            mode: q.mode,
            category: q.category,
            labels: q.labels,
            prompt: q.prompt,
            ...(q.find ? { find: q.find } : {}),
            askedAt: q.askedAt,
            deadline: q.deadline,
            ...(q.clockAt !== undefined ? { clockAt: q.clockAt } : {}),
          },
        }
      : {}),
    ...(r ? { reveal: { correctIndex: r.correctIndex, chosenIndex: r.chosenIndex, correct: r.correct, timedOut: r.timedOut, at: r.at } } : {}),
  };
}

/** Something that happened, at `t` ms into the recording. */
export type Happening =
  | [t: number, what: 'down' | 'up', button: number, x: number, y: number]
  | [t: number, what: 'out' | 'hidden' | 'shown']
  | [t: number, what: 'wheel', dy: number]
  | [t: number, what: 'scroll', scrollY: number]
  | [t: number, what: 'key', key: string]
  | [t: number, what: 'pointer', type: string];

export class Recording {
  /** Date.now() at t = 0, to read the game's host-clock times against. */
  readonly started: number;
  /** [t, x, y] after each other, t in ms (to a tenth), x and y in whole pixels of the window. */
  readonly moves: number[] = [];
  /** [t, anchor code, x, y] after each other, as the pointer sync would send it (cursors.ts toAnchor). */
  readonly at: number[] = [];
  readonly happenings: Happening[] = [];
  readonly layouts: Layout[] = [];
  readonly scenes: Scene[] = [];
  private lastMove = -Infinity;
  private lastAt = -Infinity;
  private lastScene = '';
  /** Anything since it was last saved. */
  unsaved = false;

  constructor(started = Date.now()) {
    this.started = started;
  }

  /** A pointer sample; true when it was kept. */
  move(t: number, x: number, y: number): boolean {
    if (t - this.lastMove < MOVE_EVERY_MS) return false;
    this.lastMove = t;
    this.moves.push(Math.round(t * 10) / 10, Math.round(x), Math.round(y));
    this.unsaved = true;
    return true;
  }

  /** Whether it's time to note what the pointer is over again. */
  dueAt(t: number) {
    return t - this.lastAt >= AT_EVERY_MS;
  }

  pointAt(t: number, at: [number, number, number] | null) {
    this.lastAt = t;
    this.at.push(Math.round(t), ...(at ?? [-1, 0, 0]));
  }

  happen(h: Happening) {
    this.happenings.push([Math.round(h[0]), ...h.slice(1)] as Happening);
    this.unsaved = true;
  }

  layout(l: Layout) {
    const prev = this.layouts.at(-1);
    if (prev && JSON.stringify({ ...prev, t: 0 }) === JSON.stringify({ ...l, t: 0 })) return;
    this.layouts.push(l);
  }

  /** The game as it is now; only kept when something a hand cares about changed. Returns whether it did. */
  scene(sc: Scene): boolean {
    const key = JSON.stringify({ ...sc, t: 0 });
    if (key === this.lastScene) return false;
    this.lastScene = key;
    this.scenes.push(sc);
    this.unsaved = true;
    return true;
  }

  /** How long it has run (ms), by its last pointer sample. */
  get span() {
    return this.moves.at(-3) ?? 0;
  }

  file(about: Record<string, unknown>) {
    return JSON.stringify({
      v: 1,
      started: this.started,
      about,
      moves: this.moves,
      at: this.at,
      happenings: this.happenings,
      layouts: this.layouts,
      scenes: this.scenes,
    });
  }
}
