<script lang="ts">
  // Pairing the player's devices (lib/sync): opened from the settings (Sync,
  // under You), or by a pairing link another device's QR code brought this
  // one to (`offered`, from App). Every view is set on the same stage, a
  // rune circle hollow round its heart (lib/circlePlaces `sync`), the same
  // size throughout so nothing jumps:
  // - show: this device's code, a QR code engraved on a gilded plate, and
  //   how the link stands; where it opens at a computer (a code made here is
  //   only kept if another device comes in time: lib/sync/link.svelte.ts);
  // - scan: the camera, round in the heart, reading the other device's code;
  //   where it opens on a phone or a tablet not yet paired (an iPhone's home
  //   screen game has storage of its own, so it scans from here);
  // - type: the code typed in;
  // - joined: a code taken from elsewhere, and how the link stands;
  // - offered: a pairing link's code, taken only once the player says yes
  //   (a link can come from anyone).
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { dialogBackdrop } from '../lib/behindDialog';
  import { circleOf, warmCircle } from './circles';
  import { calm } from '../lib/motion.svelte';
  import { codeInHash, codeLink, readCode, shownCode } from '../lib/sync/code';
  import { offerCode, sync, syncLine, useCode } from '../lib/sync/link.svelte';
  import { qrShape } from '../lib/sync/qr';
  import { SYNC_HERE } from '../lib/sync/store';
  import { canScan, scan } from '../lib/sync/scan';
  import SyncSeal from './SyncSeal.svelte';

  type View = 'show' | 'scan' | 'type' | 'joined' | 'offered';
  let {
    offered = null,
    start,
    onclose,
  }: {
    offered?: string | null;
    /** The view it opens in, a link's code aside: by default, at a computer or on a paired device the code, on a phone the camera (the QA desk's bench opens it in each). */
    start?: Exclude<View, 'offered'>;
    onclose: () => void;
  } = $props();

  const Circle = circleOf('sync');
  warmCircle(Circle, true);

  /** A phone or a tablet: it reads the other device's code, where a computer shows its own. */
  const handheld = typeof matchMedia === 'function' && matchMedia('(pointer: coarse) and (hover: none)').matches;
  const scans = canScan();

  // (Read once: a link's code is the dialog's reason to open.)
  // svelte-ignore state_referenced_locally
  const first: View = offered ? 'offered' : (start ?? (handheld && scans && !sync.code ? 'scan' : 'show'));
  let view = $state<View>(first);
  /** The code shown: the one paired with, or one made for this dialog (and, once it moves to the others' code, theirs). */
  let made = $state<string | null>(null);
  const code = $derived(sync.code ?? made);
  function show() {
    endScan();
    made = offerCode();
    view = 'show';
  }
  // The code let go of while it's open. Left past its ten minutes: a new code of its own, not one nobody waits on (a
  // code taken from the other device lapsed with it too, so this one shows its own for that one to scan). Unpaired in
  // another tab: the player let go of it, and the dialog goes too, rather than pair again behind their back.
  // (Not on the QA desk, which never syncs: the bench sets the code.)
  $effect(() => {
    if (!SYNC_HERE || (view !== 'show' && view !== 'joined') || sync.code) return;
    if (!sync.lapsed) return untrack(close);
    made = offerCode();
    view = 'show';
  });

  /** Pairs with a code from elsewhere (scanned, typed, a link), and shows how the link stands. */
  function take(c: string) {
    endScan();
    useCode(c);
    made = c;
    view = 'joined';
  }

  const qr = $derived(code ? qrShape(codeLink(code, location.href)) : null);

  const linked = $derived(sync.status === 'linked');
  const statusLine = $derived(syncLine());
  // Words: pairing is the act, synced the state.
  const title = $derived(
    view === 'offered'
      ? 'Pair this device?'
      : view === 'scan'
        ? 'Scan the code'
        : view === 'type'
          ? 'Enter a code'
          : view === 'joined'
            ? linked
              ? 'Synced'
              : 'Paired'
            : 'Pair a device',
  );

  /** The circle cut round the plate or the camera, a little wider, so its lines stop short of them as an engraver's would (the seal sits in its own hollow). */
  const cut = $derived(
    view === 'show'
      ? `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M0 0H100V100H0Z' + roundedHole(20, 60, 5.5) + '"/></svg>')}")`
      : view === 'scan'
        ? 'radial-gradient(closest-side, transparent calc(54% + 9px), #000 calc(54% + 10px))'
        : 'none',
  );
  function roundedHole(at: number, s: number, r: number) {
    const e = at + s;
    return `M${at + r} ${at}H${e - r}A${r} ${r} 0 0 1 ${e} ${at + r}V${e - r}A${r} ${r} 0 0 1 ${e - r} ${e}H${at + r}A${r} ${r} 0 0 1 ${at} ${e - r}V${at + r}A${r} ${r} 0 0 1 ${at + r} ${at}Z`;
  }

  // ---- scanning ----

  let video = $state<HTMLVideoElement>();
  let stopScan: (() => void) | null = null;
  let scanError = $state('');
  /** The camera's picture has come: until then the heart shows the seal, faint. */
  let seeing = $state(false);
  /** Which scan is the latest: one that comes back after the view moved on, or the dialog closed, is stopped at once. */
  let scanGen = 0;
  let alive = true;
  async function startScan() {
    endScan();
    const gen = ++scanGen;
    const current = () => alive && gen === scanGen && view === 'scan';
    view = 'scan';
    scanError = '';
    seeing = false;
    await tick();
    if (!video || !current()) return;
    try {
      // (The camera takes a while to come, jsQR too on an iPhone: the dialog may be gone by then.)
      const stop = await scan(video, (text) => {
        if (!current()) return true;
        const c = codeFrom(text);
        if (!c || c === 'elsewhere') {
          scanError = c ? "That code is for another version of the site. Open it with your phone's camera app instead." : "That isn't a sync code.";
          return false;
        }
        stopScan = null;
        take(c);
        return true;
      });
      if (current()) stopScan = stop;
      else stop();
    } catch {
      if (current()) scanError = "The camera couldn't be opened. Allow it for this site, or enter the code instead.";
    }
  }
  function endScan() {
    scanGen++;
    stopScan?.();
    stopScan = null;
  }
  /** A sync code in what a QR code holds (a pairing link, or the code alone); `elsewhere` for a link to another version of the site, whose devices this one never meets (the beta's rooms are its own). */
  function codeFrom(text: string): string | null | 'elsewhere' {
    try {
      const url = new URL(text);
      const c = codeInHash(url.hash);
      if (c) return new URL('.', url).href === new URL('.', location.href).href ? c : 'elsewhere';
    } catch {
      /* not a link */
    }
    return readCode(text);
  }

  // ---- typing ----

  let typed = $state('');
  let typeError = $state('');
  let field = $state<HTMLInputElement>();
  async function startTyping() {
    endScan();
    typed = '';
    typeError = '';
    view = 'type';
    await tick();
    // (Not on a phone: its keyboard would cover the dialog before the player asked to type.)
    if (!handheld) field?.focus();
  }
  function submitTyped(e: Event) {
    e.preventDefault();
    const c = readCode(typed);
    if (!c) {
      typeError = "That isn't a sync code: it has sixteen letters and digits.";
      return;
    }
    take(c);
  }

  /** Back from typing: to where the dialog opened. */
  function back() {
    if (first === 'scan') void startScan();
    else show();
  }

  function close() {
    endScan();
    onclose();
  }
  onDestroy(() => {
    alive = false;
    endScan();
  });

  /** Escape closes the dialog alone, heard before the settings behind it would close too (App's keys leave a key that's been had). */
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    close();
  }
  let panel = $state<HTMLDivElement>();
  // (Focus in the dialog, not on the button behind it that opened it.)
  onMount(() => panel?.focus({ preventScroll: true }));

  // Opened at the first view.
  if (first === 'show' || first === 'joined') show();
  if (first === 'joined') view = 'joined';
  else if (first === 'scan') void startScan();
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="backdrop" use:dialogBackdrop transition:fade|global={{ duration: 150 }} onclick={close} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="sync panel" bind:this={panel} transition:fly|global={calm({ y: 20, duration: 250 })} onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sync-title" tabindex="-1">
    <h3 id="sync-title">{title}</h3>

    <!-- The stage: the circle, and in its heart the code, the camera or the seal. -->
    <div class="stage">
      <div class="circle" style:mask-image={cut} style:-webkit-mask-image={cut}>
        <Circle size="100%" hollow state={linked && (view === 'show' || view === 'joined') ? 'good' : 'idle'} strength={0.5} />
      </div>
      {#if view === 'show' && qr}
        <div class="heart plate" in:fade={calm({ duration: 300 })}>
          <svg class="qr" viewBox="0 0 {qr.size} {qr.size}" role="img" aria-label="QR code of this device's sync link">
            <path d={qr.eyes} />
            <path d={qr.dots} />
            {#if qr.heart}
              <svg x={qr.heart.c - qr.heart.r} y={qr.heart.c - qr.heart.r} width={2 * qr.heart.r} height={2 * qr.heart.r}><SyncSeal inked /></svg>
            {/if}
          </svg>
        </div>
      {:else if view === 'scan'}
        <div class="heart lens" in:fade={calm({ duration: 300 })}>
          <div class="waiting" class:gone={seeing}><SyncSeal /></div>
          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={video} class:seeing playsinline muted onplaying={() => (seeing = true)}></video>
        </div>
      {:else}
        {#key view}
          <div class="sigil" class:quiet={view === 'type'} class:good={linked && view === 'joined'}><SyncSeal /></div>
        {/key}
      {/if}
    </div>

    <!-- Under the stage: the code, the field to type it in, or what to do; the same height in every view. -->
    <div class="under">
      {#if view === 'type'}
        <form id="sync-typed" onsubmit={submitTyped}>
          <input
            bind:this={field}
            class="field code-field"
            bind:value={typed}
            oninput={() => (typeError = '')}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            aria-label="Sync code"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            enterkeyhint="done"
          />
        </form>
      {:else if view === 'scan'}
        <p class="how">Point the camera at your other device's code.</p>
      {:else if code || offered}
        <p class="code" aria-label="Sync code">{shownCode((view === 'offered' ? offered : code)!)}</p>
      {/if}
    </div>

    <!-- What to do, how the link stands, or what went wrong: two lines kept for it, so nothing below moves. -->
    <p class="line" class:good={linked && (view === 'show' || view === 'joined')} class:bad={(view === 'show' || view === 'joined') ? sync.status === 'offline' : !!(view === 'scan' ? scanError : view === 'type' ? typeError : '')} aria-live="polite">
      {#if view === 'offered'}
        Your codex, Delve runs and achievements will match the device that showed this code. Only accept a code from your own device.
      {:else if view === 'scan'}
        {scanError || 'On a computer, choose Pair a device in the settings; on a phone, Show my code.'}
      {:else if view === 'type'}
        {typeError || 'The code under the QR code on your other device.'}
      {:else if view === 'show' && !linked && sync.status !== 'offline'}
        {handheld ? 'Scan it from your other device, or enter its code there.' : "Scan it with your phone's camera. Playing from its home screen? Pair a device in its settings."}
      {:else}
        {statusLine}
      {/if}
    </p>

    <!-- The other ways: a line of their own, kept in every view, so the buttons below stay one row. (None started over:
         the others come to this code, as a code taken from one of them would be the group's this device left.) -->
    <p class="routes">
      {#if view === 'show' && !sync.anew}
        {#if handheld && scans}<button class="route" onclick={startScan}>Scan a code</button><span class="sep bullet" aria-hidden="true">•</span>{/if}
        <button class="route" onclick={startTyping}>Enter a code</button>
      {:else if view === 'scan'}
        <button class="route" onclick={show}>Show my code</button><span class="sep bullet" aria-hidden="true">•</span><button class="route" onclick={startTyping}>Enter a code</button>
      {/if}
    </p>

    <!-- The gold button is the next step here: none while the other device is still to come. -->
    <div class="actions">
      {#if view === 'offered'}
        <button class="btn ghost" onclick={close}>Not now</button>
        <button class="btn primary" onclick={() => take(offered!)}>Pair</button>
      {:else if view === 'type'}
        <button class="btn ghost" type="button" onclick={back}>Back</button>
        <button class="btn primary" type="submit" form="sync-typed" disabled={!typed.trim()}>Pair</button>
      {:else if view === 'joined' || (view === 'show' && sync.met)}
        <button class="btn primary" onclick={close}>Done</button>
      {:else}
        <button class="btn ghost" onclick={close}>Close</button>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Taller than a short window, the dialog scrolls with its backdrop, its ornaments whole. */
  .backdrop {
    position: fixed;
    inset: 0;
    /* Below the effects layer, like the codex's own dialog. */
    z-index: 94;
    display: flex;
    padding: 1rem;
    overflow-y: auto;
  }
  /* One column: the title, the stage, and under it the words and the buttons. */
  .sync {
    display: grid;
    grid-template-areas: 'title' 'stage' 'under' 'line' 'routes' 'actions';
    width: min(440px, 100%);
    margin: auto;
    padding: 1.5rem 1.6rem 1.6rem;
    text-align: center;
    --stage: min(330px, 46vh);
  }
  @supports (height: 1svh) {
    /* (A phone's bars up: the small viewport, not the large.) */
    .sync {
      --stage: min(330px, 46svh);
    }
  }
  /* (Focused as it opens, so keys reach it; the frame needs no ring.) */
  .sync:focus {
    outline: none;
  }
  @media (max-width: 420px) {
    .sync {
      padding: 1.3rem 1rem 1.4rem;
    }
  }
  /* A phone on its side: the stage at the left, the full height, and the rest beside it. */
  @media (orientation: landscape) and (max-height: 500px) {
    .sync {
      grid-template-areas: 'stage title' 'stage under' 'stage line' 'stage routes' 'stage actions';
      grid-template-columns: auto minmax(0, 1fr);
      align-content: center;
      column-gap: 1.2rem;
      width: min(640px, 100%);
      padding: 1rem 1.2rem;
      --stage: min(300px, calc(100vh - 5rem));
    }
    /* (Its own width here: a share of an auto column would be nothing.) */
    .sync .stage {
      align-self: center;
      width: var(--stage);
      margin: 0;
    }
  }
  .sync h3 {
    grid-area: title;
    margin: 0;
    color: var(--gold-hi);
    font-size: 1.25rem;
  }

  /* The stage, square: the circle reaches out to the panel's padding; the code or the camera a little over half of it. */
  .stage {
    grid-area: stage;
    position: relative;
    width: min(var(--stage), 100%);
    aspect-ratio: 1;
    margin: 0.2rem auto 0;
  }
  /* Clipped to its square: its layers wind and settle in from larger, and past the stage they'd make the backdrop
     scroll, more as they turn (the mask hides them there anyway). */
  .circle {
    position: absolute;
    inset: 0;
    overflow: hidden;
    overflow: clip;
    mask-repeat: no-repeat;
    mask-size: 100% 100%;
  }
  /* Its corners inside the circle's band. */
  .heart {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 54%;
    height: 54%;
  }

  /* The code, engraved in ink on a gilded plate (dark on light, as every camera reads it), set in a fine gold frame. */
  .plate {
    --leaf-hi: #f0dca6;
    --leaf: #dcbc78;
    --leaf-lo: #c9a25a;
    --ink: #2a1b0b;
    border-radius: 7%;
    background:
      radial-gradient(120% 90% at 30% 20%, rgba(255, 246, 214, 0.55), transparent 60%),
      linear-gradient(145deg, var(--leaf-hi), var(--leaf) 50%, var(--leaf-lo));
    box-shadow:
      0 0 0 1px #3a2a14,
      0 0 0 4px #120d07,
      0 0 0 5px var(--gold-lo),
      0 6px 18px rgba(0, 0, 0, 0.55);
    color: var(--ink);
  }
  .qr {
    display: block;
    width: 100%;
    height: 100%;
    fill: currentColor;
  }

  /* The camera, round, in the same frame as the plate. */
  .lens {
    border-radius: 50%;
    overflow: hidden;
    background: #070504;
    box-shadow:
      0 0 0 1px #3a2a14,
      0 0 0 4px #120d07,
      0 0 0 5px var(--gold-lo),
      0 6px 18px rgba(0, 0, 0, 0.55);
  }
  .lens video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 0.4s;
  }
  .lens video.seeing {
    opacity: 1;
  }
  /* Until the camera's picture comes, the seal, breathing faintly. */
  .waiting {
    position: absolute;
    inset: 18%;
    color: var(--gold);
    opacity: 0.5;
    animation: waiting 6s ease-in-out infinite alternate;
    transition: opacity 0.4s;
  }
  .waiting.gone {
    opacity: 0;
    animation: none;
  }
  @keyframes waiting {
    to {
      opacity: 0.25;
    }
  }

  /* The seal, struck in gold inside the circle's hollow frame; faint while a code is typed, the circle's own pale green once linked. */
  .sigil {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 32%;
    height: 32%;
    color: var(--gold-hi);
    transition: color 0.9s;
  }
  .sigil.quiet {
    color: var(--gold-lo);
  }
  .sigil.good {
    color: #d8dfa0;
  }

  /* Under the stage, one line's height in every view. */
  .under {
    grid-area: under;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 2.9rem;
    margin-top: 0.4rem;
  }
  .under form {
    width: min(300px, 100%);
  }
  .code {
    margin: 0;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: 0.12em;
    color: var(--gold-hi);
    user-select: all;
  }
  .how {
    margin: 0;
    color: var(--text);
    line-height: 1.35;
  }
  .line {
    grid-area: line;
    min-height: 2.7em;
    margin: 0.2rem 0 0;
    font-style: italic;
    line-height: 1.35;
    color: var(--muted);
  }
  .line.good {
    color: var(--verdict-good-icon);
  }
  .line.bad {
    color: var(--bad);
  }
  .code-field {
    width: 100%;
    text-align: center;
    font-family: var(--font-cinzel);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .code-field::placeholder {
    text-transform: none;
    letter-spacing: 0.1em;
  }
  /* The other ways, as quiet links (Settings' Reset), one line kept for them. */
  .routes {
    grid-area: routes;
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: 0.6rem;
    min-height: 1.6em;
    margin: 0.5rem 0 0;
  }
  .route {
    padding: 0;
    border: 0;
    background: none;
    font-family: var(--font-body);
    font-style: italic;
    font-size: 0.95rem;
    color: var(--muted);
    text-decoration: underline;
    text-decoration-color: var(--gold-lo);
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .route:hover {
    color: var(--gold-hi);
  }
  /* At the links' size (set down to their small letters: app.css .bullet). */
  .sep {
    font-size: 0.95rem;
    color: var(--gold-lo);
  }
  .actions {
    grid-area: actions;
    display: flex;
    gap: 0.6rem;
    justify-content: center;
    margin-top: 0.8rem;
  }
</style>
