<script lang="ts">
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { session } from '../lib/session.svelte';
  import { playerColor } from '../lib/ui';
  import { DELVE_LIVES, inventoryOf, isGroupRun, livesOf, questionTimer, type ItemKind } from '../lib/delve';
  import { accentAt } from '../lib/descent';
  import { zoneAt } from '../lib/zoneSigils';
  import { fxAvailable, fxUserOn, onFxChange, setFxOn } from '../lib/fx/core';
  import { isMuted, setMuted } from '../lib/sound';
  import { readStored, writeStored } from '../lib/storage';
  import { reduceMotion, setReduceMotion } from './motion';
  import * as L from './controls.svelte';

  const s = $derived(session.state);
  const run = $derived(s?.delve ? s : null);
  const depth = $derived(run?.round ?? 1);
  const players = $derived(run?.players ?? []);
  const group = $derived(!!run && isGroupRun(run));
  // Alone the player on turn; together whom the lab acts for.
  const active = $derived(run ? (group ? run.players.find((p) => p.id === L.lab.actor) : run.players[run.turn]) : undefined);
  const viewer = $derived(group ? session.myPlayerId : null);
  /** Co-op: what a player has done about the cards or the question in play. */
  function doing(id: string): string {
    if (!run || !group) return '';
    if (livesOf(run, id) === 0) return 'perished';
    if (run.phase === 'choosing') {
      const v = run.delve?.votes?.[id];
      return v ? `voted ${v}` : 'not voted';
    }
    if (run.phase === 'question' && q) return q.struck?.some((x) => x.by === id) ? 'struck' : 'answering';
    if (run.phase === 'reveal') return run.reveal?.winnerId === id ? 'cleared it' : '';
    return '';
  }
  const q = $derived(s?.phase === 'question' || s?.phase === 'reveal' ? s.question : null);
  const busy = $derived(L.lab.busy);

  // ---- the panel: docked on the right on wide screens, a drawer on phones ----
  const wide = new MediaQuery('(min-width: 900px)');
  let open = $state(readStored('labOpen') !== '0');
  $effect(() => {
    writeStored('labOpen', open ? '1' : '0');
  });
  const PANEL = 360;
  $effect(() => {
    const w = wide.current ? (open ? PANEL : 44) : 0;
    document.documentElement.style.setProperty('--lab-w', `${w}px`);
  });

  // ---- live readouts ----
  let now = $state(Date.now());
  onMount(() => {
    L.boot();
    const id = setInterval(() => (now = Date.now()), 100);
    const off = onFxChange((on) => (fxOn = on));
    return () => {
      clearInterval(id);
      off();
    };
  });
  const left = $derived.by(() => {
    void now;
    void s;
    return L.timeLeft();
  });
  const span = $derived(run && q ? questionTimer(run) * 1000 + (q.flared ? 5000 : 0) + (q.blasted ? 1000 : 0) : 0);
  const paused = $derived(!!q && L.lab.paused?.askedAt === q.askedAt);
  const secs = (ms: number | null) => (ms === null ? '•' : (Math.max(0, ms) / 1000).toFixed(1));

  // ---- toggles ----
  let fxOn = $state(fxUserOn());
  // The effects layer may only be ready a moment after the panel.
  const fxCan = $derived.by(() => {
    void now;
    return fxAvailable();
  });
  let muted = $state(isMuted());
  function toggleSound() {
    // The header's own button, so its icon follows.
    const btn = document.querySelector<HTMLButtonElement>('header [aria-label="Toggle sound"]');
    if (btn) btn.click();
    else setMuted(!isMuted());
    muted = isMuted();
  }

  // ---- zones ----
  const ZONES = Array.from({ length: 15 }, (_, k) => 10 * k + 1);

  const ITEMS: { item: ItemKind; label: string }[] = [
    { item: 'wards', label: 'Wards' },
    { item: 'shards', label: 'Shard' },
    { item: 'flares', label: 'Flares' },
    { item: 'dynamite', label: 'Dynamite' },
  ];

  const FINDS = [
    { v: 'none', label: 'None' },
    { v: 'azurite', label: 'Azurite Vein' },
    { v: 'flare', label: 'Flare Cache' },
    { v: 'dynamite', label: 'Dynamite Cache' },
  ] as const;

  const phaseName = $derived(
    !s ? 'No game' : s.phase === 'choosing' ? 'Choosing' : s.phase === 'question' ? 'Question' : s.phase === 'reveal' ? 'Reveal' : s.phase === 'over' ? 'End' : 'Lobby',
  );

  function onDepth(e: Event) {
    L.setDepth((e.currentTarget as HTMLInputElement).valueAsNumber);
  }
  function onLeft(e: Event) {
    L.setTimeLeft((e.currentTarget as HTMLInputElement).valueAsNumber);
  }
  const did = (ok: boolean, what: string) => !ok && L.note(what);
