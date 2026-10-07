// The lab's controls: a Delve run on this device, set up and played through
// the real engine and session, so the screen, sounds and effects that follow
// are the game's own. One player is a run alone (hot-seat); two to four make
// a co-op run, played as its host would without a room (session.labCoop),
// seen by one of them (`viewer`, the screen's player) while the lab acts for
// any of them (`actor`): their votes, answers, revives and perishing.
//
// Two kinds of change:
// - setup (players, lives, carried items, depth): applied quietly. The run
//   takes a new id (delve.startedAt), so the scoreboard and the reveal see a
//   fresh run and play nothing for the change itself.
// - events: real actions (a vote, a pick, an answer, a revive, next, the
//   clock, flare, a blast) on the run as it stands, or the change the engine
//   itself would make (an item gained, the next depth), so every moment
//   plays as in a game.

import { engine, session } from '../lib/session.svelte';
import { createGame, DEFAULT_SETTINGS, type Action, type GameState, type Grayscale, type Question } from '../lib/game';
import {
  DELVE_LIVES,
  DELVE_MAX_DYNAMITE,
  DELVE_MAX_FLARES,
  DELVE_MAX_WARDS,
  SHARDS_PER_WARD,
  clockLeft,
  REVIVE_FROM,
  delveQuestionTimer,
  capShards,
  findOffers,
  hasRoom,
  inventoryOf,
  isGroupRun,
  livesOf,
  standingIds,
  tileVeilSize,
  veilSeconds,
  veinWindowMs,
  type FindKind,
  type Inventory,
  type ItemKind,
} from '../lib/delve';
import { milestoneAt } from '../lib/descent';
import * as descentModule from '../lib/descent';
import { resetRecords } from '../lib/delveRecord';

export const MAX_PLAYERS = 4;
export const IDS = ['lab-1', 'lab-2', 'lab-3', 'lab-4'];
export const NAMES = ['Ezomyte', 'Karui', 'Maraketh', 'Vaal'];
export const MAX_DEPTH = 150;

export const CAPS: Record<ItemKind, number> = {
  wards: DELVE_MAX_WARDS,
  shards: SHARDS_PER_WARD - 1,
  flares: DELVE_MAX_FLARES,
  dynamite: DELVE_MAX_DYNAMITE,
};

export type FindChoice = 'none' | FindKind;
export type Force = 'rules' | 'on' | 'off';

/** How the questions the lab asks are made (the player's own picks follow the rules, except for grayscale). */
export const opts = $state({
  mode: 'any' as 'any' | 'name' | 'art',
  questionFind: 'none' as FindChoice,
  mirrored: 'rules' as Force,
  veil: 'rules' as Force,
  /** Applies to every question while set, the player's own picks too (session.labGrayscale). */
  grayscale: 'rules' as 'rules' | Grayscale,
  /** The find among the cards the lab deals (on the middle card), and a second one (on the first card). */
  cardFind: 'none' as FindChoice,
  cardFind2: 'none' as FindChoice,
});

type Paused = { askedAt: number; left: number; span: number; held: Question['held'] };

export const lab = $state({
  /** What the lab is doing right now (an event waiting on the art, say). */
  busy: '',
  log: [] as { at: number; text: string }[],
  paused: null as Paused | null,
  /** Co-op: the player the lab acts for (votes, answers, revives, perishes). */
  actor: IDS[0],
});

export function note(text: string) {
  lab.log = [{ at: Date.now(), text }, ...lab.log].slice(0, 8);
}

// ---- reading -------------------------------------------------------------

const state = () => session.state;
const run = () => (session.state?.delve ? session.state : null);

export function depthOf(): number {
  return run()?.round ?? 1;
}

/** The run in play is co-op (two players or more). */
export const coop = () => {
  const s = run();
  return !!s && isGroupRun(s);
};

/** Co-op: the player the screen is (the host, as far as the run goes). */
export const viewerId = () => session.myPlayerId ?? IDS[0];

/** Milliseconds left on the open question's clock, null when none runs. */
export function timeLeft(): number | null {
  const s = state();
  const q = s?.phase === 'question' ? s.question : null;
  if (!q || q.deadline === null) return null;
  if (lab.paused?.askedAt === q.askedAt) return lab.paused.left;
  return clockLeft(q, session.hostNow());
}

