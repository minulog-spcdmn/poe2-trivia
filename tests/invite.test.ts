import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FROM_PARAM, inviteFrom, nightShare, siteLink, summonsText, type NightShare } from '../src/lib/invite.ts';

/** The from of an invite link, as the start page reads it. */
const fromOf = (query: string) => inviteFrom(new URLSearchParams(query).get(FROM_PARAM));

test('the summons names a host only when the name would pass as a player name', () => {
  assert.equal(fromOf('room=K7Q2PX&from=Ash'), 'Ash');
  // Cleaned as a typed name is: spaces folded, and capped at 20 characters.
  assert.equal(inviteFrom('  Ash   Ketchum '), 'Ash Ketchum');
  assert.equal(inviteFrom('Doryani the Unbroken Prophet'), 'Doryani the Unbroken');
  // URL-encoded, as inviteUrl writes it.
  assert.equal(fromOf(`room=K7Q2PX&from=${encodeURIComponent('Ash & Bea')}`), 'Ash & Bea');
  assert.equal(fromOf(`room=K7Q2PX&from=${encodeURIComponent('Ølaf the Brave')}`), 'Ølaf the Brave');
  // Too short, nothing left once control characters go, reserved, the held name, or no name at all: a plain invite.
  assert.equal(inviteFrom('A'), '');
  assert.equal(inviteFrom('​‮\u0007'), '');
  assert.equal(inviteFrom('Host'), '');
  assert.equal(inviteFrom('zoe_arcana'), '');
  assert.equal(inviteFrom('Zoe Arcana'), '');
  assert.equal(inviteFrom(null), '');
  assert.equal(fromOf('room=K7Q2PX'), '');
});

test('the summons the host shares, and the invite a guest shares', () => {
  assert.equal(summonsText('Ash'), 'Ash summons you to a hunt on PoE2.Quest. Name the unique before the timer burns out.');
  assert.equal(summonsText('Ash', 'Ash'), summonsText('Ash'));
  assert.equal(summonsText('Ash', 'Bob'), "Bob invites you to Ash's room on PoE2.Quest.");
});

test('the site, as text: the live game and the beta', () => {
  assert.equal(siteLink('https://poe2.quest/'), 'poe2.quest');
  assert.equal(siteLink('https://poe2.quest/beta/'), 'poe2.quest/beta/');
  // The tests see the live build.
  assert.equal(siteLink(), 'poe2.quest');
});

test('bringing a challenger: the result after one game, the Crown after more, and the couch', () => {
  const link = 'https://poe2.quest/?room=K7Q2PX&from=Ash';
  const base: NightShare = {
    winnerName: 'Ash',
    winnerIsMe: false,
    score: 10,
    runnerUp: 8,
    played: 1,
    champName: 'Ash',
    champIsMe: false,
    hotSeat: false,
    link,
  };
  const texts = [
    nightShare({ ...base, winnerIsMe: true, champIsMe: true }),
    nightShare(base),
    nightShare({ ...base, played: 3 }),
    nightShare({ ...base, played: 3, champIsMe: true, winnerIsMe: true }),
    nightShare({ ...base, hotSeat: true, link: 'poe2.quest' }),
    nightShare({ ...base, hotSeat: true, played: 3, link: 'poe2.quest' }),
  ];
  assert.deepEqual(texts, [
    `I just won 10 to 8 at PoE2.Quest. Take a seat for the rematch: ${link}`,
    `Ash just won 10 to 8 at PoE2.Quest. Take a seat for the rematch: ${link}`,
    `Ash holds the Crown after 3 games of PoE2.Quest. Come and take it: ${link}`,
    `I hold the Crown after 3 games of PoE2.Quest. Come and take it: ${link}`,
    'We played PoE2.Quest tonight and Ash won 10 to 8. Your turn: poe2.quest',
    'We played 3 games of PoE2.Quest tonight and Ash holds the Crown. Your turn: poe2.quest',
  ]);
  // A deathmatch is won level on points.
  assert.equal(nightShare({ ...base, runnerUp: 10 }), `Ash just won 10 to 10 in sudden death at PoE2.Quest. Take a seat for the rematch: ${link}`);
  // Later games without a champion (a shared win, or they left) tell the last result.
  assert.equal(nightShare({ ...base, played: 2, champName: '', winnerName: 'Ash and Bea', runnerUp: 6 }), `Ash and Bea just won 10 to 6 at PoE2.Quest. Take a seat for the rematch: ${link}`);
  assert.equal(nightShare({ ...base, played: 2, champName: '', hotSeat: true, link: 'poe2.quest' }), 'We played PoE2.Quest tonight and Ash won 10 to 8. Your turn: poe2.quest');
  // From the beta, the beta's site.
  assert.equal(nightShare({ ...base, hotSeat: true, link: siteLink('https://poe2.quest/beta/') }), 'We played PoE2.Quest tonight and Ash won 10 to 8. Your turn: poe2.quest/beta/');
  const dash = String.fromCharCode(0x2014);
  for (const t of [...texts, summonsText('Ash'), summonsText('Ash', 'Bob')]) assert.ok(!t.includes(dash), t);
});

test('bringing a challenger after a race lost below zero: the win goes without a score that reads oddly', () => {
  const link = 'https://poe2.quest/?room=K7Q2PX&from=Ash';
  const base: NightShare = { winnerName: 'Ash', winnerIsMe: true, score: 2, runnerUp: -2, played: 1, champName: 'Ash', champIsMe: true, hotSeat: false, link };
  assert.equal(nightShare(base), `I just won at PoE2.Quest. Take a seat for the rematch: ${link}`);
  assert.equal(nightShare({ ...base, winnerIsMe: false }), `Ash just won at PoE2.Quest. Take a seat for the rematch: ${link}`);
  assert.equal(nightShare({ ...base, hotSeat: true, link: 'poe2.quest' }), 'We played PoE2.Quest tonight and Ash won. Your turn: poe2.quest');
  // The winner below zero too.
  assert.equal(nightShare({ ...base, score: -1, runnerUp: -3 }), `I just won at PoE2.Quest. Take a seat for the rematch: ${link}`);
  // Nobody else scored: a clean sheet reads as one.
  assert.equal(nightShare({ ...base, runnerUp: 0 }), `I just won 2 to 0 at PoE2.Quest. Take a seat for the rematch: ${link}`);
  // Level on points with nothing to show: the sudden death alone.
  assert.equal(nightShare({ ...base, score: 0, runnerUp: 0 }), `I just won in sudden death at PoE2.Quest. Take a seat for the rematch: ${link}`);
  assert.equal(nightShare({ ...base, score: -2, runnerUp: -2, hotSeat: true, link: 'poe2.quest' }), 'We played PoE2.Quest tonight and Ash won in sudden death. Your turn: poe2.quest');
  // From the second game the Crown is told, whatever the scores.
  assert.equal(nightShare({ ...base, played: 2 }), `I hold the Crown after 2 games of PoE2.Quest. Come and take it: ${link}`);
});
