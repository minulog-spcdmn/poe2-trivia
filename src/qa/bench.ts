// A bench: one thing of the game's to try out in the QA desk (qa.html),
// live, in every state that matters. Two kinds:
//
// - A piece: a component on its own (the avatar, the streak badge), drawn in
//   a frame of its own at the size picked, with a panel of controls the
//   bench declares (sliders, choices, switches), named states to jump to and
//   buttons for what happens to it (answer right, turn over). It's one small
//   file in src/qa/benches/ and a view component; the desk gives it the rest.
// - A screen: every scene of one of the game's screens (src/qa/scenes), the
//   real game in a state. Its states are the scenes' (a scene's named
//   states, or the scene itself), under the scenes' headings; its controls
//   the shown scene's own and those any game has (./tweaks.ts).
//
// Plain data, so the tests can check every bench without a browser.

import type { Component } from 'svelte';
import type { Scene } from './scene.ts';

/**
 * A control in a piece's panel. `view`: only how it's shown (the width it's
 * drawn at, a name beside it), not a state of its own: going to a state
 * leaves it as set, it's no part of telling the states apart, and in All
 * states every state shows it as the panel has it.
 */
export type Control = (
  | { kind: 'range'; key: string; label: string; min: number; max: number; step?: number; default: number; unit?: string }
  | { kind: 'choice'; key: string; label: string; options: { value: string; label: string }[]; default: string }
  | { kind: 'toggle'; key: string; label: string; default: boolean }
) & { view?: boolean };

export type Value = string | number | boolean;
export type Values = Record<string, Value>;

/** A state worth seeing: a name and the controls it sets (the rest stay at their defaults). */
export interface State {
  label: string;
  values: Values;
  /** A scene's: the heading it's listed under, if not its scene's. */
  group?: string;
}

/** Something that happens to the piece, a button in its panel. */
export interface Action {
  key: string;
  label: string;
  /** A word on what it plays, under the button's name. */
  hint?: string;
}

/** What a piece's view is given in its frame. (Its actions it hears with onAction, ./frame/pieceState.svelte.ts.) */
export interface PieceProps {
  /** The controls as set (reactive). */
  v: Values;
  /** Moves controls from inside, as an action plays out (a day added): the panel follows. */
  set: (values: Values) => void;
  /** Whether it's one of many side by side (All states): no captions, no room taken beyond its own. */
  small: boolean;
}

export interface PieceBench {
  kind: 'piece';
  /** Stable: the address names it (qa.html?b=avatar). */
  key: string;
  label: string;
  /** What it's for, a line. */
  about: string;
  /** The files it shows, for This change (the bench's own files count anyway). */
  files: string[];
  controls: Control[];
  states: State[];
  actions?: Action[];
  /** How wide each state is at least in All states (CSS px; missing: 200). */
  cell?: number;
  view: () => Promise<{ default: Component<PieceProps> }>;
}

/** One of a screen's states: a scene, and its controls as the state sets them. */
export interface SceneState {
  scene: Scene;
  label: string;
  /** The heading it's listed under. */
  group: string;
  values: Values;
}

export interface SceneBench {
  kind: 'scenes';
  /** The screen's (`over`). */
  key: string;
  /** The screen's name ("End screen"). */
  label: string;
  scenes: Scene[];
  /** Every scene's states, in order. */
  states: SceneState[];
}

export type Bench = PieceBench | SceneBench;

/** A piece's controls as set: `given` where it holds a value the control can take, the default otherwise. */
export function valuesOf(controls: Control[], given: Record<string, Value | string | null | undefined> = {}): Values {
  return Object.fromEntries(controls.map((c) => [c.key, valueOf(c, given[c.key])]));
}

function valueOf(c: Control, raw: Value | string | null | undefined): Value {
  if (raw === undefined || raw === null) return c.default;
  if (c.kind === 'toggle') return raw === true || raw === '1' || raw === 'true';
  if (c.kind === 'range') {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(c.min, Math.min(c.max, n)) : c.default;
  }
  return c.options.some((o) => o.value === raw) ? String(raw) : c.default;
}

/** A state's controls in full: its own values over the defaults, and the view's controls as `now` has them. */
export function stateValues(bench: PieceBench, state: State, now: Values = {}): Values {
  const kept = Object.fromEntries(bench.controls.filter((c) => c.view && c.key in now).map((c) => [c.key, now[c.key]]));
  return valuesOf(bench.controls, { ...state.values, ...kept });
}

/** The state the controls are in, if they're in one (its index): the view's controls aside. */
export function stateAt(bench: PieceBench, v: Values): number {
  return bench.states.findIndex((s) => bench.controls.every((c) => c.view || stateValues(bench, s)[c.key] === v[c.key]));
}

/**
 * The screen's state `scene` is in with its controls as `v` has them (all of
 * `controls`, its own and every game's), if it's in one: one of its named
 * states, every control as that state sets it or at its default.
 */
export function sceneStateAt(bench: SceneBench, scene: Scene, controls: Control[], v: Values): number {
  return bench.states.findIndex((st) => st.scene === scene && controls.every((c) => (c.key in st.values ? valueOf(c, st.values[c.key]) : c.default) === v[c.key]));
}

/** Values as an address writes them (`k.` before each key, a switch 1 or 0). */
export function asQuery(values: Values): [string, string][] {
  return Object.entries(values).map(([k, x]) => [k, typeof x === 'boolean' ? (x ? '1' : '0') : String(x)]);
}

/** The controls away from their defaults, as the address writes them (`k.size=56`). */
export function valuesQuery(controls: Control[], v: Values): [string, string][] {
  return controls.filter((c) => v[c.key] !== c.default).map((c) => [c.key, c.kind === 'toggle' ? (v[c.key] ? '1' : '0') : String(v[c.key])]);
}
