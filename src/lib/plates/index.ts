// Every rune circle's plate, by its name, each loaded only when asked for:
// built in a worker (plateWorker.ts), or on the page where none can run
// (plateStore.svelte.ts). A plate is built whole, or hollow (with
// something set over its heart: the end screen's one avatar), each its own,
// so a circle only ever builds and keeps the one it shows.
export type PlateName = 'eye' | 'monad' | 'rose' | 'blackSun' | 'moth';
/** A plate as kept: its circle's name, and `.hollow` for the hollow one. */
export type PlateKey = PlateName | `${PlateName}.hollow`;

export const PLATES: Record<PlateName, (hollow: boolean) => Promise<unknown>> = {
  eye: async (hollow) => (await import('./eye.ts')).build(hollow),
  monad: async (hollow) => (await import('./monad.ts')).build(hollow),
  rose: async (hollow) => (await import('./rose.ts')).build(hollow),
  blackSun: async (hollow) => (await import('./blackSun.ts')).build(hollow),
  moth: async (hollow) => (await import('./moth.ts')).build(hollow),
};

/** Whether `s` names a circle (a name read from an address, say). */
export const isPlateName = (s: string | null | undefined): s is PlateName => !!s && Object.hasOwn(PLATES, s);
/** The key `name`'s plate is kept under, whole or hollow. */
export const plateKey = (name: PlateName, hollow = false): PlateKey => (hollow ? `${name}.hollow` : name);
/** Builds the plate kept under `key`. */
export const buildPlate = (key: PlateKey) => {
  const [name, mode] = key.split('.') as [PlateName, string?];
  return PLATES[name](mode === 'hollow');
};
