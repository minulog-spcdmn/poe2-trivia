<script lang="ts">
  import { accentAt, dealtDeeper, milestoneAt, plunge, setDescent, type Dealt } from './lib/descent';
  import { zoneAt } from './lib/zoneSigils';
  import { isGroupRun, shownDepth } from './lib/delve';
  import { dealing, followDeal, shownRound } from './lib/dealing.svelte';
  import { arrival, beginArrival, endArrival } from './lib/zoneArrival.svelte';
  import ZoneCard from './components/zonecard/ZoneCard.svelte';
  import { ownRect, stageZoom } from './lib/stage';
  import { onMount, untrack, type Component } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { session } from './lib/session.svelte';
  import { depthAmbience, getVolume, isMuted, setMuted, setVolume, sfx, veinAmbience } from './lib/sound';
  import { actionOf, keybinds, readLayout, typing } from './lib/keybinds.svelte';
  import { keyName } from './lib/keys';
  import { fxUserOn, onFxChange, shakeTarget } from './lib/fx/core';
  import { IMPRINT_URL, PRIVACY_URL } from './lib/site';
  import { openPrivacy } from './lib/legalSheet.svelte';
  import LegalSheet from './components/LegalSheet.svelte';
  import { dialogBackdrop } from './lib/behindDialog';
  import { wantDelveBackdrop } from './lib/backdrop';
  import { inVein, setVein, veinStrike } from './lib/vein';
  import Background from './components/Background.svelte';
  import Darkness from './components/Darkness.svelte';
  import FxLayer from './components/FxLayer.svelte';
  import Toasts from './components/Toasts.svelte';
  import Home from './components/Home.svelte';
  import Lobby from './components/Lobby.svelte';
  import { closeCodex, codexRoute } from './lib/codexRoute.svelte';
  import { closeSettings, openSettings, settingsRoute } from './lib/settingsRoute.svelte';
  import { whenIdle } from './lib/idle';
  import { loadFonts, loadFontsAhead } from './lib/fontsAhead';
  import { shellHeightsRead } from './lib/shellHeights.svelte';
  import { toasts } from './lib/toasts.svelte';
  import { BETA, LOCAL } from './lib/channel';
  import { watchFullscreenTip } from './lib/fullscreenTip';
  import { watchGpuNotice } from './lib/gpuNotice';
  import { setCursorColor } from './lib/ownCursor';
  import PeerCursors from './components/PeerCursors.svelte';
  import Recorder from './components/Recorder.svelte';
  import { wantsRecording } from './lib/recorder';
  import { playerColor } from './lib/ui';
  import { flat, fullRoom } from './lib/layout';

  /** Shown again after a crash (Root.svelte). */
  let { recovered = false }: { recovered?: boolean } = $props();

  // Beta and dev only: ?record keeps how this player plays, for the room bots (lib/recorder.ts).
  let recording = $state(wantsRecording());
  let confirmLeave = $state(false);
  let fxOn = $state(fxUserOn());
  // With a seat in an online room, lobby included, this device's own pointer takes its
  // player's colour, as the others see it (lib/ownCursor.ts); otherwise it's old gold.
  const seat = $derived(session.mode === 'host' || session.mode === 'client' ? session.state?.players.find((p) => p.id === session.myPlayerId) : undefined);
  $effect(() => setCursorColor(seat ? playerColor(seat.hue) : undefined));
  // CSS animations that only decorate (the Delve phial's fire) hold still with the effects off.
  $effect(() => {
    document.documentElement.toggleAttribute('data-still', !fxOn);
  });
  let headerHeight = $state(0);
  let shell: HTMLElement;

  /**
   * Dev only: when a shake starts, warns about anything position: fixed in the
   * shell. The shake's translate makes the shell its containing block, so it
   * would shake along and be placed against the scrolled shell, not the viewport.
   */
  function warnFixedInShell(shell: HTMLElement) {
    const warned = new WeakSet<Element>();
    let moving = false;
    const watch = new MutationObserver(() => {
      const was = moving;
      moving = !!shell.style.translate;
      if (!moving || was) return;
      for (const el of shell.querySelectorAll('*')) {
        if (warned.has(el) || getComputedStyle(el).position !== 'fixed') continue;
        warned.add(el);
        console.warn('A fixed element inside .shell moves with camera shake; render it with use:portal (lib/portal.ts).', el);
      }
    });
    watch.observe(shell, { attributes: true, attributeFilter: ['style'] });
    return () => watch.disconnect();
  }

  onMount(() => {
    // (Not after a crash (Root.svelte): what was there is still there, or was left on purpose.)
    if (!recovered) session.resume();
    // Camera shake moves the UI (#app clips it, so it can't add scrolling).
    // Anything fixed to the viewport must live outside .shell: App's own
    // overlays sit after it, and the screens' go to <body> with use:portal.
    const undo = shakeTarget(shell, 1);
    const unwatch = import.meta.env.DEV ? warnFixedInShell(shell) : () => {};
    const off = onFxChange((on) => (fxOn = on));
    // The keyboard's own names for its keys, for the answers' seals (lib/keys.ts keyName).
    readLayout();
    return () => {
      undo();
      unwatch();
      off();
    };
  });

  const gs = $derived(session.state);
  // The codex opens from the start page only: in a room it would be a cheat sheet.
  // The settings are a page there too; in a room, the header's gear opens
  // them over the game instead, which runs on beneath (settingsOver).
  const codexAllowed = $derived(!session.mode || !gs);
  const screen = $derived(
    codexRoute.open && codexAllowed
      ? 'codex'
      : settingsRoute.open && codexAllowed
        ? 'settings'
        : !session.mode || !gs
        ? 'home'
        : gs.phase === 'lobby'
          ? 'lobby'
          : gs.phase === 'over'
            ? 'over'
            : 'game',
  );
  // A room was joined or resumed meanwhile: back to it.
  $effect(() => {
    if (codexRoute.open && !codexAllowed) closeCodex();
  });
  const settingsOver = $derived(settingsRoute.open && !codexAllowed);
  // The room ended (left, closed, kicked) with the settings open over it: they
  // go with it, to the start page, not on as the settings page. (Dropped, not
  // gone back from: the entry before is the room's address.)
  let wasInRoom = untrack(() => !codexAllowed);
  $effect(() => {
    const inRoom = !codexAllowed;
    if (wasInRoom && !inRoom) untrack(() => settingsRoute.drop());
    wasInRoom = inRoom;
  });
  const codex = $derived(screen === 'codex');
  /** A page over the start page (the codex, the settings), which the header closes. */
  const page = $derived(screen === 'codex' || screen === 'settings');
  const closePage = () => (codex ? closeCodex() : closeSettings());

  // Desktop players not yet fullscreen get a tip to go fullscreen, a few
  // seconds into any screen but a question's (see lib/fullscreenTip.ts).
  const fullscreenTip = watchFullscreenTip();
  $effect(() => fullscreenTip.stop);
  // Whoever's browser draws without the GPU is told how to switch it back
  // on, on the same calm screens (see lib/gpuNotice.ts).
  const gpuNotice = watchGpuNotice();
  $effect(() => gpuNotice.stop);
  $effect(() => {
    const calm = screen !== 'game';
    // Untracked: taking a notice down writes the toast list, which mustn't rerun this.
    untrack(() => {
      fullscreenTip.calm(calm);
      gpuNotice.calm(calm);
    });
  });

  // Delve: the scene descends with the run, and holds its depth on the end screen
  // (a screenshot shows how deep it went); everywhere else it is the surface.
  // The ambience follows it down.
  $effect(() => {
    const depth = gs?.delve && (screen === 'game' || screen === 'over') ? gs.round : 0;
    setDescent(depth);
    depthAmbience(depth);
  });
  // Delve: an Azurite Vein being dug has a scene of its own (lib/vein.ts), and
  // a sound of its own: a tunnel off the zone, the zone behind it.
  $effect(() => {
    const dug = screen === 'game' && inVein(gs);
    setVein(dug);
    veinAmbience(dug ? veinStrike(gs) : 0);
  });
  // Delve on its way (chosen in the lobby, a Delve room joined, a run picked
  // up, or one begun from a shared link): the backdrop builds its Delve
  // programs now, in the background, so they're ready when the run starts.
  $effect(() => {
    if (gs && (gs.settings.mode === 'delve' || gs.delve)) wantDelveBackdrop();
  });
  // Delve: a new zone's cards on their way (lib/dealing.svelte.ts). Set
  // before the DOM updates, so neither the header's depth nor the stage
  // shows the new depth for a frame first.
  $effect.pre(() => followDeal(gs ?? null, session.hostNow()));
  // Delve: each new depth sinks the scene a little further as its cards are
  // dealt (not the run's first, nor the same depth's dealt again after a
  // miss; see dealtDeeper). Into a new zone much further, with
  // the zone's sound and its title card, its cards dealt as it lands
  // (DelveState.dealAt).
  let lastDealt: Dealt | undefined;
  $effect(() => {
    if (!gs?.delve || screen !== 'game' || gs.phase !== 'choosing') return;
    const now = { run: gs.delve.startedAt, depth: gs.round };
    if (dealtDeeper(lastDealt, now)) {
      const zone = !!milestoneAt(now.depth);
      plunge(zone);
      sfx('plunge');
      if (zone) {
        sfx('stratum');
        const s = gs;
        untrack(() => beginArrival(s, session.hostNow(), { best: session.spectating ? null : session.bestAtStart, group: isGroupRun(s) }));
      }
    }
    lastDealt = now;
  });
  // A zone's card belongs to the game it came in: leaving it, the card goes.
  $effect(() => {
    if (screen !== 'game' || !gs?.delve) untrack(endArrival);
  });
  /** The zone card under way, while the stage waits for its cards (and only for the run and depth it came for). */
  const zoneCard = $derived(
    arrival.card && screen === 'game' && dealing.held && gs?.delve?.startedAt === arrival.card.run && gs.round === arrival.card.depth ? arrival.card : null,
  );

  /** How long the outgoing screen takes to fade (the .screen transition below). */
  const SCREEN_OUT_MS = 150;
  /**
   * While screens swap, the outgoing one fades over the incoming one in the
   * same grid cell, and neither sizes the page: both fill the window (below
   * the header, which comes or goes in the meantime) and what is longer is
   * cut off there, out of sight anyway. Nor does a bar docked to the bottom
   * (lib/layout.ts) pad the page meanwhile: the lobby's arrives as it
   * mounts, and would lift the start page's centred content as it fades.
   * So the swap never moves, stretches or scrolls either screen. Once in,
   * the screen sizes the page again (screenIn's end).
   */
  let swapping = $state(false);
  function hold(node: HTMLElement, on: boolean) {
    node.style.contain = on ? 'size' : '';
    node.style.overflow = on ? 'clip' : '';
  }
  function screenOut(node: HTMLElement) {
    swapping = true;
    hold(node, true);
    return fade(node, { duration: SCREEN_OUT_MS });
  }
  function screenIn(node: HTMLElement) {
    hold(node, true);
    return fade(node, { duration: 350, delay: SCREEN_OUT_MS });
  }
  /**
   * Every screen is scaled up alike on large windows (lib/stage.ts), header
   * and all, so moving between them never changes the scale. Set on the root,
   * for the shell and for what sits outside it (dialogs, toasts, overlays).
   */
  let winW = $state(innerWidth);
  let winH = $state(innerHeight);
  const zoom = $derived(stageZoom(winW, winH));
  $effect(() => document.documentElement.style.setProperty('--stage-zoom', String(zoom)));
  /**
   * The header and the legal links under the screen (the start page has
   * its own) come and go with the start page, but only once the outgoing
   * screen has faded: in the meantime they would squeeze or stretch it, and
   * the start page's centred content would move. Its fade's end sets them
   * (the .screen's outroend), not a timer, which a busy first frame of the
   * new screen can beat; the timer is only a fallback.
   */
  /**
   * A game on a phone on its side: the scoreboard (Scoreboard.svelte) rides
   * in the header's row, where the name stood, so the question gets that
   * row's height; the room code makes way for it (the lobby has it).
   * `--header-right` is how much of the row's right end the round and the
   * buttons take, which the scoreboard keeps clear of.
   */
  const folded = $derived(screen === 'game' && flat.current);
  let headerEl = $state<HTMLElement>();
  let metaEl = $state<HTMLElement>();
  $effect(() => {
    const root = document.documentElement.style;
    if (!folded || !headerEl || !metaEl) {
      root.removeProperty('--header-right');
      return;
    }
    const [h, m] = [headerEl, metaEl];
    const set = () => root.setProperty('--header-right', `${(ownRect(h).right - ownRect(m).left).toFixed(2)}px`);
    const ro = new ResizeObserver(set);
    ro.observe(h);
    ro.observe(m);
    return () => {
      ro.disconnect();
      root.removeProperty('--header-right');
    };
  });
  let headerOn = $state(untrack(() => screen !== 'home'));
  const showHeader = () => (headerOn = screen !== 'home');
  $effect(() => {
    if (screen !== 'home' === untrack(() => headerOn)) return;
    const t = setTimeout(showHeader, SCREEN_OUT_MS + 500);
    return () => clearTimeout(t);
  });

  // The codex page is its own chunk: fetch it ahead, so opening it doesn't wait.
  // Its fonts and the tooltips' too (lib/fontsAhead.ts), from the first idle
  // moment, so they don't lay the codex out again as it opens; opened before
  // they're in, it waits for them a moment (at most a quarter of a second).
  let codexChunk: Promise<typeof import('./components/Codex.svelte')> | null = null;
  const fetchCodexPage = () => (codexChunk ??= import('./components/Codex.svelte'));
  let codexPage: Promise<typeof import('./components/Codex.svelte')> | null = null;
  const loadCodexPage = () =>
    (codexPage ??= Promise.all([fetchCodexPage(), Promise.race([loadFonts(), new Promise((r) => setTimeout(r, 250))])]).then(([page]) => page));
  onMount(loadFontsAhead);
  onMount(() => {
    const t = setTimeout(fetchCodexPage, 2000);
    return () => clearTimeout(t);
  });

  // The game's screens (a question, the end of a game) are a chunk of their
  // own, so the start page loads and runs without them: fetched in the first
  // idle moment, or at once on the way into a room. A fetch that fails is
  // tried once more while a room is open (a dropped connection may be back),
  // but no more: some browsers keep a module that failed as failed, and a
  // deploy that replaced the chunk fails every time. After that, only a
  // reload brings it, which the game screen offers (a room carries on
  // through one).
  let Game = $state<Component | null>(null);
  let GameOver = $state<Component | null>(null);
  let gamePagesLost = $state(false);
  let gamePages: Promise<unknown> | null = null;
  let gamePagesFailed = 0;
  const inRoom = () => screen !== 'home' && screen !== 'codex' && screen !== 'settings';
  const loadGamePages = () =>
    (gamePages ??= Promise.all([
      import('./components/Game.svelte').then((m) => (Game = m.default)),
      import('./components/GameOver.svelte').then((m) => (GameOver = m.default)),
    ]).catch(() => {
      if (++gamePagesFailed < 2) {
        gamePages = null;
        setTimeout(() => inRoom() && loadGamePages(), 1000);
      } else {
        gamePagesLost = true;
        toasts.show("Part of the game couldn't be loaded. Reload the page to carry on.", 'error', { title: 'Loading failed' });
      }
    }));
  onMount(() => whenIdle(loadGamePages, { timeout: 1500, fallback: 500 }));
  $effect(() => {
    if (inRoom()) untrack(loadGamePages);
  });

  // Each screen starts at the top (a guest who scrolled down to the join
  // form shouldn't land halfway down the lobby).
  $effect(() => {
    void screen;
    window.scrollTo({ top: 0 });
  });

  /** The player's mute and settings keys (lib/keys.ts), anywhere but in a field. */
  function anywhereKeys(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || typing(e)) return;
    const action = actionOf(e);
    // Open, the settings close on their key or Escape (whatever else Escape
    // is bound to), if nothing in them had it.
    if (settingsRoute.open && (action === 'settings' || e.key === 'Escape')) {
      if (!e.defaultPrevented) {
        e.preventDefault();
        closeSettings();
      }
      return;
    }
    if (action === 'mute') {
      e.preventDefault();
      toggleMute();
      return;
    }
    if (settingsRoute.open) return;
    if (action !== 'settings' || codexRoute.open) return;
    // Escape closes whatever is open first: a dialog or an item's window now,
    // or (heard once every handler has had the key) a row of the start page
    // or an armed kick, whose handlers take it.
    if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
    setTimeout(() => {
      if (!e.defaultPrevented && !settingsRoute.open) openSettings();
    });
  }

  let soundToast: number | null = null;
  /** The last press on the settings' backdrop began there, beside the sheet. */
  let pressedBeside = false;
  /** The mute key: the sound off, or back on (at half, were it all the way down), said in a notice since nothing else on screen shows it. */
  function toggleMute() {
    const off = !(isMuted() || getVolume() === 0);
    if (off) setMuted(true);
    else {
      if (getVolume() === 0) setVolume(0.5);
      setMuted(false);
      sfx('click');
    }
    const key = keybinds.map.mute[0];
    // One notice for the sound: the last one's taken down for the new.
    if (soundToast !== null) toasts.dismiss(soundToast);
    soundToast = toasts.show(off ? `Press ${key ? keyName(key, keybinds.layout) : 'the mute key'} to turn it back on.` : 'The sound is back on.', 'info', { title: off ? 'Sound off' : 'Sound on' });
  }

  function leave() {
    confirmLeave = false;
    session.leave();
  }

  /** A host's: whoever else is in the room (connected players, then spectators). */
  const company = $derived(session.mode === 'host' && gs ? [...gs.players.filter((p) => p.id !== session.myPlayerId && p.connected), ...(gs.spectators ?? [])] : null);
  // A host with nobody else in the room closes it for no one, so there's nothing to confirm in the lobby.
  const alone = $derived(!!company && !company.length);
  /** A host with someone in the room on another device, whom leaving would turn out (those at its own screen leave with it). */
  const othersHere = $derived(!!company?.some((o) => !('local' in o && o.local)));

  function askLeave() {
    if (alone && screen === 'lobby') leave();
    else confirmLeave = true;
  }

  /**
   * The legal links keep their place under a game and its result but don't
   * show there. Asking to leave shows them, above the dialog's darkening,
   * so they are two clicks away from anywhere: a copy in the dialog's
   * backdrop, held over the hidden ones as the page scrolls or the game
   * moves on behind the dialog.
   */
  const legalHidden = $derived(screen === 'game');
  let legalNav: HTMLElement | undefined = $state();
  /**
   * Svelte action: the element's height in the shell's px, as a variable on
   * the root (`--<name>`), kept as it changes and kept after it goes: the end
   * of a game lines its panel up with the lobby's from the header's and the
   * lobby's legal links' (GameOver.svelte), the links not showing there.
   * Written only while a component that reads them shows, held meanwhile
   * (lib/shellHeights.svelte.ts says why).
   */
  const heldVars = new Map<string, string>();
  function heightVar(node: HTMLElement, name: string) {
    const set = () => {
      const v = `${ownRect(node).height.toFixed(2)}px`;
      if (!shellHeightsRead()) heldVars.set(name, v);
      else document.documentElement.style.setProperty(`--${name}`, v);
    };
    const ro = new ResizeObserver(set);
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  }
  $effect(() => {
    if (!shellHeightsRead()) return;
    for (const [name, v] of heldVars) document.documentElement.style.setProperty(`--${name}`, v);
    heldVars.clear();
  });

  function overLegal(node: HTMLElement) {
    let raf = 0;
    const place = () => {
      if (legalNav) {
        // In the shell's px, which the backdrop is zoomed to as well (lib/behindDialog.ts).
        const r = ownRect(legalNav);
        node.style.top = `${r.top}px`;
        node.style.left = `${r.left}px`;
        node.style.width = `${r.width}px`;
      }
      raf = requestAnimationFrame(place);
    };
    place();
    return { destroy: () => cancelAnimationFrame(raf) };
  }
