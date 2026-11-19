// The abyss aura's light in the effects shader (shaders.ts): `aura_abyss`,
// given the pixel's place (CSS px from the token's centre, +y down), the
// shape's age (s) and seed, and its parameters (q: f.q[0..3], r: f.q[4..7],
// s: f.q[9..11]); it gives back HDR light, added over the page. Every helper
// it needs is named `abyss_...`, so no two auras' names meet.
//
// An Abyssal lich lord standing behind the wearer: a skull, modelled in three
// dimensions and raymarched, peering over the token and watching over them,
// the token hiding its teeth, the token's own light rising into its face;
// spectral more than solid, lost in the dark above its brow.
// It is lit as the
// Abyss lights things in PoE2: from below, by the green of the Well (the
// green of Grip of Kulemak's core, deep emerald to a white-mint heart), its
// crown of cranium in darkness. In its sockets the lich's fire burns, lighting
// their walls. A streak grows a crown of Abyssal spines out of its skull, as
// the spines grow out of the skull of Amanamu's Tithe, green toward the tips.
// A lost life cracks it, the Well's green showing in the crack.
//
// A right answer sends a surge of the Well's light up round the token and
// on up through the skull.
//
// q: the token's radius (px, the face), seconds since the last surge, the
//    light (0-1+), the flare (0-1+: the sockets' fire blazing toward white).
// r: the skull's yaw and pitch (rad: turned right, bowed), its lift (in the
//    token's radii, above where it rests; less than 0: sunk behind the
//    token), the crown (0-5: spines grown).
// s: its roll (rad), ash (0-1: the fire gone grey), cracks (0-2).

