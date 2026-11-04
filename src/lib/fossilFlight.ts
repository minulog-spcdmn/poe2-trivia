// A fossil kept (docs/gameplay.md, Delve, "Fossils"): the reveal. The card
// never said which fossil; a right answer is the payoff, the biggest moment
// a right answer has in Delve. While the question was up, the name plate held
// the fossil card's own seals, each on a pane of its amber lit from behind
// (NamePlate.svelte's `fossil`). On the verdict the lamp behind them comes up
// and they flare, until the fossil comes out of the left one, the ammonite's:
// thrown up out of the plate and over into the circle's heart, lit and
// growing as it comes, the item dimming under it, sparks shed along its way.
// It lands a touch past its size and settles; glints ring off its edges, the
// light of it swells through the hall (the backdrop's lights) and a band of
// lamplight sweeps it. Its name is written in beneath, letter by letter, as
// the pen writes a circle's script, and its count under it. A rare's seals
// surge twice and it comes out later, in red-gold light: rays of light
// behind it as it lands, a second sweep in red-gold and the word "Rare". Asked by pictures, it lands on the right one, its name in
// place of the picture's. Then it flies to its place in the line under the title
// (QuestionView's .found-fossil), where it stays for the rest of the
// question, the item coming back under it.
//
// The motion, in order (ms from the verdict, which marks the answer and
// flares the circle first; green stays the right answer's); a rare's from
// 520 on 260 later (FOSSIL_REVEAL.RARE_LATER):
//      0 to 520   the seals' lamp comes up, their light swelling round them
//                 and their panes overexposed (a rare's surging twice);
//    520          it comes out of the left seal, a spark and a flash there,
//                 drawn out and tossed up and over into the circle's heart
//                 (to 1060), growing as it comes near, turning, lit; the item
//                 dims under it; the light swells through the hall;
//   1060          it lands a touch past its size, settled by 1340, sharp and
//                 in its own light; the band of lamplight crosses it (1120 to
//                 1500); a rare's rays behind it;
//   1100          glints ring off its edges, a light flashes behind it;
//   1280 to 1900  its name is written in beneath, letter by letter;
//   1900 to 2150  its count comes in under it ("7 of 25"; "Rare" for a rare);
//   1480          a rare: its second sweep, red-gold;
//   2150 to 3150  held, the hall's light easing;
//   3150 to 3810  it flies to the line along an arc that rises before it
//                 falls, shrinking to the line's picture; the name and count
//                 fade here as the line's come in there; the item comes back
//                 once it's on its way;
//   3810          it lands: the line's picture takes it with a short swell.
// With reduced motion, nothing moves: the line alone, at 520 ms.
//
// It all hangs on the page's body (fixed, outside the game's transformed
// stage), zoomed as the stage is, built and taken away here.

import { backdropDropShadow } from './backdropDropShadow.ts';
import { flare, glints, rays, shards } from './fx/effects.ts';
import type { Vec3 } from './fx/core.ts';
import { holdLight, light } from './lights.ts';
import { sfx } from './sound.ts';
import { zoomOf } from './stage.ts';
import { fossilArt, fossilById, type FossilId } from './fossils.ts';
import { FOSSIL_REVEAL, beatAt, type FindSize } from './fossilReveal.ts';
import { FOSSIL_AMBER, amberLight } from './fossilAmber.ts';

const { LAUNCH, ARRIVES, GLINTS, SETTLED, SWEPT, NAME, COUNT, SHOWN, FLY, LANDS, RARE_SWEEP, LINE_LEAD } = FOSSIL_REVEAL;

/** Amber's light (lib/fossilAmber.ts), for the fx and the lights (HDR). */
const AMBER: Vec3 = amberLight('mid');
const AMBER_HOT: Vec3 = amberLight('core', 3.1);
const RED_GOLD: Vec3 = amberLight('rareMid', 3.15);

/** The art box (stage px) under which the fossil comes up over the whole question instead. */
const ART_MIN = 120;

const SIZE = FOSSIL_REVEAL.SIZE;

let current: { stop: () => void } | null = null;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const IN_OUT = 'cubic-bezier(0.45, 0, 0.3, 1)';
/** A band of light across the fossil: its copy's mask slides from off the left to off the right (as glint.ts's stripe). */
const SWEEP: Keyframe[] = [
  { opacity: 1, maskPosition: '100% 0', webkitMaskPosition: '100% 0' },
  { opacity: 1, maskPosition: '0% 0', webkitMaskPosition: '0% 0' },
] as Keyframe[];

