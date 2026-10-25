// Draws the descent's plate (descentPlate.ts) away from the page's main
// thread: as the lobby first shows, drawing it took a fifth of that frame.

import { descentPlate, type Plate } from './descentPlate';

/** The plate to draw: descentPlate's arguments, as plain data. */
export type DescentJob = { id: number; args: Parameters<typeof descentPlate> };
/** The plate, or why it couldn't be drawn here. */
export type DescentAnswer = { id: number; plate?: Plate; error?: string };

self.onmessage = ({ data: { id, args } }: MessageEvent<DescentJob>) => {
  try {
    self.postMessage({ id, plate: descentPlate(...args) } satisfies DescentAnswer);
  } catch (err) {
    self.postMessage({ id, error: String(err) } satisfies DescentAnswer);
  }
};
