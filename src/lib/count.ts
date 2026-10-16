// Visits and a few game events, counted by GoatCounter (poe2quest.goatcounter.com):
// no cookies, nothing kept in the browser, no IP addresses stored. Only the
// game's own page at poe2.quest counts; the beta, the dev server, the dev
// pages and anyone asking not to be tracked (Global Privacy Control, Do Not
// Track) never do. datenschutz.html says what is sent.
//
// Not GoatCounter's count.js: it sends the address's query too, and an
// invite link's carries the room's code. This sends only what's named here.

import { CHANNEL } from './channel.ts';
import type { GameState } from './game.ts';

const ENDPOINT = 'https://poe2quest.goatcounter.com/count';

/** Whether this page counts: the live game at poe2.quest, no robot driving it, nobody opted out. */
function counting(): boolean {
  if (CHANNEL !== 'live' || typeof location === 'undefined' || typeof navigator === 'undefined') return false;
  if (location.hostname !== 'poe2.quest' || (location.pathname !== '/' && location.pathname !== '/index.html')) return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return !nav.webdriver && !nav.globalPrivacyControl && nav.doNotTrack !== '1';
}

function send(params: Record<string, string>) {
  if (!counting()) return;
  const url = `${ENDPOINT}?${new URLSearchParams({ ...params, rnd: Math.random().toString(36).slice(2) })}`;
  try {
    if (navigator.sendBeacon?.(url)) return;
  } catch {
    // (Falls back to an image below.)
  }
  new Image().src = url;
}

/** A visit to the start page, once it is first seen (a tab opened in the background counts when it's looked at). */
export function countVisit() {
  if (!counting()) return;
  const go = () => send({ p: '/', t: document.title, r: document.referrer });
  if (document.visibilityState === 'visible') return go();
  const seen = () => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', seen);
    go();
  };
  document.addEventListener('visibilitychange', seen);
}

/** An event: its name is the path GoatCounter lists it under. */
export function countEvent(name: string) {
  send({ p: name, t: name, e: 'true' });
}

/**
 * The event for a game this device starts playing: its mode, Delve alone or
 * together, and on one device or online ("play/race-online",
 * "play/delve-together-online", "play/turns-hotseat").
 */
export function playEvent(s: GameState, hotSeat: boolean): string {
  const mode = s.settings.mode ?? 'turns';
  const kind = mode === 'delve' ? `delve-${(s.delve?.entrants.length ?? 1) < 2 ? 'alone' : 'together'}` : mode;
  return `play/${kind}-${hotSeat ? 'hotseat' : 'online'}`;
}

/** The event for a Delve run's end, by the ten depths it ended in, as players see them ("delve/depth-20-29"). */
export function delveEndEvent(shownDepth: number): string {
  const from = Math.floor(Math.max(0, shownDepth) / 10) * 10;
  return `delve/depth-${from}-${from + 9}`;
}
