// The room bot's hand: its pointer, as the other players see it (shown in a
// game, never in a race: src/lib/cursors.ts). It moves the way a hand on a
// mouse does (reach.ts): a slight curve, quick in the middle and slow at
// both ends, longer the further it goes. While making up its mind it looks
// the choice over (the art, then the answers or the cards); a click is the
// hand getting there, then pressing. Between times it rests, drifts, wanders
// to the art or its own row on the scoreboard, and now and then leaves the
// page a while. It never hovers an answer on someone else's turn (that
// would be a hint). On a phone (Persona.touch) there is no pointer to see
// until a tap, which shows where it landed.

import type { GameState, Question } from '../lib/game';
import { MOUSE, PRESSED, SEND_EVERY_MS, TAP, anchorCode, cursorsLive, type CursorAt, type PointerKind } from '../lib/cursors';
import { session } from '../lib/session.svelte';
import type { Persona } from './brain';
import { aimIn, along, layout, placeOf, reachTime, stroke, type Box, type Spot, type Stroke } from './reach';
import { between } from './util';

/** A press shows this long (ms). */
const PRESS_MS: [number, number] = [90, 180];
/** Resting at a target a moment before pressing (ms). */
const SETTLE_MS: [number, number] = [60, 220];
/** Between two of its own idle moves (ms). */
const IDLE_EVERY: [number, number] = [2500, 9000];
/** Off the page (looking elsewhere), now and then: the chance at each idle move, and for how long (ms). */
const AWAY_CHANCE = 0.04;
const AWAY_MS: [number, number] = [8000, 40000];
/** Looking something over before choosing: on each for this long (ms). */
const DWELL_MS: [number, number] = [500, 1400];

/** The hand of whoever plays on this page now (the seat's current player): moved ten times a second, as a real tab sends. */
let current: Hand | null = null;
setInterval(() => current?.tick(), SEND_EVERY_MS);

/** Something it looks over on the way to a choice: an anchor, until then. */
interface Look {
  anchor: string;
  at: number;
}

export class Hand {
  private at: Spot = { x: 480 + Math.random() * 40, y: 600 + Math.random() * 100 };
  private move: Stroke | null = null;
  /** Looking things over before it chooses (each in turn, until the last's time). */
  private looks: Look[] = [];
  private pressedUntil = 0;
  /** Off the page until then (0: on it). */
  private awayUntil = 0;
  private nextIdle = 0;
  private sentAt = 0;
  private sent = 'null';
  /** The anchor it went to on purpose (looking it over, clicking it), while the screen it was on lasts. */
  private on: string | null = null;
  /** Which screen that is (a choice, a question with its reveal). */
  private screen = '';
  /** The state it last saw, for where things are. */
  private s: GameState | null = null;

  constructor(private readonly persona: Persona) {}

  /** Whether its pointer is shown now: in a game that shows pointers, with a seat in it. */
  private live(s: GameState | null = this.s) {
    return !!s && session.status === 'ready' && cursorsLive(s) && s.players.some((p) => p.id === session.myPlayerId);
  }

  /** How long a click takes it from where it is (ms): to schedule a click early by (nothing while no pointer is shown). */
  lead() {
    if (!this.live()) return 0;
    if (this.persona.touch) return 250;
    return reachTime(350, 70, this.persona.pace, () => 0.5) + 150;
  }

  /** Looks things over (anchors) before choosing, until `until`: each a while, in turn, never the same twice running. */
  lookOver(anchors: string[], until: number) {
    this.looks = [];
    if (!anchors.length) return;
    const now = Date.now();
    let t = now + between(150, 500);
    let last = '';
    while (t < until - 300) {
      const pick = anchors.filter((a) => a !== last);
      const anchor = pick[Math.floor(Math.random() * pick.length)] ?? anchors[0];
      this.looks.push({ anchor, at: t });
      last = anchor;
      t += between(...DWELL_MS) * this.persona.pace;
    }
  }

  /** What it looks over while making up its mind about a question: the art first, then (unsure) some of the answers. */
  ponder(q: Question, until: number, unsure: boolean) {
    // A question that shows the pictures has no labels; one not shown yet has none either.
    const options = q.labels.map((_, i) => `opt:${i}`).filter((_, i) => q.mode === 'art' || q.labels[i] !== null);
    const art = q.mode === 'art' ? [] : ['art'];
    const pool = unsure ? options : [];
    this.lookOver([...art, ...art, ...pool], until);
  }

  /**
   * Moves to `anchor` and presses, as a click does (on a phone, a tap);
   * resolves as it presses, for the action to go then. At once when no
   * pointer is shown. `by` (Date.now): when it must have pressed at the
   * latest (the clock's end), the hand hurrying to make it.
   */
  async click(anchor: string, by = Infinity): Promise<void> {
    this.looks = [];
    const s = session.state;
    if (!this.live(s)) return;
    const box = layout(s!).get(anchor);
    if (!box) return;
    const target = aimIn(box, Math.random);
    const room = () => Math.max(0, by - Date.now());
    if (this.persona.touch) {
      await wait(Math.min(between(150, 350), room()));
      this.at = target;
      this.on = anchor;
      this.send(true, TAP);
      return;
    }
    this.awayUntil = 0;
    const ms = this.goTo(target, box, anchor, room() * 0.8);
    // No idle wandering off it before the press.
    this.nextIdle = Date.now() + ms + 1000 + between(...IDLE_EVERY);
    await wait(Math.min(ms + between(...SETTLE_MS) * this.persona.pace, room()));
    this.pressedUntil = Date.now() + between(...PRESS_MS);
    this.send(true);
  }

