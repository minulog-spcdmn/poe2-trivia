// Works the name plate's weave out (lib/weave.ts) away from the page's main
// thread: on an iPhone it held the page some 60 ms there, in the tap that
// opened the codex's first item window.

import { weavePath } from './weave.ts';

/** The tile's path; none if it couldn't be worked out here. */
export type WeaveAnswer = { d?: string };

self.onmessage = () => {
  try {
    self.postMessage({ d: weavePath() } satisfies WeaveAnswer);
  } catch {
    self.postMessage({} satisfies WeaveAnswer);
  }
};
