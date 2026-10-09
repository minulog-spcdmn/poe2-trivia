// A night of games in one room: what carries from one game to the next. Online,
// guests vote for another at the end of a game, and once every guest still
// connected is ready the next one starts by itself (the host's timer, see
// session.svelte.ts scheduleRematch). Every turns or race game won counts
// toward the night (the ledger), and its winner wears the Crown into the next
// game: a mark only, no rule changes. Only types come from game.ts, so the
// engine can import this module without a cycle.

import type { GameState } from './game.ts';

/** How long the room counts down once every connected guest is ready for another game. */
export const REMATCH_MS = 10_000;

/**
 * Settles the rematch vote after any change (a vote, someone leaving,
 * dropping out or coming back): the countdown runs while every guest still
 * connected is ready, from the moment the last of them got there. A vote
 * stays while its guest is away (a refresh, the host's reload), but only
 * those connected are counted. Online turns and race games only.
 */
export function settleRematch(s: GameState, now: number) {
  const r = s.rematch;
  if (!r || s.phase !== 'over' || s.hostId === null || s.delve) return;
  const seated = new Set(s.players.filter((p) => p.id !== s.hostId).map((p) => p.id));
  const ready = r.ready.filter((id) => seated.has(id));
  const { guests, ready: here } = rematchCount({ ...s, rematch: { ready } });
  s.rematch = guests.length && here.length === guests.length ? { ready, at: r.at ?? now + REMATCH_MS } : { ready };
}

/** The guests the vote waits for (connected, seated, not the host) and those of them who are ready, by id. */
export function rematchCount(s: GameState): { guests: string[]; ready: string[] } {
  const guests = s.players.filter((p) => p.connected && p.id !== s.hostId).map((p) => p.id);
  const votes = new Set(s.rematch?.ready ?? []);
  return { guests, ready: guests.filter((id) => votes.has(id)) };
}

// ---- the ledger and the Crown -------------------------------------------

/**
 * Counts the game just over into the night (the engine calls it as a turns
 * or race game ends, online and on one device). A game played alone counts
 * for nothing. Every winner's tally goes up; a sole winner wears the Crown
 * (one more game in a row if it was already theirs, and `fell` names whoever
 * they took it from, if still seated), and a shared win leaves it where it was.
 */
export function recordSeries(s: GameState) {
  if (s.delve || s.settings.mode === 'delve' || s.players.length < 2) return;
  const was = s.series ?? { played: 0, wins: {}, champ: null };
  const wins = { ...was.wins };
  for (const id of s.winners) wins[id] = (wins[id] ?? 0) + 1;
  let champ = was.champ;
  let fell: string | undefined;
  if (s.winners.length === 1) {
    const id = s.winners[0];
    if (champ?.id === id) champ = { id, run: champ.run + 1 };
    else {
      if (champ && s.players.some((p) => p.id === champ!.id)) fell = champ.id;
      champ = { id, run: 1 };
    }
  }
  s.series = { played: was.played + 1, wins, champ, ...(fell ? { fell } : {}) };
}

/** Games this player has won tonight. */
export const nightWins = (s: GameState, id: string) => s.series?.wins[id] ?? 0;

/** Whether the room keeps a night at all: turns and race (not Delve), two or more seated. */
const counted = (s: GameState) => !s.delve && s.settings.mode !== 'delve' && s.players.length >= 2;

/** Who wears the Crown in this room now: the night's champion, while seated with someone to play (never in Delve). */
export function crownedId(s: GameState): string | null {
  const id = s.series?.champ?.id;
  return id && counted(s) && s.players.some((p) => p.id === id) ? id : null;
}

/**
 * At the end of a game: what became of the Crown, when its sole winner
 * wears it now (null after a shared win, or a game the night didn't count).
 * `from`: who wore it into the game (themselves when they held it; null
 * when it was nobody's or they have left).
 */
export function crownChange(s: GameState): { to: string; from: string | null; held: boolean } | null {
  const c = s.series?.champ;
  if (s.phase !== 'over' || !c || s.winners.length !== 1 || s.winners[0] !== c.id || crownedId(s) !== c.id) return null;
  if (c.run >= 2) return { to: c.id, from: c.id, held: true };
  const from = s.series!.fell;
  return { to: c.id, from: from && s.players.some((p) => p.id === from) ? from : null, held: false };
}

/** "Ash", "Ash and Bea", "Ash, Bea and Cid". */
function list(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The night's score, for the end screen: after the first game who won it,
 * then who leads (two seated: both counts; more: the leader's). Only
 * players still seated are named.
 */
export function ledgerLine(s: GameState, nameOf: (id: string) => string): string {
  const n = s.series;
  if (!n?.played || !counted(s)) return '';
  const here = s.players.map((p) => p.id);
  const won = (id: string) => n.wins[id] ?? 0;
  const top = Math.max(...here.map(won));
  if (top <= 0) return '';
  const leaders = here.filter((id) => won(id) === top);
  if (n.played === 1)
    return leaders.length === 1 ? `Game 1 goes to ${nameOf(leaders[0])}.` : `Game 1 is shared by ${list(leaders.map(nameOf))}.`;
  if (here.length === 2) {
    if (leaders.length === 2) return `All square at ${plural(top, 'game', 'games')} each.`;
    const other = here.find((id) => id !== leaders[0])!;
    return `${nameOf(leaders[0])} leads the night ${top} to ${won(other)}.`;
  }
  if (leaders.length === 1) return `${nameOf(leaders[0])} leads the night with ${plural(top, 'win', 'wins')}.`;
  return `${list(leaders.map(nameOf))} share the lead with ${plural(top, 'win', 'wins')} each.`;
}

/**
 * The Crown's story at the end of a game, from the second game on: taken
 * from someone (or claimed while it was nobody's), or held for three games
 * or more in a row.
 */
export function crownLine(s: GameState, nameOf: (id: string) => string): string {
  const change = crownChange(s);
  const n = s.series;
  if (!change || !n || n.played < 2) return '';
  const who = nameOf(change.to);
  if (change.held) return n.champ!.run >= 3 ? `${who} has held the Crown for ${n.champ!.run} games.` : '';
  return change.from ? `${who} takes the Crown from ${nameOf(change.from)}.` : `${who} takes the Crown.`;
}
