/**
 * Svelte action: moves the element to the end of <body>. Full-screen
 * overlays use it so they stay fixed to the viewport while the app shell is
 * translated by camera shake (a transformed ancestor would carry them along).
 *
 * They're part of the page, so they dim behind an open dialog
 * (lib/behindDialog.ts): darkened and blurred, or with 'dim' only darkened
 * (for viewport-sized fills, whose edges a blur would fade, and soft light).
 * Dialogs themselves use `dialogBackdrop` instead.
 */
export function portal(node: HTMLElement, behind: 'dim' | undefined = undefined) {
  node.dataset.behindDialog = behind ?? '';
  document.body.append(node);
  return {
    destroy() {
      node.remove();
    },
  };
}

/**
 * Like portal, but to the end of #app (after the shell, so camera shake
 * doesn't carry it): for an overlay over the whole page, set in it rather
 * than on the screen, so it scrolls with the page and is clipped with it.
 * It isn't marked to dim behind a dialog: the filter would carry along
 * whatever inside it is fixed to the screen, so what's in it marks itself.
 */
export function portalToPage(node: HTMLElement) {
  (document.getElementById('app') ?? document.body).append(node);
  return {
    destroy() {
      node.remove();
    },
  };
}

/**
 * Puts `node`, an overlay fixed over the screen at the toasts' z-index (90,
 * Toasts.svelte), into the page just before the toasts: it draws over
 * everything below 90 (the item window too, at 89 and moved to the end of
 * <body> by portal as it opens) and under the toasts, which come after it.
 * With no toasts on the page, at the end of <body>.
 */
export function beforeToasts(node: HTMLElement) {
  const toasts = document.querySelector('.toasts');
  if (toasts?.parentNode) toasts.before(node);
  else document.body.append(node);
}
