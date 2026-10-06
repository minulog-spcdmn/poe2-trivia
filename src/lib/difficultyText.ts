// How difficulties are put into words. Presets and custom difficulties are
// described by the same sentences, and the custom editor uses the same terms,
// so a knob reads the same wherever it shows up.

import {
  FINDS_FROM,
  FLARE_MS,
  SHARDS_PER_WARD,
  cavesIn,
  findLosses,
  findReward,
  type FindKind,
  type Inventory,
  type ItemKind,
} from './delve.ts';
import { knobsOf, maxFakes, type Difficulty, type Knobs, type Settings, type VeilSpeed } from './game.ts';

/** Display names, in the order the lobby offers them. */
export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  cruel: 'Cruel',
  merciless: 'Merciless',
  eternal: 'Eternal',
  custom: 'Custom',
};

const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

type Often = 'Never' | 'Some' | 'Half' | 'Always';
/** How often something happens, for knobs that are a chance or a share. */
function often(v: number): Often {
  return v === 0 ? 'Never' : v === 1 ? 'Always' : v === 0.5 ? 'Half' : 'Some';
}

const VEIL_WORD: Record<VeilSpeed, string> = { off: 'Off', fast: 'Fast', slow: 'Slow', slowest: 'Slowest' };
const VEIL_PACE: Record<Exclude<VeilSpeed, 'off'>, string> = { fast: 'bit by bit', slow: 'slowly', slowest: 'very slowly' };
const ART_SHARE: Record<Exclude<Often, 'Never'>, string> = {
  Some: 'Some questions ask',
  Half: 'Half the questions ask',
  Always: 'Every question asks',
};
const MIRROR_SHARE: Record<Exclude<Often, 'Never'>, string> = { Some: 'Some art is', Half: 'Half the art is', Always: 'All art is' };

/** The difficulty a room plays, in a few sentences. */
export function describe(settings: Pick<Settings, 'difficulty'> & Partial<Settings>): string {
  const k = knobsOf(settings);
  const custom = settings.difficulty === 'custom';
  const lines: string[] = [];

  const count = cap(NUMBER[k.options]);
  if (k.similarNames === 0) {
    // Small groups (five crossbows) can't fill a big question on their own,
    // and once a group runs low the engine mixes groups at any size.
    lines.push(`${count} options of the same kind where the category allows (all rings, all bows…)${k.fakes ? `, ${NUMBER[k.fakes]} of them made up` : ''}.`);
  } else {
    const alike = k.similarNames === 1 ? 'all' : 'half of them';
    lines.push(`${count} options, ${alike} with look-alike names${k.fakes ? ` and ${NUMBER[k.fakes]} made up` : ''}.`);
  }

  const art = often(k.artChance);
  if (art !== 'Never') lines.push(`${ART_SHARE[art]} you to find the art for a name.`);

  // Only the art of name questions burns into view. A preset only does it in
  // race, so in take turns its description still says what race adds.
  const raceOnly = !custom && settings.mode !== 'race';
  const veil = raceOnly ? knobsOf({ ...settings, mode: 'race' }).veil : k.veil;
  if (veil !== 'off' && art !== 'Always') lines.push(`${raceOnly ? 'In race, the' : 'The'} art burns into view ${VEIL_PACE[veil]}.`);

  if (k.grayscale === 'all') lines.push('All art is shown without colour.');
  else if (k.grayscale === 'art' && art !== 'Never') lines.push('"Find the art" pictures are shown without colour.');

  const mirror = often(k.mirror);
  if (mirror !== 'Never') lines.push(`${MIRROR_SHARE[mirror]} mirrored.`);
  return lines.join(' ');
}

/** What changes for deathmatch questions. */
export function deathmatchText(difficulty: Difficulty): string {
  switch (difficulty) {
    case 'cruel':
      return 'Questions are played on Merciless.';
    case 'merciless':
      return 'Questions are played on Eternal.';
    case 'eternal':
      return 'Questions go one step past Eternal.';
    default:
      return 'Each setting that makes questions harder goes one step up.';
  }
}

