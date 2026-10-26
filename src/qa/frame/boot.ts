// A frame of the QA desk: the real game, as one seat of one scene sees it at
// one size (qa.html?frame=<slot>&s=<scene>&seat=<n>&size=<size>). It starts
// with nothing of its own: its storage (its own keys, src/lib/storage.ts'
// QA) is cleared, then the scene's codex, records and session are set and
// the app mounted as the game's own page mounts it (src/main.ts), minus the
// visit count. No room is behind it: its buttons only say what they would
// do. It tells the desk when it is showing, and hands on the desk's keys.

import { emulate } from './emulate.ts';
import { freeze, installFreeze } from './freeze.ts';
import { check, listen, outline } from './checks.ts';
import { settle } from './settle.ts';
import { isSizeKey, sizeOf } from '../sizes.ts';
import { deskOrigin, isDeskMessage, type FrameMessage } from '../messages.ts';
import { seatsIn, type Seat } from '../scene.ts';
import type { GameState } from '../../lib/game.ts';

/** How long the page stays still after a change before it's checked again (ms). */
const RECHECK_MS = 600;
/** How long after a click or a key in the frame a change counts as its doing (ms). */
const TOUCHED_MS = 5000;

export async function boot(asked: URLSearchParams) {
  const size = sizeOf(isSizeKey(asked.get('size')) ? (asked.get('size') as Parameters<typeof sizeOf>[0]) : 'desktop');
  // (size=fit: the desk's own window, as it is.)
  if (asked.get('size') !== 'fit') emulate(size);
  installFreeze();
  const heard = listen();
  // The same seat of a scene draws the same every time (the embers, the
  // dust): a shot differs from its before only where something changed.
  // Each seat its own, as each device has, so seats side by side don't
  // mirror each other. Its game is stubbed out, so this touches nothing
  // but how it looks.
  let seed = [...`${asked.get('s') ?? ''}|${asked.get('seat') ?? 0}`].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

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
  // (Its screen's scenes only, scenes/one.ts: the code before this change may lack what another screen's use.)
  const [{ session, engine, picturesOf, veilClock }, { useItems }, { sceneOf }, { default: fakeNames }, { useCaptured }, { buildScene }] = await Promise.all([
    import('../../lib/session.svelte.ts'),
    import('../build/engine.ts'),
    import('../scenes/one.ts'),
    import('../../data/fakes.json'),
    import('../scenes/captured.ts'),
    import('../tweaks.ts'),
  ]);
  useItems(engine.items, fakeNames);
  useCaptured(import.meta.glob('../captured/*.json', { eager: true, import: 'default' }));
  const key = asked.get('s');
  const scene = await sceneOf(key);
  const given = Object.fromEntries([...asked].filter(([k]) => k.startsWith('k.')).map(([k, v]) => [k.slice(2), v]));
  const built = scene && buildScene(scene, given).built;
  // Class sigils on everyone (tweaks.ts), before anything draws an avatar.
  if (given.sigils === '1' || given.sigils === 'true') (await import('../../lib/sigilTrial.svelte.ts')).sigilTrial.on = true;
  // (A seat past those its room has as built is its last: the grid asks every state for the seat picked on one.)
  const seats = scene && built ? seatsIn(scene, built) : [];
  // Or (&as=<player id>&role=host|client) any player in the room, as the pointers bench sees one scene from two of them.
  const as = asked.get('as');
  const seat: Seat | undefined = as ? { mode: asked.get('role') === 'host' ? 'host' : 'client', me: as } : seats[Math.min(Number(asked.get('seat') ?? 0), seats.length - 1)];
  if (!scene || !built || !seat) throw new Error(`No scene called ${key}${scene ? ` with a seat ${asked.get('seat')}` : ''}.`);
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
    const { days, daysAgo } = built.daily;
    storage.writeKey(daily.DAYS_KEY, JSON.stringify({ from: daily.utcDay(Date.now()) - daysAgo - days.length + 1, days }));
  }
  // The sound as it's set, and what else it keeps (its keys).
  if (built.sound?.muted !== undefined) sound.setMuted(built.sound.muted);
  if (built.sound?.volume !== undefined) sound.setVolume(built.sound.volume);
  if (built.sound?.ambience !== undefined) sound.setAmbience(built.sound.ambience);
  for (const [name, value] of Object.entries(built.stored ?? {})) storage.writeStored(name, value);
  if (built.stored?.keys) (await import('../../lib/keybinds.svelte.ts')).reloadKeys();
  // How its sync stands (only where the scene says: sync's link is loaded for those scenes alone).
  if (built.sync) {
    const { sync } = await import('../../lib/sync/link.svelte.ts');
    Object.assign(sync, { linked: 0, ...built.sync });
  }
  // The tip to play fullscreen is about the desk's own window, never the scene's (lib/fullscreenTip.ts): taken as read.
  storage.writeStored('fullscreenTip.shown', '3');
  // No network: the rooms the start page finds are the scene's. (Only where it has some, so the map of
  // which files each scene runs, scripts/sweep.mjs --map, doesn't count rooms.ts for every scene.)
  if (built.rooms !== undefined || built.invite !== undefined) rooms.useMadeUpRooms(built.rooms ?? [], built.invite);

  // Who it is, and what it made of the game.
  session.mode = seat.mode === 'none' ? null : seat.mode;
  session.myPlayerId = seat.me;
  session.status = built.status ?? (state ? 'ready' : 'idle');
  session.code = built.hereOnly ? '' : 'KXR4QT';
  session.hereOnly = !!built.hereOnly;
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
  const [{ default: Crash }, { crash }] = await Promise.all([import('./Crash.svelte'), import('./crashCue.svelte.ts')]);
  mount(Root, { target: document.getElementById('app')!, props: { qaInside: Crash } });
  // The pointers bench's seats: this one's pointer to the bench, or another's from it (./pointerRelay.ts).
  if (asked.has('pointers')) await (await import('./pointerRelay.ts')).relayPointers(asked, { session });

  // A question's pictures, made as the host makes them and taken in as each
  // device takes them in, sealed or not (lib/media.svelte.ts).
  const pictures = async (state: GameState | null) => {
    const q = state?.question;
    if (!state || !q || (state.phase !== 'question' && state.phase !== 'reveal')) return;
    try {
      const made = await media.prepareMedia(q, game.grayscaleFor(state), veilClock(state), engine.byId);
      for (const m of picturesOf(made)) media.shown.receive(m);
    } catch (err) {
      console.error("The scene's art couldn't be made", err);
    }
  };
  await pictures(state);

  // What the scene does once it shows.
  for (const step of built.steps ?? []) {
    if ('wait' in step) await new Promise((r) => setTimeout(r, step.wait));
    else if ('fail' in step) session.labFail(step.fail);
    else if ('then' in step) {
      // The room moves on: a new question's pictures first, as the host sends them before it.
      if (step.then.question?.askedAt !== session.state?.question?.askedAt) await pictures(step.then);
      if (step.at !== undefined) {
        const now = step.at;
        session.clockOffset = now - Date.now();
        session.hostNow = () => now;
      }
      session.state = seat.mode === 'client' ? game.publicView(step.then) : step.then;
    } else if ('toast' in step) {
      const { message, ...opts } = step.toast;
      toasts.show(message, 'info', opts);
    } else if ('crash' in step) {
      // One crash, and (twice) another once the boundary has put the app back.
      crash.left = 1;
      if (step.crash === 2) {
        await new Promise((r) => setTimeout(r, 300));
        crash.left = 1;
      }
    }
    else (await found(step.click))?.click();
  }

  const slot = asked.get('frame') ?? '';
  const tell = (m: FrameMessage) => parent.postMessage(m, deskOrigin(asked));
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
    if (e.origin !== deskOrigin(asked) || !isDeskMessage(e.data)) return;
    if (e.data.qa === 'outlines') outline(e.data.on);
    else if (e.data.qa === 'freeze') freeze(e.data.on);
    else if (e.data.qa === 'css') {
      const on = e.data.on;
      void import('../../lib/backdrop.ts').then((b) => b.leaveUiToCss(on));
    }
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
  // sweep (scripts/sweep.mjs) opens a frame as a page of its own and checks it
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
 * them, or they belong to a field or a list there. Holding keys (H, Alt)
 * hand on their letting go too.
 */
export function handOnKeys(tell: (m: FrameMessage) => void, digits = false) {
  // (The digits only from a piece's frame: in the game they answer a question, and it doesn't stop them going on.)
  const DESK_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'z', 'Z', 'h', 'H', 'o', 'O', 'r', 'R', 'f', 'F', 'a', 'A', 'b', 'B', 'd', 'D', 's', 'S', '/', 'Alt', ...(digits ? '123456789' : '')]);
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
export function trackWebgl(): Set<WebGLRenderingContext | WebGL2RenderingContext> {
  const gls = new Set<WebGLRenderingContext | WebGL2RenderingContext>();
  const real = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, id: string, opts?: unknown) => RenderingContext | null;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, opts?: unknown) {
    const ctx = real.call(this, id, opts);
    if (ctx && (id === 'webgl2' || id === 'webgl' || id === 'experimental-webgl')) gls.add(ctx as WebGLRenderingContext);
    return ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;
  return gls;
}
