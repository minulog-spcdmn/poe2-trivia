// The end of a game told back (GameOver.svelte): the line under the result,
// what the game meant for this player, the highlights everyone shares, and
// in Delve where this player's lives went, the run's facts and the chart of
// this device's runs. Pure: the screen hands in the state, this device's
// player, its codex log and records, and renders the parts.
//
// Sentences come as parts, so numbers can be set in Cinzel and names and
// items in their own type: plain text, a number, a player (marked "(you)"
// for the viewer), an item or a category.

import { DELVE_LIVES, DELVE_RULESET, FLARE_MS, delveStandings, isGroupRun, shownDepth, teamDepth, type FindKind } from './delve.ts';
import type { GameState, RecapItem } from './game.ts';
import { stratumName } from './descent.ts';
import { counts, isTogether, type DelveRun } from './delveRecord.ts';
import type { Answer } from './codex.ts';
import { cap, words } from './difficultyText.ts';

export type Part = string | { n: string | number } | { who: string } | { item: string } | { cat: string };
/**
 * The mark before a line, always one that means something there: a player,
 * an item, a find's item, the heart of a life given, a zone's emblem (at a
 * depth, as the game counts it) or a category's. (Never the gold diamond:
 * in the game it says "you are here".)
 */
export type Icon = { avatar: string } | { item: string } | { glyph: 'ward' | 'flare' | 'dynamite' } | { heart: true } | { zone: number } | { cat: string };
export interface Line {
  icon: Icon;
  parts: Part[];
}

// ---- words ---------------------------------------------------------------

