// A bot at the table: plays its turns, races and Delve runs as one of the
// cast (brain.ts), whether it hosts the room (host.ts) or joined someone
// else's (guest.ts). Only how it finds the right option differs: the host
// has it in its state, a guest has to recognise the art (sight.ts).
// Everything it does goes through the session's dispatch, as a person's
// clicks would, and its timing runs on the host's clock.

import { engine, session } from '../lib/session.svelte';
import { activeRules, grayscaleFor, type GameState, type Question } from '../lib/game';
import { blastProblem, findLosses, fuseDue, inventoryOf, isGroupRun, livesOf, reviveProblem, shownDepth, standingIds, teamItemReady } from '../lib/delve';
import { answerDelay, blasts, chooseAnswer, chooseCard, findAppetite, knowChance, misclicks, movesOn, panic, pickCategory, pickDelay, rethinks, tiredness, withTheHerd, type Ask, type Persona } from './brain';
export { moodOf } from './brain';

/** How the bot finds the right option: its index, or null when it can't tell. */
export type Eyes = (s: GameState, q: Question) => Promise<number | null>;

/** The host's eyes: the answer is in its own state. */
export const hostEyes: Eyes = async (_s, q) => q.options.indexOf(q.itemId);

/** Something the bot is about to do, at `at` (host clock). */
interface Plan {
  at: number;
  run: () => void | Promise<void>;
}

import { between, log } from './util';
import { Hand } from './hand';

/** New to it, a guest tries the button to move on through someone else's reveal at most this many reveals in, each time this likely; once is enough to learn. */
const TRY_NEXT_FOR = 3;
const TRY_NEXT_CHANCE = 0.25;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Each option's name, as far as this device knows it (a guest has no item ids before the reveal). */
const optionNames = (o: Question) => o.labels.map((l, i) => l ?? engine.byId.get(o.options[i])?.name ?? '');

let idByName: Map<string, string> | null = null;
/**
 * The item a question is about, as this device makes it out: the host knows
 * it; a guest goes by what its eyes saw (`seen`), the name it read for it, or
 * the name an art question asks for.
 */
function itemOf(q: Question, seen: number | null): string | null {
  if (q.itemId) return q.itemId;
  idByName ??= new Map(engine.items.map((it) => [it.name, it.id]));
  const name = q.mode === 'art' ? q.prompt : seen === null ? null : q.labels[seen];
  return (name && idByName.get(name)) ?? null;
}

export class Player {
  /** What it is about to do, by what for (a pick, an answer, a life to give…). */
  private plans = new Map<string, Plan>();
  /** What it has made up its mind about (it may have chosen not to act). */
  private decided = new Set<string>();
  /** The game they are for (its startedAt): a new game starts them afresh. */
  private game = 0;
  /** Items it has seen revealed while it was on (they stick, mostly). */
  private revealed = new Set<string>();
  /** Its own misses in a row (wrong or out of time), this game. */
  private misses = 0;
  /** The question whose reveal it has taken in. */
  private takenIn = 0;
  /** When it came on, and how many answers it has given since (warming up, tiring). */
  private readonly since = Date.now();
  private answers = 0;
  /** Someone else's reveals it has seen (as a guest, in turns), and whether it has learned it can't move those on. */
  private othersRevealed = 0;
  private learnedNext = false;
  /** Its pointer, as the others see it: it moves to what it chooses, and clicks. */
  private readonly hand: Hand;

  constructor(
    readonly persona: Persona,
    private readonly eyes: Eyes,
  ) {
    this.hand = new Hand(persona);
  }

  /** Forgets what it was about to do (the room went back to the lobby, or it left). */
  reset() {
    this.plans.clear();
    this.decided.clear();
  }

  /** Looks at the game and makes up its mind about anything new; then does what is due. */
  play(s: GameState) {
    this.hand.update(s);
    if ((s.startedAt ?? 0) !== this.game) {
      this.game = s.startedAt ?? 0;
      this.misses = 0;
      this.reset();
    }
    if (s.phase === 'reveal') {
      this.takeIn(s);
      this.planMoveOn(s);
    }
    if (s.phase !== 'lobby' && s.phase !== 'over' && s.players.some((p) => p.id === session.myPlayerId)) {
      if (s.delve) this.delve(s);
      else if (s.settings.mode === 'race') this.race(s);
      else this.turns(s);
    }
    const now = session.hostNow();
    for (const [key, p] of this.plans)
      if (now >= p.at) {
        this.plans.delete(key);
        void p.run();
      }
  }

