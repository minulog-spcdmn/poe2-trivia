// Newcomers: people who find the game, try it once (twice, now and then) and
// are gone, the long tail any public game has besides its regulars
// (identities.ts NAMES). As new as they are to the game, they play it a
// little worse and slower, try the button that moves someone else's reveal
// on, and seldom host.
//
// Their names follow other habits than the regulars'. The regulars' are
// modelled on the public PoE2 ladder (2,400 account names, Standard and
// Hardcore, from the top down to rank 15,000, October 2026): handles kept
// for years. A first visit's name is typed into a box on a site just found,
// in a hurry: so mostly lowercase and short, more often a plain first name
// (the ladder has few), a throwaway (asdf, player1, noob, anon) or a few
// letters, and otherwise a handle like the regulars'. That part is reasoned,
// not measured: no study of names on quick browser games turned up. None is
// anyone's real handle.

import { DEFAULT_RULES, MODES, seededBy, type Identity, type Mode } from './identities.ts';

export const VISITORS = [
  'asdf',
  'qwe',
  'aaa',
  'xd',
  'hmm',
  'ok',
  'jjj',
  'hi',
  'lol',
  'abc',
  'yo',
  'tom',
  'nick',
  'luca',
  'max',
  'ben',
  'leo',
  'chris',
  'alex',
  'sara',
  'mia',
  'emil',
  'finn',
  'sam',
  'dan',
  'mike',
  'kevin',
  'pat',
  'olli',
  'jakub',
  'mateo',
  'ivan',
  'tommy92',
  'nick_7',
  'luca04',
  'maxi_',
  'jan2',
  'dennis_k',
  'smilol',
  'salolz',
  'belolz',
  'zohanlol',
  'toasss',
  'hasss',
  'serrr',
  'incooo',
  'cooobi',
  'noobono',
  'nobrew',
  'pushv',
  'sqwer',
  'flips',
  'raggy',
  'snaky',
  'redog',
  'whosty',
  'yotie',
  'minit',
  'otate',
  'jallz',
  'pkate',
  'theeps',
  'mrego',
  'stramp',
  'smill',
  'grumg',
  'kshie',
  'natekk',
  'eashik',
  'cyaka',
  'coolansy',
  'basicx',
  'golfire',
  'firit',
  'nullertn',
  'Kantras',
  'Lexille',
  'Zealini',
  'Vapokie',
  'Rilliane',
  'Spiren',
  'Megardz',
  'Siroong',
  'Tenax',
  'Nimans',
  'bix7',
  'kroz11',
  'mapo3',
  'dree22',
  'tolk5',
  'vinz99',
  'jexo1',
  'brak4',
  'sumo17',
  'lanky8',
  'fizz10',
  'rooks3',
  'justhere',
  'idk',
  'whoami',
  'newguy',
  'noob',
  'player1',
  'anon',
  'nobody',
  'someone',
  'random',
  'mystery',
  'guest42',
  'hello123',
  'trying_this',
  'its_marco',
  'kopper_tv',
  'sleepy_tim',
  'just_jake',
  'rob_x',
  'the_real_kev',
  'mo_kaz',
  'Grimfang',
  'Ashborn',
  'DarkLotus',
  'xXdeathXx',
  'killer123',
  'darklord',
  'exile',
  'mercenary',
  'warrior_main',
  'witchy_',
  'ziomek',
  'kumpel',
  'bacalhau',
  'joaninha',
  'mrmuffin',
  '철수',
  '하이',
  '안녕',
  '아무개',
  '小白',
  '路人甲',
  'てきとう',
  'Вася',
  'hjkl',
  'zxcv',
  'mnb',
  'wsad',
  'qaz',
  'ttt',
  'abrory',
  'bokuro',
  'cocus',
  'codesu',
  'corol',
  'crumpp',
  'deats',
  'delka',
  'disso',
  'domick',
  'elmicats',
  'erindy',
  'espeas',
  'facell',
  'flanu',
  'forgend',
  'freenor',
  'goldf',
  'grego',
  'hegul',
  'hellex',
  'ixxi',
  'jacens',
  'jimmon',
  'kanasu',
  'karmoki',
  'kluman',
  'loche',
  'ludoork',
  'madlily',
  'magisar',
  'mility',
  'minglos',
  'mistoss',
  'nazergg',
  'nobik',
  'oblins',
  'pagame',
  'papaken',
  'pologie',
  'qualla',
  'reling',
  'rockena',
  'rollock',
  'samads',
  'scordo',
  'smular',
  'snoria',
  'thead',
  'tenate',
  'venstaj',
  'whitus',
  'yochum',
  'yoshow',
];

/**
 * The newcomers one seat draws from when `of` seats run at once (`slot` 1
 * to `of`), as identities.ts namesFor shares the regulars.
 */
export function visitorsFor(slot: number, of: number): string[] {
  if (!Number.isInteger(of) || of < 1 || !Number.isInteger(slot) || slot < 1 || slot > of) return VISITORS;
  const share = VISITORS.filter((_, i) => i % of === slot - 1);
  return share.length ? share : VISITORS;
}

/** How likely someone who comes on is a newcomer rather than a regular. */
export const NEWCOMERS = 0.25;
/** How likely a newcomer who hosts keeps the room the game sets up for a first visit (Delve, public). */
const FIRST_ROOM_KEPT = 0.85;
/** How likely a newcomer comes back for another go later (once). */
export const COMES_BACK = 0.15;

/**
 * Someone new to the game: a little less sure of the items (the quiz's
 * tricks are new to them), a little slower, only a few items they know
 * cold yet, and unlikely to host. If they do, mostly as the game sets a
 * first room up: Delve (where `modes` allows it), with its own rules.
 */
export function asNewcomer(who: Identity, modes: readonly Mode[] = MODES): Identity {
  const rng = seededBy(`${who.name}:new`);
  const p = who.persona;
  const skill = p.skill - 0.02 - 0.05 * rng();
  const pace = p.pace * (1.05 + 0.2 * rng());
  const favourites = p.favourites.slice(0, Math.floor(p.favourites.length * (0.2 + 0.4 * rng())));
  const firstRoom = modes.includes('delve') && rng() < FIRST_ROOM_KEPT;
  return {
    ...who,
    persona: { ...p, skill, pace, favourites, hosting: p.hosting * 0.4, newcomer: true },
    prefs: firstRoom ? { mode: 'delve', ...DEFAULT_RULES } : who.prefs,
  };
}
