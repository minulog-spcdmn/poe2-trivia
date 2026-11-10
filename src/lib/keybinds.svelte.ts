// The player's keys (lib/keys.ts), kept in this browser and live: the
// settings page changes them, and the screens that hear keys read them here.

import { ACTIONS, DEFAULT_BINDINGS, actionFor, capFor, optionKeysText, parseBindings, rebind, unbind, type Action, type Bindings, type Option } from './keys';
import { onStoredElsewhere, readStored, removeStored, storeKey, writeStored } from './storage';

const KEY = 'keys';

class Keybinds {
  map = $state<Bindings>(parseBindings(readStored(KEY)));
  /** The keyboard's own names for its keys (keys.ts keyName), once the browser has told them; null where it can't. */
  layout = $state<ReadonlyMap<string, string> | null>(null);
  /** Whether any key is set apart from the defaults. */
  get changed() {
    return ACTIONS.some((a) => this.map[a].join() !== DEFAULT_BINDINGS[a].join());
  }
}

export const keybinds = new Keybinds();

/** The keys as stored, read again (another tab's change; the QA desk's frame, once it has set a scene's). */
export const reloadKeys = () => void (keybinds.map = parseBindings(readStored(KEY)));

// Another tab's change takes here too.
if (typeof addEventListener === 'function') onStoredElsewhere({ [storeKey(KEY)]: reloadKeys });

function save(map: Bindings) {
  keybinds.map = map;
  writeStored(KEY, JSON.stringify(map));
}

/** Kinds of field a key types into; a slider, a box or a button doesn't. */
const NOT_TYPED = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file']);

/** Whether `t` is a field a key types into. */
export function typedIn(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  return t instanceof HTMLInputElement && !NOT_TYPED.has(t.type);
}

/** Whether a key press goes into a field being typed in, where no key of the game's should act. */
export const typing = (e: KeyboardEvent): boolean => typedIn(e.target);

/** A control whose Enter or Space presses it. */
const PRESSED_BY_KEY = 'button, a[href], summary, [role="button"]';

/**
 * How the focus last came where it is: by the keyboard (Tab), when its ring
 * shows and the player means the control it is on, or by a press, which
 * leaves the focus on what was pressed but not the keys with it. (Kept here,
 * not asked of :focus-visible, which a browser may turn on at any key.)
 */
let tabbed = false;
if (typeof addEventListener === 'function') {
  addEventListener('keydown', (e) => void (e.key === 'Tab' && (tabbed = true)), true);
  addEventListener('pointerdown', () => void (tabbed = false), true);
}

/**
 * Whether Enter or Space is the focused control's own, not the game's (Next's,
 * as it comes): on a button or a link the player tabbed to, or on any of an
 * item's window's (ItemWindow), which has no key of the game's. A control
 * pressed with the mouse keeps the focus but not the keys: Space after a
 * click on a picture is still Next. `byTab`: how the focus came (the page's
 * own count, unless told).
 */
export function ownKey(e: KeyboardEvent, byTab = tabbed): boolean {
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  const control = (e.target as Element | null)?.closest?.(PRESSED_BY_KEY);
  if (!control || (control as HTMLButtonElement).disabled) return false;
  return byTab || !!control.closest('[data-item-window]');
}

/** The action a key press is bound to, or null. */
export const actionOf = (e: KeyboardEvent): Action | null => actionFor(keybinds.map, e);

/** The key an option's seal shows (the answer tiles), as bound; null with none. */
export const optionCap = (i: number) => capFor(keybinds.map, `option${i + 1}` as Option, keybinds.layout);
/** The answers' keys for a hint ("press 1–4"), as bound. */
export const optionKeys = (count: number) => optionKeysText(keybinds.map, count, keybinds.layout);

export const setKey = (action: Action, slot: number, code: string) => save(rebind(keybinds.map, action, slot, code));
export const clearKey = (action: Action, slot: number) => save(unbind(keybinds.map, action, slot));

/** Every key back as it came. */
export function resetKeys() {
  keybinds.map = parseBindings(null);
  removeStored(KEY);
}

/** Asks the browser what this keyboard prints on its keys (Chromium's Keyboard API), for the settings page. */
export function readLayout() {
  const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } }).keyboard;
  if (keybinds.layout || !kb?.getLayoutMap) return;
  kb.getLayoutMap()
    .then((m) => (keybinds.layout = m))
    .catch(() => {});
}
