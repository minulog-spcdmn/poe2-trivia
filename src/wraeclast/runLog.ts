// The run log (wraeclast.html): the last RUNS_KEPT runs' logs, kept in
// storage, for the tester to copy from the end screen and send to the owner.

import { readStored, writeStored } from '../lib/storage.ts';
import type { RunLog } from './rules.ts';

const KEY = 'wraeclastRuns4';
export const RUNS_KEPT = 20;

export function readRuns(): RunLog[] {
  try {
    const runs = JSON.parse(readStored(KEY) ?? '[]');
    return Array.isArray(runs) ? runs.filter((r) => r && typeof r === 'object' && r.v === 4) : [];
  } catch {
    return [];
  }
}

/** Keeps a run's log (once: the same run kept again replaces itself), the oldest dropped past RUNS_KEPT. */
export function keepRun(log: RunLog): RunLog[] {
  const same = (r: RunLog) => r.seed === log.seed && r.start === log.start;
  const runs = [...readRuns().filter((r) => !same(r)), log].slice(-RUNS_KEPT);
  writeStored(KEY, JSON.stringify(runs));
  return runs;
}

/** The log as the tester sends it: every run kept, newest last. */
export const logText = (runs: RunLog[]) => JSON.stringify({ wraeclastRuns: runs }, null, 1);
