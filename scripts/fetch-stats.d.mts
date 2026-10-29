// The types of what scripts/fetch-stats.mjs exports, for the tests
// (tests/fetchStats.test.ts, tsconfig.tests.json): TypeScript reads this
// instead of the script.

/** A tooltip: its sections, each its lines as [kind, text] (ItemDetails.svelte). */
export type Tooltip = [string, string][][];
export type StatsItem = { id: string; name: string; kind: string; variants?: { id: string; base: string }[] };
export type Box = { name: string; base: string; art: string | null; html: string };
export type Found = {
  stats: Record<string, Tooltip>;
  fromPage: string[];
  differ: string[];
  kept: string[];
  missing: string[];
  unknown: Set<string>;
};

export const decode: (s: string) => string;
export function pageBoxes(html: string): Box[];
export const hashId: (s: string) => string;
export function fetchRetry(url: string, tries?: number): Promise<Response>;
export const EMPTY_HOVER: string;
export const isEmptyHover: (url: string) => boolean;
export function listLinks(html: string, hovers?: Map<string, string>, pages?: Map<string, string>): { hovers: Map<string, string>; pages: Map<string, string> };
export function tooltipOf(html: string | null | undefined, it: { name: string; kind: string }, unknown?: Set<string>): Tooltip | null;
export const ownBox: <B extends { art: string | null }>(boxes: B[], ownArt: string) => B | undefined;
export function collectStats(
  items: StatsItem[],
  opts?: {
    ownBoxes?: Map<string, string> | null;
    variantBoxes?: Map<string, string> | null;
    committed?: Record<string, Tooltip>;
    fetchText?: ((url: string) => Promise<string>) | null;
    log?: (line: string) => void;
  },
): Promise<Found>;
export function statsFile(items: StatsItem[], stats: Record<string, Tooltip>): string;
export function statsReport(items: StatsItem[], found: Found): string[];
export const readCommitted: () => Promise<Record<string, Tooltip>>;
export const writeStats: (items: StatsItem[], stats: Record<string, Tooltip>) => Promise<void>;
