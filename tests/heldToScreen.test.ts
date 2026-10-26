import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heldToScreen } from '../src/lib/viewport.ts';

test('only the home-screen app has its viewport held to the screen, not Chrome’s tab', () => {
  const ios = { standalone: true } as unknown as Navigator;
  const tab = () => true;
  const still = () => false;
  // The home-screen app: iOS's standalone, and no toolbars to slide (its large and small viewports are both the screen).
  assert.equal(heldToScreen(ios, still), true);
  // Chrome's tab on an iPhone: a WKWebView, standalone too, but its toolbars slide.
  assert.equal(heldToScreen(ios, tab), false);
  // Safari's tab, Android's installed app, a desktop: no standalone, and nothing is laid out to ask.
  const asked = () => assert.fail('the viewport measured where navigator.standalone is not true');
  assert.equal(heldToScreen({ standalone: false } as unknown as Navigator, asked), false);
  assert.equal(heldToScreen({} as Navigator, asked), false);
  assert.equal(heldToScreen(undefined, asked), false);
});
