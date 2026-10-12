// Cuts veiled pictures' patches (veilCut.ts) away from the page's main
// thread: working out the shapes from the labels as a question begins, and
// each patch's picture as it uncovers (many at once at the reveal), held the
// page up just as its effects were playing.

import { placeOf, VeilCut, type OwnVeil, type PatchPlace, type VeilWire } from './veilCut';

export type VeilJob =
  /** A veiled picture to cut, from the wire or the host's own; answered with its patches' places. */
  | { t: 'cut'; key: number; wire: VeilWire; own?: OwnVeil }
  /** Patch `i`'s picture; answered with a bitmap. */
  | { t: 'picture'; id: number; key: number; i: number }
  /** A new question: the pictures cut so far are done with (`key`: only that one). */
  | { t: 'forget'; key?: number };

export type VeilAnswer =
  /** A cut's places (null: its labels don't fit it), or why it couldn't be cut here. */
  | { t: 'cut'; key: number; places?: PatchPlace[] | null; error?: string }
  | { t: 'picture'; id: number; bitmap?: ImageBitmap; error?: string };

const answer = (a: VeilAnswer, transfer: Transferable[] = []) => self.postMessage(a, { transfer });

const cuts = new Map<number, VeilCut<OffscreenCanvas>>();

self.onmessage = async ({ data: job }: MessageEvent<VeilJob>) => {
  if (job.t === 'forget') {
    if (job.key === undefined) cuts.clear();
    else cuts.delete(job.key);
    return;
  }
  if (job.t === 'cut') {
    try {
      const cut = new VeilCut(job.wire, (w, h) => new OffscreenCanvas(w, h), job.own);
      cuts.set(job.key, cut);
      const shapes = cut.shapes();
      // Decoded now, while the question is starting, rather than as the first patch uncovers.
      if (shapes) cut.decode().catch(() => {});
      answer({ t: 'cut', key: job.key, places: shapes?.map(placeOf) ?? null });
    } catch (err) {
      answer({ t: 'cut', key: job.key, error: String(err) });
    }
    return;
  }
  try {
    const cut = cuts.get(job.key);
    if (!cut) throw new Error('forgotten');
    const bitmap = (await cut.picture(job.i)).transferToImageBitmap();
    answer({ t: 'picture', id: job.id, bitmap }, [bitmap]);
  } catch (err) {
    answer({ t: 'picture', id: job.id, error: String(err) });
  }
};
