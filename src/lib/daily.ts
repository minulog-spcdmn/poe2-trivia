// Today's unique: one question a day, the same for every exile. No server:
// the day (UTC) seeds the engine, so every browser on the same item data
// deals the same item and the same four names in the same order. The days
// answered, and the run of them answered right, stay in this browser and the
// player's own devices paired to sync (lib/sync: absorbDays, absorbDaily).

import { Engine, allArt, answerDrawn, createGame, DEFAULT_SETTINGS, type Item, type Knobs, type Question } from './game.ts';
import { DAILY_LAUNCH } from './dailyLaunch.ts';
import { seededRandom } from './patches.ts';
import { openStored } from './keepAside.ts';
import { readStored, storeKey, writeStored } from './storage.ts';
import dailyArt from '../data/dailyArt.json' with { type: 'json' };
import firstDays from '../data/firstDays.json' with { type: 'json' };

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

/**
 * The UTC day each item added since the daily began first stood on, by its
 * name (src/data/firstDays.json, kept by hand: items.json is generated). An
 * item not named there has stood from the start. A data refresh stamps its
 * new items (docs/development.md, "Refreshing item data"), so no day dealt
 * before them changes.
 */
export const FIRST_DAYS: ReadonlyMap<string, number> = new Map(
  Object.entries(firstDays as Record<string, string>).map(([name, date]) => [name, utcDay(Date.parse(`${date}T00:00:00Z`))]),
);

/** The items standing on `day`: those whose first day (FIRST_DAYS) has come. */
export const standingOn = (items: Item[], day: number, firstDays = FIRST_DAYS) => items.filter((it) => (firstDays.get(it.name) ?? -Infinity) <= day);

/**
 * The day's question, the same everywhere for the same items, made-up names
 * and day. It is dealt from the items standing that day, asked and offered
 * alike, so items added later never move a day already dealt.
 */
export function dailyQuestion(items: Item[], fakes: Record<string, string[]>, day: number, firstDays = FIRST_DAYS): Question {
  const rng = seededRandom(hash(`poe2.quest daily ${day}`));
  return askOne(dailyEngine(standingOn(items, day, firstDays), fakes, { rng, now: () => day * DAY_MS }), dailyGame(), rng);
}

// ---- this browser's answers ----------------------------------------------

export interface DailyRecord {
  /** The UTC day last answered. */
  day: number;
  /** Which of the four was picked that day (-1 not known: a day of an older build's run), and whether it was right. */
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

/**
 * The first day a forgotten day can be forgiven, the week the grace came in
 * (early enough for the QA desk's days before then). A day forgotten before
 * it ended the run, as the rules then did, though another device's days or
 * an older build's record may show the run around it only now (on one
 * device, the run before it was long gone).
 */
export const GRACE_SINCE = 20_744;

/** Whether the run goes on today only by the grace: yesterday went unanswered, the day before was answered right, and the grace is there. */
export const graceOn = (rec: DailyRecord | null, today: number) =>
  !!rec && rec.ok && rec.day === today - 2 && rec.grace === 0 && today - 1 >= GRACE_SINCE;

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
  const run = Math.min(rec.ok ? rec.streak - 1 : rec.ended, MAX_DAYS - 1);
  for (let day = Math.max(0, rec.day - run); day < rec.day; day++) marks.set(day, RIGHT);
  marks.set(rec.day, markOf(rec.picked, rec.ok));
  return logOf(marks)!;
}

/**
 * What the days up to `today` come to: the record of the last day answered,
 * its run and grace, as answering each in turn made it. A day still to come
 * (answered on a clock running ahead, or on a device already past midnight)
 * waits for its day: its question was that day's, so it counts then.
 */
export function replay(log: DailyLog | null, today = Infinity): DailyRecord | null {
  if (!log) return null;
  let rec: DailyRecord | null = null;
  for (let i = 0; i < log.days.length && log.from + i <= today; i++) {
    const mark = log.days[i];
    if (mark !== NONE) rec = answerDaily(rec, log.from + i, mark === RIGHT ? -1 : Number(mark) % 4, !isMiss(mark));
  }
  return rec;
}

/**
 * The days after answering today's question: the same log if today's was
 * answered already, or if a later day's was and `today` is only this
 * device's clock's (put back, it would answer a day gone by). Once the
 * server has said the day (`sure`), a later day's answer waits for its day.
 */
export function answerLog(log: DailyLog | null, today: number, picked: number, ok: boolean, sure = false): DailyLog {
  const marks = marksOf(log);
  if (log && (marks.has(today) || (!sure && lastOf(log) > today))) return log;
  marks.set(today, markOf(picked, ok));
  return logOf(marks)!;
}

const KEY = 'daily';
const DAYS = 'daily.days';
/** An older build's record as it was when the days took it in (the record stays for an older build: going back to one finds it). */
const TAKEN = 'daily.taken';
/** The days' format: a newer build's (higher) is never written over (lib/keepAside.ts). */
const LOG_VERSION = 1;
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
    if (!isInt(r.day) || r.day > MAX_DAY || !isInt(r.picked) || r.picked > 3 || typeof r.ok !== 'boolean' || !isInt(r.streak) || !isInt(r.ended)) return null;
    return { day: r.day, picked: r.picked, ok: r.ok, streak: r.streak, ended: r.ended, grace: 0 };
  } catch {
    return null;
  }
}

