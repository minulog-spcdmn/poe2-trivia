// Pure game logic. The host (or the single device in hot-seat mode) is the only
// place this runs; everyone else just renders the state it broadcasts.

export interface Item {
  id: string;
  name: string;
  base: string;
  /** Fine-grained class (Rings, Bows, Strength gems…) used for tough decoys. */
  group: string;
  /** Broad category offered to players. */
  category: string;
  kind: 'unique' | 'gem';
}

export type Difficulty = 'cruel' | 'merciless' | 'eternal';

/** Name the item from its art, or pick the right art for a name. */
export type QuestionMode = 'name' | 'art';

export interface DifficultyRules {
  options: number;
  /** Draw decoys from the answer's own group (all rings, all bows…) first. */
  groupFirst: boolean;
  /** Share of decoys picked for having a name that looks like the answer. */
  similarNames: number;
  /** Chance of an "art" question instead of a "name" question. */
  artChance: number;
  /** Art is hidden under tiles that lift one by one; fraction of the timer it takes. */
  veil: { size: number; share: number } | null;
  /** "Art" question pictures are shown without colour. */
  grayscale: boolean;
  /** Chance of each picture being shown flipped left to right. */
  mirror: number;
  /** How many turns a chosen category stays locked. */
  lockout: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyRules> = {
  cruel: { options: 4, groupFirst: true, similarNames: 0, artChance: 0.4, veil: null, grayscale: false, mirror: 0, lockout: 2 },
  merciless: {
    options: 6,
    groupFirst: true,
    similarNames: 0.5,
    artChance: 0.4,
    veil: { size: 5, share: 0.55 },
    grayscale: false,
    mirror: 0,
    lockout: 3,
  },
  eternal: {
    options: 8,
    groupFirst: false,
    similarNames: 1,
    artChance: 0.5,
    veil: { size: 7, share: 0.7 },
    grayscale: true,
    mirror: 0.3,
    lockout: 4,
  },
};

/**
 * Groups that come up less often (relative weight when picking the answer),
 * and only appear as decoys when nothing else fits. Players found precursor
 * tablets a chore.
 */
export const RARE_GROUPS: Record<string, number> = { Tablets: 0.25 };

const weightOf = (it: Item) => RARE_GROUPS[it.group] ?? 1;

function rulesForKey(d: string | undefined): Difficulty {
  return d && d in DIFFICULTIES ? (d as Difficulty) : 'cruel';
}

/** The rules for the current question (deathmatch questions are one tier harder). */
export function activeRules(s: GameState): DifficultyRules {
  const base = rulesForKey(s.settings.difficulty);
  return DIFFICULTIES[s.deathmatch ? HARDER[base] : base];
}

export function rulesFor(difficulty: string | undefined): DifficultyRules {
  return DIFFICULTIES[difficulty as Difficulty] ?? DIFFICULTIES.cruel;
}

export interface Veil {
  size: number;
  /** Seconds until the last tile has lifted. */
  seconds: number;
  seed: number;
}

import { cleanName, nameProblem } from './names.ts';

export interface Deathmatch {
  /** Players still in, in turn order. */
  alive: string[];
  /** Everyone who entered the deathmatch. */
  entrants: string[];
  round: number;
  /** This round's answers so far: player id → answered correctly. */
  results: Record<string, boolean>;
  /** Knocked out at the end of the previous round. */
  eliminated: string[];
  /** turnCount when it started (lets clients play the intro once). */
  startedAt: number;
}

/** Deathmatch questions are one tier harder. */
const HARDER: Record<Difficulty, Difficulty> = { cruel: 'merciless', merciless: 'eternal', eternal: 'eternal' };

export type Phase = 'lobby' | 'choosing' | 'question' | 'reveal' | 'over';

export interface Player {
  id: string;
  name: string;
  score: number;
  /** Categories this player picked on their last turns (most recent last). */
  recent: string[];
  connected: boolean;
  /** Stable colour slot for avatars. */
  hue: number;
}

/**
 * turns: players take turns choosing a category and answering.
 * race: everyone answers the same question; first correct answer scores,
 * wrong answers cost a point and lock that player out of the question.
 */
export type GameMode = 'turns' | 'race';

export interface Settings {
  targetScore: number;
  /** Seconds per question, 0 = no timer (race mode always uses a timer). */
  timer: number;
  difficulty: Difficulty;
  mode: GameMode;
  /** Online rooms only: listed in the "open rooms" browser. */
  public: boolean;
  /** No new players may join (people already in the game can still rejoin). */
  locked: boolean;
}

/** Answers sent just before time ran out still count if they arrive this late (network delay). */
export const ANSWER_GRACE_MS = 500;

/** Race questions need an end, so "no timer" falls back to this. */
export const RACE_DEFAULT_TIMER = 30;

export interface Question {
  category: string;
  mode: QuestionMode;
  /** The answer. Empty in the copy guests receive until the reveal. */
  itemId: string;
  /** Option item ids in display order. Empty for guests until the reveal. */
  options: string[];
  /** Name questions: option names in display order. Art questions: nulls. */
  labels: (string | null)[];
  /** Art questions: the name to find the picture for. */
  prompt: string | null;
  /** Tiles hiding the art on name questions (merciless and up). */
  veil: Veil | null;
  /**
   * Pictures shown flipped left to right (eternal): one flag per option on art
   * questions, one for the art on name questions. Empty for guests until the
   * reveal (missing in games saved before it existed).
   */
  mirrored?: boolean[];
  /** Host-clock timestamp when the question was asked. */
  askedAt: number;
  /** Host-clock timestamp when time runs out, null without timer. */
  deadline: number | null;
  /** Race mode: wrong answers so far, in order. Those players are locked out. */
  misses: { playerId: string; index: number }[];
}

export interface Reveal {
  correctId: string;
  chosenId: string | null;
  correctIndex: number;
  chosenIndex: number | null;
  correct: boolean;
  timedOut: boolean;
  /** Race mode: who answered correctly first. */
  winnerId: string | null;
}

export interface GameState {
  phase: Phase;
  hostId: string | null;
  players: Player[];
  settings: Settings;
  /** Index into players of whose turn it is. */
  turn: number;
  round: number;
  turnCount: number;
  offered: string[];
  question: Question | null;
  reveal: Reveal | null;
  used: string[];
  winners: string[];
  /** Sudden-death playoff between players tied at or above the target. */
  deathmatch: Deathmatch | null;
  /** Race mode: categories of the last questions, to avoid repeats. */
  recentCategories: string[];
  /** askedAt of the latest question (missing in games saved before it existed). */
  lastAskedAt?: number;
  /** Bumped on every change so clients can ignore stale messages. */
  version: number;
}

export type Action =
  | { type: 'join'; playerId: string; name: string }
  | { type: 'rename'; playerId: string; name: string }
  | { type: 'remove'; playerId: string }
  | { type: 'connection'; playerId: string; connected: boolean }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'start' }
  | { type: 'pick'; category: string }
  | { type: 'answer'; index: number | null; askedAt?: number }
  | { type: 'next' }
  | { type: 'skip' }
  | { type: 'restart' };