/** "your next 3 turns": how long a picked category stays locked. */
export const lockoutText = (turns: number) => `your next ${turns} turns`;

export interface KnobText<K extends keyof Knobs = keyof Knobs> {
  key: K;
  name: string;
  /** Kept to one line in the editor, like `off`, so swapping them never moves the rows. */
  hint: string;
  label: (v: Knobs[K]) => string;
  /** Why a step has no effect (or can't be picked) with these settings, if so. */
  off?: (step: Knobs[K], k: Knobs) => string | undefined;
}

/**
 * The custom editor's rows, in order. Labels follow one scheme: a share of
 * the options is None…All, a chance is Never…Always, a count is a number
 * (None for 0), and something that can be switched off starts with Off.
 */
export const KNOB_TEXT: { [K in keyof Knobs]: KnobText<K> }[keyof Knobs][] = [
  { key: 'options', name: 'Options', hint: 'Answers to choose from', label: String },
  {
    key: 'similarNames',
    name: 'Look-alike names',
    hint: 'Wrong answers named like the right one',
    label: (v) => (v === 0 ? 'None' : v === 1 ? 'All' : 'Half'),
  },
  {
    key: 'fakes',
    name: 'Made-up names',
    hint: "Wrong answers that aren't real items",
    label: (v) => (v ? String(v) : 'None'),
    // Each copies a real name that stays on screen.
    off: (v, k) => (v > maxFakes(k.options) ? `Needs ${v * 2} or more options` : undefined),
  },
  { key: 'artChance', name: 'Find the art', hint: 'Pick the art for a given name', label: often },
  {
    key: 'veil',
    name: 'Unveil',
    hint: 'The art burns into view bit by bit',
    label: (v) => VEIL_WORD[v],
    // Only the art of name questions burns into view.
    off: (_, k) => (k.artChance === 1 ? 'No name questions to cover' : undefined),
  },
  {
    key: 'grayscale',
    name: 'Grayscale',
    hint: 'Art shown without colour',
    label: (v) => (v === 'off' ? 'Off' : v === 'art' ? 'Find the art' : 'All art'),
    off: (v, k) => (v === 'art' && k.artChance === 0 ? 'No "find the art" questions' : undefined),
  },
  { key: 'mirror', name: 'Mirrored art', hint: 'Art flipped left to right', label: often },
  { key: 'lockout', name: 'Category lockout', hint: 'Turns until a picked category returns', label: (v) => (v ? String(v) : 'None') },
];

/**
 * How a descent gets harder, for the lobby: where it starts, then that it
 * gets a little harder at every depth. What changes where is left for the
 * player to feel (tests/difficultyText.test.ts checks the start).
 */
export const DELVE_LADDER: { depth: number | null; text: string }[] = [
  { depth: 1, text: 'Four options, 16 seconds' },
  { depth: null, text: 'A little harder every depth: more options, less time, trickier names and pictures' },
];

/** Small numbers in words, for the notes under the cards. */
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const words = (n: number) => WORDS[n] ?? String(n);

/** An item as a reward, with its article. */
export const ITEM_TEXT: Record<ItemKind, string> = {
  wards: 'an Azurite Ward',
  shards: 'an azurite shard',
  flares: 'a flare',
  dynamite: 'dynamite',
};

/** What a wrong answer to a find that caves in costs, in words ("two lives"). */
const caveInText = (kind: FindKind) => `${words(findLosses(kind))} lives`;

/** The finds for the lobby's rules: where they turn up, and what they are in a line. */
export const FINDS_LABEL = `Finds • from depth ${FINDS_FROM}`;
export const FINDS_INTRO = 'A harder question, for an item.';

/** What each find gives, in a line for the lobby: what its item does, and what a miss costs when it is more than a life. */
export const FIND_GIVES: Record<FindKind, string> = {
  azurite: `Answer fast for a ward: it saves a life.${cavesIn('azurite') ? ` A miss costs ${caveInText('azurite')}.` : ''}`,
  flare: `A flare: ${words(FLARE_MS / 1000)} more seconds when your time runs out.`,
  dynamite: 'Dynamite: at half time, it clears the picture and half the answers, all of them wrong.',
};

