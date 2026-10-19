// The daily's streak badge (components/DailyStreak.svelte), under a mock of
// Today's unique's answers: burning for any run of days, up the ladder's
// colours (DAILY_LADDER, lib/fx/streaks.ts), with the answer that grows it
// and the miss that ends it.

import type { PieceBench } from '../bench.ts';
import { DAILY_LADDER } from '../../lib/fx/streaks.ts';

export const streak: PieceBench = {
  kind: 'piece',
  key: 'streak',
  label: 'Daily streak',
  about: "Today's unique's streak badge for any run of days, every colour of its ladder.",
  files: ['src/components/DailyStreak.svelte', 'src/lib/fx/streaks.ts', 'src/lib/fx/moments.ts'],
  controls: [{ kind: 'range', key: 'days', label: 'Days in a row', min: 0, max: 1000, default: 7 }],
  states: [
    { label: 'No run', values: { days: 0 } },
    ...DAILY_LADDER.flatMap((f, i) => [
      ...(i > 0 ? [{ label: `The day before ${f.name} (${f.from - 1})`, values: { days: f.from - 1 } }] : []),
      { label: `${f.name[0].toUpperCase()}${f.name.slice(1)} (${f.from})`, values: { days: f.from } },
    ]),
  ],
  actions: [
    { key: 'right', label: 'Answer right', hint: '+1 day: it grows, bursting at a new colour' },
    { key: 'miss', label: 'Miss', hint: 'the run ends in a puff of smoke' },
  ],
  view: () => import('./StreakView.svelte'),
};
