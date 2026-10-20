// The screens the game is checked on: one list for the QA desk (qa.html),
// its sweep (scripts/qa.mjs) and the screenshots (scripts/capture-screens.mjs),
// so a size means the same everywhere. Each is a browser window's inside, in
// CSS pixels, with the device's pixel ratio and whether it is a touch screen.
// A 4K screen is three sizes, by the system's scaling: at 100% the page is
// 3840 wide, at 150% 2560 and at 200% 1920, drawn with 1, 1.5 and 2 device
// pixels to each.

export interface Size {
  readonly key: string;
  readonly label: string;
  readonly w: number;
  readonly h: number;
  /** Device pixels to each CSS pixel. */
  readonly dpr: number;
  /** A phone or tablet: touch, no hover, coarse pointer. */
  readonly touch?: boolean;
  /** Walked by default in the desk: every scene is checked on these. */
  readonly walk?: boolean;
}

export const SIZES = [
  { key: 'phone', label: 'Small phone', w: 375, h: 812, dpr: 3, touch: true, walk: true },
  { key: 'phone390', label: 'Phone', w: 390, h: 844, dpr: 3, touch: true },
  // On its side in a browser: the address bar stays up (a game never scrolls it away), so 340 of the screen's 390.
  { key: 'landscape', label: 'Phone on its side', w: 844, h: 340, dpr: 3, touch: true, walk: true },
  { key: 'landscapeFull', label: 'Phone on its side, full screen', w: 844, h: 390, dpr: 3, touch: true },
  { key: 'tablet', label: 'Tablet', w: 820, h: 1180, dpr: 2, touch: true },
  { key: 'narrow', label: 'Narrow window', w: 1100, h: 900, dpr: 1 },
  { key: 'laptop', label: '13-inch laptop', w: 1440, h: 725, dpr: 2, walk: true },
  { key: 'desktop', label: 'Desktop', w: 1440, h: 900, dpr: 1 },
  { key: 'mbp14', label: '14-inch laptop', w: 1512, h: 790, dpr: 2 },
  { key: 'mbp16', label: '16-inch laptop', w: 1728, h: 925, dpr: 2 },
  { key: 'fhd', label: '1080p screen, in a window', w: 1920, h: 970, dpr: 1 },
  { key: 'uhd200', label: '4K at 200%', w: 1920, h: 1080, dpr: 2 },
  { key: 'qhd', label: '1440p screen, in a window', w: 2560, h: 1310, dpr: 1 },
  { key: 'uhd150', label: '4K at 150%', w: 2560, h: 1440, dpr: 1.5, walk: true },
  { key: 'uhdWindow', label: '4K at 100%, in a window', w: 3840, h: 2030, dpr: 1 },
  { key: 'uhd', label: '4K at 100%', w: 3840, h: 2160, dpr: 1, walk: true },
] as const satisfies readonly Size[];

export type SizeKey = (typeof SIZES)[number]['key'];

const BY_KEY = new Map<string, Size>(SIZES.map((s) => [s.key, s]));
export const isSizeKey = (k: unknown): k is SizeKey => typeof k === 'string' && BY_KEY.has(k);
export const sizeOf = (k: SizeKey): Size => BY_KEY.get(k)!;

/** The sizes every scene is walked at. */
export const WALK_SIZES: SizeKey[] = SIZES.filter((s: Size) => s.walk).map((s) => s.key);

/** The screenshots' sets: the design canvas's three (docs/design-rules.md), the desk's walk, and every size. */
export const PRESETS: Record<'quick' | 'walk' | 'full', SizeKey[]> = {
  quick: ['desktop', 'laptop', 'phone390'],
  walk: WALK_SIZES,
  full: SIZES.map((s) => s.key),
};