/** A find's cave-in mark, in words for those who can't see it: "A wrong answer loses two lives". */
export const caveInLabel = (kind: FindKind) => `A wrong answer loses ${caveInText(kind)}`;

/** The mark that takes the place of a find's depth on its card, in words. */
export const HARDER_LABEL = 'A harder question';

/** What each item does once you have it, as the find's note says it. */
const DOES: Record<'flare' | 'dynamite', string> = {
  flare: `It burns when your time runs out: ${words(FLARE_MS / 1000)} more seconds.`,
  dynamite: 'At half time, it clears the picture and half the answers, all of them wrong.',
};

/**
 * What a miss costs, when it costs more than a life (" A miss costs two
 * lives."). That the question is harder, its card's mark says.
 */
const risk = (kind: FindKind) => (cavesIn(kind) ? ` A miss costs ${caveInText(kind)}.` : '');

/**
 * The finds: the card's name, the tagline on its card (what to do), and what
 * it is in a line for those watching. Plain words: what the item does and
 * what a miss costs; never the depth it asks, nor that it is harder (its
 * card's mark says so).
 */
export const FIND_TEXT: Record<FindKind, { name: string; tag: string; others: string }> = {
  azurite: {
    name: 'Azurite Vein',
    tag: 'Answer fast for an Azurite Ward',
    others: `An Azurite Vein: a ward if answered fast, a shard if slower.${risk('azurite')}`,
  },
  flare: {
    name: 'Flare Cache',
    tag: 'Answer right for a flare',
    others: `A Flare Cache: a flare, for ${words(FLARE_MS / 1000)} more seconds when the time runs out.${risk('flare')}`,
  },
  dynamite: {
    name: 'Dynamite Cache',
    tag: 'Answer right for dynamite',
    others: `A Dynamite Cache: dynamite, to clear the picture and half the answers at half time.${risk('dynamite')}`,
  },
};

/** "Your flare stays unused on it": what the player holds that won't go off on a find's question (`on`: "it", or "a find"). */
export function unused(inv: Inventory, on = 'it'): string {
  const held = [inv.flares ? (inv.flares > 1 ? 'flares' : 'flare') : '', inv.dynamite ? 'dynamite' : ''].filter(Boolean);
  if (!held.length) return '';
  const one = held.length === 1 && held[0] !== 'flares';
  return ` Your ${held.join(' and ')} ${one ? 'stays' : 'stay'} unused on ${on}.`;
}

/** Together: flares and dynamite won't go off on a find's question (`on`: "it", or "a find"). */
export const teamUnused = (on = 'it') => ` Flares and dynamite stay unused on ${on}.`;

/**
 * A find's note, for the player choosing while holding `inv`, after its
 * tagline: what its item does, what a miss costs when it is more than a
 * life, and (`held`, unless two finds share it in a line of their own)
 * that what they carry won't go off on it. Kept short: two finds can be on
 * offer, each with its note. A find is only offered to a player with room
 * for its item.
 */
export function findNote(kind: FindKind, inv: Inventory, held = true): string {
  const tail = `${risk(kind)}${held ? unused(inv) : ''}`;
  if (!findReward(kind, inv, true)) return `You can carry no more.${tail}`;
  if (kind === 'azurite') {
    const forge = inv.shards + 1 >= SHARDS_PER_WARD ? 'it makes a ward with yours' : `${words(SHARDS_PER_WARD)} make a ward`;
    return `A ward takes a lost life for you. Slower, a shard; ${forge}.${tail}`;
  }
  return `${DOES[kind]}${tail}`;
}

// ---- co-op ------------------------------------------------------------------

/** What each item does for the team, as a find's note says it in a run together. */
const DOES_TEAM: Record<FindKind, string> = {
  azurite: 'a ward if fast, a shard if slower.',
  flare: `${words(FLARE_MS / 1000)} more seconds for everyone when the time runs out.`,
  dynamite: 'at half time, it clears the picture and half the answers, all of them wrong.',
};

