// Rivals remembered: who this browser has played, and how it went, so the
// next night starts with a score to settle. Per browser only (never shared
// between devices), and the copy always says so: "on this device".
//
// Online, after every finished turns or race game this browser's player was
// seated in, their record against each other seated player still connected
// at the end goes up: won when they won and the rival didn't, lost the other
// way round; a shared win, or both losing to someone else, counts for
// nobody. On one device (hot-seat), the sole winner beats every other seat,
// and the device keeps each pair of names' games won. Delve and spectators
// count nothing.
//
// Rivals are known by the look of their name (names.ts nameSkeleton), so
// "Ash" and "ash" are one rival, the name shown is the latest spelling, and
// someone renamed is a new rival. A game is counted once, by its start
// (startedAt): a reload or a second tab showing the same end changes nothing.
//
// Kept in localStorage like the codex. Records this build can't read are
// never written over: a newer build's stay as they are, anything else is kept
// aside first (keepAside.ts).

import type { GameState } from './game.ts';
import { clearAside, makeRoom, newerThan } from './keepAside.ts';
import { cleanName, nameSkeleton } from './names.ts';
import { readStored, removeStored, tryReadStored, writeStored } from './storage.ts';
import { versusGame } from './versus.ts';

const NAME = 'rivals';
const VERSION = 1;
/** Rivals and pairs kept; past these, the ones played longest ago go. */
export const RIVAL_LIMIT = 60;
export const PAIR_LIMIT = 60;
/** Games remembered as counted (their startedAt), so none counts twice. */
export const SEEN_LIMIT = 20;
/** The most games a record holds; more is read as this many. */
const MAX_COUNT = 100_000;

/** This browser's games against one rival online. */
export interface Rival {
  /** Their name as last played. */
  name: string;
  won: number;
  lost: number;
  /** When a game against them was last counted (this browser's clock): the oldest go first. */
  last: number;
  /** The start (startedAt) of the last game counted against them: the end screen's lines are about it. */
  game?: number;
}

/** Two names' games on this device, in the order of the key (`skelA|skelB`, sorted). */
export interface Pair {
  names: [string, string];
  wins: [number, number];
  last: number;
  game?: number;
}

export interface Rivals {
  /** Online rivals, by the look of their name. */
  vs: Record<string, Rival>;
  /** Hot-seat pairs, by both names' looks, sorted and joined with '|'. */
  pairs: Record<string, Pair>;
  /** The last games counted (startedAt), oldest first. */
  seen: number[];
}

export const emptyRivals = (): Rivals => ({ vs: {}, pairs: {}, seen: [] });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(MAX_COUNT, Math.floor(v)) : null);
const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** The key of two names' looks: sorted, so either order finds it. */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Only the `limit` played most recently. */
function newest<T extends { last: number }>(entries: Record<string, T>, limit: number): Record<string, T> {
  const all = Object.entries(entries);
  if (all.length <= limit) return entries;
  return Object.fromEntries(all.sort((a, b) => b[1].last - a[1].last).slice(0, limit));
}

const capped = (r: Rivals): Rivals => ({ vs: newest(r.vs, RIVAL_LIMIT), pairs: newest(r.pairs, PAIR_LIMIT), seen: r.seen.slice(-SEEN_LIMIT) });

function parseRival(key: string, v: unknown): Rival | null {
  if (!isObj(v)) return null;
  const name = cleanName(v.name);
  const won = count(v.won);
  const lost = count(v.lost);
  const last = time(v.last);
  if (!name || nameSkeleton(name) !== key || won === null || lost === null || last === null || won + lost === 0) return null;
  const game = time(v.game);
  return { name, won, lost, last, ...(game ? { game } : {}) };
}

function parsePair(key: string, v: unknown): Pair | null {
  if (!isObj(v) || !Array.isArray(v.names) || !Array.isArray(v.wins) || v.names.length !== 2 || v.wins.length !== 2) return null;
  const names = v.names.map(cleanName);
  const wins = v.wins.map(count);
  const last = time(v.last);
  const [a, b] = names.map(nameSkeleton);
  if (!names[0] || !names[1] || a >= b || key !== `${a}|${b}` || wins[0] === null || wins[1] === null || last === null || wins[0] + wins[1] === 0)
    return null;
  const game = time(v.game);
  return { names: [names[0], names[1]], wins: [wins[0], wins[1]], last, ...(game ? { game } : {}) };
}

