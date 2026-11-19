// The expedition aura's light in the effects shader (shaders.ts): `aura_expedition`,
// given the pixel's place (CSS px from the shape's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `expedition_...`, so no two auras' names meet.
//
// The token is a Remnant awake, as in the Runes of Aldur. Its runes are the
// game's own Remnant runes (the Expedition's Remnant art): sigils of fine
// line built on circles (a ring with a hood, a crosshair seal, a stave with a
// curl, a crescent with an eye, a spiral), with a near-white core, an
// electric sky blue body and a cornflower glow; the rare ones are lilac. Cold
// spirit-light rises off the Remnant in thin streaming wisps, as it does over
// the basin when Farrow's first Remnant wakes.
//
// Three kinds of shape draw it, told apart by q.x:
//
// 0, the wisps: spirit-light seeping from behind the token, streaming out
// from it all round in a field of strands about its waist (seen tilted: the
// far half behind it, the near half across the foot of its face), and a
// few rising off its crown.
//   q: 0, the token's radius (px), how high the wisps reach over its crown
//   (px), how much they gutter (0-1).
//   r: their flow (how far they have risen, in token radii), how dim they are
//   (0-1), how far toward the rare runes' lilac (0-1), the surge (0-1+).
//   s: the token's shift (px, x and y; a jolt), x.
//
// 1, the runes: up to five sigils standing in the air round the token, each
// in a place of its own about it in depth: written stroke by stroke with a
// thread of light from the token to the pen, held, turned a little, rising,
// then breaking up into motes, to be written again elsewhere. The far ones
// pass behind the token, smaller and dimmer.
//   q: 1, the token's radius (px), how many are awake (0-5, fractional as one
//   comes or goes), how much they gutter (0-1).
//   r: their clock (s), how much of them is struck out (0-1), heat (0-1+),
//   how far they have fallen (0-1).
//   s: the token's shift (px, x and y), the rare runes' lilac (0-1).
//
// 2, an inscription: one large rune written in the air over the token's
// crown at a moment (a vote, a right answer, a win), flaring as its last
// stroke is cut, then taken into the Remnant: it sinks behind the crown.
//   q: 2, the token's radius (px), the rune's radius (px), its glyph (0-7).
//   r: its age (s), the pen's time (s), lilac (0-1, a rare rune), its power (0-1+).
//   s: the token's shift (px), where its centre stands (px above the token's centre).

