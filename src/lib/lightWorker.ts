// Works Delve's light table out (lib/descent.ts, lightTables) away from the
// page's main thread, the whole of it, handing it over a stretch at a time
// as each is done, with the strata it read (see lib/lightsAhead.ts).

import { lightTables, type LightTable } from './descent.ts';

export type LightAnswer = { table: LightTable };

self.onmessage = () => {
  for (const table of lightTables()) {
    const { hall, rest, k, light, level } = table;
    self.postMessage({ table } satisfies LightAnswer, { transfer: [hall.buffer, rest.buffer, k.buffer, light.buffer, level.buffer] });
  }
};
