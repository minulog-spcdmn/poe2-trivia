// The shadow aura in the effects' shaders (shaders.ts): its light,
// `aura_shadow`, added over the page, and its shade, `shade_shadow`, laid
// over the page under that light (lib/fx/shade.ts). Both are given the
// pixel's place (CSS px from the token's centre, +y down), the shape's age
// (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7], s:
// f.q[9..11]), the same numbers in the same frame, and both go by one field
// (sh_field): how much ink stands at the pixel. So the Shadow's dark is one
// stuff inside the token and outside it.
//
// Outside the token light can't darken a page that is dark already, so the
// black is where light stops: ink standing in front of a light that seeps
// out from behind the wearer. The shade is black there too, where the light
// stops and nowhere else, which shows on a lit row of a list.
//
// At rest. The ink is born on the wearer and carried off along a flow: thrown
// outward off the rim, parting at an upright axis that wanders, streaming
// away to both sides, each side leaning its own way. What stands where is
// noise looked up where the flow brought it from (two lives, half a life
// apart, each fading in as the other fades out), so no form stays: a mass is
// born at the rim, drawn out and torn off within a second or two. A grain
// along the throw combs its edges into spikes and its far parts into
// streaks, as his Shroud's ink is thrown. Its darkness is hard: black with a
// body, not a veil. The light behind it is not a haze: lit wisps of jade and
// mint, the same grain, bright in the gaps beside the ink, and a little
// caught on the ink's thin edges.
//
// Over the token. Most of the body stands behind the token, which hides it.
// On one side, which wanders (and never all the way round: that is a hole
// to look through), it comes round in front: the same field, carried by the
// same flow in the same lives, goes on over the rim and across the face.
// There the flow combs it along its own way and not into rays (rays over a
// face all point at its middle: lashes): what is born by the axis is drawn
// out into streaks toward the rim, torn to scraps and gone. It is black and
// whole where it crosses the rim (the rim is gone there), fewer and finer
// streaks toward the middle, and never darker over the middle than lets the
// letter read, so the player's colour stays theirs. And it is a body a
// little way before the token: see-through where it is thin and black where
// it is thick, a dull jade caught on a streak's upper edge (the token's own
// light comes from above), a little shade close round it, and its shadow
// thrown on the face down and to the right of where its masses stand (a
// second look at the same masses a little way off).
//
// A burst (his Shroud): a black blot with a fur of spikes, there at once,
// solid for a fifth of a second, then torn to tatters; a pale shock behind
// it. A dash: a straight feathered black streak off one side with the
// blade's cold line beside it, left where it was drawn and torn away.
//
// The score. The Eclipse (his realm): sage
// lines rushing in from the sides, silver hairlines among them, a jade glow
// close behind the token, the ink black against it. Then the cut: a white
// star where the blade lands, and one thick lune swept along one side of the
// wearer within a tenth of a second (in a streak a fan of nested leaves, all
// of the one sweep); white-hot, then mint, then bottle green, then the same
// shape in black, which tears away.
//
//   q: the face's radius (px); the flow's clock (s); how far the ink reaches
//   left and right (two numbers in one: the left, 0 to 1, in thousandths as
//   the whole part, the right as the fraction); the lean of the left and
//   right streams (the same way).
//   r: where the axis it parts at stands above and below (the same way); how
//   much ink there is (1 at rest, more after a streak, less with lives
//   lost); how torn it is (0 to 1: holes, and its light drained grey) and
//   the dark beat before a cut (0 to 1), two in one again; a burst (whole
//   part: 1 to 4 a Shroud's burst, so strong; 5 a dash to the left, 6 to the
//   right; the fraction: how far through it is).
//   s: the realm's strength (0: none; below 1 still rushing in); its lines'
//   travel (in trips); the cut (64 times its own number, 0 to 63, which
//   gives its side and its turn, plus 8 times how great it is, 0 to 3, plus
//   its age in seconds; 0: none).

