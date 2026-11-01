// What may animate what's painted with no layer of its own, and why: the
// list tests/ownLayers.test.ts reads (docs/qa.md, “Redraws”).

/**
 * The animations of what's painted (anything but a transform or opacity) on
 * an element with no layer of its own, which tests/ownLayers.test.ts lets
 * through, and why: each draws again, every frame it runs, the layer it's
 * painted on, so each says how much that is, from the redraw check where it
 * measured it. A new one gets will-change instead, unless it's as small.
 */
export interface Painted {
  /** The stylesheet (a component's, or a .css file), from the repository's root. */
  file: string;
  keyframes: string[];
  why: string;
}

export const PAINTED: Painted[] = [
  // ---- once, as something shows: small, and over in a second or less
  { file: 'src/app.css', keyframes: ['filigree-in', 'edge-light'], why: 'Once, as a panel rises (0.5 s, its corner filigree drawn out) or a dialog opens (0.9 s, the light along its edge): a pseudo-element on the panel, nothing under it moving.' },
  { file: 'src/components/codex/CodexMedallion.svelte', keyframes: ['fill-arc'], why: 'Once, 1.6 s, as a medallion’s arc fills in the codex: a ring of a few dozen px.' },
  { file: 'src/components/DailyStreak.svelte', keyframes: ['warm'], why: 'Once, 0.45 s, as the streak warms on the start page: the streak’s own small box.' },
  { file: 'src/components/NamePlate.svelte', keyframes: ['spark'], why: 'Once, about a second, as a right answer’s spark runs along a name plate’s rules: thin strokes, but at the screen’s rate (181k px a 60th of a second at 240 Hz, the plate moment with it): #340.' },
  { file: 'src/components/Inventory.svelte', keyframes: ['lit', 'crumble'], why: 'Once, about a second, as a find in the pack lights up or crumbles: its count’s small icon.' },
  { file: 'src/components/RunsChart.svelte', keyframes: ['sink'], why: 'Once, as the chart’s shafts sink in on the end screen: each shaft its own clip.' },
  { file: 'src/components/Scoreboard.svelte', keyframes: ['down', 'bump'], why: 'Once, 0.7 s, as a score changes: one number’s colour and glow.' },
  { file: 'src/components/TimerRing.svelte', keyframes: ['flare-up'], why: 'Once, 0.8 s, as the clock flares: its number’s glow, inside the ring (56 × 56).' },
  { file: 'src/components/Toasts.svelte', keyframes: ['ignite', 'burn'], why: 'A toast’s edge kindling once (1.4 s), and its fuse burning down for as long as it shows: a line 1 px tall on the toast, now and then over a game.' },
  { file: 'src/components/VerdictSign.svelte', keyframes: ['draw'], why: 'Once, 0.35 s, as the verdict’s sign draws itself: one small svg path.' },
  { file: 'src/components/QuestionView.svelte', keyframes: ['verdict-in', 'verdict-sheen', 'verdict-ripple', 'verdict-flare', 'verdict-word', 'key-ripple'], why: 'Once, under a second, as the verdict shows (its box, its glyph, its word) or an option’s key is hovered: the verdict’s own box, about 300 × 60.' },
  { file: 'src/components/Phial.svelte', keyframes: ['shatter', 'blown'], why: 'Once, under a second, as a phial shatters: its pieces.' },
  {
    file: 'src/components/Game.svelte',
    keyframes: ['past-in', 'arrive', 'arrive-line'],
    why: 'Once, 0.7 to 0.9 s, as the banner’s heading arrives (each turn) and the line past it: measured in the deal, the heading (h2.start, 384 × 114) drawn again for about a third of the deal’s frames, 17k px a frame, the most of the deal’s baseline.',
  },
  { file: 'src/components/Lobby.svelte', keyframes: ['mode-off', 'mode-on'], why: 'No time at all (0 s): the WebGL backdrop’s fill for a mode, set as it changes.' },
  // ---- for as long as it shows
  { file: 'src/components/DelveLadder.svelte', keyframes: ['comet', 'reveal', 'draw', 'blend-stroke', 'blend-fill', 'blend-halo', 'blend-glory'], why: 'The ladder draws itself once as it shows (the comet, the reveal, the stars’ lines); a star for two bests drifts from gold to red and back, 7 s each way, for as long as it shows: a star’s lines on the ladder.' },
  { file: 'src/components/GameOver.svelte', keyframes: ['ignite'], why: 'Once, 1.2 s, as the winner’s row is set down: its edge kindles (its border’s colour), the row’s own box.' },
  { file: 'src/components/Phial.svelte', keyframes: ['glint'], why: 'A phial’s glint runs along its edge now and then, for as long as it shows: a stroke 16 px long on a small svg.' },
  { file: 'src/components/QuestionView.svelte', keyframes: ['glow'], why: 'An option picked and waiting for the verdict glows, 1 s a breath, for the moment the verdict takes: the WebGL backdrop’s shadow under it (custom properties it reads), not drawn by Chrome.' },
  { file: 'src/components/TimerRing.svelte', keyframes: ['lamp'], why: 'A vein’s lamp, the clock’s ring, flickers for as long as the clock runs: measured at rest in game/delve-dig, Chrome gives its circle a layer while the filter runs (56 × 56, a filter it animates by itself), and nothing is drawn again on most frames.' },
];