/**
 * A find's note in a run together, after its tagline: that the first right
 * answer takes it and what it does, what a miss costs when it is more than a
 * life, and, when anyone holds some, that flares and dynamite won't go off
 * on it.
 */
export function teamFindNote(kind: FindKind, itemsHeld: boolean): string {
  return `The first right answer takes it: ${DOES_TEAM[kind]}${risk(kind)}${itemsHeld ? teamUnused() : ''}`;
}

/** "you", "Ash", "you and Ash", "Ash, Brea and Cara": you first, the rest as given. */
export function namesOf(ids: string[], nameOf: (id: string) => string, me: string | null): string {
  const names = [...ids.filter((id) => id === me).map(() => 'you'), ...ids.filter((id) => id !== me).map(nameOf)];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
}

/** "your" or "Ash's". */
const whose = (id: string, nameOf: (id: string) => string, me: string | null) => (id === me ? 'your' : `${nameOf(id)}'s`);

/** A verb for a subject of `ids`: plural for you or for several ("you lose", "Ash loses", "Ash and Brea lose"). */
const verb = (ids: string[], me: string | null, one: string, many: string) => (ids.length > 1 || ids[0] === me ? many : one);

/** One loss a co-op question dealt (game.ts Hit). */
export interface HitText {
  playerId: string;
  lives: number;
  wards: number;
  timedOut: boolean;
}

/**
 * What a co-op reveal says, as sentences: who cleared it (or that nobody
 * did), then what it cost whom, you first and the team by name: "The
 * darkness took Ash and Brea." Only what the screen doesn't show already: a
 * wrong pick's one life is the phial's to show, and the depth and lives left
 * are on screen; a ward taking it, a cave-in's two and a perishing are said.
 * `left`: each hit player's lives now.
 */
export function coopRevealText(r: {
  depth: number;
  winner: string | null;
  timedOut: boolean;
  caveIn: boolean;
  hits: HitText[];
  left: (id: string) => number;
  nameOf: (id: string) => string;
  me: string | null;
  /** What a find's right answer earned, and who got it (the winner, or a teammate with room for it). */
  gain?: GainText;
}): string[] {
  const { hits, nameOf, me } = r;
  const list = (ids: string[]) => namesOf(ids, nameOf, me);
  const out: string[] = [];
  if (r.winner) out.push(clearedText(r.winner, r.gain, nameOf, me));
  else out.push(r.timedOut ? "Time's up; nobody found it." : 'Every answer was wrong.');
  const wrong = hits.filter((h) => !h.timedOut).map((h) => h.playerId);
  const late = hits.filter((h) => h.timedOut).map((h) => h.playerId);
  const perished = hits.filter((h) => h.lives > 0 && r.left(h.playerId) === 0).map((h) => h.playerId);
  // Perishing is said with what caused it when it took exactly those players:
  // "Ash picked wrong and perishes", "The darkness took Ash for good".
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
  let perishSaid = false;
  if (wrong.length && (r.winner || r.timedOut) && !r.caveIn) {
    perishSaid = same(wrong, perished);
    out.push(`${cap(list(wrong))} picked wrong${perishSaid ? ` and ${verb(wrong, me, 'perishes', 'perish')}` : ''}.`);
  }
  if (late.length) {
    const forGood = !perishSaid && same(late, perished);
    perishSaid ||= forGood;
    out.push(`The darkness took ${list(late)}${forGood ? ' for good' : ''}.`);
  }
  if (r.caveIn && hits.length) out.push(`The vein caved in on ${list(hits.map((h) => h.playerId))}.`);
  // What it did to each of them.
  const warded = hits.filter((h) => h.lives === 0 && h.wards > 0);
  const both = hits.filter((h) => h.lives > 0 && h.wards > 0 && r.left(h.playerId) > 0);
  const lost = hits.filter((h) => h.lives > 0 && h.wards === 0 && r.left(h.playerId) > 0);
  if (warded.length === 1) {
    const h = warded[0];
    const w = whose(h.playerId, nameOf, me);
    out.push(h.wards > 1 ? `${cap(w)} two wards broke.` : `${cap(w)} ward shattered.`);
  } else if (warded.length) out.push(`Wards shattered for ${list(warded.map((h) => h.playerId))}.`);
  for (const h of both) out.push(`${cap(whose(h.playerId, nameOf, me))} ward broke, and a life with it.`);
  // A single life lost is the phial's to show; two at once (a cave-in) are said.
  const two = lost.filter((h) => h.lives > 1).map((h) => h.playerId);
  if (two.length) out.push(`${cap(list(two))} ${verb(two, me, 'loses', 'lose')} two lives${two.length > 1 ? ' each' : ''}.`);
  if (perished.length && !perishSaid) out.push(`${cap(list(perished))} ${verb(perished, me, 'perishes', 'perish')}.`);
  return out;
}