export type Reveal = {
  id: FossilId;
  /** The fossils held now, this one in it, of `total`. */
  count: number;
  total: number;
  /** The pane of the plate's seal it comes out of (NamePlate's left `.pane-at .dark`); none, it comes up where it lands. */
  seal: Element | null;
  /** The item's stage (or the right picture), where it lands, and the question, for a stage too small. */
  art: Element | null;
  stage: Element | null;
  /** What dims under it while it's shown (the item, or the pictures and the right one's name), and how far. */
  dim: { el: Element; to: number }[];
  /** What its name keeps clear of where they'd meet (the stage's Details button). */
  avoid: Element | null;
  /** Asked by pictures: it lands on the right one however small, drawn smaller to fit. */
  onPicture: boolean;
  /** Its place in the line, once there is one to fly to. */
  to: () => Element | null;
  size: FindSize;
  /** Reduced motion: the line alone. */
  still: boolean;
  /** The line's words are due (`words`), then its picture (`landed`). Both come, cut short or not. */
  onLine: (phase: 'words' | 'landed') => void;
};

/** A box in the overlay's own px (the page's over `z`). */
const own = (r: DOMRect, z: number) => ({ x: r.left / z, y: r.top / z, w: r.width / z, h: r.height / z });

/** The fossil's art as an image, `cls` its part. */
function picture(id: FossilId, cls: string) {
  const img = document.createElement('img');
  img.className = cls;
  img.src = fossilArt(id, 256);
  img.alt = '';
  img.draggable = false;
  return img;
}

/**
 * The fossil's outline, from its picture's alpha with the faint haze round
 * it cut away (an overbright copy of the picture shows it as a square), as a
 * URL: what it and its picture are masked by. Null where it can't be made.
 */
const outlines = new Map<FossilId, Promise<string | null>>();
function outlineOf(id: FossilId): Promise<string | null> {
  let made = outlines.get(id);
  if (!made) {
    made = (async () => {
      try {
        const bitmap = await createImageBitmap(await (await fetch(fossilArt(id, 256))).blob());
        const canvas = document.createElement('canvas');
        [canvas.width, canvas.height] = [bitmap.width, bitmap.height];
        const g = canvas.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(bitmap, 0, 0);
        bitmap.close();
        const px = g.getImageData(0, 0, canvas.width, canvas.height);
        const d = px.data;
        for (let i = 0; i < d.length; i += 4) {
          const k = Math.min(1, Math.max(0, (d[i + 3] / 255 - 0.08) / 0.3));
          [d[i], d[i + 1], d[i + 2], d[i + 3]] = [0, 0, 0, Math.round(255 * k * k * (3 - 2 * k))];
        }
        g.putImageData(px, 0, 0);
        const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
        return blob ? URL.createObjectURL(blob) : null;
      } catch {
        return null;
      }
    })();
    outlines.set(id, made);
  }
  return made;
}

/**
 * Plays it from now, the verdict. Says what stops it (a new one, the
 * question going, Delve Deeper pressed early): all of it goes to the line.
 */
