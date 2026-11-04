// A fossil kept (docs/gameplay.md, Delve, "Fossils"): the reveal, held to
// the lamp. The card never said which fossil; a right answer is the payoff,
// the biggest moment a right answer has in Delve. The question's stage was
// set in the card's amber, its lamp turned low (StageAmber.svelte): now the
// lamp comes up behind it and the stage floods with its light, the item and
// its circle lost in it. In the light a shape darkens into view, the fossil
// caught in the amber as the card's emblem was, soft and deep and rising
// toward the face. Then it comes free: lit from within, overbright and a
// little nearer, settling sharp to its own light, as the amber round it
// darkens (its light gone into the fossil); glints ring off its edges and a
// band of lamplight sweeps it. Its name is written in beneath, letter by
// letter, as the pen writes a circle's script, and its count under it. A
// rare's lamp surges a second time, hotter, before the fossil comes free (all
// that follows later for it), its sun spangles catching in turn; it comes
// free with a ring of light out over the stage, rays behind it, and a second
// sweep in red-gold. Then it flies to its place in the line under the title
// (QuestionView's .found-fossil), where it stays for the rest of the question,
// the amber fading back to the stage as it was.
//
// The motion, in order (ms from the verdict, which marks the answer and
// flares the circle first; green stays the right answer's); a rare's from
// 1060 on 260 later (FOSSIL_REVEAL.RARE_LATER):
//    260 to 760   the lamp comes up behind the amber, its light spreading
//                 out from the heart; the item and its circle fade into it;
//    600 to 1060  the fossil's shape darkens in, deep and soft, rising;
//    820 to 1100  a rare: the lamp surges again, hotter; its spangles catch;
//   1060          it comes free, lit, overbright and soft, a little nearer,
//                 sharp and in its own light by 1560 as the band of
//                 lamplight crosses it (1120 to 1500); the amber darkens
//                 round it, warm only behind it; a rare's ring and rays;
//   1100          glints ring off its edges, a light flashes behind it;
//   1280 to 1900  its name is written in beneath, letter by letter;
//   1900 to 2150  its count comes in under it ("7 of 25"; "Rare" for a rare);
//   1480          a rare: its second sweep, red-gold;
//   2150 to 3150  held;
//   3150 to 3810  it flies to the line along an arc that rises before it
//                 falls, shrinking to the line's picture; the name and count
//                 fade here as the line's come in there; the amber fades
//                 back to the stage under it;
//   3810          it lands: the line's picture takes it with a short swell.
// With reduced motion, nothing moves: the line alone, at 760 ms.
//
// It all hangs on the page's body (fixed, outside the game's transformed
// stage), zoomed as the stage is, built and taken away here. Its amber is a
// copy of the stage's (StageAmber's `.moment`), the same images, lit here.

import { backdropDropShadow } from './backdropDropShadow.ts';
import { flare, glints, rays, ring, shards } from './fx/effects.ts';
import { fxActive, type Vec3 } from './fx/core.ts';
import { holdLight, light } from './lights.ts';
import { sfx } from './sound.ts';
import { zoomOf } from './stage.ts';
import { fossilArt, fossilById, type FossilId } from './fossils.ts';
import { FOSSIL_REVEAL, beatAt, type FindSize } from './fossilReveal.ts';
import { FOSSIL_AMBER, amberLight } from './fossilAmber.ts';
import { inclusionImages } from './amberImage.ts';

