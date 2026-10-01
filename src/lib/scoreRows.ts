// The scoreboard's rows by player id, for effects aimed at a player's entry
// (a point flowing into their bar, a point lost). Scoreboard.svelte registers
// them with the `scoreRow` action.

const rows = new Map<string, HTMLElement>();

/**
 * Svelte action: registers the row showing a player's score. Should two
 * scoreboards overlap (one fading out as the next screen fades in), the one
 * mounted last wins, and the outgoing one's teardown leaves it in place.
 */
export function scoreRow(node: HTMLElement, id: string) {
  const drop = () => {
    if (rows.get(id) === node) rows.delete(id);
  };
  rows.set(id, node);
  return {
    update(next: string) {
      drop();
      id = next;
      rows.set(id, node);
    },
    destroy: drop,
  };
}

/** The row showing a player's score, if a scoreboard is up. */
export function scoreRowOf(id: string): HTMLElement | null {
  return rows.get(id) ?? null;
}
