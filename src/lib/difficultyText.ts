// How difficulties are put into words. Presets and custom difficulties are
// described by the same sentences, and the custom editor uses the same terms,
// so a knob reads the same wherever it shows up.

import {
  VEIN_MAX_STRIKES,
  DELVE_MAX_BLASTS,
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
import { knobsOf, maxFakes, type Difficulty, type GameMode, type Knobs, type Settings, type VeilSpeed } from './game.ts';

/** Display names, in the order the lobby offers them. */
/** The modes by name, as the lobby offers them and the end screen heads its panel. */
export const MODE_NAMES: Record<GameMode, string> = { turns: 'Take turns', race: 'Race', delve: 'Delve', craft: 'Craft' };

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  cruel: 'Cruel',
  merciless: 'Merciless',
  eternal: 'Eternal',
  custom: 'Custom',
};

const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

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
  if (veil !== 'off' && art !== 'Always') lines.push(`${raceOnly ? 'In race, the' : 'The'} art you name burns into view ${VEIL_PACE[veil]}.`);

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
export const words = (n: number) => WORDS[n] ?? String(n);
/** How many times, in words: "once", "twice", "three times". */
const timesWord = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${words(n)} times`);

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
  if (cavesIn(kind)) return `a miss costs ${caveInText(kind)} and your haul`;
  const { clock } = findFor(kind);
  // Not how much less: the cut is smaller deep down, where the clock can't go under FIND_MIN_TIMER.
  if (clock < 1) return 'you get less time to answer';
  if (blowsUp(kind)) return 'a miss also blows up an item you carry';
  return null;
}

/** What each item does, in a few plain words (`team`: in a run together). */
function does(kind: FindKind, team = false): string {
  switch (kind) {
    case 'azurite':
      return 'a ward takes a lost life for you';
    case 'flare':
      return `it adds ${words(FLARE_MS / 1000)} seconds${team ? ' for everyone' : ''} when ${team ? '' : 'your '}time runs out`;
    case 'dynamite':
      return 'it blasts a question away for a new one';
  }
}

/** A short line: what the item does, then what the find risks ("A ward takes a lost life for you. A miss costs two lives."). */
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
    gives: `Each right answer digs out a ward, which takes a lost life for you. Then dig deeper or take the way out, up to ${words(VEIN_MAX_STRIKES)} strikes on one lamp whose unused light carries on.`,
    miss: `${cap(FIND_MISS.azurite ?? '')}.`,
  },
  flare: {
    gives: `A flare adds ${words(FLARE_MS / 1000)} seconds when your time runs out. If you also carry dynamite, the flare burns first.`,
    miss: `${cap(FIND_MISS.flare ?? '')}.`,
  },
  dynamite: {
    gives: `Dynamite lets you skip a question and get a new one at the same depth, up to ${timesWord(DELVE_MAX_BLASTS)} per set of cards. If time runs out, it goes off on its own.`,
    miss: `${cap(FIND_MISS.dynamite ?? '')}.`,
  },
};

/** Over a flare or a stick of dynamite in a player's pack, on hover: how it works. */
export const ITEM_TIPS = {
  flares: { name: 'Flare', text: `When your time runs out, it burns and gives you ${words(FLARE_MS / 1000)} more seconds. It doesn't work on finds.` },
  dynamite: { name: 'Dynamite', text: `Swap a question for a new one at the same depth, up to ${timesWord(DELVE_MAX_BLASTS)} per set of cards. If time runs out, it goes off on its own. It doesn't work on finds.` },
} as const;

/** Under the finds in the lobby's rules: why flares and dynamite never work on a find's question. */
export const FINDS_UNSAFE = "Flares and dynamite don't work on finds. The rock there is too thick to blast, and the dark swallows a flare's light.";

/**
 * The finds: the card's name, the tagline under the cards (what to do, in
 * bold, before the note), and what it is in a line for those watching.
 * Read in a second: what the item does and what a miss costs; never the
 * depth it asks, nor that it is harder (its card's mark says so).
 */
