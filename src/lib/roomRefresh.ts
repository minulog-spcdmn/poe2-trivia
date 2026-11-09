// How the open rooms list (components/OpenRooms.svelte) eases off: when its
// timed refresh comes, and what it goes on showing of a room a scan didn't
// hear from. Every start page scans the listing slots (lib/rooms.ts), and
// each scan costs every listed room a ping to answer, of which it answers so
// many (probeDesk.ts), and our own server a socket (signal/worker.js, whose
// free allowance counts them). So a page asks as often as someone is there to
// read the answer:
// - out of sight, not at all (the component's part);
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

  /** A sign of the player (the pointer, a key, the page shown again). Whether it brings the next refresh forward. */
  seen(): boolean {
    const was = this.idle;
    this.idle = 0;
    return was > 0;
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
    if (this.stopped || this.hidden()) return;
    const sooner = this.pace.seen();
    if (this.due) this.comeDue();
    else if (sooner && this.timer) {
      clearTimeout(this.timer);
      this.comeDueIn(Math.max(0, this.endedAt + this.pace.gap() - Date.now()));
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
 * The rooms the list goes on showing though this scan didn't hear from them.
 * A scan says how many it may have missed (`unheard`, scanRooms: slots that
 * answered no ping, a room past its share of them mostly), and that many of
 * the rooms shown `before` and not `found` now are kept as last heard, the
 * latest heard first, none heard longer ago than KEEP_UNHEARD_MS. So a busy
 * room doesn't drop out of the lists it couldn't answer, and a room that
 * closed goes as soon as a scan hears its slot is free or another's.
 */
export function keptUnheard(before: RoomInfo[], found: ReadonlyMap<string, RoomInfo>, unheard: number, heardAt: ReadonlyMap<string, number>, now: number): RoomInfo[] {
  if (!unheard) return [];
  const at = (r: RoomInfo) => heardAt.get(r.code) ?? -Infinity;
  return before
    .filter((r) => !found.has(r.code) && now - at(r) < KEEP_UNHEARD_MS)
    .sort((a, b) => at(b) - at(a))
    .slice(0, unheard);
}
