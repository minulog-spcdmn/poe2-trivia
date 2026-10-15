// A bot's player stepping away from the game while there's nothing for them
// to do, as people do: the lobby with nobody come yet, or someone else's
// lobby whose host is taking their time. They switch to another tab now and
// then (the room sees them as away, and their pointer rests), look back in
// a while later, and come back as soon as they're wanted: someone joins
// their room, or the game starts. Never in a game, and never for long once
// someone is waiting on them: it's to look like a person, not to hold
// anyone up. Some people never tab out at all.

import { forcePresence } from '../lib/presence.ts';
import { seededBy } from './util.ts';
import type { Persona } from './brain.ts';
import { between, log } from './util.ts';

/** Nothing to do this long (ms, from..to) before they may tab out. */
const BORED: [number, number] = [40000, 150000];
/** Away this long (ms, from..to) when nothing calls them back. */
const AWAY: [number, number] = [60000, 6 * 60000];
/** Looking back in, this long (ms, from..to) before they may tab out again. */
const BACK: [number, number] = [15000, 60000];
/** Back this soon (ms, from..to) once someone joins their room; once a game starts. */
const TO_COMPANY: [number, number] = [2500, 10000];
const TO_GAME: [number, number] = [1000, 3500];

export class Afk {
  /** How likely they are to tab out when there's nothing to do (0: never). */
  private readonly tendency: number;
  private away = false;
  /** When they next may tab out (here), or look back in (away). */
  private nextAt = 0;
  /** Called back: when they're back. */
  private backAt = 0;

  constructor(persona: Persona) {
    const r = persona.seed ? seededBy(`${persona.seed}:afk`)() : 0;
    // A fifth never do; the rest more or less often.
    this.tendency = r < 0.2 ? 0 : (r - 0.2) / 0.8;
  }

  /** Away now (their game behind another tab). */
  get isAway() {
    return this.away;
  }

  /**
   * Each tick: `bored`, nothing to do (alone in their own lobby, or long in
   * someone's); `wanted`, someone is waiting on them (`game`: a game is on).
   */
  tick(now: number, bored: boolean, wanted: boolean, game = false) {
    // Just come in: a while before anything bores them.
    if (!this.nextAt) this.nextAt = now + between(...BORED);
    if (this.away) {
      if (wanted) {
        this.backAt ||= now + between(...(game ? TO_GAME : TO_COMPANY));
        if (now >= this.backAt) this.come(now, game ? 'back for the game' : 'back, someone joined');
      } else {
        // Whoever was waiting gone before they noticed: the next one waits as long again.
        this.backAt = 0;
        if (now >= this.nextAt) this.come(now, 'looks back in');
      }
      return;
    }
    if (!bored || wanted) {
      this.nextAt = now + between(...BORED);
      return;
    }
    if (now < this.nextAt) return;
    if (Math.random() < this.tendency) {
      this.away = true;
      this.backAt = 0;
      this.nextAt = now + between(...AWAY);
      forcePresence('away');
      log('tabs out');
    } else this.nextAt = now + between(...BORED);
  }

  private come(now: number, why: string) {
    this.away = false;
    this.backAt = 0;
    this.nextAt = now + between(...BACK);
    forcePresence(null);
    log(why);
  }

  /** Done (they leave): back as the page is. */
  stop() {
    if (this.away) forcePresence(null);
    this.away = false;
  }
}