/** The most days a log holds (a century of them), well within what sync takes (lib/sync/shared.ts MAX_TAKEN). */
const MAX_DAYS = 40_000;
/** The last day a record or log may name (in the year 2243): further is a broken clock. */
const MAX_DAY = 100_000;

/** Stored or sent days, in their one shape, or null when they're missing, malformed or a newer build's. */
export function parseLog(raw: string | null): DailyLog | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Record<string, unknown> | null;
    if (typeof r !== 'object' || r === null || (r.v !== undefined && r.v !== LOG_VERSION) || !isInt(r.from) || typeof r.days !== 'string') return null;
    if (r.days.length > MAX_DAYS || r.from + r.days.length > MAX_DAY + 1 || !/^[.0-8]*$/.test(r.days)) return null;
    return logOf(marksOf({ from: r.from, days: r.days }));
  } catch {
    return null;
  }
}

/** Days as they're kept and sent. */
const serialize = (log: DailyLog) => JSON.stringify({ v: LOG_VERSION, from: log.from, days: log.days });

/**
 * This device's days: as kept, and an older build's record as the days it
 * stands for (the run from before the days were kept, and anything an older
 * build in another tab has answered since), unless the days have taken it
 * in as it is (settleDays).
 */
export function loadLog(): DailyLog | null {
  const days = parseLog(readStored(DAYS));
  const raw = readStored(KEY);
  // (Taken in already, unless the days it went into can't be read any more.)
  const rec = days && raw === readStored(TAKEN) ? null : parseDaily(raw);
  return mergeLogs(days, rec && daysOf(rec));
}

/** Keeps the days, never over a newer build's (lib/keepAside.ts); whether that changed what was kept. */
export function saveLog(log: DailyLog | null): boolean {
  if (!log) return false;
  const raw = serialize(log);
  // (Never days that couldn't be read back: they would be lost on the next load.)
  return readStored(DAYS) !== raw && !!parseLog(raw) && !!openStored(DAYS, LOG_VERSION, parseLog) && writeStored(DAYS, raw);
}

/** This device's days for sync to pass on (lib/sync/shared.ts), with an older build's record not yet taken in; null for none. */
export function ownDaysRaw(): string | null {
  const log = loadLog();
  return log && serialize(log);
}

/** Keeps the days `after` when they differ from `before`; whether anything changed. */
const keep = (before: DailyLog | null, after: DailyLog | null) => JSON.stringify(before) !== JSON.stringify(after) && saveLog(after);

/**
 * Keeps the days as loadLog makes them, and notes an older build's record
 * (this device's from before, or another tab's since) as taken in once they
 * hold it, so it isn't taken in again: the days may have let go of some of
 * it since (upTo). The record itself stays, for an older build should the
 * site ever go back to one. Whether anything changed.
 */
export function settleDays(): boolean {
  const log = loadLog();
  const changed = saveLog(log);
  const raw = readStored(KEY);
  // (Only once the days are kept: else the record is all there is.)
  if (raw === null || raw === readStored(TAKEN) || !log || readStored(DAYS) !== serialize(log)) return changed;
  return writeStored(TAKEN, raw) || changed;
}

/**
 * The days but any more than a day after `today`, which can't be yet (a
 * clock running ahead, or broken). The run of an older build's record whose
 * own day was among them stays, as far as it reaches up to then: counted on
 * the same clock, it was a run all the same. The same log when there are
 * none.
 */
export function upTo(log: DailyLog | null, today: number): DailyLog | null {
  if (!log || lastOf(log) <= today + 1) return log;
  const marks = marksOf(log);
  for (const day of [...marks.keys()]) if (day > today + 1) marks.delete(day);
  return logOf(marks);
}

/** Lets go of this device's days, as stored, more than a day after `today` (upTo; by the server's clock, once it has said). Whether that changed anything. */
export function dropAhead(today: number): boolean {
  const mine = loadLog();
  return keep(mine, upTo(mine, today));
}

/** Takes in another of the player's devices' days (up to a day after `today`, by the server's clock where it has said). Whether it changed anything. */
export function absorbDays(raw: string, today = utcDay(Date.now())): boolean {
  const theirs = upTo(parseLog(raw), today);
  if (!theirs) return false;
  const mine = loadLog();
  return keep(mine, mergeLogs(mine, theirs));
}

/** Takes in an older build's record from another of the player's devices, as the days it stands for (daysOf), but not one from more than a day ahead. Whether it changed anything. */
export function absorbDaily(raw: string, today = utcDay(Date.now())): boolean {
  const theirs = parseDaily(raw);
  if (!theirs || theirs.day > today + 1) return false;
  const mine = loadLog();
  return keep(mine, mergeLogs(mine, daysOf(theirs)));
}
