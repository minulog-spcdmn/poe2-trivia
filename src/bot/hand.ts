// The room bot's hand: its pointer, as the other players see it (shown in
// the lobby, a game and its end, never in a race: src/lib/cursors.ts). It
// moves as a person's did: it replays stretches of recorded play (motion.ts),
// fitted to the moment. Its own turn, it looks the cards or the question over
// as the recorded player did one like it, for as long as it takes to make up
// its mind, resting on what it leans to and what it's torn between where they
// rested on theirs, then reaches for its pick and clicks; moving on after a reveal, it reaches
// for Next. On someone else's turn it waits as the recorded player waited,
// mostly still, now and then a little move or a click at nothing; in the
// lobby and at the end, the same. A click is a press seen by everyone, and
// its action goes as the button is let go, as a browser's does.
// Each place is sent on the element nearest it (an answer, a card, the art,
// a row), even off it, so it keeps its place beside what's on every screen,
// whatever the screen's shape.

import type { GameState, Question } from '../lib/game';
import { LIT, MOUSE, OFF, PRESSED, SCALE, SEND_EVERY_MS, actionOf, anchorCode, clickableFor, cursorsLive, type CursorAt, type PointerKind } from '../lib/cursors';
import { session } from '../lib/session.svelte';
import type { Persona } from './brain';
import { aimIn, layout as roomLayout, type Box, type Spot } from './reach';
import { ROOM, STEP, frameOf, leadTrack, pickClick, pickStream, place, reachTrack, streamTrack, trackAt, waver, within, type ClickStretch, type Stretch, type Track, type Waver } from './motion';
import { between } from './util';

/** A reach takes about this long (ms), as recorded: to begin a click early enough by. */
const REACH_MS = 550;
/** On the cards or answers while they come in (ms), the hand's place goes on the room, not on them (they're still flying in). */
const SETTLE_MS = 1200;
/** Between stretches of waiting or of the lobby, it rests this long (ms). */
const REST_MS: [number, number] = [600, 4000];
const LOBBY_REST_MS: [number, number] = [2000, 12000];

/** Where things are for the player on this page. */
const layout = (s: GameState) => roomLayout(s, session.myPlayerId ?? '');

/** The hand of whoever plays on this page now (the seat's current player): moved ten times a second, as a real tab sends. */
let current: Hand | null = null;
setInterval(() => current?.tick(), SEND_EVERY_MS);
// For scripts that watch a bot on the dev server (as src/main.ts gives the session).
if (import.meta.env.DEV) Object.assign(globalThis, { __hand: () => current });

type Frame = 'cards' | 'answers' | 'room';

export class Hand {
  private at: Spot = { x: 480 + Math.random() * 40, y: 600 + Math.random() * 100 };
  /** What it's replaying, and what the track's places are in thousandths of. */
  private track: Track | null = null;
  private frame: Frame = 'room';
  /** Where that frame was when the track began: the track is laid onto it once, so a new screen doesn't move the hand. */
  private trackBox: Box = [150, 250, 850, 800];
  /** Where it waits, its own: its waiting stretches shifted this far (thousandths of the frame), so no two bots rest on the same spot. */
  private readonly aside: [number, number] = [-350 + Math.random() * 500, -250 + Math.random() * 450];
  /** Where on an answer or a card it tends to rest and click, its own (thousandths of it, from the recorded spot): not all on one spot. */
  private readonly grip: [number, number] = [between(-300, 300), between(-250, 250)];
  /** The stretch its next click reaches with (picked as it looks things over), and for what. */
  private pending: { kind: ClickStretch['kind']; e: ClickStretch; w: Waver } | null = null;
  /** The stretches it replayed lately, not to be taken again soon. */
  private used: Stretch[] = [];
  /** Clicks at nothing due in a stream it's replaying. */
  private presses: number[] = [];
  private pressedUntil = 0;
  /** When it may set off on another stretch of waiting or of the lobby. */
  private restUntil = 0;
  private sentAt = 0;
  private sent = 'null';
  /** The anchor it's clicking, while it reaches for it. */
  private on: string | null = null;
  /** The screen it last clicked its pick on: done there, it waits as on anyone else's turn. */
  private acted = '';
  /** Which screen that is, and since when. */
  private screen = '';
  private screenAt = 0;
  /** The state it last saw, for where things are. */
  private s: GameState | null = null;

  constructor(private readonly persona: Persona) {}

  /** Its own touch: how much slower or quicker it moves than the recorded hand. */
  private get speed() {
    return this.persona.hand.speed * this.persona.pace ** 0.3;
  }

  /** Whether its pointer is shown now: in a game that shows pointers, with a seat in it. */
  private live(s: GameState | null = this.s) {
    return !!s && session.status === 'ready' && cursorsLive(s) && s.players.some((p) => p.id === session.myPlayerId);
  }