/** A find's gain at a co-op reveal (see coopRevealText). */
export interface GainText {
  kind: ItemKind;
  /** Who it went to. */
  by: string;
  /** Two shards forged a ward. */
  forged?: boolean;
  /** An Azurite Vein's answer too slow for a ward: a shard instead. */
  slow?: boolean;
}

/**
 * Who cleared a co-op depth, with what a find gave in the same sentence:
 * "Ash cleared it and found a flare.", or, when it went to a teammate with
 * room for it, "Brea cleared it; the flare went to Ash."
 */
function clearedText(winner: string, gain: GainText | undefined, nameOf: (id: string) => string, me: string | null): string {
  const who = cap(namesOf([winner], nameOf, me));
  if (!gain) return `${who} cleared it.`;
  const { kind, by, forged, slow } = gain;
  if (by === winner) {
    const did =
      kind === 'wards'
        ? forged
          ? 'forged an Azurite Ward from two shards'
          : 'mined an Azurite Ward'
        : kind === 'shards'
          ? slow
            ? 'mined a shard, too slow for a ward'
            : 'found an azurite shard'
          : kind === 'flares'
            ? 'found a flare'
            : 'found a stick of dynamite';
    return `${who} cleared it and ${did}.`;
  }
  const to = namesOf([by], nameOf, me);
  if (kind === 'wards' && forged) return `${who} cleared it; ${whose(by, nameOf, me)} two shards forged an Azurite Ward.`;
  const noun = kind === 'wards' ? 'the ward' : kind === 'shards' ? 'the shard' : kind === 'flares' ? 'the flare' : 'the dynamite';
  return `${who} cleared it; ${noun} went to ${to}.`;
}

/**
 * Co-op: your own wrong answer, while the team still answers. What it cost
 * you only when your phial doesn't say it plainly: a ward taking it, a
 * cave-in, perishing.
 */
export function coopMissText(hit: { lives: number; wards: number }, left: number, caveIn: boolean): string {
  if (left === 0) return 'You perished; your team can still clear it.';
  if (caveIn) return 'Wrong; the vein caved in.';
  if (hit.lives === 0) return 'Wrong; your ward took it.';
  return 'Wrong.';
}

/**
 * Depths where lives went, for the end screen: a depth that took two (a
 * cave-in) once, with how many: "3 (two lives) and 4".
 */
export function lossDepths(losses: number[]): string {
  const groups: { depth: number; n: number }[] = [];
  for (const d of losses) {
    const last = groups.at(-1);
    if (last?.depth === d) last.n++;
    else groups.push({ depth: d, n: 1 });
  }
  const parts = groups.map((g) => (g.n > 1 ? `${g.depth} (${words(g.n)} lives)` : `${g.depth}`));
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? '');
  return `${groups.length > 1 ? 'depths' : 'depth'} ${joined}`;
}

/** "once", "twice", "3 times". */
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** Co-op end screen: what a delver lost, gave and was given, in a line. */
export function delverText(row: { losses: number[]; given: number; revived: number }): string {
  const n = row.losses.length;
  const parts = [n ? `Lost ${n} ${n === 1 ? 'life' : 'lives'}` : 'No life lost'];
  if (row.given) parts.push(`gave ${row.given} ${row.given === 1 ? 'life' : 'lives'}`);
  if (row.revived) parts.push(`brought back ${times(row.revived)}`);
  return parts.join(', ');
}
