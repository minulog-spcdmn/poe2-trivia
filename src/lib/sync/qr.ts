// The QR code a device shows the others (SyncDialog): its pairing link
// (lib/sync/code.ts codeLink), as one SVG path of its dark modules, each
// row's runs drawn as one rectangle. Medium error correction, so a phone
// reads it off a screen with glare on it.

import { encode } from 'uqr';

export interface QrShape {
  /** Modules across, its border of four (the quiet zone scanners need) included. */
  size: number;
  /** The dark modules. */
  path: string;
}

export function qrShape(text: string): QrShape {
  const { data, size } = encode(text, { ecc: 'M', border: 4 });
  let path = '';
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (!data[y][x] || (x > 0 && data[y][x - 1])) continue;
      let run = 1;
      while (x + run < size && data[y][x + run]) run++;
      path += `M${x} ${y}h${run}v1h-${run}z`;
    }
  return { size, path };
}