  /** How long a click takes it once it sets off (ms): to begin early enough by (nothing while no pointer is shown). */
  lead() {
    return this.live() ? Math.round(REACH_MS * this.speed) : 0;
  }

  /** The frame's box now: what's on screen to lay a stretch onto. */
  private box(f: Frame, s: GameState | null = this.s): Box {
    const l = s ? layout(s) : new Map<string, Box>();
    const of = (pick: (k: string) => boolean) => frameOf([...l].filter(([k]) => pick(k)).map(([, b]) => b));
    const answers = of((k) => k.startsWith('opt:') || k === 'art');
    const cards = of((k) => k.startsWith('card:'));
    const room = s?.phase === 'lobby' ? of((k) => k.startsWith('row:') || k.startsWith('card:')) : s?.phase === 'over' ? of((k) => k.startsWith('row:') || k === 'art') : null;
    const pick = f === 'cards' ? (cards ?? answers) : f === 'answers' ? (answers ?? cards) : (room ?? answers ?? cards);
    return pick ?? [150, 250, 850, 800];
  }

  /** What a stretch of waiting is laid onto, as the screen is now. */
  private waitFrame(s: GameState): Frame {
    return s.phase === 'choosing' ? 'cards' : s.phase === 'question' || s.phase === 'reveal' ? 'answers' : 'room';
  }

  /** Sets off on `track`, laid onto `frame`. */
  private follow(track: Track, frame: Frame) {
    this.track = track;
    this.frame = frame;
    this.trackBox = this.box(frame);
  }

  /** Looks the cards over, as the recorded player did, until it reaches for one at `until`. */
  lookOverCards(_n: number, until: number) {
    this.lookOver('card', 'cards', until);
  }

  /**
   * Looks a question over, as the recorded player did one like it, until it
   * reaches for its answer at `until`; `torn`: what it leans to first, then
   * what else it's torn between (answer indices).
   */
  ponder(q: Question, until: number, torn: number[] = []) {
    this.lookOver('answer', 'answers', until, torn, q.mode, q.labels.length);
  }

  private lookOver(kind: 'card' | 'answer', frame: Frame, until: number, torn: number[] = [], mode?: string, n?: number) {
    const s = this.s ?? session.state;
    if (!s) return;
    const now = Date.now();
    const e = pickClick(kind, until - now, Math.random, { mode, n, used: new Set(this.used) });
    if (!e) return;
    this.remember(e);
    const w = waver(Math.random);
    this.pending = { kind, e, w };
    this.presses = [];
    const onto = this.onto(kind === 'card' ? 'card:' : 'opt:', e, torn, this.box(frame, s), s);
    // It takes in what's come up before its hand stirs, its own while: the room's hands don't all set off as one.
    const start = now + Math.min(between(150, 1300) * (0.6 + 0.8 * this.persona.hand.still), (until - now) * 0.35);
    this.follow(leadTrack(e, within(this.where(now), this.box(frame, s), e.src), start, until, this.speed, { onto, w }), frame);
  }

  /**
   * Where the recorded player's rests (on their answers or cards) go on this
   * bot's: on what it leans to (`torn`'s first) where they rested on what
   * they picked, on what else it's torn between where they rested on others,
   * then on the rest, each to the same one of its own every time.
   */
  private onto(prefix: string, e: ClickStretch, torn: number[], f: Box, s: GameState) {
    const l = layout(s);
    const count = [...l.keys()].filter((k) => k.startsWith(prefix)).length;
    const lean = torn[0] ?? Math.floor(Math.random() * count);
    const rest = Array.from({ length: count }, (_, i) => i).filter((i) => !torn.includes(i));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const queue = [...torn.slice(1), ...rest];
    const mine = new Map<number, number>();
    return (index: number, on: [number, number]): [number, number] | null => {
      let to = mine.get(index);
      if (to === undefined) {
        to = index === e.pick ? lean : (queue.shift() ?? lean);
        mine.set(index, to);
      }
      const b = l.get(`${prefix}${to}`);
      return b ? within(place(...this.held(on), b), f, e.src) : null;
    };
  }

