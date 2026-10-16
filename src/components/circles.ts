// The rune circles: one craft in several plates (docs/arcane-style.md), so
// the same circle isn't behind everything. All take the same props.
import type { Component } from 'svelte';
import { turnOf } from '../lib/turns';
import ArcaneCircle from './ArcaneCircle.svelte';
import ForbiddenCircle from './ForbiddenCircle.svelte';
import MonadCircle from './MonadCircle.svelte';
import RoseCircle from './RoseCircle.svelte';

export type Circle = Component<{ state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number }>;

/** Behind today's unique: any but Delve's black sun, a different one from day to day (loaded by DailyUnique one at a time, in this order). */
export const DAILY_CIRCLES: Circle[] = [ArcaneCircle, MonadCircle, RoseCircle, ForbiddenCircle];
/** Behind a question's art (not Delve's): the same four, a different one from question to question. */
export const QUESTION_CIRCLES: Circle[] = DAILY_CIRCLES;
/** Behind the end of a game (not Delve's): the monad or the eye. */
export const END_CIRCLES: Circle[] = [MonadCircle, ArcaneCircle];
/** Behind the end of a Delve, where everyone perished. */
export const PERISHED_CIRCLE: Circle = ForbiddenCircle;

/** The `n`th circle (a day, a question's turn) of `from` in a run seeded `seed`, never the same twice running (lib/turns). */
export const circleAt = (n: number, from: Circle[], seed = 0) => turnOf(n, from, seed);

/** One of `from`, at random. */
export const anyOf = (from: Circle[]) => from[Math.floor(Math.random() * from.length)];
