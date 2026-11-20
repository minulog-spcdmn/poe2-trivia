// The types of what scripts/poe2db-lists.mjs exports, for the tests
// (tsconfig.tests.json): TypeScript reads this instead of the script.

export const SOURCE: string;
export const GEM_SOURCE: string;
export function decode(s: string): string;
export type UniqueEntry = { name: string; base: string; slug: string; img: string | undefined };
export type GemEntry = { name: string; colour: string; img: string };
export type AnnouncedEntry = { name: string; base: string };
export function uniqueEntries(html: string): UniqueEntry[];
export function gemEntries(html: string): GemEntry[];
export function announcedEntries(html: string): AnnouncedEntry[];
