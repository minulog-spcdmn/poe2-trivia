// An $effect.pre at the top of a component's script runs as the component is
// made, there and then, before the rest of the script has run (only $effect
// waits for the mount). So a `let` or `const` declared below it isn't there
// yet when it reads it: "Cannot access 'open' before initialization", and the
// component never shows. The Codex didn't open at all for that once, and
// nothing caught it: svelte-check doesn't, and no test mounts the Codex.
//
// So this reads every component's script: what each top-level $effect.pre
// reads has to be declared above it, and so does what the functions it calls
// and the deriveds it reads read in turn. A function inside it counts as run
// (untrack's, a find's), though one handed to a timer would run later: such a
// one is easier moved below what it reads than told apart.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { parse } from 'svelte/compiler';

const root = join(import.meta.dirname, '..');

function* components(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* components(p);
    else if (e.name.endsWith('.svelte')) yield p;
  }
}

/** A component: its name, its source, and its instance script with where that starts in the source. */
type Script = { file: string; src: string; code: string; offset: number };

function scriptOf(file: string, src: string): Script | null {
  const ast = parse(src, { modern: true }) as unknown as { instance?: { content: { start: number; end: number } } };
  const c = ast.instance?.content;
  return c ? { file, src, code: src.slice(c.start, c.end), offset: c.start } : null;
}

/** `$effect.pre(...)`, `$derived(...)` and the like: the rune a call is, if it's one. */
function rune(n: ts.Node): string | null {
  if (!ts.isCallExpression(n)) return null;
  const e = n.expression;
  if (ts.isIdentifier(e) && e.text.startsWith('$')) return e.text;
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text.startsWith('$')) return `${e.expression.text}.${e.name.text}`;
  return null;
}

/**
 * Every read a top-level $effect.pre makes, as its component is made, of a
 * top-level binding declared below it: one line each, `file:line` first.
 */
function earlyReads(scripts: Script[]): string[] {
  // One program over them all, each a module of its own, for its names'
  // bindings alone: no lib, and no imports followed (what's imported is
  // there before the script runs).
  const named = new Map(scripts.map((s, i) => [`/s${i}.ts`, s]));
  const files = new Map([...named].map(([name, s]) => [name, ts.createSourceFile(name, `${s.code}\nexport {};\n`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)]));
  const host: ts.CompilerHost = {
    getSourceFile: (name) => files.get(name),
    getDefaultLibFileName: () => '/lib.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (f) => files.has(f),
    readFile: () => undefined,
  };
  const program = ts.createProgram([...files.keys()], { noLib: true, noResolve: true, types: [], target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext }, host);
  const checker = program.getTypeChecker();
  const found: string[] = [];
  for (const [name, sf] of files) {
    const { file, src, offset } = named.get(name)!;
    const line = (pos: number) => src.slice(0, offset + pos).split('\n').length;
    /** The top-level statement a declaration is made in, if it's made at the top. */
    const topOf = (d: ts.Node): ts.Statement | null => {
      let n: ts.Node = d;
      while (ts.isBindingElement(n) || ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) n = n.parent;
      if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) return n.parent === sf ? n : null;
      if (!ts.isVariableDeclaration(n)) return null;
      const statement = n.parent.parent;
      return ts.isVariableStatement(statement) && statement.parent === sf ? statement : null;
    };
    for (const statement of sf.statements) {
      if (!ts.isExpressionStatement(statement) || rune(statement.expression) !== '$effect.pre') continue;
      const at = statement.getStart(sf);
      const seen = new Set<ts.Node>();
      const visit = (n: ts.Node): void => {
        // (Types aren't read.)
        if (ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return;
        if (ts.isIdentifier(n)) {
          const symbol = ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n ? checker.getShorthandAssignmentValueSymbol(n.parent) : checker.getSymbolAtLocation(n);
          const decl = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
          const top = decl && decl.getSourceFile() === sf ? topOf(decl) : null;
          if (decl && top && !seen.has(decl)) {
            seen.add(decl);
            if (ts.isFunctionDeclaration(top)) {
              // Hoisted, so there to call: what it reads is read now.
              if (top.body) visit(top.body);
            } else if (top.getStart(sf) > at) {
              found.push(`${file}:${line(n.getStart(sf))}: the $effect.pre at line ${line(at)} reads ${n.text}, declared below it at line ${line(top.getStart(sf))}`);
            } else if (ts.isVariableDeclaration(decl) && decl.initializer) {
              // Declared above it: a function it calls, or a derived it reads, reads what it reads now.
              const init = decl.initializer;
              if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) visit(init.body);
              else if (rune(init) === '$derived' || rune(init) === '$derived.by') (init as ts.CallExpression).arguments.forEach(visit);
            }
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(statement.expression);
    }
  }
  return found;
}

/** A made-up component's script, for the checks on the check. */
const sample = (code: string): Script => {
  const src = `<script lang="ts">\n${code}\n</script>\n`;
  return scriptOf('Sample.svelte', src)!;
};

test('an $effect.pre reading what is declared below it is found', () => {
  // The Codex's, as it was.
  const [read] = earlyReads([sample(`let shadeless = $state.raw(new Set());\n$effect.pre(() => {\n  if (open || confirmReset) shadeless = new Set();\n});\nlet open = $state(null);\nlet confirmReset = $state(false);`)]);
  assert.match(read ?? '', /^Sample\.svelte:4: the \$effect\.pre at line 3 reads open, declared below it at line 6$/);
  // Through a function it calls, a derived it reads, or a shorthand property.
  assert.equal(earlyReads([sample(`$effect.pre(() => go());\nfunction go() { return later; }\nconst later = 1;`)]).length, 1);
  assert.equal(earlyReads([sample(`const d = $derived(later + 1);\n$effect.pre(() => void d);\nlet later = $state(1);`)]).length, 1);
  assert.equal(earlyReads([sample(`$effect.pre(() => void untrack(() => ({ later })));\nconst later = 1;`)]).length, 1);
});

test('what an $effect.pre may read is let be', () => {
  for (const code of [
    // Declared above it.
    `let open = $state(null);\nlet shadeless = $state.raw(new Set());\n$effect.pre(() => {\n  if (open) shadeless = new Set();\n});`,
    // A plain $effect waits for the mount.
    `$effect(() => void later);\nlet later = $state(1);`,
    // Its own names, a property of the same name, a type, an import.
    `import { later as gone } from './x';\n$effect.pre(() => {\n  const later = gone;\n  const o: Later = { later: 1 };\n  void o.later;\n});\nlet later = 1;\ntype Later = { later: number };`,
  ])
    assert.deepEqual(earlyReads([sample(code)]), [], code);
});

test('no component’s $effect.pre reads what is declared below it', () => {
  const scripts: Script[] = [];
  for (const path of components(join(root, 'src'))) {
    const s = scriptOf(relative(root, path).replaceAll('\\', '/'), readFileSync(path, 'utf8'));
    if (s) scripts.push(s);
  }
  assert.ok(scripts.length > 100, `only ${scripts.length} components found`);
  assert.deepEqual(earlyReads(scripts), []);
});
