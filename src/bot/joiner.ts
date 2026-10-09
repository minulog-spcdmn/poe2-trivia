// The room bot as a guest: one of the cast (identities.ts) looks over the
// open-room list now and then, and joins a lobby whose host has been waiting
// there alone for a while, so nobody waits for company for long (or, after a
// longer while, one with others in it already, as long as it has a seat). It plays
// a game or a few there as any guest would (player.ts, with the eyes of
// sight.ts: a guest never gets the answers), then leaves and rests before
// it looks again. People's rooms first: our own bot rooms only while no
// one else's lobby is open. Never more than one room, never back to a room
// it was in lately. Several may run at once, and may end up in the same
// room, arriving one after another (the runner spaces them out, and keeps
// to --per-room guests a room if asked). One of them checks the room list
// for all (the runner passes it on), so the matchmaking server is asked
// once however many there are.

import { engine, session } from '../lib/session.svelte';
import { scanRooms, type RoomInfo } from '../lib/rooms';
import { nameSkeleton } from '../lib/names';
import { identityOf, nextName, type Identity } from './identities';
import { staysOn } from './brain';
import { joinable } from './wanted';
import { moodOf, Player } from './player';
import { lastReading, sight } from './sight';
import { between, log, playersLine, time } from './util';

const TICK_MS = 250;
/** The open-room list is checked this often (ms, from..to). */
const SCOUT_EVERY: [number, number] = [10000, 18000];
/** A host alone in their lobby this long (ms, from..to, rolled for each room) gets company. */
const WAIT_ALONE: [number, number] = [5000, 20000];
/** A lobby with company already: seen this long, and another may come along (ms, from..to). */
const WAIT_MORE: [number, number] = [15000, 40000];
/** Games played in a room before leaving (from..to). */
const GAMES: [number, number] = [1, 3];
/** Rest between rooms (ms, from..to). */
const REST: [number, number] = [2 * 60000, 6 * 60000];
/** A room left isn't joined again for this long. */
const AGAIN_AFTER_MS = 60 * 60000;
/** The chance, each game, that it has to go before the end. */
const MID_GAME_DROP = 0.02;
/** Joining that hasn't got in by then is given up. */
const JOIN_GIVE_UP_MS = 45000;
/** The host gone (the link lost) this long: the guest gives up on the room. */
const HOST_GONE_MS = 30000;
/** A lobby whose host doesn't start in this long is left (ms, from..to). */
const LOBBY_PATIENCE: [number, number] = [5 * 60000, 9 * 60000];


/** The runner's say over which guest takes which room (scripts/room-bot.mjs), when it gives one. */
const { __claimRoom: claimRoom, __releaseRoom: releaseRoom } = window as unknown as {
  __claimRoom?: (code: string) => Promise<boolean>;
  __releaseRoom?: (code: string) => Promise<void>;
};

/** `asking`: waiting for the runner's yes to a room (claimRoom), before joining. */
type Doing = 'resting' | 'looking' | 'asking' | 'joining' | 'playing';

export class Joiner {
  private doing: Doing = 'looking';
  private until = 0;
  private who: Identity | null = null;
  private player: Player | null = null;
  private room: RoomInfo | null = null;
  private recent: string[] = [];
  /** Lobbies it could join: since when it has seen each, and how long until it does. */
  private waiting = new Map<string, { since: number; wait: number }>();
  /** Rooms we were in, and when we left. */
  private visited = new Map<string, number>();
  /** Our own bot rooms (the runner says): joined only while no one else's lobby is open. */
  private ours = new Set<string>();
  /** The room list as last checked (by this guest, or the one checking for all), and when. */
  private latest: { rooms: RoomInfo[]; at: number } = { rooms: [], at: 0 };
  /** The list it last went through. */
  private considered = 0;
  /** Done with this room (no games left): it goes once the scores are down or the host moves on. */
  private finished = false;
  /** Since when the link to the host has been lost (0: it hasn't). */
  private lostSince = 0;
  private gamesLeft = 0;
  private lastPhase = '';
  private lobbySince = 0;
  private lobbyPatience = 0;
  private overAt = 0;
  /** When it has to go mid-game (0: it stays to the end). */
  private dropAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scoutTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * `names`: whom it draws its guests from (a share of its own, apart from
   * the hosts'); `checks`: whether it checks the room list itself (the one
   * guest that does for all, or a guest on its own), else it is handed it.
   */
  constructor(
    private readonly names: string[],
    private readonly checks = true,
  ) {}

