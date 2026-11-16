// The notice that the browser draws without the GPU (lib/gpuNotice.svelte.ts):
// a dialog that comes up on a calm screen once the browser is found to draw
// in software, until it's answered, and the settings' line that stays after.
import './asVite.ts';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.ts';

const store = new Map<string, string>();
/** Whether the browser keeps what's written (a test's own: storage blocked or full keeps nothing). */
let keeps = true;
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store, () => keeps);

const { answerGpuNotice, askBrowser, gpuNotice, openGpuNotice, watchGpuNotice } = await import('../src/lib/gpuNotice.svelte.ts');
const { writeStored } = await import('../src/lib/storage.ts');

/** A page's watch, its browser the test's: `found` is what the check answers (null: nothing yet). */
function page(found: boolean | null, { tells = true } = {}) {
  let answer: (software: boolean) => void = () => {};
  const watch = watchGpuNotice({
    tells: () => tells,
    ask: (a) => {
      answer = a;
      if (found !== null) a(found);
      return () => {};
    },
  });
  return { watch, answer: (software: boolean) => answer(software) };
}

/** The next visit: a page of its own, with only what the browser kept. */
const nextVisit = (found: boolean) => {
  gpuNotice.open = false;
  gpuNotice.off = false;
  gpuNotice.answered = false;
  return page(found);
};

beforeEach(() => {
  store.clear();
  keeps = true;
  gpuNotice.open = false;
  gpuNotice.off = false;
  gpuNotice.answered = false;
});

test('found to draw in software, the dialog comes up on a calm screen', () => {
  const p = page(null);
  p.watch.calm(true);
  assert.equal(gpuNotice.open, false, 'nothing until the check answers');
  p.answer(true);
  assert.equal(gpuNotice.open, true);
  assert.equal(gpuNotice.off, true);
});

test('a browser that draws with the GPU is told nothing', () => {
  const p = page(false);
  p.watch.calm(true);
  assert.equal(gpuNotice.open, false);
  assert.equal(gpuNotice.off, false);
});

test('a later word changes the answer: Firefox found out after the worker said "a GPU"', () => {
  const p = page(false);
  p.watch.calm(true);
  assert.equal(gpuNotice.off, false);
  p.answer(true);
  assert.equal(gpuNotice.open, true);
  assert.equal(gpuNotice.off, true);
});

/** The three the browser's asking goes to, a test's own: what each was told to answer, and whether each was called off. */
function asked() {
  const heard: boolean[] = [];
  const src = { worker: (_: boolean) => {}, backdrop: () => {}, firefox: () => {}, workerOff: 0, backdropOff: 0, firefoxOff: 0 };
  const off = askBrowser(
    (software) => heard.push(software),
    (answer) => {
      src.worker = answer;
      return () => void src.workerOff++;
    },
    (tell) => {
      src.backdrop = tell;
      return () => void src.backdropOff++;
    },
    (tell) => {
      src.firefox = tell;
      return () => void src.firefoxOff++;
    },
  );
  return { heard, src, off };
}

test('the backdrop telling of software answers at once, and the worker is called off', () => {
  const a = asked();
  a.src.backdrop();
  assert.deepEqual(a.heard, [true]);
  assert.equal(a.src.workerOff, 1);
});

test('the backdrop saying nothing, the worker answers, either way', () => {
  const gpu = asked();
  gpu.src.worker(false);
  assert.deepEqual(gpu.heard, [false]);
  const soft = asked();
  soft.src.worker(true);
  assert.deepEqual(soft.heard, [true]);
  assert.equal(soft.src.workerOff, 0);
});

test('Firefox telling of software is the last word, after the worker said "a GPU" or before it could', () => {
  // (All the worker can say in Firefox, whose contexts stay on the GPU with acceleration off.)
  const after = asked();
  after.src.worker(false);
  after.src.firefox();
  assert.deepEqual(after.heard, [false, true]);
  const before = asked();
  before.src.firefox();
  assert.deepEqual(before.heard, [true]);
  assert.equal(before.src.workerOff, 1, 'the worker is called off: its answer would take it back');
});

test('the asking called off, all three are', () => {
  const a = asked();
  a.off();
  assert.equal(a.src.workerOff, 1);
  assert.equal(a.src.backdropOff, 1);
  assert.equal(a.src.firefoxOff, 1);
});

test('found during a question, it waits for the next calm screen', () => {
  const p = page(null);
  p.watch.calm(false);
  p.answer(true);
  assert.equal(gpuNotice.open, false);
  assert.equal(gpuNotice.off, true, 'the settings have their line already');
  p.watch.calm(true);
  assert.equal(gpuNotice.open, true);
});

test('a question starting takes it down unanswered, and it is back after the game', () => {
  const p = page(true);
  p.watch.calm(true);
  p.watch.calm(false);
  assert.equal(gpuNotice.open, false);
  p.watch.calm(true);
  assert.equal(gpuNotice.open, true);
});

test('answered, it stays down for good, and the settings keep their line', () => {
  const p = page(true);
  p.watch.calm(true);
  answerGpuNotice();
  assert.equal(gpuNotice.open, false);
  p.watch.calm(false);
  p.watch.calm(true);
  assert.equal(gpuNotice.open, false);
  const next = nextVisit(true);
  next.watch.calm(true);
  assert.equal(gpuNotice.open, false);
  assert.equal(gpuNotice.off, true);
  // From the settings' line, by hand.
  openGpuNotice();
  assert.equal(gpuNotice.open, true);
});

test("an older build's notice in the corner, closed, is no answer: the dialog asks once more", () => {
  writeStored('gpuNotice.closed', '1');
  const p = page(true);
  p.watch.calm(true);
  assert.equal(gpuNotice.open, true);
  answerGpuNotice();
  const next = nextVisit(true);
  next.watch.calm(true);
  assert.equal(gpuNotice.open, false);
});

test('where the browser keeps nothing, the answer still holds for the visit', () => {
  keeps = false;
  const p = page(true);
  p.watch.calm(true);
  answerGpuNotice();
  assert.equal(store.size, 0, 'nothing was kept');
  p.watch.calm(false);
  p.watch.calm(true);
  assert.equal(gpuNotice.open, false, 'not back after the game');
  // Nothing kept, so the next visit asks again.
  const next = nextVisit(true);
  next.watch.calm(true);
  assert.equal(gpuNotice.open, true);
});

test('where nothing is told (the QA desk, the bot, a script), nothing is set', () => {
  // (The desk's scene says how the settings' line stands: left as it is.)
  gpuNotice.off = true;
  const p = page(true, { tells: false });
  p.watch.calm(true);
  assert.equal(gpuNotice.open, false);
  assert.equal(gpuNotice.off, true);
});
