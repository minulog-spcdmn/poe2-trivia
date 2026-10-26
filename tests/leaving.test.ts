// What goes out without being made inert (lib/leaving.ts): Svelte's own
// `inert = true` as an outro starts, taken by the element, lets it go the
// same way by other means; an intro turning it round brings it back as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './asVite.ts';

class FakeElement {
  dataset: Record<string, string> = {};
  style = { pointerEvents: '' };
  attrs = new Map<string, string>();
  children: FakeElement[] = [];
  blurred = 0;
  inertSet = 0;
  // (The prototype's own, as the page's elements have it.)
  get inert() {
    return this.attrs.has('inert');
  }
  set inert(v: boolean) {
    this.inertSet++;
    if (v) this.attrs.set('inert', '');
    else this.attrs.delete('inert');
  }
  getAttribute = (name: string) => this.attrs.get(name) ?? null;
  setAttribute = (name: string, v: string) => void this.attrs.set(name, v);
  removeAttribute = (name: string) => void this.attrs.delete(name);
  contains = (other: FakeElement): boolean => other === this || this.children.some((c) => c.contains(other));
  blur = () => void this.blurred++;
}
const g = globalThis as { HTMLElement?: unknown; document?: { activeElement: unknown } };
g.HTMLElement = FakeElement;
g.document = { activeElement: null };

const { GONE, outWithoutInert } = await import('../src/lib/leaving.ts');

test("an outro's inert marks the element as leaving, and none of it inert", () => {
  const stage = new FakeElement();
  const button = new FakeElement();
  stage.children.push(button);
  g.document!.activeElement = button;
  const action = outWithoutInert(stage as unknown as HTMLElement);
  stage.inert = true;
  assert.equal(stage.inertSet, 0, 'the attribute never set');
  assert.equal(stage.attrs.has('inert'), false);
  assert.equal(stage.inert, true, 'it reads as going out');
  assert.equal(stage.dataset.leaving, '');
  assert.equal(stage.style.pointerEvents, 'none');
  assert.equal(stage.getAttribute('aria-hidden'), 'true');
  assert.equal(button.blurred, 1, 'the focus let go, as inert would');
  // An intro turning it round: back as it was.
  stage.inert = false;
  assert.equal(stage.inert, false);
  assert.equal(stage.dataset.leaving, undefined);
  assert.equal(stage.style.pointerEvents, '');
  assert.equal(stage.getAttribute('aria-hidden'), null);
  action.destroy();
  stage.inert = true;
  assert.equal(stage.inertSet, 1, 'its own inert again once the action is gone');
});

test('what it had of its own comes back with it', () => {
  const card = new FakeElement();
  card.style.pointerEvents = 'auto';
  card.setAttribute('aria-hidden', 'false');
  outWithoutInert(card as unknown as HTMLElement);
  card.inert = true;
  card.inert = false;
  assert.equal(card.style.pointerEvents, 'auto');
  assert.equal(card.getAttribute('aria-hidden'), 'false');
});

test('the code that skips what is going finds either mark', () => {
  assert.deepEqual(
    GONE.split(',').map((s) => s.trim()),
    ['[inert]', '[data-leaving]'],
  );
});

test("Svelte still makes what goes out inert through the element's property, which outWithoutInert takes", () => {
  // (Should Svelte set the attribute instead, the stage would be inert again, and
  // an iPhone would repaint all of it as it goes: it would need another way.)
  const svelte = readFileSync('node_modules/svelte/src/internal/client/dom/elements/transitions.js', 'utf8');
  const out = svelte.slice(svelte.indexOf('out(fn) {'), svelte.indexOf('stop: () =>'));
  assert.match(out, /element\.inert = true;/);
  assert.doesNotMatch(svelte, /setAttribute\(\s*['"]inert/);
});
