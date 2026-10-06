// The zone banner's three candidate designs (src/components/zonebanner), to
// be compared on the preview page (zones.html, src/zonebanner) before one
// takes ZoneMark's place in the game.

export type ConceptId = 'chisel' | 'threshold' | 'embers';

export type Concept = {
  id: ConceptId;
  name: string;
  /** One line on what it is. */
  blurb: string;
  /** What of the head gives way while it shows: the kicker's line (always), and the banner's rules. */
  veilsRules: boolean;
  /** How long it takes to leave once told to (ms), before it can be removed. */
  exit: number;
};

export const CONCEPTS: Concept[] = [
  {
    id: 'chisel',
    name: 'Chisel',
    blurb: 'The name cut into the dark letter by letter, sparks and dust; grooves scored in, the sigil struck as a mason’s mark.',
    veilsRules: false,
    exit: 1150,
  },
  {
    id: 'threshold',
    name: 'Threshold',
    blurb: 'A waystone gate rises over the depth: columns, a lintel lit with the name, the sigil on its keystone.',
    veilsRules: true,
    exit: 1050,
  },
  {
    id: 'embers',
    name: 'Embers',
    blurb: 'The zone’s embers rise off a spark-drawn rule and gather into the name, then break loose and drift away.',
    veilsRules: false,
    exit: 1200,
  },
];

export const conceptOf = (id: ConceptId) => CONCEPTS.find((c) => c.id === id)!;

/** How long it holds once in (ms), before it is told to leave: as the game's mark is held. */
export const HOLD = 3600;
/** Seconds after the stage appears before it starts (the stage fades in first, as in Game.svelte). */
export const START_DELAY = 0.35;
