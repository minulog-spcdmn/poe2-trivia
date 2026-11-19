// The delirium aura's light in the effects shader (shaders.ts): `aura_delirium`,
// given the pixel's place (CSS px from the shape's centre), the shape's age
// (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7], s: f.q[9..11]);
// it gives back HDR light, added over the page. Every helper it needs is
// named `delirium_...`, so no two auras' names meet.
//
// Two layers, told apart by the sign of q.x (the token's radius):
//
// The fog (q.x > 0). A vortex of the Delirium's pale fog lies on a tilted
// plane round the token, seen in perspective, as thick as a torus: three
// slices of it at different heights, each streaked into spiral arms that
// turn with the vortex. Its far half passes behind the token (its disc hides
// it) and is dimmer; its near half drifts across the bottom of the face. A
// cold haze seeps out from behind the token, well past its rim.
//   q: token radius, the vortex's radius (px), its turn (rad), how deep in
//   the Delirium the player is (0-1). r: the surge (0-1 as it runs, below 0
//   for none), the swell (0-1: now and then the fog thickens and rolls out
//   wider sideways), the retreat (0-1), unused. s: the radius past which
//   there is no light (px), the plane's tilt and roll (both shapes share them).
//
// The shards (q.x < 0). Pieces of the broken Delirium Mirror ride the same
// tilted plane: those on the far side small, dim and hidden behind the
// token, those on the near side larger and bright, crossing in front of its
// face. No two alike: small pieces and splinters, a few larger, each an
// uneven outline of four to six corners, the larger ones cracked across;
// each at its own distance, the inner ones overtaking the outer.
// Each turns in three dimensions, and its silvered face mirrors the pale
// fog round it, the sky sliding over it as it turns and the light glinting
// in it when the face swings to meet it; its back is dull tarnish. Deep in
// the Delirium their edges come coloured, as the game's deep shards do.
//   q: minus the token radius, their orbit's radius (px), its turn (rad),
//   how many (fractional, up to 14). r: all lit at once (0-1), how far
//   they are flung out (a share of the radius, below 0 drawn in), the catch
//   running round them in order (0-1 as it runs, below 0 for none), how deep
//   in the Delirium the player is (0-1). s: unused, the plane's tilt and roll.