  /**
   * Reaches for `anchor` and presses, as a click does (the recorded hand's
   * reach, onto its own pick); resolves as it lets go, for the action to go
   * then. At once when no pointer is shown. `by` (Date.now): when it must
   * have pressed at the latest (the clock's end), the hand hurrying to make it.
   */
  async click(anchor: string, by = Infinity): Promise<void> {
    const s = session.state;
    if (!this.live(s)) return;
    const box = layout(s!).get(anchor);
    if (!box) return;
    const kind: ClickStretch['kind'] = anchor.startsWith('opt:') ? 'answer' : anchor.startsWith('card:') ? 'card' : 'next';
    const e = this.pending?.kind === kind ? this.pending.e : pickClick(kind, 0, Math.random, { used: new Set(this.used) });
    const w = this.pending?.kind === kind ? this.pending.w : waver(Math.random);
    this.pending = null;
    this.presses = [];
    if (!e) return;
    this.remember(e);
    const frame: Frame = kind === 'card' ? 'cards' : 'answers';
    const f = this.box(frame, s);
    // Where in it the click lands: as the recorded click did in what it pressed (Next's spot wasn't kept: around its middle).
    const aim = kind === 'next' ? aimIn(box, Math.random) : place(...this.held(e.aim as [number, number]), box);
    const now = Date.now();
    // Hurrying for the clock: the reach no longer than there's time for.
    const room = by - now;
    const natural = (e.reach.length / 2 - 1) * STEP * this.speed;
    const speed = natural > room * 0.9 ? this.speed * Math.max(0.3, (room * 0.9) / natural) : this.speed;
    this.on = anchor;
    this.follow(reachTrack(e, within(this.where(now), f, e.src), within(aim, f, e.src), now, speed, w), frame);
    const end = this.track!.t[this.track!.t.length - 1];
    await wait(Math.max(0, end - Date.now()));
    const pressed = Date.now();
    this.pressedUntil = pressed + e.hold;
    this.send(true);
    this.acted = this.screen;
    // Then a while before its hand drifts off, as when waiting.
    this.restUntil = pressed + between(...REST_MS) * (0.5 + this.persona.hand.still);
    // The click is the letting go, as a browser's is: what it does happens then, with the press seen first.
    await wait(e.hold);
  }

  /** A recorded spot on an answer or a card (thousandths of it), moved by the bot's own grip, and kept well on it. */
  private held([u, v]: [number, number]): [number, number] {
    const on = (x: number) => Math.min(920, Math.max(80, x));
    return [on(u + this.grip[0]), on(v + this.grip[1])];
  }

  /** Keeps the last few stretches it replayed. */
  private remember(e: Stretch) {
    if (!this.used.includes(e)) this.used.push(e);
    if (this.used.length > 24) this.used.shift();
  }

  private where(now: number): Spot {
    if (this.track) {
      const [u, v, src] = trackAt(this.track, now);
      const p = place(u, v, this.trackBox, src);
      // Never off its screen.
      this.at = { x: Math.min(ROOM[0] - 15, Math.max(15, p.x)), y: Math.min(ROOM[1] - 10, Math.max(10, p.y)) };
      if (now >= this.track.t[this.track.t.length - 1]) this.track = null;
    }
    return this.at;
  }

  /** Called as the bot plays: this is the hand on the page now (it moves by itself from here). */
  update(s: GameState) {
    this.s = s;
    current = this;
  }

