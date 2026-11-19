// The mirror aura's light in the effects shader (shaders.ts): `aura_mirror`,
// given the pixel's place (CSS px from the token's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `mirror_...`, so no two auras' names meet.
//
// The token's face is the Mirror's glass (mirror.ts). This draws its light,
// in two kinds of layer, told apart by the sign of q.x:
//
// q.x below 0, the glass: a cold silver light seeping out from behind the
// token, wider sideways than up and down; the sheen that crosses the face as
// the glass turns, the rim catching it at either end; the depths a score
// opens in it, the rim reflected in the glass again and again, and a silver
// wash on the face while they show; the flash of a score.
//   q: minus the token's radius (px), the light (1 whole), tarnish (0-1),
//      the flash (0-1).
//   r: the wash on the face (0-1), how many depths the glass shows (0-6),
//      where they fall toward (in the token's radii from its centre).
//   s: the sheen's way across (rad: the angle it travels along), the Mirror's
//      glint (0-1: its star at the glass's edge, and the fine line of silver
//      lying sideways through the token, faint at rest), where the sheen is
//      (in the token's radii from the centre, along its way).
//   (Also always: the glass's bevel, a crescent of light inside the rim.)
//
// q.x above 0, what the glass throws out: the light it catches, thrown off
// sideways as a shaft, swinging as the glass turns; and the glitter of the
// Mirror drifting slowly either side of the wearer, near and far (the token
// hides what drifts behind it), each mote catching the light as a shaft
// passes it, and now and then of itself, with the Mirror's four-pointed star.
//   q: the token's radius (px), the first shaft's angle (rad, 0 to the right,
//      +y down), its light (0-1+), its length (in the token's radii).
//   r: the second shaft's angle and light, the glitter's sparkle (0-1), tarnish.
//   s: the glitter's drift (its own clock, s), how much of it shows (0-1), 0.
//
// q.x above 0 and s.z 1, the cracks of a break: rays racing out from where
// the glass was struck to the rim, a ring round the impact, and a star
// where the blow lands.
//   q: the token's radius (px), the impact (in the token's radii), seconds since.
//   r: the rays' base angle (rad), how many, their wander, the ring's radius
//      (in the token's radii); the angles as mirror.ts cuts the shards.
//   s: the cracks' light, the blow's star, 1.
//
// q.x above 0 and s.z 2, the fine cracks of touches: up to four hairlines
// running in from near the rim, each healing after a few seconds.
//   q: the token's radius (px), then pairs of each crack's code and age (s),
//      in q.yz, q.w r.x, r.yz, r.w s.x (see mirror_chip); s.y 0; s.z 2.