  /** A reveal: the item sticks, and its own answer goes on its run of misses (or ends it). */
  private takeIn(s: GameState) {
    const q = s.question;
    const r = s.reveal;
    if (!q || !r || this.takenIn === q.askedAt) return;
    this.takenIn = q.askedAt;
    if (r.correctId) this.revealed.add(r.correctId);
    const me = session.myPlayerId!;
    let mine: boolean | null = null;
    if (r.winnerId === me) mine = true;
    else if (s.delve && isGroupRun(s)) mine = q.struck?.some((x) => x.by === me) || r.hits?.some((h) => h.playerId === me) ? false : null;
    else if (s.settings.mode === 'race' && !s.delve) mine = q.misses.some((m) => m.playerId === me) ? false : null;
    else if (s.players[s.turn]?.id === me) mine = r.correct;
    if (mine === true) this.misses = 0;
    else if (mine === false) this.misses++;
  }

  /**
   * After its own reveal (or, in Delve together, the team's), an impatient
   * player moves on itself now and then instead of waiting for the timer: to
   * the button and presses it. On someone else's, a guest can't (only they
   * or the host can); new to the game, now and then it tries anyway, the
   * button does nothing, and it soon learns.
   */
  private planMoveOn(s: GameState) {
    const q = s.question;
    const me = session.myPlayerId!;
    if (!q || (s.settings.mode === 'race' && !s.delve)) return;
    const mine = s.delve && isGroupRun(s) ? s.players.some((p) => p.id === me) : s.players[s.turn]?.id === me;
    const key = `next:${q.askedAt}`;
    if (this.decided.has(key)) return;
    this.decided.add(key);
    if (!mine) {
      if (s.delve || s.hostId === me || this.learnedNext || !s.players.some((p) => p.id === me)) return;
      if (++this.othersRevealed > TRY_NEXT_FOR) this.learnedNext = true;
      else if (Math.random() < TRY_NEXT_CHANCE) {
        this.learnedNext = true;
        this.plans.set(key, {
          at: session.hostNow() + Math.round(between(1000, 2400) * this.persona.pace),
          run: async () => {
            await this.hand.click('next');
            // Nothing happened: once more, harder.
            if (Math.random() < 0.5) {
              await wait(between(200, 450));
              await this.hand.click('next');
            }
          },
        });
      }
      return;
    }
    const after = movesOn(this.persona, Math.random);
    if (after === null) return;
    this.plans.set(key, {
      at: session.hostNow() + Math.max(0, after - this.hand.lead()),
      run: async () => {
        if (session.state?.question?.askedAt !== q.askedAt) return;
        await this.hand.click('next');
        const cur = session.state;
        if (cur?.phase === 'reveal' && cur.question?.askedAt === q.askedAt) session.dispatch({ type: 'next' });
      },
    });
  }

  private turns(s: GameState) {
    if (s.players[s.turn]?.id !== session.myPlayerId) return;
    if (s.phase === 'choosing') this.planCard(s, 'pick');
    else if (s.phase === 'question' && s.question) this.planAnswer(s, s.question);
  }

  private race(s: GameState) {
    const q = s.question;
    if (s.phase !== 'question' || !q || q.misses.some((m) => m.playerId === session.myPlayerId)) return;
    this.planAnswer(s, q);
  }

  /**
   * Delve: alone, its own turns; together, a vote for each card, an answer
   * to each question while standing, and a life for a teammate who perished.
   * Flares burn by themselves (as everyone's do); dynamite it detonates
   * itself alone, on questions it isn't sure of (planAnswer).
   */
  private delve(s: GameState) {
    const me = session.myPlayerId!;
    const together = isGroupRun(s);
    if (together) this.planRevive(s);
    if (livesOf(s, me) <= 0) return;
    if (s.phase === 'choosing') {
      if (!together) {
        if (s.players[s.turn]?.id === me) this.planCard(s, 'pick');
      } else if (!s.delve?.votes?.[me]) this.planCard(s, 'vote');
    } else if (s.phase === 'question' && s.question) {
      const q = s.question;
      // The clock starts once the art has reached everyone answering.
      if (q.deadline === null) return;
      if (together ? q.struck?.some((x) => x.by === me) : s.players[s.turn]?.id !== me) return;
      this.planAnswer(s, q);
    }
  }

