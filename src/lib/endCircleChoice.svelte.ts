// The circle behind the end screen picked by hand on its test page
// (endscreen.html, src/endscreenPreview), to see each in place there; null,
// as the game always has it, for the one the game falls to (gameCircles.ts).

import type { PlateName } from './plates/index.ts';

export const endCircleChoice = $state<{ name: PlateName | null }>({ name: null });
