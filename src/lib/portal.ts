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