</script>

<Background />
<!-- Delve: the light shrinking at the screen's edges as a question's clock runs down. -->
<Darkness active={!!gs?.delve && screen === 'game'} />

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} onkeydown={anywhereKeys} />

<div class="shell" class:swapping data-behind-dialog bind:this={shell}>
  {#if headerOn}
    <!-- (Out of reach while a zone's card covers it with its bar: no focus lands on what can't be seen.) -->
    <!-- data-cursor: where other players' pointers are placed (PeerCursors) over the header, the same on every screen. -->
    <header data-cursor="header" class:folded class:full={folded && fullRoom(gs?.players.length ?? 0)} in:fade={{ duration: 300 }} bind:this={headerEl} bind:offsetHeight={headerHeight} use:heightVar={'header-h'} inert={!!zoneCard}>
      <button class="brand" data-cursor="brand" onclick={() => (page ? closePage() : askLeave())} title={page ? 'Back to the start' : 'Leave game'}>
        <span class="brand-mark" aria-hidden="true">
          {#each ['', 'hot'] as cls (cls)}
            <svg class={cls} viewBox="20 0 400 391"><path d="M224 390Q255 331 301.0 283.5Q347 236 377 218L407 200L220 -1Q164 31 116.5 82.5Q69 134 50 169L31 204Z" fill="currentColor" /></svg>
          {/each}
        </span>
        <span>PoE2.Quest{#if BETA}{' '}<small class="beta">Beta</small>{:else if LOCAL}{' '}<small class="beta">Local</small>{/if}</span>
      </button>
      <div class="meta" data-cursor="meta" bind:this={metaEl}>
        {#if gs?.delve && (screen === 'game' || screen === 'over')}
          <!-- Delve: no target, just how deep. -->
          {#if folded}
            <!-- (Folded: no room code, the depth and zone alone.) -->
          {:else if session.code && !session.hideCode}
            <span>Room <b class="code">{session.code}</b></span>
          {:else}
            <span>Delve</span>
          {/if}
          {#if session.spectating}
            {#if !folded}<span class="dot">•</span>{/if}
            <span class="spectating" title={session.justWatching ? "You're watching without playing." : "You'll play in the next game."}>Spectating</span>
          {/if}
          <!-- The depth as players count it (shownDepth). A run under way at 0
               names none here: the banner below has its start line (Game.svelte),
               too long for this line on a phone. -->
          <!-- (Going down into a new zone, the depth before until its cards are dealt: lib/dealing.svelte.ts.) -->
          {@const round = shownRound(gs)}
          {#if screen !== 'game' || shownDepth(round) > 0}
            {#if !folded || session.spectating}<span class="dot">•</span>{/if}
            <span class="depth" style:--accent={accentAt(round)} in:fade={{ duration: 600 }}>Depth <b>{shownDepth(round)}</b></span>
          {/if}
          <!-- And the zone it's in, in its colour; a new one fades in as it's announced. -->
          {#if !folded || session.spectating || shownDepth(round) > 0}<span class="dot zone-dot">•</span>{/if}
          {#key zoneAt(round)}
            <span class="zone" style:--accent={accentAt(round)} in:fade={{ duration: 900, delay: 500 }}>{zoneAt(round)}</span>
          {/key}
        {:else if gs && screen === 'game'}
          {#if session.code && !session.hideCode && !folded}
            <span>Room <b class="code">{session.code}</b></span>
            <span class="dot">•</span>
          {/if}
          {#if session.spectating}
            <span class="spectating" title={session.justWatching ? "You're watching without playing." : "You'll play in the next game."}>Spectating</span>
            <span class="dot">•</span>
          {/if}
          {#if gs.deathmatch}
            <span class="deathmatch">⚔ Deathmatch</span>
            <span class="dot">•</span>
            <span>Round {gs.deathmatch.round}</span>
          {:else}
            <span>{gs.settings.mode === 'race' ? 'Question' : 'Round'} {gs.round}</span>
            <span class="dot target">•</span>
            <span class="target">First to <b>{gs.settings.targetScore}</b></span>
          {/if}
        {:else if session.mode === 'local' || session.hereOnly}
          <span>On this device</span>
        {:else if session.code && screen !== 'lobby'}
          <!-- The lobby shows the code in big letters. -->
          <span>Room <b class:code={!session.hideCode}>{session.hideCode ? '••••••' : session.code}</b></span>
        {/if}
      </div>
      <div class="tools">
        {#if page}
          <button class="icon-btn" onclick={closePage} title={codex ? 'Close the codex' : 'Close the settings'} aria-label={codex ? 'Close the codex' : 'Close the settings'}>
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        {:else}
          <!-- The sound, the effects and the keys, over the game (settingsOver). -->
          <button class="icon-btn" data-cursor="gear" onclick={openSettings} title="Settings" aria-label="Settings">
            <svg viewBox="0 0 24 24"
              ><circle cx="12" cy="12" r="3" /><path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
              /></svg
            >
          </button>
          <button class="icon-btn" data-cursor="leave" onclick={askLeave} title="Leave" aria-label="Leave game">
            <svg viewBox="0 0 24 24"><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" /></svg>
          </button>
        {/if}
      </div>
    </header>
  {/if}

  <main>
    <!-- Other players' pointers, in an online room: the lobby and the game (lib/cursors.ts says when). -->
    {#if (session.mode === 'host' || session.mode === 'client') && session.state}<PeerCursors />{/if}
    {#if recording}<Recorder onstop={() => (recording = false)} />{/if}
    {#key screen}
      <div
        class="screen"
        in:screenIn
        out:screenOut
        onintroend={(e) => {
          hold(e.currentTarget, false);
          swapping = false;
        }}
        onoutroend={showHeader}
      >
        {#if screen === 'home'}
          <Home />
        {:else if screen === 'lobby'}
          <Lobby />
        {:else if screen === 'game'}
          {#if Game}<Game />{:else}{@render gamePagesWait()}{/if}
        {:else if screen === 'codex'}
          <!-- Loaded when first opened: most visits never do. -->
          {#await loadCodexPage() then { default: Codex }}
            <Codex />
          {/await}
        {:else if screen === 'settings'}
          <!-- Loaded when first opened, as the codex is. -->
          {#await import('./components/Settings.svelte') then { default: Settings }}
            <Settings />
          {/await}
        {:else if GameOver}
          <GameOver />
        {:else}
          {@render gamePagesWait()}
        {/if}
      </div>
    {/key}
  </main>

  <!-- The end of a game closes with the start page's footer, the legal links in it. -->
  {#if headerOn && screen !== 'over'}
    <nav class="legal" class:hidden={legalHidden} aria-label="Legal" bind:this={legalNav} use:heightVar={'legal-h'}>
      {@render legalLinks()}
    </nav>
  {/if}
</div>

<!-- The game's screens still on their way (loadGamePages), or lost. -->
{#snippet gamePagesWait()}
  <div class="pages-wait">
    {#if gamePagesLost}
      <p>Part of the game couldn't be loaded.</p>
      <button class="btn primary" onclick={() => location.reload()}>Reload</button>
    {:else}
      <span class="spinner" aria-label="Loading"></span>
    {/if}
  </div>
{/snippet}

{#snippet legalLinks()}
  <a href={IMPRINT_URL} target="_blank" rel="noopener">Impressum</a>
  <span aria-hidden="true">·</span>
  <a href={PRIVACY_URL} target="_blank" rel="noopener" onclick={openPrivacy}>Datenschutz</a>
{/snippet}

{#if zoneCard}
  {#key zoneCard.key}
    <ZoneCard a={zoneCard} bar={headerHeight} />
  {/key}
{/if}
<Toasts headerHeight={headerOn ? headerHeight : 0} />
<LegalSheet />

<FxLayer />

<!-- In a room: the settings over the game, which runs on beneath (the page's keys wait while a dialog is open). -->
{#if settingsOver}
  <!-- Closed by a press that both begins and ends beside the sheet: not a slider's drag let go out there. -->
  <div
    class="modal-backdrop settings-over"
    use:dialogBackdrop
    transition:fade={{ duration: 150 }}
    onpointerdown={(e) => (pressedBeside = e.target === e.currentTarget)}
    onclick={(e) => pressedBeside && e.target === e.currentTarget && closeSettings()}
    role="presentation"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="sheet panel" transition:fly={{ y: 20, duration: 250 }} onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Settings" tabindex="-1">
      <div class="sheet-head">
        <h3>Settings</h3>
        <button class="icon-btn" onclick={closeSettings} title="Close the settings" aria-label="Close the settings">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      {#await import('./components/Settings.svelte') then { default: Settings }}
        <Settings over />
      {/await}
    </div>
  </div>
{/if}

{#if confirmLeave}
  <div class="modal-backdrop" use:dialogBackdrop transition:fade={{ duration: 150 }} onclick={() => (confirmLeave = false)}
    onkeydown={(e) => e.key === 'Escape' && (confirmLeave = false)}
    role="presentation"
  >
    {#if legalHidden && legalNav}
      <!-- A link opens in a new tab and the dialog stays. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <nav class="legal lifted" aria-label="Legal" use:overLegal onclick={(e) => e.stopPropagation()}>
        {@render legalLinks()}
      </nav>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal panel"
      transition:fly={{ y: 20, duration: 250 }}
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <h3>Leave the game?</h3>
      <p class="muted">
        {#if othersHere}
          You are the host. Leaving closes the room for everyone.
        {:else if session.mode === 'local' || session.mode === 'host'}
          The current game will be lost.
        {:else}
          You can rejoin with the same code while the game is running.
        {/if}
      </p>
      <div class="modal-actions">
        <button class="btn ghost" onclick={() => (confirmLeave = false)}>Stay</button>
        <button class="btn primary" onclick={leave}>Leave</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* The room code stays selectable (the rest of the game isn't): a tap or
     double-click takes the whole code, to share it. */
  .code {
    -webkit-user-select: all;
    user-select: all;
    cursor: text;
  }
  /* Scaled up on large windows (lib/stage.ts): the window's height in its zoomed pixels. */
  .shell {
    zoom: var(--stage-zoom, 1);
    position: relative;
    z-index: 1;
    min-height: calc(100dvh / var(--stage-zoom, 1));
    display: flex;
    flex-direction: column;
    /* Room at the end for a bar fixed to the bottom of the screen (lib/layout.ts). */
    padding-bottom: var(--dock, 0px);
  }
  .shell.swapping {
    padding-bottom: 0;
  }

  header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    position: relative;
    padding: 0.8rem 1.25rem;
    border-bottom: 1px solid rgba(125, 99, 51, 0.22);
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0));
  }
  /* A gold hairline, brightest in the middle, over the header's lower edge. */
  header::after {
    content: '';
    position: absolute;
    left: 10%;
    right: 10%;
    bottom: -1px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(224, 138, 68, 0.55), rgba(241, 217, 155, 0.7), rgba(224, 138, 68, 0.55), transparent);
    pointer-events: none;
  }

  .brand {
    justify-self: start;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    background: none;
    border: 0;
    cursor: pointer;
    font-family: var(--font-title);
    font-weight: 900;
    letter-spacing: 0.14em;
    font-size: 0.9rem;
    color: var(--gold);
    padding: 0.25rem 0;
    text-shadow: 0 0 14px rgba(201, 164, 92, 0.25);
    transition:
      color 0.25s,
      text-shadow 0.25s;
  }
  .brand:hover {
    color: var(--gold-hi);
    text-shadow: 0 0 16px rgba(241, 217, 155, 0.55);
  }
  /* Beta, or Local on the dev server. Phones hide the name and this with it; the start page still says which. */
  .beta {
    margin-left: 0.2em;
    font-family: var(--font-cinzel);
    font-size: 0.62rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  .brand-mark {
    position: relative;
    flex: none;
    color: var(--unique-hi);
    width: 0.8rem;
    height: 0.72rem;
  }
  .brand-mark svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 0 6px rgba(224, 138, 68, 0.7));
  }
  /* It kindles: a hotter copy on top fades in and out. Fading a layer
     painted once costs nothing per frame, where animating the filter itself
     would repaint it every frame for as long as the header shows. */
  .brand-mark .hot {
    filter: drop-shadow(0 0 10px rgba(255, 150, 70, 0.95)) brightness(1.2);
    opacity: 0;
    animation: kindle 3.2s ease-in-out infinite;
  }
  @keyframes kindle {
    50% {
      opacity: 1;
    }
  }

  .meta {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    font-family: var(--font-cinzel);
    font-size: 0.78rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .meta b {
    color: var(--gold-hi);
  }
  .dot {
    color: var(--gold-lo);
  }
  .spectating {
    color: var(--gold-hi);
  }
  /* The depth takes its stratum's colour (descent.ts), as the scene turns into it. */
  .depth b {
    color: var(--accent);
    text-shadow: 0 0 10px color-mix(in srgb, var(--accent) 35%, transparent);
    transition:
      color 1.2s,
      text-shadow 1.2s;
  }
  .zone {
    color: color-mix(in srgb, var(--accent) 75%, var(--gold-hi));
    white-space: nowrap;
    transition: color 1.2s;
  }
  .deathmatch {
    color: #ff7a5c;
    font-weight: 700;
    text-shadow: 0 0 12px rgba(224, 85, 63, 0.6);
    animation: pulse 1.6s ease-in-out infinite;
  }

  .tools {
    justify-self: end;
    display: flex;
    gap: 0.4rem;
  }
  .icon-btn {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 50%;
    cursor: pointer;
    color: var(--muted);
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.06);
    transition:
      color 0.2s,
      border-color 0.2s,
      box-shadow 0.25s,
      transform 0.2s var(--ease-out);
  }
  /* On a touch screen a thumb's size to tap (44pt, Apple's least), the button drawn as it is. */
  @media (pointer: coarse) {
    .icon-btn {
      position: relative;
    }
    .icon-btn::before {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 50%;
    }
  }
  .icon-btn:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.1),
      0 0 16px rgba(201, 164, 92, 0.3);
    transform: translateY(-1px);
  }
  .icon-btn:active {
    transform: scale(0.94);
  }
  .icon-btn svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  main {
    flex: 1;
    display: grid;
  }
  .screen {
    grid-area: 1 / 1;
    min-width: 0;
  }
  /* The start page fills the height below the header, not the window's:
     while the header is still up behind it, it must not overflow. */
  .screen:has(> :global(.home)),
  .screen:has(> :global(.over)) {
    display: flex;
    flex-direction: column;
  }

  .pages-wait {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 4rem 16px;
    color: var(--muted);
    text-align: center;
  }
  .pages-wait p {
    margin: 0;
  }
  /* Only for a wait long enough to notice. */
  .pages-wait .spinner {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid rgba(201, 164, 92, 0.15);
    border-top-color: var(--gold);
    animation:
      pages-wait-in 0.3s 0.4s both,
      pages-wait-spin 0.9s linear infinite;
  }
  @keyframes pages-wait-in {
    from {
      opacity: 0;
    }
  }
  @keyframes pages-wait-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .legal {
    display: flex;
    justify-content: center;
    gap: 0.6rem;
    padding: 0.6rem 1rem 1rem;
    font-size: 0.8rem;
    color: var(--muted);
    transition:
      opacity 0.3s,
      visibility 0s;
  }
  .legal a {
    color: var(--muted);
    text-decoration: none;
  }
  .legal a:hover {
    color: var(--gold-hi);
  }
  .legal.hidden {
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.3s,
      visibility 0s 0.3s;
  }
  .legal.lifted {
    position: absolute;
    margin: 0;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    /* Below the effects layer (z-index 95), so the dialog's buttons get their
       effects; the page behind dims itself (lib/behindDialog.ts). */
    z-index: 94;
    display: grid;
    place-items: center;
    padding: 1rem;
  }
  /* The settings over a game: as wide as the page's columns, scrolled within when the window is short. */
  .settings-over {
    overflow-y: auto;
    place-items: start center;
  }
  .sheet {
    width: min(960px, 100%);
    /* Centred while it fits; taller than the window, from its top. */
    margin-block: auto;
    padding: 1.1rem 2rem 1.8rem;
    /* Solid, one flat colour (the panel's darker end): the question beneath
       doesn't show through, and a flat fill has no levels to band. */
    background: rgb(20, 16, 12);
  }
  /* The sheet's name, centred over a hairline as a dialog's is; the close at the right. */
  .sheet-head {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding-bottom: 0.8rem;
    border-bottom: 1px solid var(--line);
  }
  .sheet-head h3 {
    grid-column: 2;
    margin: 0;
    font-size: 1.45rem;
    color: var(--gold-hi);
  }
  .sheet-head .icon-btn {
    grid-column: 3;
    justify-self: end;
  }
  /* A phone on its side: closer in, so the settings fit without a scroll. */
  @media (max-height: 500px) {
    .settings-over {
      padding-block: 0.5rem;
    }
    .sheet {
      padding: 0.6rem 1.4rem 0.9rem;
    }
    .sheet-head {
      padding-bottom: 0.45rem;
    }
  }
  .modal {
    width: min(420px, 100%);
    padding: 1.6rem;
    text-align: center;
  }
  .modal h3 {
    color: var(--gold-hi);
    font-size: 1.2rem;
  }
  .modal-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 1.2rem;
  }

  @media (max-width: 640px) {
    header {
      grid-template-columns: auto 1fr auto;
      gap: 0.5rem;
      padding: 0.4rem 0.8rem;
    }
    .brand span:last-child {
      display: none;
    }
    .meta {
      justify-content: center;
      flex-wrap: wrap;
      font-size: 0.66rem;
      gap: 0.1rem 0.35rem;
    }
    /* Delve: the zone on a line of its own under the depth, a little smaller. */
    .zone-dot {
      display: none;
    }
    .zone {
      flex-basis: 100%;
      text-align: center;
      font-size: 0.6rem;
      line-height: 1.2;
    }
  }

  /* A phone on its side (lib/layout.ts `flat`): a slimmer header, clear of
     the notch, so the game below it fits the screen's height (its buttons
     keep their size: a thumb's to tap). */
  @media (orientation: landscape) and (max-height: 500px) {
    header {
      padding: 0.25rem max(1rem, env(safe-area-inset-right)) 0.25rem max(1rem, env(safe-area-inset-left));
    }
    /* In a game (`folded`): the round and the buttons at the row's right end,
       the scoreboard laid over the rest of it (Scoreboard.svelte). */
    header.folded {
      grid-template-columns: 1fr auto auto;
      column-gap: 0.9rem;
    }
    header.folded .brand {
      visibility: hidden;
    }
    header.folded .meta {
      gap: 0.45rem;
      letter-spacing: 0.12em;
    }
    /* A full room on a narrower phone: the round alone, the players its room. */
    @media (max-width: 759px) {
      header.full .target {
        display: none;
      }
    }
    .brand {
      white-space: nowrap;
    }
    /* The game's links, hidden (two clicks away in the Leave dialog), take no
       height under it: there is none to spare. */
    .legal.hidden {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
    }
  }
  /* Narrower ones keep the header to one line: the name goes without its Beta, as on phones. */
  @media (orientation: landscape) and (max-height: 500px) and (max-width: 760px) {
    .beta {
      display: none;
    }
  }
  /* A phone upright (lib/layout.ts `upright`): a game is as tall as the room
     under the header and no taller (Game.svelte fills it), and its links,
     hidden, take no height under it. */
  @media (orientation: portrait) and (max-width: 640px) {
    .screen:has(> :global(.game)) {
      display: flex;
      flex-direction: column;
    }
    .legal.hidden {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
    }
  }

  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
</style>
