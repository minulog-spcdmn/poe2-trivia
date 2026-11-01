// The category cards' plates (lib/cardEngraving) engraved in a worker
// (engraveWorker.ts) while a dealt hand lies unseen (CardEngraving's hold),
// and kept as engrave()'s own, so the page finds them engraved when it
// draws them. A hand dealt at a size seen for the first time, the game's
// first hand above all, had the page's thread engrave a back and a face
// (10 to 16 ms each on the PC) in the frames of the deal (#331). Where no
// worker runs, or it's late, the page engraves them as before.

import { engravedAt, keep, type Engraved, type Variant } from './cardEngraving.ts';
import { findVariant } from './findEngraving.ts';
import { whenIdle } from './idle.ts';
import { LANTERN_PLATE } from './wayOut/lanternPlate.ts';
import type { EngraveAnswer, EngraveJob, VariantName } from './engraveWorker';

let worker: Worker | null | undefined;
let lastJob = 0;
/** What each job sent to the worker does with its answer. */
const answers = new Map<number, (plate: Engraved | null) => void>();
/** The plates asked for and not yet in, by side, size and variant: asked once however many cards share them. */
const coming = new Map<string, Promise<void>>();

/** The worker, started on first use; null where it can't run, or once it has failed. */
function engraver(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined') return (worker = null);
  try {
    worker = new Worker(new URL('./engraveWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return (worker = null);
  }
  worker.onmessage = ({ data }: MessageEvent<EngraveAnswer>) => {
    answers.get(data.id)?.(data.plate ?? null);
    answers.delete(data.id);
  };
  // (Failed to load, say: what it was asked comes back undone, and the page engraves it.)
  worker.onerror = () => {
    worker?.terminate();
    worker = null;
    for (const done of answers.values()) done(null);
    answers.clear();
  };
  return worker;
}

/** Starts the worker in an idle moment, ahead of the first hand: its plates don't wait for it to load. */
export function warmEngraving() {
  whenIdle(() => void engraver(), { timeout: 10_000 });
}

/** A variant's name in the worker, if it knows it. */
function nameOf(v: Variant | undefined): VariantName | null {
  if (!v) return 'plain';
  if (v === LANTERN_PLATE) return 'out';
  for (const kind of ['azurite', 'flare', 'dynamite'] as const) if (v === findVariant(kind)) return kind;
  return null;
}

/**
 * Engraves this side of a card `w` by `h` in the worker and keeps it as
 * engrave()'s. Resolves once it's kept, or at once if it was already; also
 * if it couldn't be (no worker, a variant it doesn't know), which leaves
 * the page to engrave it when it's drawn.
 */
export function engraveAhead(side: 'face' | 'back', w: number, h: number, v?: Variant): Promise<void> {
  if (engravedAt(side, w, h, v)) return Promise.resolve();
  const name = nameOf(v);
  const key = `${name} ${side} ${w} ${h}`;
  let p = coming.get(key);
  if (p) return p;
  const engraves = name ? engraver() : null;
  if (!name || !engraves) return Promise.resolve();
  const id = ++lastJob;
  p = new Promise<void>((done) => {
    answers.set(id, (plate) => {
      coming.delete(key);
      if (plate) keep(side, w, h, v, plate);
      done();
    });
    engraves.postMessage({ id, side, w, h, variant: name } satisfies EngraveJob);
  });
  coming.set(key, p);
  return p;
}
