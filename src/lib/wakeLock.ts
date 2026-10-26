// Keeping the screen on (the Screen Wake Lock API), where the browser lets a
// page ask: a phone that locks itself after half a minute idle suspends the
// page, and with it a room's links (session.svelte.ts), or leaves the stats
// page's overview dark on its monitor (statsPage/Analytics.svelte).

/** What the browser hands back for a lock it grants, as far as it's used here. */
type Lock = { release(): Promise<void>; addEventListener(type: 'release', f: () => void): void };
type Locks = { request(type: 'screen'): Promise<Lock> };

/**
 * Keeps the screen on until the function returned is called. The browser lets
 * go of the lock whenever the page is hidden, so it's asked again on coming
 * back; one refused (some browsers grant it only from a tap, or not to a page
 * saving battery) is asked once more on the next tap. Where there's no such
 * thing (an older browser, plain http) the screen sleeps as it would.
 */
export function keepAwake(): () => void {
  const locks = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { wakeLock?: Locks }).wakeLock;
  if (!locks || typeof document === 'undefined') return () => {};
  let lock: Lock | null = null;
  let asking = false;
  let gone = false;
  /** A refused lock waits for the next tap to be asked again. */
  let tapArmed = false;
  const wake = async (tapped = false) => {
    if (gone || lock || asking || document.visibilityState !== 'visible') return;
    asking = true;
    try {
      const got = await locks.request('screen');
      if (gone) return void got.release().catch(() => {});
      lock = got;
      got.addEventListener('release', () => {
        if (lock === got) lock = null;
      });
    } catch {
      // Refused: asked again from a tap, once (a tap that's refused too leaves it to the screen coming back).
      if (!tapped) armTap();
    } finally {
      asking = false;
    }
  };
  const tapped = () => {
    tapArmed = false;
    void wake(true);
  };
  const armTap = () => {
    if (gone || tapArmed) return;
    tapArmed = true;
    document.addEventListener('pointerdown', tapped, { once: true, capture: true, passive: true });
  };
  const shown = () => void wake();
  document.addEventListener('visibilitychange', shown);
  void wake();
  return () => {
    if (gone) return;
    gone = true;
    document.removeEventListener('visibilitychange', shown);
    if (tapArmed) document.removeEventListener('pointerdown', tapped, { capture: true });
    tapArmed = false;
    const held = lock;
    lock = null;
    void held?.release().catch(() => {});
  };
}
