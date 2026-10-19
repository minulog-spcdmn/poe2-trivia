// The run on the page (wraeclast.html): one Run (rules.ts) at a time, its
// state made reactive so the screens follow it, its log kept after every
// item (its result null till it ends), so a reload or a new run loses none.

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
  /** The runs kept, newest last (this one too, after its first item). */
  runs = $state.raw<RunLog[]>(readRuns());

  /** Starts a run with the tuning panel's numbers. */
  start() {
    const run = new Run({ tuning: $state.snapshot(this.tuning), viewport: Math.round(innerWidth) });
    run.state = reactive(run.state);
    this.run = run;
  }

  /** Keeps the tuning panel's numbers for later visits. */
  saveTuning() {
    writeTuning($state.snapshot(this.tuning));
  }

  /** Keeps the run's log as it stands (once it has an item), replacing what was kept of it before. */
  keep() {
    const run = this.run;
    if (!run || !run.state.log.items.length) return;
    this.runs = keepRun($state.snapshot(run.state.log) as RunLog);
  }
}

export const play = new Play();
