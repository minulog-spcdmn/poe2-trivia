// The chronomancer aura's light in the effects shader (shaders.ts): `aura_chronomancer`,
// given the pixel's place (CSS px from the token's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `chronomancer_...`, so no two auras' names meet.
//
// One function draws three kinds of layer, picked by q.x:
//
// 0, the time light: cold light seeping out from behind the token, and the
// sand of the hours drawn in toward it on a spiral, in the plane of the
// first ring (its far half hidden behind the token).
//   q: 0, the token's radius with its rim (px), the light (0-1+), the sand (0-1+).
//   r: the plane's tilt (its height over its width), its roll (rad), the
//   sand's flow (its inward travel, in rings of the spiral), its warmth (0-1).
//   s: chill (0-1: the colour drained to a cold grey), x, x.
//
// 1, a ring of the armillary clock: a band of brass, two fine lines with a
// lozenge at each quarter, seen tilted round the token; its near half
// crosses in front of the face, its far half passes behind and dims. One
// may carry a hand: a lance standing on the ring's plane, its tip past the
// band, ticking round.
//   q: 1, the token's radius with its rim (px), the ring's radius (px), its tilt.
//   r: its roll (rad), the lozenges' turn (rad), the hand's angle (rad,
//   along the ring), the hand's smear (rad behind it, as it whirls).
//   s: the hand's heat (below 0: no hand), chill (0-1), the hand's reach (in radii).
//
// 2, the after-images: a pale rim on each copy of the token where it shows
// beside it, the rewind's ring drawn in, and the snap of light as it lands.
//   q: 2, the token's radius (px, the face), the after-images' light, seconds since the snap.
//   r: the first two after-images' offsets (px). s: the third's, then how far
//   the rewind has run (0-1; below 0 when it isn't).

