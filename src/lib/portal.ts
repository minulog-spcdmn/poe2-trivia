/**
 * Svelte action: moves the element to the end of <body>. Full-screen
 * overlays use it so they stay fixed to the viewport while the app shell is
 * translated by camera shake (a transformed ancestor would carry them along).
 */
export function portal(node: HTMLElement) {
  document.body.append(node);
  return {
    destroy() {
      node.remove();
    },
  };
}