// What the light and the shade share: the field.
const FIELD = `
// The realm's colours: a deep jade close
// behind the wearer, jade paling outward, cold silver hairlines; the smoke's
// own mint; the white of a blade's edge.
const vec3 SH_DEEP = vec3(0.03, 0.3, 0.16);
const vec3 SH_SAGE = vec3(0.14, 0.56, 0.36);
const vec3 SH_PALE = vec3(0.4, 0.82, 0.6);
const vec3 SH_HAIR = vec3(1.05, 1.22, 1.48);
const vec3 SH_MINT = vec3(0.6, 0.86, 0.8);
const vec3 SH_HOT = vec3(1.25, 1.42, 1.3);
const float SH_TAU = 6.2831853;
/** How long the ink is carried before it is born again (s). */
const float SH_LIFE = 2.6;

float sh_sq(float x) {
  return x * x;
}

float sh_wrap(float a) {
  return atan(sin(a), cos(a));
}

// Two numbers out of one (shadow.ts: pack).
vec2 sh_pair(float v) {
  float a = floor(v);
  return vec2(a / 1000.0, v - a);
}

// Where the ink now at u (the token's radii from its centre) was a seconds
// ago. wind: the lean of the left and right streams, where the axis stands
// above and below. face: 0 for a place outside the token, up to 1 for one
// over it.
vec2 sh_from(vec2 u, float a, vec4 wind, float face) {
  float well = mix(wind.z, wind.w, smoothstep(-0.9, 0.9, u.y));
  float dx = u.x - well;
  float x0 = well + dx * exp(-0.45 * a);
  float y0 = u.y - mix(wind.x, wind.y, smoothstep(-0.3, 0.3, dx)) * abs(u.x - x0);
  vec2 o = vec2(x0, y0);
  float l = max(length(o), 0.3);
  // (Thrown outward off the rim: quick close to it, spent a radius out.)
  float thrown = 0.27 * a * exp(-max(l - 1.0, 0.0) * 1.5);
  // Over the token the same throw, at the rim's pace at the rim and slower
  // toward the middle, where it starts from rest. (Outside, what is traced
  // back across the middle comes out on its far side: behind the token
  // nobody sees the fold that makes. Over it they would.)
  return o * mix(1.0 - thrown / l, exp(-thrown / max(l, 1.0)), face);
}

// What the flow carries to u: its billows (x), and the grain along its throw,
// coarse (y) and fine (z): fine across the way it was thrown, long along it.
// Each about nought, either way.
vec3 sh_carried(vec2 u, float t, float ph, vec4 wind, float g, float seed, float big, float face) {
  vec3 acc = vec3(0.0);
  float w2 = 0.0;
  float per = floor(mix(20.0, 46.0, big) + 0.5);
  for (int i = 0; i < 2; i++) {
    float c = t / SH_LIFE + 0.5 * float(i) + ph;
    float cyc = floor(c);
    float a = c - cyc;
    float wgt = 1.0 - abs(2.0 * a - 1.0);
    vec2 o = sh_from(u, a * SH_LIFE, wind, face);
    vec2 off = vec2(cyc * 7.31 + float(i) * 13.7, cyc * 3.17 + seed);
    float n = fbm(o * vec2(0.9, 1.7) * g + off) - 0.4375;
    // (Its rays laid flatter than straight out: sideways rather than up and down.)
    vec2 f = vec2(o.x, 1.8 * o.y);
    // (And never straight for long, or side by side they are a comb of hair:
    // each thread kinks, runs into its neighbour and forks.)
    float kink = vnoise(o * vec2(2.6, 3.4) + off.yx) - 0.5;
    float ang = atan(f.y, f.x) / SH_TAU + 0.036 * kink;
    float rho = length(f);
    float c1 = pnoise(vec2(ang * per + off.x, 1.3 * rho + off.y), per) - 0.5;
    float c2 = pnoise(vec2(ang * per * 2.0 + off.y, 2.6 * rho + off.x), per * 2.0) - 0.5;
    // (Over the token the grain would be a comb of rays all pointing at its
    // middle: lashes. There the ink is combed along the flow instead: long
    // the way it is carried, fine across it, so what is born by the axis is
    // drawn out into streaks on its way to the rim and over it. And the same
    // a little higher up says where a streak's upper edge is: z, over the
    // token, is how much the ink thickens downward here.)
    vec2 sf = vec2(2.0, mix(3.6, 7.0, big));
    float st = vnoise(o * sf + off) - 0.5;
    float stUp = vnoise((o - vec2(0.0, 0.3 / sf.y)) * sf + off) - 0.5;
    float lump = 1.25 * st + 0.55 * kink + 0.3 * big * (vnoise(o * vec2(3.1, 15.0) + off.yx) - 0.5);
    acc += wgt * vec3(n, mix(c1, lump, face), mix(c2, 4.0 * (st - stUp), face));
    w2 += wgt * wgt;
  }
  // (Two lives mixed are flatter than one: its contrast is given back.)
  return acc * inversesqrt(max(w2, 1e-4));
}

// How far out u is: 0 at the rim, 1 where the ink's reach ends (rx to the
// side, ry above and below, in the token's radii).
float sh_far(vec2 u, float rx, float ry) {
  float l = max(length(u), 1e-3);
  vec2 d = u / l;
  float edge = 1.0 / length(vec2(d.x / rx, d.y / ry));
  return clamp((l - 1.0) / (edge - 1.0), 0.0, 3.0);
}

// Needle rays round a point: at the angle ang01 (turns) and hr out from it
// (the token's radii), n places for a ray, each its own length up to reach.
float sh_rays(float ang01, float hr, float n, float seed, float reach, float tokpx) {
  float x = ang01 * n;
  float cell = floor(x);
  float id = mod(cell, n);
  float h1 = hash12(vec2(id, seed));
  float h2 = hash12(vec2(id + 0.37, seed + 2.1));
  float across = (x - cell - 0.5 - (h2 - 0.5) * 0.6) / n * SH_TAU * hr;
  float w = max(0.016, 0.7 / tokpx);
  return exp(-across * across / (w * w)) * (1.0 - smoothstep(0.0, reach * (0.2 + 0.8 * h1 * h1), hr));
}

// One cut of his blade round the wearer, at P (the token's radii from its
// centre), age seconds old. It is one lune: thick at its middle, where it
// stands furthest out, and a point by the rim at either horn, lying against
// the smoke on the side th0, swept from one horn to the other (sweep: how far
// round to either side of th0; way: which horn first) within a tenth of a
// second. In a streak (lev) it is a fan: up to three leaves of the one
// blade's path, nested, all with the same horns and the same turn, each with
// its own crisp rim, the inner ones a moment later; wider, further out and
// held longer. White-hot all through at first, its leading end the blade
// itself; then mint, then bottle green, torn away along its ribs; then ink
// in the same shape. Where the blade lands, a white star of needle rays.
// rgb: its light; a: its ink.
vec4 sh_cut(vec2 P, float age, float th0, float lev, float sweep, float way, float tokpx, float seed) {
  float rr = length(P);
  float ang = atan(P.y, P.x);
  float n = 1.0 + min(lev, 2.0);
  float out0 = 1.78 + 0.12 * lev;
  float al0 = (way * sh_wrap(ang - th0) + sweep) / (2.0 * sweep);
  float al = clamp(al0, 0.0, 1.0);
  float tp = pow(sin(PI * al), 0.7);
  // The star, at the horn it starts from: gone in a seventh of a second.
  float ha = th0 - way * sweep;
  vec2 hd = P - 1.14 * vec2(cos(ha), sin(ha));
  float hr = length(hd);
  float rays = sh_rays(atan(hd.y, hd.x) / SH_TAU, hr, 19.0, seed + th0, 0.75 + 0.25 * lev, tokpx);
  vec3 light = SH_HOT * sh_sq(1.0 - min(age / 0.14, 1.0)) * (3.5 * exp(-hr / 0.06) + 0.5 * exp(-hr / 0.3) + 2.2 * rays);
  // Its outer edge (it drifts outward a little as it dies) and how wide it is.
  float ro = (1.06 + (out0 - 1.06) * tp) * (1.0 + 0.07 * smoothstep(0.08, 0.6, age));
  float wd = (0.52 + 0.1 * (n - 1.0)) * tp;
  // Across it: 0 at its outer edge, 1 at its inner one.
  float x = (ro - rr) / max(wd, 1e-3);
  // Which leaf of the fan this is in (the outermost the widest), and how far
  // across that leaf. So one copy of the code draws them all, and the
  // program stays quick to build.
  float fx = pow(clamp(x, 0.0, 0.999), 1.4) * n;
  float fi = floor(fx);
  float xl = fx - fi;
  float ag = age - 0.035 * fi;
  // (Not there yet, or past its horns: nothing. By a factor, not by leaving
  // early: every way out of a function makes the program slower to build.)
  float on = step(0.0, ag) * step(0.0, al0) * step(al0, 1.0);
  ag = max(ag, 0.0);
  // (Its colours turn more slowly in a streak: a longer hold.)
  float at = ag / (1.0 + 0.16 * lev);
  float head = 1.0 - sh_sq(1.0 - clamp(ag / 0.1, 0.0, 1.0));
  float lead = 1.0 - smoothstep(head - 0.04, head, al) * step(head, 0.999);
  float tip = step(ag, 0.1) * exp(-(head - al) * 2.0 * sweep / 0.3);
  // The leaf's rim: a crisp line along its outer edge (px).
  float dl = (x - pow(fi / n, 0.714)) * wd * tokpx;
  float rimline = (exp(-dl * dl / 1.3) + 0.3 * exp(-abs(dl) / 3.5)) * step(x, 1.0) * tp;
  // Its body: brightest behind its rim, ribbed across; torn away along its ribs as it ages.
  float ribs = vnoise(vec2(al * sweep * 28.0 + seed * 9.0 + 5.0 * fi, xl * 1.2 + 3.0 * fi - 1.5 * at));
  float kept = smoothstep(-0.15, 0.1, ribs - 1.15 * smoothstep(0.24, 0.62, at));
  float hot = exp(-at / 0.09);
  // (One lune while it is white: its leaves show as it cools. And as it
  // cools it is its body that stays, not its rims: lines alone are rings.)
  float body = mix(pow(1.0 - xl, 0.6), 1.0, 0.3 + 0.5 * hot) * step(0.0, x) * (1.0 - smoothstep(0.92, 1.0, x)) * (0.4 + 0.9 * ribs * ribs);
  vec3 c = mix(mix(vec3(0.04, 0.3, 0.15), SH_MINT, exp(-at / 0.2)), SH_HOT, hot);
  float lit = (3.0 * hot + 2.2 * exp(-at / 0.25) + 0.75) * body + (4.0 * exp(-at / 0.1) + 0.45 * exp(-at / 0.2)) * rimline;
  light += c * lit * kept * lead * (1.0 + 2.0 * tip) * (1.0 - 0.2 * fi) * on;
  // (Its ink: how much; the flow's own billows and grain tear it, in sh_field.)
  float ki = smoothstep(0.16, 0.3, at) * (1.0 - smoothstep(0.5, 0.85, at));
  float fan = step(0.0, x) * (1.0 - smoothstep(0.85, 1.15, x)) * smoothstep(0.0, 0.15, tp);
  return vec4(light, ki * fan * lead * on) * step(0.0, age) * step(age, 1.5);
}

// The greater of two (h), the turn from the one to the other rounded over w
// (0: not at all, the greater as it is).
float sh_most(vec2 h, float w) {
  float k = max(w - abs(h.x - h.y), 0.0) / max(w, 1e-4);
  return max(h.x, h.y) + 0.25 * w * k * k;
}

// How hard the body holds to the rim on the side hp (a place on the unit
// circle; over the token, one inside it), 0 to 1. The greater of two noises,
// so the blot always has its lobes: a body that is never all streaks. (w:
// sh_most's. Over the token an edge is cut by this, and where the greater
// turns from one noise to the other the edge would have a corner.)
float sh_hold(vec2 hp, float seed, float t, float w) {
  return sh_most(vec2(vnoise(hp * 1.25 + vec2(seed + 0.22 * t, 9.3 - 0.15 * t)), vnoise(hp * 0.9 + vec2(4.1 - 0.13 * t, seed * 1.7 + 0.19 * t))), w);
}

// The field at a pixel, as the light and the shade both have it.
struct ScField {
  // How much ink stands here: above nought it is ink, and soon black.
  float val;
  // Its masses alone, without the grain that combs them.
  float mass;
  // What the flow carries here (sh_carried).
  vec3 f;
  // Where that was looked up, at what point of its lives, on what wind.
  vec2 uw;
  float ph;
  vec4 wind;
  // How hard the body holds to the rim on this side (0 to 1), which side
  // that is (sh_hold), and how far it reaches on this side (0 to 1).
  float hold;
  vec2 hp;
  float reach;
  // A dash: across it, its width, its fade toward its end, along it; and whether this place is in it (0 or 1).
  vec4 dash;
  float dashOn;
  // The cut: its light (rgb) and its ink (a).
  vec4 cut;
};

// The field at p. face: 0 outside the token (the field as the light has
// always had it), up to 1 over it, where the body is the same body come
// round in front: carried a little otherwise (sh_from), its edge lumped
// rather than combed (sh_carried), and no burst or streak covering the
// whole face.
ScField sh_field(vec2 p, float seed, vec4 q, vec4 r, vec3 s, float face) {
  ScField fd;
  float R = q.x;
  float tok = R + 3.0 * sqrt(R / 16.0);
  float len = length(p);
  float big = smoothstep(16.0, 32.0, R);
  vec2 u = p / R;
  float lr = len / R;
  vec2 dir = u / max(lr, 1e-3);
  float rim = tok / R;
  float away = max(lr - rim, 0.0);
  float sx = dir.x * dir.x;
  float t = q.y;
  vec2 rch = sh_pair(q.z);
  vec2 reach = mix(mix(vec2(1.4), vec2(1.95), rch), mix(vec2(1.55), vec2(2.4), rch), big);
  vec4 wind = vec4(sh_pair(q.w) - 0.5, sh_pair(r.x) - 0.5);
  // (What a streak adds counts for less over the face: it is never drowned.)
  float heft = r.y - 0.6 * max(r.y - 1.0, 0.0) * face;
  float torn = sh_pair(r.z).x;
  float bk = floor(r.w);
  float ba = r.w - bk;

  // The flow's own unrest: two swirls that stay where they are.
  vec2 w1 = vec2(vnoise(u * 1.1 + vec2(seed, t * 0.2)), vnoise(u * 1.1 + vec2(-t * 0.17, seed + 31.7))) - 0.5;
  vec2 w2 = vec2(vnoise(u * 3.1 + vec2(t * 0.31, seed + 7.0)), vnoise(u * 3.1 + vec2(seed + 13.0, -t * 0.27))) - 0.5;
  vec2 uw = u + w1 * vec2(0.55, 0.4) + w2 * 0.12;
  // (Each place is born again at its own moment, so the whole never is at once.)
  float ph = 0.7 * vnoise(u * 0.8 + seed + 5.3);
  vec3 f = sh_carried(uw, t, ph, wind, mix(0.62, 1.0, big), seed, big, face);

  // How much ink stands here. Some clings to the rim, here more and there
  // less (never all the way round: that would be a ring); the rest is what
  // the streams carry, each leaning its own way, thinning to its reach. Far
  // out its billows count for less and its grain for more: drawn out.
  float sd = smoothstep(-0.3, 0.3, u.x);
  vec2 ue = vec2(uw.x, uw.y - mix(wind.x, wind.y, sd) * abs(uw.x) * 0.8);
  float far = sh_far(ue, mix(reach.x, reach.y, sd), 1.38);
  float k = smoothstep(0.1, 0.9, far);
  // (Over the token "this side" is the place itself, not its ray from the
  // middle: by the ray, what comes round in front would end along spokes.
  // And the place as the flow has bent it, more so further in: a noise this
  // coarse, cut off hard, ends along the straight lines of its own grid.)
  vec2 hp = mix(dir, u / rim + 0.45 * f.xy * smoothstep(0.0, 0.2, 1.0 - lr / rim), face);
  float hold = sh_hold(hp, seed, t, 0.25 * face);
  float cling = smoothstep(0.34, 0.66, hold);
  float mass = 2.4 * f.x * (1.0 - 0.45 * k) + heft * (0.42 + 0.58 * cling) - 0.95 * far + 0.4 * cling * exp(-away / 0.2) - 0.42;
  // (Over the token z is no grain: sh_carried.)
  float grain = 0.8 * f.y + 0.2 * mix(f.z, f.y, face);
  float val = mass + (1.15 + 0.55 * k) * grain;
  // Torn: holes open in it.
  val -= torn * (0.55 + 1.6 * vnoise(u * 2.3 + seed + 40.0));

  fd.dash = vec4(0.0);
  fd.dashOn = 0.0;
  if (bk > 0.5 && bk < 4.5) {
    // His Shroud: a blot with a fur of spikes thrown outward, there at once,
    // solid for a moment, then thinning into tatters. (Its pale shock is the light's.)
    float reachB = (0.4 + 0.3 * bk) * mix(0.85, 1.0, big);
    float ang = atan(u.y, u.x) / SH_TAU;
    float sp = pnoise(vec2(ang * 48.0 + seed * 9.0 + bk * 3.0, lr * 0.5 - ba * 1.5), 48.0);
    float sp2 = pnoise(vec2(ang * 13.0 + seed * 5.0 + bk, ba * 0.6), 13.0);
    float edgeR = rim + reachB * (smoothstep(0.0, 0.1, ba) + 0.25 * ba) * (0.3 + 0.55 * sp2 + 0.45 * sp) * (0.7 + 0.3 * sx);
    val += 1.7 * (1.0 - smoothstep(edgeR - 0.3, edgeR, lr)) * (1.0 - smoothstep(0.3, 1.0, ba)) * (1.0 - 0.55 * face);
  } else if (bk > 4.5) {
    // His dash: a straight black streak off one side, ragged as a charred
    // feather, drawn in two frames and left there to tear. (The blade's cold
    // line beside it is the light's.)
    vec2 dd = normalize(vec2(bk > 5.5 ? 1.0 : -1.0, 0.36 * hash12(vec2(seed, 7.7)) - 0.18));
    float al = dot(u, dd);
    float ac = dot(u, vec2(-dd.y, dd.x));
    float x = (al - 0.6) / max((2.6 + 0.6 * big) * smoothstep(0.0, 0.12, ba) - 0.6, 0.01);
    if (al > 0.0 && x < 1.1) {
      float wd = 0.42 * (1.0 - 0.75 * smoothstep(0.0, 1.0, x));
      float fade = 1.0 - smoothstep(0.75, 1.05, x);
      val += 1.6 * (1.0 - smoothstep(0.4 * wd, wd, abs(ac))) * fade * (1.0 - smoothstep(0.3, 1.0, ba)) * (1.0 - face);
      fd.dash = vec4(ac, wd, fade, x);
      fd.dashOn = 1.0;
    }
  }

  // The cut; from the third right answer in a row, a second one after it,
  // from the other side, once the first has cooled to green: never two white
  // arcs at once. Each keeps to its own side of the wearer, so a pixel is in
  // one of them at most (again: one copy of the code).
  fd.cut = vec4(0.0);
  if (s.z > 0.001) {
    float si = floor(s.z / 64.0);
    float rem = s.z - si * 64.0;
    float lev = floor(rem / 8.0);
    float sa = rem - lev * 8.0;
    float th0 = (si < 32.0 ? 0.0 : PI) + (mod(si, 32.0) / 31.0 - 0.5) * 1.2;
    float way = mod(si, 2.0) < 0.5 ? 1.0 : -1.0;
    vec2 P = p / tok;
    float sweep = 1.05 + 0.15 * min(lev, 1.0);
    if (lev > 1.5) {
      sweep = 1.3;
      float th2 = th0 + PI + 0.5 * way;
      if (dot(P, vec2(cos(th0) - cos(th2), sin(th0) - sin(th2))) < 0.0) {
        th0 = th2;
        way = -way;
        sa -= 0.32;
        lev -= 1.0;
        si += 7.0;
      }
    }
    vec4 cut = sh_cut(P, sa, th0, lev, sweep, way, tok, seed + si);
    // Its own shape turned to ink, which the flow's billows and grain tear
    // to tatters as it goes.
    val = max(val, mix(-3.0, 1.5 * cut.a - 0.75 + 2.6 * f.x + 0.5 * grain, step(0.001, cut.a)));
    fd.cut = cut;
  }

  fd.val = val;
  fd.mass = mass;
  fd.f = f;
  fd.uw = uw;
  fd.ph = ph;
  fd.wind = wind;
  fd.hold = hold;
  fd.hp = hp;
  fd.reach = mix(rch.x, rch.y, sd);
  return fd;
}
`;

