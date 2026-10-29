/**
 * The app's own mouse pointer (src/lib/ownCursor.ts): every `cursor: pointer`,
 * `default`, `not-allowed`, `text`, `zoom-in`, `grab` and `grabbing` reads its picture from a variable, falling back to
 * the system's own where it isn't set (pages that don't draw one).
 *
 * And every cursor is handed down as a variable rather than inherited:
 * `cursor: X` becomes `--cursor-now: X; cursor: var(--cursor-now)`, and
 * app.css gives every element `cursor: var(--cursor-now)`. So a cursor set
 * on one element alone (the pressed pointer, ownCursor.ts) stays on it: what
 * it holds keeps taking the variable, unchanged, and isn't restyled. (An
 * inherited cursor changed on a big element restyles all it holds.)
 *
 * `cursor: inherit` is left as it is: in WebKit app.css has every element
 * inherit its cursor instead (see there). So are `unset`, `initial`,
 * `revert` and `revert-layer`, which mean nothing as a variable's value.
 */
const CSS_WIDE = /^(inherit|initial|unset|revert|revert-layer)$/i;
const CURSOR_VARS: Record<string, string> = {
  pointer: '--cursor-pointer',
  default: '--cursor',
  'not-allowed': '--cursor-disabled',
  text: '--cursor-text',
  'zoom-in': '--cursor-zoom',
  grab: '--cursor-grab',
  grabbing: '--cursor-grabbing',
};
const HANDED_DOWN = 'var(--cursor-now)';

export const themedCursors = {
  postcssPlugin: 'themed-cursors',
  Declaration: {
    cursor(decl: { value: string; important: boolean; cloneBefore(o: { prop: string; value: string }): unknown }) {
      const v = decl.value.trim();
      if (v.startsWith('var(--cursor-now') || CSS_WIDE.test(v)) return;
      const name = CURSOR_VARS[v];
      decl.cloneBefore({ prop: '--cursor-now', value: name ? `var(${name}, ${v})` : v });
      decl.value = HANDED_DOWN;
    },
  },
};
