// The room bot as a guest: someone at a seat (seat.ts) who came on to play
// in someone else's room. They go through each new room list, and join a
// lobby whose host has been waiting there alone for a while, so nobody waits
// for company for long (or, after a longer while, one with others in it
// already, as long as it has a seat): the one that appeals to them most
// (choice.ts: their taste in rules and company, how they got on with the
// host before), as long as it appeals enough, which asks less the longer
// they look. They play a game or a few there as any guest would (player.ts,
// with the eyes of sight.ts: a guest never gets the answers), then leave,
// and say how it went. People's rooms first: our own bot rooms only while
// no one else's lobby is open. Never back to a room the seat was in lately.
// Several may end up in the same room, arriving one after another (the
// runner spaces them out, and keeps to --per-room guests a room if asked).
// Finding nothing to join for long, they give up; the seat may have them
// open a room of their own instead, if one is wanted.

import { session } from '../lib/session.svelte';
import type { RoomInfo } from '../lib/rooms';
import { nameSkeleton } from '../lib/names';
import type { Identity } from './identities';
import { staysOn, type Mood } from './brain';
import { appeal, settlesFor, type Visit } from './choice';
import { joinable, notJoinable, waitingAlone, watchable } from './wanted';
import { moodOf, Player } from './player';
import { lastReading, sight } from './sight';
import { Afk } from './afk';
import { between, log, playersLine } from './util';

/** A host alone in their lobby this long (ms, from..to, rolled for each room) gets company. */
const WAIT_ALONE: [number, number] = [3000, 10000];
/** A lobby with company already: seen this long, and another may come along (ms, from..to). */
const WAIT_MORE: [number, number] = [8000, 25000];
/** Turned away for now (the runner spaces arrivals in a room): asks again this soon (ms, from..to). */
const ASK_AGAIN: [number, number] = [3000, 8000];
/** The room they came to join, when a host made way for it (ms, from..to). */
const WAIT_PREFERRED: [number, number] = [3000, 10000];
/** Games played in a room before leaving (from..to). */
const GAMES: [number, number] = [1, 3];
/** A newcomer's: trying it out. */
const NEW_GAMES: [number, number] = [1, 2];
/** A room left isn't joined again from the same seat for this long. */
export const AGAIN_AFTER_MS = 60 * 60000;
/** The chance, each game, that they have to go before the end. */
const MID_GAME_DROP = 0.02;
/** Joining that hasn't got in by then is given up. */
const JOIN_GIVE_UP_MS = 45000;
/** The host gone (the link lost) this long: the guest gives up on the room. */
const HOST_GONE_MS = 30000;
/** A lobby whose host doesn't start in this long is left (ms, from..to). */
const LOBBY_PATIENCE: [number, number] = [5 * 60000, 9 * 60000];
/** Waiting in a lobby this long before they may tab out. */
const LOBBY_BORED_MS = 45000;
/** Nothing to join for this long (ms, from..to): they give up looking. */
const LOOK_PATIENCE: [number, number] = [4 * 60000, 10 * 60000];

/** The runner's say over which guest takes which room (scripts/room-bot.mjs), when it gives one. */
const { __claimRoom: claimRoom, __releaseRoom: releaseRoom } = window as unknown as {
  __claimRoom?: (code: string) => Promise<boolean>;
  __releaseRoom?: (code: string) => Promise<void>;
};

/** `asking`: waiting for the runner's yes to a room (claimRoom), before joining. */
type Doing = 'looking' | 'asking' | 'joining' | 'playing';