  start() {
    this.timer = setInterval(() => this.tick(), TICK_MS);
    void this.scout();
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    if (this.scoutTimer) clearTimeout(this.scoutTimer);
    this.timer = this.scoutTimer = null;
    if (session.mode) session.leave();
  }

  /** The runner: our own bot rooms' codes. */
  setOurs(codes: string[]) {
    this.ours = new Set(codes.filter(Boolean));
  }

  /** The runner: the room list as the guest checking for all last saw it. */
  rooms() {
    return this.latest;
  }

  /** The runner: a room list checked by another guest. */
  takeRooms(rooms: RoomInfo[], at: number) {
    if (at > this.latest.at) this.latest = { rooms, at };
  }

  status() {
    const s = session.state;
    return {
      joiner: true,
      doing: this.doing,
      as: this.who?.name ?? null,
      room: this.room ? `${this.room.code} (${this.room.host}'s)` : null,
      code: this.room?.code ?? '',
      until: this.doing === 'resting' ? time(this.until) : null,
      phase: s?.phase ?? null,
      players: playersLine(s),
    };
  }

  /**
   * Checks the room list: while looking, or always if it checks for all (the
   * others look while it plays). A guest that doesn't check goes through
   * each new list it is handed instead (tick).
   */
  private async scout() {
    if (!this.timer) return;
    if (this.checks) {
      const rooms: RoomInfo[] = [];
      let ok = true;
      try {
        await scanRooms((r) => rooms.push(r), () => !this.timer);
      } catch {
        ok = false; // the matchmaking server can't be reached: look again later
      }
      if (ok && this.timer) this.latest = { rooms, at: Date.now() };
    }
    this.scoutTimer = setTimeout(() => void this.scout(), between(...SCOUT_EVERY));
  }

  /**
   * Keeps track of lobbies it could join (a host alone soonest, one with
   * company already after a longer while), and joins the one that has waited
   * its while, the emptiest first. People's lobbies come first: one of our
   * own bot rooms only while there is no other.
   */
  private consider(rooms: RoomInfo[], now: number) {
    const fresh = rooms.filter((r) => joinable(r) && now - (this.visited.get(r.code) ?? -Infinity) > AGAIN_AFTER_MS);
    const theirs = fresh.filter((r) => !this.ours.has(r.code));
    const open = theirs.length ? theirs : fresh;
    const codes = new Set(open.map((r) => r.code));
    for (const code of this.waiting.keys()) if (!codes.has(code)) this.waiting.delete(code);
    for (const r of open) if (!this.waiting.has(r.code)) this.waiting.set(r.code, { since: now, wait: between(...(r.players === 1 ? WAIT_ALONE : WAIT_MORE)) });
    const due = open.filter((r) => now - this.waiting.get(r.code)!.since >= this.waiting.get(r.code)!.wait);
    if (!due.length) return;
    due.sort((a, b) => a.players - b.players || this.waiting.get(a.code)!.since - this.waiting.get(b.code)!.since);
    void this.join(due[0], now);
  }

  private async join(room: RoomInfo, now: number) {
    // Several guests at once: the runner spaces their arrivals in a room, and keeps to so many a room.
    this.doing = 'asking';
    let yes = true;
    try {
      yes = !claimRoom || (await claimRoom(room.code));
    } catch {
      yes = false; // the runner couldn't be asked: not this time
    }
    if (!yes) {
      this.waiting.set(room.code, { since: now, wait: between(...WAIT_MORE) });
      this.doing = 'looking';
      return;
    }
    // Not a name that clashes with the host's.
    let name = nextName(this.recent, Math.random, this.names);
    for (let i = 0; i < 5 && nameSkeleton(name) === nameSkeleton(room.host); i++) name = nextName([...this.recent, name], Math.random, this.names);
    this.recent = [...this.recent, name].slice(-20);
    this.who = identityOf(name, engine.categories, undefined, engine.items);
    this.player = new Player(this.who.persona, sight);
    this.room = room;
    this.waiting.delete(room.code);
    this.gamesLeft = between(...GAMES);
    this.doing = 'joining';
    this.until = Date.now() + JOIN_GIVE_UP_MS;
    this.lastPhase = '';
    this.dropAt = 0;
    this.finished = false;
    this.lostSince = 0;
    this.lobbySince = 0;
    this.overAt = 0;
    log(`${name} joins ${room.host}'s room ${room.code} (${room.mode}), for ${this.gamesLeft} game${this.gamesLeft > 1 ? 's' : ''}`);
    session.join(room.code, name);
  }

