// The phone's compositing layers (docs/iphone.md): what they are, how many
// of each, their memory and why WebKit made them; with --do, which of them
// painted while that script ran in the page and for --for ms after (2000).
//   node scripts/iphone/layers.mjs [--do "<js>"] [--for <ms>]
// The page as it is now: get it there first (goto.mjs, ask.mjs). A count of
// layers in the thousands, or a big one painted every frame, is where an
// iPhone's frames go (the codex had 1,135 before its grid was contained).

import { connect, sleep, webTab } from './phone.mjs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const doJs = opt('--do');
const forMs = +(opt('--for') ?? 2000);

const page = await connect((await webTab()).webSocketDebuggerUrl);
await page.send('DOM.enable').catch(() => {});
await page.send('LayerTree.enable');
const { root } = await page.send('DOM.getDocument', { depth: 1 });
const snap = async () => (await page.send('LayerTree.layersForNode', { nodeId: root.nodeId })).layers;

// A layer named by its element and two parents, their classes (not Svelte's).
const names = new Map();
const nameOf = async (l) => {
  if (!l.nodeId) return l.isAnonymous ? '(anonymous)' : '?';
  if (names.has(l.nodeId)) return names.get(l.nodeId);
  let name = 'node ' + l.nodeId;
  try {
    const { object } = await page.send('DOM.resolveNode', { nodeId: l.nodeId });
    const r = await page.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: `function () { const e = this.nodeType === 1 ? this : this.parentElement; const path = []; for (let x = e; x && x !== document.body && path.length < 3; x = x.parentElement) path.unshift(x.tagName.toLowerCase() + [...x.classList].filter((c) => !c.startsWith('svelte-')).slice(0, 2).map((c) => '.' + c).join('')); return path.join(' > '); }`,
      returnByValue: true,
    });
    name = r.result.value + (l.pseudoElement ? '::' + l.pseudoElement : '');
  } catch {}
  names.set(l.nodeId, name);
  return name;
};

const before = await snap();
const kinds = new Map();
for (const l of before) {
  const name = await nameOf(l);
  const k = kinds.get(name) ?? { n: 0, mem: 0, why: '' };
  if (!k.n)
    try {
      const r = await page.send('LayerTree.reasonsForCompositingLayer', { layerId: l.layerId });
      k.why = Object.keys(r.compositingReasons ?? {}).filter((x) => r.compositingReasons[x]).join(', ');
    } catch {}
  k.n++;
  k.mem += l.memory ?? 0;
  kinds.set(name, k);
}
console.log(`${before.length} layers, ${(before.reduce((s, l) => s + (l.memory ?? 0), 0) / 1e6).toFixed(0)} MB`);
for (const [name, k] of [...kinds].sort((a, b) => b[1].n - a[1].n).slice(0, 25)) console.log(`${String(k.n).padStart(5)} ${(k.mem / 1e6).toFixed(1).padStart(6)} MB  ${name}  [${k.why}]`);

if (doJs) {
  console.log('do:', await page.evaluate(doJs));
  await sleep(forMs);
  const after = await snap();
  const was = new Map(before.map((l) => [l.layerId, l.paintCount ?? 0]));
  const painted = after.map((l) => ({ l, n: (l.paintCount ?? 0) - (was.get(l.layerId) ?? 0) })).filter((x) => x.n > 0);
  // (The most painted area first: paints times size.)
  painted.sort((a, b) => b.n * b.l.bounds.width * b.l.bounds.height - a.n * a.l.bounds.width * a.l.bounds.height);
  console.log(`\n${painted.length} of ${after.length} layers painted in ${forMs} ms:`);
  for (const { l, n } of painted.slice(0, 20)) console.log(`  ${String(n).padStart(4)}x  ${Math.round(l.bounds.width)} x ${Math.round(l.bounds.height)}  ${await nameOf(l)}`);
}
process.exit(0);
