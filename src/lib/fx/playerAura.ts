// A try-out of auras players could earn (the kinds in lib/auraKinds.ts; on
// the QA desk, lib/auraTrial.svelte.ts): each burns on a player's avatar
// from its own files in ./auras/, drawn by the effects layer (its light in
// the shader, particles) and, for what light can't do, layers of the page
// under and over the avatar's face. While one is on its avatar it burns on:
// how often they'd show, and what they cost, is for later, once it's clear
// which are worth having.

import { boxOf, fxActive, onFxChange, task, type Handle } from './core';
import { planeOf, type Plane } from './plane';
import { auraSlot, type AuraKind } from '../auraKinds';
import { BURNS } from './auras';
import type { AuraContext, AuraEvent, Burning } from './auras/common';

/** The avatars wearing an aura now, each with what it does when its player's moment comes. */
const feeling = new Map<HTMLElement, (e: AuraEvent) => void>();

/**
 * Something happens to a player (lib/fx/moments.ts): their aura, if they
 * wear one, reacts. `at` is their avatar, or what holds it (a pill, a row).
 */
export function auraFeels(at: Element, e: AuraEvent) {
  if (!feeling.size) return;
  // (Or what wears one in an avatar's place: an aura's card, data-aura.)
  const el = at.closest('.avatar, [data-aura]') ?? at.querySelector('.avatar, [data-aura]');
  if (el instanceof HTMLElement) feeling.get(el)?.(e);
}

/** How far the layer under the face reaches past the avatar, in avatars (on each side). */
const REACH = 3;
/** How far past the token's edge its rim's rings reach (px), which the layer under the face leaves clear. */
const RIM = 3;

/**
 * Where a layer `across` avatars wide sits, centred on its avatar. Held to
 * the avatar by CSS anchor positioning where the browser has it, fixed to the
 * page rather than placed in the avatar's box: a box reaching past the avatar
 * would reach past the list it's in too, and give a list that fits a
 * scrollbar. (The anchor follows it as the list scrolls, without a frame's
 * lag, and the layer hides once the avatar is scrolled out of sight.)
 * Without it, in the avatar's box, as before.
 */
const ANCHORED = typeof CSS !== 'undefined' && CSS.supports('anchor-name: --a') && CSS.supports('position-visibility: anchors-visible');
let anchors = 0;
function placed(anchor: string | null, across: number): Partial<CSSStyleDeclaration> {
  if (!anchor) return { position: 'absolute', inset: `${(-(across - 1) / 2) * 100}%` };
  const at = (axis: 'width' | 'height', side: 'left' | 'top') => ({ [side]: `calc(anchor(center) - anchor-size(${axis}) * ${across / 2})`, [axis]: `calc(anchor-size(${axis}) * ${across})` });
  return { position: 'fixed', positionAnchor: anchor, positionVisibility: 'anchors-visible', ...at('width', 'left'), ...at('height', 'top') } as Partial<CSSStyleDeclaration>;
}

/**
 * The layer under the avatar's face. Inside the avatar, a layer under its
 * content still lies over its own face (its background), so this one is cut
 * round the token and its rim: a box REACH avatars past it each side, masked
 * there, holding the avatar-sized layer the aura fills.
 */
function underFace(node: HTMLElement, anchor: string | null, bare: boolean): [HTMLElement, HTMLElement] {
  const span = 1 + 2 * REACH;
  // (closest-side: 100% is half the box, span avatars across, so the token's radius is 100/span %. None round a bare one: what it holds covers what it covers.)
  const hole = `calc(${(100 / span).toFixed(4)}% + ${RIM}px)`;
  const mask = bare ? '' : `radial-gradient(circle closest-side, transparent ${hole}, #000 calc(${hole} + 1px))`;
  const out = document.createElement('div');
  out.className = 'aura-under';
  out.setAttribute('aria-hidden', 'true');
  Object.assign(out.style, { ...placed(anchor, span), pointerEvents: 'none', zIndex: '-1', maskImage: mask, webkitMaskImage: mask });
  const inner = document.createElement('div');
  Object.assign(inner.style, { position: 'absolute', inset: `${((REACH / span) * 100).toFixed(4)}%`, overflow: 'visible' });
  out.append(inner);
  node.prepend(out);
  return [out, inner];
}

