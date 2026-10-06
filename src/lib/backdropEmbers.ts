// Embers rising through the backdrop, simulated here and drawn by the
// backdrop shader (lib/backdrop.ts) beneath the UI. Three depths: far embers
// are small and slow, near ones larger, brighter and quicker, which gives the
// dark some parallax. A deathmatch or a victory can stoke them (more speed
// and glow) through `stoke`, a deathmatch can crowd the air with more of
// them through `swarm`, and a big moment flare them up for a few seconds
// through `flare`. In Delve each stratum (lib/descent.ts) has embers of its
// own: their colour, how many, how fast, large and restless they are,
// whether they rise or sink, whether eddies pull them round or sparks burst
// up from below, and what glints in the walls (`descend`). Through a
// stratum a growing share of them burns in the next one's colour, each
// taking it as it starts a new rise. Each pick of a card carries them, and
// the glints with the walls, up past you as the scene sinks (`rise`).

import { lookOf, SURFACE, type Descent, type Look } from './descent.ts';

/** The embers that are always there. */
export const CALM_EMBERS = 36;
/** All of them, the calm ones and the extra ones a swarm brings in. */
export const EMBERS = 100;
/**
 * The shader looks embers up by tile: the screen is cut into COLUMNS by ROWS
 * tiles, each holding at most SLOTS embers (those whose glow reaches it), so
 * a pixel only looks at the few near it rather than a whole column's.
 */
export const COLUMNS = 24;
export const ROWS = 12;
export const TILES = COLUMNS * ROWS;
export const SLOTS = 20;
/**
 * Colours the embers burn in at once: four strata (the one the scene is
 * turning into, the one before, and room for the strata an ember from
 * further up or down still burns in), then the glints'.
 */
export const PALETTE = 5;
export const GLINT_COLOR = 4;
/** An ember's size field holds its palette entry too: size + SIZE_STRIDE * entry (sizes stay well under it). */
export const SIZE_STRIDE = 32;
/** Glints in the side walls, and glints anywhere (the stars of a starless stratum). */
export const WALL_GLINTS = 12;
export const FREE_GLINTS = 22;
export const GLINTS = WALL_GLINTS + FREE_GLINTS;
/** Sparks a burst throws up from below (in a stratum with bursts). */
export const SPARKS = 18;
/** Where the backdrop's eddies turn (lib/backdrop.ts draws the void coiling round the same two). */
export const EDDY_REACH = 0.34;

type Ember = {
  x0: number; // fraction of the width
  period: number; // seconds to cross the screen
  phase: number;
  size: number; // CSS px
  bright: number;
  sway: number; // px
  swayRate: number;
  drift: number; // px over the whole rise
  flicker: number;
  /** How far a swarm has to rise before an extra ember joins it (0 to 1). */
  gate: number;
};

const r = Math.random;

/** The usual orange halo. */
export const CALM = SURFACE.ember;

type Glint = { x: number; y: number; rate: number; phase: number; size: number; gate: number };

/** A glint (fractions of the screen): in one of the side walls, or anywhere. */
function glint(k: number): Glint {
  const wall = k < WALL_GLINTS;
  const left = r() < 0.5;
  return {
    x: wall ? (left ? 0.03 + r() * 0.19 : 0.78 + r() * 0.19) : 0.04 + r() * 0.92,
    y: wall ? 0.12 + r() * 0.78 : 0.05 + r() * 0.88,
    rate: 0.4 + r() * 0.9,
    phase: r() * 6.283,
    size: wall ? 1.7 + r() * 1.1 : 1.4 + r() * 1.3,
    // They come in one by one as a stratum's glints grow.
    gate: ((wall ? k : k - WALL_GLINTS) + r()) / (wall ? WALL_GLINTS : FREE_GLINTS),
  };
}

