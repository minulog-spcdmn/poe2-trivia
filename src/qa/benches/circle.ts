// The rune circles (docs/arcane-style.md, components/circles.ts), each as
// large as the end screen draws its own, whole beside hollow (as behind the
// end screen's one avatar) with an avatar over its heart; answered right or
// wrong; and where each one stands in the game, read from the list the game
// reads (lib/circlePlaces.ts). The desk's Replay draws it in again.

import type { PieceBench } from '../bench.ts';

export const circle: PieceBench = {
  kind: 'piece',
  key: 'circle',
  label: 'Rune circles',
  about: 'Each arcane circle at full size, whole beside hollow round an avatar, right and wrong, and where it stands in the game.',
  files: [
    'src/components/circles.ts',
    'src/components/ArcaneStage.svelte',
    'src/components/ArcaneCircle.svelte',
    'src/components/MonadCircle.svelte',
    'src/components/RoseCircle.svelte',
    'src/components/BlackSunCircle.svelte',
    'src/components/ForbiddenCircle.svelte',
    'src/lib/plates/index.ts',
    'src/lib/plates/eye.ts',
    'src/lib/plates/monad.ts',
    'src/lib/plates/rose.ts',
    'src/lib/plates/moth.ts',
    'src/lib/plates/blackSun.ts',
    'src/lib/circlePlaces.ts',
    'src/lib/engraver.ts',
    'src/lib/drawIn.ts',
  ],
  controls: [
    {
      kind: 'choice',
      key: 'circle',
      label: 'Circle',
      default: 'eye',
      options: [
        { value: 'eye', label: 'Eye' },
        { value: 'monad', label: 'Monad' },
        { value: 'rose', label: 'Rose' },
        { value: 'moth', label: 'Moth' },
        { value: 'blackSun', label: 'Black sun' },
      ],
    },
    {
      kind: 'choice',
      key: 'side',
      label: 'Drawn',
      default: 'both',
      options: [
        { value: 'both', label: 'Whole beside hollow' },
        { value: 'whole', label: 'Whole' },
        { value: 'hollow', label: 'Hollow (round one avatar)' },
      ],
    },
    { kind: 'toggle', key: 'avatar', label: 'An avatar in the hollow', default: true },
    {
      kind: 'choice',
      key: 'mood',
      label: 'Answered',
      default: 'idle',
      options: [
        { value: 'idle', label: 'Not yet' },
        { value: 'good', label: 'Right' },
        { value: 'bad', label: 'Wrong' },
      ],
    },
  ],
  states: [
    { label: 'Eye', values: {} },
    { label: 'Monad', values: { circle: 'monad' } },
    { label: 'Rose', values: { circle: 'rose' } },
    { label: 'Moth', values: { circle: 'moth' } },
    { label: 'Black sun', values: { circle: 'blackSun' } },
    { label: 'Eye, answered right', values: { mood: 'good', side: 'whole' } },
    { label: 'Eye, answered wrong', values: { mood: 'bad', side: 'whole' } },
    { label: "The end screen's monad", values: { circle: 'monad', side: 'hollow' } },
    { label: 'Everyone perished (the moth)', values: { circle: 'moth', side: 'hollow' } },
  ],
  actions: [
    { key: 'good', label: 'Answer right', hint: 'the flare; its colour warms' },
    { key: 'bad', label: 'Answer wrong', hint: 'it jars, cools and dims' },
    { key: 'idle', label: 'Back to rest' },
  ],
  view: () => import('./CircleView.svelte'),
};
