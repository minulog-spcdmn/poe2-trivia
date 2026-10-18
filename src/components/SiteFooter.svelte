<script lang="ts">
  // The start page's footer band (Home.svelte), which the end of a game
  // closes with too: who made it, a way to support it, the fine print and
  // the legal links, on one line on a wide window and stacked below.
  import { CREATOR, CREATOR_URL, DONATE_URL, IMPRINT_URL, PRIVACY_URL } from '../lib/site';
  import { openPrivacy } from '../lib/legalSheet.svelte';
  /** In a room: the legal pages open in a tab of their own, so the game stays (the privacy page over the game in an iPhone's home-screen app, lib/legalSheet.svelte.ts). */
  let { inRoom = false }: { inRoom?: boolean } = $props();
  const uid = $props.id();
  const away = $derived(inRoom ? { target: '_blank', rel: 'noopener' } : {});
</script>

<footer class="site-footer">
  <div class="rule" aria-hidden="true"></div>
  <div class="band">
    <div class="made">
      <p class="credit">Made by <a class="maker" href={CREATOR_URL} target="_blank" rel="noopener noreferrer" title="{CREATOR} on Twitch">{CREATOR}</a></p>
      <a class="support" href={DONATE_URL} target="_blank" rel="noopener noreferrer" aria-describedby="{uid}-support">
        <!-- Its box is the heart's own outline, so the heart itself sits centred beside the text. -->
        <svg viewBox="5 6 14 14" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
        Support the project
        <span class="tip" id="{uid}-support" role="tooltip">Optional tips help pay for the domain and development. Everything stays free.</span>
      </a>
    </div>
    <p class="fine">
      Unofficial fan project. Path of Exile is a trademark of Grinding Gear Games, who do not endorse this site. Data and art:
      <a href="https://poe2db.tw/us/Unique_item" target="_blank" rel="noreferrer">poe2db.tw</a>
    </p>
    <nav class="legal" aria-label="Legal">
      <a href={IMPRINT_URL} {...away}>Impressum</a>
      <span aria-hidden="true">·</span>
      <a href={PRIVACY_URL} {...away} onclick={inRoom ? openPrivacy : undefined}>Datenschutz</a>
    </nav>
  </div>
</footer>

<style>
  /* A plain hairline, brightest in the middle, fading out at both ends. */
  .rule {
    height: 1px;
    margin: 0 4%;
    background: linear-gradient(90deg, transparent, rgba(125, 99, 51, 0.35) 20%, rgba(201, 164, 92, 0.55) 50%, rgba(125, 99, 51, 0.35) 80%, transparent);
  }
  /* One line on the page's axis. No diamonds between the groups (the diamond
     means "you are here" and nothing else): space alone sets them apart,
     28 px between groups against 12 px inside one. */
  .band {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 12px 28px;
    margin-top: 22px;
  }
  .made {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  /* The footer's type is the display face, as drawn (handoff: Footer band). */
  .credit {
    margin: 0;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: 13px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #9b8e89;
  }
  .maker {
    font-size: 15px;
    letter-spacing: 0.04em;
    text-transform: none;
    color: var(--gold-hi);
    text-decoration: none;
    border-bottom: 1px dotted var(--gold-lo);
    transition:
      color 0.2s,
      border-color 0.2s;
  }
  .maker:hover {
    color: #fff1cf;
    border-bottom-color: var(--gold);
  }
  .support {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    height: 26px;
    padding: 0 11px;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-decoration: none;
    white-space: nowrap;
    color: #bcb0a6;
    background: rgba(0, 0, 0, 0.3);
    transition:
      color 0.2s,
      border-color 0.2s,
      background 0.2s;
  }
  .support:hover {
    color: #ffd7c2;
    border-color: #8c3a2c;
    background: rgba(140, 58, 44, 0.2);
  }
  .support svg {
    width: 7px;
    height: 7px;
    fill: #c0463c;
  }
  /* Its note as a tooltip, over the pill. */
  .tip {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 10px);
    width: 260px;
    translate: -50% 4px;
    padding: 0.55rem 0.8rem;
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 400;
    font-style: italic;
    letter-spacing: 0;
    text-transform: none;
    /* The pill keeps to one line; its note wraps inside its box. */
    white-space: normal;
    line-height: 1.35;
    color: var(--text);
    background: rgba(12, 10, 8, 0.96);
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 0.2s,
      translate 0.2s var(--ease-out),
      visibility 0s 0.2s;
  }
  .support:hover .tip {
    opacity: 1;
    visibility: visible;
    translate: -50% 0;
    transition:
      opacity 0.2s,
      translate 0.2s var(--ease-out);
  }
  .support:focus-visible .tip {
    opacity: 1;
    visibility: visible;
    translate: -50% 0;
  }
  .fine {
    margin: 0;
    text-align: center;
    font-size: 13px;
    line-height: 1.55;
    color: var(--muted);
  }
  .fine a,
  .legal a {
    color: inherit;
    text-decoration-color: var(--gold-lo);
    text-underline-offset: 3px;
  }
  /* As on the other pages: no underline, the footer's muted colour. */
  .legal a {
    text-decoration: none;
  }
  .legal {
    display: flex;
    gap: 0.4rem;
    font-size: 13px;
    color: var(--muted);
  }
  .fine a:hover,
  .legal a:hover {
    color: var(--gold-hi);
  }

  /* Too narrow for one line: the groups stacked. */
  @media (max-width: 1080px) {
    .band {
      flex-direction: column;
      gap: 14px;
    }
  }
  @media (max-width: 640px) {
    .made {
      flex-direction: column;
      gap: 14px;
    }
  }
  @media (pointer: coarse) {
    .support {
      height: 44px;
    }
  }
</style>
