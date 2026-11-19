// The ice aura's light in the effects shader (shaders.ts): `aura_ice`, given
// the pixel's place (CSS px from the token's centre, +y down), the shape's
// age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7], s:
// f.q[9..11]); it gives back HDR light, added over the page. Every helper it
// needs is named `ice_...`, so no two auras' names meet.
//
// One function draws two kinds of layer, picked by q.x:
//
// 0, the cold heart: a deep cold light seeping from behind the token, wider
// than it is tall, and the token's own face as the cold takes it: ferns of
// frost growing in from its rim as the freeze builds, glittering, a pale
// wash of ice over it when it freezes through, and a flash on its rim as the
// frost shatters.
//   q: 0, the token's radius with its rim (px), the light (0-1+), the freeze's build (0-1).
//   r: chill (0-1: drained to a cold grey), the shatter's flash (0-1+), the
//   face's radius (px), frozen (0-1: the face iced over).
//   s: heat (0-1+: whiter light), the anticipation (0-1: the cold drawn in
//   hard just before it breaks), x.
//
// 1, a nova: the herald's icy explosion as Ice Nova draws it, a wave of ice
// rolling out from the token on a tilted plane through its middle. Its crest
// is a crisp, uneven line of light with a band of cracked, faceted ice behind
// it and small frost crystals forming along it; it throws shards of ice,
// slivers and broad flakes, each faceted, flung out and up, tumbling as they
// fly and flashing as a facet turns to the light, some trailing frost. The
// near half crosses the face (faint there, so the letter reads, and lighting
// it cold); the far half passes behind the token and is hidden by it.
//   q: 1, the token's radius with its rim (px), the crest's radius (px), the
//   plane's tilt (its height over its width).
//   r: the plane's roll (rad), the wave's light (0-1+), the shards' length
//   (px), how far it has broken up (0-1).
//   s: heat (0-1: white-hot), the wave's own number plus a tenth of its age
//   (s, up to 9.9), chill (0-1).

