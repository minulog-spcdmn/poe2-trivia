// The tower aura's light in the effects shader (shaders.ts): `aura_tower`,
// given the pixel's place (CSS px from the token's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `tower_...`, so no two auras' names meet.
//
// A Precursor engine, as their works stand in the world: the Origin Tower's
// crown and its Reactor are tiers of heavy bronze rings, each broken into
// segments, turning in steps about a core, and their beacons and leylines
// throw out amber light. Here the token is the core, and three such tiers
// turn round it, stacked one over another and seen from a little above: the
// far side of each passes behind the token, the near side crosses before it
// (faint over the face, so the letter reads). The core's light seeps out from
// behind the token, catches the bronze where it faces the core and pours out
// through the gaps between segments. Current runs round each tier on its own
// pace, lighting the studs it passes and leaping each gap with a spark, the
// gap's light reaching out for a moment as it does. Two kinds of layer,
// picked by q.x:
//
// 0, the engine: the core's light, and the tiers.
//   q: 0, the token's radius (px), the first two tiers' turns (each sent with
//   how fast it turns now: see tower_unpack).
//   r: the third tier's turn (the same), the streak's charge (0-1), its life
//   (1 whole; less as lives run out), the stutter of a jam (0-1).
//   s: how far it has woken (0-1: the tiers rise into place), how far the
//   gaps are lined up (0-1: light pours through them all), lives lost (0-3:
//   a tier sags and tips for each).
//
// 1, the reveal: a tower's reveal running out over the land from the token,
// rings of light whose far halves pass behind it, and the beacon's shaft of
// light standing up from it.
//   q: 1, the token's radius, the first two rings' ages (s; outside 0-1.8:
//   none).
//   r: the third ring's age, the shaft's age (s; outside 0-1.8: none), the
//   charge, the land's roll (rad).

