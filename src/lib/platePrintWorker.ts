// Pulls the prints of the category cards' engraved plates (lib/platePrint.svelte.ts)
// away from the page's main thread, on the CPU: a canvas of the worker's own
// with willReadFrequently, so the strokes aren't sent to the GPU process to
// draw, which is the cost a print saves.

import type { PrintJob, PrintAnswer, PrintPath } from './platePrint.svelte';

type Ctx = OffscreenCanvasRenderingContext2D;

self.onmessage = async ({ data: job }: MessageEvent<PrintJob>) => {
  const answer: PrintAnswer = { id: job.id };
  try {
    answer.png = await pullPrint(job);
  } catch {
    // (No OffscreenCanvas, say: answered with nothing, and the card keeps its svg.)
  }
  self.postMessage(answer);
};

const sheet = (job: PrintJob) => new OffscreenCanvas(job.size[0], job.size[1]).getContext('2d', { willReadFrequently: true })!;

/** What its svg draws, in its order: the plate's own lines (stopping short of the motif), then the motif's over them. */
async function pullPrint(job: PrintJob): Promise<Blob> {
  const print = sheet(job);
  const own = job.knockout.length ? sheet(job) : print;
  for (const p of job.paths) if (!p.motif) draw(own, p, job);
  if (own !== print) {
    // The motif's shapes taken out of the plate's lines, as their mask does.
    place(own, job);
    own.globalCompositeOperation = 'destination-out';
    own.fillStyle = '#000';
    for (const d of job.knockout) own.fill(new Path2D(d));
    print.drawImage(own.canvas, 0, 0);
  }
  for (const p of job.paths) if (p.motif) draw(print, p, job);
  return print.canvas.convertToBlob({ type: 'image/png' });
}

/** The svg's viewBox onto the print's pixels. */
const place = (g: Ctx, { at }: PrintJob) => g.setTransform(at[0], 0, 0, at[1], at[2], at[3]);

/**
 * One path as its svg draws it: fill, then stroke, at its opacity. A ray
 * faded out from the glory's centre by its mask, or a path both filled and
 * stroked and not opaque, is drawn alone first and laid on at its opacity,
 * as Chrome draws the path's own layer.
 */
function draw(g: Ctx, p: PrintPath, job: PrintJob) {
  const faded = p.fade && job.fade;
  const alone = faded || (p.fill && p.stroke && p.opacity < 1);
  const on = alone ? sheet(job) : g;
  on.save();
  place(on, job);
  on.globalAlpha = alone ? 1 : p.opacity;
  const path = new Path2D(p.d);
  if (p.fill) {
    on.fillStyle = p.fill;
    on.fill(path);
  }
  if (p.stroke && p.width > 0) {
    on.strokeStyle = p.stroke;
    on.lineWidth = p.width;
    on.lineCap = p.cap;
    on.lineJoin = p.join;
    on.miterLimit = p.miter;
    on.stroke(path);
  }
  if (faded) {
    // Its mask: the glory's gradient, dark to light and back, over the viewBox.
    const { c, from, r } = job.fade!;
    const fade = on.createRadialGradient(c[0], c[1], 0, c[0], c[1], r);
    if (from) fade.addColorStop(from / r, 'rgba(0,0,0,0)');
    fade.addColorStop(Math.max(0.35, (from + 22) / r), '#000');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    on.globalCompositeOperation = 'destination-in';
    on.fillStyle = fade;
    on.fillRect(0, 0, job.view[0], job.view[1]);
  }
  on.restore();
  if (!alone) return;
  g.save();
  g.globalAlpha = p.opacity;
  g.drawImage(on.canvas, 0, 0);
  g.restore();
}