export const GLSL = `
// The Abyss's green, from Grip of Kulemak's core (its icon, by lightness).
const vec3 ABYSS_DEEP = vec3(0.05, 0.23, 0.06);
const vec3 ABYSS_GREEN = vec3(0.16, 0.66, 0.24);
const vec3 ABYSS_BRIGHT = vec3(0.32, 0.86, 0.43);
const vec3 ABYSS_MINT = vec3(0.86, 1.0, 0.88);
const vec3 ABYSS_BONE = vec3(0.88, 0.85, 0.74);

float abyss_ell(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-5);
}
float abyss_smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float abyss_smax(float a, float b, float k) {
  return -abyss_smin(-a, -b, k);
}

// A zero the compiler can't see through, so it keeps the loops it is given as
// loops (unrolled, ANGLE takes far longer to build the program).
int abyss_zero;

// The bone of the skull (its own space: y up, +z its face, the cranium about
// a unit across): a lich's, gaunt, its face long and its brow heavy, its
// cranium broad and low, so its mass sits across the wearer more than above.
float abyss_bone(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  // The cranium, long front to back, and the face under it, narrower and long.
  float d = abyss_ell(p - vec3(0.0, 0.12, -0.14), vec3(0.86, 0.7, 1.0));
  d = abyss_smin(d, abyss_ell(p - vec3(0.0, -0.46, 0.36), vec3(0.5, 0.56, 0.5)), 0.22);
  // The cheekbones, sharp, and their arches running back.
  d = abyss_smin(d, abyss_ell(q - vec3(0.55, -0.33, 0.42), vec3(0.19, 0.1, 0.25)), 0.12);
  d = abyss_smin(d, abyss_ell(q - vec3(0.64, -0.35, 0.06), vec3(0.08, 0.075, 0.36)), 0.08);
  // The brow ridge, heavy, sloping down toward the middle: a scowl.
  vec2 bq = rot2(q.xy - vec2(0.29, 0.0), -0.32);
  d = abyss_smin(d, abyss_ell(vec3(bq, q.z - 0.74), vec3(0.3, 0.1, 0.19)), 0.09);
  // The temples, hollowed deep.
  d = abyss_smax(d, -abyss_ell(q - vec3(0.92, -0.16, 0.2), vec3(0.24, 0.32, 0.38)), 0.12);
  // The sockets, deep under the brow, and the nose's opening.
  d = abyss_smax(d, -abyss_ell(q - vec3(0.31, -0.2, 0.8), vec3(0.21, 0.19, 0.3)), 0.05);
  // (The nose's opening is a pear, wide at its foot.)
  float nw = 0.1 + 0.07 * clamp((-0.52 - p.y) / 0.2, -1.0, 1.0);
  d = abyss_smax(d, -abyss_ell(p - vec3(0.0, -0.6, 0.84), vec3(nw, 0.17, 0.24)), 0.03);
  // The upper teeth, a row on an arc under the face.
  float a = atan(p.x, p.z - 0.3);
  if (abs(a) < 1.05 && p.y < -0.7) {
    const float CELL = 0.17;
    float ar = mod(a + CELL * 0.5, CELL) - CELL * 0.5;
    float rad = length(p.xz - vec2(0.0, 0.3));
    vec3 t = vec3(rad * sin(ar), p.y, rad * cos(ar));
    d = abyss_smin(d, abyss_ell(t - vec3(0.0, -1.03, 0.42), vec3(0.042, 0.09, 0.05)), 0.02);
  }
  return d;
}

// One spine of the crown: a cone from a on the cranium out to b.
float abyss_spine(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h) - r * (1.0 - h) * (1.0 - h * 0.15);
}
// Where spine i stands, three a side on the back of the cranium, and where
// its tip reaches as grown by g: they sweep out sideways from behind the
// temples, a crown spread wide rather than tall, so a streak's crown keeps
// clear of the row above in a list.
const int ABYSS_SPINES = 6;
void abyss_spineAt(int i, float g, out vec3 a, out vec3 b) {
  float side = i < 3 ? -1.0 : 1.0;
  float j = float(i < 3 ? i : i - 3);
  float ang = side * (0.95 + 0.36 * j);
  vec3 out2 = vec3(sin(ang), cos(ang), 0.0);
  a = vec3(0.0, 0.12, -0.45) + out2 * vec3(0.72, 0.55, 0.0);
  // (The middle one of each side longest, the lowest shortest.)
  float len = (j == 1.0 ? 0.62 : j == 0.0 ? 0.46 : 0.38) * g;
  b = a + normalize(out2 + vec3(0.0, 0.18, -0.35)) * len;
}
// How grown spine i is by the crown c (0-5): they all grow with it, the
// upper ones a little ahead.
float abyss_grow(int i, float c) {
  float lead = 0.14 * float(i < 3 ? i : i - 3);
  return smoothstep(0.0, 1.0, clamp(0.12 + c / 4.0 * 1.25 - lead, 0.0, 1.0) * step(0.01, c));
}
float abyss_crown(vec3 p, float c) {
  float d = 1e3;
  if (c <= 0.01) return d;
  for (int i = abyss_zero; i < ABYSS_SPINES; i++) {
    float g = abyss_grow(i, c);
    if (g <= 0.001) continue;
    vec3 a, b;
    abyss_spineAt(i, g, a, b);
    d = min(d, abyss_spine(p, a, b, 0.1 * (0.5 + 0.5 * g)));
  }
  return d;
}
float abyss_map(vec3 p, float c) {
  return min(abyss_bone(p), abyss_crown(p, c));
}
vec3 abyss_normal(vec3 p, float c) {
  vec3 n = vec3(0.0);
  for (int i = abyss_zero; i < 4; i++) {
    vec3 e = 0.5773 * (2.0 * vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.0);
    n += e * abyss_map(p + e * 0.012, c);
  }
  return normalize(n);
}

// The light on the skull at lp (its own space), m turning it into the world.
// A cold pale light from the front and above gives the bone its form, the
// sockets and the nose dark hollows; the Well's green comes up from below,
// on the cheekbones, the brow and the teeth; the crown of the cranium falls
// toward darkness. The sockets' fire lights their own walls a little.
vec3 abyss_shade(vec3 lp, mat3 m, float c, float light, float flare, float fire, vec3 eyeL, vec3 eyeR, float cracks, float seed, float px, vec2 surge) {
  // (Fine detail only where a pixel is small enough to hold it: on a small
  // token it would only flicker.)
  float fine = smoothstep(0.07, 0.03, px);
  vec3 n = abyss_normal(lp, c);
  vec3 nw = m * n;
  vec3 hw = m * lp;
  float form = max(dot(nw, normalize(vec3(-0.28, 0.42, 0.86))), 0.0);
  float key = max(dot(nw, normalize(vec3(0.0, -0.8, 0.6))), 0.0);
  float low = smoothstep(0.95, -0.9, hw.y);
  float rim = pow(1.0 - max(nw.z, 0.0), 3.0);
  // Hollows (the sockets, the nose, under the cheekbones) go dark.
  float ao = clamp(0.5 * (abyss_map(lp + n * 0.07, c) / 0.07 + abyss_map(lp + n * 0.2, c) / 0.2), 0.0, 1.0);
  ao *= ao;
  // The bone's grain, and its sutures over the crown.
  float grain = 1.0 + fine * 0.32 * (vnoise(lp.xy * 11.0 + lp.z * 7.0 + seed * 3.0) - 0.6);
  float sw = max(0.02, 0.6 * px);
  float sut = 1.0 - 0.6 * fine * exp(-pow((lp.x + 0.035 * sin(lp.z * 26.0)) / sw, 2.0)) * smoothstep(0.38, 0.65, lp.y);
  sut *= 1.0 - 0.5 * fine * exp(-pow((lp.z - 0.12 + 0.03 * sin(lp.x * 24.0)) / sw, 2.0)) * smoothstep(0.3, 0.6, lp.y);
  vec3 pale = mix(ABYSS_BONE, ABYSS_BRIGHT, 0.5);
  float top = mix(0.3, 1.0, smoothstep(1.15, 0.15, hw.y));
  // (Spectral more than solid: the face lit, the dome a fainter shell of
  // light outlined by its rim.)
  vec3 bone = pale * pow(form, 1.5) * 0.32 * top + ABYSS_BRIGHT * pow(key, 1.6) * low * low * 1.05 + ABYSS_GREEN * rim * (0.25 + 0.5 * low) * 0.6;
  // (A small skull stands out a little brighter, so its form still reads.)
  bone *= mix(1.75, 1.0, fine);
  // The surge's band passing up over the bone.
  bone += ABYSS_BRIGHT * exp(-pow((hw.y - surge.x) / 0.32, 2.0)) * surge.y * (0.25 + 0.75 * max(key, form) + 0.6 * rim);
  // (A bowl's inside isn't hidden from itself, so the sockets and the nose
  // are made dark by where they are.)
  vec3 sq = vec3(abs(lp.x), lp.y, lp.z);
  float sock = length((sq - vec3(0.31, -0.2, 0.8)) / vec3(0.21, 0.19, 0.3));
  float nose = length((lp - vec3(0.0, -0.6, 0.84)) / vec3(0.15, 0.17, 0.24));
  float hollow = max(smoothstep(1.08, 0.85, sock), smoothstep(1.1, 0.8, nose));
  bone *= grain * sut * ao * light * (1.0 - 0.95 * hollow);
  // The sockets' fire, deep in them, on the walls nearest it.
  for (int k = 0; k < 2; k++) {
    vec3 e = k == 0 ? eyeL : eyeR;
    vec3 to = e - hw;
    bone += mix(ABYSS_GREEN, ABYSS_MINT, 0.25 * flare) * max(dot(nw, normalize(to)), 0.0) / (1.0 + dot(to, to) * 320.0) * fire * 0.3;
  }
  // Above its brow it is lost in the dark, as a face lit only from below is:
  // its dome no more than a faint outline, so what rises over the rim is its
  // face, and little reaches toward the row above in a list.
  bone *= mix(0.07, 1.0, smoothstep(0.55, 0.0, hw.y));
  // The crown's spines: dark bone at the root, the Abyss's green toward the
  // tips (their glow their own, so they show in the dark beside its dome).
  float dc = abyss_crown(lp, c);
  if (dc < abyss_bone(lp)) {
    float along = 0.0;
    for (int i = abyss_zero; i < ABYSS_SPINES; i++) {
      vec3 a, b;
      abyss_spineAt(i, abyss_grow(i, c), a, b);
      vec3 ba = b - a;
      float h = clamp(dot(lp - a, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
      if (abs(abyss_spine(lp, a, b, 0.1 * (0.5 + 0.5 * abyss_grow(i, c))) - dc) < 0.03) along = max(along, h);
    }
    vec3 spine = (pale * pow(form, 1.5) * 0.12 + ABYSS_GREEN * rim * 0.4) * light;
    spine += mix(ABYSS_BRIGHT, ABYSS_MINT, 0.2 + 0.35 * flare) * pow(along, 1.6) * (0.8 + 0.6 * flare) * light;
    bone = spine;
  }
  // Cracks a lost life leaves, the Well's green inside them.
  if (cracks > 0.01) {
    float cx = 0.2 + 0.12 * lp.y + 0.05 * sin(lp.y * 17.0 + 1.3) + 0.025 * sin(lp.y * 41.0);
    float c1 = exp(-pow((lp.x - cx) / 0.022, 2.0)) * smoothstep(-0.05, 0.1, lp.y) * smoothstep(0.8, 0.58, lp.y) * smoothstep(0.2, 0.5, lp.z);
    float cx2 = -0.42 - 0.1 * lp.y + 0.05 * sin(lp.y * 15.0 + 4.0) + 0.02 * sin(lp.y * 37.0);
    float c2 = exp(-pow((lp.x - cx2) / 0.022, 2.0)) * smoothstep(0.0, 0.12, lp.y) * smoothstep(0.72, 0.48, lp.y) * smoothstep(0.15, 0.45, lp.z);
    float crack = c1 * clamp(cracks, 0.0, 1.0) + c2 * clamp(cracks - 1.0, 0.0, 1.0);
    bone = bone * (1.0 - 0.85 * crack) + ABYSS_BRIGHT * crack * 0.8 * light;
  }
  return bone;
}

vec3 aura_abyss(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  abyss_zero = int(min(time, 0.0));
  float R = q.x;
  // The token's radius with its rim (Avatar.svelte's 3 px, scaled as the aura scales it).
  float tok = R + 3.0 * sqrt(R / 16.0);
  // The surge: the Well's light rising up through it, s seconds ago.
  float surgeAge = q.y;
  float light = q.z;
  float flare = q.w;
  float ash = s.y;
  float rr = length(p);
  // What the token lets through from behind it: 0 over it, 1 outside.
  float clear = smoothstep(tok - 0.7, tok + 0.7, rr);
  vec3 col = vec3(0.0);

  // The Well's light seeping out from behind the token, breathing slowly.
  float beyond = max(rr - tok, 0.0);
  float breath = 0.88 + 0.12 * sin(time * 0.6 + seed * 6.0);
  // It tints the token's face, the wearer steeped in the Abyss.
  col += ABYSS_GREEN * 0.42 * breath * light * (1.0 + 0.5 * flare) * (1.0 - clear);

  // Round the token, a maelstrom of the Abyss seen from a little above: a
  // funnel of green-black energy spiralling in and down into darkness, the
  // token over its eye. Its rings are ellipses (the angle it is seen at), and
  // the deeper a ring lies, the smaller it is and the lower it shows, so the
  // throat falls away below and behind the token. The outer arms are the
  // brightest and slowest; going in they tighten, darken and turn faster,
  // pulled down, and at the eye there is only black. Matter caught in it
  // streaks inward along
  // the arms, dimming as it sinks.
  {
    float tw = time + seed * 50.0;
    float sd = seed * 37.0;
    const float FLAT = 0.44;
    const float OUTER = 1.7;
    vec2 dv = rot2(p - vec2(0.0, 0.12 * R), -0.05 + 0.04 * sin(seed * 9.0));
    // A pixel on the funnel: the ring it lies on (rho, in token radii) and
    // where round it (phi), found by stepping, since how far a ring has sunk
    // depends on the ring.
    vec2 v = vec2(dv.x, dv.y / FLAT) / R;
    float rho = length(v);
    for (int i = abyss_zero; i < 3; i++) {
      float sink = 0.32 * clamp((OUTER + 0.2 - rho) / 1.2, 0.0, 1.0);
      v = vec2(dv.x, (dv.y - sink * R) / FLAT) / R;
      rho = length(v);
    }
    rho = max(rho, 1e-3);
    float phi = atan(v.y, v.x);
    float L = log(rho);
    // How deep it is: 0 at the outer lip, 1 down at the eye.
    float down = smoothstep(OUTER, 0.95, rho);

    // The arms: three layers of spiral, each turning rigidly (so it never
    // winds tighter) and faster the deeper it lies, blended across the
    // funnel, all bent and torn by one field that churns as it turns.
    float turb = fbm(v * 1.3 + vec2(0.05 * tw, -0.037 * tw) + sd);
    float arms = 0.0;
    float wsum = 0.0;
    for (int i = abyss_zero; i < 3; i++) {
      float fi = float(i);
      float om = 0.14 * pow(2.1, fi);
      float rc = 1.75 - 0.33 * fi;
      float w = exp(-pow((rho - rc) / 0.3, 2.0));
      float a = 0.5 + 0.5 * sin(3.0 * (phi - om * tw - 1.7 * fi) + (4.5 + 1.5 * fi) * L + (3.0 + fi) * turb);
      arms += a * w;
      wsum += w;
    }
    arms /= max(wsum, 1e-3);
    // The smoke in the arms, turning with them: a slow layer outside and a
    // fast one deeper in, each turning rigidly, blended across the funnel.
    const float P = 14.0;
    float smoke = mix(fbm(rot2(v, -0.16 * tw) * 2.4 + sd + 3.0), fbm(rot2(v, -0.52 * tw) * 2.9 + sd + 9.0), down);
    float dens = smoothstep(0.25, 0.85, 0.65 * arms + 0.45 * smoke - 0.1);
    // The matter it pulls in: streaks drawn out along the flow, sliding
    // inward and round as they sink.
    float mx = ((phi - 0.42 * tw) / (2.0 * PI) + 0.2 * turb) * P;
    float matter = pnoise(vec2(mx, L * 7.0 + 0.3 * tw + sd), P);
    matter = smoothstep(0.68, 0.95, matter) * smoothstep(0.95, 1.3, rho) * (1.0 - 0.6 * down) * dens;
    // Light: the outer arms lit, going in they darken; it fades out past the lip.
    float lum = mix(1.0, 0.18, down * down) * exp(-max(rho - OUTER + 0.15, 0.0) / 0.14);
    float k = lum * (0.22 + 1.3 * dens * dens);
    vec3 e = ABYSS_DEEP * k * 1.6 + ABYSS_GREEN * k * dens * 1.5 * (1.0 - 0.5 * down);
    e += ABYSS_BRIGHT * matter * lum * 1.1;
    // (The far side of the funnel, its upper half, lies a little deeper in shadow.)
    e *= 0.75 + 0.25 * smoothstep(-0.6, 0.6, v.y / rho);
    col += e * clear * breath * light * (1.0 + 0.5 * flare);

  }

  // The skull: its size, where it stands, and the pixel in its units (y up).
  // It stands behind the wearer, sunk so the token hides its jaw and nose and
  // only its brow, its burning sockets and its dome rise over the rim: it
  // peers over the wearer's head, one with them, and in a list it keeps well
  // clear of the row above. (A large token, alone on a page, lets it stand a
  // little bigger and higher.) It rises (r.z, in the token's radii) for a
  // moment, or sinks lower behind the token.
  float big = smoothstep(40.0, 90.0, 2.0 * R);
  float U = R * mix(0.64, 0.74, big);
  vec2 o = vec2(0.03 * R * sin(time * 0.21 + seed * 7.0), -tok - 0.78 * U - r.z * R);
  vec2 w = vec2(p.x - o.x, o.y - p.y) / U;

  // The surge: a band of the Well's light rising from under the token, up
  // round it and through the skull, quick, then gone.
  float sk2 = clamp(surgeAge / 0.85, 0.0, 1.0);
  float surgeK = surgeAge < 1.2 ? smoothstep(0.0, 0.08, surgeAge) * (1.0 - sk2 * sk2) : 0.0;
  float surgeY = mix(1.15 * tok, o.y - 1.4 * U, 1.0 - (1.0 - sk2) * (1.0 - sk2));
  if (surgeK > 0.0) {
    float sb = exp(-pow((p.y - surgeY) / (0.45 * R), 2.0));
    col += ABYSS_BRIGHT * sb * (exp(-beyond / (0.25 * tok + 1.0)) * 0.9 + exp(-beyond / (0.8 * tok)) * 0.12) * surgeK * light * clear;
  }
  float surgeU = (o.y - surgeY) / U;
  float px = 1.0 / U;
  float c = r.w;
  // Its turn: yaw, then pitch (bowed forward), then roll; m takes its own
  // space to the world's, and its transpose back.
  float cy = cos(r.x), sy = sin(r.x);
  float cp = cos(r.y), sp = sin(r.y);
  float cr = cos(s.x), sr = sin(s.x);
  mat3 yaw = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cp, -sp, 0.0, sp, cp);
  mat3 roll = mat3(cr, sr, 0.0, -sr, cr, 0.0, 0.0, 0.0, 1.0);
  mat3 m = roll * pitch * yaw;
  mat3 mt = transpose(m);

  // The sockets' fire: how hot (flaring toward white, grey with ash), and
  // where each burns in the world.
  float fire = light * (0.75 + 0.9 * flare) * (1.0 - 0.75 * ash);
  vec3 eyeL = m * vec3(-0.3, -0.22, 0.64);
  vec3 eyeR = m * vec3(0.3, -0.22, 0.64);

  // (A sphere round it all, so a ray marches only through it.)
  float bound = c > 0.01 ? 2.05 : 1.45;
  vec3 bc3 = m * vec3(0.0, 0.2, 0.0);
  vec2 bc = w - bc3.xy;
  vec3 sk = vec3(0.0);
  float hitZ = -1e3;
  float skCover = 0.0;
  if (dot(bc, bc) < bound * bound) {
    // An orthographic ray from the viewer through the pixel, in the skull's space.
    vec3 ro = mt * vec3(w, 3.0);
    vec3 rd = mt * vec3(0.0, 0.0, -1.0);
    float span = sqrt(max(bound * bound - dot(bc, bc), 0.0));
    float t = 3.0 - bc3.z - span;
    float tEnd = 3.0 - bc3.z + span;
    float minD = 1e3;
    vec3 near = ro;
    bool hit = false;
    vec3 lp = ro;
    for (int i = abyss_zero; i < 48; i++) {
      lp = ro + rd * t;
      float d = abyss_map(lp, c);
      if (d < minD) {
        minD = d;
        near = lp;
      }
      if (d < 0.3 * px) { hit = true; break; }
      t += d * 0.9;
      if (t > tEnd) break;
    }
    // A ray that just misses is shaded where it came closest, fading out
    // over a pixel and a half: the outline's edge, smoothed.
    float cover = hit ? 1.0 : 1.0 - smoothstep(0.0, 1.5 * px, minD);
    skCover = cover;
    if (cover > 0.0) {
      sk = abyss_shade(hit ? lp : near, m, c, light, flare, fire, eyeL, eyeR, s.z, seed, px, vec2(surgeU, surgeK)) * cover;
      if (hit) hitZ = (m * lp).z;
    }
    // A faint green breath hugging its outline low down, where the Well lights it.
    float lowE = smoothstep(0.6, -0.9, w.y);
    if (!hit) sk += ABYSS_GREEN * exp(-minD / 0.06) * 0.08 * light * lowE * (1.0 + 0.6 * flare);
  }

  // The fire itself, deep in each socket: a white-mint point and its green
  // halo, hidden where the bone stands in front of it.
  for (int k = 0; k < 2; k++) {
    vec3 e = k == 0 ? eyeL : eyeR;
    float seen = smoothstep(e.z - 0.04, e.z - 0.12, hitZ);
    float d = length(w - e.xy);
    float flick = 0.88 + 0.12 * sin(time * (3.1 + float(k) * 0.7) + seed * 9.0) * sin(time * 1.7 + float(k));
    float core = exp(-pow(d / max(0.045 + 0.03 * flare, 0.7 * px), 2.0));
    float halo = exp(-d / (0.09 + 0.07 * flare));
    vec3 fc = mix(ABYSS_BRIGHT, ABYSS_MINT, 0.55 + 0.4 * min(flare, 1.0)) * core * 1.8 + ABYSS_GREEN * halo * 0.45;
    sk += fc * fire * flick * seen;
  }

  // The Well's light rising off the top of the token into its face: a soft
  // tongue of green between the rim and the skull's chin, light only, so the
  // wearer is what lights it and the two read as one.
  float riseY = (-tok - p.y) / (0.78 * U + r.z * R + 1.0);
  float riseK = smoothstep(-0.15, 0.1, riseY) * exp(-max(riseY, 0.0) * 2.2);
  float riseW = exp(-pow((p.x - o.x) / (0.42 * U + 1.0), 2.0));
  sk += ABYSS_GREEN * riseK * riseW * 0.16 * breath * light * (1.0 + 0.5 * flare) * (1.0 - skCover);

  // The skull is behind the token: its disc hides it.
  col += sk * clear;
  // Its fire falls on the top of the token's rim, a thin band just inside
  // the face's edge.
  float band = exp(-pow((tok - 0.5 * (tok - R) - rr) / max(1.2, 0.05 * R), 2.0)) * smoothstep(0.1 * R, -0.85 * R, p.y);
  col += ABYSS_GREEN * band * 0.4 * fire * (1.0 - clear);
  // The ash: the fire and the light gone grey.
  float l = dot(col, vec3(0.3, 0.5, 0.2));
  col = mix(col, vec3(l) * vec3(0.62, 0.72, 0.66), ash * 0.85);
  return col;
}
`;