export class Guest {
  private doing: Doing = 'looking';
  private player: Player | null = null;
  private room: RoomInfo | null = null;
  /** Lobbies they could join: since when they have seen each, and how long until they do. */
  private waiting = new Map<string, { since: number; wait: number }>();
  /** Those lobbies as the last list showed them, and how much each appeals. */
  private open: RoomInfo[] = [];
  private appeals = new Map<string, number>();
  /** The last list as they saw it, for saying why nothing was joined. */
  private listed: RoomInfo[] = [];
  private lookingUntil = Date.now() + between(...LOOK_PATIENCE);
  /** Joining: given up on then. */
  private joinBy = 0;
  /** Done with this room (no games left): they go once the scores are down or the host moves on. */
  private finished = false;
  /** Since when the link to the host has been lost (0: it hasn't). */
  private lostSince = 0;
  private gamesLeft = 0;
  private lastPhase = '';
  private lobbySince = 0;
  private lobbyPatience = 0;
  private overAt = 0;
  /** When they have to go mid-game (0: they stay to the end). */
  private dropAt = 0;
  /** Gone (left, or never got in): nothing more to do. */
  private gone = false;
  private readonly since = Date.now();
  /** Games played to the end in this room, whether they won one, and how the last went. */
  private played = 0;
  private won = false;
  private lastMood: Mood = 'even';
  /** Tabbing out while a host takes their time to start (afk.ts). */
  private readonly afk: Afk;

  /**
   * `visited`: the rooms the seat was in, and when it left (shared by
   * everyone who sits there); `ours`: our own bot rooms' codes; `warmth`:
   * how they got on with a host before (-1 to 1); `until`: when their time
   * is up (they finish the game they're in); `prefer`: a room they mean to
   * join first (one their own room made way for); `watching`: they only
   * watch (the runner's --watch): any room with a spectator's seat free, a
   * game on or not, and they never answer.
   */
  constructor(
    readonly who: Identity,
    private readonly visited: Map<string, number>,
    private readonly ours: () => ReadonlySet<string>,
    private readonly warmth: (host: string) => number,
    readonly until: number,
    private readonly prefer = '',
    private readonly watching = false,
  ) {
    this.afk = new Afk(who.persona);
  }

  /** A room they could come into: to play, or (watching) to watch. */
  private canJoin(r: RoomInfo) {
    return this.watching ? watchable(r) : joinable(r);
  }

  /** Someone waiting alone for players: kept company first, but only by those who play. */
  private keepsCompany(r: RoomInfo, ours: ReadonlySet<string>) {
    return !this.watching && waitingAlone(r, ours);
  }

  /** Still looking for a room (not on their way into one). */
  get looking() {
    return this.doing === 'looking';
  }

  /** In a room, with a game on or its scores up (not looking, joining or in the lobby). */
  get inGame() {
    const phase = session.state?.phase;
    return this.doing === 'playing' && !!phase && phase !== 'lobby';
  }

  /** The runner is stopping: the game under way is their last (they leave once it is over). */
  lastGame() {
    this.dropAt = 0;
    this.gamesLeft = 0;
    if (session.state?.phase === 'over') this.finished = true;
  }

  /** Nothing to play in, and they won't open a room: they give up looking by `at`. */
  giveUpBy(at: number) {
    this.lookingUntil = Math.min(this.lookingUntil, at);
  }

  status() {
    const s = session.state;
    return {
      doing: this.doing,
      room: this.room ? `${this.room.code} (${this.room.host}'s)` : null,
      phase: this.room ? (s?.phase ?? null) : null,
      players: this.room ? playersLine(s) : [],
    };
  }

  /**
   * A new room list: while looking, keeps track of lobbies they could join
   * (a host alone soonest, one with company already after a longer while),
   * and how much each appeals. People's lobbies come first: one of our own
   * bot rooms only while there is no other. Which to join, and when, is
   * the tick's (pick), so a room's while is up when it's up, not at the
   * next list.
   */
  see(rooms: RoomInfo[], now: number) {
    if (this.doing !== 'looking') return;
    this.listed = rooms;
    const me = nameSkeleton(this.who.name);
    const fresh = rooms.filter((r) => this.canJoin(r) && now - (this.visited.get(r.code) ?? -Infinity) > AGAIN_AFTER_MS && nameSkeleton(r.host) !== me);
    const ours = this.ours();
    const theirs = fresh.filter((r) => !ours.has(r.code));
    const open = theirs.length ? theirs : fresh;
    const codes = new Set(open.map((r) => r.code));
    for (const code of this.waiting.keys()) if (!codes.has(code)) this.waiting.delete(code);
    for (const r of open)
      if (!this.waiting.has(r.code)) this.waiting.set(r.code, { since: now, wait: between(...(r.code === this.prefer ? WAIT_PREFERRED : this.keepsCompany(r, ours) ? WAIT_ALONE : WAIT_MORE)) });
    this.open = open;
    this.appeals = new Map(open.map((r) => [r.code, r.code === this.prefer ? Infinity : appeal(this.who.persona, this.who.prefs, r, this.warmth(r.host))]));
  }