export const OFFER_COUNT = 3;
export const MAX_PLAYERS = 12;
export { MAX_NAME } from './names.ts';

export const DEFAULT_SETTINGS: Settings = { targetScore: 10, timer: 20, difficulty: 'cruel', mode: 'turns', public: false, locked: false };

export class ActionError extends Error {
  /** Expected races (e.g. an answer arriving after the question closed): don't bother the user. */
  readonly silent: boolean;
  constructor(message: string, silent = false) {
    super(message);
    this.silent = silent;
  }
}

type Rng = () => number;

export function createGame(hostId: string | null, settings: Settings = DEFAULT_SETTINGS): GameState {
  return {
    phase: 'lobby',
    hostId,
    players: [],
    settings: { ...settings },
    turn: 0,
    round: 1,
    turnCount: 0,
    offered: [],
    question: null,
    reveal: null,
    used: [],
    winners: [],
    deathmatch: null,
    recentCategories: [],
    lastAskedAt: 0,
    version: 0,
  };
}

export { cleanName };

/**
 * The copy of the state guests receive: nothing that identifies the answer
 * before the reveal (the item ids behind the options, the list of used items).
 */
export function publicView(s: GameState): GameState {
  const q = s.question;
  if (!q) return { ...s, used: [] };
  if (s.phase === 'question') return { ...s, used: [], question: { ...q, itemId: '', options: [], mirrored: [] } };
  // Revealed: only the answer and the options someone actually picked are
  // identified; the untouched decoys stay anonymous for later questions.
  const known = new Set<number | null>([s.reveal?.correctIndex ?? -1, s.reveal?.chosenIndex ?? null, ...q.misses.map((m) => m.index)]);
  return { ...s, used: [], question: { ...q, options: q.options.map((id, i) => (known.has(i) ? id : '')) } };
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample<T>(arr: T[], n: number, rng: Rng): T[] {
  return shuffle(arr, rng).slice(0, n);
}

export class Engine {
  readonly items: Item[];
  readonly byId: Map<string, Item>;
  readonly byCategory: Map<string, Item[]>;
  readonly categories: string[];
  private rng: Rng;
  private now: () => number;

  constructor(items: Item[], opts: { rng?: Rng; now?: () => number } = {}) {
    this.items = items;
    this.byId = new Map(items.map((it) => [it.id, it]));
    this.byCategory = new Map();
    for (const it of items) {
      const list = this.byCategory.get(it.category) ?? [];
      list.push(it);
      this.byCategory.set(it.category, list);
    }
    this.categories = [...this.byCategory.keys()].sort();
    this.rng = opts.rng ?? Math.random;
    this.now = opts.now ?? Date.now;
  }

  /**
   * Applies an action. `from` is the player sending it, or null for a trusted
   * local caller (hot-seat mode, host timers). Returns a new state object.
   */
  apply(prev: GameState, action: Action, from: string | null): GameState {
    const s: GameState = structuredClone(prev);
    const isHost = from === null || from === s.hostId;
    const race = s.settings.mode === 'race';
    const active = s.players[s.turn];
    const isActive = from === null || (active && from === active.id);

    switch (action.type) {
      case 'join': {
        if (from !== null && from !== action.playerId) throw new ActionError('Not allowed.');
        const existing = s.players.find((p) => p.id === action.playerId);
        if (existing) {
          // Rejoining keeps the original name, so a seat can't be renamed on the way back.
          existing.connected = true;
          break;
        }
        const name = cleanName(action.name);
        if (s.phase !== 'lobby') throw new ActionError('That game has already started.');
        if (s.settings.locked) throw new ActionError('The host has locked this room.');
        if (s.players.length >= MAX_PLAYERS) throw new ActionError('The lobby is full.');
        const problem = nameProblem(
          name,
          s.players.map((p) => p.name),
        );
        if (problem) throw new ActionError(problem);
        const used = new Set(s.players.map((p) => p.hue));
        let hue = 0;
        while (used.has(hue)) hue++;
        s.players.push({ id: action.playerId, name, score: 0, recent: [], connected: true, hue });
        break;
      }
      case 'rename': {
        if (!isHost && from !== action.playerId) throw new ActionError('Not allowed.');
        const p = s.players.find((p) => p.id === action.playerId);
        const name = cleanName(action.name);
        const problem = nameProblem(
          name,
          s.players.filter((o) => o.id !== action.playerId).map((o) => o.name),
        );
        if (problem) throw new ActionError(problem);
        if (p) p.name = name;
        break;
      }
      case 'remove': {
        if (!isHost && from !== action.playerId) throw new ActionError('Only the host can remove players.');
        if (action.playerId === s.hostId) throw new ActionError('The host cannot leave their own game.');
        const idx = s.players.findIndex((p) => p.id === action.playerId);
        if (idx < 0) break;
        s.players.splice(idx, 1);
        if (s.phase === 'lobby' || s.phase === 'over') break;
        if (s.players.length === 0) return { ...createGame(s.hostId, s.settings), lastAskedAt: s.lastAskedAt, version: s.version + 1 };
        if (race) {
          s.turn = 0;
          this.checkRaceDone(s);
        } else if (s.deathmatch) {
          const dm = s.deathmatch;
          dm.alive = dm.alive.filter((id) => id !== action.playerId);
          const wasActive = idx === s.turn;
          if (idx < s.turn) s.turn--;
          if (dm.alive.length <= 1) this.finish(s, dm.alive);
          else if (wasActive || !dm.alive.includes(s.players[s.turn]?.id)) {
            s.turn = (s.turn - 1 + s.players.length) % s.players.length;
            this.nextDuelist(s);
          }
        } else if (idx < s.turn) s.turn--;
        // Their turn: carry on from the seat before, so the end of the round is still checked.
        else if (idx === s.turn) this.advance(s, idx - 1);
        break;
      }
      case 'connection': {
        if (from !== null) throw new ActionError('Not allowed.');
        const p = s.players.find((p) => p.id === action.playerId);
        if (p) p.connected = action.connected;
        if (race) this.checkRaceDone(s);
        break;
      }
      case 'settings': {
        if (!isHost) throw new ActionError('Only the host can change settings.');
        // Listing and locking the room can be switched any time; the rules only between games.
        if (typeof action.settings.public === 'boolean') s.settings.public = action.settings.public;
        if (typeof action.settings.locked === 'boolean') s.settings.locked = action.settings.locked;
        if (Object.keys(action.settings).every((k) => k === 'public' || k === 'locked')) break;
        if (s.phase !== 'lobby' && s.phase !== 'over') throw new ActionError('Settings are locked during a game.');
        const { targetScore, timer, difficulty, mode } = action.settings;
        if (mode === 'turns' || mode === 'race') s.settings.mode = mode;
        if (difficulty && difficulty in DIFFICULTIES) s.settings.difficulty = difficulty;
        if (targetScore !== undefined) s.settings.targetScore = Math.max(1, Math.min(50, Math.round(targetScore)));
        if (timer !== undefined) s.settings.timer = Math.max(0, Math.min(120, Math.round(timer)));
        break;
      }
      case 'start': {
        if (!isHost) throw new ActionError('Only the host can start the game.');
        if (s.phase !== 'lobby') throw new ActionError('The game is already running.');
        if (s.players.length === 0) throw new ActionError('Add at least one player.');
        s.players = shuffle(s.players, this.rng);
        for (const p of s.players) {
          p.score = 0;
          p.recent = [];
        }
        s.used = [];
        s.round = 1;
        s.turnCount = 0;
        s.winners = [];
        s.deathmatch = null;
        s.recentCategories = [];
        // The first turn goes to someone who is actually here.
        s.turn = Math.max(0, s.players.findIndex((p) => p.connected));
        if (race) this.beginRaceQuestion(s, true);
        else this.beginTurn(s, true);
        break;
      }
      case 'pick': {
        if (s.phase !== 'choosing') throw new ActionError('Not the time to pick a category.');
        if (!isActive) throw new ActionError("It's not your turn.");
        if (!s.offered.includes(action.category)) throw new ActionError('That category is not on offer.');
        if (!s.deathmatch) {
          active.recent = [...active.recent, action.category].slice(-rulesFor(s.settings.difficulty).lockout);
        }
        s.question = this.makeQuestion(s, action.category);
        s.used.push(s.question.itemId);
        s.phase = 'question';
        break;
      }
      case 'answer': {
        if (race) {
          this.raceAnswer(s, action, from);
          break;
        }
        if (s.phase !== 'question' || !s.question) throw new ActionError('There is no open question.');
        if (!isActive) throw new ActionError("It's not your turn.");
        const q = s.question;
        if (action.askedAt !== undefined && action.askedAt !== q.askedAt) throw new ActionError('Too late!', true);
        const index = validIndex(action.index, q.options.length);
        const chosenId = index === null ? null : q.options[index];
        const timedOut =
          chosenId === null || (q.deadline !== null && from !== null && this.now() > q.deadline + ANSWER_GRACE_MS);
        const correct = !timedOut && chosenId === q.itemId;
        if (correct) active.score += 1;
        if (s.deathmatch) s.deathmatch.results[active.id] = correct;
        s.reveal = {
          correctId: q.itemId,
          chosenId: timedOut ? null : chosenId,
          correctIndex: q.options.indexOf(q.itemId),
          chosenIndex: timedOut ? null : index,
          correct,
          timedOut,
          winnerId: correct ? active.id : null,
        };
        s.phase = 'reveal';
        break;
      }
      case 'next': {
        if (s.phase !== 'reveal') throw new ActionError('Nothing to continue.');
        if (race) {
          if (!isHost) throw new ActionError('The host moves the race on.');
          this.advanceRace(s);
        } else {
          if (!isActive && !isHost) throw new ActionError("It's not your turn.");
          this.advance(s);
        }
        break;
      }
      case 'skip': {
        if (!isHost) throw new ActionError('Only the host can skip a turn.');
        if (s.phase !== 'choosing' && s.phase !== 'question') throw new ActionError('Nothing to skip.');
        if (race) this.advanceRace(s);
        else {
          if (s.deathmatch && s.players[s.turn]) s.deathmatch.results[s.players[s.turn].id] = false;
          this.advance(s);
        }
        break;
      }
      case 'restart': {
        if (!isHost) throw new ActionError('Only the host can restart.');
        const fresh = createGame(s.hostId, s.settings);
        // Players who left during the game don't come back as ghosts in the lobby.
        fresh.players = s.players.filter((p) => p.connected).map((p) => ({ ...p, score: 0, recent: [] }));
        fresh.version = s.version;
        fresh.lastAskedAt = s.lastAskedAt;
        Object.assign(s, fresh);
        break;
      }
    }
    s.version = prev.version + 1;
    return s;
  }

  // ---- race mode --------------------------------------------------------

  private raceAnswer(s: GameState, action: Extract<Action, { type: 'answer' }>, from: string | null) {
    const q = s.question;
    // Late clicks from the previous question are expected; drop them quietly.
    if (s.phase !== 'question' || !q) throw new ActionError('Too late!', true);
    if (action.askedAt !== undefined && action.askedAt !== q.askedAt) throw new ActionError('Too late!', true);

    if (from === null) {
      // Host timer: time is up, nobody got it.
      s.reveal = this.noWinner(q, true);
      s.phase = 'reveal';
      return;
    }
    const player = s.players.find((p) => p.id === from);
    if (!player) throw new ActionError('You are not in this game.');
    if (q.misses.some((m) => m.playerId === from)) throw new ActionError('You already answered.', true);
    const index = validIndex(action.index, q.options.length);
    if (index === null) throw new ActionError('Too late!', true);
    if (q.deadline !== null && this.now() > q.deadline + ANSWER_GRACE_MS) throw new ActionError('Too late!', true);

    if (q.options[index] === q.itemId) {
      player.score += 1;
      s.reveal = {
        correctId: q.itemId,
        chosenId: q.itemId,
        correctIndex: index,
        chosenIndex: index,
        correct: true,
        timedOut: false,
        winnerId: player.id,
      };
      s.phase = 'reveal';
      return;
    }
    player.score -= 1;
    q.misses.push({ playerId: player.id, index });
    this.checkRaceDone(s);
  }

  private noWinner(q: Question, timedOut: boolean): Reveal {
    return {
      correctId: q.itemId,
      chosenId: null,
      correctIndex: q.options.indexOf(q.itemId),
      chosenIndex: null,
      correct: false,
      timedOut,
      winnerId: null,
    };
  }

  /** Ends the question once every connected player has answered wrong. */
  private checkRaceDone(s: GameState) {
    const q = s.question;
    if (s.phase !== 'question' || !q) return;
    const missed = new Set(q.misses.map((m) => m.playerId));
    const waiting = s.players.filter((p) => p.connected && !missed.has(p.id));
    if (waiting.length === 0) {
      s.reveal = this.noWinner(q, false);
      s.phase = 'reveal';
    }
  }

  private advanceRace(s: GameState) {
    const best = Math.max(...s.players.map((p) => p.score));
    if (best >= s.settings.targetScore) {
      s.phase = 'over';
      s.winners = s.players.filter((p) => p.score === best).map((p) => p.id);
      s.question = null;
      s.reveal = null;
      return;
    }
    this.beginRaceQuestion(s, false);
  }

  private beginRaceQuestion(s: GameState, first: boolean) {
    if (!first) s.turnCount++;
    s.round = s.turnCount + 1;
    const allowed = this.categories.filter((c) => !s.recentCategories.includes(c));
    const fresh = allowed.filter((c) => this.unusedIn(s, c).length > 0);
    const category = sample(fresh.length ? fresh : allowed, 1, this.rng)[0];
    s.recentCategories = [...s.recentCategories, category].slice(-rulesFor(s.settings.difficulty).lockout);
    s.offered = [];
    s.reveal = null;
    s.question = this.makeQuestion(s, category);
    s.used.push(s.question.itemId);
    s.phase = 'question';
  }

  // ---- turns mode -------------------------------------------------------

  private beginTurn(s: GameState, first: boolean) {
    if (!first) s.turnCount++;
    s.phase = 'choosing';
    s.question = null;
    s.reveal = null;
    // In a deathmatch nobody picks their favourite: one random category.
    s.offered = s.deathmatch ? [this.randomCategory(s)] : this.offerCategories(s, s.players[s.turn]);
  }

  private finish(s: GameState, winners: string[]) {
    s.phase = 'over';
    s.winners = winners;
    s.question = null;
    s.reveal = null;
    s.offered = [];
  }

  private randomCategory(s: GameState): string {
    const fresh = this.categories.filter((c) => this.unusedIn(s, c).length > 0);
    return sample(fresh.length ? fresh : this.categories, 1, this.rng)[0];
  }

  // ---- deathmatch -------------------------------------------------------

  private startDeathmatch(s: GameState, tied: string[]) {
    s.deathmatch = { alive: tied, entrants: [...tied], round: 1, results: {}, eliminated: [], startedAt: s.turnCount + 1 };
    this.nextDuelist(s);
  }

  /** Next duelist who hasn't answered this round; resolves the round when everyone has. */
  private advanceDeathmatch(s: GameState) {
    this.nextDuelist(s);
  }

  private nextDuelist(s: GameState) {
    const dm = s.deathmatch!;
    const connected = (id: string) => s.players.find((p) => p.id === id)?.connected ?? false;
    const waiting = dm.alive.filter((id) => !(id in dm.results) && connected(id));
    if (waiting.length) {
      // Keep seating order: the first waiting duelist after the current seat.
      const n = s.players.length;
      for (let i = 1; i <= n; i++) {
        const idx = (s.turn + i) % n;
        if (waiting.includes(s.players[idx].id)) {
          s.turn = idx;
          break;
        }
      }
      if (!waiting.includes(s.players[s.turn]?.id)) s.turn = s.players.findIndex((p) => p.id === waiting[0]);
      this.beginTurn(s, false);
      return;
    }
    // Round over. Missing answers (disconnected, skipped) count as wrong.
    const right = dm.alive.filter((id) => dm.results[id] === true);
    const stillHere = (ids: string[]) => ids.filter(connected);
    let alive = right.length > 0 && right.length < dm.alive.length ? right : dm.alive;
    if (stillHere(alive).length === 1) alive = stillHere(alive);
    dm.eliminated = dm.alive.filter((id) => !alive.includes(id));
    dm.alive = alive;
    if (alive.length <= 1 || stillHere(alive).length === 0) {
      this.finish(s, alive.length ? alive : right);
      return;
    }
    dm.round++;
    dm.results = {};
    const first = s.players.findIndex((p) => alive.includes(p.id) && p.connected);
    s.turn = first === 0 ? s.players.length - 1 : first - 1;
    this.nextDuelist(s);
  }


  /**
   * Moves to the next connected player after seat `from` (-1: before the
   * first seat), ending the game at a round boundary.
   */
  private advance(s: GameState, from = s.turn) {
    if (s.deathmatch) {
      this.advanceDeathmatch(s);
      return;
    }
    const n = s.players.length;
    let next = from;
    let wrapped = false;
    for (let i = 0; i < n; i++) {
      next++;
      if (next >= n) {
        next = 0;
        wrapped = true;
      }
      if (s.players[next].connected) break;
    }
    if (wrapped) {
      const best = Math.max(...s.players.map((p) => p.score));
      if (best >= s.settings.targetScore) {
        const leaders = s.players.filter((p) => p.score === best);
        if (leaders.length === 1) {
          this.finish(s, leaders.map((p) => p.id));
          return;
        }
        this.startDeathmatch(
          s,
          leaders.map((p) => p.id),
        );
        return;
      }
      s.round++;
    }
    s.turn = next;
    this.beginTurn(s, false);
  }

  private unusedIn(s: GameState, category: string): Item[] {
    const used = new Set(s.used);
    return (this.byCategory.get(category) ?? []).filter((it) => !used.has(it.id));
  }

  offerCategories(s: GameState, player: Player): string[] {
    const allowed = this.categories.filter((c) => !player.recent.includes(c));
    const fresh = allowed.filter((c) => this.unusedIn(s, c).length > 0);
    const stale = allowed.filter((c) => !fresh.includes(c));
    const pick = sample(fresh, OFFER_COUNT, this.rng);
    if (pick.length < OFFER_COUNT) pick.push(...sample(stale, OFFER_COUNT - pick.length, this.rng));
    return pick;
  }

  /**
   * Decoys picked for looking alike: a cluster of names around an anchor. The
   * answer plays any role in it as often as a decoy would (the anchor, another
   * member, or one of the random fillers outside it), so "the name that fits
   * the others best" doesn't give it away.
   */
  private lookalikes(answer: Item, pool: Item[], count: number, options: number): Item[] {
    if (count <= 0) return [];
    // The items most like `to`, with a few to spare so the pick still varies.
    const near = (to: Item, from: Item[]) =>
      shuffle(from, this.rng) // random order among equal scores
        .map((it) => ({ it, score: this.similarity(to, it) + (it.group === to.group ? 0.15 : 0) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(count + 2, Math.ceil(count * 1.5)))
        .map((r) => r.it);
    const others = (it: Item) => pool.filter((o) => o !== it);
    // The cluster has count + 1 places, counting the answer's.
    const role = this.rng() * options;
    if (role < 1) {
      // The answer is the anchor.
      return sample(near(answer, pool), count, this.rng);
    }
    if (role < count + 1) {
      // The answer is a member: anchor on an item that has the answer among its look-alikes.
      const anchors = pool.filter((a) => near(a, [answer, ...others(a)]).includes(answer));
      const anchor = sample(anchors.length ? anchors : pool, 1, this.rng)[0];
      const mates = near(anchor, [answer, ...others(anchor)]).filter((it) => it !== answer);
      return [anchor, ...sample(mates, count - 1, this.rng)];
    }
    // The answer is a filler: the cluster forms around some other item.
    const anchor = sample(pool, 1, this.rng)[0];
    return [anchor, ...sample(near(anchor, others(anchor)), count, this.rng)];
  }

  private simCache = new Map<string, number>();

  private similarity(a: Item, b: Item): number {
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    let v = this.simCache.get(key);
    if (v === undefined) this.simCache.set(key, (v = nameSimilarity(a.name, b.name)));
    return v;
  }

  private weightedPick(list: Item[]): Item {
    const total = list.reduce((sum, it) => sum + weightOf(it), 0);
    let r = this.rng() * total;
    for (const it of list) {
      r -= weightOf(it);
      if (r < 0) return it;
    }
    return list[list.length - 1];
  }

  /**
   * Builds a question from the category. Updates `s.used` when the category
   * has to start over.
   */
  makeQuestion(s: GameState, category: string): Question {
    const rules = activeRules(s);
    const inCat = this.byCategory.get(category) ?? [];
    const need = rules.options - 1;

    // Earlier answers never come back as decoys (they'd be easy to rule out).
    // Once too few unseen items are left for a full set of options, the
    // category starts over, except for its latest answer.
    if (this.unusedIn(s, category).length < rules.options) {
      const inThis = new Set(inCat.map((it) => it.id));
      const latest = s.used.findLast((id) => inThis.has(id));
      s.used = s.used.filter((id) => !inThis.has(id) || id === latest);
    }
    const unused = this.unusedIn(s, category);
    const answer = this.weightedPick(unused.length ? unused : inCat);

    const sameGroup = unused.filter((it) => it.id !== answer.id && it.group === answer.group);
    // Rare groups (tablets) only fill in as decoys when nothing else is left…
    const otherGroup = unused.filter((it) => it.id !== answer.id && it.group !== answer.group && weightOf(it) === 1);
    // …so a rare answer gets decoys from its own group, or it would stand out.
    const ownGroup = (rules.groupFirst || weightOf(answer) !== 1) && sameGroup.length >= need;
    const pool = ownGroup ? sameGroup : [...sameGroup, ...otherGroup];

    const simCount = Math.min(pool.length, Math.round(need * rules.similarNames));
    const decoys = this.lookalikes(answer, pool, simCount, rules.options);
    // Rest at random, preferring the same group, then the category, then anything.
    for (const source of [pool, unused, inCat, this.items]) {
      if (decoys.length >= need) break;
      const taken = new Set([answer.id, ...decoys.map((it) => it.id)]);
      decoys.push(...sample(source.filter((it) => !taken.has(it.id)), need - decoys.length, this.rng));
    }

    const options = shuffle([answer, ...decoys], this.rng).map((it) => it.id);
    const mode: QuestionMode = this.rng() < rules.artChance ? 'art' : 'name';
    // Strictly increasing: it doubles as the question's id for late answers.
    const askedAt = Math.max(this.now(), (s.lastAskedAt ?? 0) + 1, (s.question?.askedAt ?? 0) + 1);
    s.lastAskedAt = askedAt;
    const timer = s.settings.mode === 'race' ? s.settings.timer || RACE_DEFAULT_TIMER : s.settings.timer;
    const deadline = timer > 0 ? askedAt + timer * 1000 : null;
    const veil: Veil | null =
      rules.veil && mode === 'name'
        ? {
            size: rules.veil.size,
            seconds: (timer > 0 ? timer : 20) * rules.veil.share,
            seed: Math.floor(this.rng() * 2 ** 31),
          }
        : null;
    const labels = options.map((id) => (mode === 'name' ? this.byId.get(id)!.name : null));
    const prompt = mode === 'art' ? answer.name : null;
    // Each picture flips on its own roll, so a flipped option says nothing about the answer.
    const mirrored = Array.from({ length: mode === 'art' ? options.length : 1 }, () => rules.mirror > 0 && this.rng() < rules.mirror);
    return { category, mode, itemId: answer.id, options, labels, prompt, veil, mirrored, askedAt, deadline, misses: [] };
  }
}

function bigrams(name: string): string[] {
  const clean = name.toLowerCase().replace(/[^a-z]/g, '');
  const out: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) out.push(clean.slice(i, i + 2));
  return out;
}

/**
 * How alike two names look: letter-pair overlap (Dice coefficient) plus
 * bonuses for the same "shape" (possessive, "The …", word count), the same
 * opening letters and shared words.
 */
export function nameSimilarity(a: string, b: string): number {
  const ba = bigrams(a);
  const bb = bigrams(b);
  const counts = new Map<string, number>();
  for (const g of ba) counts.set(g, (counts.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of bb) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      shared++;
      counts.set(g, n - 1);
    }
  }
  let score = ba.length + bb.length ? (2 * shared) / (ba.length + bb.length) : 0;

  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la[0] === lb[0]) score += 0.3;
  if (la.slice(0, 2) === lb.slice(0, 2)) score += 0.2;
  const possessive = (n: string) => /'s?\b/.test(n);
  if (possessive(la) === possessive(lb)) score += 0.2;
  if (la.startsWith('the ') === lb.startsWith('the ')) score += 0.15;
  const wordsA = la.split(/\s+/);
  const wordsB = lb.split(/\s+/);
  if (wordsA.length === wordsB.length) score += 0.2;
  const significant = (w: string[]) => new Set(w.map((x) => x.replace(/[^a-z]/g, '')).filter((x) => x.length > 3));
  const sa = significant(wordsA);
  for (const w of significant(wordsB)) if (sa.has(w)) score += 0.5;
  if (Math.abs(a.length - b.length) <= 2) score += 0.15;
  return score;
}

function validIndex(index: unknown, count: number): number | null {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < count ? index : null;
}
