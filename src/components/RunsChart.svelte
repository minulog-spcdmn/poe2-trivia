<script lang="ts">
  // The end of a Delve run: this device's runs of its kind (alone or
  // together, lib/delveRecord.ts), oldest first, the last of them this one,
  // engraved as shafts sunk into the rock (lib/runsPlate draws them): the
  // deeper a run went, the further down its shaft reaches, through the
  // zones' strata. A gold star on the floor of your best, a red one on this
  // run's (one gold star when this run is the best), each with its depth
  // under it, as the lobby's descent marks them; a dotted level at the
  // median of the runs shown, "usual" beside it.
  // It engraves itself as the panel comes in: the ground and the strata, then
  // each shaft sunk in turn, oldest first, this run's last and slowest, its
  // star struck as it reaches the floor. With reduced motion it simply stands.
  import { shownDepth } from '../lib/delve';
  import type { DelveRun } from '../lib/delveRecord';
  import { accentAt } from '../lib/descent';
  import { stratumName } from '../lib/descent';
  import { sigilOf } from '../lib/zoneSigils';
  import { SOL_RAYS } from '../lib/alchemy';
  import { f } from '../lib/arcane';
  import { runsPlate } from '../lib/runsPlate';

  /** `height`: the whole drawing's, its depths included; `width`: the shafts' (the margin and "usual" come on top). */
  let { runs, height = 150, width = 180, delay = 0.7 }: { runs: DelveRun[]; height?: number; width?: number; delay?: number } = $props();

  const depths = $derived(runs.map((r) => shownDepth(r.depth)));
  /** The deepest run: this one only if it went deeper than every one before it. */
  const best = $derived.by(() => {
    const before = depths.slice(0, -1);
    const top = Math.max(-1, ...before);
    return depths.at(-1)! > top ? depths.length - 1 : before.indexOf(top);
  });
  const p = $derived(
    runsPlate(
      runs.map((r, i) => ({ depth: depths[i], accent: accentAt(r.depth) })),
      best,
      width,
      height,
      (k) => accentAt(10 * k + 1),
    ),
  );
  const sec = (s: number) => `${s.toFixed(3)}s`;
  /** When each shaft starts to sink, oldest first; this run's after a pause. */
  const sinkAt = (i: number, now: boolean) => delay + 0.35 + (now ? 0.12 : 0) + i * 0.07;
  const sinkFor = (now: boolean) => (now ? 0.75 : 0.32);
  const landed = $derived(sinkAt(runs.length - 1, true) + sinkFor(true));
</script>

<svg
  class="runs-plate"
  width={p.w}
  height={p.h}
  viewBox="0 0 {p.w} {p.h}"
  role="img"
  aria-label="Your runs, oldest first, as shafts into the rock: depths {depths.join(', ')}; this run {depths.at(-1)}, your best {depths[best]}"
  style:--d0={sec(delay)}
