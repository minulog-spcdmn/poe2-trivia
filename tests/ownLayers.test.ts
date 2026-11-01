// What Chrome draws again on every frame of an animation, read from the CSS
// and the scripts (docs/qa.md, “Redraws”): an animation of anything but its
// transform or opacity (a filter, a custom property, a colour, a shadow, a
// stroke) runs on the page's thread, and each frame it draws again the layer
// it's painted on, which may be a whole card face or the whole page. On an
// element with a layer of its own (will-change), that layer is only as big
// as the element. The emblems' kindle and the way out's lamp each drew a
// sharp card face again every frame (rule 7 in docs/category-cards.md); this
// widens that rule to every component, and to what the scripts play with
// element.animate(). What may animate so without a layer of its own, and
// why, is src/qa/painted.ts' PAINTED. The sweep's redraw check
// (scripts/sweep.mjs --redraws) measures what this can only guess.
//
// Where it can't tell, it takes the element for one with no layer of its
// own: a will-change counts only on a rule that styles every element the
// animated one does, whenever that one animates (no state, ancestor or
// @media the animated rule lacks), and that no later will-change without a
// layer undoes; an animation named through a var() set nowhere in the same
// stylesheet, or keyframes a script builds where this can't read them, are
// taken as painted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import postcss, { type AtRule, type Declaration, type Rule } from 'postcss';
import ts from 'typescript';
import { PAINTED, type PaintedCall, type PaintedCss } from '../src/qa/painted.ts';

const root = join(import.meta.dirname, '..');
const rel = (p: string) => relative(root, p).replaceAll('\\', '/');

/** Every .svelte, .css and .ts file under src/, by path from the repository's root, with its text. */
function sources(): { file: string; src: string }[] {
  const out: { file: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(svelte|css|ts)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push({ file: rel(p), src: readFileSync(p, 'utf8') });
    }
  };
  walk(join(root, 'src'));
  return out;
}
const all = sources();

/** What the compositor animates by itself, and what changes only in steps (drawn again once a step, not every frame). */
const NOT_PAINTED = new Set(['transform', 'translate', 'rotate', 'scale', 'opacity', 'animation-timing-function', 'visibility', 'display', 'pointer-events', 'z-index', 'content']);
/** will-change values that give an element a layer of its own. */
const LAYER = /\b(transform|translate|rotate|scale|opacity|filter)\b/;

// ---- selectors ----

/** Where `s` splits at depth 0 (outside brackets, parentheses and quotes), by `at`. */
function splitTop(s: string, at: (ch: string) => boolean): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '\\') i++;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (!depth && at(ch)) {
      out.push(s.slice(from, i));
      from = i + 1;
    }
  }
  out.push(s.slice(from));
  return out;
}
/** Where `find` first comes in `s` at depth 0, or -1. */
function topIndex(s: string, find: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (!depth && s.startsWith(find, i)) return i;
    else if (s[i] === '(' || s[i] === '[') depth++;
    else if (s[i] === ')' || s[i] === ']') depth--;
  }
  return -1;
}
/** Where a parenthesis opened at `open` closes. */
function closing(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '(') depth++;
    else if (s[i] === ')' && !--depth) return i;
  }
  return s.length;
}

/** One compound of a selector: what an element must be to match it. */
type Compound = { tag: string; ids: string[]; classes: string[]; attrs: string[]; pseudos: string[]; element: string; scoped: boolean };
/** A selector as it matches: its last compound, and what comes before it (its ancestors, siblings), as text. */
type Complex = { context: string; last: Compound };

const IDENT = /^-?(?:[\w-]|\\.|[^\x00-\x7f])+/;
const LEGACY_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
function compound(text: string, scoped: boolean): Compound {
  const c: Compound = { tag: '', ids: [], classes: [], attrs: [], pseudos: [], element: '', scoped };
  let s = text.trim();
  const tag = /^(\*|[a-zA-Z][\w-]*)/.exec(s);
  if (tag) {
    c.tag = tag[1] === '*' ? '' : tag[1]!.toLowerCase();
    s = s.slice(tag[0].length);
  }
  while (s) {
    const lead = s.startsWith('::') ? '::' : s[0]!;
    if (lead === '[') {
      const end = splitTop(s.slice(1), (ch) => ch === ']')[0]!.length + 1;
      c.attrs.push(s.slice(0, end + 1).replace(/\s+/g, ''));
      s = s.slice(end + 1);
      continue;
    }
    const name = IDENT.exec(s.slice(lead.length))?.[0];
    if (!name) {
      // (Nothing this reads: kept whole, as a condition the selector adds.)
      c.pseudos.push(s);
      break;
    }
    if (!['.', '#', ':', '::'].includes(lead)) {
      c.pseudos.push(s);
      break;
    }
    let end = lead.length + name.length;
    if (s[end] === '(') end = closing(s, end) + 1;
    const part = s.slice(0, end).replace(/\s+/g, ' ');
    s = s.slice(end);
    if (lead === '.') c.classes.push(name);
    else if (lead === '#') c.ids.push(name);
    else if (lead === '::' || LEGACY_ELEMENTS.has(name.toLowerCase())) c.element = '::' + part.replace(/^::?/, '').toLowerCase();
    else c.pseudos.push(part);
  }
  return c;
}
const compoundText = (c: Compound, mark = true) => `${mark && c.scoped ? '(scoped)' : ''}${c.tag}${c.ids.map((i) => '#' + i).join('')}${c.classes.map((k) => '.' + k).join('')}${c.attrs.join('')}${c.pseudos.join('')}${c.element}`;

