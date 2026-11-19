// The breach aura's light in the effects shader (shaders.ts): `aura_breach`,
// given the pixel's place (CSS px from the token's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `breach_...`, so no two auras' names meet.
//
// A breach lies open on the ground under the token, as one does round a
// player who has touched the hand: a torn ring of violet light seen tilted,
// its far side behind the token, purple swirling in the dark within. Out of
// it rises one of Xesht's hands and holds the token from behind: a long
// clawed hand of dark chitin, its palm behind the token, its fingers rising
// past the rim and curling over it, their claws and the thumb's coming
// round in front to press on the face. The breach's light seeps out from
// behind the token, so the hand stands dark against it, lit from below by
// the breach, along its edges by the glow, and through its joints; it
// gathers on the face under the claws. On a streak a second hand claws up
// out of the breach beside it.
//
// q: the token's radius with its rim (px, the unit everything is measured
//   in: U), signed by the side the hand holds from; how far the breach is
//   open (1 at rest); its energy (0 calm, to 2); and, in one, the second
//   hand (0-1, in 255ths, times 4) and how far the hand has risen (1 up, 0
//   sunk into the breach; plus 1, so 0 to 4).
// r: each finger's grip, index to little (0 open, 1 holding, over 1
//   squeezing).
// s: the thumb's grip; in one, how unsteady the light is (0-1, in 63rds)
//   and a pulse round the breach's edge (its fraction, 0-1 as it runs; 0.998
//   and over for none); how far the hand has shifted round the token (rad).

