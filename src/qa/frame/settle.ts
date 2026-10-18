// Waiting, in a frame of the QA desk, for the scene to come to rest before
// it is checked: its fonts in, its pictures decoded, every animation with an
// end ended (a screen's entrance; the endless ones, a glow or a spinner, are
// left running) and its layout no longer moving. scripts/capture-screens.mjs
// waits the same way before a shot. Gives up after `capMs`, saying so.

const race = <T>(p: Promise<T>, ms: number) => Promise.race([p.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 100)));

/** Layout boxes, which leave transforms out: an animation that only moves or scales something isn't the layout changing. */
function snapshot() {
  const parts = [document.documentElement.scrollWidth, document.documentElement.scrollHeight];
  for (const el of document.querySelectorAll('body *')) if (el instanceof HTMLElement) parts.push(el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight);
  return parts.join(',');
}

/** Resolves once the page is at rest (true), or the cap has passed (false). */
export async function settle(capMs = 8000): Promise<boolean> {
  const end = performance.now() + capMs;
  const left = () => Math.max(0, end - performance.now());
  await race(document.fonts.ready, left());
  await race(
    Promise.all(
      Array.from(document.images)
        .filter((i) => i.complete || i.loading !== 'lazy')
        .map((i) => i.decode().catch(() => {})),
    ),
    left(),
  );
  while (left() > 0) {
    const running = document.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity));
    if (!running.length) break;
    await race(Promise.all(running.map((a) => a.finished.catch(() => {}))), Math.min(left(), 1000));
  }
  let last = snapshot();
  let same = 0;
  while (left() > 0) {
    await frame();
    const now = snapshot();
    same = now === last ? same + 1 : 0;
    last = now;
    if (same >= 2) return true;
  }
  return false;
}
