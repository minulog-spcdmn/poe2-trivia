// The room bot's host: someone at a seat (seat.ts) who opened a public room
// while one was wanted (wanted.ts). They start games for whoever joins, play
// their own turns (brain.ts), and call it a day after a game. Alone in the
// lobby, they make way for other rooms, and give up (or try other rules)
// after a while. They drive the session as the host's own screens would,
// through dispatch, so every rule (and the handicap on the host's race
// answers) applies to them too. Who hosts, and what they do once the room
// closes, is the seat's to say.

import type { GameState } from '../lib/game';
import { joinable, makesWay, type Role } from './wanted';
import type { RoomInfo } from '../lib/rooms';
import { SAVE, session } from '../lib/session.svelte';
import { readStored, removeStored, writeStored } from '../lib/storage';
import { fiddled, lonelyLength, otherPrefs, type Identity, type Mode, type RoomPrefs } from './identities';
import { hostEyes, moodOf, Player } from './player';
import { HOST_ODDS, staysOn } from './brain';
import type { HostExit } from './choice';
import { between, log, playersLine, time } from './util';

/** Everyone else gone mid-game this long (they may only be reloading): back to the lobby. */
const ALONE_MS = 40000;
/** The room not open (or lost) this long: the page reloads, reopening the saved room or a new one. */
const STUCK_MS = 60000;
/** Past the end of their time, people waiting or playing get this long before the host goes anyway. */
const OVERTIME_MS = 30 * 60000;
/** Lists in a row that must show another room to join before an empty lobby makes way. */
const MAKE_WAY_CHECKS = 2;
/** An empty lobby stays open at least this long before it makes way. */
const MIN_OPEN_MS = 60000;
/** The chance a host fiddles with the rules once someone has joined its lobby. */
const FIDDLE_CHANCE = 0.3;
/** Chance that a host nobody joined tries other rules once, instead of leaving. */
const RETRY_CHANCE = 0.35;

/**
 * A hosting stint, kept by the seat so a reload picks it up again: since
 * and until when, which room (wanted.ts), and the rules hosted with now
 * (changed from the host's own, maybe) and whether they already tried others.
 */
export interface Stint {
  since: number;
  until: number;
  role: Role;
  prefs: RoomPrefs;
  retried?: boolean;
}

/**
 * The room's save is kept in the tab's sessionStorage, which a page that
 * crashed doesn't get back (the runner opens a new tab); a copy kept here
 * puts it back, so the room reopens with its game.
 */
const SAVE_COPY = 'room-save';
/** What the copy holds now (undefined: not looked at yet, so the first look sets it either way). */
let lastCopy: string | null | undefined;

export function keepSaveCopy() {
  const save = readStored(SAVE, 'session');
  if (save === lastCopy) return;
  lastCopy = save;
  if (save) writeStored(SAVE_COPY, save);
  else removeStored(SAVE_COPY);
}

