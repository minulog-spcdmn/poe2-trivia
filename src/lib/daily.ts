// Today's unique: one question a day, the same for every exile. No server:
// the day (UTC) seeds the engine, so every browser on the same item data
// deals the same item and the same four names in the same order. The days
// answered, and the run of them answered right, stay in this browser and the
// player's own devices paired to sync (lib/sync: absorbDays, absorbDaily).

import { Engine, allArt, answerDrawn, createGame, DEFAULT_SETTINGS, type Item, type Knobs, type Question } from './game.ts';
import { DAILY_LAUNCH } from './dailyLaunch.ts';
import { seededRandom } from './patches.ts';
import { readStored, storeKey, writeStored } from './storage.ts';
import dailyArt from '../data/dailyArt.json' with { type: 'json' };

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** Item kinds named as a pair, which take no article ("Gloves", "Gloves or boots"). */
const PAIRS = /^(gloves|boots)\b/;

/**
 * What the item is, as the legend's line names it: the topic with its
 * article, the first letter capitalised ("A shield", "An amulet or belt",
 * "A one-handed weapon"), none for the pairs ("Gloves or boots"). "An" goes
 * by the sound: before a vowel sound, not before "one-".
 */
export function aTopic(topic: string): string {
  const t = topic.toLowerCase();
  const article = PAIRS.test(t) ? '' : /^[aeiou]/.test(t) && !/^(one|uni|use|eu)/.test(t) ? 'an ' : 'a ';
  const said = article + t;
  return said.charAt(0).toUpperCase() + said.slice(1);
}

export { DAILY_LAUNCH };

/** The UTC day a moment falls on, counted from 1970. */
export const utcDay = (ms: number) => Math.floor(ms / DAY_MS);

/** Whole `unit`s until the next UTC day, rounded up (at least 1). */
const leftIn = (ms: number, unit: number) => Math.max(1, Math.ceil(((utcDay(ms) + 1) * DAY_MS - ms) / unit));

/** Whole hours until the next UTC day, rounded up (1 to 24). */
export const hoursLeft = (ms: number) => leftIn(ms, HOUR_MS);

/** Whole minutes until the next UTC day, rounded up (1 to 1440). */
export const minutesLeft = (ms: number) => leftIn(ms, MINUTE_MS);

/** Milliseconds until the next whole minute (1 to 60000), when minutesLeft next goes down. */
export const untilNextMinute = (ms: number) => MINUTE_MS - (((ms % MINUTE_MS) + MINUTE_MS) % MINUTE_MS);

/**
 * "next in 11 hours", or with `what` named, "next daily in 11 hours"; in the
 * last hour, minutes ("next in 25 minutes"). Always the whole word: a lone
 * "h" reads like a "b" in this font.
 */
