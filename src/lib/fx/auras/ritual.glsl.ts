// The ritual aura's light in the effects shader (shaders.ts): `aura_ritual`,
// given the pixel's place (CSS px from the token's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `ritual_...`, so no two auras' names meet.
//
// The wearer stands as the altar of a Ritual site, as the game lays one out:
// a sacrificial circle on the ground, its runes drawn in blood, a pool of
// blood round the altar's foot that the dead are drained into, and candles
// standing in clusters on it, lit one by one as the tribute comes in. The
// floor is seen in perspective: a wide, shallow ellipse below the token's
// middle, its far half behind the token. The altar's own violet light seeps
// out from behind the wearer. Now and then the locusts the game sends out of
// a finished altar to point the way pour out of the wearer as one stream: out
// to one side behind it, a turn far out, and back in front, diving into the
// face, the tribute taken. They fly a rope's twist round the way they go, so
// the stream is one body with intent, every locust facing where it goes.
//
//   q: the token's radius with its rim (px), its size (0 small to 1 large),
//      the candles lit (0-10: candle n burns as this passes n, in its order),
//      the flames' bow (a draught: + to the right).
//   r: the sortie (the locusts' flight: its number * 10 + its phase, the head
//      out at 1 and home at 2; 3 and over, none), the swarm (its side's sign *
//      (how many fly, 0-1, plus 2 if half of them go the other way)), the
//      blood (1 at rest: how far the pool reaches and how bright), the
//      tribute's age (s since blood began to flow in; below 0, -s since the
//      wearer began to bleed).
//   s: the altar's light (1 at rest, more as it flares), the snuffing's age
//      (s since candles went out), the candles snuffed (those in order below
//      this, and not lit, smoke).

