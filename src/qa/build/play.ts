// Playing a scene's game to the moment it shows, through the game's own
// engine (lib/game.ts) as a room's host would: the same moves give the same
// state every time (the dice are seeded, the clock moves only when told),
// and a state the engine can't reach can't be made.

import { createGame, DEFAULT_SETTINGS, type Action, type GameState, type Question, type Settings } from '../../lib/game.ts';
import { playEngine } from './engine.ts';
import { pid } from './people.ts';

/** When every scene's game starts (host clock, ms). */
export const T0 = 1_760_000_000_000;

export class Table {
  readonly clock = { now: T0 };
  readonly engine;
  readonly hostId: string | null;
  s: GameState;

  /**
   * `names` sit down in that order; the first is the host (`host: null`:
   * hot-seat, no room). `watching` join as spectators.
   */
  constructor(names: string[], settings: Partial<Settings> = {}, o: { host?: null; seed?: number; watching?: string[] } = {}) {
    this.engine = playEngine(o.seed ?? 1, this.clock);
    this.hostId = o.host === null ? null : pid(names[0]);
    // Everyone sits down before a lock, as they would have.
    this.s = createGame(this.hostId, { ...DEFAULT_SETTINGS, ...settings, locked: false });
    for (const name of names) this.act({ type: 'join', playerId: pid(name), name }, this.hostId === null ? null : name);
    for (const name of o.watching ?? []) this.act({ type: 'join', playerId: pid(name), name, watch: true }, name);
    if (settings.locked) this.act({ type: 'settings', settings: { locked: true } });
  }

  /** A move, by a player (by name; the host by default, null: the room itself, as a host's timer would). */
  act(a: Action, by?: string | null): this {
    const from = by === undefined ? this.hostId : by === null ? null : pid(by);
    this.s = this.engine.apply(this.s, a, from);
    return this;
  }
  /** A move by the room itself on any state of this game (a scene's Built.act). */
  readonly room = (s: GameState, a: Action) => this.engine.apply(s, a, null);
  /** The clock moves on. */
  wait(ms: number): this {
    this.clock.now += ms;
    return this;
  }

  get q(): Question {
    if (!this.s.question) throw new Error(`No question open (phase ${this.s.phase})`);
    return this.s.question;
  }
  /** Whose turn it is, by name. */
  get turn(): string {
    return this.s.players[this.s.turn].name;
  }
  right = () => this.q.options.indexOf(this.q.itemId);
  wrong = () => this.q.options.findIndex((o) => o !== this.q.itemId);

  start(): this {
    return this.act({ type: 'start' });
  }
  /** The player whose turn it is picks a category (the first offered, or `n`th). */
  pick(n = 0): this {
    return this.act({ type: 'pick', category: this.s.offered[n] }, this.hostId === null ? null : this.turn);
  }
  /** `name` answers (right or wrong, or `index`), `ms` into the question. */
  answer(name: string | null, ok: boolean | number, ms = 2400): this {
    const index = typeof ok === 'number' ? ok : ok ? this.right() : this.wrong();
    this.wait(ms);
    return this.act({ type: 'answer', index, askedAt: this.q.askedAt, ms }, this.hostId === null ? null : name);
  }
  next(): this {
    return this.act({ type: 'next' });
  }
  /** Turns taken: each player whose turn it is picks and answers right (or as `ok` says, by name), until `until` holds. */
  playTo(until: (s: GameState) => boolean, ok: (name: string, round: number) => boolean = () => true, limit = 400): this {
    for (let i = 0; i < limit && !until(this.s); i++) {
      if (this.s.phase === 'choosing') this.pick();
      else if (this.s.phase === 'question') this.answer(this.turn, ok(this.turn, this.s.round));
      else if (this.s.phase === 'reveal') this.wait(1000).next();
      else break;
    }
    if (!until(this.s)) throw new Error(`Never got there (phase ${this.s.phase}, round ${this.s.round})`);
    return this;
  }
}
