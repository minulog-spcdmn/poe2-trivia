# Arcane style: engraved alchemist's circles

How the rune circle (`src/components/ArcaneCircle.svelte`) and its siblings (the other plates, below) are drawn and moved, written so a new piece in the same style (a sigil, a seal, a loading ring, a frame ornament) comes out right on the first pass. The component is the reference implementation; read it before building anything similar.

## The look in one paragraph

An old copperplate engraving of an alchemist's circle, printed in gold on near black. Fine, sharp, even lines; shading only by hatching; every element built from exact geometry (circles, star polygons, radial rays), never from loose hand-placed curves. Layered and dense like a real grimoire plate (band of seals and script, a woven star, a sun, an eye), but each element reads on its own because lines never cross a seal or a symbol; they stop short of it, as an engraver would draw around it. A soft glow sits under the lines, never on them. Dark fantasy (Path of Exile 2): solemn and ancient, not cute, not neon, not sci-fi HUD.

## What reads as cheap (avoid)

These all came up and were rejected while iterating:

- Random scribbles posing as runes, and ring "rulers": tick marks, dot dividers, extra thin outer rings with nothing in them.
- Readable text, in any language. It pulls the eye. Use an invented script of alchemical marks instead (see below).
- Thick or rounded strokes, and a heavy or wide glow. Lines must look cut, not painted.
- Hand-placed wavy curves (flame rays drawn as Béziers). They look wonky next to exact geometry. Generate every shape from the circle's symmetry.
- Cartoon details: lashes as spikes, a big solid pupil, emoji-like symbols.
- Lines running through seals and symbols.
- Too few elements (a bare pentagram in two rings) looks like clip art; the references are dense plates.

## Palette and weight

- Colour: `currentColor`, default `#d9a45a` (old gold). States tint it: right `#d8dfa0`, wrong `#d98a6e`. Shown at low opacity behind content (0.22 on the question stage, 0.16 to 0.3 by state; 0.3 to 0.6 elsewhere).
- Stroke widths in a 200 × 200 viewBox (centre 0, 0): main 0.5, thin 0.35, hair 0.22, hatching 0.2, symbols 0.42. Butt caps and miter joins (limit 12) for geometry; round caps and joins only for small symbols and hatching.
- A symbol drawn at k times its size keeps the same line: `stroke-width: calc(0.42px / var(--k, 1))` with `--k` set on the scaled element.
- Glow: a second copy of the same SVG under the lines with stroke width 2 (1 for hair and hatching), opacity breathing between 0.1 and 0.28 over 6 s. The glow copy is drawn without wear, so a nick in the line reads as worn metal rather than a black cut.

## Composition (viewBox -100 to 100)

From the outside in. Radii are what worked; keep the proportions when scaling.

1. **Band** (r 81 to 94, plus a lone hairline ring at 97.5).
   - Seven seals on the band's middle circle (r 87.5), each a double ring (r 7.2 and 6.0) holding one of the seven classical planets: ☉ gold, ☽ silver, ☿ quicksilver, ♀ copper, ♂ iron, ♃ tin, ♄ lead, drawn as small SVG paths (not font glyphs).
   - The band's rings are broken where they meet a seal.
   - Between seals: an unreadable script, written as a language would be (`src/lib/tongue.ts`, below), each line justified to fill its span.
2. **Heptagram** {7/2}, points just inside the band (R = 79.2), offset half a step from the seals.
   - Each line is a strap: two parallel lines 0.8 either side of the centre line.
   - Straps meet at the points with true miters (outer edges meet beyond the point, inner edges short of it).
   - Woven: walking the star in drawing order, the straps go over and under in turn at each crossing; the strap underneath is cut 0.7 clear of the one on top.
   - A circle inside the star's central heptagon, just clear of the straps.
3. **Sol and Luna**: two larger double-ringed seals (r 13) at r 65.5, top and bottom, between the inner circle and the band.
   - Sol: a disc with a centre dot and 12 rays, long and short in turn.
   - Luna: a crescent shaded in horizontal hatching.
   - The star's lines stop at their edges.
4. **Sun** around the centre, base ring r 31 (doubled at 29.4).
   - 14 pointed rays alternating long and short, all placed from the heptagram's geometry. The 7 long ones point at the star's tips and reach into its arms (to r 71), passing under the inner circle and the straps. The 7 short ones stop at the inner circle.
   - Each ray has a centre ridge and is hatched down one side (spacing 0.55).
   - 14 fine straight rays between them.
