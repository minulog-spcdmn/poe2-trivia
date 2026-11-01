// What may animate what's painted with no layer of its own, and why: the
// list tests/ownLayers.test.ts reads (docs/qa.md, “Redraws”).

/**
 * The animations of what's painted (anything but a transform or opacity) on
 * an element with no layer of its own, which tests/ownLayers.test.ts lets
 * through, and why: each draws again, every frame it runs, the layer it's
 * painted on, so each says how much that is, from the redraw check where it
 * measured it. A new one gets will-change instead, unless it's as small.
 */
export type Painted = PaintedCss | PaintedCall;

/** A stylesheet's: its keyframes, run by the rules with these selectors (each as the stylesheet writes it, on one line). */
export interface PaintedCss {
  /** The stylesheet (a component's, or a .css file), from the repository's root. */
  file: string;
  /** Its names; `var(--name)` for one named through a var() set where the test can't read it (the markup). */
  keyframes: string[];
  selectors: string[];
  why: string;
}

/** A script's element.animate() (or a function that passes keyframes on to it, as the zone card's play). */
export interface PaintedCall {
  /** The script (a .ts file, or a component), from the repository's root. */
  file: string;
  /**
   * The functions it's in (the nearest name round it: a function, a method,
   * a const; else the call it's handed to, as onMount), and the painted
   * properties it animates there (box-shadow, filter; `?` for keyframes the
   * test can't read).
   */
  animate: { in: string[]; props: string[] };
  why: string;
}

/** How a zone's title card brings its letters in and takes them away: each family's (src/components/zonecard/). */
const LETTERS =
  'Once, as a zone’s title card plays (each new zone, about 6 s): a letter of the name blurred or lit as it comes in or goes, on its own span (a letter of a name set at most 4.75 rem), with its transform and opacity, which Chrome runs beside it on the compositor as it does the timer’s lamp.';

