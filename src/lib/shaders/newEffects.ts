// Two of Delve's environments, as GLSL for the backdrop's soft light
// (lib/backdrop.ts's SMOOTH, which draws them in environments()): Fungal
// Caverns' spores and Vaal Outpost's shafts of light. Each is one function
// of the effect interface (src/lib/shaders/effectApi.md):
//
//   vec3 fx_<name>(vec2 p, vec2 q, vec2 xy, float S, float W, float H,
//                  float tm, float sink, float strength,
//                  vec3 c0, vec3 c1, vec3 c2, float vary, out float dim)
//
// p is in CSS px (top-left origin), q = p / S, xy the fractions of the
// screen, S = sqrt(W * H), tm the clock in s (held at 0 under reduced
// motion, which holds both still), sink how far the scene has sunk, in
// screens. strength (0 to 1) is how far the effect has come in, c0 to c2
// its colour stops, vary how far each spore or beam strays from c0 along
// them. Each returns the light to add (already scaled by strength; the
// caller applies the hall's lit factor) and writes how far it darkens the
// hall it is drawn over to dim (1 is not at all).
//
// They rely on SMOOTH's own nhash() and vnoise() (value noise, Dave
// Hoskins's hash), and on FX_NOISE_GLSL below, which must come after
// those and before either effect. Every falloff is a smoothstep or a
// Gaussian with no hard end, every motion takes tens of seconds or
// minutes, and nothing is drawn in the middle of the screen behind the UI.

/**
 * Helpers both effects share: a four-valued hash for the cell scatters
 * (Dave Hoskins's hash42, so one call gives a spore or a mote all its
 * numbers) and a colour read along the stops.
 */
export const FX_NOISE_GLSL = `
// The smallest radius (CSS px) of a point of light (the far spores, the
// motes). The soft light is drawn at 2 CSS px a texel and filtered up, and
// a point much finer than that would twinkle as it drifts across texels;
// where an effect is drawn per pixel instead, define it smaller (2.0) first.
#ifndef FX_POINT_PX
#define FX_POINT_PX 4.5
#endif

vec4 fx_hash4(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

// A colour along the stops: c0 at 0, c1 at 0.5, c2 at 1.
vec3 fx_stops(vec3 c0, vec3 c1, vec3 c2, float g) {
  return g < 0.5 ? mix(c0, c1, 2.0 * g) : mix(c1, c2, 2.0 * g - 1.0);
}
`;

/**
 * Fungal Caverns: luminous spores adrift in the dark, as a macro lens sees
 * them, at three focal depths. The near ones are large, faint discs, out
 * of focus, with the brighter rim a lens gives them and a breath of colour
 * fringe at it; the middle ones smaller and softer; the far ones fine
 * points. They hang along the walls and over the floor, never in the
 * middle; they ride the air slowly upward and aside, each on a lazy
 * curving path of its own, the near faster than the far (parallax), and
 * the whole cloud swaying together as the air moves; each glows and dims
 * on a slow pulse of its own, out of step with the rest. A faint glow of
 * the countless spores too small to see lies low with them. They kindle
 * one by one as the stratum comes, the far first and the near last, and go
 * out the same way. They go up with the walls as the scene sinks, the
 * nearer the more.
 *
 * Each depth is a scatter over a lattice of cells, turned at an angle of
 * its own so no row lines up with the screen or another depth: a cell
 * holds at most one spore, jittered within it and wandering, never more
 * than 0.32 of a cell from the cell's middle, and nothing it draws reaches
 * further than 0.68 of a cell, so the four cells nearest the pixel hold
 * every spore that touches it.
 */
