// The text players read, found in the source: what .svelte markup shows (its
// text, the attributes shown or read out (title, aria-label, alt,
// placeholder) and the text handed to components as props), the strings and template text of scripts, and the text of the
// live pages (index.html and the legal pages). The dev pages (the QA desk, the
// lab, the bot, the tools, the stats page) are left out, and so are console,
// Error and frame-trace messages, script strings that run over several
// source lines (shaders), and item names, which stay as the data has them.
// style.test.ts reads it for the quote marks.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { parse } from 'svelte/compiler';

const root = join(import.meta.dirname, '..');

/** Folders of src/ that no player sees. */
const DEV = new Set(['qa', 'lab', 'bot', 'devHub', 'backdropTool', 'cardBench', 'hoverPage', 'levelsPage', 'spatialPage', 'zonebanner', 'statsPage', 'shaders', 'assets', 'data']);
/** Generated from the item data (CLAUDE.md), names and all. */
const GENERATED = new Set(['src/lib/lookalikes.ts']);
const PAGES = ['index.html', 'impressum.html', 'datenschutz.html'];
const SHOWN_ATTRS = new Set(['title', 'aria-label', 'alt', 'placeholder']);

/** A stretch of player text, as the source has it (escapes and all). */
export interface Piece {
  file: string;
  /** Where it starts and ends in the file. */
  start: number;
  end: number;
  /** An expression comes right before it (`${name}'s`, `{name}'s`), so its first character follows a word. */
  afterExpr: boolean;
  /** The whole string it belongs to, its expressions as ${…}, for marks that pair across them ("${name}"). */
  whole: string;
}

/** Every item's name and every made-up one: data, not text, matched as it is spelled. */
function itemNames(): Set<string> {
  const names = new Set<string>();
  for (const it of JSON.parse(readFileSync(join(root, 'src/data/items.json'), 'utf8')) as { name: string }[]) names.add(it.name);
  for (const [real, fakes] of Object.entries(JSON.parse(readFileSync(join(root, 'src/data/fakes.json'), 'utf8')) as Record<string, string[]>)) {
    names.add(real);
    for (const f of fakes) names.add(f);
  }
  return names;
}

function* sources(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!DEV.has(e.name)) yield* sources(p);
    } else if (/\.(svelte|ts)$/.test(e.name) && !e.name.endsWith('.d.ts')) yield p;
  }
}

/** The string and template text in a script, `offset` into the file it sits in. */
function scriptPieces(file: string, code: string, offset: number, names: Set<string>, out: Piece[]) {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const devOnly = (n: ts.Node) => {
    for (let p: ts.Node | undefined = n.parent, i = 0; p && i < 4; p = p.parent, i++) {
      // (Not ActionError, thrown or not: players read its message.)
      if (ts.isNewExpression(p) && /^(?:Type|Range|Syntax)?Error$/.test(p.expression.getText(sf))) return true;
      if (ts.isCallExpression(p) && /^(console\.\w+|frameEvent)$/.test(p.expression.getText(sf))) return true;
    }
    return false;
  };
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isLiteralTypeNode(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (!devOnly(n) && !names.has(n.text) && !n.getText(sf).includes('\n')) out.push({ file, start: offset + n.getStart(sf) + 1, end: offset + n.end - 1, afterExpr: false, whole: n.text });
      return;
    }
    if (ts.isTemplateExpression(n)) {
      const whole = n.head.text + n.templateSpans.map((s) => '${…}' + s.literal.text).join('');
      if (!devOnly(n) && !n.getText(sf).includes('\n')) {
        out.push({ file, start: offset + n.head.getStart(sf) + 1, end: offset + n.head.end - 2, afterExpr: false, whole });
        for (const s of n.templateSpans) {
          const tail = ts.isTemplateTail(s.literal);
          out.push({ file, start: offset + s.literal.getStart(sf) + 1, end: offset + s.literal.end - (tail ? 1 : 2), afterExpr: true, whole });
        }
      }
      for (const s of n.templateSpans) visit(s.expression);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

type Node = { type?: string; start?: number; end?: number; [k: string]: unknown };

/** Where the markup AST holds JavaScript: tags', blocks' and directives' expressions, {#if} tests, {@const}, snippet parameters, {#each} keys and patterns. */
const JS_KEYS = new Set(['expression', 'test', 'declaration', 'parameters', 'key', 'context']);

function sveltePieces(file: string, src: string, names: Set<string>, out: Piece[]) {
  const ast = parse(src, { modern: true }) as unknown as { instance?: Node; module?: Node; fragment: Node };
  for (const s of [ast.instance, ast.module]) {
    const c = s?.content as Node | undefined;
    if (c) scriptPieces(file, src.slice(c.start, c.end), c.start!, names, out);
  }
  const expr = (e: Node | undefined) => {
    if (e?.start == null) return;
    // Wrapped in parentheses so an object literal reads as one; {@const}'s declaration reads as it is.
    if (e.type === 'VariableDeclaration') scriptPieces(file, src.slice(e.start, e.end), e.start, names, out);
    else scriptPieces(file, `(${src.slice(e.start, e.end)})`, e.start - 1, names, out);
  };
  // A component's props are all read as text: whatever it shows of them, players read.
  const props = new Set<Node>();
  // Each text's run of text and {expressions} side by side, as one string, so quotes pair across them ("{name}").
  const runs = new Map<Node, string>();
  // Texts that follow an {expression} (not a block's {/if} or {:else}).
  const afterTag = new Set<Node>();
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const node = n as Node;
    if (node.type === 'Text') {
      out.push({ file, start: node.start!, end: node.end!, afterExpr: afterTag.has(node), whole: runs.get(node) ?? src.slice(node.start, node.end) });
      return;
    }
    if (node.type === 'Fragment') {
      let run: Node[] = [];
      const flush = () => {
        const whole = run.map((t) => (t.type === 'Text' ? src.slice(t.start, t.end) : '${…}')).join('');
        for (const t of run) runs.set(t, whole);
        run = [];
      };
      for (const c of node.nodes as Node[]) {
        if (c.type === 'Text' && run.at(-1)?.type === 'ExpressionTag') afterTag.add(c);
        if (c.type === 'Text' || c.type === 'ExpressionTag') run.push(c);
        else flush();
      }
      flush();
    }
    if (node.type === 'Comment') return;
    if (node.type === 'Component') for (const a of node.attributes as Node[]) props.add(a);
    if (node.type === 'Attribute') {
      const shown = SHOWN_ATTRS.has(node.name as string) || props.has(node);
      for (const v of Array.isArray(node.value) ? node.value : [node.value]) {
        const part = v as Node | true;
        if (part === true || !part) continue;
        if (part.type === 'Text') {
          if (shown) out.push({ file, start: part.start!, end: part.end!, afterExpr: src[part.start! - 1] === '}', whole: src.slice(part.start, part.end) });
        } else expr(part.expression as Node);
      }
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'metadata' || !v || typeof v !== 'object') continue;
      if (JS_KEYS.has(k)) for (const e of Array.isArray(v) ? v : [v]) expr(e as Node);
      else walk(v);
    }
  };
  walk(ast.fragment);
}