export const GLSL = `
float chronomancer_line(float d, float w) {
  return exp(-d * d / (w * w));
}
// The colour drained toward a cold grey, by chill.
vec3 chronomancer_cold(vec3 c, float chill) {
  float l = dot(c, vec3(0.3, 0.5, 0.2));
  return mix(c, vec3(l) * vec3(0.7, 0.86, 1.18), chill);
}
// What the token lets through from behind it at radius rr: 0 over it, 1 outside.
float chronomancer_clear(float rr, float tok) {
  return smoothstep(tok - 0.7, tok + 0.7, rr);
}

vec3 chronomancer_time(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.y;
  float rr = length(p);
  float clear = chronomancer_clear(rr, tok);
  float beyond = max(rr - tok, 0.0);
  vec3 ice = vec3(0.5, 0.8, 1.55);
  vec3 col = vec3(0.0);
  // Cold light seeping out from behind the token, and a wide faint breath of it.
  float breath = 0.88 + 0.12 * sin(time * 0.9 + seed * 6.0);
  col += ice * (exp(-beyond / (1.0 + 0.17 * tok)) * 0.42 + exp(-beyond / (0.75 * tok)) * 0.09) * q.z * breath * clear;

  float tilt = max(r.x, 0.05);
  vec2 lp = rot2(p, -r.y);
  vec2 pl = vec2(lp.x, lp.y / tilt);
  float rho = length(pl);
  // The dial's glass: a faint light filling its plane out to the chapter
  // ring, in slow swells drawn in toward the token (time running into it).
  // Its far half lies behind the token; its near half crosses in front, fainter.
  {
    float x = rho / tok;
    float zz = pl.y / max(rho, 1e-3);
    float fill = smoothstep(2.25, 1.75, x) * smoothstep(0.85, 1.25, x);
    float swell = 0.55 + 0.45 * sin(x * 9.0 + r.z * 2.4);
    float seenG = mix(clear, mix(0.45, 1.0, clear), smoothstep(-0.2, 0.2, zz));
    col += mix(ice, vec3(1.2, 1.0, 0.75), 0.35) * fill * swell * 0.16 * q.z * seenG * (0.7 + 0.3 * zz);
  }

  // The sand: grains on a spiral in the tilted plane, drifting in toward the
  // token, where they go out. A cell of the spiral holds at most one grain.
  if (q.w > 0.01) {
    if (rho > tok * 0.9 && rho < tok * 2.7) {
      // Six streams of sand, each a spiral turning TWIST rad for each e-fold
      // it runs in; a stream is every STREAM'th column of cells.
      const float ARMS = 30.0;
      const float RINGS = 7.0;
      const float TWIST = 2.4;
      const float STREAM = 5.0;
      float lr = log(rho);
      float phi = atan(pl.y, pl.x);
      vec2 g = vec2((phi + TWIST * lr) / (2.0 * PI) * ARMS, lr * RINGS + r.z);
      vec2 cell = floor(g);
      // (The arms wrap round: the cell's column is taken round the circle.)
      vec2 key = vec2(mod(cell.x, ARMS), cell.y);
      float h = hash12(key + seed * 7.13);
      float inStream = mod(key.x, STREAM) < 0.5 ? 1.0 : 0.0;
      if (inStream > 0.5 && h < 0.3 + 0.4 * min(q.w, 1.3)) {
        vec2 at = cell + vec2(0.3 + 0.4 * hash12(key + 3.1), 0.2 + 0.6 * hash12(key + 8.7));
        float glr = (at.y - r.z) / RINGS;
        float gphi = at.x / ARMS * 2.0 * PI - TWIST * glr;
        float grho = exp(glr);
        vec2 gp = vec2(cos(gphi), sin(gphi) * tilt) * grho;
        float z = sin(gphi);
        float near = 0.5 + 0.5 * z;
        float size = (0.5 + 0.02 * tok) *(0.75 + 0.5 * near) * (0.7 + 0.6 * hash12(key + 1.7));
        float d = length(lp - gp);
        // Born out at the edge of the light, gone as they reach the token.
        float life = smoothstep(2.6 * tok, 2.0 * tok, grho) * smoothstep(1.02 * tok, 1.45 * tok, grho);
        float seen = mix(chronomancer_clear(length(rot2(gp, r.y)), tok), 1.0, smoothstep(-0.15, 0.15, z)) * (0.35 + 0.65 * near);
        float twinkle = 0.65 + 0.35 * sin(time * (2.0 + 3.0 * h) + h * 40.0);
        vec3 sand = mix(vec3(1.35, 1.0, 0.55), vec3(1.7, 1.25, 0.7), r.w);
        col += sand * exp(-d * d / (size * size)) * life * seen * twinkle * (1.4 + 0.8 * r.w) * min(q.w, 1.5);
      }
    }
  }
  return chronomancer_cold(col, s.x);
}

vec3 chronomancer_ring(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.y;
  float R = q.z;
  float clear = chronomancer_clear(length(p), tok);
  vec2 lp = rot2(p, -r.x);
  vec2 ab = vec2(R, max(R * q.w, 0.4));
  // Distance to the ring's ellipse (Inigo Quilez's approximation) and the
  // angle along it; its +y half is the near one.
  float k0 = length(lp / ab);
  float k1 = length(lp / (ab * ab));
  float d = k0 * (k0 - 1.0) / max(k1, 1e-4);
  float t = atan(lp.y / ab.y, lp.x / ab.x);
  float z = sin(t);
  float near = 0.5 + 0.5 * z;
  float seen = mix(clear, 1.0, smoothstep(-0.15, 0.15, z)) * (0.3 + 0.7 * near);
  // A unit of the ring's drawing: its lines keep their fineness as it grows.
  float u = clamp(R / 40.0, 0.4, 2.6);
  float lw = (0.36 + 0.2 * u) * (0.8 + 0.4 * near);
  float bw = (0.55 + 0.75 * u) * (0.75 + 0.35 * near);

  // The marks, turning with the ring: a lozenge at each quarter and, on the
  // chapter ring (q.x past 1.1), a baton across the band at each other hour.
  float ds = length(vec2(ab.x * sin(t), ab.y * cos(t)));
  bool hours = q.x > 1.1;
  float CELL = hours ? PI / 6.0 : PI * 0.5;
  float tt = t - r.y + CELL * 0.5;
  float at = mod(tt, CELL) - CELL * 0.5;
  float hour = mod(floor(tt / CELL), hours ? 3.0 : 1.0);
  float L = (1.5 + 1.7 * u) * (0.8 + 0.4 * near);
  float H = bw + lw * 1.8;
  float along = abs(at * ds);
  float dz = along / L + abs(d) / H;
  float loz = 0.0;
  float cut = 1.0;
  if (hour < 0.5) {
    loz = smoothstep(1.0, 0.72, dz) * 0.55 + chronomancer_line(dz - 0.86, 0.13) * 0.6;
    cut = smoothstep(0.95, 1.2, dz);
  } else {
    loz = chronomancer_line(along, lw * 1.1) * smoothstep(bw + lw, bw - lw * 0.5, abs(d)) * 0.8;
  }
  // The band: two fine lines, cut clear of each lozenge, and a soft glow under them.
  float band = (chronomancer_line(d - bw, lw) + 0.7 * chronomancer_line(d + bw, lw)) * cut;
  float under = exp(-abs(d) / (1.0 + 1.6 * u)) * 0.13;
  vec3 brass = vec3(1.4, 0.98, 0.5);
  vec3 col = brass * (band * 0.95 + loz + under) * seen;

  // The hand: a lance on the ring's plane, from inside the band to past it.
  if (s.x >= 0.0) {
    vec3 pale = vec3(1.45, 1.42, 1.32);
    vec3 ice = vec3(0.6, 0.88, 1.6);
    float reach = s.z;
    float smear = r.w;
    for (int i = 0; i < 10; i++) {
      float fi = float(i) / 9.0;
      if (i > 0 && abs(smear) < 0.03) break;
      float a = r.z - smear * fi;
      vec2 dir = vec2(cos(a), sin(a));
      float za = sin(a);
      float na = 0.5 + 0.5 * za;
      vec2 A = dir * ab * (reach - 0.42);
      vec2 B = dir * ab * reach;
      vec2 ba = B - A;
      float h = clamp(dot(lp - A, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
      float dd = length(lp - A - ba * h);
      float wid = (0.32 + 0.42 * u) * (1.0 - 0.8 * h) * (0.8 + 0.4 * na) + 0.12;
      // (Over the face the lance lies faint, so the letter still reads.)
      float hseen = mix(clear, 1.0, smoothstep(-0.15, 0.15, za)) * (0.35 + 0.65 * na) * mix(0.3, 1.0, clear);
      float k = i == 0 ? 1.0 : (1.0 - fi) * 0.3;
      col += pale * chronomancer_line(dd, wid) * hseen * k * (1.0 + 0.4 * na);
      // Its tip catches the tick.
      if (i == 0) {
        float tq = length(lp - B);
        float tw = 0.6 + 0.6 * u;
        col += ice * (chronomancer_line(tq, tw * 1.3) * 0.9 + exp(-tq / (tw * 3.0)) * 0.22) * s.x * hseen;
      }
    }
  }
  // Over the token's face the near half lies lighter, so the letter still reads.
  col *= mix(0.72, 1.0, clear);
  return chronomancer_cold(col, s.y);
}

vec3 chronomancer_echo(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.y;
  float rr = length(p);
  // (Beyond the token and its rim: the after-images show only there.)
  float clear = smoothstep(tok + 2.0, tok + 3.2, rr);
  vec3 ice = vec3(0.55, 0.85, 1.6);
  vec3 pale = vec3(1.25, 1.38, 1.7);
  vec3 col = vec3(0.0);
  float w = 0.45 + 0.03 * tok;
  float g = 0.0;
  vec2 o1 = r.xy;
  vec2 o2 = r.zw;
  vec2 o3 = s.xy;
  if (dot(o1, o1) > 0.1) g += chronomancer_line(length(p - o1) - tok, w) * smoothstep(0.0, tok * 0.5, length(o1));
  if (dot(o2, o2) > 0.1) g += 0.8 * chronomancer_line(length(p - o2) - tok, w) * smoothstep(0.0, tok * 0.5, length(o2));
  if (dot(o3, o3) > 0.1) g += 0.65 * chronomancer_line(length(p - o3) - tok, w) * smoothstep(0.0, tok * 0.5, length(o3));
  float rew = s.z >= 0.0 ? s.z : 0.0;
  col += ice * g * clear * q.z * (0.5 + 1.4 * rew * rew);

  // The rewind: a ring of light drawn in from far out to the token, quickening.
  if (s.z >= 0.0) {
    float e = rew * rew * rew;
    float rad = mix(2.5 * tok, tok + 2.5, e);
    float wd = (0.6 + 0.06 * tok) * (1.0 - 0.4 * rew);
    col += pale * chronomancer_line(rr - rad, wd) * (0.15 + 0.9 * rew * rew) * smoothstep(tok, tok + 2.0, rr);
  }
  // It lands: a snap of light on the token's rim and a breath from behind it.
  float a = q.w;
  if (a < 1.2) {
    float k = exp(-a * 6.0);
    float rad = tok + 2.5 + 0.5 * tok * (1.0 - exp(-a * 8.0));
    col += pale * chronomancer_line(rr - rad, 0.6 + 0.05 * tok + a * 3.0) * k * 1.1 * smoothstep(tok, tok + 2.0, rr);
    col += ice * exp(-max(rr - tok, 0.0) / (1.5 + 0.25 * tok)) * k * 0.7 * smoothstep(tok - 0.7, tok + 0.7, rr);
  }
  return col;
}

vec3 aura_chronomancer(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  if (q.x < 0.5) return chronomancer_time(p, time, seed, q, r, s);
  if (q.x < 1.5) return chronomancer_ring(p, time, seed, q, r, s);
  return chronomancer_echo(p, time, seed, q, r, s);
}
`;
