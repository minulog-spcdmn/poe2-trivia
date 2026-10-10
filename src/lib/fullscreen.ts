/**
 * Fullscreen on phones and tablets, asked for by the tap that starts or joins
 * a game. Browsers only allow it from a tap, click or key press, never on
 * their own, so this is called from those buttons' handlers. Not on devices
 * with a mouse (there a fullscreen page only gets in the way), not where the
 * game already fills the screen (installed to the home screen, see
 * appManifest in vite.config.ts, or fullscreen already), and quietly not where
 * the browser can't (Safari on iPhone only lets videos go fullscreen). A
 * player who leaves fullscreen stays out until the next game they start.
 */
export function enterFullscreen() {
  if (typeof document === 'undefined') return;
  if (!matchMedia('(pointer: coarse)').matches || matchMedia('(hover: hover)').matches) return;
  if (matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) return;
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  if (doc.fullscreenElement ?? doc.webkitFullscreenElement) return;
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (root.requestFullscreen) root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    // iPad Safari before 16.4.
    else root.webkitRequestFullscreen?.();
  } catch {
    /* refused: the game plays on in the browser's frame */
  }
}
