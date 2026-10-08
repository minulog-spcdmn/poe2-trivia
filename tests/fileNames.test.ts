import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// On a case-insensitive file system (macOS, Windows) an import of
// './tool.svelte' finds Tool.svelte as readily as tool.svelte.ts, so two
// modules in one folder must never differ only by case once the extension
// is gone.
test('no two modules in a folder differ only by case', () => {
  const walk = (dir: string) => {
    const seen = new Map<string, string>();
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      const key = name.replace(/\.(svelte\.ts|svelte|ts|js|json)$/, '').toLowerCase();
      const other = seen.get(key);
      assert.ok(!other, `${join(dir, other ?? '')} and ${path} differ only by case`);
      seen.set(key, name);
    }
  };
  walk('src');
});
