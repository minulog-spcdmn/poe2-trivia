// The room bot's seat: a place where one of the cast (identities.ts) at a
// time comes on, plays a while and goes, and someone else comes on later.
// They decide for themselves whether to host or to join, as people do
// (choice.ts): by how much they like hosting, tipped by habit, by how long
// they hosted lately, by a bad time as a guest lately, and by how much time
// they have. The seat remembers all that of everyone who sat there.
//
// While a room is wanted (wanted.ts), whoever feels most like hosting is
// likeliest to come on and open one; someone already looking for a room and
// finding none may open one themselves (the keener, the likelier and the
// sooner), or give up looking. The rest of the time, whoever comes on looks
// for someone else's room to join (guest.ts), and after a visit may look for
// another. A host whose empty room makes way for another may go and join
// that one, and one done hosting may look for a room to play in, both
// likelier the less they feel like hosting by then.
//
// When a host goes and their room is still wanted, the next one hands over
// at once. The runner (scripts/room-bot.mjs) keeps two seats from opening
// the same room (and from opening more than --rooms, if it is given), says
// which rooms are our own, and hands every seat the room list one of them
// checks for all.

import type { GameState } from '../lib/game';
import { engine, session } from '../lib/session.svelte';
import { scanRooms, type RoomInfo } from '../lib/rooms';
import { readStored, writeStored } from '../lib/storage';
import { identityOf, leaningsOf, NAMES, nextName, shiftLength, type Identity, type Mode } from './identities';
import { joinable, nextRole, waitingAlone, wanted, watchable, type Role } from './wanted';
import { afterHosting, afterVisit, hesitation, joinsAfter, keenTo, opensRoom, playsOn, urgeToHost, type HostExit, type Memory, type Visit } from './choice';
import { dropSave, Host, keepSaveCopy, type Stint } from './host';
import { AGAIN_AFTER_MS, Guest } from './guest';
import { between, log, time } from './util';
import { activity, minutesAwake } from './sleep';
import { asNewcomer, COMES_BACK, NEWCOMERS, VISITORS } from './visitors';

const TICK_MS = 200;
/** The open-room list is checked this often (ms, from..to), by the seat that checks it: often enough that someone waiting alone in their lobby gets company within seconds. */
const SCOUT_EVERY: [number, number] = [6000, 10000];
/**
 * Lists in a row that must call for a room before one opens: the second
 * room waits one more, so the first one's room shows in the list before it
 * would open as well.
 */
const wantedChecks = (role: Role) => (role === 1 ? 1 : 2);
/** A host leaving a room that is still wanted hands over: the next one opens a room this soon after. */
const HAND_OVER_MS = 2000;
/** A list checked this recently is trusted for a hand-over; an older one waits for a fresh check. */
const FRESH_LIST_MS = 30000;
/** The seat empty this long (ms, from..to) before someone comes on to join a room. */
const REST: [number, number] = [2 * 60000, 6 * 60000];
/** Someone looking who won't open a room gives up looking this soon (ms, from..to): someone keener may open one meanwhile. */
const GIVE_UP: [number, number] = [2 * 60000, 5 * 60000];
/** One done hosting who stays on to play somewhere else has this long (ms, from..to). */
const ONE_MORE: [number, number] = [15 * 60000, 40 * 60000];
/** Someone switching from looking to hosting hosts at least this long. */
const MIN_HOSTING_MS = 20 * 60000;
const MIN = 60000;
/** With everyone asleep, the seat looks again this soon (ms, from..to). */
const NOBODY_UP: [number, number] = [5 * MIN, 15 * MIN];
/** How many of the cast tend to be on at the busiest hours (a weekend evening in Europe, sleep.ts activity, on average): the hour the seat's rests are as REST says. */
const BUSIEST = 0.7;

/** The runner's say over which seat opens which room (scripts/room-bot.mjs), when it gives one. */
const {
  __claimRole: claimRole,
  __releaseRole: releaseRole,
  __releaseOthers: releaseOthers,
} = window as unknown as {
  __claimRole?: (role: Role) => Promise<boolean>;
  __releaseRole?: (role: Role) => Promise<void>;
  /** Lets go of any room this seat holds but `role` (0: all of them). */
  __releaseOthers?: (role: Role) => Promise<void>;
};

/**
 * What the seat keeps through a reload: the host on, if any, with their
 * stint; who came on lately; and what it remembers of everyone who sat there.
 */