5. **Compass star**, eight points (long 28.5, short 22) standing on the eye's ring (r 15), each with a ridge and hatched down one side (spacing 0.6).
6. **The eye**, an engraved Eye of Providence that never turns.
   - Almond from corner (-12, 0) to (12, 0); upper lid peaking at -6.6, lower at 5.4, each a circular arc.
   - Lids drawn double: a rim line above the upper lid (-7.7) and below the lower (6.1), with short strokes across the upper lid between edge and rim.
   - The lid's shadow on the eyeball: four arcs under the upper lid, each shorter than the last.
   - Iris r 6.2 at (0, -1), so the upper lid hoods it slightly. Inside it:
     - a second ring 0.7 in;
     - 44 radial streaks, long and short in turn;
     - a wavy collarette at r 3.5;
     - a solid pupil (r 2.2) with a small round catchlight cut out (even-odd fill).
   - Everything inside the almond is clipped to it.
   - A glory of 72 fine rays from just off the lids out to the ring, long and short in turn, the long and the short swelling and shrinking out of step.

## Engraving techniques

- **Compute, don't place.** Every line is generated from the circle's symmetry: `at(angle, r)` gives a point clockwise from the top.
- **Cut, don't overlap.** One clipping routine does it all:
  - lines are clipped analytically against "holes" (circles around seals), against straps (an underpass), and against rings (a radial line passing under a ring);
  - rings are broken where they meet a hole;
  - the result is a list of pieces, so a broken line is still one stroke for the animation.