/** A selector's compounds and the combinators between them; a component's own compounds (outside :global()) scoped to it. */
function parts(selector: string, svelte: boolean): { compounds: Compound[]; combinators: string[] } {
  // Its words at depth 0: compounds, and the combinators ('>', '+', '~') between them.
  const words: string[] = [];
  let word = '';
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]!;
    if (ch === '\\') {
      word += ch + (selector[++i] ?? '');
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (!depth && /[\s>+~]/.test(ch)) {
      if (word) words.push(word);
      if (!/\s/.test(ch)) words.push(ch);
      word = '';
    } else word += ch;
  }
  if (word) words.push(word);
  const compounds: Compound[] = [];
  const combinators: string[] = [];
  let pending = ' ';
  for (const w of words) {
    if (/^[>+~]$/.test(w)) {
      pending = ` ${w} `;
      continue;
    }
    if (compounds.length) combinators.push(pending);
    pending = ' ';
    // (One at its top: a :global() inside a :not() is the :not()'s.)
    const g = topIndex(w, ':global(');
    if (svelte && g >= 0) {
      // :global(...): what's inside it isn't the component's own; what's before it in the same compound is.
      const end = closing(w, g + ':global'.length);
      const inner = parts(w.slice(g + ':global('.length, end), false);
      const before = w.slice(0, g);
      const after = w.slice(end + 1);
      const first = inner.compounds[0]!;
      if (before) inner.compounds[0] = compound(before + compoundText(first, false), true);
      if (after) inner.compounds[inner.compounds.length - 1] = compound(compoundText(inner.compounds.at(-1)!, false) + after, inner.compounds.at(-1)!.scoped);
      compounds.push(...inner.compounds);
      combinators.push(...inner.combinators);
    } else compounds.push(compound(w, svelte));
  }
  return { compounds, combinators };
}

/** The pseudo-classes whose argument is a list of alternatives, any of which matches. */
const ANY = /^:(is|where|matches|-webkit-any)\((.*)\)$/s;
/**
 * What a selector matches, as plain selectors: a last compound's :is() (or
 * :where()) of compounds read as one selector for each of them.
 */
function complexes(selector: string, svelte: boolean): Complex[] {
  const { compounds, combinators } = parts(selector, svelte);
  const context = compounds
    .slice(0, -1)
    .map((c, i) => compoundText(c) + combinators[i])
    .join('');
  // An :is() of compounds alone (one of anything more stays a condition, kept whole).
  const alternatives = (p: string) => {
    const list = ANY.exec(p) && splitTop(ANY.exec(p)![2]!, (ch) => ch === ',');
    return list?.every((alt) => parts(alt, false).compounds.length === 1) ? list : null;
  };
  let lasts = [compounds.at(-1)!];
  for (let at; (at = lasts.findIndex((c) => c.pseudos.some(alternatives))) >= 0; ) {
    const c = lasts[at]!;
    const p = c.pseudos.find(alternatives)!;
    const rest = { ...c, pseudos: c.pseudos.filter((q) => q !== p) };
    const alts = alternatives(p)!.map((alt) => {
      const a = compound(alt, false);
      return { ...rest, tag: rest.tag || a.tag, ids: [...rest.ids, ...a.ids], classes: [...rest.classes, ...a.classes], attrs: [...rest.attrs, ...a.attrs], pseudos: [...rest.pseudos, ...a.pseudos], element: rest.element || a.element };
    });
    lasts = [...lasts.slice(0, at), ...alts, ...lasts.slice(at + 1)];
  }
  return lasts.map((last) => ({ context, last }));
}

/** A selector's specificity, as one number (ids, then classes, then tags). */
function specificity(selector: string): number {
  let n = 0;
  for (const c of parts(selector, false).compounds) {
    n += c.ids.length * 1e6 + (c.classes.length + c.attrs.length) * 1e3 + (c.tag ? 1 : 0) + (c.element ? 1 : 0);
    for (const p of c.pseudos) {
      const arg = /^:([\w-]+)\((.*)\)$/s.exec(p);
      if (!arg) n += 1e3;
      else if (arg[1] === 'where') continue;
      else if (/^(is|not|has|matches|-webkit-any)$/.test(arg[1]!)) n += Math.max(...splitTop(arg[2]!, (ch) => ch === ',').map(specificity));
      else n += 1e3;
    }
  }
  return n;
}

const subset = (a: string[], b: string[]) => a.every((x) => b.includes(x));
/** Whether `l` (a will-change rule's selector) styles every element `a` does: no condition `a` lacks (a class, a state), the same pseudo-element. */
const covers = (l: Complex, a: Complex) =>
  (!l.context || l.context === a.context) &&
  l.last.element === a.last.element &&
  (!l.last.scoped || a.last.scoped) &&
  (!l.last.tag || l.last.tag === a.last.tag) &&
  Boolean(l.last.tag || l.last.classes.length || l.last.ids.length || l.last.attrs.length) &&
  subset(l.last.classes, a.last.classes) &&
  subset(l.last.ids, a.last.ids) &&
  subset(l.last.attrs, a.last.attrs) &&
  subset(l.last.pseudos, a.last.pseudos);
/** Whether `n` might style an element `a` does: the same pseudo-element, a tag that doesn't differ, and a class, id or attribute of `a`'s (where both have any). */
const mayStyle = (n: Complex, a: Complex) => {
  const marks = (c: Compound) => [...c.classes.map((k) => '.' + k), ...c.ids.map((i) => '#' + i), ...c.attrs];
  const [nm, am] = [marks(n.last), marks(a.last)];
  return n.last.element === a.last.element && (!n.last.tag || !a.last.tag || n.last.tag === a.last.tag) && (!nm.length || !am.length || nm.some((m) => am.includes(m)));
};

// ---- stylesheets ----

type Sheet = { file: string; css: postcss.Root; svelte: boolean; rest: string };
/** Every stylesheet of the game's: its .css files and its components' <style>s, with the rest of each component's text (its script and markup). */
const sheetsOf = (texts: { file: string; src: string }[]) =>
  texts.flatMap(({ file, src }): Sheet[] => {
    if (file.endsWith('.css')) return [{ file, css: postcss.parse(src), svelte: false, rest: '' }];
    if (!file.endsWith('.svelte')) return [];
    const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src);
    return style ? [{ file, css: postcss.parse(style[1]!), svelte: true, rest: src.replace(style[0], '') }] : [];
  });
const sheets = sheetsOf(all);