interface Saved {
  host?: Stint & { name: string };
  recent: string[];
  minds?: Record<string, Memory>;
  /** Newcomers who came on (visitors.ts): how many times, and when last. */
  visitors?: Record<string, { n: number; at: number }>;
}

function load(): Saved {
  try {
    const s = JSON.parse(readStored('seat') ?? '') as Saved;
    if (Array.isArray(s.recent) && (!s.host || (typeof s.host.name === 'string' && typeof s.host.until === 'number' && Number.isInteger(s.host.role) && s.host.role >= 1))) return s;
  } catch {
    /* none yet */
  }
  return { recent: [] };
}

const CAST = new Set([...NAMES, ...VISITORS]);
/** A newcomer not seen for this long is anyone's guess: someone else by that name, new all the same. */
const FORGOTTEN_MS = 21 * 24 * 3600000;
/** A newcomer who comes back does so a day or more later. */
const BACK_AFTER_MS = 24 * 3600000;

/** The real people (anyone not of the cast) playing in the room, connected, besides this seat's own player. */
const peopleIn = (s: GameState | null) => s?.players.filter((p) => p.id !== session.myPlayerId && p.connected && !CAST.has(p.name)).map((p) => p.name) ?? [];

/** A game on in the room, or its scores up. */
const gameOn = (s: GameState | null) => !!s && s.phase !== 'lobby';

/** Another seat's room, as the runner says: which one (wanted.ts), and its code ('' until it is open). */
export interface TeamRoom {
  role: Role;
  code: string;
}