export const SPORES_GLSL = `
// Where the spores gather (0 to 1), at xy (fractions of the screen): along
// the walls, the more the lower, and over the floor. Exactly 0 where
// min(x, 1 - x) > 0.32 and y < 0.42 (fx_spores's early outs rely on it).
float fx_sporeBed(vec2 xy) {
  float side = 1.0 - smoothstep(0.0, 0.32, min(xy.x, 1.0 - xy.x));
  return max(side * (0.45 + 0.55 * clamp(xy.y, 0.0, 1.0)), smoothstep(0.42, 1.0, xy.y));
}

// One focal depth. pp: the pixel carried by the air, the drift and the
// plunge (CSS px); turn: the lattice's (cos, sin); cell: its size (px);
// size: the radius's (min, max) in cells, and at least minR px; prof: where
// the soft edge begins and where the rim lies (in radii), the rim's
// strength, and the halo's; fringe: how far the rim leans toward c2;
// arrive: how far this depth has kindled (0 to 1).
vec3 fx_sporeLayer(vec2 p, vec2 pp, vec2 turn, float cell, float seed, vec2 size, float minR, vec4 prof, float fringe,
                   float wander, float arrive, float tm, float W, float H, vec3 c0, vec3 c1, vec3 c2, float vary) {
  vec2 u = vec2(dot(pp, turn), dot(pp, vec2(-turn.y, turn.x))) / cell;
  vec2 base = floor(u - 0.5);
  vec3 sum = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    vec2 c = base + vec2(float(k & 1), float(k >> 1));
    // Its numbers: h (whether it is here, its place in the cell, its
    // pulse's phase), g (its path's rates, when it kindles, its path's
    // phase), e (its size, its colour, its pulse's rate, a second phase).
    vec4 h = fx_hash4(c + seed);
    vec4 g = fract(h.wxzy * 11.13 + h.zwyx * 3.71);
    vec4 e = fract(g.yzwx * 7.31 + h.yzwx * 2.17);
    // Its lazy path: two slow sines across and two down, each one to four
    // minutes round, at a rate and a phase of its own.
    vec2 path = vec2(0.6 * sin(tm * (0.031 + 0.03 * g.x) + 6.283 * g.w) + 0.4 * sin(tm * (0.057 + 0.04 * g.y) + 6.283 * e.w),
                     0.6 * cos(tm * (0.027 + 0.03 * g.y) + 6.283 * e.w) + 0.4 * sin(tm * (0.049 + 0.04 * g.x) + 6.283 * g.w));
    vec2 d = c + 0.5 + 0.36 * (h.yz - 0.5) + wander * path - u; // to the spore, in cells
    float dc = length(d);
    if (dc > 0.68) continue;
    // Where it is on the screen, for how thick the spores are there: they
    // thin out smoothly as one drifts toward the middle, and fade there.
    vec2 at = (p + cell * vec2(d.x * turn.x - d.y * turn.y, d.x * turn.y + d.y * turn.x)) / vec2(W, H);
    float w = smoothstep(h.x, h.x + 0.15, 0.85 * fx_sporeBed(at)) * smoothstep(0.0, 0.2, 1.2 * arrive - g.z);
    if (w <= 0.0) continue;
    // The disc: a little brighter toward its edge, a faint bright rim just
    // inside it, then a soft fall to nothing by 1.08 radii, and a halo of
    // scattered light round it; all gone well inside 0.68 of a cell.
    float R = max(cell * mix(size.x, size.y, e.x * e.x), minR);
    float r = dc * cell / R;
    float body = (1.0 - smoothstep(prof.x, 1.08, r)) * (0.7 + 0.3 * r * r);
    float rd = (r - prof.y) / 0.1;
    float rim = prof.z * exp(-rd * rd);
    float halo = prof.w * exp(-2.0 * r * r);
    float win = 1.0 - smoothstep(0.5, 0.68, dc);
    float pulse = 0.5 + 0.5 * sin(tm * (0.13 + 0.2 * e.z) + 6.283 * h.w);
    // Its colour: most near the glow (c0), some paler, a few toward the
    // fringe (as far as vary lets them), each wandering a little along the
    // stops over five to ten minutes.
    vec3 col = fx_stops(c0, c1, c2, vary * (0.8 * pow(e.y, 1.4) + 0.2 * (0.5 + 0.5 * sin(tm * (0.01 + 0.01 * e.z) + 6.283 * e.y))));
    sum += w * win * (0.3 + 0.7 * pulse * pulse) * (col * (body + halo) + mix(col, c2, fringe) * rim);
  }
  return sum;
}

vec3 fx_spores(vec2 p, vec2 q, vec2 xy, float S, float W, float H, float tm, float sink, float strength,
               vec3 c0, vec3 c1, vec3 c2, float vary, out float dim) {
  dim = 1.0;
  if (strength <= 0.0) return vec3(0.0);
  // How far (px) the pixel is inside the middle, where no spore lies: a
  // depth whose spores can't reach that far is skipped, and beyond the
  // near ones' reach nothing is drawn at all.
  float calm = min(min(p.x, W - p.x) - 0.32 * W, 0.42 * H - p.y);
  if (calm >= 0.204 * S) return vec3(0.0);
  float bed = fx_sporeBed(xy);
  float sinkPx = sink * H;
  // The air: a slow sway the depths share (each by its parallax), and in
  // the same noise, the glow of the spores too small to see.
  vec2 air = vec2(vnoise(q * 0.9 + vec2(tm * 0.011, 3.7)), vnoise(q * 0.9 + vec2(5.2, -tm * 0.009))) - 0.5;
  vec2 sway = 0.07 * S * air;
  vec3 light = vec3(0.0);
  // Far: fine points, densest and slowest, a little toward c0.
  float cf = 0.06 * S;
  if (calm < 0.68 * cf) {
    vec2 pp = p + vec2(0.0, 0.35 * sinkPx) + 0.35 * sway - vec2(0.0006, -0.0025) * S * tm;
    light += 0.24 * fx_sporeLayer(p, pp, vec2(-0.323, 0.946), cf, 91.0, vec2(0.07, 0.13), FX_POINT_PX, vec4(0.0, 0.0, 0.0, 0.22), 0.0,
                                  0.12, clamp(strength / 0.6, 0.0, 1.0), tm, W, H, c0, c1, c2, 0.75 * vary);
  }
  // Middle: smaller, softer discs.
  float cm = 0.13 * S;
  if (calm < 0.68 * cm) {
    vec2 pp = p + vec2(0.0, 0.6 * sinkPx) + 0.6 * sway - vec2(0.0013, -0.004) * S * tm;
    light += 0.085 * fx_sporeLayer(p, pp, vec2(0.66, -0.751), cm, 53.0, vec2(0.12, 0.22), 5.0, vec4(0.4, 0.72, 0.16, 0.14), 0.12,
                                   0.14, clamp((strength - 0.2) / 0.6, 0.0, 1.0), tm, W, H, c0, c1, c2, vary);
  }
  // Near: large, faint, out of focus, the rim brighter.
  float cn = 0.3 * S;
  if (calm < 0.68 * cn) {
    vec2 pp = p + vec2(0.0, sinkPx) + sway - vec2(0.0027, -0.0059) * S * tm;
    light += 0.055 * fx_sporeLayer(p, pp, vec2(0.852, 0.523), cn, 17.0, vec2(0.17, 0.27), 12.0, vec4(0.66, 0.8, 0.35, 0.1), 0.3,
                                   0.14, clamp((strength - 0.4) / 0.6, 0.0, 1.0), tm, W, H, c0, c1, c2, vary);
  }
  // The glow of the unseen spores, low and along the walls, thickening and
  // thinning as the air moves.
  light += 0.008 * strength * bed * (0.4 + 0.6 * smoothstep(-0.25, 0.25, air.x - 0.7 * air.y)) * mix(c0, c1, 0.3);
  // The damp rock where they gather is a little darker.
  dim = 1.0 - 0.07 * strength * bed;
  return light;
}
`;

