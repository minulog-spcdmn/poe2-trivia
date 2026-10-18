// The end screen's test page (endscreen.html): every state of the end of a
// game, picked from a list and shown at a window's size beside the handoff's
// board. The page itself is the picker (Preview.svelte); the states show in
// the real app in one frame of that size (endscreen.html?scene=<key>), its
// session set to the finished game. The frame stays: picking another state
// sets it in place (Preview posts its key), so the app's WebGL is set up
// once. A frame made afresh for each would start the backdrop's shaders over
// while the last frame's were still being built, which on some machines
// holds up the browser's GPU work, every tab's, for most of a minute. Its
// storage keys start apart (data-endscreen, src/lib/storage.ts), so the
// codex and the records it writes for a state never reach the game's.
// Served by the dev server and built into the beta only (vite.config.ts).

import { mount, tick } from 'svelte';
import '../app.css';
import { BETA } from '../lib/channel';
import { END_PREVIEW, writeKey } from '../lib/storage';
import { isPlateName, type PlateName } from '../lib/plates/index.ts';

if (!(import.meta.env.DEV || BETA) || !END_PREVIEW) throw new Error('The end screen page only runs on the dev server and the beta, from endscreen.html.');

// No room here, so no WebRTC: PeerJS, as the session loads it, checks what the
// browser supports by opening a connection, a wait the page can do without.
// Without the constructor it skips the check (both names: the shim PeerJS
// carries puts the prefixed one back otherwise).
for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });

/** What the picker posts to its frame: show this state. */
export type SceneMessage = { endscreen: 'scene'; key: string };
/** What the picker posts to its frame: set this circle behind the end screen (null: the one the game falls to). */
export type CircleMessage = { endscreen: 'circle'; name: PlateName | null };
/** What the frame posts back once it listens, and which state it shows. */
export type ReadyMessage = { endscreen: 'ready'; key: string };

const asked = new URLSearchParams(location.search);
const key = asked.get('scene');
/** The circle asked for behind the end (gameCircles.svelte.ts' putEndCircle), if it names one. */
const circle = asked.get('circle');
if (key) void frame(key);
else void import('./Preview.svelte').then(({ default: Preview }) => mount(Preview, { target: document.getElementById('app')! }));

/** The frame: the real app, its session at the end of the game picked. */
async function frame(first: string) {
  const [{ default: App }, { session, engine }, { scenes }, codex, records, { installUiSounds }, { installUiFx }, { toasts }, { putEndCircle }] = await Promise.all([
    import('../App.svelte'),
    import('../lib/session.svelte'),
    import('./scenes'),
    import('../lib/codex'),
    import('../lib/delveRecord'),
    import('../lib/sound'),
    import('../lib/fx/ui'),
    import('../lib/toasts.svelte'),
    import('../components/gameCircles.svelte'),
  ]);
  if (isPlateName(circle)) putEndCircle(circle);
  const all = scenes();
  installUiSounds();
  installUiFx();

  /** Sets everything but the game itself for state `sc`: this device's codex and records, and who it is. */
  function prepare(sc: (typeof all)[number]) {
    // Its codex: its answers in the game, and the items they name, met for
    // the first time then; and a few met before, seen again in it.
    const c = codex.emptyCodex();
    const at = sc.state.startedAt ?? 0;
    c.log = sc.log ?? [];
    const meet = (id: string, first: number, last: number) =>
      (c.items[id] ??= { seen: 1, first, last, name: { n: 1, ok: 0 }, art: { n: 0, ok: 0 }, mixed: {} });
    for (const a of c.log) meet(a.id, a.t, a.t);
    for (const it of engine.items.slice(0, 5)) meet(it.id, at - 86_400_000, at + 1);
    writeKey(codex.CODEX_KEY, codex.serializeCodex(c));
    // Its Delve runs, oldest first, this one last.
    records.resetRecords();
    for (const run of sc.runs ?? []) records.recordRun(run);
    // Who it is, and what it made of the game.
    session.mode = sc.mode;
    session.myPlayerId = sc.me;
    session.code = 'KXR4QT';
    session.hideCode = false;
    session.delveResult = sc.delveResult ?? null;
    session.earned = sc.earned && sc.state.startedAt !== undefined ? { game: sc.state.startedAt, ids: sc.earned } : null;
  }

  const sc = all.find((s) => s.key === first);
  if (!sc) {
    document.body.textContent = `No state called ${first}.`;
    return;
  }
  prepare(sc);
  session.state = sc.state;
  // No room behind it: its buttons only say what they would do.
  const said = (what: string) => toasts.show(what, 'info', { title: 'Preview' });
  session.dispatch = (a) => said(a.type === 'restart' ? (a.play ? 'The next game would start now.' : 'Everyone would go back to the lobby.') : `Would send: ${a.type}`);
  session.watch = (on) => said(on ? 'You would just watch the next game.' : 'You would play in the next game.');
  session.leave = () => said('You would leave the room.');
  mount(App, { target: document.getElementById('app')! });

  // Another state, in place. The end screen reads the codex and the records
  // as it comes in, so it comes in afresh: the game goes back to its lobby
  // for a moment (the app's own screen change, a short fade), then to the
  // state's end.
  let showing = first;
  let turn = 0;
  addEventListener('message', async (e: MessageEvent<SceneMessage | CircleMessage>) => {
    const m = e.data;
    if (e.origin !== location.origin || !m) return;
    if (m.endscreen === 'circle') {
      putEndCircle(isPlateName(m.name) ? m.name : null);
      return;
    }
    if (m.endscreen !== 'scene') return;
    const next = all.find((s) => s.key === m.key);
    if (!next) return;
    const mine = ++turn;
    session.state = { ...session.state!, phase: 'lobby' };
    await tick();
    await new Promise((r) => setTimeout(r, 200));
    if (mine !== turn) return;
    prepare(next);
    session.state = next.state;
    showing = next.key;
    scrollTo({ top: 0 });
  });
  parent.postMessage({ endscreen: 'ready', key: showing } satisfies ReadyMessage, location.origin);
}
