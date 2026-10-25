import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { transform } from 'lightningcss';

// Lightning CSS, which minifies the build, folds a scale, rotate or translate
// written plainly beside a transform (in one rule, or in rules of the same
// selector) into that transform, and where it can't, drops it: the dev server
// keeps it, the live site doesn't. (The category cards' shrink went so, and
// the live cards came out twice their size; upstream, lightningcss#426.)
// Each stylesheet is minified here as the build does and must keep every one.
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
const count = (css: string) => {
  const n: Record<string, number> = { scale: 0, rotate: 0, translate: 0 };
  postcss.parse(css).walkDecls(INDIVIDUAL, (d) => void n[d.prop]++);
  return n;
};

test('every scale, rotate and translate survives the build', () => {
  let checked = 0;
  for (const [path, css] of styles()) {
    const before = count(css);
    if (!before.scale && !before.rotate && !before.translate) continue;
    // (Svelte's :global() written out, as the build has it.)
    const plain = css.replace(/:global\(((?:[^()]|\([^()]*\))*)\)/g, '$1');
    const after = count(transform({ filename: path, code: Buffer.from(plain), minify: true, errorRecovery: true }).code.toString());
    for (const prop of ['scale', 'rotate', 'translate']) {
      checked += before[prop];
      assert.ok(
        after[prop] >= before[prop],
        `${path}: ${before[prop] - after[prop]} ${prop} dropped by the minifier. Beside a transform, move it to a rule of its own (another selector) or write it through var()`,
      );
    }
  }
  assert.ok(checked > 100, 'found the scale, rotate and translate declarations');
});
