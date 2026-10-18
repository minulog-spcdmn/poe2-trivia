// The people and items scenes are made of: the same names, colours and ids
// in every scene, as the handoff's boards draw them.

import type { Player, Spectator } from '../../lib/game.ts';
import { CREATOR } from '../../lib/site.ts';
import { RUBY } from '../../lib/palette.ts';
import { sceneEngine } from './engine.ts';

/** Each name's colour seat (lib/palette.ts), as the boards draw them; the creator's is ruby. */
const HUES: Record<string, number> = { Kalguur: 0, Doryani: 1, 'Una of the Vaal': 2, Rog: 3, Alva: 4, Dannig: 5, 'Hooded One': 6, Zelina: 7, Oswin: 8, Finn: 9, 'Sekhema Asala': 10, Renly: 11, [CREATOR]: RUBY };
/** A name's player id. */
export const pid = (name: string) => 'id-' + name.toLowerCase().replace(/[^a-z0-9]/g, '');
export const player = (name: string, score = 0, connected = true): Player => ({ id: pid(name), name, score, recent: [], connected, hue: HUES[name] ?? (name.length * 7) % RUBY });
export const spectator = (name: string, stay = false): Spectator => ({ id: pid(name), name, ...(stay ? { stay: true as const } : {}) });
/** An item's id by its name. */
export const id = (name: string) => {
  const it = sceneEngine().items.find((i) => i.name === name);
  if (!it) throw new Error(`No item named ${name}`);
  return it.id;
};
