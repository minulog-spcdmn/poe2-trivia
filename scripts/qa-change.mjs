#!/usr/bin/env node
// Where the beta's change shows, for its QA desk's "This change" (docs/qa.md):
// the places that run what the commit built changes since it left main,
// by the scene map, as the dev server's /__qa/change has it (qaServer.ts,
// src/qa/change.ts). Prints it as JSON, for dist/qa-change.json
// (.github/workflows/deploy.yml); with `before`, says the code before the
// change is built there too, for before and after.
//
//   node scripts/qa-change.mjs [before/] > dist/qa-change.json

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changeHere } from '../qaServer.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const change = changeHere(ROOT, 'HEAD');
if (!change) {
  console.error('No merge base with main here: no change to show.');
  process.exit(1);
}
const before = process.argv[2];
process.stdout.write(JSON.stringify({ ...change, ...(before ? { before } : {}) }));
