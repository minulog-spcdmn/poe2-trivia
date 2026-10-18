// Slurs, hate slogans and sexual terms in player names. Public rooms show
// their host's name to everyone on the start page, so a name like that is
// refused where it's typed and when it's used to join a room (names.ts), and
// a listing under one is never shown (rooms.ts).
//
// The matching is obscenity's: it reads past leetspeak ("n1gg3r"),
// look-alike letters and stretched letters, and keeps a list of innocent
// words that contain bad ones ("Scunthorpe", "Cassandra"). Its English list
// is cut down to slurs and sexual terms (swearing like "shit" is fine in a
// name), and filled out below with the slurs, slogans and languages it leaves
// out. Patterns are written as the text looks after obscenity's transforms:
// leetspeak read as letters (1 → i), "ı" read as l, and doubled letters made
// single, except b, e, o, l, s and g, which keep two ("faggot", but
// "zipperhead" → "ziperhead"). In patterns, [x] is optional and | is a word
// edge.

import { foldLookalikes } from './lookalikes.ts';
import { DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers, parseRawPattern } from 'obscenity';

/**
 * Swearing in obscenity's list that is fine in a name. "negro" is Spanish and
 * Portuguese for black ("GatoNegro"); "bestiality" comes back below without
 * "Bestial".
 */
const ALLOWED = new Set(['arse', 'ass', 'bastard', 'bitch', 'bollocks', 'cuck', 'fuck', 'piss', 'prick', 'shit', 'turd', 'wank', 'negro', 'bestiality']);

/** What obscenity's list leaves out, as [patterns, innocent words that contain them]. */
const MORE: [string[], string[]][] = [
  // Its "nigger" doesn't know l or q for the i and the g.
  [['nlgger', 'nlgga', 'n[i]qer', 'nlqer', 'niqa|', 'niglet', 'nibber'], ['sniglet']],
  // Its "fag" needs a word edge before it ("xXfaggotXx").
  [['fa[g]got'], ['fagott']],
  [['|spic[s]|', 'wetback', 'beaner', '|gook[s]|', 'raghead', 'towelhead', 'camel[ ]jockey', 'ziperhead'], ['beanery', 'beaneries']],
  [['|coon[s]|', 'ji[g]gaboo', 'porch[ ]monkey', 'redskin', '|squaw[s]|', 'shemale', '|troon[s]|'], []],
  [['|paki[s]|', '|darkie', 'golliwog', 'mongoloid', '|kyke', '|yid[s]|', 'muzrat', '|lesbo', 'slant[ ]eye'], ['lesbos']],
  // Nazi names and slogans.
  [['hitler', 'sieg[ ]heil', 'white[ ]power', 'rahowa', 'klux', 'holohoax', 'untermensch'], ['whittler']],
  // German.
  [['|neger', 'kanake', 'kanacke', 'schwuchtel', 'judensau', 'judenschwein', 'kameltreiber', 'zigeuner', '|spast|', 'fotze'], []],
  // Spanish and French.
  [['maricon', 'sudaca', 'negrata', 'bougnoule', 'youpin'], []],
  [['bestialit', 'bestialty'], []],
  // Names and words obscenity's list catches by mistake.
  [
    [],
    [
      ...['anush', 'ianus', 'annus', 'banus', 'danus', 'annal', 'analis', 'cumin', 'cumming', 'dickey', 'dickinson', 'dickson'],
      ...['dickerson', 'fagin'],
      ...['pachinko', 'penistone', 'pussycat', 'pussyfoot', 'rappe', 'rapeseed', 'retardant', 'cockpit', 'cocksure', 'booboo'],
      ...['vandyke', 'klondyke'],
    ],
  ],
];

// "Kill all the Jews", "gasthejews", "hang gays": a threat against a group.
const THREATS = ['kil[l]', 'gas[s]', 'hang', 'lynch', 'burn'];
const GROUPS = ['jew|', 'jews', 'gay|', 'gays', 'muslim', 'arabs', 'blacks', 'trans|'];
MORE.push([THREATS.flatMap((t) => GROUPS.map((g) => `${t}[ ][al][l][ ][the][ ]${g}`)), []]);

/**
 * Codes obscenity can't see, as leetspeak reads digits as letters and k is collapsed: 1488 and 14/88, KKK
 * (but not "kkkk", which is laughter in Brazil).
 */
const CODES = /(?<!\d)14[^\p{L}\p{N}]{0,2}88(?!\d)|(?<!k)kkk(?!k)/iu;

