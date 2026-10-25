// What ran in each phase of a game.mjs run with PROFILE=1: the sampling
// profiler's samples (about one a ms), split at the marks (their MARK_
// functions, phone.mjs: on iOS the samples carry no times), with the
// functions most often on top of the stack (self) and anywhere in it
// (inclusive). Phases not matching the regex only get their count. Each
// frame is named by its place in src/, through the build's source maps
// (build.mjs keeps them, unlinked, in .phone/<name>/assets/), or by its
// file, line and column in the build where there's none.
//   node scripts/iphone/profile.mjs <label.prof.json> [phase regex]

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { SourceMap } from 'node:module';
import { join } from 'node:path';
import { work } from './phone.mjs';

const [file, want = '.'] = process.argv.slice(2);
if (!file) {
  console.error('usage: node scripts/iphone/profile.mjs <label.prof.json> [phase regex]');
  process.exit(2);
}
const traces = JSON.parse(readFileSync(file, 'utf8')).flatMap((p) => p.samples?.stackTraces ?? []);
let at = { name: 'pre', samples: [] };
const phases = [at];
for (const t of traces) {
  const m = t.stackFrames.find((f) => /^MARK_/.test(f.name));
  if (m) {
    const name = m.name.slice(5);
    if (name !== at.name) phases.push((at = { name, samples: [] }));
    continue;
  }
  at.samples.push(t);
}
// (A built file's name carries its contents' hash, so it's the same file whichever build it's in.)
const maps = new Map();
const mapOf = (file) => {
  if (!maps.has(file)) {
    const at = existsSync(work) ? readdirSync(work).map((d) => join(work, d, 'assets', file + '.map')).find(existsSync) : undefined;
    maps.set(file, at ? new SourceMap(JSON.parse(readFileSync(at, 'utf8'))) : null);
  }
  return maps.get(file);
};
const key = (f) => {
  if (!f.url) return f.name || '(native)';
  const file = f.url.split(/[?#]/)[0].split('/').pop();
  const o = mapOf(file)?.findOrigin(f.line, f.column);
  if (o?.fileName) return `${o.name ?? (f.name || '(anon)')} ${o.fileName.replace(/^.*?\bsrc\//, 'src/')}:${o.lineNumber}`;
  return `${f.name || '(anon)'} ${file}:${f.line}:${f.column}`;
};
const top = (counts, n) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${v} ${k}`)
    .join(' | ');
const re = new RegExp(want);
for (const p of phases) {
  console.log(`== ${p.name}: ${p.samples.length} samples`);
  if (!re.test(p.name)) continue;
  const self = {};
  const incl = {};
  for (const t of p.samples) {
    const k = t.stackFrames[0] ? key(t.stackFrames[0]) : '(idle)';
    self[k] = (self[k] ?? 0) + 1;
    for (const kk of new Set(t.stackFrames.map(key))) incl[kk] = (incl[kk] ?? 0) + 1;
  }
  console.log('   self: ' + top(self, 8));
  console.log('   incl: ' + top(incl, 12));
}
