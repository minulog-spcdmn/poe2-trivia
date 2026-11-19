// The lich aura's light in the effects shader (shaders.ts): `aura_lich`,
// given the pixel's place (CSS px from the token's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `lich_...`, so no two auras' names meet.
//
// Unholy Might, as the Witch's Lich wears it on her passive tree's icons:
// her power welling up out of her in streams of crackling threads, white-hot
// at their hearts, violet, blue and magenta in their glow, on the cold violet
// of her storm. Two kinds of shape, told apart by q.z:
//
// Her light (q.z = 0): the power welling up behind the token, seeping out
// past its rim where the streams spring, and steeping the token's face in
// her violet.
//   q: the token's radius with its rim (px), the light (1 at rest), 0, a flare (0-1).
//   r: how far the face is steeped (0-1), the streams' light at the left
//   side and at the right (0-1 each), the light's own slow drift.
//   s: chill (0-1), x, x.
//
// A stream (q.z, its way: + right, - left): a cord of a few fine threads
// running out to one side, from behind the token (a far one) or crossing its
// rim in front (a near one), or wrapping round it: a front one comes round
// the token's far side from behind and crosses its face low down, dipping
// toward the eye as it passes; a back one runs on behind the token and out a
// little past its far side. Its centre line leaves the rim heading outward,
// bends away along its slope and curls up (or down) the further it runs, by
// its curl, with a gentle wave; it never curls back toward the token. So near
// the token it lies sideways, and its head rises. Its threads braid, each
// winding across it on its own slow wave, and crackle, a zigzag struck anew
// several times a second on its own beat; each burns white at its heart.
// It shows between its tail and its head, measured along its way
// from the token's centre; its threads each end, and once it lets go each
// begins, at their own length, so both its ends fray; a surge is a pulse of
// light running out along it, the threads crackling harder as it passes.
//   q: the token's radius with its rim (px), its head (px along), its way
//   times (2 + its curl, + 10 for a near one, 20 for a front one, 30 for a
//   back one), its light. Its curl: how far
//   it rises (-) or falls (+) past its slope, in the token's radii, times
//   the square of how many radii past the rim it has run.
//   r: its height at the rim (px, +down), its slope, its wave's height (px)
//   and the wave's phase (rad).
//   s: a surge's place (0 at the root, 1 at the head; less than 0, none),
//   its tail (px along; a front or back one's root is wholly its tail, the
//   rest's no nearer than the rim), its hue (0 blue, 0.5 violet, 1 magenta)
//   plus a hundred times its chill, floored.

const HEAD = `
// The colour drained toward a cold grey, by chill.
vec3 lich_chill(vec3 c, float k) {
  float l = dot(c, vec3(0.3, 0.5, 0.2));
  return mix(c, vec3(l) * vec3(0.72, 0.82, 1.1), k * 0.85);
}
// What the token lets through from behind it at radius rr: 0 over it, 1 outside.
float lich_clear(float rr, float tok) {
  return smoothstep(tok - 0.7, tok + 0.7, rr);
}
// The Lich's hues: her blue, her violet, a magenta.
vec3 lich_hue(float h) {
  vec3 blue = vec3(0.22, 0.46, 1.65);
  vec3 violet = vec3(0.72, 0.3, 1.55);
  vec3 magenta = vec3(1.35, 0.28, 1.0);
  return h < 0.5 ? mix(blue, violet, h * 2.0) : mix(violet, magenta, h * 2.0 - 1.0);
}
// The length along a curve of slope t0 + k x from x = 0 to x (its integral
// of sqrt(1 + slope^2)), by way of this.
float lich_arc(float t) {
  float h = sqrt(1.0 + t * t);
  return 0.5 * (t * h + log(t + h));
}
// A zigzag through hashed points a unit apart (a crackle's line), -0.5 to
// 0.5, and its slope there.
vec2 lich_jag(float x, float t) {
  float i = floor(x);
  float a = hash12(vec2(i, t));
  float b = hash12(vec2(i + 1.0, t));
  return vec2(mix(a, b, fract(x)) - 0.5, b - a);
}
`;

