// The runeseal aura's light in the effects shader (shaders.ts): `aura_runeseal`,
// given the pixel's place (CSS px from the token's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `runeseal_...`, so no two auras' names meet.
//
// The bound djinn of the Traitor's Passage (runeseal.ts). The world is drawn
// in the token's radii (U): a floor a little under the token, seen from a
// little above (a point's depth z, toward the viewer, lowers it on screen by
// RS_TILT), three Runic Seals lying on it round the token, and from each a
// stream of the djinn's sand rising and coiling round the token, in front of
// its face and behind it, into a knot over its head; a stream whose seal has
// broken slips the knot and billows out free, sideways and low.
//
// One function draws two kinds of layer, picked by q.x:
//
// 0, the djinn: the desert's light seeping from behind the token, the three
// streams of pale sand (each a twisting ribbon, the djinn's turquoise light
// down its seam, grains streaming up it in clumps), the knot where they are
// held and the eddy turning round it, and the djinn's eyes when they open.
//   q: the lean of the streams' upper reaches (U, within -0.45 to 0.45: the
//   djinn's layer is told by q.x below 0.5), the token's radius with its rim
//   (px), the sand's travel (U, ever growing), the light (0-1+).
//   r: each stream's freedom (below 0 yanked down, 0 bound, 1 free, past 1
//   shooting up as its seal breaks), the eyes (0-1).
//   s: chill (0-1: the gold drained to a cold ash), a pulse running up the
//   streams (its height, U; below -1 when there is none), vigor (0-1: the
//   streams thin and sink as lives run out).
//
// 1, the seals: three engraved discs on the floor, each a double ring round
// a rune; one that breaks flares, splits along a crack, lets out a breath of
// the djinn's light and lies on as a dull mark in two halves. And Balbala's
// coin: tossed up from the knot, spinning, it lands on the floor and forms a
// rune there.
//   q: 1, the token's radius with its rim (px), the first two seals' state
//   (0 not yet there, 1 lit, 2 broken).
//   r: the third seal's state, each seal's breaking (s since it broke; past
//   4: none; -1 and below: tightening, -1 less the seconds since).
//   s: the coin's age (s; below 0: none), where it lands (rad round the
//   floor), chill (0-1).

