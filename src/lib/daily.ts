// Today's unique: one question a day, the same for every exile. No server:
// the day (UTC) seeds the engine, so every browser on the same item data
// deals the same item and the same four names in the same order. The
// answer and the run of days answered right stay in this browser.

import { Engine, createGame, DEFAULT_SETTINGS, type Item, type Knobs, type Question } from './game.ts';
import { seededRandom } from './patches.ts';
import { readStored, writeStored } from './storage.ts';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Day No. 1: the day Today's unique first went up. */
export const DAILY_LAUNCH = Date.UTC(2026, 9, 9);

/** The UTC day a moment falls on, counted from 1970. */
export const utcDay = (ms: number) => Math.floor(ms / DAY_MS);

/** Today's number, "No. N": 1 on the launch day. */
export const dayNumber = (ms: number) => utcDay(ms) - utcDay(DAILY_LAUNCH) + 1;

/** Whole hours until the next UTC day, rounded up (1 to 24). */
export const hoursLeft = (ms: number) => Math.max(1, Math.ceil(((utcDay(ms) + 1) * DAY_MS - ms) / HOUR_MS));

/** "next in 11 hours". Always the whole word: a lone "h" reads like a "b" in this font. */
export function nextIn(ms: number): string {
  const h = hoursLeft(ms);
  return `next in ${h} ${h === 1 ? 'hour' : 'hours'}`;
}

/**
 * The game's four answers without its veils, timers and mirroring: four
 * names of one kind, half of the decoys look-alikes, one made up. Practice
 * questions are asked the same way.
 */
export const DAILY_KNOBS: Knobs = { options: 4, similarNames: 0.5, fakes: 1, artChance: 0, veil: 'off', grayscale: 'off', mirror: 0, lockout: 0 };

/** A game with the daily's knobs, to ask its questions from (and keep the answers used). */
export const dailyGame = () => createGame(null, { ...DEFAULT_SETTINGS, difficulty: 'custom', custom: { ...DAILY_KNOBS } });

/** Gems are square tiles on cloth, and there are many alike: the daily keeps to the items. */
export const askable = (items: Item[]) => items.filter((it) => it.kind !== 'gem');

/** A string's 32-bit FNV-1a hash, to seed from. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Asks a question in the category of an item drawn from `items`, so a
 * category comes up as often as it has items. `rng` draws the item and is
 * the engine's too.
 */
export function askOne(engine: Engine, game = dailyGame(), rng: () => number = Math.random): Question {
  const pool = askable(engine.items);
  const category = pool[Math.floor(rng() * pool.length)].category;
  const q = engine.makeQuestion(game, category);
  // As the game does: an answer isn't asked again, nor offered as a decoy, until its category starts over.
  game.used.push(q.itemId);
  return q;
}

/** The day's question, the same everywhere for the same items, made-up names and day. */
export function dailyQuestion(items: Item[], fakes: Record<string, string[]>, day: number): Question {
  const rng = seededRandom(hash(`poe2.quest daily ${day}`));
  const engine = new Engine(items, { rng, fakes, now: () => day * DAY_MS });
  return askOne(engine, dailyGame(), rng);
}

// ---- this browser's answers ----------------------------------------------

export interface DailyRecord {
  /** The UTC day last answered. */
  day: number;
  /** Which of the four was picked that day, and whether it was right. */
  picked: number;
  ok: boolean;
  /** Days answered right in a row, up to and including `day` (0 after a miss). */
  streak: number;
  /** The run a miss on `day` ended (0 if none). */
  ended: number;
}

/** The run still going on `today`: answered right today or yesterday. */
export function streakOn(rec: DailyRecord | null, today: number): number {
  if (!rec || !rec.ok) return 0;
  return rec.day === today || rec.day === today - 1 ? rec.streak : 0;
}

/** Today's answer, once given. */
export const answeredOn = (rec: DailyRecord | null, today: number) => (rec && rec.day === today ? rec : null);

/** The record after answering today's question (the same record if today's was answered already). */
export function answerDaily(rec: DailyRecord | null, today: number, picked: number, ok: boolean): DailyRecord {
  if (rec && rec.day >= today) return rec;
  const run = streakOn(rec, today);
  return ok ? { day: today, picked, ok, streak: run + 1, ended: 0 } : { day: today, picked, ok, streak: 0, ended: run };
}

const KEY = 'daily';
const isInt = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;

/** A stored record, or null when it's missing or malformed. */
export function parseDaily(raw: string | null): DailyRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Record<string, unknown>;
    if (!isInt(r.day) || !isInt(r.picked) || r.picked > 3 || typeof r.ok !== 'boolean' || !isInt(r.streak) || !isInt(r.ended)) return null;
    return { day: r.day, picked: r.picked, ok: r.ok, streak: r.streak, ended: r.ended };
  } catch {
    return null;
  }
}

export const loadDaily = () => parseDaily(readStored(KEY));
export const saveDaily = (rec: DailyRecord) => void writeStored(KEY, JSON.stringify(rec));
