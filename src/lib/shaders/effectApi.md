# The environment effect interface

Each Delve zone draws a few environment effects over its hall (magma, frost,
spores, shafts of light, ...). The backdrop's soft light (`SMOOTH` in
`src/lib/backdrop.ts`) calls them from `environments()`, one after another in
the fixed order of `ENVIRONMENTS` (`src/lib/backdropData.ts`), only those
showing at the moment.

## A new effect

A new effect is one GLSL function, exported as a source string from a module
in this folder (`newEffects.ts` holds `SPORES_GLSL` and `SHAFTS_GLSL`, with
`FX_NOISE_GLSL`, the helpers they share):

```glsl
vec3 fx_<name>(vec2 p, vec2 q, vec2 xy, float S, float W, float H,
               float tm, float sink, float strength,
               vec3 c0, vec3 c1, vec3 c2, float vary, out float dim)
```

Its id is its name in `ENVIRONMENTS` (`'spores'` calls `fx_spores`, `'shafts'`
calls `fx_shafts`). `backdrop.ts` pastes the sources in after `SMOOTH`'s own
noise (`nhash`, `vnoise`, `fbm`, `ridge`, `gauss`, `rgb`) and before
`environments()`, so an effect may use those, and `FX_NOISE_GLSL`'s
`fx_hash4` and `fx_stops`. Names of its own start `fx_`.

### What it receives

| input | what it is |
| --- | --- |
| `p` | the pixel, CSS px, from the top left |
| `q` | `p / S`: size-independent, for noise |
| `xy` | `p / (W, H)`: 0 to 1 across and down the screen |
| `S` | `sqrt(W * H)`, CSS px: the scene's scale (so a feature is the same share of a phone and a large screen) |
| `W`, `H` | the screen's width and the height the scene is laid out for, CSS px |
| `tm` | the backdrop's clock, s. It stands still while the effects are switched off (calm mode), and holds at 0 under reduced motion, so anything moving on `tm` rests by itself |
| `sink` | how far the scene has sunk, in screens (it grows by 0.6 with every new depth of a run, easing over 1.9 s). Add `sink * H` times a share to `p.y` for parallax: the walls go up by all of it, nearer layers by more, farther ones by less |
| `strength` | 0 to 1: how far the effect has come in. 0 means it is not drawn at all (the caller skips it; return at once anyway) |
| `c0`, `c1`, `c2` | its three colour stops, 0 to 1 a channel. Which stop is which is the effect's own (the tool names them, see `ENV_TONES` in `backdropData.ts`) |
| `vary` | 0 to 1: how far its colour may wander from its main stop, across space and slowly over time |

### What it returns

- The light it adds, as a colour: already scaled by `strength`, not by the
  hall's light. The caller multiplies it by the features' brightness where
  the pixel is (the dark closing in from the edges and the depth dim it), so
  it shows through the dark as a glow should.
- `dim`: how far it darkens the hall it lies over, as a factor (1 not at
  all). The caller applies it before adding the light:
  `col = col * dim + lit * light`.

### How it comes and goes

`strength` should change where the effect is, not only how bright: grow in
from where it comes from (from the walls, from below, kindling one by one)
and withdraw the same way, so two effects in a handover never sit on each
other half faded. What it adds to the average brightness should grow
steadily with `strength`, never mostly at the end.

### Rules

- Soft: Gaussian or smoothstep falloffs, no hard edges, no visible tiling or
  grid, no flicker (nothing changes faster than over several seconds).
- The middle of the screen, behind the UI, stays calm: return early there.
- Phone friendly: no loops longer than a few steps, three or four noise
  octaves at most, and an early out wherever nothing is drawn.
- The light it adds counts toward the scene's brightness: the estimate in
  `descent.ts` (`ENV_ADD`, `ENV_HALL`, scaled by the luma of the stops) keeps
  the scene's average falling with depth. A rebuilt effect is measured again
  with `scripts/measure-luminance.mjs`.

## How the colours arrive

The tool and the data give every effect a zone uses a colour range: two or
three stops and a variation amount (`tones` in a look, see
`backdropData.ts`). A handover blends the two zones' colours for an effect
both use; one only one of them uses keeps its own.

At most `FX_SLOTS` (8) effects show at once, a handover included. Each frame
`packFx` (`descent.ts`) fills a slot for every effect showing (the strongest
eight, should more show), and `backdrop.ts` sends them as
`uniform vec4 uFx[3 * FX_SLOTS]`, three vectors a slot:

| vector | xyz | w |
| --- | --- | --- |
| `uFx[3s]` | `c0` | strength |
| `uFx[3s + 1]` | `c1` | vary |
| `uFx[3s + 2]` | `c2` | the effect's id (its index in `ENVIRONMENTS`) |

`uFxK.zw` hold which slot each effect is in (four bits an effect, 15 for
none), so `environments()` finds an effect's slot without a loop, and every
effect's code appears once. `uFxK.xy` are the magma's cooling and its flow's
clock.

## The built-in effects

The other eight (`src/lib/shaders/effects.ts`) take the same inputs, but lay
colours over the hall lit by the hall's own light (frost, fog, fumes) as
well as adding light, so each returns the colour it leaves:

```glsl
vec3 env_<name>(vec3 col, vec2 p, vec2 q, vec2 xy, float S, float W, float H,
                float tm, float sink, float strength,
                vec3 c0, vec3 c1, vec3 c2, float vary)
```

with `q` the walls' coordinates (`(p + (slide, sink * H)) / S`, `slide` how
far dynamite has swung the scene sideways, CSS px; see swing in
`lib/descent.ts`), and the dark
closing in, the features' brightness and the side walls in `gDark`, `gLit`
and `gSide`. For them `c0` is the hottest or brightest stop and `c2` the
coolest or deepest; `envTone(c0, c1, c2, t)` reads along them (0 to 1) and
`envDrift(q, tm, seed)` gives the slow wander `vary` scales.