const HEART = `
vec3 lich_heart(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.x;
  float rr = length(p);
  float clear = lich_clear(rr, tok);
  float beyond = max(rr - tok, 0.0);
  float cs = p.x / max(rr, 1e-3);
  // 0 straight up or down, 1 at the sides.
  float sides = cs * cs;
  // How strong the streams are on this side now.
  float streams = mix(r.y, r.z, smoothstep(-0.5, 0.5, cs));
  vec3 violet = vec3(0.74, 0.34, 1.45);
  vec3 blue = vec3(0.26, 0.36, 1.25);
  vec3 pale = vec3(1.15, 1.04, 1.5);
  // (Uneven round the rim, and slowly changing, so it never reads as a ring.)
  float ang = atan(p.y, p.x) / (2.0 * PI) + 0.5;
  float swell = pnoise(vec2(ang * 7.0, r.w + seed * 5.0), 7.0);
  vec3 col = vec3(0.0);
  // Her light past the rim, out of the sides where the streams spring and a
  // little above them, as it wells up: hardly any below, never a ring.
  float side2 = sides * sides;
  float upper = smoothstep(0.4, -0.6, p.y / max(rr, 1e-3));
  float where = max(side2, 0.5 * sides * upper);
  float reach = tok * (0.14 + (0.3 + 0.25 * streams) * where) * (0.8 + 0.4 * swell);
  // (Its tail falls away faster than it starts, so it's gone well inside the quad.)
  float tail = exp(-beyond * beyond / (2.6 * tok * tok));
  float near = exp(-beyond / reach) * tail;
  col += mix(blue, violet, near) * near * (0.04 + 0.32 * where * (0.35 + 0.65 * streams)) * (0.7 + 0.6 * swell);
  // Right at the rim, hot where a stream springs.
  col += mix(violet, pale, 0.4) * exp(-beyond / (0.05 * tok + 0.6)) * 0.3 * where * streams * swell;
  // A faint wide wash, out over the neighbours at the sides.
  col += blue * exp(-beyond / (0.9 * tok)) * tail * 0.05 * sides;
  col *= clear * q.y * (1.0 + 0.6 * q.w);
  // The face steeped in her violet, most at its edge at the sides where the
  // streams spring (a flare doesn't wash it out: the letter must read).
  float edge = exp(-max(tok - rr, 0.0) / (0.3 * tok));
  col += violet * (0.11 + 0.3 * edge * (0.15 + 0.85 * where * streams)) * r.x * (1.0 - clear) * (1.0 + 0.15 * q.w);
  return lich_chill(col, s.x);
}
`;

