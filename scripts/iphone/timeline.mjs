// What a run's timeline (TIMELINE=1) recorded in each phase: records of each
// kind, the area painted, and the styles and layouts script forced, by
// caller. On iOS the records carry no times, so it's counts, split at the
// marks' console.timeStamp; given two runs, side by side (a/b).
//   node scripts/iphone/timeline.mjs <a.timeline.json> [b.timeline.json]

import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/iphone/timeline.mjs <a.timeline.json> [b.timeline.json]');
  process.exit(2);
}
const load = (f) => {
  const phases = {};
  let at = 'pre';
  const walk = (r) => {
    if (r.type === 'TimeStamp') at = r.data?.message ?? at;
    else {
      const p = (phases[at] ??= { n: {}, forced: {}, paintPx: 0 });
      p.n[r.type] = (p.n[r.type] ?? 0) + 1;
      if (r.type === 'Paint' && r.data?.clip) {
        const q = r.data.clip;
        p.paintPx += Math.abs((q[2] - q[0]) * (q[5] - q[1]));
      }
      if (r.stackTrace && (r.type === 'Layout' || r.type === 'RecalculateStyles')) {
        const frames = r.stackTrace.callFrames.filter((f) => f.url !== '[native code]');
        const k = `${r.type === 'Layout' ? 'layout' : 'style'} ${r.stackTrace.callFrames[0]?.functionName} < ${frames.slice(0, 3).map((f) => `${f.functionName || '?'}:${f.lineNumber}:${f.columnNumber}`).join(' < ')}`;
        p.forced[k] = (p.forced[k] ?? 0) + 1;
      }
    }
    (r.children ?? []).forEach(walk);
  };
  JSON.parse(readFileSync(f, 'utf8')).forEach(walk);
  return phases;
};
const all = files.map(load);
for (const ph of new Set(all.flatMap((p) => Object.keys(p)))) {
  console.log(`== ${ph}`);
  const types = [...new Set(all.flatMap((p) => Object.keys(p[ph]?.n ?? {})))].sort();
  console.log('   ' + types.map((t) => `${t} ${all.map((p) => p[ph]?.n[t] ?? 0).join('/')}`).join('  '));
  console.log('   painted Mpx ' + all.map((p) => ((p[ph]?.paintPx ?? 0) / 1e6).toFixed(1)).join('/'));
  const keys = [...new Set(all.flatMap((p) => Object.keys(p[ph]?.forced ?? {})))];
  keys.sort((a, b) => (all[0][ph]?.forced[b] ?? 0) - (all[0][ph]?.forced[a] ?? 0));
  for (const k of keys.slice(0, 12)) console.log(`   ${all.map((p) => String(p[ph]?.forced[k] ?? 0).padStart(4)).join('/')}  ${k.slice(0, 150)}`);
}
