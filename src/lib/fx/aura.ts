// The creator's aura. zoe_arcana made the game (isHeldName in names.ts says
// which names are hers), and wherever her avatar shows, living ruby-and-gold
// magic circles it: motes of light ride a tilted orbit round it, trailing
// light, dimmer on the far side where they pass behind it, in a ruby glow
// that seeps out from behind it; from FULL_AT embers drift up off it; now
// and then a mote glints as it swings past in front. The Orbit shape
// (renderer.ts) draws an avatar's orbit in one small quad; the numbers are
// in orbit.ts.
//
// One driver: Avatar.svelte puts `use:arcaneAura` on her avatars. Each is
// followed as it moves (flips, transitions, scrolling: shapes read its box
// every frame), sized to the avatar as drawn (a scale-in grows its aura with
// it), dimmed with its opacity, and let go as soon as it leaves the page.
//
// Cost. While anything is alive, the effects layer draws a full frame every
// frame: it clears and fills a screen-sized HDR target, blooms it through
// five smaller levels down and four up, and composites it over every pixel
// of the screen (about a dozen passes, at up to 1.5 texels per CSS px), and
// the compositor blends the canvas over the whole page. An aura that never
// ended would keep all of that running for the whole game, so it shows in
// turns instead: for SHOW.life seconds with a short breath of GAP seconds
// between, on all her avatars at once so they share the time the loop is
// awake (DUTY, about four fifths of the time). In each breath the loop can
// sleep, the canvas is hidden and her ring (CSS, in Avatar.svelte) marks her. All of it moves calmly (the fastest
// mote is under 90px/s), so phones draw it at 30fps. Its own share of a
// frame is small next to those passes: in SwiftShader, auras on eight
// avatars made no measurable difference to a drawn frame, and stepping them
// takes about 20us of script, so what it costs is the time it keeps the loop
// awake. A showing leaves out avatars that are off-screen, invisible or
// dimmed (offline) and stops on one that scrolls away; it waits, on timers
// alone, while the tab is hidden, a dialog is open or a big moment is
// playing (and would hide it). Effects switched off clear it, and it comes
// back when they're on again.

import { boxOf, budget, fxActive, fxHidden, fxStats, onFxChange, onFxHidden, particle, shape, task, type Box, type ShapeFrame, type Vec3 } from './core';
import { C, glints, rand } from './effects';
import { Shape } from './particles';
import { ShapeType } from './renderer';
import { FIRST, SHOW, auraEnvelope, auraForm, nextGap, orbitPoint, type AuraForm } from './orbit';
import { openDialog } from '../behindDialog';
import { opacityOf } from '../opacity';

const k3 = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];

/** The aura on one avatar: `step` runs it each frame (false once it's over), `stop` fades it out. */
type Glow = { step: (dt: number) => boolean; stop: (fade?: number) => void };
type Entry = { dim: boolean; glow: Glow | null };
/** Her avatars on the page. */
const entries = new Map<HTMLElement, Entry>();

/** The showing that is out, and how far into it we are (effect time, s). */
let current: { age: number } | null = null;
/** A grand avatar came too late to join the showing that is out: the next one comes soon. */
let soon = false;
let timer: ReturnType<typeof setTimeout> | undefined;
/** When the planned showing is due (performance.now() ms). */
let timerAt = 0;
let unlisten: (() => void) | null = null;

function stopTimer() {
  clearTimeout(timer);
  timer = undefined;
}

/** Plans the next showing in `seconds`, unless one is out or due sooner. */
function plan(seconds: number) {
  if (!entries.size || !fxActive() || current) return;
  const at = performance.now() + seconds * 1000;
  if (timer !== undefined && timerAt <= at) return;
  stopTimer();
  timerAt = at;
  timer = setTimeout(() => {
    timer = undefined;
    show();
  }, seconds * 1000);
}

/** Whether an element is on screen and can be seen at all. */
function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && opacityOf(el) > 0.05;
}

/** A big moment (a reveal, a victory's coins) is playing: the aura would only be lost in it. */
const bigMoment = () => fxStats().particles > 150;