export const GLSL = `
float breach_line(float d, float w) {
  return exp(-d * d / (w * w));
}
// The hand, seen from its palm's side, the ball held in front of the palm:
// the palm's centre, and the wrist (in the ball's radii, +y down, for a hand
// whose thumb is to the left).
const vec2 BREACH_PALM = vec2(-0.08, 0.3);
const vec2 BREACH_WRIST = vec2(0.02, 0.95);
// The thumb and fingers: where each knuckle sits (from the palm's centre)
// and which way the finger points (rad, +y down), its length and girth.
const vec2 BREACH_KNUCKLE[5] = vec2[5](vec2(-0.5, 0.18), vec2(-0.36, -0.68), vec2(-0.08, -0.82), vec2(0.2, -0.76), vec2(0.43, -0.6));
const float BREACH_ANG[5] = float[5](-2.45, -1.86, -1.62, -1.36, -1.1);
const float BREACH_LEN[5] = float[5](0.8, 0.94, 1.05, 0.97, 0.78);
const float BREACH_GIRTH[5] = float[5](1.25, 1.0, 1.02, 0.96, 0.86);
// How each finger curls (seen a little from the side, a curling finger bends
// one way: the thumb toward the fingers, the fingers toward the little one).
const float BREACH_CURL[5] = float[5](1.0, 1.0, 0.8, 0.62, 0.45);
// Each bone's length (the ball's radii): the finger's three and the claw.
const float BREACH_BONE[4] = float[4](0.6, 0.4, 0.3, 0.36);
// Each bone's girth at its joints (the ball's radii), and the claw's halfway.
const float BREACH_THICK[6] = float[6](0.11, 0.092, 0.08, 0.066, 0.04, 0.006);
// As the hand grips, each bone turns to the way round the ball's edge
// (clockwise, the way the fingers curl), and from it by this much (rad)
// inward: the middle bone still rising, the last coming over the rim, the
// claw pressing onto the face; and how much each turns so (at a grip of 1).
const float BREACH_HOOK[4] = float[4](0.0, -0.3, 1.35, 1.6);
const float BREACH_AIM[4] = float[4](0.0, 0.8, 1.0, 1.0);

// A point on the hand: its distance (below 0 inside), the way out from the
// bone's axis (n), how far along its finger (s, the ball's radii from the
// knuckle), the bone's girth there (r), how much of it is claw, how much of
// it is in front of the ball, and the light in its joints. Nearby bones are
// blended (breach_join), so a joint is one smooth surface: no seam where
// two bones meet, and nothing to flicker between them.
struct BreachHit {
  float d;
  vec2 n;
  float s;
  float r;
  float claw;
  float front;
  float seam;
};
BreachHit breach_none() {
  return BreachHit(1e3, vec2(0.0), 0.0, 1.0, 0.0, 0.0, 0.0);
}

// The tapered bone from a (girth ra) to b (rb), pinched at its middle so its
// joints stand out; s0, how far along the finger a is. Its joints glow
// (seamA at a, seamB at b) where the breach's light shows through them.
BreachHit breach_bone(vec2 p, vec2 a, vec2 b, float ra, float rb, float pinch, float s0, float claw, float seamA, float seamB) {
  vec2 ba = b - a;
  vec2 pa = p - a;
  float l2 = max(dot(ba, ba), 1e-6);
  float t = clamp(dot(pa, ba) / l2, 0.0, 1.0);
  vec2 off = pa - ba * t;
  float rad = max(mix(ra, rb, t) * (1.0 - pinch * sin(PI * t)), 1e-5);
  vec2 da = (p - a) / (ra * 0.6);
  vec2 db = (p - b) / max(rb * 0.6, 1e-4);
  float seam = max(seamA * exp(-dot(da, da)), seamB * exp(-dot(db, db)));
  return BreachHit(length(off) - rad, off, s0 + t * sqrt(l2), rad, claw, 0.0, seam);
}
// Blends b into the hit with a smooth minimum of width k: the two surfaces
// flow into one, and everything else about them is mixed in the same measure.
BreachHit breach_join(BreachHit a, BreachHit b, float k) {
  float h = clamp(0.5 + 0.5 * (a.d - b.d) / k, 0.0, 1.0);
  return BreachHit(
    mix(a.d, b.d, h) - k * h * (1.0 - h),
    mix(a.n, b.n, h),
    mix(a.s, b.s, h),
    mix(a.r, b.r, h),
    mix(a.claw, b.claw, h),
    mix(a.front, b.front, h),
    mix(a.seam, b.seam, h));
}
// The turn of an angle toward another, the short way round.
float breach_toward(float from, float to) {
  float d = to - from;
  return atan(sin(d), cos(d));
}

// One hand, in its own frame (v, in the ball's radii; the wrist to the lower
// left), holding the ball (centre C, radius R) from behind: its fingers rise
// past the rim and their last joints and claws come over it onto the face,
// in front. With allBack it is all behind. grips: each finger's grip (0
// open, 1 holding, more squeezing), the thumb's in thumb; each moves on its
// own (breach.ts). aimK: how hard it reaches for the ball. contact: the
// light where its claws press on the face.
void breach_hand(vec2 v, vec2 C, float R, vec4 grips, float thumb, float allBack, float girth, float aimK, inout BreachHit hand, inout float contact) {
  if (dot(v, v) > 9.0) return;
  // The bones pinched at their middles, their joints standing out; not on a
  // small token, where it would string them into beads.
  float pinch = 0.1 * smoothstep(1.3, 1.05, girth);
  vec2 P = BREACH_PALM;
  vec2 W = P + BREACH_WRIST * 0.6;
  // The heel of the hand and the wrist, going down into the breach.
  hand = breach_join(hand, breach_bone(v, W, P + BREACH_WRIST + vec2(0.06, 0.8), 0.3, 0.25, 0.0, 0.0, 0.0, 0.0, 0.0), 0.08);
  for (int f = 0; f < 5; f++) {
    float L = BREACH_LEN[f];
    float G = BREACH_GIRTH[f];
    vec2 prev = P + BREACH_KNUCKLE[f];
    // The palm between the wrist and this knuckle.
    hand = breach_join(hand, breach_bone(v, W, prev, 0.3, 0.14 * G * girth, 0.0, 0.0, 0.0, 0.0, 0.0), 0.1);
    // (A finger far from the pixel can't reach it, nor its claw's light: its
    // bones are skipped.)
    if (length(v - prev) > 1.7 * L + 0.6) continue;
    float g = f == 0 ? thumb : grips[f - 1];
    float press = max(g - 1.0, 0.0);
    // Each joint bends it further (more as it grips), and turns it round
    // the ball's edge and over it, its last bones shortening as they curl
    // toward the eye.
    float a = BREACH_ANG[f];
    float s = 0.0;
    // Where the finger passes the ball's edge (it goes in front from there).
    float past = 1e3;
    float rp = length(prev - C);
    BreachHit fh = breach_none();
    for (int j = 0; j < 4; j++) {
      float bend = j == 0 ? 0.0 : j == 1 ? 0.22 + 0.42 * g : j == 2 ? 0.3 + 0.5 * g : 0.55 + 0.6 * g;
      a += BREACH_CURL[f] * bend;
      vec2 pc = prev - C;
      float want = atan(pc.x, -pc.y) + BREACH_HOOK[j] * (1.0 + 0.6 * max(g - 1.0, 0.0));
      a += min(1.0, BREACH_AIM[j] * max(g, 0.0) * aimK) * breach_toward(a, want);
      float len = BREACH_BONE[j] * L * (j == 1 ? 1.0 - 0.22 * g : j == 2 ? 1.0 - 0.3 * g : 1.0);
      if (j < 3) {
        vec2 at = prev + len * vec2(cos(a), sin(a));
        float ra = BREACH_THICK[j] * G * girth;
        float rb = BREACH_THICK[j + 1] * G * girth;
        BreachHit b = breach_bone(v, prev, at, ra, rb, pinch, s, 0.0, j == 0 ? 0.5 : 1.0, 1.0);
        fh = breach_join(fh, b, 0.35 * rb);
        float ra2 = length(at - C);
        if (past > 999.0 && ra2 > R) past = s + len * clamp((R - rp) / max(ra2 - rp, 1e-4), 0.0, 1.0);
        rp = ra2;
        prev = at;
        s += len;
      } else {
        // The claw, in two halves, hooking as it goes.
        vec2 mid = prev + 0.5 * len * vec2(cos(a), sin(a));
        float a2 = a + 0.3 + 0.15 * BREACH_CURL[f];
        vec2 tip = mid + 0.5 * len * vec2(cos(a2), sin(a2));
        float r0 = BREACH_THICK[3] * G * girth;
        float r1 = BREACH_THICK[4] * G * girth;
        float r2 = BREACH_THICK[5] * G * girth;
        fh = breach_join(fh, breach_bone(v, prev, mid, r0, r1, 0.0, s, 1.0, 0.0, 0.0), 0.4 * r0);
        fh = breach_join(fh, breach_bone(v, mid, tip, r1, r2, 0.0, s + 0.5 * len, 1.0, 0.0, 0.0), 0.4 * r1);
        // Where a claw rests on the face, it presses on it and lights it.
        if (allBack < 0.5) {
          float onFace = 1.0 - smoothstep(0.93 * R, 1.03 * R, length(tip - C));
          vec2 dt = (v - tip) / 0.2;
          vec2 dc = (v - tip) / 0.06;
          contact += (exp(-dot(dt, dt)) + 1.5 * exp(-dot(dc, dc))) * onFace * smoothstep(0.55, 0.95, g) * (0.6 + 1.6 * press);
        }
      }
    }
    // In front of the ball once past its edge (behind it below that); the
    // second hand, all behind.
    fh.front = allBack > 0.5 ? 0.0 : smoothstep(past, past + 0.1, fh.s);
    // Into the hand: smoothly at the knuckle, barely at all further up, so
    // fingers lying close don't web together.
    hand = breach_join(hand, fh, mix(0.07, 0.012, smoothstep(0.0, 0.3, fh.s)));
  }
}

// The light on the hand at h: dark chitin, translucent, lit from below by
// the breach and along its edges by the glow behind the token, the breach's
// light burning through its joints; a claw darker and glossier. low: how
// near the breach it is (0-1); glow: the glow behind it; over: how much of
// it lies over the face, where light can't darken it, so the breach's light
// glows through its flesh instead.
vec3 breach_shade(BreachHit h, float low, float glow, float over, vec3 MAG, vec3 VIOLET, vec3 PINK, float detail) {
  float claw = h.claw;
  // (The way out from the bone's axis, as far as the pixel lies across it:
  // blended, it stays smooth where bones meet, never flipping.)
  vec2 n2 = h.n / h.r;
  n2 /= max(length(n2), 1.0);
  float x = length(n2);
  vec3 N = vec3(n2, sqrt(max(1.0 - x * x, 0.0)));
  vec3 L1 = normalize(vec3(0.15, 1.0, 0.55));
  float diff = max(dot(N, L1), 0.0);
  float spec = pow(max(dot(N, normalize(L1 + vec3(0.0, 0.0, 1.0))), 0.0), mix(14.0, 30.0, claw));
  float rim = pow(1.0 - N.z, 2.5);
  vec3 body = vec3(0.014, 0.003, 0.024) + MAG * (0.03 + 0.18 * diff * low) * mix(1.0, 0.45, claw);
  // (Its edges catch the breach's light even out where the glow has faded,
  // so the fingers read against the dark; stronger on a small token.)
  glow += mix(0.5, 0.3, detail);
  // The joints, where the breach's light shows through; deep in the bone,
  // not on its edge. (Only on a token large enough to show them: smaller,
  // they'd read as beads.)
  float seam = h.seam * (1.0 - 0.8 * x * x) * detail * (1.0 - claw);
  vec3 through = MAG * 0.1 * (0.3 + 0.7 * N.z) * over;
  return body + through + PINK * spec * (0.08 + 0.5 * low) * mix(1.0, 1.6, claw) + VIOLET * rim * (0.1 + 1.0 * glow) + MAG * seam * 0.22;
}

vec3 aura_breach(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float U = max(abs(q.x), 1.0);
  float side = q.x < 0.0 ? -1.0 : 1.0;
  float open = q.y;
  float energy = q.z;
  float k2 = floor(q.w / 4.0);
  float show2 = k2 / 255.0;
  float rise = q.w - 4.0 * k2 - 1.0;
  vec4 grips = r;
  float thumb = s.x;
  float pulse = fract(s.y) >= 0.998 ? 1.0 : fract(s.y);
  float falter = floor(s.y) / 63.0;
  float shift = s.z;

  const vec3 DEEP = vec3(0.16, 0.02, 0.32);
  const vec3 VIOLET = vec3(0.62, 0.12, 1.25);
  const vec3 MAG = vec3(1.3, 0.22, 1.25);
  const vec3 PINK = vec3(2.1, 0.85, 1.9);

  vec2 u = p / U;
  // One CSS px in the token's radii.
  float px = 1.0 / U;
  float rr = length(u);
  float th = atan(u.y, u.x);
  // What the token lets through from behind it: 0 over it, 1 outside.
  float clear = smoothstep(1.0 - 0.7 * px, 1.0 + 0.7 * px, rr);
  // An unsteady breach's light falters and stutters.
  float stut = 1.0 - falter * (0.35 + 0.35 * step(0.5, hash12(vec2(floor(time * 14.0), seed))));

  // The breach's light seeping out from behind the token, uneven where the
  // fingers hold it in, breathing slowly.
  float beyond = max(rr - 1.0, 0.0);
  float breathe = 0.86 + 0.14 * sin(time * 0.55 + seed * 6.0);
  float uneven = 0.7 + 0.6 * pnoise(vec2((th / (2.0 * PI) + 0.5) * 7.0 + time * 0.04, seed * 9.0), 7.0);
  float near = exp(-beyond / 0.17);
  float wide = exp(-beyond / 0.55);
  float glowK = (0.36 * near + 0.12 * wide) * uneven * breathe * (1.0 + 0.45 * energy);
  vec3 col = mix(MAG, VIOLET, smoothstep(0.0, 0.4, beyond)) * glowK * clear;

  // The breach on the ground, seen tilted: its centre a little in front of
  // the token's foot, so its far half lies behind the token (and hides there)
  // and its near half below it.
  vec2 c = vec2(0.0, 1.1);
  vec2 ax = vec2(1.3, 0.3) * open;
  vec2 e = (u - c) / ax;
  float rho = length(e);
  float phi = atan(e.y, e.x);
  float pu = phi / (2.0 * PI) + 0.5;
  // Its edge wavers slowly.
  float wav = (pnoise(vec2(pu * 9.0 + time * 0.07, seed * 3.0), 9.0) - 0.5) * 0.07;
  float rw = rho + wav;
  vec2 grad = vec2(e.x / ax.x, e.y / ax.y) / max(rho, 1e-4);
  float dpx = (rw - 1.0) / max(length(grad), 1e-4) * U;
  // A pulse running round its edge from the front both ways.
  float pk = pulse < 1.0 ? (1.0 - pulse) : 0.0;
  float pd = abs(mod(phi - PI * 0.5 + PI, 2.0 * PI) - PI);
  float pband = pk > 0.0 ? exp(-pow((pd - pulse * PI) / 0.35, 2.0)) * pk : 0.0;
  // Currents of brighter light running round the edge, slowly.
  float cur = pnoise(vec2(pu * 12.0 - time * 0.22, seed * 5.0), 12.0);
  float cur2 = pnoise(vec2(pu * 7.0 + time * 0.15, seed * 7.0 + 2.0), 7.0);
  // (Torn here and there, where its light gutters low.)
  float torn = smoothstep(0.25, 0.65, pnoise(vec2(pu * 23.0 + time * 0.1, seed * 2.0 + 9.0), 23.0));
  float edgeK = (0.12 + 1.5 * cur * cur * cur2 * (0.35 + 0.65 * torn) + 0.5 * energy + 2.0 * pband) * stut;
  float ew = 0.45 + 0.012 * U;
  vec3 ground = (PINK * 0.26 * breach_line(dpx, ew) * (0.4 + 0.6 * torn) + MAG * 0.3 * breach_line(dpx, ew * 3.2)) * edgeK;
  // Its light on the ground round it, and on the dark within.
  float outer = dpx > 0.0 ? exp(-dpx / (0.1 * U + 1.0)) : 0.0;
  ground += MAG * outer * 0.16 * edgeK;
  float inside = 1.0 - smoothstep(-1.0, 0.5, dpx);
  if (inside > 0.0) {
    // The other place showing through: dark, with slow purple swirls
    // turning in it, tighter toward its heart, and a faint light at its rim.
    float tw = time * 0.09 + seed * 4.0 + 2.2 * (1.0 - rho);
    vec2 sw = rot2(e, tw) * vec2(2.2, 2.2);
    float n = fbm(sw + seed * 11.0);
    float swirl = smoothstep(0.5, 0.85, n);
    ground += (DEEP * (0.25 + 0.6 * swirl) + VIOLET * 0.32 * swirl * swirl + MAG * 0.12 * smoothstep(0.55, 1.0, rho)) * inside * (0.85 + 0.4 * energy) * stut;
  }
  col *= 1.0 - 0.7 * inside;
  col += ground * clear;

  // The breach below lights the token's own foot, faintly.
  col += MAG * 0.07 * smoothstep(0.35, 1.0, u.y) * (1.0 - clear) * (0.8 + 0.4 * energy + pk) * stut;

  // The hands. The one holding the token: in its frame, mirrored to the
  // side it holds from, sunk by how far it hasn't risen.
  BreachHit hold = breach_none();
  BreachHit other = breach_none();
  float contact = 0.0;
  float hsHold = 1.12;
  // (On a small token the hand's bones are drawn thicker, so they still read.)
  float girth = mix(1.4, 1.0, smoothstep(14.0, 40.0, U));
  // How much fine detail the hand shows: its joints' seams, from 36 px across.
  float detail = smoothstep(19.0, 40.0, U);
  // (One loop for both hands, its count unknown till it runs, so the hand
  // is built into the program once: unrolled, it took twice as long to build.)
  int hands = show2 > 0.01 ? 2 : 1;
  for (int hi = 0; hi < hands; hi++) {
    // The first, a little larger than the token so its fingers stand clear
    // of it, sunk by how far it hasn't risen. The second, clawing up out of
    // the breach beside the token on the other side: smaller, half open,
    // grasping at nothing, all of it behind the token.
    float hs = hi == 0 ? hsHold : 0.7;
    vec2 o = hi == 0 ? vec2(0.0, (1.0 - rise) * 0.95) : vec2(side * 1.18, 0.36 + (1.0 - show2) * 0.9);
    // (The holding hand shifts round the token now and then: shift.)
    float turn = hi == 0 ? 0.18 * (1.0 - rise) + shift : -0.35;
    float sd = hi == 0 ? side : -side;
    vec2 v = rot2((u - o) * vec2(sd, 1.0), turn) / hs;
    // The token in the hand's frame.
    vec2 C = rot2(-o * vec2(sd, 1.0), turn) / hs;
    float g2 = 0.42 + 0.08 * sin(time * 0.7 + seed);
    BreachHit h = breach_none();
    breach_hand(v, C, 1.0 / hs, hi == 0 ? grips : vec4(g2, g2 + 0.05, g2 - 0.04, g2 + 0.02), hi == 0 ? thumb : g2, float(hi), girth, hi == 0 ? 1.0 : 0.25, h, contact);
    h.d *= hs;
    if (hi == 0) hold = h;
    else other = h;
  }
  // Below the breach's middle a hand is under the ground: gone.
  float above = 1.0 - smoothstep(c.y - 0.04, c.y + 0.08, u.y);
  float aa = 0.8 * px;
  float low = exp(-max(c.y - u.y, 0.0) / 0.8);
  float glowHere = exp(-beyond / 0.3) * (1.0 + 0.4 * energy);
  // Where the claws press on the face, the breach's light gathers under
  // them, brighter as the hand squeezes.
  col += (MAG * 0.17 + PINK * 0.035 * min(contact, 2.0)) * min(contact, 2.5) * (1.0 - clear) * above * (0.8 + 0.3 * energy) * stut;
  // Behind the token: the second hand, standing dark against the light
  // behind it.
  float cov2 = (1.0 - smoothstep(-aa, aa, other.d)) * clear * above * show2;
  col = col * (1.0 - cov2) + breach_shade(other, low, glowHere * 0.7, 0.0, MAG, VIOLET, PINK, detail) * cov2 * stut;
  // The holding hand: behind the token up to the rim, then over it in front
  // where its fingers come round onto the face.
  float vis = mix(clear, 1.0, hold.front);
  float cov = (1.0 - smoothstep(-aa, aa, hold.d)) * above * vis;
  // (Over the face, its dark flesh the page's, the breach's light lines its
  // edges so it reads as the same flesh as behind.)
  col = col * (1.0 - cov) + breach_shade(hold, low, mix(0.6, glowHere, clear), (1.0 - clear) * hold.front, MAG, VIOLET, PINK, detail) * cov * stut;
  return col;
}
`;
