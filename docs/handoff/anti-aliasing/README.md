# Handoff: anti-aliasing of the moving illustrations

The owner asked for “sitewide high quality anti aliasing”, and named where it
shows: **the moving illustrations, the category cards or circles for example**
(jaggies and shimmer). It has to work for every player on every screen, not
for one setup.

A first session (2026-10-25) spent hours and a lot of tokens on it and
**shipped nothing**. This file is what it learnt, what it ruled out, and above
all the mistakes that wasted the time, so the next attempt starts from facts
and doesn't repeat them.

## Where it stands

- **The cards: fixed where it can be** (a second session, the same day,
  `lib/fineMask`; see “What is known about the cards”). The hatching still
  shimmers as the card tilts: the compositor's resample, which no CSS tried
  reaches.
- **The circles:** the cause is measured (below); every cheap fix tried falls
  short, a real repaint every frame is worse, and the one fix left (drawing
  the turning on the GPU) would land on the ideal by construction; it's
  untried and large.

## The mistakes, and the rule each one breaks

1. **Planned before looking.** The session's first move was a large plan (a
   WebGL renderer for every circle and card) built on a theory of the cause,
   before it had reproduced or even watched the shimmer. The theory changed
   three times. *Rule: reproduce the artefact first, in motion, at a size it
   shows, and look at it zoomed; plan nothing before that.*
2. **Reviewed paper plans instead of measuring.** Two rounds of adversarial
   review (each a long subagent run) were spent on plans that rested on
   guesses; each review overturned the plan before it, and neither could
   settle anything, because only a measurement could. *Rule: when the cause
   is unknown, measure; review a plan only once it rests on data.*
3. **Asked the owner to diagnose on their own screen.** The owner had to say
   the fix must work for every player. *Rule: never tune to, or wait on, the
   owner's setup; test across the QA desk's sizes (`src/qa/sizes.ts`), phone
   to 4K.*
4. **Ignored half the request.** The owner named the cards first; the session
   never opened one. *Rule: cover every thing the owner names, starting with
   the first; say early if one is left for later.*
5. **Ran the measurement without checking it measured anything.**
   - Pass one advanced every animation between frames, so the glow's
     breathing and the eye's blink swamped the shimmer (even the ideal render
     “flickered”).
   - Pass two filtered the turning animations by `animationName === 'turn'`,
     which matched nothing (Svelte renames keyframes, `svelte-xyz-turn`), so
     no frame moved; found only after a 10 minute analysis.
   *Rule: smoke-test a measurement on one size and a few frames, and check it
   tells a known difference apart (two frames differ; the ideal beats the
   plain one), before the full run.*
6. **Ran it slowly.** 25 page loads in series, ideal frames at up to 12x
   density, analysis single-threaded; the owner had to ask for it faster.
   *Rule: run independent captures in parallel from the start (the harness
   takes `JOBS`), analyse with every core.*
7. **Showed the owner options the numbers already rejected.** The bench
   comparison put up “edges corrected” (measured at about 10% less flicker,
   so expectedly invisible) and “doubled lines” (measured to blur the
   hatching). The owner saw what the data said: one looks the same, one looks
   bad. *Rule: show the owner only a candidate the numbers say is a real
   improvement; never a comparison to fill time.*
8. **Long status messages, no result.** Hours of explanation and no change
   on screen. *Rule: aim for something working early; keep updates to what
   changed.*
9. **Small slip:** Python's text mode on Windows wrote CRLF into two `.svelte`
   and `.ts` files (caught, fixed). *Rule: write with `newline='\n'` or
   through the Edit tool.*

## What is known about the circles

Measured with `harness/` (below) on the eye circle at its full bench size,
only its turning layers advancing, 1/60 s a frame, on a real GPU. “Flicker”
is the mean second difference between frames in linear light over the lines'
mean light: what is left once smooth motion is taken out. The ideal is the
same circle drawn at 4x density and averaged down in linear light.

| | 1080p (dpr 1) | 1440p (dpr 1) | Phone (dpr 3) |
| --- | --- | --- | --- |
| As now | 0.048 | 0.052 | 0.053 |
| Ideal | 0.029 | 0.037 | 0.038 |
| Edges' coverage gamma-corrected (exp 0.69) | 0.042 | 0.048 | 0.048 |
| Lines drawn at 4x, averaged down, then turned | 0.042 | 0.047 | 0.047 |
| Lines drawn at 2x density, turned | 0.057 | 0.066 | 0.065 |
| Lines doubled at half strength | about the ideal, but the hatching blurs to flat tone |

Laptop (dpr 2) and 4K at 150% gave the same pattern in an earlier pass. (The
4K at 150% ideal run was spoiled by something else animating; ignore it.)

- **Ruled out as the cause:** the settle-in's scale (`.summon`, no
  difference), the hatching (hiding it changes nothing), how finely the lines'
  coverage is worked out (4x supersampled lines are no better than the
  gamma-corrected ones).
