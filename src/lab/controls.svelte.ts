// The lab's controls: a Delve run on this device (hot-seat), set up and
// played through the real engine and session, so the screen, sounds and
// effects that follow are the game's own.
//
// Two kinds of change:
// - setup (players, lives, carried items, depth, whose turn): applied
//   quietly. The run takes a new id (delve.startedAt), so the scoreboard and
//   the reveal see a fresh run and play nothing for the change itself.
// - events: real host actions (pick, answer, next, the clock, flare,
//   dynamite) on the run as it stands, or the change the engine itself would
//   make (an item gained, the next depth), so every moment plays as in a game.

import { engine, session } from '../lib/session.svelte';
import { createGame, DEFAULT_SETTINGS, type GameState, type Grayscale, type Question } from '../lib/game';
import {
  DELVE_LIVES,
  DELVE_MAX_DYNAMITE,
  DELVE_MAX_FLARES,
  DELVE_MAX_WARDS,
  SHARDS_PER_WARD,
  blastAtMs,
  clockLeft,
  delveQuestionTimer,
  delveStandings,
  hasRoom,
  inventoryOf,
  livesOf,
  tileVeilSize,
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
  /** The find among the cards the lab deals. */
  cardFind: 'none' as FindChoice,
});

type Paused = { askedAt: number; left: number; span: number; held: Question['held'] };