function ember(): Ember {
  const depth = r();
  const near = depth > 0.82;
  return {
    x0: r() * 1.1 - 0.05,
    period: near ? 7 + r() * 4 : 11 + r() * 10,
    phase: r(),
    size: near ? 2.6 + r() * 1.6 : 1.3 + depth * 1.6,
    bright: near ? 0.9 : 0.45 + depth * 0.5,
    sway: 8 + r() * 26,
    swayRate: 0.6 + r() * 1.4,
    drift: (r() - 0.5) * 90,
    flicker: 5 + r() * 6,
    gate: r() * 0.7,
  };
}

/** The palette entry stratum `k` burns in. */
const entryOf = (k: number) => (((k + 1) % 4) + 4) % 4;

export class Embers {
  private list = Array.from({ length: EMBERS }, ember);
  private glintList = Array.from({ length: GLINTS }, (_, k) => glint(k));
  /** The stratum each ember burns in; each takes a new one only as it starts a new rise, so a colour spreads ember by ember. */
  private burn = new Int32Array(EMBERS).fill(-1);
  /** How far into a stratum's turn it takes for each ember to burn in it (fixed per ember). */
  private burnGate = Float32Array.from({ length: EMBERS }, () => r());
  /** Which embers sink rather than rise, also decided at each new rise, and what share it takes. */
  private sink = new Uint8Array(EMBERS);
  private sinkGate = Float32Array.from({ length: EMBERS }, () => r());
  /** Each ember's place in its rise last step, to see it start a new one. */
  private lastU = new Float32Array(EMBERS);
  private look: Look = SURFACE;
  /** The stratum the scene heads for, and how far it has turned into it. */
  private aim = { stratum: 0, turn: 0 };
  /** The strata the palette holds (the one aimed at), to rebuild it only when that changes. */
  private paletteFor = NaN;
  private strataColor = new Float32Array(PALETTE * 7);
  /** How restless they are, how fast and how large, eased. */
  private agit = 0;
  private pace = 1;
  private scale = 1;
  /** The draft that pushes them sideways, and the glints' twinkle, on clocks of their own. */
  private gustT = r() * 100;
  private glintT = r() * 100;
  /** The stratum aimed at last step: a jump of more than one recolours them all at once. */
  private aimed = 0;
  /** Sparks: (x, y, vx, vy, age, life) each, and the seconds to the next burst. */
  private sparks = new Float32Array(SPARKS * 6);
  private burstIn = 2;
  /** The two eddies' centres, (x, y) each as fractions of the screen; their pull is the look's `eddy`. */
  readonly eddies = new Float32Array(4);
  /** How far each ember has been carried along its rise by plunges (a share of it), and the glints with the walls (px). */
  private lift = new Float32Array(EMBERS);
  private glintLift = 0;
  /** How much taller than wide their glow is drawn: streaking up as the scene sinks (see rise). */
  streak = 0;
  /** Ember clock: runs faster while stoked. */
  private t = r() * 100;
  private heat = 0;
  private heatTarget = 0;
  private crowd = 0;
  private crowdTarget = 0;
  private flareLevel = 0;
  /** When the flare dies down (ms, performance.now()): by the clock, so one set while they sit still (effects off) is long gone when they move again. */
  private flareUntil = 0;
  /** The most slots any tile used in the last step (the backdrop uploads no more columns than that and the end marker). */
  usedMax = SLOTS;
  /** (x, y, size + SIZE_STRIDE * palette entry, brightness) of every ember and then every glint. */
  private pos = new Float32Array((EMBERS + GLINTS + SPARKS) * 4);
  /** Embers placed in each tile so far (step's scratch). */
  private used = new Uint8Array(TILES);
  /** (x, y, size + SIZE_STRIDE * palette entry, brightness) per slot, TILES rows of SLOTS; brightness 0 ends a row. */
  readonly data = new Float32Array(TILES * SLOTS * 4);
  /** Per palette entry: the halo colour and how far the core burns toward `core`. */
  readonly halo = new Float32Array(PALETTE * 4);
  readonly core = new Float32Array(PALETTE * 3);
  /** The tint a moment lays over them (eased toward `colorTarget`), and how far it covers the stratum's colours. */
  readonly color: number[] = [...CALM];
  private colorTarget: number[] = [...CALM];
  private tinted = 0;

