<script lang="ts">
  // Pairing the player's devices (lib/sync): opened from the settings (Sync,
  // under You), or by a pairing link another device's QR code brought this
  // one to (`offered`, from App). Every view is set on the same stage, a
  // rune circle hollow round its heart (lib/circlePlaces `sync`), the same
  // size throughout so nothing jumps:
  // - show: this device's code, a QR code engraved on a gilded plate, and
  //   how the link stands; where it opens at a computer (a code made here is
  //   only kept once another device comes: closed before then, it is let go);
  // - scan: the camera, round in the heart, reading the other device's code;
  //   where it opens on a phone or a tablet not yet paired (an iPhone's home
  //   screen game has storage of its own, so it scans from here);
  // - type: the code typed in;
  // - joined: a code taken from elsewhere, and how the link stands;
  // - offered: a pairing link's code, taken only once the player says yes
  //   (a link can come from anyone).
  import { onDestroy, onMount, tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { dialogBackdrop } from '../lib/behindDialog';
  import { circleOf, warmCircle } from './circles';
  import { calm } from '../lib/motion.svelte';
  import { codeInHash, codeLink, readCode, shownCode } from '../lib/sync/code';
  import { offerCode, sync, useCode, withdrawOffer } from '../lib/sync/link.svelte';
  import { qrShape } from '../lib/sync/qr';
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
  /** The code shown: the one paired with, or one made for this dialog. */
  let code = $state<string | null>(null);
  /** The code shown was made here, and goes if no device comes before the dialog closes. */
  let made = false;
  function show() {
    endScan();
    const was = sync.code;
    code = offerCode();
    made ||= was === null;
    view = 'show';
  }

  /** Pairs with a code from elsewhere (scanned, typed, a link), and shows how the link stands. */
  function take(c: string) {
    endScan();
    made = false;
    useCode(c);
    code = c;
    view = 'joined';
  }

  const qr = $derived(code ? qrShape(codeLink(code, location.href)) : null);

  const linked = $derived(sync.status === 'linked');
  const statusLine = $derived(
    linked
      ? sync.linked > 1
        ? `Synced with ${sync.linked} other devices.`
        : 'Synced with your other device.'
      : sync.status === 'offline'
        ? "Can't reach the matchmaking server. Trying again in a moment."
        : sync.status === 'waiting'
          ? view === 'joined'
            ? 'Waiting for your other device to come online.'
            : 'Waiting for your other device.'
          : 'Connecting.',
  );
  const title = $derived(
    view === 'offered'
      ? 'Sync this device?'
      : view === 'scan'
        ? 'Scan the code'
        : view === 'type'
          ? 'Enter a code'
          : view === 'joined'
            ? linked
              ? 'Synced'
              : 'Paired'
            : 'Sync your devices',
  );

  // ---- scanning ----

  let video = $state<HTMLVideoElement>();
  let stopScan: (() => void) | null = null;
  let scanError = $state('');
  /** The camera's picture has come: until then the heart shows the seal, faint. */
  let seeing = $state(false);
  async function startScan() {
    view = 'scan';
    scanError = '';
    seeing = false;
    await tick();
    if (!video) return;
    try {
      stopScan = await scan(video, (text) => {
        const c = codeFrom(text);
        if (!c) {
          scanError = "That isn't a sync code.";
          return false;
        }
        stopScan = null;
        take(c);
        return true;
      });
      if (view !== 'scan') endScan();
    } catch {
      scanError = "The camera couldn't be opened. Allow it for this site, or enter the code instead.";
    }
  }
  function endScan() {
    stopScan?.();
    stopScan = null;
  }
  /** A sync code in what a QR code holds: a pairing link, or the code alone. */
  function codeFrom(text: string): string | null {
    try {
      const c = codeInHash(new URL(text).hash);
      if (c) return c;
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
    if (made && !sync.met) withdrawOffer();
    onclose();
  }
  onDestroy(endScan);

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

<div class="backdrop" use:dialogBackdrop transition:fade={{ duration: 150 }} onclick={close} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="sync panel" bind:this={panel} transition:fly={calm({ y: 20, duration: 250 })} onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sync-title" tabindex="-1">
    <h3 id="sync-title">{title}</h3>

    <!-- The stage: the circle, and in its heart the code, the camera or the seal. -->
    <div class="stage">
      <div class="circle">
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
          <div class="heart sigil" class:quiet={view === 'type'} class:good={linked && view === 'joined'}><SyncSeal /></div>
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
        Your codex, Delve runs and achievements kept the same here and there. Only say yes to a code from a device of your own.
      {:else if view === 'scan'}
        {scanError || 'To show it, open the settings there and choose Pair a device.'}
      {:else if view === 'type'}
        {typeError || 'The code under the QR code on your other device.'}
      {:else if view === 'show' && !linked && sync.status !== 'offline'}
        {handheld ? 'Scan it from your other device, or enter its code there.' : "Scan it with your phone's camera. Playing from its home screen? Choose Pair a device in the settings there."}
      {:else}
        {statusLine}
      {/if}
    </p>

    <div class="actions">
      {#if view === 'offered'}
        <button class="btn ghost" onclick={close}>Not now</button>
        <button class="btn primary" onclick={() => take(offered!)}>Sync</button>
      {:else if view === 'type'}
        <button class="btn ghost" type="button" onclick={back}>Back</button>
        <button class="btn primary" type="submit" form="sync-typed" disabled={!typed.trim()}>Pair</button>
      {:else if view === 'scan'}
        <button class="btn ghost" onclick={show}>Show my code</button>
        <button class="btn ghost" onclick={startTyping}>Enter a code</button>
        <button class="btn ghost" onclick={close}>Close</button>
      {:else if view === 'joined'}
        <button class="btn primary" onclick={close}>Done</button>
      {:else}
        {#if handheld && scans}<button class="btn ghost" onclick={startScan}>Scan a code</button>{/if}
        <button class="btn ghost" onclick={startTyping}>Enter a code</button>
        <button class="btn primary" onclick={close}>Done</button>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Taller than a short window (a phone on its side), the dialog scrolls with its backdrop, its ornaments whole. */
  .backdrop {
    position: fixed;
    inset: 0;
    /* Below the effects layer, like the codex's own dialog. */
    z-index: 94;
    display: flex;
    padding: 1rem;
    overflow-y: auto;
  }
  .sync {
    width: min(440px, 100%);
    margin: auto;
    padding: 1.5rem 1.6rem 1.6rem;
    text-align: center;
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
  .sync h3 {
    margin: 0;
    color: var(--gold-hi);
    font-size: 1.25rem;
  }

  /* The stage, square: the circle reaches out to the panel's padding, its heart a little over half of it. */
  .stage {
    position: relative;
    width: min(330px, 100%, 46vh);
    aspect-ratio: 1;
    margin: 0.2rem auto 0;
  }
  .circle {
    position: absolute;
    inset: 0;
  }
  .heart {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 60%;
    height: 60%;
  }

  /* The code, engraved in ink on a gilded plate (dark on light, as every camera reads it), set in a fine gold frame. */
  .plate {
    padding: 0;
    border-radius: 7%;
    background:
      radial-gradient(120% 90% at 30% 20%, rgba(255, 246, 214, 0.55), transparent 60%),
      linear-gradient(145deg, #f0dca6, #dcbc78 50%, #c9a25a);
    box-shadow:
      0 0 0 1px #3a2a14,
      0 0 0 4px #120d07,
      0 0 0 5px var(--gold-lo),
      0 6px 18px rgba(0, 0, 0, 0.55);
    color: #2a1b0b;
  }
  .qr {
    display: block;
    width: 100%;
    height: 100%;
    fill: currentColor;
  }

  /* The camera, round in the heart, in the same frame as the plate. */
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
  .waiting {
    position: absolute;
    inset: 22%;
    color: var(--gold);
    opacity: 0.45;
    animation: waiting 2.4s ease-in-out infinite alternate;
    transition: opacity 0.4s;
  }
  .waiting.gone {
    opacity: 0;
    animation: none;
  }
  @keyframes waiting {
    to {
      opacity: 0.2;
    }
  }

  /* The seal, struck in gold in the hollow; faint while a code is typed, pale green once linked (the circle's own good). */
  .sigil {
    width: 46%;
    height: 46%;
    color: var(--gold-hi);
    transition: color 0.9s;
  }
  .sigil.quiet {
    color: var(--gold-lo);
  }
  .sigil.good {
    color: #e3e8b4;
  }

  /* Under the stage, one line's height in every view. */
  .under {
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
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    justify-content: center;
    margin-top: 1rem;
  }
</style>
