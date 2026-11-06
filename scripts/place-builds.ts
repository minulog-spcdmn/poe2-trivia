#!/usr/bin/env node
// Each place's print (src/qa/builds.ts), as JSON on stdout: what it builds,
// for This change (qaServer.ts' changeHere) and the scene map
// (npm run sweep -- --map keeps the prints of the commit it's made at).
//
//   node scripts/place-builds.ts

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Item } from '../src/lib/game.ts';
import { useItems } from '../src/qa/build/engine.ts';
import { useCaptured } from '../src/qa/scenes/captured.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (file: string) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));

useItems(json('src/data/items.json') as Item[], json('src/data/fakes.json'));
// The scenes saved from live rooms, as the desk has them.
const captured = path.join(ROOT, 'src', 'qa', 'captured');
useCaptured(Object.fromEntries((existsSync(captured) ? readdirSync(captured) : []).filter((f) => f.endsWith('.json')).map((f) => [f, json(`src/qa/captured/${f}`)])));
const { catalog } = await import('../src/qa/scenes/index.ts');
const { placeBuilds } = await import('../src/qa/builds.ts');

process.stdout.write(JSON.stringify(placeBuilds(catalog())));