/** A live page's text: what sits between its tags, and the attributes shown (meta descriptions included). */
function pagePieces(file: string, src: string, out: Piece[]) {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  const body = src.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, blank);
  for (const m of body.matchAll(/>([^<]+)</g)) out.push({ file, start: m.index + 1, end: m.index + 1 + m[1].length, afterExpr: false, whole: m[1] });
  for (const m of body.matchAll(/\s(?:title|alt|aria-label|content)="([^"]*)"/g)) {
    const at = m.index + m[0].indexOf('"') + 1;
    out.push({ file, start: at, end: at + m[1].length, afterExpr: false, whole: m[1] });
  }
}

/** Every piece of player text, file by file, with each file's source. */
export function playerText(): { file: string; src: string; pieces: Piece[] }[] {
  const names = itemNames();
  const files: { file: string; src: string; pieces: Piece[] }[] = [];
  const add = (abs: string, f: (file: string, src: string, out: Piece[]) => void) => {
    const file = relative(root, abs).replaceAll('\\', '/');
    if (GENERATED.has(file)) return;
    const src = readFileSync(abs, 'utf8');
    const pieces: Piece[] = [];
    f(file, src, pieces);
    // A piece can be reached twice (an attribute's expression); keep one.
    const seen = new Set<number>();
    files.push({ file, src, pieces: pieces.filter((p) => p.end > p.start && !seen.has(p.start) && seen.add(p.start)) });
  };
  for (const abs of sources(join(root, 'src'))) {
    add(abs, (file, src, out) => (abs.endsWith('.svelte') ? sveltePieces(file, src, names, out) : scriptPieces(file, src, 0, names, out)));
  }
  for (const page of PAGES) add(join(root, page), pagePieces);
  return files;
}

/** Entities a straight mark can hide behind in markup and the pages. */
const unentity = (text: string) => text.replace(/&#0*39;|&apos;/g, "'").replace(/&#0*34;|&quot;/g, '"');

/** Whether a piece has a straight apostrophe in a word (it's, Today's, {name}'s) or after a plural (players'), escaped or not. */
export function straightApostrophe(raw: string, afterExpr: boolean): boolean {
  const text = unentity(raw);
  // A plural's apostrophe, once single-quoted names (CSS's 'Fontin SmallCaps') are taken out.
  const plural = /(?<=\p{L}s)\\?'(?=[\s.,;:!?)]|$)/u.test(text.replace(/(?<=^|[\s(,:])\\?'[^']*'/g, ''));
  return plural || /(?<=[\p{L}\p{N}])\\?'(?=\p{L})/u.test(text) || (afterExpr && /^\\?'(?=\p{L})/u.test(text));
}

/**
 * Whether a whole string quotes words with straight double quotes ("Open
 * rooms", "${name}"). CSS and markup keep theirs (url("…"), 1rem "Fontin",
 * "EB Garamond", serif, d="…").
 */
export function straightQuotes(whole: string): boolean {
  const text = unentity(whole).replaceAll('${…}', 'X');
  if (/[<>]|\b(?:sans-serif|serif|monospace|cursive)\b/.test(text)) return false;
  for (const m of text.matchAll(/(?<=^|[\s(])"[^"]*[\p{L}\p{N}][^"]*"(?=$|[\s.,;:!?)])/gu)) {
    if (!/(?:url\(|\d(?:rem|px|em) )$/.test(text.slice(0, m.index))) return true;
  }
  return false;
}