export const PAINTED: Painted[] = [
  // ---- once, as something shows: small, and over in a second or less
  {
    file: 'src/app.css',
    keyframes: ['filigree-in', 'edge-light'],
    selectors: ['.panel::before', ".panel[role='dialog']::after"],
    why: 'Once, as a panel rises (0.5 s, its corner filigree drawn out) or a dialog opens (0.9 s, the light along its edge): a pseudo-element on the panel, nothing under it moving.',
  },
  { file: 'src/components/codex/CodexMedallion.svelte', keyframes: ['fill-arc'], selectors: ['.arc'], why: 'Once, 1.6 s, as a medallion’s arc fills in the codex: a ring of a few dozen px.' },
  { file: 'src/components/DailyStreak.svelte', keyframes: ['warm'], selectors: ['.streak'], why: 'Once, 0.45 s, as the streak warms on the start page: the streak’s own small box.' },
  {
    file: 'src/components/NamePlate.svelte',
    keyframes: ['spark'],
    selectors: ['.lit.glint .spark'],
    why: 'Once, about a second, as a right answer’s spark runs along a name plate’s rules: thin strokes, but at the screen’s rate (181k px a 60th of a second at 240 Hz, the plate moment with it): #340.',
  },
  { file: 'src/components/Inventory.svelte', keyframes: ['lit', 'crumble'], selectors: ['.count.lit .grow', '.count.blown .grow', '.count.blown.left .grow'], why: 'Once, about a second, as a find in the pack lights up or crumbles: its count’s small icon.' },
  { file: 'src/components/RunsChart.svelte', keyframes: ['sink'], selectors: ['.shaft'], why: 'Once, as the chart’s shafts sink in on the end screen: each shaft its own clip.' },
  { file: 'src/components/Scoreboard.svelte', keyframes: ['down', 'bump'], selectors: ['.down', '.bump'], why: 'Once, 0.7 s, as a score changes: one number’s colour and glow.' },
  { file: 'src/components/TimerRing.svelte', keyframes: ['flare-up'], selectors: ['.flaring span'], why: 'Once, 0.8 s, as the clock flares: its number’s glow, inside the ring (56 × 56).' },
  {
    file: 'src/components/Toasts.svelte',
    keyframes: ['ignite', 'burn'],
    selectors: ['.toast', '.fuse'],
    why: 'A toast’s edge kindling once (1.4 s), and its fuse burning down for as long as it shows: a line 1 px tall on the toast, now and then over a game.',
  },
  { file: 'src/components/VerdictSign.svelte', keyframes: ['draw'], selectors: ['path'], why: 'Once, 0.35 s, as the verdict’s sign draws itself: one small svg path.' },
  {
    file: 'src/components/QuestionView.svelte',
    keyframes: ['verdict-in', 'verdict-sheen', 'verdict-ripple', 'verdict-flare', 'verdict-word', 'key-ripple'],
    selectors: ['.verdict', '.verdict::after', '.glyph', '.word', ':is(.option, .tile).mine:not(:disabled):hover .key::after'],
    why: 'Once, under a second, as the verdict shows (its box, its glyph, its word) or an option’s key is hovered: the verdict’s own box, about 300 × 60.',
  },
  { file: 'src/components/Phial.svelte', keyframes: ['shatter', 'blown'], selectors: ['.piece', '.blown .piece'], why: 'Once, under a second, as a phial shatters: its pieces.' },
  {
    file: 'src/components/Game.svelte',
    keyframes: ['past-in', 'arrive', 'arrive-line'],
    selectors: ['.past-text', '.banner h2', '.banner h2.start'],
    why: 'Once, 0.7 to 0.9 s, as the banner’s heading arrives (each turn) and the line past it: measured in the deal, the heading (h2.start, 384 × 114) drawn again for about a third of the deal’s frames, 17k px a frame, the most of the deal’s baseline.',
  },
  { file: 'src/components/Lobby.svelte', keyframes: ['mode-off', 'mode-on'], selectors: ['.mode', '.mode.on'], why: 'No time at all (0 s): the WebGL backdrop’s fill for a mode, set as it changes.' },
  {
    file: 'src/components/ChooseCategory.svelte',
    keyframes: ['kindle', 'kindle-plain', 'kindle-gilt', 'kindle-gilt-plain', 'swell'],
    selectors: [
      '.turn:global(.dealt) .icon',
      '.turn:global(.kindling.plain) .icon',
      '.card.out .turn:global(.dealt) :global(.gilt)',
      '.card.out .turn:global(.kindling.plain) :global(.gilt)',
      '.card.out .turn:global(.dealt) :global(.engraving > :is(.window, .glow, .lines))',
    ],
    why: 'Once, 0.9 to 1.6 s, as a turn’s cards are dealt: an emblem’s kindle, or the way out’s gilt and swell. Where the faces are sharp (Chromium’s tall cards) each has a layer of its own (rule 7 in docs/category-cards.md), in an @media and under .sharp, which the test can’t take for always; elsewhere (Firefox, Safari, the rows on narrow screens) the face is drawn at its own size with no sharp filter: a card (220 × 300 times the cards’ zoom), or a row.',
  },
  {
    file: 'src/components/DelveLadder.svelte',
    keyframes: ['var(--holes)'],
    selectors: ['.glow', '.plate'],
    why: 'Once, as a star is stamped on the ladder: its hole in the plate’s and the glow’s masks carved (0.5 s), and the gold one’s carried down with it (1 to 2.1 s). The descent-hole keyframes, named in the markup (holesMotion): each the ladder’s whole svg, drawn again while it runs.',
  },
  // ---- for as long as it shows
  {
    file: 'src/components/DelveLadder.svelte',
    keyframes: ['comet', 'reveal', 'draw', 'blend-stroke', 'blend-fill', 'blend-halo', 'blend-glory'],
    selectors: ['.hot', '.reveal', '.draw', '.both-star .glory', '.both-star :is(.star-line, .star-ridge, .star-hatch)', '.both-star .star-ground', '.both-star .halo'],
    why: 'The ladder draws itself once as it shows (the comet, the reveal, the stars’ lines); a star for two bests drifts from gold to red and back, 7 s each way, for as long as it shows: a star’s lines on the ladder.',
  },
  { file: 'src/components/GameOver.svelte', keyframes: ['ignite'], selectors: ['.ranking li.first'], why: 'Once, 1.2 s, as the winner’s row is set down: its edge kindles (its border’s colour), the row’s own box.' },
  { file: 'src/components/Phial.svelte', keyframes: ['glint'], selectors: ['.glint'], why: 'A phial’s glint runs along its edge now and then, for as long as it shows: a stroke 16 px long on a small svg.' },
  {
    file: 'src/components/QuestionView.svelte',
    keyframes: ['glow'],
    selectors: ['.option.pending'],
    why: 'An option picked and waiting for the verdict glows, 1 s a breath, for the moment the verdict takes: the WebGL backdrop’s shadow under it (custom properties it reads), not drawn by Chrome.',
  },
  {
    file: 'src/components/TimerRing.svelte',
    keyframes: ['lamp'],
    selectors: ['.lamp .fill'],
    why: 'A vein’s lamp, the clock’s ring, flickers for as long as the clock runs: measured at rest in game/delve-dig, Chrome gives its circle a layer while the filter runs (56 × 56, a filter it animates by itself), and nothing is drawn again on most frames.',
  },
  {
    file: 'src/components/ChooseCategory.svelte',
    keyframes: ['pulse'],
    selectors: ['.card.special.mine .frame'],
    why: 'A find’s card you can pick breathes, 3.2 s a breath, for as long as the cards lie there: its soft shadow alone (--bs1), which the WebGL backdrop draws (data-bs-on swaps Chrome’s copy for none), so Chrome draws nothing; without WebGL, Chrome draws the shadow round the card.',
  },
  {
    file: 'src/components/ChooseCategory.svelte',
    keyframes: ['menace'],
    selectors: ['.card.dm.mine .frame'],
    why: 'A deathmatch card you can pick throbs, 2.4 s a breath, for as long as the cards lie there: its shadow (the WebGL backdrop’s) and the ring inset in its face (--bs-ring, Chrome’s), so the face is drawn again each frame: where faces are sharp, its own layer (its 3D transform) at twice its size; elsewhere, what it lies on. Not yet measured by the redraw check; a layer of its own can’t make it smaller, as the ring is the face’s own.',
  },
  // ---- played from a script (element.animate)
  {
    file: 'src/components/QuestionView.svelte',
    animate: { in: ['timer'], props: ['filter'] },
    why: 'Once, 0.8 s, as a veiled picture comes in whole before the reveal: the picture’s box (.veil, its patches), the art at most 1.8 times its own size. No layer of its own: its seams’ fire (.frontier, screen) blends with what’s behind the picture, which a layer would shut it off from.',
  },
  {
    file: 'src/lib/glint.ts',
    animate: { in: ['pass'], props: ['-webkit-mask-position', 'mask-position'] },
    why: 'A light crossing the creator’s name (1.4 s every 9 s) or an achievement’s seal (now and then): the slit’s mask slides, the slit (a name’s line, a seal) drawn again while it crosses, and nothing between passes.',
  },
  {
    file: 'src/lib/dialogIn.ts',
    animate: { in: ['play'], props: ['?'] },
    why: 'A Svelte transition played on a dialog Svelte doesn’t make (the privacy sheet, LegalSheet.svelte): its keyframes sampled from the transition’s css, which the test can’t read; dialogIn’s and dialogOut’s are opacity and transform alone.',
  },
  { file: 'src/spatialPage/Menu.svelte', animate: { in: ['flash'], props: ['box-shadow'] }, why: 'A dev page’s (spatial.html), never the game’s: 0.7 s, the shadow round an option or a score row as a sound plays from it.' },
  { file: 'src/components/zonecard/family.ts', animate: { in: ['enterDefault', 'exitDefault'], props: ['filter'] }, why: LETTERS },
  { file: 'src/components/zonecard/ember.ts', animate: { in: ['enter', 'exit'], props: ['filter'] }, why: LETTERS },
  {
    file: 'src/components/zonecard/ember.ts',
    animate: { in: ['enter'], props: ['clip-path'] },
    why: 'A fire zone’s letters cut off at its fissure till the name locks: one clip held (both keyframes the same), so nothing changes from frame to frame.',
  },
  { file: 'src/components/zonecard/fume.ts', animate: { in: ['enter', 'exit'], props: ['filter'] }, why: LETTERS },
  { file: 'src/components/zonecard/light.ts', animate: { in: ['enter', 'exit'], props: ['filter'] }, why: LETTERS },
  { file: 'src/components/zonecard/rime.ts', animate: { in: ['enter'], props: ['filter'] }, why: LETTERS },
  { file: 'src/components/zonecard/spore.ts', animate: { in: ['enter', 'exit'], props: ['filter'] }, why: LETTERS },
  { file: 'src/components/zonecard/void.ts', animate: { in: ['enter'], props: ['filter'] }, why: LETTERS },
  {
    file: 'src/components/zonecard/ZoneCard.svelte',
    animate: { in: ['animate'], props: ['filter', 'letter-spacing'] },
    why: 'Once, as a zone’s title card plays: its meta line (“Depth 10 • Zone II”, 0.5 s) and its subtitle (0.6 s) tracking out of a blur, each a line of small text laid out again while it runs.',
  },
  {
    file: 'src/components/zonecard/ZoneCard.svelte',
    animate: { in: ['animate'], props: ['stroke-dashoffset'] },
    why: 'Once, 0.4 to 0.6 s, as a zone’s title card’s divider is struck out under the name: its rules, an svg 12 px tall.',
  },
  { file: 'src/components/zonecard/ZoneSeal.svelte', animate: { in: ['draw'], props: ['stroke-dashoffset'] }, why: 'Once, about 1.3 s, as a zone’s seal draws itself on its title card: its rings and sigil, an svg 36 to 72 px across.' },
  { file: 'src/components/zonecard/NewsMark.svelte', animate: { in: ['onMount'], props: ['stroke-dashoffset'] }, why: 'Once, 0.3 s, as what’s new on a zone’s title card gets its mark: the mark’s rings, a small svg in a box 6.5 rem wide.' },
];