// The light alone: the realm, and what shows the ink.
const LIGHT = `
// How far the realm's axis leans from level, for this token, drifting.
float sh_tilt(float time, float seed) {
  return (hash12(vec2(seed, 1.3)) - 0.5) * 0.32 + 0.06 * sin(time * 0.031 + seed * 9.0);
}

// The realm's band on the ray th (from its axis), in the token's radii:
// where its light begins (x), close behind the token at the sides, and how
// far it reaches (y): wide to the sides, one side further than the other,
// short above and below, shorter on a small token. c: -1 opened far out, 0
// come in.
vec2 sh_band(float th, float tok, float c, float time, float seed) {
  float sd = sh_sq(cos(th));
  float g = smoothstep(14.0, 40.0, tok);
  float bal = (hash12(vec2(seed, 3.7)) - 0.5) * 0.3 + 0.12 * sin(time * 0.043 + seed * 20.0);
  float rs = mix(1.95, 3.3, g) * (1.0 + bal * sign(cos(th)));
  float rag = pnoise(vec2(th / SH_TAU * 9.0 + seed * 31.0, time * 0.09 + seed * 5.0), 9.0);
  float rin = 1.03 + 0.3 * (1.0 - sd) + 0.08 * (rag - 0.5);
  float rout = inversesqrt((1.0 - sd) / 1.9 + sd / (rs * rs)) * (1.0 + 0.18 * (rag - 0.5));
  float a = 1.0 + (rin - 1.0) * (1.0 - 0.9 * c);
  return vec2(a, max(1.0 + (rout - 1.0) * (1.0 - 0.6 * c), a + 0.05));
}

// One ring of the realm's lines round the token: n cells, each with at most
// one line in flight, born at the band's outer edge and running in along its
// ray to the inner one, evenly in the log of the radius (as a zoom moves:
// quick far out, slowing as it nears the token), then another, or none, as
// the realm's strength has it. Two cells in five carry the soft sage lines,
// the rest the bright silver hairlines, a few of those only a sparkle (one
// ring for both, each cell its kind: one copy of the code).
vec3 sh_streaks(float th, float tilt, float rr, float tok, float n, float flow, float seed, float dens, float gg, float c, float time) {
  float x = (th / SH_TAU + 0.5) * n;
  float cell = floor(x);
  float id = mod(cell, n);
  bool hair = hash12(vec2(id + 0.77, seed * 5.9)) < 0.6;
  float layer = hair ? 1.0 : 0.0;
  flow = hair ? flow * 1.07 + 3.0 : flow;
  dens *= hair ? mix(0.45, 0.65, gg) : 0.8;
  float h1 = hash12(vec2(id, seed * 17.0 + layer * 5.3));
  float h2 = hash12(vec2(id + 0.41, seed * 3.0 + layer * 1.7));
  float tt = flow * mix(0.2, 0.62, h1 * h1) + h2 * 7.0;
  float k = floor(tt);
  float tau = tt - k;
  vec2 kk = vec2(id * 1.37 + k * 0.173, seed * 9.1 + layer * 2.7);
  float hk = hash12(kk);
  float hw = hash12(kk + vec2(3.1, 0.7));
  float hl = hash12(kk + vec2(0.9, 5.3));
  float thc = ((cell + 0.5) / n - 0.5) * SH_TAU;
  float d = dens * smoothstep(0.22, 0.85, sh_sq(cos(thc - tilt)));
  float lit = smoothstep(hk - 0.05, hk + 0.05, d);
  vec2 band = sh_band(thc - tilt, tok, c, time, seed);
  float Lin = log(band.x);
  float Lout = log(band.y);
  float span = max(Lout - Lin, 0.05);
  float L = log(max(rr, 1e-3));
  bool spark = hair && hl < 0.08;
  float len = spark ? 0.03 : span * (hair ? mix(0.4, 0.85, hl) : mix(0.55, 1.0, hl));
  float a = (L - mix(Lout + 0.02, Lin - 0.06, tau)) / len;
  // (Outside the line's own length: nothing; by a factor, as in sh_cut.)
  lit *= step(-0.3, a) * step(a, 1.3);
  float dpx = (x - cell - 0.5 - (hw - 0.5) * 0.6) / n * SH_TAU * rr * tok;
  float wpx = hair ? max(0.22 + 0.005 * tok, 0.42) * mix(0.8, 1.25, hw) : max(0.5 + 0.022 * tok, 0.6) * mix(0.75, 1.3, hw);
  float along = smoothstep(-0.08, 0.1, a) * (1.0 - smoothstep(0.35, 1.0, a));
  float life = smoothstep(0.0, 0.1, tau) * smoothstep(Lin - 0.02, Lin + 0.08, L) * smoothstep(Lout + 0.04, Lout - 0.14, L);
  float outer = clamp((L - Lin) / span, 0.0, 1.0);
  // (All three kinds worked out and one picked: branches, too, make the program slower to build.)
  float core = exp(-dpx * dpx / (wpx * wpx));
  vec3 sage = mix(SH_SAGE, SH_PALE, outer) * (core + 0.6 * exp(-dpx * dpx / (wpx * wpx * 0.15))) * 0.62 * along;
  vec3 fineLine = mix(SH_SAGE * 1.6, SH_HAIR, 0.45 + 0.55 * outer) * (core + 0.1 * exp(-abs(dpx) / (wpx * 4.0))) * 0.75 * mix(1.2, 1.0, gg) * along;
  vec3 sparkle = SH_HAIR * 1.3 * exp(-(dpx * dpx + sh_sq(a * len * rr * tok)) / (wpx * wpx * 3.0)) * (0.5 + 0.5 * sin(time * (5.0 + 6.0 * hw) + hk * 40.0));
  return (spark ? sparkle : hair ? fineLine : sage) * life * lit * mix(0.5, 1.0, hk);
}

// The realm's soft light: a sage field round the wearer, finely streaked
// along its rays, each ray reaching out to its own length.
vec3 sh_haze(float th, float tilt, float rr, float tok, float c, float time, float seed) {
  float thT = th - tilt;
  vec2 band = sh_band(thT, tok, c, time, seed);
  float u = th / SH_TAU;
  float nr = floor(clamp(tok * 0.7, 14.0, 41.0));
  float reach = pnoise(vec2(u * nr + seed * 13.0, time * 0.07), nr);
  float far = band.x + (band.y - band.x) * (0.6 + 0.55 * reach);
  float t = (rr - band.x) / max(far - band.x, 0.05);
  float sd = sh_sq(cos(thT));
  float wside = smoothstep(mix(0.45, 0.28, smoothstep(14.0, 40.0, tok)), 0.88, sd);
  float n1 = floor(clamp(tok * 3.0, 48.0, 150.0));
  float fine = pnoise(vec2(u * n1 + seed * 41.0, time * 0.18), n1);
  float fine2 = pnoise(vec2(u * 29.0 + seed * 17.0, time * 0.11 + 4.0), 29.0);
  float streaky = 0.2 + 0.8 * fine * (0.45 + 0.75 * fine2);
  float sheaf = 0.55 + 0.45 * smoothstep(0.2, 0.85, pnoise(vec2(u * 5.0 + seed * 3.0, time * 0.04), 5.0));
  float outer = smoothstep(0.04, 0.4, t) * (1.0 - smoothstep(0.45, 1.0, t));
  return mix(SH_SAGE, SH_PALE, smoothstep(0.3, 0.9, t)) * outer * streaky * sheaf * wside;
}

vec3 aura_shadow(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float R = q.x;
  float tok = R + 3.0 * sqrt(R / 16.0);
  float len = length(p);
  // Over the token there is none of its light: the dark there is the shade's.
  float clear = smoothstep(tok - 0.75, tok + 0.75, len);
  if (clear <= 0.0) return vec3(0.0);
  ScField fd = sh_field(p, seed, q, r, s, 0.0);
  float big = smoothstep(16.0, 32.0, R);
  vec2 u = p / R;
  float lr = len / R;
  float away = max(lr - tok / R, 0.0);
  float sx = sh_sq(u.x / max(lr, 1e-3));
  float t = q.y;
  float torn = sh_pair(r.z).x;
  float bk = floor(r.w);
  float ba = r.w - bk;
  float dens = s.x;
  vec3 f = fd.f;
  float mass = fd.mass;
  float val = fd.val;

  vec3 behind = vec3(0.0);
  vec3 front = vec3(0.0);
  if (bk > 0.5 && bk < 4.5) {
    // His Shroud's burst: a pale shock behind the blot.
    float reachB = (0.4 + 0.3 * bk) * mix(0.85, 1.0, big);
    behind += SH_PALE * (0.25 + 0.12 * bk) * sh_sq(1.0 - ba) * exp(-away / (0.12 + 0.55 * reachB));
  } else if (fd.dashOn > 0.5) {
    // His dash: a pale light behind the streak, and the blade's cold line beside it.
    float ac = fd.dash.x;
    float wd = fd.dash.y;
    float x = fd.dash.w;
    behind += SH_PALE * 0.9 * (1.0 - ba) * exp(-abs(ac) / 0.3) * fd.dash.z * smoothstep(-0.2, 0.3, x);
    float lw = max(0.03, 0.9 / R);
    front += SH_HAIR * 1.6 * exp(-sh_sq((ac - 1.15 * wd) / lw)) * smoothstep(0.0, 0.2, x) * (1.0 - smoothstep(0.7, 1.0, x)) * sh_sq(1.0 - ba);
  }
  // The cut's light, most of it before the ink: the blade goes through the smoke.
  front += 0.7 * fd.cut.rgb;
  behind += 0.3 * fd.cut.rgb;

  // What gets past the ink.
  float T = exp(-22.0 * max(val, 0.0));

  // The light behind it. It has no shape of its own: it stands only close
  // round the ink's masses (not round each spike: the spikes stand black
  // against it), mint close to them and a dimmer jade a little further,
  // streaked along the grain, in patches that shift; less far from the
  // wearer. So what is seen is the ink's torn edge, lit from behind.
  float near = smoothstep(mix(-1.4, -1.0, big), 0.0, mass + (val - mass) * 0.25);
  float W = smoothstep(-0.25, 0.35, 1.6 * f.z - 1.5 * f.x);
  // (Its bright threads are few: here some, there none.)
  float few = 0.45 + 0.55 * smoothstep(0.42, 0.68, vnoise(u * 1.9 + vec2(seed + 3.0 - 0.1 * t, 0.12 * t)));
  float thread = smoothstep(0.12, 0.32, f.z + 0.3 * f.y) * few;
  float glint = smoothstep(0.3, 0.42, f.z) * smoothstep(0.0, 0.25, f.y);
  float lit = 0.3 + 0.7 * smoothstep(0.28, 0.7, vnoise(u * 1.3 + vec2(t * 0.13 + seed, -t * 0.09)));
  float lenv = exp(-away / mix(0.85, 1.8, sx));
  // (Brighter and wider on a small token, where it has few pixels to be seen by.)
  behind += ((SH_MINT * (0.25 + 0.75 * thread) * 1.5 + SH_HAIR * 1.4 * glint) * near * near + SH_SAGE * 0.85 * (0.3 + 0.7 * W) * near) * lit * lenv * mix(2.3, 1.35, big);

  // The Eclipse: the realm's light, the ink black against it.
  if (dens > 0.002) {
    float th = atan(p.y, p.x);
    float rr = len / tok;
    float tilt = sh_tilt(time, seed);
    float c = min(dens, 1.0) - 1.0;
    float gg = smoothstep(14.0, 40.0, tok);
    vec3 realm = sh_haze(th, tilt, rr, tok, c, time, seed) * dens * mix(0.14, 0.3, gg);
    float wb = max(max(smoothstep(0.2, 0.85, sh_sq(cos(th - tilt))), 0.85 * smoothstep(-0.05, 0.65, sin(th - tilt))), 0.35);
    realm += SH_DEEP * mix(4.4, 3.6, gg) * 1.2 * exp(-max(rr - 1.0, 0.0) / (0.3 * (1.0 - 0.6 * c))) * smoothstep(0.97, 1.06, rr) * wb * dens;
    // (Its lines run in before the ink as well as behind it: half of each shows through.)
    vec3 lines = sh_streaks(th, tilt, rr, tok, floor(clamp(tok * 2.2, 48.0, 156.0)), s.y, seed, dens, gg, c, time);
    realm += 0.5 * lines;
    front += 0.5 * lines;
    behind += realm;
  }

  // Past the ink, the light behind it; on the ink's thin edge, a little of it caught.
  vec3 col = behind * T + SH_MINT * 0.2 * 4.0 * T * (1.0 - T) * (0.3 + 0.7 * W) * lit * exp(-away / 1.2) + front;
  // Torn, its light drains toward a cold grey.
  float l = dot(col, vec3(0.3, 0.5, 0.2));
  col = mix(col, vec3(l) * vec3(0.82, 0.95, 0.92), 0.7 * torn) * (1.0 - 0.4 * torn);
  return col * clear;
}
`;

