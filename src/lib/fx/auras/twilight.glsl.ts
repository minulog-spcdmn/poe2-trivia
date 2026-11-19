// The Twilight Order aura's light in the effects shader (shaders.ts):
// `aura_twilight`, given the pixel's place (CSS px from the token's centre),
// the shape's age (s) and seed, and its parameters (q: f.q[0..3], r:
// f.q[4..7], s: f.q[9..11]); it gives back HDR light, added over the page.
// Every helper it needs is named `twilight_...`, so no two auras' names meet.
//
// The token is the Order's lantern: the pierced golden orb their heralds
// carry on the crescent of their staves (Benedictus, in Arastas), a candle
// burning inside it. Round its waist runs a ring of lancet windows glazed
// like those of their church, each two panes leaded down the middle under a
// pointed head; with a streak, round oculi above and below light too. It
// hangs tilted toward us, all but still, and through each window it throws
// a shaft of coloured light (violet and gold, the Order's vestments, and the
// azure and crimson of their glass) out into the incense round it, which
// alone shows it. No two shafts keep time: each wanders on its own as the
// flame leans and the incense shifts, gathers out of the haze, holds and
// thins away on its own slow cycle, its own length; dust turns in them.
// Nothing is carried round together. A shaft from a window on the far
// side leaves from behind the token, which hides it until it is past the
// rim; one from the near side starts on its face, where the window itself
// shows lit, and comes out toward us, short, broad and bright; one going
// away is thin and dim. Round it the air holds the last light of dusk:
// violet above, a warmer glow low down. Its light spreads sideways and
// stays close above and below, where in a list the next player sits; only
// a toll's flare reaches further, for a moment.
//
// q: the token's radius, the lantern's turn (rad), its swing (roll, rad), its
// power (1 at rest). r: the shafts' reach (px), how many windows are lit (0
// to 16, in order), the hour (-1 night, 0 dusk, 1 dawn), how much it gutters
// (0-1). s: its tilt toward us (rad), seconds since the bell last tolled
// (large: none), the incense's thickness. Lengths in CSS px.

