// The Slayer aura's light in the effects shader (shaders.ts): `aura_slayer`,
// given the pixel's place (CSS px from the shape's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `slayer_...`, so no two auras' names meet.
//
// The Duelist's Slayer in his blood stance, spinning in his red whirlwind
// with two blades (the blades themselves are pictures on the page, in
// slayer.ts; this is their light). It is drawn in three shapes, one for
// each blade and one for the whirlwind, told apart by r.w's sign.
//
// A blade's shape (r.w below 0), on the blade's own plane (level round him,
// seen from a little above, tilted and rolled as the swing goes):
// - its slash: the swing as the game draws one, the outer half of the blade
//   at its head with a hard line of light along its leading edge, tapering
//   behind along the point's path to a hair, cooling from white to scarlet;
// - its cut: the whole width the blade swept, a short wet sheen of blood
//   streaked along the path, longest and brightest where the point ran,
//   deepening to dark blood; in a rush of blood (a kill) it breaks into
//   spatter and wet drops are flung outward from it as it trails;
// - the cyclone's trail: one swept wake behind it through a great part of
//   the turn, a crescent widest and brightest just behind the edge,
//   narrowing toward the point's path and fading as it trails, torn by the
//   wind into broken streaks of their own strengths;
// - a highlight down the edge as the blade's flat turns to the eye;
// - its culling stroke: one stroke down across the token, steel at its edge
//   and a broad crimson wake behind.
// The far half of each turn passes behind the token, dimmer; the near half
// crosses its face, fainter over the letter.
// q: the disc's radius (px: the token and its rim), the point's radius (px),
//    the blade's angle on its plane (rad), its plane's centre below the
//    token's (px).
// r: how far its cyclone trail runs (rad: its light goes with it), how much
//    blood it carries (0.5 to 1 at rest, more in a rush, to about 3: past
//    1.1 it starts to fly), how dull it is (0 to 1), and
//    -2 less its plane's roll (rad).
// s: its culling stroke (0 none, 0 to 1 the stroke, 1 to 2 its wake drawn
//    in), the stroke's angle (rad from straight down), its plane's tilt
//    (height over width).
//
// The whirlwind's shape (r.w 0 or more):
// - threads of blood carried round him on level rings that rise from his
//   waist past his shoulders, each wider as it climbs (wide rather than
//   tall: the players above and below are close in a list), each coming in
//   low, climbing and fading, a wet bead at its head; a kill draws them in;
// - a deep blood glow seeping out from behind the token, wider than tall.
// q: the disc's radius, the blades' reach (px), the whirlwind's turn (rad),
//    the whirl's centre below the token's (px).
// r: unused, how much blood (as above), how dull, how many threads (0 to 8,
//    the last coming or going).
// s: unused, unused, how hard the token draws the blood in (0 to 1: a kill).

