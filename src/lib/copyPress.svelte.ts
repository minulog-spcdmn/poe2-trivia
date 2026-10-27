// A code a player passes on (the room code in the lobby and the header, the
// sync code), copied the same way wherever it shows. A mouse's click, or a
// drag across it, selects it and copies it as the button lets go (wherever
// the pointer is by then, so a drag that ends off the code counts). A finger
// or a pen selects nothing and brings up no menu: a tap copies it, on the
// tap's click, which still has the tap's activation for the clipboard; a long
// press copies it too, while still held, where the browser lets a page copy
// then (Chrome, which asks for no tap). An iPhone lets a page copy in a tap's
// click and nowhere else: not as the finger comes down, nor while it is held
// (tried on one, even with the press taken over). But a long press there
// still ends in a click as the finger lets go, as long as nothing on the
// code offers iOS's own menu (app.css keeps -webkit-touch-callout none): so
// the code lights up as the hold becomes a long press and is copied as it
// lets go. Should no click come, the note says to tap it. A note by the
// pointer says what came of it (CopyNote.svelte), for as long as the finger
// holds and a moment after. Each element is attached with {@attach}, marked
// data-copy (selectable by a mouse alone, app.css).

/** Where on the screen a press was made: a mouse's or a finger's. */
export type At = { clientX: number; clientY: number };

/** How long a press is held to be a long press (ms), and how far it may move and still be one (px). */
export const LONG_MS = 400;
export const STILL_PX = 10;
/** How long a copied code stays lit, and the note shows once the pointer is up (ms). */
export const LIT_MS = 700;
export const NOTE_MS = 1300;
/** How long after a held finger lets go its click may come (ms; an iPhone's comes within some 50). */
export const CLICK_MS = 400;
/** What the note says once a long press has let go without a copy. */
export const TAP_TO_COPY = 'Tap to copy';

export class CopyPress {
  /** The note by the pointer: what it says, where the press was, and whether a finger or a pen made it (it goes above those). */
  note = $state<{ text: string; at: At; touch: boolean } | null>(null);
  /** Lit as just copied, for LIT_MS (on a phone a tap leaves no selection to light it), and over a long press that copies as it lets go. */
  lit = $state(false);
  /** The element copied from, while attached: the note keeps by it. */
  el: HTMLElement | undefined;
  #text: () => string;
  #copied: string;
  /** Whether the last press was a finger's or a pen's (not a mouse's). */
  #touched = false;
  /** The finger's or pen's press: where it came down, whether it is still down, held long, refused a copy while held (an iPhone's), and has copied. */
  #down = { x: 0, y: 0, holding: false, long: false, refused: false, copied: false, menu: false };
  #holdTimer: ReturnType<typeof setTimeout> | undefined;
  #clickTimer: ReturnType<typeof setTimeout> | undefined;
  #litTimer: ReturnType<typeof setTimeout> | undefined;
  #noteTimer: ReturnType<typeof setTimeout> | undefined;

  /** `text`: what a copy gives; `copied`: what the note says once it is copied ('Room code copied'). */
  constructor(text: () => string, copied: string) {
    this.#text = text;
    this.#copied = copied;
  }

