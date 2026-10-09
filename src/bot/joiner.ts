// The room bot as a guest: one of the cast (identities.ts) looks over the
// open-room list now and then, and joins a lobby whose host has been waiting
// there alone for a while, so nobody waits for company for long. It plays
// a game or a few there as any guest would (player.ts, with the eyes of
// sight.ts: a guest never gets the answers), then leaves and rests before
// it looks again. Never one of our own bot rooms, never more than one room,
// never back to a room it was in lately. Several may run at once, each in a
// room of its own (the runner tells each where the others are).

import { engine, session } from '../lib/session.svelte';
import { scanRooms, type RoomInfo } from '../lib/rooms';
import { nameSkeleton } from '../lib/names';
import { identityOf, nextName, type Identity } from './identities';
import { staysOn } from './brain';
import { joinable } from './wanted';
import { moodOf, Player } from './player';
import { lastReading, sight } from './sight';

const TICK_MS = 250;
/** The open-room list is checked this often (ms, from..to). */
const SCOUT_EVERY: [number, number] = [15000, 25000];
/** A host alone in their lobby this long (ms, from..to, rolled for each room) gets company. */
const WAIT_ALONE: [number, number] = [15000, 45000];
/** Games played in a room before leaving (from..to). */
const GAMES: [number, number] = [1, 3];
/** Rest between rooms (ms, from..to). */
const REST: [number, number] = [3 * 60000, 10 * 60000];
/** A room left isn't joined again for this long. */
const AGAIN_AFTER_MS = 60 * 60000;
/** Joining that hasn't got in by then is given up. */
const JOIN_GIVE_UP_MS = 45000;
/** A lobby whose host doesn't start in this long is left (ms, from..to). */
const LOBBY_PATIENCE: [number, number] = [5 * 60000, 9 * 60000];

const log = (...args: unknown[]) => console.log('[bot]', ...args);

/** The runner's say over which guest takes which room (scripts/room-bot.mjs), when it gives one. */
const { __claimRoom: claimRoom, __releaseRoom: releaseRoom } = window as unknown as {
  __claimRoom?: (code: string) => Promise<boolean>;
  __releaseRoom?: (code: string) => Promise<void>;
};
const between = (lo: number, hi: number) => Math.round(lo + Math.random() * (hi - lo));

type Doing = 'resting' | 'looking' | 'joining' | 'playing';

export class Joiner {
  private doing: Doing = 'looking';
  private until = 0;
  private who: Identity | null = null;
  private player: Player | null = null;
  private room: RoomInfo | null = null;
  private recent: string[] = [];
  /** Lobbies seen with their host alone: since when, and how long until we join. */
  private alone = new Map<string, { since: number; wait: number }>();
  /** Rooms we were in, and when we left. */
  private visited = new Map<string, number>();
  /** Our own bot rooms, and the rooms our other guests are in (the runner says): never joined. */
  private ours = new Set<string>();
  private gamesLeft = 0;
  private lastPhase = '';
  private lobbySince = 0;
  private lobbyPatience = 0;
  private overAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scoutTimer: ReturnType<typeof setTimeout> | null = null;

  /** `names`: whom it draws its guests from (a share of its own, apart from the hosts'). */
  constructor(private readonly names: string[]) {}

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

  /** The runner: our own bot rooms' codes, and those our other guests are in. */
  setOurs(codes: string[]) {
    this.ours = new Set(codes.filter(Boolean));
  }

  status() {
    const s = session.state;
    return {
      joiner: true,
      doing: this.doing,
      as: this.who?.name ?? null,
      room: this.room ? `${this.room.code} (${this.room.host}'s)` : null,
      code: this.room?.code ?? '',
      until: this.doing === 'resting' ? new Date(this.until).toTimeString().slice(0, 5) : null,
      phase: s?.phase ?? null,
      players: s?.players.map((p) => `${p.name}${p.connected ? '' : ' (away)'}: ${p.score}`) ?? [],
    };
  }

  private async scout() {
    if (!this.timer) return;
    if (this.doing === 'looking') {
      const rooms: RoomInfo[] = [];
      try {
        await scanRooms((r) => rooms.push(r), () => !this.timer || this.doing !== 'looking');
      } catch {
        /* the matchmaking server can't be reached: look again later */
      }
      if (this.timer && this.doing === 'looking') this.consider(rooms, Date.now());
    }
    this.scoutTimer = setTimeout(() => void this.scout(), between(...SCOUT_EVERY));
  }

  /** Keeps track of hosts waiting alone, and joins the one that has waited its while. */
  private consider(rooms: RoomInfo[], now: number) {
    const lonely = rooms.filter(
      (r) => joinable(r) && r.players === 1 && !this.ours.has(r.code) && now - (this.visited.get(r.code) ?? -Infinity) > AGAIN_AFTER_MS,
    );
    const codes = new Set(lonely.map((r) => r.code));
    for (const code of this.alone.keys()) if (!codes.has(code)) this.alone.delete(code);
    for (const r of lonely) if (!this.alone.has(r.code)) this.alone.set(r.code, { since: now, wait: between(...WAIT_ALONE) });
    const due = lonely.filter((r) => now - this.alone.get(r.code)!.since >= this.alone.get(r.code)!.wait);
    if (!due.length) return;
    due.sort((a, b) => this.alone.get(a.code)!.since - this.alone.get(b.code)!.since);
    void this.join(due[0], now);
  }

  private async join(room: RoomInfo, now: number) {
    // Several guests at once: the runner gives a room to the first to ask, so two never join the same one.
    this.doing = 'joining';
    if (claimRoom && !(await claimRoom(room.code))) {
      this.ours.add(room.code);
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
    this.alone.delete(room.code);
    this.gamesLeft = between(...GAMES);
    this.until = Date.now() + JOIN_GIVE_UP_MS;
    this.lastPhase = '';
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
    if (this.doing === 'looking') return;
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
    if (!s || session.status !== 'ready') return;
    this.player?.play(s);
    this.notePhase(s.phase);
    if (s.phase === 'lobby') {
      this.lobbySince ||= now;
      this.lobbyPatience ||= between(...LOBBY_PATIENCE);
      // Alone with the host gone quiet, or a host who never starts.
      if (now - this.lobbySince > this.lobbyPatience) return this.leave(now, 'the host never started');
    } else this.lobbySince = this.lobbyPatience = 0;
    if (s.phase === 'over') {
      this.overAt ||= now + between(6000, 15000);
      if (this.gamesLeft <= 0 && now >= this.overAt) return this.leave(now, 'had enough');
    } else this.overAt = 0;
  }

  /** Counts the games played, and says how the eyes did at each reveal (the log only). */
  private notePhase(phase: string) {
    if (phase === this.lastPhase) return;
    const s = session.state!;
    const seen = lastReading;
    if (phase === 'reveal' && s.reveal && seen && seen.qid === s.question?.askedAt)
      log(`eyes saw option ${seen.index + 1} (by ${seen.margin.toFixed(2)}), it was ${s.reveal.correctIndex + 1}`);
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
    }
    this.lastPhase = phase;
  }
}
