import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'svelte/compiler';

// The effects layer (FxLayer.svelte) is drawn over the whole UI and adds its
// light to it, so the game's light (an aura, a streak's fire) shows on
// whatever stands in front of where it plays, unless that hides it:
// `use:overPage` (lib/fx/core.ts) on what is opaque, `use:dialogBackdrop` on a
// dialog's backdrop, or hideLightIn() from the script. Each overlay in the
// game (an element fixed or sticky over the page, or portalled out of it)
// either hides the light, on itself or on what in it is opaque, or is listed
// below with the reason light may pass over it, so a new one can't leave the
// question open.

const root = join(import.meta.dirname, '..');

/** Overlays light may pass over, by file and class (or tag, unclassed), and why. */
const LIGHT_PASSES: Record<string, string> = {
  'components/Background.svelte .bg': 'the backdrop, behind everything',
  'components/Darkness.svelte .edge': 'a soft vignette at the screen’s edge, see-through',
  'components/FxLayer.svelte .fx': 'the effects layer itself',
  'components/GameOver.svelte .sparks': 'light of its own, a canvas of sparks',
  'components/Inventory.svelte .tip': 'a popover, in the top layer over the effects layer',
  'components/LegalSheet.svelte .sheet': 'a modal <dialog>, in the top layer over the effects layer',
  'components/ItemWindow.svelte .window': 'hides the light from its script (hideLightIn)',
  'components/PeerCursors.svelte .cursors': 'other players’ pointers, small and moving',
  'components/Recorder.svelte .recorder': 'a dev tool for recording',
  'components/RoomCodeGlyphs.svelte .note': 'drawn over the effects layer (z-index 96)',
};

function* svelteFiles(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* svelteFiles(p);
    else if (f.endsWith('.svelte')) yield p;
  }
}

type Node = { type: string; name?: string; [k: string]: unknown };

/** The classes the rules that fix an element to the screen or make it stick style. */
function stuckClasses(css: Node | null): Set<string> {
  const out = new Set<string>();
  const visit = (n: Node) => {
    if (n.type === 'Rule') {
      const decls = ((n.block as Node).children as Node[]).filter((d) => d.type === 'Declaration');
      if (decls.some((d) => d.property === 'position' && /\b(fixed|sticky)\b/.test(String(d.value)))) {
        for (const complex of ((n.prelude as Node).children as Node[]) ?? []) {
          const rel = (complex.children as Node[]).at(-1)!;
          for (const s of (rel.selectors as Node[]) ?? []) if (s.type === 'ClassSelector') out.add(String(s.name));
        }
      }
    }
    for (const k of ['children', 'block'] as const) {
      const c = n[k];
      if (Array.isArray(c)) c.forEach((x) => x && typeof x === 'object' && visit(x as Node));
      else if (c && typeof c === 'object') visit(c as Node);
    }
  };
  if (css) visit(css);
  return out;
}

/** An element's static classes. */
function classesOf(el: Node): string[] {
  const out: string[] = [];
  for (const a of el.attributes as Node[]) {
    if (a.type === 'Attribute' && a.name === 'class' && Array.isArray(a.value)) {
      for (const part of a.value as Node[]) if (part.type === 'Text') out.push(...String(part.data).split(/\s+/).filter(Boolean));
    }
    if (a.type === 'ClassDirective') out.push(String(a.name));
  }
  return out;
}

const uses = (el: Node, ...names: string[]) => (el.attributes as Node[]).some((a) => a.type === 'UseDirective' && names.includes(String(a.name)));

/** Whether `el`, or anything in it, hides the light. */
function hidesLight(el: Node): boolean {
  let found = false;
  const visit = (n: unknown) => {
    if (found || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    const node = n as Node;
    if (Array.isArray(node.attributes) && uses(node, 'overPage', 'dialogBackdrop')) {
      found = true;
      return;
    }
    for (const [k, v] of Object.entries(node)) if (k !== 'attributes' && k !== 'expression') visit(v);
  };
  visit(el);
  return found;
}

/** The overlays in a component: each with its key ("file .class") and whether it hides the light. */
function overlays(file: string): { key: string; hides: boolean }[] {
  const ast = parse(readFileSync(file, 'utf8'), { modern: true }) as unknown as { fragment: Node; css: Node | null };
  const stuck = stuckClasses(ast.css);
  const name = relative(join(root, 'src'), file).replaceAll('\\', '/');
  const out: { key: string; hides: boolean }[] = [];
  const visit = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    const node = n as Node;
    if (Array.isArray(node.attributes)) {
      const cls = classesOf(node);
      const hit = cls.find((c) => stuck.has(c));
      if (hit || uses(node, 'portal', 'portalToPage')) {
        out.push({ key: `${name} ${hit ? `.${hit}` : cls[0] ? `.${cls[0]}` : `<${node.name}>`}`, hides: hidesLight(node) });
        return;
      }
    }
    for (const [k, v] of Object.entries(node)) if (k !== 'attributes' && k !== 'expression') visit(v);
  };
  visit(ast.fragment);
  return out;
}

const files = [join(root, 'src', 'App.svelte'), ...svelteFiles(join(root, 'src', 'components'))];
const found = files.flatMap(overlays);

test('every overlay hides the light of the game behind it, or says why it may pass', () => {
  const open = [...new Set(found.filter((o) => !o.hides && !(o.key in LIGHT_PASSES)).map((o) => o.key))];
  assert.deepEqual(open, [], `Overlays the game's light shows through: put use:overPage on what in them is opaque, or list them in LIGHT_PASSES with the reason`);
});

test('every overlay light may pass over is still there', () => {
  const keys = new Set(found.map((o) => o.key));
  assert.deepEqual(
    Object.keys(LIGHT_PASSES).filter((k) => !keys.has(k)),
    [],
  );
});
