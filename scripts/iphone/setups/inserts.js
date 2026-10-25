// SETUP for game.mjs and codex.mjs: times every big insertion into the page
// (25 elements or more at once), in window.__ins: the script that ran since
// the last frame, the styles and layout it left, the wait for the next frame
// and that frame, and what was inserted most. A screen mounting is one.
(() => {
  const out = (window.__ins = []);
  let lastRaf = 0;
  const loop = () => {
    lastRaf = performance.now();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const task = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = r; ch.port2.postMessage(0); });
  const name = (e) => {
    const p = [];
    for (let x = e; x && x !== document.body && p.length < 3; x = x.parentElement) p.unshift(x.tagName.toLowerCase() + [...x.classList].filter((c) => !c.startsWith('svelte-')).slice(0, 2).map((c) => '.' + c).join(''));
    return p.join('>');
  };
  let busy = false;
  const mo = new MutationObserver(async (ms) => {
    let n = 0;
    const kinds = {};
    for (const m of ms)
      for (const a of m.addedNodes)
        if (a.nodeType === 1) {
          const k = 1 + a.querySelectorAll('*').length;
          n += k;
          kinds[name(a)] = (kinds[name(a)] ?? 0) + k;
        }
    if (n < 25 || busy) return;
    busy = true;
    const t0 = performance.now();
    const since = t0 - lastRaf;
    void document.documentElement.offsetTop;
    const t1 = performance.now();
    await new Promise((r) => requestAnimationFrame(r));
    const t2 = performance.now();
    await task();
    const t3 = performance.now();
    busy = false;
    const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => v + ' ' + k).join(', ');
    out.push({ at: Math.round(t0), mark: window.__marks?.at(-1)?.[0], n, sinceRaf: Math.round(since), styleLayout: Math.round(t1 - t0), toRaf: Math.round(t2 - t1), afterRaf: Math.round(t3 - t2), top });
  });
  mo.observe(document.body, { childList: true, subtree: true });
  return 'timing big insertions';
})()
