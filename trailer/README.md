# Delve patch trailer

See `TRAILER-GUIDE.md` for what we learned (workflow, creative direction, capture and render gotchas).

How `poe2quest-delve-trailer-60s.mp4` was made, to re-cut or re-shoot it. (The full-length cut,
`edit4.py` on `music3.py`, was abandoned; the 60 s cut still renders through its renderer.)

1. **Capture** (`capture/`, needs `npm run dev` on port 5199 and the project's `playwright-core`).
   `rig.mjs` runs the page K times slower than real time (the CSS/WAAPI timeline and rAF through
   CDP's `Animation.setPlaybackRate`; `performance.now`, `Date.now` and timers patched to match),
   grabs JPEG frames as fast as it can and stamps each in virtual time, so every shot resamples
   to a smooth 60 fps or plays in slow motion. It also:
   - draws the app's own engraved cursor over the frames (headless screenshots leave it out);
   - taps the page's sound (every WebAudio connection to the speakers) and stamps it in virtual
     time; looping ambience beds are kept silent so the one-shot sounds stay apart;
   - can move the page's date (`dateAt`, the server's clock check unanswered): Today's unique is
     shown on day 20740, Headhunter's;
   - `html.clean` hides the UI by opacity (the WebGL backdrop scales the soft shadows it draws by
     it), `html.nocard` the zone card too, for pure plunges.
   `shots3.mjs` stages every shot (PoE2 NPCs as the players, 12-player rooms built as a roomless
   lab host, teammates' pointers fed into `peerCursors`); `cards.mjs` renders the feature tags and
   end card in the app's fonts.
2. **Music** (the composer's remaster of the 60 s edit, `music/remaster/remaster.wav`, sample-aligned
   with `music60c.py`'s cut; the full cut's `music3.py`, found with `jumps.py`): three jumps along passages the track itself
   repeats (a delay-embedded self-similarity of chroma, MFCC and loudness), so the edit can't be
   heard: 0:00 to 43.87 s, 53.32 to 61.90 s, 71.36 to 81.70 s, then 176.09 s to the end.
3. **Sound**: `sfx.py` cuts each clip's tapped sound into silence-separated events stamped with
   their virtual onset (the page ran slow, the sounds at normal speed, so each is placed whole);
   `mixer.py` lays them under the music where their shots are on screen, compressed and ducked.
4. **Edit** (`edit4.py` (generated from `edit3.py` by `make_edit4.py`, then `patch5.py`) on `engine2.py` and `engine.py`): each shot places a moment of its clip
   (found with `events.py`; zone locks with `locks.py`) on a measured attack in the music.
   `GPU=1 python edit4.py final` renders on CUDA through `gengine.py` (PyTorch, nvJPEG, NVENC),
   about two minutes for the whole trailer on an RTX 5070; `PREVIEW=1` for a half-size look.
   Needs PyTorch and torchvision built for CUDA 12.8 or newer.
   The 60 s cut is `edit60j.py`, written whole (the earlier passes, `make60c.py` ... `make60i.py`, led
   up to it). `EDIT=edit60g NAME=poe2quest-delve-trailer-60s python render_fast.py 2 <out>`
   renders it in two GPU processes (three overrun 12 GB), sets the mix's level with a plain gain toward
   -14 LUFS (held under -1 dBTP, no compression) and
   encodes the master (28 Mbps) and web (10 Mbps) files, in under two minutes.
5. **Look** (`look2.py`): light is worked in linear light (bloom, exposure flashes, halation,
   vignette), a filmic shoulder rolls highlights off instead of clipping them, then a luma S-curve,
   near-neutral deep shadows under warm highlights, saturation evened out, a light luma sharpen,
   and a dither before 8 bits (no grain: it turned to mush in the web encode).
6. **Transitions** (`trans.py`): whip pans (an exact running-sum motion blur along the move),
   zoom-throughs, light dissolves, and the streaks' `ignite` (a hard cut everywhere but around the
   name's flames, which dissolve through a burst of light); the streak tiers share one camera move.
7. **Sharpness**: shots that push in past 1.5x were shot again at 4x device scale (`DSF=4 K=24
   SUFFIX=_hd node shots3.mjs ...`, the `_hd` clips; `hd_anchors.json` lists them and the anchors
   that moved). `strip.py` renders frames of an edit directly, `cmp.py` lines two takes up.
   Frames go to YUV with the BT.709 matrix and the streams are tagged BT.709 (players read
   untagged HD as BT.709; ffmpeg's default matrix is BT.601, which shifts every colour).

The scripts expect `clips/`, `cards/`, `music/` and `bin/ffmpeg.exe` beside them (they were run
from a scratch folder); the captured frames aren't kept here.

The title card is its own page, `capture/title/` (served by the dev server; `node shots3.mjs presents`):
the app's ArcaneCircle drawing itself behind "PoE2.Quest presents" and Delve, in phases the capture
calls on the beat. `burst.py` finds when a streak tier's name bursts into its new colour.

v10 (`edit60j.py`): a cold open of four flashes into the dark; the codex before the title; the last life
(`node shots3.mjs lastlife`) lost to a darkness closing in (drawn by the compositor, on the clock), the
end screen and its achievements, matched circle to ring into the codex; feature titles (`tag4_*` in
`cards.mjs`) large and centred over the shot defocused behind them. The game's transition sounds are
recorded through its own sound engine (`node shots3.mjs sfxbank`, cut by `bank.py`) and laid under the
cuts by `mixer2.py`, which also sets the game's sounds against the music as a whole. `FPS=30` renders
with a 180 degree shutter (each frame three instants averaged).

Final (v19): `edit60s.py` (written by `make60s.py` over the earlier passes), every shot from a 4x capture
(`DSF=4 K=24 SUFFIX=_hd`; the lobby with `VW=1600`), rendered in 4K at 30 fps:

    RES=2160 FPS=30 EDIT=edit60s NAME=poe2quest-delve-trailer-4k python render_fast.py 1 <out>

One worker (two overrun the GPU's 12 GB at 4K and swap), about 19 minutes. It writes the 4K master
(10-bit HEVC) and the 1080p web copy made from it (x264, supersampled). `remix.py` rebuilds only the
sound and puts it into finished files. The grade is measured per shot by `grade_measure.py`.

Fixes without a full render: `splice.py` re-renders only given stretches (on the 4K intermediate's 2 s
keyframes) and joins them frame-exactly into it; then `SPLICED=<joined> python render_fast.py 1 <out>`
does only the sound and the encodes:

    RES=2160 FPS=30 EDIT=edit60t python splice.py seg/base4k.mp4 seg/spliced4k.mp4 26:36 58:62

`edit60t.py` (v20): zone names kept off the bloom; the vein card's emblem smoothed where Chrome draws it
in steps at a 4x capture; the closing chord's glints and tremolo on the logo.
