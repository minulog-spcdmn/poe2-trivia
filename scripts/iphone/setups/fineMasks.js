// SETUP for game.mjs: whether the category cards' emblems got their fine
// masks (lib/fineMask.ts) on the phone, in window.__extra: 2.5 s after each
// hand of cards comes in, how many emblems there are and how many mask with
// a copy made for them (a blob: URL in --fine).
(() => {
  const out = (window.__extra = []);
  const mo = new MutationObserver((ms) => {
    if (!ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.('button.card') || n.querySelector?.('button.card'))))) return;
    setTimeout(() => {
      const gs = [...document.querySelectorAll('.card .glyph')];
      // (WebKit gives the url back in double quotes, Chrome as it was written.)
      out.push({ glyphs: gs.length, fine: gs.filter((g) => /^url\(["']?blob:/.test(g.style.getPropertyValue('--fine'))).length, sample: gs[0]?.style.getPropertyValue('--fine').slice(0, 60) });
    }, 2500);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  return 'checking fine masks';
})()