export const GLSL = `
// The colour drained toward a cold grey, by chill.
vec3 ice_chill(vec3 c, float chill) {
  float l = dot(c, vec3(0.3, 0.5, 0.2));
  return mix(c, vec3(l) * vec3(0.72, 0.84, 1.1), chill * 0.8);
}
// Ridged noise: thin bright lines where the noise crosses its middle.
float ice_ridge(vec2 x) {
  float n = vnoise(x) * 0.65 + vnoise(x * 2.13 + 7.1) * 0.35;
  return 1.0 - abs(2.0 * n - 1.0);
}
vec2 ice_hash22(vec2 p) {
  return vec2(hash12(p), hash12(p + vec2(17.31, 5.73)));
}
// Cells of cracked ice (Voronoi): the distance to the nearest crack, and the cell's own number.
vec2 ice_cells(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float md = 8.0;
  vec2 mr = vec2(0.0);
  vec2 mg = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 rv = g + ice_hash22(n + g) - f;
      float dd = dot(rv, rv);
      if (dd < md) {
        md = dd;
        mr = rv;
        mg = g;
      }
    }
  }
  float me = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 rv = g + ice_hash22(n + g) - f;
      vec2 dv = rv - mr;
      if (dot(dv, dv) > 1e-5) me = min(me, dot(0.5 * (mr + rv), normalize(dv)));
    }
  }
  return vec2(me, hash12(n + mg));
}
// Ferns of frost growing in from the face's rim (fr, px) as far as front
// (px): a spine for each of N sectors, wandering, and side branches leaving
// it toward the middle, shorter toward its tip. lw: the lines' width (px).
float ice_ferns(vec2 p, float fr, float front, float N, float off, float lw) {
  float rr = length(p);
  float f = (atan(p.y, p.x) / (2.0 * PI) + 0.5) * N + off;
  float cell = floor(f);
  float id = mod(cell, N);
  float h = hash12(vec2(id, off));
  float h2 = hash12(vec2(id + 0.5, off + 3.1));
  // Each its own length, and some not grown at all: no two alike, never a dial's ticks.
  float h3 = hash12(vec2(id + 0.21, off + 6.3));
  float len = front * (0.2 + 0.8 * h * h) * smoothstep(0.22, 0.4, h3) * (0.7 + 0.6 * h3);
  float u = fr - rr;
  float v = (fract(f) - 0.5 - (h2 - 0.5) * 0.4) * 2.0 * PI / N * rr + sin(u * 0.4 + h * 9.0) * 0.35 * lw * 2.0;
  // (Brightest at its growing tip, as fresh frost is.)
  float spine = exp(-v * v / (lw * lw)) * smoothstep(len + 0.4, len - 1.2, u) * smoothstep(-0.6, 0.6, u) * (0.55 + 0.45 * smoothstep(len * 0.4, len, u));
  // Feathery branches at 40 degrees toward the middle, close set, longest
  // near the rim and shorter toward the tip, each a little different.
  float av = abs(v);
  float t = av / 0.64;
  float u0 = u - t * 0.77;
  float sp = max(fr * 0.05, 1.15);
  float j = floor(u0 / sp + 0.5);
  float dd = abs(u0 - j * sp) * 0.64;
  float blen = max(len - j * sp, 0.0) * (0.25 + 0.3 * hash12(vec2(id + j * 0.13, off + 1.7)));
  float br = exp(-dd * dd / (lw * lw * 0.5)) * smoothstep(blen + 0.3, blen - 0.9, t) * smoothstep(0.4, 0.9, j) * (0.5 + 0.5 * smoothstep(0.0, 1.5, blen - t));
  return max(spine, br * 0.6);
}

vec3 ice_heart(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.y;
  float rr = length(p);
  float clear = smoothstep(tok - 0.7, tok + 0.7, rr);
  vec3 deep = vec3(0.16, 0.42, 1.25);
  vec3 cyan = vec3(0.42, 0.86, 1.5);
  vec3 pale = vec3(1.15, 1.4, 1.75);
  vec3 col = vec3(0.0);
  float build = q.w;
  float drawIn = s.y;
  // The cold seeping from behind the token: wider than tall, so it spreads
  // along a list's row rather than onto the players above and below. The
  // freeze building draws it in close, and just before it breaks, hard.
  float ra = length(vec2(p.x, p.y * 1.45));
  float beyond = max(ra - tok, 0.0);
  float breath = 0.9 + 0.1 * sin(time * 0.7 + seed * 6.0);
  float tight = (1.0 - 0.3 * build) * (1.0 - 0.35 * drawIn);
  float glow = exp(-beyond / ((0.3 * tok + 1.0) * tight)) * (0.5 + 0.25 * drawIn) + exp(-beyond / (0.85 * tok * tight)) * 0.1 * (1.0 - 0.6 * drawIn);
  col += mix(deep, cyan, 0.25 + 0.35 * build) * glow * q.z * breath * clear;
  // A thin cold line round the rim only as the burst is about to come, and the shatter's flash there.
  float rim = exp(-pow((rr - tok) / (0.55 + 0.04 * tok), 2.0));
  col += pale * rim * (0.6 * drawIn * drawIn + 0.9 * r.y) * clear;
  col += cyan * exp(-max(ra - tok, 0.0) / (0.32 * tok)) * r.y * 0.45 * clear;

  // The face, as the cold takes it.
  float fr = r.z;
  float on = 1.0 - smoothstep(fr - 0.8, fr + 0.4, rr);
  if (on > 0.0) {
    float frost = max(build, r.w);
    // Ferns of frost growing in from the rim, as rime grows on a window:
    // their tips creep in as the freeze builds; the letter's middle stays clear.
    float front = fr * (0.5 * pow(frost, 0.85) + 0.08 * r.w);
    float lw = clamp(0.2 + 0.008 * fr, 0.22, 0.5);
    float N = floor(clamp(fr / 2.4, 8.0, 17.0));
    float fern = ice_ferns(p, fr, front, N, seed * 31.0, lw);
    fern = max(fern, 0.7 * ice_ferns(rot2(p, 0.9), fr, front * 0.7, N + 3.0, seed * 17.0 + 5.0, lw * 0.85));
    float grown = smoothstep(0.02, 0.2, frost);
    col += pale * fern * grown * (0.5 + 0.4 * drawIn) * on;
    // Under them a fine rime, grown in from the rim with a ragged edge.
    {
      vec2 w = rot2(p / fr, seed * 3.0) * clamp(fr / 5.0, 3.5, 9.0) + seed * 17.0;
      float rime = pow(ice_ridge(w), 7.0) * 0.6 + pow(ice_ridge(w * 2.4 + 3.7), 10.0) * 0.5;
      float edge = fr - rr - front * 0.55 * (0.6 + 0.8 * pnoise(vec2((atan(p.y, p.x) / (2.0 * PI) + 0.5) * 9.0, seed * 7.0), 9.0));
      col += pale * rime * smoothstep(1.5, -1.5, edge) * grown * 0.22 * on;
    }
    // A breath of frost over the rim where the ferns grow from.
    col += cyan * exp(-max(fr - rr, 0.0) / (0.12 * fr)) * frost * 0.12 * on;
    // Glitter: points of the frost catching the light, each in its own time.
    {
      float gs = max(fr * 0.11, 1.8);
      vec2 gc = floor(p / gs);
      float gh = hash12(gc + seed * 13.0);
      vec2 gp = (gc + 0.2 + 0.6 * ice_hash22(gc + 3.0)) * gs;
      float tw = pow(0.5 + 0.5 * sin(time * (1.3 + 2.6 * gh) + gh * 40.0), 8.0);
      float inFrost = smoothstep(fr - front - 1.0, fr - front + 2.0, length(gp));
      vec2 dq = p - gp;
      float star = exp(-dot(dq, dq) / 0.3) + 0.35 * exp(-abs(dq.x) * 2.2) * exp(-dq.y * dq.y / 0.05) + 0.35 * exp(-abs(dq.y) * 2.2) * exp(-dq.x * dq.x / 0.05);
      col += pale * star * tw * smoothstep(0.72, 0.8, gh) * inFrost * grown * (1.1 + 0.8 * drawIn) * on;
    }
    // Frozen through: the whole face washed pale with ice, brightest at its rim.
    col += mix(cyan, pale, 0.4) * r.w * (0.14 + 0.2 * smoothstep(0.4, 1.0, rr / fr)) * on;
  }
  col *= 1.0 + 0.35 * s.x;
  return ice_chill(col, r.x);
}

vec3 ice_nova(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.y;
  float Rn = max(q.z, 1.0);
  float tilt = max(q.w, 0.05);
  float rr = length(p);
  float clear = smoothstep(tok - 0.7, tok + 0.7, rr);
  vec2 lp = rot2(p, -r.x);
  vec2 pl = vec2(lp.x, lp.y / tilt);
  float rho = length(pl);
  float z = pl.y / max(rho, 1e-3);
  float heat = s.x;
  float nid = floor(s.y);
  float age = fract(s.y) * 10.0;
  float broke = r.w;
  // Seen from where it lies: the far half behind the token (its disc hides
  // it), the near half over the face, faint there so the letter reads.
  float frontness = smoothstep(-0.2, 0.2, z);
  float seen = mix(clear, mix(0.38, 1.0, clear), frontness) * (0.55 + 0.45 * (0.5 + 0.5 * z));
  float ringU = atan(pl.y, pl.x) / (2.0 * PI) + 0.5;

  vec3 deep = vec3(0.16, 0.46, 1.35);
  vec3 cyan = vec3(0.45, 0.9, 1.55);
  vec3 white = vec3(1.35, 1.6, 1.9);
  vec3 col = vec3(0.0);

  // The crest: a crisp, uneven line of light. Distance to the wave's ellipse
  // (Inigo Quilez's approximation), negative inside it; it wavers in and out
  // along the ring, bright where the ice breaks and thin between, and splits
  // a little into its colours at the edges, as light through ice does.
  float rag = pnoise(vec2(ringU * 31.0, nid * 1.9), 31.0) * 0.6 + pnoise(vec2(ringU * 9.0 + 3.0, nid * 0.7), 9.0) * 0.4;
  float waver = (pnoise(vec2(ringU * 17.0, nid * 3.3), 17.0) - 0.5) * (0.05 * tok);
  vec2 ab = vec2(Rn, Rn * tilt);
  float k0 = length(lp / ab);
  float k1 = length(lp / (ab * ab));
  float d = k0 * (k0 - 1.0) / max(k1, 1e-4) - waver * (0.4 + 0.6 * abs(lp.x) / Rn);
  float lw = 0.32 + 0.014 * tok;
  float rk = (0.25 + 1.0 * smoothstep(0.3, 0.85, rag)) * (1.0 - 0.6 * broke);
  vec3 crest = vec3(exp(-pow((d - 0.45) / lw, 2.0)), exp(-pow(d / lw, 2.0)), exp(-pow((d + 0.45) / lw, 2.0)));
  col += crest * vec3(1.2, 1.5, 1.9) * rk * seen;
  col += cyan * exp(-abs(d) / (0.6 + 0.04 * tok)) * 0.1 * rk * seen;

  // Behind the crest, a band of new ice: cracked into facets that lie in
  // the plane (so foreshortened as it is), each its own tint and catching
  // the light in its own moment, its cracks bright. The band is uneven in
  // width and breaks up as the wave slows.
  {
    float bw = tok * (0.18 + 0.32 * pnoise(vec2(ringU * 13.0, nid * 2.7 + 1.0), 13.0)) * (1.0 - 0.5 * broke);
    float band = smoothstep(Rn + 0.6, Rn - 0.6, rho) * smoothstep(Rn - bw - 0.5, Rn - bw * 0.35, rho) * smoothstep(tok * 0.95, tok * 1.15, rho);
    if (band > 0.002) {
      float cs = 0.13 * tok + 1.0;
      vec2 c = ice_cells(pl / cs + nid * 3.7);
      float crack = exp(-pow(c.x * cs / (0.35 + 0.012 * tok), 2.0));
      float sheen = pow(0.5 + 0.5 * sin(c.y * 40.0 + ringU * 12.0 - age * 3.0), 4.0);
      vec3 face = mix(deep, cyan, c.y) * (0.12 + 0.35 * sheen);
      col += (face + white * crack * 0.55 * (1.0 - broke)) * band * seen;
    }
  }

  // The frost it leaves: faint streaks running out from the token across
  // the plane, just behind the band and gone toward the token.
  {
    float wake = exp(-max(Rn - rho, 0.0) / (0.4 * tok)) * smoothstep(Rn + 0.5, Rn - 1.5, rho) * smoothstep(tok * 0.9, tok * 1.3, rho);
    float st = pnoise(vec2(ringU * 56.0, rho / tok * 1.1 + nid * 3.1), 56.0);
    col += deep * wake * (0.06 + 0.5 * pow(st, 4.0)) * 0.5 * seen;
  }

  // Frost crystals forming along the crest: small six-armed stars, grown
  // as it passes, some brighter, a few twinkling.
  {
    float M = 34.0;
    float f0 = ringU * M + nid * 5.3;
    for (int k = -1; k <= 1; k++) {
      float cell = floor(f0) + float(k);
      float id = mod(cell, M);
      float h = hash12(vec2(id, nid + 41.0));
      float h2 = hash12(vec2(id + 0.3, nid + 7.0));
      float there = smoothstep(0.5, 0.6, h) * (1.0 - smoothstep(0.3, 0.9, broke));
      float a = ((cell + 0.5 + (h2 - 0.5) * 0.5 - nid * 5.3) / M - 0.5) * 2.0 * PI;
      float rad = Rn * (1.0 - 0.04 * h2) - 0.03 * tok * h;
      vec2 cp = vec2(cos(a), sin(a) * tilt) * rad;
      float near = 0.5 + 0.5 * sin(a);
      float sz = (0.06 + 0.08 * h2) * tok * (0.6 + 0.4 * near) * smoothstep(0.0, 0.5, age) + 0.4;
      vec2 dq = rot2(lp - cp, h * 6.0);
      float st = 0.0;
      for (int m = 0; m < 3; m++) {
        vec2 ax = rot2(dq, float(m) * PI / 3.0);
        float wl = 0.22 + 0.01 * tok;
        st += exp(-ax.y * ax.y / (wl * wl)) * smoothstep(sz, sz * 0.2, abs(ax.x));
      }
      st = min(st, 1.6) + exp(-dot(dq, dq) / (0.25 + 0.02 * tok)) * 0.8;
      float tw = 0.6 + 0.4 * sin(time * (2.0 + 3.0 * h) + h2 * 30.0);
      float shown = mix(clear, mix(0.38, 1.0, clear), smoothstep(-0.2, 0.2, sin(a)));
      col += white * st * there * tw * shown * 0.75;
    }
  }

  // The shards it throws, flung out along the plane and up out of it, riding
  // the crest at first, then breaking away. Two kinds: long slivers and
  // broad flakes, each its own length, width and place, faceted along a
  // ridge (one facet lit, one in its own blue), with a line of light inside
  // where it bends the light. They tumble as they fly: foreshortening and
  // swinging as they turn, the facets trading light, flashing as one turns
  // full to it. Some trail a wisp of frost.
  float L0 = r.z;
  if (L0 > 0.05) {
    for (int layer = 0; layer < 2; layer++) {
      float N = layer == 0 ? 17.0 : 29.0;
      float lk = layer == 0 ? 1.0 : 0.62;
      float off = nid * (layer == 0 ? 7.31 : 3.17);
      float lift0 = layer == 0 ? 0.34 : 0.24;
      // Which shards could reach this pixel: those round the angle it lies
      // at in the plane, once lowered by about as far as a shard there rises.
      float t0 = clamp((rho - (Rn - 0.5 * L0)) / max(L0, 0.5), 0.0, 1.1);
      vec2 lq = lp + vec2(0.0, lift0 * 1.4 * L0 * t0);
      float f0 = (atan(lq.y / tilt, lq.x) / (2.0 * PI) + 0.5) * N + off;
      for (int k = -1; k <= 1; k++) {
        float cell = floor(f0) + float(k);
        float id = mod(cell, N);
        float lf = float(layer);
        float h1 = hash12(vec2(id, nid * 1.37 + 0.5 + lf * 9.1));
        float h2 = hash12(vec2(id + 0.37, nid * 2.11 + 3.0 + lf * 4.3));
        float h3 = hash12(vec2(id + 0.71, nid * 0.73 + 9.0 + lf * 2.9));
        float h4 = hash12(vec2(id + 0.13, nid * 1.91 + 5.0 + lf * 6.7));
        // Some cells have none, more as they break off.
        float gap = (layer == 0 ? 0.16 : 0.4) + 0.45 * broke;
        float there = smoothstep(gap, gap + 0.12, h1);
        bool flake = h4 > 0.62;
        float L = L0 * lk * (0.45 + 0.75 * h1) * (flake ? 0.62 : 1.0);
        float a = ((cell + 0.5 + (h2 - 0.5) * 0.35 - off) / N - 0.5) * 2.0 * PI;
        vec2 dir = vec2(cos(a), sin(a));
        // Those thrown toward us or away rise more steeply, so none is seen end on.
        float lift = lift0 + 0.3 * abs(dir.y);
        float footR = Rn - L * (0.35 + 0.3 * h3) + broke * L * (0.5 + 0.9 * h2);
        vec2 A = vec2(dir.x, dir.y * tilt) * footR;
        vec2 B = vec2(dir.x, dir.y * tilt) * (footR + L) - vec2(0.0, lift * L * (0.5 + 0.6 * h2));
        // Its tumble: a turn about its middle, more once it has broken away.
        float spin = (2.0 + 5.0 * h3) * (h2 < 0.5 ? 1.0 : -1.0);
        float phi = h4 * 6.2832 + age * spin * (0.3 + 0.9 * broke);
        float tumble = 0.25 + 0.75 * broke;
        vec2 M = 0.5 * (A + B);
        vec2 hv = 0.5 * (B - A);
        hv = rot2(hv, tumble * 0.55 * sin(phi * 0.5 + h1 * 6.0)) * mix(1.0, 0.35 + 0.65 * abs(cos(phi)), tumble);
        A = M - hv;
        B = M + hv;
        vec2 ba = B - A;
        float bl = max(length(ba), 0.3);
        vec2 bn = ba / bl;
        vec2 pa = lp - A;
        float t = dot(pa, bn) / bl;
        float across = pa.x * bn.y - pa.y * bn.x;
        // Its outline: a sliver widest near its foot and drawn to a fine
        // point, or a flake, a lozenge widest a third of the way along.
        float wd = flake
          ? L * (0.3 + 0.12 * h3) * (t < 0.35 ? smoothstep(-0.02, 0.35, t) : 1.0 - smoothstep(0.35, 1.0, t))
          : L * (0.1 + 0.08 * h3) * lk * (1.0 - smoothstep(0.0, 1.0, t)) * smoothstep(-0.12, 0.15, t);
        wd *= mix(1.0, 0.5 + 0.5 * abs(sin(phi + 1.3)), tumble * 0.6);
        float e = wd - abs(across);
        float aa = fwidth(e) + 0.03;
        float inside = clamp(e / aa + 0.5, 0.0, 1.0) * clamp(wd / aa * 2.0, 0.0, 1.0) * there;
        float turn = cos(phi);
        float side = across * (h2 < 0.5 ? 1.0 : -1.0) * (turn < 0.0 ? -1.0 : 1.0);
        float lit = side > 0.0 ? 1.0 : 0.32;
        float facing = mix(1.0, 0.55 + 0.45 * abs(turn), tumble);
        float edgeL = exp(-e * e / 0.25) * there * smoothstep(-0.1, 0.05, t) * smoothstep(1.05, 0.85, t);
        float ridge = exp(-across * across / 0.1) * smoothstep(-0.1, 0.1, t) * smoothstep(1.0, 0.75, t);
        float bend = exp(-pow(abs(across) - wd * 0.55, 2.0) / 0.12) * smoothstep(0.15, 0.4, t) * smoothstep(0.85, 0.55, t);
        vec3 body = mix(deep, cyan, 0.25 + 0.55 * t) * (0.35 + 0.8 * lit * facing);
        float zs = dir.y;
        float shown = mix(clear, mix(0.38, 1.0, clear), smoothstep(-0.2, 0.2, zs)) * (0.6 + 0.4 * (0.5 + 0.5 * zs));
        vec3 sh = body * inside * 0.9 + white * (edgeL * 0.5 * lit + ridge * inside * 0.55 + bend * inside * 0.3);
        // The flash as a facet turns full to the light, and a glint at its point.
        float flash = pow(max(sin(phi), 0.0), 22.0) * tumble;
        sh += white * inside * flash * 1.3;
        if (h3 > 0.68 && !flake) {
          vec2 tp = lp - B;
          float g = exp(-dot(tp, tp) / 0.5) + 0.4 * exp(-abs(tp.x) * 1.8) * exp(-tp.y * tp.y / 0.06);
          sh += white * g * (0.45 + 0.55 * flash + 0.3 * sin(time * 5.0 + h2 * 30.0)) * there;
        }
        // A wisp of frost behind some, along the way it came.
        if (h4 < 0.35) {
          float tt = -dot(pa, bn) / max(L, 0.5);
          float ac = abs(across);
          float wisp = smoothstep(-0.05, 0.1, tt) * smoothstep(0.9, 0.2, tt) * exp(-ac * ac / pow(0.6 + L * 0.12 * (0.5 + tt), 2.0));
          float grain = 0.5 + 0.5 * vnoise(vec2(tt * 6.0 - age * 3.0, ac * 0.6 + h1 * 9.0));
          sh += cyan * wisp * grain * there * 0.16 * (0.4 + 0.6 * broke);
        }
        col += sh * shown * (1.0 + 0.5 * heat);
      }
    }
  }

  // The cold floods the face as the wave leaves it, from the near side.
  float faceLit = (1.0 - clear) * exp(-max(Rn - tok, 0.0) / (0.6 * tok)) * (0.55 + 0.45 * clamp(p.y / tok, -1.0, 1.0));
  col += mix(cyan, white, 0.3) * faceLit * 0.22;

  col *= r.y * (1.0 + 0.6 * heat);
  return ice_chill(col, s.z);
}

vec3 aura_ice(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  if (q.x < 0.5) return ice_heart(p, time, seed, q, r, s);
  return ice_nova(p, time, seed, q, r, s);
}
`;
