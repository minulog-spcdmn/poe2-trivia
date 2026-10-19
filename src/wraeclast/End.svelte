<script lang="ts">
  // The run's end, slim: won or lost, where, the run in numbers, Copy run
  // log (every run kept, as JSON, for the owner) and New run, docked at the
  // foot on phones.
  import type { Run, RunLog } from './rules';
  import { REGION } from './map';
  import { logText } from './runLog';
  import { play } from './play.svelte';

  /** The runs kept and New run are the page's (play.svelte.ts) unless given (the QA desk's bench gives its own). */
  let { run, runs, onnew }: { run: Run; runs?: RunLog[]; onnew?: () => void } = $props();
  const kept = $derived(runs ?? play.runs);
  const s = $derived(run.state);
  const log = $derived(s.log);
  const won = $derived(log.result === 'win');
  const named = $derived(log.items.filter((it) => it.submits.at(-1)?.right).length);
  const minutes = $derived(Math.max(1, Math.round(log.ms / 60000)));
  const zones = $derived(log.items.filter((it) => !it.duel && it.submits.at(-1)?.right).length);
  const where = $derived(REGION.byId.get(log.endedOn?.node ?? s.at)?.name ?? '');

  // ---- The run log ----
  const text = $derived(logText(kept));
  let copied = $state<'yes' | 'no' | null>(null);
  let box = $state<HTMLTextAreaElement>();
  let showLog = $state(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      copied = 'yes';
    } catch {
      // No clipboard here (an old browser, a page not in focus): the log shown, selected, to copy by hand.
      copied = 'no';
      showLog = true;
      queueMicrotask(() => {
        box?.focus();
        box?.select();
      });
    }
  }
</script>

<div class="end">
  <header class="screen-title">
    <p class="kicker">{won ? 'The Seed of Corruption falls' : `Fell at ${where}`}</p>
    <h1 class:lost={!won}>{won ? 'The run is won' : 'The run is lost'}</h1>
    <p class="sub">
      {#if won}<span class="n">{log.lifeEnd}</span> life left.{:else}<span class="it">{log.endedOn?.name ?? 'The road'}</span> took the last of your life.{/if}
    </p>
  </header>

  <dl class="facts" aria-label="The run in numbers">
    <div><dt>Zones</dt><dd>{zones}</dd></div>
    <div><dt>Named</dt><dd>{named}</dd></div>
    <div><dt>Misses</dt><dd>{log.misses}</dd></div>
    <div><dt>Spread</dt><dd>{log.spread}</dd></div>
    <div><dt>The Seed</dt><dd>{log.seedEnd.life}<small>life</small></dd></div>
    <div><dt>Time</dt><dd>{minutes}<small>min</small></dd></div>
    <div><dt>Gold</dt><dd>{log.goldEarned}<small>earned</small></dd></div>
    <div><dt>Spent</dt><dd>{log.goldSpent}</dd></div>
    <div><dt>Life</dt><dd>{log.lifeEnd}</dd></div>
  </dl>

  {#if copied === 'yes'}<p class="note" role="status">Copied: the last <span class="n">{kept.length}</span> {kept.length === 1 ? 'run' : 'runs'}, to paste to the owner.</p>{/if}

  {#if showLog}
    <section aria-labelledby="log-h">
      <h2 id="log-h">Run log</h2>
      <p class="note">{copied === 'no' ? "It couldn't be copied here: select it all and copy it by hand." : 'Every run kept on this device, newest last.'}</p>
      <textarea bind:this={box} readonly rows="8" value={text}></textarea>
    </section>
  {/if}

  <div class="go dock">
    <button class="btn" onclick={copy}>Copy run log</button>
    <button class="btn primary" onclick={() => (onnew ? onnew() : play.start())}>New run</button>
  </div>
</div>

<style>
  .end {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 44rem;
    margin: 0 auto;
  }
  p {
    margin: 0;
  }
  h1.lost {
    color: #f0b3a0;
  }
  .end .screen-title .sub {
    font-style: normal;
    font-size: 17px;
    line-height: 1.3;
    color: #e6dccb;
  }
  .sub .it {
    color: var(--unique-hi);
    font-weight: 600;
  }
  /* The run in numbers: a label in small capitals over a Cinzel value. */
  .facts {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px 10px;
  }
  .facts > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 4px 7px;
    border-bottom: 1px solid rgba(125, 99, 51, 0.22);
  }
  .facts dt {
    font-family: var(--font-cinzel);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  .facts dd {
    margin: 0;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 20px;
    line-height: 1.1;
    color: var(--gold-hi);
    white-space: nowrap;
  }
  .facts dd small {
    margin-left: 3px;
    font-size: 11px;
    color: var(--muted);
  }
  .note {
    margin: 0.3rem 0 0.5rem;
    font-size: 0.92rem;
    text-align: center;
    color: var(--muted);
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.8rem;
    color: var(--text);
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.5rem;
    user-select: text;
    cursor: text;
  }
</style>
