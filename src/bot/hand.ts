// The room bot's hand: its pointer, as the other players see it (shown in
// the lobby and a game, never in a race: src/lib/cursors.ts). It moves the
// way a hand on a mouse does (reach.ts): along an uneven curve with a slight
// wobble, quick early and slow into the end, longer the further it goes; a
// long reach falls short or runs past and corrects, a clumsy hand by more.
// What it does while it reads, thinks and waits is its own habit (habits.ts:
// parking the pointer aside, tracing what it reads, resting on what it's
// torn between, or never keeping still), as are its deftness and the bow of
// its strokes; a nervous one grows jittery as the clock runs out, a hasty
// one quick and sloppy. A click is the hand getting there and pressing,
// mostly without stopping first, and often drifting off a little after;
// unsure, it may head for another answer first and veer off. Once the
// answer is shown it leaves it be (people look with their eyes, not the
// pointer), now and then a glance at the scores. Between times it rests
// (and dims, as anyone's does), drifts, wanders to the art, its own row or
// the row of whoever's turn it is, and now and then leaves the page a while.
// It notices the other pointers now and then, the more sociable the more
// often (social.ts): waves back at a wave, answers one come up to it, greets
// a newcomer in the lobby, goes after someone moving about a little while.
// It never hovers an answer or a card on someone else's turn (that would be
// a hint). Every bot plays with a mouse: a pointer is what makes it company.

import type { GameState, Question } from '../lib/game';
import { MOUSE, PRESSED, SEND_EVERY_MS, anchorCode, anchorName, cursorKey, cursorsLive, type CursorAt } from '../lib/cursors';
import { peerCursors } from '../lib/peerCursors.svelte';
import { session } from '../lib/session.svelte';
import type { Persona } from './brain';
import { aimIn, along, layout as roomLayout, placeOf, reach, reachTime, stroke, sweep, veer, type Box, type Spot, type Stroke } from './reach';
import { afterReveal, awayChance, changeOfMind, circle, fidgets, idleEvery, readCards, readQuestion, straySpot, waitSpot, type Glance, type Hands, type Situation } from './habits';
import { KEEP_MS, awayFrom, react, toward, wave, type Sample } from './social';
import { between } from './util';

/** A press shows this long (ms): as a recorded hand held its button (lib/recorder.ts). */
const PRESS_MS: [number, number] = [70, 120];
/**
 * Before pressing, mostly none at all: the recorded hand pressed as it got
 * there. Now and then (unsure, more often) it rests on the target a moment first (ms).
 */
