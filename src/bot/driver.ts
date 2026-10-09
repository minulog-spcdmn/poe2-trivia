// The room bot's host: one of a cast of made-up players (identities.ts)
// hosts a public room while one is wanted (wanted.ts, from the open-room
// list it checks every minute or so), starts games for whoever joins, plays
// its own turns (brain.ts), and calls it a day after a game; someone else
// opens the next room. Alone in the lobby, it makes way for other rooms, and
// gives up (or tries other rules) after a while. It drives the session as
// the host's own screens would, through dispatch, so every rule (and the
// handicap on the host's race answers) applies to it too.

import { activeRules, grayscaleFor, type GameState, type Question } from '../lib/game';
import { scanRooms, type RoomInfo } from '../lib/rooms';
import { engine, SAVE, session } from '../lib/session.svelte';
import { readStored, removeStored, writeStored } from '../lib/storage';
import { answerDelay, blasts, chooseAnswer, chooseCard, knowChance, pickDelay, revives, type Ask } from './brain';
import { blastProblem, isGroupRun, livesOf, reviveProblem } from '../lib/delve';
import { identityOf, lonelyLength, nextName, otherPrefs, shiftLength, type Identity, type RoomPrefs } from './identities';
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

/**
 * The room's save is kept in the tab's sessionStorage, which a page that
 * crashed doesn't get back (the runner opens a new tab); a copy kept here
 * puts it back, so the room reopens with its game.
 */
const SAVE_COPY = 'room-save';
let lastCopy: string | null = null;

function keepSaveCopy() {
  const save = readStored(SAVE, 'session');
  if (save === lastCopy) return;
  lastCopy = save;
  if (save) writeStored(SAVE_COPY, save);
  else removeStored(SAVE_COPY);
}

function restoreSave() {
  const copy = readStored(SAVE_COPY);
  if (copy && !readStored(SAVE, 'session')) writeStored(SAVE, copy, 'session');
}

/** The room takes on a host's rules (between games). */
const useRules = (c: RoomPrefs) => session.dispatch({ type: 'settings', settings: { mode: c.mode, difficulty: c.difficulty, targetScore: c.target, timer: c.timer } });

/** Something the bot is about to do, at `at`. */
interface Plan {
  at: number;
  run: () => void;
}

