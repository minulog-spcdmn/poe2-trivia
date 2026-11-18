<script lang="ts">
  // The zone sigils' rating's view (./zonesigils.ts): one trial at a time,
  // the zone's name over its two candidates, each as large as a seal shows
  // well (the title card's seal, ZoneSeal, held still, 200 px across) and
  // then as the game draws a zone's sigil: the title card's seal on a
  // desktop, a phone upright and a phone on its side; the end of a run's
  // find (GameOver's zone icon) and a lost life's square (its blank thumb,
  // as wide as a desktop and a phone show it, and as narrow as the
  // smallest board does); the runs chart's seal (RunsChart); the rules
  // page's pit (DelveLadder, its seal as large and as small as its layout
  // makes it). A click on a side picks it, as do the Left and Right arrows;
  // Down, or the link between them, says they are about the same; the link
  // under a side, or Shift with its arrow, sends it back for a redesign (out
  // of the pool: no trial asks about it again); Backspace steps back. Side by
  // side (All states) it only names itself.
  import { onMount, untrack } from 'svelte';
  import ZoneSeal from '../../components/zonecard/ZoneSeal.svelte';
  import { seedOf, type Ctx } from '../../components/zonecard/family';
  import { ring } from '../../lib/arcane';
  import { accentAt } from '../../lib/descent';
  import { deskKey, readKey, writeKey } from '../../lib/storage';
  import { drawingOf } from '../../lib/zoneSigils';
  import type { PieceProps } from '../bench.ts';
  import { RATED_ZONES, SETS, asRating, deal, pending, results, toggleOut, type Pick, type Rating, type SetKey } from './zonesigils.ts';

  let { small }: PieceProps = $props();

  const KEY = deskKey('zonesigils.rating');

  /** A zone's colour, as the game gives it (lib/descent.ts accentAt, at its first depth). */
  const accentOf = (zone: string) => accentAt(10 * RATED_ZONES.indexOf(zone) + 1);

  /** What each drawing draws, as a number by `zone|set`: an answer that touches a drawing redrawn since is dropped, and the rest carried on, so only the new drawings are asked about. (Side by side, where nothing is kept, none are drawn.) */
  const PRINTS: Record<string, number> = untrack(() => small)
    ? {}
    : Object.fromEntries(SETS.flatMap((set) => RATED_ZONES.map((z) => [`${z}|${set}`, seedOf(Object.values(drawingOf(set, z)).join('|'))])));
  /** What all three sets drew as one number, as a rating kept before PRINTS was: one that matches carries on whole. */
  const wholePrint = () => seedOf(SETS.flatMap((set) => RATED_ZONES.map((z) => Object.values(drawingOf(set, z)).join('|'))).join('#'));

  function load(): Rating {
    try {
      const x: unknown = JSON.parse(readKey(KEY) ?? 'null');
      const r = asRating(x);
      if (r) {
        const { prints, print } = x as { prints?: Record<string, unknown>; print?: unknown };
        const byDrawing = prints && typeof prints === 'object' ? prints : null;
        const whole = byDrawing ? false : print === wholePrint();
        const same = (key: string) => (byDrawing ? byDrawing[key] === PRINTS[key] : whole);
        const steps = r.steps.filter((s) => {
          if ('out' in s) return same(`${s.zone}|${s.out}`);
          const t = r.trials[s.trial];
          return same(`${t.zone}|${t.left}`) && same(`${t.zone}|${t.right}`);
        });
        return { trials: r.trials, steps };
      }
    } catch {
      /* dealt afresh */
    }
    return { trials: deal(), steps: [] };
  }

  /** (Side by side it deals nothing, and keeps nothing.) */
  let rating = $state<Rating>(untrack(() => small) ? { trials: [], steps: [] } : load());
  const save = () => writeKey(KEY, JSON.stringify({ ...rating, prints: PRINTS }));

  /** The trials still to answer, and how many are answered. */
  const left = $derived(pending(rating));
  const answered = $derived(rating.steps.filter((s) => 'trial' in s).length);
  const done = $derived(rating.trials.length > 0 && left.length === 0);
  const trial = $derived(done ? null : rating.trials[left[0]]);
  const ranked = $derived(done ? results(rating) : []);

  function pick(p: Pick) {
    if (done || !trial) return;
    rating.steps.push({ trial: left[0], pick: p });
    save();
  }
  /** Sends a zone's drawing back for a redesign, or takes it back into the pool. */
  function toggle(zone: string, set: SetKey) {
    rating = toggleOut(rating, zone, set);
    save();
  }
  function sendBack(side: 'left' | 'right') {
    if (trial) toggle(trial.zone, trial[side]);
  }
  function back() {
    if (!rating.steps.length) return;
    rating.steps.pop();
    save();
  }
  function startOver() {
    rating = { trials: deal(), steps: [] };
    save();
  }

  let copied = $state(false);
  async function copy() {
    const redesign = ranked.flatMap((z) => z.redesign.map((set) => `${z.zone} • ${set}`));
    const scoring = 'a win 1, a tie 0.5, counted only between kept drawings (score of `of` trials); a drawing sent back for a redesign left the pool';
    const text = JSON.stringify({ sets: SETS, scoring, redesign, zones: ranked }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = Object.assign(document.createElement('textarea'), { value: text });
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    copied = true;
    setTimeout(() => (copied = false), 1400);
  }

  onMount(() => {
    if (small) return;
    save();
    // In the capture phase, so the desk (which takes the arrows from a frame) never hears these.
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const p: Pick | 'back' | null = e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right' : e.key === 'ArrowDown' ? 'tie' : e.key === 'Backspace' ? 'back' : null;
      if (!p) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (p === 'back') back();
      else if (e.shiftKey && p !== 'tie') sendBack(p);
      else if (!e.shiftKey) pick(p);
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  });

  /** It never moves (held still), so it never plays. */
  const play: Ctx['play'] = (el, frames) => el.animate(frames, { duration: 0 });
  /** The title card's seal at its sizes: a desktop's (its largest), a phone upright's, a phone on its side's (ZoneCard.svelte --seal). */
  const CARD = [72, 48, 36];
  /** A lost life's square (GameOver.svelte .lives --t): a desktop's and a phone's, and the smallest board's. */
  const THUMB = [46, 28];
  /** The pit's seal radius (lib/descentPlate.ts R): its largest, and as small as a short plate makes it. */
  const PIT = [14, 8];
  const CHART_R = 7.5;
  const chartRing = ring([0, 0], CHART_R) + ring([0, 0], CHART_R - 1.2);
</script>

{#snippet candidate(set: SetKey, zone: string, side: 'left' | 'right')}
  {@const sg = drawingOf(set, zone)}
  {@const seed = seedOf(zone)}
  <div class="col">
  <button class="side" onclick={() => pick(side)} style:--accent={accentOf(zone)} style:--c={accentOf(zone)}>
    <span class="big ink" style:--seal="200px"><ZoneSeal sigil={zone} bears={sg} {play} still {seed} /></span>
    <span class="row">
      {#each CARD as px (px)}
        <span class="card ink" style:--seal="{px}px" title="Its title card, {px} px"><ZoneSeal sigil={zone} bears={sg} {play} still {seed} /></span>
      {/each}
    </span>
    <span class="row">
      <span class="mini" title="A find at the end of a run">
        <svg class="zone-ic" viewBox="-11 -11 22 22"
          >{#if sg.shade}<path class="s-shade" d={sg.shade} />{/if}<path class="s-fine" d={sg.fine} /><path d={sg.lines} /></svg
        >
      </span>
      {#each THUMB as t (t)}
        <span class="thumb" style:--t="{t}px" title="A life lost at the end of a run, {t} px"
          ><svg viewBox="-12 -12 24 24">{#if sg.shade}<path class="s-shade" d={sg.shade} />{/if}<path class="s-fine" d={sg.fine} /><path d={sg.lines} /></svg></span
        >
      {/each}
      <svg class="chart" width={2 * CHART_R + 2} height={2 * CHART_R + 2} viewBox="{-CHART_R - 1} {-CHART_R - 1} {2 * CHART_R + 2} {2 * CHART_R + 2}">
        <title>The runs chart’s margin</title>
        <path class="seal" d={chartRing} />
        <g class="sigil" transform="scale({(CHART_R - 2) / 10})">
          {#if sg.shade}<path class="s-shade" d={sg.shade} />{/if}<path class="s-fine" d={sg.fine} /><path d={sg.lines} />
        </g>
      </svg>
      {#each PIT as r (r)}
        <svg class="pit" width={2 * r} height={2 * r} viewBox="{-r} {-r} {2 * r} {2 * r}">
          <title>The rules page’s pit, a seal {2 * r} px across</title>
          <g class="sigil" transform="scale({(r - 2.4) / 10})">
            {#if sg.shade}<path class="s-shade" d={sg.shade} />{/if}<path class="s-fine" d={sg.fine} /><path d={sg.lines} />
          </g>
        </svg>
      {/each}
    </span>
  </button>
  <button class="same" onclick={() => sendBack(side)}>redesign this one</button>
  </div>
{/snippet}

{#if small}
  <p class="only-name">Zone sigils, rated blind</p>
{:else if trial}
  <div class="page">
    <header>
      <h2>{trial.zone}</h2>
      <span class="count">{answered + 1} / {answered + left.length}</span>
    </header>
    <div class="pair">
      {@render candidate(trial.left, trial.zone, 'left')}
      {@render candidate(trial.right, trial.zone, 'right')}
    </div>
    <div class="also">
      <button class="same" onclick={() => pick('tie')}>about the same</button>
      {#if rating.steps.length}<button class="same" onclick={back}>back one</button>{/if}
    </div>
    <p class="keys">← or → picks a side, ↓ says they’re about the same, Shift with ← or → sends that side back for a redesign, Backspace goes back one.</p>
  </div>
{:else if done}
  <div class="page end">
    <h2>Each zone’s three</h2>
    <ol class="zones">
      {#each ranked as z (z.zone)}
        <li style:--accent={accentOf(z.zone)}>
          <span class="zname">{z.zone}</span>
          <span class="sets">
            {#each z.ranking as r (r.set)}
              <span class="set" class:tied={z.ranking.filter((o) => o.place === r.place).length > 1}>
                <span class="ink tiny" style:--seal="48px"><ZoneSeal sigil={z.zone} bears={drawingOf(r.set, z.zone)} {play} still seed={seedOf(z.zone)} /></span>
                <span class="meta">
                  <span class="sname">{r.place}{z.ranking.filter((o) => o.place === r.place).length > 1 ? '=' : ''} • {r.set}</span>
                  <span class="score">{r.score} / {r.of}</span>
                  <button class="same small" onclick={() => toggle(z.zone, r.set)}>redesign</button>
                </span>
              </span>
            {/each}
            {#each z.redesign as s (s)}
              <span class="set out">
                <span class="ink tiny" style:--seal="48px"><ZoneSeal sigil={z.zone} bears={drawingOf(s, z.zone)} {play} still seed={seedOf(z.zone)} /></span>
                <span class="meta">
                  <span class="sname">{s}</span>
                  <span class="gone">to redesign</span>
                  <button class="same small" onclick={() => toggle(z.zone, s)}>keep it</button>
                </span>
              </span>
            {/each}
          </span>
        </li>
      {/each}
    </ol>
    <div class="actions">
      <button class="btn primary" onclick={copy}>{copied ? 'Copied' : 'Copy results'}</button>
      <button class="btn ghost" onclick={back}>Back one</button>
      <button class="btn ghost" onclick={startOver}>Start over</button>
    </div>
  </div>
{/if}

<style>
  .page {
    box-sizing: border-box;
    width: 100%;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1.5rem 1rem;
  }
  header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
  }
  h2 {
    margin: 0;
    font-family: var(--font-cinzel);
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--gold-hi);
    font-size: 1.6rem;
  }
  .count {
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
    color: var(--muted);
  }
  .pair {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.2rem;
  }
  .also {
    display: flex;
    gap: 1.6rem;
  }
  .col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
  }
  .side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.1rem;
    padding: 1.4rem 1.2rem 1.2rem;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 3px;
    cursor: pointer;
    transition: border-color 0.2s;
  }
  .side:hover {
    border-color: var(--gold-lo);
  }
  .same {
    padding: 0.4rem;
    background: none;
    border: 0;
    font-family: var(--font-body);
    font-style: italic;
    font-size: 0.95rem;
    color: var(--muted);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 3px;
  }
  .same:hover {
    color: var(--note);
  }
  .keys {
    margin: 0;
    font-family: var(--font-body);
    font-style: italic;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }

  /* The title card's seal (ZoneCard.svelte): its inks from the zone's colour. */
  .ink {
    display: block;
    --ink: color-mix(in srgb, var(--accent) 55%, var(--gold));
    --ink-hi: color-mix(in srgb, var(--accent) 45%, var(--gold-hi));
    --glow-c: color-mix(in srgb, var(--accent) 65%, #d9a45a);
  }

  /* A find's zone at the end of a run (GameOver.svelte .mini.sign, .zone-ic). */
  .mini {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 26px;
    height: 26px;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid var(--line);
    border-radius: 2px;
  }
  .zone-ic {
    width: 18px;
    height: 18px;
    overflow: visible;
  }
  .zone-ic path {
    fill: none;
    stroke: color-mix(in srgb, var(--c) 60%, #f0e0b8);
    stroke-width: 0.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .zone-ic .s-fine {
    stroke-width: 0.55;
  }
  .zone-ic .s-shade {
    stroke: color-mix(in srgb, var(--c) 50%, #b08a4c);
    stroke-width: 0.4;
  }

  /* A life lost without its item (GameOver.svelte .thumb.blank). */
  .thumb {
    position: relative;
    display: block;
    flex: none;
    width: var(--t);
    height: var(--t);
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid var(--line);
    border-radius: 2px;
  }
  .thumb svg {
    position: absolute;
    inset: 18%;
    width: 64%;
    height: 64%;
    overflow: visible;
  }
  .thumb path {
    fill: none;
    stroke: color-mix(in srgb, var(--c) 60%, #f0e0b8);
    stroke-width: 0.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .thumb .s-fine {
    stroke-width: 0.6;
  }
  .thumb .s-shade {
    stroke: color-mix(in srgb, var(--c) 50%, #b08a4c);
    stroke-width: 0.45;
  }

  /* The runs chart's seal (RunsChart.svelte) and the pit's (DelveLadder.svelte): fine lines at any scale. */
  .chart,
  .pit {
    display: block;
    flex: none;
    overflow: visible;
  }
  .chart path,
  .pit path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .chart .seal {
    stroke: color-mix(in srgb, var(--c) 55%, #d9a45a);
    stroke-width: 0.7;
    stroke-linecap: butt;
    stroke-linejoin: miter;
  }
  .sigil path {
    stroke: color-mix(in srgb, var(--c) 60%, #f0e0b8);
    stroke-width: 0.6px;
    vector-effect: non-scaling-stroke;
  }
  .sigil .s-fine {
    stroke-width: 0.42px;
  }
  .sigil .s-shade {
    stroke: color-mix(in srgb, var(--c) 50%, #b08a4c);
    stroke-width: 0.32px;
  }

  /* Once all are in. */
  .end {
    justify-content: flex-start;
  }
  .zones {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.9rem;
  }
  .zones li {
    display: flex;
    align-items: center;
    gap: 1.2rem;
  }
  .zname {
    width: 11rem;
    font-family: var(--font-cinzel);
    color: color-mix(in srgb, var(--accent) 45%, var(--gold-hi));
  }
  .sets {
    display: flex;
    gap: 1.4rem;
  }
  .set {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 12rem;
  }
  .meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
  }
  .same.small {
    padding: 0;
    font-size: 0.85rem;
  }
  .set.out .ink {
    opacity: 0.4;
  }
  .set.out .sname {
    color: var(--muted);
  }
  .gone {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 0.9rem;
    color: var(--note);
  }
  .sname {
    font-family: var(--font-cinzel);
    color: var(--text);
  }
  .set.tied .sname {
    color: var(--note);
  }
  .score {
    font-family: var(--font-cinzel);
    color: var(--gold);
  }
  .actions {
    display: flex;
    gap: 0.8rem;
    margin-top: 0.6rem;
  }
  .only-name {
    margin: 0;
    padding: 1rem;
    font-family: var(--font-cinzel);
    color: var(--gold);
    text-align: center;
  }
</style>