</script>

{#snippet seg(values: number[], current: number, set: (v: number) => void, label: string)}
  <div class="seg" role="group" aria-label={label}>
    {#each values as v (v)}
      <button class:on={v === current} onclick={() => set(v)} disabled={!!busy}>{v}</button>
    {/each}
  </div>
{/snippet}

{#if !wide.current && !open}
  <button class="fab" onclick={() => (open = true)} aria-label="Open the lab">Lab</button>
{/if}

<aside class="lab" class:wide={wide.current} class:open class:shut={wide.current && !open} aria-label="Effects lab">
  {#if wide.current && !open}
    <button class="tab" onclick={() => (open = true)} aria-label="Open the lab"><span>Lab</span></button>
  {:else}
    <header>
      <div class="title">
        <b>Lab</b>
        <span class="status">
          {phaseName} • Depth <i class="num" style:color={accentAt(depth)}>{depth}</i> • {zoneAt(depth)}
          {#if q && s?.phase === 'question'}• <i class="num">{secs(left)}</i> s{#if paused}{' '}(paused){/if}{/if}
        </span>
      </div>
      <button class="close" onclick={() => (open = false)} aria-label="Close the lab">{wide.current ? '›' : '×'}</button>
    </header>
    {#if busy}<p class="busy">{busy}…</p>{/if}

    <div class="body">
      <details open>
        <summary>Players</summary>
        <div class="line">
          <span class="lbl">Players</span>
          {@render seg([1, 2, 3, 4], players.length, (n) => L.setPlayers(n), 'Players')}
          <button class="small" onclick={() => L.newRun(players.length || 1, depth)} disabled={!!busy}>New run</button>
        </div>
        {#if group}
          <div class="line">
            <span class="lbl">Screen</span>
            <div class="seg" role="group" aria-label="Whose screen this is">
              {#each players as p (p.id)}
                <button class:on={p.id === viewer} onclick={() => L.setViewer(p.id)} disabled={!!busy} style:--dot={playerColor(p.hue)}>{p.name}</button>
              {/each}
            </div>
          </div>
          <div class="line">
            <span class="lbl">Acts</span>
            <div class="seg" role="group" aria-label="Whom the lab acts for">
              {#each players as p (p.id)}
                <button class:on={p.id === active?.id} onclick={() => L.setActor(p.id)} disabled={!!busy} style:--dot={playerColor(p.hue)}>{p.name}</button>
              {/each}
            </div>
          </div>
        {/if}
        {#each players as p (p.id)}
          {@const inv = run ? inventoryOf(run, p.id) : null}
          <div class="player" class:turn={p.id === active?.id}>
            <div class="pname">
              <span class="dot" style:background={playerColor(p.hue)}></span>{p.name}{#if p.id === viewer}<em class="tag">screen</em>{/if}{#if doing(p.id)}<em class="tag">{doing(p.id)}</em>{/if}
            </div>
            <div class="line">
              <span class="lbl">Lives</span>
              {@render seg([0, 1, 2, 3].slice(0, DELVE_LIVES + 1), run ? livesOf(run, p.id) : 0, (n) => L.setLives(p.id, n), 'Lives')}
            </div>
            <div class="items">
              {#each ITEMS as it (it.item)}
                <div class="stepper">
                  <span>{it.label}</span>
                  <button onclick={() => L.setItem(p.id, it.item, (inv?.[it.item] ?? 0) - 1)} disabled={!!busy || !inv?.[it.item]} aria-label="Fewer {it.label}">−</button>
                  <i class="num">{inv?.[it.item] ?? 0}</i>
                  <button onclick={() => L.setItem(p.id, it.item, (inv?.[it.item] ?? 0) + 1)} disabled={!!busy || (inv?.[it.item] ?? 0) >= L.CAPS[it.item]} aria-label="More {it.label}">+</button>
                </div>
              {/each}
            </div>
          </div>
        {/each}
        <p class="hint">
          Changes here are set quietly: the run takes a new id, so nothing plays for them. Events below play.{#if group}{' '}Two players or more delve together: the screen is one of them (its own taps vote and answer for them), and the events act for the one chosen under Acts.{/if}
        </p>
      </details>

      <details open>
        <summary>Depth</summary>
        <div class="line">
          <button class="small" onclick={() => L.setDepth(depth - 1)} disabled={!!busy || depth <= 1} aria-label="One depth up">−</button>
          <input type="range" min="1" max={L.MAX_DEPTH} value={depth} onchange={onDepth} aria-label="Depth" style:--fill="{((depth - 1) / (L.MAX_DEPTH - 1)) * 100}%" />
          <button class="small" onclick={() => L.setDepth(depth + 1)} disabled={!!busy || depth >= L.MAX_DEPTH} aria-label="One depth down">+</button>
          <i class="num big">{depth}</i>
        </div>
        <div class="chips">
          {#each ZONES as z (z)}
            <button class="chip" class:on={depth >= z && depth < z + 10} onclick={() => L.setDepth(z)} disabled={!!busy} style:--accent={accentAt(z)} title="Depth {z}">
              <i class="num">{z}</i>
              {zoneAt(z).replace(/^The /, '')}
            </button>
          {/each}
        </div>
        <div class="grid">
          <button onclick={() => L.zoneEnter()} disabled={!!busy}>Replay zone mark</button>
          <button onclick={L.nextZone} disabled={!!busy}>Enter next zone</button>
          <button onclick={() => did(L.plunge(), 'This build has no plunge yet.')}>Plunge</button>
          <button onclick={L.descend} disabled={!!busy}>Descend (right, Next)</button>
        </div>
      </details>

      <details open>
        <summary>Phase</summary>
        <div class="line">
          <span class="lbl">Find card</span>
          <select bind:value={L.opts.cardFind} aria-label="Find among the cards">
            {#each FINDS as f (f.v)}<option value={f.v}>{f.label}</option>{/each}
          </select>
          <button class="small" onclick={L.dealCards} disabled={!!busy}>Deal cards</button>
        </div>
        <div class="line">
          <span class="lbl">Second find</span>
          <select bind:value={L.opts.cardFind2} aria-label="A second find among the cards">
            {#each FINDS as f (f.v)}<option value={f.v} disabled={f.v !== 'none' && f.v === L.opts.cardFind}>{f.label}</option>{/each}
          </select>
        </div>
        <div class="opts">
          <label
            >Question
            <select bind:value={L.opts.mode}>
              <option value="any">By the rules</option>
              <option value="name">Name the item</option>
              <option value="art">Find the art</option>
            </select>
          </label>
          <label
            >Find
            <select bind:value={L.opts.questionFind}>
              {#each FINDS as f (f.v)}<option value={f.v}>{f.label}</option>{/each}
            </select>
          </label>
          <label
            >Mirrored
            <select bind:value={L.opts.mirrored}>
              <option value="rules">By the rules</option>
              <option value="on">All</option>
              <option value="off">None</option>
            </select>
          </label>
          <label
            >Unveil
            <select bind:value={L.opts.veil}>
              <option value="rules">By the rules</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label
            >Grayscale
            <select value={L.opts.grayscale} onchange={(e) => L.setGrayscale((e.currentTarget as HTMLSelectElement).value as typeof L.opts.grayscale)}>
              <option value="rules">By the rules</option>
              <option value="off">Off</option>
              <option value="art">Find the art</option>
              <option value="all">All art</option>
            </select>
          </label>
        </div>
        <div class="grid">
          <button onclick={() => L.ask()} disabled={!!busy}>Ask question</button>
          <button onclick={L.answerRight} disabled={!!busy}>Reveal: right</button>
          <button onclick={L.answerWrong} disabled={!!busy}>Reveal: wrong</button>
          <button onclick={L.next} disabled={!!busy || s?.phase !== 'reveal'}>Next</button>
        </div>
        <p class="hint">Grayscale applies to every question while set, your own picks too; the rest to the questions the lab asks.</p>
        <div class="grid">
          <button onclick={() => L.endSolo(false)} disabled={!!busy}>End: perished</button>
          <button onclick={() => L.endSolo(true)} disabled={!!busy}>End: deeper than ever</button>
          <button onclick={L.endGroup} disabled={!!busy}>End: together</button>
          <button onclick={L.backToRun} disabled={!!busy || s?.phase !== 'over'}>Back to a run</button>
        </div>
      </details>

      <details open>
        <summary>Events</summary>
        <div class="grid">
          <button onclick={L.answerRight} disabled={!!busy}>Answer right</button>
          <button onclick={L.answerWrong} disabled={!!busy}>Answer wrong</button>
          <button onclick={L.timeOut} disabled={!!busy}>Time out</button>
          <button onclick={L.lastLife} disabled={!!busy}>Last life, perish</button>
          <button onclick={L.wardBreaks} disabled={!!busy}>Ward takes a loss</button>
          <button onclick={L.caveIn} disabled={!!busy}>Vein cave-in</button>
          <button onclick={L.flare} disabled={!!busy}>Flare at 0</button>
          <button onclick={L.dynamite} disabled={!!busy}>Dynamite at half</button>
          <button onclick={L.deeperThanEver} disabled={!!busy}>Deeper than ever</button>
        </div>
        {#if group}
          <span class="sub">Together, as {active?.name ?? 'the actor'}</span>
          <div class="grid four">
            {#each [0, 1, 2] as i (i)}
              <button onclick={() => L.voteFor(i)} disabled={!!busy} title={s?.phase === 'choosing' ? s.offered[i] : undefined}>Vote {i + 1}</button>
            {/each}
            <button onclick={L.othersVote} disabled={!!busy}>Others vote</button>
          </div>
          <div class="grid">
            <button onclick={L.reviveTeammate} disabled={!!busy}>Give a life</button>
            <button onclick={L.lastLife} disabled={!!busy}>Perish</button>
            <button onclick={L.othersPerish} disabled={!!busy}>Others perish</button>
            <button onclick={L.timeOut} disabled={!!busy}>Time out (team)</button>
          </div>
        {/if}
        <span class="sub">Gain at once</span>
        <div class="grid four">
          <button onclick={() => L.gain('wards')} disabled={!!busy}>Ward</button>
          <button onclick={() => L.gain('shards')} disabled={!!busy}>Shard</button>
          <button onclick={() => L.gain('flares')} disabled={!!busy}>Flare</button>
          <button onclick={() => L.gain('dynamite')} disabled={!!busy}>Dynamite</button>
        </div>
        <span class="sub">Find answered right</span>
        <div class="grid">
          <button onclick={() => L.findRight('azurite')} disabled={!!busy}>Vein, fast: ward</button>
          <button onclick={() => L.findRight('azurite', true)} disabled={!!busy}>Vein, slow: shard</button>
          <button onclick={() => L.findRight('flare')} disabled={!!busy}>Flare Cache</button>
          <button onclick={() => L.findRight('dynamite')} disabled={!!busy}>Dynamite Cache</button>
        </div>
      </details>

      <details open>
        <summary>Clock</summary>
        {#if q && s?.phase === 'question' && left !== null}
          <div class="line">
            <button class="small" onclick={() => (paused ? L.resume() : L.pause())}>{paused ? 'Resume' : 'Pause'}</button>
            <input type="range" min="0" max={span} step="100" value={left} onchange={onLeft} aria-label="Time left" style:--fill="{span ? (left / span) * 100 : 0}%" />
            <i class="num big">{secs(left)}</i>
          </div>
          <div class="grid">
            <button onclick={() => L.toHalf(1500)}>Half time in 1.5 s</button>
            <button onclick={() => L.setTimeLeft(1000)}>1 s left</button>
            <button onclick={() => L.setTimeLeft(span)}>Full clock</button>
            <button onclick={() => L.setTimeLeft(3000)}>3 s left</button>
          </div>
        {:else}
          <p class="hint">{q && s?.phase === 'question' ? 'Waiting for the art; the clock starts once it is in.' : 'No question on the clock.'}</p>
        {/if}
        <p class="hint">The game runs on the wall clock, so there is no slow motion; pause and jump instead. While paused, answers still count (a Vein's as fast).</p>
      </details>

      <details open>
        <summary>Settings</summary>
        <div class="toggles">
          <label class:off={!fxCan}><input type="checkbox" checked={fxOn} disabled={!fxCan} onchange={() => setFxOn(!fxUserOn())} /> Effects</label>
          <label><input type="checkbox" checked={reduceMotion} onchange={() => setReduceMotion(!reduceMotion)} /> Reduced motion</label>
          <label><input type="checkbox" checked={!muted} onchange={toggleSound} /> Sound</label>
        </div>
        <p class="hint">Reduced motion reloads the page (the game reads it as it loads). The lab keeps its own saves, settings, codex and records, apart from the game's.</p>
        <div class="grid">
          <button onclick={L.clearRecords}>Clear lab records</button>
        </div>
      </details>

      {#if L.lab.log.length}
        <ul class="log">
          {#each L.lab.log as entry (entry.at + entry.text)}<li>{entry.text}</li>{/each}
        </ul>
      {/if}
    </div>
  {/if}
</aside>

<style>
  /* Wide screens: the game keeps the space left of the panel. */
  :global(#app) {
    margin-right: var(--lab-w, 0px);
  }
  :global(html[data-lab] .toasts) {
    right: calc(var(--lab-w, 0px) + 22px);
  }

  .lab {
    --panel-bg: rgba(12, 10, 8, 0.94);
    position: fixed;
    z-index: 200;
    display: flex;
    flex-direction: column;
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.3;
    color: var(--text);
    background: var(--panel-bg);
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.6);
  }
  .lab.wide {
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    border-left: 1px solid var(--gold-lo);
  }
  .lab.wide.shut {
    width: 44px;
  }
  .lab:not(.wide) {
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 62dvh;
    border-top: 1px solid var(--gold-lo);
    border-radius: 10px 10px 0 0;
  }
  .lab:not(.wide):not(.open) {
    display: none;
  }

  .fab {
    position: fixed;
    z-index: 200;
    left: 12px;
    bottom: calc(var(--dock, 0px) + 12px);
    padding: 0.45rem 0.9rem;
    border: 1px solid var(--gold-lo);
    border-radius: 999px;
    background: var(--panel-bg, rgba(12, 10, 8, 0.94));
    color: var(--gold-hi);
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(0, 0, 0, 0.6);
  }

  .tab {
    flex: 1;
    border: 0;
    background: none;
    color: var(--gold-hi);
    cursor: pointer;
  }
  .tab span {
    display: inline-block;
    writing-mode: vertical-rl;
    font-family: var(--font-cinzel);
    letter-spacing: 0.3em;
    text-transform: uppercase;
  }
  .tab:hover {
    background: rgba(201, 164, 92, 0.08);
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title b {
    font-family: var(--font-cinzel);
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold-hi);
    font-size: 0.85rem;
  }
  .status {
    font-size: 0.82rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .close {
    width: 30px;
    height: 30px;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: none;
    color: var(--gold);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }
  .close:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .busy {
    margin: 0;
    padding: 0.3rem 0.75rem;
    font-style: italic;
    color: var(--gold-hi);
    background: rgba(201, 164, 92, 0.08);
  }

  .body {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 0.75rem 1rem;
  }
  details {
    border-bottom: 1px solid rgba(59, 48, 36, 0.6);
    padding: 0.35rem 0 0.6rem;
  }
  summary {
    cursor: pointer;
    padding: 0.3rem 0;
    font-family: var(--font-display);
    font-size: 0.78rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--gold);
  }
  summary:hover {
    color: var(--gold-hi);
  }

  .num {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
  }
  .num.big {
    min-width: 2.6em;
    text-align: right;
    color: var(--gold-hi);
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.35rem 0;
    flex-wrap: wrap;
  }
  .line input[type='range'] {
    flex: 1;
    min-width: 0;
  }
  .lbl {
    min-width: 4.2em;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .sub {
    display: block;
    margin: 0.5rem 0 0.1rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .hint {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--muted);
  }

  button {
    font: inherit;
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }
  .seg button {
    min-width: 2em;
    padding: 0.2rem 0.5rem;
    border: 0;
    border-right: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.3);
    color: var(--text);
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .seg button:last-child {
    border-right: 0;
  }
  .seg button[style*='--dot'] {
    box-shadow: inset 0 -2px 0 var(--dot);
  }
  .seg button.on {
    background: rgba(201, 164, 92, 0.25);
    color: var(--gold-hi);
  }
  .seg button:hover:not(:disabled) {
    background: rgba(201, 164, 92, 0.15);
  }

  .small,
  .grid button,
  .chip,
  .stepper button {
    border: 1px solid var(--line);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.35);
    color: var(--text);
    cursor: pointer;
    transition:
      border-color 0.15s,
      color 0.15s,
      background 0.15s;
  }
  .small {
    padding: 0.2rem 0.55rem;
    font-size: 0.85rem;
  }
  .small:hover:not(:disabled),
  .grid button:hover:not(:disabled),
  .chip:hover:not(:disabled),
  .stepper button:hover:not(:disabled) {
    border-color: var(--gold-lo);
    color: var(--gold-hi);
    background: rgba(201, 164, 92, 0.1);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem;
    margin: 0.4rem 0;
  }
  .grid.four {
    grid-template-columns: repeat(4, 1fr);
  }
  .grid button {
    padding: 0.35rem 0.4rem;
    font-size: 0.86rem;
    text-align: center;
  }

  .player {
    margin: 0.4rem 0;
    padding: 0.35rem 0.5rem;
    border: 1px solid rgba(59, 48, 36, 0.7);
    border-radius: 5px;
  }
  .player.turn {
    border-color: var(--gold-lo);
    background: rgba(201, 164, 92, 0.05);
  }
  .pname {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-display);
    font-size: 0.85rem;
    color: var(--gold-hi);
  }
  .pname .tag {
    font-family: var(--font-body);
    font-style: normal;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .pname .tag:first-of-type {
    margin-left: auto;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .items {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem 0.6rem;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.85rem;
  }
  .stepper span {
    flex: 1;
    color: var(--muted);
  }
  .stepper button {
    width: 1.6em;
    height: 1.6em;
    padding: 0;
    line-height: 1;
  }
  .stepper i {
    min-width: 1em;
    text-align: center;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0.35rem 0;
  }
  .chip {
    padding: 0.15rem 0.4rem;
    font-size: 0.78rem;
    border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  }
  .chip .num {
    color: var(--accent);
    margin-right: 0.15em;
  }
  .chip.on {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--gold-hi);
  }

  .opts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem 0.5rem;
    margin: 0.4rem 0;
  }
  .opts label {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  select {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.15rem 0.3rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #15110d;
    color: var(--text);
  }

  input[type='range'] {
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--gold) var(--fill), var(--line) var(--fill));
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--gold-hi);
    box-shadow: 0 0 8px rgba(241, 217, 155, 0.6);
  }
  input[type='range']::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 0;
    border-radius: 50%;
    background: var(--gold-hi);
  }

  .toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin: 0.4rem 0;
  }
  .toggles label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
  }
  .toggles label.off {
    opacity: 0.5;
  }
  input[type='checkbox'] {
    accent-color: var(--gold);
  }

  .log {
    margin: 0.6rem 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .log li {
    padding: 0.1rem 0;
  }
  .log li:first-child {
    color: var(--gold-hi);
  }
</style>
