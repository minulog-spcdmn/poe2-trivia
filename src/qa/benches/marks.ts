// The answer's marks at the reveal: an answer tile's ✓ or ✕ in a fine line
// (components/AnswerMark.svelte) on a mock of the tile it lands on, and the
// verdict's seal (components/VerdictSign.svelte) as the verdict chip wears it
// or, grown, as a wrong answer's face-down token. Replay cuts them again.

import type { PieceBench } from '../bench.ts';

export const marks: PieceBench = {
  kind: 'piece',
  key: 'marks',
  label: 'Answer marks',
  about: "The answer tile's ✓ and ✕ drawn on in a fine line, and the verdict's seal on the chip and the face-down token.",
  files: ['src/components/AnswerMark.svelte', 'src/components/VerdictSign.svelte', 'src/lib/verdictMarks.ts'],
  controls: [
    {
      kind: 'choice',
      key: 'verdict',
      label: 'Verdict',
      default: 'good',
      options: [
        { value: 'good', label: 'Right' },
        { value: 'bad', label: 'Wrong' },
        { value: 'late', label: 'Out of time' },
      ],
    },
    { kind: 'toggle', key: 'token', label: 'As the face-down token', default: false },
    { kind: 'range', key: 'seal', label: 'Seal', min: 14, max: 96, default: 19, unit: 'px' },
    { kind: 'range', key: 'mark', label: 'Mark', min: 12, max: 64, default: 21, unit: 'px' },
  ],
  states: [
    { label: 'Answered right', values: { verdict: 'good' } },
    { label: 'Answered wrong', values: { verdict: 'bad' } },
    { label: 'Out of time', values: { verdict: 'late' } },
    { label: 'Face down, beside an answer (22)', values: { verdict: 'bad', token: true, seal: 28 } },
    { label: 'Face down, taking a turn (56)', values: { verdict: 'bad', token: true, seal: 62 } },
    { label: 'Close up: right', values: { verdict: 'good', seal: 96, mark: 64 } },
    { label: 'Close up: wrong', values: { verdict: 'bad', seal: 96, mark: 64 } },
    { label: 'Close up: out of time', values: { verdict: 'late', seal: 96, mark: 64 } },
  ],
  cell: 260,
  view: () => import('./MarksView.svelte'),
};
