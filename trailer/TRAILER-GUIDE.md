# Making a PoE2.Quest trailer

What the Delve trailer taught us, so the next one goes faster and lands better. `README.md` describes
the scripts; this is the how and the why. The final cut is `edit60u.py`; the final files are
`poe2quest-delve-trailer-4k.mp4` (master) and `thumbnail-l.jpg`.

## 1. Working with the owner: the loop that works

- **Show a short preview before any long render.** `preview.py` renders only the stretches that changed,
  at 1080p with sound, in about a minute. Never start a 20 minute 4K render to show a fix.
- **Splice, don't re-render.** Once the 4K master exists, `splice.py` re-renders only the changed
  stretches (cut on the intermediate's 2 s keyframes) and joins them frame-exactly. A fix costs minutes.
- **Use every core and the GPU.** The owner notices idle hardware. CUDA compositor, NVENC for
  intermediates, x264 on all threads for the web copy, captures in parallel (but see GPU memory, below).
- **Measure, don't guess.** Hit times from the actual master, banding with `scripts/find-banding.py`,
  glitch frames with `outliers.py`, levels with ffmpeg's `ebur128`, seams by frame-to-frame difference.
- **Say what a fix couldn't do.** When a workaround is partial (a softened card), say so plainly.

## 2. Creative direction: what landed and what didn't

The owner made the music and has a clear taste. Learned the hard way:

**Landed**
- One idea per moment, cut on the music's real hits. The edit follows the song's shape: build, title on the
  drop, zone roll, features, the stop, the blast, the logo.
- Real game moments in one continuous take (the flare and dynamite on one question, the clock running
  straight through), not cuts that make the timer jump.
- Stakes: the last life lost, the darkness closing in, the end screen and what it earned.
- The game's own sounds, and its own transition sounds under the cuts.
- Speed ramps into impacts (slow into the hit, snap through it).
- 30 fps with a 180 degree shutter (motion blur), not 60 fps.
- Feature titles few and large, shown while the shot behind them goes soft, never over action.
- A title card of its own ("PoE2.Quest presents", the arcane circle, Delve), not another zone card.
- The end card answering the music's last hits with restraint (glow, a small push, light rising with the
  arpeggio), timed to the remaster, not to an older edit.
- Azurite blue for Delve (the PoE1 association), gold for the brand.

**Didn't (don't repeat)**
- Cheesy taglines ("Name it or fall"), generic text, text and action at the same time.
- Particle embers, glints, recap flashes behind the logo: read as cheap or as glitches.
- Fake film effects (film burn, reel runout): cheap over crisp UI.
- Parallax from two capture layers, match cuts between avatars or titles: didn't read.
- Animating on twos and threes: looks laggy on UI footage.
- A cold open of random flashes; a timer cold open (overused the timer idea); plunges (spent the zones early).
- Low-value shots eating seconds; the same moment twice; reused footage.
- Anything that copies the long cut into the short one: each cut gets its own edit and music path.
- Grey haze from lifting shadows; crushed blacks; one grade for every shot.

## 3. Capture (`capture/rig.mjs`, `capture/shots3.mjs`)

- Headless Chromium with the GPU, the page slowed K times (CDP playback rate plus patched clocks), frames
  stamped in virtual time and resampled. In-game sound is tapped and stamped the same way.
- **Shoot at 4x** (`DSF=4 K=24 SUFFIX=_hd`): every shot, from the start. Rendering in 4K and downscaling
  gives a sharper 1080p too. Lobby needs `VW=1600` to fit twelve players.
- **Capture slowed, always.** The site's adaptive quality drops at 4x in real time and switches off its
  richest shader work (the azurite vein seams vanish). Slowed, it stays at full quality.
- **Ask a question after `S.slow()`**, or its expiry timer runs at real speed and fires early.
- **Chrome rasters a 3D-transformed layer coarsely.** A hovered category card tilts in 3D and comes out in
  blocks at 4x. For capture, lift it in 2D (`translateY` + `scale`); same look, sharp.
- **App bugs can be patched for a capture only**, never in the app: inject a style, or rewrite a module as
  the dev server serves it (`ctx.route`, see `FUMEFIX` and `FULLFX` in `rig.mjs`). When the real fix lands on
  main, prefer it (the fume fog fix `deaae62f` replaced ours).
- **GPU memory:** four parallel 4x captures plus a render can make the page lose WebGL (frames go white).
  Check every take for white-outs before using it; capture fewer at once.
- Hide toasts (`.toasts { display: none }`) in takes where they'd cover the action.
- Item choices are forced by wrapping `engine.makeQuestion` (see `auspex`, `tooltip`, `mbveil`).
- A new take of a shot rarely draws the same question; re-measure its key moments (`cmp.py`, brightness
  jumps) and shift the edit's anchors.