/** Brings the aura out on every avatar of hers that can show it. `now` skips the waiting (her entrance). */
function show(now = false) {
  if (!fxActive() || !entries.size || current) return;
  // Not now: look again in a while. (Timers only: the effects loop sleeps.)
  if (fxHidden() || openDialog().backdrop || (!now && bigMoment())) return plan(3);
  const ready = [...entries].filter(([el, e]) => !e.dim && onScreen(el));
  if (!ready.length) return plan(3);
  const showing = { age: 0 };
  current = showing;
  for (const [el, e] of ready) e.glow = ignite(el, SHOW.life);
  // One task runs the showing for all her avatars. It counts effect time, as
  // the shapes do (which falls behind the clock when frames take longer than
  // 1/15 s), so the next showing is planned only once this one is over: at
  // its end, or as soon as none of her avatars still shows it (dimmed,
  // scrolled away), so the loop can sleep.
  task((dt, age) => {
    if (current !== showing) return false;
    showing.age = age;
    let glowing = false;
    for (const e of entries.values()) {
      if (e.glow && !e.glow.step(dt)) e.glow = null;
      if (e.glow) glowing = true;
    }
    if (age < SHOW.life && glowing) return true;
    current = null;
    for (const e of entries.values()) e.glow = null;
    plan(soon ? FIRST : nextGap());
    soon = false;
    return false;
  });
}

/** An avatar that appears while the aura is out joins in for the rest of it. */
function join(el: HTMLElement, e: Entry) {
  const left = current ? SHOW.life - current.age : 0;
  if (!e.dim && !e.glow && left > SHOW.fadeIn + SHOW.fadeOut && onScreen(el)) e.glow = ignite(el, left);
}

/** Effects switched off (or lost) take every shape and task with them; when they're back, so is the aura. */
function fxChanged() {
  if (fxActive()) {
    if (!current) plan(FIRST);
    return;
  }
  endShowing();
}

/** No showing, and none planned; the glows' shapes and tasks are gone already, or end themselves. */
function endShowing() {
  stopTimer();
  current = null;
  soon = false;
  for (const e of entries.values()) e.glow = null;
}

/**
 * The tab went away or came back. Away, the effects drop the showing's
 * orbits (they run their course; see setHidden in core.ts), so the showing
 * ends with them: its embers and glints would otherwise go on round a bare
 * avatar once it's back. Back, the next one comes soon.
 */
function hiddenChanged(away: boolean) {
  if (away) endShowing();
  else plan(FIRST);
}

/**
 * The aura on one avatar for `life` seconds: two Orbit shapes on the same
 * orbit (ruby glow under gold light), embers and glints.
 */
function ignite(el: HTMLElement, life: number): Glow {
  // Its form by layout size, which a transform (a scale-in) doesn't change;
  // lengths then follow the size it is drawn at.
  const form = auraForm(el.offsetWidth || el.getBoundingClientRect().width);
  const lead = Math.random() * Math.PI * 2;
  const angle = (age: number) => lead + form.speed * age;
  const scaleOf = (b: Box) => Math.max(0.01, b.w / form.size);

  const orbit = (f: ShapeFrame, age: number, b: Box, k: number, trail: number, mote: number) => {
    const sc = scaleOf(b);
    const reach = form.radius + mote * 3.4;
    // The shader fades everything out over the outer 28% of the quad.
    f.hw = f.hh = (reach / 0.7) * sc;
    f.k = k * auraEnvelope(age, life);
    f.q[0] = form.disc * sc;
    f.q[1] = form.radius * sc;
    f.q[2] = form.tilt;
    f.q[3] = form.roll;
    f.q[4] = angle(age);
    f.q[5] = form.motes;
    f.q[6] = trail;
    f.q[7] = mote * sc;
  };
  // Ruby: a wide glow round each mote and the long afterglow of its trail,
  // and the glow seeping out from behind the avatar.
  const afterglow = shape({
    type: ShapeType.Orbit,
    at: el,
    life,
    calm: true,
    followOpacity: true,
    color: C.ruby,
    update(f, _t, age, b) {
      orbit(f, age, b, 0.5, form.trail * 1.5, form.mote * 1.9);
      f.q[11] = 0.3;
    },
  });
  // Gold: the motes and the bright ends of their trails.
  const motes = shape({
    type: ShapeType.Orbit,
    at: el,
    life,
    calm: true,
    followOpacity: true,
    color: C.gold,
    update(f, _t, age, b) {
      orbit(f, age, b, 1, form.trail, form.mote);
      f.q[11] = 0;
    },
  });

  let age = 0;
  let stopped = false;
  let embersDue = 0;
  let glintsLeft = form.glints;
  let glintAt = rand(1.6, 2.6);
  const stop = (fade = 0.5) => {
    stopped = true;
    afterglow.stop(fade);
    motes.stop(fade);
  };
  return {
    stop,
    step(dt) {
      age += dt;
      if (stopped || !el.isConnected || age >= life) return false;
      const b = boxOf(el);
      // Scrolled away: let it go, so the loop can sleep.
      if (b.y + b.h / 2 < 0 || b.y - b.h / 2 > innerHeight || b.x + b.w / 2 < 0 || b.x - b.w / 2 > innerWidth) {
        stop(0.3);
        return false;
      }
      const sc = scaleOf(b);
      embersDue += dt * form.embers * auraEnvelope(age, life) * (budget(100) / 100);
      if (embersDue >= 1) {
        embersDue--;
        const o = sparkOpacity(el);
        if (o) ember(form, b, sc, o);
      }
      // A glint off the lead mote as it swings past in front.
      if (glintsLeft > 0 && age >= glintAt && age < life - SHOW.fadeOut) {
        const p = orbitPoint(form, angle(age), sc);
        if (p.depth > 0.6) {
          const o = sparkOpacity(el);
          const g = Math.sqrt(sc);
          if (o) glints({ x: b.x + p.x, y: b.y + p.y }, { count: 1, area: 'centre', size: [4 * g, 7 * g], life: [0.45, 0.65], color: k3(C.goldPale, o) });
          glintsLeft--;
          glintAt = age + rand(1.8, 2.8);
        }
      }
      return true;
    },
  };
}

