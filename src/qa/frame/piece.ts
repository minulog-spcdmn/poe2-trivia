// A piece's frame (qa.html?frame=p0&b=<bench>&size=<size>&k.<control>=...;
// &all: every state side by side): the component on its own, as its bench
// (src/qa/benches) draws it, at the frame's size. Like a scene's frame it
// starts with storage of its own, cleared, and is checked at rest; unlike
// one, the desk's controls reach it as they move, without a reload.

import { emulate } from './emulate.ts';
import { freeze, installFreeze } from './freeze.ts';
import { check, listen, outline } from './checks.ts';
import { settle } from './settle.ts';
import { handOnKeys, trackWebgl } from './boot.ts';
import { isSizeKey, sizeOf } from '../sizes.ts';
import { deskOrigin, isDeskMessage, type FrameMessage } from '../messages.ts';
import { valuesOf, type Values } from '../bench.ts';

/** How long it stays still after a change before it's checked again (ms). */
const RECHECK_MS = 600;
/** How long after a click or a key in it a change counts as its doing (ms). */
const TOUCHED_MS = 5000;

export async function bootPiece(asked: URLSearchParams) {
  const size = sizeOf(isSizeKey(asked.get('size')) ? (asked.get('size') as Parameters<typeof sizeOf>[0]) : 'desktop');
  // (size=fit: the desk's own window, as it is.)
  if (asked.get('size') !== 'fit') emulate(size);
  installFreeze();
  const heard = listen();
  const gls = trackWebgl();
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });

  const storage = await import('../../lib/storage.ts');
  const clear = () => {
    storage.removeStoredStarting('', 'local');
    storage.removeStoredStarting('', 'session');
  };
  clear();
  const { pieceByKey } = await import('../benches/pieces.ts');
  const bench = pieceByKey(asked.get('b'));
  if (!bench) {
    document.body.textContent = `No bench called ${asked.get('b')}.`;
    return;
  }
  await import('../../app.css');
  const [{ mount }, { default: Host }, { piece, fire }, { default: View }, sound, spatial, fxUi, cursor, autoscroll, { switchedOff }] = await Promise.all([
    import('svelte'),
    import('./PieceHost.svelte'),
    import('./pieceState.svelte.ts'),
    bench.view(),
    import('../../lib/sound.ts'),
    import('../../lib/spatial.svelte.ts'),
    import('../../lib/fx/ui.ts'),
    import('../../lib/ownCursor.ts'),
    import('../../lib/autoscroll.ts'),
    import('../../lib/switchedOff.ts'),
  ]);
  piece.values = valuesOf(bench.controls, Object.fromEntries([...asked].filter(([k]) => k.startsWith('k.')).map(([k, v]) => [k.slice(2), v])));
  sound.installUiSounds();
  spatial.installSpatial();
  fxUi.installUiFx();
  if (!switchedOff('cursor')) cursor.installCursor();
  autoscroll.installAutoscroll();

  const slot = asked.get('frame') ?? '';
  const tell = (m: FrameMessage) => parent.postMessage(m, deskOrigin(asked));
  mount(Host, { target: document.getElementById('app')!, props: { bench, View, all: asked.has('all'), set: (values: Values) => tell({ qa: 'set', values }), pick: (index: number) => tell({ qa: 'pick', index }) } });
  handOnKeys(tell, true);
  addEventListener('pagehide', () => {
    // Lets go of its WebGL (the effects') at once as it goes, so the next frame's shaders don't wait on this one's.
    for (const gl of gls) gl.getExtension('WEBGL_lose_context')?.loseContext();
    clear();
  });
  tell({ qa: 'ready', slot });

  outline(asked.get('o') !== '0');
  let again: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    const settled = await settle();
    const problems = check(heard);
    tell({ qa: 'checked', slot, settled, problems });
    // (For a shot of it taken as a page of its own: it has come to rest.)
    (window as Window & { __qa?: unknown }).__qa = { settled, problems };
  };
  const soon = () => {
    clearTimeout(again);
    again = setTimeout(run, RECHECK_MS);
  };
  addEventListener('message', (e) => {
    if (e.origin !== deskOrigin(asked) || !isDeskMessage(e.data)) return;
    const m = e.data;
    if (m.qa === 'outlines') outline(m.on);
    else if (m.qa === 'freeze') freeze(m.on);
    else if (m.qa === 'replay') {
      freeze(false);
      piece.replay++;
      soon();
    } else if (m.qa === 'action') {
      fire(m.key);
      soon();
    } else if (m.qa === 'values') {
      // Only what changed: a control the same as before leaves the piece be (an answer still growing).
      for (const [k, v] of Object.entries(m.values)) if (piece.values[k] !== v) piece.values[k] = v;
      soon();
    }
  });
  await run();
  // Checked again once what it shows has changed after a click or a key in it, as a scene's frame is.
  let touchedAt = -Infinity;
  addEventListener('pointerdown', () => (touchedAt = performance.now()), true);
  addEventListener('keydown', () => (touchedAt = performance.now()), true);
  new MutationObserver(() => performance.now() - touchedAt < TOUCHED_MS && soon()).observe(document.getElementById('app')!, { childList: true, subtree: true, characterData: true });
}
