// How difficulties are put into words. Presets and custom difficulties are
// described by the same sentences, and the custom editor uses the same terms,
// so a knob reads the same wherever it shows up.

import {
  FLARE_MS,
  blowsUp,
  cavesIn,
  findFor,
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
const ART_SHARE: Record<Exclude<Often, 'Never'>, string> = { Some: 'Some questions', Half: 'Half the questions', Always: 'Every question' };
const MIRROR_SHARE: Record<Exclude<Often, 'Never'>, string> = { Some: 'Some art is', Half: 'Half the art is', Always: 'All art is' };

/**
 * The difficulty a room plays, in a few short sentences for the lobby: only
 * what changes how a question looks, so the host can tell the steps apart.
 */
export function describe(settings: Pick<Settings, 'difficulty'> & Partial<Settings>): string {
  const k = knobsOf(settings);
  const custom = settings.difficulty === 'custom';
  const lines: string[] = [];

  const count = cap(NUMBER[k.options]);
  const fakes = k.fakes ? `, ${NUMBER[k.fakes]} made up` : '';
  // Small groups (five crossbows) can't fill a big question on their own,
  // and once a group runs low the engine mixes groups at any size.
  if (k.similarNames === 0) lines.push(`${count} options, of one kind where possible (all rings, all bows…)${fakes}.`);
  else lines.push(`${count} options, ${k.similarNames === 1 ? 'all' : 'half'} with look-alike names${fakes}.`);

  const art = often(k.artChance);
  const gray = k.grayscale === 'art' && art !== 'Never';
  if (art !== 'Never') lines.push(`${ART_SHARE[art]} show a name; you pick its art${gray ? ', in grayscale' : ''}.`);

  // Only the art of name questions burns into view. A preset only does it in
  // race, so in take turns its description still says what race adds.
  const raceOnly = !custom && settings.mode !== 'race';
  const veil = raceOnly ? knobsOf({ ...settings, mode: 'race' }).veil : k.veil;
  if (veil !== 'off' && art !== 'Always') lines.push(`${raceOnly ? 'In race, the' : 'The'} art to name burns in ${VEIL_PACE[veil]}.`);

  if (k.grayscale === 'all') lines.push('All art is in grayscale.');

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

/**
 * What each find risks for its reward, in a few plain words, or null for
 * none beyond a plain miss (a life): an Azurite Vein's cave-in, a Flare
 * Cache's shorter clock (time now for time later), a Dynamite Cache's blast
 * that takes something you carry. The one place a find's drawback is said:
 * the notes under the cards, the team's, the lines for those watching and
 * the lobby's rules all read it, so a new drawback is one edit here.
 */
export const FIND_MISS: Record<FindKind, string | null> = Object.fromEntries(
  (['azurite', 'flare', 'dynamite'] as const).map((kind) => [kind, riskOf(kind)]),
) as Record<FindKind, string | null>;

function riskOf(kind: FindKind): string | null {
  if (cavesIn(kind)) return `a miss costs ${caveInText(kind)}`;
  const { shorter } = findFor(kind);
  // Not how much less: the cut is smaller deep down, where the clock can't go under FIND_MIN_TIMER.
  if (shorter) return 'you get less time to answer';
  if (blowsUp(kind)) return 'a miss also blows up an item you carry';
  return null;
}

/** What each item does, in a few plain words (`team`: in a run together). */
function does(kind: FindKind, team = false): string {
  switch (kind) {
    case 'azurite':
      // After the tagline's "Answer in the first half for a ward".
      return 'later, a shard; two make a ward';
    case 'flare':
      return `it adds ${words(FLARE_MS / 1000)} seconds${team ? ' for everyone' : ''} when ${team ? '' : 'your '}time runs out`;
    case 'dynamite':
      return 'at half time, it blows away half the answers';
  }
}

/** A short line: what the item does, then what the find risks ("Later, a shard; two make a ward. A miss costs two lives."). */
const noteLine = (lead: string, kind: FindKind) => `${cap(lead)}.${FIND_MISS[kind] ? ` ${cap(FIND_MISS[kind])}.` : ''}`;

/** The finds' heading in the lobby's rules (where they start, the descent beside it says). */
export const FINDS_LABEL = 'Finds • harder questions';

/**
 * Each find for the lobby's rules, in one short line for someone who has
 * never played: what a right answer gives and what its item does, then what
 * it risks (from FIND_MISS).
 */
export const FIND_RULES: Record<FindKind, { gives: string; miss: string }> = {
  azurite: {
    gives: 'A ward takes a lost life for you. Answer in the first half for a ward; later, a shard: two shards make a ward.',
    miss: `${cap(FIND_MISS.azurite ?? '')}.`,
  },
  flare: {
    gives: `A flare adds ${words(FLARE_MS / 1000)} seconds when your time runs out.`,
    miss: `${cap(FIND_MISS.flare ?? '')}.`,
  },
  dynamite: {
    gives: 'Dynamite blows away half the answers at half time.',
    miss: `${cap(FIND_MISS.dynamite ?? '')}.`,
  },
};

/** A find's cave-in mark, in words for those who can't see it: "A wrong answer loses two lives". */
export const caveInLabel = (kind: FindKind) => `A wrong answer loses ${caveInText(kind)}`;

/** The mark that takes the place of a find's depth on its card, in words. */
export const HARDER_LABEL = 'A harder question';

/**
 * The finds: the card's name, the tagline under the cards (what to do, in
 * bold, before the note), and what it is in a line for those watching.
 * Read in a second: what the item does and what a miss costs; never the
 * depth it asks, nor that it is harder (its card's mark says so).
 */
export const FIND_TEXT: Record<FindKind, { name: string; tag: string; others: string }> = {
  azurite: { name: 'Azurite Vein', tag: 'Answer in the first half for a ward', others: `An answer in the first half wins a ward. ${noteLine(does('azurite'), 'azurite')}` },
  flare: { name: 'Flare Cache', tag: 'Answer right for a flare', others: `A right answer wins a flare. ${noteLine(does('flare'), 'flare')}` },
  dynamite: { name: 'Dynamite Cache', tag: 'Answer right for dynamite', others: `A right answer wins dynamite. ${noteLine(does('dynamite'), 'dynamite')}` },
};

/** "Your flare can't be used on it": what the player holds that won't go off on a find's question (`on`: "it", or "a find"). */
export function unused(inv: Inventory, on = 'it'): string {
  const held = [inv.flares ? (inv.flares > 1 ? 'flares' : 'flare') : '', inv.dynamite ? 'dynamite' : ''].filter(Boolean);
  if (!held.length) return '';
  return ` Your ${held.join(' and ')} can't be used on ${on}.`;
}

/** Together: flares and dynamite won't go off on a find's question (`on`: "it", or "a find"). */
export const teamUnused = (on = 'it') => ` Flares and dynamite can't be used on ${on}.`;

/** An item by its plain name, for what a blast destroyed ("your ward"). */
const ITEM_NAME: Record<ItemKind, string> = { wards: 'ward', shards: 'shard', flares: 'flare', dynamite: 'dynamite' };

/** What a Dynamite Cache's blast destroyed of a pack: "The blast destroyed your flare." (`whose`: "your", "Ash's"). */
export const blownText = (item: ItemKind, whose: string) => `The blast destroyed ${whose} ${ITEM_NAME[item]}.`;

/**
 * A find's note, after its tagline, for the player choosing while holding
 * `inv`: what its item does and what a miss costs when it is more than a
 * life, in one short line ("It saves a life; a miss costs two lives."),
 * then (`held`, unless two finds share it in a line of their own) that what
 * they carry won't go off on it. A find is only offered to a player with
 * room for its item.
 */
export function findNote(kind: FindKind, inv: Inventory, held = true): string {
  const lead = findReward(kind, inv, true) ? does(kind) : 'you can carry no more';
  return `${noteLine(lead, kind)}${held ? unused(inv) : ''}`;
}

// ---- co-op ------------------------------------------------------------------

/**
 * A find's note in a run together, after its tagline: what its item does
 * for the team and what a miss costs when it is more than a life, and,
 * when anyone holds some, that flares and dynamite won't go off on it.
 */
export function teamFindNote(kind: FindKind, itemsHeld: boolean): string {
  return `${noteLine(does(kind, true), kind)}${itemsHeld ? teamUnused() : ''}`;
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

/**
 * A ward (or a cave-in's two) taking what would have cost a life, said as
 * protection: "Your ward took the hit.", "Ash's two wards took both hits."
 * `whose`: "your", or a name's possessive.
 */
export function wardText(whose: string, wards = 1): string {
  return wards > 1 ? `${cap(whose)} two wards took both hits.` : `${cap(whose)} ward took the hit.`;
}

/** One loss a co-op question dealt (game.ts Hit). */
export interface HitText {
  playerId: string;
  lives: number;
  wards: number;
  timedOut: boolean;
  /** A Dynamite Cache's blast destroyed this of their pack. */
  blown?: ItemKind;
}

/**
 * What a co-op reveal says, as sentences: who cleared it (or that nobody
 * did), then what it cost whom, you first and the team by name: "The
 * darkness took Ash and Brea." Only what the screen doesn't show already: a
 * wrong pick's one life is the phial's to show, and the depth and lives left
 * are on screen; a ward taking it, a cave-in's two and a perishing are said.
 * `left`: each hit player's lives now, or null for one who has left the
 * room since (a wrong pick struck, then gone): nothing is said of them, as
 * they neither perished nor have a name to say.
 */
export function coopRevealText(r: {
  depth: number;
  winner: string | null;
  timedOut: boolean;
  caveIn: boolean;
  hits: HitText[];
  left: (id: string) => number | null;
  nameOf: (id: string) => string;
  me: string | null;
  /** What a find's right answer earned, and who got it (the winner, or a teammate with room for it). */
  gain?: GainText;
}): string[] {
  const { nameOf, me } = r;
  const hits = r.hits.filter((h) => r.left(h.playerId) !== null);
  const left = (id: string) => r.left(id) ?? 0;
  const list = (ids: string[]) => namesOf(ids, nameOf, me);
  const out: string[] = [];
  if (r.winner) out.push(clearedText(r.winner, r.gain, nameOf, me));
  else out.push(r.timedOut ? "Time's up; nobody found it." : 'Every answer was wrong.');
  const wrong = hits.filter((h) => !h.timedOut).map((h) => h.playerId);
  const late = hits.filter((h) => h.timedOut).map((h) => h.playerId);
  const perished = hits.filter((h) => h.lives > 0 && left(h.playerId) === 0).map((h) => h.playerId);
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
  const both = hits.filter((h) => h.lives > 0 && h.wards > 0 && left(h.playerId) > 0);
  const lost = hits.filter((h) => h.lives > 0 && h.wards === 0 && left(h.playerId) > 0);
  if (warded.length === 1) out.push(wardText(whose(warded[0].playerId, nameOf, me), warded[0].wards));
  else if (warded.length) out.push(`Wards took the hits for ${list(warded.map((h) => h.playerId))}.`);
  for (const h of both) out.push(`${cap(whose(h.playerId, nameOf, me))} ward broke, and a life with it.`);
  // A single life lost is the phial's to show; two at once (a cave-in) are said.
  const two = lost.filter((h) => h.lives > 1).map((h) => h.playerId);
  if (two.length) out.push(`${cap(list(two))} ${verb(two, me, 'loses', 'lose')} two lives${two.length > 1 ? ' each' : ''}.`);
  if (perished.length && !perishSaid) out.push(`${cap(list(perished))} ${verb(perished, me, 'perishes', 'perish')}.`);
  // What a Dynamite Cache's blast destroyed, each pack in turn: "The blast destroyed your flare and Ash's ward."
  const blown = hits.filter((h) => h.blown && left(h.playerId) > 0);
  if (blown.length) {
    const parts = blown.map((h) => `${whose(h.playerId, nameOf, me)} ${ITEM_NAME[h.blown!]}`);
    out.push(`The blast destroyed ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}.`);
  }
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
 * cave-in, perishing; and what a Dynamite Cache's blast destroyed.
 */
export function coopMissText(hit: { lives: number; wards: number; blown?: ItemKind }, left: number, caveIn: boolean): string {
  if (left === 0) return 'You perished; your team can still clear it.';
  if (caveIn) return 'Wrong; the vein caved in.';
  const took = hit.lives === 0 ? 'Wrong; your ward took the hit.' : 'Wrong.';
  return hit.blown ? `${took} ${blownText(hit.blown, 'your')}` : took;
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