  /** Picks a card on its turn, or votes for one (Delve together). */
  private planCard(s: GameState, type: 'pick' | 'vote') {
    const key = `${type}:${s.round}:${s.turnCount}`;
    if (this.decided.has(key)) return;
    this.decided.add(key);
    const offered = [...s.offered];
    const me = session.myPlayerId!;
    const inv = s.delve ? inventoryOf(s, me) : null;
    // What each find on offer would put at stake for it now.
    const finds = (s.delve?.finds ?? []).map((f) => ({
      category: f.category,
      appetite: findAppetite(this.persona, {
        lives: livesOf(s, me),
        wards: inv?.wards ?? 0,
        losses: findLosses(f.kind),
        depth: shownDepth(s.round),
        teammates: standingIds(s).filter((id) => id !== me).length,
      }),
    }));
    // The cards looked over meanwhile, and the click begun early enough to land on time.
    const lead = this.hand.lead();
    const at = session.hostNow() + Math.max(300, pickDelay(this.persona, Math.random, offered.length) - lead);
    this.hand.lookOverCards(offered.length, Date.now() + (at - session.hostNow()));
    const still = () => {
      const cur = session.state;
      if (cur?.phase !== 'choosing' || cur.turnCount !== s.turnCount || cur.round !== s.round) return null;
      return type === 'vote' && cur.delve?.votes?.[me] ? null : cur;
    };
    this.plans.set(key, {
      at,
      run: async () => {
        let cur = still();
        if (!cur) return;
        let category = chooseCard(this.persona, offered, finds, Math.random);
        // Together: the team's votes so far may sway it.
        if (type === 'vote') {
          const theirs = Object.entries(cur.delve?.votes ?? {}).flatMap(([id, c]) => (id !== me && offered.includes(c) ? [c] : []));
          category = withTheHerd(this.persona, category, theirs, Math.random);
        }
        await this.hand.click(`card:${cur.offered.indexOf(category)}`);
        cur = still();
        if (!cur) return;
        log(type === 'pick' ? 'picks' : 'votes for', category);
        session.dispatch(type === 'pick' ? { type: 'pick', category } : { type: 'vote', category });
        if (type === 'vote') this.planRethink(s, category);
      },
    });
  }

  /** Delve together: second thoughts about its vote now and then, while the vote is open (mostly over to the team's). */
  private planRethink(s: GameState, voted: string) {
    const after = rethinks(this.persona, Math.random);
    if (after === null) return;
    const me = session.myPlayerId!;
    this.plans.set(`rethink:${s.round}:${s.turnCount}`, {
      at: session.hostNow() + after,
      run: async () => {
        const open = () => {
          const cur = session.state;
          return cur?.phase === 'choosing' && cur.round === s.round && cur.turnCount === s.turnCount && cur.delve?.votes?.[me] === voted ? cur : null;
        };
        const cur = open();
        if (!cur) return;
        const theirs = Object.entries(cur.delve?.votes ?? {}).flatMap(([id, c]) => (id !== me && c !== voted && cur.offered.includes(c) ? [c] : []));
        const others = cur.offered.filter((c) => c !== voted);
        const category = theirs.length ? withTheHerd({ ...this.persona, herd: 1 }, voted, theirs, Math.random) : others.length ? pickCategory(this.persona, others, Math.random) : voted;
        if (category === voted) return;
        await this.hand.click(`card:${cur.offered.indexOf(category)}`);
        if (!open()) return;
        log('changes its vote to', category);
        session.dispatch({ type: 'vote', category });
      },
    });
  }

  /** Delve together: gives a teammate who perished one of its lives, whenever it can (once a depth each, after a moment). */
  private planRevive(s: GameState) {
    const me = session.myPlayerId!;
    for (const p of s.players) {
      if (p.id === me || reviveProblem(s, me, p.id)) continue;
      const key = `revive:${p.id}:${s.round}`;
      if (this.decided.has(key)) continue;
      this.decided.add(key);
      this.plans.set(key, {
        at: session.hostNow() + between(1500, 5000) * this.persona.pace,
        run: async () => {
          // The life is given from the teammate's row on the scoreboard.
          await this.hand.click(`row:${session.state?.players.findIndex((o) => o.id === p.id) ?? -1}`);
          const cur = session.state;
          if (!cur || reviveProblem(cur, me, p.id)) return;
          log('gives a life to', p.name);
          session.dispatch({ type: 'revive', target: p.id });
        },
      });
    }
  }