export const FIND_TEXT: Record<FindKind, { name: string; tag: string; others: string }> = {
  azurite: { name: 'Azurite Vein', tag: 'Answer right to dig out a ward', others: `A right answer digs out a ward. ${noteLine(does('azurite'), 'azurite')}` },
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
const ITEM_NAME: Record<ItemKind, string> = { wards: 'ward', flares: 'flare', dynamite: 'dynamite' };

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
  const lead = findReward(kind, inv) ? does(kind) : 'you can carry no more';
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
  /** An Azurite Vein's cave-in: the wards in hand it buried. */
  buried?: number;
  /** A vein's ward dug out: the wards now in the team's hand. */
  inHand?: number;
  /** The dig ended with that ward: the wards of its haul going into the pack now. */
  banked?: number;
}): string[] {
  const { nameOf, me } = r;
  const hits = r.hits.filter((h) => r.left(h.playerId) !== null);
  const left = (id: string) => r.left(id) ?? 0;
  const list = (ids: string[]) => namesOf(ids, nameOf, me);
  const out: string[] = [];
  if (r.winner) out.push(clearedText(r.winner, r.gain, nameOf, me) + (r.banked ? ` ${bankedText(r.banked)}` : r.inHand ? ` ${inHandText(r.inHand)}` : ''));
  else out.push(r.timedOut ? "Time's up; nobody found it." : 'Every answer was wrong.');
  if (r.buried) out.push(buriedText(r.buried, 'the team'));
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

// ---- the Azurite Vein's dig ------------------------------------------------

/** "a ward", "two wards": the haul in words. */
export const wardsWord = (n: number) => (n === 1 ? 'a ward' : `${words(n)} wards`);

/** Seconds of the lamp's light, as shown: whole, or to a tenth under ten. */
export const lightText = (secs: number) => (secs >= 10 ? String(Math.floor(secs)) : (Math.floor(secs * 10) / 10).toFixed(1).replace(/\.0$/, ''));

/**
 * The note under the vein's card in a dig: which strike, the lamp's light
 * for it, and what a cave-in would cost (`team`: the team's haul).
 */
export function digNote(next: number, light: number, haul: number, team = false): string {
  const whose = team ? "the team's" : 'your';
  const buries = haul ? ` and buries ${whose} ${haul === 1 ? 'ward' : `${words(haul)} wards`}` : '';
  const secs = lightText(light);
  return `Strike ${next} of ${VEIN_MAX_STRIKES}, with ${secs} ${secs === '1' ? 'second' : 'seconds'} of light. A miss costs ${caveInText('azurite')}${buries}.`;
}

/** After a right strike: what is in hand ("Two wards in hand."). */
export const inHandText = (n: number) => `${cap(wardsWord(n))} in hand.`;

/** A dig's haul going into the pack as it ends: "It goes into the pack." or "All three go into the pack." */
export const bankedText = (n: number) => (n === 1 ? 'It goes into the pack.' : `All ${words(n)} go into the pack.`);

/** A cave-in's haul: "The ward you dug out is buried." */
export function buriedText(n: number, whose = 'you'): string {
  return n === 1 ? `The ward ${whose} dug out is buried.` : `The ${words(n)} wards ${whose} dug out are buried.`;
}

/** A find's gain at a co-op reveal (see coopRevealText). */
export interface GainText {
  kind: ItemKind;
  /** Who it went to. */
  by: string;
}

/**
 * Who cleared a co-op depth, with what a find gave in the same sentence:
 * "Ash cleared it and found a flare.", or, when it went to a teammate with
 * room for it, "Brea cleared it; the flare went to Ash."
 */
function clearedText(winner: string, gain: GainText | undefined, nameOf: (id: string) => string, me: string | null): string {
  const who = cap(namesOf([winner], nameOf, me));
  if (!gain) return `${who} cleared it.`;
  const { kind, by } = gain;
  if (by === winner) {
    const did = kind === 'wards' ? 'dug out an Azurite Ward' : kind === 'flares' ? 'found a flare' : 'found a stick of dynamite';
    return `${who} cleared it and ${did}.`;
  }
  const to = namesOf([by], nameOf, me);
  const noun = kind === 'wards' ? 'the ward' : kind === 'flares' ? 'the flare' : 'the dynamite';
  return `${who} cleared it; ${noun} went to ${to}.`;
}

/**
 * Co-op: your own wrong answer, while the team still answers. What it cost
 * you only when your phial doesn't say it plainly: a ward taking it, a
 * cave-in, perishing; and what a Dynamite Cache's blast destroyed.
 */
export function coopMissText(hit: { lives: number; wards: number; blown?: ItemKind }, left: number, caveIn: boolean): string {
  if (left === 0) return 'You perished, but your team can still clear it.';
  if (caveIn) return 'Wrong, and the vein caved in.';
  const took = hit.lives === 0 ? 'Wrong, but your ward took the hit.' : 'Wrong.';
  return hit.blown ? `${took} ${blownText(hit.blown, 'your')}` : took;
}

/**
 * Co-op, while the question is open: teammates who perished on it, said
 * under the answers as their entries grey ("Ash perished.", "Ash and Brea
 * perished."). Your own is said by coopMissText; empty when nobody else did.
 */
export function perishedText(ids: string[], nameOf: (id: string) => string, me: string | null): string {
  const others = ids.filter((id) => id !== me);
  return others.length ? `${cap(namesOf(others, nameOf, me))} perished.` : '';
}

/** Co-op: a flare burning from someone's pack as the clock hits 0: "Ash's flare gives everyone six more seconds." */
export const flareText = (by: string, nameOf: (id: string) => string, me: string | null) =>
  `${cap(whose(by, nameOf, me))} flare gives everyone ${words(FLARE_MS / 1000)} more seconds.`;

/** Co-op: a life given to bring a teammate back: "Ash brought Brea back.", "You brought Ash back.", "Ash brought you back." */
export const revivedText = (by: string, to: string, nameOf: (id: string) => string, me: string | null) =>
  `${cap(namesOf([by], nameOf, me))} brought ${namesOf([to], nameOf, me)} back.`;
