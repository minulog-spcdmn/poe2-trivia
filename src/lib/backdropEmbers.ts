// Embers drifting through the backdrop, simulated here and drawn by the
// backdrop shader (lib/backdrop.ts) beneath the UI. Three depths: far embers
// are small and slow, near ones larger, brighter and quicker, which gives the
// dark some parallax. A deathmatch or a victory can stoke them (more speed
// and glow) through `stoke`, a deathmatch can crowd the air with more of
// them through `swarm`, and a big moment flare them up for a few seconds
// through `flare`. In Delve each stratum (lib/descent.ts) has embers of its
// own: their colour, how many, large and bright, whether sparks burst up
// from below, and what glints in the walls (`descend`); and a way of moving
// all its own, every ember of it alike (lib/emberMotion.ts: dust sifting
// down in the Mines, embers rising on the magma's heat, snow falling, motes
// drawn into the abyss's eddies, ...). Through a stratum's handover a
// growing share of them burns in the next one's colour and moves its way
// (emberTurn: one in twenty at the zone's 6th depth, nineteen in twenty
// as the next is announced, all of them at its 2nd, eased), each taking
// both as it starts a new life. Each new
// depth carries them, and the glints with the walls, up past you as the
// scene sinks (`rise`).

import { emberTurn, hallTurn, lookOf, SURFACE, type Descent, type Look } from './descent.ts';
import { backdropsVersion } from './backdrops.ts';
import { cooling, MOTIONS, motionFor, type EmberMotion } from './emberMotion.ts';

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
/** How far off the screen an ember goes before it comes round again or starts a new life (px; past where its glow shows). */
const MARGIN = 48;
/** Seconds an ember takes to turn from one motion to another when it changes colour in mid-life (a recolor). */
const TURN_S = 1.5;

type Ember = {
  period: number; // seconds to cross the screen at the classic rise (see emberMotion.ts)
  phase: number;
  size: number; // CSS px
  bright: number;
  sway: number; // px
  swayRate: number;
  flicker: number;
  /** How far a swarm has to rise before an extra ember joins it (0 to 1). */
  gate: number;
};

const r = Math.random;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** n gates spread evenly over 0 to 1 (one in each nth, at random within it), in random order. */
function spread(n: number): Float32Array {
  const g = Float32Array.from({ length: n }, (_, i) => (i + r()) / n);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [g[i], g[j]] = [g[j], g[i]];
  }
  return g;
}

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
    period: near ? 7 + r() * 4 : 11 + r() * 10,
    phase: r(),
    size: near ? 2.6 + r() * 1.6 : 1.3 + depth * 1.6,
    bright: near ? 0.9 : 0.45 + depth * 0.5,
    sway: 8 + r() * 26,
    swayRate: 0.6 + r() * 1.4,
    flicker: 5 + r() * 6,
    gate: r() * 0.7,
  };
}

/** The palette entry stratum `k` burns in. */
const entryOf = (k: number) => (((k + 1) % 4) + 4) % 4;