  /** Tints the embers (their halo; the core stays near white). CALM gives them back their own colours. */
  tint(c: readonly number[] = CALM) {
    this.colorTarget = [...c];
  }

  /** Sets how hot they burn for as long as it lasts: 0 is calm, 1 a roaring fire. */
  stoke(level: number) {
    this.heatTarget = level;
  }

  /** Sets how many there are: 0 is the usual few, 1 crowds the air with every one. */
  swarm(level: number) {
    this.crowdTarget = level;
  }

  /**
   * Flares them up to `level` for `seconds`, over whatever they're stoked to.
   * It dies down by itself, so it never leaves them hot.
   */
  flare(level: number, seconds: number) {
    const now = performance.now();
    this.flareLevel = this.flareUntil > now ? Math.max(this.flareLevel, level) : level;
    this.flareUntil = Math.max(this.flareUntil, now + seconds * 1000);
  }

  /**
   * The scene sank `px` (a plunge, see descent.ts): the embers are carried up
   * past it, the nearer (larger) faster, those sinking like dust too, and
   * the glints in the walls go up with the walls, the far ones out in the
   * open slower. `h` is the screen's height.
   */
  rise(px: number, h: number) {
    const span = h * 1.08 + 32;
    for (let i = 0; i < EMBERS; i++) {
      const e = this.list[i];
      const by = ((this.sink[i] ? -1 : 1) * px * (0.4 + 0.25 * e.size)) / span;
      this.lift[i] = (((this.lift[i] + by) % 1) + 1) % 1;
      // Not a new rise: it was only carried along.
      this.lastU[i] = (((this.lastU[i] + by) % 1) + 1) % 1;
    }
    this.glintLift += px;
  }

  get level() {
    return this.heat;
  }

  /**
   * Follows a Delve (the surface outside one): `shown` is the scene as shown,
   * whose look they take; `aim` the scene it heads for. An ember starting a
   * new rise burns in the stratum `aim` is in, or the one before while it is
   * still turning, so none turns back while the depth eases in.
   */
  descend(shown: Descent, aim: { stratum: number; turn: number } = shown) {
    this.look = shown.look;
    this.aim = aim;
    // A jump (leaving a run, a rejoin): the scene cross-fades straight there, and the embers go with it.
    if (Math.abs(aim.stratum - this.aimed) > 1) this.recolorDue = true;
    this.aimed = aim.stratum;
  }

  /** The stratum ember `i` burns in if it starts now. */
  private pick(i: number) {
    return this.aim.turn > this.burnGate[i] ? this.aim.stratum : this.aim.stratum - 1;
  }

  /**
   * Every ember takes the colour of the depth it heads for at once (a new
   * stratum, a rejoin), instead of at its next rise. It happens at the next
   * step, after the backdrop has passed on the depth just set.
   */
  recolor() {
    this.recolorDue = true;
  }
  private recolorDue = false;

  /** The colours of the strata around the one aimed at, by palette entry. */
  private strataPalette() {
    const k = this.aim.stratum;
    if (k === this.paletteFor) return;
    this.paletteFor = k;
    for (let s = k - 2; s <= k + 1; s++) {
      const look = lookOf(s);
      const o = entryOf(s) * 7;
      this.strataColor.set(look.ember, o);
      this.strataColor.set(look.core, o + 3);
      this.strataColor[o + 6] = look.coreMix;
    }
  }