>
  <!-- The ground and the strata, with the zones' seals in the margin and Sol over the ground. -->
  <g class="rock">
    <path class="earth" d={p.ground.shade} />
    <path class="main" d={p.ground.main} />
    <path class="hair" d={p.ground.hair} />
    {#each p.strata as s, i (i)}
      <path class="stratum" d={s.d} style:--c={s.accent} />
    {/each}
    {#each p.seals as s (s.zone)}
      {@const sg = sigilOf(stratumName(s.zone))}
      <g style:--c={s.accent}>
        <path class="seal" d={s.ring} />
        <g class="sigil" transform="translate({f(s.c[0])} {f(s.c[1])}) scale({f((s.r - 2) / 10)})">
          {#if sg.shade}<path class="s-shade" d={sg.shade} />{/if}
          <path class="s-fine" d={sg.fine} />
          <path d={sg.lines} />
        </g>
      </g>
    {/each}
    <g class="sign sol" transform="translate({f(p.sol.c[0])} {f(p.sol.c[1])}) scale({f(p.sol.r / 5)})">
      <circle r="5" />
      <circle r="1.1" class="point" />
      <path d={SOL_RAYS} />
    </g>
    <path class="usual" d={p.usual.d} />
    <text class="usual-label" x={f(p.usual.label[0])} y={f(p.usual.label[1])}>usual {p.usual.depth}</text>
  </g>

  <!-- The shafts, each sunk in turn; this run's lit, on a soft glow. -->
  {#each p.shafts as s, i (i)}
    <g class="shaft" class:now={s.now} style:--c={s.accent} style:--d={sec(sinkAt(i, s.now))} style:--t={sec(sinkFor(s.now))}>
      {#if s.now}<path class="glow" d={s.whole} />{/if}
      <path class="shade" d={s.shade} />
      <path class="walls" d={s.lines} />
    </g>
  {/each}

  <!-- The stars on their floors: your best in gold, this run in red. -->
  {#each p.stars as s, i (i)}
    {@const at = s.kind === 'red' || i === p.stars.length - 1 ? landed : sinkAt(best, false) + sinkFor(false)}
    <g class="star {s.kind}" style:--d={sec(at)}>
      <circle class="halo" cx={f(s.c[0])} cy={f(s.c[1])} r={f(s.r + 3)} />
      <path class="glory" d={s.glory} />
      <g class="stamp" style:transform-origin="{f(s.c[0])}px {f(s.c[1])}px">
        <path class="ground" d={s.outline} />
        <path class="s-hatch" d={s.hatch} />
        <path class="s-line" d={s.outline} />
        <path class="s-ridge" d={s.ridges} />
      </g>
      <text class="num" x={f(s.num.x)} y={f(s.num.y)}>{s.num.text}</text>
    </g>
  {/each}
</svg>

<style>
  .runs-plate {
    display: block;
    flex: none;
    overflow: visible;
    color: var(--gold);
    /* The last run's star: old blood, as the lobby's descent has it. */
    --red: #b4432f;
    --red-hi: #cf5e45;
    --red-num: #dc8a73;
  }
  path,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }

  /* ---- the rock ---- */
  .rock {
    animation: carve 0.5s var(--d0) var(--ease-out) both;
  }
  .main {
    stroke-width: 0.8;
  }
  .hair {
    stroke-width: 0.42;
    opacity: 0.7;
  }
  .earth {
    stroke-width: 0.36;
    stroke-linecap: round;
    opacity: 0.55;
  }
  /* A zone's boundary, in the colour of the zone below it. */
  .stratum {
    stroke: color-mix(in srgb, var(--c) 60%, #d9a45a);
    stroke-width: 0.5;
    opacity: 0.85;
  }
  .seal {
    stroke: color-mix(in srgb, var(--c) 55%, #d9a45a);
    stroke-width: 0.7;
  }
  .sigil path {
    stroke: color-mix(in srgb, var(--c) 60%, #f0e0b8);
    stroke-width: 0.6px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sigil .s-fine {
    stroke-width: 0.42px;
  }
  .sigil .s-shade {
    stroke: color-mix(in srgb, var(--c) 50%, #b08a4c);
    stroke-width: 0.32px;
  }
  .sol * {
    stroke: var(--gold-hi);
    stroke-width: 0.55px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
  }
  .sol .point {
    fill: var(--gold-hi);
  }
  .usual {
    stroke: rgba(201, 164, 92, 0.6);
    stroke-width: 0.8;
    stroke-dasharray: 0.8 2.6;
    stroke-linecap: round;
  }
  .usual-label {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 13px;
    fill: var(--muted);
  }

  /* ---- the shafts: sunk from the ground down, in their zone's colour ---- */
  .shaft {
    clip-path: inset(0 0 100% 0);
    animation: sink var(--t) var(--d) cubic-bezier(0.5, 0, 0.3, 1) both;
  }
  .walls {
    stroke: color-mix(in srgb, var(--c) 60%, #d9a45a);
    stroke-width: 0.75;
  }
  .shade {
    stroke: color-mix(in srgb, var(--c) 50%, #b08a4c);
    stroke-width: 0.42;
    stroke-linecap: round;
    opacity: 0.75;
  }
  .now .walls {
    stroke: color-mix(in srgb, var(--c) 75%, #f1d99b);
    stroke-width: 1.1;
  }
  .now .shade {
    stroke: color-mix(in srgb, var(--c) 70%, #f1d99b);
    stroke-width: 0.5;
    opacity: 0.95;
  }
  /* The lit shaft's glow: the same lines whole, wide and faint, under them. */
  .glow {
    stroke: color-mix(in srgb, var(--c) 75%, #f1d99b);
    stroke-width: 2.4;
    opacity: 0.25;
    filter: blur(0.6px);
  }
  @keyframes sink {
    to {
      clip-path: inset(0 0 -2% 0);
    }
  }

  /* ---- the stars ---- */
  .star .ground {
    fill: var(--bg);
    stroke: none;
  }
  .star .s-line {
    stroke: var(--gold-hi);
    stroke-width: 0.6;
  }
  .star .s-ridge {
    stroke: var(--gold-hi);
    stroke-width: 0.4;
  }
  .star .s-hatch {
    stroke: var(--gold-hi);
    stroke-width: 0.3;
    stroke-linecap: round;
  }
  .glory {
    stroke: var(--gold-hi);
    stroke-width: 0.42;
    animation: carve 0.5s calc(var(--d) + 0.1s) var(--ease-out) both;
  }
  .halo {
    stroke: none;
    fill: var(--gold-hi);
    opacity: 0.22;
    filter: blur(3px);
    animation: halo 0.6s var(--d) var(--ease-out) both;
  }
  .red :is(.s-line, .s-ridge, .s-hatch) {
    stroke: var(--red-hi);
  }
  .red .glory {
    stroke: var(--red);
  }
  .red .halo {
    fill: var(--red);
  }
  /* Struck as its shaft reaches the floor. */
  .stamp {
    animation: stamp 0.35s var(--d) var(--ease-out) both;
  }
  .num {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 13px;
    text-anchor: middle;
    fill: var(--gold-hi);
    animation: carve 0.45s calc(var(--d) + 0.15s) var(--ease-out) both;
  }
  .red .num {
    fill: var(--red-num);
  }
  @keyframes carve {
    from {
      opacity: 0;
    }
  }
  @keyframes halo {
    from {
      opacity: 0;
    }
  }
  @keyframes stamp {
    from {
      opacity: 0;
      transform: scale(1.7);
    }
  }
</style>
