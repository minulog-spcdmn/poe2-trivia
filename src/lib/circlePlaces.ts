// Where each rune circle stands (docs/arcane-style.md), said once: the
// game, the codex and today's unique all take their circles from here
// (src/components/circles.ts, DailyUnique), and the circles' bench
// on the QA desk (qa.html?b=circle) lists it, so it always shows where each one is. Names only,
// no circles: the start page reads it without loading any.

import type { PlateName } from './plates/index.ts';

export type Place = {
  /** Where, in words. */
  where: string;
  /** The circles there, by their plates' names (more than one: they take turns, `how`). */
  circles: readonly PlateName[];
  /** How the circles take turns there, or how the one there is shown. */
  how: string;
};

export const PLACES = {
  question: {
    where: 'Behind a question (Delve too, but for a find)',
    circles: ['eye', 'monad', 'rose', 'moth'],
    how: 'a different one from question to question, never the same twice running, the same for every player',
  },
  find: { where: "Behind a Delve find’s question", circles: ['blackSun'], how: '' },
  daily: {
    where: "Behind today’s unique",
    circles: ['eye', 'monad', 'rose', 'moth'],
    how: 'a different one from day to day, never the same two days running',
  },
  end: {
    where: 'The end of a game (not Delve)',
    circles: ['eye', 'monad'],
    how: 'one or the other by the game, the same for every player; hollow round one avatar',
  },
  perished: {
    where: "A Delve’s end, where everyone perished",
    circles: ['moth'],
    how: 'hollow round one avatar, whole where several share the heart',
  },
  item: { where: 'The item window (codex and game)', circles: ['eye'], how: '' },
  collection: { where: "The Codex’s collection", circles: ['moth'], how: '' },
  achievements: { where: "The Codex’s achievements", circles: ['monad'], how: '' },
  codexDelve: { where: "The Codex’s Delve page", circles: ['blackSun'], how: '' },
  sync: { where: 'Pairing devices to sync', circles: ['monad'], how: 'hollow round the QR code, the camera or the seal' },
} as const satisfies Record<string, Place>;

export type PlaceName = keyof typeof PLACES;
/** A place where only one circle stands (where several take turns, the caller picks: lib/turns). */
export type OnePlace = { [K in PlaceName]: (typeof PLACES)[K]['circles'] extends readonly [PlateName] ? K : never }[PlaceName];

/** The one circle at `place`. */
export const circleAtPlace = (place: OnePlace): PlateName => PLACES[place].circles[0];