export class Embers {
  private list = Array.from({ length: EMBERS }, ember);
  private glintList = Array.from({ length: GLINTS }, (_, k) => glint(k));
  /** The stratum each ember burns in; each takes a new one only as it starts a new life, so a colour spreads ember by ember. */
  private burn = new Int32Array(EMBERS).fill(-1);
  /**
   * How far into a stratum's handover it takes for each ember to burn in it
   * (fixed per ember, against emberTurn): spread evenly from 0 to 1 and
   * dealt out at random, so the share burning in the new stratum keeps to
   * emberTurn.
   */
  private burnGate = spread(EMBERS);
  /** Which embers are a zone's rarer kind (the Mines' lamp sparks): those whose gate is under its share (fixed per ember, spread the same way). */
  private kindGate = spread(EMBERS);
  /**
   * Each ember's motion (an index into MOTIONS), taken with its colour; and
   * after a recolor in mid-life, the one it is turning from and how far
   * (0 to 1), so it turns smoothly rather than jumping.
   */
  readonly motion = new Uint8Array(EMBERS);
  private from = new Uint8Array(EMBERS);
  private mix = new Float32Array(EMBERS).fill(1);
  /**
   * How far each has cooled as it moves (see cooling), and how far it had as
   * it took its new motion: the one it turns from keeps that, so the embers
   * of a cooled magma never heat up again as they turn their new way (a
   * jump, after which the scene, and so `cooling`, is the new depth's).
   */
  private cool = new Float32Array(EMBERS);
  private fromCool = new Float32Array(EMBERS);
  /** Where each is (px) before its sway and curl, and how far through its life (0 to 1). */
  private bx = new Float32Array(EMBERS);
  private by = new Float32Array(EMBERS);
  private u = new Float32Array(EMBERS);
  /** Seconds it rests, dark, before its life starts (a lamp spark now and then). */
  private wait = new Float32Array(EMBERS);
  /** Each life's own draws (0 to 1): its drift (or vent), its curl's size, its curl's phase, and its life's length. */
  private ra = new Float32Array(EMBERS);
  private rb = new Float32Array(EMBERS);
  private rc = new Float32Array(EMBERS);
  private rd = new Float32Array(EMBERS);
  /** How many lives each has started. */
  readonly lives = new Uint32Array(EMBERS);
  /** The screen they were placed on (0: not placed yet), to keep them in place as it changes size. */
  private placedW = 0;
  private placedH = 0;
  private look: Look = SURFACE;
  /** The stratum the scene heads for, and how far it has turned into it; and the same of the scene as shown (the magma cools with it). */
  private aim = { stratum: 0, turn: 0 };
  private shown = { stratum: 0, turn: 0 };
  /** The strata the palette holds (the one aimed at), and the backdrops' version it was built from (the tool's drafts), to rebuild it only when either changes. */
  private paletteFor = NaN;
  private paletteVersion = -1;
  private strataColor = new Float32Array(PALETTE * 7);
  /** How large they are (the look's), eased; and how restless (the look's agit: the deeper their flicker, the dimmer on average), eased. */
  private scale = 1;
  private agit = 0;
  /** How restless their flicker, shimmer and puffs are: 1, or less with effects off. */
  private restless = 1;
  /** The glints' twinkle and the eddies' wandering, on a clock of its own. */
  private glintT = r() * 100;
  /** The stratum aimed at last step: a jump of more than one recolours them all at once. */
  private aimed = 0;
  /** Sparks: (x, y, vx, vy, age, life) each, and the seconds to the next burst. */
  private sparks = new Float32Array(SPARKS * 6);
  /** The stratum each spark burns in: its burst's (see burstStratum), whose embers' colour it takes. */
  private sparkBurn = new Int32Array(SPARKS);
  private burstIn = 2;
  /** The two eddies' centres, (x, y) each as fractions of the screen; the Abyssal Depths' embers are drawn into them. */
  readonly eddies = new Float32Array(4);
  /** How far the glints have been carried up with the walls by plunges (px). */
  private glintLift = 0;
  /** How much taller than wide their glow (and the sparks', not the glints') is drawn: streaking up as the scene sinks (see rise). */
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
  /** (x, y, size + SIZE_STRIDE * palette entry, brightness) of every ember, then every glint, then every spark. */
  readonly pos = new Float32Array((EMBERS + GLINTS + SPARKS) * 4);
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
  /** One ember's motion this step, as `sample` works it out (fields, so the step allocates nothing). */
  private mvx = 0;
  private mvy = 0;
  private mox = 0;
  private moy = 0;
  private msize = 1;
  private mbright = 1;
  private mflicker = 0;
  private mrate = 1;
  private mgone = false;
  /** The eddy an ember is drawn to (px) and which way round (`centre`). */
  private cx = 0;
  private cy = 0;
  private spin = 1;

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
   * past it, the nearer (larger) faster, whichever way they move themselves,
   * coming round again below as they leave the top (in the same life, so
   * none changes colour for it); and the glints in the walls go up with the
   * walls, the far ones out in the open slower. `h` is the screen's height.
   */
  rise(px: number, h: number) {
    const tall = h + 2 * MARGIN;
    for (let i = 0; i < EMBERS; i++) {
      let y = this.by[i] - px * (0.4 + 0.25 * this.list[i].size);
      if (y < -MARGIN) y += tall;
      else if (y > h + MARGIN) y -= tall;
      this.by[i] = y;
    }
    this.glintLift += px;
  }