/**
 * The matcher, and one for the same terms that spares no innocent words. Built on the first check rather than
 * when the app loads, as names.ts (and so this) is on the start page's path.
 */
let matchers: ReturnType<typeof build> | undefined;

function build() {
  const data = new DataSet<{ originalWord?: string }>()
    .addAll(englishDataset)
    .removePhrasesIf((p) => ALLOWED.has(p.metadata?.originalWord ?? ''));
  for (const [patterns, innocent] of MORE) {
    data.addPhrase((p) => {
      for (const s of patterns) p.addPattern(parseRawPattern(s));
      for (const w of innocent) p.addWhitelistedTerm(w);
      return p;
    });
  }
  const { blacklistedTerms, whitelistedTerms } = data.build();
  return {
    all: new RegExpMatcher({ blacklistedTerms, whitelistedTerms, ...englishRecommendedTransformers }),
    unspared: new RegExpMatcher({ blacklistedTerms, ...englishRecommendedTransformers }),
  };
}

/** What splits a name into words: anything but letters, digits and the leetspeak obscenity reads as letters (@ ( $ | ! /). */
const BREAKS = /[^\p{L}\p{N}@($|!/]+/gu;

/** Spaced-out letters put back together ("n i g g e r" → "nigger"). */
const joinLetters = (s: string) => s.replace(/(?<=(?:^| )\S) (?=\S(?: |$))/gu, '');

/**
 * The ways a name is read: as typed, with punctuation as spaces ("sieg_heil" → "sieg heil"); split into
 * words where the case changes ("BigFag", "BIGFag" → "Big Fag", "BIG Fag"), so word edges count; with the
 * leetspeak characters as spaces too ("sieg/heil", "n/i/g/g/e/r"); and with spaced-out letters put back
 * together ("n i g g e r", "n.i.g.g.e.r"). Not with every space taken out: across words, that finds slurs
 * in innocent names ("The Everlasting Gaze").
 */
function readings(name: string) {
  const plain = name.normalize('NFKD').replace(/\p{M}/gu, '').replace(BREAKS, ' ').trim();
  const bare = plain.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  // Letters from other scripts that look like Latin ones, read as those (lookalikes.ts).
  const folded = foldLookalikes(plain);
  const alike = folded === plain ? [] : [folded, joinLetters(folded)];
  return { plain, words: splitWords(plain), others: [joinLetters(plain), bare, joinLetters(bare), ...alike] };
}

const LOWER = /\p{Ll}/u;
const UPPER = /\p{Lu}/u;

/**
 * The name split where the case changes (see readings), with where each of its
 * characters is in the name (`at`, by UTF-16 index; an added space gets the next character's).
 */
function splitWords(plain: string): { text: string; at: number[] } {
  const chars = Array.from(plain);
  let text = '';
  const at: number[] = [];
  let i = 0;
  chars.forEach((c, k) => {
    const prev = chars[k - 1] ?? '';
    if ((LOWER.test(prev) && UPPER.test(c)) || (UPPER.test(prev) && UPPER.test(c) && LOWER.test(chars[k + 1] ?? ''))) {
      text += ' ';
      at.push(i);
    }
    text += c;
    for (let u = 0; u < c.length; u++) at.push(i + u);
    i += c.length;
  });
  return { text, at };
}

/** Whether a name has a slur, a hate slogan or a sexual term in it, in any spelling the check sees through. */
export function offensive(name: string): boolean {
  const { all, unspared } = (matchers ??= build());
  const { plain, words, others } = readings(name);
  const hit = (s: string) => CODES.test(s) || all.hasMatch(s);
  if (hit(plain) || others.some(hit)) return true;
  if (words.text === plain) return false;
  if (CODES.test(words.text)) return true;
  // Splitting at the case changes can cut through an innocent word ("PussyCat" → "Pussy Cat"), which then
  // no longer spares what's in it. So a word found here counts unless it lies where an innocent word spared
  // one in the name as typed ("FaginFag" still counts, for the second "Fag").
  const key = (m: { termId: number; startIndex: number; endIndex: number }) => `${m.termId}:${m.startIndex}:${m.endIndex}`;
  const kept = new Set(all.getAllMatches(plain).map(key));
  const spared = unspared.getAllMatches(plain).filter((m) => !kept.has(key(m)));
  return all.getAllMatches(words.text).some((m) => {
    const start = words.at[m.startIndex];
    const end = words.at[m.endIndex];
    return !spared.some((s) => s.startIndex <= start && end <= s.endIndex);
  });
}
