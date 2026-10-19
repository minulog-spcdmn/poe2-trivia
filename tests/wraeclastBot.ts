import { seededRandom } from '../src/lib/patches.ts';
import { Run, DEFAULT_TUNING, SUPPLIES, gridAdjacency, type Supply, type Tuning } from '../src/wraeclast/rules.ts';

// The Wraeclast run's economy bot (tests/wraeclastEconomy.test.ts holds
// DEFAULT_TUNING to the v4 handoff's targets with it): a player who uses about 1.9
// supplies an item and misses about 1 item in 6 (the third playtest's rate)
// finds about a third of what it uses as loot and buys the rest, ends with
// under about 15% of the gold it earned unspent, and can afford roughly what
// it uses but not everything. The runs play the owner's map, about 17 items.

/** The supplies the bot uses an item, on average (the third playtest's). */
export const USES = 1.9;

/** What the bot reaches for first: the clues that settle a name soonest. */
const LIKES: Supply[] = ['flare', 'wisdom', 'lore', 'deck', 'lengths', 'first', 'decoy', 'base', 'category'];

export interface BotRun {
  won: boolean;
  items: number;
  used: number;
  found: number;
  bought: number;
  earned: number;
  spent: number;
  left: number;
  /** Uses the bot wanted and its pack couldn't give. */
  short: number;
  /** Cards the bot wanted at a vendor and couldn't pay for. */
  cantAfford: number;
  /** Gold earned after the last vendor it saw. */
  stranded: number;
}

/** The items before the next vendor (a town, or the run's end): in zones, and in all (the boss's counting); and whether this is the last town. */
function itemsAhead(run: Run) {
  const g = run.graph;
  let zones = 0;
  let boss = 0;
  for (let step = run.node.step + 1; step <= g.boss.step; step++) {
    const here = g.atStep.get(step) ?? [];
    if (here.every((n) => n.kind === 'town')) return { zones, all: zones + boss, last: false };
    if (here.some((n) => n.kind === 'boss')) boss = 3;
    else zones += run.state.tuning.itemsPerZone;
  }
  return { zones, all: zones + boss, last: run.state.places[run.state.at].kind === 'town' };
}

/** One run by the bot, seeded. */
export function botRun(seed: number, tuning: Tuning = DEFAULT_TUNING, trace?: (line: string) => void): BotRun {
  const rng = seededRandom(seed ^ 0x5bd1e995);
  const run = new Run({ seed, tuning, now: () => 0 });
  const s = run.state;
  let short = 0;
  let cantAfford = 0;
  const late = { earned: 0 };
  for (let guard = 0; guard < 500 && s.phase !== 'end'; guard++) {
    if (s.phase === 'vendor') {
      late.earned = s.log.goldEarned;
      // Buys what it likes, a card of each at most, until its pack holds USES for each item before the next vendor (Torches for the boss's, where only they work), while the gold lasts.
      const ahead = itemsAhead(run);
      const boss = ahead.all - ahead.zones;
      const need = (sup: Supply) => (sup === 'flare' ? Math.ceil(boss * USES + ahead.zones * 0.3) : Math.ceil(ahead.zones * (USES - 0.3)));
      const units = () => s.pack.reduce((n, st) => n + (st.supply === 'flare' ? 0 : st.n), 0);
      for (const want of LIKES) {
        const i = s.stock.indexOf(want);
        if (i < 0) continue;
        // At the last town nothing is kept back: what's left goes on supplies.
        const enough = !ahead.last && (want === 'flare' ? run.held('flare') >= need('flare') : units() >= need('wisdom'));
        if (!enough && run.canBuy(i)) run.buy(i);
        else if (!enough && s.gold < s.tuning.price[want]) cantAfford++;
      }
      trace?.(`${s.at} step ${run.node.step}: ahead ${ahead.zones}+${boss}, gold ${s.gold}, pack ${s.pack.map((st) => st.supply + st.n).join(' ')}`);
    }
    if (s.phase === 'vendor' || s.phase === 'map' || (s.phase === 'solved' && run.leaving())) {
      const opts = run.options();
      const zones = opts.filter((o) => s.places[o].kind === 'zone' || s.places[o].kind === 'boss');
      const pick = zones.length && rng() < 0.9 ? zones : opts;
      run.choose(pick[Math.floor(rng() * pick.length)]);
      continue;
    }
    if (s.phase === 'boss') {
      run.face();
      continue;
    }
    if (s.phase === 'solved') {
      if (s.loot?.pending.length) run.keep(null);
      else run.next();
      continue;
    }
    if (s.phase === 'item') {
      const it = s.item!;
      if (it.openedAt !== null) throw new Error(`the bot is stuck on ${it.itemId}`);
      run.open(gridAdjacency(9));
      // 1, 2 or 3 supplies, USES on average; in a zone a Torch last, so some are left for the boss.
      const r = rng();
      const want = r < 0.3 ? 1 : r < 0.8 ? 2 : 3;
      let used = 0;
      const order = it.boss === null ? [...LIKES.slice(1), 'flare' as const] : LIKES;
      for (const sup of [...order, ...order]) {
        if (used >= want) break;
        if (run.canUse(sup)) run.use(sup), used++;
      }
      short += want - used;
      if (s.life < 45 && run.canDrink()) run.drink();
      if (rng() < 1 / 6) {
        const wrong = it.tiles.find((t) => !it.answer.includes(t))!;
        run.place(wrong);
        run.submit();
        if (s.phase !== 'item') continue;
        run.clear();
      }
      run.clear();
      for (const t of it.answer.slice(it.build.length)) run.place(t);
      run.submit();
    }
  }
  const sum = (r: Record<Supply, number>) => SUPPLIES.reduce((n, k) => n + r[k], 0);
  return {
    won: s.log.result === 'win',
    items: s.log.items.length,
    used: sum(s.log.used),
    found: sum(s.log.found),
    bought: sum(s.log.bought),
    earned: s.log.goldEarned,
    spent: s.log.goldSpent,
    left: s.gold,
    short,
    cantAfford,
    stranded: s.log.goldEarned - late.earned,
  };
}

/** The bot's runs, summed. */
export function botRuns(n: number, tuning: Tuning = DEFAULT_TUNING) {
  const runs = Array.from({ length: n }, (_, i) => botRun(1000 + i, tuning));
  const total = (k: keyof BotRun) => runs.reduce((t, r) => t + Number(r[k]), 0);
  const items = total('items');
  const wins = runs.filter((r) => r.won);
  return {
    runs: n,
    won: runs.filter((r) => r.won).length / n,
    items: items / n,
    usedPerItem: total('used') / items,
    foundShare: total('found') / total('used'),
    boughtShare: total('bought') / total('used'),
    unspent: total('left') / total('earned'),
    /** The same over the runs won (a lost run ends with its gold where it fell). */
    unspentWon: wins.reduce((t, r) => t + r.left, 0) / wins.reduce((t, r) => t + r.earned, 0),
    itemsWon: wins.reduce((t, r) => t + r.items, 0) / wins.length,
    short: total('short') / items,
    cantAfford: total('cantAfford') / n,
    perRun: { stranded: total('stranded') / n, used: total('used') / n, found: total('found') / n, bought: total('bought') / n, earned: total('earned') / n, spent: total('spent') / n, left: total('left') / n },
  };
}

