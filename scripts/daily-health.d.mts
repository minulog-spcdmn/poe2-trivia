// The types of what scripts/daily-health.mjs exports, for the tests
// (tests/dailyHealth.test.ts, tsconfig.tests.json): TypeScript reads this
// instead of the script.

import type { Health, Trouble } from '../src/statsPage/insights.ts';
import type { PathCount } from '../src/statsPage/model.ts';

export type Deps = { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number };
export type Api = { calls: number; get: (path: string, query?: Record<string, string>) => Promise<any> };
export type Span = { start: Date; end: Date };
export type Check = { day: string; trouble: Trouble | null; health: Health | null };

export const BEFORE: number;
export class CheckError extends Error {}
export class KeyRefused extends CheckError {}
export function apiOf(key: string, deps?: Deps): Api;
export function windowsOf(zone: string, at: Date, days?: number): { today: string; checked: string[]; span: Span };
export function checkDay(paths: PathCount[], day: string, zone?: string): Check | null;
export function firedOf(c: Check | null): string[];
export function main(argv: string[], env: Record<string, string | undefined>, deps?: Deps & { log?: (line: string) => void }): Promise<number>;
