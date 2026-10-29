# The category cards

The cards a player picks a category from (`src/components/ChooseCategory.svelte`; bench: `cards.html`, in the dev hub). Read this before changing how a card looks or moves. `tests/cardFaces.test.ts` checks the rules below that can be read from the CSS.

## How a face is drawn

- **Sharp faces, in Chromium only** (Chrome, Edge, Chrome on Android; `.sharp`, from `'userAgentData' in navigator`). Each face is laid out at `zoom: 2`, shrunk back by `scale: 0.5`, and filtered (`SHARP_KERNEL`, a windowed sinc) before Chrome shrinks it, so its fine engraving holds still as it tilts instead of shimmering. Firefox and Safari (every browser on iOS) draw the cards as they always were. Only the tall cards are sharp; the rows on narrow screens never tilt.
- **Anything new on a face is sharp by itself**: a new category, find or card kind, text, an icon, engraving. Write its CSS in ordinary px; the zoom is handled.
- **Code that measures inside a face** reads zoom through `lib/stage` (`zoomOf` for what's on screen, `layoutZoomOf` for what's laid out), never `currentCSSZoom` alone: the face's own zoom is taken back by its scale (`data-sharp`).
- **The tilt** eases after the pointer in script (`tiltTo`), once the hover's lift is over: a CSS transition restarted on every move had Chrome redraw the whole card each time.
- **The plates are printed, on Chromium's tall cards** (`print`, `lib/platePrint.svelte.ts`). Chrome draws svg strokes on its GPU process's main thread, and paths as wide as a card go through its software path renderer, a mask made on the CPU for each path in each tile: a frame of 25 to 37 ms with every hand dealt, at 4K. So each still layer of a side (its glow, its lines) is drawn once, in a worker, into an image the size of the device pixels it covers, kept for the visit and shown in place of its svg. See “The plates' prints” below.

## Rules when changing a card

1. **A new state that moves the face** (like chosen, faded, voted) gets a twin in the sharp block (`.sharp .card.<state> .frame`), its transform starting `perspective(900px) rotateX(0.01deg)`. Chrome keeps the twice-size drawing only under a 3D transform; under a flat one the filter blurs the face. Keep the same order of functions in every state, so they animate into each other. (Tested.)
2. **The face's `filter` is the sharp filter's.** A state that filters the face (like the dim) does it on another element in the sharp block (the dim is on `.sides`) and leaves the face `filter: var(--face-filter)`. (Tested.)
3. **Each image on a card stands alone on its element, written out.** Chrome repaints a card's whole face on every frame it tilts if an image on it comes through `var()`, or shares an element's background with gradients: five times the GPU's time a frame. Nothing looks wrong; it only costs. The grain is `.grain`, written out in the CSS; the corner filigree is `.corners`, its images written on it from the script (`corners`). Gradients alone may use `var()`. (Tested.)
4. **The corner filigree comes from `--filigree` in `app.css`**, its four images in the order top left, top right, bottom left, bottom right, each 30px. Change that order or size there and `.corners` must follow. (Tested.)
5. **A transition on the face goes in the frame's one list** (`.frame`'s `transition`); while it tilts only its transform's part changes (`--tilt-transition`).
6. **The face's shrink (`scale: 0.5`) stays in a rule of its own** (`.sharp .turn > .frame`), apart from every rule that sets its `transform`. The build's minifier (Lightning CSS) folds a `scale` beside a `transform` into it, or drops it, and the live cards come out twice their size while the dev server shows them right. (Tested, in `tests/minifiedTransforms.test.ts`, for every component.)

## The plates' prints

- **Where**: only where Chrome rasters the card at its laid-out size whatever its transform, so a print is drawn pixel for pixel and stays as sharp as the strokes: the sharp faces (always under a 3D transform, rule 1) and the backs (seen only under the deal's 3D turn). A row's face takes flat transforms, which Chrome rasters larger as it grows (chosen, 1.05), and Firefox and Safari raster as they like; they keep the svg.
- **From the svg**: the svg is drawn until its print is ready, and the print is pulled from it: each path's fill, stroke, width, caps, joins and opacity as they're styled, the rays' fade and the motif's knockout. Its placing is the svg's own (its group's `getCTM()`, times the zoom): the box's size in CSS px is rounded to 1/64 px, which put the foot of a face a thirtieth of a pixel out.
- **What moves goes on the layer**: a print is drawn once, so what changes over time (the glow's breathing, the way out's swell, the engraving's opacity as it's hovered) goes on `.glow`, `.lines` or `.engraving`, which the print keeps, not on their paths. Something new on a path (a dash, a filter, `stroke-opacity`) needs teaching to `pathsOf` and the worker first.
- **Kept**: by plate (`engrave` keeps one per side, size and variant), device size, zoom and ink, a few sizes each; a size the window passes through as it's resized isn't printed until it holds still. A hand dealt at a size seen before shows its prints at once; the first is printed before its faces turn up.
- **The look**: frame for frame, a face at 4K matches its strokes to within a level or two (a mean of 0.05 levels, the moon's outline at most 11). Strokes under a device pixel wide (a back's hatching at 4K, a face's on a 1x screen) come out a shade dimmer, under 3% of their light (a back's densest hatching at 4K: 50.4 levels to the strokes' 51.8), as the CPU draws hairlines a little thinner than the GPU; their sharpness is the strokes' own.
- **What it saved**: at 4K 240 Hz, the GPU process's playback of a deal's first draw fell from 16 to 41 ms to 2 to 4 ms, and its longest frame from 21 to 50 ms to 8 to 21 (two runs of six deals each, before and after).

## Checking a change

- Look at it on the bench (`cards.html`), at rest, hovered and tilted, in Chrome, and once in Firefox or Safari.
- A change to the plates: the bench's Live strokes draws them as svg strokes, as Firefox and Safari do, to compare with their prints.
- For the shimmer and the tilt's cost, the measures are in `docs/handoff/anti-aliasing/` (README, “The sharp faces”, and `harness/`). Tilting measured 1.0 ms of GPU time a frame at 4K 150%; much more means a rule above is broken.
