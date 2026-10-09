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
// at once. The runner (scripts/room-bot.mjs) keeps the seats from opening
// more rooms than it allows (--rooms), says which rooms are our own, and
// hands every seat the room list one of them checks for all.

import { engine, session } from '../lib/session.svelte';
import { scanRooms, type RoomInfo } from '../lib/rooms';
import { readStored, writeStored } from '../lib/storage';
import { identityOf, leaningsOf, nextName, shiftLength, type Identity, type Mode } from './identities';
import { nextRole, wanted, type Role } from './wanted';
import { afterHosting, afterVisit, hesitation, joinsAfter, keenTo, opensRoom, playsOn, urgeToHost, type HostExit, type Memory, type Visit } from './choice';
import { dropSave, Host, keepSaveCopy, type Stint } from './host';
import { Guest } from './guest';
import { between, log, time } from './util';

const TICK_MS = 200;
/** The open-room list is checked this often (ms, from..to), by the seat that checks it. */
const SCOUT_EVERY: [number, number] = [10000, 18000];
/**
 * Lists in a row that must call for a room before one opens: the second
 * room waits one more, so the first one's room shows in the list before it
 * would open as well.
 */
const WANTED_CHECKS: Record<Role, number> = { first: 1, second: 2 };
/** A host leaving a room that is still wanted hands over: the next one opens a room this soon after. */
const HAND_OVER_MS = 2000;
/** A list checked this recently is trusted for a hand-over; an older one waits for a fresh check. */
const FRESH_LIST_MS = 30000;
/** The seat empty this long (ms, from..to) before someone comes on to join a room. */
const REST: [number, number] = [2 * 60000, 6 * 60000];
/** Someone looking who won't open a room gives up looking this soon (ms, from..to). */
const GIVE_UP: [number, number] = [30000, 90000];
/** One done hosting who stays on to play somewhere else has this long (ms, from..to). */
const ONE_MORE: [number, number] = [15 * 60000, 40 * 60000];
/** Someone switching from looking to hosting hosts at least this long. */
const MIN_HOSTING_MS = 20 * 60000;
const MIN = 60000;

/** The runner's say over which seat opens which room (scripts/room-bot.mjs), when it gives one. */
const { __claimRole: claimRole, __releaseRole: releaseRole } = window as unknown as {
  __claimRole?: (role: Role) => Promise<boolean>;
  __releaseRole?: (role: Role) => Promise<void>;
};

/**
 * What the seat keeps through a reload: the host on, if any, with their
 * stint; who came on lately; and what it remembers of everyone who sat there.
 */
interface Saved {
  host?: Stint & { name: string };
  recent: string[];
  minds?: Record<string, Memory>;
}