export function revealFossil(u: Reveal): () => void {
  current?.stop();
  const t0 = performance.now();
  const timers: ReturnType<typeof setTimeout>[] = [];
  /** ms from now until `ms` from the verdict (none if it's past). */
  const until = (ms: number) => Math.max(0, ms - (performance.now() - t0));
  const at = (ms: number, f: () => void) => timers.push(setTimeout(f, until(ms)));
  let said: 'none' | 'words' | 'landed' = 'none';
  const say = (phase: 'words' | 'landed') => {
    if (said === 'landed' || said === phase) return;
    if (phase === 'landed' && said === 'none') u.onLine('words');
    said = phase;
    u.onLine(phase);
  };
  let root: HTMLElement | null = null;
  let shadow: { destroy(): void } | null = null;
  let lamp: ReturnType<typeof holdLight> | null = null;
  let dimmed: Animation[] = [];
  let glow = 0;
  const stop = () => {
    for (const t of timers) clearTimeout(t);
    cancelAnimationFrame(glow);
    lamp?.release();
    lamp = null;
    for (const a of dimmed) a.cancel();
    dimmed = [];
    shadow?.destroy();
    root?.remove();
    root = null;
    say('landed');
    if (current?.stop === stop) current = null;
  };
  current = { stop };

  if (u.still) {
    at(LAUNCH, () => say('landed'));
    return stop;
  }

  const fossil = fossilById(u.id);
  const rare = fossil.rare;
  /** A beat's time for this fossil (a rare's later from LAUNCH on). */
  const b = (ms: number) => beatAt(ms, rare);
  const n = SIZE[u.size];
  const outline = outlineOf(u.id);

  at(b(LAUNCH), () => {
    const artBox = u.art?.getBoundingClientRect();
    const onArt = !!(artBox && u.art && (u.onPicture || artBox.height / zoomOf(u.art) >= ART_MIN));
    const over = onArt ? u.art : u.stage;
    const overBox = over?.getBoundingClientRect();
    if (!overBox || !overBox.width) return stop();
    const z = zoomOf(over!);
    const box = own(overBox, z);

    root = document.createElement('div');
    root.className = 'fossil-reveal';
    root.setAttribute('aria-hidden', 'true');
    root.style.zoom = String(z);

    // The fossil, lit; the band of lamplight that sweeps it (a copy of it, overbright, under a sliding stripe); a rare's red-gold one.
    const piece = document.createElement('div');
    piece.className = 'fr-piece';
    const art = picture(u.id, 'fr-art');
    const sweep = picture(u.id, 'fr-sweep');
    piece.append(art, sweep);
    const sweep2 = rare ? picture(u.id, 'fr-sweep red') : null;
    if (sweep2) piece.append(sweep2);
    void outline.then((url) => url && piece.style.setProperty('--outline', `url('${url}')`));

    // Its name, each letter on its own to be written in; its count; a rare's word.
    const label = document.createElement('div');
    label.className = 'fr-label';
    const name = document.createElement('span');
    name.className = 'fr-name';
    const letters = [...fossil.name].map((ch) => {
      const l = document.createElement('span');
      l.textContent = ch;
      return l;
    });
    name.append(...letters);
    const count = document.createElement('span');
    count.className = 'fr-count';
    count.textContent = u.count >= u.total ? `${u.count} of ${u.total} • every fossil kept` : `${u.count} of ${u.total}`;
    label.append(name, count);
    let rareWord: HTMLElement | null = null;
    if (rare) {
      rareWord = document.createElement('span');
      rareWord.className = 'fr-rare';
      rareWord.textContent = 'Rare';
      // A phone on its side has no height for a third line: the word goes beside the count.
      if (u.size === 'flat') {
        const line = document.createElement('span');
        line.className = 'fr-line';
        count.replaceWith(line);
        line.append(count, rareWord);
      } else label.append(rareWord);
    }

    root.append(piece, label);
    document.body.append(root);

    // Where it lands: the stage's middle, its words beneath, clear of the stage's edge and of what they'd
    // meet there (the Details button: only the lines as wide as to reach it go above it, a short count
    // may sit beside it); raised as far as they need, and drawn smaller where there's no room.
    const lh = label.offsetHeight;
    const cx = box.x + box.w / 2;
    const near = u.avoid?.getBoundingClientRect();
    const pill = near?.width ? own(near, z) : null;
    let floor = box.y + box.h - 8;
    if (pill)
      for (const el of label.children as HTMLCollectionOf<HTMLElement>)
        if (cx + el.offsetWidth / 2 > pill.x - 6 && cx - el.offsetWidth / 2 < pill.x + pill.w + 6) floor = Math.min(floor, pill.y - 4 + lh - el.offsetTop - el.offsetHeight);
    const gap = Math.max(4, n * 0.05);
    const size = Math.round(Math.max(40, Math.min(n, floor - box.y - 6 - gap - lh)));
    const cy = Math.max(box.y + size / 2 + 4, Math.min(box.y + box.h / 2, floor - lh - gap - size / 2));
    const top = cy - size / 2;
    Object.assign(piece.style, { left: `${cx - size / 2}px`, top: `${top}px`, width: `${size}px`, height: `${size}px` });
    label.style.left = `${cx}px`;
    label.style.top = `${top + size + gap}px`;
    shadow = backdropDropShadow(name);


    // ---- it comes out of the left seal, thrown up and over into the circle's heart, growing as it comes ----
    // (From the seal's pane, its size; with none, it comes up small where it lands.)
    const pane = u.seal?.getBoundingClientRect();
    const from = pane?.width
      ? { x: (pane.left + pane.width / 2) / z - cx, y: (pane.top + pane.height / 2) / z - cy, k: Math.max(0.06, pane.width / z / size) }
      : { x: 0, y: 0, k: 0.4 };
    const flight = b(ARRIVES) - b(LAUNCH);
    const settle = SETTLED - ARRIVES;
    const whole = flight + settle;
    // Tossed: it rises out of the plate, as anything thrown does, then falls into the heart.
    const ctrl = { x: from.x * 0.5, y: Math.min(from.y, 0) - Math.max(50, Math.abs(from.x) * 0.35) };
    const frames: Keyframe[] = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // (Drawn out of the seal, then on its way, slowing into the heart; growing most as it comes near.)
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const v = 1 - e;
      const x = v * v * from.x + 2 * v * e * ctrl.x;
      const y = v * v * from.y + 2 * v * e * ctrl.y;
      const k = from.k + (1.1 - from.k) * e * e;
      frames.push({ offset: (t * flight) / whole, opacity: Math.min(1, t / 0.12), transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${(-24 * v).toFixed(2)}deg) scale(${k.toFixed(4)})` });
    }
    frames.push({ offset: (flight + settle * 0.45) / whole, opacity: 1, transform: 'scale(0.965)' }, { offset: 1, opacity: 1, transform: 'none' });
    piece.animate(frames, { duration: whole, easing: 'linear', fill: 'forwards' });
    // Lit by the lamp it came out of, but in its own colours, and in its own light as it lands.
    art.animate([{ filter: 'brightness(1.7) saturate(0.95)' }, { filter: 'brightness(1.12)', offset: flight / whole }, { filter: 'none' }], {
      duration: whole,
      easing: 'ease-out',
      fill: 'forwards',
    });
    // A spark and a flash where it leaves the seal; sparks shed along its way.
    if (u.seal) {
      flare(u.seal, { size: 12, streak: 46, life: 0.45, color: rare ? RED_GOLD : AMBER_HOT, intensity: 0.7 });
      glints(u.seal, { count: 4, color: rare ? RED_GOLD : AMBER_HOT, area: 'edge', size: [3, 6], life: [0.35, 0.6] });
      light(u.seal, { color: rare ? amberLight('rareMid', 1.1) : AMBER, radius: 110, intensity: 0.55, hold: 0.05, decay: 0.6 });
    }
    for (const f of [0.35, 0.65]) at(b(LAUNCH) + flight * f, () => glints(piece, { count: 3, color: rare ? RED_GOLD : AMBER_HOT, area: 'edge', size: [2.5, 5], life: [0.35, 0.65] }));
    // The item dims under it as it comes, and stays dim while it's shown.
    dimmed = u.dim.map(({ el, to }) => el.animate([{ opacity: 1 }, { opacity: to }], { duration: flight - 80, easing: 'cubic-bezier(0.3, 0, 0.4, 1)', fill: 'forwards' }));
    // Its light swells through the hall as it comes, most as it lands (a rare's red-gold), and eases as it's held.
    // (Short of the hall's edges, where the zone keeps its own colour: a cold zone lit edge to edge goes muddy.)
    const hall = Math.hypot(innerWidth, innerHeight) * 0.5;
    lamp = holdLight(piece, rare ? amberLight('rareMid', 1.15) : AMBER, hall * 0.25);
    const breathe = () => {
      const t = performance.now() - t0;
      const up = Math.min(1, Math.max(0, (t - b(LAUNCH)) / flight));
      const after = Math.min(1, Math.max(0, (t - b(ARRIVES)) / (SHOWN - ARRIVES)));
      const k = (0.15 + 0.6 * up * up) * (1 - 0.6 * after) * (rare ? 1.15 : 1);
      lamp?.set(k, hall * (0.25 + 0.35 * up) * (1 - 0.2 * after));
      if (root && lamp && t < b(FLY)) glow = requestAnimationFrame(breathe);
    };
    glow = requestAnimationFrame(breathe);

    // ---- it lands in the heart: lit; the band of lamplight sweeps it; a rare's rays behind it ----
    at(b(ARRIVES), () => {
      sfx('findReward');
      sweep.animate(SWEEP, { delay: 60, duration: SWEPT - ARRIVES - 60, easing: IN_OUT, fill: 'forwards' });
      light(piece, { color: rare ? amberLight('rareMid', 1.1) : AMBER, radius: size * (rare ? 3.4 : 2.6), intensity: rare ? 0.85 : 0.7, hold: 0.2, decay: 1.2 });
      flare(piece, { size: size * 0.12, streak: size * (rare ? 3.6 : 2.6), life: 0.6, color: rare ? RED_GOLD : AMBER_HOT, intensity: 0.45, clear: art });
      if (rare) rays(piece, { radius: size * 2, count: 16, life: 2, fadeIn: 0.2, spin: 0.02, intensity: 0.24, color: RED_GOLD, clear: art });
    });
    at(b(GLINTS), () => glints(art, { count: rare ? 9 : 7, color: rare ? RED_GOLD : AMBER_HOT, area: 'edge', size: [4, 9], life: [0.5, 0.9], delay: [0, 0.22] }));
    if (sweep2) at(b(ARRIVES) + RARE_SWEEP, () => sweep2.animate(SWEEP, { duration: 420, easing: IN_OUT, fill: 'forwards' }));

    // ---- its name, written in letter by letter; then its count ----
    at(b(NAME), () => {
      label.style.opacity = '1';
      const each = (COUNT - NAME - 300) / Math.max(1, letters.length - 1);
      letters.forEach((l, i) =>
        l.animate(
          [
            { opacity: 0, color: FOSSIL_AMBER.fleck },
            { opacity: 1, color: FOSSIL_AMBER.fleck, offset: 0.3 },
            { opacity: 1, color: '#aa9e82' },
          ],
          { duration: 420, delay: i * each, easing: 'ease-out', fill: 'backwards' },
        ),
      );
    });
    at(b(COUNT), () => {
      for (const el of [count, rareWord]) el?.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: SHOWN - COUNT, easing: OUT, fill: 'forwards' });
      if (rareWord) at(b(COUNT) + 200, () => glints(rareWord!, { count: 2, color: RED_GOLD, area: 'edge', size: [5, 8] }));
    });

    // ---- it flies to the line; the name and count fade here as the line's come in there; the item comes back ----
    at(b(FLY), () => {
      const dest = u.to()?.getBoundingClientRect();
      label.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
      // (The item back once it's on its way, not under it.)
      const away = (LANDS - FLY) * 0.45;
      for (const { el, to } of u.dim)
        el.animate([{ opacity: to }, { opacity: 1 }], { delay: away, duration: LANDS - FLY - away + 120, easing: 'ease-in-out', fill: 'both' }).finished.then(
          (a) => a.cancel(),
          () => {},
        );
      for (const a of dimmed) a.cancel();
      dimmed = [];
      lamp?.release();
      lamp = null;
      if (!dest || !dest.width) {
        piece.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
        at(b(FLY) + 400, () => stop());
        return;
      }
      const d = own(dest, z);
      const end = { x: d.x + d.w / 2 - cx, y: d.y + d.h / 2 - cy };
      const ctrl = { x: end.x / 2, y: Math.min(0, end.y) - Math.max(50, Math.abs(end.x) * 0.25) };
      const k = d.w / size;
      const frames: Keyframe[] = [];
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = easeInOut(i / steps);
        const v = 1 - t;
        const x = 2 * v * t * ctrl.x + t * t * end.x;
        const y = 2 * v * t * ctrl.y + t * t * end.y;
        frames.push({ transform: `translate(${x}px, ${y}px) scale(${1 + (k - 1) * t}) rotate(${-8 * Math.sin(Math.PI * t)}deg)` });
      }
      piece.getAnimations().forEach((x) => x.cancel());
      piece.style.opacity = '1';
      piece.animate(frames, { duration: LANDS - FLY, easing: 'linear', fill: 'forwards' });
    });
    at(b(LANDS) - LINE_LEAD, () => say('words'));
    at(b(LANDS), () => {
      const dest = u.to();
      stop();
      dest?.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(0.94)', offset: 0.6 }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
    });
  });
  return stop;
}

/** Stops one under way, all of it going to the line (the game screen going: Game.svelte). */
export const stopFossilFlight = () => current?.stop();

/**
 * Dynamite: the panes of amber in the name plate's seals shatter with the
 * question, amber shards flung from each (Game.svelte, as the blast takes the
 * question in `node`).
 */
export function shatterFossilSeals(node: Element) {
  for (const pane of node.querySelectorAll('.plate.fossil .pane-at .dark')) {
    const box = pane.getBoundingClientRect();
    if (box.width) shards(box, { count: 10, colors: [AMBER_HOT, amberLight('mid', 2.6), amberLight('edge', 1.7)], cool: amberLight('resin', 1.13), speed: [90, 300], size: [2, 5], area: 'fill' });
  }
}