  /**
   * The scene swung `px` sideways (dynamite, see swing in descent.ts): the
   * embers are carried the other way past it, the nearer (larger) faster,
   * coming round again on the far side as they leave (in the same life).
   * `w` is the screen's width.
   */
  slide(px: number, w: number) {
    const wide = w + 2 * MARGIN;
    for (let i = 0; i < EMBERS; i++) {
      let x = this.bx[i] - px * (0.4 + 0.25 * this.list[i].size);
      if (x < -MARGIN) x += wide;
      else if (x > w + MARGIN) x -= wide;
      this.bx[i] = x;
    }
  }

  get level() {
    return this.heat;
  }

  /**
   * Follows a Delve (the surface outside one): `shown` is the scene as shown,
   * whose look they take; `aim` the scene it heads for. An ember starting a
   * new life burns in the stratum `aim` is in, or the one before while it is
   * still turning, so none turns back while the depth eases in.
   */
  descend(shown: Descent, aim: { stratum: number; turn: number } = shown) {
    this.look = shown.look;
    this.shown = shown;
    this.aim = aim;
    // A jump (leaving a run, a rejoin): the scene cross-fades straight there, and the embers go with it.
    if (Math.abs(aim.stratum - this.aimed) > 1) this.recolorDue = true;
    this.aimed = aim.stratum;
  }

  /** The stratum ember `i` burns in if it starts now. */
  private pick(i: number) {
    return emberTurn(this.aim.turn) > this.burnGate[i] ? this.aim.stratum : this.aim.stratum - 1;
  }

  /**
   * Every ember takes the colour of the depth it heads for at once (a new
   * stratum, a rejoin), instead of at its next life, and turns to its way of
   * moving. It happens at the next step, after the backdrop has passed on
   * the depth just set.
   */
  recolor() {
    this.recolorDue = true;
  }
  private recolorDue = false;

  /** The colours of the strata around the one aimed at, by palette entry. */
  private strataPalette() {
    const k = this.aim.stratum;
    if (k === this.paletteFor && backdropsVersion === this.paletteVersion) return;
    this.paletteFor = k;
    this.paletteVersion = backdropsVersion;
    for (let s = k - 2; s <= k + 1; s++) {
      const look = lookOf(s);
      const o = entryOf(s) * 7;
      this.strataColor.set(look.ember, o);
      this.strataColor.set(look.core, o + 3);
      this.strataColor[o + 6] = look.coreMix;
    }
  }

  /** Ember `i` starts a new life: in the colour and motion of the stratum it heads for, placed where that motion starts one (`seed`: anywhere along it, to fill the screen at the start). */
  private born(i: number, w: number, h: number, seed: boolean) {
    const b = this.pick(i);
    this.burn[i] = b;
    const id = motionFor(b, this.kindGate[i]);
    this.motion[i] = id;
    this.from[i] = id;
    this.mix[i] = 1;
    const m = MOTIONS[id];
    this.ra[i] = r();
    this.rb[i] = r();
    this.rc[i] = r();
    this.rd[i] = r();
    const resting = m.rest[1] > 0;
    this.wait[i] = !resting ? 0 : seed ? r() * m.rest[1] : m.rest[0] + r() * (m.rest[1] - m.rest[0]);
    this.u[i] = seed && !resting ? r() : 0;
    const u = this.u[i];
    let x: number;
    let y: number;
    if (m.pull > 0 || m.swirl > 0) {
      // Somewhere round the eddy it is drawn to.
      this.centre(i, w, h);
      const reach = EDDY_REACH * Math.min(w, h);
      const a = r() * 6.283;
      const d = reach * (0.35 + 1.3 * r());
      x = Math.min(0.98 * w, Math.max(0.02 * w, this.cx + d * Math.cos(a)));
      y = Math.min(0.98 * h, Math.max(0.02 * h, this.cy + d * Math.sin(a)));
    } else {
      x = m.puff > 0 ? (w * (Math.floor(this.ra[i] * m.vents) + 0.2 + 0.6 * r())) / m.vents : (r() * 1.1 - 0.05) * w;
      const span = (h * 1.08 + 32) * m.reach;
      y = m.spawn === 'below' ? h + 16 - u * span : m.spawn === 'above' ? u * span - 16 : r() * h;
    }
    this.bx[i] = x;
    this.by[i] = y;
    this.lives[i]++;
  }

