// The room bot's host: keeps a public room open, starts games for whoever
// joins, plays its own turns (brain.ts) and tidies up after games. It drives
// the session as the host's own screens would, through dispatch, so every
// rule (and the handicap on the host's race answers) applies to it too.

import { engine, session } from '../lib/session.svelte';
import { isDifficulty, snapTimer, type Difficulty, type GameMode, type GameState, type Question } from '../lib/game';
import { cleanName } from '../lib/names';
import { readStored, writeStored } from '../lib/storage';
import { answerDelay, knowChance, makePersona, pickCategory, pickDelay, wrongPick, type Ask, type Persona } from './brain';

export interface BotConfig {
  name: string;
  mode: Extract<GameMode, 'turns' | 'race'>;
  difficulty: Difficulty;
  target: number;
  /** Seconds per question (never 0: a room nobody can stall). */
  timer: number;
}

export const DEFAULT_CONFIG: BotConfig = { name: 'Exile Bot', mode: 'turns', difficulty: 'cruel', target: 10, timer: 32 };

/** The config from the page's address (?name=&mode=&difficulty=&target=&timer=), anything off falling back to the default. */
export function configFrom(search: string): BotConfig {
  const q = new URLSearchParams(search);
  const c = { ...DEFAULT_CONFIG };
  const name = cleanName(q.get('name') ?? '');
  if (name) c.name = name;
  const mode = q.get('mode');
  if (mode === 'turns' || mode === 'race') c.mode = mode;
  const difficulty = q.get('difficulty');
  // Custom has knobs of its own to set, which the bot doesn't.
  if (isDifficulty(difficulty) && difficulty !== 'custom') c.difficulty = difficulty;
  const target = Number(q.get('target'));
  if (Number.isInteger(target) && target >= 1 && target <= 50) c.target = target;
  const timer = snapTimer(Number(q.get('timer')));
  if (timer > 0) c.timer = timer;
  return c;
}

const TICK_MS = 200;
/** A game starts this long after the last change to who is waiting in the lobby. */
const LOBBY_WAIT_MS = 15000;
/** After a game, the scores stay up this long before the next one starts. */
const OVER_WAIT_MS = 12000;
/** Everyone else gone mid-game this long (they may only be reloading): back to the lobby. */
const ALONE_MS = 40000;
/** The room not open (or lost) this long: the page reloads, reopening the saved room or a new one. */
const STUCK_MS = 60000;

const log = (...args: unknown[]) => console.log('[bot]', ...args);

/** The persona this bot was given the first time, so a reload doesn't make it someone else. */
function loadPersona(): Persona {
  try {
    const p = JSON.parse(readStored('persona') ?? '') as Persona;
    if (typeof p.skill === 'number' && typeof p.pace === 'number' && engine.categories.every((c) => typeof p.affinity?.[c] === 'number')) return p;
  } catch {
    /* none yet, or from an older build */
  }
  const p = makePersona(engine.categories, Math.random);
  writeStored('persona', JSON.stringify(p));
  return p;
}

interface Plan {
  key: string;
  at: number;
  run: () => void;
}

export class Bot {
  private persona = loadPersona();
  private plan: Plan | null = null;
  /** The question the bot has made up its mind about (it may have chosen to sit it out). */
  private planned = '';
  private lobbyKey = '';
  private startAt = 0;
  private overSince = 0;
  private aloneSince = 0;
  private notReadySince = Date.now();
  private configured = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(readonly config: BotConfig) {}

  start() {
    session.resume();
    if (session.mode !== 'host') session.host(this.config.name);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    log('persona', JSON.stringify(this.persona));
  }

