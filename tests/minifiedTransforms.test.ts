import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Declaration, type Rule } from 'postcss';
import { transform } from 'lightningcss';

// Lightning CSS, which minifies the build, folds a scale, rotate or translate
// written plainly beside a transform in one rule into that transform, and
// where it can't, drops it: the dev server keeps it, the live site doesn't.
// (The category cards' shrink went so, and the live cards came out twice
// their size.) Through var() it is left alone. Each rule that sets one beside
// a transform is minified here and must keep it.
const INDIVIDUAL = /^(scale|rotate|translate)$/;

const styles = (): [string, string][] => {
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.css')) out.push([path, readFileSync(path, 'utf8')]);
      else if (name.endsWith('.svelte')) {
        const src = readFileSync(path, 'utf8');
        const at = src.indexOf('<style');
        if (at >= 0) out.push([path, src.slice(src.indexOf('>', at) + 1, src.lastIndexOf('</style>'))]);
      }
    }
  };
  walk('src');
  return out;
};

test('a scale, rotate or translate beside a transform survives the build', () => {
  let checked = 0;
  for (const [path, css] of styles()) {
    postcss.parse(css).walkRules((r: Rule) => {
      const own = r.nodes.filter((n): n is Declaration => n.type === 'decl');
      if (!own.some((d) => d.prop === 'transform')) return;
      for (const d of own.filter((d) => INDIVIDUAL.test(d.prop))) {
        checked++;
        const body = own.map((o) => `${o.prop}:${o.value}`).join(';');
        const out = transform({ filename: 'rule.css', code: Buffer.from(`.x{${body}}`), minify: true }).code.toString();
        assert.match(out, new RegExp(`[{;]${d.prop}:`), `${path}, ${r.selector}: its ${d.prop} is dropped by the minifier; write it through var()`);
      }
    });
  }
  assert.ok(checked >= 3, 'found the rules that set one beside a transform');
});
