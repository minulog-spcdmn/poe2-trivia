import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSync } from 'vite';
import { GLSL_FILES, minifyGlsl } from '../glslMinify.ts';

// The build's glsl-minify plugin (glslMinify.ts) strips comments and
// indentation from the shaders. Checked here, independently of how it does
// that: every GLSL literal comes out as the same GLSL tokens, preprocessor
// lines whole and on lines of their own, and none is left out.

const root = join(import.meta.dirname, '..');
const FILES = ['src/lib/backdrop.ts', 'src/lib/shaders/effects.ts', 'src/lib/shaders/newEffects.ts', 'src/lib/fx/renderer.ts', 'src/lib/fx/gl.ts'];
const HINT = /\b(vec[234]|uniform|void main)\b/;

type Node = { type?: string; start: number; end: number; [k: string]: unknown };

/** Each GLSL template literal's text, its interpolations as \u0001source\u0002. */
function literals(code: string, id: string): string[] {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const node = n as Node;
    if (node.type === 'TemplateLiteral') {
      const quasis = node.quasis as { value: { raw: string } }[];
      const exprs = node.expressions as Node[];
      const text = quasis.map((q, i) => q.value.raw + (exprs[i] ? `\u0001${code.slice(exprs[i].start, exprs[i].end)}\u0002` : '')).join('');
      if (HINT.test(text)) out.push(text);
    }
    for (const k in node) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object') visit(v);
    }
  };
  visit(parseSync(id, code).program);
  return out;
}

/** GLSL tokens; whitespace counts only between two words (where it keeps them apart). */
function tokens(text: string): string[] {
  const noComments = text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
  const raw: string[] = [];
  for (const line of noComments.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) {
      raw.push('\n', t.replace(/\s+/g, ' '), '\n');
      continue;
    }
    for (const m of t.matchAll(/\u0001[^\u0002]*\u0002|[A-Za-z0-9_.]+|<<=|>>=|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\^\^|[+\-*/%&^|]=|\s+|./g)) {
      raw.push(/^\s+$/.test(m[0]) ? ' ' : m[0]);
    }
    raw.push(' ');
  }
  const word = (s: string | undefined) => !!s && /^[\u0001A-Za-z0-9_.]/.test(s);
  return raw.filter((s, i) => s !== ' ' || (word(raw[i - 1]) && word(raw[i + 1])));
}

for (const file of FILES) {
  test(`glsl-minify keeps every GLSL token in ${file}`, () => {
    const id = join(root, file);
    assert.match(id.replaceAll('\\', '/'), GLSL_FILES);
    const code = readFileSync(id, 'utf8');
    const out = minifyGlsl(code, id);
    const before = literals(code, id);
    const after = literals(out.code, id);
    assert.ok(before.length > 0);
    assert.equal(out.kept, 0, 'a GLSL literal was left as written (backslash, or ends in a comment?)');
    assert.equal(out.minified, before.length);
    assert.equal(after.length, before.length);
    before.forEach((b, i) => {
      const a = after[i];
      assert.doesNotMatch(a, /\/\/|\/\*/, `literal ${i} still has a comment`);
      assert.ok(a.length <= b.length, `literal ${i} grew`);
      if (b.startsWith('#version')) assert.ok(a.startsWith('#version'), `literal ${i} lost #version at its start`);
      assert.deepEqual(tokens(a), tokens(b), `literal ${i} changed`);
    });
    // Outside the literals the code is as it was.
    const mask = (s: string) => s.replace(/`[^`]*`/g, '``');
    assert.equal(mask(out.code), mask(code));
  });
}
