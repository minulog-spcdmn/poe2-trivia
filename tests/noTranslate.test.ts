import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The game opts out of page translation (index.html says why): Chrome by its
// meta tag, the other browsers and translators by translate="no".
const page = () => readFileSync('index.html', 'utf8');

test('Chrome is told not to translate the game', () => {
  const head = page().split('</head>')[0];
  assert.match(head, /<meta name="google" content="notranslate" \/>/);
});

test('the game is marked translate="no" for the other translators', () => {
  assert.match(page(), /<html lang="en" translate="no">/);
});
