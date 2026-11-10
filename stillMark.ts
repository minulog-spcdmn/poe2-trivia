/**
 * The still mode in CSS (src/lib/still.ts): every rule written in
 * `@media (prefers-reduced-motion: reduce)` is moved under the page's own
 * mark, `html[data-still]`, and the @media is gone. So the game no longer
 * holds still for a system that asks for reduced motion (no player sees it
 * so, whatever their system says), and the checks, which set the mark, get
 * what they always got. The CSS stays written the way everyone writes it.
 *
 * The mark adds nothing to a selector's weight (`:where()`), so a rule wins
 * and loses exactly as it did inside its @media. A selector that starts at
 * the root (`html[data-saver] .x`, `:root`) takes the mark on that root, and
 * one that starts with `*` still means the root too. Joined to other
 * conditions with `and`, those stay as the rule's @media.
 *
 * What it can't say as a mark stops the build, with where it is, since said
 * wrongly it would hold for every player, or for none: a list of queries,
 * `not`, `or`, `no-preference`; the @media inside a rule (CSS nesting), whose
 * declarations would become the rule's own; an at-rule inside it that is no
 * condition (@keyframes, @font-face), which would be lifted out for all; a
 * selector that reaches the root from past its start.
 */
import type { AtRule, Node } from 'postcss';

const QUERY = /prefers-reduced-motion/i;
const REDUCE = /^\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)$/i;
const MARK = 'html[data-still]';
const AT_ROOT = /^(html|:root)(?![\w-])/;
/** A selector that starts with every element: the root is one of them. */
const EVERY = /^\*(?![\w|-])/;
/** The root reached from past a selector's start (attribute tests taken out first: a value may spell `html`). */
const ROOT_WITHIN = /(?<![\w.#-])(?:html|:root)(?![\w-])|::view-transition|&/;
/** The at-rules that only say when or where: a rule inside one is still the block's own. */
const CONDITIONS = new Set(['media', 'supports', 'container', 'layer', 'scope', 'starting-style']);
const WHY = 'it can’t be turned into the still mode’s mark (stillMark.ts)';

/** A selector, under the mark. */
export const marked = (selector: string) => {
  const s = selector.trim();
  // (A block inside another: its rules are marked already.)
  if (s.includes('[data-still]')) return s;
  const root = AT_ROOT.exec(s)?.[0];
  const rest = root ? s.slice(root.length) : s;
  if (ROOT_WITHIN.test(rest.replace(/\[[^\]]*\]/g, ''))) throw new Error(`"${s}" reaches the root from past its start: ${WHY}`);
  if (root) return `${root}:where([data-still])${rest}`;
  if (EVERY.test(s)) return `:where(${MARK}, ${MARK} *)${s.slice(1)}`;
  return `:where(${MARK}) ${s}`;
};

export const stillMark = {
  postcssPlugin: 'still-mark',
  AtRule: {
    media(at: AtRule) {
      if (!QUERY.test(at.params)) return;
      // (A visitor is handed a proxy, and a node's parent is the node itself: the two never compare equal.)
      const block = (at as AtRule & { proxyOf?: AtRule }).proxyOf ?? at;
      const parts = at.params.split(/\s+and\s+/i).map((p) => p.trim());
      const rest = parts.filter((p) => !REDUCE.test(p));
      if (rest.length !== parts.length - 1 || rest.some((p) => /prefers-reduced-motion|,|\bnot\b|\bor\b/i.test(p)))
        throw at.error(`@media ${at.params}: only "(prefers-reduced-motion: reduce)", alone or joined by "and", can be said so: ${WHY}`);
      for (let p: Node | undefined = block.parent; p; p = p.parent)
        if (p.type === 'rule') throw at.error(`@media ${at.params} inside a rule: write it at the sheet’s top level, the rule inside it; as it is, ${WHY}`);
      /** Whether `node` stands in one of the block's rules. */
      const inRule = (node: Node) => {
        for (let p = node.parent; p && p !== block; p = p.parent) if (p.type === 'rule') return true;
        return false;
      };
      at.walk((node) => {
        // (Whatever stands in one of its rules follows that rule.)
        if (inRule(node)) return;
        if (node.type === 'decl') throw node.error(`a declaration straight in @media ${at.params}, in no rule: ${WHY}`);
        if (node.type === 'atrule' && !CONDITIONS.has(node.name.toLowerCase())) throw node.error(`@${node.name} in @media ${at.params} would be lifted out, for every player: write it outside; ${WHY}`);
        if (node.type !== 'rule') return;
        try {
          node.selectors = node.selectors.map(marked);
        } catch (e) {
          throw node.error((e as Error).message);
        }
      });
      if (rest.length) at.params = rest.join(' and ');
      else at.replaceWith(at.nodes ?? []);
    },
  },
};
