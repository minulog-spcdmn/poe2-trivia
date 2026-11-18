// The item tally: how each item fares, summed over every player, so the
// items players miss can be told apart from those they know, each against
// others asked under the same rules. Every answer this device's player
// gives goes out: in Delve alone and together (finds too), Take turns and
// Race, online or at one screen, the start page's practice and today's
// unique. Each as its item, the question's form (name or art), the rules it
// was asked under (ctxOf: Delve by the band of the depth its question came
// from, the others by the room's difficulty), whether this browser's codex
// had no entry for the item before, and right or wrong (a time-out, a
// ward's save and a question its player blasted away with dynamite are
// wrong): no name, device, room or time. The matchmaking server keeps the
// sums, and for a day each batch's random id with when it came, so a batch
// sent again is added once (signal/worker.js, Tally).
//
// Each answer is taken where the codex takes it in (codex.ts onTaken), so a
// question it has already (a rejoin, a second tab) goes once; what the
// encounter can't hold (a blast, hot-seat with several players, the daily)
// is said beside it (codex.ts Aside). Practice never reaches the codex, so
// it is noted here directly, and as not known to be a first meeting
// (notePractice): the game can't tell one there.
//
// Only where visits are counted (count.ts counting) and the player hasn't
// opted out (countOptOut.ts), looked at again as each batch goes. Held in
// memory and sent as a game or run ends, as the page is hidden or left, and
// every MAX_BATCH answers. Each batch carries a random id of its own; one
// the network or a busy server turned down goes again with the next send,
// as it was, id and all (so the server adds up once one that arrived after
// all), twice more at most, and one refused is let go of. Nothing is
// stored. Loaded and started on its own, once, only where visits are
// counted (tallyLoader.ts, for session.svelte.ts and DailyUnique.svelte).

import { onTaken, recordWaiting, type Encounter, type Taken } from './codex.ts';
import { findDepth } from './delve.ts';
import { counting } from './count.ts';
import { notCounted } from './countOptOut.ts';
import { OWN_SIGNAL_HOST } from './signalHost.ts';
import type { QuestionMode } from './game.ts';
import { TALLY_VERSION } from './itemTallyRank.ts';

/** Which rules the answers were given under (itemTallyRank.ts, where the Items view reads it without the codex). */
export { TALLY_VERSION };
/** The most answers one message carries (and the Worker takes). */
export const MAX_BATCH = 40;
/** How many times more a batch turned down goes. */
export const RETRIES = 2;
/** Delve's bands: ten depths each, the last holding every depth from 191 on. */
export const BANDS = 20;

const PRESETS = ['cruel', 'merciless', 'eternal', 'custom'] as const;
const bands = (p: string) => Array.from({ length: BANDS }, (_, i) => `${p}${i + 1}`);
/** Every context an answer is tallied under (the Worker takes these alone). */
export const CONTEXTS: readonly string[] = [...bands('d'), ...bands('g'), ...PRESETS.map((p) => `t-${p}`), ...PRESETS.map((p) => `r-${p}`), 'practice', 'daily'];
const KNOWN = new Set(CONTEXTS);

/** One answer as it goes: the item, its form, its context, whether it was new to this browser, right or wrong. */
export type TallyEntry = [item: string, form: 'n' | 'a', ctx: string, first: 0 | 1, outcome: 'r' | 'w'];

/** An item's id (fetch-data.mjs hashId), as the Worker takes it. */
const ITEM = /^[0-9a-f]{12}$/;

/** Delve's band for a question asked under the rules of depth `d`. */
export const bandOf = (d: number) => Math.min(BANDS, Math.max(1, Math.ceil(d / 10)));

/** The rules an encounter was asked under, as the tally names them (CONTEXTS), or null for none it knows. */
export function ctxOf(e: Encounter, daily = false): string | null {
  if (daily) return 'daily';
  const d = e.delve;
  // A find asks from deeper down (a vein's later strikes deeper still).
  const ctx = d ? `${d.team ? 'g' : 'd'}${bandOf(d.find ? findDepth(d.find, d.depth, d.strike ?? 1) : d.depth)}` : `${e.race ? 'r' : 't'}-${e.difficulty}`;
  return KNOWN.has(ctx) ? ctx : null;
}

const form = (m: QuestionMode) => (m === 'art' ? 'a' : 'n');

/** What an encounter the codex took counts as, or null when no answer of this player's was given to it. */
export function tallyEntry({ e, first, aside }: Pick<Taken, 'e' | 'first' | 'aside'>): TallyEntry | null {
  const ok = aside?.ok ?? e.answer?.ok;
  const ctx = ctxOf(e, !!aside?.daily);
  if (ok === undefined || !ctx || !ITEM.test(e.itemId)) return null;
  return [e.itemId, form(e.mode), ctx, first ? 1 : 0, ok ? 'r' : 'w'];
}

