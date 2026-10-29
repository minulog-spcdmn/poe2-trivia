# The category cards

The cards a player picks a category from (`src/components/ChooseCategory.svelte`; bench: `cards.html`, in the dev hub). Read this before changing how a card looks or moves. `tests/cardFaces.test.ts` checks the rules below that can be read from the CSS.

## How a face is drawn

- **Sharp faces, in Chromium only** (Chrome, Edge, Chrome on Android; `.sharp`, from `'userAgentData' in navigator`). Each face is laid out at `zoom: 2`, shrunk back by `scale: 0.5`, and filtered (`SHARP_KERNEL`, a windowed sinc) before Chrome shrinks it, so its fine engraving holds still as it tilts instead of shimmering. Firefox and Safari (every browser on iOS) draw the cards as they always were. Only the tall cards are sharp; the rows on narrow screens never tilt.
- **Anything new on a face is sharp by itself**: a new category, find or card kind, text, an icon, engraving. Write its CSS in ordinary px; the zoom is handled.
- **Code that measures inside a face** reads zoom through `lib/stage` (`zoomOf` for what's on screen, `layoutZoomOf` for what's laid out), never `currentCSSZoom` alone: the face's own zoom is taken back by its scale (`data-sharp`).
- **The tilt** eases after the pointer in script (`tiltTo`), once the hover's lift is over: a CSS transition restarted on every move had Chrome redraw the whole card each time.

## Rules when changing a card

1. **A new state that moves the face** (like chosen, faded, voted) gets a twin in the sharp block (`.sharp .card.<state> .frame`), its transform starting `perspective(900px) rotateX(0.01deg)`. Chrome keeps the twice-size drawing only under a 3D transform; under a flat one the filter blurs the face. Keep the same order of functions in every state, so they animate into each other. (Tested.)
2. **The face's `filter` is the sharp filter's.** A state that filters the face (like the dim) does it on another element in the sharp block (the dim is on `.sides`) and leaves the face `filter: var(--face-filter)`. (Tested.)
3. **Each image on a card stands alone on its element, written out.** Chrome repaints a card's whole face on every frame it tilts if an image on it comes through `var()`, or shares an element's background with gradients: five times the GPU's time a frame. Nothing looks wrong; it only costs. The grain is `.grain`, written out in the CSS; the corner filigree is `.corners`, its images written on it from the script (`corners`). Gradients alone may use `var()`. (Tested.)
4. **The corner filigree comes from `--filigree` in `app.css`**, its four images in the order top left, top right, bottom left, bottom right, each 30px. Change that order or size there and `.corners` must follow. (Tested.)
5. **A transition on the face goes in the frame's one list** (`.frame`'s `transition`); while it tilts only its transform's part changes (`--tilt-transition`).
6. **The face's shrink (`scale: 0.5`) stays in a rule of its own** (`.sharp .turn > .frame`), apart from every rule that sets its `transform`. The build's minifier (Lightning CSS) folds a `scale` beside a `transform` into it, or drops it, and the live cards come out twice their size while the dev server shows them right. (Tested, in `tests/minifiedTransforms.test.ts`, for every component.)
7. **What kindles, swells or breathes on a face has a layer of its own** (`will-change: filter, opacity` under `.sharp`), always. Without one, Chrome draws the face round it again on every frame it changes, at twice its size and through the sharp filter: the emblems' kindle held the GPU for most of a deal (785 ms of drawing for a turn's three cards; 80 with the layer), and the way out's lamp, gilt and swell a tenth of every second it lay there. Always, not only while it plays: a layer let go afterwards redraws the face once more. A find's glow, breathing in opacity alone, the compositor runs by itself (a ms a second). A trace shows the cost (`docs/development.md`, “Frame hitches”). (Tested.)

## Checking a change

- Look at it on the bench (`cards.html`), at rest, hovered and tilted, in Chrome, and once in Firefox or Safari.
- For the shimmer and the tilt's cost, the measures are in `docs/handoff/anti-aliasing/` (README, “The sharp faces”, and `harness/`). Tilting measured 1.0 ms of GPU time a frame at 4K 150%; much more means a rule above is broken.
