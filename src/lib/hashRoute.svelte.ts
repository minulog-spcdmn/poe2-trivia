// A page opened over the start page with an address of its own (#codex,
// #settings), so it can be linked to and the browser's back button closes it.

export class HashRoute {
  open = $state(false);
  /** Its address ('#codex'). */
  readonly hash: string;
  /** What its history entry is marked with, to know a back goes where it was opened from. */
  readonly key: string;

  constructor(hash: string, key: string) {
    this.hash = hash;
    this.key = key;
    this.open = this.here();
    const sync = () => (this.open = this.here());
    addEventListener('popstate', sync);
    addEventListener('hashchange', sync);
  }

  /** The address's hash, whatever follows it (?off=: lib/switchedOff.ts). */
  private here() {
    return location.hash.split('?')[0] === this.hash;
  }

  show() {
    if (this.open) return;
    history.pushState({ [this.key]: true }, '', this.hash);
    this.open = true;
  }

  /** Back to where it was opened from; an address typed or linked with its hash just loses it. */
  close() {
    if (!this.open) return;
    if ((history.state as Record<string, unknown> | null)?.[this.key]) {
      history.back();
      return;
    }
    this.drop();
  }

  /** Gone where it stands, the address losing its hash: for when what it was over has gone (a room it was opened in, ended). */
  drop() {
    if (!this.open) return;
    history.replaceState(null, '', location.pathname + location.search);
    this.open = false;
  }
}
