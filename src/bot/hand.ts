// The room bot's hand: its pointer, as the other players see it (shown in
// the lobby and a game, never in a race: src/lib/cursors.ts). It moves the
// way a hand on a mouse does (reach.ts): along an uneven curve with a slight
// wobble, quick early and slow into the end, longer the further it goes; a
// long reach falls short or runs past and corrects, a clumsy hand by more.
// What it does while it reads, thinks and waits is its own habit (habits.ts:
// parking the pointer aside, tracing what it reads, resting on what it's
// torn between, or never keeping still), as are its deftness and the bow of
// its strokes; a nervous one grows jittery as the clock runs out, a hasty
// one quick and sloppy. A click is the hand getting there, settling and
// pressing, and often drifting off a little after. Between times it rests
// (and dims, as anyone's does), drifts, wanders to the art, its own row or
// the row of whoever's turn it is, and now and then leaves the page a while.
// It never hovers an answer or a card on someone else's turn (that would be
// a hint). On a phone (Persona.touch) there is no pointer to see until a
// tap, which shows where it landed.

import type { GameState, Question } from '../lib/game';
import { MOUSE, PRESSED, SEND_EVERY_MS, TAP, anchorCode, cursorsLive, type CursorAt, type PointerKind } from '../lib/cursors';
import { session } from '../lib/session.svelte';
import type { Persona } from './brain';
import { aimIn, along, layout as roomLayout, placeOf, reach, reachTime, stroke, type Box, type Spot, type Stroke } from './reach';
import { circle, fidgets, readCards, readQuestion, type Glance, type Hands } from './habits';
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
/** While busy (looking things over, clicking) and for this long after, the hand shifts a little now and then (habits.ts fidgets). */
const BUSY_MS = 6000;
/** A fidgeting hand, at each of its shifts, circles instead this often. */
const CIRCLE_CHANCE = 0.35;
/** The clock this far gone (share of it left), it's urgent: a nervous hand grows jittery. */
const URGENT = 0.35;
/** After a click, it often drifts off a little: the chance, how soon (ms), how far (units). */
const AFTER_CLICK = 0.6;
const AFTER_MS: [number, number] = [180, 520];
const AFTER_DRIFT: [number, number] = [8, 32];

/** Where things are for the player on this page. */
const layout = (s: GameState) => roomLayout(s, session.myPlayerId ?? '');

/** The hand of whoever plays on this page now (the seat's current player): moved ten times a second, as a real tab sends. */
let current: Hand | null = null;
setInterval(() => current?.tick(), SEND_EVERY_MS);

export class Hand {
  private at: Spot = { x: 480 + Math.random() * 40, y: 600 + Math.random() * 100 };
  /** The strokes under way: a reach and its correction, each from where the last ends. */
  private moves: Stroke[] = [];
  /** Busy until then (looking over, clicking): small shifts of the hand meanwhile. */
  private busyUntil = 0;
  private nextFidget = 0;
  /** The drift off after a click: when, if it does. */
  private driftAt = 0;
  /** Looking things over before it chooses (each in turn, at its time), by its habit. */
  private looks: Glance[] = [];
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

  /** What it's like, as far as its hand goes. */
  private get hands(): Hands {
    return { style: this.persona.hand, pace: this.persona.pace, dither: this.persona.dither };
  }

  /** Its strokes: quicker and surer the defter its hand; hastier, quicker and sloppier. */
  private get speed() {
    return this.persona.pace * (1 - 0.25 * this.persona.haste) * (1.3 - 0.6 * this.persona.hand.deft);
  }
  private get sloppy() {
    return (1.6 - 1.2 * this.persona.hand.deft) * (1 + 0.5 * this.persona.haste);
  }

  /** Whether its pointer is shown now: in a game that shows pointers, with a seat in it. */
  private live(s: GameState | null = this.s) {
    return !!s && session.status === 'ready' && cursorsLive(s) && s.players.some((p) => p.id === session.myPlayerId);
  }

  /** How long a click takes it from where it is (ms): to schedule a click early by (nothing while no pointer is shown). */
  lead() {
    if (!this.live()) return 0;
    if (this.persona.touch) return 250;
    // The reach, its correction's beat, the settle.
    return reachTime(350, 70, this.speed, () => 0.5) + 250;
  }

  /** Goes by `glances` (habits.ts) until it sets off to choose at `until`. */
  private plan(glances: Glance[], until: number) {
    this.looks = glances;
    this.busyUntil = until + BUSY_MS;
  }

  /** Looks the cards over before picking one, by its habit. */
  lookOverCards(n: number, until: number) {
    const s = this.s ?? session.state;
    if (!s) return;
    const cards = Array.from({ length: n }, (_, i) => `card:${i}`);
    const boxes = layout(s);
    this.plan(readCards(this.hands, cards, cards.map((c) => boxes.get(c)).filter((b): b is Box => !!b), Date.now(), until, Math.random), until);
  }

  /** Looks a question over while making up its mind, by its habit (unsure: torn between a few). */
  ponder(q: Question, until: number, unsure: boolean) {
    const s = this.s ?? session.state;
    if (!s) return;
    // A question that shows the pictures has no labels; one not shown yet has none either.
    const options = q.labels.map((_, i) => `opt:${i}`).filter((_, i) => q.mode === 'art' || q.labels[i] !== null);
    const boxes = layout(s);
    this.plan(readQuestion(this.hands, options, q.mode !== 'art', options.map((o) => boxes.get(o)).filter((b): b is Box => !!b), Date.now(), until, unsure, Math.random), until);
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
    const target = aimIn(box, Math.random, anchor.startsWith('opt:') && s!.question?.mode !== 'art');
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
    // No idle wandering (or shifting) off it before the press.
    this.nextIdle = Date.now() + ms + 1000 + between(...IDLE_EVERY);
    this.nextFidget = Date.now() + ms + 600;
    await wait(Math.min(ms + between(...SETTLE_MS) * this.persona.pace, room()));
    const now = Date.now();
    this.pressedUntil = now + between(...PRESS_MS);
    this.busyUntil = now + BUSY_MS;
    this.driftAt = Math.random() < AFTER_CLICK ? this.pressedUntil + between(...AFTER_MS) : 0;
    this.send(true);
  }

