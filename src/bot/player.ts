// A bot at the table: plays its turns, races and Delve runs as one of the
// cast (brain.ts), whether it hosts the room (host.ts) or joined someone
// else's (guest.ts). Only how it finds the right option differs: the host
// has it in its state, a guest has to recognise the art (sight.ts).
// Everything it does goes through the session's dispatch, as a person's
// clicks would, and its timing runs on the host's clock.

import { engine, session } from '../lib/session.svelte';
import { activeRules, grayscaleFor, type GameState, type Question } from '../lib/game';
import { WAY_OUT, blastProblem, dealIn, digOf, findLosses, fuseDue, inventoryOf, isGroupRun, livesOf, reviveProblem, shownDepth, standingIds, teamItemReady } from '../lib/delve';
import { afterSeeing, answerDelay, blasts, chooseAnswer, chooseCard, digsOn, findAppetite, itemDraw, knowChance, knowsIt, misclicks, movesOn, panic, pickCategory, pickDelay, rethinks, sightNeeded, tiredness, withTheHerd, wrongPick, type Ask, type Persona } from './brain';
import { inView, watchVeil } from './glimpse';
import { looksOf } from './lookalike';
import { Recall } from './recall';
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
import { Hand, dealtAt } from './hand';

/** New to the game, a guest tries the button to move on through someone else's reveal at most this many reveals in, each time this likely; once is enough to learn (regulars know). */
const TRY_NEXT_FOR = 3;
const TRY_NEXT_CHANCE = 0.25;
/** Delve together, out of a question after a wrong answer: how often it points out what it now thinks the answer is. */
const HINT_CHANCE = 0.4;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * What a bot leans to as it looks a question over, and what else it's torn
 * between (answer indices, the lean first; hand.ts rests its pointer on
 * them): knowing it, just the answer its eyes found; not knowing, that and
 * the look-alikes it might fall for, either of the first two its lean. Its
 * eyes none the wiser: a few of them at random.
 */
