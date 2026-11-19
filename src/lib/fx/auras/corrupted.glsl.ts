// The corrupted aura's light in the effects shader (shaders.ts): `aura_corrupted`,
// given the pixel's place (CSS px from the token's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `corrupted_...`, so no two auras' names meet.
//
// Corruption as a living growth: tendrils full of blood, each a creature of
// its own. One sprouts from behind the token, grows out tip first along a
// path of its own, curling as it goes so it wreathes round the token (behind
// it across the top, over the edge of its face below) and over the others;
// it writhes a while, then dies back from the tip and is gone, and later
// grows again somewhere else. Each lives at its own pace, so some are
// sprouting while others are full grown or withering. Now and then one
// reaches in over the rim and wraps round the face, grips it tighter, the
// corruption spreading into the face under it in fine veins, then lets go
// and dies back. They sprawl sideways,
// along the player's pill, and keep close to the token above and below.
// Each is translucent and lit from within: brightest down its middle, dim
// toward its skin, clots and veins as shadows in it, a wet sheen where the
// light catches its upper side, and a little of its own light round it;
// swellings of blood run out along it like a pulse. A dark seep of blood
// clings to the rim. Light can't darken: the darkness the growth lies in and
// the stain on the face are page layers (corrupted.ts).
//
// q: the token's radius with its rim (px), the growth's own time (s: it runs
//    faster as the corruption deepens, and backward for a moment when it's
//    thrown back, so the tendrils shrink), how deep the corruption runs (0
//    at rest to 1.5: a streak, a win), seconds since the last draw (blood
//    surging out from the token along every tendril).
// r: how far it has been thrown back (0-1: a miss; shrunk and dulled), how
//    torn (0-1: a lost life; the tendrils broken), the life left (0.4-1:
//    lives lost thin it for good), how far it has spread (0-1: the tendrils
//    come as the player arrives).
// s: the draw's strength, then the two grasping tendrils (0: none), each
//    packed by corrupted.ts as (+1/-1, the way it curls) times (1 + where
//    it reaches in, of 64 round the token, + 64 x how far it curls round,
//    0-7, + 0.998 x how far through its life it is).