export class Seat {
  private saved = load();
  private host: Host | null = null;
  private guest: Guest | null = null;
  /** Waiting on the runner (a room's claim): the seat holds still meanwhile. */
  private busy = false;
  /** Nobody on: the earliest someone comes on to host, and to join. */
  private backAt = 0;
  private restUntil = 0;
  /** The room list as last checked (by this seat, or the one checking for all), and when; the last one gone through. */
  private latest: { rooms: RoomInfo[]; at: number } = { rooms: [], at: 0 };
  private considered = 0;
  /** What the last list showed besides this seat's room, for the status. */
  private seen: { rooms: number; open: number; at: number } | null = null;
  private others: RoomInfo[] = [];
  /** The room this seat could open (wanted.ts), and how many lists in a row called for it. */
  private wanted: { role: Role; checks: number } | null = null;
  /** Someone about to open a room, when, and how long they'll host. */
  private opener: { who: Identity; at: number; for: number } | null = null;
  /** The one looking now has decided not to open a room (until they go). */
  private declined = false;
  /** The next host comes on without a second thought (a hand-over). */
  private handOver = false;
  /** Rooms this seat hosted and closed: a list checked before they closed still shows them. */
  private closed = new Set<string>();
  /** Rooms people from this seat were in, and when they left. */
  private visited = new Map<string, number>();
  /** The other seats' rooms (the runner says). */
  private team: TeamRoom[] = [];
  private ours = new Set<string>();
  /** The runner is stopping (its first Ctrl+C): a game with people in it plays to its end, and nothing new begins. */
  private winding = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scoutTimer: ReturnType<typeof setTimeout> | null = null;
  private copyTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * `names`: whom it draws its players from (a share of its own, so nobody
   * is at two seats at once); `modes`: the game modes its hosts may pick
   * (--mode); `maxRooms`: how many rooms the bot keeps open at most (--rooms:
   * no limit by default, 0: it only joins); `checks`: whether it checks the room list itself
   * (the seat that does for all, or one on its own), else it is handed it;
   * `watching`: everyone who comes on only watches (--watch: no rooms of
   * their own, and in others' as spectators).
   */
  constructor(
    private readonly names: string[],
    private readonly modes: readonly Mode[],
    private readonly maxRooms: number,
    private readonly checks = true,
    private readonly watching = false,
    private readonly visitors: string[] = [],
  ) {}

  /** Who `name` is: a regular, or a newcomer (visitors.ts). */
  private identity(name: string): Identity {
    const who = identityOf(name, engine.categories, this.modes, engine.items);
    return VISITORS.includes(name) ? asNewcomer(who) : who;
  }

  /**
   * The newcomers who might come on now: anyone of the seat's share who
   * hasn't yet, or not for weeks; now and then one who came once, a day or
   * more ago, back for another go.
   */
  private newcomers(now: number): string[] {
    const seen = this.saved.visitors ?? {};
    return this.visitors.filter((n) => {
      const v = seen[n];
      return !v || now - v.at > FORGOTTEN_MS || (v.n === 1 && now - v.at > BACK_AFTER_MS && Math.random() < COMES_BACK);
    });
  }

  start() {
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.copyTimer = setInterval(keepSaveCopy, 1000);
    void this.scout();
    void this.resume();
  }

  /** A host on before a reload (or a crash) takes their room back, if theirs is still to have. */
  private async resume() {
    const h = this.saved.host;
    const back = h && this.names.includes(h.name) && h.role <= this.maxRooms ? h : null;
    // Any room this seat held before, and won't now, goes back to the runner.
    void releaseOthers?.(back?.role ?? 0);
    if (!back) {
      if (h) this.keep(undefined);
      // Nobody on: no room to get back, whatever a copy left behind says.
      dropSave();
      return;
    }
    this.busy = true;
    const ok = await this.claim(back.role);
    this.busy = false;
    if (!ok || !this.timer) {
      this.keep(undefined);
      dropSave();
      return;
    }
    const { name, ...stint } = back;
    this.host = new Host(this.identity(name), stint, (s) => this.keep({ name, ...s }), this.modes);
    this.host.above = this.above(back.role);
    this.host.resume();
  }

  /**
   * Leaves (the runner stopping): a host closes their room and everyone in
   * it is told; nothing is saved to reopen, so the next run opens a room
   * only once one is wanted.
   */
  close() {
    for (const t of [this.timer, this.copyTimer]) if (t) clearInterval(t);
    if (this.scoutTimer) clearTimeout(this.scoutTimer);
    this.timer = this.copyTimer = this.scoutTimer = null;
    if (this.host) void releaseRole?.(this.host.role);
    this.guest?.leave(Date.now());
    this.host = this.guest = null;
    this.keep(undefined);
    dropSave();
    if (session.mode) session.leave();
  }

  /**
   * The runner is stopping (its first Ctrl+C). A game under way with real
   * people in it (in this seat's room, or the room its guest is in) is
   * played to its end, the scores left up a moment; everything else ends
   * now, and nobody new comes on. Says what it plays on for, or null when
   * nothing (settled, below, says when it is done).
   */
  windDown(): string | null {
    this.winding = true;
    this.opener = null;
    const s = session.state;
    const people = peopleIn(s);
    if (this.host && gameOn(s) && people.length) {
      this.host.lastGame = true;
      const says = `${this.host.who.name} plays the game in room ${session.code} to its end, with ${people.join(', ')}`;
      log(says);
      return says;
    }
    if (this.guest?.inGame && people.length) {
      this.guest.lastGame();
      const says = `${this.guest.who.name} plays the game in ${this.guest.status().room} to its end, with ${people.join(', ')}`;
      log(says);
      return says;
    }
    this.windTick(Date.now());
    return null;
  }

  /** Winding down, and done: nobody on any more (the runner may close the page). */
  settled() {
    return this.winding && !this.host && !this.guest && !this.busy;
  }

  /** Winding down: the game with people in it plays on; once it is over, or they are gone, the one on goes. */
  private windTick(now: number) {
    const s = session.state;
    const playing = gameOn(s) && peopleIn(s).length > 0;
    if (this.host) {
      const host = this.host;
      const gone = playing ? host.tick(now) : { why: peopleIn(s).length ? 'stopping' : 'stopping, nobody else playing' };
      if (!gone) return;
      log(`${host.who.name} leaves (${gone.why})`);
      if (session.code) this.closed.add(session.code);
      host.close();
      this.host = null;
      this.keep(undefined);
      void releaseRole?.(host.role);
    } else if (this.guest) {
      const guest = this.guest;
      const gone = playing && guest.inGame ? guest.tick(now) : null;
      if (gone) log(`${guest.who.name} leaves (${gone.why})`);
      else if (playing && guest.inGame) return;
      else {
        log(`${guest.who.name} leaves (stopping)`);
        guest.leave(now);
      }
      this.guest = null;
    }
  }

  /** The runner: the other seats' rooms. */
  setTeam(team: TeamRoom[]) {
    this.team = team;
    this.ours = new Set(team.map((t) => t.code).filter(Boolean));
    if (this.host) this.host.above = this.above(this.host.role);
  }

  /** The runner: the room list as this seat last saw it (the one checking for all). */
  rooms() {
    return this.latest;
  }

  /** The runner: a room list checked by another seat. */
  takeRooms(rooms: RoomInfo[], at: number) {
    if (at > this.latest.at) this.latest = { rooms, at };
  }

  status() {
    const on = this.host ?? this.guest;
    return {
      as: this.host ? 'host' : this.guest ? 'guest' : null,
      name: on?.who.name ?? null,
      ...(this.host?.status() ?? {}),
      ...(this.guest?.status() ?? {}),
      back: on ? null : time(Math.max(this.restUntil, Date.now())),
      listed: this.seen ? `${this.seen.rooms} other rooms, ${this.seen.open} ${this.watching ? 'to watch' : 'in a lobby to join'} (${time(this.seen.at)})` : 'not checked yet',
    };
  }

  /** Whether someone from this seat left room `code` lately (the guests don't go back to it: guest.ts). */
  private recentlyIn(code: string, now: number) {
    return now - (this.visited.get(code) ?? -Infinity) < AGAIN_AFTER_MS;
  }

  /** Our rooms numbered higher than `role` (their codes): it never makes way for them. */
  private above(role: Role) {
    return new Set(this.team.filter((t) => t.role > role && t.code).map((t) => t.code));
  }

  private keep(host: Saved['host']) {
    this.saved = { ...this.saved, host };
    writeStored('seat', JSON.stringify(this.saved));
  }

  /** What the seat remembers of `name`. */
  private mind(name: string): Memory {
    return this.saved.minds?.[name] ?? {};
  }

  private remember(name: string, m: Memory) {
    this.saved = { ...this.saved, minds: { ...this.saved.minds, [name]: m } };
    writeStored('seat', JSON.stringify(this.saved));
  }

  /** How much `name` feels like hosting now, with `free` ms to spare. */
  private urge(name: string, leanings: { hosting: number }, free: number, now = Date.now()) {
    return urgeToHost(leanings, this.mind(name), now, free / MIN);
  }

  private cameOn(name: string) {
    if (this.saved.recent.at(-1) !== name) {
      this.saved = { ...this.saved, recent: [...this.saved.recent, name].slice(-20) };
      if (VISITORS.includes(name)) {
        const v = this.saved.visitors?.[name];
        this.saved.visitors = { ...this.saved.visitors, [name]: { n: (v?.n ?? 0) + 1, at: Date.now() } };
      }
    }
    writeStored('seat', JSON.stringify(this.saved));
  }

  private async claim(role: Role) {
    try {
      return !claimRole || (await claimRole(role));
    } catch {
      return false; // the runner couldn't be asked: not this time
    }
  }

  /** Checks the open-room list (as the start page does), if this seat checks it, then again in a while. */
  private async scout() {
    if (!this.timer) return;
    if (this.checks) {
      const rooms: RoomInfo[] = [];
      let ok = true;
      try {
        await scanRooms((r) => rooms.push(r), () => !this.timer);
      } catch {
        ok = false; // the matchmaking server can't be reached: no news
      }
      if (ok && this.timer) this.latest = { rooms, at: Date.now() };
    }
    this.scoutTimer = setTimeout(() => void this.scout(), between(...SCOUT_EVERY));
  }

  /** Goes through a new room list: whether a room is wanted from this seat, what the host or guest makes of it. */
  private see(rooms: RoomInfo[], at: number, now: number) {
    const mine = this.host ? session.code : '';
    const others = rooms.filter((r) => r.code !== mine && !this.closed.has(r.code));
    this.others = others;
    this.seen = { rooms: others.length, open: others.filter(this.watching ? watchable : joinable).length, at };
    this.host?.see(others, this.ours);
    this.guest?.see(others, now);
    const role = this.host ? null : nextRole(this.team.map((t) => t.role), this.maxRooms);
    this.wanted = role && wanted(role, others, this.ours) ? { role, checks: this.wanted?.role === role ? this.wanted.checks + 1 : 1 } : null;
  }

  /** The room this seat would open now, if the lists called for it often enough. */
  private wantedRole(): Role | null {
    return this.wanted && this.wanted.checks >= wantedChecks(this.wanted.role) ? this.wanted.role : null;
  }

  private tick() {
    if (this.busy) return;
    const now = Date.now();
    if (this.winding) return this.windTick(now);
    if (this.latest.at > this.considered) {
      this.considered = this.latest.at;
      this.see(this.latest.rooms, this.latest.at, now);
    }
    if (this.host) {
      const gone = this.host.tick(now);
      if (gone) this.hostGoes(now, gone.exit, gone.why);
      return;
    }
    if (this.guest) {
      const gone = this.guest.tick(now);
      if (gone) this.guestGoes(now, gone.why, gone.visit, gone.host);
      else if (this.guest.looking) this.mayOpenInstead(now, this.guest);
      return;
    }
    // Nobody on, and nothing known yet: whoever comes on first looks at the list.
    if (!this.latest.at) return;
    // A room wanted: whoever feels most like hosting is likeliest to come on and open it.
    if (this.wantedRole() && now >= this.backAt) {
      if (!this.opener) {
        const name = this.whoComesOn('host', now);
        // Everyone asleep: nobody to open it till someone's up.
        if (!name) {
          this.backAt = now + between(...NOBODY_UP);
          return;
        }
        const free = this.timeFor(name, now);
        const who = this.identity(name);
        // In the small hours, with few up, a room is longer coming.
        const at = this.handOver ? now : now + hesitation(this.urge(name, who.persona, free, now), Math.random) / this.liveliness(now);
        this.opener = { who, at, for: free };
      }
      if (now >= this.opener.at) void this.open(this.opener.who, this.opener.for);
      return;
    }
    this.opener = null;
    this.handOver = false;
    // Otherwise, after a rest, whoever feels most like joining is likeliest to
    // come on and look for a room; at once when someone is waiting alone in
    // their lobby (and the seat isn't just handing over).
    const someoneWaits = !this.watching && now >= this.backAt && this.others.some((r) => waitingAlone(r, this.ours) && !this.recentlyIn(r.code, now));
    if (now >= this.restUntil || someoneWaits) {
      const name = this.whoComesOn('join', now);
      if (!name) {
        this.restUntil = now + between(...NOBODY_UP);
        return;
      }
      this.lookForRoom(this.identity(name), now + this.timeFor(name, now));
    }
  }

  /**
   * Who comes on now to host or to join: whoever feels most like it, among
   * those up (sleep.ts), the likelier the more they tend to be on at this
   * hour. Null with everyone asleep.
   */
  private whoComesOn(to: 'host' | 'join', now: number): string | null {
    // Now and then someone new (visitors.ts), if any are up.
    const pool = Math.random() < NEWCOMERS ? this.newcomers(now) : [];
    const up = new Map(pool.map((n) => [n, activity(n, now)]));
    const from = [...up.values()].some((a) => a > 0) ? pool : this.names;
    if (from === this.names) for (const n of this.names) up.set(n, activity(n, now));
    if (![...up.values()].some((a) => a > 0)) return null;
    const free = shiftLength(Math.random);
    const newcomer = from !== this.names;
    return nextName(this.saved.recent, Math.random, from, (n) => (up.get(n) ?? 0) * keenTo(this.urge(n, newcomer ? { hosting: leaningsOf(n).hosting * 0.4 } : leaningsOf(n), free, now), to));
  }

  /** How long `name` has (ms): as long as they feel like playing, unless bedtime comes first (they may stay on a little past it). */
  private timeFor(name: string, now: number, most = shiftLength(Math.random)) {
    const bed = (minutesAwake(name, now) + between(0, 25)) * MIN;
    return Math.max(10 * MIN, Math.min(most, bed));
  }

  /** How busy this hour is for the seat's cast, as a share of the busiest (0.15 to 1). */
  private liveliness(now: number) {
    const on = this.names.reduce((a, n) => a + activity(n, now), 0) / Math.max(1, this.names.length);
    return Math.min(1, Math.max(0.15, on / BUSIEST));
  }

  /** The seat empty this long after someone goes: longer the fewer are up. */
  private rest(now: number) {
    return now + between(...REST) / this.liveliness(now);
  }

  /**
   * Someone looking finds no room to play in while one is wanted: they
   * decide once whether to open one (and after how long), or to give up
   * looking soon, by how much they feel like hosting with the time they have.
   */
  private mayOpenInstead(now: number, guest: Guest) {
    if (!this.wantedRole()) {
      this.opener = null;
      return;
    }
    if (!this.opener && !this.declined) {
      const free = Math.max(guest.until - now, MIN_HOSTING_MS);
      const after = opensRoom(this.urge(guest.who.name, guest.who.persona, guest.until - now, now), Math.random);
      if (after === null) {
        this.declined = true;
        guest.giveUpBy(now + between(...GIVE_UP));
      } else this.opener = { who: guest.who, at: now + after, for: free };
    }
    if (this.opener && now >= this.opener.at) void this.open(this.opener.who, this.opener.for);
  }

  /** `who` opens the room wanted, to host for `free` ms. */
  private async open(who: Identity, free: number) {
    const role = this.wantedRole()!;
    this.busy = true;
    const ok = await this.claim(role);
    this.busy = false;
    this.opener = null;
    this.handOver = false;
    // Stopping meanwhile: no room opens now.
    if (!this.timer || this.winding) {
      if (ok) void releaseRole?.(role);
      return;
    }
    // Another seat got there first: this one waits for the lists to call for a room again.
    if (!ok) {
      this.wanted = null;
      return;
    }
    const now = Date.now();
    if (this.guest) {
      log(`${who.name} finds no room to play in, and opens one`);
      this.guest.leave(now);
      this.guest = null;
    } else log(`${who.name} comes on`);
    const stint: Stint = { since: now, until: now + free, role, prefs: who.prefs };
    this.cameOn(who.name);
    this.keep({ name: who.name, ...stint });
    this.wanted = null;
    this.host = new Host(who, stint, (s) => this.keep({ name: who.name, ...s }), this.modes);
    this.host.above = this.above(role);
    this.host.open();
  }

  /**
   * Someone comes on to join a room until `until`, or (`how`) a host stays
   * on to, or a guest looks for another (`prefer`: a room to join first).
   */
  private lookForRoom(who: Identity, until: number, prefer = '', how: 'comes on' | 'stays on' | 'again' = 'comes on') {
    this.cameOn(who.name);
    this.declined = false;
    this.guest = new Guest(who, this.visited, () => this.ours, (host) => this.mind(who.name).hosts?.[host] ?? 0, until, prefer, this.watching);
    const says = this.watching
      ? { 'comes on': 'comes on, looking for a room to watch', 'stays on': "stays on to watch someone else's room", again: 'looks for another room to watch' }
      : { 'comes on': 'comes on, looking for a room to join', 'stays on': "stays on to play in someone else's room", again: 'looks for another room' };
    log(`${who.name} ${says[how]} (until ${time(until)})`);
    // Through the latest list straight away, as someone opening the list would.
    if (this.latest.at) this.guest.see(this.others, Date.now());
  }

  /** A guest leaves a room (or gives up looking): they remember how it went, and look for another or go. */
  private guestGoes(now: number, why: string, visit: Visit | null, host: string) {
    const guest = this.guest!;
    const name = guest.who.name;
    log(`${name} ${visit ? 'leaves' : 'goes'} (${why})`);
    this.guest = null;
    this.opener = null;
    if (visit && host) this.remember(name, afterVisit(this.mind(name), visit, host, now));
    if (visit && playsOn(visit, (guest.until - now) / MIN, Math.random)) return this.lookForRoom(guest.who, guest.until, '', 'again');
    this.restUntil = this.rest(now);
  }

  /**
   * The host calls it a day and their room closes. If the latest list still
   * calls for the room (this one left out), the next one hands over and opens
   * a new room at once; otherwise (it made way, or a player's room is up
   * meanwhile) the host may stay on to join someone's room, or goes, and a
   * room opens again once a list calls for one.
   */
  private hostGoes(now: number, exit: HostExit, why: string) {
    const host = this.host!;
    const name = host.who.name;
    log(`${name} leaves (${why})`);
    if (session.code) this.closed.add(session.code);
    host.close();
    this.host = null;
    this.keep(undefined);
    void releaseRole?.(host.role);
    this.remember(name, afterHosting(this.mind(name), (now - (host.since || now)) / MIN, now));
    // A list older than that may have missed a room opened meanwhile: then the next one decides.
    const fresh = !!this.seen && now - this.seen.at < FRESH_LIST_MS;
    this.handOver = exit !== 'made way' && fresh && wanted(host.role, this.others, this.ours);
    this.wanted = this.handOver ? { role: host.role, checks: wantedChecks(host.role) } : null;
    this.opener = null;
    this.backAt = now + HAND_OVER_MS;
    this.restUntil = this.rest(now);
    // A room still wanted has nobody to join, so only without one do they look around.
    const until = Math.min(exit === 'done' ? now + between(...ONE_MORE) : Math.max(host.until, now + ONE_MORE[0]), now + this.timeFor(name, now, Infinity));
    // Made way for someone waiting alone in their own room: they go and keep them company.
    const to = exit === 'made way' ? Host.wayTo(this.others, this.ours) : null;
    const forSomeone = !!to && waitingAlone(to, this.ours);
    if (!this.handOver && (forSomeone || joinsAfter(this.urge(name, host.who.persona, until - now, now), exit, Math.random))) this.lookForRoom(host.who, until, to?.code, 'stays on');
  }
}
