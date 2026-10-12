import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Item } from '../src/lib/game.ts';

const ROOT = join(import.meta.dirname, '..');
const items: Item[] = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'items.json'), 'utf8'));
const stats: Record<string, [string, string][][]> = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'itemStats.json'), 'utf8'));

test('every item has its tooltip, and only the items do (npm run fetch-stats)', () => {
  assert.deepEqual(
    items.filter((it) => !stats[it.id]?.length).map((it) => it.name),
    [],
  );
  const ids = new Set(items.map((it) => it.id));
  assert.deepEqual(
    Object.keys(stats).filter((id) => !ids.has(id)),
    [],
  );
});

test('tooltip lines are of a kind ItemDetails draws, their values marked whole', () => {
  const bad: string[] = [];
  for (const [id, sections] of Object.entries(stats))
    for (const section of sections) {
      if (!section.length) bad.push(`${id}: an empty section`);
      for (const [kind, text] of section) {
        if (!'priedcft'.includes(kind) || kind.length !== 1) bad.push(`${id}: kind ${kind}`);
        // Coloured values written {x|value} (x one of ItemDetails' COLOURS), never nested or left open.
        if (!/^(?:[^{}]|\{[wapfclh]\|[^{}|]*\})*$/.test(text)) bad.push(`${id}: ${text}`);
        if (!text.trim()) bad.push(`${id}: an empty line`);
      }
    }
  assert.deepEqual(bad, []);
});

test('every unique tells its mods, and every gem what it does', () => {
  const bare = items.filter((it) => {
    const lines = stats[it.id].flat();
    return !lines.some(([k]) => k === 'e' || k === 'i' || (it.kind === 'gem' && k === 'd'));
  });
  assert.deepEqual(
    bare.map((it) => it.name),
    [],
  );
});
