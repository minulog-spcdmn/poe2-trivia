// The room bot's host: one of a cast of made-up players (identities.ts)
// hosts a public room for a while, starts games for whoever joins, plays its
// own turns (brain.ts), and calls it a day after a game; a while later
// someone else opens a room. It drives the session as the host's own screens
// would, through dispatch, so every rule (and the handicap on the host's race
// answers) applies to it too.

import { engine, session } from '../lib/session.svelte';
import type { GameState, Question } from '../lib/game';
import { readStored, writeStored } from '../lib/storage';
import { answerDelay, knowChance, pickCategory, pickDelay, wrongPick, type Ask } from './brain';
import { breakLength, identityOf, nextName, shiftLength, type Identity } from './identities';

const TICK_MS = 200;
/** Everyone else gone mid-game this long (they may only be reloading): back to the lobby. */
const ALONE_MS = 40000;
/** The room not open (or lost) this long: the page reloads, reopening the saved room or a new one. */
const STUCK_MS = 60000;
/** Past the end of their time, people waiting or playing get this long before the host goes anyway. */
const OVERTIME_MS = 30 * 60000;

const log = (...args: unknown[]) => console.log('[bot]', ...args);
const between = (lo: number, hi: number) => Math.round(lo + Math.random() * (hi - lo));

/** Who is on (`on`, until `until`), or when the next one comes (`backAt`); `recent`: who came on lately. */
interface Shift {
  on: string | null;
  until: number;
  backAt: number;
  recent: string[];
}

function loadShift(): Shift | null {
  try {
    const s = JSON.parse(readStored('shift') ?? '') as Shift;
    if ((s.on === null || typeof s.on === 'string') && typeof s.until === 'number' && typeof s.backAt === 'number' && Array.isArray(s.recent)) return s;
  } catch {
    /* none yet */
  }
  return null;
}

const time = (at: number) => new Date(at).toTimeString().slice(0, 5);

interface Plan {
  key: string;
  at: number;
  run: () => void;
}

export class Bot {
  private shift: Shift = loadShift() ?? { on: null, until: 0, backAt: 0, recent: [] };
  private who: Identity | null = null;
  private plan: Plan | null = null;
  /** The question the bot has made up its mind about (it may have chosen to sit it out). */
  private planned = '';
  private lobbyKey = '';
  private startAt = 0;
  private overAt = 0;
  private aloneSince = 0;
  private notReadySince = Date.now();
  private configured = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  private get persona() {
    return this.who!.persona;
  }

  start() {
    if (this.shift.on) {
      this.who = identityOf(this.shift.on, engine.categories);
      session.resume();
      if (session.mode !== 'host') session.host(this.shift.on);
      log(`${this.shift.on} is back after a reload, on until ${time(this.shift.until)}`);
    } else if (this.shift.backAt > Date.now()) log(`nobody on until ${time(this.shift.backAt)}`);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Closes the room (the runner stopping): everyone is told, and nothing is saved to reopen. */
  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    session.leave();
  }

  /** What the runner prints now and then. */
  status() {
    const s = session.state;
    const on = this.shift.on;
    return {
      host: on,
      until: on ? time(this.shift.until) : null,
      backAt: on ? null : time(this.shift.backAt),
      code: session.code,
      status: session.status,
      phase: s?.phase ?? null,
      players: s?.players.map((p) => `${p.name}${p.connected ? '' : ' (away)'}: ${p.score}`) ?? [],
      spectators: s?.spectators?.length ?? 0,
    };
  }

  private save() {
    writeStored('shift', JSON.stringify(this.shift));
  }

  /** The next one comes on and opens a room. */
  private begin(now: number) {
    const name = nextName(this.shift.recent, Math.random);
    this.who = identityOf(name, engine.categories);
    this.shift = { on: name, until: now + shiftLength(Math.random), backAt: 0, recent: [...this.shift.recent, name].slice(-20) };
    this.save();
    this.configured = false;
    this.plan = null;
    this.notReadySince = now;
    log(`${name} comes on until ${time(this.shift.until)}`);
    session.host(name);
  }

  /** The one on calls it a day: the room closes, and someone else comes on after a break. */
  private end(now: number, why: string) {
    log(`${this.shift.on} leaves (${why})`);
    session.leave();
    this.who = null;
    this.plan = null;
    this.shift = { ...this.shift, on: null, backAt: now + breakLength(Math.random) };
    this.save();
    log(`nobody on until ${time(this.shift.backAt)}`);
  }

  private tick() {
    const now = Date.now();
    if (!this.shift.on) {
      this.notReadySince = now;
      if (now >= this.shift.backAt) this.begin(now);
      return;
    }
    const s = session.state;
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
    const anyone = humans.length + (s.spectators?.length ?? 0) > 0;
    const timeUp = now >= this.shift.until;
    if (timeUp && (!anyone || now >= this.shift.until + OVERTIME_MS)) return this.end(now, anyone ? 'out of time, even for the ones still here' : 'time is up');
    if (s.phase === 'lobby') this.lobby(s, humans.map((p) => p.id), now);
    else if (s.phase === 'over') this.over(now, anyone, timeUp);
    else this.inGame(s, now, humans.length > 0);
    const p = this.plan;
    if (p && now >= p.at) {
      this.plan = null;
      p.run();
    }
  }

  /** Public and open always; the host's own rules whenever they may change (between games). */
  private configure(s: GameState) {
    if (!s.settings.public || s.settings.locked) session.dispatch({ type: 'settings', settings: { public: true, locked: false } });
    if (this.configured || (s.phase !== 'lobby' && s.phase !== 'over')) return;
    const c = this.who!.prefs;
    session.dispatch({ type: 'settings', settings: { mode: c.mode, difficulty: c.difficulty, targetScore: c.target, timer: c.timer } });
    this.configured = true;
    log(`room ${session.code} open: ${c.mode}, ${c.difficulty}, to ${c.target}, ${c.timer} s`);
  }

  private lobby(s: GameState, humans: string[], now: number) {
    this.overAt = 0;
    this.aloneSince = 0;
    const key = [...humans].sort().join(',');
    if (key !== this.lobbyKey) {
      this.lobbyKey = key;
      // Waits a little for more to come, as a person would (each arrival or departure starts it over).
      this.startAt = now + between(10000, 25000);
      if (key) log(`waiting for more: ${humans.length} in the lobby`);
    }
    if (key && now >= this.startAt) {
      log(`starting with ${s.players.length} players`);
      this.lobbyKey = '';
      session.dispatch({ type: 'start' });
    }
  }

  private over(now: number, anyone: boolean, timeUp: boolean) {
    this.overAt ||= now + between(8000, 20000);
    if (now < this.overAt) return;
    this.overAt = 0;
    if (timeUp) return this.end(now, 'after the game');
    log(anyone ? 'playing again' : 'nobody left, back to the lobby');
    session.dispatch({ type: 'restart', play: anyone });
  }

  private inGame(s: GameState, now: number, anyone: boolean) {
    this.overAt = 0;
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