- `bgshot3.mjs` captures the site's WebGL backdrop alone (any depth or state, the vein's seams via
  `dealDig`) for thumbnails and title backgrounds.

## 4. Music

- Use the owner's own music and ask for their master when the edit is set; replace the bed, keep timing.
- Measure every sync point on the **actual** final master (onsets by band: the low band for impacts, the
  mid band for stabs, a high-passed constant-Q for melody notes). Never reuse a kick map from an older edit.
- Seamless jumps come from the track's own repeats (`jumps.py`), aligned to the beat grid.

## 5. Edit (`edit60u.py` and the `make60*.py` chain)

- Shots place a clip moment on a music time (`shot(t0, t1, clip, moment, at=...)`). Camera paths with
  `path()` (smooth through points), speed ramps with `ramp=` or `ramp_into()`.
- Transitions live in `trans.py` (whip with real motion blur, zoom-through, light dissolve). Fewer kinds
  is better; hard cuts on the beat are fine.
- The game's cut sounds come from `music/sfxbank` (recorded through the game's sound engine, `bank.py`).

## 6. Look and grade (`look2.py`, `grade.py`)

- Light in linear light (bloom, flashes, halation, vignette), a filmic shoulder, then colour on the display
  image. On bright pastel text (zone cards) turn bloom and the shoulder's whitening down, or it bleaches.
- **Grade per shot**, measured (`grade_measure.py` into `grade.json`): black, mid, peak to common targets.
  Lift shadows by **scaling**, never by adding (adding reads as grey haze); give back the saturation a lift
  drains; keep the upper mids steep for punch.
- Sharpen the UI only (a local-contrast mask), never the backdrop.
- No grain: it turns to mush in a web encode. A dither before the last quantisation instead.
- Colour by chapter on the backdrop only, subtle.

## 7. Encode and fidelity (`render_fast.py`, `gengine.py`)

- 16-bit frames out of the compositor, near-lossless 10-bit HEVC intermediates, a **10-bit HEVC master**,
  and the web copy brought to 8 bits with error-diffusion dither and **x264 `aq-mode=3`** (NVENC smoothed
  the dither away and banding came back).
- Convert RGB to YUV with the **BT.709** matrix and tag the stream BT.709 (ffmpeg defaults to BT.601, which
  shifts every colour).
- Decode JPEG frames on the **CPU**: nvJPEG under load returned corrupted frames now and then.
- At 4K run **one** render worker (two overflow 12 GB of VRAM and crawl).
- 30 fps renders sample six instants per frame (180 degree shutter) but never across a hard cut.
- Check every render: `outliers.py` (one-frame glitches), `find-banding.py` on the darkest gradients.

## 8. Sound (`mixer2.py`)

- Each game sound is set relative to the music around it (about 2.5 dB under, 65% of the way, so loud and
  soft still differ), gently compressed, high-passed at 90 Hz, given a short dark room, and the music
  ducks a little under them. A true peak limiter at the end, never a whole-mix scale-down.
- Big moments need body: the dynamite blast was a 0.15 s punch masked by the music's kick; its slowed,
  compressed version carries.
- Final level by plain gain to -14 LUFS, true peak under -1 dBTP (no loudness compression on a master).

## 9. Delivery

- Upload the 4K 10-bit master to YouTube (better encode even for 1080p viewers).
- Title: `PoE2.Quest • Delve Trailer`. Description: factual, one paragraph, numbers over adjectives, link,
  credits, fan-project disclaimer. No feature bullet lists (reads as AI), no "embark", "ultimate".
- Thumbnail (`capture/thumb9.mjs`): one focal point, two or three words, the site's real wordmark
  (Maragsâ Title, GameTitle.svelte's gold and shadows), the site's real shader as background, a hierarchy of
  tones (brightest the hook, then the mode name, the brand quieter). Check at feed sizes (246 and 360 px).
  No UI buttons, no fake gradients. Test variants with YouTube's Test & Compare.

## 10. Checklist for the next trailer

1. Agree the story and the music first; get the owner's master early.
2. Capture everything at 4x, slowed, toasts hidden, one take per shot; check each for white-outs.
3. Measure the music's hits on the master; cut the edit on them.
4. Preview stretches (`preview.py`) for every round of feedback.
5. Grade per shot; check scopes, banding, glitch frames.
6. Render 4K once; afterwards only `splice.py`.
7. Master at -14 LUFS, 10-bit HEVC 4K, BT.709 tagged; thumbnail and description last.
