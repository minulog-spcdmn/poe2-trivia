import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offensive } from '../src/lib/offensive.ts';
import { nameProblem } from '../src/lib/names.ts';
import { listable, parseRoomInfo, wireRoomInfo, type RoomInfo } from '../src/lib/roomInfo.ts';
import { NAMES } from '../src/bot/identities.ts';

// Slurs and slogans in the spellings people use to get them past a filter.
const BAD = [
  ...['nigger', 'NiGgEr', 'n1gg3r', 'n!gger', 'n|gger', 'nigggger', 'niqqer', 'nlgger', 'nıgger', 'ηigger', 'Nïgger', 'nigga', 'N1GGA', 'niggerz'],
  ...['n i g g e r', 'n.i.g.g.e.r', 'niggerslayer', 'xXniggerXx', 'sandnigger', 'nigg3r_ki11er'],
  ...['n/i/g/g/e/r', 'N•I•G•G•E•R', 'n#i#g#g#e#r', 'sieg/heil', 'Sieg(Heil)', 'white#power', '14 / 88', 'BIGFag', 'spics', 'Coons'],
  ...['faggot', 'f4gg0t', 'FaggotMage', 'xXfaggotXx', 'Big Fag', 'FagMage', 'dyke', 'tranny', 'tr4nny', 'troon'],
  ...['kike', 'k1ke', 'Kyke', 'chink', 'gook', 'zipperhead', 'spic', 'sp1c', 'wetback', 'w3tback', 'Beaner420', 'coon', 'jiggaboo'],
  ...['porchmonkey', 'raghead', 'camel jockey', 'Paki', 'retard', 'r3tard', 'Ret4rd'],
  ...['Hitler', 'AdolfHitler', 'heilhitler', 'HeilHitler88', 'siegheil', 'sieg_heil', 'Sieg Heil', 'WhitePower', 'white_power'],
  ...['1488', '14/88', 'KKK_Member', 'KuKluxKlan', 'rahowa', 'holohoax', 'Untermensch', 'heilwhitler', 'whitler88'],
  // An innocent word spares only itself, not the same word elsewhere in the name.
  ...['FaginFag', 'CumMingCum', 'PussyCatPussy'],
  ...['gasthejews', 'gas the jews', 'killalljews', 'KillAllJews', 'kill the gays'],
  ...['Neger', 'Schwuchtel', 'Kanake', 'Judensau', 'Zigeuner', 'Fotze', 'maricón', 'sudaca', 'negrata', 'bougnoule', 'youpin'],
  ...['cumslut', 'rapist', 'pussyslayer', 'DickMage', 'PenisMage', 'BigCock', 'Porn_Star', 'whore', 'cunt', 'Bestiality'],
];

// Names that contain a bad word, or look like they do, and are fine.
const FINE = [
  ...['Scunthorpe', 'Cassandra', 'Assassin', 'Classic', 'Analyst', 'Therapist', 'Dickens', 'Spicy', 'Raccoon', 'Tycoon', 'Cocoon'],
  ...['Cocktail', 'Hancock', 'Hitchcock', 'Whittler', 'Matsushita', 'Shitake', 'Snigger', 'Niger', 'Nigeria', 'Montenegro', 'GatoNegro'],
  ...['Penistone', 'Sussex', 'Bass', 'Passion', 'Arsenal', 'Titania', 'Cumulus', 'Cumming', 'Grape', 'Rapper', 'Rappel'],
  ...['Annalise', 'Anusha', 'Adrianus', 'Dickinson', 'Fagin', 'Pachinko', 'Pussycat', 'Squawk', 'Beanery', 'Spectre', 'Sextant'],
  ...['Kitava', 'Infernalist', 'Witchhunter', 'Sorceress', 'Bestial', 'Jewel', 'JewishGamer', 'GayMage', 'QueerBard', 'Black Knight'],
  ...['Assistant', 'Butterfield', 'Exile69', 'Mass Effect', 'Hit Hard', 'The Everlasting Gaze', 'Nazir', 'Aryan', 'Shitlord', 'FuckThisBoss'],
  ...['kkkkk', 'Brazil kkkk', 'Sir/Knight', 'Mage#1', 'Unit14ab88', 'Rose & Thorn', 'Analise', 'Dickey'],
  // Split where the case changes, these still read as the innocent word.
  ...['PussyCat', 'DickSon', 'DickInson', 'CumMing', 'RapeSeed', 'KlonDyke', 'AnalYst'],
];

test('slurs, hate slogans and sexual terms are caught through the usual disguises', () => {
  assert.deepEqual(BAD.filter((n) => !offensive(n)), []);
});

test('names that only look like they hold a bad word are fine, and so is plain swearing', () => {
  assert.deepEqual(FINE.filter(offensive), []);
});

test('the room bots never pick a name the check turns down', () => {
  assert.deepEqual(NAMES.filter(offensive), []);
});

test('an offensive name is turned down without being repeated', () => {
  const why = nameProblem('Sieg Heil', []);
  assert.match(why ?? '', /not allowed/);
  assert.doesNotMatch(why ?? '', /Sieg/);
  assert.equal(nameProblem('Kitava', []), null);
});

test('a public room under an offensive host name is well-formed but never listed', () => {
  const room: RoomInfo = {
    code: 'ABCDEF',
    host: 'Ash',
    players: 2,
    maxPlayers: 12,
    spectators: 0,
    maxSpectators: 8,
    mode: 'turns',
    difficulty: 'merciless',
    target: 10,
    phase: 'lobby',
  };
  assert.equal(listable(parseRoomInfo(wireRoomInfo(room))!), true);
  const hidden = parseRoomInfo(wireRoomInfo({ ...room, host: 'xXniggerXx' }));
  // Still parsed, so the scan counts its slot as taken and looks past it.
  assert.ok(hidden);
  assert.equal(listable(hidden), false);
});