export const GLSL = `
const float RS_TILT = 0.24;
const float RS_FLOOR = -0.9;
const float RS_ASPECT = 0.42;
const float RS_SEAL_AT = 1.34;
const float RS_TWIST = 1.55;

float runeseal_line(float d, float w) {
  return exp(-d * d / (w * w));
}
// What the token lets through from behind it at radius rr: 0 over it, 1 outside.
float runeseal_clear(float rr, float tok) {
  return smoothstep(tok - 0.7, tok + 0.7, rr);
}
// The gold drained toward a cold ash, by chill.
vec3 runeseal_cool(vec3 c, float chill) {
  float l = dot(c, vec3(0.3, 0.5, 0.2));
  return mix(c, vec3(l) * vec3(0.6, 0.56, 0.54), chill);
}
// Seal j's place round the floor (rad; its sine is its depth): the first in front, the others behind to either side.
float runeseal_theta(float j) {
  return 1.5708 + j * 2.0944;
}
// A stream's radius at height h over the floor (U): wide at its seal, close
// round the token, drawn in to the knot over its head and, if free, wider
// round the token and billowing out sideways over its head, low: a cloud of
// sand spread wide, never a tongue standing tall (in a list the players
// above and below sit close).
float runeseal_rho(float h, float free) {
  float Y = RS_FLOOR + h;
  float f = clamp(free, 0.0, 1.0);
  // (At its foot, its seal's place: RS_SEAL_AT.)
  float lower = 1.16 + 0.14 * f + (RS_SEAL_AT - 1.16 - 0.14 * f) * exp(-h * 3.2);
  return mix(lower, 0.22, smoothstep(0.3, 1.3, Y)) + f * 0.85 * smoothstep(1.12, 1.85, Y);
}
// How far a stream has turned round by height h: steadily, and past the knot a little faster, coiling.
float runeseal_turn(float h) {
  float above = max(RS_FLOOR + h - 1.2, 0.0);
  return RS_TWIST * h + 0.5 * above * above / (above + 0.4);
}
// A stream's point at height h: (x, depth, screen y), in U. wt is the
// stream's own clock (time, put out of step with the others): waves run up
// it, so it writhes as it climbs, never in one loop.
vec3 runeseal_at(float h, float th, float tw, float sway, float free, float wt) {
  float rho = runeseal_rho(h, free) * (1.0 + 0.06 * sin(h * 3.0 - wt * 1.1) + 0.03 * sin(h * 5.3 - wt * 0.71));
  float a = th + runeseal_turn(h) + tw * h * h + 0.16 * sin(h * 2.4 - wt * 0.8) + 0.06 * sin(h * 4.1 - wt * 1.37);
  float Y = RS_FLOOR + h;
  float x = rho * cos(a) + sway * smoothstep(0.4, 1.8, Y);
  float z = rho * sin(a);
  // (Over the knot its depth lowers it less, so the billow, wide, still climbs the screen steadily.)
  float tilt = RS_TILT * mix(1.0, 0.45, smoothstep(1.0, 1.6, Y));
  return vec3(x, z, -Y + z * tilt);
}

// One stream of sand: the colour it adds at pu (U), its seal j's.
vec3 runeseal_stream(vec2 pu, float U, float j, float free, float top, float tw, float sway, float travel, float pulse, float clear, float time, float seed) {
  float th = runeseal_theta(j);
  float wt = time * (0.85 + 0.17 * j) + j * 7.3 + seed * 13.0;
  // The height whose point lies on this pixel's row: the stream climbs
  // steadily up the screen, so a few Newton steps find it.
  float h = -pu.y - RS_FLOOR;
  const float E = 0.01;
  float g = 0.0;
  for (int i = 0; i < 3; i++) {
    float ya = runeseal_at(h + E, th, tw, sway, free, wt).z;
    float yb = runeseal_at(h - E, th, tw, sway, free, wt).z;
    g = runeseal_at(h, th, tw, sway, free, wt).z - pu.y;
    float dg = (ya - yb) / (2.0 * E);
    h -= g / min(dg, -0.2);
    h = clamp(h, -0.3, top - RS_FLOOR + 0.6);
  }
  vec3 at = runeseal_at(h, th, tw, sway, free, wt);
  g = at.z - pu.y;
  vec3 a1 = runeseal_at(h + E, th, tw, sway, free, wt);
  vec3 a0 = runeseal_at(h - E, th, tw, sway, free, wt);
  float slope = (a1.x - a0.x) / min(a1.z - a0.z, -0.05);
  // Across the stream (px, signed) and along it (U).
  float across = (pu.x - at.x) * U / sqrt(1.0 + slope * slope);
  float Y = RS_FLOOR + h;
  float rho = runeseal_rho(h, free);
  float z = at.y / max(rho, 0.05);
  float near = 0.5 + 0.5 * z;
  // Out of the seal at its foot, gone at its top; and only where the row was found.
  float life = smoothstep(-0.04, 0.1, h) * (1.0 - smoothstep(top - mix(0.32, 0.65, max(free, 0.0)), top, Y)) * (1.0 - smoothstep(0.03, 0.1, abs(g)));
  if (life < 0.001) return vec3(0.0);
  // Behind the token its far side is hidden; in front, over the face, it lies faint so the letter reads.
  float seen = mix(clear, mix(0.12, 1.0, clear), smoothstep(-0.2, 0.2, z)) * (0.35 + 0.65 * near);
  // Past the knot it frays: wider, fainter, its grains loose; free, far more.
  float fray = smoothstep(1.2, max(top, 1.3), Y) * (0.35 + 0.65 * max(free, 0.0));
  // A ribbon of sand, flat, twisting as it climbs: edge-on it narrows to a
  // bright seam, face-on it opens out wide and soft.
  float turn = abs(cos(RS_TWIST * h * 1.3 + j * 1.7 + 0.6 * sin(time * 0.3 + j)));
  float open = mix(0.3, 1.0, turn);
  // (Out of its seal it springs as a thin thread, and widens as it climbs.)
  float w = (0.35 + 0.075 * U) * open * (0.8 + 0.4 * near) * (1.0 + 1.4 * fray) * (0.35 + 0.65 * smoothstep(0.0, 0.5, h)) + 0.35;
  // The sand runs up in clumps, each stream at its own pace, slackening and
  // hurrying as the djinn breathes.
  float rise = h - travel * (0.82 + 0.14 * j) - 0.18 * sin(time * 0.23 + j * 2.3 + seed * 4.0) - 0.08 * sin(time * 0.57 + j * 4.1);
  float n = vnoise(vec2(rise * 3.1, j * 17.3 + seed * 29.0));
  float n2 = vnoise(vec2(rise * 7.7, j * 5.1 + seed * 11.0 + 3.0));
  float dens = 0.25 + 0.8 * smoothstep(0.2, 0.85, n) + 0.25 * n2;
  // (A pulse runs up the three a beat apart, a spiral of light.)
  float ph = pulse - j * 0.35;
  float run = pulse > -1.0 ? exp(-(h - ph) * (h - ph) / 0.16) : 0.0;
  float body = runeseal_line(across, w) * (0.28 + 0.3 * (1.0 - turn)) / open;
  float seam = runeseal_line(across - w * 0.35 * sin(h * 5.0 + j), 0.3 + 0.012 * U) * (0.35 + 0.65 * (1.0 - turn));
  float halo = exp(-abs(across) / (w * 2.2 + 0.8)) * 0.07;
  // The grains: a cell each (px along it and across it), at most one in each.
  vec2 cs = vec2(1.9 + 0.03 * U, 1.7 + 0.028 * U) * (1.0 + 0.6 * fray);
  vec2 lp = vec2(rise * U, across);
  vec2 cell = floor(lp / cs);
  float hc = hash12(cell + vec2(j * 7.13 + 1.0, seed * 13.7));
  float midAcross = (cell.y + 0.5) * cs.y;
  float spread = w * (1.0 + 2.5 * fray) + 0.5;
  float chance = (0.2 + 0.6 * dens) * exp(-midAcross * midAcross / (spread * spread));
  float grain = 0.0;
  if (hc < chance) {
    vec2 gp = (cell + 0.35 + 0.3 * vec2(hash12(cell + 4.1 + j), hash12(cell + 9.7 + j))) * cs;
    float gs = (0.26 + 0.008 * U) * (0.8 + 0.4 * near);
    float d = length(lp - gp);
    float tw2 = 0.5 + 0.5 * sin(time * (2.5 + 4.0 * hc) + hc * 40.0);
    grain = exp(-d * d / (gs * gs)) * tw2 * (0.6 + 0.8 * hash12(cell + 2.3));
  }
  // Pale desert sand; down its seam, the djinn's own turquoise light.
  vec3 sand = vec3(1.3, 1.0, 0.6);
  vec3 bright = vec3(1.75, 1.55, 1.15);
  vec3 spirit = vec3(0.45, 1.25, 1.15);
  vec3 c = sand * (body * dens + halo * dens) + (spirit * seam * dens * 0.8 + bright * grain * 1.5) * (1.0 - 0.5 * fray);
  c += (bright * (body * 0.8 + grain) + spirit * seam) * run;
  return c * seen * life;
}

vec3 runeseal_djinn(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.y;
  float U = tok;
  float rr = length(p);
  float clear = runeseal_clear(rr, tok);
  float vigor = s.z;
  vec3 col = vec3(0.0);
  float freeAll = (r.x + r.y + r.z) / 3.0;

  // The light of the desert seeping out from behind the token, leaning upward where the djinn rises.
  float beyond = max(rr - tok, 0.0);
  float up = 1.0 + 0.4 * smoothstep(0.0, -1.5 * tok, p.y);
  vec3 amber = vec3(1.2, 0.86, 0.48);
  vec3 spirit = vec3(0.45, 1.25, 1.15);
  col += amber * (exp(-beyond / (1.1 + 0.15 * tok)) * 0.27 + exp(-beyond / (0.7 * tok)) * 0.05) * up * clear * q.w;

  vec2 pu = p / U;
  float free01 = clamp(freeAll, 0.0, 1.0);
  // The upper streams lean: a slow drift of their own (never quite
  // repeating) and the djinn's lean, set from outside (q.x).
  float sway = 0.08 * sin(time * 0.27 + seed * 6.3) + 0.05 * sin(time * 0.61 + seed * 2.0) + 0.03 * sin(time * 1.13 + seed) + q.x;
  for (int k = 0; k < 3; k++) {
    float j = float(k);
    float free = k == 0 ? r.x : k == 1 ? r.y : r.z;
    float tw = 0.09 * sin(time * 0.19 + seed * 6.28 + j * 2.1) + 0.05 * sin(time * 0.43 + j) + 0.03 * sin(time * 0.71 + j * 3.3);
    // Bound, a stream ends in the knot; free, it billows out over it, low;
    // past free (the moment its seal breaks) it shoots up, and sinks back.
    // Yanked, below bound, it is drawn down short.
    float top = (mix(1.48, 1.8, clamp(free, 0.0, 1.0)) + max(free - 1.0, 0.0) * 1.1 + min(free, 0.0) * 0.8) * mix(0.6, 1.0, vigor);
    col += runeseal_stream(pu, U, j, free, top, tw, sway, q.z, s.y, clear, time, seed) * mix(0.45, 1.0, vigor);
  }

  // The knot over its head, where the seals hold the streams: the bound
  // djinn's turquoise heart, beating, opening out as they break free; round
  // it a little eddy of sand turns, widening and closing.
  vec2 kp = vec2(sway * 0.6 * U, -1.24 * U * mix(0.6, 1.0, vigor));
  float kd = length((p - kp) * vec2(1.0, 1.25));
  float held = 1.0 - free01;
  float beat = 0.8 + 0.12 * sin(time * 1.1 + seed * 4.0) + 0.08 * sin(time * 2.9 + seed * 9.0);
  col += spirit * exp(-kd / (0.13 * U + 0.5)) * 0.55 * held * beat * vigor;
  col += mix(amber, spirit, 0.5) * exp(-kd / (0.45 * U)) * 0.09 * (0.5 + held) * vigor;
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float hk = hash12(vec2(fk, seed * 17.0));
    float ang = time * (0.7 + 0.5 * hk) * (k < 4 ? 1.0 : -0.6) + fk * 1.047 + seed * 6.0;
    float rad = (0.3 + 0.08 * sin(time * 0.53 + fk * 2.0) + 0.25 * free01) * U;
    float zz = sin(ang);
    vec2 gp = kp + vec2(cos(ang) * rad, zz * rad * 0.28);
    float gs = (0.28 + 0.008 * U) * (0.75 + 0.5 * (0.5 + 0.5 * zz));
    float d = length(p - gp);
    col += vec3(1.75, 1.55, 1.15) * exp(-d * d / (gs * gs)) * (0.35 + 0.45 * (0.5 + 0.5 * zz)) * (0.6 + 0.4 * sin(time * 3.0 + fk * 5.0)) * vigor;
  }

  // Its light on the token's face: the djinn's turquoise falling on it from
  // the knot above, beating with its heart, and the seals' gold warming it
  // from below. Faint, so the letter reads; brighter as the sand surges.
  float face = 1.0 - clear;
  float fromAbove = smoothstep(0.3 * tok, -1.1 * tok, p.y);
  float fromBelow = smoothstep(-0.1 * tok, 1.1 * tok, p.y);
  col += face * (spirit * fromAbove * (0.07 + 0.08 * held * beat) + amber * fromBelow * 0.07) * q.w * vigor;

  // The djinn's eyes, now and then: two narrow slits of pale turquoise light
  // in the knot, looking out; free, a little higher in the sand and wider.
  if (r.w > 0.01) {
    vec2 ec = vec2(sway * U, -mix(1.26, 1.58, free01) * U);
    float es = mix(0.75, 1.0, free01);
    vec3 hot = vec3(1.7, 2.5, 2.35);
    for (int k = 0; k < 2; k++) {
      float side = k == 0 ? -1.0 : 1.0;
      vec2 e = rot2(p - ec - vec2(side * 0.19 * U * es, 0.0), side * 0.32);
      float d = length(e / vec2((0.11 * U + 0.5) * es, 0.032 * U + 0.35));
      col += hot * exp(-d * d) * 1.1 * r.w;
      col += spirit * exp(-length(e) / (0.2 * U)) * 0.14 * r.w;
    }
  }
  return runeseal_cool(col, s.x);
}

// A rune's strokes (in the seal's own disc, radius 1): a distance (in the disc's units).
float runeseal_seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float runeseal_rune(vec2 g, float j) {
  float d = 9.0;
  if (j < 0.5) {
    d = min(d, runeseal_seg(g, vec2(0.0, -0.62), vec2(0.0, 0.62)));
    d = min(d, runeseal_seg(g, vec2(-0.42, 0.2), vec2(0.0, -0.18)));
    d = min(d, runeseal_seg(g, vec2(0.42, 0.2), vec2(0.0, -0.18)));
  } else if (j < 1.5) {
    d = min(d, runeseal_seg(g, vec2(-0.56, 0.05), vec2(0.56, 0.05)));
    d = min(d, abs(length(g - vec2(0.0, 0.05)) - 0.22));
    d = min(d, runeseal_seg(g, vec2(0.0, -0.62), vec2(0.0, -0.17)));
  } else if (j < 2.5) {
    d = min(d, runeseal_seg(g, vec2(-0.46, 0.46), vec2(0.0, -0.56)));
    d = min(d, runeseal_seg(g, vec2(0.46, 0.46), vec2(0.0, -0.56)));
    d = min(d, runeseal_seg(g, vec2(-0.26, 0.12), vec2(0.26, 0.12)));
  } else {
    // The coin's rune: a ring crossed by a stroke, a mark either side.
    d = min(d, abs(length(g) - 0.36));
    d = min(d, runeseal_seg(g, vec2(0.0, -0.66), vec2(0.0, 0.66)));
    d = min(d, runeseal_seg(g, vec2(-0.62, -0.1), vec2(-0.5, 0.1)));
    d = min(d, runeseal_seg(g, vec2(0.62, -0.1), vec2(0.5, 0.1)));
  }
  return d;
}
// Distance (px) to an ellipse with half axes ab (px), Inigo Quilez's approximation.
float runeseal_ellipse(vec2 lp, vec2 ab) {
  float k0 = length(lp / ab);
  float k1 = length(lp / (ab * ab));
  return k0 * (k0 - 1.0) / max(k1, 1e-4);
}
// An engraved disc on the floor at c (px), radius R1 (px): its double ring
// and its rune j, and the light under them.
vec3 runeseal_disc(vec2 p, vec2 c, float R1, float U, float j, out float under) {
  vec2 lp = p - c;
  float lw = 0.3 + 0.016 * U;
  float d1 = runeseal_ellipse(lp, vec2(R1, R1 * RS_ASPECT));
  float d2 = runeseal_ellipse(lp, vec2(R1 * 0.78, R1 * 0.78 * RS_ASPECT));
  vec2 g = vec2(lp.x, lp.y / RS_ASPECT) / (R1 * 0.62);
  // (Its strokes, foreshortened as the floor is: their width taken across them on screen.)
  float dr = runeseal_rune(g, j) * R1 * 0.62;
  float rune = runeseal_line(dr, lw * 1.25) * smoothstep(1.05, 0.9, length(g) * 0.62 / 0.78);
  float lines = 0.6 * runeseal_line(d1, lw) + 0.38 * runeseal_line(d2, lw * 0.85) + 1.0 * rune;
  float inside = 1.0 - smoothstep(-1.0, 1.0, d1);
  under = inside * 0.07 + exp(-max(d1, 0.0) / (1.0 + 0.06 * U)) * 0.08;
  return vec3(lines);
}

vec3 runeseal_seals(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.y;
  float U = tok;
  float clear = runeseal_clear(length(p), tok);
  vec3 gold = vec3(1.5, 1.08, 0.56);
  vec3 bronze = vec3(0.62, 0.44, 0.3);
  vec3 spirit = vec3(0.45, 1.25, 1.15);
  vec3 col = vec3(0.0);
  float R1 = 0.23 * U + 0.6;

  for (int k = 0; k < 3; k++) {
    float j = float(k);
    // (Its state: 0 not yet there, 1 lit, 2 broken; between, on the way.)
    float st = k == 0 ? q.z : k == 1 ? q.w : r.x;
    float lit = st <= 1.0 ? st : 2.0 - st;
    float marked = clamp(st - 1.0, 0.0, 1.0);
    float brk = k == 0 ? r.y : k == 1 ? r.z : r.w;
    float th = runeseal_theta(j);
    float z = sin(th);
    vec2 c = vec2(RS_SEAL_AT * cos(th), -RS_FLOOR + RS_SEAL_AT * z * RS_TILT) * U;
    if (length(p - c) > 2.2 * U) continue;
    float near = 0.5 + 0.5 * z;
    // (Nearer, larger.)
    float Rs = R1 * (0.86 + 0.24 * near);
    // The crack a broken seal splits along: a line through it, its own slant for each.
    vec2 n = normalize(vec2(1.0, 0.55 + 0.5 * j - 0.4 * j * j));
    vec2 lp = p - c;
    float sideOf = dot(lp, n);
    // Breaking, its halves part along the crack, a little, and settle apart.
    float a = brk >= 0.0 && brk < 4.0 ? brk : 4.0;
    // (Relit, it is whole again.)
    float part = (0.05 * U + 0.4) * (1.0 - exp(-a * 7.0)) * (a < 1.5 ? 1.0 : smoothstep(0.0, 0.3, marked));
    float under;
    vec3 lines = runeseal_disc(p - n * sign(sideOf) * part * 0.5, c, Rs, U, j, under);
    // (The crack itself stays dark, so the parted halves never meet in a seam.)
    float crack = part > 0.01 ? smoothstep(part * 0.5 - 0.2, part * 0.5 + 0.5, abs(sideOf)) : 1.0;
    float breath = 0.85 + 0.15 * sin(time * 0.8 + j * 2.1 + seed * 5.0);
    // Lit: gold. Broken: a dull mark split in two, its rune dark.
    vec3 c1 = (gold * (lines * 1.05 + under) * lit * breath + bronze * lines * 0.42 * marked) * crack;
    // A glint of light walks round each lit seal's ring, each at its own pace
    // and way round, now brighter, now fading: the binding at work.
    float ang = atan(lp.y / RS_ASPECT, lp.x);
    float phase = time * (0.3 + 0.13 * j) * (k == 1 ? -1.0 : 1.0) + j * 2.1 + seed * 5.0;
    float dang = mod(ang - phase + PI, 2.0 * PI) - PI;
    float ring = runeseal_line(runeseal_ellipse(lp, vec2(Rs, Rs * RS_ASPECT)), 0.35 + 0.02 * U);
    c1 += gold * ring * exp(-dang * dang / 0.1) * lit * (0.6 + 0.6 * sin(time * 0.37 + j * 2.7) * sin(time * 0.23 + j)) * 1.3;
    // Tightening (its breaking below -1: the seconds since, less one): the
    // rune flares and a breath of the djinn's light is pressed back into it.
    if (brk <= -1.0) {
      float fa = -brk - 1.0;
      float fl = exp(-fa * 3.0) * smoothstep(0.0, 0.05, fa);
      float e = length(lp / vec2(1.0, RS_ASPECT));
      c1 += (mix(gold, spirit, 0.3) * lines * 1.6 * lit + spirit * exp(-e / (Rs * 0.6)) * 0.35) * fl;
    }
    // (On a small token, packed in a list, the seals lie quieter.)
    col += c1 * (0.75 + 0.25 * near) * mix(0.55, 1.0, smoothstep(14.0, 30.0, U));

    // As it breaks: its rune flares, and what it held is let out: a breath of
    // the djinn's light from the crack, gone at once.
    if (a < 4.0) {
      float flash = exp(-a * 5.0) * smoothstep(0.0, 0.03, a);
      col += mix(gold, spirit, 0.4) * lines * crack * flash * 2.2;
      float e = length(lp / vec2(1.0, RS_ASPECT));
      col += spirit * exp(-e / (Rs * 0.7)) * flash * 0.9;
      col += spirit * runeseal_line(sideOf, 0.6 + 0.02 * U) * smoothstep(Rs * 1.1, Rs * 0.4, e) * exp(-a * 3.0) * 1.4;
    }
  }

  // Balbala's coin: tossed up from the knot over the token, turning over and
  // over, it falls to the floor in front and forms a rune where it lands.
  if (s.x >= 0.0 && s.x < 3.0) {
    const float FLY = 0.85;
    float a = s.x;
    float lr = 1.02;
    vec2 land = vec2(lr * cos(s.y), -RS_FLOOR + lr * sin(s.y) * RS_TILT) * U;
    vec2 from = vec2(0.0, -1.24 * U);
    if (a < FLY) {
      float k = a / FLY;
      vec2 at = mix(from, land, k) + vec2(0.0, -0.75 * U * 4.0 * k * (1.0 - k));
      float cr = 0.085 * U + 0.5;
      float face = abs(cos(a * 13.0 + seed * 3.0));
      vec2 lp = p - at;
      float d = length(lp / vec2(cr * (0.12 + 0.88 * face), cr));
      // A gold disc, its rim brighter, flashing as it turns face-on.
      vec3 coin = vec3(1.5, 1.05, 0.48) * (smoothstep(1.1, 0.7, d) * (0.35 + 0.5 * face) + runeseal_line(d - 0.92, 0.22) * 0.7);
      col += coin + vec3(1.2, 0.8, 0.35) * exp(-length(lp) / cr) * 0.07 * face;
    } else {
      float b = a - FLY;
      float under;
      float R = R1 * (0.85 + 0.35 * (1.0 - exp(-b * 6.0)));
      vec3 lines = runeseal_disc(p, land, R, U, 3.0, under);
      float fade = exp(-b * 1.6) * smoothstep(0.0, 0.04, b);
      col += vec3(1.9, 1.35, 0.65) * (lines * 1.3 + under * 1.2) * fade;
      vec2 lp = p - land;
      float dr = runeseal_ellipse(lp, vec2(R * (1.0 + b * 3.0), R * (1.0 + b * 3.0) * RS_ASPECT));
      col += vec3(2.2, 1.6, 0.8) * runeseal_line(dr, 0.5 + b * 2.5) * exp(-b * 4.0) * 0.9;
    }
  }
  return runeseal_cool(col, s.z);
}

vec3 aura_runeseal(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  // (The djinn's q.x is its lean, within half a radius of 0; the seals' is 1.)
  if (q.x < 0.5) return runeseal_djinn(p, time, seed, q, r, s);
  return runeseal_seals(p, time, seed, q, r, s);
}
`;