export class Bot {
  private shift: Shift = loadShift() ?? { on: null, until: 0, backAt: 0, recent: [] };
  private who: Identity | null = null;
  /** What it is about to do, by what for (a pick, an answer, a life to give…). */
  private plans = new Map<string, Plan>();
  /** What it has made up its mind about (it may have chosen not to act). */
  private decided = new Set<string>();
  /** The game they are for (its startedAt): a new game starts them afresh. */
  private game = 0;
  private lobbyKey = '';
  private startAt = 0;
  private overAt = 0;
  private aloneSince = 0;
  private notReadySince = Date.now();
  private configured = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scoutTimer: ReturnType<typeof setTimeout> | null = null;
  private copyTimer: ReturnType<typeof setInterval> | null = null;
  /** The other bot room's code, when two run (the runner says): the first never makes way for it. */
  private sibling = '';
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
      restoreSave();
      session.resume();
      if (session.mode !== 'host') session.host(this.shift.on);
      log(`${this.shift.on} is back after a reload, on until ${time(this.shift.until)}`);
    }
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.copyTimer = setInterval(keepSaveCopy, 1000);
    void this.scout();
  }

  /** The runner, when two rooms run: the other one's code ('' while it has none). */
  setSibling(code: string) {
    this.sibling = code;
  }

  /**
   * Closes the room (the runner stopping): everyone is told, and nothing is
   * saved to reopen. Nobody stays on either, so the next run opens a room
   * only once one is wanted (rather than straight away, as after a reload).
   */
  close() {
    if (this.timer) clearInterval(this.timer);
    if (this.copyTimer) clearInterval(this.copyTimer);
    if (this.scoutTimer) clearTimeout(this.scoutTimer);
    this.timer = this.copyTimer = this.scoutTimer = null;
    removeStored(SAVE_COPY);
    if (this.shift.on) {
      this.shift = { ...this.shift, on: null, backAt: 0 };
      this.save();
    }
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
      // Both bot rooms waiting empty: only the second makes way, never the first for it.
      const rivals = this.role === 'first' ? others.filter((r) => r.code !== this.sibling) : others;
      this.wayChecks = makesWay(rivals) ? this.wayChecks + 1 : 0;
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
    this.plans.clear();
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
    this.plans.clear();
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
    if ((s.startedAt ?? 0) !== this.game) {
      this.game = s.startedAt ?? 0;
      this.plans.clear();
      this.decided.clear();
    }
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
    for (const [key, p] of this.plans)
      if (now >= p.at) {
        this.plans.delete(key);
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
      useRules(c);
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
    useRules(c);
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
        this.plans.clear();
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
    if (s.delve) this.delve(s, now);
    else if (s.settings.mode === 'race') this.race(s, now);
    else this.turns(s, now);
  }

  private turns(s: GameState, now: number) {
    if (s.players[s.turn]?.id !== session.myPlayerId) return;
    if (s.phase === 'choosing') this.planCard(s, now, 'pick');
    else if (s.phase === 'question' && s.question) this.planAnswer(s, s.question, now);
  }

  /**
   * Delve: alone, its own turns; together, a vote for each card, an answer
   * to each question while standing, and a life for a teammate who perished.
   * Flares burn by themselves (as everyone's do); dynamite it detonates
   * itself, on questions it isn't sure of (planAnswer).
   */
  private delve(s: GameState, now: number) {
    const me = session.myPlayerId!;
    const together = isGroupRun(s);
    if (together) this.planRevive(s, now);
    if (livesOf(s, me) <= 0) return;
    if (s.phase === 'choosing') {
      if (!together) {
        if (s.players[s.turn]?.id === me) this.planCard(s, now, 'pick');
      } else if (!s.delve?.votes?.[me]) this.planCard(s, now, 'vote');
    } else if (s.phase === 'question' && s.question) {
      const q = s.question;
      // The clock starts once the art has reached everyone answering.
      if (q.deadline === null) return;
      if (together ? q.struck?.some((x) => x.by === me) : s.players[s.turn]?.id !== me) return;
      this.planAnswer(s, q, now);
    }
  }

  /** Picks a card on its turn, or votes for one (Delve together). */
  private planCard(s: GameState, now: number, type: 'pick' | 'vote') {
    const key = `${type}:${s.round}:${s.turnCount}`;
    if (this.decided.has(key)) return;
    this.decided.add(key);
    const offered = [...s.offered];
    const finds = (s.delve?.finds ?? []).map((f) => f.category);
    this.plans.set(key, {
      at: now + pickDelay(this.persona, Math.random),
      run: () => {
        const cur = session.state;
        if (cur?.phase !== 'choosing' || cur.turnCount !== s.turnCount || cur.round !== s.round) return;
        if (type === 'vote' && cur.delve?.votes?.[session.myPlayerId!]) return;
        const category = chooseCard(this.persona, offered, finds, Math.random);
        log(type === 'pick' ? 'picks' : 'votes for', category);
        session.dispatch(type === 'pick' ? { type: 'pick', category } : { type: 'vote', category });
      },
    });
  }

  /** Delve together: gives a teammate who perished one of its lives, if it is that kind of player (once a depth each). */
  private planRevive(s: GameState, now: number) {
    const me = session.myPlayerId!;
    for (const p of s.players) {
      if (p.id === me || reviveProblem(s, me, p.id)) continue;
      const key = `revive:${p.id}:${s.round}`;
      if (this.decided.has(key)) continue;
      this.decided.add(key);
      if (!revives(this.persona, Math.random)) continue;
      this.plans.set(key, {
        at: now + between(1500, 5000) * this.persona.pace,
        run: () => {
          const cur = session.state;
          if (!cur || reviveProblem(cur, me, p.id)) return;
          log('gives a life to', p.name);
          session.dispatch({ type: 'revive', target: p.id });
        },
      });
    }
  }

  private race(s: GameState, now: number) {
    const q = s.question;
    if (s.phase !== 'question' || !q || q.misses.some((m) => m.playerId === session.myPlayerId)) return;
    this.planAnswer(s, q, now);
  }

  /**
   * Decides once per question whether it knows, when to answer and what (in
   * Delve, maybe to detonate dynamite instead). Its time counts from the
   * clock's start; an answer the clock beats isn't given.
   */
  private planAnswer(s: GameState, q: Question, now: number) {
    const key = `answer:${q.askedAt}`;
    if (this.decided.has(key)) return;
    this.decided.add(key);
    const me = session.myPlayerId!;
    const rules = activeRules(s);
    const gray = grayscaleFor(s);
    const start = q.clockAt ?? q.askedAt;
    const ask: Ask = {
      rules,
      category: q.category,
      veil: q.veil ? (rules.veil?.share ?? 0.5) : 0,
      gray: gray === 'all' || (gray === 'art' && q.mode === 'art'),
      mirrored: !!q.mirrored?.some(Boolean),
      clock: q.deadline ? (q.deadline - start) / 1000 : 0,
      mode: s.delve ? 'delve' : s.settings.mode === 'race' ? 'race' : 'turns',
    };
    const knows = Math.random() < knowChance(this.persona, ask);
    const delay = answerDelay(this.persona, ask, knows, Math.random);
    if (delay === null) {
      log(`lets "${q.category}" go by`);
      return;
    }
    // Picked up after a reload: not all at once.
    const at = Math.max(now + 800, start + delay);
    const open = () => {
      const cur = session.state;
      const o = cur?.question;
      return cur?.phase === 'question' && o?.askedAt === q.askedAt && (!o.deadline || Date.now() <= o.deadline) ? o : null;
    };
    if (ask.mode === 'delve' && !knows && !blastProblem(s, me) && blasts(this.persona, Math.random)) {
      // Not sure, and dynamite at hand: blast it away for another (deciding so is quicker than answering).
      this.plans.set(key, {
        at: Math.max(now + 800, start + delay * 0.6),
        run: () => {
          if (!open() || blastProblem(session.state!, me)) return;
          log('detonates dynamite');
          session.dispatch({ type: 'blast', askedAt: q.askedAt });
        },
      });
      return;
    }
    this.plans.set(key, {
      at,
      run: () => {
        const o = open();
        if (!o) return;
        const correct = o.options.indexOf(o.itemId);
        const names = o.options.map((id, i) => o.labels[i] ?? engine.byId.get(id)?.name ?? '');
        // Options already shown wrong (others' guesses in a race, the team's in Delve) are out.
        const ruledOut = [...o.misses.map((m) => m.index), ...(o.struck ?? []).map((x) => x.index)];
        const index = chooseAnswer(names, correct, knows, ask, ruledOut, Math.random);
        log(`answers ${index === correct ? 'right' : 'wrong'} after ${((Date.now() - start) / 1000).toFixed(1)} s`);
        session.dispatch({ type: 'answer', index, askedAt: q.askedAt });
      },
    });
  }
}