/**
 * Vaal Outpost: pale gold light falling into the hall from high openings
 * far above and to the left, through dusty air. The beams fan out a little
 * from where they come in, soft at their sides, broad ones and narrow ones
 * and fine streaks within them, and broken along their length where the
 * dust is thick or thin, the dust drifting slowly down and aside through
 * them; where it hangs thick above, the light below it is dimmer. Clouds
 * pass far overhead, so over minutes a beam brightens, another fades, and
 * the whole fan swells and ebbs. The light is brightest high up and has
 * faded well before the middle of the screen; between the beams a faint
 * veil of it hangs in the air. Motes of dust drift slowly through, only
 * seen as they pass through a beam, catching its light as they turn. As
 * the stratum comes, the openings clear and the light reaches further
 * down; as it goes, they close and it draws back up.
 */
export const SHAFTS_GLSL = `
vec3 fx_shafts(vec2 p, vec2 q, vec2 xy, float S, float W, float H, float tm, float sink, float strength,
               vec3 c0, vec3 c1, vec3 c2, float vary, out float dim) {
  dim = 1.0;
  if (strength <= 0.0) return vec3(0.0);
  // How far down the light reaches (fractions of the screen): never past
  // 0.5 even where its end is ragged, so the middle stays calm.
  float reach = 0.18 + 0.22 * strength;
  if (xy.y > reach + 0.1) return vec3(0.0);
  // The openings, far above and to the left; the angle from them, as the
  // distance across the beams where they enter the screen (S units, so a
  // beam is as wide on a phone as its share of a large screen).
  float lift = 1.15 * S;
  vec2 dr = p - vec2(0.5 * W - 0.42 * S, -lift);
  float r = length(dr) / S;
  float a = atan(dr.x, dr.y) * lift / S;
  // The beams: broad ones and narrower ones between them, reshaping over
  // minutes, with fine streaks along them; the openings clear as it comes.
  float b1 = vnoise(vec2(a * 7.0 + 2.0, tm * 0.0045));
  float b2 = vnoise(vec2(a * 19.0 - 4.0, tm * 0.007 + 5.0));
  float b3 = vnoise(vec2(a * 55.0 + 9.0, tm * 0.01 + 1.0));
  float open = 0.6 - 0.12 * strength;
  float beam = smoothstep(open, open + 0.32, 0.62 * b1 + 0.38 * b2) * (0.78 + 0.22 * b3);
  // Clouds passing far overhead: a dimming that sweeps across the beams
  // over minutes and changes as it goes.
  float sky = 0.3 + 0.7 * smoothstep(0.15, 0.85, vnoise(vec2(a * 1.6 - tm * 0.0032, tm * 0.0017 + 11.0)));
  // The dust: read at the pixel and twice further up the beam, so it
  // streaks along it; the light is scattered where the dust is thick, and
  // dimmer below where it was thick above. The dust goes up a little as
  // the scene sinks; the light, from far above, stays.
  vec2 dq = vec2(a * 5.0 + tm * 0.004, (r + 0.5 * sink * H / S) * 3.2 - tm * 0.012);
  float d0 = vnoise(dq);
  float d1 = vnoise(dq - vec2(0.0, 0.36));
  float d2 = vnoise(dq - vec2(0.0, 0.74));
  float thick = (d0 + d1 + d2) / 3.0;
  float through = exp(-1.6 * max(0.0, d1 + d2 - 0.9));
  float dust = (0.3 + 0.9 * smoothstep(0.2, 0.8, thick)) * through;
  // Brightest high up, fading out raggedly by reach, a little less in
  // the middle under the header.
  float fall = exp(-2.2 * xy.y) * (1.0 - smoothstep(0.3 * reach, reach + 0.06, xy.y + 0.08 * (thick - 0.5)))
    * (1.0 - 0.3 * exp(-(xy.x - 0.5) * (xy.x - 0.5) / 0.04));
  float shaft = beam * dust * sky * fall;
  float veil = 0.16 * (0.5 + 0.5 * thick) * sky * fall;
  // Gold where faint, toward cream where brightest; each beam its own a
  // little (vary), the thick dust toward ochre.
  float k = clamp(smoothstep(0.15, 0.85, beam * through) + vary * 0.5 * (b2 - 0.5), 0.0, 1.0);
  vec3 col = mix(mix(c0, c1, k), c2, 0.3 * smoothstep(0.45, 0.85, thick));
  vec3 light = col * shaft + mix(c0, c2, 0.4) * veil;
  // The motes: a scatter over 0.032 S cells, at most one a cell, drifting
  // slowly down and aside, each wandering on its own (never more than 0.3
  // of a cell from the middle; it draws within 0.6, so the four nearest
  // cells hold every mote that touches the pixel). Each is lit by the beam
  // it is in, glinting slowly as it turns.
  float catchLight = shaft + 0.15 * veil;
  if (catchLight > 0.004) {
    float cell = 0.032 * S;
    vec2 u = (p + vec2(0.0, 0.5 * sink * H) - vec2(0.0018, 0.0034) * S * tm) / cell;
    vec2 base = floor(u - 0.5);
    float motes = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 c = base + vec2(float(i & 1), float(i >> 1));
      vec4 h = fx_hash4(c + 41.0);
      if (h.x > 0.4) continue;
      vec4 g = fract(h.wxzy * 11.13 + h.zwyx * 3.71);
      vec2 d = c + 0.5 + 0.3 * (h.yz - 0.5)
        + 0.15 * vec2(sin(tm * (0.07 + 0.06 * g.x) + 6.283 * g.y), sin(tm * (0.05 + 0.05 * g.z) + 6.283 * g.w)) - u;
      float R = max(cell * (0.1 + 0.16 * g.x * g.x), FX_POINT_PX);
      float dc = length(d);
      float glint = 0.55 + 0.45 * sin(tm * (0.35 + 0.55 * g.w) + 6.283 * h.w);
      motes += (exp(-3.0 * dc * dc * cell * cell / (R * R)) + 0.12 * exp(-0.6 * dc * dc * cell * cell / (R * R)))
        * (1.0 - smoothstep(0.45, 0.6, dc)) * glint * (0.5 + 0.5 * h.x / 0.4);
    }
    light += 2.2 * motes * catchLight * mix(c1, c2, 0.45);
  }
  // A little darker between the beams, so they stand out of the air.
  dim = 1.0 - 0.05 * sqrt(strength) * fall * (1.0 - beam);
  return 0.13 * light * (0.35 + 0.65 * strength);
}
`;