// ---- writing -------------------------------------------------------------

/** Puts a changed copy of the run in place. `quiet`: a setup change, as a new run (see above). */
function put(change: (s: GameState) => void, quiet = false) {
  const prev = run();
  if (!prev) return;
  const s = structuredClone(prev);
  change(s);
  if (quiet && s.delve) s.delve.startedAt = Math.max(Date.now(), prev.delve!.startedAt + 1);
  s.version = prev.version + 1;
  if (lab.paused && s.question?.askedAt !== lab.paused.askedAt) lab.paused = null;
  session.labSetState(s);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until `ok` holds (polled), or gives up after `ms`. */
async function until(ok: () => boolean, ms = 8000): Promise<boolean> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) return false;
    await sleep(40);
  }
  return true;
}

/** Runs an event, one at a time, saying what it does. */
async function event(name: string, f: () => Promise<void> | void) {
  if (lab.busy) return;
  lab.busy = name;
  try {
    await f();
  } catch (err) {
    note(`${name}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    lab.busy = '';
  }
}

// ---- the run -------------------------------------------------------------

/**
 * Sets a player's lives left at the run's depth: losses spread above it,
 * as many as it takes with the lives they gave or were given (co-op revives).
 */
function setLivesIn(s: GameState, id: string, lives: number) {
  const r = s.delve!.revives ?? [];
  const given = r.filter((x) => x.by === id).length;
  const received = r.filter((x) => x.to === id).length;
  const n = Math.max(0, DELVE_LIVES - Math.max(0, Math.min(DELVE_LIVES, lives)) - given + received);
  s.delve!.losses[id] = Array.from({ length: n }, (_, i) => Math.max(1, s.round - (n - 1 - i) * 3));
}

/** Deals three cards (alone to the player, together to the team), with the lab's find among them. */
function deal(s: GameState) {
  const group = isGroupRun(s);
  if (group) s.turn = Math.max(0, s.players.findIndex((p) => livesOf(s, p.id) > 0));
  const p = s.players[s.turn];
  s.phase = 'choosing';
  s.question = null;
  s.reveal = null;
  s.offered = p ? engine.offerCategories(s, p) : [];
  if (s.delve) {
    if (group) {
      s.delve.votes = {};
      s.delve.voteFrom = null;
    }
    delete s.delve.snapshot;
    // Two finds go on different cards and must differ in kind (findOffers drops a second of the same kind).
    const first = opts.cardFind !== 'none' && s.offered.length ? [{ category: s.offered[1] ?? s.offered[0], kind: opts.cardFind }] : [];
    const second =
      opts.cardFind2 !== 'none' && opts.cardFind2 !== opts.cardFind && s.offered.length > 1 ? [{ category: s.offered[0], kind: opts.cardFind2 }] : [];
    s.delve.finds = [...first, ...second];
    delete s.delve.find;
  }
}

/**
 * A fresh run of `n` players at `depth`, through the engine (join, start),
 * carrying over what `from` had for the same seats. Two or more are a co-op
 * run, whose host is the screen's player.
 */
function freshRun(n: number, depth: number, from: GameState | null): GameState {
  const viewer = n > 1 ? (from && IDS.indexOf(viewerId()) < n ? viewerId() : IDS[0]) : null;
  let s = createGame(viewer, { ...DEFAULT_SETTINGS, mode: 'delve' });
  for (let i = 0; i < n; i++) s = engine.apply(s, { type: 'join', playerId: IDS[i], name: NAMES[i] }, null);
  s = engine.apply(s, { type: 'start' }, null);
  // Seats in the lab's order, not the engine's shuffle.
  s.players.sort((a, b) => IDS.indexOf(a.id) - IDS.indexOf(b.id));
  s.round = depth;
  s.turn = 0;
  if (from?.delve) {
    for (const p of s.players) {
      if (!from.players.some((o) => o.id === p.id)) continue;
      setLivesIn(s, p.id, livesOf(from, p.id));
      s.delve!.inventory![p.id] = inventoryOf(from, p.id);
    }
  }
  if (IDS.indexOf(lab.actor) >= n) lab.actor = IDS[0];
  deal(s);
  return s;
}

/**
 * Puts a run in place: alone as hot-seat, together as the roomless host of
 * a co-op run. `fresh`: a new game on this device (anything shown before is
 * dropped); otherwise as a quiet change of the run in play, when it can be.
 */
function place(s: GameState, fresh: boolean) {
  const group = isGroupRun(s);
  const roomless = session.mode === 'host';
  if (fresh || !session.state || group !== roomless) {
    session.startLocal(s);
    if (group) session.labCoop(s.hostId!);
  } else session.labSetState(s);
  lab.paused = null;
}

let booted = false;

/**
 * Starts the lab's run (or keeps a Delve run already on this device, after a
 * reload). Once per page: main.ts calls it before the app mounts; a second
 * call does nothing, so it can't start a fresh run over the one in play.
 */
export function boot() {
  if (booted) return;
  booted = true;
  const s = run();
  if (s && session.mode === 'local' && s.phase !== 'lobby') {
    // A co-op run saved as hot-seat: played on as its roomless host.
    if (isGroupRun(s) && s.hostId) session.labCoop(s.hostId);
    return;
  }
  newRun(1, 1);
}

/** A new run on this device: `n` players at `depth`. */
export function newRun(n: number, depth: number) {
  place(freshRun(n, depth, null), true);
  note(`New run: ${n === 1 ? 'alone' : `${n} players together`} at depth ${depth}.`);
}

export function setPlayers(n: number) {
  const prev = run();
  const s = freshRun(Math.max(1, Math.min(MAX_PLAYERS, n)), depthOf(), prev);
  s.version = (prev?.version ?? 0) + 1;
  place(s, false);
}

export function setDepth(d: number) {
  const depth = Math.max(1, Math.min(MAX_DEPTH, Math.round(d)));
  if (depth === depthOf()) return;
  put((s) => {
    const lives = new Map(s.players.map((p) => [p.id, livesOf(s, p.id)]));
    s.round = depth;
    // Lives already lost stay lost, now from depths above this one.
    for (const p of s.players) setLivesIn(s, p.id, lives.get(p.id)!);
  }, true);
}

/** Co-op: the screen becomes `id`'s (the run's host, so the screen moves the run on as the host's does). */
export function setViewer(id: string) {
  if (!coop() || id === viewerId()) return;
  put((s) => (s.hostId = id));
  session.labCoop(id);
  note(`The screen is ${nameOf(id)}'s now.`);
}

/** Co-op: the player the lab acts for. */
export function setActor(id: string) {
  lab.actor = id;
}

const nameOf = (id: string) => run()?.players.find((p) => p.id === id)?.name ?? id;

export function setLives(id: string, lives: number) {
  put((s) => setLivesIn(s, id, lives), true);
}

function invSet(s: GameState, id: string, change: (inv: Inventory) => void) {
  const inv = inventoryOf(s, id);
  change(inv);
  (s.delve!.inventory ??= {})[id] = capShards(inv);
}

export function setItem(id: string, item: ItemKind, n: number) {
  put((s) => invSet(s, id, (inv) => (inv[item] = Math.max(0, Math.min(CAPS[item], n)))), true);
}

// ---- phases --------------------------------------------------------------

/** Deals new cards to the player on turn (with the find chosen for cards), replaying the deal. */
export function dealCards() {
  put((s) => {
    s.turnCount++;
    deal(s);
  });
}

/**
 * Asks a question as the lab's options say: a pick of a card if cards are
 * on offer (the find card, if it is the find asked for), else a new turn.
 */
export function ask(find: FindChoice = opts.questionFind) {
  const prev = run();
  if (!prev) return;
  const choosing = prev.phase === 'choosing';
  const kind = find === 'none' ? undefined : find;
  const finds = findOffers(prev);
  const card = (choosing && kind && finds.find((f) => f.kind === kind)?.category) || null;
  const category =
    card ??
    (choosing ? prev.offered.filter((c) => !finds.some((f) => f.category === c))[0] : null) ??
    engine.categories[Math.floor(Math.random() * engine.categories.length)];
  let made: { s: GameState; q: Question } | null = null;
  for (let i = 0; i < 40 && !made; i++) {
    const s = structuredClone(prev);
    if (!choosing) s.turnCount++;
    const q = engine.makeQuestion(s, category, kind ? { find: kind } : {});
    if (opts.mode === 'any' || q.mode === opts.mode || i === 39) made = { s, q };
  }
  const { s, q } = made!;
  if (opts.mirrored !== 'rules') q.mirrored = q.mirrored?.map(() => opts.mirrored === 'on') ?? [opts.mirrored === 'on'];
  if (opts.veil === 'off') q.veil = null;
  else if (opts.veil === 'on' && !q.veil) {
    const size = q.mode === 'art' ? tileVeilSize(5) : 5;
    // None on a clock too short for one to be fair (a Flare Cache's shortest, veilSeconds).
    const seconds = veilSeconds(delveQuestionTimer(s.round, q), 0.55, size, q.mode === 'art');
    if (seconds > 0) q.veil = { size, seconds, seed: Math.floor(Math.random() * 2 ** 31) };
    else note('This clock is too short for the art to burn in fairly: shown plain.');
  }
  const p = s.players[s.turn];
  if (isGroupRun(s)) s.recentCategories = [...s.recentCategories, category].slice(-7);
  else if (p) p.recent = [...p.recent, category].slice(-7);
  s.question = q;
  s.used.push(q.itemId);
  s.phase = 'question';
  s.reveal = null;
  s.offered = choosing ? s.offered : [];
  s.version = prev.version + 1;
  lab.paused = null;
  session.labSetState(s);
}

/** The question's clock is running (its art is in), asking one first if none is open. */
async function running(want?: (q: Question) => boolean, find?: FindChoice): Promise<Question> {
  // An ended run, or a player with no life left to play, starts over first.
  if (state()?.phase === 'over') backToRun();
  const r = run();
  const id = activeId();
  if (r && livesOf(r, id) === 0) {
    setLives(id, DELVE_LIVES);
    note(`${nameOf(id)} had no lives left: given three.`);
  }
  const s = state();
  if (s?.phase !== 'question' || !s.question || (want && !want(s.question))) ask(find);
  const ok = await until(() => state()?.phase === 'question' && state()!.question!.deadline !== null, 20000);
  if (!ok) throw new Error('the art did not load, so the clock never started');
  return state()!.question!;
}

const notFind = (q: Question) => !q.find;

function wrongIndex(q: Question): number {
  const off = new Set((q.struck ?? []).map((x) => x.index));
  const wrong = q.options.flatMap((id, i) => (id !== q.itemId && !off.has(i) ? [i] : []));
  return wrong[Math.floor(Math.random() * wrong.length)] ?? q.options.findIndex((id) => id !== q.itemId);
}

/** An action as `id` would send it (co-op), or the player's own on this device (alone). */
function act(action: Action, id = activeId()) {
  if (!coop()) {
    session.dispatch(action);
    return;
  }
  const problem = session.labAct(action, id);
  if (problem) throw new Error(`${nameOf(id)}: ${problem}`);
}

function answer(q: Question, right: boolean, id = activeId()) {
  if (coop() && q.struck?.some((x) => x.by === id)) throw new Error(`${nameOf(id)} already answered this question`);
  act({ type: 'answer', index: right ? q.options.indexOf(q.itemId) : wrongIndex(q), askedAt: q.askedAt }, id);
}

export const answerRight = () => event('Answer right', async () => answer(await running(), true));
export const answerWrong = () => event('Answer wrong', async () => answer(await running(), false));

export function next() {
  if (state()?.phase === 'reveal') act({ type: 'next' }, viewerId());
}

// ---- the clock -----------------------------------------------------------

/** Pause trick: the clock is held still (delve.ts clockLeft's `held`) far into the future, its timers with it. */
const FAR = 1e9;

/** Moves the running clock so that `elapsed` ms have gone since it started (its length kept). */
function setElapsed(elapsed: number) {
  const q = state()?.question;
  if (!q || q.deadline === null || q.clockAt === undefined) return;
  const p = lab.paused?.askedAt === q.askedAt ? lab.paused : null;
  const span = p ? p.span : q.deadline - q.clockAt;
  const e = Math.max(0, Math.min(span, elapsed));
  const now = Date.now();
  put((s) => {
    const sq = s.question!;
    if (p) {
      p.left = span - e;
      sq.clockAt = now - e + FAR;
      sq.deadline = sq.clockAt + span;
      sq.held = { from: now, until: now + FAR };
    } else {
      sq.clockAt = now - e;
      sq.deadline = sq.clockAt + span;
    }
  });
}

/** Sets the time left on the clock (ms). */
export function setTimeLeft(ms: number) {
  const q = state()?.question;
  if (!q || q.deadline === null || q.clockAt === undefined) return;
  const span = lab.paused?.askedAt === q.askedAt ? lab.paused.span : q.deadline - q.clockAt;
  setElapsed(span - ms);
}

export function pause() {
  const q = state()?.question;
  if (state()?.phase !== 'question' || !q || q.deadline === null || q.clockAt === undefined) return;
  if (lab.paused?.askedAt === q.askedAt) return;
  const left = clockLeft(q, Date.now());
  const span = q.deadline - q.clockAt;
  lab.paused = { askedAt: q.askedAt, left, span, held: q.held };
  setElapsed(span - left);
}

export function resume() {
  const q = state()?.question;
  const p = lab.paused;
  if (!q || !p || p.askedAt !== q.askedAt) {
    lab.paused = null;
    return;
  }
  lab.paused = null;
  const now = Date.now();
  put((s) => {
    const sq = s.question!;
    sq.clockAt = now - (p.span - p.left);
    sq.deadline = sq.clockAt + p.span;
    if (p.held) sq.held = p.held;
    else delete sq.held;
  });
}

// ---- events --------------------------------------------------------------

/** Whom the events act for: alone the player, together the lab's actor. */
const activeId = () => {
  const s = state();
  if (s && coop()) return s.players.some((p) => p.id === lab.actor) ? lab.actor : (s.players[0]?.id ?? IDS[0]);
  return s?.players[s.turn]?.id ?? IDS[0];
};

/** Gains one of an item as a find would give it, at once (a second shard forges a ward). */
export function gain(item: ItemKind) {
  const s = run();
  if (!s) return;
  const id = activeId();
  const inv = inventoryOf(s, id);
  const forge = item === 'shards' && inv.shards + 1 >= SHARDS_PER_WARD;
  if (!hasRoom(inv, item)) {
    note(`No room for more ${item === 'shards' ? 'wards' : item}.`);
    return;
  }
  put((n) =>
    invSet(n, id, (v) => {
      if (forge) {
        v.shards = 0;
        v.wards++;
      } else v[item]++;
    }),
  );
}

/** A find answered right: its reward and the line that says so. `slow`: a Vein answered after its fast window (a shard). */
export const findRight = (kind: FindKind, slow = false) =>
  event(`${kind} answered right`, async () => {
    const q = await running((q) => q.find === kind, kind);
    if (q.find !== kind) throw new Error('could not ask that find');
    if (slow) {
      // Just past its fast window (half the clock, rounded up to a second).
      setElapsed(veinWindowMs(state()!) + 200);
      await sleep(120);
    }
    answer(state()!.question!, true);
  });

/**
 * A Flare or Dynamite Cache answered wrong. The Flare Cache's question runs on
 * its shorter clock (less time); the Dynamite Cache's blast takes one
 * thing the player carries, a flare put in an empty pack first so it has
 * something to take.
 */
export const findWrong = (kind: 'flare' | 'dynamite') =>
  event(`${kind} answered wrong`, async () => {
    const id = activeId();
    const inv = inventoryOf(run()!, id);
    if (kind === 'dynamite' && !(inv.wards || inv.shards || inv.flares || inv.dynamite)) put((s) => invSet(s, id, (v) => (v.flares = 1)), true);
    const q = await running((q) => q.find === kind, kind);
    if (q.find !== kind) throw new Error('could not ask that find');
    answer(q, false);
  });

/** Time runs out with nothing in the pack: "The darkness took you". */
export const timeOut = () =>
  event('Time out', async () => {
    // Together anyone's flare or dynamite goes off for the team.
    const s = run()!;
    const ids = coop() ? standingIds(s) : [activeId()];
    if (ids.some((id) => inventoryOf(s, id).flares || inventoryOf(s, id).dynamite)) {
      put((n) => ids.forEach((id) => invSet(n, id, (v) => ((v.flares = 0), (v.dynamite = 0)))), true);
      note('Flares and dynamite emptied first, or they would go off.');
    }
    await running();
    setTimeLeft(1200);
  });

/** Someone who can use it holds one: alone the player, together anyone standing. */
function holds(id: string, item: 'flares' | 'dynamite') {
  const s = run()!;
  return (coop() ? standingIds(s) : [id]).some((o) => inventoryOf(s, o)[item] > 0);
}

/** A flare burns as the clock hits 0 (one is put in the pack if there is none; together, a random holder's burns). */
export const flare = () =>
  event('Flare at 0', async () => {
    const id = activeId();
    if (!holds(id, 'flares')) put((s) => invSet(s, id, (v) => (v.flares = 1)), true);
    const q = await running((q) => notFind(q) && !q.flared, 'none');
    if (q.find || q.flared) throw new Error('a flare only burns once, and never on a find');
    setTimeLeft(1600);
  });

/**
 * A blast draws from the depth's other cards: a question asked without cards
 * on offer (the lab's own, between depths) has none, so cards are dealt first.
 */
function withCards() {
  const s = state();
  if (!(s?.phase === 'choosing' || (s?.phase === 'question' && s.offered.length && !s.question?.find))) dealCards();
}

/**
 * Dynamite blasts the question away for a new one at the same depth, set off
 * by the actor (a stick is put in the pack if nobody who can use one holds
 * one). A depth has two blasts at most: past them, the lab says so.
 */
export const dynamite = () =>
  event('Blast through', async () => {
    const id = activeId();
    if (!holds(id, 'dynamite')) put((s) => invSet(s, id, (v) => (v.dynamite = 1)), true);
    withCards();
    const q = await running(notFind, 'none');
    act({ type: 'blast', askedAt: q.askedAt }, id);
  });

/**
 * Dynamite goes off by itself as the clock hits 0, with no flare to burn
 * (flares are emptied first, a stick put in the pack if none is held).
 */
export const dynamiteAtZero = () =>
  event('Dynamite at 0', async () => {
    const s = run()!;
    const id = activeId();
    const ids = coop() ? standingIds(s) : [id];
    if (ids.some((o) => inventoryOf(s, o).flares)) put((n) => ids.forEach((o) => invSet(n, o, (v) => (v.flares = 0))), true);
    if (!holds(id, 'dynamite')) put((n) => invSet(n, id, (v) => (v.dynamite = 1)), true);
    withCards();
    await running(notFind, 'none');
    setTimeLeft(1200);
  });

/** A wrong answer that a ward takes instead of a life. */
export const wardBreaks = () =>
  event('Ward breaks', async () => {
    const id = activeId();
    if (!inventoryOf(run()!, id).wards) put((s) => invSet(s, id, (v) => (v.wards = 1)), true);
    answer(await running(notFind, 'none'), false);
  });

/** An Azurite Vein's cave-in that two wards take, both its losses (two wards are put in the pack first). */
export const wardsCaveIn = () =>
  event('Two wards take a cave-in', async () => {
    const id = activeId();
    if (inventoryOf(run()!, id).wards < 2) put((s) => invSet(s, id, (v) => (v.wards = 2)), true);
    const q = await running((q) => q.find === 'azurite', 'azurite');
    answer(q, false, id);
  });

/**
 * Co-op: a teammate's ward takes a loss, seen from the screen's player: the
 * first other player standing (given a ward if they have none) answers wrong.
 */
export const teammateWard = () =>
  event("Teammate's ward", async () => {
    if ((run()?.players.length ?? 1) < 2) setPlayers(2);
    const mate = standingIds(run()!).find((o) => o !== viewerId());
    if (!mate) throw new Error('no teammate is standing');
    if (!inventoryOf(run()!, mate).wards) put((n) => invSet(n, mate, (v) => (v.wards = 1)), true);
    const q = await running(notFind, 'none');
    answer(q, false, mate);
  });

/** A wrong answer on an Azurite Vein: it caves in for two losses. */
export const caveIn = () =>
  event('Cave-in', async () => {
    const q = await running((q) => q.find === 'azurite', 'azurite');
    answer(q, false);
  });

/** The last life lost on a wrong answer: "You perish" (Next then ends a run alone; together the rest play on). */
export const lastLife = () =>
  event('Last life', async () => {
    const id = activeId();
    const q = await running(notFind, 'none');
    if (coop() && q.struck?.some((x) => x.by === id)) throw new Error(`${nameOf(id)} already answered this question`);
    put((s) => {
      setLivesIn(s, id, 1);
      invSet(s, id, (v) => (v.wards = 0));
    }, true);
    answer(state()!.question!, false, id);
  });

// ---- co-op ---------------------------------------------------------------

/** Co-op: the actor votes for card `i` (the cards are dealt first if none are). */
export const voteFor = (i: number) =>
  event('Vote', () => {
    if (state()?.phase !== 'choosing') dealCards();
    const s = state()!;
    const card = s.offered[i];
    if (!card) throw new Error('no such card on offer');
    act({ type: 'vote', category: card });
  });

/** Co-op: everyone standing but the screen's player votes, each for a card at random (the screen's player votes on the cards). */
export const othersVote = () =>
  event('Others vote', () => {
    if (state()?.phase !== 'choosing') dealCards();
    const s = state()!;
    const ids = standingIds(s).filter((id) => id !== viewerId() && !Object.hasOwn(s.delve?.votes ?? {}, id));
    if (!ids.length) throw new Error('nobody else is left to vote');
    for (const id of ids) {
      const cur = state()!;
      if (cur.phase !== 'choosing') break;
      act({ type: 'vote', category: cur.offered[Math.floor(Math.random() * cur.offered.length)] }, id);
    }
  });

/** Co-op: the actor gives one of their lives to the first teammate who perished (given enough lives first). */
export const reviveTeammate = () =>
  event('Revive', () => {
    const s = run()!;
    const id = activeId();
    const target = s.players.find((p) => p.id !== id && livesOf(s, p.id) === 0)?.id;
    if (!target) throw new Error('nobody has perished to bring back');
    if (s.phase === 'question') throw new Error('not during a question: wait for the reveal or the cards');
    if (livesOf(s, id) < REVIVE_FROM) {
      setLives(id, DELVE_LIVES);
      note(`${nameOf(id)} was given three lives to have one to give.`);
    }
    act({ type: 'revive', target });
  });

/** Co-op: everyone standing but the actor perishes on a wrong answer, one by one, so the actor is left standing alone. */
export const othersPerish = () =>
  event('Others perish', async () => {
    if ((run()?.players.length ?? 1) < 2) setPlayers(2);
    const id = activeId();
    const q = await running((q) => notFind(q) && !q.struck?.length, 'none');
    const others = standingIds(run()!).filter((o) => o !== id);
    if (!others.length) throw new Error('nobody else is standing');
    put((s) => {
      for (const o of others) {
        setLivesIn(s, o, 1);
        invSet(s, o, (v) => (v.wards = 0));
      }
    }, true);
    for (const o of others) {
      answer(state()!.question!, false, o);
      await sleep(500);
      if (state()?.phase !== 'question' || state()?.question?.askedAt !== q.askedAt) break;
    }
  });

/** One depth deeper, built as the engine does it at the end of a round, so the mark for it plays. */
function stepDown() {
  put((s) => {
    s.round++;
    s.turn = Math.max(0, s.players.findIndex((p) => livesOf(s, p.id) > 0));
    s.turnCount++;
    deal(s);
  });
}

/** At depth `d` with cards dealt (a fresh run id), seen by the game screen, then one deeper. */
async function stepInto(d: number, before?: () => void) {
  put((s) => {
    const lives = new Map(s.players.map((p) => [p.id, livesOf(s, p.id)]));
    s.round = Math.max(1, d - 1);
    for (const p of s.players) setLivesIn(s, p.id, lives.get(p.id)!);
    s.turnCount++;
    deal(s);
  }, true);
  before?.();
  // The screen notes the depth it is at, so the next one counts as deeper.
  await sleep(350);
  stepDown();
}

/** Into the zone `d` is in (its first depth), or the next one from the Mines. */
export const zoneEnter = (d = depthOf()) =>
  event('Zone change', async () => {
    let start = Math.floor((Math.max(1, d) - 1) / 10) * 10 + 1;
    if (!milestoneAt(start)) start = 11;
    await stepInto(start);
  });

export const nextZone = () => zoneEnter(Math.floor((depthOf() - 1) / 10) * 10 + 11);

/** Past this device's best alone ("Deeper than ever"): the best is set to the depth just left. */
export const deeperThanEver = () =>
  event('Deeper than ever', async () => {
    if ((run()?.players.length ?? 1) > 1) setPlayers(1);
    let d = depthOf() + 1;
    // A zone's own name takes the gate on its first depth.
    if (milestoneAt(d)) d++;
    await stepInto(d, () => (session.bestAtStart = d - 1));
  });

/** One depth deeper the real way: a right answer, then Next. */
export const descend = () =>
  event('Descend', async () => {
    answer(await running(notFind, 'none'), true);
    await sleep(1400);
    next();
  });

/** The plunge the scene takes as a card is picked (src/lib/descent.ts), if this build has it. */
export function plunge(): boolean {
  const f = (descentModule as Record<string, unknown>).plunge;
  if (typeof f !== 'function') return false;
  (f as () => void)();
  return true;
}

// ---- end screens ---------------------------------------------------------

/**
 * The run ends: everyone perished, the first seat deepest (as the engine
 * finishes a run: nobody wins). Together, the first seat once gave a life to
 * bring back the second, so the end screen has a revive to tell.
 */
function finish(s: GameState) {
  const d = s.round;
  const dm = s.delve!;
  const ids = s.players.map((p) => p.id);
  const lossesAt = (n: number, fell: number) => Array.from({ length: n }, (_, k) => Math.max(1, fell - (n - 1 - k) * 2));
  dm.revives = [];
  if (ids.length > 1) {
    // The second seat perished, was brought back by the first, and perished again.
    const second = lossesAt(DELVE_LIVES + 1, Math.max(1, d - 2));
    dm.losses[ids[1]] = second;
    const fell = second[DELVE_LIVES - 1];
    dm.revives.push({ by: ids[0], to: ids[1], depth: fell, fell, at: Date.now() });
    dm.losses[ids[0]] = lossesAt(DELVE_LIVES - 1, d);
  }
  s.players.forEach((p, i) => {
    if (ids.length > 1 && i < 2) return;
    dm.losses[p.id] = lossesAt(DELVE_LIVES, Math.max(1, d - i * 2));
  });
  s.winners = [];
  if (isGroupRun(s)) {
    dm.votes = {};
    dm.voteFrom = null;
  }
  delete dm.snapshot;
  dm.finds = [];
  delete dm.find;
  s.phase = 'over';
  s.question = null;
  s.reveal = null;
  s.offered = [];
}

export function endSolo(best = false) {
  if ((run()?.players.length ?? 1) > 1) setPlayers(1);
  // Under a fresh run id, as a setup change: the lives it takes play nothing
  // (no "Turn missed"), while the end itself plays and is recorded.
  put(finish, true);
  const s = run();
  if (best && s?.delve) session.delveResult = { id: s.delve.startedAt, depth: s.round, previousBest: Math.max(1, s.round - 7), best: true };
}

export function endGroup() {
  if ((run()?.players.length ?? 1) < 2) setPlayers(Math.max(2, run()?.players.length ?? 2));
  put(finish, true);
}

/** Back from an end screen to a run at the same depth. */
export function backToRun() {
  const s = state();
  newRun(s?.players.length ?? 1, s?.round ?? 1);
}

export function clearRecords() {
  resetRecords();
  note("The lab's Delve records were cleared.");
}

// ---- settings ------------------------------------------------------------

export function setGrayscale(g: 'rules' | Grayscale) {
  opts.grayscale = g;
  session.labGrayscale = g === 'rules' ? null : g;
}
