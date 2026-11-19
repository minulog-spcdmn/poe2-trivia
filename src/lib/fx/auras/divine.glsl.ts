// The divine aura's light in the effects shader (shaders.ts): `aura_divine`,
// given the pixel's place (CSS px from the token's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `divine_...`, so no two auras' names meet.
//
// The Arbiter of Divinity's power, held in an Origin Core. The Core is a
// Precursor seed and egg made one: the Origin Spark ("a burgeoning emergent
// flare of empowered life") sealed in the Origin Cradle. Here the token is
// that Cradle: the Spark's warm light lives behind and inside it, and its
// charge breaks out of it as the Arbiter's yellow divine lightning, white-hot
// in the channel, gold round it, cooling to deep gold as it lingers.
//
// One shape is the Core (mode 0); each bolt is a shape of its own (modes 1-3),
// so several can strike and linger at once.
//
// The Core (mode 0):
//   q: the token's radius with its rim (px), 0, the Core's charge (its light,
//      0-2), a discharge's flash on the face (0-1.5).
//   r: the flash's direction (a unit vector from the centre), chill (0-1: the
//      light gutters toward a cold grey), the Core's own slow phase.
//   s: sputter (0-1: it gutters like a failing arc), how full it is (0-1: how
//      often it crackles) signed by the side it will next break out at, a
//      strike's blast as it lands (0-1.5).
//
// A bolt (mode 1: a discharge from behind the token, out past its rim; 2: one
// that leaps from the face itself, over it; 3: a strike from above, down into
// the Core, ending behind the token's top):
//   q: the token's radius with its rim (px), mode, seconds since it struck,
//      its strength.
//   r: its root (token radii from the centre, +y down), its heading (rad),
//      its length (token radii).
//   s: its seed, how many flickers it lives (1-6), how long its channel glows
//      on after the last (s).
//
// Lightning here is fractal: a channel of straight runs whose kinks come at
// four scales, each half the size of the last, so it is jagged at every size
// as real lightning is. Branches fork off it at sharp angles, and branches off
// those, each thinner and fading to its tip. It lives in flickers: each holds
// one path a few frames, then the channel breaks into a new one (the fine
// kinks always, the coarse path every other time or so), the old path left
// glowing a moment as a ghost. A strike first steps its leader down, then the
// return stroke flashes white down the same path, and after its last flicker
// the channel glows on and cools before it goes out.