export const GLSL = `
// What the token lets through from behind it at radius rr: 0 over it, 1 outside.
float tower_clear(float rr, float tok) {
  return smoothstep(tok - 0.7, tok + 0.7, rr);
}
// The token's radius with its rim (Avatar.svelte: 3 px at 32 px, as the square root of its size).
float tower_tok(float R) {
  return R + 3.0 * sqrt(max(R, 1.0) / 16.0);
}

// Tier i's light at p. Its plane stands Y px above the token's centre (up +),
// its ring rho px out, band px wide, n segments with gaps of gap (of a cell),
// turned ang (rad) and turning now at m (0-1), tipped tip (rad, about the
// screen's x axis); the camera looks down at sa (its sine).
vec3 tower_tier(vec2 p, float fi, float Y, float rho, float band, float n, float gap, float ang, float m, float tip, float sa,
                float tok, float clear, float R, float lit, float heat, float align, float stut, float time, float seed) {
  float up = -p.y;
  // Tipped: the plane's own lean adds to the camera's.
  float s2 = sin(clamp(asin(sa) + tip, 0.12, 1.2));
  float c2 = sqrt(1.0 - s2 * s2);
  // The point of the plane under p: X across, Z toward the viewer.
  float Z = (Y * c2 - up) / s2;
  float X = p.x;
  float rp = length(vec2(X, Z));
  // (Far from the band, and far from where its gaps' light reaches: nothing.)
  if (abs(rp - rho) > band * 0.5 + 2.6 * R + 4.0) return vec3(0.0);
  float depth = Z * c2 + Y * s2;
  float front = smoothstep(-0.2 * tok, 0.2 * tok, depth);
  float seen = mix(clear, 1.0, front) * mix(1.0, 0.16, (1.0 - clear) * front);
  float near = clamp(0.5 + 0.5 * Z / max(rho, 1.0), 0.0, 1.0);
  // A screen pixel spans this much of the plane, across the band.
  float aa = 0.6 + 0.9 * abs(Z / max(rp, 1e-3)) / s2;
  float phi = atan(X, Z);
  float psi = phi - ang;
  float cell = 2.0 * PI / n;
  float k = floor(psi / cell);
  float sc = (psi - k * cell) / cell;
  float h = hash12(vec2(mod(k, n) + fi * 7.0, seed * 3.1 + fi));
  // Each segment cast its own: its gaps a little wider or narrower.
  float g0 = gap * (0.4 + 0.25 * h);
  float g1 = gap * (0.4 + 0.25 * hash12(vec2(mod(k + 1.0, n) + fi * 7.0, seed * 3.1 + fi)));
  float ea = aa / (cell * rho);
  float inSeg = smoothstep(g0 - ea, g0 + ea, sc) * (1.0 - smoothstep(1.0 - g1 - ea, 1.0 - g1 + ea, sc));
  // How far from the nearest gap's middle, and from the segment's nearer end (px along the ring).
  float dGap = min(sc, 1.0 - sc) * cell * rho;
  float dEnd = min(sc - g0, 1.0 - g1 - sc) * cell * rho;
  // Across the band: -1 its inner edge (toward the core), 1 its outer.
  float u = (rp - rho) / (band * 0.5);
  float ub = aa / band * 2.0;
  float body = smoothstep(-1.0 - ub, -1.0 + ub, u) * (1.0 - smoothstep(1.0 - ub, 1.0 + ub, u));
  float inner = exp(-(u + 0.82) * (u + 0.82) * band * band / (4.0 * aa * aa + 0.6));
  // The segment is cast in blocks, two to four, with a groove between each.
  float nb = 2.0 + floor(h * 3.0);
  float bl = (sc - g0) / max(1.0 - g0 - g1, 0.05) * nb;
  float gd = (fract(bl + 0.5) - 0.5) * (1.0 - g0 - g1) * cell * rho / nb;
  float groove = exp(-gd * gd / (0.35 * aa * aa + 0.08)) * step(0.5, bl) * step(bl, nb - 0.5);
  // A stud in each block, as on the Precursors' floors.
  float sd = (fract(bl) - 0.5) * (1.0 - g0 - g1) * cell * rho / nb;
  float su = u * band * 0.5 - 0.1 * band;
  float stud = exp(-(sd * sd + su * su) / (0.3 * aa * aa + 0.02 * band * band + 0.12));
  // Wear: the bronze's face mottled, turning with it.
  float wear = 0.7 + 0.6 * vnoise(vec2(psi * rho / (0.28 * R + 1.0) + fi * 9.0, u * 1.5 + seed * 5.0));
  // A segment's ends, facing the gap, catch the core's light as it comes through.
  float ends = exp(-dEnd * dEnd / (aa * aa * 0.8 + 0.2)) * body;
  // A glint where the core's light, off its far side, comes back to the eye.
  float ga = (mod(phi - 2.6 + PI, 2.0 * PI) - PI) / 0.5;
  float glint = exp(-ga * ga);

  // Current running round the tier, segment to segment, leaping each gap:
  // each tier its own pace and way, coming and going on no fixed beat.
  float hp = hash12(vec2(fi * 3.3 + 1.0, seed * 5.7));
  float sp = (0.55 + 0.5 * hp) * (hp < 0.5 ? -1.0 : 1.0) * (1.0 + 0.7 * heat);
  float pa = time * sp + 1.2 * sin(time * (0.19 + 0.1 * hp) + fi * 2.1) + seed * 6.0 + fi * 2.0;
  float dp = (mod(phi - pa + PI, 2.0 * PI) - PI) * rho;
  float env = smoothstep(0.38, 0.72, vnoise(vec2(time * (0.17 + 0.08 * hp) + fi * 5.3, seed * 7.0 + fi)));
  float pulse = exp(-dp * dp / (0.16 * R * R + 1.0)) * (0.25 + 0.75 * env) * (0.6 + 0.4 * heat);

  vec3 bronze = mix(vec3(0.95, 0.5, 0.22), vec3(0.72, 0.34, 0.16), h);
  vec3 amber = vec3(1.6, 0.98, 0.42);
  vec3 pale = vec3(2.0, 1.75, 1.3);
  // The bronze: its face lit from the core, brightest near the inner edge and
  // dimming out across it, its grooves in shadow.
  float face = mix(0.55, 0.16, clamp(u * 0.5 + 0.5, 0.0, 1.0)) * wear * (1.0 - 0.8 * groove);
  vec3 metal = bronze * body * face * (0.8 + 0.4 * near)
             + amber * inner * (0.25 + 0.3 * h) * (1.0 - 0.7 * groove)
             + amber * ends * 0.7
             + pale * stud * body * (0.22 + 1.2 * pulse)
             + pale * glint * (inner * 0.5 + body * 0.2)
             + pale * inner * pulse * 1.4;
  vec3 col = metal * inSeg * lit;

  // The core's light through the gaps, out along the plane: short at rest;
  // reaching out far, briefly, as current leaps a gap, as the tier turns, and
  // when the gaps line up.
  float gw = gap * cell * rho * 0.5;
  float out_ = max(rp - rho + band * 0.5, 0.0);
  float wd = gw * 0.8 + out_ * 0.14 + aa;
  float atGap = exp(-dGap * dGap / (gw * gw * 3.0 + 1.0));
  float leap = pulse * atGap;
  float reach = (0.18 + 0.5 * max(m, align) + 0.75 * leap) * R + 1.0;
  // (Gone well inside the quad, however far it reaches.)
  float shaft = exp(-dGap * dGap / (wd * wd)) * sqrt(gw / wd) * exp(-out_ / reach) * smoothstep(-1.2, -0.6, u) * (1.0 - smoothstep(0.5 * R, 1.4 * R, out_));
  float throughK = (0.45 + 0.4 * m + 1.1 * align + 1.4 * leap) * lit;
  col += mix(amber, pale, 0.35 * exp(-out_ / (0.15 * R + 1.0))) * shaft * throughK;
  // The current's spark as it leaps the gap.
  float arcD = u * band * 0.5 - (vnoise(vec2(dGap * 0.9, time * 9.0 + fi * 3.0)) - 0.5) * band * 0.8;
  col += pale * exp(-arcD * arcD / (0.18 * aa * aa + 0.12)) * (1.0 - inSeg) * atGap * leap * 1.2 * lit;
  // A jam: the Precursors' lightning crackling across the gaps.
  float flash = step(0.6, hash12(vec2(mod(k, n) + fi * 5.0 + floor(time * 13.0) * 1.3, seed)));
  float jag = (u * band * 0.5) - (vnoise(vec2(dGap * 0.8, floor(time * 13.0) * 2.7 + k)) - 0.5) * band * 1.4;
  col += vec3(1.3, 1.55, 2.1) * exp(-jag * jag / 0.3) * exp(-dGap * dGap / (gw * gw * 2.0 + 1.0)) * flash * stut * 1.4;
  return col * seen * (0.55 + 0.45 * near);
}

// A tier's turn and how fast it turns now, sent as one number: the turn
// (0-2 PI) plus 8 for each twentieth of its speed (0-1).
vec2 tower_unpack(float v) {
  float k = floor(v / 8.0);
  return vec2(v - 8.0 * k, k / 20.0);
}

vec3 tower_engine(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float R = q.y;
  float tok = tower_tok(R);
  float rr = length(p);
  float clear = tower_clear(rr, tok);
  float heat = r.y;
  float life = r.z;
  float stut = r.w;
  float woke = s.x;
  float align = s.y;
  float lost = s.z;
  float flick = 1.0 - stut * (0.5 + 0.4 * sin(time * 47.0) * sin(time * 23.0 + 1.7));
  vec3 amber = vec3(1.55, 0.98, 0.44);
  vec3 pale = vec3(2.0, 1.75, 1.3);

  // The core's light, seeping out from behind the rim: pale right at it,
  // amber further out, reaching further to the sides than up and down.
  float beyond = max(rr - tok, 0.0);
  float hot = exp(-beyond / (0.9 + 0.12 * tok));
  float side = max(length(vec2(p.x * 0.75, p.y * 1.5)) - tok, 0.0);
  float wide = exp(-side / (0.45 * tok + 1.0));
  // It breathes, unevenly, and swells a little as the tiers work.
  float breath = 0.82 + 0.18 * vnoise(vec2(time * 0.35, seed * 9.0));
  float lit = (breath + 0.5 * heat + 0.4 * align) * (0.25 + 0.75 * woke) * (0.35 + 0.65 * life) * flick;
  vec3 col = (mix(amber, pale, 0.45 * hot) * hot * 0.3 + amber * wide * 0.06) * lit * clear;

  // The camera looks down a little; each token its own small lean.
  float sa = 0.36 + 0.02 * sin(time * 0.17 + seed * 4.0);
  float ca = sqrt(1.0 - sa * sa);
  vec2 pr = rot2(p, -(fract(seed * 0.731) - 0.5) * 0.16);
  float rise = 1.0 - smoothstep(0.0, 1.0, woke);
  // Small tokens sit packed in lists: their tiers stand closer in and burn
  // lower, so neighbours' engines don't run together.
  float small = 1.0 - smoothstep(12.0, 28.0, R);
  float band = 0.19 * R + 0.6;
  lit *= 1.0 - 0.4 * small;
  col *= 1.0 - 0.3 * small;
  // The tiers: the widest lowest, a lesser one round the middle, the least
  // above the brow; each its own number of segments. They sag as lives are
  // lost, the top one first.
  float sag0 = clamp(lost - 2.0, 0.0, 1.0);
  float sag1 = clamp(lost - 1.0, 0.0, 1.0);
  float sag2 = clamp(lost, 0.0, 1.0);
  // (They stand close: a thing that stays put keeps near the token.)
  float open = tok * (1.0 - 0.3 * rise);
  vec2 t0 = tower_unpack(q.z);
  vec2 t1 = tower_unpack(q.w);
  vec2 t2 = tower_unpack(r.x);
  col += tower_tier(pr, 0.0, (-0.6 - 0.6 * rise - 0.2 * sag0) * R, mix(1.36, 1.26, small) * open, band * 1.25, 5.0, 0.3, t0.x, t0.y, 0.25 * sag0, sa, tok, clear, R, lit, heat, align, stut, time, seed);
  col += tower_tier(pr, 1.0, (0.02 - 0.9 * rise - 0.2 * sag1) * R, mix(1.24, 1.18, small) * open, band, 4.0, 0.32, t1.x, t1.y, -0.22 * sag1, sa, tok, clear, R, lit, heat, align, stut, time, seed);
  col += tower_tier(pr, 2.0, (0.66 - 1.3 * rise - 0.25 * sag2) * R, 1.12 * open, band * 0.85, 3.0, 0.36, t2.x, t2.y, 0.3 * sag2, sa, tok, clear, R, lit * (1.0 - 0.6 * sag2), heat, align, stut, time, seed);
  return col;
}

// A reveal ring at age a (s) on the land: its bright edge and the faint light
// it leaves behind it.
float tower_ring(float rp, float a, float R, float H) {
  if (a < 0.0 || a > 1.8) return 0.0;
  float e = 1.0 - pow(1.0 - clamp(a / 1.5, 0.0, 1.0), 2.2);
  float rad = mix(H, 3.0 * R, e);
  float ds = rp - rad;
  float w = (0.45 + 0.04 * R) * (1.0 + 0.7 * e);
  float k = smoothstep(0.0, 0.1, a) * (1.0 - smoothstep(0.7, 1.75, a));
  float edge = exp(-ds * ds / (w * w));
  float trail = ds < 0.0 ? 0.16 * exp(ds / (0.6 * R + 1.0)) * smoothstep(H, H + 2.0, rp) : 0.0;
  return (edge + trail) * k;
}

vec3 tower_reveal(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float R = q.y;
  float tok = tower_tok(R);
  float rr = length(p);
  float clear = tower_clear(rr, tok);
  vec3 amber = vec3(1.55, 0.98, 0.44);
  vec3 pale = vec3(2.0, 1.75, 1.3);
  // The land, seen from a little above, at the lowest tier's height.
  float cz = 0.36;
  vec2 pr = rot2(p, -r.w);
  vec2 P = vec2(pr.x, (pr.y - 0.55 * R) / cz);
  float rp = max(length(P), 1e-3);
  float z = P.y / rp;
  float front = smoothstep(-0.3, 0.3, z);
  float seen = mix(clear, 1.0, front) * mix(1.0, 0.3, (1.0 - clear) * front) * (0.45 + 0.55 * (0.5 + 0.5 * z));
  float H = tok * 1.3;
  // (The ring's light is not even all round: a little more here, less there.)
  float th = atan(P.y, P.x) / (2.0 * PI) + 0.5;
  float grain = 0.75 + 0.5 * pnoise(vec2(th * 9.0, seed * 3.0), 9.0);
  float ring = tower_ring(rp, q.z, R, H) + tower_ring(rp, q.w, R, H) + tower_ring(rp, r.x, R, H);
  vec3 col = mix(amber, pale, 0.45 + 0.3 * r.z) * ring * grain * seen;

  // The beacon's shaft: light standing up from the token, behind it.
  float b = r.y;
  if (b >= 0.0 && b < 1.8) {
    float grow = 1.0 - pow(1.0 - clamp(b / 0.45, 0.0, 1.0), 3.0);
    float up = -p.y;
    float L = (3.6 + 0.8 * r.z) * R * grow;
    float bw = (0.2 + 0.08 * grow) * R + 0.7;
    float across = exp(-p.x * p.x / (bw * bw)) + 0.35 * exp(-p.x * p.x / (bw * bw * 6.0));
    float alongB = smoothstep(-tok, 0.0, up) * exp(-max(up, 0.0) / (1.5 * R + 1.0)) * (1.0 - smoothstep(0.65 * L, L + 0.5, up));
    float fade = smoothstep(0.0, 0.08, b) * (1.0 - smoothstep(0.5, 1.75, b));
    // Dust rising in it.
    float dust = 0.7 + 0.6 * vnoise(vec2(p.x / (0.4 * R + 1.0) + seed * 9.0, up / (0.35 * R + 1.0) - time * 1.4));
    col += mix(amber, pale, 0.55) * across * alongB * fade * dust * clear * 0.9;
  }
  return col;
}

vec3 aura_tower(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  if (q.x < 0.5) return tower_engine(p, time, seed, q, r, s);
  return tower_reveal(p, time, seed, q, r, s);
}
`;
