import { dirname, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { WhereTable } from './src/lib/errorWhere.ts';

/**
 * Where each stretch of a built script came from, for the count of the
 * game's script errors (src/lib/errorWhere.ts, count.ts countScriptErrors):
 * beside each script `<script>.where.json`, a table of the source module and
 * the named function ("lib/codex.ts:loadCodex") each stretch of the minified
 * script was built from, which the page fetches only once an error has
 * happened. Made from the build's source maps, which it asks for hidden and
 * drops again: the game ships no source maps, only these.
 */
export function whereMaps(): Plugin {
  let root = process.cwd();
  return {
    name: 'where-maps',
    apply: 'build',
    enforce: 'post',
    // (The build's own setting, not the output's: Vite carries its last changes to a script, the list of what it preloads put on top, into the map only then.)
    config: () => ({ build: { sourcemap: 'hidden' } }),
    configResolved(config) {
      root = config.root;
    },
    generateBundle: {
      order: 'post',
      async handler(options, bundle) {
        const ts = (await import('typescript')).default;
        const dir = options.dir ?? root;
        // Each of the game's sources' functions, found once however many scripts it's in.
        const sources = new Map<string, { names: string[]; byOffset: Int32Array; starts: number[] }>();
        for (const file of Object.values(bundle)) {
          if (file.type !== 'chunk' || !file.map) continue;
          const map = file.map;
          const at = dirname(resolve(dir, file.fileName));
          // (A worker's script is built with no folder of its own, its sources named from one a step below the root's.)
          const modules = map.sources.map((s) => moduleOf(relative(root, resolve(at, s)).replaceAll('\\', '/')) ?? moduleOf(s.replaceAll('\\', '/').replace(/^(\.\.\/)+/, '')));
          const fns = modules.map((m, i) => {
            if (!m || m.startsWith('node_modules/')) return null;
            if (!sources.has(m)) {
              const text = map.sourcesContent?.[i] ?? '';
              sources.set(m, { ...namedFunctions(ts, text, m), starts: lineStarts(text) });
            }
            return sources.get(m)!;
          });
          const table = whereTable(map.mappings, (source, line, col) => {
            const m = modules[source];
            const f = fns[source];
            if (!m || !f) return m ?? null;
            const offset = (f.starts[line] ?? Infinity) + col;
            const n = offset < f.byOffset.length ? f.byOffset[offset] : -1;
            return n >= 0 ? `${m}:${f.names[n]}` : m;
          });
          // A map that missed a line put on top of its script (the preload list) would label every place a line off.
          if (file.code.startsWith('const __vite__mapDeps=') && table.lines[0]?.some((v, i) => i % 2 === 1 && v >= 0))
            throw new Error(`where-maps: ${file.fileName}'s source map misses the preload list on its first line, so its errors would be placed wrongly.`);
          this.emitFile({ type: 'asset', fileName: `${file.fileName}.where.json`, source: JSON.stringify(table) });
        }
        // The maps themselves stay out of the build (the workers' too).
        for (const [name, file] of Object.entries(bundle)) if (file.type === 'asset' && name.endsWith('.map')) delete bundle[name];
      },
    },
  };
}

/** A source's label, from its path from the root: its path in src/, a package's name, or nothing (the bundler's own). */
export function moduleOf(path: string): string | null {
  const inPackages = path.lastIndexOf('node_modules/');
  if (inPackages >= 0) {
    const pkg = /^((?:@[\w.-]+\/)?[\w.-]+)\//.exec(path.slice(inPackages + 'node_modules/'.length));
    return pkg ? `node_modules/${pkg[1]}` : null;
  }
  const m = /^src\/([\w./-]+)$/.exec(path);
  return m ? m[1] : null;
}

/** Where each line of a text starts, as offsets. */
function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) out.push(i + 1);
  return out;
}

type Ts = typeof import('typescript');

/**
 * A source's named functions: for each offset of it, the innermost one it's
 * in (an index into `names`, -1 at the top level). A function's name is its
 * own, its variable's or its property's, a class's method as Class.method;
 * a callback with none counts as part of the function around it. A Svelte
 * component's are those of its scripts; its markup is in none.
 */
export function namedFunctions(ts: Ts, text: string, file: string): { names: string[]; byOffset: Int32Array } {
  const names: string[] = [];
  const ranges: { start: number; end: number; n: number }[] = [];
  const blocks = file.endsWith('.svelte')
    ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => ({ code: m[1], from: m.index! + m[0].indexOf('>') + 1 }))
    : [{ code: text, from: 0 }];
  const ident = (n: import('typescript').Node | undefined) =>
    n && (ts.isIdentifier(n) || ts.isPrivateIdentifier(n) || ts.isStringLiteral(n)) ? n.text.replace(/^#/, '') : null;
  for (const { code, from } of blocks) {
    const src = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: import('typescript').Node, cls: string | null) => {
      let name: string | null = null;
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        name = ts.isArrowFunction(node) ? null : ident(node.name);
        const p = node.parent;
        if (!name && p && ts.isVariableDeclaration(p)) name = ident(p.name);
        if (!name && p && (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p))) name = ident(p.name) && (ts.isPropertyDeclaration(p) && cls ? `${cls}.${ident(p.name)}` : ident(p.name));
      } else if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
        const own = ident(node.name);
        name = own && (cls && ts.isClassLike(node.parent) ? `${cls}.${own}` : own);
      } else if (ts.isConstructorDeclaration(node) && cls) name = `${cls}.constructor`;
      if (name && /^[\w$.]{1,40}$/.test(name)) {
        names.push(name);
        ranges.push({ start: from + node.getStart(src), end: from + node.getEnd(), n: names.length - 1 });
      }
      const inClass = ts.isClassLike(node) ? (ident(node.name) ?? null) : cls;
      ts.forEachChild(node, (c) => visit(c, inClass));
    };
    visit(src, null);
  }
  const byOffset = new Int32Array(text.length).fill(-1);
  // Outer ones first, so the ones inside them, written after, win.
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  for (const r of ranges) byOffset.fill(r.n, r.start, r.end);
  return { names, byOffset };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * A script's table (WhereTable) from its source map's mappings: each
 * generated segment's label (`label`, by its source and original line and
 * column, all 0-based), a run of the same label kept as one.
 */
export function whereTable(mappings: string, label: (source: number, line: number, col: number) => string | null): WhereTable {
  const labels: string[] = [];
  const index = new Map<string, number>();
  const lines: number[][] = [];
  let source = 0;
  let line = 0;
  let col = 0;
  for (const text of mappings.split(';')) {
    const row: number[] = [];
    let genCol = 0;
    let lastStart = 0;
    let last: number | undefined;
    for (const seg of text.split(',')) {
      if (!seg) continue;
      const v = vlq(seg);
      genCol += v[0];
      let n = -1;
      if (v.length >= 4) {
        source += v[1];
        line += v[2];
        col += v[3];
        const l = label(source, line, col);
        if (l !== null) {
          if (!index.has(l)) {
            index.set(l, labels.length);
            labels.push(l);
          }
          n = index.get(l)!;
        }
      }
      if (n === last) continue;
      row.push(genCol - lastStart, n);
      lastStart = genCol;
      last = n;
    }
    lines.push(row);
  }
  return { labels, lines };
}

/** A segment's fields, from its base64 VLQ. */
function vlq(seg: string): number[] {
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  for (const ch of seg) {
    const d = B64.indexOf(ch);
    value += (d & 31) << shift;
    if (d & 32) shift += 5;
    else {
      out.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return out;
}