/** A rule's selectors, nesting resolved (`&`, or a descendant of the rule it's in). */
function selectorsOf(rule: Rule): string[] {
  const own = rule.selectors.map((s) => s.trim().replace(/\s+/g, ' '));
  let up = rule.parent as postcss.Node | undefined;
  while (up && up.type === 'atrule') up = up.parent as postcss.Node | undefined;
  if (!up || up.type !== 'rule') return own;
  const outer = selectorsOf(up as Rule);
  return own.flatMap((s) => outer.map((o) => (s.includes('&') ? s.replaceAll('&', outer.length > 1 ? `:is(${outer.join(', ')})` : o) : `${o} ${s}`)));
}
/** The conditions a declaration is under: each @media, @supports, @container (or @layer) it's inside. */
function conditions(d: Declaration): string[] {
  const out: string[] = [];
  for (let up = d.parent as postcss.Node | undefined; up && up.type !== 'root'; up = up.parent as postcss.Node | undefined) if (up.type === 'atrule') out.push(`@${(up as AtRule).name} ${(up as AtRule).params}`.replace(/\s+/g, ' '));
  return out;
}

/** The properties each @keyframes changes that are painted, by name. */
function keyframes(css: postcss.Root): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  css.walkAtRules(/keyframes$/, (k) => {
    const name = k.params.trim().replace(/^-global-/, '');
    const props = out.get(name) ?? new Set<string>();
    k.walkDecls((d) => void (NOT_PAINTED.has(d.prop.toLowerCase()) || props.add(d.prop.toLowerCase())));
    out.set(name, props);
  });
  return new Map([...out].map(([k, v]) => [k, [...v]]));
}
// Keyframes are a component's own, else global: any .css file's, or a component's -global- ones.
const globalKeyframes = new Map<string, string[]>();
for (const { file, css } of sheets)
  for (const [name, props] of keyframes(css))
    if (file.endsWith('.css') || css.toString().includes(`-global-${name}`)) globalKeyframes.set(name, [...new Set([...(globalKeyframes.get(name) ?? []), ...props])]);

const ANIMATION = /^(-webkit-)?animation(-name)?$/i;
/** The words of an animation that aren't its name: its times, counts, easings, directions, fills and states. */
const NOT_A_NAME = /^(none|linear|ease(-in|-out|-in-out)?|step-(start|end)|infinite|normal|reverse|alternate(-reverse)?|forwards|backwards|both|running|paused|initial|inherit|unset|revert(-layer)?|[-+]?[\d.]+(e[-+]?\d+)?(m?s)?)$/i;
/**
 * The keyframes an animation's value names: each word that names one, and
 * where an animation has no name of its own but a var(), what the var()
 * names, read where the stylesheet sets it (with its fallback). One set
 * anywhere else (the markup, a script) is kept as `var(--name)`: what it
 * names can't be read here.
 */
function named(value: string, sheet: Sheet, seen = new Set<string>()): string[] {
  const out: string[] = [];
  for (const one of splitTop(value, (ch) => ch === ',')) {
    const words = splitTop(one.trim(), (ch) => /\s/.test(ch)).filter(Boolean);
    const names = words.filter((w) => !w.includes('(') && !NOT_A_NAME.test(w));
    out.push(...names);
    if (names.length) continue;
    for (const v of words.filter((w) => /^var\(/.test(w))) {
      const [prop = '', ...fallback] = splitTop(v.slice(4, closing(v, 3)), (ch) => ch === ',');
      const name = prop.trim();
      const set: string[] = [];
      sheet.css.walkDecls(name, (d) => void set.push(d.value));
      const elsewhere = new RegExp(`${name.replace(/-/g, '\\-')}(?![\\w-])`).test(sheet.rest);
      if (seen.has(name)) continue; // (Set in terms of itself: nothing more to read.)
      if (!set.length || elsewhere) out.push(`var(${name})`);
      else for (const s of [...set, fallback.join(',')]) out.push(...named(s, sheet, new Set([...seen, name])));
    }
  }
  return [...new Set(out)];
}

type Found = { file: string; keyframes: string; props: string[]; selector: string; value: string; layered: boolean };
type Placed = { alts: Complex[]; spec: number; order: number; important: boolean; at: string[] };

/** Every animation of what's painted in the stylesheets, and whether its element has a layer of its own. */
function painted(list = sheets): Found[] {
  const found: Found[] = [];
  for (const sheet of list) {
    const { file, css, svelte } = sheet;
    const own = keyframes(css);
    const layers: Placed[] = [];
    const unlayers: Placed[] = [];
    let order = 0;
    css.walkDecls(/^will-change$/i, (d) => {
      order++;
      if (d.parent?.type !== 'rule') return;
      for (const s of selectorsOf(d.parent as Rule)) (LAYER.test(d.value) ? layers : unlayers).push({ alts: complexes(s, svelte), spec: specificity(s), order, important: d.important, at: conditions(d) });
    });
    // Whether `n` wins over `l` where both style an element.
    const wins = (n: Placed, l: Placed) => (n.important !== l.important ? n.important : n.spec !== l.spec ? n.spec > l.spec : n.order > l.order);
    const layered = (a: Complex, at: string[]) =>
      layers.some((l) => subset(l.at, at) && l.alts.some((alt) => covers(alt, a)) && !unlayers.some((n) => n.alts.some((alt) => mayStyle(alt, a)) && wins(n, l)));
    css.walkDecls(ANIMATION, (d) => {
      const selectors = d.parent?.type === 'rule' ? selectorsOf(d.parent as Rule) : ['(not in a rule)'];
      for (const name of named(d.value, sheet)) {
        const props = name.startsWith('var(') ? ['?'] : (own.get(name) ?? globalKeyframes.get(name));
        if (!props?.length) continue;
        for (const selector of selectors)
          found.push({ file, keyframes: name, props, selector, value: d.value.replace(/\s+/g, ' '), layered: d.parent?.type === 'rule' && complexes(selector, svelte).every((a) => layered(a, conditions(d))) });
      }
    });
  }
  return found;
}

// ---- scripts: element.animate() ----

/** A script: a .ts file, or a component's <script> (where it starts in the file, for its lines). */
type Script = { file: string; ast: ts.SourceFile; line0: number };
const scriptsOf = (texts: { file: string; src: string }[]) =>
  texts.flatMap(({ file, src }): Script[] => {
    if (file.endsWith('.ts')) return [{ file, ast: ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true), line0: 0 }];
    if (!file.endsWith('.svelte')) return [];
    return [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => ({
      file,
      ast: ts.createSourceFile(file, m[1]!, ts.ScriptTarget.Latest, true),
      line0: src.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length - 1,
    }));
  });
