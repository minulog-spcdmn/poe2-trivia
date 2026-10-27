// The note by the pointer (the room code's, once copied) stays on the
// screen: a tap on the lobby's last letters on a phone put it off the right
// edge, below and right of the finger as if for a mouse. Measured at 375 x
// 812 on the lobby: the note 130 px wide, the code's letters centred at x 42
// to 333.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { noteSpot, NOTE_ABOVE_TOUCH, NOTE_BY_MOUSE, NOTE_EDGE } = await import('../src/lib/pointerNote.ts');

const PHONE = { w: 375, h: 812 };
const NOTE = { w: 130, h: 26 };
const LETTERS = [42, 100, 159, 217, 275, 333];
const onScreen = (at: { x: number; y: number }, screen = PHONE) =>
  at.x >= NOTE_EDGE && at.x + NOTE.w <= screen.w - NOTE_EDGE && at.y >= NOTE_EDGE && at.y + NOTE.h <= screen.h - NOTE_EDGE;

test("a tap's note is on the screen whichever letter was tapped, on a 375 and a 412 px phone", () => {
  for (const screen of [PHONE, { w: 412, h: 915 }])
    for (const x of LETTERS) {
      const at = noteSpot({ x: (x * screen.w) / PHONE.w, y: 300 }, NOTE, screen, true);
      assert.ok(onScreen(at, screen), `${screen.w} px, a tap at ${x}: ${JSON.stringify(at)}`);
    }
});

test("a tap's note is above it, out from under the hand, and centred on it where there's room", () => {
  const at = noteSpot({ x: 159, y: 300 }, NOTE, PHONE, true);
  assert.equal(at.y + NOTE.h, 300 - NOTE_ABOVE_TOUCH);
  assert.equal(at.x + NOTE.w / 2, 159);
  // With no room above (a tap by the top), below it rather than off the screen.
  const top = noteSpot({ x: 159, y: 20 }, NOTE, PHONE, true);
  assert.equal(top.y, 20 + NOTE_ABOVE_TOUCH);
});

test("a mouse's note is below and right of the pointer, and mirrored by an edge", () => {
  assert.deepEqual(noteSpot({ x: 600, y: 400 }, NOTE, { w: 1440, h: 900 }, false), { x: 600 + NOTE_BY_MOUSE.x, y: 400 + NOTE_BY_MOUSE.y });
  // By the right edge it goes left of the pointer, by the bottom above it: never under it, never off the screen.
  const corner = noteSpot({ x: 333, y: 800 }, NOTE, PHONE, false);
  assert.deepEqual(corner, { x: 333 - NOTE_BY_MOUSE.x - NOTE.w, y: 800 - NOTE_BY_MOUSE.y - NOTE.h });
  assert.ok(onScreen(corner));
});

test('a note wider than the screen starts at its edge', () => {
  assert.equal(noteSpot({ x: 100, y: 300 }, { w: 400, h: 26 }, PHONE, true).x, NOTE_EDGE);
  assert.equal(noteSpot({ x: 100, y: 300 }, { w: 400, h: 26 }, PHONE, false).x, NOTE_EDGE);
});
