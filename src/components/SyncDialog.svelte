<script lang="ts">
  // Pairing the player's devices (lib/sync): opened from the settings (Sync,
  // under You), or by a pairing link another device's QR code brought this
  // one to (`offered`, from App). Four views in one frame:
  // - show: this device's code as a QR code and in letters, and how the
  //   link stands; a code made here is only kept once another device comes
  //   (closed before then, it is let go);
  // - scan: the camera, reading another device's QR code (an iPhone's home
  //   screen game has storage of its own, so it scans from here);
  // - type: the code typed in;
  // - offered: a pairing link's code, taken only once the player says yes
  //   (a link can come from anyone).
  import { onDestroy, tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { dialogBackdrop } from '../lib/behindDialog';
  import { calm } from '../lib/motion.svelte';
  import { codeInHash, codeLink, readCode, shownCode } from '../lib/sync/code';
  import { offerCode, sync, useCode, withdrawOffer } from '../lib/sync/link.svelte';
  import { qrShape } from '../lib/sync/qr';
  import { canScan, scan } from '../lib/sync/scan';

  type View = 'show' | 'scan' | 'type' | 'offered';
  let {
    offered = null,
    start = 'show',
    onclose,
  }: {
    offered?: string | null;
    /** The view it opens in, a link's code aside (the QA desk's bench opens it in each). */
    start?: Exclude<View, 'offered'>;
    onclose: () => void;
  } = $props();

  // (Read once: a link's code is the dialog's reason to open.)
  // svelte-ignore state_referenced_locally
  const first: View = offered ? 'offered' : start;
  let view = $state<View>(first);
  /** The code shown: the one paired with, or one made for this dialog. */
  let code = $state<string | null>(null);
  /** The code shown was made here, and goes if no device comes before the dialog closes. */
  let made = false;
  function show() {
    const was = sync.code;
    code = offerCode();
    made ||= was === null;
    view = 'show';
  }
  if (first === 'show') show();
  else if (first === 'scan') void startScan();

  /** Pairs with a code from elsewhere (scanned, typed, a link), and shows how the link stands. */
  function take(c: string) {
    made = false;
    useCode(c);
    code = c;
    view = 'show';
  }

  const qr = $derived(code ? qrShape(codeLink(code, location.href)) : null);

  /** On a phone the next step is to read the other device's code; at a computer, to show this one's. */
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  const linkedLine = $derived(sync.linked > 1 ? `Synced with ${sync.linked} other devices.` : 'Synced with your other device.');
  const statusLine = $derived(
    sync.status === 'linked'
      ? linkedLine
      : sync.status === 'offline'
        ? "Can't reach the matchmaking server. Trying again in a moment."
        : sync.status === 'waiting'
          ? 'Waiting for your other device.'
          : 'Connecting.',
  );

  // ---- scanning ----

  let video = $state<HTMLVideoElement>();
  let stopScan: (() => void) | null = null;
  let scanError = $state('');
  async function startScan() {
    view = 'scan';
    scanError = '';
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
  function submitTyped(e: Event) {
    e.preventDefault();
    const c = readCode(typed);
    if (!c) {
      typeError = "That isn't a sync code: it has sixteen letters and digits.";
      return;
    }
    take(c);
  }

  function back() {
    endScan();
    show();
  }

  function close() {
    endScan();
    if (made && !sync.met) withdrawOffer();
    onclose();
  }
  onDestroy(endScan);
</script>

<div class="backdrop" use:dialogBackdrop transition:fade={{ duration: 150 }} onclick={close} onkeydown={(e) => e.key === 'Escape' && close()} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="sync panel" transition:fly={calm({ y: 20, duration: 250 })} onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sync-title" tabindex="-1">
    {#if view === 'offered' && offered}
      <h3 id="sync-title">Sync this device?</h3>
      <p class="muted">
        Your codex, your Delve runs and your achievements will be kept the same here and on the device that showed you the code. Only say yes to a code from a device of your own.
      </p>
      <div class="actions">
        <button class="btn ghost" onclick={close}>Not now</button>
        <button class="btn primary" onclick={() => take(offered!)}>Sync</button>
      </div>
    {:else if view === 'scan'}
      <h3 id="sync-title">Scan a code</h3>
      <div class="frame camera">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={video} playsinline muted></video>
      </div>
      <p class="line" class:bad={!!scanError} aria-live="polite">{scanError || 'Point the camera at the code on your other device.'}</p>
      <div class="actions">
        <button class="btn ghost" onclick={back}>Back</button>
      </div>
    {:else if view === 'type'}
      <h3 id="sync-title">Enter a code</h3>
      <form class="typed" onsubmit={submitTyped}>
        <input
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
        <p class="line" class:bad={!!typeError} aria-live="polite">{typeError || 'The code under the QR code on your other device.'}</p>
        <div class="actions">
          <button class="btn ghost" type="button" onclick={back}>Back</button>
          <button class="btn primary" type="submit" disabled={!typed.trim()}>Pair</button>
        </div>
      </form>
    {:else if code && qr}
      <h3 id="sync-title">Sync your devices</h3>
      <div class="frame">
        <svg class="qr" viewBox="0 0 {qr.size} {qr.size}" shape-rendering="crispEdges" role="img" aria-label="QR code of this device's sync link">
          <rect width={qr.size} height={qr.size} fill="#e9dfc9" />
          <path d={qr.path} fill="#15100a" />
        </svg>
      </div>
      <p class="code" aria-label="Sync code">{shownCode(code)}</p>
      <p class="muted how">Point your other device's camera at it. Playing from your phone's home screen? Choose Scan a code in its settings, under Sync.</p>
      <p class="line" class:good={sync.status === 'linked'} class:bad={sync.status === 'offline'} aria-live="polite">{statusLine}</p>
      <div class="actions">
        {#if canScan()}<button class="btn {touch ? 'primary' : 'ghost'}" onclick={startScan}>Scan a code</button>{/if}
        <button class="btn ghost" onclick={() => ((view = 'type'), (typeError = ''))}>Enter a code</button>
        <button class="btn {touch && canScan() ? 'ghost' : 'primary'}" onclick={close}>Done</button>
      </div>
    {/if}
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
    padding: 1.6rem;
    text-align: center;
  }
  .sync h3 {
    margin: 0 0 1rem;
    color: var(--gold-hi);
    font-size: 1.2rem;
  }
  .muted {
    margin: 0;
    color: var(--muted);
  }
  /* The code, or the camera, in a square set in gold: the same size in both, so nothing jumps between them. */
  .frame {
    width: min(220px, 62vw, 40vh);
    aspect-ratio: 1;
    margin: 0 auto;
    padding: 6px;
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.35);
    box-shadow: inset 0 0 0 1px rgba(241, 217, 155, 0.12);
  }
  .qr {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 2px;
  }
  .camera video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 2px;
    background: #050403;
  }
  .code {
    margin: 0.9rem 0 0.5rem;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 1.05rem;
    letter-spacing: 0.08em;
    color: var(--gold-hi);
    user-select: all;
  }
  .how {
    font-size: 0.95rem;
  }
  /* How it stands, or what went wrong: one line kept for it (two on a phone), so nothing below it moves. */
  .line {
    min-height: 2.6em;
    margin: 0.6rem 0 0;
    font-style: italic;
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
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .code-field::placeholder {
    text-transform: none;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 1rem;
  }
</style>