  /** Leaves the room (or finds itself out of it) and rests. */
  private leave(now: number, why: string) {
    log(`${this.who?.name} leaves ${this.room?.code} (${why})`);
    if (this.room) {
      this.visited.set(this.room.code, now);
      void releaseRoom?.(this.room.code);
    }
    if (session.mode) session.leave();
    this.player = null;
    this.room = null;
    this.doing = 'resting';
    this.until = now + between(...REST);
  }

  private tick() {
    const now = Date.now();
    if (this.doing === 'resting') {
      if (now >= this.until) this.doing = 'looking';
      return;
    }
    if (this.doing === 'looking') {
      // A new list (its own, or handed over): go through it.
      if (this.latest.at > this.considered) {
        this.considered = this.latest.at;
        this.consider(this.latest.rooms, now);
      }
      return;
    }
    if (this.doing === 'asking') return;
    const s = session.state;
    const me = session.myPlayerId;
    // Turned away, kicked, or the room closed: the session let go.
    if (session.mode !== 'client') return this.leave(now, this.doing === 'joining' ? 'could not get in' : 'the room went');
    if (this.doing === 'joining') {
      if (s && me && session.status === 'ready' && [...s.players, ...(s.spectators ?? [])].some((p) => p.id === me)) {
        this.doing = 'playing';
        log(`${this.who?.name} is in`);
      } else if (now > this.until) return this.leave(now, 'could not get in');
      return;
    }
    // The host gone for good (its link lost, the session given up on it): on to another room.
    if (session.status === 'lost' || session.gaveUp) {
      this.lostSince ||= now;
      if (session.gaveUp || now - this.lostSince > HOST_GONE_MS) return this.leave(now, 'the host is gone');
      return;
    }
    this.lostSince = 0;
    if (!s || session.status !== 'ready') return;
    this.player?.play(s);
    this.notePhase(s.phase);
    if (s.phase === 'lobby') {
      this.lobbySince ||= now;
      this.lobbyPatience ||= between(...LOBBY_PATIENCE);
      // Alone with the host gone quiet, or a host who never starts.
      if (now - this.lobbySince > this.lobbyPatience) return this.leave(now, 'the host never started');
    } else this.lobbySince = this.lobbyPatience = 0;
    // Now and then real life calls, mid-game.
    if (this.dropAt && now >= this.dropAt && s.phase !== 'lobby' && s.phase !== 'over') return this.leave(now, 'had to go');
    // Done here: off once the scores have been up a moment, or as soon as the host moves on, whichever is first.
    if (this.finished && (s.phase !== 'over' || now >= this.overAt)) return this.leave(now, 'had enough');
    if (s.phase === 'over') this.overAt ||= now + between(6000, 15000);
    else this.overAt = 0;
  }

  /** Counts the games played, and says how the eyes did at each reveal (the log only). */
  private notePhase(phase: string) {
    if (phase === this.lastPhase) return;
    const s = session.state!;
    const seen = lastReading;
    if (phase === 'reveal' && s.reveal && seen && seen.qid === s.question?.askedAt)
      log(`eyes saw option ${seen.index + 1} (by ${seen.margin.toFixed(2)}), it was ${s.reveal.correctIndex + 1}`);
    // A game starts: about one in fifty, it will have to go before the end.
    if ((this.lastPhase === '' || this.lastPhase === 'lobby' || this.lastPhase === 'over') && phase !== 'lobby' && phase !== 'over')
      this.dropAt = Math.random() < MID_GAME_DROP ? Date.now() + between(30000, 300000) : 0;
    if (phase === 'over') {
      this.gamesLeft--;
      // A win now and then makes it one more; a heavy loss now and then, that's it.
      const after = staysOn(moodOf(s, session.myPlayerId!), Math.random);
      if (after === 'longer') {
        this.gamesLeft++;
        log('won, plays one more');
      } else if (after === 'leave' && this.gamesLeft > 0) {
        this.gamesLeft = 0;
        log('lost heavily, leaves after this one');
      }
      if (this.gamesLeft <= 0) this.finished = true;
    }
    this.lastPhase = phase;
  }
}
