// The end screen's test page (endscreen.html): every state of the end of a
// game, picked from a list and shown at a window's size beside the handoff's
// board. The page itself is the picker (Preview.svelte); each state is the
// real app in a frame of that size (endscreen.html?scene=<key>), its session
// set to the finished game before the app mounts. Its storage keys start
// apart (data-endscreen, src/lib/storage.ts), so the codex and the records
// it writes for a state never reach the game's.
// Served by the dev server and built into the beta only (vite.config.ts).

import { mount } from 'svelte';
import '../app.css';
import { BETA } from '../lib/channel';
import { END_PREVIEW, writeKey } from '../lib/storage';

if (!(import.meta.env.DEV || BETA) || !END_PREVIEW) throw new Error('The end screen page only runs on the dev server and the beta, from endscreen.html.');

const key = new URLSearchParams(location.search).get('scene');
if (key) void frame(key);
else void import('./Preview.svelte').then(({ default: Preview }) => mount(Preview, { target: document.getElementById('app')! }));

/** One state: the real app, its session at the end of that game. */
async function frame(key: string) {
  const [{ default: App }, { session, engine }, { scenes }, codex, records, { installUiSounds }, { installUiFx }, { toasts }] = await Promise.all([
    import('../App.svelte'),
    import('../lib/session.svelte'),
    import('./scenes'),
    import('../lib/codex'),
    import('../lib/delveRecord'),
    import('../lib/sound'),
    import('../lib/fx/ui'),
    import('../lib/toasts.svelte'),
  ]);
  const sc = scenes().find((s) => s.key === key);
  if (!sc) {
    document.body.textContent = `No state called ${key}.`;
    return;
  }
  installUiSounds();
  installUiFx();

  // This device's codex: its answers in the game, and the items they name,
  // met for the first time then; and a few met before, seen again in it.
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

  // The finished game, as this device has it.
  session.mode = sc.mode;
  session.myPlayerId = sc.me;
  session.code = 'KXR4QT';
  session.hideCode = false;
  session.delveResult = sc.delveResult ?? null;
  session.earned = sc.earned && sc.state.startedAt !== undefined ? { game: sc.state.startedAt, ids: sc.earned } : null;
  session.state = sc.state;
  // No room behind it: its buttons only say what they would do.
  const said = (what: string) => toasts.show(what, 'info', { title: 'Preview' });
  session.dispatch = (a) => said(a.type === 'restart' ? (a.play ? 'The next game would start now.' : 'Everyone would go back to the lobby.') : `Would send: ${a.type}`);
  session.watch = (on) => said(on ? 'You would just watch the next game.' : 'You would play in the next game.');
  session.leave = () => said('You would leave the room.');

  mount(App, { target: document.getElementById('app')! });
}