function overFace(node: HTMLElement, anchor: string | null): HTMLElement {
  const l = document.createElement('div');
  l.className = 'aura-over';
  l.setAttribute('aria-hidden', 'true');
  Object.assign(l.style, { ...placed(anchor, 1), pointerEvents: 'none', overflow: 'visible', zIndex: '1' });
  node.append(l);
  return l;
}

/** A copy of `node` as it looks now, its aura's layers and what it says to screen readers left out, at the top left of its box. */
function copyOf(node: HTMLElement): HTMLElement {
  const c = node.cloneNode(true) as HTMLElement;
  for (const l of c.querySelectorAll('.aura-under, .aura-over, .fx-pin')) l.remove();
  for (const e of [c, ...c.querySelectorAll('*')]) for (const a of ['title', 'aria-label', 'role']) e.removeAttribute(a);
  // (Not the avatar's anchor name with it: a copy in the layer under the face would be the anchor the layer over it finds, the last of that name.)
  Object.assign(c.style, { position: 'absolute', left: '0', top: '0', margin: '0', anchorName: '' });
  return c;
}

/**
 * Svelte action for an avatar (Avatar.svelte): `kind` burns on it for as
 * long as it's there (none: nothing). The avatar is made a stacking context
 * of its own while it wears one, so its layers stay with it. `bare`: on what
 * wears one in an avatar's place (an aura's card, ChooseCategory.svelte),
 * with no face of its own: the layer under it isn't cut round it, and both
 * are laid in its box, not anchored (it lies in a turned card's face), and
 * its light is drawn in the plane it lies in (lib/fx/plane.ts), turned with
 * it as they are. `clip`: what its light is held in (the card's face), as
 * its layers are.
 */
export function playerAura(node: HTMLElement, o: { kind: AuraKind | null; bare?: boolean; clip?: string }) {
  let kind = o.kind;
  let burning: Burning | null = null;
  let loop: Handle | null = null;
  let layers: HTMLElement[] = [];
  let plane: Plane | null = null;
  const style = { position: node.style.position, isolation: node.style.isolation, anchorName: node.style.anchorName };
  const bare = !!o.bare;
  const anchor = ANCHORED && !bare ? `--aura-${++anchors}` : null;
  const touched = () => burning?.react?.({ kind: 'touch' });
  const end = () => {
    burning?.stop();
    loop?.stop();
    feeling.delete(node);
    node.removeEventListener('pointerdown', touched);
    for (const l of layers) l.remove();
    if (layers.length) Object.assign(node.style, style);
    plane?.drop();
    plane = null;
    burning = null;
    loop = null;
    layers = [];
  };
  const start = () => {
    end();
    // (Only one this build knows: a newer host's may not be, as with a class's sigil.)
    const burn = kind ? BURNS[kind] : undefined;
    if (!kind || !burn || !fxActive()) return;
    Object.assign(node.style, { position: 'relative', isolation: 'isolate', ...(anchor && { anchorName: anchor }) });
    const [out, under] = underFace(node, anchor, bare);
    const over = overFace(node, anchor);
    layers = [out, over];
    const clip = (o.clip && node.closest(o.clip)) || undefined;
    if (bare) plane = planeOf(node, clip);
    const ctx: AuraContext = { el: node, under, over, slot: auraSlot(kind), copyFace: () => copyOf(node), bare, ...(plane ? { plane } : { clip }) };
    const on = plane;
    const b0 = burn(ctx);
    burning = b0;
    if (b0.react) feeling.set(node, (e) => b0.react?.(e));
    node.addEventListener('pointerdown', touched, { passive: true });
    // (Kept while the tab is away, as its endless shapes are: dropped, they would stand still for good once it's back.)
    loop = task(
      (dt) => {
        if (burning !== b0 || !node.isConnected) return false;
        const b = on ? on.box() : boxOf(node);
        b0.step(dt, b, Math.max(0.3, b.w / 32));
        return true;
      },
      { keep: true },
    );
  };
  start();
  const off = onFxChange(() => (fxActive() ? start() : end()));
  return {
    update(n: { kind: AuraKind | null; bare?: boolean; clip?: string }) {
      if (n.kind === kind) return;
      kind = n.kind;
      start();
    },
    destroy() {
      off();
      end();
    },
  };
}