const scripts = scriptsOf(all);

const unwrapExpr = (e: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e) ? unwrapExpr(e.expression) : e;
const isFunction = (n: ts.Node): n is ts.FunctionLikeDeclaration => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

type Binding = { kind: 'var'; decl: ts.VariableDeclaration; scope: ts.Node; isConst: boolean } | { kind: 'function'; fn: ts.FunctionLikeDeclaration } | { kind: 'param'; fn: ts.FunctionLikeDeclaration; index: number } | { kind: 'import'; from: string; name: string };
/** What a name refers to where it's read: the nearest declaration of it, walking out from there. */
function resolve(id: ts.Identifier): Binding | null {
  const name = id.text;
  // (Bound by a pattern, { a, b } or [a, b]: not read further.)
  const inPattern = (n: ts.BindingName) => !ts.isIdentifier(n) && new RegExp(`(^|[^\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(n.getText());
  for (let up: ts.Node | undefined = id.parent; up; up = up.parent) {
    if (isFunction(up)) {
      const index = up.parameters.findIndex((p) => ts.isIdentifier(p.name) && p.name.text === name);
      if (index >= 0) return { kind: 'param', fn: up, index };
      if (up.parameters.some((p) => inPattern(p.name))) return null;
    }
    const statements = ts.isSourceFile(up) || ts.isBlock(up) || ts.isModuleBlock(up) || ts.isCaseClause(up) || ts.isDefaultClause(up) ? up.statements : null;
    if (!statements) continue;
    for (const st of statements) {
      if (ts.isFunctionDeclaration(st) && st.name?.text === name) return { kind: 'function', fn: st };
      if (ts.isVariableStatement(st))
        for (const decl of st.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === name) {
            const init = decl.initializer && unwrapExpr(decl.initializer);
            if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) return { kind: 'function', fn: init };
            return { kind: 'var', decl, scope: up, isConst: Boolean(st.declarationList.flags & ts.NodeFlags.Const) };
          }
          if (inPattern(decl.name)) return null;
        }
      if (ts.isImportDeclaration(st) && st.importClause && ts.isStringLiteral(st.moduleSpecifier)) {
        const els = st.importClause.namedBindings && ts.isNamedImports(st.importClause.namedBindings) ? st.importClause.namedBindings.elements : [];
        const el = els.find((e) => e.name.text === name);
        if (el) return { kind: 'import', from: st.moduleSpecifier.text, name: (el.propertyName ?? el.name).text };
      }
    }
  }
  return null;
}

/** Every place a variable is read from in its scope: what's done to it there. */
function* uses(decl: ts.VariableDeclaration, scope: ts.Node): Generator<ts.Identifier> {
  const name = (decl.name as ts.Identifier).text;
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && n.text === name && n !== decl.name && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) found.push(n);
    ts.forEachChild(n, visit);
  };
  const found: ts.Identifier[] = [];
  visit(scope);
  yield* found;
}

const UNREAD = null;
type Props = Set<string> | null;
const union = (...ps: Props[]): Props => (ps.some((p) => p === UNREAD) ? UNREAD : new Set(ps.flatMap((p) => [...p!])));
/** A keyframe's key as the CSS property it is (boxShadow, box-shadow); what isn't one (offset, easing, composite) left out. */
const prop = (key: string) =>
  /^(offset|easing|composite)$/.test(key)
    ? null
    : key
        .replace(/^css(?=[A-Z])/, '')
        .replace(/^(webkit|moz)(?=[A-Z])/, '-$1')
        .replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const keyOf = (n: ts.PropertyName): string | null => (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? n.text : ts.isComputedPropertyName(n) && ts.isStringLiteralLike(n.expression) ? n.expression.text : null);

/**
 * The properties keyframes passed to animate() change, read from the code
 * that makes them: an array of keyframes or an object of them, a const
 * (and what's pushed onto it), what a function of the file's returns, what
 * Array.from() or a map() makes. Anything else is UNREAD.
 */
function frames(e: ts.Expression, seen: Set<ts.Node>): Props {
  e = unwrapExpr(e);
  if (seen.has(e)) return new Set();
  seen = new Set([...seen, e]);
  if (ts.isArrayLiteralExpression(e)) return union(...e.elements.map((el) => (ts.isSpreadElement(el) ? frames(el.expression, seen) : keyframe(el, seen))));
  if (ts.isObjectLiteralExpression(e)) return keyframe(e, seen);
  if (ts.isConditionalExpression(e)) return union(frames(e.whenTrue, seen), frames(e.whenFalse, seen));
  if (ts.isIdentifier(e)) return variable(e, seen, frames);
  if (ts.isCallExpression(e)) {
    const callee = unwrapExpr(e.expression);
    const fnArg = (i: number) => {
      const f = e.arguments[i] && unwrapExpr(e.arguments[i]!);
      return f && (ts.isArrowFunction(f) || ts.isFunctionExpression(f)) ? f : null;
    };
    if (ts.isPropertyAccessExpression(callee) && callee.getText() === 'Array.from' && fnArg(1)) return returns(fnArg(1)!, seen, keyframe);
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'map' && fnArg(0)) return returns(fnArg(0)!, seen, keyframe);
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'flatMap' && fnArg(0)) return returns(fnArg(0)!, seen, frames);
    if (ts.isIdentifier(callee)) {
      const b = resolve(callee);
      if (b?.kind === 'function') return returns(b.fn, seen, frames);
    }
  }
  return UNREAD;
}
/** The properties one keyframe changes. */
function keyframe(e: ts.Expression, seen: Set<ts.Node>): Props {
  e = unwrapExpr(e);
  if (ts.isObjectLiteralExpression(e))
    return union(
      ...e.properties.map((p): Props => {
        if (ts.isSpreadAssignment(p)) return keyframe(p.expression, seen);
        const key = (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && keyOf(p.name);
        if (key === false || key === null) return UNREAD;
        const css = prop(key);
        return new Set(css ? [css] : []);
      }),
    );
  if (ts.isConditionalExpression(e)) return union(keyframe(e.whenTrue, seen), keyframe(e.whenFalse, seen));
  if (ts.isElementAccessExpression(e)) return frames(e.expression, seen);
  if (ts.isIdentifier(e)) return variable(e, seen, keyframe);
  return UNREAD;
}
/** The names keyframes are played through: animate() and the wrappers round it (calls() finds them). */
let animators = new Set(['animate']);
/** Array methods that only read. */
const READS = /^(map|flatMap|slice|concat|at|find|filter|some|every|includes|indexOf|join|reduce|entries|keys|values)$/;
/** Whether a node is changed where it is: assigned to, counted up or down, deleted. */
const changed = (n: ts.Node) =>
  (ts.isBinaryExpression(n.parent) && n.parent.left === n && n.parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ||
  ((ts.isPrefixUnaryExpression(n.parent) || ts.isPostfixUnaryExpression(n.parent)) && (n.parent.operator === ts.SyntaxKind.PlusPlusToken || n.parent.operator === ts.SyntaxKind.MinusMinusToken)) ||
  ts.isDeleteExpression(n.parent);
/** The scripts calls() reads, where an import is looked for. */
let reading: Script[] = [];
const sameFile = (a: string, b: string) => a === b || a.replace(/\.(ts|svelte)$/, '') === b || b.replace(/\.(ts|svelte)$/, '') === a;
/** The const an import names, where its file exports one by that name. */
function exported(b: { from: string; name: string }, by: string): Binding | null {
  const file = importedFile(b.from, by);
  for (const s of reading.filter((s) => sameFile(s.file, file)))
    for (const st of s.ast.statements)
      if (ts.isVariableStatement(st) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
        for (const decl of st.declarationList.declarations)
          if (ts.isIdentifier(decl.name) && decl.name.text === b.name) return { kind: 'var', decl, scope: s.ast, isConst: Boolean(st.declarationList.flags & ts.NodeFlags.Const) };
  return null;
}
/** Where each file that imports an exported const reads it. */
function imported(decl: ts.VariableDeclaration): ts.Identifier[] {
  const st = decl.parent.parent;
  if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || !ts.isIdentifier(decl.name)) return [];
  const name = decl.name.text;
  const file = decl.getSourceFile().fileName;
  const out: ts.Identifier[] = [];
  for (const s of reading) {
    // (The names it's imported as here, then each read of one that's that import.)
    const local = new Set(
      s.ast.statements.flatMap((i) =>
        ts.isImportDeclaration(i) && ts.isStringLiteral(i.moduleSpecifier) && sameFile(importedFile(i.moduleSpecifier.text, s.file), file) && i.importClause?.namedBindings && ts.isNamedImports(i.importClause.namedBindings)
          ? i.importClause.namedBindings.elements.filter((e) => (e.propertyName ?? e.name).text === name).map((e) => e.name.text)
          : [],
      ),
    );
    if (!local.size) continue;
    const walk = (n: ts.Node): void => {
      if (ts.isIdentifier(n) && local.has(n.text) && !ts.isImportSpecifier(n.parent) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n) && resolve(n)?.kind === 'import') out.push(n);
      ts.forEachChild(n, walk);
    };
    walk(s.ast);
  }
  return out;
}
/**
 * A const's keyframes: its value, what's pushed onto it, and what's set on
 * it (a key of a keyframe); read by `as`. Changed any other way, or handed
 * to anything but what plays it, UNREAD. Imported, the one its file
 * exports, and each file that imports it may only hand it to what plays it.
 */
function variable(id: ts.Identifier, seen: Set<ts.Node>, as: (e: ts.Expression, seen: Set<ts.Node>) => Props): Props {
  const at = resolve(id);
  const b = at?.kind === 'import' ? exported(at, id.getSourceFile().fileName) : at;
  if (b?.kind !== 'var' || !b.isConst || !b.decl.initializer) return UNREAD;
  if (seen.has(b.decl)) return new Set();
  seen = new Set([...seen, b.decl]);
  const out: Props[] = [as(b.decl.initializer, seen)];
  for (const use of imported(b.decl)) {
    const p = use.parent;
    const callee = ts.isCallExpression(p) && p.arguments.some((a) => a === use) ? unwrapExpr(p.expression) : null;
    const name = callee && (ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '');
    if (!name || !animators.has(name)) out.push(UNREAD);
  }
  for (const use of uses(b.decl, b.scope)) {
    const p = use.parent;
    // How far up a chain of reads off it (x.a[0].b) it goes, and whether the end of that is changed.
    let top: ts.Node = use;
    while ((ts.isPropertyAccessExpression(top.parent) || ts.isElementAccessExpression(top.parent)) && top.parent.expression === top) top = top.parent;
    if (ts.isPropertyAccessExpression(p) && p.expression === use && ts.isCallExpression(p.parent) && p.parent.expression === p) {
      if (p.name.text === 'push') out.push(...p.parent.arguments.map((a) => keyframe(a, seen)));
      else if (!READS.test(p.name.text)) out.push(UNREAD);
    } else if (top !== use && changed(top)) {
      // (A key set on it, or on one of its keyframes: x.filter = ..., x[i].filter = ...)
      const key = ts.isPropertyAccessExpression(top) && (top.expression === use || (ts.isElementAccessExpression(top.expression) && top.expression.expression === use)) ? prop(top.name.text) : false;
      out.push(key === false ? UNREAD : new Set(key ? [key] : []));
    } else if (changed(use)) out.push(UNREAD);
    else if (ts.isCallExpression(p) && p.arguments.some((a) => a === use)) {
      const callee = unwrapExpr(p.expression);
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
      if (!animators.has(name)) out.push(UNREAD);
    } else if (ts.isShorthandPropertyAssignment(p) || (ts.isPropertyAssignment(p) && p.initializer === use) || (ts.isVariableDeclaration(p) && p.initializer === use) || (ts.isBinaryExpression(p) && p.right === use)) out.push(UNREAD);
  }
  return union(...out);
}
/** What a function returns, each return read by `as`. */
function returns(fn: ts.FunctionLikeDeclaration, seen: Set<ts.Node>, as: (e: ts.Expression, seen: Set<ts.Node>) => Props): Props {
  if (!fn.body) return UNREAD;
  if (!ts.isBlock(fn.body)) return as(fn.body, seen);
  const out: Props[] = [];
  const visit = (n: ts.Node): void => {
    if (isFunction(n)) return;
    if (ts.isReturnStatement(n)) out.push(n.expression ? as(n.expression, seen) : UNREAD);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(fn.body, visit);
  return out.length ? union(...out) : UNREAD;
}

/** A function's name, where it has one: its declaration's, or the const, property or method it's the value of. */
function nameOf(n: ts.Node): string | null {
  if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isClassDeclaration(n)) && n.name) return n.name.getText();
  if ((ts.isVariableDeclaration(n) || ts.isPropertyAssignment(n) || ts.isPropertyDeclaration(n)) && ts.isIdentifier(n.name)) return n.name.text;
  return null;
}
/** The name nearest round a node: the function, method, const or property it's in, else the call it's handed to (onMount). */
function within(n: ts.Node): string {
  for (let up = n.parent; up; up = up.parent) {
    const name = nameOf(up);
    if (name) return name;
  }
  for (let up: ts.Node = n; up.parent; up = up.parent) {
    const call = up.parent;
    if (isFunction(up) && ts.isCallExpression(call) && call.arguments.some((a) => a === up)) return call.expression.getText();
  }
  return '';
}
/** A function's name where it's the value of something named (const play = (el, frames) => ...). */
function fnName(fn: ts.FunctionLikeDeclaration): string | null {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  let up: ts.Node = fn.parent;
  while (ts.isParenthesizedExpression(up) || ts.isAsExpression(up) || ts.isSatisfiesExpression(up)) up = up.parent;
  return nameOf(up);
}

/** A file an import names, from the file importing it. */
function importedFile(from: string, by: string): string {
  const base = rel(join(root, dirname(by), from)).replace(/\.(ts|js|svelte)$/, '');
  return all.find((f) => f.file.replace(/\.(ts|svelte)$/, '') === base || f.file === `${base}/index.ts`)?.file ?? base;
}

/** A function that passes its own keyframes on to animate() (the zone card's play), the parameter they're in and the element's. */
type Wrapper = { file: string; name: string; fn: ts.FunctionLikeDeclaration; frames: number; el: number };
type Call = { file: string; line: number; in: string; props: string[] | null; call: string };

/** Every element.animate() of what's painted, through the functions that pass keyframes on to it as well. */
function calls(list = scripts, texts = all): Call[] {
  reading = list;
  const wrappers: Wrapper[] = [];
  // Where a call plays keyframes: animate()'s own, or a wrapper's (by its name; through an import, the file's that has it).
  const played = (c: ts.CallExpression, script: Script): { frames: number; el: ts.Expression | null }[] => {
    const callee = unwrapExpr(c.expression);
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'animate' && c.arguments.length) return [{ frames: 0, el: callee.expression }];
    const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : null;
    if (!name) return [];
    const b = ts.isIdentifier(callee) ? resolve(callee) : null;
    return wrappers
      .filter((w) => w.name === name && c.arguments.length > w.frames)
      .filter((w) => (b?.kind === 'function' ? w.fn === b.fn : b?.kind === 'import' ? w.name === b.name && importedFile(b.from, script.file) === w.file : b?.kind !== 'var'))
      .map((w) => ({ frames: w.frames, el: c.arguments[w.el] ?? null }));
  };
  const each = (visit: (c: ts.CallExpression, s: Script) => void) => {
    for (const s of list) {
      const walk = (n: ts.Node): void => {
        if (ts.isCallExpression(n)) visit(n, s);
        ts.forEachChild(n, walk);
      };
      walk(s.ast);
    }
  };
  // The wrappers first, each found through the one it passes keyframes to, till there are no more.
  for (let more = true; more; ) {
    more = false;
    each((c, s) => {
      for (const p of played(c, s)) {
        const f = unwrapExpr(c.arguments[p.frames]!);
        const b = ts.isIdentifier(f) ? resolve(f) : null;
        if (b?.kind !== 'param') continue;
        const name = fnName(b.fn);
        if (!name || wrappers.some((w) => w.fn === b.fn)) continue;
        const el = p.el && ts.isIdentifier(unwrapExpr(p.el)) ? resolve(unwrapExpr(p.el) as ts.Identifier) : null;
        wrappers.push({ file: s.file, name, fn: b.fn, frames: b.index, el: el?.kind === 'param' && el.fn === b.fn ? el.index : -1 });
        more = true;
      }
    });
  }
  animators = new Set(['animate', ...wrappers.map((w) => w.name)]);
  const out: Call[] = [];
  each((c, s) => {
    for (const p of played(c, s)) {
      const f = unwrapExpr(c.arguments[p.frames]!);
      const b = ts.isIdentifier(f) ? resolve(f) : null;
      // (A wrapper's own: its callers' are read instead.)
      if (b?.kind === 'param' && wrappers.some((w) => w.fn === b.fn)) continue;
      const props = frames(f, new Set());
      const shown = props && [...props].filter((x) => !NOT_PAINTED.has(x));
      if (shown && !shown.length) continue;
      const line = s.line0 + s.ast.getLineAndCharacterOfPosition(c.getStart()).line + 1;
      out.push({ file: s.file, line, in: within(c), props: shown && shown.sort(), call: c.getText().replace(/\s+/g, ' ').slice(0, 80) });
    }
  });
  // One in a component's markup (an event's handler) isn't read: taken as painted.
  for (const { file, src } of texts)
    if (file.endsWith('.svelte'))
      for (const m of src.replace(/<script[^>]*>[\s\S]*?<\/script>|<style[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, (x) => x.replace(/[^\n]/g, ' ')).matchAll(/\.animate\(/g))
        out.push({ file, line: src.slice(0, m.index).split('\n').length, in: '(markup)', props: null, call: '.animate(' });
  return out;
}

const found = painted();
const played = calls();

const isCss = (p: (typeof PAINTED)[number]): p is PaintedCss => 'keyframes' in p;
const isCall = (p: (typeof PAINTED)[number]): p is PaintedCall => 'animate' in p;
/** Whether a PAINTED entry for animate() lets a call through: the same file, a name it lists, and nothing it doesn't (`?` for keyframes this can't read). */
const lets = (p: PaintedCall, c: Call) => p.file === c.file && p.animate.in.includes(c.in) && (c.props ?? ['?']).every((x) => p.animate.props.includes(x));

test('the animations of what is painted are found', () => {
  // (The emblems' kindle and the timer's lamp, at least.)
  assert.ok(found.some((f) => f.file === 'src/components/ChooseCategory.svelte' && f.keyframes === 'kindle'), 'found the kindle');
  assert.ok(found.some((f) => f.file === 'src/components/TimerRing.svelte' && f.keyframes === 'lamp'), 'found the timer’s lamp');
  assert.ok(found.some((f) => f.file === 'src/components/Settings.svelte' && f.keyframes === 'breathe' && f.layered), 'found the seal’s breath on a layer of its own');
  assert.ok(found.some((f) => f.file === 'src/components/GameOver.svelte' && f.keyframes === 'gleam' && f.layered), 'and GameOver’s gleam');
  // (The ladder's holes, named through a var() its markup sets; a picture's veil, a filter played from its script.)
  assert.ok(found.some((f) => f.file === 'src/components/DelveLadder.svelte' && f.keyframes === 'var(--holes)'), 'found the ladder’s holes');
  assert.ok(played.some((c) => c.file === 'src/components/QuestionView.svelte' && c.props?.includes('filter')), 'found the veil’s flash');
  assert.ok(played.some((c) => c.file === 'src/spatialPage/Menu.svelte' && c.props?.includes('box-shadow')), 'found the menu’s flash');
});

test('what has a layer of its own is read as Chrome would', () => {
  const one = (s: string, svelte = true) => complexes(s, svelte)[0]!;
  assert.ok(covers(one('.a'), one('.a.b:hover')), 'a layer on .a is on .a.b:hover');
  assert.ok(!covers(one('.a:hover'), one('.a')), 'one on .a:hover isn’t always on .a');
  assert.ok(!covers(one('.open .a'), one('.a')), 'nor one on .open .a');
  assert.ok(covers(one('.open .a'), one('.open .a.b')), 'one on .open .a is on .open .a.b');
  assert.ok(!covers(one('.a'), one('.b:not(.a)')), 'a class in :not() isn’t one the element has');
  assert.ok(!covers(one('.a:not(.b)'), one('.a')), 'one on .a:not(.b) isn’t on every .a');
  assert.ok(covers(one('.a:not(:global(.b))'), one('.a.c:not(:global(.b))')), 'the same :not() on both');
  assert.ok(!covers(one('.a'), one(':global(.a)')), 'a component’s own .a isn’t every .a');
  assert.ok(covers(one(':global(.a)'), one('.a')), 'but every .a is a component’s');
  assert.ok(covers(one('.t'), one('.t:global(.dealt)')), 'nor does a :global() part take the compound out of the component');
  assert.ok(!covers(one('.a'), one('.a::before')), 'nor is an element’s its pseudo-element’s');
  assert.deepEqual(
    complexes('.x:is(.a, .b)', true).map((c) => c.last.classes),
    [
      ['x', 'a'],
      ['x', 'b'],
    ],
    ':is() read as each of its compounds',
  );
  const sheet = (css: string): Sheet => ({ file: 'test.svelte', css: postcss.parse(css), svelte: true, rest: '' });
  assert.deepEqual(named('var(--m, none)', sheet('.a { --m: spin 1s, glow 2s var(--ease); }')), ['spin', 'glow'], 'a var() read where it’s set');
  assert.deepEqual(named('turn var(--t) linear var(--dir, normal)', sheet('')), ['turn'], 'one with a name of its own takes none from a var()');
  assert.deepEqual(named('var(--m, none)', sheet('.a { color: red; }')), ['var(--m)'], 'one set nowhere here kept as it is');
  assert.deepEqual(named('var(--m, none)', { ...sheet('.a { --m: spin 1s; }'), rest: '<b style:--m={x}></b>' }), ['var(--m)'], 'and so is one the markup sets too');

  const layered = (css: string, markup = '') =>
    Object.fromEntries(painted(sheetsOf([{ file: 'test.svelte', src: `${markup}<style>@keyframes glow { to { filter: blur(2px); } } ${css}</style>` }])).map((f) => [f.selector, f.layered]));
  assert.deepEqual(layered('.a { animation: glow 1s; will-change: filter; }'), { '.a': true }, 'its own rule’s will-change');
  assert.deepEqual(layered('.a { animation: glow 1s; } .a.b, .c { will-change: opacity; }'), { '.a': false }, 'not one on .a.b');
  assert.deepEqual(layered('.a { animation: glow 1s; } @media (min-width: 700px) { .a { will-change: opacity; } }'), { '.a': false }, 'nor one in an @media the animation isn’t in');
  assert.deepEqual(layered('@media (min-width: 700px) { .a { animation: glow 1s; } .a { will-change: opacity; } }'), { '.a': true }, 'but one in the same');
  assert.deepEqual(layered('.a { animation: glow 1s; will-change: opacity; } .a.off { will-change: auto; }'), { '.a': false }, 'nor one undone by a later will-change');
  assert.deepEqual(layered('.a.on { animation: glow 1s; will-change: opacity; } .a { will-change: auto; }'), { '.a.on': true }, 'unless it wins over that');
  assert.deepEqual(layered('.a, .b { -webkit-animation: glow 1s; } .a { will-change: filter; }'), { '.a': true, '.b': false }, '-webkit-animation, each selector of a rule apart');
  assert.deepEqual(layered('.a { animation: var(--m, none); }', '<i class="a" style:--m={m}></i>'), { '.a': false }, 'and a var() the markup sets, taken as painted');
  assert.ok(globalKeyframes.has('filigree-in'), 'app.css’s keyframes are global');
});

test('what a script animates is read from it', () => {
  const read = (src: string, file = 'src/test.ts') => calls(scriptsOf([{ file, src }]), [{ file, src }]).map((c) => `${c.in}: ${c.props?.join(', ') ?? '?'}`);
  assert.deepEqual(read(`const flash = (el) => el.animate([{ boxShadow: '0 0 4px red' }, { boxShadow: 'none' }], 700);`), ['flash: box-shadow'], 'keyframes written out');
  assert.deepEqual(read(`const F = [{ opacity: 0, transform: 'none' }]; function go(el) { el.animate(F, 200); }`), [], 'a transform and opacity alone pass');
  assert.deepEqual(read(`function go(el) { const f = [{ opacity: 0 }]; f.push({ filter: 'blur(1px)' }); el.animate(f, 200); }`), ['go: filter'], 'what is pushed onto a const');
  assert.deepEqual(read(`function go(el) { const f = [{ opacity: 0 }]; f[0].color = 'red'; el.animate(f, 200); }`), ['go: color'], 'and what’s set on one of its keyframes');
  assert.deepEqual(read(`function go(el, k) { const f = []; f[0] = k; el.animate(f, 200); }`), ['go: ?'], 'one set any other way can’t be read');
  assert.deepEqual(read(`function go(el) { const f = [{ opacity: 0 }]; tweak(f); el.animate(f, 200); }`), ['go: ?'], 'nor one handed to something else');
  assert.deepEqual(
    read(`const play = (el, frames, o) => el.animate(frames, o); function enter(el) { play(el, [{ webkitMaskPosition: '0 0' }], {}); play(el, [{ opacity: 1 }], {}); }`),
    ['enter: -webkit-mask-position'],
    'a wrapper’s keyframes are its callers’',
  );
  const two = (a: string, b: string) => {
    const texts = [{ file: 'src/k.ts', src: a }, { file: 'src/a.ts', src: b }];
    return calls(scriptsOf(texts), texts).map((c) => `${c.in}: ${c.props?.join(', ') ?? '?'}`);
  };
  const K = `export const K = [{ strokeDashoffset: 100, opacity: 0 }, { strokeDashoffset: 0, opacity: 1 }];`;
  assert.deepEqual(two(K, `import { K } from './k'; function go(el) { el.animate(K, 1); }`), ['go: stroke-dashoffset'], 'keyframes another file exports');
  assert.deepEqual(two(K, `import { K as L } from './k'; function go(el) { L.push({ color: 'red' }); el.animate(L, 1); }`), ['go: ?'], 'but not where a file that imports them changes them');
  assert.deepEqual(read(`<script>let el; onMount(() => el.animate(Array.from({ length: 3 }, (_, i) => ({ color: 'red', offset: i / 2 })), 1));</script>`, 'src/t.svelte'), ['onMount: color'], 'Array.from()’s, in a component');
  assert.deepEqual(read(`<button onclick={(e) => e.currentTarget.animate(k, 1)}></button>`, 'src/t.svelte'), ['(markup): ?'], 'and one in the markup taken as painted');
});

test('what animates anything but its transform or opacity has a layer of its own, or a reason', () => {
  const allowed = (f: Found) => PAINTED.filter(isCss).some((p) => p.file === f.file && p.keyframes.includes(f.keyframes) && p.selectors.includes(f.selector));
  const missing = found.filter((f) => !f.layered && !allowed(f));
  assert.deepEqual(
    missing.map((f) => `${f.file}: @keyframes ${f.keyframes} animates ${f.props.join(', ')} on ${f.selector} (animation: ${f.value})`),
    [],
    'Chrome draws the layer under each of these again on every frame it runs. Give the element will-change (transform, opacity or filter, whichever fits) on a rule that styles it whenever it animates, so it has a layer of its own, or add it to PAINTED in src/qa/painted.ts (its file, keyframes and selector) with what the redraw check measured (npm run sweep -- --redraws --only <scene>)',
  );
});

test('what a script animates with animate() is its transform or opacity, or has a reason', () => {
  const allowed = (c: Call) => PAINTED.filter(isCall).some((p) => lets(p, c));
  const missing = played.filter((c) => !allowed(c));
  assert.deepEqual(
    missing.map((c) => `${c.file}:${c.line} (in ${c.in || 'the file'}): ${c.call} animates ${c.props ? c.props.join(', ') : 'keyframes this can’t read (?)'}`),
    [],
    'Chrome draws the layer under each of these again on every frame it runs. Animate its transform or opacity instead, or add it to PAINTED in src/qa/painted.ts (its file, what it’s in and what it animates, ? for keyframes this can’t read) with why: how much it draws, and how long for',
  );
});

test('PAINTED names only animations still there and still without a layer of their own', () => {
  for (const p of PAINTED.filter(isCss)) {
    const here = found.filter((f) => f.file === p.file && p.keyframes.includes(f.keyframes) && p.selectors.includes(f.selector));
    for (const k of p.keyframes) {
      assert.ok(
        here.some((f) => f.keyframes === k),
        `PAINTED names ${p.file}'s @keyframes ${k}, which no longer animates anything painted on ${p.selectors.join(', ')}: take it out`,
      );
      assert.ok(
        here.some((f) => f.keyframes === k && !f.layered),
        `${p.file}'s @keyframes ${k} now has a layer of its own wherever ${p.selectors.join(', ')} runs it: take it out of PAINTED`,
      );
    }
    for (const s of p.selectors) assert.ok(here.some((f) => f.selector === s && !f.layered), `PAINTED names ${s} in ${p.file}, which runs none of ${p.keyframes.join(', ')} with no layer of its own: take it out`);
  }
  for (const p of PAINTED.filter(isCall)) {
    const here = played.filter((c) => lets(p, c));
    for (const name of p.animate.in) assert.ok(here.some((c) => c.in === name), `PAINTED names an animate() in ${p.file}'s ${name}, which animates none of ${p.animate.props.join(', ')} there now: take it out`);
    for (const x of p.animate.props) assert.ok(here.some((c) => (c.props ?? ['?']).includes(x)), `PAINTED names ${x} for an animate() in ${p.file}'s ${p.animate.in.join(', ')}, which none of them animates now: take it out`);
  }
});