  /** Sets off for `to` (in `box`, for its size, the anchor `on`, if it goes there on purpose), from wherever it is now, in `most` ms at most; how long it takes (ms). */
  private goTo(to: Spot, box?: Box, on: string | null = null, most = Infinity) {
    const now = Date.now();
    this.on = on;
    const from = this.where(now);
    const size = box ? Math.min(box[2] - box[0], box[3] - box[1]) : 60;
    const ms = Math.min(most, reachTime(Math.hypot(to.x - from.x, to.y - from.y), size, this.persona.pace * (1 - 0.25 * this.persona.haste), Math.random));
    this.move = stroke(from, to, now, ms, Math.random);
    return ms;
  }

  private where(now: number): Spot {
    if (this.move) {
      this.at = along(this.move, now);
      if (now >= this.move.end) this.move = null;
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
    // Another screen: what it went to on purpose is gone (or moving), so its spot goes on the game as a whole until it goes somewhere again.
    const screen = `${s.phase === 'choosing' ? 'choice' : 'question'}:${s.round}:${s.turnCount}:${s.question?.askedAt ?? 0}`;
    if (screen !== this.screen) {
      this.screen = screen;
      this.on = null;
    }
    if (!this.live(s) || this.persona.touch) {
      this.looks = [];
      return this.send(false);
    }
    if (this.awayUntil && now < this.awayUntil) return this.send(false);
    if (this.awayUntil) {
      // Back on the page: somewhere along its edge, toward the middle.
      this.awayUntil = 0;
      this.at = { x: Math.random() < 0.5 ? 30 : 970, y: 300 + Math.random() * 500 };
    }
    const look = this.looks[0];
    if (look && now >= look.at) {
      this.looks.shift();
      const box = layout(s).get(look.anchor);
      if (box) this.goTo(aimIn(box, Math.random), box, look.anchor);
      this.nextIdle = now + between(...IDLE_EVERY);
    } else if (!this.looks.length && !this.move && now >= this.nextIdle) this.idle(s, now);
    this.send(true);
  }

  /** Nothing to do: it rests, drifts a little, wanders to the art or its own row, or leaves the page a while. */
  private idle(s: GameState, now: number) {
    this.nextIdle = now + between(...IDLE_EVERY) * this.persona.pace;
    const r = Math.random();
    if (r < AWAY_CHANCE) {
      this.awayUntil = now + between(...AWAY_MS);
      return;
    }
    const boxes = layout(s);
    const mine = s.players.findIndex((p) => p.id === session.myPlayerId);
    // Never an answer, unless it's its own to give: hovering one on someone else's turn would be a hint.
    if (r < 0.2 && boxes.has('art')) this.goTo(aimIn(boxes.get('art')!, Math.random), boxes.get('art'), 'art');
    else if (r < 0.32 && mine >= 0 && boxes.has(`row:${mine}`)) this.goTo(aimIn(boxes.get(`row:${mine}`)!, Math.random), boxes.get(`row:${mine}`), `row:${mine}`);
    else if (r < 0.75) {
      const a = Math.random() * Math.PI * 2;
      const d = 15 + Math.random() * 60;
      const to = { x: this.at.x + Math.cos(a) * d, y: this.at.y + Math.sin(a) * d };
      // Not onto an answer by accident either.
      if (![...boxes].some(([k, b]) => k.startsWith('opt:') && to.x >= b[0] && to.x <= b[2] && to.y >= b[1] && to.y <= b[3])) this.goTo(to);
    }
    // Otherwise it rests where it is.
  }

  /** Sends where the pointer is, if it moved (`on`: on the page; `kind`: what it is doing). */
  private send(on: boolean, kind?: PointerKind) {
    const now = Date.now();
    let at: CursorAt | null = null;
    if (on && this.s) {
      // A hand at rest sends nothing (a mouse lying still doesn't move): the others' screens dim it, as they do anyone's.
      const p = placeOf(this.where(now), layout(this.s), this.on);
      const code = anchorCode(p.anchor);
      if (code !== null) at = [code, p.x, p.y, kind ?? (now < this.pressedUntil ? PRESSED : MOUSE)];
    }
    const key = JSON.stringify(at);
    const plain = !at || at[3] === MOUSE;
    // A tap is shown once, whatever came before; a press always goes; anything else only when it changed, and not too often.
    if (kind !== TAP && (key === this.sent || (plain && at && now - this.sentAt < SEND_EVERY_MS - 10))) return;
    this.sent = kind === TAP ? 'null' : key;
    this.sentAt = now;
    session.pointAt(at);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