export const GLSL = `
float mirror_line(float d, float w) {
  return exp(-d * d / (w * w));
}

// The colour dulled toward a grey, by tarnish.
vec3 mirror_dull(vec3 c, float t) {
  float l = dot(c, vec3(0.3, 0.5, 0.2));
  return mix(c, vec3(l) * vec3(0.62, 0.62, 0.6), t);
}

// A four-pointed star of light at o: a long arm laid sideways (arm, in the
// token's radii), a short one upright; sz scales the whole of it.
vec3 mirror_star(vec2 p, vec2 o, float tok, float k, float arm, float sz) {
  vec2 d = (p - o) / sz;
  float w = 0.32 + 0.02 * tok;
  float lx = exp(-d.y * d.y / (w * w)) * exp(-abs(d.x) / (arm * tok + 2.0));
  float ly = exp(-d.x * d.x / (w * w)) * exp(-abs(d.y) / (0.3 * arm * tok + 1.0));
  float core = exp(-dot(d, d) / (w * w * 5.0));
  float halo = exp(-length(d) / (0.12 * tok + 0.8)) * 0.2;
  return vec3(1.2, 1.3, 1.5) * (lx * 0.8 + ly * 0.6 + core * 1.5 + halo) * k;
}

vec3 mirror_glass(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = -q.x;
  float rr = length(p);
  float clear = smoothstep(tok - 0.7, tok + 0.7, rr);
  float face = 1.0 - smoothstep(tok - 0.8, tok + 0.4, rr);
  float beyond = max(rr - tok, 0.0);
  vec3 silver = vec3(0.78, 0.9, 1.22);
  vec3 col = vec3(0.0);
  // Cold light seeping out from behind the token, wider sideways than up and down.
  float side = p.x * p.x / max(rr * rr, 1e-3);
  float reach = (0.7 + 0.13 * tok) * mix(0.6, 2.4, side * side);
  float breath = 0.9 + 0.1 * sin(time * 0.7 + seed * 6.0);
  vec3 white = vec3(1.0, 1.06, 1.2);
  col += mix(silver, white, 0.5) * (exp(-beyond / reach) * 0.62 + exp(-beyond / (reach * 2.2)) * 0.1) * clear * q.y * breath;

  // Where the light falls on the glass from: above and to one side, wandering a little.
  float la = -2.25 + 0.35 * sin(time * 0.13 + seed * 7.0);
  vec2 L = vec2(cos(la), sin(la));
  // The glass's bevel: a crescent of light inside the rim toward the light,
  // and a fainter cold one opposite, as on polished glass.
  {
    vec2 n = p / max(rr, 1e-3);
    float lip = smoothstep(0.55 * tok, 0.97 * tok, rr) * face;
    float toward = pow(max(dot(n, L), 0.0), 3.0);
    float away = pow(max(-dot(n, L), 0.0), 4.0);
    col += (vec3(1.1, 1.18, 1.35) * toward * 0.38 + vec3(0.45, 0.62, 1.0) * away * 0.16) * lip * q.y;
  }
  // The Mirror's glint (s.y): its four-pointed star where the light strikes
  // the glass's edge, its long arm laid sideways; and with it, and faintly at
  // rest, a fine line of silver lying sideways through the token.
  {
    float g = s.y;
    float line = exp(-p.y * p.y / pow(0.06 * tok + 0.5, 2.0)) * exp(-max(abs(p.x) - tok, 0.0) / (0.9 * tok + 2.0)) * clear;
    col += vec3(1.0, 1.1, 1.35) * line * (0.16 + 0.55 * g) * q.y;
    if (g > 0.003) col += mirror_star(p, L * tok * 0.86, tok, 1.6 * g, 1.3, 1.0 + 0.3 * g);
  }

  // The sheen: a band of light crossing the face as the glass turns; where
  // it meets the rim, the rim catches it.
  {
    vec2 nrm = vec2(cos(s.x), sin(s.x));
    vec2 tng = vec2(-nrm.y, nrm.x);
    float pos = s.z;
    float d = dot(p, nrm) / tok - pos;
    col += vec3(1.0, 1.1, 1.32) * (exp(-d * d / 0.008) * 0.3 + exp(-d * d / 0.06) * 0.09) * face * q.y;
    if (abs(pos) < 1.0) {
      float c = sqrt(1.0 - pos * pos);
      float w = 0.35 + 0.025 * tok;
      for (int i = 0; i < 2; i++) {
        vec2 e = (nrm * pos + tng * c * (i == 0 ? 1.0 : -1.0)) * (tok + 1.0);
        vec2 de = p - e;
        float at = exp(-dot(de, de) / (tok * tok * 0.09));
        col += vec3(1.25, 1.32, 1.45) * mirror_line(rr - tok - 1.0, w) * at * 0.8 * q.y * c;
        col += mirror_star(p, e, tok, 0.3 * q.y * c * c, 0.35, 1.0);
      }
    }
  }
  // The silver wash while the glass holds its depths: brightest at the rim, as down a well of glass.
  col += vec3(0.55, 0.68, 0.95) * r.x * 0.2 * face * (0.5 + 0.5 * smoothstep(0.3 * tok, tok, rr));
  // The depths: the rim reflected in the glass, and that reflection in it
  // again, each smaller and dimmer, drawn down toward a point that wanders.
  if (r.y > 0.01) {
    float w = 0.28 + 0.018 * tok;
    for (int i = 1; i <= 6; i++) {
      float fi = float(i);
      float shown = clamp(r.y - fi + 1.0, 0.0, 1.0);
      if (shown <= 0.0) break;
      float k = pow(0.84, fi);
      vec2 c = r.zw * tok * (1.0 - k);
      float ww = w * (0.6 + 0.4 * k);
      // (Each new one opens out from the point it falls toward.)
      float grow = mix(0.35, 1.0, shown);
      float d = length(p - c) - tok * k * 0.97 * grow;
      col += vec3(1.05, 1.15, 1.4) * (mirror_line(d, ww) * 0.55 + exp(-abs(d) / (ww * 4.0)) * 0.06) * pow(0.82, fi) * shown * face * (0.4 + 0.6 * min(r.x * 2.0, 1.0));
    }
  }
  // A score's flash: light breathing out from behind the token.
  if (q.w > 0.003) col += vec3(1.1, 1.2, 1.45) * exp(-beyond / (0.9 + 0.3 * tok)) * clear * q.w * 0.9;
  return mirror_dull(col, q.z);
}

// A shaft of the light the glass throws: from inside the face out along ang.
vec3 mirror_shaft(vec2 p, float tok, float ang, float k, float len) {
  if (k < 0.003) return vec3(0.0);
  vec2 d = vec2(cos(ang), sin(ang));
  vec2 o = d * tok * 0.35;
  float along = dot(p - o, d);
  float across = dot(p - o, vec2(-d.y, d.x));
  float w = tok * 0.2 + max(along, 0.0) * 0.13;
  float body = smoothstep(-0.2 * tok, 0.7 * tok, along) * exp(-max(along, 0.0) / (len * tok));
  // (Its edges split a little colour, as through bevelled glass.)
  vec3 c = vec3(
    mirror_line(across - w * 0.18, w),
    mirror_line(across, w),
    mirror_line(across + w * 0.18, w * 1.05)
  ) * vec3(0.95, 1.05, 1.35);
  float core = mirror_line(across, w * 0.3) * 0.6;
  // (Over the face it lies faint, so the letter still reads.)
  float face = 1.0 - smoothstep(tok - 1.0, tok + 0.5, length(p));
  return (c * 0.32 + vec3(1.1, 1.2, 1.4) * core * 0.3) * body * k * mix(1.0, 0.35, face);
}

vec3 mirror_throw(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.x;
  float rr = length(p);
  vec3 col = mirror_shaft(p, tok, q.y, q.z, q.w) + mirror_shaft(p, tok, r.x, r.y, q.w);

  // The glitter: motes in a broad, flat field either side of the wearer,
  // drifting slowly sideways, near and far, each in its own way.
  if (s.y > 0.003) {
    float eye = 6.0 * tok;
    for (int i = 0; i < 18; i++) {
      float fi = float(i);
      float h1 = hash12(vec2(fi * 7.1, seed * 13.7));
      float h2 = hash12(vec2(fi * 3.3 + 1.7, seed * 5.1));
      float h3 = hash12(vec2(fi * 9.9 + 4.2, seed * 2.9));
      float h4 = hash12(vec2(fi * 1.3 + 8.8, seed * 7.7));
      float dir = h4 < 0.5 ? -1.0 : 1.0;
      // Across the field and round again, out of sight at its ends.
      float u = fract(h1 + s.x * (0.012 + 0.018 * h2) * dir);
      float x = (u * 2.0 - 1.0) * 3.4 * tok;
      float y = ((h2 * 2.0 - 1.0) * 0.62 + 0.12 * sin(s.x * (0.25 + 0.2 * h3) + h1 * 20.0)) * tok;
      float z = (h3 * 2.0 - 1.0) * 1.6 * tok;
      float sc = eye / (eye - z);
      vec2 m = vec2(x, y) * sc;
      float ends = smoothstep(1.0, 0.75, abs(u * 2.0 - 1.0));
      // (Those passing in front of the face lie faint over it, so the letter reads.)
      float off = z > 0.0 ? mix(0.45, 1.0, smoothstep(0.8 * tok, 1.2 * tok, length(m))) : 1.0;
      // Behind the token, it hides them.
      float hid = z < 0.0 ? smoothstep(tok - 0.5, tok + 0.8, length(p)) : 1.0;
      // Lit by a passing shaft, and now and then of themselves.
      float lit = 0.0;
      for (int j = 0; j < 2; j++) {
        float a = j == 0 ? q.y : r.x;
        float k = j == 0 ? q.z : r.y;
        vec2 d = vec2(cos(a), sin(a));
        float along = dot(m, d);
        float across = dot(m, vec2(-d.y, d.x));
        float w = tok * 0.2 + max(along, 0.0) * 0.13;
        lit += k * mirror_line(across, w * 1.2) * smoothstep(0.0, tok, along) * exp(-max(along, 0.0) / (q.w * tok * 1.3));
      }
      float tw = pow(max(sin(time * (0.5 + 0.7 * h2) + h1 * 40.0), 0.0), 18.0) * (0.5 + 1.5 * r.z);
      float glint = min(lit * 1.6 + tw + r.z * 0.25, 2.0);
      float near = clamp(0.5 + z / (3.2 * tok), 0.0, 1.0);
      // (Of many sizes: most fine dust, a few larger flakes.)
      float sz = sc * (0.55 + 1.1 * h4 * h4);
      vec2 dm = p - m;
      float rad = sz * (0.4 + 0.025 * tok);
      float dot0 = exp(-dot(dm, dm) / (rad * rad));
      float base = 0.3 * (0.5 + 0.5 * near);
      col += vec3(0.9, 1.0, 1.25) * dot0 * base * ends * off * hid * s.y;
      if (glint > 0.02) col += mirror_star(p, m, tok, glint * 0.55 * ends * off * hid * s.y * (0.6 + 0.4 * near), 0.4, sz);
    }
  }
  return mirror_dull(col, r.w);
}

// The cracks: from the impact out to the rim, each ray racing out from it,
// and a ring round it, the lines of the shards the glass breaks into (as
// mirror.ts cuts them, by the same angles).
vec3 mirror_cracks(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.x;
  float rr = length(p);
  float face = 1.0 - smoothstep(tok - 0.6, tok + 0.6, rr);
  vec2 P = q.yz * tok;
  float age = q.w;
  float n = r.y;
  float w = 0.3 + 0.02 * tok;
  vec3 col = vec3(0.0);
  float lines = 0.0;
  float tips = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    if (fi >= n) break;
    float a = r.x + (fi + 0.35 * sin(fi * 2.7 + r.z)) * 2.0 * PI / n;
    vec2 d = vec2(cos(a), sin(a));
    // Out to the rim, racing.
    float pd = dot(q.yz, d);
    float t = (-pd + sqrt(max(pd * pd - (dot(q.yz, q.yz) - 1.0), 0.0))) * tok;
    float len = min(t, age * 9.0 * tok + 0.5);
    vec2 v = p - P;
    float h = clamp(dot(v, d), 0.0, len);
    float dd = length(v - d * h);
    // (A crack is not straight: it kinks a little along its way.)
    dd += 0.25 * w * sin(h / tok * 23.0 + fi * 3.1);
    lines += mirror_line(dd, w) + exp(-dd / (w * 4.0)) * 0.08;
    if (len < t) tips += exp(-length(p - P - d * len) / (w * 3.0));
  }
  // The ring round the impact.
  float ring = r.w * tok;
  float dr = abs(length(p - P) - ring);
  lines += mirror_line(dr, w * 0.9) * smoothstep(0.05, 0.12, age) * 0.85;
  col += vec3(1.15, 1.25, 1.5) * lines * s.x * face;
  col += vec3(1.4, 1.45, 1.6) * tips * 1.4 * face;
  // The blow: a star where it lands.
  if (s.y > 0.003) col += mirror_star(p, P, tok, 1.8 * s.y, 1.2, 1.0 + 0.6 * s.y);
  return col;
}

// One fine crack a touch leaves in the glass (mirror_chips): code holds its
// pattern (whole part over 8) and where on the face it starts (the rest: rad
// round the centre); age is seconds since (below 0, none). It runs in from
// near the rim in three straight runs, kinked where they meet, with a short
// branch off the first kink and another where it starts; a hairline of light with the cut edge's colour split either side
// of it, brighter where its run faces the light. It races out with a bright
// tip, a glint creeps along it, and after a while it heals from the tip back.
vec3 mirror_chip(vec2 p, float tok, float code, float age) {
  if (age < 0.0 || age > 4.2) return vec3(0.0);
  float id = floor(code / 8.0);
  float oa = code - id * 8.0;
  float h1 = hash12(vec2(id, 1.7));
  float h2 = hash12(vec2(id, 5.3));
  float h3 = hash12(vec2(id, 9.1));
  float h4 = hash12(vec2(id, 13.9));
  vec2 o = vec2(cos(oa), sin(oa)) * tok * (0.62 + 0.2 * h1);
  float ang = oa + PI + (h2 - 0.5) * 1.3;
  float total = tok * (0.48 + 0.22 * h3);
  float w = 0.2 + 0.011 * tok;
  // Racing out, quick and slowing; then the glass healing it from the tip back.
  float g = clamp(age / 0.14, 0.0, 1.0);
  float grown = total * (1.0 - pow(1.0 - g, 3.0));
  float heal = smoothstep(2.4, 3.9, age);
  float reach = grown * (1.0 - heal);
  // A glint creeping along it once it has formed.
  float gpos = (fract(age * 0.32 + h4) * 1.8 - 0.4) * total;
  vec2 L = vec2(-0.63, -0.78);
  vec3 col = vec3(0.0);
  vec2 a0 = o;
  float s0 = 0.0;
  vec2 tip = o;
  vec2 kink = o;
  float first = ang;
  float fork = h1 < 0.5 ? -1.0 : 1.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    // Runs 0 to 2 are the crack; run 3 the branch off the first kink; run 4
    // a short one splitting off where it starts, the other way.
    float seg = i == 0 ? 0.42 * total : i == 1 ? 0.33 * total : i == 2 ? 0.25 * total : i == 3 ? (0.28 + 0.12 * h4) * total : (0.2 + 0.1 * h3) * total;
    vec2 st = a0;
    float start = s0;
    float a = ang + (hash12(vec2(id, 20.0 + fi)) - 0.5) * 0.9;
    if (i == 3) {
      st = kink;
      start = 0.42 * total;
      a = first + fork * (0.55 + 0.4 * h2);
    } else if (i == 4) {
      st = o;
      start = 0.0;
      a = first - fork * (0.7 + 0.4 * h4);
    } else {
      ang = a;
      if (i == 0) first = a;
    }
    vec2 dir = vec2(cos(a), sin(a));
    float avail = clamp(reach - start, 0.0, seg);
    vec2 v = p - st;
    float h = clamp(dot(v, dir), 0.0, avail);
    float across = dot(v, vec2(-dir.y, dir.x));
    float dd = length(v - dir * h);
    float sd = sign(across) * dd;
    // (Faint as it begins, so no dot shows ahead of the tip.)
    float on = smoothstep(0.0, 2.0 * w, avail);
    // A run facing the light catches it; one edge-on to it barely shows.
    float catchL = 0.4 + 0.6 * pow(abs(dot(vec2(-dir.y, dir.x), L)), 1.5);
    float along = start + h;
    float glint = exp(-pow((along - gpos) / (0.07 * tok + 1.0), 2.0)) * smoothstep(0.2, 0.5, age);
    float core = mirror_line(dd, w);
    vec3 cut = vec3(mirror_line(sd - 1.6 * w, 1.3 * w), mirror_line(sd - 0.4 * w, 1.3 * w), mirror_line(sd + 1.4 * w, 1.4 * w)) * vec3(0.18, 0.28, 0.55);
    col += (vec3(1.25, 1.32, 1.5) * core * (1.3 + 2.0 * glint) * catchL + cut * catchL + vec3(0.6, 0.72, 1.0) * exp(-dd / (w * 5.0)) * 0.035) * on;
    if (i < 3) {
      if (reach > start && reach <= start + seg) tip = st + dir * (reach - start);
      a0 = st + dir * seg;
      if (i == 0) kink = a0;
      s0 += seg;
    }
  }
  // The tip, bright as it races; and the touch's own glint where it starts, brief.
  col += vec3(1.4, 1.45, 1.6) * exp(-length(p - tip) / (w * 2.2)) * (1.0 - g) * 1.4;
  col += mirror_star(p, o, tok, 0.7 * exp(-age / 0.12), 0.45, 0.55);
  return col * (1.0 - 0.5 * heal);
}

// The fine cracks of touches, up to four at once (mirror_chip): each a code
// and an age, in q.yz, q.w r.x, r.yz, r.w s.x; inside the glass only.
vec3 mirror_chips(vec2 p, vec4 q, vec4 r, vec3 s) {
  float tok = q.x;
  float glass = 1.0 - smoothstep(tok - 1.2, tok - 0.2, length(p));
  vec3 col = mirror_chip(p, tok, q.y, q.z) + mirror_chip(p, tok, q.w, r.x) + mirror_chip(p, tok, r.y, r.z) + mirror_chip(p, tok, r.w, s.x);
  return col * glass;
}

vec3 aura_mirror(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  if (q.x < 0.0) return mirror_glass(p, time, seed, q, r, s);
  if (s.z > 1.5) return mirror_chips(p, q, r, s);
  if (s.z > 0.5) return mirror_cracks(p, time, seed, q, r, s);
  return mirror_throw(p, time, seed, q, r, s);
}
`;
