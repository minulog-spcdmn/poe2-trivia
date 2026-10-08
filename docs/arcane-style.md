# Arcane style: engraved alchemist's circles

How the rune circle (`src/components/ArcaneCircle.svelte`) is drawn and moved, written so a new piece in the same style (a sigil, a seal, a loading ring, a frame ornament) comes out right on the first pass. The component is the reference implementation; read it before building anything similar.

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
   - Between seals: an unreadable script. 14 small marks (element triangles, salt, sulphur, antimony, arsenic, dram, crescent, cross, a pen turn, a zigzag, an S), about ±2 units tall, picked from a fixed seed, in "words" of 2 to 4 with wider gaps between words, centred in each span.
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
   - A glory of 48 fine rays from just off the lids out to the ring, long and short in turn.

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

## Shared pieces

- `src/lib/alchemy.ts` holds the signs (the script's marks, Sol's rays, Luna's crescent); `src/lib/arcane.ts` holds the engraver's routines in a general form: lines and rings broken at holes and under straps, arcs, wear, one-sided hatching, pointed rays, woven star polygons {n/m} and eight-pointed stars. New pieces should build on them rather than copy the circle's code.
- The achievements' seals (`src/components/AchievementSeal.svelte`) are the band's planet seals grown into badges: a worn double ring round a sign, a glory of fine rays between them on the harder ones (16, or 32 with a third ring round the sign), struck in the tier's metal, the alchemist's way from lead through copper and silver to gold; lead, for the very easy ones, is a dark, dull grey whose glow is a soft paler sheen, so it reads as metal rather than stone, and keeps the outer ring alone; silver is near white with a bright white lustre, so the two never meet. Gold is pale gold over a deep amber glow, like gilding. Now and then light passes over an earned seal, in the way of its metal (`METALS` in `src/lib/achievements.ts`, run by `src/lib/glint.ts`, the same glint as on the creator's gold-foil name): a slanted slit holding a pale copy of the lines slides across while the copy slides back, both transforms, so nothing repaints and nothing moves between passes. Lead gleams seldom, slowly and faintly in a wide soft band; copper warmly; silver in a quick, narrow white flash; gold in a warm sweep that leaves a small four-pointed spark flaring on its rim. Every seal of a metal catches the same light, each metal on its own beat, reaching seals further down the page a moment later. Earned, the lines sit on the glow; not yet, the seal is a dull impression whose outer ring is cut bright as far as its progress has come. Their signs are the planets, the marks and, in `src/lib/alchemy.ts`, more classic ones drawn from exact geometry: the Seal of Solomon woven over and under, the {7/2} star, the philosopher's stone, the eye, the hour, sublimation, the pelican, two linked rings, the retort, and the zodiac's signs as Ripley's twelve gates (Aries, Gemini, Cancer, Scorpio, Aquarius' waves, Pisces); Venus, sulphur and the ouroboros come from the planets, the marks and the descent. Where two strands cross, the one beneath stops short of the one on top. Only the tiers of one achievement share a sign.
- The category cards (`src/lib/cardEngraving.ts`, drawn by `CardEngraving.svelte`) use this craft (fine exact lines, one-sided hatching, lines stopping short, a soft glow) but not the circle's composition: they are tarot cards, not circles, with no script or planet glyphs. The face is a window: a round arch with keystone and imposts, Sol and Luna in hatched spandrels, a glory of fine rays behind the emblem over a fluted pedestal, and a nameplate. The back is a diamond lattice with a mandorla holding a sun and two crescents. The site's filigree stays on their corners.
