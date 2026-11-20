// The types of what scripts/items-watch.mjs exports, for the tests
// (tests/itemsWatch.test.ts, tsconfig.tests.json): TypeScript reads this
// instead of the script.

import type { AnnouncedEntry, GemEntry, UniqueEntry } from './poe2db-lists.mjs';

export type Named = { name: string; base?: string };
export type Found = { added: Named[]; announcedNew: Named[]; reworked: Named[]; gone: Named[] };
export type Deps = {
  get?: (url: string) => Promise<string>;
  items?: { name: string }[];
  write?: (file: string, text: string) => void;
  output?: (line: string) => void;
  log?: (line: string) => void;
};

export const LEAST_UNIQUES: number;
export const LEAST_GEMS: number;
export class LayoutChanged extends Error {}
export function compare(items: { name: string }[], uniques: UniqueEntry[], gems: GemEntry[], announced: AnnouncedEntry[]): Found;
export function fingerprintOf(c: Found): string;
export function reportOf(c: Found): string;
export function main(argv: string[], env: Record<string, string | undefined>, deps?: Deps): Promise<number>;
