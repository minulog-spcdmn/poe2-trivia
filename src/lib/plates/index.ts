// Every rune circle's plate, by its name, each loaded only when asked for:
// built in a worker (plateWorker.ts), or on the page where none can run
// (plateStore.svelte.ts).
export type PlateName = 'eye' | 'monad' | 'rose' | 'blackSun' | 'moth';

export const PLATES: Record<PlateName, () => Promise<unknown>> = {
  eye: async () => (await import('./eye.ts')).build(),
  monad: async () => (await import('./monad.ts')).build(),
  rose: async () => (await import('./rose.ts')).build(),
  blackSun: async () => (await import('./blackSun.ts')).build(),
  moth: async () => (await import('./moth.ts')).build(),
};