/** Lets go of the room's save and its copy (the room is gone, or can't be got back). */
export function dropSave() {
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

export class Host {
  /** The other bot room's code (the runner says): the first never makes way for it. */
  sibling = '';
  private readonly player: Player;
  private lobbyKey = '';
  private startAt = 0;
  private overAt = 0;
  private aloneSince = 0;
  private notReadySince = Date.now();
  private configured = false;
  /** Lists in a row that showed another room to join. */
  private wayChecks = 0;
  /** Since when the lobby has been empty but for the host (0: it isn't), and how long they'll stand it. */
  private lonelySince = 0;
  private lonelyFor = 0;
  /** Lost heavily, and leaves once the scores have been up a while. */
  private sulking = false;
  /** Whether (and when) the host fiddles with the rules in this lobby, once someone is there. */
  private fiddle: { at: number } | null = null;

  /**
   * `stint`: theirs (saved through `keep` whenever it changes); `modes`: the
   * game modes they may pick (the runner's --mode).
   */
  constructor(
    readonly who: Identity,
    private stint: Stint,
    private readonly keep: (s: Stint) => void,
    private readonly modes: readonly Mode[],
  ) {
    who.prefs = stint.prefs;
    this.player = new Player(who.persona, hostEyes);
  }

  get role() {
    return this.stint.role;
  }

  get since() {
    return this.stint.since;
  }

  get until() {
    return this.stint.until;
  }

  /** Opens their room. */
  open() {
    log(`${this.who.name} opens a room, on until ${time(this.stint.until)}`);
    session.host(this.who.name);
  }

  /** After a reload: their room back, with its game. */
  resume() {
    restoreSave();
    session.resume();
    if (session.mode !== 'host') session.host(this.who.name);
    log(`${this.who.name} is back after a reload, on until ${time(this.stint.until)}`);
  }

  /** Closes the room: everyone is told, and nothing is saved to reopen. */
  close() {
    session.leave();
    dropSave();
  }

  /** A new room list (this room left out): whether another one to join is up, for making way. */
  see(others: RoomInfo[]) {
    // Both bot rooms waiting empty: only the second makes way, never the first for it.
    const rivals = this.stint.role === 'first' ? others.filter((r) => r.code !== this.sibling) : others;
    this.wayChecks = makesWay(rivals) ? this.wayChecks + 1 : 0;
  }

  /** The room another one made way for: someone else's lobby to join, people's before ours. */
  static wayTo(others: RoomInfo[], ours: ReadonlySet<string>): RoomInfo | null {
    const open = others.filter(joinable);
    return open.find((r) => !ours.has(r.code)) ?? open[0] ?? null;
  }

  status() {
    const s = session.state;
    return {
      role: this.stint.role,
      until: time(this.stint.until),
      code: session.code,
      status: session.status,
      phase: s?.phase ?? null,
      players: playersLine(s),
      spectators: s?.spectators?.length ?? 0,
    };
  }

  private save(changes: Partial<Stint>) {
    this.stint = { ...this.stint, ...changes };
    this.keep(this.stint);
  }

  /** Runs the room; once they call it a day, why (for the seat to close the room and decide what's next). */
  tick(now: number): { exit: HostExit; why: string } | null {
    const s = session.state;
    if (session.mode !== 'host' || session.status !== 'ready' || !s) {
      if (now - this.notReadySince > STUCK_MS) {
        // A saved room that won't reopen would only be tried again: let it go, and open a fresh one.
        log('room not open for a minute, reloading with a fresh one');
        dropSave();
        location.reload();
      }
      return null;
    }
    this.notReadySince = now;
    this.configure(s);
    const me = session.myPlayerId;
    const humans = s.players.filter((p) => p.id !== me && p.connected);
    const anyone = humans.length + (s.spectators?.length ?? 0) > 0;
    const timeUp = now >= this.stint.until;
    if (timeUp && (!anyone || now >= this.stint.until + OVERTIME_MS)) return { exit: 'done', why: anyone ? 'out of time, even for the ones still here' : 'time is up' };
    if (s.phase === 'lobby' && !anyone) {
      const gone = this.lonely(now);
      if (gone) return gone;
    }
    if (s.phase !== 'lobby' || anyone) this.lonelySince = 0;
    let exit: { exit: HostExit; why: string } | null = null;
    if (s.phase === 'lobby') this.lobby(s, humans.map((p) => p.id), now);
    else if (s.phase === 'over') exit = this.over(s, now, anyone, timeUp);
    else this.inGame(now, humans.length > 0);
    if (exit) return exit;
    // As things stand after the host's own moves just now (a start, a restart).
    if (session.state) this.player.play(session.state);
    return null;
  }

  /**
   * The host alone in the lobby: makes way for another room to join, and
   * after a while alone tries other rules (once) or leaves.
   */
  private lonely(now: number): { exit: HostExit; why: string } | null {
    if (!this.lonelySince) {
      this.lonelySince = now;
      this.lonelyFor = lonelyLength(Math.random);
    }
    const alone = now - this.lonelySince;
    if (alone >= MIN_OPEN_MS && this.wayChecks >= MAKE_WAY_CHECKS) return { exit: 'made way', why: 'another room is open' };
    if (alone < this.lonelyFor) return null;
    const other = this.stint.retried ? null : otherPrefs(this.who.prefs, Math.random, this.modes);
    if (other && Math.random() < RETRY_CHANCE) {
      this.lonelySince = 0;
      useRules((this.who.prefs = other));
      this.save({ prefs: other, retried: true });
      log(`nobody came, trying ${rulesText(other)}`);
      return null;
    }
    return { exit: 'nobody came', why: 'nobody came' };
  }

  /** Public and open always; the host's own rules whenever they may change (between games). */
  private configure(s: GameState) {
    if (!s.settings.public || s.settings.locked) session.dispatch({ type: 'settings', settings: { public: true, locked: false } });
    if (this.configured || (s.phase !== 'lobby' && s.phase !== 'over')) return;
    const c = this.who.prefs;
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
    else if (!this.fiddle) this.fiddle = { at: Math.random() < FIDDLE_CHANCE && this.who.prefs.mode !== 'delve' ? now + between(3000, 8000) : 0 };
    if (this.fiddle?.at && now >= this.fiddle.at) {
      this.fiddle.at = 0;
      const c = (this.who.prefs = fiddled(this.who.prefs, Math.random));
      useRules(c);
      this.save({ prefs: c });
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
   * who lost heavily now and then calls it a day. Then, once the scores have
   * been up a while, again or back to the lobby.
   */
  private over(s: GameState, now: number, anyone: boolean, timeUp: boolean): { exit: HostExit; why: string } | null {
    if (!this.overAt) {
      this.overAt = now + between(8000, 20000);
      const after = staysOn(moodOf(s, session.myPlayerId!), Math.random, HOST_ODDS);
      this.sulking = after === 'leave';
      if (after === 'longer') {
        this.save({ until: Math.max(this.stint.until, now) + between(10, 25) * 60000 });
        log(`won, stays on until ${time(this.stint.until)}`);
      }
    }
    if (now < this.overAt) return null;
    this.overAt = 0;
    if (this.sulking) return { exit: 'sulking', why: 'lost heavily, calls it a day' };
    if (timeUp) return { exit: 'done', why: 'after the game' };
    log(anyone ? 'playing again' : 'nobody left, back to the lobby');
    session.dispatch({ type: 'restart', play: anyone });
    return null;
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
        this.player.reset();
        session.dispatch({ type: 'restart' });
        return;
      }
    }
    // A connected player sitting on their turn: the host may skip it.
    if (session.idle) {
      log('skipping an idle turn');
      session.dispatch({ type: 'skip' });
    }
  }
}
