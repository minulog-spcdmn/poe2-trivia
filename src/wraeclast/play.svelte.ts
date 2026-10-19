// The run on the page (wraeclast.html): one Run (rules.ts) at a time, its
// state made reactive so the screens follow it, its log kept once it ends.

import { Run, type RunLog, type Tuning } from './rules.ts';
import { readTuning, writeTuning } from './tuning.ts';
import { keepRun, readRuns } from './runLog.ts';

/** A plain object made deeply reactive (Svelte's proxy): what the rules change through it, the screens see. */
function reactive<T extends object>(value: T): T {
  const proxied = $state(value);
  return proxied;
}

class Play {
  /** The run being played. */
  run = $state.raw<Run | null>(null);
  /** The numbers the next run starts with (the tuning panel's). */
  tuning = $state<Tuning>(readTuning());
  /** The runs kept, newest last (this one too, once it ends). */
  runs = $state.raw<RunLog[]>(readRuns());
  /** Whether this run's log is kept yet. */
  private kept = false;

  /** Starts a run with the tuning panel's numbers. */
  start() {
    const run = new Run({ tuning: $state.snapshot(this.tuning), viewport: Math.round(innerWidth) });
    run.state = reactive(run.state);
    this.kept = false;
    this.run = run;
  }

  /** Keeps the tuning panel's numbers for later visits. */
  saveTuning() {
    writeTuning($state.snapshot(this.tuning));
  }

  /** Keeps the run's log once it has ended. */
  keep() {
    const run = this.run;
    if (!run || this.kept || run.state.phase !== 'end') return;
    this.kept = true;
    this.runs = keepRun($state.snapshot(run.state.log) as RunLog);
  }
}

export const play = new Play();
