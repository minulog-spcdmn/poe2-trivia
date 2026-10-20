// Asks whether the browser draws in software (lib/gpuCheck.ts) off the main
// thread, answers once and closes.

import { browserProbe, drawsInSoftware } from './gpuCheck.ts';

let software = false;
try {
  software = drawsInSoftware(browserProbe);
} catch {}
postMessage(software);
close();