  /**
   * Of the lobbies that have waited their while, joins the one that appeals
   * most, if it appeals enough; someone waiting alone in their own room is
   * kept company whatever its rules.
   */
  private pick(now: number) {
    const least = settlesFor((now - this.since) / 60000);
    const ours = this.ours();
    const due = this.open.filter((r) => {
      const w = this.waiting.get(r.code);
      return !!w && now - w.since >= w.wait && (this.appeals.get(r.code)! >= least || this.keepsCompany(r, ours));
    });
    if (!due.length) return;
    due.sort((a, b) => this.appeals.get(b.code)! - this.appeals.get(a.code)! || this.waiting.get(a.code)!.since - this.waiting.get(b.code)!.since);
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
    if (this.gone) {
      if (yes) void releaseRoom?.(room.code);
      return;
    }
    if (!yes) {
      this.waiting.set(room.code, { since: Date.now(), wait: between(...ASK_AGAIN) });
      this.doing = 'looking';
      return;
    }
    // Watching, they never answer: no hands to play with.
    this.player = this.watching ? null : new Player(this.who.persona, sight);
    this.room = room;
    this.waiting.delete(room.code);
    this.gamesLeft = between(...(this.who.persona.newcomer ? NEW_GAMES : GAMES));
    this.doing = 'joining';
    this.joinBy = Date.now() + JOIN_GIVE_UP_MS;
    log(`${this.who.name} ${this.watching ? 'watches' : 'joins'} ${room.host}'s room ${room.code} (${room.mode}), for ${this.gamesLeft} game${this.gamesLeft > 1 ? 's' : ''}`);
    session.join(room.code, this.who.name, this.watching);
  }

  /** Why each room in the last list wasn't joined, for the log (empty when none was listed). */
  private whyNot(now: number) {
    const least = settlesFor((now - this.since) / 60000);
    const me = nameSkeleton(this.who.name);
    const ours = this.ours();
    const theirs = this.listed.some((r) => this.canJoin(r) && !ours.has(r.code));
    const reasons = this.listed.map((r) => {
      const why =
        notJoinable(r, this.watching) ??
        (now - (this.visited.get(r.code) ?? -Infinity) <= AGAIN_AFTER_MS
          ? 'left it lately'
          : nameSkeleton(r.host) === me
            ? 'a host by the same name'
            : ours.has(r.code) && theirs
              ? "one of ours, while someone's own is open"
              : `not to their taste (${(this.appeals.get(r.code) ?? 0).toFixed(2)} of the ${least.toFixed(2)} they'd take)`);
      return `${r.host}'s ${r.code}: ${why}`;
    });
    return reasons.length ? `: ${reasons.join('; ')}` : '';
  }

  /** Leaves the room they're in (or on their way into), if any. */
  leave(now: number) {
    this.gone = true;
    this.afk.stop();
    if (this.room) {
      this.visited.set(this.room.code, now);
      void releaseRoom?.(this.room.code);
    }
    if (session.mode) session.leave();
    this.player = null;
    this.room = null;
  }

  /** How their time in a room went, by why they left it (null: they never were in one). */
  private visit(why: string): Visit | null {
    if (!this.room) return null;
    if (why === 'could not get in') return 'turned away';
    if (why === 'the host never started') return 'never started';
    if (!this.played) return why === 'had to go' ? null : 'room went';
    return this.won ? 'won' : this.lastMood === 'lost' ? 'lost heavily' : 'played';
  }

