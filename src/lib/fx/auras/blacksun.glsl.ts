// The blacksun aura's light in the effects shader (shaders.ts): `aura_blacksun`,
// given the pixel's place (CSS px from the token's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `blacksun_...`, so no two auras' names meet.
//
// The black sun at the heart of Delve's circle (lib/plates/blackSun.ts),
// worn (blacksun.ts): the token stands where the black sun does, the moon
// across the sun, and round it the corona, drawn as the plate draws its
// glory and as the old copperplates drew an eclipse: in fine engraved
// strokes in the circle's old gold. They lie along the sun's field as a real
// corona does: its equator out to the sides (each token's tilted its own
// way), the strokes from above and below bending toward it as they leave
// the moon, more on one side than the other, so they gather into long
// streamers out to the sides, one longer than the other, and leave the top
// and bottom nearly bare but for a short plume each. Each streamer is a fan
// of strokes, longest down its middle, over a soft light, warm at the rim,
// pearl, then a pale lavender where it thins out. One of the slanting
// streamers leans out toward us: its strokes start on the token's face and
// run out over its edge. Now and then a stroke catches the light, and a
// loop of the field rises on the edge in rose, flares and sinks back. The
// sun drifts a little behind the moon, so the light pools on its near side,
// where a thin rose crescent of its chromosphere shows.
//
// Behind the token: the corona and the loops. In front: the leaning
// streamer, the corona's light catching the face's edge where the sun leans,
// and the beads, the sun's light glinting through the valleys at the moon's
// edge, the last of a run perhaps flaring into the diamond, its glare
// spilling over the face. At a streak the strokes where the sun broke
// through burst out far, hot at their tips.
//
//   q: the token's radius with its rim (px), the corona's reach (1 at rest;
//      0 drawn into the rim), its light (1 at rest), and the sun's place
//      behind the moon (radii, x and y each from -0.1 to 0.1, packed as
//      1024 * x' + y', each 0-1000).
//   r: s since the corona was jarred (a miss, a lost life); a run of beads:
//      where its last one stands (rad: 0 right, +y down), s since it began
//      (below 0, none), how many (the whole part) and how bright the last
//      flares into the diamond (the fraction).
//   s: the streak's glow (0-1), s since a score's pulse of light began to
//      run out along the strokes (below 0 or past 2.5, none), and a loop
//      flaring or a burst (below 0, neither): 2048 * which (0, 1 a loop;
//      2 a burst) + where a burst is (0-1023 round the circle, from the
//      right, +y down) + how far through it is (0-1).

