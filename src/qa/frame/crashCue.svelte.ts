// A crash a scene sets off (its { crash } step): Crash.svelte, inside the
// app's error boundary (Root.svelte), throws as often as asked, so crash
// recovery shows as the game handles it.

export const crash = $state({ left: 0 });
/** What the crashes say, so the frame's checks don't count them (checks.ts). */
export const CRASH_MESSAGE = 'A crash the QA desk set off';
