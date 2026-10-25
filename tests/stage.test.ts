import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutZoomOf, stageZoom, unzoomPin, zoomOf } from '../src/lib/stage.ts';

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

test('laptops and ordinary desktops are never scaled', () => {
  assert.equal(stageZoom(1440, 725), 1);
  assert.equal(stageZoom(1512, 790), 1);
  assert.equal(stageZoom(1728, 925), 1);
  assert.equal(stageZoom(1920, 970), 1, 'just under 980 tall');
  assert.equal(stageZoom(1280, 1400), 1, 'narrow and tall');
});

test('larger windows scale by the smaller of width / 1440 and height / 980', () => {
  assert.ok(near(stageZoom(2560, 1310), 1.34), `1440p: ${stageZoom(2560, 1310)}`);
  assert.ok(near(stageZoom(3840, 2030), 2.07), `4K: ${stageZoom(3840, 2030)}`);
  assert.ok(near(stageZoom(1920, 1080), 1080 / 980), 'a full-screen 1080p window by its height');
  assert.ok(near(stageZoom(3440, 1440), 1440 / 980), 'an ultrawide by its height');
});

test('the scale stops at 2.2', () => {
  assert.equal(stageZoom(7680, 4320), 2.2);
});

test("a card's face drawn at twice its size and scaled back is no zoom on screen, but all of its zoom to what reads its transforms", () => {
  const cards = { currentCSSZoom: 1.36 };
  const face = { currentCSSZoom: 2.72, parentElement: cards, closest: () => face };
  const inFace = { currentCSSZoom: 2.72, closest: () => face } as unknown as Element;
  assert.equal(zoomOf(inFace), 1.36);
  assert.equal(layoutZoomOf(inFace), 2.72);
  const plain = { currentCSSZoom: 1.36, closest: () => null } as unknown as Element;
  assert.equal(zoomOf(plain), 1.36);
  assert.equal(layoutZoomOf(plain), 1.36);
});

test("a leaving list item's pin, measured on screen, is scaled back to its own px under zoom", () => {
  const item = (transform: string, z: number) => ({ currentCSSZoom: z, style: { transform } }) as unknown as HTMLElement;
  const pinned = item('translate(268px, -134px)', 1.34);
  unzoomPin(pinned);
  assert.equal(pinned.style.transform, `translate(${268 / 1.34}px, ${-134 / 1.34}px)`);
  const after = item('rotate(2deg) translate(100px, 50px)', 2);
  unzoomPin(after);
  assert.equal(after.style.transform, 'rotate(2deg) translate(50px, 25px)', 'only the pin, the last translate, is touched');
  const sideways = item('translate(100px)', 2);
  unzoomPin(sideways);
  assert.equal(sideways.style.transform, 'translate(50px, 0px)', 'a pin read back without its zero Y');
  const plain = item('translate(10px, 20px)', 1);
  unzoomPin(plain);
  assert.equal(plain.style.transform, 'translate(10px, 20px)', 'no zoom, nothing to undo');
  const none = item('', 2);
  unzoomPin(none);
  assert.equal(none.style.transform, '');
});

test("a Delve zone's title card, outside the shell, carries the stage's zoom too, for a browser that doesn't say (measured on it)", () => {
  Object.assign(globalThis, { innerWidth: 2560, innerHeight: 1440, document: { documentElement: { style: { getPropertyValue: () => '1.469' } } } });
  const card = { offsetWidth: 1743, getBoundingClientRect: () => ({ width: 2560 }) };
  const inCard = (sel: string) => (sel.split(',').some((s) => s.trim() === '.zc') ? card : null);
  const letter = { closest: inCard } as unknown as Element;
  assert.equal(zoomOf(letter), 1.469);
  const said = { currentCSSZoom: 1.469, closest: () => null } as unknown as Element;
  assert.equal(zoomOf(said), 1.469, 'a browser that says is taken at its word');
});