  /**
   * Ember `i` takes the stratum it heads for at once, in mid-life (a
   * recolor): its colour at once, its motion over TURN_S (`snap`: at once).
   */
  private rekindle(i: number, w: number, h: number, snap: boolean) {
    const b = this.pick(i);
    this.burn[i] = b;
    const id = motionFor(b, this.kindGate[i]);
    if (id === this.motion[i]) return;
    // Resting dark between lives: it just starts afresh, its new way.
    if (this.wait[i] > 0) return this.born(i, w, h, false);
    this.from[i] = snap ? id : this.motion[i];
    this.fromCool[i] = this.cool[i];
    this.motion[i] = id;
    this.mix[i] = snap ? 1 : 0;
  }

  /** Sets (cx, cy, spin) to the eddy ember `i` is drawn to (each ember its own, the second turning the other way). */
  private centre(i: number, w: number, h: number) {
    const k = i & 1;
    this.cx = this.eddies[k * 2] * w;
    this.cy = this.eddies[k * 2 + 1] * h;
    this.spin = k ? -1 : 1;
  }

  /**
   * Works out how ember `i` moves this step under motion `m` (see
   * emberMotion.ts) into the m* fields: its velocity (px/s), its sway and
   * curl (px off where it is), its size and brightness against its own,
   * its flicker, and whether an eddy has swallowed it. `v0` is its classic
   * rise (px/s), `cool` how far its zone has cooled.
   */
  private sample(m: EmberMotion, i: number, e: Ember, w: number, h: number, v0: number, cool: number) {
    const t = this.t;
    const c = cool * m.cool;
    const speed = v0 * (1 - 0.6 * c);
    let vy = -m.rise * speed * (1 + m.accel * (1 - c) * this.u[i]);
    let vx = (m.drift + m.driftSpread * (2 * this.ra[i] - 1)) * speed;
    let ox = 0;
    let oy = 0;
    let size = m.size;
    let bright = m.bright;
    if (m.puff > 0) {
      // Each vent puffs in turn, its column of them carried up together.
      const p = Math.sin((6.283 * t) / m.puffPeriod - 1.9 * Math.floor(this.ra[i] * m.vents));
      if (p > 0) vy -= Math.sign(m.rise) * m.puff * speed * p * p * p * this.restless;
    }
    if (m.sway > 0) ox += m.sway * e.sway * Math.sin((6.283 * e.swayRate * m.swayRate * t) / e.period + 6.283 * e.phase);
    if (m.shimmer > 0) ox += m.shimmer * this.restless * Math.sin(t * 13 + i * 2.3) * Math.sin(t * 5.3 + i);
    if (m.curl > 0) {
      const rb = this.rb[i];
      const rc = this.rc[i];
      const radius = m.curl * (0.5 + 0.5 * rb);
      const a = 6.283 * (m.curlRate * (0.8 + 0.4 * rc) * t + rc);
      const z = Math.sin(a);
      ox += radius * Math.cos(a);
      oy += m.tilt * radius * z;
      size *= 1 + 0.25 * m.depth * z;
      bright *= 1 + 0.35 * m.depth * z;
    }
    let gone = false;
    if (m.pull > 0 || m.swirl > 0) {
      // Drawn in and round, quicker round the nearer, dimming as it nears the middle.
      this.centre(i, w, h);
      const dx = this.bx[i] - this.cx;
      const dy = this.by[i] - this.cy;
      const d = Math.sqrt(dx * dx + dy * dy) + 1;
      const reach = EDDY_REACH * Math.min(w, h);
      const round = m.swirl * Math.min(2.2, Math.sqrt(reach / d)) * this.spin * speed;
      const inward = m.pull * speed;
      vx += (-dy * round - dx * inward) / d;
      vy += (dx * round - dy * inward) / d;
      const near = m.swallow * reach;
      bright *= clamp01((d - near) / (3 * near));
      gone = d < near;
    }
    this.mvx = vx;
    this.mvy = vy;
    this.mox = ox;
    this.moy = oy;
    this.msize = size;
    this.mbright = bright;
    this.mflicker = m.flicker;
    this.mrate = m.flickerRate;
    this.mgone = gone;
  }

