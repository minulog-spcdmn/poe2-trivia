import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// App writes --header-h and --legal-h only while a component that reads
// them shows (lib/shellHeights.svelte.ts): one that reads them without
// saying so would get a stale value.
test('every component reading the shell heights says so', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.svelte')) files.push(p);
    }
  };
  walk('src');
  const silent = files.filter((f) => {
    const s = readFileSync(f, 'utf8');
    return /var\(--(header|legal)-h\b/.test(s) && !s.includes('readsShellHeights()');
  });
  assert.deepEqual(silent, []);
});
