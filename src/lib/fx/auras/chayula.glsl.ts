// The chayula aura's light in the effects shader (shaders.ts): `aura_chayula`,
// given the pixel's place (CSS px from the shape's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `chayula_...`, so no two auras' names meet.
//
// The dark itself is the page's (chayula.ts lays it under the avatar): light
// can't darken. What is drawn here is the light round it: the horizon where
// the dark begins, a faint haze of the light it is drinking, the maelstrom on
// its tilted plane (lanes of light falling in and dying at the horizon; the
// far half hidden by the token and dimmed by the dark, the near half over
// the face), the wave it gulps on a beat, and the remnants: little flames
// standing on that plane.
//
// q: the token's radius with its rim, the horizon's, how far the light has
// fallen (its phase: each packet falls once per unit), the horizon's flare
// (below 0 it gutters). r: how far the remnants are blown out, the gulp's
// radius and strength (on the plane), the reach (on the plane). s: how many
// remnants (the last partway alight; below 0 while they go out), the detail
// (0 on a small token, 1 from 64 px), its power (a streak, 0 to 1). Lengths
// in CSS px.

export const GLSL = `
// The maelstrom's plane: how much it is foreshortened, and its roll (rad).
const float CHAYULA_TY = 0.5;
const float CHAYULA_ROLL = 0.2;

// One packet of light falling in along lane id: its head's radius, how fast
// it falls (px per unit of phase) and how far through its fall it is (0 to
// 1; it crosses the horizon at 0.8). Packets set off in a fixed order round
// the plane (every fifth lane), so the landings step round it.
vec3 chayula_packet(float id, float n, float flow, float reach, float rd, float rim) {
  const float EDGE = 0.8;
  float ph = fract(flow + fract(id * 5.0 / n) + 0.08 * hash12(vec2(id, 3.7)));
  float rh;
  float sp;
  if (ph < EDGE) {
    // Slow far out, quickening as it nears the dark.
    float t = ph / EDGE;
    rh = mix(reach, rd, t * t);
    sp = 2.0 * t * (reach - rd) / EDGE;
  } else {
    float t = (ph - EDGE) / (1.0 - EDGE);
    sp = (rd - rim) * 0.75 / (1.0 - EDGE);
    rh = rd - t * (rd - rim) * 0.75;
  }
  return vec3(rh, sp, ph);
}

// A remnant's colour, as Into the Breach manifests them: Chayula's violet,
// the crimson that gives life and the azure that gives mana. Under Lucid
// Dreaming (a streak's power) they all burn violet.
vec3 chayula_tint(float i, float power) {
  float k = mod(i, 5.0);
  vec3 c = vec3(1.1, 0.3, 2.5);
  if (k > 0.5 && k < 1.5) c = vec3(2.0, 0.22, 0.45);
  if (k > 1.5 && k < 2.5) c = vec3(0.3, 0.7, 2.3);
  return mix(c, vec3(1.1, 0.3, 2.5), smoothstep(0.45, 0.95, power));
}

// One Flame of Chayula: d is the pixel from its root, ax its axis (unit, root
// to tip), hgt its height and wid its belly's half width (px). A teardrop of
// fire: a round root, pale and hot, narrowing to a wavering tip of its own
// deep colour, its upper half split into tongues that lick upward and hollow
// at the heart, as chaos fire burns darker within.
vec3 chayula_flame(vec2 d, vec2 ax, float hgt, float wid, vec3 tint, float time, float id) {
  float v = dot(d, ax);
  float x = dot(d, vec2(-ax.y, ax.x));
  float vn = v / hgt;
  float up = clamp(vn, 0.0, 1.0);
  // The tip wavers; the root holds still.
  x += hgt * 0.15 * up * up * (2.0 * vnoise(vec2(vn * 2.2 - time * 2.6, id * 7.3 + time * 0.9)) - 1.0);
  float wv = vn < 0.0 ? wid * 1.06 : wid * (pow(1.0 - up, 0.8) * (1.0 + 1.1 * up * (1.0 - up)) + 0.06);
  float dist2 = (x * x + (vn < 0.0 ? v * v * 2.2 : 0.0)) / (wv * wv);
  float body = exp(-2.0 * dist2) * (1.0 - smoothstep(0.72, 1.0, vn));
  float lick = vnoise(vec2(x / wid * 1.6 + id * 3.1, vn * 3.0 - time * 3.4));
  body *= mix(1.0, 1.35 * smoothstep(0.2, 0.75, lick), smoothstep(0.3, 0.85, up));
  body *= 1.0 - 0.45 * exp(-dist2 * 5.0) * smoothstep(0.3, 0.6, up);
  vec3 white = vec3(2.6, 2.1, 3.0);
  vec3 c = mix(mix(tint, white, 0.3), tint, smoothstep(0.0, 0.35, up));
  c = mix(c, tint * 0.5, smoothstep(0.5, 0.95, up));
  float core = exp(-dist2 * 6.0) * smoothstep(-0.45, 0.0, vn) * (1.0 - smoothstep(0.0, 0.4, vn));
  return c * body * 0.7 + white * core * 0.3;
}

vec3 aura_chayula(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float disc = q.x;
  float rv = max(q.y, 1.0);
  float flow = q.z;
  float flare = q.w;
  float spread = r.x;
  float gulpR = r.y;
  float gulpK = r.z;
  float reach = max(r.w, rv + 1.0);
  float count = s.x;
  float detail = s.y;
  float power = s.z;
  // Line width, by the token's size.
  float w = max(0.7, 0.75 * sqrt(max(disc - 3.0, 4.0) / 16.0));
  // (Small, fewer and broader lanes: fine ones vanish there.)
  float n = detail < 0.5 ? 6.0 : 12.0;
  float broad = 1.0 - detail;
  const float tw = 2.0;
  vec3 deep = vec3(0.4, 0.07, 1.0);
  vec3 violet = vec3(1.0, 0.28, 2.3);
  vec3 pale = vec3(1.8, 1.15, 2.9);
  vec3 col = vec3(0.0);

  float rr = length(p);
  // (Never atan(0, 0): one NaN pixel at the centre would bloom over the screen.)
  float th = atan(p.y, abs(p.x) + abs(p.y) > 1e-4 ? p.x : 1.0);
  float u = th / (2.0 * PI) + 0.5;
  // What lies behind is hidden by the token (0 over it) and dimmed by the dark within the horizon.
  float clear = smoothstep(disc - 0.7, disc + 0.7, rr);
  float veil = mix(0.3, 1.0, smoothstep(rv - 2.5 * w, rv + w, rr));
  // What passes in front of the face is dimmer there, so the letter still reads.
  float face = mix(0.65, 1.0, clear);
  float flareUp = max(flare, 0.0);
  float gutter = min(flare, 0.0);

  // The light it drinks: a faint deep haze round the dark, reaching well out.
  float de = rr - rv;
  col += deep * exp(-max(de, 0.0) / (rv * 0.5)) * smoothstep(-3.0 * w, 0.0, de) * mix(0.18, 0.13, detail) * (1.0 + 0.8 * power + 0.6 * flareUp);

  // The horizon: brighter and dimmer along it, its pattern drifting the way
  // the light falls; it flares on the beat and gutters when the void falters.
  float en = pnoise(vec2(u * 28.0 - flow * 0.6 + seed, time * 0.35), 28.0);
  float en2 = pnoise(vec2(u * 9.0 - flow * 0.25 + seed * 3.0, time * 0.2), 9.0);
  // (Mostly faint and broken, so it reads as the dark's own edge, not a drawn ring.)
  float eb = mix(0.5, (0.05 + 1.1 * en * en * en) * (0.3 + 1.0 * en2 * en2), 0.6 + 0.4 * detail);
  float sputter = 1.0 + gutter * (0.75 + 0.25 * sin(time * 37.0 + u * 40.0 + seed));
  float core = exp(-de * de / (w * w * 0.45));
  float glow = de > 0.0 ? exp(-de / (w * 2.2 + rv * 0.05)) : exp(de / (w * 1.1));
  col += (mix(violet, pale, 0.15 + 0.35 * flareUp) * core * (0.35 + 1.5 * flareUp) + deep * glow * 0.35 * (1.0 + 1.5 * flareUp)) * mix(eb, 0.8, 0.4 * min(flareUp, 1.0)) * sputter * (1.0 + 0.3 * power);

  // The maelstrom, on its plane.
  vec2 P = rot2(p, -CHAYULA_ROLL);
  vec2 pl = vec2(P.x, P.y / CHAYULA_TY);
  float rp = length(pl);
  if (rp < reach && rp > disc * 0.5) {
    // How near this part of the plane is: 1 in front (below), -1 behind.
    float nearP = pl.y / rp;
    float seen = mix(clear * veil, face, smoothstep(-0.12, 0.2, nearP)) * (0.7 + 0.3 * nearP);
    float tp = atan(pl.y, pl.x);
    float dp = rp - rv;
    // Light dies as it crosses into the dark; none comes from past the reach.
    float lit = dp > 0.0 ? 1.0 : exp(dp / (w * 1.4));
    float far = 1.0 - smoothstep(rv + (reach - rv) * 0.5, reach, rp);
    // The lanes: log spirals, the light turning as it falls.
    float phi = tp + tw * log(rp / rv);
    float x = phi / (2.0 * PI) * n;
    float cell = floor(x + 0.5);
    float id = mod(cell, n);
    float across = (x - cell) * (2.0 * PI / n) * rp / sqrt(1.0 + tw * tw);
    // Each lane a faint thread, its grain running inward, brighter as it nears the dark.
    float grain = pnoise(vec2(log(rp / rv) * 7.0 + flow * 2.2, id * 3.1 + seed), 64.0);
    float nearDark = exp(-max(dp, 0.0) / (reach - rv));
    float thread = exp(-across * across / (w * w * (0.3 + 0.9 * broad))) * (0.15 + 0.85 * grain * grain) * nearDark;
    vec3 lane = violet * thread * (0.75 + 0.05 * detail) * (1.0 + 0.6 * power);

    vec3 pk = chayula_packet(id, n, flow, reach, rv, disc);
    float a = rp - pk.x;
    float tail = w * 3.0 + pk.y * 0.2;
    float along = a > 0.0 ? exp(-a / tail) : exp(-a * a / (w * w * 1.2));
    float ww = w * (0.55 + 0.35 * broad) * (1.0 - 0.5 * min(max(a, 0.0) / (tail * 2.5), 1.0));
    float body = exp(-across * across / (ww * ww)) * along;
    float head = exp(-(a * a + across * across) / (w * w * 1.5));
    float t = clamp(pk.z / 0.8, 0.0, 1.0);
    float gain = smoothstep(0.0, 0.3, pk.z) * (0.25 + 0.75 * t * t);
    lane += (violet * body * 1.1 + pale * head * 1.0) * gain * mix(0.6, 1.0, detail);

    // Fine motes between the lanes, falling faster.
    float x2 = x + 0.5;
    float cell2 = floor(x2 + 0.5);
    float id2 = mod(cell2, n);
    float across2 = (x2 - cell2) * (2.0 * PI / n) * rp / sqrt(1.0 + tw * tw);
    vec3 pk2 = chayula_packet(id2 + 0.5, n, flow * 1.6 + 0.37, reach * 0.94, rv, disc);
    float a2 = rp - pk2.x;
    float t2 = clamp(pk2.z / 0.8, 0.0, 1.0);
    lane += pale * exp(-(a2 * a2 * 0.35 + across2 * across2) / (w * w * 0.9)) * 0.6 * detail * smoothstep(0.0, 0.3, pk2.z) * t2;
    col += lane * lit * far * seen * (1.0 + 1.4 * flareUp);

    // Where a packet has just crossed, the horizon flashes there.
    float since = (pk.z - 0.8) / 0.2;
    if (since > 0.0) {
      float sp = w * 1.5 + since * rv * 0.3;
      col += pale * exp(-since * 5.0) * exp(-across * across / (sp * sp)) * exp(-dp * dp / (w * w * 2.5)) * 1.5 * seen;
    }

    // The gulp: a wave of light running in down every lane at once.
    if (gulpK > 0.0 && dp > 0.0) {
      float g = (rp - gulpR) / (w * 1.8);
      float ln = exp(-across * across / (w * w * 1.6));
      col += mix(violet, pale, 0.25) * exp(-g * g) * gulpK * (0.5 + 2.0 * ln) * far * seen;
    }
  }

  // The remnants: Flames of Chayula, standing on the dark's plane where Into
  // the Breach manifests them, each in its own place. A flame burns there a
  // while; then the wearer takes it in (it is drawn to the token, quickening,
  // its fire streaming back) and a new one manifests elsewhere. Far ones
  // stand behind the token, their tips showing over it; near ones before its
  // face, larger and brighter. The count rising, the newest flares alight;
  // falling (s.x below 0), the newest gutters out.
  float cnt = abs(s.x);
  bool falling = s.x < 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    if (fi >= cnt) break;
    float pres = clamp(cnt - fi, 0.0, 1.0);
    float h1 = hash12(vec2(fi * 1.37 + 0.5, seed));
    float h2 = hash12(vec2(fi * 2.11 + 4.1, seed));
    // Its life, L s long: it manifests, burns, and is taken in in its last
    // second. Each flame its own length of life, so they come and go out of step.
    float L = 7.0 + 7.0 * h1;
    float lp = time / L + h2;
    float gen = floor(lp);
    float lt = fract(lp) * L;
    float born = smoothstep(0.0, 0.9, lt);
    float take = clamp(lt - (L - 1.0), 0.0, 1.0);
    // Where it stands, anew each life and anywhere round the token: behind
    // it, before it or at either side. Each life it moves on round by the
    // golden angle and a random step, so it never comes back where it was
    // and the flames don't keep to one side. A little more often at the
    // sides, and nearer in before and behind, so they spread sideways (in a
    // list the next player is above and below) and few stand over the letter.
    float ang = 6.2832 * (seed + fi * 0.381966 + gen * 0.618034 + 0.36 * (hash12(vec2(fi * 7.31 + gen * 1.73, seed * 13.7 + gen * 0.37)) - 0.5));
    ang -= 0.2 * sin(2.0 * ang);
    float hr = hash12(vec2(gen * 0.91 + fi * 3.3, seed + 5.0));
    float dep = sin(ang);
    float rad = mix(rv * 1.12, mix(rv * 1.12, reach, 0.8), hr) * (1.0 - 0.14 * dep * dep) * (1.0 + spread * (0.5 + 0.6 * h1));
    vec2 rootPl = vec2(rad * cos(ang), rad * sin(ang));
    vec2 root = rot2(vec2(rootPl.x, rootPl.y * CHAYULA_TY), CHAYULA_ROLL);
    vec2 into = rot2(vec2(cos(ang), sin(ang) * CHAYULA_TY) * disc * 0.45, CHAYULA_ROLL);
    float tk = take * take;
    float sz = max(1.4, w * (1.6 + 1.8 * detail)) * (1.0 + 0.22 * dep);
    // It flickers taller and shorter, swells with the void's breath and a streak.
    float hgt = sz * 3.4 * (0.82 + 0.36 * vnoise(vec2(time * 3.3 + h1 * 17.0, fi * 5.1))) * (1.0 + 0.3 * flareUp + 0.25 * power);
    // Alight: the newest grows quickly as it catches, or sinks as it gutters.
    float grow = (falling ? pres : sqrt(pres)) * sqrt(born) * (1.0 - 0.5 * tk);
    hgt *= max(grow, 0.04);
    vec2 at = mix(root, into, tk);
    at.y -= sin(take * PI) * hgt * 0.5;
    vec2 d = p - at;
    float reachF = 3.2 * max(hgt, 3.0 * sz);
    if (dot(d, d) > reachF * reachF) continue;
    // It leans to the dark as the void draws, hard on a gulp, away when its
    // remnants are flung; and sways a little on its own.
    float lx = -at.x / max(length(at), 1.0);
    float lean = lx * (0.1 + 0.55 * gulpK - 0.9 * spread) + 0.24 * (vnoise(vec2(time * 0.6 + h2 * 13.0, fi * 2.7)) - 0.5);
    vec2 ax = normalize(vec2(lean, -1.0));
    vec2 run = into - root;
    float runL = length(run);
    if (runL > 0.5) ax = normalize(mix(ax, -run / runL, smoothstep(0.0, 0.45, take)));
    vec3 tint = chayula_tint(fi, power);
    vec3 fire = chayula_flame(d, ax, hgt, sz * 0.8 * mix(1.0, 0.6, tk), tint, time, fi + 13.0 * gen);
    vec2 hd = d - ax * hgt * 0.35;
    fire += tint * exp(-dot(hd, hd) / (hgt * hgt * 0.5)) * 0.2;
    // Its light on the ground round its root, gone as it lifts.
    vec2 gd = pl - rootPl;
    fire += tint * exp(-dot(gd, gd) / (sz * sz * 4.8)) * 0.22 * smoothstep(0.0, 0.3, born) * (1.0 - smoothstep(0.0, 0.35, take)) * min(pres * 2.0, 1.0);
    // Catching, it flares; guttering, it sputters; taken in, it burns up as it goes.
    float flick = falling ? mix(1.0, pres * (0.55 + 0.45 * sin(time * 31.0 + fi * 4.0)), 1.0 - pres) : 1.0 + 2.5 * pres * (1.0 - pres);
    flick *= 1.0 + 2.0 * born * (1.0 - born);
    flick *= (1.0 + 1.3 * take) * (1.0 - smoothstep(0.7, 1.0, take));
    float vis = mix(clear * mix(veil, 1.0, 0.4), face, smoothstep(-0.15, 0.15, dep));
    col += fire * vis * (0.75 + 0.25 * dep) * flick * smoothstep(0.0, 0.25, pres) * (1.3 + 0.4 * power);
  }
  return col;
}
`;