  /** The question still open as it was asked, and still on the clock (a flare's time included). */
  private open(q: Question) {
    const cur = session.state;
    const o = cur?.question;
    return cur?.phase === 'question' && o?.askedAt === q.askedAt && (!o.deadline || session.hostNow() <= o.deadline) ? o : null;
  }

  /**
   * Answers what the eyes make of it: the right option if it knows, else a
   * guess (falling for a look-alike of what the eyes saw). Eyes that can't
   * tell leave a guess among the options still in.
   */
  /** `seen`: what the eyes made of it when it made up its mind (they look again only if they couldn't tell then). */
  private async answer(s: GameState, q: Question, knows: boolean, ask: Ask, ruledOut: number[], what: string, seenBefore: number | null) {
    const seen = seenBefore ?? (await this.eyes(s, q));
    const o = this.open(q);
    if (!o) return;
    const names = optionNames(o);
    let index: number;
    if (seen === null) {
      const left = names.map((_, i) => i).filter((i) => !ruledOut.includes(i));
      index = left[Math.floor(Math.random() * left.length)] ?? 0;
    } else index = chooseAnswer(names, seen, knows && seen !== null, ask, ruledOut, Math.random);
    // Now and then the click lands next door.
    if (misclicks(this.persona, Math.random)) {
      const next = [index - 1, index + 1].filter((i) => i >= 0 && i < names.length && !ruledOut.includes(i));
      if (next.length) {
        index = next[Math.floor(Math.random() * next.length)];
        what += ' (misclicks)';
      }
    }
    // The press lands before the clock's end (a little before, for the trip to the host).
    await this.hand.click(`opt:${index}`, o.deadline ? Date.now() + (o.deadline - session.hostNow()) - 250 : Infinity);
    if (!this.open(q)) return;
    this.answers++;
    const truth = o.itemId ? (index === o.options.indexOf(o.itemId) ? ' right' : ' wrong') : '';
    log(`${what}${truth} (option ${index + 1}) after ${((session.hostNow() - (q.clockAt ?? q.askedAt)) / 1000).toFixed(1)} s`);
    session.dispatch({ type: 'answer', index, askedAt: q.askedAt });
  }

  /**
   * Answers each question once: first a look at what is shown (a moment for
   * the art to come in, longer for a guest's eyes on art still burning in),
   * then it makes up its mind (decide).
   */
  private planAnswer(s: GameState, q: Question) {
    const key = `answer:${q.askedAt}`;
    if (this.decided.has(key)) return;
    this.decided.add(key);
    const start = q.clockAt ?? q.askedAt;
    let tries = 0;
    const look = async () => {
      const cur = session.state;
      const o = this.open(q);
      if (!cur || !o) return;
      const seen = await this.eyes(cur, o);
      if (seen === null && tries++ < 8) return void this.plans.set(key, { at: session.hostNow() + 500, run: look });
      this.decide(key, cur, o, start, seen);
    };
    this.plans.set(key, { at: Math.max(session.hostNow() + 300, start + 400), run: look });
  }