export const lab = $state({
  /** What the lab is doing right now (an event waiting on the art, say). */
  busy: '',
  log: [] as { at: number; text: string }[],
  paused: null as Paused | null,
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

/** Lost-life depths for `lives` left at `depth`, spread above it. */
function lossesFor(lives: number, depth: number): number[] {
  const n = Math.max(0, DELVE_LIVES - lives);
  return Array.from({ length: n }, (_, i) => Math.max(1, depth - (n - 1 - i) * 3));
}

/**
 * Fields of a group run (the time to pick, the last one standing), read and
 * set only where the run has them: group Delve is being reworked, and the
 * lab's group controls are kept to what still applies.
 */
const groupField = (s: GameState, key: string) => (s.delve as unknown as Record<string, unknown> | null)?.[key];
function setGroupField(s: GameState, key: string, value: unknown) {
  const d = s.delve as unknown as Record<string, unknown> | null;
  if (d && key in d) d[key] = value;
}
const clearPick = (s: GameState) => setGroupField(s, 'pickBy', null);

/** Deals the player on turn three cards, with the lab's find among them. */
function deal(s: GameState) {
  const p = s.players[s.turn];
  s.phase = 'choosing';
  s.question = null;
  s.reveal = null;
  s.offered = p ? engine.offerCategories(s, p) : [];
  if (s.delve) {
    clearPick(s);
    s.delve.find = opts.cardFind !== 'none' && s.offered.length ? { category: s.offered[1] ?? s.offered[0], kind: opts.cardFind } : null;
  }
}

/** A fresh run of `n` players at `depth`, through the engine (join, start), carrying over what `from` had for the same seats. */
function freshRun(n: number, depth: number, from: GameState | null): GameState {
  let s = createGame(null, { ...DEFAULT_SETTINGS, mode: 'delve' });
  for (let i = 0; i < n; i++) s = engine.apply(s, { type: 'join', playerId: IDS[i], name: NAMES[i] }, null);
  s = engine.apply(s, { type: 'start' }, null);
  // Seats in the lab's order, not the engine's shuffle.
  s.players.sort((a, b) => IDS.indexOf(a.id) - IDS.indexOf(b.id));
  s.round = depth;
  s.turn = Math.min(from?.turn ?? 0, n - 1);
  if (from?.delve) {
    for (const p of s.players) {
      if (!from.players.some((o) => o.id === p.id)) continue;
      s.delve!.losses[p.id] = lossesFor(livesOf(from, p.id), depth);
      s.delve!.inventory![p.id] = inventoryOf(from, p.id);
    }
  }
  deal(s);
  return s;
}

/** Starts the lab's run (or keeps a Delve run already on this device, after a reload). */
export function boot() {
  if (run() && session.mode === 'local' && state()?.phase !== 'lobby') return;
  newRun(1, 1);
}

/** A new run on this device: `n` players at `depth`. */
export function newRun(n: number, depth: number) {
  const s = freshRun(n, depth, null);
  session.startLocal(s);
  lab.paused = null;
  note(`New run: ${n} ${n === 1 ? 'player' : 'players'} at depth ${depth}.`);
}

export function setPlayers(n: number) {
  const prev = run();
  const s = freshRun(Math.max(1, Math.min(MAX_PLAYERS, n)), depthOf(), prev);
  s.version = (prev?.version ?? 0) + 1;
  lab.paused = null;
  if (session.mode === 'local' && prev) session.labSetState(s);
  else session.startLocal(s);
}

export function setDepth(d: number) {
  const depth = Math.max(1, Math.min(MAX_DEPTH, Math.round(d)));
  if (depth === depthOf()) return;
  put((s) => {
    s.round = depth;
    // Lives already lost stay lost, now from depths above this one.
    for (const p of s.players) s.delve!.losses[p.id] = lossesFor(livesOf(s, p.id), depth);
  }, true);
}

export function setTurn(i: number) {
  put((s) => {
    s.turn = Math.max(0, Math.min(s.players.length - 1, i));
    s.turnCount++;
    deal(s);
  }, true);
}

export function setLives(id: string, lives: number) {
  put((s) => {
    s.delve!.losses[id] = lossesFor(Math.max(0, Math.min(DELVE_LIVES, lives)), s.round);
  }, true);
}

function invSet(s: GameState, id: string, change: (inv: Inventory) => void) {
  const inv = inventoryOf(s, id);
  change(inv);
  (s.delve!.inventory ??= {})[id] = inv;
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
  const card = choosing && kind && prev.delve?.find?.kind === kind ? prev.delve.find.category : null;
  const category =
    card ??
    (choosing ? prev.offered.filter((c) => c !== prev.delve?.find?.category)[0] : null) ??
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
  else if (opts.veil === 'on' && !q.veil)
    q.veil = {
      size: q.mode === 'art' ? tileVeilSize(5) : 5,
      seconds: delveQuestionTimer(s.round, q) * 0.55,
      seed: Math.floor(Math.random() * 2 ** 31),
    };
  const p = s.players[s.turn];
  if (p) p.recent = [...p.recent, category].slice(-7);
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
  if (r && livesOf(r, r.players[r.turn]?.id ?? '') === 0) {
    setLives(r.players[r.turn].id, DELVE_LIVES);
    note('The player on turn had no lives left: given three.');
  }
  const s = state();
  if (s?.phase !== 'question' || !s.question || (want && !want(s.question))) ask(find);
  const ok = await until(() => state()?.phase === 'question' && state()!.question!.deadline !== null, 20000);
  if (!ok) throw new Error('the art did not load, so the clock never started');
  return state()!.question!;
}

const notFind = (q: Question) => !q.find;

function wrongIndex(q: Question): number {
  const blown = new Set(q.blownAway ?? []);
  const wrong = q.options.flatMap((id, i) => (id !== q.itemId && !blown.has(i) ? [i] : []));
  return wrong[Math.floor(Math.random() * wrong.length)] ?? q.options.findIndex((id) => id !== q.itemId);
}

function answer(q: Question, right: boolean) {
  const index = right ? q.options.indexOf(q.itemId) : wrongIndex(q);
  session.dispatch({ type: 'answer', index, askedAt: q.askedAt });
}

export const answerRight = () => event('Answer right', async () => answer(await running(), true));
export const answerWrong = () => event('Answer wrong', async () => answer(await running(), false));

export function next() {
  if (state()?.phase === 'reveal') session.dispatch({ type: 'next' });
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

/** Half the clock gone, less `before` ms: dynamite goes off at half (rounded up to a second). */
export function toHalf(before = 0) {
  const s = state();
  if (!s?.question) return;
  setElapsed(blastAtMs(s) - before);
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

const activeId = () => {
  const s = state();
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
      setElapsed(blastAtMs(state()!) + 200);
      await sleep(120);
    }
    answer(state()!.question!, true);
  });

/** Time runs out with nothing in the pack: "The darkness took you". */
export const timeOut = () =>
  event('Time out', async () => {
    const id = activeId();
    const inv = inventoryOf(run()!, id);
    if (inv.flares || inv.dynamite) {
      put((s) => invSet(s, id, (v) => ((v.flares = 0), (v.dynamite = 0))), true);
      note('Flares and dynamite emptied first, or they would go off.');
    }
    await running();
    setTimeLeft(1200);
  });

/** A flare burns as the clock hits 0 (one is put in the pack if there is none). */
export const flare = () =>
  event('Flare at 0', async () => {
    const id = activeId();
    if (!inventoryOf(run()!, id).flares) put((s) => invSet(s, id, (v) => (v.flares = 1)), true);
    const q = await running((q) => notFind(q) && !q.flared, 'none');
    if (q.find || q.flared) throw new Error('a flare only burns once, and never on a find');
    setTimeLeft(1600);
  });

/** Dynamite goes off at half the clock, with its pause (a stick is put in the pack if there is none). */
export const dynamite = () =>
  event('Dynamite', async () => {
    const id = activeId();
    if (!inventoryOf(run()!, id).dynamite) put((s) => invSet(s, id, (v) => (v.dynamite = 1)), true);
    const q = await running((q) => notFind(q) && !q.blasted, 'none');
    if (q.find || q.blasted) throw new Error('dynamite only goes off once, and never on a find');
    toHalf(1700);
  });

/** A wrong answer that a ward takes instead of a life. */
export const wardBreaks = () =>
  event('Ward breaks', async () => {
    const id = activeId();
    if (!inventoryOf(run()!, id).wards) put((s) => invSet(s, id, (v) => (v.wards = 1)), true);
    answer(await running(notFind, 'none'), false);
  });

/** A wrong answer on an Azurite Vein: it caves in for two losses. */
export const caveIn = () =>
  event('Cave-in', async () => {
    const q = await running((q) => q.find === 'azurite', 'azurite');
    answer(q, false);
  });

/** The last life lost: "You perish" (Next then ends a run alone). */
export const lastLife = () =>
  event('Last life', async () => {
    const id = activeId();
    put((s) => {
      s.delve!.losses[id] = lossesFor(1, s.round);
      invSet(s, id, (v) => (v.wards = 0));
    }, true);
    answer(await running(notFind, 'none'), false);
  });

/** One depth deeper, built as the engine does it at the end of a round, so the mark for it plays. */
function stepDown() {
  put((s) => {
    // A group down to one: the last one standing, from the depth just finished.
    const standing = s.players.filter((p) => livesOf(s, p.id) > 0);
    if (standing.length === 1 && s.players.length > 1 && !groupField(s, 'lastStanding')) setGroupField(s, 'lastStanding', { id: standing[0].id, depth: s.round });
    s.round++;
    s.turn = Math.max(0, s.players.findIndex((p) => livesOf(s, p.id) > 0));
    s.turnCount++;
    deal(s);
  });
}

/** At depth `d` with cards dealt (a fresh run id), seen by the game screen, then one deeper. */
async function stepInto(d: number, before?: () => void) {
  put((s) => {
    s.round = Math.max(1, d - 1);
    setGroupField(s, 'lastStanding', null);
    for (const p of s.players) s.delve!.losses[p.id] = lossesFor(livesOf(s, p.id), s.round);
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
    // A zone's own name takes the mark on its first depth.
    if (milestoneAt(d)) d++;
    await stepInto(d, () => (session.bestAtStart = d - 1));
  });

/** The last one standing: everyone else falls, and the round ends with them alone. */
export const lastStanding = () =>
  event('Last one standing', async () => {
    if ((run()?.players.length ?? 1) < 2) setPlayers(2);
    const id = activeId();
    let d = depthOf() + 1;
    if (milestoneAt(d)) d++;
    await stepInto(d, () =>
      put((s) => {
        for (const p of s.players) if (p.id !== id) s.delve!.losses[p.id] = lossesFor(0, s.round);
        if (livesOf(s, id) === 0) s.delve!.losses[id] = lossesFor(1, s.round);
        s.turn = s.players.findIndex((p) => p.id === id);
        deal(s);
      }, true),
    );
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

/** The run ends: everyone perished, the deepest last (as the engine finishes a run). */
function finish(s: GameState) {
  const d = s.round;
  s.players.forEach((p, i) => {
    const fell = Math.max(1, d - i * 2);
    s.delve!.losses[p.id] = [Math.max(1, fell - 5), Math.max(1, fell - 2), fell];
  });
  const rows = delveStandings(s);
  s.winners = s.players.length > 1 ? rows.filter((r) => r.rank === 1).map((r) => r.id) : [];
  if (s.players.length > 1) setGroupField(s, 'lastStanding', { id: rows[0].id, depth: Math.max(1, d - 2) });
  clearPick(s);
  s.delve!.find = null;
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