  /**
   * Advances by `dt` seconds and writes (x, y, size, brightness) per ember.
   * With `calm` (effects off) they settle back to their usual pace; the
   * stratum's colours and sizes stay, as part of the scene.
   */
  step(dt: number, w: number, h: number, calm = false, snap = false) {
    const look = this.look;
    const ease = (rate: number) => (snap ? 1 : 1 - Math.exp(-dt * rate));
    const flaring = this.flareUntil > performance.now();
    this.agit += ((calm ? 0 : look.agit) - this.agit) * ease(1.5);
    this.pace += ((calm ? 1 : look.speed) - this.pace) * ease(1);
    this.scale += (look.size - this.scale) * ease(1);
    const target = calm ? 0 : Math.max(this.heatTarget, flaring ? this.flareLevel : 0);
    this.heat += (target - this.heat) * (1 - Math.exp(-dt * 1.5));
    // A swarm builds slowly but clears out within a second or so, so it never
    // lingers into the screen after a deathmatch.
    const crowd = calm ? 0 : Math.max(this.crowdTarget, look.crowd);
    this.crowd += (crowd - this.crowd) * (1 - Math.exp(-dt * (crowd > this.crowd ? 0.8 : 4)));
    // A moment's tint (a deathmatch's red, a victory's gold) covers the stratum's colours while it lasts.
    const base = calm ? CALM : this.colorTarget;
    const tinted = !calm && base.some((c, i) => c !== CALM[i]) ? 1 : 0;
    this.tinted += (tinted - this.tinted) * ease(1.2);
    for (let i = 0; i < 3; i++) this.color[i] += (base[i] - this.color[i]) * ease(1.2);
    this.strataPalette();
    if (snap || this.recolorDue) for (let i = 0; i < EMBERS; i++) this.burn[i] = this.pick(i);
    this.recolorDue = false;
    const sc = this.strataColor;
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 3; i++) {
        this.halo[k * 4 + i] = sc[k * 7 + i] + (this.color[i] - sc[k * 7 + i]) * this.tinted;
        this.core[k * 3 + i] = sc[k * 7 + 3 + i];
      }
      this.halo[k * 4 + 3] = sc[k * 7 + 6];
    }
    for (let i = 0; i < 3; i++) this.core[GLINT_COLOR * 3 + i] = 1;
    this.halo.set(look.glint, GLINT_COLOR * 4);
    this.halo[GLINT_COLOR * 4 + 3] = 0.6;

    this.t += dt * this.pace * (1 + 1.6 * this.heat);
    this.gustT += dt * (0.2 + 0.35 * this.agit);
    this.glintT += dt;
    const a = this.agit;
    // The eddies wander slowly about the walls, one low on the left, one high on the right.
    const gt = this.glintT;
    const ed = this.eddies;
    ed[0] = 0.17 + 0.06 * Math.sin(gt * 0.05);
    ed[1] = 0.64 + 0.08 * Math.sin(gt * 0.037 + 1);
    ed[2] = 0.82 + 0.05 * Math.sin(gt * 0.043 + 2);
    ed[3] = 0.33 + 0.08 * Math.sin(gt * 0.031 + 4);
    const eddy = calm ? 0 : look.eddy;
    const reach2 = (EDDY_REACH * Math.min(w, h)) ** 2;
    // A draft that comes and goes, pushing the restless ones sideways.
    const gust = a * 42 * (0.65 * Math.sin(this.gustT + 1.3) + 0.35 * Math.sin(2.3 * this.gustT));
    const flickerDepth = 0.22 + 0.2 * a;
    const t = this.t;
    // This runs every frame, so it writes into its arrays by index and
    // allocates nothing.
    const pos = this.pos;
    // A narrow screen crowds up with fewer of the extra embers.
    const extra = CALM_EMBERS + (EMBERS - CALM_EMBERS) * Math.min(1, w / 1100);
    const sizeK = (1 + 0.25 * this.heat) * this.scale;
    const brightK = (1 + 0.8 * this.heat) * look.bright;
    for (let i = 0; i < EMBERS; i++) {
      const e = this.list[i];
      const u = (t / e.period + e.phase + this.lift[i]) % 1;
      const fade = Math.min(1, u / 0.1) * (1 - Math.max(0, (u - 0.62) / 0.38));
      // The extra embers join a swarm one by one as it builds, and leave as it ebbs.
      const join = i < CALM_EMBERS ? 1 : i < extra ? Math.min(1, Math.max(0, (this.crowd - e.gate) / 0.3)) : 0;
      const fl = 1 - flickerDepth + flickerDepth * Math.sin(t * e.flicker + i * 1.7) * Math.sin(t * e.flicker * 0.37 + i);
      // A new rise: this ember now burns in the stratum the scene heads for, and rises or sinks as it does.
      if (u < this.lastU[i] || snap) {
        this.burn[i] = this.pick(i);
        this.sink[i] = look.fall > this.sinkGate[i] ? 1 : 0;
      }
      this.lastU[i] = u;
      const travel = u * (h * 1.08 + 32);
      let x = e.x0 * w + (e.drift + gust) * u + Math.sin(u * Math.PI * 2 * e.swayRate + e.phase * 6.283) * e.sway * (1 + 0.7 * a);
      let y = this.sink[i] ? travel - 16 : h + 16 - travel;
      // Near an eddy an ember is swung round its centre, and drawn in a little.
      if (eddy > 0) {
        for (let k = 0; k < 2; k++) {
          const cx = ed[k * 2] * w;
          const cy = ed[k * 2 + 1] * h;
          const dx = x - cx;
          const dy = y - cy;
          const f = eddy * Math.exp(-(dx * dx + dy * dy) / reach2);
          const turn = (k ? -2.6 : 2.6) * f;
          const c = Math.cos(turn) * (1 - 0.3 * f);
          const sn = Math.sin(turn) * (1 - 0.3 * f);
          x = cx + dx * c - dy * sn;
          y = cy + dx * sn + dy * c;
        }
      }
      pos[i * 4] = x;
      pos[i * 4 + 1] = y;
      pos[i * 4 + 2] = e.size * sizeK + SIZE_STRIDE * entryOf(this.burn[i]);
      pos[i * 4 + 3] = e.bright * fade * fl * join * brightK;
    }
    // Glints: still, each twinkling on its own, coming in one by one with
    // the stratum's glints (fewer on a narrow screen), in the walls or, as
    // the stratum spreads them, anywhere.
    const narrow = 0.55 + 0.45 * Math.min(1, w / 1100);
    for (let k = 0; k < GLINTS; k++) {
      const g = this.glintList[k];
      const i = EMBERS + k;
      const amount = look.glints * (k < WALL_GLINTS ? 1 - look.spread : look.spread);
      const show = Math.min(1, Math.max(0, (amount - g.gate / narrow) / 0.15 + 1));
      const tw = 0.5 + 0.5 * Math.sin(this.glintT * g.rate + g.phase);
      // The ones out in the open drift slowly past, the larger (nearer) faster.
      const span = w * 1.08;
      pos[i * 4] = k < WALL_GLINTS ? g.x * w : ((((g.x * w - this.glintT * (1.2 + 2.6 * (g.size - 1.4))) % span) + span) % span) - w * 0.04;
      // Carried up by plunges, the walls' with the walls, the far ones slower, coming round again below.
      const tall = h * 1.1;
      const y = ((((g.y * h - this.glintLift * (k < WALL_GLINTS ? 1 : 0.3)) % tall) + tall) % tall) - h * 0.05;
      pos[i * 4 + 1] = y;
      pos[i * 4 + 2] = g.size + SIZE_STRIDE * GLINT_COLOR;
      const edge = Math.min(1, Math.max(0, Math.min(y, h - y) / 30));
      pos[i * 4 + 3] = amount > 0 ? show * edge * Math.min(1, amount * 4) * (0.35 + 0.85 * tw * tw) : 0;
    }
    // Sparks: now and then a burst of them flies up from below, slows and dies.
    if (!calm && look.burst > 0.02 && dt > 0) {
      this.burstIn -= dt;
      if (this.burstIn <= 0) {
        this.burst(w, h, look.burst);
        this.burstIn = (2.5 + r() * 4.5) / (0.35 + 0.65 * look.burst);
      }
    }
    const sp = this.sparks;
    const sparkEntry = SIZE_STRIDE * entryOf(this.aim.stratum);
    for (let j = 0; j < SPARKS; j++) {
      const o = j * 6;
      const i = EMBERS + GLINTS + j;
      if (sp[o + 4] >= sp[o + 5]) {
        pos[i * 4 + 3] = 0;
        continue;
      }
      sp[o + 3] += 300 * dt;
      sp[o] += sp[o + 2] * dt;
      sp[o + 1] += sp[o + 3] * dt;
      sp[o + 4] += dt;
      const left = 1 - sp[o + 4] / sp[o + 5];
      pos[i * 4] = sp[o];
      pos[i * 4 + 1] = sp[o + 1];
      pos[i * 4 + 2] = (1.1 + 0.5 * (j % 3)) * this.scale + sparkEntry;
      pos[i * 4 + 3] = Math.max(0, left) ** 1.4 * 1.5 * (0.75 + 0.25 * Math.sin(t * 23 + j * 2.1)) * look.bright;
    }
    // Sort the embers into the tiles their glow reaches, so each pixel of
    // the backdrop only looks at a handful.
    const data = this.data;
    const used = this.used;
    data.fill(0);
    used.fill(0);
    const colW = w / COLUMNS;
    const rowH = h / ROWS;
    // The glints first: they are few and still, and a tile too crowded to
    // hold every glow would otherwise drop one, and it would blink out.
    const all = EMBERS + GLINTS + SPARKS;
    for (let j = 0; j < all; j++) {
      const i = (j + EMBERS) % all;
      const x = pos[i * 4];
      const y = pos[i * 4 + 1];
      const z = pos[i * 4 + 2];
      const b = pos[i * 4 + 3];
      if (b <= 0 || y < -40 || y > h + 40) continue;
      const reach = (z % SIZE_STRIDE) * 6.4; // where the shader stops drawing it
      const tall = reach * (1 + this.streak);
      const c0 = Math.max(0, Math.floor((x - reach) / colW));
      const c1 = Math.min(COLUMNS - 1, Math.floor((x + reach) / colW));
      const r0 = Math.max(0, Math.floor((y - tall) / rowH));
      const r1 = Math.min(ROWS - 1, Math.floor((y + tall) / rowH));
      for (let row = r0; row <= r1; row++)
        for (let c = c0; c <= c1; c++) {
          const tile = row * COLUMNS + c;
          if (used[tile] >= SLOTS) continue;
          const k = (tile * SLOTS + used[tile]) * 4;
          data[k] = x;
          data[k + 1] = y;
          data[k + 2] = z;
          data[k + 3] = b;
          used[tile]++;
        }
    }
    let most = 0;
    for (let t = 0; t < TILES; t++) if (used[t] > most) most = used[t];
    this.usedMax = most;
  }

  /** Throws a burst of sparks up from somewhere along the floor. */
  private burst(w: number, h: number, level: number) {
    const sp = this.sparks;
    const x = (0.06 + r() * 0.88) * w;
    const lift = Math.sqrt(h / 800);
    let n = Math.round(7 + 10 * level);
    for (let j = 0; j < SPARKS && n > 0; j++) {
      const o = j * 6;
      if (sp[o + 4] < sp[o + 5]) continue;
      n--;
      sp[o] = x + (r() - 0.5) * 30;
      sp[o + 1] = h + 6;
      sp[o + 2] = (r() - 0.5) * 160;
      sp[o + 3] = -(300 + r() * 330) * lift;
      sp[o + 4] = 0;
      sp[o + 5] = 1.1 + r() * 1.3;
    }
  }
}

/** The backdrop's embers, shared so effects can stoke and tint them. */
export const embers = new Embers();