  /** Moves on, and sends where it is (only when it moved). */
  tick() {
    const s = session.state ?? this.s;
    if (!s) return this.send(false);
    this.s = s;
    const now = Date.now();
    const screen = `${s.phase}:${s.round}:${s.turnCount}:${s.question?.askedAt ?? 0}`;
    if (screen !== this.screen) {
      this.screen = screen;
      this.screenAt = now;
      this.on = null;
      // A click it was about to make on what's gone: not any more.
      if (this.pending && s.phase !== 'choosing' && s.phase !== 'question') this.pending = null;
      // Waiting on the next screen begins a while in, its own while: not all the room's hands at once.
      if (!this.track) this.restUntil = Math.max(this.restUntil, now + between(400, 4000) * (0.5 + this.persona.hand.still));
    }
    if (!this.live(s)) {
      this.track = null;
      return this.send(false);
    }
    // Nothing of its own to do (someone else's turn, the lobby, the end): it waits as the recorded player waited.
    if (!this.track && !this.pending && this.idle(s) && now >= this.restUntil) {
      const lobby = s.phase === 'lobby' || s.phase === 'over';
      const e = pickStream(lobby ? 'lobby' : 'wait', Math.random, new Set(this.used));
      const frame = lobby ? 'room' : this.waitFrame(s);
      if (e) {
        this.remember(e);
        const { track, presses } = streamTrack(e, within(this.where(now), this.box(frame, s), e.src), now, this.speed, waver(Math.random), Math.random, this.aside);
        this.follow(track, frame);
        // The recorded player clicked at nothing a lot; it, about half as often.
        this.presses = presses.filter(() => Math.random() < 0.5);
        const end = track.t[track.t.length - 1];
        this.restUntil = end + between(...(lobby ? LOBBY_REST_MS : REST_MS)) * (0.5 + this.persona.hand.still);
      }
    }
    // A click at nothing on the way (never on an answer or a card: that would look like a pick).
    if (this.presses.length && now >= this.presses[0]) {
      this.presses.shift();
      const p = this.where(now);
      if (![...layout(s)].some(([k, b]) => (k.startsWith('opt:') || k.startsWith('card:') || k === 'next') && p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3]))
        this.pressedUntil = now + between(70, 120);
    }
    this.send(true);
  }

  /** Nothing of its own to do: someone else's turn, its pick made, a reveal, the lobby, the end. */
  private idle(s: GameState) {
    if (s.phase === 'lobby' || s.phase === 'over' || s.phase === 'reveal' || this.acted === this.screen) return true;
    const me = session.myPlayerId;
    if (s.delve) return false;
    return s.settings.mode === 'turns' && s.players[s.turn]?.id !== me;
  }

  /**
   * Where a spot goes on the wire: on the element nearest it (an answer, a
   * card, the art, Next, a row; the one it's clicking first), in that
   * element's terms even when off it, so on every screen it keeps its place
   * beside what's there; on the room as a whole when nothing's near, or while
   * the screen's elements are still coming in.
   */
  private placed(spot: Spot, boxes: Map<string, Box>, now: number): [number, number, number] | null {
    const s = this.s;
    const settled = now - this.screenAt > SETTLE_MS;
    const rel = (b: Box): [number, number] => [((spot.x - b[0]) / (b[2] - b[0])) * SCALE, ((spot.y - b[1]) / (b[3] - b[1])) * SCALE];
    // No further off it than the wire allows.
    const fits = ([x, y]: [number, number]) => x >= -OFF && x <= SCALE + OFF && y >= -OFF && y <= SCALE + OFF;
    // In a game, the big things on screen (the answers, the cards, the art, Next): a place between or beside them keeps
    // its place beside them on every screen, however wide; in the lobby and at the end, the rows and the modes too.
    const game = s?.phase === 'choosing' || s?.phase === 'question' || s?.phase === 'reveal';
    const big = (k: string) => k.startsWith('opt:') || k.startsWith('card:') || k === 'art' || k === 'next' || (!game && k.startsWith('row:'));
    let best: [string, [number, number]] | null = null;
    if (this.on && boxes.has(this.on) && fits(rel(boxes.get(this.on)!))) best = [this.on, rel(boxes.get(this.on)!)];
    if (!best && settled) {
      let d = Infinity;
      for (const [k, b] of boxes) {
        if (!big(k)) continue;
        const r = rel(b);
        const far = Math.hypot(Math.max(b[0] - spot.x, 0, spot.x - b[2]), Math.max(b[1] - spot.y, 0, spot.y - b[3]));
        if (far < d && fits(r)) {
          d = far;
          best = [k, r];
        }
      }
    }
    if (best) {
      const code = anchorCode(best[0]);
      if (code !== null) return [code, Math.round(best[1][0]), Math.round(best[1][1])];
    }
    const code = anchorCode('game');
    const clamp = (v: number) => Math.round(Math.min(SCALE, Math.max(0, v)));
    return code === null ? null : [code, clamp(spot.x), clamp(spot.y)];
  }

  /** Sends where the pointer is, if it moved (`on`: on the page). */
  private send(on: boolean) {
    const now = Date.now();
    let at: CursorAt | null = null;
    if (on && this.s) {
      // A hand at rest sends nothing (a mouse lying still doesn't move): the others' screens dim it, as they do anyone's.
      const spot = this.where(now);
      const boxes = layout(this.s);
      const p = this.placed(spot, boxes, now);
      // Over something it can click (its answer, its card, Next when it may), its cursor would be the hand: so it shows.
      const me = session.myPlayerId ?? '';
      const lit = [...boxes].some(([k, b]) => spot.x >= b[0] && spot.x <= b[2] && spot.y >= b[1] && spot.y <= b[3] && clickableFor(this.s!, me, k) === true);
      if (p) at = [p[0], p[1], p[2], ((now < this.pressedUntil ? PRESSED : MOUSE) + (lit ? LIT : 0)) as PointerKind];
    }
    // Only when the hand moved, or pressed, or came or went: not because what it's placed on changed (a new screen),
    // which on another screen could put it somewhere else, every bot at once.
    const spot = at ? this.at : null;
    const key = spot && at ? `${Math.round(spot.x)},${Math.round(spot.y)},${at[3]}` : 'null';
    const plain = !at || actionOf(at[3]) === MOUSE;
    // A press always goes; anything else only when it changed, and not too often.
    if (key === this.sent || (plain && at && now - this.sentAt < SEND_EVERY_MS - 10)) return;
    this.sent = key;
    this.sentAt = now;
    session.pointAt(at);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
