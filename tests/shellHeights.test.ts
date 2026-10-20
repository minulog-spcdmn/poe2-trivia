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
      else if (/\.(svelte|css|ts|js)$/.test(f)) files.push(p);
    }
  };
  walk('src');
  const reads = (f: string) => /var\(--(header|legal)-h\b|getPropertyValue\(['"]--(header|legal)-h/.test(readFileSync(f, 'utf8'));
  const silent = files.filter((f) => f.endsWith('.svelte') && reads(f) && !readFileSync(f, 'utf8').includes('readsShellHeights()'));
  assert.deepEqual(silent, []);
  // A stylesheet or a module can't say so: they're read only in a component.
  assert.deepEqual(
    files.filter((f) => !f.endsWith('.svelte') && reads(f)),
    [],
  );
});
