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

/** Whether a key press goes into a field being typed in, where no key of the game's should act. */
export function typing(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  return t instanceof HTMLInputElement && !NOT_TYPED.has(t.type);
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
