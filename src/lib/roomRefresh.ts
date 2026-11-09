// How the open rooms list (components/OpenRooms.svelte) eases off: when its
// timed refresh comes, and what it goes on showing of a room a scan didn't
// hear from. Every start page scans the listing slots (lib/rooms.ts), and
// each scan costs every listed room a ping to answer, of which it answers so
// many (probeDesk.ts), and our own server a socket (signal/worker.js, whose
// free allowance counts them). So a page asks as often as someone is there to
// read the answer:
// - out of sight, not at all;
// - with no sign of its player, later each time;
// - while rooms let its pings go, or the server can't be reached, later too,
//   so the pages together come back down to what the rooms answer.
// Apart from the component, so tests can reach it.

import type { RoomInfo } from './roomInfo.ts';

/** The timed refresh comes this long after a scan ends, with the player about and every room answering. */
export const REFRESH_MS = 20_000;
/** And never later than this, however long nobody's been about. */
export const REFRESH_LATEST_MS = 10 * 60_000;
/** Each timed refresh in a row with no sign of the player waits this many times as long as the one before. */
const IDLE_STEP = 1.5;
/** A strained scan doubles the wait, three in a row to eight times as long at most; each scan that isn't halves it again. */
const MOST_STRAIN = 3;

/** When the list's next timed refresh comes. */
export class RefreshPace {
  /** Timed refreshes in a row with no sign of the player. */
  private idle = 0;
  /** Strained scans, less the ones since that weren't (0 to MOST_STRAIN). */
  private strain = 0;

  /** A timed refresh has come due (not one by hand, or the page's first). */
  timed() {
    this.idle++;
  }

  /** Whether the next refresh waits longer for want of a sign of the player. */
  get idling(): boolean {
    return this.idle > 0;
  }

  /** A sign of the player (the pointer, a key, the page shown again). Whether it brings the next refresh forward. */
  seen(): boolean {
    const was = this.idling;
    this.idle = 0;
    return was;
  }

  /** A scan has ended; `strained`: it didn't reach the server, or a slot answered none of its pings. */
  scanned(strained: boolean) {
    this.strain = strained ? Math.min(MOST_STRAIN, this.strain + 1) : Math.max(0, this.strain - 1);
  }

  /** How long after the last scan ended the next timed refresh comes (ms). */
  gap(): number {
    return Math.min(REFRESH_LATEST_MS, REFRESH_MS * IDLE_STEP ** this.idle * 2 ** this.strain);
  }
}

/**
 * The list's refreshes, as the page asks for them: the first, then each as
 * its time comes (RefreshPace), through `refresh`, which starts a scan or
 * sees to one later; the list says when a scan has begun and ended. None
 * while the page is out of sight (`hidden`), where nobody reads it and a scan
 * still costs each room an answer and our own server a socket: the one that
 * came due runs once the page is shown.
 */
export class Refresher {
  private pace = new RefreshPace();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** A refresh has come due out of sight. */
  private due = false;
  /** When the last scan ended (Date.now(), which a sleeping device doesn't hold back). */
  private endedAt = 0;
  private stopped = false;
  private refresh: () => void;
  private hidden: () => boolean;

  constructor(refresh: () => void, hidden: () => boolean) {
    this.refresh = refresh;
    this.hidden = hidden;
  }

  /** The page's first refresh. */
  start() {
    this.comeDue();
  }

  private comeDue() {
    this.due = this.hidden();
    if (!this.due) this.refresh();
  }

  private comeDueIn(ms: number) {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pace.timed();
      this.comeDue();
    }, ms);
  }

  /** A scan has begun, a timed one or not (by hand, or one put off): it stands for the one on its way. */
  began() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.due = false;
  }

  /** The scan has ended (`strained`: RefreshPace.scanned): the next comes in its time. */
  ended(strained: boolean) {
    if (this.stopped) return;
    this.pace.scanned(strained);
    this.endedAt = Date.now();
    this.comeDueIn(this.pace.gap());
  }

  /**
   * A sign of the player (the pointer, a key, the page shown again): the
   * refresh that waited for the page to be shown runs, and one put off for
   * want of anyone about comes when it would have with them there, at once
   * if that's past.
   */
  seen() {
    // (Called for every move of the pointer: with the player about already and no refresh waiting to be shown, there's nothing to do, nor to ask the page.)
    if (this.stopped || !(this.due || this.pace.idling) || this.hidden()) return;
    this.pace.seen();
    if (this.due) this.comeDue();
    else if (this.timer) {
      clearTimeout(this.timer);
      // By the clock's time, so a device that slept comes due at once; never longer than the wait itself, should the clock have been set back.
      const gap = this.pace.gap();
      this.comeDueIn(Math.min(gap, Math.max(0, this.endedAt + gap - Date.now())));
    }
  }

  stop() {
    this.stopped = true;
    this.began();
  }
}

/** A room no scan has heard from is shown as last heard this long at most. */
export const KEEP_UNHEARD_MS = 10 * 60_000;

/**
 * What the list last heard of each room it shows: when, and in which slot.
 * A scan says which slots stayed silent (scanRooms: someone holds each and
 * answered no ping, a room past its share of them mostly). A room shown
 * before and not found now, whose slot is one of those, stays as last heard,
 * KEEP_UNHEARD_MS at most: a busy room doesn't drop out of the lists it
 * couldn't answer. One whose slot spoke (free, or another room's now) goes,
 * as a room that closed should, whatever other slots kept silent.
 */
export class LastHeard {
  private of = new Map<string, { at: number; slot: number }>();

  /** A scan heard from the room with this code, in `slot`. */
  heard(code: string, slot: number, now: number) {
    this.of.set(code, { at: now, slot });
  }

  /**
   * The rooms to show once a scan is through: those it `found`, then those
   * shown `before` that stay as last heard (above). The rest are forgotten.
   * `silent`: the slots that answered none of the scan's pings.
   */
  after(before: readonly RoomInfo[], found: ReadonlyMap<string, RoomInfo>, silent: readonly number[], now: number): RoomInfo[] {
    const quiet = new Set(silent);
    const kept = before.filter((r) => {
      const last = this.of.get(r.code);
      return !found.has(r.code) && !!last && quiet.has(last.slot) && now - last.at < KEEP_UNHEARD_MS;
    });
    const rooms = [...found.values(), ...kept];
    const shown = new Set(rooms.map((r) => r.code));
    for (const code of [...this.of.keys()]) if (!shown.has(code)) this.of.delete(code);
    return rooms;
  }
}
