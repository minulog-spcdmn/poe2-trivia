// The room bot's host: one of a cast of made-up players (identities.ts)
// hosts a public room while one is wanted (wanted.ts, from the open-room
// list it checks every minute or so), starts games for whoever joins, plays
// its own turns (brain.ts), and calls it a day after a game; someone else
// opens the next room. Alone in the lobby, it makes way for other rooms, and
// gives up (or tries other rules) after a while. It drives the session as
// the host's own screens would, through dispatch, so every rule (and the
// handicap on the host's race answers) applies to it too.

import type { GameState } from '../lib/game';
import { scanRooms, type RoomInfo } from '../lib/rooms';
import { engine, SAVE, session } from '../lib/session.svelte';
import { readStored, removeStored, writeStored } from '../lib/storage';
import { identityOf, lonelyLength, nextName, otherPrefs, shiftLength, type Identity, type Mode, type RoomPrefs } from './identities';
import { joinable, makesWay, wanted, type Role } from './wanted';
import { hostEyes, Player } from './player';

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

/** A host's rules, for the log (Delve has none to pick). */
const rulesText = (c: RoomPrefs) => (c.mode === 'delve' ? 'delve' : `${c.mode}, ${c.difficulty}, to ${c.target}, ${c.timer} s`);

/** The room takes on a host's rules (between games). */
const useRules = (c: RoomPrefs) => session.dispatch({ type: 'settings', settings: { mode: c.mode, difficulty: c.difficulty, targetScore: c.target, timer: c.timer } });

export class Bot {
  private shift: Shift = loadShift() ?? { on: null, until: 0, backAt: 0, recent: [] };
  private who: Identity | null = null;
  /** The one on, at the table (null while nobody is). */
  private player: Player | null = null;
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
   * run at once); `role`: when it opens (wanted.ts); `modes`: the game
   * modes its hosts may pick (the runner's --mode).
   */
  constructor(
    private readonly names: string[],
    private readonly role: Role,
    private readonly modes: readonly Mode[],
  ) {}


  start() {
    // Someone from another room's share (the number of rooms changed): this room starts afresh.
    if (this.shift.on && !this.names.includes(this.shift.on)) this.shift = { ...this.shift, on: null, backAt: 0 };
    if (this.shift.on) {
      this.who = identityOf(this.shift.on, engine.categories, this.modes, engine.items);
      this.player = new Player(this.who.persona, hostEyes);
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
    this.who = identityOf(name, engine.categories, this.modes, engine.items);
    this.player = new Player(this.who.persona, hostEyes);
    this.shift = { on: name, until: now + shiftLength(Math.random), backAt: 0, recent: [...this.shift.recent, name].slice(-20) };
    this.save();
    this.configured = false;
    this.retried = false;
    this.lonelySince = 0;
    this.wayChecks = 0;
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
    this.player = null;
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
    else this.inGame(now, humans.length > 0);
    // As things stand after the host's own moves just now (a start, a restart).
    if (session.state) this.player?.play(session.state);
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
    const other = this.retried ? null : otherPrefs(this.who!.prefs, Math.random, this.modes);
    if (other && Math.random() < RETRY_CHANCE) {
      this.retried = true;
      this.lonelySince = 0;
      useRules((this.who!.prefs = other));
      log(`nobody came, trying ${rulesText(other)}`);
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
    log(`room ${session.code} open: ${rulesText(c)}`);
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

  private inGame(now: number, anyone: boolean) {
    this.overAt = 0;
    this.lobbyKey = '';
    if (anyone) this.aloneSince = 0;
    else {
      this.aloneSince ||= now;
      if (now - this.aloneSince > ALONE_MS) {
        log('everyone left, back to the lobby');
        this.aloneSince = 0;
        this.player?.reset();
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
  }
}