/**
 * How bright embers and glints off `el` may be (its opacity), or 0 for none:
 * when it's faint, or behind an open dialog. (Particles start at a point,
 * and light starting inside the dialog's box would count as the dialog's
 * own and show over it.)
 */
function sparkOpacity(el: Element): number {
  const d = openDialog().backdrop;
  if (d && !d.contains(el)) return 0;
  const o = opacityOf(el);
  return o > 0.3 ? o : 0;
}

/** An ember drifting up off the top of her avatar, ruby or gold. */
function ember(form: AuraForm, b: Box, sc: number, o: number) {
  const a = rand(-Math.PI * 0.85, -Math.PI * 0.15);
  const r = form.disc * sc;
  const ruby = Math.random() < 0.55;
  particle({
    x: b.x + Math.cos(a) * r,
    y: b.y + Math.sin(a) * r,
    vx: Math.cos(a) * rand(3, 10),
    vy: -rand(14, 30) * Math.sqrt(sc),
    life: rand(0.9, 1.5),
    size: rand(0.7, 1.2) * Math.sqrt(sc),
    sizeEnd: 0.3,
    color: k3(ruby ? C.rubyPale : C.gold, 0.8 * o),
    colorEnd: k3(C.ruby, 0.3 * o),
    gravity: -12,
    drag: 0.6,
    shape: Shape.Ember,
    flicker: 0.5,
    fadeIn: 0.25,
    turbulence: 45,
  });
}

function register(el: HTMLElement, dim: boolean): Entry {
  const first = entries.size === 0;
  const e: Entry = { dim, glow: null };
  entries.set(el, e);
  if (first) {
    const offFx = onFxChange(fxChanged);
    const offHidden = onFxHidden(hiddenChanged);
    unlisten = () => {
      offFx();
      offHidden();
    };
  }
  // The first of her avatars on the page, or a grand one (the deathmatch
  // intro, the victory crown, which come and go with their moment), brings
  // the aura out soon: now if it's out already, else in a moment or as soon
  // as the one that is out (too far along to join) is over.
  const grand = auraForm(el.offsetWidth).tier === 'grand';
  if (current) {
    join(el, e);
    if (!e.glow && grand) soon = true;
  } else if (first || grand) plan(FIRST);
  return e;
}

function unregister(el: HTMLElement) {
  const e = entries.get(el);
  if (!e) return;
  const glowed = !!e.glow;
  e.glow?.stop(0.25);
  entries.delete(el);
  if (entries.size) {
    // The showing's last avatar left (the screen changed) while others came
    // too late to join it: it ends here, and they get the next one soon.
    if (glowed && current && ![...entries.values()].some((x) => x.glow)) {
      current = null;
      soon = false;
      plan(FIRST);
    }
    return;
  }
  // None of hers left: the showing's task ends itself, and nothing is planned.
  endShowing();
  unlisten?.();
  unlisten = null;
}

/**
 * Svelte action for an avatar: with `on` (it's zoe_arcana's), the aura comes
 * out on it in turn with her other avatars. `dim` (offline) leaves it out.
 */
export function arcaneAura(node: HTMLElement, o: { on: boolean; dim?: boolean }) {
  let entry = o.on ? register(node, !!o.dim) : null;
  return {
    update(n: { on: boolean; dim?: boolean }) {
      if (!n.on) {
        if (entry) unregister(node);
        entry = null;
      } else if (!entry) {
        entry = register(node, !!n.dim);
      } else if (entry.dim !== !!n.dim) {
        entry.dim = !!n.dim;
        if (entry.dim) {
          entry.glow?.stop(0.4);
          entry.glow = null;
        } else join(node, entry);
      }
    },
    destroy() {
      unregister(node);
    },
  };
}

/** Brings her aura out now, if it isn't already (her entrance hands over to it). */
export function showAura() {
  if (current) return;
  stopTimer();
  show(true);
}