export const GLSL = `
// Heavy blood: near black in its depths, its glow lit from within (a dark
// red, never toward pink or orange), and its sheen.
const vec3 corrupted_DEEP = vec3(0.12, 0.0, 0.007);
const vec3 corrupted_GLOW = vec3(0.46, 0.022, 0.03);
const vec3 corrupted_SHEEN = vec3(0.62, 0.2, 0.17);
// Where the light comes from: above and to the left, a little toward the eye.
const vec3 corrupted_LIGHT = vec3(-0.42, -0.72, 0.55);

// A point s of the way along a tendril (0 its root; 1 its full length).
// A: the angle it sets out at, which way it curls (+1/-1), by how much over
// its length (rad), and how far out it grows past the rim (radii). B: its
// own phase, whether it grasps (1) or grows out (0), how tight its grip is.
// t: the growth's time; R: the token's radius.
// One that grows out leaves from behind the token and curls round it as it
// grows, writhing: all of its reach sideways, a fifth of it above and below,
// so it spirals out wide and flat and the rows above and below stay clear.
// One that grasps reaches in from beside the token, climbs over its rim and
// wraps round over its face, inside the edge and clear of the letter in its
// middle, drawing tighter as it grips.
vec2 corrupted_at(float s, vec4 A, vec3 B, float t, float R) {
  if (B.y > 0.5) {
    float a = A.x + A.y * A.z * s + 0.12 * s * sin(s * 7.0 + t * 1.1 + B.x);
    float rr = 1.38 - (0.66 + 0.07 * B.z) * smoothstep(0.0, 0.38, s) + 0.04 * sin(s * 9.0 + t * 0.9 + B.x);
    return R * rr * vec2(cos(a), sin(a));
  }
  float a = A.x + A.y * A.z * pow(s, 1.2) + 0.3 * s * sin(s * 5.0 + t * 0.8 + B.x);
  float ext = A.w * s;
  return R * vec2((0.86 + ext) * cos(a), (0.86 + 0.2 * ext) * sin(a));
}

vec3 aura_corrupted(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float R = q.x;
  if (R <= 0.0) return vec3(0.0);
  float t = q.y;
  float deep = min(q.z, 1.5);
  float drawAge = q.w;
  float thrown = r.x;
  float torn = r.y;
  float vigor = r.z;
  float spread = r.w;
  float drawK = s.x;
  float tex = max(abs(dFdx(p.x)), 1e-4);
  float rad = length(p);
  // What the token lets through from behind it: 0 over it, 1 outside.
  float clear = smoothstep(R - 0.8, R + 0.6, rad);
  // Small tokens may sit side by side in a row of pills: fewer tendrils, reaching less far.
  float sm = 1.0 - smoothstep(12.0, 34.0, R);
  int count = sm > 0.5 ? 5 : 8;
  float reachK = spread * (1.0 - 0.32 * sm) * (1.0 + 0.3 * deep) * (0.6 + 0.4 * vigor) * (1.0 - 0.3 * torn);
  float widthK = R * (0.115 + 0.03 * sm) * (1.0 + 0.2 * deep) * (1.0 - 0.3 * thrown);
  float lift = (1.0 + 0.12 * deep) * (1.0 - 0.45 * thrown) * (0.7 + 0.3 * vigor) * (1.0 + 0.6 * sm);
  vec3 L = normalize(corrupted_LIGHT);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));

  vec3 col = vec3(0.0);
  // Eight that grow out (five on a small token), then the two that grasp.
  for (int i = 0; i < 10; i++) {
    bool grasp = i >= 8;
    if (!grasp && i >= count) continue;
    float fi = float(i);
    float g;
    float grip = 0.0;
    vec4 A;
    float ph;
    float girth;
    // (Its own key for the noise in it.)
    float nk;
    if (grasp) {
      // A grasping tendril's life is the page's (corrupted.ts): which way
      // and where it reaches, packed with how far through its life it is.
      float v = i == 8 ? s.y : s.z;
      if (v == 0.0) continue;
      float av = abs(v);
      float idx = floor(av);
      float u = clamp((av - idx) / 0.998, 0.0, 1.0);
      // It reaches in (two fifths of its life), grips (from a third to
      // most of it), lets go and dies back from the tip.
      g = smoothstep(0.0, 0.4, u) * (1.0 - smoothstep(0.75, 1.0, u));
      grip = smoothstep(0.35, 0.55, u) * (1.0 - smoothstep(0.7, 0.9, u));
      A = vec4(mod(idx - 1.0, 64.0) / 64.0 * 2.0 * PI, sign(v), 1.5 + 0.14 * floor((idx - 1.0) / 64.0), 0.0);
      ph = hash12(vec2(idx, 5.1)) * 6.2832;
      girth = 0.8;
      nk = idx * 0.37;
    } else {
      // Its life: it grows (a third of it), lives on writhing, then dies
      // back from the tip (from three quarters); each life it takes a new
      // path. Each tendril keeps its own period and its own place in it.
      float T = 8.0 + 6.0 * hash12(vec2(fi + 0.31, seed));
      float tt = t / T + hash12(vec2(fi + 0.77, seed * 1.3 + 2.0));
      float cyc = floor(tt);
      float u = tt - cyc;
      g = smoothstep(0.0, 0.36, u) * (1.0 - smoothstep(0.76, 1.0, u));
      vec2 key = vec2(fi * 7.13 + cyc * 1.37, seed * 3.7 + cyc * 0.21);
      // Out to one side or the other, turns about, it curls one way or the
      // other. (At most 2.2 radii past the rim and a bit: the quad's light
      // is gone by 3.45.)
      A = vec4(
        (mod(fi, 2.0) < 0.5 ? 0.0 : PI) + (hash12(key) - 0.5) * 1.5,
        hash12(key + 1.7) < 0.5 ? -1.0 : 1.0,
        0.6 + 1.5 * hash12(key + 3.1),
        min((0.6 + 1.3 * hash12(key + 4.9)) * reachK, 2.2)
      );
      girth = 0.6 + 0.8 * hash12(key + 6.3);
      ph = hash12(key + 8.2) * 6.2832;
      nk = fi * 3.1 + cyc;
    }
    if (g < 0.01) continue;
    vec3 B = vec3(ph, grasp ? 1.0 : 0.0, grip);

    // The nearest point of its grown length to this pixel, along it in
    // short straight pieces: how far, how far along, which side, and its way.
    vec2 a = corrupted_at(0.0, A, B, t, R);
    float best = 1e9;
    float bs = 0.0;
    float side = 1.0;
    vec2 way = vec2(1.0, 0.0);
    vec2 near = a;
    const int M = 10;
    for (int k = 1; k <= M; k++) {
      float sk = g * float(k) / float(M);
      vec2 b = corrupted_at(sk, A, B, t, R);
      vec2 ba = b - a;
      float bb = max(dot(ba, ba), 1e-6);
      float hh = clamp(dot(p - a, ba) / bb, 0.0, 1.0);
      vec2 cp = a + ba * hh;
      float d = length(p - cp);
      if (d < best) {
        best = d;
        bs = g * (float(k) - 1.0 + hh) / float(M);
        side = sign(ba.x * (p.y - a.y) - ba.y * (p.x - a.x));
        way = ba * inversesqrt(bb);
        near = cp;
      }
      a = b;
    }

    // Its girth there: thickest near the token, tapering to a point at its
    // tip, swelling where the blood's pulse runs out along it, and where a
    // draw's surge is passing.
    float x = bs / max(g, 1e-3);
    float sg = (bs - drawAge * 1.6) / 0.14;
    float surge = drawK * exp(-sg * sg);
    // (One that grips clenches as it holds, and is thinner where it lies over
    // the face, so the letter still reads through it.)
    float bulge = 1.0 + 0.2 * sin(bs * 16.0 - t * 4.0 + ph) + 0.5 * surge + 0.15 * grip * sin(t * 2.6 + ph);
    float hw = widthK * girth * bulge * pow(max(1.0 - x, 0.0), 0.55) * smoothstep(0.0, 0.06, bs);
    if (grasp) hw *= mix(0.85, 1.0, clear);
    // Torn: broken into lengths.
    float brk = mix(1.0, smoothstep(0.35, 0.6, vnoise(vec2(bs * 9.0, nk))), torn);
    float cover = clamp((hw - best) / (tex * 0.9) + 0.5, 0.0, 1.0);
    // A tendril thinner than a pixel or so fades rather than breaking off.
    float seen = smoothstep(0.15 * tex, 1.4 * tex + 0.25, hw) * brk;

    // Rounded like flesh: its surface's normal across it, lit from above.
    float sa = clamp(side * best / max(hw, 1e-3), -1.0, 1.0);
    float z = sqrt(max(1.0 - sa * sa, 0.0));
    vec3 n = vec3(vec2(-way.y, way.x) * sa, z);
    float spec = pow(max(dot(n, H), 0.0), 26.0);
    // Within it: clots, and darker veins along it (none on a small token,
    // where they'd be finer than a pixel and darken it all).
    float clot = 0.55 + 0.8 * vnoise(vec2(bs * 7.0 + nk * 1.7, sa * 0.8 + nk));
    float vein = smoothstep(0.0, 0.08, abs(fract(bs * 9.0 + sa * 0.6 + girth) - 0.5) - 0.42) * smoothstep(16.0, 30.0, R);
    float dark = (1.0 - 0.5 * vein) * clot;
    vec3 c = corrupted_DEEP * (1.0 - z) * 0.8;
    c += corrupted_GLOW * (0.18 + 0.82 * z * z) * dark * (1.0 + 0.6 * surge);
    c += corrupted_SHEEN * spec * 0.4;
    float halo = exp(-max(best - hw, 0.0) / (0.5 * hw + 0.7)) * (1.0 - cover) * smoothstep(0.0, 1.5, hw);
    c = c * cover + corrupted_GLOW * halo * 0.16 * clot;

    // Behind the token across the top, its disc hiding it; over the edge of
    // its face below (there kept low: light over the bright face only tints it).
    // One that grasps lies over the face all the way, on the dark of the
    // blood it stains it with (corrupted.ts), so it shows there in full.
    float front = smoothstep(-0.25, 0.25, near.y / max(length(near), 1e-3));
    float shown = grasp ? 1.0 : mix(clear, mix(0.32, 1.0, clear), front);
    // Translucent: the tendrils under it show through, a little dimmed.
    col = col * (1.0 - 0.35 * cover * seen * shown) + c * seen * shown * lift;

    // Where it grips, the corruption spreads into the face beneath: fine
    // veins of blood branching out from it into the stain, short of the
    // letter (none on a small token, where they'd be finer than a pixel).
    if (grasp) {
      float hold = grip * (1.0 - clear) * smoothstep(0.3 * R, 0.5 * R, rad) * exp(-max(best - hw, 0.0) / (0.2 * R)) * brk;
      vec2 vp = p / (0.1 * R + 1.0) + vec2(nk * 5.7, nk * 3.1);
      float l1 = 1.0 - smoothstep(0.0, 0.05, abs(vnoise(vp) - 0.5));
      float l2 = 1.0 - smoothstep(0.0, 0.04, abs(vnoise(vp * 2.1 + 3.3) - 0.5));
      col += corrupted_GLOW * (l1 + 0.6 * l2) * hold * 0.6 * lift * smoothstep(14.0, 26.0, R);
    }
  }

  // The dark seep of blood clinging to the rim, and its flush as a draw
  // starts out from it.
  float beyond = max(rad - R, 0.0);
  float flush = drawK * smoothstep(0.0, 0.06, drawAge) * exp(-drawAge / 0.35);
  float seep = exp(-beyond / (0.1 * R + 0.6)) * clear * spread;
  col += corrupted_GLOW * seep * ((0.18 + 0.08 * deep) * (1.0 - 0.5 * thrown) + 0.6 * flush);
  return col;
}
`;