export function nextIn(ms: number, what = ''): string {
  const m = minutesLeft(ms);
  const [n, unit] = m < 60 ? [m, 'minute'] : [hoursLeft(ms), 'hour'];
  return `next ${what ? `${what} ` : ''}in ${n} ${unit}${n === 1 ? '' : 's'}`;
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

/**
 * Pictures too thin to be the start page's eye-catcher, by their art's id
 * (DrawnItem.art: an item's own id, or a variant's): bare sticks that leave
 * the circle all but empty (scripts/daily-art.py measures them). They are
 * never asked here, though their items may be offered as decoys.
 */
export const TOO_THIN: ReadonlySet<string> = new Set(dailyArt.thin);

/** Whether the question's picture is too thin for the start page (the art it draws the answer with). */
const thin = (engine: Engine, q: Question) => TOO_THIN.has(answerDrawn(engine.byId.get(q.itemId)!, q).art);
/** Draws past this many thin items in a row are given up on (they can't all be). */
const THIN_TRIES = 12;

/** A string's 32-bit FNV-1a hash, to seed from. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Asks a question in the category of an item drawn from `items`, so a
 * category comes up as often as it has items (those not too thin). `rng`
 * draws the item and is the engine's too.
 */
export function askOne(engine: Engine, game = dailyGame(), rng: () => number = Math.random): Question {
  // Items with a picture fit to show (a thin picture of one is drawn again below).
  const pool = askable(engine.items).filter((it) => allArt(it).some((a) => !TOO_THIN.has(a.art)));
  let q: Question;
  let tries = 0;
  do {
    const category = pool[Math.floor(rng() * pool.length)].category;
    q = engine.makeQuestion(game, category);
    // As the game does: an answer isn't asked again, nor offered as a decoy, until its category starts over.
    game.used.push(q.itemId);
    // A thin one is put by (used, so not asked again) and another drawn.
  } while (thin(engine, q) && ++tries < THIN_TRIES);
  return q;
}

/**
 * An engine that asks as Today's unique does. Twins (game.ts TWINS) may meet
 * in it, as they could from its first day, so no day's question changes with
 * them (tests/daily.test.ts pins the days), and practice asks the same way.
 */
export const dailyEngine = (items: Item[], fakes: Record<string, string[]>, opts: { rng?: () => number; now?: () => number } = {}) =>
  new Engine(items, { ...opts, fakes, twins: false });

/** The day's question, the same everywhere for the same items, made-up names and day. */
export function dailyQuestion(items: Item[], fakes: Record<string, string[]>, day: number): Question {
  const rng = seededRandom(hash(`poe2.quest daily ${day}`));
  return askOne(dailyEngine(items, fakes, { rng, now: () => day * DAY_MS }), dailyGame(), rng);
}

// ---- this browser's answers ----------------------------------------------

export interface DailyRecord {
  /** The UTC day last answered. */
  day: number;
  /** Which of the four was picked that day, and whether it was right. */
  picked: number;
  ok: boolean;
  /** Days answered right in a row, up to and including `day` (0 after a miss); a forgiven day (GRACE_DAYS) goes uncounted. */
  streak: number;
  /** The run a miss on `day` ended (0 if none). */
  ended: number;
  /** Right answers still to give before a forgotten day is forgiven again (0: it would be). */
  grace: number;
}

/**
 * A run survives one forgotten day; two in a row end it. Once a forgotten
 * day is forgiven, this many right answers (the one that day's grace let
 * the player give among them) earn the grace back. A wrong answer ends the
 * run all the same: the grace is for a day away, never for not knowing.
 */
export const GRACE_DAYS = 7;

/** Whether the run goes on today only by the grace: yesterday went unanswered, the day before was answered right, and the grace is there. */
export const graceOn = (rec: DailyRecord | null, today: number) => !!rec && rec.ok && rec.day === today - 2 && rec.grace === 0;

/** The run still going on `today`: answered right today or yesterday, or the day before with the grace for yesterday. */
export function streakOn(rec: DailyRecord | null, today: number): number {
  if (!rec || !rec.ok) return 0;
  return rec.day === today || rec.day === today - 1 || graceOn(rec, today) ? rec.streak : 0;
}

/** Today's answer, once given. */
export const answeredOn = (rec: DailyRecord | null, today: number) => (rec && rec.day === today ? rec : null);

/** The record after answering today's question (the same record if today's was answered already). */
export function answerDaily(rec: DailyRecord | null, today: number, picked: number, ok: boolean): DailyRecord {
  if (rec && rec.day >= today) return rec;
  const run = streakOn(rec, today);
  if (!ok) return { day: today, picked, ok, streak: 0, ended: run, grace: 0 };
  // Forgiven today, the grace comes back after GRACE_DAYS right answers, today's the first; a new run starts with it.
  const grace = graceOn(rec, today) ? GRACE_DAYS - 1 : run > 0 ? Math.max(0, rec!.grace - 1) : 0;
  return { day: today, picked, ok, streak: run + 1, ended: 0, grace };
}


// ---- the days answered, the same on all the player's devices --------------
//
// A device keeps more than its last record: every day it knows answered, its
// own or another of the player's devices' (lib/sync), and works the run and
// its grace out from them by the rules above (replay). Sync passes on what a
// device holds only while two are on the site at once, and a player may
// answer on the phone one day and the computer the next: with the last
// record alone, each device took the other's days for forgotten ones and the
// run broke on both. The days merge instead (a day answered on any device
// stands, a miss over a right answer), which comes out the same in any
// order, from any number of devices, however often the same days come again.
//
// The record as it was kept before (under its old name, and as older builds
// still send it) is never written here: an older build reading a run the
// grace kept going would carry it on as days in a row that weren't. So a
// record is only ever an older build's, its run days answered right one
// after another, and it is taken in as those days (daysOf).

/**
 * The days answered: from day `from`, a character a day, '.' none, '0' to
 * '3' right with that option picked, '4' to '7' wrong with option n - 4, '8'
 * right with the option not known (a day of an older build's run). Always in
 * one shape (no '.' at either end), so the same days are the same string.
 */
export interface DailyLog {
  from: number;
  days: string;
}

const NONE = '.';
/** Right, the option picked not known. */
const RIGHT = '8';
const markOf = (picked: number, ok: boolean) => String(ok ? picked : picked + 4);
const isMiss = (mark: string) => mark >= '4' && mark <= '7';

/** How a day's answer ranks against another's for the same day: a miss over a right answer (the day isn't two guesses), a known pick over an unknown one, then the lower. */
const rank = (mark: string) => (isMiss(mark) ? 0 : mark === RIGHT ? 2 : 1);

/** Of two answers to one day (given on two devices), the one that stands. */
function stands(a: string | undefined, b: string): string {
  if (a === undefined || a === NONE) return b;
  if (b === NONE || a === b) return a;
  return rank(a) !== rank(b) ? (rank(a) < rank(b) ? a : b) : a < b ? a : b;
}

/** The days a log holds, by day. */
function marksOf(log: DailyLog | null): Map<number, string> {
  const marks = new Map<number, string>();
  if (log) for (let i = 0; i < log.days.length; i++) if (log.days[i] !== NONE) marks.set(log.from + i, log.days[i]);
  return marks;
}

/** A log of these days in its one shape; null for none. */
function logOf(marks: Map<number, string>): DailyLog | null {
  let from = Infinity;
  let to = -Infinity;
  for (const day of marks.keys()) [from, to] = [Math.min(from, day), Math.max(to, day)];
  if (from > to) return null;
  let days = '';
  for (let day = from; day <= to; day++) days += marks.get(day) ?? NONE;
  return { from, days };
}

/** The last day a log holds. */
const lastOf = (log: DailyLog) => log.from + log.days.length - 1;

/** Two logs as one: every day either holds, the answer that stands where both do. */
export function mergeLogs(a: DailyLog | null, b: DailyLog | null): DailyLog | null {
  const marks = marksOf(a);
  for (const [day, mark] of marksOf(b)) marks.set(day, stands(marks.get(day), mark));
  return logOf(marks);
}

/**
 * An older build's record as the days it stands for: its day's answer, and
 * before it the run it counts (right answers on the days before, one after
 * another, as its rules counted them: no grace), or for a miss the run it
 * ended.
 */
export function daysOf(rec: DailyRecord): DailyLog {
  const marks = new Map<number, string>();
  const run = rec.ok ? rec.streak - 1 : rec.ended;
  for (let day = Math.max(0, rec.day - run); day < rec.day; day++) marks.set(day, RIGHT);
  marks.set(rec.day, markOf(rec.picked, rec.ok));
  return logOf(marks)!;
}

/** What the days come to: the record of the last day answered, its run and grace, as answering each in turn made it. */
export function replay(log: DailyLog | null): DailyRecord | null {
  if (!log) return null;
  let rec: DailyRecord | null = null;
  for (let i = 0; i < log.days.length; i++) {
    const mark = log.days[i];
    if (mark !== NONE) rec = answerDaily(rec, log.from + i, mark === RIGHT ? 0 : Number(mark) % 4, !isMiss(mark));
  }
  return rec;
}

/** The days after answering today's question (the same log if today's, or a later day's, was answered already). */
export function answerLog(log: DailyLog | null, today: number, picked: number, ok: boolean): DailyLog {
  if (log && lastOf(log) >= today) return log;
  const marks = marksOf(log);
  marks.set(today, markOf(picked, ok));
  return logOf(marks)!;
}

/**
 * Days still to come, once the server has said what day it is: answered
 * while this device's clock ran ahead (or before the server had said), or
 * taken in from a device whose clock did. They are moved back to end
 * yesterday, so today's can be answered and the run goes on, and with them
 * the run of an older build's record that ends among them (its days were
 * counted on the same clock). Where a day they land on has an answer
 * already, the one that stands of the two, as from two devices. Null when
 * there are none.
 */
export function fromClockAhead(log: DailyLog | null, today: number): DailyLog | null {
  if (!log) return null;
  const last = lastOf(log);
  if (last <= today) return null;
  const marks = marksOf(log);
  const moved: [number, string][] = [];
  for (let day = last; marks.has(day) && (day > today || marks.get(day) === RIGHT); day--) {
    moved.push([day, marks.get(day)!]);
    marks.delete(day);
  }
  const back = last - (today - 1);
  for (const [day, mark] of moved) marks.set(day - back, stands(marks.get(day - back), mark));
  return logOf(marks);
}

const KEY = 'daily';
const DAYS = 'daily.days';
/** The whole keys, as storage events name them. */
export const DAILY_KEY = storeKey(KEY);
export const DAYS_KEY = storeKey(DAYS);
const isInt = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;

/** A record (an older build's, as it stores and sends it), or null when it's missing or malformed. */
export function parseDaily(raw: string | null): DailyRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Record<string, unknown> | null;
    if (typeof r !== 'object' || r === null) return null;
    if (!isInt(r.day) || !isInt(r.picked) || r.picked > 3 || typeof r.ok !== 'boolean' || !isInt(r.streak) || !isInt(r.ended)) return null;
    return { day: r.day, picked: r.picked, ok: r.ok, streak: r.streak, ended: r.ended, grace: 0 };
  } catch {
    return null;
  }
}