export const GLSL = `
// The candles, in token radii: x, the y of its foot on the floor, its height, its width.
const vec4 RITUAL_CANDLE[10] = vec4[10](
  vec4(-1.06, 0.60, 0.78, 0.105), vec4(-1.36, 0.70, 0.56, 0.115), vec4(1.08, 0.58, 0.64, 0.10), vec4(1.38, 0.68, 0.72, 0.115),
  vec4(-1.2, 1.02, 0.42, 0.125), vec4(-1.5, 0.88, 0.30, 0.10), vec4(1.18, 1.04, 0.36, 0.12), vec4(1.5, 0.86, 0.46, 0.10),
  vec4(-0.74, 1.12, 0.26, 0.10), vec4(0.80, 1.10, 0.30, 0.105));
// And: whether it stands in front of the token (1) or behind (0), its place in the order they're lit, its wax (0 bone, 1 red), its own random.
const vec4 RITUAL_CANDLE_K[10] = vec4[10](
  vec4(0.0, 0.0, 0.0, 0.13), vec4(0.0, 3.0, 1.0, 0.71), vec4(0.0, 1.0, 1.0, 0.37), vec4(0.0, 5.0, 0.0, 0.92),
  vec4(1.0, 4.0, 0.0, 0.55), vec4(1.0, 7.0, 1.0, 0.24), vec4(1.0, 2.0, 1.0, 0.83), vec4(1.0, 9.0, 0.0, 0.46),
  vec4(1.0, 8.0, 1.0, 0.06), vec4(1.0, 6.0, 0.0, 0.64));

// A candle flame's light at d (px from its wick, +y down): fh its height, fw
// its half width (px), lean how far it bows (per unit of its height). A
// small teardrop: a pale core low in it, an orange skin, a blue foot.
vec3 ritual_flame(vec2 d, float fh, float fw, float lean) {
  float t = -d.y / fh;
  float x = d.x - lean * max(t, 0.0) * max(t, 0.0) * fh;
  float wid = max(fw * (0.4 + 0.6 * smoothstep(-0.2, 0.3, t)) * (1.0 - 0.72 * smoothstep(0.3, 1.0, t)), 0.4);
  float skin = exp(-x * x / (wid * wid)) * smoothstep(-0.2, 0.08, t) * smoothstep(1.0, 0.5, t);
  float core = exp(-x * x / (0.22 * wid * wid)) * smoothstep(-0.06, 0.12, t) * smoothstep(0.62, 0.2, t);
  float foot = exp(-(x * x + d.y * d.y) / (wid * wid * 0.5)) * smoothstep(0.25, -0.05, t);
  return vec3(1.2, 0.4, 0.09) * skin + vec3(1.7, 1.3, 0.78) * core + vec3(0.12, 0.2, 0.8) * foot * 0.6;
}

// Where the floor's pool is (0 out, 1 in), and its own coordinates (the unit
// circle its rim at rest). P: in token radii.
vec2 ritual_floor(vec2 P) { return vec2(P.x / 1.95, (P.y - 0.82) / 0.36); }

// A spill, not a dish: its edge lobed at two scales, and a few drops
// splashed beyond it (flat, as the floor is seen).
float ritual_pool(vec2 F, float level, float seed) {
  float l = length(F);
  vec2 dir = F / max(l, 1e-3);
  float edge = (0.8 + 0.18 * level) * (1.0 + 0.34 * (vnoise(dir * 2.4 + seed * 5.0) - 0.5) + 0.14 * (vnoise(dir * 6.5 + seed * 11.0) - 0.5));
  float pool = smoothstep(1.0, 0.88, l / edge);
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float a = hash12(vec2(fk, seed * 29.0)) * 6.2832;
    vec2 c = vec2(cos(a), sin(a)) * (0.98 + 0.2 * hash12(vec2(fk + 0.5, seed * 3.0))) * (0.8 + 0.18 * level);
    float rd = 0.035 + 0.05 * hash12(vec2(fk + 0.25, seed * 7.0));
    pool = max(pool, smoothstep(rd, rd * 0.6, length(F - c)));
  }
  return pool;
}

// The swarm's head moves fast out of the wearer, slows into its turn far
// out, and comes back fast: the way along at phase ph.
float ritual_s(float ph) { return ph + 0.2 * sin(3.14159 * clamp(ph, 0.0, 2.0)); }

// The sortie's way at s (0 in the wearer, behind; 1 at its far turn; 2 back
// in the wearer, in front), in token radii (z toward the eye). k: its reach,
// rise, curl and depth.
vec3 ritual_path(float s, float side, vec4 k) {
  float th = 1.5708 * clamp(s, 0.0, 2.0);
  float sn = sin(th);
  return vec3(side * k.x * sn * (0.8 + 0.2 * sn), k.y * sn + k.z * sin(2.0 * th), -k.w * cos(th));
}

// Locust i's place at phase ph: along the way behind the head by its lag,
// out from the way by its own place in the stream's twisting rope.
vec3 ritual_locust(float ph, float side, vec4 k, float amt, vec4 h, out float s) {
  s = ritual_s(ph - h.x);
  vec3 c = ritual_path(s, side, k);
  float th = 1.5708 * clamp(s, 0.0, 2.0);
  float wdt = (0.08 + 0.34 * sin(th)) * (0.75 + 0.4 * amt);
  float a = h.y * 6.2832 + s * 2.4;
  float rad = sqrt(h.z);
  c.y += rad * cos(a) * wdt * 0.6;
  c.z += rad * sin(a) * wdt;
  c.x += (h.w - 0.5) * wdt * 0.7 * side;
  return c;
}

vec3 aura_ritual(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float R = q.x;
  float big = q.y;
  float lit = q.z;
  float lean = clamp(q.w, -1.3, 1.3);
  float level = r.z;
  float light = s.x;
  vec2 P = p / R;
  float rr = length(p);
  // What the token lets through from behind it: 0 over it, 1 outside.
  float clear = smoothstep(R - 0.7, R + 0.7, rr);
  float face = (1.0 - clear) * smoothstep(0.35 * R, R, rr);
  vec3 deep = vec3(0.28, 0.08, 0.8);
  vec3 violet = vec3(0.58, 0.28, 1.25);
  vec3 lilac = vec3(0.9, 0.74, 1.3);
  vec3 crimson = vec3(1.0, 0.05, 0.06);
  vec3 warm = vec3(1.0, 0.52, 0.2);
  vec3 col = vec3(0.0);

  // The sortie, if the locusts are out.
  float kk = floor(r.x / 10.0);
  float ph = r.x - kk * 10.0;
  float sa = abs(r.y);
  float both = step(1.5, sa);
  float amt = sa - 2.0 * both;
  float side = r.y < 0.0 ? -1.0 : 1.0;
  bool out_ = ph < 2.9 && amt > 0.01;
  vec4 K = vec4(
    (2.5 + 0.8 * hash12(vec2(kk, seed * 7.0 + 1.3))) * (0.78 + 0.32 * amt),
    (hash12(vec2(kk + 0.3, seed * 5.0 + 2.9)) - 0.65) * 0.7,
    (hash12(vec2(kk + 0.6, seed * 3.0 + 4.7)) - 0.5) * 0.6,
    0.8 + 0.6 * hash12(vec2(kk + 0.9, seed * 9.0 + 0.5)));
  // The stream's bulk coming home into the face: the tribute taken.
  float taken = out_ ? amt * exp(-pow((ritual_s(ph - 0.3) - 1.92) / 0.22, 2.0)) : 0.0;

  // The altar's light: deep violet seeping out from behind the token, wide to
  // the sides and shallow, breathing slowly and unevenly.
  float breathe = 0.82 + 0.36 * vnoise(vec2(time * 0.37 + seed * 7.0, seed * 3.0));
  float beyond = max(length(P * vec2(0.75, 1.15)) - 0.9, 0.0) * clear;
  float nearL = exp(-beyond / 0.22);
  float wideL = exp(-beyond / 0.7);
  float glowK = light * breathe + 0.6 * taken;
  col += (mix(deep, violet, nearL) * (nearL * 0.4 + wideL * 0.07) * glowK + lilac * nearL * 0.3 * max(light - 0.85, 0.0)) * clear;
  // On the face: a violet cast at its top edge, deeper as the tribute comes home.
  col += mix(deep, violet, 0.4) * face * face * smoothstep(0.6, -0.6, P.y) * (0.14 * light * breathe + 0.3 * taken);

  // The floor: the pool of blood the altar stands in, its runed circle, and
  // the blood flowing in. All of it lies behind the token.
  vec2 F = ritual_floor(P);
  float lf = length(F);
  float pool = ritual_pool(F, level, seed) * clear;
  if (lf < 1.4) {
    // Dark blood, glossy: the altar's violet mirrored in it near the foot,
    // and sharp glints where its surface catches the light.
    float sheen = vnoise(F * vec2(3.0, 7.0) + vec2(time * 0.05, seed * 9.0));
    float mirror = exp(-length((P - vec2(0.0, 0.74)) * vec2(0.55, 3.2)));
    col += vec3(0.055, 0.003, 0.007) * pool * (0.55 + 0.45 * level)
      + vec3(0.36, 0.05, 0.06) * pow(sheen, 9.0) * pool * level
      + mix(deep, violet, 0.5) * mirror * pool * 0.1 * light * breathe;
    // Waves of blood passing through, unevenly: two trains of slow fronts
    // crossing at their own paces, each from its own side.
    for (int w = 0; w < 2; w++) {
      float per = w == 0 ? 7.3 : 11.9;
      float cyc = floor((time + seed * 40.0) / per);
      float ft = fract((time + seed * 40.0) / per);
      float dir = hash12(vec2(cyc, float(w) + seed)) < 0.5 ? -1.0 : 1.0;
      float front = dir * mix(-1.2, 1.2, ft);
      float wave = exp(-pow((F.x - front + 0.25 * F.y * dir) / 0.07, 2.0)) * smoothstep(0.0, 0.2, ft) * smoothstep(1.0, 0.8, ft);
      col += crimson * 0.1 * wave * pool * (w == 0 ? 1.0 : 0.6);
    }
    // The circle's runes, drawn in blood: a ring with a script inside it,
    // dim at rest and lit as the altar's light flares.
    float fw = max(fwidth(lf), 1e-4);
    float ring = exp(-pow((lf - 0.78) / (1.1 * fw), 2.0)) + 0.6 * exp(-pow((lf - 0.64) / (0.9 * fw), 2.0));
    float ang = atan(F.y, F.x) / 6.2832 + 0.5;
    float cell = floor(ang * 34.0);
    float v = fract(ang * 34.0);
    float band = (lf - 0.655) / 0.11;
    float g1 = hash12(vec2(cell, seed * 31.0));
    float g2 = hash12(vec2(cell + 0.5, seed * 17.0));
    float vw = fw * 34.0 / 6.2832 / max(lf, 0.2) * 1.3;
    float stroke = exp(-pow((v - (0.3 + 0.4 * g1)) / vw, 2.0)) * smoothstep(0.0, 0.1, band) * smoothstep(1.0, 0.9 - 0.4 * g2, band);
    float sv = g2 < 0.5 ? mix(0.2, 0.8, band) : mix(0.8, 0.2, band);
    float slant = exp(-pow((v - sv) / vw, 2.0)) * step(0.45, g1) * smoothstep(0.0, 0.1, band) * smoothstep(1.0, 0.9, band);
    float runes = (ring + 0.8 * max(stroke, slant)) * clear * smoothstep(1.0, 0.0, abs(lf - 0.72) * 4.0);
    float runeLit = 0.2 + 1.3 * max(light - 0.8, 0.0) + 0.5 * taken;
    col += crimson * runes * runeLit * 0.75;
    // The tribute flowing in: rivulets of blood running across the floor to the altar's foot.
    if (r.w >= 0.0 && r.w < 3.2) {
      float age = r.w;
      float head = 1.1 - age * 0.85;
      float fade = smoothstep(0.0, 0.1, age) * exp(-max(age - 0.95, 0.0) * 3.0);
      float a0 = atan(F.y, F.x);
      for (int k = 0; k < 6; k++) {
        float fk = float(k);
        float ak = fk * 1.0472 + (hash12(vec2(fk, seed * 13.0)) - 0.5) * 0.7;
        float da = a0 - ak - 0.18 * sin(lf * 7.0 + fk * 2.0);
        da = mod(da + 3.14159, 6.2832) - 3.14159;
        float across = abs(da) * lf * 1.95 * R;
        float line = exp(-pow(across / max(0.05 * R, 0.6), 2.0));
        float along = smoothstep(head - 0.02, head + 0.08, lf) * smoothstep(1.15, 0.9, lf) * smoothstep(0.25, 0.4, lf);
        float tip = exp(-pow((lf - head - 0.05) / 0.07, 2.0));
        col += crimson * line * (0.3 * along + 0.9 * tip) * fade * clear;
      }
    }
  }
  // The wearer bleeding: blood running down from the face's lower edge into the pool.
  if (r.w < 0.0 && r.w > -7.0) {
    float age = -r.w;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float x0 = -0.42 + 0.4 * fk + 0.12 * (hash12(vec2(fk, seed * 19.0)) - 0.5);
      float y0 = sqrt(max(1.0 - x0 * x0, 0.0)) - 0.2;
      float yh = y0 + min(age * (0.32 + 0.1 * fk), 0.9 - y0 + 0.2);
      float wob = x0 + 0.02 * sin(P.y * 9.0 + fk);
      float line = exp(-pow((P.x - wob) * R / max(0.045 * R, 0.55), 2.0)) * smoothstep(y0 - 0.02, y0 + 0.04, P.y) * smoothstep(yh + 0.04, yh - 0.02, P.y);
      float drop = exp(-(pow((P.x - wob) * R, 2.0) + pow((P.y - yh) * R, 2.0)) / max(0.07 * R * 0.07 * R, 0.5));
      col += vec3(0.75, 0.02, 0.04) * (line * 0.5 + drop * 0.9) * exp(-max(age - 1.2, 0.0) * 1.1);
    }
  }

  // The candles: wax standing on the floor, lit in their order, each flame
  // flickering on its own and all of them bowing together in a draught; the
  // lit ones mirrored in the blood. Their light falls on the face.
  // (Each wearer's site its own: the layout mirrored or not, each candle burnt down its own way.)
  float warmth = 0.0;
  float flip = hash12(vec2(seed * 37.0, 1.7)) < 0.5 ? -1.0 : 1.0;
  for (int j = 0; j < 10; j++) {
    vec4 c = RITUAL_CANDLE[j];
    vec4 ck = RITUAL_CANDLE_K[j];
    c.x *= flip;
    c.z *= 0.8 + 0.35 * hash12(vec2(float(j), seed * 41.0 + 2.3));
    vec2 foot = vec2(c.x, c.y) * R;
    float topY = (c.y - c.z) * R;
    vec2 wick = vec2(foot.x, topY);
    vec2 dw = p - wick;
    // Far from it, nothing of it shows.
    if (abs(dw.x) > 1.3 * R || dw.y < -1.2 * R || dw.y > (c.z + 0.6) * R) continue;
    float a = clamp(lit - ck.y, 0.0, 1.0);
    float seen = ck.x > 0.5 ? 1.0 : clear;
    float n1 = vnoise(vec2(time * 3.1 + ck.w * 40.0, seed * 11.0 + ck.w * 7.0));
    float n2 = vnoise(vec2(time * 7.3 + ck.w * 23.0, ck.w * 5.0));
    float flick = 0.82 + 0.3 * n1 + 0.12 * n2;
    float bow = lean * (0.85 + 0.3 * ck.w) + 0.25 * (n1 - 0.5);
    float fh = (0.2 + 0.03 * ck.w) * R * flick * a * (1.0 - 0.3 * min(abs(lean), 1.0));
    float fw = max(0.055 * R, 0.55) * (0.7 + 0.3 * a);
    vec3 cl = vec3(0.0);
    if (a > 0.0) {
      cl += ritual_flame(dw, max(fh, 0.3), fw, bow) * a;
      // Its halo: a small warm light round the flame, and a breath of it further.
      vec2 hc = dw + vec2(-bow * 0.4 * fh, fh * 0.45);
      float hd2 = dot(hc, hc) / (R * R);
      cl += warm * (0.3 * exp(-hd2 / 0.03) + 0.05 * exp(-sqrt(hd2) / 0.3)) * a * flick;
      warmth += a * flick * exp(-length(wick) / (1.4 * R));
      // Its likeness in the blood, half as tall and rippling.
      if (p.y > foot.y) {
        vec2 rp = vec2(p.x + 0.035 * R * sin(p.y / R * 23.0 + time * 1.7 + ck.w * 9.0), foot.y - (p.y - foot.y) * 2.0);
        vec2 rd = rp - wick;
        cl += ritual_flame(rd, max(fh, 0.3), fw * 1.3, bow) * a * vec3(1.0, 0.4, 0.35) * 0.5 * ritual_pool(ritual_floor(vec2(p.x, p.y) / R), level, seed);
      }
    }
    // The wax: a round pillar, lit through from the flame near its top,
    // violet on the side that faces the altar's light, drips run down it.
    float hw = max(c.w * R * 0.5, 0.6);
    float dx = p.x - foot.x;
    float u = dx / hw;
    float lipY = topY + 0.03 * R * sin(u * 2.5 + ck.w * 6.0);
    float m = smoothstep(hw + 0.5, hw - 0.5, abs(dx)) * smoothstep(lipY - 0.5, lipY + 0.5, p.y) * smoothstep(foot.y + 0.04 * R, foot.y - 0.06 * R, p.y);
    if (m > 0.0) {
      vec3 wax = ck.z > 0.5 ? vec3(0.62, 0.05, 0.04) : vec3(0.85, 0.66, 0.45);
      float down = max(p.y - topY, 0.0) / R;
      float through = a * flick * exp(-down / 0.16) * (1.0 - 0.5 * u * u);
      float toward = -sign(foot.x) * u;
      float rim = smoothstep(0.2, 1.0, toward);
      float d1 = exp(-pow((u - (ck.w - 0.5) * 1.2) / 0.22, 2.0)) * smoothstep(topY + (0.2 + 0.5 * ck.w) * c.z * R, topY, p.y);
      float d2 = exp(-pow((u + (0.3 - ck.w * 0.6)) / 0.2, 2.0)) * smoothstep(topY + (0.15 + 0.3 * fract(ck.w * 7.0)) * c.z * R, topY, p.y);
      float drips = max(d1, d2);
      float cup = exp(-pow((p.y - lipY) / 0.7, 2.0)) * a;
      // (Unlit, it's only a shape in the altar's light; lit, it glows through below the flame and darkens toward its foot.)
      float body = 0.012 + 0.05 * a * exp(-down / 0.5);
      cl += m * (wax * (body + 1.1 * through + 0.16 * drips * (0.15 + a) + 0.6 * cup) + violet * rim * (0.05 + 0.04 * a) * light * breathe);
    }
    // Snuffed: its wick's ember dying, and a thread of smoke going up.
    float gone = 1.0 - a;
    if (s.y < 4.0 && ck.y < s.z && gone > 0.0) {
      float ag = s.y;
      float ember = exp(-dot(dw, dw) / 0.6) * exp(-ag * 2.5);
      float st = -dw.y / (0.9 * R);
      float reach = min(1.0, ag * 1.4);
      float xs = (0.12 * sin(st * 5.0 - ag * 4.0 + ck.w * 6.0) * st + lean * 0.25 * st) * R;
      float thread = exp(-pow((dw.x - xs) / (0.6 + 0.09 * R * st), 2.0)) * smoothstep(0.0, 0.1, st) * smoothstep(reach, reach - 0.25, st) * (1.0 - st);
      cl += (vec3(1.2, 0.25, 0.06) * ember + vec3(0.32, 0.29, 0.38) * thread * 0.9 * exp(-ag * 1.1)) * gone;
    }
    col += cl * seen;
  }
  // The candles' light on the face, warm from below, and the blood's beneath it.
  col += warm * face * face * smoothstep(-0.3, 0.9, P.y) * warmth * 0.16;
  col += vec3(0.4, 0.02, 0.03) * face * smoothstep(0.45, 1.0, P.y) * 0.18 * level;

  if (out_) {
    // The swarm's body: a haze of wings along the stream, thick at the head.
    for (int j = 0; j < 7; j++) {
      float fj = float(j) / 6.0;
      float sj = ritual_s(ph - fj * 0.7);
      float vis = smoothstep(0.0, 0.15, sj) * smoothstep(2.0, 1.7, sj);
      if (vis <= 0.0) continue;
      for (int m = 0; m < 2; m++) {
        if (m == 1 && both < 0.5) break;
        vec3 c3 = ritual_path(sj, m == 0 ? side : -side, K);
        vec2 dc = P - c3.xy;
        float th = 1.5708 * clamp(sj, 0.0, 2.0);
        float sz = (0.16 + 0.3 * sin(th)) * (0.75 + 0.4 * amt);
        float hz = exp(-(dc.x * dc.x / (sz * sz * 1.8) + dc.y * dc.y / (sz * sz * 0.8)));
        float zb = c3.z / max(length(c3), 1e-3);
        float hseen = mix(clear, mix(0.3, 1.0, clear), smoothstep(-0.2, 0.2, zb));
        col += mix(violet, deep, fj) * hz * (0.16 - 0.1 * fj) * (0.3 + 0.7 * big) * hseen * amt * vis;
      }
    }

    // A unit of the drawing: a locust is about four of these long.
    // (Smaller for a small token: there they'd blur into one cloud.)
    float un = max(mix(0.075, 0.12, big) * R, 0.9);
    for (int i = 0; i < 32; i++) {
      float fi = float(i);
      float on = smoothstep(fi / 32.0 * 0.95, fi / 32.0 * 0.95 + 0.05, amt);
      if (on <= 0.0) break;
      vec4 h = vec4(hash12(vec2(fi, seed * 13.0 + 0.7)), hash12(vec2(fi + 0.31, seed * 7.0 + 1.9)), hash12(vec2(fi + 0.57, seed * 3.0 + 4.1)), hash12(vec2(fi + 0.83, seed * 11.0 + 2.3)));
      // More of them near the head.
      h.x = 0.7 * h.x * h.x;
      float sd = (both > 0.5 && mod(fi, 2.0) > 0.5) ? -side : side;
      float sl;
      vec3 at = ritual_locust(ph, sd, K, amt, h, sl);
      float vis = smoothstep(0.0, 0.1, sl) * smoothstep(2.0, 1.75, sl) * on;
      if (vis <= 0.0) continue;
      at.xy += 0.025 * vec2(sin(time * 6.0 + fi * 2.1), cos(time * 7.7 + fi * 1.3));
      float zn = at.z / max(length(at), 1e-3);
      float nr = 0.5 + 0.5 * zn;
      vec2 cpx = at.xy * R;
      vec2 d = p - cpx;
      // Near ones larger, far ones smaller; those diving home shrink into the face.
      float size = un * (0.7 + 0.55 * nr) * (0.8 + 0.4 * h.w) * mix(0.5, 1.0, smoothstep(2.0, 1.75, sl));
      if (dot(d, d) > 9.0 * size * size) continue;
      float sl2;
      vec3 ah = ritual_locust(ph + 0.04, sd, K, amt, h, sl2);
      vec2 vv = (ah.xy - at.xy) * R;
      vec2 fwd = length(vv) > 1e-3 ? normalize(vv) : vec2(sd, 0.0);
      vec2 sdv = vec2(-fwd.y, fwd.x);
      vec2 lp = vec2(dot(d, fwd), dot(d, sdv)) / size;
      // Its body, long and narrow, abdomen to a small blunt head.
      vec2 bq = vec2((lp.x + 0.35) / 1.75, lp.y / 0.3);
      vec2 hq = vec2((lp.x - 1.45) / 0.3, lp.y / 0.27);
      float eb = length(bq);
      float eh = length(hq);
      float e = min(eb, eh);
      float fill = smoothstep(1.0, 0.7, e);
      vec2 nl = eb < eh ? vec2(bq.x / 1.75, bq.y / 0.3) : vec2(hq.x / 0.3, hq.y / 0.27);
      vec2 nn = normalize(fwd * nl.x + sdv * nl.y + 1e-5);
      // Lit along its outline from the altar's side.
      vec2 toTok = -normalize(cpx + 1e-4);
      float rim = fill * smoothstep(0.45, 0.95, e) * pow(max(dot(nn, toTok), 0.0), 1.2);
      // Wings: narrow panes swept back along the body, beating.
      float wb = 0.5 + 0.5 * sin(time * 13.0 + fi * 2.3);
      vec2 wl = rot2(lp - vec2(0.7, 0.0), 0.2 + 0.32 * wb);
      vec2 wr = rot2(lp - vec2(0.7, 0.0), -0.2 - 0.32 * wb);
      float ew = min(length(vec2((wl.x + 1.15) / 1.35, wl.y / 0.2)), length(vec2((wr.x + 1.15) / 1.35, wr.y / 0.2)));
      float wing = smoothstep(1.0, 0.6, ew) * (1.0 - fill);
      float wedge = smoothstep(0.72, 0.95, ew) * smoothstep(1.12, 0.95, ew);
      // The great hind legs, bent up beside the body.
      vec2 lq = vec2(lp.x, abs(lp.y));
      vec2 k0 = vec2(0.25, 0.2);
      vec2 e1 = vec2(-1.1, 0.35);
      float a1 = clamp(dot(lq - k0, e1) / dot(e1, e1), 0.0, 1.0);
      float legs = exp(-pow(length(lq - k0 - e1 * a1) / (0.15 - 0.07 * a1), 2.0)) * big;
      float eye = exp(-dot(lp - vec2(1.5, 0.0), lp - vec2(1.5, 0.0)) / 0.025) * big;
      // Behind the token the disc hides it; over the face it lies fainter, so the letter reads.
      float seen = mix(clear, mix(0.25, 1.0, clear), smoothstep(-0.15, 0.15, zn)) * vis;
      float lit2 = (0.5 + 0.5 * exp(-max(length(at.xy) - 1.0, 0.0) * 0.7)) * (0.6 + 0.4 * light);
      vec3 bug = vec3(0.4, 0.035, 0.06) * (fill * 0.5 + legs * 0.4)
        + violet * (rim * 2.0 + legs * 0.5)
        // (On a small token the wings would blur into fuzz: there the bodies carry it.)
        + lilac * (wing * 0.08 + wedge * 0.18 * (0.4 + 0.6 * wb)) * mix(0.35, 1.0, big)
        + vec3(1.4, 0.15, 0.12) * eye * 0.25;
      col += bug * lit2 * seen * (0.45 + 0.55 * nr);
    }
  }
  return col;
}
`;
