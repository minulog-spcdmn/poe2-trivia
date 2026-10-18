// A frame of the QA desk: the real game, as one seat of one scene sees it at
// one size (qa.html?frame=<slot>&s=<scene>&seat=<n>&size=<size>). It starts
// with nothing of its own: its storage (its own keys, src/lib/storage.ts'
// QA) is cleared, then the scene's codex, records and session are set and
// the app mounted as the game's own page mounts it (src/main.ts), minus the
// visit count. No room is behind it: its buttons only say what they would
// do. It tells the desk when it is showing, and hands on the desk's keys.

import { emulate } from './emulate.ts';
import { check, listen, outline } from './checks.ts';
import { settle } from './settle.ts';
import { isSizeKey, sizeOf } from '../sizes.ts';
import { isDeskMessage, type FrameMessage } from '../messages.ts';
import { knobValues } from '../scene.ts';

/** How long the page stays still after a change before it's checked again (ms). */
const RECHECK_MS = 600;
/** How long after a click or a key in the frame a change counts as its doing (ms). */
const TOUCHED_MS = 5000;

export async function boot(asked: URLSearchParams) {
  const size = sizeOf(isSizeKey(asked.get('size')) ? (asked.get('size') as Parameters<typeof sizeOf>[0]) : 'desktop');
  emulate(size);
  const heard = listen();

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

  // The scene first: what it puts in the address has to be there before the
  // app's modules read it (the codex's #codex, an invite's ?room=).
  const [{ session, engine, picturesOf, veilClock }, { useItems }, scenes, { default: fakeNames }, { useCaptured }] = await Promise.all([
    import('../../lib/session.svelte.ts'),
    import('../build/engine.ts'),
    import('../scenes/index.ts'),
    import('../../data/fakes.json'),
    import('../scenes/captured.ts'),
  ]);
  useItems(engine.items, fakeNames);
  useCaptured(import.meta.glob('../captured/*.json', { eager: true, import: 'default' }));
  const key = asked.get('s');
  const scene = scenes.sceneByKey(key);
  const seat = scene?.seats[Number(asked.get('seat') ?? 0)];
  if (!scene || !seat) {
    document.body.textContent = `No scene called ${key}${scene ? ` with a seat ${asked.get('seat')}` : ''}.`;
    return;
  }
  const given = Object.fromEntries([...asked].filter(([k]) => k.startsWith('k.')).map(([k, v]) => [k.slice(2), v]));
  const built = scene.build(knobValues(scene.knobs, given));
  if (built.query || built.hash) history.replaceState(null, '', `${location.pathname}?${asked}${built.query ? `&${built.query}` : ''}${built.hash ?? ''}`);

  await import('../../app.css');
  const [{ mount }, { default: Root }, codex, records, daily, rooms, sound, spatial, fxUi, cursor, autoscroll, { switchedOff }, { toasts }, game, media] = await Promise.all([
    import('svelte'),
    import('../../Root.svelte'),
    import('../../lib/codex.ts'),
    import('../../lib/delveRecord.ts'),
    import('../../lib/daily.ts'),
    import('../../lib/rooms.ts'),
    import('../../lib/sound.ts'),
    import('../../lib/spatial.svelte.ts'),
    import('../../lib/fx/ui.ts'),
    import('../../lib/ownCursor.ts'),
    import('../../lib/autoscroll.ts'),
    import('../../lib/switchedOff.ts'),
    import('../../lib/toasts.svelte.ts'),
    import('../../lib/game.ts'),
    import('../../lib/media.svelte.ts'),
  ]);
  const state = built.state;

  // Its codex: its answers in the game, and the items they name, met for the
  // first time then; and others met before, seen again in it.
  const c = codex.emptyCodex();
  const at = state?.startedAt ?? Date.now();
  c.log = built.log ?? [];
  const meet = (id: string, first: number, last: number) =>
    (c.items[id] ??= { seen: 1, first, last, name: { n: 1, ok: 0 }, art: { n: 0, ok: 0 }, mixed: {} });
  for (const a of c.log) meet(a.id, a.t, a.t);
  const met = built.met ?? 5;
  const before = typeof met === 'number' ? engine.items.slice(0, met) : engine.items.filter((it) => met.includes(it.name));
  for (const it of before) meet(it.id, at - 86_400_000, at + 1);
  storage.writeKey(codex.CODEX_KEY, codex.serializeCodex(c));
  // Its Delve runs, oldest first, this one last.
  records.resetRecords();
  for (const run of built.runs ?? []) records.recordRun(run);
  // Its name ('' a first visit), and Today's unique as it last answered.
  if (built.name !== '') storage.writeStored('name', built.name ?? 'Kalguur');
  if (built.daily) {
    const { daysAgo, ...rec } = built.daily;
    storage.writeStored('daily', JSON.stringify({ ...rec, day: daily.utcDay(Date.now()) - daysAgo }));
  }
  // The tip to play fullscreen is about the desk's own window, never the scene's (lib/fullscreenTip.ts): taken as read.
  storage.writeStored('fullscreenTip.shown', '3');
  // No network: the rooms the start page finds are the scene's.
  rooms.useMadeUpRooms(built.rooms ?? [], built.invite);

  // Who it is, and what it made of the game.
  session.mode = seat.mode === 'none' ? null : seat.mode;
  session.myPlayerId = seat.me;
  session.status = built.status ?? (state ? 'ready' : 'idle');
  session.code = 'KXR4QT';
  session.hideCode = false;
  session.delveResult = built.delveResult ?? null;
  session.bestAtStart = built.bestAtStart ?? null;
  session.earned = built.earned && state?.startedAt !== undefined ? { game: state.startedAt, ids: built.earned } : null;
  // A guest or a spectator holds the room as the host sends it: what's still to guess left out.
  session.state = state && seat.mode === 'client' ? game.publicView(state) : state;
  // Its clocks stand still at the scene's moment.
  if (built.at !== undefined) {
    const now = built.at;
    session.clockOffset = now - Date.now();
    session.hostNow = () => now;
  }
  const said = (what: string) => toasts.show(what, 'info', { title: 'Preview' });
  session.dispatch = (a) => said(a.type === 'restart' ? (a.play ? 'The next game would start now.' : 'Everyone would go back to the lobby.') : `Would send: ${a.type}`);
  session.watch = (on) => said(on ? 'You would just watch the next game.' : 'You would play in the next game.');
  session.leave = () => said('You would leave the room.');

  if (built.circle !== undefined) (await import('../../components/gameCircles.svelte.ts')).putEndCircle(built.circle);
  sound.installUiSounds();
  spatial.installSpatial();
  fxUi.installUiFx();
  if (!switchedOff('cursor')) cursor.installCursor();
  autoscroll.installAutoscroll();
  mount(Root, { target: document.getElementById('app')! });

  // A question's pictures, made as the host makes them and taken in as each
  // device takes them in, sealed or not (lib/media.svelte.ts).
  const q = state?.question;
  if (state && q && (state.phase === 'question' || state.phase === 'reveal')) {
    try {
      const made = await media.prepareMedia(q, game.grayscaleFor(state), veilClock(state), engine.byId);
      for (const m of picturesOf(made)) media.shown.receive(m);
    } catch (err) {
      console.error("The scene's art couldn't be made", err);
    }
  }

  // What the scene does once it shows.
  for (const step of built.steps ?? []) {
    if ('wait' in step) await new Promise((r) => setTimeout(r, step.wait));
    else if ('fail' in step) session.labFail(step.fail);
    else (await found(step.click))?.click();
  }

  const slot = asked.get('frame') ?? '';
  const tell = (m: FrameMessage) => parent.postMessage(m, location.origin);
  handOnKeys(tell);
  addEventListener('pagehide', () => {
    // Lets go of its WebGL at once as it goes, so the next frame's shaders don't wait on this one's.
    for (const gl of gls) gl.getExtension('WEBGL_lose_context')?.loseContext();
    clear();
  });
  tell({ qa: 'ready', slot });

  // Checked once at rest, and again whenever what it shows changes (a click in it, a toast).
  outline(asked.get('o') !== '0');
  addEventListener('message', (e) => {
    if (e.origin === location.origin && isDeskMessage(e.data)) outline(e.data.on);
  });
  const run = async () => {
    const settled = await settle();
    const problems = check(heard);
    tell({ qa: 'checked', slot, settled, problems });
    (window as Window & { __qa?: unknown }).__qa = { settled, problems };
  };
  await run();
  // In the desk, checked again once what it shows has changed after a click
  // or a key in it (not on the screen's own ticking: a clock, a pulse). The
  // sweep (scripts/qa.mjs) opens a frame as a page of its own and checks it
  // once.
  if (parent === window) return;
  let touchedAt = -Infinity;
  addEventListener('pointerdown', () => (touchedAt = performance.now()), true);
  addEventListener('keydown', () => (touchedAt = performance.now()), true);
  let again: ReturnType<typeof setTimeout> | undefined;
  new MutationObserver(() => {
    if (performance.now() - touchedAt > TOUCHED_MS) return;
    clearTimeout(again);
    again = setTimeout(run, RECHECK_MS);
  }).observe(document.getElementById('app')!, { childList: true, subtree: true, characterData: true });
}

/**
 * The desk's keys, pressed in the frame, go to the desk; unless the game took
 * them, or they belong to a field or a list there. Holding keys (H, B, Alt)
 * hand on their letting go too.
 */
function handOnKeys(tell: (m: FrameMessage) => void) {
  const DESK_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'z', 'Z', 'h', 'H', 'b', 'B', 'o', 'O', 'r', 'R', '/', 'Alt']);
  const HELD = new Set(['h', 'H', 'b', 'B', 'Alt']);
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

/** The first element `selector` finds, once there is one (null after 5 s). */
async function found(selector: string): Promise<HTMLElement | null> {
  for (let i = 0; i < 50; i++) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 100));
  }
  console.error(`The scene's step found nothing at ${selector}`);
  return null;
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
