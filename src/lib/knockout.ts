// A plate's knockout (lib/cardEngraving.ts Engraved.knockout) in its shapes,
// one closed path each (overlapping shapes of one path would cancel out), for
// the card (CardEngraving.svelte) and its print (lib/platePrint.svelte.ts).
// Split where one shape's Z meets the next one's M, written without a
// lookbehind: Safari before 16.4 can't read one, and a script holding one
// fails to load there as a whole.

/** The knockout `d` as its shapes: "M…ZM…Z" → ["M…Z", "M…Z"]. */
export function knockoutShapes(d: string): string[] {
  const parts = d.split(/Z(?=M)/);
  return parts.map((p, i) => (i < parts.length - 1 ? `${p}Z` : p));
}