export const GLSL = `
// How much flatter than wide its haze and reach are: it spreads sideways, toward a
// name in a pill, and keeps off the players listed above and below.
const float DELIRIUM_FLAT = 1.75;

// Value noise in three octaves that wraps every period cells along x (round a circle).
float delirium_pfbm(vec2 p, float period) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * pnoise(p, period);
    p = p * 2.0 + vec2(0.0, 13.7);
    period *= 2.0;
    a *= 0.5;
  }
  return v / 0.875;
}

// A screen point (px from the centre) on the vortex's plane, the slice h px
// above it; the plane leans by tilt (how far its far side shows: 0 edge on,
// 1 seen from above) and rolls by roll (rad), both wandering slowly.
vec2 delirium_plane(vec2 p, float h, float tilt, float roll) {
  vec2 pp = rot2(p, -roll);
  return vec2(pp.x, (pp.y + h) / tilt);
}

// A point on the plane, h px above it, where it is drawn on screen.
vec2 delirium_screen(vec2 pl, float h, float tilt, float roll) {
  return rot2(vec2(pl.x, pl.y * tilt - h), roll);
}

// A four-pointed glint at p (px from its heart), len long, w wide.
float delirium_star(vec2 p, float len, float w) {
  vec2 a = abs(rot2(p, 0.42));
  float arms = exp(-a.y * a.y / (w * w)) * exp(-a.x / len) + exp(-a.x * a.x / (w * w)) * exp(-a.y / (len * 0.7));
  return arms + exp(-dot(p, p) / (w * w * 6.0)) * 0.8;
}

vec3 delirium_fog(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float R = max(q.x, 1.0);
  float ring = q.y;
  float flow = q.z;
  float depth = q.w;
  float sg = r.x;
  float mist = r.y;
  float retreat = r.z;
  float reach = s.x;
  float tilt = s.y;
  float roll = s.z;
  float rad = length(p);
  // The distance the haze and the reach go by: squeezed up and down, and less
  // so sideways while the fog swells, so it rolls out wider rather than taller.
  float erad = length(vec2(p.x * (0.8 - 0.28 * mist), p.y * DELIRIUM_FLAT));
  // What the token and its rim let through from behind them: 0 over them, 1 outside.
  float clear = smoothstep(R + 1.5, R + 3.5, rad);
  float swell = sg >= 0.0 ? sin(PI * clamp(sg, 0.0, 1.0)) : 0.0;

  // The vortex: three slices of fog at different heights, the middle one
  // thickest, each streaked into spiral arms. Near parts are brighter and
  // cross the face (a little of them, so the letter still reads); far parts
  // are dimmer and hidden behind the token.
  float fog = 0.0;
  float tw = R * (0.48 + 0.3 * depth + 0.25 * swell + 0.2 * mist);
  float hs = R * (0.3 + 0.1 * depth);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float h = (fk - 1.0) * hs;
    vec2 pl = delirium_plane(p, h, tilt, roll);
    float rho = length(pl);
    float u = atan(pl.y, pl.x) / (2.0 * PI);
    float nearness = pl.y / max(rho, 0.001);
    // The arms wind outward against the turn, so the vortex reads as turning;
    // the slices turn at their own rates (the lowest slowest), and the inner
    // fog runs ahead of the outer, so the arms keep shearing into new shapes.
    float rate = 0.82 + 0.18 * fk + 0.25 * max(1.6 - rho / R, 0.0);
    float uu = u - flow * rate / (2.0 * PI) + rho / R * 0.16 + fk * 0.31;
    // A slow warp of the fog's grain, so its streaks gather and part rather than repeat.
    float warp = vnoise(vec2(uu * 4.0 + fk * 1.7, time * 0.11 + seed)) - 0.5;
    float n = delirium_pfbm(vec2(uu * 6.0 + warp * 0.9, rho / R * 1.2 - time * 0.09 + seed + fk * 3.1 + warp * 0.6), 6.0);
    float arms = smoothstep(0.32, 0.86, n);
    // Fog from just inside the token's edge out past the vortex's radius, a
    // ragged outer edge torn by the noise.
    float beyond = max(rho - ring - (n - 0.5) * 0.5 * R, 0.0) / tw;
    float prof = smoothstep(0.7 * R, ring * 0.92, rho) * exp(-beyond * beyond);
    float dens = prof * (0.14 + 1.2 * arms * arms) * (1.0 + 0.4 * mist);
    // Retreating, it thins to its thickest arms.
    dens *= 1.0 - retreat * 0.6 * (1.0 - arms);
    float seen = mix(clear * 0.5, 0.36 + 0.64 * clear, smoothstep(-0.2, 0.2, nearness)) * (0.78 + 0.22 * nearness);
    fog += dens * seen * (k == 1 ? 0.66 : (k == 0 ? 0.34 : 0.42));
  }

  // The haze seeping out from behind the token, in slow billows.
  float out1 = max(erad - R, 0.0);
  vec2 hp = rot2(p / R, time * 0.05) * 1.3;
  float billow = 0.55 + 0.7 * fbm(hp + vec2(seed, -time * 0.08));
  float haze = (exp(-out1 / ((0.42 + 0.25 * mist) * R)) * 0.23 + exp(-out1 / ((1.1 + 0.8 * mist) * R)) * (0.075 + 0.05 * depth + 0.07 * mist)) * billow * clear;

  // The surge: a billow of fog running out through the haze, past the
  // neighbours for a moment, sideways most.
  float wave = 0.0;
  if (sg >= 0.0) {
    float front = mix(R, reach * 0.85, sg);
    float fw = 0.38 * R;
    float dx = (length(vec2(p.x, p.y * 1.3)) - front) / fw;
    wave = exp(-dx * dx) * (1.0 - sg) * (1.0 - sg) * smoothstep(0.0, 0.15, sg) * billow * 0.32 * clear;
  }

  vec3 pale = vec3(0.74, 0.78, 0.86);
  vec3 col = pale * ((fog + haze) * (1.0 - smoothstep(reach * 0.72, reach * 1.05, erad)) + wave);
  return col * (1.0 - smoothstep(reach * 0.72, reach, rad));
}

// Signed distance to a polygon of up to six corners (Inigo Quilez's), the
// corners given in order: it holds for any simple outline, convex or not.
float delirium_poly(vec2 p, vec2 v0, vec2 v1, vec2 v2, vec2 v3, vec2 v4, vec2 v5, int n) {
  float d = dot(p - v0, p - v0);
  float s = 1.0;
  vec2 prev = n == 4 ? v3 : (n == 5 ? v4 : v5);
  for (int i = 0; i < 6; i++) {
    if (i >= n) break;
    vec2 vi = i == 0 ? v0 : (i == 1 ? v1 : (i == 2 ? v2 : (i == 3 ? v3 : (i == 4 ? v4 : v5))));
    vec2 e = prev - vi;
    vec2 w = p - vi;
    vec2 b = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= vi.y, p.y < prev.y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
    prev = vi;
  }
  return s * sqrt(d);
}

// Corner j of a shard: its own uneven outline, laid out round its heart in
// the shard's plane (x along its length), the first corner its long point.
vec2 delirium_corner(float fi, float j, float n, float L, float asp, float shear, float seed) {
  float ha = hash12(vec2(fi * 7.0 + j, 5.31 + seed));
  float hr = hash12(vec2(fi * 7.0 + j, 9.17 + seed));
  float ang = 2.0 * PI * (j + (j < 0.5 ? 0.0 : 0.66 * (ha - 0.5))) / n;
  float rad = j < 0.5 ? 1.0 : 0.3 + 0.65 * hr;
  vec2 v = vec2(cos(ang) * rad * L * 0.72, sin(ang) * rad * L * asp);
  v.x += v.y * shear;
  return v;
}

// How bright the mirror shows a ray going out along r (screen axes, y down,
// z toward the eye): the pale sky of the fog above, its billows drifting
// through it, the dark ground below.
float delirium_env(vec3 r, float time, float seed) {
  float sky = 1.0 - smoothstep(-0.5, 0.3, r.y);
  float mist = vnoise(r.xy * 2.6 + vec2(time * 0.09 + seed * 3.0, seed));
  return 0.12 + 0.75 * sky * (0.6 + 0.5 * mist) + 0.12 * mist;
}

vec3 delirium_shards(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tilt = s.y;
  float roll = s.z;
  float R = max(-q.x, 1.0);
  float ring = q.y;
  float turn = q.z;
  float n = q.w;
  float flash = r.x;
  float fling = r.y;
  float sweep = r.z;
  float depth = r.w;
  float clear = smoothstep(R + 1.5, R + 3.5, length(p));
  // The light the shards catch, high and to the left, in front.
  vec3 Ld = normalize(vec3(-0.45, -0.7, 0.55));
  vec3 col = vec3(0.0);
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float wi = clamp(n - fi, 0.0, 1.0);
    if (wi <= 0.0) break;
    float h1 = hash12(vec2(fi, 3.17 + seed));
    float h2 = hash12(vec2(fi, 7.71 + seed));
    float h3 = hash12(vec2(fi, 1.39 + seed));
    float h4 = hash12(vec2(fi, 6.53 + seed));
    // Each rides the vortex at its own distance, the inner ones faster than
    // the outer (as in any whirl), so they keep passing one another and the
    // swarm never settles into one loop; each also drifts in and out and
    // ahead and back on slow beats of its own.
    float orb = 0.78 + 0.52 * h1;
    float a = turn * pow(orb, -1.5) + fi * 2.39996
      + 0.3 * sin(time * (0.11 + 0.08 * h1) + h2 * 6.28) + 0.12 * sin(time * (0.37 + 0.2 * h3) + h4 * 6.28);
    float breathe = 1.0 + 0.08 * sin(time * (0.21 + 0.17 * h4) + h3 * 6.28) + 0.05 * sin(time * (0.53 + 0.3 * h2) + fi);
    float rr = ring * orb * breathe * (1.0 + fling * (0.7 + 0.6 * h2));
    float hgt = (h2 - 0.5) * 0.5 * R + sin(time * (0.5 + 0.3 * h4) + fi * 2.1) * 0.08 * R;
    vec2 c = delirium_screen(vec2(cos(a), sin(a)) * rr, hgt, tilt, roll);
    // 1 nearest (at the front, below), -1 furthest (behind, above).
    float dep = sin(a);
    // Mostly small pieces and splinters, a few larger, none great.
    float sz = 0.4 + 0.55 * h3 * h3;
    float L = max(R * 0.42 * sz, 3.0) * (1.0 + 0.28 * dep) * (0.4 + 0.6 * wi);
    vec2 d0 = p - c;
    if (dot(d0, d0) > L * L * 9.0) continue;

    // Turned in three dimensions: end over end on its long axis, swaying on
    // its short one, hanging askew across its path.
    float phi = time * (0.45 + 0.4 * h1) + h2 * 6.28;
    float th = 0.6 * sin(time * (0.17 + 0.14 * h3) + h1 * 6.28);
    float rest = a + PI * 0.5 + (h1 - 0.5) * 1.8 + 0.3 * sin(time * 0.13 + fi * 1.7);
    float cp = cos(phi);
    float sp = sin(phi);
    float ct = cos(th);
    float st = sin(th);
    float cr = cos(rest);
    float sr = sin(rest);
    vec3 ex = vec3(ct * cr, ct * sr, -st);
    vec3 ey = vec3(sp * st, cp, sp * ct);
    ey = vec3(ey.x * cr - ey.y * sr, ey.x * sr + ey.y * cr, ey.z);
    vec3 nrm = cross(ex, ey);

    // Its outline: four to six corners, each shard its own break.
    int nc = 4 + int(floor(h4 * 2.99));
    float fn = float(nc);
    float asp = 0.32 + 0.3 * h2;
    float shear = (h3 - 0.5) * 0.7;
    vec2 v0 = delirium_corner(fi, 0.0, fn, L, asp, shear, seed);
    vec2 v1 = delirium_corner(fi, 1.0, fn, L, asp, shear, seed);
    vec2 v2 = delirium_corner(fi, 2.0, fn, L, asp, shear, seed);
    vec2 v3 = delirium_corner(fi, 3.0, fn, L, asp, shear, seed);
    vec2 v4 = delirium_corner(fi, 4.0, fn, L, asp, shear, seed);
    vec2 v5 = delirium_corner(fi, 5.0, fn, L, asp, shear, seed);
    vec2 P0 = c + v0.x * ex.xy + v0.y * ey.xy;
    vec2 P1 = c + v1.x * ex.xy + v1.y * ey.xy;
    vec2 P2 = c + v2.x * ex.xy + v2.y * ey.xy;
    vec2 P3 = c + v3.x * ex.xy + v3.y * ey.xy;
    vec2 P4 = c + v4.x * ex.xy + v4.y * ey.xy;
    vec2 P5 = c + v5.x * ex.xy + v5.y * ey.xy;
    float sd = delirium_poly(p, P0, P1, P2, P3, P4, P5, nc);
    float inside = 1.0 - smoothstep(-0.45, 0.45, sd);
    float lw = 0.38 + 0.012 * R;
    float rim = exp(-sd * sd / (lw * lw));

    // Its silvered face mirrors the fog round it: each pixel a ray off the
    // face (seen a little in perspective, so the sky slides across it as it
    // turns), the light glinting in it when the face swings to meet it. Its
    // back is the dull tarnished silvering.
    float front = smoothstep(-0.1, 0.1, nrm.z);
    vec3 nf = nrm * (nrm.z >= 0.0 ? 1.0 : -1.0);
    vec3 eye = normalize(vec3(-d0 / (L * 1.1), 1.0));
    vec3 ray = reflect(-eye, nf);
    float env = delirium_env(ray, time, seed + fi);
    float seq = sweep >= 0.0 ? exp(-pow((sweep * 1.25 - fi / max(n, 1.0)) / 0.09, 2.0)) : 0.0;
    float fl = max(flash, seq);
    float catchL = pow(max(dot(ray, Ld), 0.0), 14.0) * front;
    float tarnish = vnoise(d0 / max(L * 0.3, 1.0) + seed * 5.0 + fi * 3.0);
    float glass = inside * (mix(0.05 + 0.07 * tarnish, 0.08 + 0.85 * env, front) + catchL * 1.0 + fl * 0.75);

    // A crack across the larger pieces, from near its point to its far side
    // with a kink, catching the light along its broken edge.
    vec2 Pm = nc == 4 ? P2 : P3;
    vec2 kink = mix(P0, Pm, 0.5) + (ey.xy) * L * 0.07 * (h1 - 0.5) * 2.0;
    vec2 ka = mix(P0, Pm, 0.14);
    vec2 kb = mix(P0, Pm, 0.86);
    vec2 w1 = p - ka;
    vec2 e1 = kink - ka;
    vec2 w2 = p - kink;
    vec2 e2 = kb - kink;
    float dc = min(length(w1 - e1 * clamp(dot(w1, e1) / max(dot(e1, e1), 1e-6), 0.0, 1.0)),
                   length(w2 - e2 * clamp(dot(w2, e2) / max(dot(e2, e2), 1e-6), 0.0, 1.0)));
    float crack = inside * exp(-dc * dc / (lw * lw * 0.3)) * smoothstep(6.0, 10.0, L) * (0.12 + 0.3 * front * env + 1.2 * catchL + 0.5 * fl);

    // Its broken edge, brightest on the side toward the light.
    float side = 0.65 + 0.35 * dot(normalize(p - c + 1e-4), -normalize(Ld.xy));
    float edge = rim * (0.14 + 0.32 * front * env * side + 1.4 * catchL + 1.1 * fl);
    // The glass's thickness: a second, fainter line just inside the edge, on the lit side.
    float bi = (sd + 1.6 * lw) / lw;
    edge += inside * exp(-bi * bi) * smoothstep(5.0, 9.0, L) * side * (0.1 + 0.25 * env + 0.6 * catchL);
    // The glint at its long point, faded out well inside the reach it is drawn in.
    vec2 dt = p - P0;
    float flare = delirium_star(dt, L * (0.3 + 0.7 * catchL + 0.5 * fl), lw * 0.9) * (catchL * 0.6 + fl * 0.9)
      * (1.0 - smoothstep(1.4 * L, 2.6 * L, length(d0)));

    // Deep in, the mirror's shards come coloured: the colour runs in their edges and glints.
    vec3 hue = 0.6 + 0.4 * cos(6.2832 * (h1 + 0.04 * time + vec3(0.0, 0.33, 0.67)));
    vec3 tint = mix(vec3(0.92, 0.95, 1.0), hue, 0.4 * depth);
    // Behind the token on the far side, and dimmer the further it is.
    float seen = mix(clear, 1.0, smoothstep(-0.15, 0.15, dep)) * (0.62 + 0.38 * dep) * wi;
    col += (vec3(0.8, 0.84, 0.92) * glass + tint * (edge + crack) + mix(vec3(1.0), tint, 0.6) * flare) * seen;
  }
  return col;
}

vec3 aura_delirium(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  return q.x > 0.0 ? delirium_fog(p, time, seed, q, r, s) : delirium_shards(p, time, seed, q, r, s);
}
`;
