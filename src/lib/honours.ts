// Honours: at the end of a turns game, nearly everyone takes a line home.
// Each honour goes to the best player for it who has none yet, in a fixed
// order (ties: seat order), so one player never gets two and every screen
// hands out the same ones: they are read from the players' tallies, which
// the host counts (Player.tally in game.ts). Race and Delve have none, nor
// does a game played alone. Only types come from game.ts.

import type { GameState, Player, Tally } from './game.ts';
import { ABLAZE_FROM } from './fx/streaks.ts';

export interface Honour {
  title: string;
  detail: string;
}

/** The Comeback: won after trailing the leader by this many points at the end of a round. */
export const COMEBACK_FROM = 3;
/** Keen Eye: at least this many questions asked... */
export const KEEN_ASKED = 3;
/** ...and at least this share of them right. */
export const KEEN_SHARE = 0.75;
/** Wild Imagination: believed in this many made-up items. */
export const FOOLED_FROM = 2;

/** The honours, in the order they are handed out. */
export const HONOUR_TITLES = ['Last One Standing', 'The Comeback', 'Ablaze', 'Keen Eye', 'First Blood', 'So Close', 'Wild Imagination'] as const;

const NONE: Tally = { asked: 0, right: 0, best: 0, fooled: 0, behind: 0 };

/** Whether the game's end hands out honours: a turns game over, played by two or more. */
export function hasHonours(s: GameState): boolean {
  return s.phase === 'over' && !s.delve && s.settings.mode !== 'race' && s.settings.mode !== 'delve' && s.players.length >= 2;
}

/** Each player's honour, by id (those without one are missing). */
export function honours(s: GameState): Map<string, Honour> {
  const out = new Map<string, Honour>();
  if (!hasHonours(s)) return out;
  const tally = (p: Player) => p.tally ?? NONE;
  const won = (p: Player) => s.winners.includes(p.id);
  /**
   * Hands `title` to the player without an honour yet who ranks highest
   * (`rank`: null when they don't qualify), the first seated among equals.
   */
  const give = (title: (typeof HONOUR_TITLES)[number], rank: (p: Player) => number | null, detail: (p: Player) => string) => {
    let best: Player | null = null;
    let top = -Infinity;
    for (const p of s.players) {
      const r = out.has(p.id) ? null : rank(p);
      if (r !== null && r > top) {
        best = p;
        top = r;
      }
    }
    if (best) out.set(best.id, { title, detail: detail(best) });
  };
  const winning = s.players.filter(won).map((p) => p.score);
  const winnerScore = winning.length ? Math.max(...winning) : null;
  const firsts = s.players.map((p) => tally(p).first).filter((t) => t !== undefined);
  const firstPoint = firsts.length ? Math.min(...firsts) : null;

  give('Last One Standing', (p) => (s.deathmatch && won(p) ? 0 : null), () => 'Won the deathmatch');
  give(
    'The Comeback',
    (p) => (won(p) && tally(p).behind >= COMEBACK_FROM ? tally(p).behind : null),
    (p) => `Won after trailing by ${tally(p).behind}`,
  );
  give('Ablaze', (p) => (tally(p).best >= ABLAZE_FROM ? tally(p).best : null), (p) => `${tally(p).best} in a row`);
  give(
    'Keen Eye',
    (p) => {
      const t = tally(p);
      return t.asked >= KEEN_ASKED && t.right / t.asked >= KEEN_SHARE ? t.right / t.asked : null;
    },
    (p) => `${tally(p).right} of ${tally(p).asked} right`,
  );
  // Only the game's very first point: nobody else scored it.
  give('First Blood', (p) => (firstPoint !== null && tally(p).first === firstPoint ? 0 : null), () => 'Scored the first point');
  give(
    'So Close',
    (p) => {
      const gap = winnerScore === null || won(p) ? -1 : winnerScore - p.score;
      return gap >= 0 && gap <= 1 ? -gap : null;
    },
    (p) => (p.score === winnerScore ? 'Level on points' : '1 point short'),
  );
  give(
    'Wild Imagination',
    (p) => (tally(p).fooled >= FOOLED_FROM ? tally(p).fooled : null),
    (p) => `Believed in ${tally(p).fooled} made-up items`,
  );
  return out;
}
