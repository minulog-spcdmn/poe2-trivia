// Delve's built-in environment effects, as GLSL for the backdrop's soft light
// (lib/backdrop.ts's SMOOTH, which calls them from environments(), each only
// while it shows). Each is drawn in the colours its slot brings (c0 to c2,
// and how far they vary): for all of these c0 is the hottest or brightest
// stop and c2 the coolest or deepest. Where in that range a pixel's colour
// lies follows the effect's own physics (the magma hotter in a crack's
// core, the rime whiter where it is thick), and wanders a little more,
// slowly, across the screen and over time (vary). See effectApi.md beside
// this file for the interface; the two newest effects are in newEffects.ts.
//
// Each takes the colour beneath and returns the colour it leaves: they lay
// colours over the hall in the hall's own light (uLight) as well as adding
// light of their own (gLit: what glows shows through the dark closing in,
// dimmed, and burns a little less the deeper). All are noise, soft-edged and
// slowly moving, like the rest of the backdrop; nothing in them is a shape
// that could be picked out. How much of one shows (strength, 0 to 1) is how
// far it has come, not how faint it is: each arrives from where it comes
// from and recedes the same way, and what it adds to the scene's brightness
// grows steadily as it comes (ENV_ADD in lib/descent.ts).
//
// p in CSS px, q = (p + (0, sink * H)) / S (the walls, which go up as the
// scene sinks), xy = fractions of the screen, tm the clock (s), sink how
// far the scene has sunk (screens).