export const GLSL = `
// The corona: warm at the rim, pearl, a pale lavender where it thins out;
// the darkened sky round the eclipse.
const vec3 BLACKSUN_WARM = vec3(1.45, 1.05, 0.62);
const vec3 BLACKSUN_PEARL = vec3(1.0, 0.98, 0.95);
const vec3 BLACKSUN_PALE = vec3(0.45, 0.5, 0.95);
const vec3 BLACKSUN_SKY = vec3(0.04, 0.05, 0.2);
// The engraving, in the circle's old gold.
const vec3 BLACKSUN_GOLD = vec3(1.7, 1.06, 0.4);
// The chromosphere and the field's loops; the sun itself, where it glints through.
const vec3 BLACKSUN_ROSE = vec3(1.75, 0.34, 0.62);
const vec3 BLACKSUN_HOT = vec3(3.0, 2.7, 2.2);
// The rust a miss cools it to.
const vec3 BLACKSUN_RUST = vec3(1.05, 0.5, 0.34);
const float BLACKSUN_TAU = 6.2831853;

// A thin line seen from d off it, w its true half width, px one pixel: its
// coverage, never thinner than a pixel and as faint as it is thinner than that.
float blacksun_line(float d, float w, float px) {
  float ww = max(w, 0.55 * px);
  return (w / ww) * (1.0 - smoothstep(ww - 0.5 * px, ww + 0.5 * px, d));
}

float blacksun_h(float k, float j, float seed) {
  return hash12(vec2(k * 7.31 + j * 1.37, seed * 91.7 + j * 3.11));
}

// The angle a less b, wrapped into -PI to PI.
float blacksun_dang(float a, float b) {
  float d = a - b;
  return d - BLACKSUN_TAU * floor((d + PI) / BLACKSUN_TAU);
}

// A loop of the field standing on the moon's edge at n0 (an arch wid across
// and hgt high, radii), seen from d off its foot: how far off its outline
// and the outline e of the way out (both in radii), and whether it stands
// on this side of the edge.
vec3 blacksun_arch(vec2 d, vec2 n0, float wid, float hgt) {
  float nn = dot(d, n0);
  vec2 u = vec2(dot(d, vec2(-n0.y, n0.x)) / wid, nn / hgt);
  float e = length(u);
  float g = length(vec2(u.x / wid, u.y / hgt)) / max(e, 1e-4);
  return vec3(e, 1.0 / max(g, 1e-4), smoothstep(-0.01, 0.025, nn));
}

// The pointed ray down streamer k, each token its own (seed): its angle
// where it leaves the moon (rad, from the field's equator, +y down), its
// length past its root at rest and its width (radii). The first two are the
// long ones, one to each side, one longer than the other; the next two
// shorter, slanting beside them; the last two short plumes, one above, one below.
vec3 blacksun_ray(float k, float seed) {
  float h1 = blacksun_h(k, 0.0, seed);
  float h2 = blacksun_h(k, 1.0, seed);
  float side = mod(k, 2.0) < 0.5 ? 0.0 : PI;
  if (k < 1.5) {
    float lw = step(0.5, blacksun_h(0.0, 8.0, seed));
    float longer = k < 0.5 ? lw : 1.0 - lw;
    return vec3(side + (h1 - 0.5) * 0.3, mix(0.78 + 0.25 * h2, 1.35 + 0.3 * h2, longer), 0.1);
  }
  if (k < 3.5) return vec3(side + (h1 < 0.5 ? -1.0 : 1.0) * (0.32 + 0.12 * fract(h1 * 7.0)), 0.55 + 0.3 * h2, 0.085);
  float a = (k < 4.5 ? -1.0 : 1.0) * (0.95 + 0.25 * fract(h1 * 5.0));
  return vec3(h1 < 0.5 ? PI - a : a, 0.13 + 0.08 * h2, 0.06);
}

// Streamer k as it stands now: its angle, swaying on its own slow beat; its
// length past its root, swelling and shrinking on another; its width; and
// how bright it is (the long ones most).
vec4 blacksun_streamer(float k, float seed, float time, float lean, float reach) {
  vec3 ray = blacksun_ray(k, seed);
  float hk = blacksun_h(k, 2.0, seed);
  float a = ray.x + lean + (k < 3.5 ? 0.12 : 0.08) * sin(time * (0.55 + 0.4 * hk) + hk * 20.0);
  // (Breathing as the plate's coronas do, in two sets out of step: 4.6 s and 3.7 s.)
  float b = sin(time * (k > 1.5 && k < 3.5 ? 1.698 : 1.366) + hk * 6.283);
  float L = max(ray.y * reach * (1.0 + 0.16 * b + 0.08 * sin(time * (0.38 + 0.3 * fract(hk * 9.0)) + hk * 20.0)), 0.02);
  return vec4(a, L, ray.z, (k < 1.5 ? 1.0 : (k < 3.5 ? 0.7 : 0.4)) * (1.0 + 0.2 * b));
}

vec3 aura_blacksun(vec2 pp, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.x;
  float px = 1.0 / tok;
  vec2 p = pp / tok;
  float rr = length(p);
  // What the token lets through from behind it: 0 over it, 1 outside.
  float clear = smoothstep(1.0 - 0.7 * px, 1.0 + 0.7 * px, rr);
  // The sun behind the moon, and the corona round it.
  float ix = floor(q.w / 1024.0);
  vec2 o = (vec2(ix, q.w - ix * 1024.0) / 1000.0 - 0.5) * 0.2;
  vec2 c = p - o;
  float rc = length(c);
  float ub = max(rc - 1.0, 0.0);
  float reach = q.y;
  float power = s.x;
  // A miss or a lost life jars it (the plate's shudder, settling out) and cools it.
  float jt = r.x;
  float chill = jt < 8.0 ? exp(-jt / 1.5) : 0.0;
  float lean = 0.03 * sin(time * 0.09 + seed * 6.0) + (jt < 1.0 ? 0.045 * sin(jt * 30.0) * exp(-jt / 0.22) : 0.0);
  // The light pools on the side the sun leans toward.
  float ol = length(o);
  float pool = 1.0 + 0.9 * clamp(ol * 30.0, 0.0, 1.0) * (ol > 1e-4 ? dot(c / max(rc, 1e-4), o / ol) : 0.0);

  // The field the corona lies along: its equator, tilted and wavering slowly;
  // its lines bending toward it as they leave the moon. tw: the angle from
  // the equator; fr: where the line through here leaves the moon, from the
  // equator; jf: how much closer together the lines lie here than there.
  float hs = blacksun_h(0.0, 7.0, seed);
  float ax = (hs - 0.5) * 0.4 + 0.07 * sin(time * 0.13 + seed * 5.0);
  float bend = 0.24 * (1.0 + 0.35 * sin(time * 0.23 + seed * 3.0));
  float lop = fract(hs * 13.0) < 0.5 ? -0.35 : 0.35;
  float tw = atan(c.y, c.x) - ax;
  float g = ub / (1.0 + 0.5 * ub);
  float s2 = sin(2.0 * tw);
  float ct = cos(tw);
  float fr = tw + g * bend * s2 * (1.0 + lop * ct);
  float jf = max(1.0 + g * bend * (2.0 * cos(2.0 * tw) * (1.0 + lop * ct) - lop * s2 * sin(tw)), 0.25);

  // A pulse of light running out along the corona after a score (only its
  // strokes and streamers carry it), and the strokes lit round from where
  // the sun broke through, both ways.
  float wt = s.y;
  float wave = 0.0;
  float lit = 0.0;
  if (wt >= 0.0 && wt < 2.5) {
    wave = exp(-pow((rc - 1.0 - wt * 2.1) / (0.06 + 0.14 * wt), 2.0)) * exp(-wt / 0.6);
    lit = smoothstep(wt * 6.5 + 0.4, wt * 6.5 - 0.4, abs(blacksun_dang(tw + ax, r.y))) * exp(-wt / 0.9);
  }

  // The beads: the sun's light through the valleys at the moon's edge, one
  // after another along it up to the last, which may flare into the diamond.
  vec3 beads = vec3(0.0);
  float dia = 0.0;
  if (r.z >= 0.0) {
    float nb = floor(r.w);
    float sd = hash12(vec2(r.y * 13.0, 3.0)) < 0.5 ? -1.0 : 1.0;
    float rb = 0.024 + 0.85 * px;
    for (int j = 0; j < 7; j++) {
      float fj = float(j);
      if (fj >= nb) break;
      float tj = r.z - fj * 0.055;
      if (tj < 0.0) break;
      float aj = r.y + sd * (fj - nb + 1.0) * 0.075;
      vec2 d = p - vec2(cos(aj), sin(aj)) * 1.004;
      float dd = dot(d, d);
      float e = smoothstep(0.0, 0.035, tj) * exp(-tj / 0.32) * (0.7 + 0.3 * blacksun_h(fj, 4.0, r.y));
      beads += BLACKSUN_HOT * exp(-dd / (rb * rb)) * 2.4 * e + BLACKSUN_ROSE * 0.45 * exp(-sqrt(dd) / 0.06) * e;
    }
    // The diamond, where the last bead stands: a point of the sun too bright
    // to look at, a burst of fine rays about it, four long and four short,
    // as the plate's flare bursts from its seal, and its glare over the face.
    float tl = r.z - (nb - 1.0) * 0.055;
    dia = fract(r.w) * smoothstep(0.0, 0.16, tl) * exp(-max(tl - 0.16, 0.0) / 0.55);
    if (dia > 0.001) {
      vec2 d = p - vec2(cos(r.y), sin(r.y)) * 1.004;
      float dd = dot(d, d);
      float dl = sqrt(dd);
      float rd = 0.045 + px;
      float w = 0.003 + 0.5 * px;
      float star = 0.0;
      for (int m = 0; m < 4; m++) {
        float am = r.y + 0.3927 + float(m) * 0.785398;
        vec2 u = vec2(cos(am), sin(am));
        float along = abs(dot(d, u));
        float across = dot(d, vec2(-u.y, u.x));
        star += exp(-across * across / (w * w)) * exp(-along / (m == 0 || m == 2 ? 0.26 + 5.0 * px : 0.1 + 2.0 * px));
      }
      beads += (BLACKSUN_HOT * (5.0 * exp(-dd / (rd * rd)) + 1.2 * star) + BLACKSUN_WARM * (exp(-dl / 0.14) + 0.3 * exp(-dl / 0.5))) * dia;
    }
  }

  // The engraver's strokes: fine lines along the field, one to each of N
  // turns of the circle where they leave the moon (fewer on a small token,
  // so they still stand apart), each as long as the corona reaches there.
  float N = clamp(floor(BLACKSUN_TAU * 1.1 * tok / 12.0) * 4.0, 36.0, 120.0);
  float fa = (fr - lean) / BLACKSUN_TAU * N;
  float fi = floor(fa + 0.5);
  float dth = (fa - fi) / N * BLACKSUN_TAU;
  float ti = mod(fi, N);
  float thi = fi / N * BLACKSUN_TAU + lean;
  float hi = blacksun_h(ti, 5.0, seed);

  // The streamers: each wide where it leaves the moon and narrowing out
  // along its pointed ray; a stroke within one runs out as far as the
  // streamer reaches at its angle, so each is a fan of strokes, longest
  // down its middle. The one leaning toward us rises from the face.
  float fwd = step(0.5, fract(hs * 29.0));
  float r0 = 0.7 + 0.08 * fract(hs * 41.0);
  float stream = 0.0;
  float front = 0.0;
  float root = 0.0;
  float slen = 0.0;
  float ridge = 0.0;
  float fk = 0.0;
  for (int i = 0; i < 6; i++) {
    float fki = float(i);
    vec4 sm = blacksun_streamer(fki, seed, time, lean, reach);
    float isF = fki == fwd ? 1.0 : 0.0;
    float al = rc - mix(1.0, r0, isF);
    float ac = rc * sin(blacksun_dang(fr, sm.x)) / jf;
    float out1 = max(al, 0.0);
    float sw = 0.05 + (0.12 + 1.4 * sm.z) / (1.0 + 3.0 * out1 / sm.y);
    float gl = exp(-ac * ac / (sw * sw) - out1 / (0.3 * sm.y + 0.03)) * sm.w;
    stream += gl * smoothstep(-0.3, 0.0, al) * (1.0 - isF);
    front += gl * smoothstep(-0.05, 0.08, al) * isF;
    float da = blacksun_dang(thi, sm.x);
    float dk = da / (0.08 + 1.4 * sm.z);
    float fan = max(1.0 - dk * dk, 0.0);
    root += exp(-pow(da / (0.22 + 1.5 * sm.z), 2.0)) * sm.w * (1.0 - isF);
    slen = max(slen, sm.y * fan);
    fk = max(fk, fan * isF);
    ridge = max(ridge, (1.0 - smoothstep(0.0, 1.0, abs(da) * N / BLACKSUN_TAU)) * sm.w);
  }
  // Short strokes between them, in the plate's lengths (long, short,
  // middling, short), out to the sides, few above and below; in two sets
  // swelling and shrinking out of step, each glinting on its own beat.
  float odd = mod(ti, 2.0);
  float pat = mod(ti, 4.0) < 0.5 ? 1.0 : (odd > 0.5 ? 0.55 : 0.78);
  float br = 1.0 - mix(0.2, 0.28, odd) * (0.5 + 0.5 * sin(time * mix(1.366, 1.698, odd) + hi * 6.283));
  float ec = cos(thi);
  ec *= ec;
  float base = 0.24 * ec * ec * reach;
  float flen = max(max(slen * (0.72 + 0.28 * hi), base * pat) * br, 0.01);
  // A streak's burst: where the sun broke through, the strokes shoot out
  // far along the field, lit hot at their tips as they go, and fade.
  float lk = s.z >= 0.0 ? floor(s.z / 2048.0) : -1.0;
  float lp = fract(max(s.z, 0.0));
  float bk = 0.0;
  if (lk > 1.5) {
    float de = blacksun_dang(thi + ax, floor(mod(s.z, 2048.0)) / 1023.0 * BLACKSUN_TAU);
    float spread = exp(-de * de / 0.12);
    flen = max(flen, spread * (0.4 + 1.5 * (1.0 - pow(1.0 - lp, 3.0))) * (0.6 + 0.4 * hi));
    bk = spread * smoothstep(0.0, 0.05, lp) * pow(1.0 - lp, 1.5);
  }
  float fs = fk > 0.02 ? r0 + 0.1 * (1.0 - fk) : 1.03 + 0.05 * hi;
  float fu = rc - fs;
  float fx = 1.0 - fu / flen;
  float fine = blacksun_line(abs(rc * sin(dth)) / jf, 0.3 * px, px) * smoothstep(0.0, 1.2 * px, fu) * step(0.0, fx) * (pow(max(fx, 0.0), 1.3) +2.5 * bk * exp(-pow((fx - 0.1) / 0.12, 2.0)));
  // (Now and then one stroke here or there catches the light, as an engraved line does.)
  float gp = time * 0.3 + hi * 13.0;
  float gq = fract(gp);
  float glint = step(blacksun_h(ti, floor(gp) + 20.0, seed), 0.14) * smoothstep(0.0, 0.06, gq) * exp(-gq / 0.18);
  fine *= (0.55 + 0.45 * hi + 0.3 * ridge) * smoothstep(1.1, 2.4, BLACKSUN_TAU * rc / (N * jf * px)) * (0.75 + 0.25 * sin(time * (0.9 + 0.9 * hi) + hi * 40.0) + 3.0 * glint);

  // The corona's light: the inner corona hugging the moon only where a
  // streamer leaves it, brightest on the side the sun leans toward; and the
  // streamers.
  float rootK = 0.05 + 0.95 * min(root, 1.0);
  float inner = (0.12 * exp(-ub / max(0.035, 0.9 * px)) + 0.3 * exp(-ub / (0.16 * reach + 0.03 + 1.2 * px))) * rootK * pool;
  float cor = (inner + 0.4 * stream * (0.75 + 0.25 * pool)) * (1.0 - 0.6 * dia);
  vec3 ccol = mix(BLACKSUN_WARM, BLACKSUN_PEARL, smoothstep(0.0, 0.12, ub));
  ccol = mix(ccol, BLACKSUN_PALE, smoothstep(0.2, 1.2, ub));
  vec3 back = ccol * cor + BLACKSUN_SKY * exp(-ub / 0.7) * (0.5 + 0.5 * ct * ct) * 0.6;
  back += mix(BLACKSUN_GOLD, BLACKSUN_PEARL, 0.4) * wave * 0.45 * stream;
  // The chromosphere: a thin rose crescent where the sun leans out.
  float chn = 0.5 + 0.3 * sin(tw * 5.0 + time * 0.31 + seed * 9.0) + 0.2 * sin(tw * 11.0 - time * 0.23 + seed * 4.0);
  back += BLACKSUN_ROSE * 0.8 * exp(-ub / max(0.012, 0.5 * px)) * smoothstep(0.98, 1.0, rc) * smoothstep(1.05, 1.7, pool) * chn;

  // Now and then a loop of the field rises on the edge, rose, two arches
  // from the same feet, one under the other, flares and sinks back (one of
  // two places on each token, out toward the sides; higher with a streak).
  // In a list, where it would be a speck, it doesn't.
  if (lk >= 0.0 && lk < 1.5 && tok > 22.0) {
    float hp = blacksun_h(lk, 6.0, seed);
    float ap = ax + lk * PI + (hp < 0.5 ? -1.0 : 1.0) * (0.45 + 0.35 * fract(hp * 3.0));
    float fl = sin(lp * PI);
    vec2 n0 = vec2(cos(ap), sin(ap));
    vec2 d = p - n0 * 0.99;
    float hgt = (0.04 + (0.12 + 0.06 * hp) * (1.0 + 0.5 * power) * smoothstep(0.0, 0.6, lp)) * min(reach, 1.0) + 3.0 * px;
    float wid = 0.06 + 0.03 * fract(hp * 7.0) + 1.5 * px;
    vec3 ar = blacksun_arch(d, n0, wid, hgt);
    vec3 ai = blacksun_arch(d, n0, wid, 0.55 * hgt);
    float ln = blacksun_line(abs(ar.x - 1.0) * ar.y, 0.35 * px, px) + 0.65 * blacksun_line(abs(ai.x - 1.0) * ai.y, 0.3 * px, px);
    back += mix(BLACKSUN_ROSE, BLACKSUN_HOT, 0.4 * fl * fl) * 1.6 * fl * ln * ar.z * smoothstep(22.0, 30.0, tok);
  }

  // In front of the face: the leaning streamer's light, and the corona's
  // catching the face's edge where the sun leans (never over the letter).
  float faceK = smoothstep(0.55, 0.78, rr);
  float limb = exp(-max(1.0 - rr, 0.0) / (0.035 + 1.2 * px));
  vec3 frontL = (BLACKSUN_PEARL * 0.14 * front +BLACKSUN_WARM * 0.14 * limb * smoothstep(1.05, 1.7, pool) * (1.0 + 0.6 * power)) * faceK;
  vec3 strokes = mix(BLACKSUN_GOLD, BLACKSUN_HOT, 0.5 * bk) * fine * (0.8 * (1.0 + 1.6 * lit + 0.6 * power) + 3.0 * wave);
  // (Over a light face its strokes must still show: brighter and paler there.)
  frontL += mix(BLACKSUN_GOLD, BLACKSUN_PEARL, 0.5) * 2.6 * fine * fk;

  vec3 col = back * clear + frontL * (1.0 - clear) + strokes * clear;
  col = col * q.z + beads * (0.4 + 0.6 * min(q.z, 1.0));
  float lum = dot(col, vec3(0.3, 0.5, 0.2));
  return mix(col, lum * BLACKSUN_RUST, 0.65 * chill) * (1.0 - 0.3 * chill);
}
`;
