// A seat of a live room on the QA desk ("Play from here"): the real game,
// as its own page loads it (src/main.ts, minus the visit count), in a frame
// named `qa:<room>:<seat>` (src/lib/storage.ts, src/lib/peer.ts). On the dev
// server each seat has an origin of its own (<seat>.localhost), so a
// process, a main thread and storage of its own; the desk can't reach into
// it, and talks to it by postMessage only (anything the desk built itself
// would carry the desk's Object, which PeerJS's packer refuses).
//
// It starts from the storage the desk hands it in its address (#seed=, the
// host's save, a guest's secret and name), taken off at once so a reload
// resumes from what the game saved since. Then App's resume() opens the
// room or rejoins it, as after any reload.

import { faults, installFaults } from './fault.ts';
import { LOCAL } from '../../lib/channel.ts';
import type { SeatLook, SeatOp, SeatMessage } from '../messages.ts';

export async function seat() {
  installFaults();
  const storage = await import('../../lib/storage.ts');
  // The desk it answers to, handed over in the address and kept in the seat's own session storage (the
  // game rewrites the address: its codex, its invites): the desk's origin, or (on the dev server, where a
  // seat has an origin of its own) localhost on the same port. Nobody else drives it or hears from it.
  const deskOk = (o: string | null) => !!o && (o === location.origin || (LOCAL && /^https?:\/\/localhost(:\d+)?$/.test(o) && new URL(o).port === location.port));
  const handed = decodeURIComponent(/[#&]desk=([^&]+)/.exec(location.hash)?.[1] ?? '');
  const seed = /#seed=([\w-]+)/.exec(location.hash);
  if (seed) {
    const json = new TextDecoder().decode(Uint8Array.from(atob(seed[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
    const { local, session } = JSON.parse(json) as { local: Record<string, string>; session: Record<string, string> };
    storage.removeStoredStarting('', 'local');
    storage.removeStoredStarting('', 'session');
    for (const [k, v] of Object.entries(local)) storage.writeStored(k, v, 'local');
    for (const [k, v] of Object.entries(session)) storage.writeStored(k, v, 'session');
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (deskOk(handed)) storage.writeStored('qaDesk', handed, 'session');
  const kept = storage.readStored('qaDesk', 'session');
  const desk = deskOk(kept) ? kept : null;

  await import('../../app.css');
  const [{ mount }, { default: Root }, { session, engine }, sound, spatial, fxUi, cursor, autoscroll, { switchedOff }] = await Promise.all([
    import('svelte'),
    import('../../Root.svelte'),
    import('../../lib/session.svelte.ts'),
    import('../../lib/sound.ts'),
    import('../../lib/spatial.svelte.ts'),
    import('../../lib/fx/ui.ts'),
    import('../../lib/ownCursor.ts'),
    import('../../lib/autoscroll.ts'),
    import('../../lib/switchedOff.ts'),
  ]);
  sound.installUiSounds();
  spatial.installSpatial();
  fxUi.installUiFx();
  if (!switchedOff('cursor')) cursor.installCursor();
  autoscroll.installAutoscroll();
  mount(Root, { target: document.getElementById('app')! });
  // Development only, as the game's own page has it (src/main.ts): the session, for scripts that drive a seat.
  if (import.meta.env.DEV) Object.assign(window, { __s: session });

  const tell = (m: SeatMessage) => desk && parent.postMessage(m, desk);
  const look = (): SeatLook => ({
    mode: session.mode,
    status: session.status,
    me: session.myPlayerId,
    phase: session.state?.phase ?? null,
    players: session.state?.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected })) ?? [],
    gaveUp: session.gaveUp,
    link: faults.state,
    bot: !!bot,
  });
  setInterval(() => tell({ qa: 'seat', look: look() }), 1000);

  // A bot in this seat (src/bot): the room bot's own player, playing as this seat's player through the session.
  let bot: { stop(): void } | null = null;
  async function startBot() {
    const [{ Player, hostEyes }, { identityOf, MODES }, { sight }] = await Promise.all([import('../../bot/player.ts'), import('../../bot/identities.ts'), import('../../bot/sight.ts')]);
    const name = session.state?.players.find((p) => p.id === session.myPlayerId)?.name ?? 'Bot';
    const player = new Player(identityOf(name, engine.categories, MODES, engine.items).persona, session.isHost ? hostEyes : sight);
    const tick = setInterval(() => {
      if (session.state) player.play(session.state);
    }, 200);
    bot = {
      stop() {
        clearInterval(tick);
        player.reset();
      },
    };
  }

  addEventListener('message', async (e) => {
    if (e.source !== parent || e.origin !== desk) return;
    const m = e.data as SeatOp | null;
    if (m?.qa !== 'seat-op') return;
    switch (m.op) {
      case 'hold':
        return faults.hold(true);
      case 'release':
        return faults.release();
      case 'cut':
        return faults.cut();
      case 'lag':
        return faults.lag(m.ms ?? 0);
      case 'reload':
        return location.reload();
      case 'kick':
        if (m.id) session.kick(m.id);
        return;
      case 'bot':
        if (m.on && !bot) await startBot();
        else if (!m.on && bot) {
          bot.stop();
          bot = null;
        }
        return tell({ qa: 'seat', look: look() });
      case 'save':
        // The room as it stands, for a scene of its own (the host's: the whole state).
        if (session.state) tell({ qa: 'saved', state: JSON.parse(JSON.stringify(session.state)), at: session.hostNow() });
        return;
    }
  });
  tell({ qa: 'seat', look: look() });
}