export const GLSL = `
// Piecewise-linear noise in -1..1: straight runs between kinks.
float divine_kinks(float x, float sd) {
  float i = floor(x);
  return mix(hash12(vec2(i, sd)), hash12(vec2(i + 1.0, sd)), x - i) * 2.0 - 1.0;
}
// A channel's sideways offset at t (in its lengths): kinks at four scales,
// each about half the last. The two coarse follow cs, the path it holds; the
// two fine follow fs, re-forked at each flicker. (Never past 0.255 of its length.)
float divine_disp(float t, float cs, float fs) {
  return 0.13 * divine_kinks(t * 2.6 + cs * 3.0, cs * 1.7)
       + 0.07 * divine_kinks(t * 5.3 + cs * 2.0, cs * 2.3 + 1.1)
       + 0.036 * divine_kinks(t * 10.7 + fs, fs * 1.3)
       + 0.019 * divine_kinks(t * 21.3 + fs * 0.7, fs * 1.9 + 4.0);
}
// A vertex's offset at t: it leaves its root straight, and a pinned channel is
// drawn in to land on its end.
float divine_vert(float t, vec4 path, float pin) {
  float env = smoothstep(0.0, 0.1, t) * (1.0 - pin * smoothstep(0.7, 1.0, t));
  return divine_disp(t, path.x, path.y) * path.z * env + path.w * sin(PI * t);
}
// The offset of a channel of N runs at t (0-1), on its runs.
float divine_at(float t, float N, vec4 path, float pin) {
  float i = min(floor(t * N), N - 1.0);
  return mix(divine_vert(i / N, path, pin), divine_vert((i + 1.0) / N, path, pin), t * N - i);
}
// From x (along it, across it; in its lengths) to a channel of N runs: the
// distance, and how far along it the nearest point lies. Only the runs round
// x's place along it are looked at.
vec2 divine_chan(vec2 x, float N, vec4 path, float pin) {
  float i0 = clamp(floor(x.x * N), 0.0, N - 1.0) - 2.0;
  float best = 1e9;
  float bt = 0.0;
  vec2 prev = vec2(0.0);
  for (int k = 0; k < 6; k++) {
    float ti = clamp((i0 + float(k)) / N, 0.0, 1.0);
    vec2 pt = vec2(ti, divine_vert(ti, path, pin));
    if (k > 0) {
      vec2 e = pt - prev;
      float h = clamp(dot(x - prev, e) / max(dot(e, e), 1e-8), 0.0, 1.0);
      vec2 w = x - prev - e * h;
      float dd = dot(w, w);
      if (dd < best) {
        best = dd;
        bt = prev.x + e.x * h;
      }
    }
    prev = pt;
  }
  return vec2(sqrt(best), bt);
}
// How far (px) a channel of width w lights: everything below is at nothing there.
float divine_reach(float w) {
  return 5.0 * (2.0 * w + 0.5);
}
// A channel's light dp px from it, w its width (about 1 on a 32 px token): a
// white-hot thread, a yellow sheath round it and a wide gold glow; cool takes
// the gold deeper as it lingers.
vec3 divine_light(float dp, float w, float hot, float glow, float cool) {
  float wc = max(0.45, 0.6 * w);
  float core = exp(-dp * dp / (wc * wc));
  float sheath = exp(-dp / (0.9 * w + 0.35));
  float wr = 2.0 * w + 0.5;
  float wide = 1.0 / (1.0 + dp * dp / (wr * wr)) * (1.0 - smoothstep(1.5 * wr, 5.0 * wr, dp));
  vec3 white = vec3(5.0, 4.7, 3.8);
  vec3 yel = mix(vec3(2.6, 1.95, 0.5), vec3(1.85, 1.15, 0.24), cool);
  vec3 gold = mix(vec3(1.2, 0.75, 0.16), vec3(0.75, 0.42, 0.08), cool);
  // (As it cools the glow draws in to the channel, so a lingering one stays a clean thread, never a haze.)
  return white * core * hot + yel * (core * 0.55 + sheath * 0.5 * (1.0 - 0.35 * cool)) * (0.3 * hot + glow) + gold * wide * 0.2 * (1.0 - 0.7 * cool) * (0.5 * hot + glow);
}
// One channel's light: from o (token radii from the centre) along d for len,
// of N runs on path (its coarse seed, fine seed, jaggedness, bow), at width w
// px, with l its light (hot, glow, cool). Its shape: 0 a discharge giving out
// into the air, 1 a strike coming out of the dark above onto its end, 2 a
// branch fading to its tip. Drawn out as far as grow (0-1.1) along itself. A
// pixel past its reach is skipped: nothing reaches it.
vec3 divine_bolt(vec2 P, vec2 o, vec2 d, float len, float N, vec4 path, float tok, float w, vec3 l, float shape, float grow) {
  vec2 rel = P - o;
  vec2 x = vec2(dot(rel, d), rel.y * d.x - rel.x * d.y) / len;
  float reach = divine_reach(w) / (tok * len);
  if (x.x < -reach || x.x > 1.0 + reach || abs(x.y) > 0.26 * path.z + abs(path.w) + reach) return vec3(0.0);
  float pin = shape > 0.5 && shape < 1.5 ? 1.0 : 0.0;
  vec2 m = divine_chan(x, N, path, pin);
  float t = m.y;
  float along = shape < 0.5 ? smoothstep(1.0, 0.55, t) * (1.0 - 0.3 * t) : shape < 1.5 ? smoothstep(0.0, 0.3, t) : smoothstep(1.0, 0.15, t);
  float lead = smoothstep(grow, grow - 0.06, t);
  float ws = w * (shape < 0.5 ? 1.0 - 0.45 * t : shape < 1.5 ? 0.7 + 0.4 * t : 1.0 - 0.6 * t);
  return divine_light(m.x * len * tok, ws, l.x, l.y, l.z) * along * lead;
}
// The colour drained toward a cold grey, by chill.
vec3 divine_cold(vec3 c, float chill) {
  float l = dot(c, vec3(0.3, 0.5, 0.2));
  return mix(c, vec3(l) * vec3(0.8, 0.86, 1.0) * 0.7, chill);
}

vec3 aura_divine(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.x;
  float mode = q.y;
  float px = 1.0 / tok;
  vec2 P = p / tok;
  float rr = length(P);
  // What the token lets through from behind it: 0 over its face, 1 outside.
  float clear = smoothstep(1.0 - px, 1.0 + px, rr);
  float face = 1.0 - clear;
  // A channel's width on this token: about a pixel on a 32 px one, more on a big one.
  float wsc = sqrt(tok / 19.0);
  vec3 white = vec3(1.95, 1.8, 1.3);
  vec3 col = vec3(0.0);

  if (mode < 0.5) {
    // ---- The Core ----
    float charge = q.z;
    float flash = q.w;
    vec2 fdir = r.xy;
    float chill = r.z;
    float ph = r.w;
    float sputter = s.x;
    float leak = abs(s.y);
    float bside = s.y < 0.0 ? -1.0 : 1.0;
    float blast = s.z;
    float sd = fract(seed * 7.31);
    float breath = 0.86 + 0.14 * sin(ph * 0.83 + sd * 6.0) * sin(ph * 0.31 + sd * 2.0);
    // Guttering: it drops out in uneven stutters, as a failing arc does.
    float stut = hash12(vec2(floor(time * 23.0), sd * 91.0));
    float L = charge * breath * (1.0 - sputter * smoothstep(0.35, 0.6, stut) * 0.8);
    vec3 gold = vec3(1.75, 1.22, 0.32);
    vec3 lc = mix(gold, white, clamp(charge - 0.7, 0.0, 1.0) * 0.6);

    // Behind the token, the Spark's light seeps out round the Cradle, wider than tall.
    float beyond = max(rr - 1.0, 0.0);
    float wide = length(P * vec2(0.6, 1.45));
    // (Strongest at its sides, and uneven round it, the bright places drifting: never a ring.)
    float level = pow(abs(P.x) / max(rr, 1e-3), 1.5);
    float uneven = 0.3 + 1.1 * pnoise(vec2(atan(P.y, P.x) / (2.0 * PI) * 7.0 + ph * 0.23 + sd * 7.0, ph * 0.17 + sd * 3.0), 7.0);
    col += lc * (exp(-beyond / 0.13) * 0.3 * (0.25 + 0.75 * level) * uneven + exp(-wide / 0.48) * 0.2) * L * clear;
    // The Spark itself, seen through the face: a warm light that drifts in
    // it, and the Cradle's shell lit from within at its edge.
    vec2 sp = vec2(0.3 * sin(ph * 0.53 + sd * 4.0), 0.18 * sin(ph * 0.71 + sd * 9.0));
    vec2 ds = P - sp;
    float spark = exp(-dot(ds, ds) / 0.32);
    float shell = exp(-(1.0 - min(rr, 1.0)) / 0.09);
    col += lc * face * (spark * 0.16 + shell * 0.14 * (0.3 + 0.7 * level) * uneven) * L;
    // Its energy is never still: thin veins of gold that writhe through the
    // face and spill out past the rim at its sides, two layers flowing
    // different ways through a field that warps itself.
    {
      float fl = ph * 0.45 + time * 0.12;
      vec2 w = P * 1.9 + vec2(fl * 0.31, -fl * 0.23) + sd * 7.0;
      vec2 warp = vec2(vnoise(w), vnoise(w + 5.2)) - 0.5;
      float n1 = vnoise(P * 3.1 + warp * 1.8 + vec2(-fl * 0.42, fl * 0.29) + sd * 11.0);
      float n2 = vnoise(rot2(P, 0.9) * 5.6 + warp * 2.4 + vec2(fl * 0.55, fl * 0.2) + sd * 3.0);
      float v1 = pow(1.0 - abs(2.0 * n1 - 1.0), 9.0);
      float v2 = pow(1.0 - abs(2.0 * n2 - 1.0), 14.0);
      // (A vein's shimmer: it brightens and fades along itself.)
      float sh = 0.55 + 0.45 * vnoise(P * 4.0 + vec2(time * 1.3, -time * 0.9) + sd);
      float energy = (v1 * 0.85 + v2 * 0.55) * sh;
      float inside = face * (0.35 + 0.65 * smoothstep(0.15, 1.0, rr)) * (0.6 + 0.6 * spark);
      float spill = clear * exp(-beyond / 0.15) * level * level;
      col += mix(gold, white, 0.25) * energy * (inside * 0.2 + spill * 0.7) * L;
    }
    // A discharge's flash: the face lit from the side it left by, and the rim splashed there.
    float toward = max(dot(P / max(rr, 1e-3), fdir), 0.0);
    col += white * flash * (face * (0.06 + 0.2 * toward * rr) + clear * exp(-beyond / 0.16) * toward * toward * 0.45);
    // A strike landing: the Core blazes up, its face lit hardest at the top
    // where the strike came in, and the light bursts out round it, wider than tall.
    {
      vec2 top = P - vec2(0.0, -0.95);
      float burst = exp(-length(P * vec2(0.55, 1.25)) / 0.42);
      col += white * blast * (face * (0.04 + 0.2 * exp(-dot(top, top) / 0.4)) + clear * (exp(-beyond / 0.2) * (0.25 + 0.3 * level) * uneven * 0.6 + burst * 0.3));
    }

    // Crackle: the charge breaks out of the rim in tiny arcs, each a few
    // frames of white-hot discharge that re-forks as it flickers and is gone.
    // They come oftener the fuller the Core is, and gather at the side it is
    // about to break out at, so a discharge is felt before it comes. None
    // runs round the rim: each leaps straight off it.
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float per = 0.28 + 0.7 * hash12(vec2(fi, sd * 5.0 + 1.0));
      float tt = time / per + hash12(vec2(fi + 3.0, sd * 5.0));
      float cell = floor(tt);
      float u = fract(tt) * per;
      float h = hash12(vec2(cell + 0.5, fi + sd * 11.0));
      float h2 = hash12(vec2(cell + 7.5, fi + sd * 13.0));
      float h3 = hash12(vec2(cell + 3.5, fi + sd * 17.0));
      float life = 0.05 + 0.09 * h2;
      if (h > 0.08 + 0.7 * leak * leak || u > life + 0.08) continue;
      // Mostly at the sides, now and then high or low on them; at the side
      // it will break out at, more often the fuller it is.
      float side = fract(h3 * 3.7) < 0.2 + 0.65 * leak ? bside : (h2 < 0.5 ? -1.0 : 1.0);
      float a = (side > 0.0 ? 0.0 : PI) + (fract(h3 * 2.0) - 0.5) * 1.9;
      vec2 dir = vec2(cos(a), sin(a));
      vec2 o = dir * 0.97;
      vec2 bd = rot2(dir, (fract(h * 7.3) - 0.5) * 1.4);
      float bl = 0.16 + 0.26 * fract(h * 13.1);
      // Its flickers: lit or dark frame by frame, re-forked every few.
      float fk = floor(u / (0.02 + 0.025 * h2));
      float on = step(0.22, hash12(vec2(floor(u * 60.0), cell + fi * 3.0)));
      float hot = u < life ? on * (0.55 + 0.8 * hash12(vec2(fk, cell + fi))) * smoothstep(life, life * 0.35, u) : 0.0;
      float gl = exp(-max(u - life * 0.5, 0.0) / 0.03) * smoothstep(life + 0.08, life, u);
      vec4 path = vec4(cell * 1.7 + fi * 7.0, cell * 3.1 + fk * 2.3 + fi, 1.5, 0.0);
      vec3 l = vec3(hot, gl * 0.7, 0.15);
      float w = 0.55 * wsc;
      vec3 c = divine_bolt(P, o, bd, bl, 6.0, path, tok, w, l, 2.0, 2.0);
      // Half of them fork once.
      if (fract(h * 29.7) < 0.5) {
        float tj = 0.35 + 0.25 * h3;
        vec2 bn = vec2(-bd.y, bd.x);
        vec2 bp = o + bd * (tj * bl) + bn * (divine_at(tj, 6.0, path, 0.0) * bl);
        c += divine_bolt(P, bp, rot2(bd, (h2 < 0.5 ? -1.0 : 1.0) * (0.5 + 0.4 * h)), bl * 0.5, 4.0, path + vec4(3.3, 1.9, 0.0, 0.0), tok, w * 0.7, l * vec3(0.6, 0.5, 1.0), 2.0, 2.0);
      }
      // Where it leaves the rim, a white-hot point.
      vec2 dk = (P - o) * tok / (1.3 * wsc);
      c += vec3(4.0, 3.7, 2.8) * exp(-dot(dk, dk)) * hot * 0.7;
      col += c * mix(0.45, 1.0, clear) * min(L + 0.2, 1.2);
    }
    return divine_cold(col, chill);
  }

  // ---- A bolt ----
  float age = q.z;
  float str = q.w;
  vec2 O = r.xy;
  float ang = r.z;
  float len = r.w;
  float bs = s.x;
  float nE = s.y;
  float afterT = s.z;
  bool strike = mode > 2.5;
  bool front = mode > 1.5 && mode < 2.5;

  // Its life in flickers, each of its own length: which one is burning now
  // (e), how long since it began (u), and when the last is over (ts).
  float e = 0.0;
  float u = age;
  float ts = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= nE) break;
    float dur = strike && i == 0 ? 0.06 : 0.035 + 0.075 * hash12(vec2(float(i) + 1.0, bs * 13.0));
    if (age >= ts) {
      e = float(i);
      u = age - ts;
    }
    ts += dur;
  }
  bool live = age < ts;
  float since = max(age - ts, 0.0);
  // Each flicker flashes as it comes and burns unevenly frame by frame; now
  // and then the channel goes dark a frame before it breaks into a new path.
  float frame = 0.75 + 0.5 * hash12(vec2(floor(age * 60.0), bs * 3.0));
  float lvl = 0.7 + 0.5 * hash12(vec2(e + 3.0, bs * 7.0));
  float gap = e > 0.5 && u < 0.017 && hash12(vec2(e + 9.0, bs * 5.0)) < 0.45 ? 0.1 : 1.0;
  float hot = lvl * frame * gap * (0.55 + 0.9 * exp(-u / 0.022));
  if (strike && e < 0.5) hot = 0.3 * frame;
  if (strike && e > 0.5 && e < 1.5) hot *= 1.6;
  if (!live) hot = 0.7 * exp(-since / 0.035);
  // After the last, the channel glows on and cools, and is out by afterT * 4.
  float glow = live ? 1.0 : exp(-since / afterT) * smoothstep(afterT * 4.0, afterT * 2.0, since);
  float cool = live ? 0.0 : smoothstep(0.0, afterT * 2.0, since);
  // The leader: a strike's steps down in jerks; a discharge's is drawn out at once.
  float grow = strike ? floor(age / 0.009) * 0.009 / 0.055 : age / 0.035;
  grow = min(grow, 1.0) * 1.1;

  // Its path: the coarse one held a flicker or two (a strike's held, since
  // its return strokes come down the leader's path), the fine kinks re-forked
  // each flicker.
  float hc = hash12(vec2(bs, 2.2));
  float cI = strike ? floor(max(e - 1.0, 0.0) * 0.4 + 0.3 * hc) : floor(e * 0.55 + hc);
  float fI = strike ? max(e - 1.0, 0.0) : e;
  float cs = bs + 5.3 * cI;
  vec4 path = vec4(cs, bs * 7.0 + fI * 3.17, 0.8 + 0.5 * hash12(vec2(cs, 9.1)), (hash12(vec2(cs, 4.4)) - 0.5) * 0.2);
  float a = strike ? ang : ang + (hash12(vec2(cs, 6.6)) - 0.5) * 0.16;
  vec2 d = vec2(cos(a), sin(a));
  vec2 nrm = vec2(-d.y, d.x);
  // Behind the token a bolt is hidden by it; over the face it lies lighter, so the letter reads.
  float seen = front ? mix(0.5, 1.0, clear) : clear;
  float w = wsc * (strike ? 1.35 : 1.0) * sqrt(str);
  float N = strike ? 24.0 : 18.0;
  float shape = strike ? 1.0 : 0.0;

  vec3 bc = divine_bolt(P, O, d, len, N, path, tok, w, vec3(hot, glow, cool), shape, grow);
  // The path it broke from glows on a moment as a ghost.
  if (live && e > 0.5 && u < 0.1 && cI + fI > 0.5) {
    float pcI = strike ? floor(max(e - 2.0, 0.0) * 0.4 + 0.3 * hc) : floor((e - 1.0) * 0.55 + hc);
    float pcs = bs + 5.3 * pcI;
    vec4 pp = vec4(pcs, bs * 7.0 + (fI - 1.0) * 3.17, 0.8 + 0.5 * hash12(vec2(pcs, 9.1)), (hash12(vec2(pcs, 4.4)) - 0.5) * 0.2);
    float pa = strike ? ang : ang + (hash12(vec2(pcs, 6.6)) - 0.5) * 0.16;
    bc += divine_bolt(P, O, vec2(cos(pa), sin(pa)), len, N, pp, tok, w * 0.8, vec3(0.0, 0.5 * exp(-u / 0.03), 0.35), shape, 1.1);
  }
  // Its branches fork off it at sharp angles, alternating sides, held while
  // the path is and now and then dropping out a flicker; each is thinner,
  // fades to its tip, and may fork again.
  float nb = strike ? 5.0 : len < 1.2 ? 3.0 : 4.0;
  for (int j = 0; j < 5; j++) {
    float fj = float(j);
    if (fj >= nb) break;
    float h1 = hash12(vec2(fj + 1.0 + cI * 3.0, bs * 17.0));
    float h2 = hash12(vec2(fj + 5.0 + cI * 3.0, bs * 17.0));
    float h3 = hash12(vec2(fj + 11.0 + cI * 3.0, bs * 19.0));
    if (h1 < 0.2 || hash12(vec2(fj + e * 7.0, bs * 31.0)) < 0.18) continue;
    float tj = (strike ? 0.25 : 0.1) + 0.65 * (fj + h3) / nb;
    vec2 bp = O + d * (tj * len) + nrm * (divine_at(tj, N, path, shape) * len);
    float sg = (mod(fj, 2.0) < 0.5 ? 1.0 : -1.0) * (fract(h2 * 7.1) < 0.25 ? -1.0 : 1.0);
    vec2 bd = rot2(d, sg * (0.3 + 0.55 * h2));
    float bl = len * (0.16 + 0.28 * h1) * (1.0 - 0.45 * tj);
    vec4 bpath = vec4(cs * 1.3 + fj * 3.3, path.y + fj * 1.9, 1.3, 0.0);
    float bgrow = (grow - tj) * len / bl;
    vec3 bl3 = vec3(hot * 0.6, glow * 0.55, min(cool + 0.2, 1.0));
    bc += divine_bolt(P, bp, bd, bl, 10.0, bpath, tok, w * 0.62, bl3, 2.0, bgrow);
    // A fork off the branch.
    if (h3 > 0.4) {
      float tk = 0.3 + 0.3 * h1;
      vec2 bn = vec2(-bd.y, bd.x);
      vec2 kp = bp + bd * (tk * bl) + bn * (divine_at(tk, 10.0, bpath, 0.0) * bl);
      float kl = bl * (0.35 + 0.25 * h2);
      bc += divine_bolt(P, kp, rot2(bd, -sg * (0.35 + 0.5 * h3)), kl, 6.0, bpath + vec4(2.1, 1.3, 0.1, 0.0), tok, w * 0.45, bl3 * vec3(0.6, 0.6, 1.0), 2.0, (bgrow - tk) * bl / kl);
    }
  }
  col += bc * seen;

  // The light it throws where it touches the token: the face lit near it and
  // the rim caught there, and a white-hot knot where it breaks out.
  float touch = hot * 0.55 + glow * 0.2;
  vec3 warm = vec3(2.2, 1.75, 0.7);
  float shell = exp(-(1.0 - min(rr, 1.0)) / 0.08);
  if (strike) {
    vec2 E = O + d * len;
    vec2 de = P - vec2(E.x, -1.0);
    col += warm * touch * face * exp(-dot(de, de) / 0.5) * (0.2 + 0.6 * shell) * float(grow >= 1.0);
    // Where it lands, the light bursts round the top of the token, wider than tall.
    vec2 db = (P - E) * vec2(0.75, 1.35);
    col += vec3(2.4, 1.85, 0.6) * exp(-dot(db, db) / 0.14) * (hot * 0.45 + glow * 0.25) * clear * float(grow >= 1.0);
  } else {
    vec2 X = O;
    if (!front) {
      float b = dot(O, d);
      X = O + d * (-b + sqrt(max(b * b - dot(O, O) + 1.0, 0.0)));
    }
    vec2 dx = P - X;
    col += warm * touch * face * exp(-dot(dx, dx) / (front ? 0.3 : 0.2)) * (front ? 0.25 : 0.1 + 0.45 * shell) * min(grow, 1.0);
    vec2 dk = dx * tok / (1.6 * wsc);
    col += vec3(4.5, 4.2, 3.3) * exp(-dot(dk, dk)) * hot * 0.6 * (front ? 1.0 : mix(0.5, 1.0, clear));
  }
  return col * str;
}
`;