const SETTLE_MS: [number, number] = [0, 40];
const PAUSE_MS: [number, number] = [80, 300];
const PAUSE_CHANCE = { sure: 0.2, unsure: 0.45 };
/** Off the page (looking elsewhere), now and then (habits.ts awayChance), for this long (ms). */
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
/** Someone else's turn: it settles somewhere to wait this soon (ms), and keeps still this much longer than otherwise. */
const SETTLE_IN_MS: [number, number] = [300, 2500];
const WAIT_STILLER = 1.8;
/** A click at nothing (habits.ts straySpot): this soon after moving on (ms), and at an idle move, this much less often. */
const STRAY_AFTER_MS: [number, number] = [300, 1100];
const STRAY_IDLE = 0.12;
/** After answering someone's pointer, it leaves the others be at least this long (ms). */
const SOCIAL_REST_MS: [number, number] = [4000, 10000];
/** Going after someone moving about: this long (ms), a step every so often. */
const FOLLOW_MS: [number, number] = [1500, 3500];
const FOLLOW_STEP_MS: [number, number] = [450, 750];
/** Idle moves (nothing aimed at) go this much slower than reaching for something. */
const LAZY: [number, number] = [1.5, 2.6];
/** Each sweep of a wave (ms). */
const WAVE_LEG_MS: [number, number] = [150, 240];

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
  /** How tired it is (0 to 1), as its player last said. */
  private tired = 0;
  /** The question whose reveal it last looked at. */
  private revealed = 0;
  /** A click at nothing: when it sets off for one, and when it presses once there. */
  private strayAt = 0;
  private strayPress = 0;
  /** The others' pointers as it saw them lately (social.ts), when it last answered each, and when it may again. */
  private seen = new Map<string, Sample[]>();
  private answered = new Map<string, number>();
  private socialAfter = 0;
  /** Going after someone's pointer: whose, until when, and the next step. */
  private following: string | null = null;
  private followUntil = 0;
  private followStep = 0;
  /** Who was in the room when it last looked (a newcomer gets a greeting now and then), and a greeting due. */
  private met = new Set<string>();
  private greet: { at: number; row: string } | null = null;

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
    // The reach, its correction's beat, the settle.
    return reachTime(350, 70, this.speed, () => 0.5) + 250;
  }

  /** Goes by `glances` (habits.ts) until it sets off to choose at `until`. */
  private plan(glances: Glance[], until: number) {
    this.looks = glances;
    this.busyUntil = until + BUSY_MS;
  }

  /** Looks the cards over before picking one, by its habit as the moment leans it. */
  lookOverCards(n: number, until: number, tired = this.tired) {
    const s = this.s ?? session.state;
    if (!s) return;
    this.tired = tired;
    const cards = Array.from({ length: n }, (_, i) => `card:${i}`);
    const boxes = layout(s);
    const sit: Situation = { sure: Math.random() < 0.4, careful: false, tired, urgentAt: Infinity };
    this.plan(readCards(this.hands, cards, cards.map((c) => boxes.get(c)).filter((b): b is Box => !!b), Date.now(), until, sit, Math.random), until);
  }

  /**
   * Looks a question over while making up its mind, by its habit as the
   * situation leans it: `sure` of the answer or not, `careful` (it just
   * missed one), how `tired`; and the clock, which it darts about near the
   * end of, unsure.
   */
  ponder(q: Question, until: number, mood: { sure: boolean; careful: boolean; tired: number }) {
    const s = this.s ?? session.state;
    if (!s) return;
    this.tired = mood.tired;
    // A question that shows the pictures has no labels; one not shown yet has none either.
    const options = q.labels.map((_, i) => `opt:${i}`).filter((_, i) => q.mode === 'art' || q.labels[i] !== null);
    const boxes = layout(s);
    const total = q.deadline ? q.deadline - (q.clockAt ?? q.askedAt) : 0;
    const urgentAt = q.deadline ? Date.now() + (q.deadline - total * URGENT - session.hostNow()) : Infinity;
    const sit: Situation = { ...mood, urgentAt };
    this.plan(readQuestion(this.hands, options, q.mode !== 'art', options.map((o) => boxes.get(o)).filter((b): b is Box => !!b), Date.now(), until, sit, Math.random), until);
  }

  /**
   * Moves to `anchor` and presses, as a click does; resolves as it lets
   * go, for the action to go then. At once when no
   * pointer is shown. `by` (Date.now): when it must have pressed at the
   * latest (the clock's end), the hand hurrying to make it.
   */
  async click(anchor: string, by = Infinity, { unsure = false } = {}): Promise<void> {
    this.looks = [];
    const s = session.state;
    if (!this.live(s)) return;
    const box = layout(s!).get(anchor);
    if (!box) return;
    const target = aimIn(box, Math.random, anchor.startsWith('opt:') && s!.question?.mode !== 'art');
    const room = () => Math.max(0, by - Date.now());
    this.awayUntil = 0;
    // Unsure, now and then it heads for another answer first and veers off.
    const others = anchor.startsWith('opt:') ? [...layout(s!)].filter(([k]) => k.startsWith('opt:') && k !== anchor) : [];
    const decoy = others.length && Math.random() < changeOfMind(!unsure) ? others[Math.floor(Math.random() * others.length)][1] : null;
    const ms = decoy ? this.veerTo(aimIn(decoy, Math.random, true), target, box, anchor, room() * 0.8) : this.goTo(target, box, anchor, room() * 0.8);
    // No idle wandering (or shifting) off it before the press.
    this.nextIdle = Date.now() + ms + 1000 + between(...idleEvery(this.persona.hand, this.tired));
    this.nextFidget = Date.now() + ms + 600;
    const settle = Math.random() < PAUSE_CHANCE[unsure ? 'unsure' : 'sure'] ? between(...PAUSE_MS) : between(...SETTLE_MS);
    await wait(Math.min(ms + settle * this.persona.pace, room()));
    const now = Date.now();
    this.pressedUntil = now + between(...PRESS_MS);
    this.busyUntil = now + BUSY_MS;
    this.driftAt = Math.random() < AFTER_CLICK ? this.pressedUntil + between(...AFTER_MS) : 0;
    // Moving on, a clicky hand often clicks again at nothing as the next screen comes.
    if (anchor === 'next' && Math.random() < this.persona.hand.clicky) {
      this.strayAt = now + between(...STRAY_AFTER_MS);
      this.driftAt = 0;
    }
    this.send(true);
    // The click is the letting go, as a browser's is: what it does happens then, with the press seen first.
    await wait(this.pressedUntil - now);
  }

  /**
   * Sets off for `to` from wherever it is now, in `most` ms at most; how
   * long it takes (ms). Aimed at a `box` (the anchor `on`, if it goes there
   * on purpose), it reaches as hands do: a long way, it misses a little and
   * corrects. Otherwise it simply moves there.
   */
  private goTo(to: Spot, box?: Box, on: string | null = null, most = Infinity, lazy = false) {
    const now = Date.now();
    this.on = on;
    const from = this.where(now);
    const size = box ? Math.min(box[2] - box[0], box[3] - box[1]) : 60;
    const ms = Math.min(most, reachTime(Math.hypot(to.x - from.x, to.y - from.y), size, this.speed, Math.random) * (lazy ? LAZY[0] + Math.random() * (LAZY[1] - LAZY[0]) : 1));
    const curve = this.persona.hand.curve;
    this.moves = box ? reach(from, to, now, ms, Math.random, { curve, sloppy: this.sloppy }) : [stroke(from, to, now, ms, Math.random, curve)];
    return ms;
  }

  /** Sets off for `decoy`, then veers off for `to` (in `box`, the anchor `on`); how long it takes (ms). */
  private veerTo(decoy: Spot, to: Spot, box: Box, on: string, most: number) {
    const now = Date.now();
    this.on = on;
    const from = this.where(now);
    const ms = Math.min(most, reachTime(Math.hypot(to.x - from.x, to.y - from.y) * 1.3, Math.min(box[2] - box[0], box[3] - box[1]), this.speed, Math.random));
    this.moves = veer(from, decoy, to, now, ms, Math.random, { curve: this.persona.hand.curve, sloppy: this.sloppy });
    return this.moves.at(-1)!.end - now;
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

  /**
   * Then, once it gets where it's going, through `spots` in strokes `ms`
   * long (a wave: slow enough to show at ten updates a second, as the waves
   * people see on each other's screens are).
   */
  private thenThrough(spots: Spot[], ms: [number, number] = WAVE_LEG_MS) {
    const last = this.moves.at(-1);
    let t = Math.max(Date.now(), last?.end ?? 0) + between(60, 200);
    let from = last?.to ?? this.at;
    for (const to of spots) {
      const m = stroke(from, to, t, between(...ms), Math.random, 0.2);
      this.moves.push(m);
      t = m.end;
      from = to;
    }
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
    const screen = `${s.phase === 'choosing' ? 'choice' : s.phase === 'over' || s.phase === 'lobby' ? s.phase : 'question'}:${s.round}:${s.turnCount}:${s.question?.askedAt ?? 0}`;
    if (screen !== this.screen) {
      this.screen = screen;
      this.on = null;
      // Someone else's turn: it waits its own way (habits.ts waitSpot), mostly where it is; somewhere of its own
      // it goes once, a while after the screen comes, and stays (unless it's well off it).
      if (this.waiting(s)) {
        const l = layout(s);
        const boxes = [...l].filter(([k]) => k.startsWith('card:') || k.startsWith('opt:')).map(([, b]) => b);
        const at = this.where(now);
        const spot = waitSpot(this.persona.hand, boxes, at, Math.random, l.has('art') ? [l.get('art')!] : []);
        const far = spot && (this.persona.hand.wait === 'stay' || Math.hypot(spot.x - at.x, spot.y - at.y) > 60);
        // Just off an answer it rests on, soon; to its own place, a while after.
        const soon = this.persona.hand.wait === 'stay' ? between(200, 900) : between(...SETTLE_IN_MS);
        this.looks = spot && far ? [{ at: now + soon * this.persona.pace, spot }] : [];
      }
    }
    if (!this.live(s)) {
      this.looks = [];
      return this.send(false);
    }
    if (this.awayUntil && now < this.awayUntil) return this.send(false);
    if (this.awayUntil) {
      // Back on the page: somewhere along its edge, toward the middle.
      this.awayUntil = 0;
      this.at = { x: Math.random() < 0.5 ? 30 : 970, y: 300 + Math.random() * 500 };
    }
    // The answer shown: a parker goes aside again (habits.ts afterReveal).
    if (s.phase === 'reveal' && s.question && s.reveal && this.revealed !== s.question.askedAt) {
      this.revealed = s.question.askedAt;
      const boxes = layout(s);
      const opts = [...boxes].filter(([k]) => k.startsWith('opt:')).map(([, b]) => b);
      this.looks = afterReveal(this.hands, opts, now, Math.random);
      // Now and then a look at the scores too: the row of whoever just answered.
      const row = `row:${s.delve ? Math.max(0, s.players.findIndex((p) => p.id === session.myPlayerId)) : s.turn}`;
      if (boxes.has(row) && Math.random() < 0.12) this.looks.push({ at: (this.looks.at(-1)?.at ?? now) + between(700, 1800) * this.persona.pace, anchor: row });
    }
    this.watch(s, now);
    // A click at nothing: off to it, and a press once there.
    if (this.strayAt && now >= this.strayAt) {
      this.strayAt = 0;
      const to = straySpot(this.where(now), [...layout(s)].filter(([k]) => k !== 'game').map(([, b]) => b), Math.random);
      if (to) this.strayPress = now + this.goTo(to, undefined, null, between(150, 350)) + between(0, 40);
    }
    if (this.strayPress && now >= this.strayPress) {
      this.strayPress = 0;
      this.pressedUntil = now + between(...PRESS_MS);
    }
    const look = this.looks[0];
    const still = !this.moves.length;
    if (this.following && now < this.followUntil && !this.playing(s)) {
      // Going after someone: a step toward where they are now, every so often.
      if (now >= this.followStep) {
        this.followStep = now + between(...FOLLOW_STEP_MS);
        const them = this.seen.get(this.following)?.at(-1);
        if (them) this.goTo(toward(this.where(now), them, Math.random, 200), undefined, null, between(500, 800));
      }
    } else if (this.greet && now >= this.greet.at && still) {
      // A newcomer in the lobby: over to their name, and a little wave.
      const box = layout(s).get(this.greet.row);
      this.greet = null;
      if (box) {
        const to = aimIn(box, Math.random);
        this.goTo(to, box, null);
        this.thenThrough(wave(to, Math.random, Math.random() < 0.5));
      }
    } else if (look && now >= look.at) {
      this.looks.shift();
      const box = look.anchor ? layout(s).get(look.anchor) : undefined;
      const words = !!look.text && s.question?.mode !== 'art';
      // A sweep through several (tracing what it reads): one movement all the way, without stopping on each.
      if (look.through && look.ms && look.spot) {
        this.on = look.anchor ?? null;
        this.moves = [sweep(this.where(now), [...look.through, look.spot], now, look.ms)];
      } else if (box) this.goTo(aimIn(box, Math.random, words), box, look.anchor);
      // A spot of its own (where it parks): reached as aimed movements are, for no element in particular.
      else if (look.spot) this.goTo(look.spot, [look.spot.x - 40, look.spot.y - 40, look.spot.x + 40, look.spot.y + 40]);
      this.nextIdle = now + between(...idleEvery(this.persona.hand, this.tired));
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
    } else if (!this.looks.length && still && now >= this.socialAfter && !this.playing(s) && this.answer(s, now)) {
      // Answered someone's pointer (social.ts).
    } else if (!this.looks.length && still && now >= this.nextIdle) this.idle(s, now);
    this.send(true);
  }

  /** Its own turn to pick or answer, or busy with it: no time for anyone's pointer. */
  private playing(s: GameState) {
    const me = session.myPlayerId;
    if (s.phase !== 'choosing' && s.phase !== 'question') return false;
    if (s.delve) return true;
    return s.settings.mode === 'turns' && s.players[s.turn]?.id === me;
  }

  /** The others' pointers, where they are on its picture of the screen, kept a few seconds; and anyone new in the lobby. */
  private watch(s: GameState, now: number) {
    const l = layout(s);
    const mine = cursorKey(session.myPlayerId ?? '');
    for (const [key, p] of peerCursors.at) {
      if (key === mine) continue;
      const [code, ax, ay] = p.at;
      const name = anchorName(code);
      const box = name === 'game' ? null : name ? l.get(name) : undefined;
      if (box === undefined) continue;
      const spot = box ? { x: box[0] + (ax / 1000) * (box[2] - box[0]), y: box[1] + (ay / 1000) * (box[3] - box[1]) } : { x: ax, y: ay };
      const seen = this.seen.get(key) ?? [];
      const last = seen.at(-1);
      if (!last || last.x !== spot.x || last.y !== spot.y) seen.push({ t: now, ...spot });
      while (seen.length && seen[0].t < now - KEEP_MS) seen.shift();
      this.seen.set(key, seen);
    }
    for (const key of this.seen.keys()) if (!peerCursors.at.has(key)) this.seen.delete(key);
    if (this.following && (now >= this.followUntil || !this.seen.has(this.following))) this.following = null;
    // Someone new in the lobby: now and then a greeting, the more sociable the likelier.
    const ids = s.players.map((p) => p.id);
    if (s.phase === 'lobby' && this.met.size) {
      const fresh = s.players.findIndex((p) => !this.met.has(p.id) && p.id !== session.myPlayerId);
      if (fresh >= 0 && !this.greet && Math.random() < 0.25 + 0.5 * this.persona.sociable)
        this.greet = { at: now + between(700, 2200) * this.persona.pace, row: `row:${fresh}` };
    }
    this.met = new Set(ids);
  }

  /** Answers someone's pointer if it notices (social.ts react): true when it did. */
  private answer(s: GameState, now: number) {
    const me = this.where(now);
    // Where it may go after someone: where nothing hangs on where it points.
    const free = s.phase === 'lobby' || s.phase === 'over' || s.phase === 'reveal';
    const r = react(this.seen, me, now, this.persona.sociable, Math.random, { free, lastFor: this.answered });
    if (!r) return false;
    const them = this.seen.get(r.to)?.at(-1);
    if (!them) return false;
    this.answered.set(r.to, now);
    this.socialAfter = now + between(...SOCIAL_REST_MS);
    this.nextIdle = Math.max(this.nextIdle, now + 3000);
    switch (r.kind) {
      case 'wave':
        if (r.go) {
          this.goTo(toward(me, them, Math.random), undefined, null);
          this.thenThrough(wave(this.moves.at(-1)?.to ?? me, Math.random));
        } else {
          this.moves = [];
          this.thenThrough(wave(me, Math.random));
        }
        break;
      case 'greet':
        this.moves = [];
        this.thenThrough(wave(me, Math.random, true));
        break;
      case 'shy':
        this.goTo(awayFrom(me, them, Math.random), undefined, null, Infinity, true);
        break;
      case 'nudge': {
        const ms = this.goTo(toward(me, them, Math.random, 60), undefined, null);
        // A clicky one gives it a poke.
        if (Math.random() < this.persona.hand.clicky) this.strayPress = now + ms + between(0, 60);
        break;
      }
      case 'follow':
        this.following = r.to;
        this.followUntil = now + between(...FOLLOW_MS);
        this.followStep = now;
        break;
    }
    return true;
  }

  /** Someone else's turn to pick or answer (turns mode): nothing for this hand to do but wait. */
  private waiting(s: GameState) {
    const me = session.myPlayerId;
    return s.settings.mode === 'turns' && !s.delve && (s.phase === 'choosing' || s.phase === 'question') && !!me && s.players[s.turn]?.id !== me;
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
    // By its habit (a parker keeps still for long stretches), the more impatient the sooner, the more tired the later.
    const waiting = this.waiting(s);
    this.nextIdle = now + between(...idleEvery(this.persona.hand, this.tired)) * this.persona.pace * (1.4 - 0.8 * this.persona.impatience) * (waiting ? WAIT_STILLER : 1);
    if (Math.random() < this.persona.hand.clicky * STRAY_IDLE) {
      this.strayAt = now;
      return;
    }
    const r = Math.random();
    if (r < awayChance(this.tired)) {
      this.awayUntil = now + between(...AWAY_MS);
      return;
    }
    const boxes = layout(s);
    const mine = s.players.findIndex((p) => p.id === session.myPlayerId);
    // Never an answer, unless it's its own to give: hovering one on someone else's turn would be a hint.
    const visit = (anchor: string) => boxes.has(anchor) && this.goTo(aimIn(boxes.get(anchor)!, Math.random), boxes.get(anchor), anchor);
    const turn = s.phase === 'lobby' ? -1 : s.turn;
    // Waiting out someone else's turn, its eyes are on the answers, not the art to hover over.
    if (r < 0.2 && boxes.has('art') && !waiting) visit('art');
    else if (r < 0.2 && s.phase === 'lobby') visit(`card:${Math.floor(Math.random() * 3)}`);
    else if (r < 0.3 && mine >= 0 && boxes.has(`row:${mine}`)) visit(`row:${mine}`);
    else if (r < 0.38 && turn >= 0 && turn !== mine && boxes.has(`row:${turn}`)) visit(`row:${turn}`);
    else if (r < 0.75) {
      const a = Math.random() * Math.PI * 2;
      const d = 15 + Math.random() * 60;
      const to = { x: this.at.x + Math.cos(a) * d, y: this.at.y + Math.sin(a) * d };
      // Not onto an answer by accident either.
      if (![...boxes].some(([k, b]) => k.startsWith('opt:') && to.x >= b[0] && to.x <= b[2] && to.y >= b[1] && to.y <= b[3])) this.goTo(to, undefined, null, Infinity, true);
    }
    // Otherwise it rests where it is.
  }

  /** Sends where the pointer is, if it moved (`on`: on the page). */
  private send(on: boolean) {
    const now = Date.now();
    let at: CursorAt | null = null;
    if (on && this.s) {
      // A hand at rest sends nothing (a mouse lying still doesn't move): the others' screens dim it, as they do anyone's.
      const p = placeOf(this.where(now), layout(this.s), this.on);
      const code = anchorCode(p.anchor);
      if (code !== null) at = [code, p.x, p.y, now < this.pressedUntil ? PRESSED : MOUSE];
    }
    const key = JSON.stringify(at);
    const plain = !at || at[3] === MOUSE;
    // A press always goes; anything else only when it changed, and not too often.
    if (key === this.sent || (plain && at && now - this.sentAt < SEND_EVERY_MS - 10)) return;
    this.sent = key;
    this.sentAt = now;
    session.pointAt(at);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