  /**
   * Sets off for `to` from wherever it is now, in `most` ms at most; how
   * long it takes (ms). Aimed at a `box` (the anchor `on`, if it goes there
   * on purpose), it reaches as hands do: a long way, it misses a little and
   * corrects. Otherwise it simply moves there.
   */
  private goTo(to: Spot, box?: Box, on: string | null = null, most = Infinity) {
    const now = Date.now();
    this.on = on;
    const from = this.where(now);
    const size = box ? Math.min(box[2] - box[0], box[3] - box[1]) : 60;
    const ms = Math.min(most, reachTime(Math.hypot(to.x - from.x, to.y - from.y), size, this.speed, Math.random));
    const curve = this.persona.hand.curve;
    this.moves = box ? reach(from, to, now, ms, Math.random, { curve, sloppy: this.sloppy }) : [stroke(from, to, now, ms, Math.random, curve)];
    return ms;
  }

  /** Goes through `spots` one short stroke after another (a fidget's circle), staying on what it's on. */
  private goThrough(spots: Spot[]) {
    let t = Date.now();
    let from = this.where(t);
    this.moves = spots.map((to) => {
      const m = stroke(from, to, t, between(80, 150), Math.random, 0.3);
      t = m.end;
      from = to;
      return m;
    });
  }

  private where(now: number): Spot {
    while (this.moves.length) {
      const m = this.moves[0];
      // Between a reach and its correction: still, where the reach ended.
      if (now < m.start) break;
      this.at = along(m, now);
      if (now < m.end) break;
      this.moves.shift();
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
    const still = !this.moves.length;
    if (look && now >= look.at) {
      this.looks.shift();
      const box = look.anchor ? layout(s).get(look.anchor) : undefined;
      if (box) this.goTo(aimIn(box, Math.random, !!look.text && s.question?.mode !== 'art'), box, look.anchor);
      // A spot of its own (where it parks): reached as aimed movements are, for no element in particular.
      else if (look.spot) this.goTo(look.spot, [look.spot.x - 40, look.spot.y - 40, look.spot.x + 40, look.spot.y + 40]);
      this.nextIdle = now + between(...IDLE_EVERY);
    } else if (still && this.driftAt && now >= this.driftAt) {
      // After a click: off a little, mostly down and away from where it pressed.
      this.driftAt = 0;
      const a = Math.PI * (0.15 + 0.7 * Math.random());
      const d = between(...AFTER_DRIFT);
      this.goTo({ x: this.at.x + Math.cos(a) * d * (Math.random() < 0.5 ? -1 : 1), y: this.at.y + Math.sin(a) * d }, undefined, this.on);
    } else if (still && (now < this.busyUntil || (this.persona.hand.habit === 'fidget' && s.phase !== 'lobby')) && now >= this.nextFidget) {
      // Busy (a fidgeting hand: always): the hand on the mouse shifts a little now and then, staying on what it's on.
      const f = fidgets(this.persona.hand, this.persona.nerve, this.urgent(s));
      this.nextFidget = now + between(...f.every);
      if (this.persona.hand.habit === 'fidget' && Math.random() < CIRCLE_CHANCE) this.goThrough(circle(this.at, Math.random));
      else {
        const a = Math.random() * Math.PI * 2;
        const d = between(...f.size);
        this.goTo({ x: this.at.x + Math.cos(a) * d, y: this.at.y + Math.sin(a) * d }, undefined, this.on, between(150, 320));
      }
    } else if (!this.looks.length && still && now >= this.nextIdle) this.idle(s, now);
    this.send(true);
  }

  /** The question's clock has run most of the way down. */
  private urgent(s: GameState) {
    const q = s.phase === 'question' ? s.question : null;
    if (!q?.deadline) return false;
    const left = q.deadline - session.hostNow();
    return left > 0 && left < (q.deadline - (q.clockAt ?? q.askedAt)) * URGENT;
  }

  /** Nothing to do: it rests, drifts a little, wanders to the art, its own row or that of whoever's turn it is (in the lobby, the modes), or leaves the page a while. */
  private idle(s: GameState, now: number) {
    // The more impatient, the sooner it does something again.
    this.nextIdle = now + between(...IDLE_EVERY) * this.persona.pace * (1.4 - 0.8 * this.persona.impatience);
    const r = Math.random();
    if (r < AWAY_CHANCE) {
      this.awayUntil = now + between(...AWAY_MS);
      return;
    }
    const boxes = layout(s);
    const mine = s.players.findIndex((p) => p.id === session.myPlayerId);
    // Never an answer, unless it's its own to give: hovering one on someone else's turn would be a hint.
    const visit = (anchor: string) => boxes.has(anchor) && this.goTo(aimIn(boxes.get(anchor)!, Math.random), boxes.get(anchor), anchor);
    const turn = s.phase === 'lobby' ? -1 : s.turn;
    if (r < 0.2 && boxes.has('art')) visit('art');
    else if (r < 0.2 && s.phase === 'lobby') visit(`card:${Math.floor(Math.random() * 3)}`);
    else if (r < 0.3 && mine >= 0 && boxes.has(`row:${mine}`)) visit(`row:${mine}`);
    else if (r < 0.38 && turn >= 0 && turn !== mine && boxes.has(`row:${turn}`)) visit(`row:${turn}`);
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