  /** Closes the room for good (the runner stopping): everyone is told, and nothing is saved to reopen. */
  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    session.leave();
  }

  /** What the runner prints now and then. */
  status() {
    const s = session.state;
    return {
      code: session.code,
      status: session.status,
      phase: s?.phase ?? null,
      players: s?.players.map((p) => `${p.name}${p.connected ? '' : ' (away)'}: ${p.score}`) ?? [],
      spectators: s?.spectators?.length ?? 0,
    };
  }

  private tick() {
    const s = session.state;
    const now = Date.now();
    if (session.mode !== 'host' || session.status !== 'ready' || !s) {
      if (now - this.notReadySince > STUCK_MS) {
        log('room not open for a minute, reloading');
        location.reload();
      }
      return;
    }
    this.notReadySince = now;
    this.configure(s);
    const me = session.myPlayerId;
    const humans = s.players.filter((p) => p.id !== me && p.connected);
    const watching = s.spectators?.length ?? 0;
    if (s.phase === 'lobby') this.lobby(s, humans.map((p) => p.id));
    else if (s.phase === 'over') this.over(now, humans.length + watching > 0);
    else this.inGame(s, now, humans.length > 0);
    const p = this.plan;
    if (p && now >= p.at) {
      this.plan = null;
      p.run();
    }
  }

  /** Public and open always; the rules whenever they may change (between games). */
  private configure(s: GameState) {
    if (!s.settings.public || s.settings.locked) session.dispatch({ type: 'settings', settings: { public: true, locked: false } });
    if (this.configured || (s.phase !== 'lobby' && s.phase !== 'over')) return;
    const c = this.config;
    session.dispatch({ type: 'settings', settings: { mode: c.mode, difficulty: c.difficulty, targetScore: c.target, timer: c.timer } });
    this.configured = true;
    log(`room ${session.code} open: ${c.mode}, ${c.difficulty}, to ${c.target}, ${c.timer} s`);
  }

  private lobby(s: GameState, humans: string[]) {
    this.overSince = 0;
    this.aloneSince = 0;
    const key = [...humans].sort().join(',');
    if (key !== this.lobbyKey) {
      this.lobbyKey = key;
      this.startAt = Date.now() + LOBBY_WAIT_MS;
      if (key) log(`waiting for more: ${humans.length} in the lobby`);
    }
    if (key && Date.now() >= this.startAt) {
      log(`starting with ${s.players.length} players`);
      this.lobbyKey = '';
      session.dispatch({ type: 'start' });
    }
  }

  private over(now: number, anyone: boolean) {
    this.overSince ||= now;
    if (now - this.overSince < OVER_WAIT_MS) return;
    this.overSince = 0;
    log(anyone ? 'playing again' : 'nobody left, back to the lobby');
    session.dispatch({ type: 'restart', play: anyone });
  }

  private inGame(s: GameState, now: number, anyone: boolean) {
    this.overSince = 0;
    this.lobbyKey = '';
    if (anyone) this.aloneSince = 0;
    else {
      this.aloneSince ||= now;
      if (now - this.aloneSince > ALONE_MS) {
        log('everyone left, back to the lobby');
        this.aloneSince = 0;
        this.plan = null;
        session.dispatch({ type: 'restart' });
        return;
      }
    }
    // A connected player sitting on their turn: the host may skip it.
    if (session.idle) {
      log('skipping an idle turn');
      session.dispatch({ type: 'skip' });
      return;
    }
    if (s.settings.mode === 'race') this.race(s, now);
    else this.turns(s, now);
  }

  private turns(s: GameState, now: number) {
    const me = session.myPlayerId;
    if (s.players[s.turn]?.id !== me) return;
    if (s.phase === 'choosing') {
      const key = `pick:${s.turnCount}`;
      if (this.plan?.key === key) return;
      const offered = [...s.offered];
      this.plan = {
        key,
        at: now + pickDelay(this.persona, Math.random),
        run: () => {
          const cur = session.state;
          if (cur?.phase !== 'choosing' || cur.turnCount !== s.turnCount) return;
          const category = pickCategory(this.persona, offered, Math.random);
          log('picks', category);
          session.dispatch({ type: 'pick', category });
        },
      };
    } else if (s.phase === 'question' && s.question) this.planAnswer(s, s.question, now);
  }

  private race(s: GameState, now: number) {
    const q = s.question;
    if (s.phase !== 'question' || !q || q.misses.some((m) => m.playerId === session.myPlayerId)) return;
    this.planAnswer(s, q, now);
  }

  /** Decides once per question whether it knows, when to answer and what. */
  private planAnswer(s: GameState, q: Question, now: number) {
    const key = `answer:${q.askedAt}`;
    if (this.planned === key) return;
    this.planned = key;
    const ask: Ask = {
      difficulty: s.settings.difficulty,
      harder: !!s.deathmatch,
      category: q.category,
      veiled: !!q.veil,
      clock: q.deadline ? (q.deadline - q.askedAt) / 1000 : 0,
      race: s.settings.mode === 'race',
    };
    const knows = Math.random() < knowChance(this.persona, ask);
    const delay = answerDelay(this.persona, ask, knows, Math.random);
    if (delay === null) {
      log(`lets "${q.category}" go by`);
      return;
    }
    this.plan = {
      key,
      // Picked up after a reload: not all at once.
      at: Math.max(now + 800, q.askedAt + delay),
      run: () => {
        const cur = session.state;
        const open = cur?.question;
        if (cur?.phase !== 'question' || open?.askedAt !== q.askedAt) return;
        const correct = open.options.indexOf(open.itemId);
        const names = open.options.map((id, i) => open.labels[i] ?? engine.byId.get(id)?.name ?? '');
        // In a race everyone sees who guessed what, so those options are out.
        const ruledOut = open.misses.map((m) => m.index);
        const index = knows ? correct : (wrongPick(names, correct, ruledOut, Math.random) ?? correct);
        log(`answers ${index === correct ? 'right' : 'wrong'} after ${((Date.now() - q.askedAt) / 1000).toFixed(1)} s`);
        session.dispatch({ type: 'answer', index, askedAt: q.askedAt });
      },
    };
  }
}