export const GLSL = `
const vec3 TWILIGHT_GOLD = vec3(1.75, 1.2, 0.52);
const vec3 TWILIGHT_VIOLET = vec3(0.95, 0.45, 1.75);
const vec3 TWILIGHT_AZURE = vec3(0.42, 0.72, 1.8);
const vec3 TWILIGHT_CRIMSON = vec3(1.7, 0.32, 0.42);
const vec3 TWILIGHT_ROSE = vec3(1.3, 0.62, 0.5);
const vec3 TWILIGHT_NIGHT = vec3(0.32, 0.36, 1.05);

// The windows, in the order they light: the waist's eight lancets, in pairs
// across the orb, then the oculi above and below, between them. Each is its
// latitude and longitude (rad), its glass (0 gold, 1 violet, 2 azure, 3
// crimson; its other pane is the Order's other colour) and its kind (0 a
// lancet, 1 an oculus).
const vec4 TWILIGHT_PANES[16] = vec4[16](
  vec4(0.0, 0.0, 0.0, 0.0), vec4(0.0, 3.1416, 1.0, 0.0), vec4(0.0, 1.5708, 2.0, 0.0), vec4(0.0, 4.7124, 3.0, 0.0),
  vec4(0.0, 0.7854, 1.0, 0.0), vec4(0.0, 3.927, 0.0, 0.0), vec4(0.0, 2.3562, 1.0, 0.0), vec4(0.0, 5.4978, 0.0, 0.0),
  vec4(0.8, 0.3927, 0.0, 1.0), vec4(0.8, 3.5343, 1.0, 1.0), vec4(-0.8, 1.9635, 1.0, 1.0), vec4(-0.8, 5.1051, 0.0, 1.0),
  vec4(0.8, 1.9635, 2.0, 1.0), vec4(0.8, 5.1051, 0.0, 1.0), vec4(-0.8, 0.3927, 3.0, 1.0), vec4(-0.8, 3.5343, 1.0, 1.0)
);
// A direction from the orb's centre at a latitude and longitude of the
// lantern's own, on screen: tilted toward us by pitch (about x), then rolled
// by its swing (about the line of sight). Gives its screen x and y (y down)
// and its z toward us.
vec3 twilight_dir(float lat, float lon, float cp, float sp, float cr, float sr) {
  vec3 n = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  n = vec3(n.x, n.y * cp - n.z * sp, n.y * sp + n.z * cp);
  return vec3(n.x * cr - n.y * sr, -(n.x * sr + n.y * cr), n.z);
}

vec3 twilight_glass(float g) {
  if (g < 0.5) return TWILIGHT_GOLD;
  if (g < 1.5) return TWILIGHT_VIOLET;
  if (g < 2.5) return TWILIGHT_AZURE;
  return TWILIGHT_CRIMSON;
}

// How much of a window's glass is lit at e (px on the orb's surface, in the
// window's own frame: x round the orb, y toward its pole), as wide as w, its
// edges aa soft. A lancet: a straight-sided light under an equilateral
// pointed head, a transom where the head begins; an oculus: a round light.
// Both leaded down the middle, and a came round the edge that shows dark.
float twilight_window(vec2 e, float w, float kind, float aa) {
  float lw = w * 0.16 + aa * 0.5;
  float d;
  float bar;
  if (kind < 0.5) {
    float hb = w * 2.1;
    float y0 = hb - 1.732 * w;
    vec2 a = vec2(abs(e.x), e.y);
    d = a.y > y0 ? length(vec2(a.x + w, a.y - y0)) - 2.0 * w : max(a.x - w, -a.y - hb);
    bar = exp(-(e.y - y0) * (e.y - y0) / (lw * lw));
  } else {
    d = length(e) - w * 1.05;
    bar = exp(-e.y * e.y / (lw * lw));
  }
  float glass = smoothstep(aa, -aa, d + lw);
  float mullion = exp(-e.x * e.x / (lw * lw));
  // (Brighter toward its middle, where the candle shows through.)
  float heart = 0.8 + 0.2 * exp(-dot(e, e) / (w * w * 3.0));
  return glass * (1.0 - 0.85 * max(mullion, bar)) * heart;
}

// Dust turning in the light: at most one mote to a cell of a grid that
// drifts, kept well inside its cell so none is ever cut at a cell's edge.
float twilight_dust(vec2 p, float cell, vec2 drift, float size, float thresh, float time, float seed) {
  vec2 g = (p + drift) / cell;
  vec2 id = floor(g);
  float h = hash12(id + seed);
  if (h > thresh) return 0.0;
  vec2 at = vec2(hash12(id + 3.1 + seed), hash12(id + 7.7 + seed)) - 0.5;
  at = at * 0.36 + 0.05 * vec2(sin(time * (0.3 + h) + h * 30.0), cos(time * (0.25 + 0.8 * h) + h * 17.0));
  vec2 e = (fract(g) - 0.5 - at) * cell;
  // It glints as it turns.
  float tw = 0.5 + 0.5 * sin(time * (0.7 + 1.4 * h) + h * 40.0);
  return exp(-dot(e, e) / (size * size)) * (0.25 + 0.75 * tw * tw);
}

vec3 aura_twilight(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  float R = q.x;
  float spin = q.y;
  float roll = q.z;
  float power = q.w;
  float L = r.x;
  float open = r.y;
  float hour = r.z;
  float gut = r.w;
  float pitch = s.x;
  float toll = s.y;
  float haze = s.z;
  float blur = vBehind * uBlur;
  float edge = sqrt(0.49 + 5.0 * blur * blur);
  float rr = length(p);
  // What the token lets through from behind it: 0 over it, 1 outside.
  float clear = smoothstep(R - edge, R + edge, rr);

  // How far the incense hangs: out to nothing well inside the quad (twilight.ts sizes it to E).
  // Sideways it reaches R + 2.3 L; up and down only twice the radius, a
  // little more while a flare lasts.
  float E = R + 2.3 * L;
  float Ev = R * (2.0 + 0.6 * max(power - 1.0, 0.0));
  float env = 1.0 - smoothstep(0.3, 1.0, length(vec2(p.x / E, p.y / Ev)));
  env *= env;

  // The incense, rising slowly in wisps and drifts; only where it hangs do the shafts show.
  vec2 hp = vec2(p.x * 1.3, p.y) / (R * 0.55) + vec2(seed * 7.1, time * 0.34);
  vec2 warp = vec2(vnoise(hp * 0.55 + vec2(time * 0.05, 3.7)), vnoise(hp * 0.55 + vec2(5.2, 1.3))) - 0.5;
  float f1 = fbm(hp + 1.8 * warp);
  float ridge = 1.0 - abs(2.0 * f1 - 0.9);
  float wisps = ridge * ridge * ridge;
  float smoke = (0.3 + 1.7 * wisps * (0.4 + f1)) * haze;

  // The hour tints everything: dusk's glass as it is, night cold and dim,
  // dawn warm and bright.
  float dawn = max(hour, 0.0);
  float night = max(-hour, 0.0);
  // (The candle inside breathes, all its windows together.)
  float candle = 0.93 + 0.07 * vnoise(vec2(time * 2.3, seed * 5.0));
  float lamp = power * (1.0 + 0.35 * dawn) * (1.0 - 0.6 * night) * candle;

  // The lantern's axis: tilted toward us by pitch, rolled by its swing.
  float cp = cos(pitch), sp = sin(pitch);
  float cr = cos(roll), sr = sin(roll);

  // The point of the orb's near face under this pixel, in the lantern's own
  // frame (y up its axis): undo the roll, then the tilt.
  float zs = sqrt(max(R * R - rr * rr, 0.0)) / R;
  vec2 sv = vec2(p.x, -p.y) / R;
  float xr = sv.x * cr + sv.y * sr;
  float yr = -sv.x * sr + sv.y * cr;
  vec3 m = vec3(xr, yr * cp + zs * sp, -yr * sp + zs * cp);
  float lat = asin(clamp(m.y, -1.0, 1.0));
  float lon = atan(m.z, m.x);
  float coslat = cos(lat);
  // On the face: 0 outside it, and its windows' edges are softer near the limb, where they foreshorten.
  float face = 1.0 - clear;
  float aa = (0.55 + blur) / max(zs, 0.18);

  float w0 = R * 0.14 + 0.8;
  vec3 c = vec3(0.0);
  vec3 beam = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float on = clamp(open - fi, 0.0, 1.0);
    if (on <= 0.0) break;
    vec4 pane = TWILIGHT_PANES[i];
    float plat = pane.x;
    float plon = pane.y + spin;
    // Each shaft keeps its own time (h1-h3): none moves with another.
    float h1 = hash12(vec2(fi * 1.7 + 0.3, seed * 13.1 + 2.0));
    float h2 = hash12(vec2(fi * 2.3 + 5.1, seed * 7.7 + 9.0));
    float h3 = hash12(vec2(fi * 3.1 + 1.9, seed * 5.3 + 4.0));
    // The window, where the lantern's slow turn has carried it.
    vec3 wn = twilight_dir(plat, plon, cp, sp, cr, sr);
    // Its shaft leaves it, but the candle's flame leans and the incense
    // shifts, so the shaft wanders round and up and down on its own, slowly.
    float slon = plon + 0.5 * sin(time * (0.045 + 0.05 * h1) + h1 * 6.283) + 0.22 * sin(time * (0.1 + 0.08 * h2) + h2 * 6.283);
    float slat = plat + 0.16 * sin(time * (0.06 + 0.05 * h3) + h3 * 6.283);
    vec3 n = twilight_dir(slat, slon, cp, sp, cr, sr);
    vec2 sn = n.xy;
    float z = n.z;
    float l2 = length(sn);
    // Its life: it gathers out of the incense, holds, and thins away again,
    // each on its own cycle of ten to twenty seconds; a toll's flare lights
    // every one of them for its moment.
    float cyc = fract(time / (10.0 + 10.0 * h2) + h1);
    float life = smoothstep(0.0, 0.25, cyc) * smoothstep(1.0, 0.7, cyc);
    life = max(life, clamp(power - 1.0, 0.0, 1.0));
    // And its own length, breathing a little.
    float len = L * (0.6 + 0.6 * h3) * (0.85 + 0.15 * sin(time * (0.2 + 0.1 * h1) + h2 * 6.283));
    vec3 glass = twilight_glass(pane.z);
    vec3 other = pane.z < 0.5 ? TWILIGHT_VIOLET : TWILIGHT_GOLD;
    glass = mix(mix(glass, TWILIGHT_GOLD, 0.45 * dawn), TWILIGHT_NIGHT, 0.5 * night);
    other = mix(mix(other, TWILIGHT_GOLD, 0.45 * dawn), TWILIGHT_NIGHT, 0.5 * night);
    // A window guttering flickers on its own.
    float flick = 1.0 - gut * (0.35 + 0.65 * vnoise(vec2(time * 13.0 + fi * 7.3, seed * 9.0 + fi)));
    float near = 0.5 + 0.5 * z;
    // (Near brighter than far, by much: the depth shows in it.)
    float depth = 0.2 + 0.95 * pow(near, 1.4);
    // Behind, it shows only past the rim; in front, kept faint over the face so the letter reads.
    float seen = mix(clear, mix(0.16, 1.0, clear), smoothstep(-0.08, 0.08, z));
    // An oculus is smaller, and so is its shaft.
    float size = pane.w > 0.5 ? 0.62 : 1.0;
    float k = on * flick * lamp * depth * seen * size * life;

    // The shaft, along its own direction, seen on screen as a beam out from
    // the orb, foreshortened as it points toward us; as wide as the window,
    // spreading as it goes.
    if (l2 > 0.02) {
      vec2 d = sn / l2;
      float along = dot(p, d) - R * l2;
      float across = dot(p, vec2(-d.y, d.x));
      float t = max(along, 0.0) / max(l2, 0.12);
      // (Near shafts broader, and spreading faster, as perspective has it.)
      float w = w0 * size * (0.65 + 0.6 * near) + (0.1 + 0.25 * near) * t;
      float body = blurredLine(across, w, blur) * pow(w0 * size / w, 0.5) * smoothstep(-w0 * 1.5, w0, along);
      float fall = exp(-t / (1.3 * len));
      // The bell's toll: light runs out along every shaft, each a little
      // after another, as a bell's sound reaches them.
      float tt = toll - 0.35 * h1;
      float tp = max(tt, 0.0) * R * 2.6;
      float pd = (t - tp) / (R * 0.8);
      float pulse = 0.65 * exp(-pd * pd) * exp(-max(tt, 0.0) * 1.4) * smoothstep(-0.05, 0.1, tt);
      // (A shaft toward us is short on screen, and its light gathers.)
      // (Gently: gathered hard, it shows as a white glint, a mirror ball's.)
      float gather = mix(1.0, 1.0 / max(l2, 0.5), 0.3);
      // Its two panes' colours side by side, the lead's shadow between them.
      float side = smoothstep(-0.3 * w, 0.3 * w, across);
      float sw = w * 0.13 + blur;
      float seam = 1.0 - 0.8 * exp(-across * across / (sw * sw)) * smoothstep(0.0, w0 * 2.0, along);
      vec3 col = mix(glass, other, side) * body * gather * seam * k;
      beam += col * (fall + pulse);
      c += col * (fall * smoke * 1.7 + pulse * (0.5 + 0.7 * smoke));
    }

    // The window itself, lit, where it faces us: on the orb's near face, in
    // the window's own frame on its surface. (One well past the limb can't
    // reach the near face, so it is skipped.)
    float wz = wn.z;
    if (wz > -0.45) {
      float dl = mod(lon - plon + PI, 2.0 * PI) - PI;
      vec2 e = vec2(dl * coslat, lat - plat) * R;
      float wr = R * (pane.w > 0.5 ? 0.11 : 0.15);
      float lit = twilight_window(e, wr, pane.w, aa);
      vec3 col = mix(glass, other, smoothstep(-aa, aa, e.x));
      // (Kept low: over a pale face more light would only wash its colour out.)
      // The candle's light through it washes over the face round it in its
      // glass's colour, most from the window turned full toward us.
      // (Broad and low, under the letter's contrast.)
      vec2 wd = p - R * wn.xy;
      float wash = exp(-dot(wd, wd) / (R * R * 0.55)) * max(wz, 0.0) * max(wz, 0.0);
      // (A window glows a little more while its shaft lives.)
      float glow = on * flick * lamp * (0.6 + 0.4 * life);
      c += mix(glass, other, 0.5) * wash * face * glow * 0.13;
      // (Brightest facing us, fading as it turns toward the limb.)
      c += col * lit * face * glow * (0.15 + 0.85 * max(wz, 0.0)) * 0.42;
    }
  }

  // Dust in the shafts: far motes behind the token, nearer ones crossing its face.
  vec2 drift = vec2(0.18 * R * sin(time * 0.11 + seed * 4.0), -time * 0.05 * R);
  float far = twilight_dust(p, 0.42 * R + 3.0, drift, 0.035 * R + 0.42 + blur, 0.4, time, seed);
  float nearM = twilight_dust(p, 0.7 * R + 4.0, drift * 1.6 + vec2(R * 3.0, 0.0), 0.05 * R + 0.5 + blur, 0.3, time, seed + 11.0);
  float dust = far * clear + nearM * (0.5 + 0.5 * clear);
  c += (beam + vec3(1.0, 0.92, 0.8) * 0.25 * (beam.r + beam.g + beam.b)) * dust * 1.6;

  // The air round it: dusk's violet seeping out from behind the token, and
  // low down the warmer glow where the sun has set; by night it cools, by
  // dawn it warms through.
  float out_ = max(rr - R, 0.0);
  float low = smoothstep(-0.4, 1.0, p.y / max(rr, 1.0));
  vec3 sky = mix(TWILIGHT_VIOLET, TWILIGHT_ROSE, low * (0.6 + 0.4 * dawn));
  sky = mix(sky, TWILIGHT_GOLD, 0.5 * dawn);
  sky = mix(sky, TWILIGHT_NIGHT, 0.6 * night);
  // (Little of it close round the rim, where an even glow would read as a ring round the token.)
  float air = exp(-out_ / (R * 0.3 + 1.0)) * 0.05 + exp(-out_ / (R * 0.9 + 2.0)) * 0.06 * (0.5 + 0.5 * smoke);
  c += sky * air * clear * (0.55 + 0.45 * power) * (1.0 - 0.5 * night);
  // Over the face all of it (the windows, their wash, the near shafts, the
  // dust) is held under a soft ceiling, so however long the streak and
  // bright the flare the face is never washed out and the letter reads.
  float top = max(max(c.r, c.g), c.b);
  vec3 held = c / (1.0 + top / 0.4);
  return mix(c, held, face) * env;
}
`;
