// The still mode: every animation cut short, nothing endless started, the
// effects off, each thing simply standing in its place. It began as the
// game's answer to a system that asks for reduced motion. But Windows says
// so whenever its own animations are switched off, a common tweak to make
// it feel faster, and a player with it got a game that looked dead, with
// nothing in the settings to say why: a streamer showed it so. No player
// gets it now, whatever their system says, and there's no setting for it:
// the game is its motion (the owner's call). What costs a battery, the
// battery saver stops (lib/motion.svelte.ts).
//
// It stays for the checks, which shoot and compare screens that hold still
// and don't wait on entrances. A browser driven by a script
// (navigator.webdriver: Playwright's, as the sweep, the QA desk's before
// and after and the headless checks launch it) that asks for reduced motion
// gets it, as it always did. So does a page marked before this loads: the
// lab's switch (src/lab/motion.ts).
//
// In CSS it is written as ever, @media (prefers-reduced-motion: reduce),
// which the build turns into the mark set here, html[data-still]
// (stillMark.ts). In script, read STILL, or motion.still where it's used in
// markup or an effect (lib/motion.svelte.ts); nothing else asks the system
// (tests/still.test.ts).

const root = typeof document === 'undefined' ? null : document.documentElement;
const asked = typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)')?.matches;
const driven = typeof navigator !== 'undefined' && !!navigator.webdriver;

/** Whether the page is held still, for as long as it lives: settled as this loads, before anything is drawn. (A test's made-up page may have no such calls.) */
export const STILL = !!root?.hasAttribute?.('data-still') || (asked && driven);
if (STILL) root?.setAttribute?.('data-still', '');
