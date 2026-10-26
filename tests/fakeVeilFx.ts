// A stand-in for the effects a veiled patch's burn sets off (lib/fx/moments)
// and the stage's zoom (lib/stage), for tests/materialize.test.ts
// (fakeModule, tests/asVite.ts): each spark and flare noted, the zoom 1.

/** What was set off, in order: ['spark', x, y, lean x, lean y, heat] and ['ignite', x, y, size]. */
export const fired: (string | number)[][] = [];

type Point = { x: number; y: number };
export const veilSpark = (at: Point, lean: Point, heat: number) => void fired.push(['spark', at.x, at.y, lean.x, lean.y, heat]);
export const veilIgnites = (at: Point, size: number) => void fired.push(['ignite', at.x, at.y, size]);
export const fxDensity = () => 0.8;
export const zoomOf = () => 1;