export const GLSL = `
// Distance from p to the segment a-b.
float expedition_seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// Value noise in octaves, wrapping round every period cells in x (for a
// pattern taken round a circle without a seam).
float expedition_pfbm(vec2 p, float period) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * pnoise(p, period);
    p = p * 2.0 + vec2(0.0, 17.3);
    period *= 2.0;
    a *= 0.5;
  }
  return v / 0.9375;
}

// Distance from lp to as much of one stroke as is cut (cut: 0-1 of it). A
// stroke is a line (type 0: a.xy to a.zw), an arc (type 1: centre a.xy,
// radius a.z, from angle a.w through b.y rad, counter-clockwise if positive)
// or a dot (type 2: centre a.xy, radius a.z).
float expedition_stroke(vec2 lp, vec4 a, vec2 b, float cut) {
  if (cut <= 0.0) return 1e5;
  int t = int(b.x + 0.5);
  if (t == 0) return expedition_seg(lp, a.xy, mix(a.xy, a.zw, cut));
  if (t == 2) return max(length(lp - a.xy) - a.z * cut, 0.0);
  vec2 d = lp - a.xy;
  float sw = b.y * cut;
  float rel = mod((atan(d.y, d.x) - a.w) * sign(sw), 6.2831853);
  if (rel <= abs(sw)) return abs(length(d) - a.z);
  vec2 e0 = a.xy + a.z * vec2(cos(a.w), sin(a.w));
  vec2 e1 = a.xy + a.z * vec2(cos(a.w + sw), sin(a.w + sw));
  return min(length(lp - e0), length(lp - e1));
}

// Distances from lp (in the rune's radii, y up) to rune g of the Remnant
// script: to the whole of it (x), to as much as the pen has cut (y; drawn
// strokes so far, in the order they are written), and to the stroke the pen
// is on (z). Eight runes, each a handful of strokes on circles: the hooded
// eye, the crosshair seal, the stave with its curl and feathers, the crossed
// arcs, the crescent with its eye, the ringed triangle, the rayed sun and
// the spiral.
vec3 expedition_glyph(vec2 lp, int g, float drawn) {
  const vec4 A[53] = vec4[53](
    // The hooded eye.
    vec4(-0.1, 0.1, 0.42, 1.5708), vec4(-0.1, 0.1, 0.1, 0.0), vec4(-0.1, 0.1, 0.74, 0.3491),
    vec4(0.75, -0.85, 0.75, 0.85), vec4(0.75, 0.5, 0.97, 0.72), vec4(-0.42, -0.5, -0.6, -0.82),
    vec4(-0.08, -0.56, -0.2, -0.88),
    // The crosshair seal.
    vec4(0.0, 0.0, 0.5, 1.5708), vec4(0.0, -0.95, 0.0, 0.95), vec4(-0.95, 0.0, 0.95, 0.0),
    vec4(0.0, 0.0, 0.11, 0.0), vec4(0.0, 0.0, 0.8, 1.9199), vec4(0.0, 0.0, 0.8, -1.2217),
    vec4(0.42, 0.42, 0.62, 0.62),
    // The stave with its curl and feathers.
    vec4(-0.1, -0.95, -0.1, 0.55), vec4(0.17, 0.55, 0.27, 3.1416), vec4(-0.1, 0.15, 0.6, -0.15),
    vec4(-0.1, -0.2, 0.6, -0.5), vec4(-0.1, -0.55, 0.45, -0.8), vec4(-0.1, 0.0, 0.78, 2.1817),
    // The crossed arcs.
    vec4(-0.95, 0.0, 1.15, -0.8378), vec4(0.95, 0.0, 1.15, 2.3038), vec4(0.0, -0.95, 0.0, 0.95),
    vec4(-0.42, 0.62, 0.09, 0.0), vec4(0.42, -0.62, 0.09, 0.0), vec4(-0.3, -0.92, 0.3, -0.92),
    // The crescent with its eye.
    vec4(0.0, 0.0, 0.75, 0.8727), vec4(0.32, 0.0, 0.55, 1.6581), vec4(0.35, 0.0, 0.11, 0.0),
    vec4(0.48, 0.57, 0.72, 0.86), vec4(0.48, -0.57, 0.72, -0.86), vec4(-0.75, 0.0, -0.98, 0.0),
    // The ringed triangle.
    vec4(0.0, 0.0, 0.82, 1.5708), vec4(0.0, 0.62, 0.54, -0.31), vec4(0.54, -0.31, -0.54, -0.31),
    vec4(-0.54, -0.31, 0.0, 0.62), vec4(0.0, 0.05, 0.1, 0.0), vec4(0.0, 0.82, 0.0, 0.98),
    vec4(0.71, -0.41, 0.85, -0.49), vec4(-0.71, -0.41, -0.85, -0.49),
    // The rayed sun.
    vec4(0.0, 0.0, 0.45, 1.5708), vec4(0.0, 0.56, 0.0, 0.95), vec4(0.0, -0.56, 0.0, -0.95),
    vec4(0.48, 0.28, 0.82, 0.47), vec4(-0.48, 0.28, -0.82, 0.47), vec4(0.48, -0.28, 0.82, -0.47),
    vec4(-0.48, -0.28, -0.82, -0.47), vec4(0.0, 0.0, 0.13, 0.0),
    // The spiral.
    vec4(0.0, 0.0, 0.82, 1.5708), vec4(0.12, 0.0, 0.7, 0.0), vec4(0.0, -0.12, 0.42, 4.0143),
    vec4(0.04, -0.1, 0.1, 0.0), vec4(0.0, 0.82, -0.22, 0.98)
  );
  const vec2 B[53] = vec2[53](
    vec2(1.0, 6.2832), vec2(2.0, 0.0), vec2(1.0, 2.4435), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(0.0, 0.0),
    vec2(1.0, -6.2832), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(2.0, 0.0), vec2(1.0, 0.8727), vec2(1.0, 0.8727), vec2(0.0, 0.0),
    vec2(0.0, 0.0), vec2(1.0, -3.8397), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(1.0, 1.9199),
    vec2(1.0, 1.6755), vec2(1.0, 1.6755), vec2(0.0, 0.0), vec2(2.0, 0.0), vec2(2.0, 0.0), vec2(0.0, 0.0),
    vec2(1.0, 4.5379), vec2(1.0, 2.9671), vec2(2.0, 0.0), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(0.0, 0.0),
    vec2(1.0, -6.2832), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(2.0, 0.0), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(0.0, 0.0),
    vec2(1.0, -6.2832), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(0.0, 0.0), vec2(2.0, 0.0),
    vec2(1.0, 4.7124), vec2(1.0, 4.0143), vec2(1.0, 3.4907), vec2(2.0, 0.0), vec2(0.0, 0.0)
  );
  const int START[9] = int[9](0, 7, 14, 20, 26, 32, 40, 48, 53);
  int i0 = START[g];
  int n = START[g + 1] - i0;
  vec3 d = vec3(1e5);
  for (int k = 0; k < 8; k++) {
    if (k >= n) break;
    vec4 a = A[i0 + k];
    vec2 b = B[i0 + k];
    d.x = min(d.x, expedition_stroke(lp, a, b, 1.0));
    float cut = clamp(drawn - float(k), 0.0, 1.0);
    float dc = expedition_stroke(lp, a, b, cut);
    d.y = min(d.y, dc);
    if (cut > 0.0 && cut < 1.0) d.z = dc;
  }
  return d;
}

// How many strokes rune g has.
float expedition_strokes(int g) {
  const float N[8] = float[8](7.0, 7.0, 6.0, 6.0, 6.0, 8.0, 8.0, 5.0);
  return N[g];
}

// The light of one rune of radius S (px) centred at c, turned yaw (rad) about
// its upright axis, drawn up to stroke drawn: its cut line (a near-white
// core in a sky blue body), a cornflower glow round it, and the stone-deep
// light behind it. hot whitens it; erode (0-1) breaks it up into motes;
// lilac takes it toward the rare runes' colour.
vec3 expedition_rune(vec2 p, vec2 c, float S, float yaw, int g, float drawn, float hot, float erode, float lilac, float time) {
  vec3 core = mix(vec3(1.7, 2.45, 2.95), vec3(2.6, 2.0, 3.0), lilac);
  vec3 sky = mix(vec3(0.5, 1.3, 2.6), vec3(1.55, 0.8, 2.6), lilac);
  vec3 azure = mix(vec3(0.2, 0.5, 1.7), vec3(0.9, 0.42, 1.8), lilac);
  vec3 deep = mix(vec3(0.03, 0.11, 0.4), vec3(0.2, 0.06, 0.38), lilac);
  vec2 v = p - c;
  float cy = max(cos(yaw), 0.35);
  vec2 lp = vec2(v.x / (S * cy), -v.y / S);
  // Its line stays about as fine at every size (px, then in its radii).
  float lw = max(0.5, S * 0.065);
  float lwg = lw / S;
  vec3 dd = expedition_glyph(lp, g, drawn);
  float dl = dd.y / lwg;
  float line = exp(-dl * dl);
  float body = exp(-dl * dl * 0.16);
  float halo = exp(-dd.y / (lwg * 7.0));
  // The stroke the pen is on burns white.
  float dp = dd.z / lwg;
  float pen = exp(-dp * dp * 0.5);
  // Breaking up: a grain over the rune eats its lines from the gaps out.
  float grain = vnoise(lp * 4.5 + vec2(0.0, time * 0.6) + float(g) * 7.0);
  float whole = 1.0 - smoothstep(grain - 0.12, grain + 0.12, erode * 1.3 - 0.15);
  vec3 col = mix(sky, core, 0.45 + 0.4 * hot) * line * 1.1 * whole;
  col += azure * body * 0.55 * whole + azure * halo * 0.11 * (0.4 + 0.6 * whole);
  col += core * pen * 1.2;
  // The deep light behind it, as of a stone lit from within, and the ghost
  // of its whole shape, faint, where the pen is still to go.
  float r2 = dot(v, v) / (S * S);
  col += deep * exp(-r2 * 0.7) * (0.6 + 0.8 * hot) * min(drawn, 1.0) * (1.0 - erode);
  float ghost = exp(-pow(dd.x / (lwg * 1.4), 2.0));
  float left = 1.0 - smoothstep(expedition_strokes(g) - 0.6, expedition_strokes(g), drawn);
  col += azure * ghost * 0.07 * left;
  return col;
}

vec3 aura_expedition(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float R = q.y;
  p -= s.xy;
  float rr = length(p);
  // What the token lets through from behind it: 0 over it and its rim, 1 outside.
  float clear = smoothstep(R + 0.3, R + 1.6, rr);
  vec3 sky = vec3(0.5, 1.3, 2.6);
  vec3 azure = vec3(0.2, 0.5, 1.7);
  vec3 deep = vec3(0.03, 0.11, 0.4);
  vec3 col = vec3(0.0);

  if (q.x < 0.5) {
    // The wisps.
    float H = q.z;
    float gutter = q.w;
    float flow = r.x;
    float dim = r.y;
    float lilac = r.z;
    float surge = r.w;
    vec3 sk = mix(sky, vec3(1.55, 0.8, 2.6), lilac);
    vec3 az = mix(azure, vec3(0.9, 0.42, 1.8), lilac);
    float breathe = 0.88 + 0.12 * sin(time * 0.8 + seed * 6.0);
    float d = max(rr - R, 0.0);
    float up = -p.y;
    // (On a small token, fewer and softer strands: finer ones than a pixel only sparkle.)
    float big = smoothstep(11.0, 30.0, R);
    // Cold light seeping out from behind the token all round, a little more
    // to its sides than above and below.
    float wide = mix(0.6, 1.0, abs(p.x) / max(rr, 1e-3));
    col += az * (exp(-d / (R * 0.12 + 0.8)) * 0.24 + exp(-d / (R * 0.5 + 2.5)) * 0.13) * wide * breathe;
    // The wisps over its crown: a few rise off it and gather, as the
    // spirit-light gathers over a Remnant as it wakes; at rest they stay low,
    // and only a surge carries them high.
    float top = R + H;
    float v = up / top;
    float vc = clamp(v, 0.0, 1.0);
    float sway = (fbm(vec2(flow * 0.3 + seed * 5.0, vc * 1.6)) - 0.5) * R * 0.6 * vc;
    float gather = mix(1.0, 0.3, smoothstep(0.1, 1.0, v));
    float x = (p.x - sway) / gather;
    float w = R * 0.95 * (1.0 + 0.2 * surge);
    float env = exp(-(x * x) / (w * w)) * smoothstep(0.2, 0.6, v) * (1.0 - smoothstep(0.6, 1.0, v));
    if (env > 0.002) {
      // Strands: fine along their length, streaming upward, curled by a slow warp.
      vec2 fq = vec2(x / R * mix(1.7, 3.4, big), up / R * 0.7 - flow);
      vec2 warp = vec2(fbm(fq * 0.55 + vec2(seed * 3.0, flow * 0.2)), fbm(fq * 0.55 + vec2(5.2, seed * 7.0 - flow * 0.1)));
      float n = fbm(fq + (warp - 0.5) * 1.8 + seed * 11.0);
      float ridge = 1.0 - abs(2.0 * n - 1.0);
      float strand = pow(ridge, mix(4.0, 11.0, big));
      float veil = ridge * ridge * ridge;
      // Toward the top, only the strands are left.
      float plume = env * (strand * (1.3 + 1.0 * surge) * mix(0.5, 1.0, big) + veil * 0.07 * (1.0 - vc));
      vec3 c = mix(az, sk, strand) + vec3(0.6, 0.7, 0.6) * strand * (1.0 - vc) * surge;
      col += c * plume * 0.9;
    }
    // Where they gather, a faint breathing light: the spirit the Remnant raises.
    vec2 hp = vec2(p.x - sway, up - top * 0.8);
    col += az * exp(-dot(hp, hp) / (R * R * 0.12)) * 0.1 * min(surge, 1.0) * breathe;
    col *= clear;

    // The face lit by the Remnant's cold light: faint at its heart, where the
    // letter is, stronger toward its rim and its foot, where the light round
    // its waist lies nearest; a surge floods it.
    {
      float e = clamp(rr / R, 0.0, 1.0);
      float foot = smoothstep(-0.4 * R, 0.9 * R, p.y);
      float wash = (0.05 + 0.22 * e * e * e) * mix(0.55, 1.0, foot) * (1.0 + 1.0 * min(surge, 1.2));
      col += mix(az, sk, 0.3) * wash * (1.0 - clear) * breathe;
    }

    // The spirit-light round its waist: a field of strands lying in a plane
    // about the token, seen tilted, streaming out from it all round and
    // curling as they go, the ones at its sides lifting a little. The plane's
    // far half passes behind the token; its near half crosses the foot of
    // its face, faint there so the letter reads. It reaches out sideways and
    // stays within the token's own height.
    {
      const float TILT = 0.48;
      float lift = R * 0.22 * pow(max(rr / R - 1.0, 0.0), 1.5);
      // (A little below its centre, so the near half reaches just past its foot.)
      vec2 g = vec2(p.x, (p.y + lift - R * 0.18) / TILT);
      float gr = max(length(g), 1e-3);
      float gz = g.y / gr;
      float rad = gr / R;
      float field = smoothstep(0.78, 1.08, rad) * exp(-pow(max(rad - 1.08, 0.0) / (0.5 + 0.4 * min(surge, 1.5)), 2.0));
      if (field > 0.002) {
        // Round the plane (0-1), wound a little as the strands go out: a slow swirl.
        float u = atan(g.x, g.y) / (2.0 * PI) + 0.5 + 0.06 * rad + flow * 0.01;
        float out_ = rad * 1.4 - flow * 0.9;
        float wv = expedition_pfbm(vec2(u * 10.0, out_ * 0.5 + seed * 5.0), 10.0);
        float nAround = mix(14.0, 26.0, big);
        float n = expedition_pfbm(vec2(u * nAround + (wv - 0.5) * 5.0, out_ + (wv - 0.5) * 0.9 + seed * 9.0), nAround);
        float ridge = 1.0 - abs(2.0 * n - 1.0);
        float strand = pow(ridge, mix(4.0, 10.0, big));
        float seenG = mix(clear, mix(0.3, 1.0, clear), smoothstep(-0.25, 0.25, gz)) * (0.55 + 0.45 * (0.5 + 0.5 * gz));
        float glow = field * (strand * (0.85 + 0.8 * surge) * mix(0.5, 1.0, big) + ridge * ridge * ridge * 0.05);
        col += mix(az, sk, strand) * glow * seenG * breathe;
      }
    }
    // A miss or a blow: the light gutters and dims.
    float sputter = 1.0 - gutter * 0.55 * vnoise(vec2(time * 13.0, seed * 7.0));
    return col * (1.0 - 0.8 * dim) * sputter;
  }

  if (q.x < 1.5) {
    // The runes.
    float awake = q.z;
    float gutter = q.w;
    float clock = r.x;
    float unwrite = r.y;
    float heat = r.z;
    float fall = r.w;
    float lilac = s.z;
    // A rune's radius: a little larger, for its size, on a small token.
    float S = max(R * 0.34, 4.6);
    const float T = 8.5;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float on = clamp(awake - fi, 0.0, 1.0);
      if (on <= 0.0) break;
      // Its life: written, held, broken up, then a pause before the next.
      float tt = clock + fi * T * 0.382;
      float cyc = floor(tt / T);
      float lt = tt - cyc * T;
      vec2 hk = vec2(fi * 17.13 + cyc * 3.71, seed * 31.7);
      float h1 = hash12(hk);
      float h2 = hash12(hk + 5.3);
      float h3 = hash12(hk + 9.1);
      float h4 = hash12(hk + 13.7);
      // Where it stands about the token: anywhere round it but straight in
      // front of the face, about the plane of the light round its waist
      // (seen tilted as that is: the near ones low, the far ones high), at a
      // height of its own; and it drifts on round, one way or the other, as
      // it rises a little.
      float drift = (h4 < 0.5 ? -1.0 : 1.0) * (0.035 + 0.04 * h1) * lt;
      float az = 0.5 + fract(fi * 0.2 + 0.15 * h1 + cyc * 0.382) * 5.28 + drift;
      // (Never quite in front of the face: one drifting there is turned aside.)
      float off = mod(az + PI, 2.0 * PI) - PI;
      az = sign(off) * max(abs(off), 0.45);
      float Rr = R * (1.22 + 0.2 * h4);
      float x3 = sin(az) * Rr;
      float z = cos(az);
      float y = R * (0.25 - 0.6 * h2) - R * 0.3 * (lt / T);
      y += fall * R * 0.7;
      vec2 c = vec2(x3, y + z * Rr * 0.48);
      float near = 0.5 + 0.5 * z;
      float sz = S * (0.82 + 0.3 * h3) * (1.0 + 0.2 * z);
      float sputter = 1.0 - gutter * (0.3 + 0.7 * vnoise(vec2(time * 11.0 + fi * 5.3, fi * 3.1 + seed)));
      // The thread: while it is written, a fine crooked line of light runs to
      // it from the token's edge.
      float writing = (1.0 - smoothstep(0.7, 1.5, lt)) * smoothstep(0.0, 0.15, lt) * (1.0 - unwrite);
      if (writing > 0.0) {
        vec2 dir = normalize(c + vec2(1e-3, 0.0));
        vec2 a = dir * R * 1.04;
        vec2 ab = c - a;
        float L = length(ab);
        vec2 tdir = ab / max(L, 1e-3);
        vec2 ap = p - a;
        float t = clamp(dot(ap, tdir) / max(L, 1e-3), 0.0, 1.0);
        float jag = (vnoise(vec2(t * 7.0 + fi * 9.0, time * 9.0)) - 0.5) * sz * 0.5 * sin(PI * t);
        float dx = dot(ap, vec2(-tdir.y, tdir.x)) - jag;
        float alongIn = smoothstep(-0.05, 0.0, dot(ap, tdir) / L) * smoothstep(1.05, 0.95, dot(ap, tdir) / L);
        float lw = max(0.45, sz * 0.05);
        float thread = exp(-(dx * dx) / (lw * lw)) * alongIn;
        float tSeen = mix(clear, 1.0, smoothstep(-0.2, 0.15, z));
        col += mix(sky, vec3(1.7, 2.45, 2.95), 0.3) * thread * writing * 0.55 * tSeen * on * sputter;
      }
      vec2 v = p - c;
      float far = length(v);
      // Past its light, nothing of it (faded out well before).
      if (far > sz * 3.4 + 4.0) continue;
      int g = int(floor(h3 * 7.99));
      float nS = expedition_strokes(g);
      // Written stroke by stroke over its first second; a miss strikes its
      // strokes out from the last, and they are written again after.
      float drawn = min(lt / 1.1 * (nS + 0.6), nS * (1.0 - unwrite));
      float yaw = 0.55 * sin(az) + 0.3 * sin(time * 0.37 + h1 * 6.2);
      float erode = smoothstep(T - 2.6, T - 0.7, lt);
      float hot = heat + 0.6 * exp(-max(lt - 1.1, 0.0) * 3.0) * smoothstep(0.9, 1.1, lt);
      vec3 rune = expedition_rune(p, c, sz, yaw, g, drawn, hot, erode, lilac * step(0.62, h2), time);
      float win = 1.0 - smoothstep(sz * 2.4, sz * 3.4 + 4.0, far);
      // The far ones are hidden by the token and dimmer.
      float seen = mix(clear, 1.0, smoothstep(-0.2, 0.15, z)) * (0.42 + 0.58 * near);
      float level = on * smoothstep(0.0, 0.2, lt) * (1.0 - smoothstep(T - 0.9, T - 0.3, lt)) * sputter * (1.0 + 0.5 * heat);
      col += rune * seen * level * win;
    }
    return col;
  }

  // An inscription over the crown.
  float S = q.z;
  int g = int(q.w + 0.5);
  float age = r.x;
  float penT = r.y;
  float lilac = r.z;
  float power = r.w;
  float nS = expedition_strokes(g);
  float drawn = age < penT ? age / penT * (nS + 0.4) : 9.0;
  float after = max(age - penT, 0.0);
  // Once cut and flared, it is taken into the Remnant: it sinks, shrinking,
  // behind the token's crown, and the light round its waist surges out.
  float sink = smoothstep(0.3, 1.5, after);
  float Sn = S * mix(1.0, 0.55, sink);
  vec2 c = vec2(0.0, -s.z * (1.0 - 0.8 * sink));
  vec3 az = mix(azure, vec3(0.9, 0.42, 1.8), lilac);
  // As it goes in, its light runs down over the face from the crown and is gone.
  float into = smoothstep(0.15, 0.6, sink) * (1.0 - smoothstep(0.7, 1.0, sink));
  float down = exp(-pow((p.y + R * (1.0 - 2.0 * sink)) / (R * 0.7), 2.0));
  col += az * into * down * (1.0 - clear) * (0.22 + 0.12 * power);
  vec2 v = p - c;
  float far = length(v);
  if (far > Sn * 3.4 + 4.0) return col;
  float flare = exp(-after * 4.0) * step(penT, age);
  float hot = 0.25 + 1.2 * flare;
  float erode = smoothstep(0.8, 1.7, after);
  float yaw = 0.18 * sin(age * 0.9 + seed * 6.0);
  vec3 rune = expedition_rune(p, c, Sn, yaw, g, drawn, hot, erode, lilac, time);
  // As the last stroke is cut, it flares: a wide breath of its glow.
  rune += az * exp(-dot(v, v) / (Sn * Sn * 1.8)) * flare * (0.45 + 0.3 * power);
  float win = 1.0 - smoothstep(Sn * 2.4, Sn * 3.4 + 4.0, far);
  float level = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(1.4, 1.9, after));
  // (Going in, behind the token: its face hides it.)
  float seen = mix(1.0, clear, smoothstep(0.2, 0.7, sink));
  return col + rune * level * win * seen * (1.0 + 0.3 * power);
}
`;