/** The most days a log holds (a century of them), well within what sync takes (lib/sync/shared.ts MAX_TAKEN). */
const MAX_DAYS = 40_000;

/** Stored or sent days, in their one shape, or null when they're missing or malformed. */
export function parseLog(raw: string | null): DailyLog | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Record<string, unknown> | null;
    if (typeof r !== 'object' || r === null || !isInt(r.from) || typeof r.days !== 'string' || r.days.length > MAX_DAYS || !/^[.0-8]*$/.test(r.days)) return null;
    return logOf(marksOf({ from: r.from, days: r.days }));
  } catch {
    return null;
  }
}

/**
 * This device's days: as kept, and the record under the old name as the days
 * it stands for (the run from before the days were kept, and anything an
 * older build in another tab has answered since).
 */
export function loadLog(): DailyLog | null {
  const rec = parseDaily(readStored(KEY));
  return mergeLogs(parseLog(readStored(DAYS)), rec && daysOf(rec));
}

/** Keeps the days; whether that changed what was kept. */
export function saveLog(log: DailyLog | null): boolean {
  if (!log) return false;
  const raw = JSON.stringify(log);
  return readStored(DAYS) !== raw && writeStored(DAYS, raw);
}

/** The record this device's days come to. */
export const loadDaily = () => replay(loadLog());