  /**
   * Whether it knows, when to answer and what. Its time counts from the
   * clock's start; an answer the clock beats isn't given (a flare that burns
   * moves the clock's end on, and with it the answer still in time). One of
   * its favourites it knows cold and names quickly; a nervous player may
   * panic into an answer once the clock ticks urgent. Not sure in Delve:
   * alone it may detonate dynamite rather than guess; together it holds back
   * (lateGuess).
   */
  private decide(key: string, s: GameState, q: Question, start: number, seen: number | null) {
    const me = session.myPlayerId!;
    const now = session.hostNow();
    const rules = activeRules(s);
    const gray = grayscaleFor(s);
    const item = itemOf(q, seen);
    const ask: Ask = {
      rules,
      category: q.category,
      veil: q.veil ? (rules.veil?.share ?? 0.5) : 0,
      gray: gray === 'all' || (gray === 'art' && q.mode === 'art'),
      // A guest only learns which were flipped at the reveal: as likely as the rules say.
      mirrored: q.mirrored?.length ? q.mirrored.some(Boolean) : Math.random() < rules.mirror,
      clock: q.deadline ? (q.deadline - start) / 1000 : 0,
      mode: s.delve ? 'delve' : s.settings.mode === 'race' ? 'race' : 'turns',
      favourite: !!item && this.persona.favourites.includes(item),
      remembered: !!item && this.revealed.has(item),
      // Two misses in a row start to tell, three or more fully.
      tilt: Math.min(1, Math.max(0, (this.misses - 1) / 2)),
      warming: this.answers < 3,
      tired: tiredness((Date.now() - this.since) / 60000),
    };
    const knows = Math.random() < knowChance(this.persona, ask);
    const delay = answerDelay(this.persona, ask, knows, Math.random);
    if (delay === null) {
      log(`lets "${q.category}" go by`);
      return;
    }
    if (ask.mode === 'delve' && !knows && isGroupRun(s)) return this.lateGuess(key, s, q, ask, start, seen);
    if (ask.mode === 'delve' && !knows && !blastProblem(s, me) && blasts(this.persona, Math.random)) {
      // Not sure, and dynamite at hand: blast it away for another (deciding so is quicker than answering).
      this.plans.set(key, {
        at: Math.max(now + 800, start + delay * 0.6),
        run: () => {
          if (!this.open(q) || blastProblem(session.state!, me)) return;
          log('detonates dynamite');
          session.dispatch({ type: 'blast', askedAt: q.askedAt });
        },
      });
      return;
    }
    const panicked = panic(this.persona, ask, delay, Math.random);
    const how = [
      ask.favourite && 'one of its own',
      ask.remembered && 'seen it before',
      ask.tilt && (this.persona.temper < 0 ? 'tilted' : 'steadied'),
      panicked && (panicked.fumble ? 'panics and fumbles' : 'panics'),
    ]
      .filter(Boolean)
      .join(', ');
    // The hand starts for the answer early enough to click on time, looking the question over until then.
    const at = Math.max(now + 200, start + (panicked ? panicked.at : delay) - this.hand.lead());
    this.hand.ponder(q, Date.now() + (at - now));
    this.plans.set(key, {
      // Picked up after a reload: not all at once.
      at,
      run: () => {
        const o = this.open(q);
        if (!o) return;
        // Options already shown wrong (others' guesses in a race, the team's in Delve) are out.
        const ruledOut = [...o.misses.map((m) => m.index), ...(o.struck ?? []).map((x) => x.index)];
        return this.answer(s, q, knows && !panicked?.fumble, ask, ruledOut, how ? `answers (${how})` : 'answers', seen);
      },
    });
  }

  /**
   * Delve together, not sure: a teammate may know it, and a wrong guess
   * costs a life and strikes the option for everyone, so it waits to near
   * the clock's end. Then, if nobody has got it: dynamite going off by itself
   * at 0 costs nobody anything, so it leaves that to the fuse; a flare about
   * to burn gives everyone more time, so it waits for the new end; otherwise
   * it guesses, as a time-out would cost the life anyway.
   */
  private lateGuess(key: string, s: GameState, q: Question, ask: Ask, start: number, seen: number | null) {
    const me = session.myPlayerId!;
    const margin = between(1000, 2500);
    const run = () => {
      const cur = session.state;
      const o = cur?.question;
      if (!cur || cur.phase !== 'question' || o?.askedAt !== q.askedAt || !o.deadline || o.struck?.some((x) => x.by === me)) return;
      // Not near the end yet (or a flare moved it on): wait for it.
      if (o.deadline - margin > session.hostNow() + 300) return void this.plans.set(key, { at: o.deadline - margin, run });
      if (fuseDue(cur)) return log('holds: the dynamite goes off by itself');
      if (teamItemReady(cur, 'flares') && !o.flared) return void this.plans.set(key, { at: o.deadline + 400, run });
      return this.answer(s, q, false, ask, (o.struck ?? []).map((x) => x.index), 'guesses near the end:', seen);
    };
    const at = Math.max(start + 1000, q.deadline! - margin);
    this.hand.ponder(q, Date.now() + (at - session.hostNow()));
    this.plans.set(key, { at, run });
  }
}
