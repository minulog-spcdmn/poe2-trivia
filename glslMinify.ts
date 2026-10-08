import { parseSync, type Plugin } from 'vite';

/**
 * Shaders ship without their comments and indentation (build only; vite.config.ts).
 *
 * The GLSL lives in template literals in these files. Each one that reads as
 * GLSL keeps its line structure (so #version stays first and every
 * preprocessor line stays whole) and every token; only comments, whitespace
 * next to a line break and blank lines go. GLSL ES reads a comment as one
 * space and ignores that whitespace, so the GPU compiles the same programs.
 * In dev nothing changes, so compile errors keep their line numbers.
 *
 * A literal is left exactly as written if it holds a backslash (a JS escape,
 * or a GLSL line continuation), ends inside a comment (it may be spliced into
 * another literal, where the comment would run on), or has an interpolation
 * inside a comment that isn't a plain name or constant (dropping it must not
 * drop a side effect). tests/glslMinify.test.ts checks every shader file.
 */
export const GLSL_FILES = /\/src\/lib\/(shaders\/[^/]+|backdrop|fx\/renderer|fx\/gl)\.ts$/;
const GLSL_HINT = /\b(vec[234]|uniform|void main)\b/;

type Node = { type?: string; start: number; end: number; [k: string]: unknown };
type Quasi = Node & { value: { raw: string } };
type Template = Node & { quasis: Quasi[]; expressions: Node[] };
type Edit = [start: number, end: number, text: string];

/** What minifyGlsl did to one file's code. */
export type GlslMinified = { code: string; minified: number; kept: number };

/** The file's code with its GLSL template literals minified (the rest as it was). */
export function minifyGlsl(code: string, id: string): GlslMinified {
  const { program, errors } = parseSync(id, code);
  if (errors.length) return { code, minified: 0, kept: 0 };
  const edits: Edit[] = [];
  let minified = 0;
  let kept = 0;
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const node = n as Node;
    if (node.type === 'TemplateLiteral') {
      const t = node as Template;
      if (GLSL_HINT.test(t.quasis.map((q) => q.value.raw).join(''))) {
        const own = shrink(t, code);
        if (own) {
          edits.push(...own);
          minified++;
        } else kept++;
      }
    }
    for (const k in node) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object') visit(v);
    }
  };
  visit(program);
  edits.sort((a, b) => b[0] - a[0]);
  let out = code;
  for (const [s, e, r] of edits) out = out.slice(0, s) + r + out.slice(e);
  return { code: out, minified, kept };
}

/** Where a text part's raw text begins in the code (its span may or may not include the ` or } before it). */
function rawStart(q: Quasi, code: string): number {
  const raw = q.value.raw;
  if (code.startsWith(raw, q.start) && !'`}'.includes(code[q.start])) return q.start;
  return code.startsWith(raw, q.start + 1) ? q.start + 1 : -1;
}

/** The edits that minify one template literal, or null to leave it as it is. */
function shrink(t: Template, code: string): Edit[] | null {
  if (t.quasis.some((q) => q.value.raw.includes('\\'))) return null;
  const starts = t.quasis.map((q) => rawStart(q, code));
  if (starts.includes(-1)) return null;
  const edits: Edit[] = [];
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < t.quasis.length; i++) {
    const raw = t.quasis[i].value.raw;
    const at = starts[i];
    let o = '';
    for (let j = 0; j < raw.length; j++) {
      const c = raw[j];
      const d = raw[j + 1];
      if (inLine) {
        if (c === '\n') {
          inLine = false;
          o += '\n';
        }
        continue;
      }
      if (inBlock) {
        if (c === '*' && d === '/') {
          inBlock = false;
          j++;
          o += ' ';
        }
        continue;
      }
      if (c === '/' && d === '/') {
        inLine = true;
        j++;
        continue;
      }
      if (c === '/' && d === '*') {
        inBlock = true;
        j++;
        continue;
      }
      o += c;
    }
    // Within this text part only: never across an interpolation, so
    // `float ${x}` can't run two tokens together.
    o = o.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{2,}/g, '\n');
    edits.push([at, at + raw.length, o]);
    // An interpolation inside a comment goes with it.
    const e = t.expressions[i];
    if (e && (inLine || inBlock)) {
      if (e.type !== 'Identifier' && e.type !== 'Literal' && e.type !== 'MemberExpression') return null;
      const next = starts[i + 1];
      if (!code.startsWith('${', at + raw.length) || code[next - 1] !== '}') return null;
      edits.push([at + raw.length, next, '']);
    }
  }
  return inLine || inBlock ? null : edits;
}

export function glslMinify(): Plugin {
  return {
    name: 'glsl-minify',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!GLSL_FILES.test(id)) return;
      const out = minifyGlsl(code, id);
      if (!out.minified) return;
      // No source map: the build makes none.
      return { code: out.code, map: { mappings: '' } };
    },
  };
}