export const ENV_GLSL = `
// The dark closing in where the pixel is, how bright what glows burns
// there, and how near a side wall it is (1 at the walls, 0 from 30% in):
// set by environments() before the effects are drawn.
float gDark = 0.0;
float gLit = 1.0;
float gSide = 0.0;

// A colour along an effect's stops: c0 at 0, c1 at 0.5, c2 at 1, eased in
// and out of each stop so no crease shows where one turns into the next.
vec3 envTone(vec3 c0, vec3 c1, vec3 c2, float t) {
  t = clamp(t, 0.0, 1.0);
  return t < 0.5 ? mix(c0, c1, smoothstep(0.0, 0.5, t)) : mix(c1, c2, smoothstep(0.5, 1.0, t));
}

// How far an effect's colour wanders here (about -0.3 to 0.3, rarely to
// 1): broad noise, a cell about a third of the screen across, drifting
// over a minute or two; an effect's own seed so no two wander alike.
// Times vary, it moves the colour along the stops.
float envDrift(vec2 q, float tm, float seed) {
  vec2 u = q * 1.1 + vec2(seed * 7.31, seed * 3.17) + vec2(tm * 0.009, -tm * 0.006);
  return 2.0 * (0.62 * vnoise(u) + 0.38 * vnoise(u * 2.3 + 5.1) - 0.5);
}

// Frozen Hollow's frost in one frame: u = (along the edge, in from it), in
// detail units. Returns its stems (the noise's middle crossings, the noise
// stretched along the edge so they run in from it), its barbs (finer, swept
// forward off the stems at 55 degrees, one way on either side of a stem, so
// they feather as rime does; only near a stem), the lobes where it has
// reached further, and the stems' noise.
vec4 rime(vec2 u) {
  vec2 w = vec2(vnoise(u * 3.0 + 1.7), vnoise(u * 3.0 + 8.3)) - 0.5;
  float lobe = vnoise(u * vec2(2.2, 1.1) + 0.6 * w + 4.0);
  vec2 us = u + 0.3 * w;
  float sn = vnoise(vec2(us.x * 16.0, us.y * 3.5));
  float stem = 1.0 - abs(2.0 * sn - 1.0);
  // Which side of the stem: where the noise climbs along the edge, the side above its middle is ahead.
  float climb = vnoise(vec2(us.x * 16.0 + 0.06, us.y * 3.5)) - sn;
  float ahead = smoothstep(-0.003, 0.003, (sn - 0.5) * climb);
  vec2 ua = vec2(dot(us, vec2(0.574, -0.819)), dot(us, vec2(0.819, 0.574)));
  vec2 ub = vec2(dot(us, vec2(0.574, 0.819)), dot(us, vec2(-0.819, 0.574)));
  float ba = 1.0 - abs(2.0 * vnoise(vec2(ua.x * 26.0, ua.y * 6.0) + 2.0) - 1.0);
  float bb = 1.0 - abs(2.0 * vnoise(vec2(ub.x * 26.0, ub.y * 6.0) + 6.0) - 1.0);
  float barb = mix(bb, ba, ahead) * smoothstep(0.5, 0.9, stem);
  return vec4(stem, barb, lobe, sn);
}

// Where Frozen Hollow's frost crystal is, and how much light it catches
// (0 to 1): set by env_frost(), so main() can draw its glints there (the
// soft light's target carries it in its alpha).
float gFrost = 0.0;

// The Mines: lamps hung along the walls, each a warm pool that gutters,
// and the rock's seams running across, catching their light. The light is
// whitest at a flame's heart (c0), lamplight through its pool (c1), and
// reddens where the pool fades into the dark (toward c2); the seams catch
// its far, red end. They kindle one by one, and gutter out the same way.
vec3 env_lamps(vec3 col, vec2 p, vec2 q, vec2 xy, float S, float W, float H, float tm, float sink, float e,
               vec3 c0, vec3 c1, vec3 c2, float vary) {
  vec2 wq = q + 0.25 * vec2(vnoise(q * 1.3 + 2.0), vnoise(q * 1.3 + 9.0));
  float seam = pow(ridge(vec2(wq.x * 1.4, wq.y * 7.0)), 6.0);
  float lamps = 0.0;
  float heart = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 at = vec2(i < 2 ? 0.05 + 0.06 * fi : 0.87 + 0.06 * (fi - 2.0), 0.3 + 0.45 * fract(fi * 0.618 + 0.1)) * vec2(W, H);
    // A lamp not yet kindled adds nothing (its gutter is +0): skip it.
    float on = smoothstep(0.2 * fi, 0.2 * fi + 0.4, e);
    if (on <= 0.0) continue;
    vec2 d = (p - at) / S;
    float gutter = (0.7 + 0.3 * vnoise(vec2(tm * 2.6, fi * 7.0))) * on;
    float r = length(d);
    lamps += gutter * gauss(r / (0.16 * (0.7 + 0.6 * vnoise(d * 5.0 + fi * 3.1))));
    heart += gutter * gauss(r / 0.05);
  }
  lamps = min(1.2, lamps);
  float w = vary * envDrift(q, tm, 1.0);
  vec3 pool = envTone(c0, c1, c2, 0.5 + 0.35 * (1.0 - smoothstep(0.0, 0.6, lamps)) - 0.45 * min(1.0, heart) + w);
  vec3 rock = envTone(c0, c1, c2, 0.75 + 0.5 * w) * 0.4;
  col *= 1.0 - e * 0.45 * seam * (1.0 - min(1.0, lamps));
  return col + gLit * (pool * lamps * (0.06 + 0.14 * seam) + e * rock * seam * 0.04);
}

// Magma Fissure: cracks glowing through the rock, branching as they climb
// and brightest low down, the light pulsing up them and the heat
// shimmering over them. A crack is where a warped noise crosses its
// middle: jagged, like a coastline, and never closed into a shape. As they
// come they open and heat up: white heat (c0) in the hottest cores, orange
// (c1) through them, crimson (c2) at their edges, each crack's heat
// wandering between them (vary) on the magma's own clock.
//
// Through its handover to the next zone it cools (uFxK.x, magmaCooling in
// lib/descent.ts) as real lava does: a dark crust forms from each crack's
// edges inward, so the cracks narrow and their glow's halo draws in with
// them; the thin stretches crust over first and the glowing seams linger
// longest in the cores of the thickest. What is still molten cools as it
// narrows, white heat to orange to deep red, and dims; the crust over it
// glows a dull red at first, faint embers glinting in it here and there,
// then sets to black-grey rock. And its flow slows to a stop, on a clock
// of its own (uFxK.y) that runs slower as it cools. Its brightness falls
// at least as fast as magmaHeat has it, which the scene's light makes way
// for.
vec3 env_magma(vec3 col, vec2 p, vec2 q, vec2 xy, float S, float W, float H, float tm, float sink, float e,
               vec3 c0, vec3 c1, vec3 c2, float vary) {
  float cool = uFxK.x;
  float ft = uFxK.y;
  vec2 m = vec2(q.x * 4.0, q.y * 2.0);
  m += 0.4 * vec2(vnoise(m * 0.7 + 4.0), vnoise(m * 0.7 - 2.0));
  m.x += 0.04 * (vnoise(vec2(q.x * 9.0, q.y * 6.0 + ft * 1.4)) - 0.5);
  float n1 = fbm(m);
  // How thick the crack runs here: thick stretches and thin ones along it.
  float thick = smoothstep(0.2, 0.8, vnoise(m * 0.55 + 13.0));
  // As it comes in (its first 0.3 of strength) the cracks open from
  // hairlines and their glow rises from nothing, so it never pops in.
  float rise = smoothstep(0.0, 0.3, e);
  float se = sqrt(e) * rise;
  // Cooling, the molten core within each crack narrows, the thin stretches most.
  float open = max(0.001, (0.35 + 0.65 * e) * rise * (1.0 - 0.45 * cool * (1.0 - 0.5 * thick)));
  float d1 = abs(n1 - 0.5);
  float k1 = clamp(1.0 - d1 * 9.0 / open, 0.0, 1.0);
  // The second crack only shows near the first: its noise is skipped where
  // its weight is +0 (k2 would be +0 anyway).
  float near2 = smoothstep(0.15, 0.0, d1);
  float k2 = 0.0;
  if (near2 > 0.0) k2 = clamp(1.0 - abs(fbm(m * 1.9 + 7.7) - 0.5) * 12.0 / open, 0.0, 1.0) * near2 * e;
  float crack = k1 * k1 * k1 + 0.8 * k2 * k2 * k2;
  float low = 0.25 + 0.75 * smoothstep(0.1, 1.0, xy.y) + 0.3 * gSide;
  float flow = 0.35 + 0.65 * vnoise(vec2(m.x * 1.2, m.y * 1.6 + ft * 0.4));
  float heat = crack * low * flow;
  // The crust: its front moves in from a crack's edges (core 0) to the
  // cores of its thickest stretches (core 1) as it cools; behind it, it has
  // set. Hot, there is none.
  float core = max(k1, 0.8 * k2) * (0.55 + 0.45 * thick);
  float front = 1.25 * cool - 0.15;
  float crust = smoothstep(-0.12, 0.08, front - core);
  float molten = 1.0 - crust;
  // How hot what is still molten burns: along the stops from white heat,
  // further toward the red (and past it, dark) the cooler; and its light,
  // dimmed with the cooling, as magmaHeat has it.
  // Without variation (vary 0) the drift adds nothing: skip its noise.
  float w = 0.0;
  if (vary != 0.0) w = vary * envDrift(q, ft, 2.0);
  float t = 1.05 * cool + w;
  float dull = 1.0 - smoothstep(1.0, 1.5, t + 0.25);
  float glowK = sqrt(max(0.0, 1.0 - cool)) * molten * dull;
  vec3 white = envTone(c0, c1, c2, t);
  vec3 body = envTone(c0, c1, c2, 0.5 - 0.3 * heat + t);
  vec3 edge = envTone(c0, c1, c2, 1.0);
  col *= 1.0 - 1.6 * e * (1.0 - e) * k1 * k1;
  col += gLit * glowK * (body * heat * 0.45 * se + white * pow(heat, 3.0) * 0.45 * e * rise
    + edge * (smoothstep(0.2, 0.0, d1) * 0.1 + 0.25 * k1 * (1.0 - e)) * low * flow * se);
  if (cool > 0.0) {
    // Where it has crusted over, the crack is dark rock, greyer than the
    // rock about it; while the crust is new it still glows a dull red, and
    // embers glint in it here and there, each slowly brightening and
    // fading, gone once it has set.
    float seat = crust * smoothstep(0.0, 0.3, k1 + 0.8 * k2) * se;
    float grey = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, grey * vec3(0.62, 0.6, 0.59), 0.75 * seat);
    float warm = smoothstep(0.0, 0.25, cool) * (1.0 - smoothstep(0.35, 0.8, cool));
    float ember = smoothstep(0.8, 0.95, vnoise(m * 7.0 + 21.0)) * smoothstep(0.15, 0.4, cool) * (1.0 - smoothstep(0.7, 0.97, cool));
    float pulse = 0.55 + 0.45 * sin(tm * 0.25 + 6.283 * vnoise(m * 1.3 + 5.0));
    col += gLit * seat * edge * (0.035 * warm * low + 0.12 * ember * pulse);
  }
  return col;
}

// Frozen Hollow: a cold, still hall. Rime has grown in from every side, the
// walls, the ceiling and the floor, dense at the edge and thinning inward,
// its front fraying into feathers of ice (see rime()): stems running in
// from the edge and finer barbs swept forward off them, the fingers
// reaching furthest where the crystal does. It is white where it is thick
// against the stone (c0), ice blue through it (c1) and a deep blue at its
// thin front (c2). Its crystal shows most toward the front and catches the
// light in sheens that drift across it very slowly, most toward the
// ceiling; here and there a point of it glints for a few seconds and fades
// (main() draws those, too fine for this target, where gFrost says the
// crystal is). Each side is read in a frame of its own, the corners
// blending smoothly between the two; the ceiling's reaches less far in,
// the floor's less still, lying low under the mist. Pale light filters
// down from above in broad rays that wax and wane in place, and a cold mist
// rolls slowly low across the floor in two layers, over the floor's frost,
// the near one larger, softer and quicker, going up past you with the
// walls, the nearer the faster, as the scene sinks. The light and the mist
// come in with it, the mist rising from the floor; the frost only creeps in
// from the sides once the magma before it has well cooled (uFxK.x, its
// cooling, while it goes out), over dull rock, and withdraws to them as it
// goes.
vec3 env_frost(vec3 col, vec2 p, vec2 q, vec2 xy, float S, float W, float H, float tm, float sink, float e,
               vec3 c0, vec3 c1, vec3 c2, float vary) {
  float come = smoothstep(0.1, 1.0, e);
  float w = vary * envDrift(q, tm, 3.0);
  float sinkPx = sink * H;
  // The light from above: rays from far overhead, too broad to pick out.
  if (xy.y < 0.8) {
    vec2 from = p - vec2(0.5 * W, -0.9 * H);
    float a = atan(from.x, from.y);
    float rays = 0.6 * vnoise(vec2(a * 6.0, tm * 0.012)) + 0.4 * vnoise(vec2(a * 14.0 + 4.0, tm * 0.019 + 2.0));
    float fall = exp(-2.6 * xy.y) * (1.0 - smoothstep(0.3, 0.8, xy.y));
    col += gLit * come * envTone(c0, c1, c2, 0.35 + 0.5 * w) * (0.25 + 0.75 * smoothstep(0.3, 0.8, rays)) * fall * 0.028;
  }
  // The frost: how far in from each side (S units; the ceiling's and the
  // floor's count for more, so theirs reaches less far), the corners
  // rounded by a soft minimum; how far its front has come; and the
  // crystal, read along each side in a frame of its own, in detail units,
  // never finer than on a 700 px screen, each frame weighed by how near its
  // side is (the same soft minimum's weights), so the corners blend. The
  // side walls' go up with the walls as the scene sinks.
  float grow = smoothstep(0.3, 1.0, e) * (uFxK.x > 0.0 ? smoothstep(0.4, 1.0, uFxK.x) : 1.0);
  if (grow > 0.0) {
    const float K = 0.035;
    vec4 d = vec4(p.x, W - p.x, 1.6 * p.y, 2.2 * (H - p.y)) / S;
    float dm = min(min(d.x, d.y), min(d.z, d.w));
    vec4 near = exp(-(d - dm) / K);
    float fe = max(0.0, dm - K * log(near.x + near.y + near.z + near.w));
    if (fe < 0.2 * grow) {
      float D = max(S, 700.0);
      float n = fe * S / D;
      // Each side's frame, weighed (smoothly to nothing) by how near it is.
      vec4 wt = max(exp(-(d - dm) / 0.05) - 0.02, 0.0);
      vec4 c = vec4(0.0);
      if (wt.x > 0.0) c += wt.x * rime(vec2((p.y + sinkPx) / D, n));
      if (wt.y > 0.0) c += wt.y * rime(vec2((p.y + sinkPx) / D + 31.0, n));
      if (wt.z > 0.0) c += wt.z * rime(vec2(p.x / D + 57.0, n));
      if (wt.w > 0.0) c += wt.w * rime(vec2(p.x / D + 83.0, n));
      c /= wt.x + wt.y + wt.z + wt.w;
      // Lobes where it has reached further, and fingers along the stems and their barbs.
      float front = grow * (0.05 + 0.07 * c.z + 0.05 * c.x * c.x * c.x + 0.03 * c.y);
      float cover = smoothstep(0.0, 0.018, front - fe);
      float thick = clamp(1.0 - fe / max(front, 0.001), 0.0, 1.0);
      float body = cover * (0.3 + 0.7 * thick);
      float crystal = cover * max(0.8 * smoothstep(0.7, 0.97, c.x), smoothstep(0.6, 0.92, c.y)) * (1.0 - 0.6 * thick);
      float sheen = smoothstep(0.25, 0.85, vnoise(vec2(p.x, p.y + sinkPx) / D * 1.4 + vec2(tm * 0.01, -tm * 0.007)));
      float shine = (0.4 + 0.6 * sheen) * (1.15 - 0.4 * xy.y);
      // White where it is thick against the stone, bluer toward its thin front.
      vec3 rimeCol = envTone(c0, c1, c2, 0.85 - 0.75 * thick + w);
      vec3 ice = envTone(c0, c1, c2, 0.55 - 0.45 * thick + 0.6 * w) * 1.22;
      col = mix(col, rimeCol * uLight, gLit * (0.06 * body + 0.04 * crystal));
      col += gLit * ice * (0.02 * crystal + 0.004 * body) * shine;
      gFrost = gLit * cover * (0.2 + 0.8 * crystal) * shine;
    }
  }
  // The mist over the floor (and its frost): far, a thinner band a little
  // higher, finer and slower; near, larger and softer, low down, quicker.
  float ground = xy.y + 0.3 * (1.0 - come);
  if (ground > 0.5) {
    vec2 mf = vec2(p.x / S * 1.5 - tm * 0.005, (p.y + 0.35 * sinkPx) / S * 4.5);
    mf.x += 0.9 * vnoise(mf * 0.5 + vec2(3.1, tm * 0.01));
    float mfar = smoothstep(0.36, 0.78, fbm(mf)) * gauss((ground - 0.8) / 0.12);
    vec2 mn = vec2(p.x / S * 0.8 - tm * 0.007, (p.y + 0.7 * sinkPx) / S * 2.4 + 5.0);
    mn.x += 1.1 * vnoise(mn * 0.5 + vec2(tm * 0.012, 1.3));
    float mnear = smoothstep(0.3, 0.85, 0.65 * vnoise(mn) + 0.35 * vnoise(mn * 2.1 + 3.7)) * smoothstep(0.76, 1.02, ground);
    col = mix(col, envTone(c0, c1, c2, 0.62 + w) * 0.8 * uLight, come * (0.04 * mfar + 0.07 * mnear) * (1.0 - 0.5 * gDark));
  }
  return col;
}

// Abyssal Depths: the void coiling round two slow eddies (the embers
// swirl round the same), torn tendrils with the dark between them: their
// own colour (c1) where an arm is thick, paler at its heart (c0), deeper
// at its reach (c2), the colour wandering slowly between (vary; a void
// may be any colour at all). Each arm is the noise read round a circle
// about the eddy, turned by the log of the distance; toward the centre
// that circle shrinks with the square of the distance, so the arms draw
// together into a calm, dark eye instead of winding ever tighter into a
// point. The eddies open out from their centres as they come, and close
// in on them as they go.
vec3 env_void(vec3 col, vec2 p, vec2 q, vec2 xy, float S, float W, float H, float tm, float sink, float e,
              vec3 c0, vec3 c1, vec3 c2, float vary) {
  float v = 0.0;
  float near = 0.0;
  float size = 0.16 * (0.3 + 0.7 * e) * (0.3 + 0.7 * e);
  for (int i = 0; i < 2; i++) {
    vec2 c = (i == 0 ? uEddy.xy : uEddy.zw) * vec2(W, H);
    vec2 d = (p - c) / S;
    d += 0.12 * vec2(vnoise(q * 3.0 + float(i) * 7.0), vnoise(q * 3.0 + 4.0 + float(i) * 7.0)) - 0.06;
    float r2 = dot(d, d);
    float r = sqrt(r2);
    float eye = r2 / (r2 + 0.007);
    float a = (i == 0 ? 1.0 : -1.0) * atan(d.y, d.x) + 2.2 * log(r + 0.05) - tm * 0.1;
    float arm = vnoise(vec2(cos(a), sin(a)) * 1.5 * eye + vec2(r * 4.0, float(i) * 5.0));
    float sa = smoothstep(0.4, 0.8, arm);
    float reach = exp(-r2 / size);
    // Off the arm (sa +0) the eddy adds +0 to v: its tearing is skipped.
    if (sa > 0.0) {
      float torn = smoothstep(0.3, 0.7, fbm(q * 4.0 + vec2(tm * 0.03, float(i) * 3.0)));
      v += sa * torn * reach * eye;
    }
    near += reach;
  }
  float w = vary * envDrift(q, tm, 5.0);
  vec3 arm = envTone(c0, c1, c2, 0.85 - 0.45 * min(1.0, v) + w);
  vec3 heart = envTone(c0, c1, c2, 0.15 * max(0.0, w));
  col *= 1.0 - e * 0.35 * min(1.0, near) * (1.0 - min(1.0, v));
  return col + e * gLit * (arm * v * 0.16 + heart * pow(v, 3.0) * 0.08);
}

// Petrified Forest: stone trunks standing in the fog, the fog drifting
// past in layers, the far one behind the trunks, deeper and cooler (toward
// c2), and the nearer ones in front, paler (toward c0) and faster; the
// trunks near black in the fog's own hue. The fog rolls in first, and the
// trunks loom out of it after; going, they fade back into it.
vec3 env_mist(vec3 col, vec2 p, vec2 q, vec2 xy, float S, float W, float H, float tm, float sink, float e,
              vec3 c0, vec3 c1, vec3 c2, float vary) {
  float mist[3];
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float k = 1.5 + 0.9 * fi;
    float layer = fbm(vec2(q.x * k - tm * (0.012 + 0.016 * fi) * k, q.y * k * 2.6 + fi * 5.0));
    mist[i] = smoothstep(0.36, 0.76, layer) * gauss((xy.y - 0.25 - 0.28 * fi) / 0.26) * (0.6 + 0.2 * fi);
  }
  float w = vary * envDrift(q, tm, 6.0);
  vec3 far = envTone(c0, c1, c2, 0.65 + w) * uLight;
  vec3 nearer = envTone(c0, c1, c2, 0.3 + w) * uLight;
  float thin = e * e * 0.09 * (1.0 - 0.5 * gDark);
  col = mix(col, far, thin * (0.15 + 0.85 * min(1.0, mist[0])));
  // The trunks only loom out of the fog past 0.45 of its strength; below
  // that their mix is by +0, so they are skipped.
  if (smoothstep(0.45, 1.0, e) > 0.0) {
    float tx = q.x * 4.5 + 0.5 * vnoise(vec2(q.x * 2.0, q.y * 1.4));
    float trunks = smoothstep(0.56, 0.78, vnoise(vec2(tx, 3.0))) * smoothstep(-0.3, 0.5, xy.y);
    trunks = max(trunks, 0.6 * smoothstep(0.6, 0.82, vnoise(vec2(tx * 2.3 + 7.0, 5.0))) * smoothstep(-0.1, 0.6, xy.y));
    col = mix(col, envTone(c0, c1, c2, 0.5 + 0.5 * w) * 0.11 * uLight, smoothstep(0.45, 1.0, e) * 0.85 * trunks);
  }
  return mix(col, nearer, thin * min(1.0, mist[1] + mist[2]));
}

// Sulphur Vents: fumes billowing up from below in columns, spreading and
// thinning as they rise, lit from the vents: bright (c0) low down where
// the vents light them, the fumes' own colour (c1) and greyer (c2) as they
// thin out higher up. Coming, they rise from the floor; going, they sink
// back into it.
vec3 env_plumes(vec3 col, vec2 p, vec2 q, vec2 xy, float S, float W, float H, float tm, float sink, float e,
                vec3 c0, vec3 c1, vec3 c2, float vary) {
  float top = 0.35 + 0.9 * e;
  float up = 1.0 - xy.y;
  // Above the plumes' reach (billow lowers it by 0.075 at most) and away
  // from the vents the plume is +0, which leaves col as it is.
  if (up - 0.08 > top) return col;
  float xc = (p.x - 0.5 * W) / S;
  float vents = smoothstep(0.5, 0.78, vnoise(vec2(xc * 3.0 / (0.6 + 1.0 * up) + 10.0, 2.0)));
  if (vents <= 0.0) return col;
  vec2 bq = vec2(xc * 4.5, q.y * 1.8 + tm * 0.16);
  float billow = fbm(bq + 0.6 * vec2(vnoise(bq * 1.3 + vec2(0.0, tm * 0.1)), 0.0));
  float plume = vents * smoothstep(0.35, 0.72, billow) * (1.0 - smoothstep(0.15, 1.25, up)) * (1.0 - smoothstep(top - 0.4, top, up + 0.15 * (billow - 0.5)));
  float k = sqrt(e);
  float w = vary * envDrift(q, tm, 7.0);
  vec3 fume = envTone(c0, c1, c2, 0.45 + 0.5 * smoothstep(0.1, 1.0, up) + w);
  vec3 glow = envTone(c0, c1, c2, 0.05 + 0.4 * up + 0.6 * w);
  col = mix(col, fume * uLight, k * 0.1 * plume * (1.0 - 0.5 * gDark));
  return col + k * gLit * glow * plume * (0.3 + 0.7 * xy.y) * 0.05;
}

// Abyssal City: all but black, fog banks drifting at two depths in front
// of the far lights (drawn per pixel, see main(), in c1 and now and then
// c0, where they come on one by one as it comes, and go out one by one);
// the fog in c2, the nearer bank a little toward the lights' colour.
vec3 env_city(vec3 col, vec2 p, vec2 q, vec2 xy, float S, float W, float H, float tm, float sink, float e,
              vec3 c0, vec3 c1, vec3 c2, float vary) {
  float far = smoothstep(0.45, 0.8, fbm(vec2(q.x * 1.6 - tm * 0.01, q.y * 5.0))) * gauss((xy.y - 0.7) / 0.3);
  float nearer = 0.6 * smoothstep(0.5, 0.85, fbm(vec2(q.x * 2.6 - tm * 0.025, q.y * 7.0 + 4.0))) * gauss((xy.y - 0.42) / 0.25);
  float w = vary * envDrift(q, tm, 8.0);
  col *= 1.0 - e * 0.4;
  return col + e * gLit * (envTone(c0, c1, c2, 1.0 + w) * far + envTone(c0, c1, c2, 0.82 + w) * nearer) * 0.14;
}

// Primeval Ruins: fire welling up from below and licking up the walls,
// white-hot (c0) at its hottest low down, flame (c1) through it, deep red
// (c2) at its licking tips, the air over it shimmering in rising waves.
// Coming, it rises from the floor as it kindles; going, it sinks back down
// as it dies, its light growing and falling steadily with it either way.
vec3 env_heat(vec3 col, vec2 p, vec2 q, vec2 xy, float S, float W, float H, float tm, float sink, float e,
              vec3 c0, vec3 c1, vec3 c2, float vary) {
  // Where no fire can reach (rise is at most y + 0.14 + 0.33 * gSide) and
  // where it is cold (hot +0), col comes back as it is.
  if (xy.y + 0.14 + 0.33 * gSide - 0.12 * (1.0 - e) < 0.65) return col;
  vec2 hq = vec2(q.x * 3.0, q.y * 2.0 + tm * 0.5);
  float haze = fbm(hq + 0.6 * vec2(vnoise(hq * 1.7 + tm * 0.2), 0.0));
  float rise = xy.y + 0.28 * (haze - 0.5) + 0.22 * gSide * (0.5 + haze);
  float hot = smoothstep(0.66, 1.3, rise - 0.12 * (1.0 - e));
  if (hot <= 0.0) return col;
  float k = sqrt(e);
  float w = vary * envDrift(q, tm, 9.0);
  vec3 flame = envTone(c0, c1, c2, 0.95 - 0.55 * hot + w);
  vec3 white = envTone(c0, c1, c2, 0.4 * max(0.0, w));
  col += k * gLit * (flame * hot * 0.13 + white * pow(hot, 3.0) * 0.2);
  return col * (1.0 + k * 0.8 * (vnoise(vec2(q.x * 13.0, q.y * 5.0 + tm * 1.8)) - 0.5) * hot);
}
`;