  /** Plays on; once they go (having left the room), why, and how it went with whose room. */
  tick(now: number): { why: string; visit: Visit | null; host: string } | null {
    const go = (why: string) => {
      const visit = this.visit(why);
      const host = this.room?.host ?? '';
      this.leave(now);
      return { why, visit, host };
    };
    if (this.doing === 'looking') {
      if (now > this.lookingUntil) return go(`found nothing to join${this.whyNot(now)}`);
      this.pick(now);
      return null;
    }
    if (this.doing === 'asking') return null;
    const s = session.state;
    const me = session.myPlayerId;
    // Turned away, kicked, or the room closed: the session let go.
    if (session.mode !== 'client') return go(this.doing === 'joining' ? 'could not get in' : 'the room went');
    if (this.doing === 'joining') {
      if (s && me && session.status === 'ready' && [...s.players, ...(s.spectators ?? [])].some((p) => p.id === me)) {
        this.doing = 'playing';
        log(`${this.who.name} is in`);
      } else if (now > this.joinBy) return go('could not get in');
      return null;
    }
    // The host gone for good (its link lost, the session given up on it): on to another room.
    if (session.status === 'lost' || session.gaveUp) {
      this.lostSince ||= now;
      if (session.gaveUp || now - this.lostSince > HOST_GONE_MS) return go('the host is gone');
      return null;
    }
    this.lostSince = 0;
    if (!s || session.status !== 'ready') return null;
    // Long in a lobby whose host hasn't started, now and then another tab; back quickly once the game starts.
    this.afk.tick(now, s.phase === 'lobby' && !!this.lobbySince && now - this.lobbySince > LOBBY_BORED_MS, s.phase !== 'lobby', true);
    if (!this.afk.isAway) this.player?.play(s);
    this.notePhase(s.phase);
    if (s.phase === 'lobby') {
      this.lobbySince ||= now;
      this.lobbyPatience ||= between(...LOBBY_PATIENCE);
      // Alone with the host gone quiet, or a host who never starts.
      if (now - this.lobbySince > this.lobbyPatience) return go('the host never started');
    } else this.lobbySince = this.lobbyPatience = 0;
    // Now and then real life calls, mid-game.
    if (this.dropAt && now >= this.dropAt && s.phase !== 'lobby' && s.phase !== 'over') return go('had to go');
    // Done here: off once the scores have been up a moment, or as soon as the host moves on, whichever is first.
    if (this.finished && (s.phase !== 'over' || now >= this.overAt)) return go('had enough');
    if (s.phase === 'over') this.overAt ||= now + between(6000, 15000);
    else this.overAt = 0;
    return null;
  }

  /** Counts the games played, and says how the eyes did at each reveal (the log only). */
  private notePhase(phase: string) {
    if (phase === this.lastPhase) return;
    const s = session.state!;
    const seen = lastReading;
    if (phase === 'reveal' && s.reveal && seen && seen.qid === s.question?.askedAt)
      log(`eyes saw option ${seen.index + 1} (by ${seen.margin.toFixed(2)}), it was ${s.reveal.correctIndex + 1}`);
    // A game starts: about one in fifty, they will have to go before the end.
    if ((this.lastPhase === '' || this.lastPhase === 'lobby' || this.lastPhase === 'over') && phase !== 'lobby' && phase !== 'over')
      this.dropAt = Math.random() < MID_GAME_DROP ? Date.now() + between(30000, 300000) : 0;
    if (phase === 'over') {
      this.gamesLeft--;
      this.played++;
      this.lastMood = moodOf(s, session.myPlayerId!);
      if (this.lastMood === 'won') this.won = true;
      // A win now and then makes it one more; a heavy loss now and then, that's it.
      const after = staysOn(this.lastMood, Math.random);
      if (after === 'longer') {
        this.gamesLeft++;
        log('won, plays one more');
      } else if (after === 'leave' && this.gamesLeft > 0) {
        this.gamesLeft = 0;
        log('lost heavily, leaves after this one');
      }
      // Out of games, or of time.
      if (this.gamesLeft <= 0 || Date.now() >= this.until) this.finished = true;
    }
    this.lastPhase = phase;
  }
}