/** The stored records, cleaned up: an empty store for anything missing, damaged or of another version. */
export function parseRivals(raw: string | null): Rivals {
  const r = emptyRivals();
  let v: unknown;
  try {
    v = JSON.parse(raw ?? 'null');
  } catch {
    return r;
  }
  if (!isObj(v) || v.v !== VERSION) return r;
  if (isObj(v.vs))
    for (const [k, x] of Object.entries(v.vs)) {
      const rival = parseRival(k, x);
      if (rival) r.vs[k] = rival;
    }
  if (isObj(v.pairs))
    for (const [k, x] of Object.entries(v.pairs)) {
      const pair = parsePair(k, x);
      if (pair) r.pairs[k] = pair;
    }
  if (Array.isArray(v.seen)) r.seen = v.seen.filter((t): t is number => time(t) !== null);
  return capped(r);
}

/** Whether this build reads what is stored (the right version, as an object). */
function readable(raw: string): boolean {
  try {
    const v: unknown = JSON.parse(raw);
    return isObj(v) && v.v === VERSION;
  } catch {
    return false;
  }
}

export const serializeRivals = (r: Rivals) => JSON.stringify({ v: VERSION, ...capped(r) });

/** The stored records (empty when there are none or they can't be read). Read fresh: another tab may have added to them. */
export function loadRivals(): Rivals {
  return parseRivals(readStored(NAME));
}

/**
 * Changes the stored records, read fresh (another tab may have counted the
 * game already): `change` returns them changed, or null for no change.
 * Returns the records as they are now stored, or null when storage can't be
 * read or written, or holds a newer build's (never written over). Anything
 * else unreadable is kept aside before new records start (keepAside.ts).
 */
export function saveRivals(change: (r: Rivals) => Rivals | null): Rivals | null {
  const raw = tryReadStored(NAME);
  if (raw === undefined) return null;
  const known = raw === null || readable(raw);
  if (!known && !makeRoom(NAME, raw, VERSION)) return null;
  const was = known ? parseRivals(raw) : emptyRivals();
  const next = change(was);
  if (!next) return was;
  const out = capped(next);
  return writeStored(NAME, serializeRivals(out)) ? out : null;
}

/** Erased with the codex (the Codex's Erase): the records and what was kept aside; a newer build's are never touched. */
export function resetRivals() {
  const raw = tryReadStored(NAME);
  if (raw && !newerThan(raw, VERSION)) removeStored(NAME);
  clearAside(NAME);
}

/**
 * Counts an online game just over into the records of the player this
 * browser seats (`me`): against each other seated player still connected,
 * won when only `me` won, lost when only they did. Null when it doesn't count
 * (not over, Delve, one device, `me` watching or alone) or was counted before.
 */
export function recordGame(store: Rivals, s: GameState, me: string | null, now: number): Rivals | null {
  if (s.hostId === null || s.phase !== 'over' || !versusGame(s, me, false) || store.seen.includes(s.startedAt)) return null;
  const mine = s.winners.includes(me!);
  const vs = { ...store.vs };
  for (const p of s.players) {
    if (p.id === me || !p.connected) continue;
    const theirs = s.winners.includes(p.id);
    if (mine === theirs) continue;
    const key = nameSkeleton(p.name);
    const was = vs[key];
    vs[key] = { name: p.name, won: (was?.won ?? 0) + +mine, lost: (was?.lost ?? 0) + +theirs, last: now, game: s.startedAt };
  }
  return { vs, pairs: store.pairs, seen: [...store.seen, s.startedAt] };
}

/**
 * Counts a hot-seat game just over (two or more seated) into the device's
 * pairs: its sole winner beats every other seat. A shared win is counted as
 * played, for nobody. Null when it doesn't count or was counted before.
 */
