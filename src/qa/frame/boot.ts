// A frame of the QA desk: the real game, as one seat of one scene sees it at
// one size (qa.html?frame=<slot>&s=<scene>&seat=<n>&size=<size>). It starts
// with nothing of its own: its storage (its own keys, src/lib/storage.ts'
// QA) is cleared, then the scene's codex, records and session are set and
// the app mounted as the game's own page mounts it (src/main.ts), minus the
// visit count. No room is behind it: its buttons only say what they would
// do. It tells the desk when it is showing, and hands on the desk's keys.

import { emulate } from './emulate.ts';
import { isSizeKey, sizeOf } from '../sizes.ts';
import type { FrameMessage } from '../messages.ts';

export async function boot(asked: URLSearchParams) {
  const size = sizeOf(isSizeKey(asked.get('size')) ? (asked.get('size') as Parameters<typeof sizeOf>[0]) : 'desktop');
  emulate(size);

  // No room here, so no WebRTC: PeerJS, as the session loads it, checks what
  // the browser supports by opening a connection, a wait the frame can do
  // without. Without the constructor it skips the check (both names: the
  // shim PeerJS carries puts the prefixed one back otherwise).
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });
  const gls = trackWebgl();

  const storage = await import('../../lib/storage.ts');
  const clear = () => {
    storage.removeStoredStarting('', 'local');
    storage.removeStoredStarting('', 'session');
  };
  clear();

  await import('../../app.css');
  const [{ mount }, { default: Root }, { session, engine }, { useEngine }, scenes, codex, records, sound, spatial, fxUi, cursor, autoscroll, { switchedOff }, { toasts }] = await Promise.all([
    import('svelte'),
    import('../../Root.svelte'),
    import('../../lib/session.svelte.ts'),
    import('../build/engine.ts'),
    import('../scenes/index.ts'),
    import('../../lib/codex.ts'),
    import('../../lib/delveRecord.ts'),
    import('../../lib/sound.ts'),
    import('../../lib/spatial.svelte.ts'),
    import('../../lib/fx/ui.ts'),
    import('../../lib/ownCursor.ts'),
    import('../../lib/autoscroll.ts'),
    import('../../lib/switchedOff.ts'),
    import('../../lib/toasts.svelte.ts'),
  ]);
  useEngine(engine);

  const key = asked.get('s');
  const scene = scenes.sceneByKey(key);
  const seat = scene?.seats[Number(asked.get('seat') ?? 0)];
  if (!scene || !seat) {
    document.body.textContent = `No scene called ${key}${scene ? ` with a seat ${asked.get('seat')}` : ''}.`;
    return;
  }
  const built = scene.build();

  // Its codex: its answers in the game, and the items they name, met for the
  // first time then; and a few met before, seen again in it.
  const c = codex.emptyCodex();
  const at = built.state.startedAt ?? 0;
  c.log = built.log ?? [];
  const meet = (id: string, first: number, last: number) =>
    (c.items[id] ??= { seen: 1, first, last, name: { n: 1, ok: 0 }, art: { n: 0, ok: 0 }, mixed: {} });
  for (const a of c.log) meet(a.id, a.t, a.t);
  for (const it of engine.items.slice(0, 5)) meet(it.id, at - 86_400_000, at + 1);
  storage.writeKey(codex.CODEX_KEY, codex.serializeCodex(c));
  // Its Delve runs, oldest first, this one last.
  records.resetRecords();
  for (const run of built.runs ?? []) records.recordRun(run);
  // The tip to play fullscreen is about the desk's own window, never the scene's (lib/fullscreenTip.ts): taken as read.
  storage.writeStored('fullscreenTip.shown', '3');

  // Who it is, and what it made of the game.
  session.mode = seat.mode;
  session.myPlayerId = seat.me;
  session.code = 'KXR4QT';
  session.hideCode = false;
  session.delveResult = built.delveResult ?? null;
  session.earned = built.earned && built.state.startedAt !== undefined ? { game: built.state.startedAt, ids: built.earned } : null;
  session.state = built.state;
  const said = (what: string) => toasts.show(what, 'info', { title: 'Preview' });
  session.dispatch = (a) => said(a.type === 'restart' ? (a.play ? 'The next game would start now.' : 'Everyone would go back to the lobby.') : `Would send: ${a.type}`);
  session.watch = (on) => said(on ? 'You would just watch the next game.' : 'You would play in the next game.');
  session.leave = () => said('You would leave the room.');

  sound.installUiSounds();
  spatial.installSpatial();
  fxUi.installUiFx();
  if (!switchedOff('cursor')) cursor.installCursor();
  autoscroll.installAutoscroll();
  mount(Root, { target: document.getElementById('app')! });

  const tell = (m: FrameMessage) => parent.postMessage(m, location.origin);
  handOnKeys(tell);
  addEventListener('pagehide', () => {
    // Lets go of its WebGL at once as it goes, so the next frame's shaders don't wait on this one's.
    for (const gl of gls) gl.getExtension('WEBGL_lose_context')?.loseContext();
    clear();
  });
  tell({ qa: 'ready', slot: asked.get('frame') ?? '' });
}

/**
 * The desk's keys, pressed in the frame, go to the desk; unless the game took
 * them, or they belong to a field or a list there. Holding keys (H, Alt)
 * hand on their letting go too.
 */
function handOnKeys(tell: (m: FrameMessage) => void) {
  const DESK_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'z', 'Z', 'h', 'H', 'o', 'O', 'r', 'R', '/', 'Alt']);
  const HELD = new Set(['h', 'H', 'Alt']);
  const hand = (e: KeyboardEvent, up: boolean) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || (e.altKey && e.key !== 'Alt') || !DESK_KEYS.has(e.key)) return;
    if (up && !HELD.has(e.key)) return;
    const t = e.target as Element | null;
    if (t?.closest('input, textarea, select, [contenteditable], [role="tablist"], [role="listbox"], [role="radiogroup"], [role="slider"], [role="menu"]')) return;
    e.preventDefault();
    tell({ qa: 'key', key: e.key, shift: e.shiftKey, repeat: e.repeat, ...(up ? { up } : {}) });
  };
  addEventListener('keydown', (e) => hand(e, false));
  addEventListener('keyup', (e) => hand(e, true));
}

/** Every WebGL context the frame's page makes from now on. */
function trackWebgl(): Set<WebGLRenderingContext | WebGL2RenderingContext> {
  const gls = new Set<WebGLRenderingContext | WebGL2RenderingContext>();
  const real = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, id: string, opts?: unknown) => RenderingContext | null;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, opts?: unknown) {
    const ctx = real.call(this, id, opts);
    if (ctx && (id === 'webgl2' || id === 'webgl' || id === 'experimental-webgl')) gls.add(ctx as WebGLRenderingContext);
    return ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;
  return gls;
}