/** A small number as a word, where a line reads as speech ("four short"); larger ones stay digits (the reveal's own, difficultyText). */
const word = words;
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
/** "first" to "twelfth" in words, past that in figures with their suffix: 13th, 21st, 22nd, 23rd, 111th. */
export const ordinal = (n: number) => ORDINALS[n] ?? `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** Seconds from ms, to a tenth. */
export const secs = (ms: number) => (Math.round(ms / 100) / 10).toFixed(1);

/** Joins parts that are words, so "a" + "b" read as one string where they can. */
function join(...parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const p of parts) {
    if (p === '') continue;
    const last = out.at(-1);
    if (typeof p === 'string' && typeof last === 'string') out[out.length - 1] = last + p;
    else out.push(p);
  }
  return out;
}

/** The text of parts, for a label or a test: numbers as they are, players and items by `nameOf`. */
export function plain(parts: Part[], nameOf: (id: string) => string = (id) => id): string {
  return parts
    .map((p) => (typeof p === 'string' ? p : 'n' in p ? String(p.n) : 'who' in p ? nameOf(p.who) : 'item' in p ? nameOf(p.item) : p.cat))
    .join('');
}

// ---- zones -----------------------------------------------------------------

/** A depth's zone (its index from 0, its name), and its name as a sentence takes it ("the Frozen Hollow", "The Mines" as it is). */
export function zoneOf(depth: number) {
  const index = Math.max(0, Math.floor((depth - 1) / 10));
  const name = stratumName(index);
  // Mid-sentence a name's own "The" is lower case: "in the Mines".
  return { index, name, the: /^the /i.test(name) ? `the ${name.slice(4)}` : `the ${name}` };
}

// ---- the line under the result ----------------------------------------------

/** A normal game: "10 points after 10 rounds", or how a deathmatch settled it. */
export function scoreLine(s: GameState, winner: { id: string; score: number } | undefined): Part[] {
  if (!winner) return [];
  if (s.deathmatch && s.deathmatch.entrants.includes(winner.id)) return ['Tied on ', { n: winner.score }, ', won the deathmatch in round ', { n: s.deathmatch.round }];
  const race = s.settings.mode === 'race';
  const unit = race ? (s.round === 1 ? 'question' : 'questions') : s.round === 1 ? 'round' : 'rounds';
  return [{ n: winner.score }, ` ${winner.score === 1 ? 'point' : 'points'} after `, { n: s.round }, ` ${unit}`];
}

/** How this device's run measured up (session.delveResult), as the line under the depth has it. */
export interface Measured {
  previousBest: number | null;
  best: boolean;
}

/**
 * Delve: the line under the depth. Alone (or together), against this
 * device's records of its kind; `measured` null for someone watching, or a
 * run this device hasn't recorded: where the party got to, or where the
 * delver perished.
 */
export function delveLine(depth: number, together: boolean, measured: Measured | null, mixed = false): Part[] {
  const z = zoneOf(depth);
  const shown = shownDepth(depth);
  const kind = together ? ' together' : '';
  let parts: Part[];
  if (!measured) parts = [together ? `The party reached ${z.the}.` : `Perished in ${z.the}.`];
  else if (measured.previousBest === null) {
    const nth = z.index < ORDINALS.length - 1 ? `, the ${ordinal(z.index + 1)} zone` : '';
    parts = [`Your first descent${kind} reached ${z.the}${nth}.`];
  } else {
    const best = shownDepth(measured.previousBest);
    const diff = Math.abs(shown - best);
    const into = together || measured.best ? `Into ${z.the}` : `Perished in ${z.the}`;
    const how = measured.best ? `${word(diff)} past your best${kind}` : diff === 0 ? `level with your best${kind}` : `${word(diff)} short of your best${kind}`;
    parts = [`${into}, ${how}, `, { n: best }, '.'];
  }
  return mixed ? join(...parts, ' Finished under newer rules.') : parts;
}

// ---- your game (a normal game) ---------------------------------------------------

/**
 * Players ranked as the end screen lists them: by score; among equals a
 * deathmatch's winner first, then whoever lasted longer in it (`out`: the
 * round each was knocked out in). Ties share a rank.
 */
export function ranked<P extends { id: string; score: number }>(players: P[], winners: string[], out: Record<string, number> = {}): { p: P; rank: number }[] {
  const won = (id: string) => winners.includes(id);
  const lasted = (id: string) => out[id] ?? Infinity;
  const sorted = [...players].sort((a, b) => b.score - a.score || +won(b.id) - +won(a.id) || lasted(b.id) - lasted(a.id));
  const ranks: { p: P; rank: number }[] = [];
  sorted.forEach((p, i) => {
    const prev = ranks[i - 1];
    // A winner never shares its rank with a player who didn't win, nor a duelist with one who lasted longer.
    const tied = prev && p.score === prev.p.score && won(p.id) === won(prev.p.id) && lasted(p.id) === lasted(prev.p.id);
    ranks.push({ p, rank: tied ? prev.rank : i + 1 });
  });
  return ranks;
}

/** A score as a number to set: a minus sign, not a hyphen, below zero. */
export const score = (n: number) => (n < 0 ? `−${-n}` : String(n));

export interface YourGame {
  /** Where you came, for a player who didn't win. */
  place: Part[] | null;
  /** Your answers in a line. */
  game: Part[] | null;
  /** The items you missed, and the words over them. */
  missed: string[];
  missedLead: string;
}

/** A normal game as one player had it (`me`), from the host's recap. */
export function yourGame(s: GameState, me: string): YourGame {
  const r = s.recap;
  const race = s.settings.mode === 'race';
  const rows = ranked(s.players, s.winners, s.deathmatch?.out);
  const mine = rows.find((x) => x.p.id === me);
  let place: Part[] | null = null;
  if (mine && !s.winners.includes(me)) {
    const joint = rows.some((x) => x !== mine && x.rank === mine.rank) ? 'joint ' : '';
    const dm = s.deathmatch?.entrants.includes(me);
    place = dm
      ? [`You came ${joint}${ordinal(mine.rank)}, tied on `, { n: score(mine.p.score) }, '.']
      : [`You came ${joint}${ordinal(mine.rank)} with `, { n: score(mine.p.score) }, ` ${mine.p.score === 1 ? 'point' : 'points'}.`];
  }
  const t = r?.answers[me];
  let game: Part[] | null = null;
  if (t && (t.n || t.dn)) {
    const fastest: Part[] = t.ms !== undefined ? [' Your fastest took ', { n: secs(t.ms) }, 's.'] : [];
    if (race) {
      const wrong = t.n - t.ok;
      game = join(
        'First right on ',
        { n: t.ok },
        ' of ',
        { n: s.round },
        ` ${s.round === 1 ? 'question' : 'questions'}`,
        ...(wrong ? ['; ', { n: wrong }, ` wrong ${wrong === 1 ? 'guess' : 'guesses'} took ${wrong === 1 ? 'a point' : 'points'} back.`] : [', without a wrong guess.']),
        ...fastest,
      );
    } else if (t.dn) {
      const dok = t.dok ?? 0;
      const before: Part[] = t.ok === t.n ? ['All ', { n: t.n }, ' right'] : [{ n: t.ok }, ' of ', { n: t.n }, ' right'];
      const after: Part[] = !dok
        ? ['; in the deathmatch you missed the first.']
        : [', then ', { n: dok }, ` more in the deathmatch${dok < t.dn ? `; you missed the ${ordinal(dok + 1)}.` : '.'}`];
      game = join(...before, ...after, ...fastest);
    } else {
      game = t.ok === t.n ? join({ n: t.n }, ' of ', { n: t.n }, ' right, not one missed.', ...fastest) : join({ n: t.ok }, ' of ', { n: t.n }, ' right.', ...fastest);
    }
  }
  const misses = (r?.misses ?? []).filter((m) => m.by === me);
  const missed = [...new Set(misses.map((m) => m.id))];
  const count = missed.length === 1 ? 'one' : word(missed.length);
  const verb = race ? 'guessed wrong' : 'missed';
  const missedLead =
    missed.length === 1 && misses.every((m) => m.dm) ? 'The deathmatch question you missed, kept in your codex:' : `The ${count} you ${verb}, kept in your codex:`;
  return { place, game, missed, missedLead };
}

/** Hot-seat: every miss of the game, with whose it was (the first, for an item missed twice). */
export function missedAnswers(s: GameState): { id: string; by: string }[] {
  const seen = new Set<string>();
  return (s.recap?.misses ?? []).filter((m) => !seen.has(m.id) && (seen.add(m.id), true)).map((m) => ({ id: m.id, by: m.by }));
}

// ---- highlights --------------------------------------------------------------

/** The shared moments of a normal game: the fastest answer, then the mode's own. */
export function highlights(s: GameState): Line[] {
  const r = s.recap;
  if (!r) return [];
  const out: Line[] = [];
  if (r.fastest) out.push({ icon: { avatar: r.fastest.by }, parts: [{ who: r.fastest.by }, ' answered fastest: ', { n: secs(r.fastest.ms) }, 's on ', { item: r.fastest.id }, '.'] });
  if (s.settings.mode === 'race') {
    const worst = Object.entries(r.wrong ?? {}).sort((a, b) => b[1] - a[1])[0];
    if (worst && worst[1] >= 2) out.push({ icon: { item: worst[0] }, parts: [{ item: worst[0] }, ' was missed most: ', { n: worst[1] }, ' exiles guessed it wrong.'] });
    if (r.firsts && r.firsts.n >= 2) out.push({ icon: { avatar: r.firsts.by }, parts: [{ who: r.firsts.by }, ' was first ', { n: r.firsts.n }, ' times in a row.'] });
  } else {
    const cats = Object.entries(r.cats ?? {});
    // The hardest: the lowest share answered right among those asked twice or more (more asked first among equals).
    const hard = cats.filter(([, [n]]) => n >= 2).sort((a, b) => a[1][1] / a[1][0] - b[1][1] / b[1][0] || b[1][0] - a[1][0])[0];
    if (hard) out.push({ icon: { cat: hard[0] }, parts: ['The hardest category was ', { cat: hard[0] }, ': ', { n: hard[1][1] }, ' of ', { n: hard[1][0] }, ' answered right.'] });
    // Picked most: never the hardest again (with few categories played they can be the same).
    const most = cats.filter(([c]) => c !== hard?.[0]).sort((a, b) => b[1][0] - a[1][0])[0];
    if (most && most[1][0] >= 2) out.push({ icon: { cat: most[0] }, parts: ['The category picked most was ', { cat: most[0] }, ', ', { n: most[1][0] }, ' times.'] });
  }
  return out;
}

/** Delve together: the party's moments, the same on every device. */
export function partyHighlights(s: GameState): Line[] {
  const r = s.recap;
  const out: Line[] = [];
  if (r?.fastest) out.push({ icon: { avatar: r.fastest.by }, parts: [{ who: r.fastest.by }, ' answered fastest: ', { n: secs(r.fastest.ms) }, 's on ', { item: r.fastest.id }, '.'] });
  // Every life given; past three, the first two and how many more.
  const revives = s.delve?.revives ?? [];
  const told = revives.length > 3 ? revives.slice(0, 2) : revives;
  for (const v of told) out.push({ icon: { heart: true }, parts: [{ who: v.by }, ' gave a life to bring ', { who: v.to }, ' back at depth ', { n: shownDepth(v.depth) }, '.'] });
  if (told.length < revives.length) {
    const more = revives.length - told.length;
    out.push({ icon: { heart: true }, parts: [cap(word(more)), ` more ${more === 1 ? 'life was' : 'lives were'} given to bring a teammate back.`] });
  }
  const streak = s.delve?.bestTeamStreak ?? 0;
  if (streak >= 2) out.push({ icon: { zone: teamDepth(s) }, parts: ['The longest team streak: ', { n: streak }, ' depths cleared with nobody missing.'] });
  return out;
}

/**
 * Delve alone: this device's own moments (none the lives already tell):
 * the fastest answer and the closest call. The very first run tells only
 * the first.
 */
export function soloHighlights(s: GameState, me: string, first: boolean): Line[] {
  const r = s.recap;
  const out: Line[] = [];
  if (r?.fastest?.by === me) out.push({ icon: { item: r.fastest.id }, parts: ['Your fastest answer: ', { n: secs(r.fastest.ms) }, 's on ', { item: r.fastest.id }, '.'] });
  if (!first && r?.closest?.by === me)
    out.push({
      icon: { item: r.closest.id },
      parts: ['Your closest call: ', { item: r.closest.id }, ' at depth ', { n: shownDepth(r.closest.depth) }, ', right with ', { n: secs(r.closest.left) }, 's left.'],
    });
  return out;
}

/**
 * Delve alone: the uniques met for the first time this run, for the section
 * "New in your codex" (`met`: how many were asked this run, `fresh`: those
 * of them new to the codex, in the order met; both without those the lives
 * list shows): how many, beside its heading, or null for none.
 */
export function newInCodex(met: { met: number; fresh: string[] }): Part[] | null {
  const n = met.fresh.length;
  if (!n) return null;
  if (n > 1 && n === met.met) return ['All ', { n }, ' met for the first time'];
  return n === 1 ? ['One met for the first time'] : [{ n }, ' met for the first time'];
}

// ---- Delve: where your lives went -----------------------------------------

export interface LifeRow {
  /** A wrong answer that cost a life (or two), a vein's cave-in, a life given to a teammate, or a loss the codex didn't keep. */
  kind: 'item' | 'cave' | 'given' | 'plain';
  /** The item that took it. */
  id?: string;
  /** A life given: to whom. */
  to?: string;
  /** Brought back after it, by whom. */
  back?: string;
  /** The depth (as the game counts it, before shownDepth). */
  depth: number;
  lives: number;
  /** Wards that broke on it, each in place of a life. */
  wards: number;
  /** Lives in the phial after it. */
  after: number;
}

/**
 * This player's lives in a run, oldest first, from this device's codex log
 * (`log`: its answers) and the run's revives; a loss the log doesn't have
 * (written by another tab, or lost) is told at its depth alone. Each row
 * says how full the phial stood after it: a life lost drains it, one given
 * back fills it again.
 */
export function livesLost(s: GameState, me: string | null, log: readonly Answer[]): LifeRow[] {
  const d = s.delve;
  if (!d) return [];
  const self = me ?? s.players[0]?.id ?? '';
  type Ev = LifeRow & { t: number };
  const evs: Ev[] = [];
  for (const a of log) {
    if (a.run !== d.startedAt || a.depth === undefined || a.ok) continue;
    if (me && a.who !== undefined && a.who !== me) continue;
    const lives = a.lives ?? (a.warded ? 0 : 1);
    const wards = a.wards ?? (a.warded ? 1 : 0);
    if (!lives) continue;
    evs.push({ t: a.t, kind: a.find === 'azurite' ? 'cave' : 'item', id: a.id, depth: a.depth, lives, wards, after: 0 });
  }
  // Losses the log is missing: the run's own list of depths, less those it has.
  const left = [...(d.losses[self] ?? [])];
  for (const e of evs)
    for (let k = 0; k < e.lives; k++) {
      const i = left.indexOf(e.depth);
      if (i >= 0) left.splice(i, 1);
    }
  for (const depth of left) evs.push({ t: Number.MAX_SAFE_INTEGER - 1, kind: 'plain', depth, lives: 1, wards: 0, after: 0 });
  for (const v of d.revives ?? []) {
    if (v.by === self) evs.push({ t: v.at, kind: 'given', to: v.to, depth: v.depth, lives: 1, wards: 0, after: 0 });
    if (v.to === self) {
      // The loss it undid: the last before it.
      const fell = evs.filter((e) => e.kind !== 'given' && e.t <= v.at && !e.back).sort((a, b) => b.t - a.t)[0];
      if (fell) fell.back = v.by;
    }
  }
  evs.sort((a, b) => a.t - b.t || a.depth - b.depth);
  let lives = DELVE_LIVES;
  return evs.map(({ t: _t, ...e }) => {
    lives = Math.max(0, lives - e.lives + (e.back ? 1 : 0));
    return { ...e, after: lives };
  });
}

// ---- Delve: the run's facts -------------------------------------------------

/**
 * What the run's finds gave and what came of it, oldest first: alone (and
 * `me`) this player's, together the party's. First the zone it reached (by
 * name: the descent never ends, so there is no "of ten").
 */
export function runFacts(s: GameState, me: string | null): Line[] {
  const together = isGroupRun(s);
  const depth = teamDepth(s);
  const out: Line[] = [{ icon: { zone: depth }, parts: [`Reached ${zoneOf(depth).the}.`] }];
  const items = (s.recap?.items ?? []).filter((x) => together || !me || x.by === me);
  const you = together ? '' : ' you';
  const at = (n: number): Part[] => [' at depth ', { n: shownDepth(n) }];
  for (let i = 0; i < items.length && out.length < 4; i++) {
    const x = items[i];
    if (x.kind === 'wards') {
      // A vein's wards come in together: one line for them.
      let n = 1;
      while (items[i + 1]?.kind === 'wards' && items[i + 1].at === x.at) (n++, i++);
      out.push({ icon: { glyph: 'ward' }, parts: join('An azurite vein', ...at(x.at), ` gave ${together ? 'the party' : 'you'} ${n === 1 ? 'a ward' : `${word(n)} wards`}.`) });
    } else out.push({ icon: { glyph: x.kind === 'flares' ? 'flare' : 'dynamite' }, parts: itemFact(x, you, at) });
  }
  return out;
}

function itemFact(x: RecapItem, you: string, at: (n: number) => Part[]): Part[] {
  const won: Part[] = x.kind === 'dynamite' ? join(`Dynamite${you} won`, ...at(x.at)) : join(`A flare${you} won`, ...at(x.at));
  if (x.used === undefined) return join(...won, x.kind === 'dynamite' ? ' was never lit.' : ' was never needed.');
  if (x.how === 'blown') return join(...won, ' was lost to a blast', ...at(x.used), '.');
  return join(...won, x.how === 'blast' ? ' blasted a question away' : ' burnt', ...at(x.used), '.');
}

/** Each find in a line, for the first run's list of what can turn up (its risk is FIND_RULES' miss). */
export const FIND_BRIEF: Record<FindKind, string> = {
  dynamite: 'Dynamite lets you skip a question for a new one at the same depth.',
  azurite: 'Each right answer digs out a ward, which takes a lost life for you; then dig deeper or take the way out.',
  flare: `A flare adds ${word(FLARE_MS / 1000)} seconds when your time runs out.`,
};

// ---- Delve: the runs chart ---------------------------------------------------

/** The most runs the chart shows: at its narrowest columns (10) and gaps (5), 180 px hold twelve. */
export const CHART_RUNS = 12;
export const CHART_W = 180;

/**
 * This device's counted runs of the run's kind, oldest first, ending with
 * this run (`id` its start; `who` its player online), at most CHART_RUNS.
 * Empty when this run isn't among them.
 */
export function chartRuns(runs: readonly DelveRun[], id: number, together: boolean, who: string | null): DelveRun[] {
  const kind = runs.filter((r) => counts(r) && r.ruleset === DELVE_RULESET && isTogether(r) === together && (!who || !r.who || r.who === who));
  const i = kind.findIndex((r) => r.id === id);
  return i < 0 ? [] : kind.slice(Math.max(0, i + 1 - CHART_RUNS), i + 1);
}

/** Column width and gap for `n` runs across CHART_W. */
export function chartLayout(n: number, width = CHART_W): { col: number; gap: number } {
  const fit = (col: number, most: number) => ({ col, gap: n > 1 ? Math.min(most, (width - n * col) / (n - 1)) : 0 });
  if (n <= 5) return fit(34, 22);
  const mid = fit(22, 12);
  if (mid.gap >= 6) return mid;
  const gap = n > 9 ? 5 : 6;
  return { col: Math.max(10, Math.floor((width - gap * (n - 1)) / n)), gap };
}

/** The median of some depths. */
export function median(xs: number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

// ---- the party -------------------------------------------------------------

/** Delve together: the delvers in the result's order, each with the depth they last reached and whether they were brought back. */
export function party(s: GameState) {
  return delveStandings(s).map((r) => ({ id: r.id, depth: r.depth, revived: r.revived > 0 }));
}