/** This device's days as stored, for sync to pass on (lib/sync/shared.ts); null for none. */
export const ownDaysRaw = () => readStored(DAYS);

/** Keeps the days `after` when they differ from `before`; whether anything changed. */
const keep = (before: DailyLog | null, after: DailyLog | null) => JSON.stringify(before) !== JSON.stringify(after) && saveLog(after);

/** Keeps the days as loadLog makes them, with an older build's record taken in (from before, or another tab's since); whether anything changed. */
export const settleDays = () => saveLog(loadLog());

/** Takes in another of the player's devices' days, but none reaching more than a day ahead of this device's clock, which can't be yet. Whether it changed anything. */
export function absorbDays(raw: string, today = utcDay(Date.now())): boolean {
  const theirs = parseLog(raw);
  if (!theirs || lastOf(theirs) > today + 1) return false;
  const mine = loadLog();
  return keep(mine, mergeLogs(mine, theirs));
}

/** Takes in an older build's record from another of the player's devices, as the days it stands for (daysOf), but none from more than a day ahead. Whether it changed anything. */
export function absorbDaily(raw: string, today = utcDay(Date.now())): boolean {
  const theirs = parseDaily(raw);
  if (!theirs || theirs.day > today + 1) return false;
  const mine = loadLog();
  return keep(mine, mergeLogs(mine, daysOf(theirs)));
}
