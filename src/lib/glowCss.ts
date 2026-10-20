// The build step behind lib/ditheredGlow.ts: soft glows stay written plainly
// as text-shadow and box-shadow, and this hands their soft parts to the page
// through custom properties it can read, painted through a variable it can
// swap out while it draws them itself, dithered.
//
// - `text-shadow: V` keeps its crisp parts (and any part written with var(),
//   whose blur isn't known here) and moves the soft ones (blur of
//   GLOW_MIN_BLUR px or more) into `--text-glow`, painted after the crisp ones
//   through `var(--text-glow-paint, …)`. With no soft part, it only gets
//   `--text-glow: none` beside it, so a later rule that drops the glow clears
//   it too.
// - `box-shadow: V` keeps its crisp parts the same way, and moves the soft
//   ones into `--box-glow-in` (inset) and
//   `--box-glow-out`, painted through `--box-glow-in-paint` and
//   `--box-glow-out-paint`, in the order: crisp inset, soft inset, crisp
//   outer, soft outer. Inset and outer shadows never overlap, so only crisp
//   and soft insets trade places, and states keep inset and outer at the
//   same positions so box-shadow can still transition between them.
//
// Keyframes are left alone: what an animation paints, CSS paints.

import type { AtRule, Declaration, Node } from 'postcss';

/** Shadows blurred less than this stay with CSS: too tight to band. */
export const GLOW_MIN_BLUR = 6;

/** Splits a shadow list at its top-level commas. */
export function splitShadows(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

type Part = { text: string; inset: boolean; soft: boolean };

function partOf(text: string): Part {
  const inset = /(^|\s)inset(\s|$)/.test(text);
  // Lengths outside any function (a colour, or a var() for one): x, y, blur, spread.
  const bare = text.replace(/[a-z-]+\([^()]*(\([^()]*\)[^()]*)*\)/gi, ' ');
  const lengths = bare.match(/-?[\d.]+(px|rem|em)?(?=\s|$)/g) ?? [];
  // A var() where the blur would be: unknown here, so it stays with CSS.
  if (lengths.length < 3) return { text, inset, soft: false };
  const blur = lengths[2];
  const px = blur?.endsWith('rem') ? parseFloat(blur) * 16 : blur && !blur.endsWith('em') ? parseFloat(blur) : 0;
  return { text, inset, soft: px >= GLOW_MIN_BLUR };
}

export type Decl = { prop: string; value: string };

/** The declarations a text-shadow or box-shadow declaration becomes. */
export function glowDecls(prop: string, value: string): Decl[] | null {
  const v = value.trim();
  if (/var\(--(text|box)-glow/.test(v)) return null;
  if (prop === 'text-shadow') {
    const parts = /^(none|initial|inherit|unset|revert)$/.test(v) ? [] : splitShadows(v).map(partOf);
    const soft = parts.filter((p) => p.soft).map((p) => p.text);
    if (!soft.length) return [{ prop: '--text-glow', value: 'none' }, { prop, value: v }];
    const list = [...parts.filter((p) => !p.soft).map((p) => p.text), `var(--text-glow-paint, ${soft.join(', ')})`];
    return [
      { prop: '--text-glow', value: soft.join(', ') },
      { prop, value: list.join(', ') },
    ];
  }
  if (prop === 'box-shadow') {
    const parts = /^(none|initial|inherit|unset|revert)$/.test(v) ? [] : splitShadows(v).map(partOf);
    const softIn = parts.filter((p) => p.soft && p.inset).map((p) => p.text);
    const softOut = parts.filter((p) => p.soft && !p.inset).map((p) => p.text);
    const out: Decl[] = [
      { prop: '--box-glow-in', value: softIn.join(', ') || 'none' },
      { prop: '--box-glow-out', value: softOut.join(', ') || 'none' },
    ];
    if (!softIn.length && !softOut.length) return [...out, { prop, value: v }];
    const list = [
      ...parts.filter((p) => !p.soft && p.inset).map((p) => p.text),
      ...(softIn.length ? [`var(--box-glow-in-paint, ${softIn.join(', ')})`] : []),
      ...parts.filter((p) => !p.soft && !p.inset).map((p) => p.text),
      ...(softOut.length ? [`var(--box-glow-out-paint, ${softOut.join(', ')})`] : []),
    ];
    return [...out, { prop, value: list.join(', ') }];
  }
  return null;
}

function inKeyframes(decl: Declaration) {
  for (let p: Node['parent'] | undefined = decl.parent; p; p = p.parent) {
    if (p.type === 'atrule' && /keyframes$/.test((p as AtRule).name)) return true;
  }
  return false;
}

function rewrite(decl: Declaration) {
  if (inKeyframes(decl)) return;
  const decls = glowDecls(decl.prop, decl.value);
  if (!decls) return;
  for (const d of decls.slice(0, -1)) decl.cloneBefore({ prop: d.prop, value: d.value });
  decl.value = decls[decls.length - 1].value;
}

/** The PostCSS plugin (vite.config.ts). */
export const ditheredGlows = {
  postcssPlugin: 'dithered-glows',
  Declaration: {
    'text-shadow': rewrite,
    'box-shadow': rewrite,
  },
};
