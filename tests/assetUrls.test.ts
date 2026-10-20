// Pictures named in a CSS custom property go as whole URLs (absoluteUrl,
// src/lib/ui-paths.ts): a url() there is read where the var() is used, and in
// the build that's a stylesheet in assets/, so a relative one points there.
// The dev server inlines its styles, so only the live site would show it.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test("a sigil's picture is a whole URL from the page", async () => {
  const g = globalThis as { document?: unknown };
  g.document = { baseURI: 'https://poe2.quest/qa.html?s=settings/page' };
  try {
    const { sigilUrl } = await import('../src/lib/classSigils.ts');
    assert.equal(sigilUrl('witch'), 'https://poe2.quest/classes/witch.webp');
  } finally {
    delete g.document;
  }
});