- **Hatching**: parallel lines across a triangle, parallel to one of its sides (`hatch(o, l, t, gap)`). Use it on rays, star points and the crescent. Hatch one side only; that is what makes it read as relief.
- **Wear**: a nick every 30 units or so, each 0.4 to 1.2 units long, from a fixed seed so every instance looks the same. Only on main lines and rings, never on symbols or hatching.
- **No seams**: join the arc that ends at the top of a ring to the one that starts there, close full circles with `Z`, and give `<circle>` round caps (its drawing dash has ends even though the circle doesn't).

## Motion

### Layers

Each layer is a separate absolutely positioned element holding two SVGs (glow and lines), turned as a whole so the browser composites it without repainting:

| Layer | Turn | Direction | Winds in from |
| --- | --- | --- | --- |
| Band | 240 s | clockwise | -24° |
| Heptagram, Sol, Luna, sun rays | 160 s | counter-clockwise | +40° |
| Sun rings, compass star | 100 s | clockwise | -70° |
| Glory, eye | still | | |

Use the `rotate` property for the endless turn and `transform` for the entrance wind, so the two animations combine. Never animate inside a layer while it idles; the glow breathes by changing the glow SVG's opacity.

### Entrance: a summoning in about 2.3 s

It plays every time the circle mounts (every question), so the shape has to read within about a second.

| Time (s) | What happens |
| --- | --- |
| 0 | A soft light blooms at the centre (radial gradient, scale 0.15 to 0.9, fades out over 1.5 s); the whole circle settles from scale 1.06. |
| 0.05 to 0.9 | Eye ring, sun rings and compass star draw, inner first. |
| 0.3 to 1.2 | The inner circle draws; the heptagram is traced strap by strap (strap i at 0.4 + 0.09·i, 0.5 s each). |
| 0.55 to 1.65 | The band's rings sweep round (0.1 s apart, 1.1 s each). |
| 0.7 to 1.4 | Sun rays shoot out from the centre, one after another round the circle (0.035 s apart). |
| 0.95 to 1.5 | Planet seals are stamped in round the band (scale 1.6 to 1, fading in, 0.07 s apart); Sol at 1.0, Luna at 1.12. |
| 1.15 to 2.0 | The script is written round the band, mark by mark. |
| 1.35 | The glory draws. |
| 1.55 to 2.35 | The eye opens (vertical scale 0.05 to 1 with a slight overshoot). |
| 0.8 to 2.2 | The glow swells (to 0.42, settling at 0.28), then breathes. |

- Lines draw with `pathLength="100"`, `stroke-dasharray: 100` and an animated `stroke-dashoffset`.
- A broken line (pieces between nicks, holes and underpasses) must not draw each piece from its own start, or it looks like scattered dashes. The browser restarts the dash at every subpath, so give each piece its own `<path>` with a delay and duration taken from where it sits along the whole. The pen then sweeps once, eased (fast start, slow end), and runs on across the gaps (`stroke()` in the component).
- Symbols fade in 0.3 s after their lines.
- Once drawn, a layer gives way to its still copy, and nothing may move at that moment. A ring drawn as two half arcs is the trap: rounding its ends to two places a hair closer than its radius swings each half's middle well off to one side, so the ring bulges into an oval. The engraver writes such an arc's radii a hair short of what its ends need, so the browser fits it exactly (`radii()` in `src/lib/engraver.ts`, `tests/engraver.test.ts`), and a seal's sign drawn at 1.1 times its size keeps its line in the still copy (`.big`).

### Keeping it light

The circle mounts with every question and some six hundred lines draw in, so how it is built matters as much as how it looks:

- **Built once.** The geometry and the markup are made once per page load (`<script module>`), as strings, and each circle puts them on the page with `{@html}`; six hundred Svelte elements, each with its own styles to set, took tens of ms to mount.
- **Each layer when it is due.** A layer's lines go on the page 0.2 s before the first of them draws (the heart and the eye at once, the star at 0.1 s, the band at 0.35 s, the glory at 1.15 s), so the frame that shows the question carries only the heart. The layer's SVGs say how late they came (`--late`), and every delay in the drawing subtracts it, so the summoning plays exactly as if all of it had been there from the start.
- **Still once drawn.** When a layer's last line is drawn, its pieces give way to a still copy: the same lines merged into one path per weight (`main`, `thin`, `hair`, `hatch`, `sign`), with the seals' and the script's transforms worked into the path data, and no animation on any of them. It looks the same; but a finished animation keeps holding its last frame, so every piece would otherwise be styled again whenever the circle's colour changes (the reveal), and listed by every `document.getAnimations()` for as long as the question is up.
- **Colour changes at once.** The strokes all take `currentColor`; easing it restyles and repaints every stroke in every frame of the change. The reveal's flare covers the jump.
- A new piece that draws in should do the same: its pieces as markup made once, swapped for a merged still copy when drawn.
- **Heavy plates built when needed.** The other plates (below) take longer to compute than the eye (up to some 100 ms for Delve's); each builds its plate the first time a circle of it mounts, or sooner in an idle moment when a page about to show it asks (`warmCircle` in `src/components/circles.ts`: the game warms the coming question's circle and those that may stand at its end, `gameCircles.ts`; the Codex its collection's as its page loads and its other pages' once open), never during the page's first frames, and never for a circle the page won't show.
- All of this machinery is shared: `src/lib/engraver.ts` builds a layer's markup and its still copy (`engrave`, `stroke`, seals), and `src/components/ArcaneStage.svelte` puts the layers on the page when due, turns them, lays the glow under them and plays the bloom, the reveal's flare and wave and the wrong answer's jar. A circle gives the stage its layers (each with its own turn) and draws its still heart itself.

### State changes

- **Right answer**: a flare at the centre and a ring of light running out over the circle (scale 0.2 to 1.15, fading); the colour warms to pale gold; the pupil widens (scale 1.3).
- **Wrong answer**: the rotating layers jar (a 0.7 s rotation shudder of ±2.5° settling out); the colour cools to rust and dims; the pupil narrows (0.72).
- **At rest**: the eye blinks about every 9 s (vertical scale to 0.06 and back in about 0.3 s).
- Reduced motion is handled globally (`app.css` cuts animation durations), so nothing extra is needed.

## How to iterate quickly

- Prototype variants side by side in one throwaway HTML page and screenshot it with Playwright before touching the app. Judge at full size (600 px) and at the smallest real use (212 px on the victory screen).
- Zoom into one area at 3× device scale to check line quality, weaving and clipping.
- To check motion, pause every animation at fixed times (`document.getAnimations().forEach(a => { a.pause(); a.currentTime = t })`) and screenshot each frame. Step through 30 frames per second and join them with `ffmpeg` to see the whole sequence.
- Headless Chromium renders in software, so frame rates measured there say little; just keep idle motion to transforms and opacity.

## Brief for a new piece

> Make it in the engraved alchemist's circle style described in `docs/arcane-style.md` (reference: `src/components/ArcaneCircle.svelte`): gold `currentColor` on dark, fine sharp lines (0.2 to 0.5 in a 200 unit viewBox), shading by one-sided hatching only, exact computed geometry, lines stopping short of every seal and symbol, a soft unbroken glow under worn lines, alchemical iconography (planets, sun, moon, star polygons, an engraved eye), an unreadable invented script instead of text, layers turning slowly at their own speeds, and a short choreographed entrance where lines draw themselves from the centre outward.

## The script

The script nobody can read (`src/lib/tongue.ts`, `inscribe`) reads as writing, not a row of symbols, because it behaves like a script:

- Twenty invented letters share a body: they hang from a headline and stand on a baseline, a few rise above it or drop below, each has its own width. Within a word the headline runs on over the letters, joining them (as in Devanagari or the Theban alphabet). None may read as a Latin letter; redraw one that does.
- A few letters are used often and most seldom, as in a real alphabet; no letter twice running.
- Words come from one fixed vocabulary of 90, of one to seven letters, mostly three to six; a few recur often, most are rare, so every circle writes in the same tongue. A small lozenge ends a phrase every few words.
- A line holds whole words only, its spaces evened out so it runs its full span. Where a line has to end early, the line runs on as a double rule to whatever stops it, as a scribe fills out a short line, rather than leaving a gap.

## The other plates

The rune circle has four siblings, the same craft in other compositions, so one circle isn't behind everything. Each keeps every rule above (weights, glow, wear, cutting, hatching, the summoning's pace, its layers turning their own ways), and each has its own silhouette (a heptagram, a square over a hexagram, the rose of Venus's five loops, three interlaced rings, a heptagon walling a triangle), so they never read as one drawing reshuffled. Each is built around an idea of its own, not the eye circle's template reskinned: that read as cheap copies.

Where each one stands:

| Place | Circle |
| --- | --- |
| A question (not Delve) | The eye, the monad, the rose or the moth, a different one from question to question and never the same twice running (`circleAt` in `src/components/circles.ts`, `src/lib/turns.ts`), the same for every player |
| Today's unique | The same four, a different one from day to day, never the same two days running |
| A Delve question, the Codex's Delve page | The black sun |
| A Delve's end, where everyone perished | The moth |
| The end of a game (not Delve) | The monad or the eye, at random |
| The codex item window | The eye |
| The Codex's collection | The monad |
| The Codex's achievements | The rose |

Every heart has a living part of its own (the eye's glance, the monad's turning sun, the rose's window and its swelling star), so none needs a solid point at the very centre. The stage's `point` is there for a plate that does: set last with an overshoot, swelling at a right answer (1.6) and shrinking at a wrong one (0.6) as the pupil does, and at rest beating about every 9 s instead of a blink.

### Motion within a ring

Besides each ring's own turn, a part can move on its own while its ring carries it (`StageLayer` in `ArcaneStage.svelte`: a layer `within` another, about its own `pivot`), still a box moved on the compositor:

- **Upright**: it turns back against its ring as fast as the ring turns, so it travels round but keeps its way up. Suns and moons have a right way up and keep it: the eye's Sol and Luna and the band's Luna, the rose's moons, Delve's eclipses; and the rose's seals and its cipher wheel, and the monad's seals (its angels, its letters, its great seal) stand upright.
- **Turning about its own centre**: the eye's Sol turns slowly sunwise in his upright seal, as does the monad's sun within its ring; the inner ring of the rose's cipher wheel turns in its seal; the monad's ouroboros chases its tails head first; Delve's eclipse coronas and its black sun turn slowly.
- **Swaying**: the monad's moon rocks on its sun.
- **Breathing**: rays in two sets, long and short, swell and shrink a few percent out of step, so neighbouring rays keep changing length against each other (Delve's coronas, the eye's glory); or in sectors one after another, so a slow swell runs round (the monad's glory). Only rays that end in the open: rays that pass under a strap or a band would show where they are cut.
- **Giving way**: rays whose ends something on another layer turns past (the monad's glory under the ouroboros' heads, its square's glory under the band's seals) carry that thing's outline as a mask (`mask` on a `StageLayer`). The masked layer sits in a box turning with the layer it gives way to, which carries the mask as a CSS image, inside a box turning back the same, so the rays stay where they are and only the mask moves, all on the compositor; a ray is cut short only while something passes over it. Mask only what needs it: the square's own corners and the great seal are set to clear the band's seals instead.
- **Never**: anything whose lines are cut to fit something on another layer (a find breaking out of its seal ring, rays passing under bands) stays as it is set. And no blinking or flashing: the circles' light only breathes.

### The monad's circle

`src/components/MonadCircle.svelte`, the squared circle, John Dee's plate:

- **Band**: the archangels of the four quarters (Michael, Gabriel, Samael, Raphael) in great seals at the quarters, each by the character the Heptameron (1559) gives him, written on a line as a name is signed, upright as the band turns; wider than the band, so its rings break round them; the script runs in four long lines between.
- **Square** (corners at r 76, mitred out to 77.6, clear of the band's seals): triple straps (two edges and a hairline between) laid over a glory of 72 fine rays from the inner circle to the band, which pass under the square and give way to the band's seals as they pass. In each space between the square and the band, the monad taken apart as Dee builds it: the moon's cup (above), the sun with its point (right), the ram's horns (below), the cross of the elements (left). Over the square's upper left corner, the plate's one great seal and the one thing off its quarters: the squared circle after Maier (Atalanta fugiens, emblem XXI), a circle, a triangle, a square, a circle and its point, upright.
- **Inner circle** (doubled), holding the Seal of Solomon: two triangles woven over and under (`wovenPolygons` in `src/lib/arcane.ts`), each point with a ridge and hatched down one side, and between the points six letters of Dee's angelic alphabet, after his 1583 manuscript, upright.
- **The ouroboros** over the Seal's middle, the straps passing under it: the descent's two snakes (`src/lib/ouroborosArt.ts`), each biting the other's tail, at the woodcut's own weights (bodies stroked, heads cut solid), mirrored to run clockwise and laid across the diagonal, so the heads keep to no quarter.
- **Heart**, inside the ouroboros, still and upright and large: John Dee's hieroglyphic monad, the sun round the point, streaked within, the moon's cup above, the cross and the ram's horns below, each stroke with a hairline beside it on its shadow side (light from the upper left), in a glory of 64 rays that start just clear of it and run down into the moon's cup.
- **Motion**: band 220 s counter-clockwise, square 150 s clockwise, the Seal 110 s counter-clockwise, the ouroboros 300 s clockwise; the seals upright; the sun's face turning 80 s sunwise, the moon rocking on it; a swell running round the glory, its rays giving way to the snakes' heads. The summoning goes the ouroboros coiling in from its necks, the Seal strap by strap and its letters stamped, the square laid side by side as its glory shoots out under it and its seals stamped, the band swept and the angels stamped, the script written, the heads cut and their eyes opened, and last the monad engraved stroke by stroke, the sun's face and point last.

### The rose

`src/components/RoseCircle.svelte`, the rose of Venus and sub rosa, under the rose, the old sign of what is kept secret:

- **Band**: the moon's eight phases in seals, for the octaeteris (eight years after which the moon's phases and Venus come round together): full at the top, new at the bottom, waning down the right and waxing up the left, so light and dark lie unevenly round the circle; each drawn flat, the dark part cut in level strokes (never curved shading, which reads as a 3D globe); the script between them.
- **The Sun's round** (r 73), a strap, and within it **Venus's path** as seen from the Earth, from her real periods (13 of her years to 8 of ours) and the real size of her orbit: an epitrochoid of five loops, drawn as a strap woven over and under itself, running in under the Sun's round wherever she is further out than he is.
- **Seals in her five petals**, upright: below, the plate's one great seal, a cipher wheel (Alberti, Trithemius) laid over the petal and the Sun's round, a fixed ring of the script's letters round a ring that turns (`glyph` in `src/lib/tongue.ts`), an index, an eight-pointed star at its hub; above, the seal of Hagith (the Arbatel's Olympic spirit of Venus) and the nine chambers (AIQ BKR), the cipher such seals are written in; at the sides, Venus's two geomantic figures, Puella and Amissio, their points cut solid.
- **Heart**: the rose made stone, a Gothic rose window struck with the compass: ten slender lancets radiating from the oculus, each closed by an equilateral pointed arch with a moulding inside; ten great roundels between their heads, each cusped into a pointed quatrefoil; a small plain roundel beyond each head; Venus's morning star in the oculus, five points ridged and hatched down one side. Between her five loops, five rays from its ring, ridged and hatched down one side, in a glory of fine rays that keeps to the open heart.
- **Motion**: band 240 s counter-clockwise, the path 160 s clockwise, the window 100 s counter-clockwise, the oculus 60 s clockwise with the star swelling and ebbing in it; the moons, the seals and the wheel upright, the wheel's inner ring turning 70 s; the glory breathing in two sets.

### The black sun (Delve)

`src/components/BlackSunCircle.svelte`, the nigredo, built of great sweeping rings rather than straight lines:

- **Three great bands**, interlaced as the Borromean rings are (each over the next, under the one after), the script written along the middle of each, passing under the band above. A fine line echoes each band along its outside.
- **The finds**, as on their cards (`src/lib/findEngraving.ts`), in great seals where each band swings out furthest: a crown of azurite prisms round a crystal seen end on, the flare's burst, the small ring blown apart. Each breaks out of its seal's ring, which is cut where it crosses; everything else stops short of what breaks out.
- **The glory**: fine rays in three lengths from the heart to the bands, under them, closer in the curved triangles where two rings overlap and fading outward there.
- **Three eclipses** in seals set into the rim between the finds, breaking only the rim's inner line: the sun going dark, bitten, half gone, nearly gone (the darkest opposite the dynamite), as an eclipse is watched, the moon coming in from the right. The light left is cut in close strokes, the moon left dark. A double line, the sun's path, joins them on a circle and passes under the bands; outside it, by each sun, a line of the script, run out to the band or seal in a double rule.
- **The black sun** at the heart, the eclipse whole: a void ringed in light, its corona even (long and short) as far as the heart's narrowest reach, so it fits as it turns.
- **Motion**: the rings 240 s counter-clockwise as one; the black sun turning slowly against them; the eclipses upright, their coronas turning sunwise; the coronas breathing.

## Shared pieces

- `src/lib/alchemy.ts` holds the signs (small marks, Sol's rays, Luna's crescent, the hatched elements for seals); `src/lib/arcane.ts` holds the engraver's routines in a general form: lines and rings broken at holes and under straps or rings (also in pieces, `lineParts`/`ringParts`, for drawing in), arcs, wear, one-sided hatching, pointed rays, woven star polygons {n/m}, woven compound polygons (`wovenPolygons`: the Seal of Solomon, a square of straps) and eight-pointed stars. New pieces should build on them rather than copy the circle's code.
- The achievements' seals (`src/components/AchievementSeal.svelte`) are the band's planet seals grown into badges: a worn double ring round a sign, a glory of fine rays between them on the harder ones (16, or 32 with a third ring round the sign), struck in the tier's metal, the alchemist's way from lead through copper and silver to gold; lead, for the very easy ones, is a dark, dull grey whose glow is a soft paler sheen, so it reads as metal rather than stone, and keeps the outer ring alone; silver is near white with a bright white lustre, so the two never meet. Gold is pale gold over a deep amber glow, like gilding. Now and then light passes over an earned seal, in the way of its metal (`METALS` in `src/lib/metals.ts`, run by `src/lib/glint.ts`, the same glint as on the creator's gold-foil name): a slanted slit holding a pale copy of the lines slides across while the copy slides back, both transforms, so nothing repaints and nothing moves between passes; a pass lights only the seals on screen, and none while motion is reduced or the effects are off. Lead gleams seldom, slowly and faintly in a wide soft band; copper warmly; silver in a quick, narrow white flash; gold in a warm sweep that leaves a small four-pointed spark flaring on its rim. Every seal of a metal catches the same light, each metal on its own beat, reaching seals further down the page a moment later. Earned, the lines sit on the glow; not yet, the seal is a dull impression whose outer ring is cut bright as far as its progress has come. Their signs are the planets, the marks and, in `src/lib/alchemy.ts`, more classic ones drawn from exact geometry: the Seal of Solomon woven over and under, the {7/2} star, the philosopher's stone, the eye, the hour, sublimation, the pelican, two linked rings, the retort, and the zodiac's signs as Ripley's twelve gates (Aries, Gemini, Cancer, Scorpio, Aquarius' waves, Pisces); Venus, sulphur and the ouroboros come from the planets, the marks and the descent. Where two strands cross, the one beneath stops short of the one on top. Only the tiers of one achievement share a sign.
- The category cards (`src/lib/cardEngraving.ts`, drawn by `CardEngraving.svelte`) use this craft (fine exact lines, one-sided hatching, lines stopping short, a soft glow) but not the circle's composition: they are tarot cards, not circles, with no script or planet glyphs. The face is a window: a round arch with keystone and imposts, Sol and Luna in hatched spandrels, a glory of fine rays behind the emblem over a fluted pedestal, and a nameplate. The back is a diamond lattice with a mandorla holding a sun and two crescents. The site's filigree stays on their corners.
