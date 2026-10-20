// The game's keys: what each action is bound to, and how a key press is
// read. Read by where the key sits (KeyboardEvent.code), not by what it types,
// so the number row answers on an AZERTY keyboard as on any other, Shift or
// not. The bindings the player sets live in keybinds.svelte.ts; this is the
// part that needs no Svelte, for the tests.

/** The options' keys: 1 to 9, then 0 for the tenth (Delve's deepest questions have ten). */
export const OPTIONS = 10;

export type Option = `option${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;
export type Action = Option | 'next' | 'detonate' | 'mute' | 'settings';

/** Every action, in the order the settings page lists them. */
export const ACTIONS: readonly Action[] = [...Array.from({ length: OPTIONS }, (_, i) => `option${i + 1}` as Option), 'next', 'detonate', 'mute', 'settings'];

/** Each action's keys, by KeyboardEvent.code: at most SLOTS, an empty slot left out. */
export type Bindings = Record<Action, string[]>;

/** How many keys an action can have. */
export const SLOTS = 2;

const digit = (i: number) => String((i + 1) % 10);

export const DEFAULT_BINDINGS: Bindings = Object.freeze({
  ...Object.fromEntries(Array.from({ length: OPTIONS }, (_, i) => [`option${i + 1}`, [`Digit${digit(i)}`, `Numpad${digit(i)}`]])),
  next: ['Enter', 'Space'],
  detonate: ['KeyD'],
  mute: ['KeyM'],
  settings: ['Escape'],
}) as Bindings;

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

/** What the settings page calls an action: an option by its place ("First"), under the heading for answers and cards. */
export function actionName(a: Action): string {
  if (a === 'next') return 'Next question';
  if (a === 'detonate') return 'Detonate';
  if (a === 'mute') return 'Mute';
  if (a === 'settings') return 'Settings';
  return ORDINALS[Number(a.slice(6)) - 1];
}

/** What an action does, said after a key's name: "Q no longer picks the first option." */
export function actionDoes(a: Action): string {
  if (a === 'next') return 'moves on to the next question';
  if (a === 'detonate') return 'detonates';
  if (a === 'mute') return 'mutes the sound';
  if (a === 'settings') return 'opens the settings';
  return `picks the ${ORDINALS[Number(a.slice(6)) - 1].toLowerCase()} option`;
}

/** The option an action picks (0 for the first), or null for another action. */
export function optionIndex(a: Action | null): number | null {
  return a?.startsWith('option') ? Number(a.slice(6)) - 1 : null;
}

/**
 * Keys that can't be bound: Tab moves the focus everywhere, Backspace clears
 * a key on the settings page, and the modifiers and the system's keys never
 * reach a game alone. (Escape can be: it opens the settings, as it comes.)
 */
const RESERVED = new Set(['Tab', 'Backspace', 'CapsLock', 'ContextMenu', 'NumLock', 'ScrollLock', 'Pause', 'PrintScreen', 'F5', 'F11', 'F12']);
const MODIFIER = /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/;

/** Whether `code` can be bound to an action. */
export const bindable = (code: string) => !!code && !RESERVED.has(code) && !MODIFIER.test(code);

/** The same key wherever it is pressed: the keypad's Enter is Enter. */
const same = (code: string) => (code === 'NumpadEnter' ? 'Enter' : code);

/**
 * `code` bound to `action` in `slot` (0 or 1), taken off whatever other
 * action had it: one key does one thing. The slot's old key is let go, or,
 * when the key was this action's other one, the two change places. A key put
 * after an empty slot moves up into it.
 */
export function rebind(b: Bindings, action: Action, slot: number, code: string): Bindings {
  const out = Object.fromEntries(ACTIONS.map((a) => [a, a === action ? b[a] : b[a].filter((c) => same(c) !== same(code))])) as Bindings;
  const slots: (string | undefined)[] = Array.from({ length: SLOTS }, (_, i) => b[action][i]);
  const was = slots.findIndex((c) => c !== undefined && same(c) === same(code));
  if (was >= 0) slots[was] = slots[slot];
  slots[slot] = code;
  out[action] = slots.filter((c): c is string => c !== undefined);
  return out;
}

/** The key in `slot` taken off `action`. */
export function unbind(b: Bindings, action: Action, slot: number): Bindings {
  return { ...b, [action]: b[action].filter((_, i) => i !== slot) };
}

/** Stored bindings, each action checked: one missing or malformed (from an older build, or none stored) takes its default. */
export function parseBindings(raw: string | null): Bindings {
  let v: unknown = null;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    v = null;
  }
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out = {} as Bindings;
  const taken = new Set<string>();
  for (const a of ACTIONS) {
    const keys = o[a];
    const ok = Array.isArray(keys) && keys.length <= SLOTS && keys.every((c) => typeof c === 'string' && bindable(c));
    out[a] = ok ? (keys as string[]) : [...DEFAULT_BINDINGS[a]];
  }
  // A key bound twice (written by hand, or two defaults meeting a binding) does the first action listed.
  for (const a of ACTIONS) {
    out[a] = out[a].filter((c) => !taken.has(same(c)));
    for (const c of out[a]) taken.add(same(c));
  }
  return out;
}

/** What a key without a code (some phones' on-screen keyboards) is taken as. */
function codeOfKey(key: string): string {
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (key === ' ') return 'Space';
  if (key === 'Enter') return 'Enter';
  if (key === 'Escape') return 'Escape';
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  return '';
}

/** The action a key press is bound to, or null. */
export function actionFor(b: Bindings, e: { code: string; key: string }): Action | null {
  const code = same(e.code || codeOfKey(e.key));
  if (!code) return null;
  return ACTIONS.find((a) => b[a].some((c) => same(c) === code)) ?? null;
}

const NAMES: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num −',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  IntlBackslash: '<',
};

/**
 * What a key is called on its cap. `layout`: the keyboard's own (the
 * Keyboard API's layout map, where the browser has one), so a letter reads as
 * this keyboard prints it (A where a QWERTY has Q, on an AZERTY). The number
 * row stays its digits, which every layout prints on it.
 */
export function keyName(code: string, layout?: ReadonlyMap<string, string> | null): string {
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
  const printed = layout?.get(code);
  if (printed && printed.trim()) return printed.toUpperCase();
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^F[0-9]{1,2}$/.test(code)) return code;
  return NAMES[code] ?? code;
}

/** The key the game shows for an action, on its seal: its first key with a one-character name (it fits), or else its first; null with none. */
export function capFor(b: Bindings, a: Action, layout?: ReadonlyMap<string, string> | null): string | null {
  const names = b[a].map((c) => keyName(c, layout));
  return names.find((n) => [...n].length === 1) ?? names[0] ?? null;
}

/** The answers' keys in a hint ("press 1–4 to answer"): 1–4 (1–9 and 0) as they come, or each one's ("Q, W, E or R"). */
export function optionKeysText(b: Bindings, count: number, layout?: ReadonlyMap<string, string> | null): string {
  const caps = Array.from({ length: count }, (_, i) => capFor(b, `option${i + 1}` as Option, layout));
  if (caps.every((c, i) => c === String((i + 1) % 10))) return count === 10 ? '1–9 and 0' : `1–${count}`;
  const named = caps.filter((c): c is string => c !== null);
  return named.length < 2 ? (named[0] ?? '') : `${named.slice(0, -1).join(', ')} or ${named.at(-1)}`;
}
