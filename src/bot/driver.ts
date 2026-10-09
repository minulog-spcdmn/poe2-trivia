// The room bot's host: one of a cast of made-up players (identities.ts)
// hosts a public room while one is wanted (wanted.ts, from the open-room
// list it checks every minute or so), starts games for whoever joins, plays
// its own turns (brain.ts), and calls it a day after a game; someone else
// opens the next room. Alone in the lobby, it makes way for other rooms, and
// gives up (or tries other rules) after a while. It drives the session as
// the host's own screens would, through dispatch, so every rule (and the
// handicap on the host's race answers) applies to it too.

import { engine, session } from '../lib/session.svelte';
import type { GameState, Question } from '../lib/game';
import { scanRooms, type RoomInfo } from '../lib/rooms';
import { readStored, writeStored } from '../lib/storage';
import { answerDelay, knowChance, pickCategory, pickDelay, wrongPick, type Ask } from './brain';
import { identityOf, lonelyLength, nextName, otherPrefs, shiftLength, type Identity } from './identities';
import { joinable, makesWay, wanted, type Role } from './wanted';

const TICK_MS = 200;
/** Everyone else gone mid-game this long (they may only be reloading): back to the lobby. */
const ALONE_MS = 40000;
/** The room not open (or lost) this long: the page reloads, reopening the saved room or a new one. */
const STUCK_MS = 60000;
/** Past the end of their time, people waiting or playing get this long before the host goes anyway. */
const OVERTIME_MS = 30 * 60000;
/**
 * The open-room list is checked this often (ms, from..to): often while this
 * room is closed, so a room wanted opens soon; at leisure while it's open.
 */
const SCOUT_CLOSED: [number, number] = [15000, 25000];
const SCOUT_OPEN: [number, number] = [40000, 75000];
/**
 * Checks in a row that must find a room wanted before one opens: the second
 * room waits one more, so the first one's room shows in the list before it
 * would open as well.
 */
const WANTED_CHECKS: Record<Role, number> = { first: 1, second: 2 };
/** A host leaving a room that is still wanted hands over: the next one opens a room this soon after. */
const HAND_OVER_MS = 2000;
/** Checks in a row that must find another room to join before an empty lobby makes way. */
const MAKE_WAY_CHECKS = 2;
/** An empty lobby stays open at least this long before it makes way. */
const MIN_OPEN_MS = 60000;
/** Chance that a host nobody joined tries other rules once, instead of leaving. */
const RETRY_CHANCE = 0.35;

const log = (...args: unknown[]) => console.log('[bot]', ...args);
const between = (lo: number, hi: number) => Math.round(lo + Math.random() * (hi - lo));