  attach = (node: HTMLElement) => {
    this.el = node;
    const on: [string, EventListener][] = [
      ['pointerdown', this.#press as EventListener],
      ['pointermove', this.#moved as EventListener],
      ['pointerup', this.#lifted],
      ['pointercancel', this.#cancelled as EventListener],
      // (A finger lets go here even after a long press's pointercancel on Android.)
      ['touchend', this.#lifted],
      ['touchcancel', this.#lifted],
      ['click', this.#tapped as EventListener],
      ['contextmenu', this.#menu as EventListener],
      // Nothing selected by a finger, and no selection dragged off as a picture.
      ['selectstart', (e) => this.#touched && e.preventDefault()],
      ['dragstart', (e) => e.preventDefault()],
    ];
    for (const [type, f] of on) node.addEventListener(type, f);
    document.addEventListener('copy', this.#byHand);
    return () => {
      for (const [type, f] of on) node.removeEventListener(type, f);
      document.removeEventListener('copy', this.#byHand);
      removeEventListener('pointerup', this.#released);
      clearTimeout(this.#holdTimer);
      clearTimeout(this.#clickTimer);
      clearTimeout(this.#litTimer);
      clearTimeout(this.#noteTimer);
      if (this.el === node) this.el = undefined;
    };
  };

  #press = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.#touched = e.pointerType !== 'mouse';
    if (!this.#touched) return addEventListener('pointerup', this.#released, { once: true });
    this.#down = { x: e.clientX, y: e.clientY, holding: true, long: false, refused: false, copied: false, menu: false };
    clearTimeout(this.#holdTimer);
    clearTimeout(this.#clickTimer);
    this.#holdTimer = setTimeout(this.#long, LONG_MS);
  };
  /** A press that moves is a scroll or a drag, no long press. */
  #moved = (e: PointerEvent) => {
    if (this.#down.holding && Math.hypot(e.clientX - this.#down.x, e.clientY - this.#down.y) > STILL_PX) clearTimeout(this.#holdTimer);
  };
  /** The finger let go (`scrolled`: a scroll took it, and no click comes). */
  #lifted = (scrolled: unknown = false) => {
    if (!this.#down.holding) return;
    this.#down.holding = false;
    clearTimeout(this.#holdTimer);
    if (this.#down.refused && !this.#down.copied) {
      // Lit on till the click the lift brings copies it (an iPhone's); none, and it says to tap.
      if (scrolled === true) this.lit = false;
      else this.#clickTimer = setTimeout(this.#noClick, CLICK_MS);
    }
    if (this.note) this.#noteGoes();
  };
  /** A scroll took the press, or (on Android) its long press did: that finger lets go later, as its touchend. */
  #cancelled = (e: PointerEvent) => {
    if (!(this.#down.menu && e.pointerType === 'touch')) this.#lifted(true);
  };
  #noClick = () => {
    if (this.#down.copied) return;
    this.lit = false;
    this.#show(TAP_TO_COPY, { clientX: this.#down.x, clientY: this.#down.y });
  };
  /** A mouse's: what its press selected, all of the code or some, is what is wanted either way. */
  #released = (e: PointerEvent) => {
    if (this.#selectionHere()) void this.#copy(e);
  };
  #tapped = (e: MouseEvent) => {
    clearTimeout(this.#clickTimer);
    if (this.#touched && !this.#down.copied) void this.#copy(e);
  };
  /** A finger's or a pen's long press on Android (a mouse's right click brings no menu either, lib/noMenu.ts). */
  #menu = (e: MouseEvent) => {
    if (!this.#touched) return;
    e.preventDefault();
    this.#down.menu = true;
    this.#long();
  };
  /** A long press, held still: copied while still held where the browser allows it, else lit till it lets go. */
  #long = async () => {
    clearTimeout(this.#holdTimer);
    if (this.#down.long || this.#down.copied) return;
    this.#down.long = true;
    if (await this.#write()) return this.#done({ clientX: this.#down.x, clientY: this.#down.y });
    if (this.#down.copied || !this.#down.holding) return;
    this.#down.refused = true;
    this.lit = true;
  };

  async #write(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(this.#text());
      return true;
    } catch {
      return false;
    }
  }
  async #copy(at: At) {
    if (this.#touched) this.#down.copied = true;
    let copied = await this.#write();
    if (!copied) {
      // Older browsers and some app views: copied the old way, the code put
      // in the copy itself (nothing need be selected, and a finger selects
      // nothing).
      const put = (c: ClipboardEvent) => {
        c.clipboardData?.setData('text/plain', this.#text());
        c.preventDefault();
      };
      document.addEventListener('copy', put);
      copied = document.execCommand?.('copy') ?? false;
      document.removeEventListener('copy', put);
    }
    if (copied) return this.#done(at);
    // Copying by hand: a key on a keyboard (a finger has no other way).
    this.#show(this.#touched ? 'Couldn’t copy it here' : 'Press Ctrl+C to copy it', at);
  }
  #done(at: At) {
    this.#down.copied = this.#touched;
    this.#show(this.#copied, at);
    this.lit = true;
    clearTimeout(this.#litTimer);
    // Lit a moment as copied, then back to rest: the selection goes, and the glow with it.
    this.#litTimer = setTimeout(() => {
      this.lit = false;
      if (this.#selectionHere()) getSelection()?.removeAllRanges();
    }, LIT_MS);
  }

  #show(text: string, at: At) {
    this.note = { text, at, touch: this.#touched };
    clearTimeout(this.#noteTimer);
    // Over a finger still down, the note stays until it lets go.
    if (!(this.#touched && this.#down.holding)) this.#noteGoes();
  }
  #noteGoes() {
    clearTimeout(this.#noteTimer);
    this.#noteTimer = setTimeout(() => (this.note = null), NOTE_MS);
  }

  #selectionHere(): boolean {
    const sel = getSelection();
    return !!this.el && !!sel && !sel.isCollapsed && sel.containsNode(this.el, true);
  }
  /**
   * Copied by hand (Ctrl+C over a selection of the code, all of it or some,
   * whichever way it is anchored round it): the code itself, not what shows
   * (the lobby's letters, each in its own box, copy with line breaks between
   * them, and hidden for streaming they are only dots). A selection taking in
   * anything else copies as it is.
   */
  #byHand = (e: ClipboardEvent) => {
    const text = getSelection()?.toString().replace(/\s/g, '') ?? '';
    const shown = this.el?.textContent?.replace(/\s/g, '') ?? '';
    if (!text || !this.#selectionHere() || !shown.includes(text) || !e.clipboardData) return;
    e.clipboardData.setData('text/plain', this.#text());
    e.preventDefault();
  };
}
