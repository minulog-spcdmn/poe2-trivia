// The azmeri aura's light in the effects shader (shaders.ts): `aura_azmeri`,
// given the pixel's place (CSS px from the token's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `azmeri_...`, so no two auras' names meet.
//
// An Azmeri spirit in PoE2 is a wisp: not a solid ball but a sparkling
// cluster, a white heart in a swirl of twinkling glints of its colour (the
// wildwood's are primal cyan, wild magenta, vivid yellow and sacred orange),
// that drifts along a route of its own, hangs, then darts off, shedding a
// trail of glitter that hangs in the air behind it and fades. Here the
// wildwood's wisps keep the wearer: each wanders round the token on a path
// of its own, wide and low (sideways, so a list's rows above and below stay
// clear), passing behind the token (its disc hides it, and it lights the rim
// it passes behind) and in front of its face. All the sparkle is theirs.
//
// One function draws two kinds of layer, picked by s.z:
//
// 0, the spirit light: a cold light from behind the token; the token
// possessed (a wisp gone into it), its face lit from within; and the stag's
// spirit antlers rising from behind it, grown root to tip and dissolving
// tips first.
//   q: the token's radius with its rim (px), the light (0-1+), how far it is
//   possessed (0-1), by which wisp (its hue, as below).
//   r: how far the antlers have grown (0-1.15, root to tip), their size (1
//   as ever), their tines (1-4), how much of them is left (1 whole, 0 gone).
//   s: x, x, 0.
//
// 1, a wisp.
//   q: the token's radius with its rim (px), its phase along its path, how
//   far back along it its glitter lasts (phase, to 1.6), its path's key (0-1).
//   r: its hue (0 cyan, 1 magenta, 2 yellow, 3 orange), how far out it
//   flies (1 as ever), how far it has dived into the token (0-1), its light.
//   s: seconds since it burst (none past 1), how much of it is here (0-1),
//   its size (0.5-1; 0 is the spirit light's layer).
//
// The path is the same as pathAt in azmeri.ts.