- **Likely cause, inferred, not proven:** the browser resampling a layer's
  once-drawn picture every frame as it turns. The “repaint every frame”
  variant (`will-change: auto`) measured the same as now, but with the
  animations paused from script the layers probably stayed composited, so
  that test likely didn't repaint at all.
- **A real repaint every frame is worse** (second session; `repaint` in
  `harness/shoot.mjs`: every animation cancelled, its value set inline, the
  turns set from script each frame, nothing left on the compositor): 0.094
  at 1080p against 0.045 now and 0.029 ideal. Each line is drawn crisp, but
  the hatching's lines, closer than a pixel, alias against each other and
  the moiré crawls; the compositor's resample was hiding it.
- **A 2 s clip of now beside the ideal** at 1080p was made for the owner to
  judge whether the GPU route is worth building (shown pixel for pixel; the
  frames come from `harness/shoot.mjs … fhd now,ref 120`).
- **The gamma correction** (`feComponentTransfer`, alpha gamma 0.69 for a
  circle at the stage's 0.22 strength over the dark backdrop) matches the
  ideal's brightness and keeps the look, but the owner saw no difference.
- **Untried:** drawing the turning on the GPU from a mipmapped texture,
  filtered per frame. If it's built, it belongs in the backdrop renderer
  (`src/lib/backdrop.ts`, behind the UI, already dithered and blurred behind
  dialogs), not the effects overlay (above dialogs). Prove it in the harness
  before building it.

## What is known about the cards

Looked at and measured (`harness/cards.mjs`, `harness/flick.py`) on the card
bench's stage at 1080p, dpr 1, against the same cards drawn at 4x and
averaged down.

- **The jaggy part was the emblem.** Its clean mask (`lib/iconFit`, baked at
  424 to 848 px) is drawn at 120 to 200 device px on a dpr 1 screen, and
  Chrome shrinks a CSS mask that far with no proper filtering: hard
  stair-steps on the outline, at rest too, which crawl as the card tilts or
  the emblem turns on hover. Fixed by `lib/fineMask`: each mask area-averaged
  to a little over its drawn size, in quarter-octave steps. The outline is
  then smooth (a shade softer than the ideal: the browser still places the
  copy between pixels; a copy at exactly the drawn size was no crisper).
- **Item art masked as it comes is fine** (the codex's glyphs, game over's):
  its edges are soft, it shrinks smoothly; the fix was tried there and
  taken out again.
- **The rest of the card is near the ideal at rest.** Text, engraving and
  border match the 4x render.
- **What's left in the tilt is the compositor's resample** of the whole card
  (a 3D transform is always composited, rasterised flat and resampled each
  frame): tilt flicker 0.0045 to 0.0049 as it was, about 0.0042 with the
  emblem fixed, 0.0025 ideal; at dpr 2 it's 0.0043 against 0.0038. No CSS
  reaches it: `will-change: transform` and the hover without its 1.04 scale
  measured the same. A per-card canvas would be resampled the same way.
- **The hovered card was drawn 4% too small and stretched** (a third
  session, looking at still frames at 4K 150%, 1080p and 125% instead of the
  flicker number). Chrome rasterises anything with perspective in its
  transform at the page's own scale, whatever scale the transform adds, so
  the hover's `scale(1.04)` stretched that raster: soft lines, and hatching
  banded where its lines fell between pixels. Fixed in `ChooseCategory`: the
  face is laid out at `zoom: 1.04` (the width and margins give the room back)
  and shrunk by `scale: 1/1.04`, which the hover lets go of, so the tilted
  card is rasterised at the size it's shown. Still frames then match the 4x
  render about as well as the resting card does. **Taken out again:** it
  broke the hover fire (`projectedCorners` in `lib/fx/effects.ts` rebuilds
  the tilted card from its `transform` alone, so the fire came out 4%
  small and shifted in), and the owner saw no less shimmer for it.
  Redoing it needs that function to read the `scale` property and the
  face's offset in its card. Pixel-snapping the plate's
  lines (`snap.js` in that session's scratchpad) changed little. (The tilt
  flicker number, run again, was swamped by the backdrop's own animation,
  0.024 either way; it can't tell this apart.)
- **The hover's start and the deal's flip move too fast to shimmer**: the
  hover's start measured the same as the ideal; the flip is over in half a
  second.

## The harness

`harness/shoot.mjs` steps a circle on the QA desk's circle bench frame by
frame and saves each frame at device pixels (`repaint`: turned from script,
nothing composited); `harness/cards.mjs` does the same for a card on the
card bench's stage (at rest, tilting, the hover's start), measured by
`harness/flick.py`; `harness/measure.py` measures
the flicker against the `ref` run; `harness/ss.js` is the supersampled
variant's injection. Run the dev server, then from the repo root:

```bash
JOBS=12 node docs/handoff/anti-aliasing/harness/shoot.mjs http://localhost:5173/ out fhd,qhd,phone now,ref 32
```

```bash
python docs/handoff/anti-aliasing/harness/measure.py out
```

Headless on the real GPU (`channel: 'chromium'`, per the `headless-check`
skill): keep it to the sizes and variants a question needs, once.