/** Who is on (`on`, until `until`), or the earliest the next one comes (`backAt`); `recent`: who came on lately. */
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
  private scoutTimer: ReturnType<typeof setTimeout> | null = null;
  /** Checks in a row that found a room wanted (while nobody is on). */
  private wantedChecks = 0;
  /** Checks in a row that found another room to join (while this one is on). */
  private wayChecks = 0;
  /** What the last check found, for the status. */
  private seen: { rooms: number; joinable: number; at: number } | null = null;
  /** Since when the lobby has been empty but for the host (0: it isn't), and how long they'll stand it. */
  private lonelySince = 0;
  private lonelyFor = 0;
  /** The one on has already tried other rules once. */
  private retried = false;

  /**
   * `names`: whom this room draws its hosts from (its share when two rooms
   * run at once); `role`: when it opens (wanted.ts).
   */
  constructor(
    private readonly names: string[],
    private readonly role: Role,
  ) {}

  private get persona() {
    return this.who!.persona;
  }

  start() {
    // Someone from another room's share (the number of rooms changed): this room starts afresh.
    if (this.shift.on && !this.names.includes(this.shift.on)) this.shift = { ...this.shift, on: null, backAt: 0 };
    if (this.shift.on) {
      this.who = identityOf(this.shift.on, engine.categories);
      session.resume();
      if (session.mode !== 'host') session.host(this.shift.on);
      log(`${this.shift.on} is back after a reload, on until ${time(this.shift.until)}`);
    }
    this.timer = setInterval(() => this.tick(), TICK_MS);
    void this.scout();
  }

  /** Closes the room (the runner stopping): everyone is told, and nothing is saved to reopen. */
  close() {
    if (this.timer) clearInterval(this.timer);
    if (this.scoutTimer) clearTimeout(this.scoutTimer);
    this.timer = this.scoutTimer = null;
    session.leave();
  }

  /** Checks the open-room list (as the start page does), then again in a minute or so. */
  private async scout() {
    const rooms: RoomInfo[] = [];
    const was = this.shift.on;
    try {
      await scanRooms((r) => rooms.push(r), () => !this.timer);
    } catch {
      // The matchmaking server can't be reached: no news, so nothing changes.
      this.scoutAgain();
      return;
    }
    if (!this.timer) return;
    // Someone came or went while it ran (a hand-over): what it saw is out of date.
    if (this.shift.on !== was) return this.scoutAgain();
    const mine = this.shift.on ? session.code : '';
    const others = rooms.filter((r) => r.code !== mine);
    this.seen = { rooms: others.length, joinable: others.filter(joinable).length, at: Date.now() };
    if (this.shift.on) {
      this.wantedChecks = 0;
      this.wayChecks = makesWay(others) ? this.wayChecks + 1 : 0;
    } else {
      this.wayChecks = 0;
      this.wantedChecks = wanted(this.role, others) ? this.wantedChecks + 1 : 0;
      if (this.wantedChecks === 1) log(`no ${this.role === 'first' ? 'room' : 'room to join'} listed (${others.length} listed)`);
    }
    this.scoutAgain();
  }

  private scoutAgain() {
    if (!this.timer) return;
    if (this.scoutTimer) clearTimeout(this.scoutTimer);
    this.scoutTimer = setTimeout(() => void this.scout(), between(...(this.shift.on ? SCOUT_OPEN : SCOUT_CLOSED)));
  }

  /** What the runner prints now and then. */
  status() {
    const s = session.state;
    const on = this.shift.on;
    return {
      role: this.role,
      host: on,
      until: on ? time(this.shift.until) : null,
      listed: this.seen ? `${this.seen.rooms} other rooms, ${this.seen.joinable} to join (${time(this.seen.at)})` : 'not checked yet',
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
    const name = nextName(this.shift.recent, Math.random, this.names);
    this.who = identityOf(name, engine.categories);
    this.shift = { on: name, until: now + shiftLength(Math.random), backAt: 0, recent: [...this.shift.recent, name].slice(-20) };
    this.save();
    this.configured = false;
    this.retried = false;
    this.lonelySince = 0;
    this.wayChecks = 0;
    this.plan = null;
    this.notReadySince = now;
    log(`${name} comes on until ${time(this.shift.until)}`);
    session.host(name);
  }

  /**
   * The one on calls it a day and the room closes. Unless it made way for
   * another room, a room is still wanted, so the next one hands over: they
   * open a new room at once (a check meanwhile finding a room stops them).
   */
  private end(now: number, why: string, madeWay = false) {
    log(`${this.shift.on} leaves (${why})`);
    session.leave();
    this.who = null;
    this.plan = null;
    this.shift = { ...this.shift, on: null, backAt: now + HAND_OVER_MS };
    this.save();
    this.wantedChecks = madeWay ? 0 : WANTED_CHECKS[this.role];
    // Closed now: the list is checked often again.
    this.scoutAgain();
  }

  private tick() {
    const now = Date.now();
    if (!this.shift.on) {
      this.notReadySince = now;
      if (now >= this.shift.backAt && this.wantedChecks >= WANTED_CHECKS[this.role]) this.begin(now);
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
    if (s.phase === 'lobby' && !anyone && this.lonely(now)) return;
    if (s.phase !== 'lobby' || anyone) this.lonelySince = 0;
    if (s.phase === 'lobby') this.lobby(s, humans.map((p) => p.id), now);
    else if (s.phase === 'over') this.over(now, anyone, timeUp);
    else this.inGame(s, now, humans.length > 0);
    const p = this.plan;
    if (p && now >= p.at) {
      this.plan = null;
      p.run();
    }
  }

  /**
   * The host alone in the lobby: makes way for another room to join, and
   * after a while alone tries other rules (once) or leaves. True when the
   * room just closed.
   */
  private lonely(now: number): boolean {
    if (!this.lonelySince) {
      this.lonelySince = now;
      this.lonelyFor = lonelyLength(Math.random);
    }
    const alone = now - this.lonelySince;
    if (alone >= MIN_OPEN_MS && this.wayChecks >= MAKE_WAY_CHECKS) {
      this.end(now, 'another room is open', true);
      return true;
    }
    if (alone < this.lonelyFor) return false;
    if (!this.retried && Math.random() < RETRY_CHANCE) {
      this.retried = true;
      this.lonelySince = 0;
      const c = (this.who!.prefs = otherPrefs(this.who!.prefs, Math.random));
      session.dispatch({ type: 'settings', settings: { mode: c.mode, difficulty: c.difficulty, targetScore: c.target, timer: c.timer } });
      log(`nobody came, trying ${c.mode}, ${c.difficulty}, to ${c.target}, ${c.timer} s`);
      return false;
    }
    this.end(now, 'nobody came');
    return true;
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
