// Builds the rune circles' plates (src/lib/plates) away from the page's main
// thread, which the effects keep busy enough: each asked for by name, and
// answered as JSON, ready to keep (plateStore.svelte.ts).

import { buildPlate, type PlateKey } from './plates/index.ts';

export type PlateJob = { name: PlateKey };
/** A plate as JSON, or why it couldn't be built here. */
export type PlateAnswer = { name: PlateKey; json?: string; error?: string };

self.onmessage = async ({ data: { name } }: MessageEvent<PlateJob>) => {
  try {
    self.postMessage({ name, json: JSON.stringify(await buildPlate(name)) } satisfies PlateAnswer);
  } catch (e) {
    self.postMessage({ name, error: String(e) } satisfies PlateAnswer);
  }
};