export const GLSL = `
const vec3 SLAYER_STEEL = vec3(0.82, 0.88, 1.0);
// The light off a steel edge in red light: white, a little warm.
const vec3 SLAYER_EDGE = vec3(1.25, 1.12, 1.02);
const vec3 SLAYER_SCARLET = vec3(1.7, 0.16, 0.09);
const vec3 SLAYER_BLOOD = vec3(0.95, 0.035, 0.03);
const vec3 SLAYER_DEEP = vec3(0.42, 0.008, 0.015);
// The light on wet blood: a hot red going pale.
const vec3 SLAYER_WET = vec3(2.0, 0.42, 0.3);
// The gloss on a drop: the light itself, caught on its wet skin.
const vec3 SLAYER_GLOSS = vec3(1.1, 0.85, 0.8);
// The whirlwind's plane: height over width, and its roll.
const float SLAYER_TILT = 0.3;
const float SLAYER_ROLL = -0.1;

// A point on a level ring of the whirl (centre h px below the token's, the
// plane tilted and rolled) in the ring's own plane: x across, y toward the eye.
vec2 slayer_plane(vec2 p, float h, float tilt, float roll) {
  vec2 v = rot2(p, -roll) - vec2(0.0, h);
  return vec2(v.x, v.y / tilt);
}

// The culling stroke: one stroke down across the token at angle ang, prog
// 0 to 1 as it falls, 1 to 2 as its wake is drawn into the token.
vec3 slayer_strike(vec2 p, float D, float prog, float ang, float seed) {
  vec2 pr = rot2(p, -ang);
  // A shallow arc bowing to one side, from well above the token to below it.
  float Ra = 4.0 * D;
  vec2 c = vec2(Ra - 0.35 * D, 0.0);
  vec2 e = pr - c;
  float dist = length(e) - Ra;
  float y = pr.y;
  float top = -2.1 * D;
  float bottom = 1.8 * D;
  float u = (y - top) / (bottom - top);
  float fall = 1.0 - pow(1.0 - clamp(prog, 0.0, 1.0), 2.4);
  float head = fall * 1.1;
  float lag = head - u;
  float after = clamp(prog - 1.0, 0.0, 1.0);
  // Its wake: broad behind the edge (on the outside of the bow), streaked
  // along the stroke, beaded with drops, and drawn in toward the token as it
  // fades. (Its head is soft, so no edge shows where it has not yet reached.)
  float ahead = smoothstep(-0.03, 0.0, lag);
  lag = max(lag, 0.0);
  float w = (1.0 + 0.16 * D) * (0.3 + 0.9 * sin(PI * clamp(u, 0.0, 1.0))) * (1.0 + 0.6 * after);
  float behind = max(dist, 0.0);
  float streak = 0.6 + 0.6 * vnoise(vec2(behind / w * 5.0, seed * 3.0));
  float wake = exp(-behind / w) * smoothstep(-1.0, 0.0, dist) * streak * exp(-lag * 2.2);
  float edge = exp(-dist * dist / (0.5 + 0.0016 * D * D)) * exp(-lag * 6.0) * (1.0 - after);
  float ends = smoothstep(-0.1, 0.12, u) * (1.0 - smoothstep(0.9, 1.15, u));
  float fade = 1.0 - smoothstep(0.0, 1.0, after);
  vec3 col = mix(SLAYER_SCARLET, SLAYER_BLOOD, smoothstep(0.0, 0.6, lag)) * wake * 1.2 + SLAYER_STEEL * edge * 3.0;
  col += vec3(1.5, 1.45, 1.4) * exp(-dist * dist / 0.6) * exp(-lag * 30.0) * 2.5 * (1.0 - after);
  return col * ends * fade * ahead;
}

// One blade's light (see the top of this file).
vec3 slayer_blade(vec2 p, float seed, float D, float E, float head, float hc, vec4 r, vec3 s) {
  float T = max(r.x, 1e-3);
  float blood = r.y;
  float dull = r.z;
  float roll = -r.w - 2.0;
  float tilt = max(s.z, 0.1);
  float R = max(D - 3.0, 4.0);
  float rad = length(p);
  // What the token lets through from behind it: 0 over it, 1 outside; and
  // what passes in front of it, fainter over its middle (the letter).
  float clear = smoothstep(D - 0.7, D + 0.7, rad);
  float face = 1.0 - (1.0 - clear) * (0.4 + 0.45 * exp(-rad * rad / (0.6 * D * D)));
  float lively = 1.0 - 0.7 * dull;
  // (Finer work only where the token is big enough to hold it.)
  float big = smoothstep(14.0, 30.0, R);
  vec3 col = vec3(0.0);

  vec2 pl = slayer_plane(p, hc, tilt, roll);
  float rho = length(pl);
  float th = atan(pl.y, pl.x);
  // How many px on screen one unit of rho is here (across the path), and
  // one radian of turn (along it), so edges keep their width in px.
  float grad = length(vec2(pl.x, pl.y / tilt)) / max(rho, 1e-3);
  float tg = rho * length(vec2(sin(th), tilt * cos(th)));
  float nearK = smoothstep(-0.15, 0.15, sin(th));
  float seen = mix(clear, 1.0, nearK) * (0.6 + 0.4 * nearK) * mix(1.0, face, nearK);
  float G = D + 1.0;
  float span = E - G;
  float fr = (rho - G) / span;
  // (Counted from half a radian ahead of the edge, so its soft leading side is whole.)
  float lag = mod(head - th + 0.5, 2.0 * PI) - 0.5;
  // (The slash and the wet sheen behind it keep a short length of their
  // own; only the cyclone's streaks run the trail's whole length.)
  float Ts = min(T, 1.8);
  float u = lag / Ts;
  float a = max(lag, 0.0);
  // (Blood flies off it only in a moment's rush: at rest, none.)
  float wet = smoothstep(1.1, 1.8, blood);
  // (Its light goes with its cut: gone for the strike, faint as he falters.)
  float steelK = smoothstep(0.25, 0.9, T) * (1.0 - 0.6 * dull);
  if (lag < T && fr > -0.15 && fr < 1.3) {
    float frc = clamp(fr, 0.0, 1.0);
    float dOut = (rho - E) / max(grad, 1e-3);
    // The point's path is its outer edge: soft, but no wider than a pixel or two.
    float outer = 1.0 - smoothstep(-0.8, 1.0, dOut);
    float inner = smoothstep(-0.1, 0.3, fr);
    // (All of it fades out before the cut's end, so nothing stops short.)
    float tail = 1.0 - smoothstep(0.6, 1.0, u);

    // The cyclone's trail: one swept wake behind the blade, as Cyclone's
    // swirl is, through a great part of its turn. A crescent: widest and
    // brightest right behind the edge, where it fills most of the width the
    // blade swept, then narrowing toward the point's path and fading as it
    // goes, until only the outermost streaks are left. Within it the wind
    // tears it into streaks, each its own strength and broken along its
    // length, so none closes into a ring.
    float ul = a / T;
    // (Its inner side, closing in toward the point's path as it trails.)
    float inEdge = mix(0.15, 0.9, pow(ul, 0.75));
    float crescent = smoothstep(inEdge - 0.12, inEdge + 0.12, fr) * outer * exp(-ul * 2.4) * (1.0 - smoothstep(0.55, 1.0, ul)) * smoothstep(0.03, 0.3, a);
    float which = vnoise(vec2(frc * 14.0 + seed * 2.1, seed * 3.7 + ul * 1.5));
    float torn = vnoise(vec2(frc * 9.0 + seed * 4.3, ul * 11.0 + seed * 1.9));
    float streaks = (0.2 + 0.8 * smoothstep(0.3, 0.8, which)) * (0.25 + 0.75 * smoothstep(0.25, 0.65, torn));
    float swirl = crescent * streaks * (0.4 + 0.6 * frc);
    vec3 swc = mix(SLAYER_BLOOD * 1.35, SLAYER_DEEP * 2.0, smoothstep(0.0, 0.7, ul));
    col += swc * swirl * 0.95 * mix(0.65, 1.0, big) * seen * lively * (0.3 + 0.7 * clear);

    // The slash: at its head the outer half of the blade, its leading side
    // a hard line (px ahead of or behind it); behind that it tapers along
    // the point's path to a hair. Streaked along its path as a blade's
    // smear is, and brightest at its outer edge.
    float dl = lag * tg;
    float uc = a / (0.62 * Ts);
    float thick = 0.5 * pow(max(1.0 - uc, 0.0), 1.4);
    float edgeIn = 1.0 - thick;
    // (Its inner side soft over about a pixel and a half, in fr's units.)
    float soft = (1.5 + 0.03 * R) * grad / max(span, 1.0);
    float within = smoothstep(edgeIn - soft, edgeIn + soft, fr) * outer;
    float lead = smoothstep(-1.0 - 0.015 * R, 0.6 + 0.01 * R, dl);
    float across = clamp((fr - edgeIn) / max(thick, 1e-3), 0.0, 1.0);
    float brushed = 0.55 + 0.55 * vnoise(vec2(frc * 26.0, seed * 5.0 + 1.3 + uc * 1.5));
    float slash = within * lead * (1.0 - smoothstep(0.75, 1.0, uc)) * pow(max(1.0 - uc, 0.0), 0.8) * (0.4 + 0.6 * across) * brushed;
    // Scarlet through its body; the steel's white only along its outer
    // edge close behind the blade (less of it on a small token), going to
    // dark blood at its tail.
    float rimK = smoothstep(0.6, 0.97, across) * exp(-uc * 3.5);
    vec3 sc = mix(SLAYER_SCARLET * 0.8, SLAYER_EDGE * mix(0.8, 1.2, big), rimK);
    sc = mix(sc, SLAYER_BLOOD, smoothstep(0.45, 1.0, uc));
    // (Faint over the face, where red light on its colour would turn it a pale wash.)
    col += sc * slash * seen * steelK * tail * (0.25 + 0.75 * clear);
    // The leading edge itself, the blade where it is now: a fine line along
    // the slash's head, the light catching the steel.
    float wl = 0.5 + 0.012 * R;
    float edgeLine = exp(-dl * dl / (wl * wl)) * smoothstep(edgeIn - soft, 0.75, fr) * outer;
    col += SLAYER_EDGE * edgeLine * mix(0.5, 0.9, big) * seen * steelK * (0.35 + 0.65 * clear);

    // The cut: streaks along the path, as a blade through blood leaves,
    // each radius its own brightness and length, the outer ones the
    // longest. (Each streak's brightness wanders along it too, so they never
    // close into rings, and their lengths differ more than their brightness.)
    float ln = 0.4 + 0.6 * vnoise(vec2(frc * 10.0, seed * 7.0 + u * 2.5));
    float fine = 0.65 + 0.35 * vnoise(vec2(frc * 27.0, seed * 3.0 + 4.0 + u * 4.0));
    float lv = vnoise(vec2(frc * 7.0 + 3.1, seed * 11.0));
    float len = (0.18 + 0.82 * pow(frc, 1.3)) * (0.45 + 0.75 * lv);
    float uu = max(u, 0.0) / len;
    // (It rises out of the slash, never ahead of the edge.)
    float fan = exp(-uu * 2.4) * (1.0 - smoothstep(0.5, 1.0, uu)) * smoothstep(0.03, 0.2, a);
    // (Brightest where the point ran, the inner half no more than a haze.)
    float body = 0.14 + pow(smoothstep(0.1, 1.0, frc), 1.6);
    // (In a rush of blood each streak breaks where it ran thin: a spatter.
    // At rest it is a smooth wet sheen.)
    float brk = smoothstep(0.32, 0.62, vnoise(vec2(frc * 31.0 + seed * 1.7, uu * 7.0 + seed * 2.3)));
    float cut = fan * body * ln * fine * outer * inner * mix(1.0, 0.4 + 0.6 * brk, wet) * mix(0.6, 1.0, wet);
    // Heavy and wet: deep blood through the fan, and where a streak runs
    // thick it takes the light.
    vec3 wc = mix(SLAYER_BLOOD * 1.5, SLAYER_BLOOD * 1.1, smoothstep(0.1, 0.6, uu));
    wc = mix(wc, SLAYER_DEEP * 1.8, smoothstep(0.55, 1.0, uu));
    wc += SLAYER_WET * 0.6 * smoothstep(0.7, 0.92, ln * fine) * exp(-uu * 1.6);
    // (Fainter on a small token, so a row of them stays apart.)
    col += wc * cut * (1.0 + 0.6 * blood) * mix(0.6, 1.0, big) * seen * lively * (0.3 + 0.7 * clear);
  }

  // Drops of blood flung off the edge as it passes, riding behind the blade
  // and drifting outward as they trail, some past the point's path: a fine
  // spray and, fewer, heavy drops, every one its own size and drawn out
  // along its flight, deep red with a gloss on its upper side, a heavy one
  // trailing a thread of blood. (On a token big enough to hold them; each in
  // a cell of its own, sized in px and kept well inside it, so no cell's
  // edge can cut one.)
  if (wet > 0.0 && big > 0.0 && lag > 0.0 && lag < 1.3 * Ts && fr > 0.0 && fr < 1.25 + 0.45 * Ts) {
    float fb = fr - 0.35 * a;
    float life = wet * exp(-a / (0.6 * Ts)) * smoothstep(0.0, 0.06, a) * (1.0 - smoothstep(0.85 * Ts, 1.3 * Ts, a));
    for (int k = 0; k < 2; k++) {
      float heavy = float(k);
      vec2 g = mix(vec2(14.0, 11.0), vec2(6.0, 4.5), heavy);
      vec2 cell = vec2(fb * g.x, a * g.y);
      vec2 ci = floor(cell);
      float h = hash12(ci + vec2(seed * 17.0 + heavy * 5.1, 3.0 + heavy * 9.3));
      if (h > mix(0.72, 0.62, heavy) && ci.x >= 1.0 && ci.x <= g.x - 1.0) {
        // (A cell's size on screen: across the path, and along it.)
        vec2 cpx = vec2(span / (g.x * max(grad, 1e-3)), tg / g.y);
        vec2 j = vec2(hash12(ci + 7.7), hash12(ci + 2.3)) - 0.5;
        float hs = hash12(ci + 4.1 + heavy);
        float rad0 = mix(0.35 + 0.012 * R, 0.8 + 0.03 * R, heavy) * (0.45 + 0.75 * hs * hs);
        float room = 0.3 * min(cpx.x, cpx.y);
        float rd = min(rad0, room);
        // (Drawn out along its flight: the path's way.)
        float longer = 1.25 + 1.1 * hash12(ci + 9.9);
        vec2 l = (fract(cell) - 0.5 - 0.15 * j) * cpx;
        vec2 e = vec2(l.x / rd, l.y / (rd * min(longer, 0.33 * cpx.y / rd)));
        // (Nothing reaches its cell's ends.)
        float inCell = 1.0 - smoothstep(0.32, 0.47, abs(fract(cell.y) - 0.5));
        float body = (1.0 - smoothstep(0.7, 1.15, length(e))) * inCell;
        // A heavy drop's thread trailing it, thinning.
        float thread = heavy * exp(-l.x * l.x / (0.12 * rd * rd)) * smoothstep(0.0, 0.5 * rd, l.y) * exp(-l.y / (0.25 * cpx.y)) * 0.55 * inCell;
        // Its gloss: a small hot spot on its upper side, toward the light.
        vec2 gl = e - vec2(-0.32, -0.38);
        float shine = exp(-dot(gl, gl) / 0.05) * smoothstep(0.9, 1.6, rd);
        vec3 dc = mix(SLAYER_BLOOD * 1.25, SLAYER_DEEP * 2.2, smoothstep(0.0, 1.0, length(e))) * (body + thread) + SLAYER_GLOSS * shine;
        col += dc * life * (0.85 + 0.5 * blood) * big * seen * lively * (0.7 + 0.5 * hs) * mix(0.25, 1.0, clear);
      }
    }
  }

  // A highlight running down the edge as the blade's flat turns to the eye
  // (its broadside, at either side of its turn): a soft spot of light drawn
  // out along the edge, warm, never a star.
  vec2 dir = vec2(cos(head), sin(head));
  vec2 lp = rot2(p, -roll) - vec2(0.0, hc);
  vec2 a0 = G * vec2(dir.x, tilt * dir.y);
  vec2 ab = (E - G) * vec2(dir.x, tilt * dir.y);
  float hk = smoothstep(-0.15, 0.15, dir.y);
  float hseen = mix(clear, 1.0, hk) * mix(1.0, face, hk) * (0.55 + 0.45 * hk);
  float broad = exp(-dir.y * dir.y * 30.0) * mix(0.25, 1.0, big);
  float gt = clamp(0.6 + 2.0 * dir.y * sign(dir.x), 0.1, 0.95);
  vec2 gd = lp - (a0 + ab * gt);
  vec2 an = normalize(ab + vec2(1e-4, 0.0));
  float ga = dot(gd, an);
  float gc = dot(gd, vec2(-an.y, an.x));
  float gl = 1.2 + 0.1 * R;
  float gw = 0.6 + 0.01 * R;
  col += SLAYER_EDGE * exp(-ga * ga / (gl * gl) - gc * gc / (gw * gw)) * broad * 0.9 * hseen * steelK;

  // (Fainter over the face, where its red would turn the face's colour pale:
  // the blood it leaves there is a smear on the page, slayer.ts.)
  if (s.x > 0.0) col += slayer_strike(p, D, s.x, s.y, seed) * mix(0.4, 1.0, clear);
  return col;
}

// The whirlwind and the glow (see the top of this file).
vec3 slayer_whirl(vec2 p, float seed, float D, float E, float wind, float hc, vec4 r, float leech) {
  float blood = r.y;
  float dull = r.z;
  float nw = r.w;
  float R = max(D - 3.0, 4.0);
  float rad = length(p);
  float clear = smoothstep(D - 0.7, D + 0.7, rad);
  float face = 1.0 - (1.0 - clear) * (0.4 + 0.45 * exp(-rad * rad / (0.6 * D * D)));
  float lively = 1.0 - 0.7 * dull;
  vec3 col = vec3(0.0);

  float pull = 1.0 - 0.4 * smoothstep(0.0, 0.7, leech);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= nw) break;
    float pres = clamp(nw - fi, 0.0, 1.0);
    float h1 = hash12(vec2(fi * 7.13 + 1.7, seed * 13.1 + 3.0));
    float h2 = hash12(vec2(fi * 3.71 + 9.2, seed * 5.3 + 1.0));
    float h3 = hash12(vec2(fi * 5.37 + 4.4, seed * 9.7 + 7.0));
    // Its climb, by the whirlwind's own turns: it halts when the whirl does.
    float life = fract(wind * (0.032 + 0.018 * h2) + h1);
    float env = smoothstep(0.0, 0.25, life) * (1.0 - smoothstep(0.6, 1.0, life));
    float h = hc + mix(0.55, -0.8, life) * D;
    float Rr = D * (1.1 + 0.75 * life) * pull;
    vec2 wp = slayer_plane(p, h, SLAYER_TILT, SLAYER_ROLL);
    float wr = length(wp);
    float wa = atan(wp.y, wp.x);
    float wg = length(vec2(wp.x, wp.y / SLAYER_TILT)) / max(wr, 1e-3);
    float wd = (wr - Rr) / max(wg, 1e-3);
    float wlen = (0.8 + 0.9 * h3) * (0.7 + 0.3 * env);
    float wlag = mod(wind * (0.8 + 0.3 * h2) + h1 * 6.2832 - wa, 2.0 * PI);
    // (Skipped only where even its veil has faded to nothing: three of its widths out.)
    if (wlag < wlen && abs(wd) < 14.0 * (0.5 + 0.022 * R)) {
      float wu = wlag / wlen;
      // A thread of blood, thicker at its head, in a faint veil of the
      // spray it carries, frayed along its length; a wet bead leads it.
      float ww = (0.5 + 0.022 * R) * (1.35 - 0.6 * wu);
      float wv = 3.5 * ww;
      float fray = 0.45 + 0.75 * vnoise(vec2(wu * 5.0 + fi * 3.3, seed * 4.0 + fi));
      float line = (exp(-wd * wd / (ww * ww)) + 0.22 * exp(-wd * wd / (wv * wv))) * fray;
      float along = smoothstep(0.0, 0.1, wu) * pow(1.0 - wu, 1.5);
      // (A wet bead at its head, and smaller ones strung along it.)
      float onThread = exp(-wd * wd / (1.6 * ww * ww));
      float bead = exp(-pow((wu - 0.06) / 0.04, 2.0)) * onThread;
      float bc = wu * 9.0 + h1 * 3.0;
      float bh = hash12(vec2(floor(bc), fi + seed * 3.0));
      bead += step(0.55, bh) * exp(-pow((fract(bc) - 0.5) / 0.12, 2.0)) * onThread * 0.55 * (1.0 - wu) * smoothstep(0.1, 0.2, wu);
      float wn = smoothstep(-0.15, 0.15, sin(wa));
      // (Faint as it crosses the face: red light over a pale face turns it pink.)
      float wseen = mix(clear, 1.0, wn) * (0.5 + 0.5 * wn) * mix(1.0, face, wn) * mix(0.3, 1.0, clear);
      float k = env * pres * wseen * lively * (0.85 + 0.3 * min(blood, 1.5) + 0.3 * leech);
      col += mix(SLAYER_DEEP * 2.0, SLAYER_SCARLET, 0.35 * (1.0 - wu) + 0.3 * h3) * line * along * k * 0.9;
      col += SLAYER_WET * bead * k * 0.7;
    }
  }

  // The deep glow seeping out from behind the token, and a wider haze, both
  // wider than tall.
  float re = length(p * vec2(1.0, 1.4));
  float g = exp(-max(re - D, 0.0) / (0.4 * D + 1.0)) * 0.3 + exp(-re / (1.3 * D)) * 0.08;
  // (It never swells: a kill's moment is in the blood, not a halo.)
  col += SLAYER_DEEP * g * clear * (0.4 + 0.6 * min(blood, 1.0)) * lively;

  // The blood's light on the token's own face: a red light from below, off
  // the whirl at his waist, caught along its lower rim and fading up it.
  // (Over the face only: clear is 0 there. Kept to the rim: red light over
  // a pale face turns it pink.)
  float inside = 1.0 - clear;
  float rimL = exp(-max(D - rad, 0.0) / (0.2 * D + 1.0));
  float below = smoothstep(-0.5 * D, 0.9 * D, p.y);
  col += SLAYER_BLOOD * inside * rimL * below * (0.12 + 0.06 * min(blood, 1.4)) * lively;
  return col;
}

vec3 aura_slayer(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  if (r.w < 0.0) return slayer_blade(p, seed, q.x, q.y, q.z, q.w, r, s);
  return slayer_whirl(p, seed, q.x, q.y, q.z, q.w, r, s.z);
}
`;
