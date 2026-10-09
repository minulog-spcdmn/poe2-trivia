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
import { fiddled, identityOf, lonelyLength, nextName, otherPrefs, shiftLength, type Identity, type Mode, type RoomPrefs } from './identities';
import { joinable, makesWay, wanted, type Role } from './wanted';
import { hostEyes, moodOf, Player } from './player';
import { HOST_ODDS, staysOn } from './brain';
import { between, log, playersLine, time } from './util';

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
/** A list checked this recently is trusted for a hand-over; an older one waits for a fresh check. */
const FRESH_LIST_MS = 30000;
/** Checks in a row that must find another room to join before an empty lobby makes way. */
const MAKE_WAY_CHECKS = 2;
/** An empty lobby stays open at least this long before it makes way. */
const MIN_OPEN_MS = 60000;
/** The chance a host fiddles with the rules once someone has joined its lobby. */
const FIDDLE_CHANCE = 0.3;
/** Chance that a host nobody joined tries other rules once, instead of leaving. */
const RETRY_CHANCE = 0.35;


/**
 * Who is on (`on`, until `until`), or the earliest the next one comes
 * (`backAt`); `recent`: who came on lately; `prefs`, `retried`: the rules
 * the one on hosts with now (changed from their own, maybe) and whether
 * they already tried others, so a reload keeps both.
 */
interface Shift {
  on: string | null;
  until: number;
  backAt: number;
  recent: string[];
  prefs?: RoomPrefs;
  retried?: boolean;
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

/**
 * The room's save is kept in the tab's sessionStorage, which a page that
 * crashed doesn't get back (the runner opens a new tab); a copy kept here
 * puts it back, so the room reopens with its game.
 */
const SAVE_COPY = 'room-save';
/** What the copy holds now (undefined: not looked at yet, so the first look sets it either way). */
let lastCopy: string | null | undefined;

function keepSaveCopy() {
  const save = readStored(SAVE, 'session');
  if (save === lastCopy) return;
  lastCopy = save;
  if (save) writeStored(SAVE_COPY, save);
  else removeStored(SAVE_COPY);
}

/** Lets go of the room's save and its copy (the room is gone, or can't be got back). */
function dropSave() {
  removeStored(SAVE, 'session');
  removeStored(SAVE_COPY);
  lastCopy = undefined;
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
  /** The other rooms the last check found (null before the first). */
  private lastOthers: RoomInfo[] | null = null;
  /** Since when the lobby has been empty but for the host (0: it isn't), and how long they'll stand it. */
  private lonelySince = 0;
  private lonelyFor = 0;
  /** The one on has already tried other rules once. */
  private retried = false;
  /** Lost heavily, and leaves once the scores have been up a while. */
  private sulking = false;
  /** Whether (and when) the host fiddles with the rules in this lobby, once someone is there. */
  private fiddle: { at: number } | null = null;

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
    // Nobody on: no room to get back, whatever a copy left behind says.
    if (!this.shift.on) dropSave();
    if (this.shift.on) {
      this.who = identityOf(this.shift.on, engine.categories, this.modes, engine.items);
      // The rules they host with now, and whether they tried others, as they were before the reload.
      if (this.shift.prefs) this.who.prefs = this.shift.prefs;
      this.retried = !!this.shift.retried;
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
    dropSave();
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
    this.lastOthers = others;
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
      players: playersLine(s),
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
    this.shift = { on: name, until: now + shiftLength(Math.random), backAt: 0, recent: [...this.shift.recent, name].slice(-20), prefs: this.who.prefs };
    this.save();
    this.configured = false;
    this.retried = false;
    this.sulking = false;
    this.lonelySince = 0;
    this.wayChecks = 0;
    this.notReadySince = now;
    log(`${name} comes on until ${time(this.shift.until)}`);
    session.host(name);
  }

  /**
   * The one on calls it a day and the room closes. If the latest list still
   * calls for this room (wanted.ts, its own left out), the next one hands
   * over and opens a new room at once; otherwise (it made way, or a player's
   * room is up meanwhile) they wait for a check that calls for one. Either
   * way the list is checked again straight away.
   */
  private end(now: number, why: string, madeWay = false) {
    log(`${this.shift.on} leaves (${why})`);
    session.leave();
    dropSave();
    this.who = null;
    this.player = null;
    this.shift = { ...this.shift, on: null, backAt: now + HAND_OVER_MS, prefs: undefined, retried: undefined };
    this.save();
    // A list older than that may have missed a room opened meanwhile: then the fresh check decides (5 to 10 s).
    const recent = !!this.seen && now - this.seen.at < FRESH_LIST_MS;
    this.wantedChecks = !madeWay && recent && this.lastOthers && wanted(this.role, this.lastOthers) ? WANTED_CHECKS[this.role] : 0;
    if (this.scoutTimer) clearTimeout(this.scoutTimer);
    this.scoutTimer = setTimeout(() => void this.scout(), 0);
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
        // A saved room that won't reopen would only be tried again: let it go, and open a fresh one.
        log('room not open for a minute, reloading with a fresh one');
        dropSave();
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
    else if (s.phase === 'over') this.over(s, now, anyone, timeUp);
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
      this.shift = { ...this.shift, prefs: other, retried: true };
      this.save();
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
    // Company at last: now and then the host fiddles with the rules before it starts, as people do.
    if (!key) this.fiddle = null;
    else if (!this.fiddle) this.fiddle = { at: Math.random() < FIDDLE_CHANCE && this.who!.prefs.mode !== 'delve' ? now + between(3000, 8000) : 0 };
    if (this.fiddle?.at && now >= this.fiddle.at) {
      this.fiddle.at = 0;
      const c = (this.who!.prefs = fiddled(this.who!.prefs, Math.random));
      useRules(c);
      this.shift = { ...this.shift, prefs: c };
      this.save();
      log(`changes the rules to ${rulesText(c)}`);
      this.startAt = Math.max(this.startAt, now + between(3000, 7000));
    }
    if (key && now >= this.startAt) {
      log(`starting with ${s.players.length} players`);
      this.lobbyKey = '';
      session.dispatch({ type: 'start' });
    }
  }

  /**
   * After a game: a host who won now and then stays on a while longer; one
   * who lost heavily now and then calls it a day (handing over, if a room is
   * still wanted). Then, once the scores have been up a while, again or back
   * to the lobby.
   */
  private over(s: GameState, now: number, anyone: boolean, timeUp: boolean) {
    if (!this.overAt) {
      this.overAt = now + between(8000, 20000);
      const after = staysOn(moodOf(s, session.myPlayerId!), Math.random, HOST_ODDS);
      this.sulking = after === 'leave';
      if (after === 'longer') {
        this.shift = { ...this.shift, until: Math.max(this.shift.until, now) + between(10, 25) * 60000 };
        this.save();
        log(`won, stays on until ${time(this.shift.until)}`);
      }
    }
    if (now < this.overAt) return;
    this.overAt = 0;
    if (this.sulking) return this.end(now, 'lost heavily, calls it a day');
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