  private ease(dt: number, snap: boolean, rate: number) {
    return snap ? 1 : 1 - Math.exp(-dt * rate);
  }

  /**
   * Advances by `dt` seconds and writes (x, y, size, brightness) per ember.
   * With `calm` (effects off) they settle down: no heat, swarm or flare,
   * and less restless; each still moves its stratum's way, in its colours
   * and sizes, as part of the scene.
   */
  step(dt: number, w: number, h: number, calm = false, snap = false) {
    const look = this.look;
    const flaring = this.flareUntil > performance.now();
    this.restless += ((calm ? 0.5 : 1) - this.restless) * this.ease(dt, snap, 1.5);
    this.agit += ((calm ? 0 : look.agit) - this.agit) * this.ease(dt, snap, 1.5);
    this.scale += (look.size - this.scale) * this.ease(dt, snap, 1);
    const target = calm ? 0 : Math.max(this.heatTarget, flaring ? this.flareLevel : 0);
    this.heat += (target - this.heat) * (1 - Math.exp(-dt * 1.5));
    // A swarm builds slowly but clears out within a second or so, so it never
    // lingers into the screen after a deathmatch.
    const crowd = calm ? 0 : Math.max(this.crowdTarget, look.crowd);
    this.crowd += (crowd - this.crowd) * (1 - Math.exp(-dt * (crowd > this.crowd ? 0.8 : 4)));
    // A moment's tint (a deathmatch's red, a victory's gold) covers the stratum's colours while it lasts.
    const base = calm ? CALM : this.colorTarget;
    let tinted = 0;
    if (!calm) for (let i = 0; i < 3; i++) if (base[i] !== CALM[i]) tinted = 1;
    const colorEase = this.ease(dt, snap, 1.2);
    this.tinted += (tinted - this.tinted) * colorEase;
    for (let i = 0; i < 3; i++) this.color[i] += (base[i] - this.color[i]) * colorEase;
    this.strataPalette();
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

    const heatK = 1 + 1.6 * this.heat;
    this.t += dt * heatK;
    this.glintT += dt;
    // The eddies wander slowly about the walls, one low on the left, one high on the right.
    const gt = this.glintT;
    const ed = this.eddies;
    ed[0] = 0.17 + 0.06 * Math.sin(gt * 0.05);
    ed[1] = 0.64 + 0.08 * Math.sin(gt * 0.037 + 1);
    ed[2] = 0.82 + 0.05 * Math.sin(gt * 0.043 + 2);
    ed[3] = 0.33 + 0.08 * Math.sin(gt * 0.031 + 4);

    // Placed on the first screen they see; kept in place as it changes size.
    if (w > 0 && h > 0) {
      if (!this.placedW) for (let i = 0; i < EMBERS; i++) this.born(i, w, h, true);
      else if (w !== this.placedW || h !== this.placedH) {
        for (let i = 0; i < EMBERS; i++) {
          this.bx[i] *= w / this.placedW;
          this.by[i] *= h / this.placedH;
        }
      }
      this.placedW = w;
      this.placedH = h;
    }
    if (snap || this.recolorDue) for (let i = 0; i < EMBERS; i++) this.rekindle(i, w, h, snap);
    this.recolorDue = false;

    const t = this.t;
    // This runs every frame, so it writes into its arrays by index and
    // allocates nothing.
    const pos = this.pos;
    // A narrow screen crowds up with fewer of the extra embers.
    const extra = CALM_EMBERS + (EMBERS - CALM_EMBERS) * Math.min(1, w / 1100);
    const sizeK = (1 + 0.25 * this.heat) * this.scale;
    const brightK = (1 + 0.8 * this.heat) * look.bright;
    const span = h * 1.08 + 32;
    const { stratum, turn } = this.shown;
    // Their flicker's mean: as deep as the look's restlessness has it, so a zone's embers are as bright as its look.
    const flickerMean = 1 - (0.22 + 0.2 * this.agit);
    for (let i = 0; i < EMBERS; i++) {
      const e = this.list[i];
      const o = i * 4;
      if (this.wait[i] > 0) {
        // Resting dark till its life starts.
        this.wait[i] -= dt;
        pos[o] = this.bx[i];
        pos[o + 1] = this.by[i];
        pos[o + 2] = e.size * sizeK + SIZE_STRIDE * entryOf(this.burn[i]);
        pos[o + 3] = 0;
        continue;
      }
      const m = MOTIONS[this.motion[i]];
      const v0 = (span / e.period) * heatK;
      const cool = cooling(this.burn[i], stratum, turn);
      this.cool[i] = cool;
      this.sample(m, i, e, w, h, v0, cool);
      if (this.mix[i] < 1) {
        // Turning from the motion it had to its new one (a recolor in mid-life).
        const vx = this.mvx;
        const vy = this.mvy;
        const ox = this.mox;
        const oy = this.moy;
        const size = this.msize;
        const bright = this.mbright;
        const flicker = this.mflicker;
        const rate = this.mrate;
        const gone = this.mgone;
        this.sample(MOTIONS[this.from[i]], i, e, w, h, v0, this.fromCool[i]);
        const k = this.mix[i] * this.mix[i] * (3 - 2 * this.mix[i]);
        this.mvx += (vx - this.mvx) * k;
        this.mvy += (vy - this.mvy) * k;
        this.mox += (ox - this.mox) * k;
        this.moy += (oy - this.moy) * k;
        this.msize += (size - this.msize) * k;
        this.mbright += (bright - this.mbright) * k;
        this.mflicker += (flicker - this.mflicker) * k;
        this.mrate += (rate - this.mrate) * k;
        this.mgone = gone;
        this.mix[i] = Math.min(1, this.mix[i] + dt / TURN_S);
      }
      this.bx[i] += this.mvx * dt;
      this.by[i] += this.mvy * dt;
      // Through its life: by the clock where it hangs, by the way it has come where it crosses the screen.
      const ahead =
        m.spawn === 'anywhere'
          ? (dt * heatK) / (m.life[0] + (m.life[1] - m.life[0]) * this.rd[i])
          : ((m.spawn === 'below' ? -this.mvy : this.mvy) * dt) / (span * m.reach);
      const u = Math.max(0, this.u[i] + ahead);
      this.u[i] = u;
      let x = this.bx[i] + this.mox;
      let y = this.by[i] + this.moy;
      // Off a side, it comes round again on the other (the same life); where
      // it hangs, off the top or bottom too.
      const wide = w + 2 * MARGIN;
      const tall = h + 2 * MARGIN;
      const dx = x < -MARGIN ? wide : x > w + MARGIN ? -wide : 0;
      this.bx[i] += dx;
      x += dx;
      let over = u >= 1 || this.mgone;
      if (m.spawn === 'anywhere') {
        const dy = y < -MARGIN ? tall : y > h + MARGIN ? -tall : 0;
        this.by[i] += dy;
        y += dy;
      } else over ||= m.spawn === 'below' ? y < -MARGIN : y > h + MARGIN;
      if (over && dt > 0) {
        // A new life: it now burns in the stratum the scene heads for, and moves its way.
        this.born(i, w, h, false);
        pos[o] = this.bx[i];
        pos[o + 1] = this.by[i];
        pos[o + 2] = e.size * sizeK + SIZE_STRIDE * entryOf(this.burn[i]);
        pos[o + 3] = 0;
        continue;
      }
      const fade = Math.min(1, u / 0.1) * (1 - Math.max(0, (u - 0.62) / 0.38));
      // The extra embers join a swarm one by one as it builds, and leave as it ebbs.
      const join = i < CALM_EMBERS ? 1 : i < extra ? clamp01((this.crowd - e.gate) / 0.3) : 0;
      // A flicker about a steady mean, however deep, so a zone's brightness keeps to its look.
      const fd = Math.min(0.9, this.mflicker * this.restless * (1 + 0.5 * this.heat));
      const fr = e.flicker * this.mrate;
      const fl = flickerMean * (1 + fd * Math.sin(t * fr + i * 1.7) * Math.sin(t * fr * 0.37 + i));
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = e.size * sizeK * this.msize + SIZE_STRIDE * entryOf(this.burn[i]);
      pos[o + 3] = e.bright * fade * fl * join * brightK * this.mbright;
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
    // Sparks: now and then a burst of them flies up from below, slows in the
    // air (they never fall back: everything a burst throws up rises) and dies.
    if (!calm && look.burst > 0.02 && dt > 0) {
      this.burstIn -= dt;
      if (this.burstIn <= 0) {
        this.burst(w, h, look.burst);
        this.burstIn = (2.5 + r() * 4.5) / (0.35 + 0.65 * look.burst);
      }
    }
    const sp = this.sparks;
    const drag = Math.exp(-dt * 1.5);
    const drift = -40 * Math.sqrt(h / 800) * (1 - drag);
    for (let j = 0; j < SPARKS; j++) {
      const o = j * 6;
      const i = EMBERS + GLINTS + j;
      // (One whose stratum the palette no longer holds, after a jump, goes out.)
      const burn = this.sparkBurn[j];
      if (burn < this.aim.stratum - 2 || burn > this.aim.stratum + 1) sp[o + 4] = sp[o + 5];
      if (sp[o + 4] >= sp[o + 5]) {
        pos[i * 4 + 3] = 0;
        continue;
      }
      sp[o + 2] *= drag;
      sp[o + 3] = sp[o + 3] * drag + drift;
      sp[o] += sp[o + 2] * dt;
      sp[o + 1] += sp[o + 3] * dt;
      sp[o + 4] += dt;
      const left = 1 - sp[o + 4] / sp[o + 5];
      pos[i * 4] = sp[o];
      pos[i * 4 + 1] = sp[o + 1];
      pos[i * 4 + 2] = (1.1 + 0.5 * (j % 3)) * this.scale + SIZE_STRIDE * entryOf(burn);
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
      // Glints go up with the walls, unstreaked (the shader draws them so too).
      const tall = reach * (1 + (i >= EMBERS && i < EMBERS + GLINTS ? 0 : this.streak));
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

  /**
   * The stratum a burst belongs to, in whose embers' colour its sparks burn
   * (as an ember starting a new life takes its colour from the scene the
   * backdrop heads for, see pick): the stratum it is turning out of or the
   * one it turns into, each as often as its bursts make up the look's (a
   * look's bursts come and go with its hall, hallTurn). Not simply the one
   * it turns into: through the Magma Fissure that is already the Frozen
   * Hollow, whose embers are blue.
   */
  private burstStratum(): number {
    const { stratum, turn } = this.aim;
    const h = hallTurn(turn);
    const before = (1 - h) * lookOf(stratum - 1).burst;
    const next = h * lookOf(stratum).burst;
    return r() * (before + next) < next ? stratum : stratum - 1;
  }

  /** Throws a burst of sparks up from somewhere along the floor. */
  private burst(w: number, h: number, level: number) {
    const sp = this.sparks;
    const burn = this.burstStratum();
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
      this.sparkBurn[j] = burn;
    }
  }
}

/** The backdrop's embers, shared so effects can stoke and tint them. */
export const embers = new Embers();