function torn(names: string[], seen: number | null, knows: boolean, looks?: (number | null)[]): number[] {
  const all = names.map((_, i) => i);
  if (seen === null) {
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, 3);
  }
  if (knows) return [seen];
  const out = [seen];
  for (let k = 0; k < 2; k++) {
    const other = wrongPick(names, seen, out, Math.random, looks);
    if (other !== null) out.push(other);
  }
  if (out.length > 1 && Math.random() < 0.5) [out[0], out[1]] = [out[1], out[0]];
  return out;
}

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
  /** And the ones it saw on earlier visits, fading (recall.ts): kept by its name. */
  private readonly recall: Recall | null;
  /** Its own misses in a row (wrong or out of time), this game. */
  private misses = 0;
  /** The question whose reveal it has taken in. */
  private takenIn = 0;
  /** When it came on, and how many answers it has given since (warming up, tiring). */
  private readonly since = Date.now();
  private answers = 0;
  /** A race question it let go by, not sure, and how it saw it then (calmPick). */
  private satOut: { askedAt: number; ask: Ask; seen: number | null } | null = null;
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
    this.recall = persona.seed ? new Recall(persona.seed) : null;
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
    if (s.phase === 'question' && s.question) watchVeil(s.question);
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
    if (r.correctId) {
      this.revealed.add(r.correctId);
      this.recall?.saw(r.correctId);
    }
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
      if (s.delve || s.hostId === me || this.learnedNext || !this.persona.newcomer || !s.players.some((p) => p.id === me)) return;
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
    this.calmPick(s, q);
  }

  /**
   * A race question it let go by, not sure: once everyone else has missed,
   * nobody can beat it to it any more, and with time left most think it
   * over without the pressure and pick (as sure as on a turn of their own,
   * the options the others got wrong out).
   */
  private calmPick(s: GameState, q: Question) {
    const sat = this.satOut;
    if (!sat || sat.askedAt !== q.askedAt || !q.deadline) return;
    const me = session.myPlayerId!;
    const others = s.players.filter((p) => p.id !== me && p.connected);
    if (!others.length || !others.every((p) => q.misses.some((m) => m.playerId === p.id))) return;
    this.satOut = null;
    const think = Math.round(between(1500, 4500) * this.persona.pace);
    if (q.deadline - session.hostNow() < think + 1200 || Math.random() < 0.15) return log('lets it go, even with the rest out');
    const ask: Ask = { ...sat.ask, mode: 'turns' };
    const knows = knowsIt(knowChance(this.persona, ask), itemDraw(this.persona.seed, itemOf(q, sat.seen)), Math.random);
    this.plans.set(`calm:${q.askedAt}`, { at: session.hostNow() + think, run: () => this.answerNow(s, q, knows, ask, 'picks, the rest all out', sat.seen) });
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
      if (together && q.struck?.some((x) => x.by === me)) return this.planHint(s, q);
      if (!together && s.players[s.turn]?.id !== me) return;
      this.planAnswer(s, q);
    }
  }

  /**
   * Delve together, its own answer struck wrong: now and then, with the
   * others still at it and time left, it rests its pointer on what it now
   * thinks the answer is, for them to see. Seeing it again, it may make it
   * out now; otherwise its next guess is a look-alike of the one it had.
   * Not always, and not at once: a person takes a moment over a miss.
   */
  private planHint(s: GameState, q: Question) {
    const key = `hint:${q.askedAt}`;
    if (this.decided.has(key)) return;
    this.decided.add(key);
    const me = session.myPlayerId!;
    const struck = (q.struck ?? []).map((x) => x.index);
    const answering = standingIds(s).filter((id) => id !== me && !q.struck?.some((x) => x.by === id));
    if (!answering.length || !q.deadline || Math.random() >= HINT_CHANCE) return;
    const at = session.hostNow() + between(1200, 3500) * this.persona.pace;
    if (q.deadline - at < 3500) return;
    this.plans.set(key, {
      at,
      run: async () => {
        const cur = session.state;
        const o = this.open(q);
        if (!cur || !o) return;
        const seen = await this.eyes(cur, o);
        if (seen === null) return;
        const out = [...struck, ...(o.struck ?? []).map((x) => x.index)];
        const names = optionNames(o);
        const think = !out.includes(seen) && Math.random() < 0.35 ? seen : wrongPick(names, seen, out, Math.random, looksOf(o, seen));
        if (think === null || out.includes(think)) return;
        log(`points at option ${think + 1} for the others`);
        this.hand.point(`opt:${think}`, Date.now() + Math.max(0, o.deadline! - session.hostNow()));
      },
    });
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
    // The cards looked over meanwhile, from when they are dealt (a new zone's, as the plunge into it lands), and the
    // click begun early enough to land on time.
    const now = session.hostNow();
    const dealt = now + dealIn(s, now);
    const at = dealt + Math.max(300, pickDelay(this.persona, Math.random, offered.length) - this.hand.lead());
    this.hand.lookOverCards(offered.length, Date.now() + (at - now), dealtAt(s));
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
        // A vein's two cards: dig deeper, or take the way out with the haul.
        const dig = offered.includes(WAY_OUT) ? digOf(cur) : null;
        const vein = offered.find((c) => c !== WAY_OUT);
        let category =
          dig && vein
            ? digsOn(
                this.persona,
                {
                  haul: dig.haul.length,
                  lives: livesOf(cur, me),
                  wards: inv?.wards ?? 0,
                  light: dig.light,
                  affinity: this.persona.affinity[vein] ?? 0,
                  teammates: standingIds(cur).filter((id) => id !== me).length,
                },
                Math.random,
              )
              ? vein
              : WAY_OUT
            : chooseCard(this.persona, offered, finds, Math.random);
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

  /** Delve together: gives a teammate who perished one of its lives, whenever it can (once an offer each, a moment after the cards are dealt). */
  private planRevive(s: GameState) {
    const me = session.myPlayerId!;
    for (const p of s.players) {
      if (p.id === me || reviveProblem(s, me, p.id)) continue;
      const key = `revive:${p.id}:${s.turnCount}`;
      if (this.decided.has(key)) continue;
      this.decided.add(key);
      const now = session.hostNow();
      this.plans.set(key, {
        at: now + dealIn(s, now) + between(1500, 5000) * this.persona.pace,
        run: async () => {
          // Planned on the reveal before a new zone and due in the plunge into it: that depth's own plan, from the deal, gives it.
          const cur0 = session.state;
          if (!cur0 || dealIn(cur0, session.hostNow()) > 0) return;
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

  /**
   * The question still open as it was asked, and still on the clock (a flare's
   * time included). Delve: on the same clock, not held still by the host's
   * reload nor carrying on after it (a new clockAt, planned afresh).
   */
  private open(q: Question) {
    const cur = session.state;
    const o = cur?.question;
    return cur?.phase === 'question' && o?.askedAt === q.askedAt && o.clockAt === q.clockAt && (!o.deadline || session.hostNow() <= o.deadline) ? o : null;
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
    } else index = chooseAnswer(names, seen, knows && seen !== null, ask, ruledOut, Math.random, looksOf(o, seen));
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
    // A clock the host's reload held still carries on from a new clockAt: answered afresh.
    const key = `answer:${q.askedAt}:${q.clockAt ?? ''}`;
    if (this.decided.has(key)) return;
    this.decided.add(key);
    const start = q.clockAt ?? q.askedAt;
    let tries = 0;
    const look = async () => {
      const cur = session.state;
      const o = this.open(q);
      if (!cur || !o) return;
      const seen = await this.eyes(cur, o);
      // Burning in, the eyes may need a while to make anything out: they keep looking till near the end.
      const longer = !!o.veil && !!o.deadline && session.hostNow() < o.deadline - 3000;
      if (seen === null && (tries++ < 8 || longer)) return void this.plans.set(key, { at: session.hostNow() + 500, run: look });
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
      // This sitting's reveals stick; earlier visits' fade.
      remembered: !item ? 0 : this.revealed.has(item) ? 1 : (this.recall?.strength(item) ?? 0),
      // Two misses in a row start to tell, three or more fully.
      tilt: Math.min(1, Math.max(0, (this.misses - 1) / 2)),
      // New to the game, it takes longer to get into it.
      warming: this.answers < (this.persona.newcomer ? 8 : 3),
      tired: tiredness((Date.now() - this.since) / 60000),
    };
    // The same player knows the same items, and misses the same ones (but for a lapse now and then).
    const knows = knowsIt(knowChance(this.persona, ask), itemDraw(this.persona.seed, item), Math.random);
    const delay = answerDelay(this.persona, ask, knows, Math.random);
    if (delay === null) {
      log(`lets "${q.category}" go by`);
      // In a race, it may still pick once the rest have all missed (calmPick).
      if (ask.mode === 'race') this.satOut = { askedAt: q.askedAt, ask, seen };
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
    if (q.veil) return this.waitForSight(key, s, q, start, seen, ask, knows);
    const panicked = panic(this.persona, ask, delay, Math.random);
    const how = this.how(ask, panicked);
    // The hand starts for the answer early enough to click on time, looking the question over until then.
    const at = Math.max(now + 200, start + (panicked ? panicked.at : delay) - this.hand.lead());
    this.hand.ponder(q, Date.now() + (at - now), torn(optionNames(q), seen, knows, seen === null ? undefined : looksOf(q, seen)));
    this.plans.set(key, {
      // Picked up after a reload: not all at once.
      at,
      run: () => this.answerNow(s, q, knows && !panicked?.fumble, ask, how ? `answers (${how})` : 'answers', seen),
    });
  }

  /** What made the answer what it was, for the log. */
  private how(ask: Ask, panicked: { fumble: boolean } | null, more: (string | false)[] = []) {
    return [
      ask.favourite && 'one of its own',
      Number(ask.remembered) >= 0.3 && 'seen it before',
      ask.tilt && (this.persona.temper < 0 ? 'tilted' : 'steadied'),
      panicked && (panicked.fumble ? 'panics and fumbles' : 'panics'),
      ...more,
    ]
      .filter(Boolean)
      .join(', ');
  }

  /** Answers now, if the question is still open: options already shown wrong (others' guesses in a race, the team's in Delve) are out. */
  private answerNow(s: GameState, q: Question, knows: boolean, ask: Ask, what: string, seen: number | null) {
    const o = this.open(q);
    if (!o) return;
    const ruledOut = [...o.misses.map((m) => m.index), ...(o.struck ?? []).map((x) => x.index)];
    return this.answer(s, q, knows, ask, ruledOut, what, seen);
  }

  /**
   * The art burning in: it makes up its mind once enough of the item is in
   * view for it (sightNeeded: a sliver for a favourite, more where it's
   * crowded by look-alikes, most of it when it doesn't know), as its own
   * screen shows it (glimpse.ts), then answers a moment later (afterSeeing),
   * never sooner than reading the options takes. A trigger-happy player now
   * and then goes before they're sure; a nervous one may still panic into it
   * once the clock ticks urgent; and with the clock nearly out, it goes
   * with what it has.
   */
  private waitForSight(key: string, s: GameState, q: Question, start: number, seen: number | null, ask: Ask, knows: boolean) {
    const now = session.hostNow();
    const need = sightNeeded(this.persona, ask, knows, Math.random);
    // Going early, it's as often as not a guess.
    const sure = need.early ? knows && Math.random() < 0.35 : knows;
    const react = afterSeeing(this.persona, ask, sure, Math.random);
    const floor = start + Math.round(0.5 * (answerDelay(this.persona, { ...ask, veil: 0 }, true, Math.random) ?? 0));
    // When it expects to go (the art comes in about evenly over the veil's time), to look the question over until.
    const expected = Math.max(floor, start + 400 + need.share * q.veil!.seconds * 1000 + react);
    const panicked = panic(this.persona, ask, expected - start, Math.random);
    const lead = () => this.hand.lead();
    const what = () => {
      const how = this.how(ask, panicked, [need.early && 'goes early', `on ${Math.round(100 * need.share)}% of the art`]);
      return `answers (${how})`;
    };
    this.hand.ponder(q, Date.now() + Math.max(200, expected - lead() - now), torn(optionNames(q), seen, sure, seen === null ? undefined : looksOf(q, seen)));
    // The picture it's after, on a question of pictures each burning in: the one its eyes take for it.
    const tile = q.mode === 'art' ? seen : null;
    const check = () => {
      const o = this.open(q);
      if (!o) return;
      const t = session.hostNow();
      if (panicked && t >= start + panicked.at - lead()) return this.answerNow(s, q, sure && !panicked.fumble, ask, what(), seen);
      if (inView(o, tile) >= need.share) return void this.plans.set(key, { at: Math.max(t + react, floor) - lead(), run: () => this.answerNow(s, q, sure, ask, what(), seen) });
      // The clock all but out: it goes with what it has.
      if (o.deadline && t >= o.deadline - 900 - lead()) return this.answerNow(s, q, sure && Math.random() < 0.5, ask, `${what()}, out of time`, seen);
      this.plans.set(key, { at: t + 150, run: check });
    };
    this.plans.set(key, { at: Math.max(now, start + 400), run: check });
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
      if (!cur || cur.phase !== 'question' || o?.askedAt !== q.askedAt || o.clockAt !== q.clockAt || !o.deadline || o.struck?.some((x) => x.by === me)) return;
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