const { KINDLE, LIT, SHAPE, FREE, GLINTS, SWEPT, SHARP, NAME, COUNT, SHOWN, FLY, LANDS, SURGE, RARE_SWEEP, RING, LINE_LEAD } = FOSSIL_REVEAL;

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
  /** The amber the question's stage is set in (StageAmber's `.moment`), copied here and lit; null, none (a dark veil instead). */
  amber: Element | null;
  /** The item's stage (or the pictures'), where it comes up, and the question, for a stage too small. */
  art: Element | null;
  stage: Element | null;
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
 * URL: what its shape in the amber is painted from, and what it and its
 * picture are masked by. Null where it can't be made.
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
  let glow = 0;
  const stop = () => {
    for (const t of timers) clearTimeout(t);
    cancelAnimationFrame(glow);
    lamp?.release();
    lamp = null;
    shadow?.destroy();
    root?.remove();
    root = null;
    say('landed');
    if (current?.stop === stop) current = null;
  };
  current = { stop };

  if (u.still) {
    at(LIT, () => say('landed'));
    return stop;
  }

  const fossil = fossilById(u.id);
  const rare = fossil.rare;
  /** A beat's time for this fossil (a rare's later from FREE on). */
  const b = (ms: number) => beatAt(ms, rare);
  const n = SIZE[u.size];
  // Its outline, and its shape as the amber caught it (lib/amber's paintInclusion, from that), painted while the lamp comes up.
  const zoom = u.art ? zoomOf(u.art) : 1;
  const outline = outlineOf(u.id);
  const caught = outline.then((url) => (url ? inclusionImages(url, n, n, Math.min(4, Math.round(zoom * devicePixelRatio * 100) / 100), rare) : null));

  at(KINDLE, () => {
    const artBox = u.art?.getBoundingClientRect();
    const onArt = !!(artBox && u.art && artBox.height / zoomOf(u.art) >= ART_MIN);
    const over = onArt ? u.art : u.stage;
    const overBox = over?.getBoundingClientRect();
    if (!overBox || !overBox.width) return stop();
    const z = zoomOf(over!);
    const box = own(overBox, z);

    root = document.createElement('div');
    root.className = 'fossil-reveal';
    root.setAttribute('aria-hidden', 'true');
    root.style.zoom = String(z);

    // The stage's amber, copied over it to be lit; over a stage too small, or with none, the resin's dark as a veil.
    const slab = document.createElement('div');
    slab.className = 'fr-slab';
    Object.assign(slab.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
    const copy = onArt && u.amber ? (u.amber.cloneNode(true) as HTMLElement) : null;
    if (copy) {
      copy.classList.remove('ghost');
      slab.append(copy);
    } else slab.classList.add('bare');
    const part = (sel: string) => copy?.querySelector<HTMLElement>(sel) ?? null;
    const shade = part('.shade.low');
    const lampLayer = part('.light');
    const bloom = part('.bloom');
    // A rare's heart, hotter: its bloom twice over.
    const bloom2 = rare && bloom ? (bloom.cloneNode(true) as HTMLElement) : null;
    if (bloom2) bloom.after(bloom2);
    const spangles = [...(copy?.querySelectorAll<HTMLElement>('.spangle') ?? [])];

    // Its shape caught in the amber (its body darkening what's under it, its rim lit), then the fossil itself,
    // lit; the band of lamplight that sweeps it (a copy of it, overbright, under a sliding stripe); a rare's red-gold one.
    const inc = document.createElement('div');
    inc.className = 'fr-inc';
    const rim = document.createElement('div');
    rim.className = 'fr-inc rim';
    void caught.then((got) => {
      if (got) {
        inc.style.backgroundImage = `url('${got.body}')`;
        rim.style.backgroundImage = `url('${got.rim}')`;
      } else inc.append(picture(u.id, 'fr-flat'));
    });
    void outline.then((url) => {
      if (url) for (const el of [inc, rim, piece]) el.style.setProperty('--outline', `url('${url}')`);
    });
    const piece = document.createElement('div');
    piece.className = 'fr-piece';
    const art = picture(u.id, 'fr-art');
    const sweep = picture(u.id, 'fr-sweep');
    piece.append(art, sweep);
    const sweep2 = rare ? picture(u.id, 'fr-sweep red') : null;
    if (sweep2) piece.append(sweep2);

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
    // A rare's ring of light, where the effects can't draw theirs.
    const cssRing = rare && !fxActive() ? document.createElement('div') : null;
    if (cssRing) cssRing.className = 'fr-ring';

    root.append(slab, ...(cssRing ? [cssRing] : []), inc, rim, piece, label);
    document.body.append(root);

    // The fossil in the lamp's heart, the stage's middle, its words beneath; raised as far as they need to fit.
    const gap = Math.max(4, n * 0.05);
    const below = gap + label.offsetHeight;
    const cx = box.x + box.w / 2;
    const cy = Math.max(box.y + n / 2 + 2, Math.min(box.y + box.h / 2, box.y + box.h - below - n / 2 - 4));
    const top = cy - n / 2;
    for (const el of [inc, rim, piece]) Object.assign(el.style, { left: `${cx - n / 2}px`, top: `${top}px`, width: `${n}px`, height: `${n}px` });
    label.style.left = `${cx}px`;
    label.style.top = `${top + n + gap}px`;
    if (cssRing) Object.assign(cssRing.style, { left: `${cx}px`, top: `${cy}px`, width: `${n * 1.2}px`, height: `${n * 1.2}px` });
    shadow = backdropDropShadow(name);
    // (The lamp's own light raised with it, where the fossil is.)
    const lift = cy - (box.y + box.h / 2);

    // ---- the lamp comes up behind the amber, its light spreading from the heart; the item fades into it ----
    const kindle = LIT - KINDLE;
    slab.animate([{ opacity: 0 }, { opacity: 1 }], { duration: kindle - 80, easing: 'cubic-bezier(0.5, 0, 0.6, 1)', fill: 'forwards' });
    shade?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: kindle, easing: 'cubic-bezier(0.35, 0, 0.4, 1)', fill: 'forwards' });
    const swell = rare
      ? [
          { transform: `translateY(${lift}px) scale(0.78)` },
          { transform: `translateY(${lift}px) scale(1.06)`, offset: (LIT - KINDLE) / (b(FREE) - KINDLE), easing: IN_OUT },
          { transform: `translateY(${lift}px) scale(1.18)` },
        ]
      : [{ transform: `translateY(${lift}px) scale(0.78)` }, { transform: `translateY(${lift}px) scale(1.06)` }];
    lampLayer?.animate(swell, { duration: b(FREE) - KINDLE, easing: OUT, fill: 'forwards' });
    bloom?.animate(
      [
        { opacity: 0, transform: `translateY(${lift}px) scale(0.7)` },
        { opacity: 0, transform: `translateY(${lift}px) scale(0.7)`, offset: 0.3 },
        { opacity: 1, transform: `translateY(${lift}px) scale(1.08)`, offset: 0.75 },
        { opacity: 0.9, transform: `translateY(${lift}px) scale(1)` },
      ],
      { duration: kindle + 240, easing: 'ease-out', fill: 'forwards' },
    );
    // A rare's surge: its heart flares again, hotter, its spangles catching the light one after another.
    bloom2?.animate(
      [
        { opacity: 0, transform: `translateY(${lift}px) scale(0.8)` },
        { opacity: 0.95, transform: `translateY(${lift}px) scale(1.15)`, offset: 0.6 },
        { opacity: 0.7, transform: `translateY(${lift}px) scale(1.1)` },
      ],
      { delay: until(SURGE), duration: b(FREE) - SURGE, easing: 'ease-out', fill: 'both' },
    );
    spangles.forEach((sp, i) =>
      sp.animate([{ opacity: 0.55 }, { opacity: 1, offset: 0.3 }, { opacity: 0.75 }], { delay: until(SURGE - 120 + i * 70), duration: 640, easing: 'ease-in-out', fill: 'both' }),
    );
    // The backdrop's light round the stage swells with the lamp, surges for a rare, and dims as the fossil takes it.
    lamp = holdLight(slab, AMBER, Math.max(box.w, box.h) * 0.7);
    const breathe = () => {
      const t = performance.now() - t0;
      const up = Math.min(1, Math.max(0, (t - KINDLE) / kindle));
      const surge = rare ? Math.min(1, Math.max(0, (t - SURGE) / (b(FREE) - SURGE))) : 0;
      const after = Math.min(1, Math.max(0, (t - b(FREE)) / 700));
      const k = (0.18 + 0.52 * up * up + 0.25 * surge) * (1 - 0.55 * after);
      lamp?.set(k, Math.max(box.w, box.h) * (0.7 + 0.35 * up + 0.2 * surge));
      if (root && lamp) glow = requestAnimationFrame(breathe);
    };
    glow = requestAnimationFrame(breathe);

    // ---- in the light, its shape darkens into view: caught in the amber, deep and soft, rising ----
    const held = b(FREE) - SHAPE;
    const shape = held + 220;
    inc.animate(
      [
        { opacity: 0, transform: 'scale(0.84)', filter: 'blur(7px)' },
        { opacity: 1, transform: 'scale(0.97)', filter: 'blur(1.2px)', offset: held / shape, easing: 'ease-in' },
        { opacity: 0, transform: 'scale(1.03)', filter: 'blur(0.6px)' },
      ],
      { delay: until(SHAPE), duration: shape, easing: 'cubic-bezier(0.3, 0, 0.5, 1)', fill: 'both' },
    );
    rim.animate(
      [
        { opacity: 0, transform: 'scale(0.84)' },
        { opacity: 0.3, transform: 'scale(0.93)', offset: (held * 0.6) / shape },
        { opacity: 1, transform: 'scale(0.97)', offset: held / shape, easing: 'ease-in' },
        { opacity: 0, transform: 'scale(1.03)' },
      ],
      { delay: until(SHAPE), duration: shape, easing: 'ease-in', fill: 'both' },
    );

    // ---- it comes free: lit from within, nearer, settling sharp; the amber darkens round it ----
    at(b(FREE), () => {
      sfx('findReward');
      piece.animate(
        [
          { opacity: 0, transform: 'scale(0.97)' },
          { opacity: 1, transform: 'scale(1.03)', offset: 0.12 },
          { opacity: 1, transform: 'scale(1.07)', offset: 0.36, easing: 'ease-in-out' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: SHARP - FREE, easing: OUT, fill: 'forwards' },
      );
      art.animate(
        [
          { filter: 'brightness(2.5) saturate(0.8) blur(2.5px)' },
          { filter: 'brightness(1.35) blur(0.6px)', offset: 0.5 },
          { filter: 'brightness(1) blur(0)' },
        ],
        { duration: SHARP - FREE, easing: 'ease-out', fill: 'forwards' },
      );
      sweep.animate(SWEEP, { delay: 60, duration: SWEPT - FREE - 60, easing: IN_OUT, fill: 'forwards' });
      // The amber round it gives its light to it: the lamp low again, warm only behind it.
      shade?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 560, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)', fill: 'forwards' });
      lampLayer?.animate([{ transform: `translateY(${lift}px) scale(${rare ? 1.18 : 1.06})` }, { transform: `translateY(${lift}px) scale(0.92)` }], { duration: 700, easing: OUT, fill: 'forwards' });
      for (const [el, from] of [[bloom, 0.9], [bloom2, 0.7]] as const)
        el?.animate([{ opacity: from }, { opacity: 1, offset: 0.12 }, { opacity: el === bloom ? 0.6 : 0 }], { duration: 760, easing: 'ease-out', fill: 'forwards' });
      light(piece, { color: rare ? amberLight('rareMid', 1.1) : AMBER, radius: n * (rare ? 3.4 : 2.6), intensity: rare ? 0.85 : 0.7, hold: 0.2, decay: 1.2 });
      flare(piece, { size: n * 0.3, streak: n * (rare ? 3.6 : 2.6), life: 0.7, color: rare ? RED_GOLD : AMBER_HOT, intensity: 0.8, clear: art });
      if (rare) {
        ring(piece, { radius: Math.max(box.w, box.h) * 0.62, from: n * 0.45, thickness: 7, life: RING / 1000, color: RED_GOLD, breakup: 0.25, intensity: 0.9 });
        rays(piece, { radius: n * 1.9, count: 14, life: 1.8, fadeIn: 0.2, spin: 0.02, intensity: 0.16, color: RED_GOLD, clear: art });
        if (cssRing) {
          const reach = Math.max(box.w, box.h) / (n * 1.2);
          cssRing.animate(
            [
              { opacity: 0, transform: 'translate(-50%, -50%) scale(0.6)' },
              { opacity: 1, transform: 'translate(-50%, -50%) scale(0.9)', offset: 0.12 },
              { opacity: 0, transform: `translate(-50%, -50%) scale(${(reach * 1.3).toFixed(2)})` },
            ],
            { duration: RING, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' },
          );
        }
      }
    });
    at(b(GLINTS), () => glints(art, { count: rare ? 9 : 7, color: rare ? RED_GOLD : AMBER_HOT, area: 'edge', size: [4, 9], life: [0.5, 0.9], delay: [0, 0.22] }));
    if (sweep2) at(b(FREE) + RARE_SWEEP, () => sweep2.animate(SWEEP, { duration: 420, easing: IN_OUT, fill: 'forwards' }));

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

    // ---- it flies to the line; the name and count fade here as the line's come in there; the amber goes ----
    at(b(FLY), () => {
      const dest = u.to()?.getBoundingClientRect();
      label.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
      slab.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LANDS - FLY, easing: 'ease-in-out', fill: 'forwards' });
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
      const k = d.w / n;
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
 * Dynamite: the stage's amber shatters with the question, in amber shards
 * flung from all of it (Game.svelte, as the blast takes the question in `node`).
 */
export function shatterFossilAmber(node: Element) {
  const box = node.querySelector('.stage-amber.moment')?.getBoundingClientRect();
  if (!box?.width) return;
  shards(box, { count: 26, colors: [AMBER_HOT, amberLight('mid', 2.6), amberLight('edge', 1.7)], cool: amberLight('resin', 1.13), speed: [140, 420], size: [2.5, 6.5], area: 'fill' });
}
