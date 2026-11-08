// PoE2's 1.0 countdown (components/LaunchCountdown.svelte), the hourglass
// between the Gladiator and the Shadow, at any time before and after: while
// GGG has named only the day (days by the player's own calendar, the sand run as
// far as it has come from their announcement, then the day before and the day
// itself, the Shadow coming out of the shadow, a pinch of sand still falling)
// and once they name the hour (the last two days in hours, then minutes, then
// seconds, the Shadow out by the hour over the last day), and out, the sand
// run and the Shadow in the light; as the start page has it, or the hourglass
// alone as the header does.
// Its clock runs on from the time set, so the last minutes tick down live.
// Its place on the start page and in the header is the screens' (Start page,
// In a game).

import type { PieceBench } from '../bench.ts';

export const launch: PieceBench = {
  kind: 'piece',
  key: 'launch',
  label: 'Launch countdown',
  about: 'PoE2’s 1.0, drawn: an hourglass between the Gladiator and the Shadow, its sand the time left, at any time before and after the launch, with the hour named or not. Hover it for its note.',
  files: ['src/components/LaunchCountdown.svelte', 'src/lib/hourglass.ts', 'src/lib/launch.ts'],
  cell: 320,
  controls: [
    { kind: 'toggle', key: 'hour', label: 'GGG has named the hour', default: false },
    { kind: 'range', key: 'days', label: 'Days to go', min: -8, max: 60, default: 36 },
    { kind: 'range', key: 'hours', label: 'And hours', min: 0, max: 23, default: 0 },
    { kind: 'range', key: 'minutes', label: 'And minutes', min: 0, max: 59, default: 0 },
    { kind: 'toggle', key: 'header', label: 'As in the header', default: false, view: true },
    { kind: 'toggle', key: 'phone', label: 'As on a phone', default: false, view: true, when: { header: [false] } },
  ],
  states: [
    { label: 'Weeks to go, no hour named yet', values: { days: 36 } },
    { label: 'The day before', values: { days: 1 } },
    { label: 'The day itself', values: { days: 0 } },
    { label: 'Hour named: weeks to go', values: { hour: true, days: 35, hours: 23 } },
    { label: 'Hour named: the last two days', values: { hour: true, days: 1, hours: 5, minutes: 12 } },
    { label: 'Hour named: the last day, the Shadow coming out', values: { hour: true, days: 0, hours: 6 } },
    { label: 'Hour named: the last two minutes, then seconds', values: { hour: true, days: 0, minutes: 2 } },
    { label: 'Out', values: { days: -1 } },
  ],
  view: () => import('./LaunchView.svelte'),
};