/** A batch's id: 16 random hex characters, the server's to tell a batch sent again from a new one. */
export function batchId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A message as the Worker takes it: the batch `id`, its answers `a`. */
export const tallyBody = (id: string, a: TallyEntry[]) => JSON.stringify({ v: TALLY_VERSION, id, a });

/** What sending a message came to: its status, or null when the network failed it. */
export type Posted = number | null;

/** Whether a batch so turned down goes again: the network failed it, the server was busy (429) or broke (5xx). */
const again = (status: Posted) => status === null || status === 429 || status >= 500;

/** Answers held until they go: `allowed` asked again as each batch goes, `post` sending one message, `newId` giving each batch its id. */
export class Tallier {
  /** Each answer held that hasn't gone yet. */
  private held: TallyEntry[] = [];
  /** Each batch turned down, to go again as it was: its message, and the times it has gone already. */
  private turnedDown: { body: string; tries: number; n: number }[] = [];
  private allowed: () => boolean;
  private post: (body: string) => Promise<Posted>;
  private newId: () => string;
  constructor(allowed: () => boolean, post: (body: string) => Promise<Posted>, newId: () => string = batchId) {
    this.allowed = allowed;
    this.post = post;
    this.newId = newId;
  }

  /** An encounter the codex took: held if it counts, the batch sent once it is full. */
  note(t: Pick<Taken, 'e' | 'first' | 'aside'>) {
    this.hold(tallyEntry(t));
  }

  /** A practice question answered: never in the codex, so not known to be a first meeting. */
  practice(itemId: string, mode: QuestionMode, ok: boolean) {
    this.hold(ITEM.test(itemId) ? [itemId, form(mode), 'practice', 0, ok ? 'r' : 'w'] : null);
  }

  private hold(entry: TallyEntry | null) {
    if (!this.allowed()) {
      this.held = [];
      this.turnedDown = [];
      return;
    }
    if (!entry) return;
    this.held.push(entry);
    if (this.held.length >= MAX_BATCH) this.send();
  }

  /**
   * Sends the batches turned down before, each as it was, then what is held,
   * in new batches of MAX_BATCH at most; nothing when the player has opted
   * out meanwhile.
   */
  send() {
    const fresh = this.held;
    const old = this.turnedDown;
    this.held = [];
    this.turnedDown = [];
    if (!this.allowed()) return;
    for (const b of old) this.go(b);
    for (let i = 0; i < fresh.length; i += MAX_BATCH) {
      const a = fresh.slice(i, i + MAX_BATCH);
      this.go({ body: tallyBody(this.newId(), a), tries: 0, n: a.length });
    }
  }

  private go(b: { body: string; tries: number; n: number }) {
    void this.post(b.body).then((status) => {
      // Kept to go with the next send, unchanged (never sending by itself: a busy server isn't asked again at once).
      if (again(status) && b.tries < RETRIES && this.allowed()) this.turnedDown.push({ ...b, tries: b.tries + 1 });
    });
  }

  /** How many answers are held, those to go again included (the tests). */
  get size() {
    return this.held.length + this.turnedDown.reduce((n, b) => n + b.n, 0);
  }
}

/** Where the answers go: the matchmaking server's own host (vite.config.ts lets the page reach it). */
export const TALLY_URL = OWN_SIGNAL_HOST ? `https://${OWN_SIGNAL_HOST}/tally` : '';

/** One message, as text (no preflight), outliving the page if it is closing: what it came to. */
async function post(body: string): Promise<Posted> {
  try {
    const r = await fetch(TALLY_URL, { method: 'POST', body, keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'text/plain' } });
    return r.status;
  } catch {
    // (The network failed it, or a browser refused it: tried again with the next.)
    return null;
  }
}

let tallier: Tallier | null = null;

/** Starts tallying, once: told of what the codex takes, sending as the page is hidden or left. Nothing where visits aren't counted. */
export function startTally() {
  if (tallier || !counting || !TALLY_URL) return;
  const t = (tallier = new Tallier(() => counting && !notCounted(), post));
  onTaken((x) => t.note(x));
  // What waits for calm taken in first: lib/idle.ts writes it as the page goes too, but its listener may come after this one.
  const away = () => {
    recordWaiting();
    t.send();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && away());
  if (typeof addEventListener === 'function') addEventListener('pagehide', away);
}

/** A practice question answered (DailyUnique.svelte). */
export function notePractice(itemId: string, mode: QuestionMode, ok: boolean) {
  tallier?.practice(itemId, mode, ok);
}

/** Sends what is held: a game or run has ended, or been left. */
export function sendTally() {
  tallier?.send();
}
