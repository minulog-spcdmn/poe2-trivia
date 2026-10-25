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

- **Nothing is changed in the game.** No branch carries any of it.
- **The cards were never looked at.** The owner named them first; they are
  the place to start.
- **The circles:** the cause is measured (below); every cheap fix tried falls
  short, and the one fix likely to reach real quality (drawing the turning on
  the GPU) is untried.

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
  that test likely didn't repaint at all. A version that really repaints each
  frame (rotation set per frame on the SVG, not a compositor animation) is
  the open test.
- **The gamma correction** (`feComponentTransfer`, alpha gamma 0.69 for a
  circle at the stage's 0.22 strength over the dark backdrop) matches the
  ideal's brightness and keeps the look, but the owner saw no difference.
- **Untried:** drawing the turning on the GPU from a mipmapped texture,
  filtered per frame. If it's built, it belongs in the backdrop renderer
  (`src/lib/backdrop.ts`, behind the UI, already dithered and blurred behind
  dialogs), not the effects overlay (above dialogs). Prove it in the harness
  before building it.

## What is known about the cards (unverified; never looked at)

From reading the code only:

- Hover tilt: `perspective(900px) rotateX/rotateY … scale(1.04)` on `.frame`
  (`src/components/ChooseCategory.svelte`, around line 1430), no
  `will-change`.
- The deal's flip: `perspective(1200px) … rotateY/X … scale()` from a Svelte
  transition (around line 582).
- The engraving's lines are 0.3 to 0.8 CSS px (`CardEngraving.svelte`, around
  192 to 218), times `--card-z` (0.8 to 1.36) and the stage zoom.
- The emblem is a CSS mask (around 1138) that scales 1.1 and turns −3° on
  hover (around 1448), under a parent with a `drop-shadow` filter (around
  1131).
- A canvas inside the card would be tilted with it and resampled the same
  way, so a per-card WebGL canvas is no fix.

Start by watching a card tilt and flip, zoomed, at a dpr 1 size, and find
which part goes jagged (the edge, the lines, the emblem, the text) before
deciding anything. `cards.html` is the card bench.

## The harness

`harness/shoot.mjs` steps a circle on the QA desk's circle bench frame by
frame and saves each frame at device pixels; `harness/measure.py` measures
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