function load(): Saved {
  try {
    const s = JSON.parse(readStored('seat') ?? '') as Saved;
    if (Array.isArray(s.recent) && (!s.host || (typeof s.host.name === 'string' && typeof s.host.until === 'number' && (s.host.role === 'first' || s.host.role === 'second')))) return s;
  } catch {
    /* none yet */
  }
  return { recent: [] };
}

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
  private seen: { rooms: number; at: number } | null = null;
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
  private timer: ReturnType<typeof setInterval> | null = null;
  private scoutTimer: ReturnType<typeof setTimeout> | null = null;
  private copyTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * `names`: whom it draws its players from (a share of its own, so nobody
   * is at two seats at once); `modes`: the game modes its hosts may pick
   * (--mode); `maxRooms`: how many rooms the bot keeps open at most (--rooms,
   * 0: it only joins); `checks`: whether it checks the room list itself
   * (the seat that does for all, or one on its own), else it is handed it.
   */
  constructor(
    private readonly names: string[],
    private readonly modes: readonly Mode[],
    private readonly maxRooms: number,
    private readonly checks = true,
  ) {}

  start() {
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.copyTimer = setInterval(keepSaveCopy, 1000);
    void this.scout();
    void this.resume();
  }

  /** A host on before a reload (or a crash) takes their room back, if theirs is still to have. */
  private async resume() {
    const h = this.saved.host;
    const back = h && this.names.includes(h.name) && nextRole([], this.maxRooms) && (h.role === 'first' || this.maxRooms >= 2) ? h : null;
    // Rooms this seat held before, and won't now, go back to the runner.
    for (const role of ['first', 'second'] as const) if (role !== back?.role) void releaseRole?.(role);
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
    this.host = new Host(identityOf(name, engine.categories, this.modes, engine.items), stint, (s) => this.keep({ name, ...s }), this.modes);
    this.host.sibling = this.siblingOf(back.role);
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

  /** The runner: the other seats' rooms. */
  setTeam(team: TeamRoom[]) {
    this.team = team;
    this.ours = new Set(team.map((t) => t.code).filter(Boolean));
    if (this.host) this.host.sibling = this.siblingOf(this.host.role);
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
      listed: this.seen ? `${this.seen.rooms} other rooms (${time(this.seen.at)})` : 'not checked yet',
    };
  }

  /** The other bot room's code, for the one opening `role`. */
  private siblingOf(role: Role) {
    return this.team.find((t) => t.role !== role)?.code ?? '';
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
    if (this.saved.recent.at(-1) !== name) this.saved = { ...this.saved, recent: [...this.saved.recent, name].slice(-20) };
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
    this.seen = { rooms: others.length, at };
    this.host?.see(others);
    this.guest?.see(others, now);
    const role = this.host ? null : nextRole(this.team.map((t) => t.role), this.maxRooms);
    this.wanted = role && wanted(role, others) ? { role, checks: this.wanted?.role === role ? this.wanted.checks + 1 : 1 } : null;
  }

  /** The room this seat would open now, if the lists called for it often enough. */
  private wantedRole(): Role | null {
    return this.wanted && this.wanted.checks >= WANTED_CHECKS[this.wanted.role] ? this.wanted.role : null;
  }

  private tick() {
    if (this.busy) return;
    const now = Date.now();
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
        const free = shiftLength(Math.random);
        const name = nextName(this.saved.recent, Math.random, this.names, (n) => keenTo(this.urge(n, leaningsOf(n), free, now), 'host'));
        const who = identityOf(name, engine.categories, this.modes, engine.items);
        const at = this.handOver ? now : now + hesitation(this.urge(name, who.persona, free, now), Math.random);
        this.opener = { who, at, for: free };
      }
      if (now >= this.opener.at) void this.open(this.opener.who, this.opener.for);
      return;
    }
    this.opener = null;
    this.handOver = false;
    // Otherwise, after a rest, whoever feels most like joining is likeliest to come on and look for a room.
    if (now >= this.restUntil) {
      const free = shiftLength(Math.random);
      const name = nextName(this.saved.recent, Math.random, this.names, (n) => keenTo(this.urge(n, leaningsOf(n), free, now), 'join'));
      this.lookForRoom(identityOf(name, engine.categories, this.modes, engine.items), now + free);
    }
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
    if (!this.timer) return;
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
    this.host.sibling = this.siblingOf(role);
    this.host.open();
  }

  /**
   * Someone comes on to join a room until `until`, or (`how`) a host stays
   * on to, or a guest looks for another (`prefer`: a room to join first).
   */
  private lookForRoom(who: Identity, until: number, prefer = '', how: 'comes on' | 'stays on' | 'again' = 'comes on') {
    this.cameOn(who.name);
    this.declined = false;
    this.guest = new Guest(who, this.visited, () => this.ours, (host) => this.mind(who.name).hosts?.[host] ?? 0, until, prefer);
    const says = { 'comes on': 'comes on, looking for a room to join', 'stays on': "stays on to play in someone else's room", again: 'looks for another room' };
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
    this.restUntil = now + between(...REST);
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
    this.handOver = exit !== 'made way' && fresh && wanted(host.role, this.others);
    this.wanted = this.handOver ? { role: host.role, checks: WANTED_CHECKS[host.role] } : null;
    this.opener = null;
    this.backAt = now + HAND_OVER_MS;
    this.restUntil = now + between(...REST);
    // A room still wanted has nobody to join, so only without one do they look around.
    const until = exit === 'done' ? now + between(...ONE_MORE) : Math.max(host.until, now + ONE_MORE[0]);
    if (!this.handOver && joinsAfter(this.urge(name, host.who.persona, until - now, now), exit, Math.random)) {
      const to = exit === 'made way' ? Host.wayTo(this.others, this.ours) : null;
      this.lookForRoom(host.who, until, to?.code, 'stays on');
    }
  }
}
