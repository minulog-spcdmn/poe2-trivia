// A relay for when two devices can't reach each other directly (some home
// routers, phone carriers, venue Wi-Fi). Without one, such a guest sees a room
// in the list and never gets in. PeerJS's free relays (eu-0 and
// us-0.turn.peerjs.com) are gone, so the game has its own: Cloudflare's TURN,
// with a short-lived login from the game's Worker (relay/worker.js, README
// "Relay"). A login that can't be had leaves the peer without a relay: rooms
// still meet wherever a direct link gets through.

import { RELAY_URL } from './relayUrl.ts';

/** How long a page waits for a login before making its peer without one. */
const WAIT_MS = 3000;
/** A login this close to running out is fetched anew before the next peer is made. */
const MARGIN_MS = 3_600_000;

let servers: RTCIceServer[] = [];
let until = 0;
let fetching: Promise<void> | null = null;

const iceUrl = (u: unknown) => typeof u === 'string' && /^(stun|turns?):/.test(u);

/** The Worker's answer, checked: only STUN and TURN servers with a login of strings. */
export function parseRelay(raw: unknown): { iceServers: RTCIceServer[]; ttl: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { iceServers, ttl } = raw as { iceServers?: unknown; ttl?: unknown };
  if (!Array.isArray(iceServers) || typeof ttl !== 'number' || !(ttl > 0)) return null;
  const out: RTCIceServer[] = [];
  for (const s of iceServers) {
    if (!s || typeof s !== 'object') return null;
    const { urls, username, credential } = s as Record<string, unknown>;
    const list = Array.isArray(urls) ? urls : [urls];
    if (!list.length || !list.every(iceUrl)) return null;
    if ((username !== undefined && typeof username !== 'string') || (credential !== undefined && typeof credential !== 'string')) return null;
    out.push({ urls: list as string[], ...(username !== undefined ? { username } : {}), ...(credential !== undefined ? { credential } : {}) });
  }
  return { iceServers: out, ttl };
}

/**
 * Fetches a login unless the one held lasts a while yet. Never fails and
 * never waits past WAIT_MS: a slow or missing answer leaves the peer to be
 * made without the relay, and one that comes later is kept for the next.
 */
export function loadRelay(): Promise<void> {
  if (!RELAY_URL || Date.now() < until - MARGIN_MS) return Promise.resolve();
  fetching ??= fetch(RELAY_URL, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => {
      const got = parseRelay(raw);
      if (!got) return;
      servers = got.iceServers;
      until = Date.now() + got.ttl * 1000;
    })
    .catch(() => {})
    .finally(() => (fetching = null));
  return Promise.race([fetching, new Promise<void>((r) => setTimeout(r, WAIT_MS))]);
}

/** The relay's servers while their login holds (none once it has run out). */
export function relayServers(): RTCIceServer[] {
  if (Date.now() >= until) return [];
  // Running low: the next peer gets a fresh one.
  if (Date.now() >= until - MARGIN_MS) void loadRelay();
  return servers;
}