const STREAM = `
vec3 lich_stream(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float tok = q.x;
  float head = q.y;
  float az = abs(q.z);
  // Its kind: 0 far, 1 near, 2 front, 3 back. In front of the token: a near
  // or front one. Wrapping round it: a front or back one.
  float kind = floor(az / 10.0);
  float near = step(0.5, kind) * step(kind, 2.5);
  float front = step(1.5, kind) * step(kind, 2.5);
  float wrap = step(1.5, kind);
  float curl = (az - 10.0 * kind - 2.0) * tok;
  // (Its wave's number: each slot its own.)
  float k = 0.8 + 0.7 * fract(seed * 7.31);
  float tail = s.y;
  float hue = fract(s.z);
  float chill = floor(s.z) / 100.0;
  // Along its way, px from the token's centre.
  float a = sign(q.z) * p.x;
  // Where it comes out past the rim, at its height there; a near one a
  // little inside it, so its threads cross the token's rim in front.
  float edge = sqrt(max(tok * tok - r.x * r.x, 0.2 * tok * tok));
  float rim = edge - 0.16 * tok * near * (1.0 - front);
  // Its root: there, or its tail once that has passed it (a wrapping one's
  // is its tail, round on the token's far side).
  float root = max(tail, mix(rim, -1e4, wrap));
  float r0 = max(root, rim);
  // How far past the rim, in token radii.
  float fr = (a - rim) / tok;
  // It leaves the rim heading outward from the centre (a wrapping one runs
  // straight on through), bends away along its slope, and curls up (or
  // down) more and more as it runs out, so near the token it lies sideways
  // and its head rises; its wave grows as it goes.
  float rad = r.x / max(rim, 1.0) * 0.3 * tok * (1.0 - wrap);
  float bend = exp(-max(fr, 0.0) / 0.55);
  float fo = max(fr, 0.0);
  float env = 0.3 + 0.7 * smoothstep(0.0, 1.4, fr);
  float wave = k * fr + r.w;
  float yc = r.x + rad * (1.0 - bend) + r.y * fr * tok + curl * fo * fo + r.z * sin(wave) * env;
  float dyc = rad * bend / (0.55 * tok) + r.y + 2.0 * curl * fo / tok + r.z * cos(wave) * env * k / tok;
  // A front one, across the face from where its straight way back meets the
  // far rim to where it leaves the near one, dips low (nearer the eye) as a
  // cord wrapped round a ball would, smoothly at both ends.
  float ye = r.x - r.y * 2.0 * edge;
  float back = sqrt(max(tok * tok - ye * ye, 0.2 * tok * tok));
  float sx = clamp((a + back) / (back + edge), 0.0, 1.0);
  float sn = sin(PI * sx);
  yc += front * 0.22 * tok * sn * sn;
  dyc += front * 0.22 * tok * sin(2.0 * PI * sx) * PI / (back + edge);
  float d = (p.y - yc) * inversesqrt(1.0 + dyc * dyc);
  // How near the eye a front one is as it crosses the face (most at its middle).
  float zf = front * sn * step(a, rim);
  // How far along its length, root (where it leaves the rim) to head.
  float u = clamp((a - r0) / max(head - r0, 0.3 * tok), 0.0, 1.0);
  // The surge: a pulse of light running out along it, with a short wake.
  float sk = smoothstep(0.0, 0.08, s.x) * smoothstep(1.2, 0.9, s.x);
  float at = mix(root, head, s.x);
  float knot = sk * exp(-pow((a - at) / (0.5 * tok), 2.0));
  float wake = sk * exp(-max(at - a, 0.0) / (1.1 * tok)) * smoothstep(at + 0.4 * tok, at - 0.1 * tok, a);
  // Its width: wider toward its head, a little where the surge is; a near one
  // wider, a front one most where it passes nearest the eye.
  float w = tok * (0.09 + 0.13 * u) * (1.0 + 0.25 * knot) * (0.9 + 0.3 * near) * (1.0 + 0.3 * zf) + 0.6;
  float v = d / w;
  // Whether this pixel is near it at all (the rest is dark).
  if (abs(v) > 7.0) return vec3(0.0);
  // Its ends, rounded (its middle reaching furthest), so neither cuts straight
  // across; at its head its body thins out first, leaving the threads to fray.
  float cap = 0.14 * tok * v * v;
  float pres = smoothstep(root - 0.45 * tok, root + 0.3 * tok, a - cap) * smoothstep(head + 0.3 * tok, head - 0.5 * tok, a + cap);
  float thin = smoothstep(head - 0.1 * tok, head - 1.3 * tok, a + cap);
  float clear = lich_clear(length(p), tok);
  // Its root burns hottest, where it comes out round the token (not over the
  // face); a wrapping one's, where it leaves the near rim.
  float rootHot = exp(-max(a - r0, 0.0) / (0.5 * tok)) * clear * mix(1.0, smoothstep(r0 - 0.5 * tok, r0, a), wrap);
  // How hard its threads crackle, and how often they strike anew: a little,
  // slowly, at rest; hard and fast where the surge is.
  float crackle = 0.45 + 1.4 * knot + 0.25 * rootHot;
  float pace = 1.0 + 2.5 * knot;
  // Once it lets go, each thread lets go at its own place.
  float loose = smoothstep(rim, rim + 0.5 * tok, tail);
  // The threads: a few, braided, each winding across it on a wave of its own
  // so they cross and part (a twisted cord of power, never a feather's
  // parallel barbs), and crackling: a zigzag of kinks some px apart, sharp
  // enough to read on a token in a list. Each burns white-hot at its core in
  // a glow of a hue of its own about the stream's, so one stream runs violet,
  // blue and magenta together.
  vec3 deep = vec3(0.16, 0.2, 0.95);
  vec3 pale = vec3(1.25, 1.15, 1.6);
  // How far along it from the rim, in px measured along the cord itself (so
  // where it rises steeply its kinks stay kinks, never stretched into
  // streaks): its slope and curl, without its gentle wave.
  float px = a - rim;
  float kc = 2.0 * curl / (tok * tok);
  float level = px * sqrt(1.0 + r.y * r.y);
  float along = px > 0.0 && abs(kc) > 1e-5 ? (lich_arc(r.y + kc * px) - lich_arc(r.y)) / kc : level;
  float kink = 1.5 + 0.25 * w;
  vec3 threads = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float c = float(i);
    float h1 = hash12(vec2(c, seed * 31.0));
    float h2 = hash12(vec2(c + 0.5, seed * 17.0 + 3.0));
    float h3 = hash12(vec2(c + 0.25, seed * 7.0 + 11.0));
    float wind = sin(fr * (1.5 + 1.6 * h3) + h2 * 6.283 + c * 1.9 - time * (0.35 + 0.3 * h1)) * (0.6 + 0.9 * h1) * (0.6 + 0.4 * env);
    float strike = floor(time * (3.0 + 2.5 * h1) * pace + h2 * 13.0);
    // (Its kinks longer where they're harder, none of them steeper than it
    // can draw as a line.)
    float seg = (5.0 + 4.0 * h3) * (1.0 + 0.6 * knot);
    float ck = min(crackle * kink, 0.5 * seg);
    vec2 j1 = lich_jag(along / seg + c * 5.3, strike + c * 3.0);
    // (Its finest kinks only where the token is big enough to draw them, so
    // in a list it never breaks into glitter.)
    vec2 j2 = lich_jag(along / 3.2 + c * 2.1, strike + 7.0) * smoothstep(14.0, 36.0, tok);
    float zig = j1.x * 1.5 + j2.x * 0.4;
    float place = wind + zig * ck / w;
    // Across it in px: a crisp line, never thinner than a pixel, measured
    // square to its kinks (so a sharp one stays a line, never a row of dots),
    // in a glow of its hue measured straight across (so the glow never
    // streaks where a kink is steep).
    float steep = (j1.y * 1.5 / seg + j2.y * 0.4 / 3.2) * ck;
    float dpx = (v - place) * w;
    float dsq = dpx * inversesqrt(1.0 + steep * steep);
    float core = max(0.5, w * (0.03 + 0.04 * h1));
    float line = exp(-dsq * dsq / (core * core));
    float glow = exp(-abs(dpx) / (2.5 * core + 0.7)) + 0.22 * exp(-abs(dpx) / (0.12 * tok + 2.0));
    float end = head - tok * (0.05 + 1.0 * h2 * h2);
    float start = root + tok * 0.9 * h3 * loose;
    float run = 0.5 + 0.5 * vnoise(vec2(c * 1.9 + seed * 5.0, fr * 1.4 - time * 0.5));
    float l = (0.5 + 0.5 * h1) * run * smoothstep(end + 0.2 * tok, end - 0.5 * tok, a) * smoothstep(start, start + 0.45 * tok, a);
    vec3 sc = lich_hue(clamp(hue + (h3 - 0.5) * 0.5, 0.0, 1.0));
    threads += (mix(sc, pale, 0.55) * line * 1.5 + sc * glow * 0.6) * l;
  }
  float body = exp(-v * v * 1.3);
  float halo = exp(-abs(v) * 0.85);
  // Its colours: the threads', over a faint deep blue of its body and haze,
  // deepening toward its head; a surge lights the threads up as it passes.
  vec3 hc = mix(lich_hue(hue), deep, 0.3);
  vec3 haze = mix(deep, hc, 0.4) * (body * 0.13 + halo * 0.05) * thin;
  haze += pale * knot * body * 0.15 * thin;
  haze += mix(hc, pale, 0.5) * rootHot * (0.4 * body + 0.18 * halo);
  vec3 lit = threads * (0.9 + 1.4 * knot + 0.5 * wake) * mix(vec3(1.0), deep * 0.9 + 0.25, 0.4 * u);
  // Behind the token its disc hides it all; a near one's threads cross the
  // rim in front and run faint over the face, its haze kept off it; a front
  // one's a little brighter there, most where it passes nearest the eye. A
  // back one is a little dimmer past the token's far side, further off.
  float over = mix(0.4, 0.5 + 0.2 * zf, front);
  float off = 1.0 - 0.3 * wrap * (1.0 - front) * step(a, 0.0);
  vec3 col = (haze * clear + lit * mix(clear, mix(over, 1.0, clear), near)) * pres * mix(1.0, 0.6, u * u) * off;
  return lich_chill(col * q.w, chill);
}
`;

export const GLSL = `${HEAD}${HEART}${STREAM}
vec3 aura_lich(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  if (q.z == 0.0) return lich_heart(p, time, seed, q, r, s);
  return lich_stream(p, time, seed, q, r, s);
}
`;