export function recordCouch(store: Rivals, s: GameState, now: number): Rivals | null {
  if (s.hostId !== null || s.phase !== 'over' || s.delve || !s.startedAt || s.players.length < 2 || store.seen.includes(s.startedAt)) return null;
  const seen = [...store.seen, s.startedAt];
  const w = s.winners.length === 1 ? s.players.find((p) => p.id === s.winners[0]) : undefined;
  if (!w) return { ...store, seen };
  const pairs = { ...store.pairs };
  const wk = nameSkeleton(w.name);
  for (const p of s.players) {
    const pk = nameSkeleton(p.name);
    if (p.id === w.id || pk === wk) continue;
    const key = pairKey(wk, pk);
    const first = wk < pk;
    const wins: [number, number] = pairs[key] ? [...pairs[key].wins] : [0, 0];
    wins[first ? 0 : 1]++;
    pairs[key] = { names: first ? [w.name, p.name] : [p.name, w.name], wins, last: now, game: s.startedAt };
  }
  return { vs: store.vs, pairs, seen };
}

export interface RivalTag {
  /** "You lead 3-2", "Leads you 3-2" (under their name) or "Level 2-2": `words` then `score`. */
  text: string;
  words: string;
  score: string;
  title: string;
  /** 1: you lead, -1: they do, 0: level. */
  lead: -1 | 0 | 1;
}

/** The lobby's note under a rival's name (online), or null before any game counted against them. */
export function rivalTag(store: Rivals, name: string): RivalTag | null {
  const r = store.vs[nameSkeleton(name)];
  if (!r) return null;
  const lead = r.won > r.lost ? 1 : r.won < r.lost ? -1 : 0;
  const words = lead > 0 ? 'You lead' : lead < 0 ? 'Leads you' : 'Level';
  const score = lead < 0 ? `${r.lost}-${r.won}` : `${r.won}-${r.lost}`;
  return { text: `${words} ${score}`, words, score, title: `Your games against ${name} on this device: ${r.won} won, ${r.lost} lost`, lead };
}

const games = (n: number) => `${n} ${n === 1 ? 'game' : 'games'}`;

/**
 * The end screen's lines (online) about the rivals the game just over
 * counted against (`s.startedAt`), most games first, two at most: who leads
 * now, or a first meeting.
 */
export function rivalLines(store: Rivals, s: GameState, me: string | null): string[] {
  if (!s.startedAt) return [];
  return s.players
    .filter((p) => p.id !== me)
    .map((p) => ({ name: p.name, r: store.vs[nameSkeleton(p.name)] }))
    .filter((x): x is { name: string; r: Rival } => x.r?.game === s.startedAt)
    .sort((a, b) => b.r.won + b.r.lost - (a.r.won + a.r.lost))
    .slice(0, 2)
    .map(({ name, r }) => {
      if (r.won + r.lost === 1) return `Your first game against ${name} on this device.`;
      if (r.won > r.lost) return `You now lead ${name} ${r.won} to ${r.lost} across your games.`;
      if (r.won < r.lost) return `${name} leads you ${r.lost} to ${r.won} across your games. Revenge?`;
      return `You and ${name} are level at ${games(r.won)} each.`;
    });
}

/**
 * Hot-seat: how the pairs among these names stand on this device, most games
 * first (equals: by seat), two at most. With `game`, only the pairs that game
 * counted (the end screen); without, every pair of the party (the lobby).
 */
export function pairLines(store: Rivals, names: string[], game?: number): string[] {
  const seat = new Map<string, number>();
  names.forEach((n, i) => {
    const k = nameSkeleton(n);
    if (!seat.has(k)) seat.set(k, i);
  });
  const found: { a: number; b: number; wins: [number, number] }[] = [];
  for (const [key, p] of Object.entries(store.pairs)) {
    const [a, b] = key.split('|').map((k) => seat.get(k));
    if (a === undefined || b === undefined || (game !== undefined && p.game !== game)) continue;
    found.push({ a, b, wins: p.wins });
  }
  const total = (x: (typeof found)[number]) => x.wins[0] + x.wins[1];
  return found
    .sort((x, y) => total(y) - total(x) || Math.min(x.a, x.b) - Math.min(y.a, y.b) || Math.max(x.a, x.b) - Math.max(y.a, y.b))
    .slice(0, 2)
    .map(({ a, b, wins: [x, y] }) => {
      if (x === y) {
        const [first, second] = a < b ? [a, b] : [b, a];
        return `${names[first]} and ${names[second]} are level ${x}-${y} on this device.`;
      }
      return x > y ? `${names[a]} leads ${names[b]} ${x}-${y} on this device.` : `${names[b]} leads ${names[a]} ${y}-${x} on this device.`;
    });
}