export const GLSL = `
// The wisps' four colours, as the wildwood's are: primal cyan, wild magenta,
// vivid yellow, sacred orange.
vec3 azmeri_hue(float i) {
  if (i < 0.5) return vec3(0.3, 1.2, 1.95);
  if (i < 1.5) return vec3(1.8, 0.45, 1.6);
  if (i < 2.5) return vec3(1.75, 1.55, 0.4);
  return vec3(2.0, 0.85, 0.25);
}
// What the token lets through from behind it at radius rr: 0 over its face, 1 outside.
float azmeri_clear(float rr, float tok) {
  return smoothstep(tok - 1.0, tok + 0.8, rr);
}
// How much of a point at depth z shows: behind the token (z < 0) only off its disc.
float azmeri_occ(float clr, float z, float tok) {
  return mix(clr, 1.0, smoothstep(-0.15 * tok, 0.15 * tok, z));
}
// A glint: a soft point of size g, with a four-point star's rays (0-1).
float azmeri_glint(vec2 d, float g, float rays) {
  float c = exp(-dot(d, d) / (g * g));
  vec2 a = abs(d);
  float w2 = 0.1 * g * g;
  float x = exp(-a.x / (2.0 * g)) * exp(-d.y * d.y / w2) + exp(-a.y / (2.0 * g)) * exp(-d.x * d.x / w2);
  return c + rays * 0.5 * x;
}
// A twinkle: mostly low, peaking now and then (0-1).
float azmeri_twinkle(float t) {
  float v = 0.5 + 0.5 * sin(t);
  return v * v * v;
}
// A wisp's place at phase ph on its path: x, y on screen (px, +y down,
// before perspective) and z toward the eye. Its way round turns back on
// itself now and then; it swings in and out and rises and sinks a little.
vec3 azmeri_path(float ph, float k, float tok, float far_) {
  float a1 = 6.2832 * k;
  float a2 = 6.2832 * fract(k * 7.31);
  float a3 = 6.2832 * fract(k * 3.17);
  float a4 = 6.2832 * fract(k * 5.71);
  float a5 = 6.2832 * fract(k * 9.13);
  float th = 0.7 * ph + 1.5 * sin(0.61 * ph + a1);
  float el = 0.22 * sin(0.83 * ph + a2) + 0.08 * sin(1.9 * ph + a3);
  float rho = tok * (1.65 + 0.25 * sin(1.37 * ph + a4)) * far_;
  float h = rho * cos(el);
  float x = 1.1 * h * sin(th);
  float y = -rho * sin(el);
  float z = h * cos(th);
  // Seen a little from above: the far side rides higher than the near.
  float Y = y * 0.9664 + z * 0.2571;
  float Z = z * 0.9664 - y * 0.2571;
  vec2 xy = vec2(x, Y) + tok * vec2(0.1 * cos(3.7 * ph + a5), 0.07 * sin(3.7 * ph + a5));
  return vec3(rot2(xy, 0.25 * (k - 0.5)), Z);
}
// Where the eye sees a point of the path, dived in by b toward the token's face: x, y (px) and z.
vec3 azmeri_seen(float ph, float k, float tok, float far_, float b) {
  vec3 at = mix(azmeri_path(ph, k, tok, far_), vec3(0.0, 0.0, 0.45 * tok), b);
  float F = 9.0 * tok;
  return vec3(at.xy * (F / (F - at.z)), at.z);
}

vec3 azmeri_wisp(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.x;
  float ph = q.y;
  float span = q.z;
  float k = q.w;
  float far_ = r.y;
  float dive = r.z;
  float here = s.y;
  vec3 hue = azmeri_hue(r.x);
  vec3 pale = vec3(2.0, 2.15, 2.3);
  float rr = length(p);
  float clr = azmeri_clear(rr, tok);
  float face = mix(0.4, 1.0, clr);
  // The wisp's own unit, which keeps it fine on a small token; and how much
  // of a glint's star shows (on a small token its rays would be specks).
  float cs = (0.8 + 0.03 * tok) * s.z;
  float rays = smoothstep(14.0, 30.0, tok * s.z);
  vec3 col = vec3(0.0);

  // The glitter it sheds: a glint left at each step of its path, hanging
  // where it was left, drifting up and apart as it fades.
  // (span: how long the trail is, in phase, up to all K steps of it.)
  const int K = 16;
  const float STEP = 0.1;
  float base = floor(ph / STEP);
  for (int j = 0; j < K; j++) {
    float n = base - float(j);
    float at = n * STEP;
    float u = min((ph - at) / span, 1.0);
    float h1 = hash12(vec2(n, k * 97.0));
    float h2 = hash12(vec2(n + 0.37, k * 61.0 + 3.0));
    float h3 = hash12(vec2(n + 0.71, k * 23.0 + 7.0));
    vec3 c = azmeri_seen(at, k, tok, far_, 0.0);
    vec2 drift = (vec2(h1, h2) - 0.5) * tok * vec2(0.3 + 0.7 * u, 0.15 + 0.35 * u) + vec2(0.0, -0.18 * tok * u);
    vec2 d = p - c.xy - drift;
    float life = smoothstep(0.0, 0.08, u) * pow(max(1.0 - u, 0.0), 1.4);
    float tw = 0.3 + 0.7 * azmeri_twinkle(time * (2.0 + 2.5 * h3) + h3 * 40.0);
    float g = cs * (0.44 + 0.34 * h3) * (1.0 - 0.3 * u);
    float near = smoothstep(-1.6 * tok, 1.6 * tok, c.z);
    float seen = azmeri_occ(clr, c.z, tok) * (0.55 + 0.45 * near) * face;
    vec3 tint = mix(mix(pale, hue, 0.45), hue, u);
    col += tint * azmeri_glint(d, g, rays * step(0.55, h3)) * life * tw * seen * 1.35;
    // A second, finer one beside it, drifting the other way.
    vec2 d2 = d + drift * 1.8 - (vec2(h3, h1) - 0.5) * tok * vec2(0.25 + 0.5 * u, 0.12 + 0.25 * u);
    float tw2 = 0.3 + 0.7 * azmeri_twinkle(time * (2.6 + 2.0 * h1) + h2 * 50.0);
    col += mix(tint, hue, 0.4) * azmeri_glint(d2, g * 0.75, 0.0) * life * tw2 * seen * 1.1;
  }

  col *= here;

  // Where it is now; diving, it is drawn in toward the token's face.
  float b0 = smoothstep(0.0, 1.0, clamp(dive * 1.6, 0.0, 1.0));
  vec3 head = azmeri_seen(ph, k, tok, far_, b0);

  // The wisp itself: a white heart, a halo of its colour, and a swarm of
  // glints turning round it, each on its own tilted ring, twinkling.
  float z0 = head.z;
  float near0 = smoothstep(-1.6 * tok, 1.6 * tok, z0);
  float gone0 = 1.0 - smoothstep(0.8, 1.0, b0);
  float seen0 = azmeri_occ(clr, z0, tok) * (0.55 + 0.45 * near0) * face * gone0 * here;
  float hc = cs * (0.75 + 0.35 * near0) * (0.4 + 0.6 * here);
  vec2 e = p - head.xy;
  float e2 = dot(e, e);
  float el = sqrt(e2);
  float beat = 0.88 + 0.12 * sin(time * 2.6 + seed * 20.0);
  vec3 wisp = mix(pale, hue, 0.25) * exp(-e2 / (hc * hc)) * 1.75 * beat
            + hue * (exp(-e2 / (7.0 * hc * hc)) * 0.3 + exp(-el / (2.5 * hc + 0.06 * tok)) * 0.05);
  // (A faint light of its colour round the swarm, so it has a body.)
  wisp += hue * exp(-el / (0.18 * tok + 2.0 * hc)) * 0.04;
  const int M = 9;
  for (int j = 0; j < M; j++) {
    float fj = float(j);
    float h1 = hash12(vec2(fj, k * 41.0 + 1.0));
    float h2 = hash12(vec2(fj + 0.5, k * 17.0 + 5.0));
    float rad = hc * (2.0 + 4.2 * h1);
    float ang = time * (0.9 + 1.1 * h2) * (h1 < 0.5 ? -1.0 : 1.0) + 6.2832 * h2;
    float tilt = 0.25 + 0.6 * h1;
    vec2 o = rot2(vec2(cos(ang), tilt * sin(ang)) * rad, 3.0 * h2);
    float front = 0.55 + 0.45 * sin(ang);
    float tw = 0.25 + 0.75 * azmeri_twinkle(time * (2.5 + 3.0 * h1) + 30.0 * h2);
    float g = cs * (0.3 + 0.22 * h2) * (0.8 + 0.3 * near0);
    wisp += mix(pale, hue, 0.5) * azmeri_glint(e - o, g, rays * step(0.6, h2)) * tw * front * 1.1;
  }
  col += wisp * seen0;

  // Behind the token, it lights the rim it passes behind; in front, the face under it.
  float behind = smoothstep(0.1 * tok, -0.45 * tok, z0) * gone0 * here;
  float prox = exp(-el / (0.7 * tok));
  float rw = 1.0 + 0.04 * tok;
  float rim = exp(-(rr - tok - 0.6) * (rr - tok - 0.6) / (rw * rw));
  col += hue * (rim * 0.5 + exp(-max(rr - tok, 0.0) / (0.2 * tok + 1.0)) * 0.1) * prox * behind * clr;
  float lit = smoothstep(0.0, 0.6 * tok, z0) * gone0 * here;
  col += hue * exp(-e2 / (0.5 * tok * tok)) * (1.0 - clr) * 0.12 * lit;

  col *= r.w;

  // A burst: the wisp gone in a flash, its glitter thrown out.
  float bt = s.x;
  if (bt >= 0.0 && bt < 1.0) {
    float fl = cs * (1.4 + 3.0 * bt);
    float flash = exp(-e2 / (fl * fl)) * 2.6 * exp(-bt * 9.0);
    float R = cs * 1.5 + (1.0 - exp(-bt * 6.0)) * 0.55 * tok;
    float rwid = 0.5 + 0.4 * cs + bt * 2.0;
    float ring = exp(-(el - R) * (el - R) / (rwid * rwid)) * 0.5 * exp(-bt * 7.0);
    col += (mix(pale, hue, 0.25) * flash + hue * ring) * mix(0.6, 1.0, clr) * (1.0 - smoothstep(0.6, 1.0, bt));
  }
  return col;
}

// The stag's antlers. A point on the main beam (t from root 0 to tip 1), in
// the token's radii: out wide and up, curling in at the top, so they spread
// sideways more than they rise.
vec2 azmeri_beam(float t) {
  vec2 P0 = vec2(0.3, -0.7);
  vec2 P1 = vec2(1.15, -0.8);
  vec2 P2 = vec2(1.85, -1.35);
  vec2 P3 = vec2(1.6, -1.95);
  float v = 1.0 - t;
  return v * v * v * P0 + 3.0 * v * v * t * P1 + 3.0 * v * t * t * P2 + t * t * t * P3;
}
// One piece of an antler from a to b (s along the whole: sa to sb; its width
// at each end), lit as heart, body and glow, kept if brighter than what's there.
void azmeri_bone(vec2 P, vec2 a, vec2 b, float sa, float sb, float wa, float wb, float grow, float left, float time, float kw, inout vec3 col) {
  vec2 ab = b - a;
  vec2 pa = P - a;
  float t = clamp(dot(pa, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  vec2 o = pa - ab * t;
  float d2 = dot(o, o);
  float sv = mix(sa, sb, t);
  float w = mix(wa, wb, t);
  // Grown up to the front, softly; dissolving from the tips down.
  float keep = clamp(left * 1.5 - sv * 0.5, 0.0, 1.0);
  float vis = (1.0 - smoothstep(grow - 0.07, grow + 0.02, sv)) * keep * kw;
  float tip = exp(-(sv - grow) * (sv - grow) / 0.003) * (1.0 - smoothstep(1.0, 1.15, grow)) * keep * kw;
  float flow = 0.72 + 0.28 * sin(sv * 15.0 - time * 4.0);
  float heart = exp(-d2 / (0.3 * w * w));
  float body = exp(-d2 / (w * w));
  float glow = exp(-d2 / (9.0 * w * w));
  vec3 c = (vec3(1.6, 1.95, 2.1) * heart * 0.75 + vec3(0.45, 1.15, 1.6) * body * 0.42 + vec3(0.3, 0.8, 1.2) * glow * 0.1) * flow * vis
         + vec3(1.8, 2.0, 2.1) * exp(-d2 / (1.2 * w * w)) * tip * 0.5;
  col = max(col, c);
}
// A tine, a curve from the beam at t0 (control c, end e, scaled by its weight kw).
void azmeri_tine(vec2 P, float t0, vec2 c, vec2 e, float kw, float grow, float left, float time, inout vec3 col) {
  if (kw <= 0.001) return;
  vec2 S = azmeri_beam(t0);
  float g = 0.45 + 0.55 * kw;
  vec2 C = S + c * g;
  vec2 E = S + e * g;
  float w0 = 0.058 - 0.035 * t0;
  vec2 a = S;
  for (int j = 1; j <= 3; j++) {
    float t = float(j) / 3.0;
    vec2 b = mix(mix(S, C, t), mix(C, E, t), t);
    float ta = float(j - 1) / 3.0;
    azmeri_bone(P, a, b, t0 + 0.35 * ta, t0 + 0.35 * t, w0 * (1.0 - 0.6 * ta), w0 * (1.0 - 0.6 * t), grow, left, time, kw, col);
    a = b;
  }
}
vec3 azmeri_antlers(vec2 p, float tok, float grow, float size, float tines, float left, float time) {
  // (Each side the mirror of the other; they sway together, slowly.)
  vec2 P = vec2(abs(p.x), p.y) / (tok * size);
  P = rot2(P - vec2(0.3, -0.7), 0.03 * sin(time * 0.9)) + vec2(0.3, -0.7);
  vec3 col = vec3(0.0);
  vec2 a = azmeri_beam(0.0);
  for (int j = 1; j <= 8; j++) {
    float t = float(j) / 8.0;
    vec2 b = azmeri_beam(t);
    float ta = float(j - 1) / 8.0;
    azmeri_bone(P, a, b, ta, t, 0.075 - 0.045 * ta, 0.075 - 0.045 * t, grow, left, time, 1.0, col);
    a = b;
  }
  // The brow tine low, then two up the beam, and the crown's fork, each in as the streak builds.
  azmeri_tine(P, 0.16, vec2(-0.02, -0.22), vec2(-0.2, -0.45), smoothstep(0.0, 1.0, tines), grow, left, time, col);
  azmeri_tine(P, 0.4, vec2(-0.04, -0.26), vec2(-0.22, -0.5), smoothstep(1.0, 2.0, tines), grow, left, time, col);
  azmeri_tine(P, 0.64, vec2(-0.05, -0.22), vec2(-0.26, -0.42), smoothstep(2.0, 3.0, tines), grow, left, time, col);
  azmeri_tine(P, 0.86, vec2(0.16, -0.12), vec2(0.38, -0.22), smoothstep(3.0, 4.0, tines), grow, left, time, col);
  return col;
}

vec3 azmeri_spirit(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.x;
  float rr = length(p);
  float clr = azmeri_clear(rr, tok);
  vec3 col = vec3(0.0);
  // The cold light of the spirits seeping from behind the token, wider than
  // tall, its two sides breathing out of step (as the wisps pass them).
  float ex = max(length(p * vec2(0.72, 1.3)) - tok, 0.0);
  float side = p.x / (abs(p.x) + 0.5 * tok);
  float breath = 0.85 + 0.15 * sin(time * 0.7 + seed * 6.2832 + 1.3 * side);
  vec3 cold = mix(vec3(0.3, 0.85, 1.05), vec3(0.75, 0.6, 1.1), 0.25 + 0.25 * side);
  col += cold * (exp(-ex / (0.2 * tok + 1.5)) * 0.24 + exp(-ex / (0.5 * tok + 2.0)) * 0.06) * q.y * breath * clr;

  // Possessed: its face lit from within by the wisp gone into it, strongest
  // round the rim (so the letter reads), turning slowly; light spills out.
  float pos = q.z;
  if (pos > 0.001) {
    vec3 hue = mix(azmeri_hue(q.w), vec3(1.6, 1.9, 2.0), 0.3);
    float th = atan(p.y, p.x);
    float swirl = 0.72 + 0.28 * sin(2.0 * th - time * 1.6 + 2.0 * sin(rr / tok * 3.0 - time));
    float ring = exp(-(rr - 0.86 * tok) * (rr - 0.86 * tok) / (0.026 * tok * tok));
    col += hue * (ring * 0.26 * swirl + 0.03 + 0.04 * smoothstep(0.3 * tok, tok, rr)) * (1.0 - clr) * pos;
    col += hue * exp(-max(rr - tok, 0.0) / (0.1 * tok + 1.0)) * 0.2 * clr * pos;
  }
  // The stag's antlers, behind the token.
  if (r.x > 0.001 && r.w > 0.001) col += azmeri_antlers(p, tok, r.x, r.y, r.z, r.w, time) * clr;
  return col;
}

vec3 aura_azmeri(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  if (s.z < 0.25) return azmeri_spirit(p, time, seed, q, r, s);
  return azmeri_wisp(p, time, seed, q, r, s);
}
`;
