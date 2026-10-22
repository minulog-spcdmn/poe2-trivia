// Delve's zone title card (components/zonecard/ZoneCard.svelte) as a run
// arrives in a zone: any zone's name and family of motion, or another
// family's motion on it, alone or past this device's best. It plays from
// its start the game's own way (lib/zoneArrival.svelte.ts beginArrival),
// over the whole screen, so it plays alone; Replay plays it again, Freeze
// stops it at any moment. Side by side, each state only names its zone.

import type { PieceBench } from '../bench.ts';
import { stratumName } from '../../lib/descent.ts';
import { FAMILY_NAMES, treatmentAt } from '../../lib/zoneTitle.ts';

/** Every zone a card opens, by its first depth (11 to 151), and the widest name a card has to fit. */
export const ZONES = [
  ...Array.from({ length: 15 }, (_, j) => {
    const depth = 10 * (j + 1) + 1;
    return { value: String(depth), label: `${depth} • ${stratumName(j + 1)} (${treatmentAt(depth).family})` };
  }),
  { value: 'wide', label: '101 • Fathomless Firmament (the widest name)' },
];

export const zone: PieceBench = {
  kind: 'piece',
  key: 'zone',
  label: 'Zone card',
  about: "Delve's title card for a new zone, as the run arrives there: each zone's name in its own family of motion, or another's.",
  files: [
    'src/components/zonecard/ZoneCard.svelte',
    'src/components/zonecard/family.ts',
    'src/components/zonecard/families.ts',
    'src/components/zonecard/ember.ts',
    'src/components/zonecard/rime.ts',
    'src/components/zonecard/spore.ts',
    'src/components/zonecard/void.ts',
    'src/components/zonecard/light.ts',
    'src/components/zonecard/fume.ts',
    'src/lib/zoneTitle.ts',
    'src/lib/zoneTitleTiming.ts',
    'src/lib/zoneArrival.svelte.ts',
  ],
  controls: [
    { kind: 'choice', key: 'zone', label: 'Zone', default: '31', options: ZONES },
    {
      kind: 'choice',
      key: 'family',
      label: 'Motion',
      default: '',
      options: [
        { value: '', label: 'Its own' },
        ...FAMILY_NAMES.map((f) => ({ value: f, label: `As ${f}` })),
      ],
    },
    { kind: 'toggle', key: 'best', label: 'Past your best', default: false },
  ],
  states: [
    { label: 'Magma Fissure (ember)', values: { zone: '11' } },
    { label: 'Frozen Hollow (rime)', values: { zone: '21' } },
    { label: 'Fungal Caverns (spore)', values: { zone: '31' } },
    { label: 'Vaal Outpost (light)', values: { zone: '41' } },
    { label: 'Abyssal Depths (void)', values: { zone: '51' } },
    { label: 'Petrified Forest (fume, crumbling)', values: { zone: '61' } },
    { label: 'Sulphur Vents (fume)', values: { zone: '71' } },
    { label: 'The widest name', values: { zone: 'wide' } },
    { label: 'Past your best', values: { zone: '41', best: true } },
  ],
  view: () => import('./ZoneView.svelte'),
};
