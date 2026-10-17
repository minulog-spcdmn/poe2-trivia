import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

// The dev hub (dev.html) links every tool page, so a new one can't be
// forgotten there: every page at the root but the game, the legal pages and
// the hub itself.
const root = () => readdirSync('.');
// Every page the hub links, however it's written (./x.html, x.html, with a query).
const linked = () => new Set([...readFileSync('dev.html', 'utf8').matchAll(/href="(?:\.\/)?([^"?#/]+\.html)/g)].map((m) => m[1]));

test('the dev hub is there', () => {
  assert.ok(existsSync('dev.html'), 'dev.html is missing');
});

test('the dev hub links every tool page', () => {
  const skip = new Set(['index.html', 'impressum.html', 'datenschutz.html', 'dev.html']);
  const pages = root().filter((f) => f.endsWith('.html') && !skip.has(f));
  const links = linked();
  assert.ok(pages.length > 0);
  for (const page of pages) assert.ok(links.has(page), `dev.html has no link to ${page}`);
});

test('the dev hub links nothing that is gone', () => {
  const files = root();
  for (const page of linked()) assert.ok(files.includes(page), `dev.html links ${page}, which isn't there`);
});