// The shade alone: the ink as darkness, and the body come round in front of the token.
const DARK = `
// The billows alone (sh_carried's x), for a second look at the field a little way off.
float sh_billow(vec2 u, float t, float ph, vec4 wind, float g, float seed, float face) {
  float acc = 0.0;
  float w2 = 0.0;
  for (int i = 0; i < 2; i++) {
    float c = t / SH_LIFE + 0.5 * float(i) + ph;
    float cyc = floor(c);
    float a = c - cyc;
    float wgt = 1.0 - abs(2.0 * a - 1.0);
    vec2 o = sh_from(u, a * SH_LIFE, wind, face);
    acc += wgt * (fbm(o * vec2(0.9, 1.7) * g + vec2(cyc * 7.31 + float(i) * 13.7, cyc * 3.17 + seed)) - 0.4375);
    w2 += wgt * wgt;
  }
  return acc * inversesqrt(max(w2, 1e-4));
}

vec4 shade_shadow(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float R = q.x;
  vec2 u = p / R;
  // It darkens no further out than two of the token's radii to the sides and
  // a little over one and a half above and below (what stands beside a
  // token in a list is another player, or a name): past that the ink is
  // only where the light stops, as ever.
  float env = length(u / vec2(2.0, 1.6));
  if (env >= 1.0) return vec4(0.0);
  float tok = R + 3.0 * sqrt(R / 16.0);
  float len = length(p);
  float lr = len / R;
  float rim = tok / R;
  float big = smoothstep(16.0, 32.0, R);
  // Over the token (1) or outside it (0), as the light has its edge; how
  // deep over it (0 at its edge, 1 at its middle); and how far the field is
  // the face's own there (sh_field).
  float over = 1.0 - smoothstep(tok - 0.75, tok + 0.75, len);
  float deep = clamp(1.0 - lr / rim, 0.0, 1.0);
  // (The one field turns into the other just outside the rim's ring, under
  // the light, where on a dark page ink and no ink look alike. Were the
  // turn on the ring, a lobe over the face could end before it and leave
  // the ring showing: ink behind glass.)
  float face = 1.0 - smoothstep(rim, rim + 0.12, lr);
  ScField fd = sh_field(p, seed, q, r, s, face);
  vec2 tb = sh_pair(r.z);
  float torn = tb.x;
  float beat = tb.y;

  // Over the token most of the body stands behind it, hidden. Where it
  // holds to the rim hard (more on the side it reaches further) it comes
  // round in front: whole over the rim, and drawn out toward the middle
  // into the streaks the flow combs it into, fewer and finer the further
  // in. The dark beat before a cut draws it further in.
  // (It has a side it comes round on, which wanders, and keeps off the far
  // one: in front all the way round, the token is seen through a hole. And
  // less from above and below: there it lies across the face with a level
  // edge, a lid.)
  float la = SH_TAU * (1.6 * vnoise(vec2(0.07 * q.y, seed * 3.1)) + hash12(vec2(seed, 5.5)));
  vec2 lee = 0.22 * vec2(cos(la), 0.6 * sin(la));
  float come = smoothstep(0.52, 0.75, fd.hold + 0.25 * fd.f.x + 0.12 * (fd.reach - 0.5) + 0.25 * beat + dot(fd.hp, lee) - 0.16 * sh_sq(fd.hp.y));
  float inward = mix(2.6, 2.3, big) * (1.0 - 0.35 * beat);
  float val = fd.val + (1.1 * deep * fd.f.y - inward * deep * (1.0 + 0.4 * deep) - 2.6 * (1.0 - come)) * over;

  // How dark. Its edge is as hard as outside (a soft one is a shadow lying
  // on the face, not a body before it), and outside it is black wherever it
  // stands. Over the face it has a thickness: see-through where it is thin,
  // black where it is thick; and never more over the middle than lets the
  // letter read.
  // (On the rim's ring it is black as soon as it is there at all: a ring
  // seen faintly through thin ink is ink behind glass.)
  float ink = max(val, 0.0);
  float onring = smoothstep(0.88, 0.98, lr) * over;
  float thick = 1.0 - exp(-1.4 * ink);
  // (A streak's upper edge, where it is still thin: see below.)
  // (Not on a scrap torn off it: lit all over, that is a speck of another colour.)
  float up = smoothstep(0.0, 0.3, fd.f.z) * exp(-2.4 * ink) * over * (1.0 - onring) * come;
  // (Never an edge finer than the pixels it is drawn in: that is a stair.)
  float hard = min(22.0 * (1.0 + 5.0 * onring), 1.6 / max(fwidth(val), 1e-4));
  float a = (1.0 - exp(-hard * ink)) * mix(1.0, mix(0.6 + 0.4 * max(thick, up), 1.0, onring), over);
  vec3 mid = mix(vec3(0.24, 0.36, 0.74), vec3(0.58, 0.74, 0.94), smoothstep(16.0, 24.0, R));
  float most = mix(mid.x, mid.y, clamp(lr / 0.42, 0.0, 1.0)) + (mid.z - mid.y) * clamp((lr - 0.42) / 0.26, 0.0, 1.0) + (1.0 - mid.z) * clamp((lr - 0.68) / 0.2, 0.0, 1.0);
  a *= min(most + 0.4 * beat, 1.0) * (1.0 - 0.35 * torn * over);
  a *= mix(1.0, 0.55, clamp((env - 0.76) / 0.12, 0.0, 1.0)) * (1.0 - clamp((env - 0.88) / 0.12, 0.0, 1.0));

  // Its front, over the token. It is a body, lit from above (where the
  // token's own light comes from): a streak's upper edge, where it is still
  // thin, catches a dull jade, paler the more squarely it faces up; its
  // thick middle and its underside are black.
  vec3 col = mix(vec3(0.012, 0.027, 0.024), mix(vec3(0.05, 0.2, 0.15), vec3(0.34, 0.64, 0.53), up), up);
  // And what stands a little way toward the light throws its shadow here,
  // soft, on the face: the body is a little way before the token. (A second
  // look at its masses there: its billows, how deep over the token that is,
  // and whether the body comes round in front there.)
  float shadow = 0.0;
  if (over > 0.0) {
    vec2 to = vec2(-0.1, -0.14);
    float n2 = sh_billow(fd.uw + to, q.y, fd.ph, fd.wind, mix(0.62, 1.0, big), seed, face);
    vec2 h2 = (u + to) / rim;
    float l2 = length(h2);
    float deep2 = clamp(1.0 - l2, 0.0, 1.0);
    float hold2 = sh_hold(h2 / max(l2, 1.0) + 0.45 * vec2(n2, fd.f.y) * smoothstep(0.0, 0.2, deep2), seed, q.y, 0.25);
    float come2 = smoothstep(0.52, 0.75, hold2 + 0.25 * n2 + 0.12 * (fd.reach - 0.5) + 0.25 * beat + dot(h2, lee) - 0.16 * sh_sq(h2.y));
    float there = fd.mass - 2.4 * (fd.f.x - n2) + 0.58 * r.y * (smoothstep(0.34, 0.66, hold2) - smoothstep(0.34, 0.66, fd.hold)) + 1.1 * deep2 * fd.f.y - inward * deep2 * (1.0 + 0.4 * deep2) - 2.6 * (1.0 - come2);
    // (By how thick it stands there: a sliver over the rim throws next to
    // none. And a little shade close round all of it, the side toward the
    // light too: it is near the face there.)
    shadow = max(0.4 * smoothstep(0.0, 0.5, there) * smoothstep(-1.2, -0.2, val), 0.26 * smoothstep(-0.3, 0.0, val)) * over * (1.0 - 0.5 * torn);
  }
  return vec4(col * a, a + (1.0 - a) * shadow);
}
`;

export const GLSL = FIELD + LIGHT;
export const SHADE = FIELD + DARK;
