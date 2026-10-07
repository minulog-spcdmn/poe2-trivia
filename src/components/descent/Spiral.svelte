<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { star8 } from '../../lib/arcane';
  import { DELVE_LIVES, DELVE_MIN_TIMER, FINDS_FROM, delveTimer } from '../../lib/delve';
  import { bestDepth, f, keyRows, labelSpot, layout, serpentLit, starPoint, station, zoneIndex, zonesReached, ZONES_END, type Box } from '../../lib/descentSpiral';

  // The descent, engraved as a spiral (lib/descentSpiral draws it): a track
  // winding inward from Sol at the mouth, ten stretches for the ten zones,
  // a gate between each, to an ouroboros at its heart, a sideways eight, for
  // the strata past 100 that go on for ever. A zone you have reached is cut
  // in its colour, its bed shaded by a fine line, and named in the key beside it; one
  // you haven't is a hairline, uncharted. An eight-pointed star in a glory
  // marks your deepest, its number beside it (at the mouth before a first
  // run; past 100 in the serpent, which lights from its head down as you go
  // deeper, all of it at 1000). The notes under it say what lies ahead.
  // In the arcane style (docs/arcane-style.md): fine exact lines that stop
  // short of the star and its number, one-sided hatching, a little wear, a
  // soft glow under the lit lines. It inks itself in once, from the mouth
  // inward as one sweep of the pen; when the deepest changes, only the star
  // walks along the track and the zones it reaches light.
  let { deepest = null }: { deepest?: number | null } = $props();

  let w = $state(0);
  const L = $derived(w > 0 ? layout(w) : null);
  const best = $derived(bestDepth(deepest));
  const reached = $derived(zonesReached(deepest));
  const here = $derived(zoneIndex(deepest));
  const rows = $derived(keyRows(deepest));
  const lit = $derived(serpentLit(deepest));
  const beyond = $derived(best !== null && best > ZONES_END);
  const uncharted = $derived(rows.filter((r) => !r.reached).length);
  /** The bracket round the key's uncharted rows, top and bottom. */
  const bracket = $derived(L ? [(10 - Math.max(1, uncharted)) * L.key.pitch + 2, 10 * L.key.pitch - 2] : [0, 0]);

  const uid = `spiral-${Math.random().toString(36).slice(2, 8)}`;
  const sec = (s: number) => `${s.toFixed(3)}s`;

  // The star walks to its station along the track (a short glide, longer for a long way) rather than jumping.
  let q = $state(-1);
  let raf = 0;
  $effect(() => {
    if (!L) return;
    const to = station(deepest, L.margin);
    const from = untrack(() => q);
    if (from < 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancelAnimationFrame(raf);
      q = to;
      return;
    }
    if (Math.abs(to - from) < 1e-6) return;
    const ms = Math.min(900, 260 + Math.abs(to - from) * 1400);
    const t0 = performance.now();
    cancelAnimationFrame(raf);
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / ms);
      q = from + (to - from) * (1 - (1 - u) ** 3);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
  onDestroy(() => cancelAnimationFrame(raf));

  const star = $derived(L ? star8([0, 0], L.star.r) : null);
  const glory = $derived(
    L
      ? Array.from({ length: 24 }, (_, k) => {
          const a = (k / 24) * Math.PI * 2;
          const [r0, r1] = [L.star.r * 1.2, k % 2 ? L.star.glory * 0.82 : L.star.glory];
          return `M${f(Math.sin(a) * r0)} ${f(-Math.cos(a) * r0)}L${f(Math.sin(a) * r1)} ${f(-Math.cos(a) * r1)}`;
        }).join('')
      : '',
  );
  const pos = $derived(L && q >= 0 ? starPoint(L, q) : null);
  const starAt = $derived(pos ?? [0, 0]);
  /** The number's width at its size (Cinzel's figures are about 0.68 em). */
  const NUM = 10.5;
  const numW = $derived(best === null ? 0 : String(best).length * NUM * 0.7 + 1);
  let lastSpot: number | null = null;
  const spot = $derived.by((): Box | null => {
    if (!L || !pos || best === null) return null;
    if (q > 1) {
      // Past the zones: under the serpent, below the star.
      const s = L.serpent;
      return [pos[0] - numW / 2, s.c[1] + s.half + 3, numW, NUM * 0.8];
    }
    const r = labelSpot(L, pos, numW, NUM * 0.8, lastSpot);
    lastSpot = r.i;
    return r.box;
  });

  /** Depth where the clock is at its shortest. */
  const SHORTEST = (() => {
    for (let d = 1; d < 1000; d++) if (delveTimer(d) === DELVE_MIN_TIMER) return d;
    return ZONES_END;
  })();
  const LIVES = ['No', 'One', 'Two', 'Three', 'Four', 'Five'][DELVE_LIVES] ?? String(DELVE_LIVES);

  const summary = $derived(
    [
      'The descent: a spiral of ten zones, ten depths each, then on without end past 100.',
      reached === 0
        ? 'All ten zones are uncharted.'
        : `Zones reached: ${rows
            .filter((r) => r.reached)
            .map((r) => r.name)
            .join(', ')}${uncharted ? `; ${uncharted} more uncharted` : ''}.`,
      best !== null ? `Your deepest: depth ${best}.` : 'No run yet.',
      `A new zone every ten depths. ${LIVES} lives each; finds from depth ${FINDS_FROM}. ${delveTimer(1)} seconds to answer at the top, ${DELVE_MIN_TIMER} from depth ${SHORTEST}; the questions grow trickier.`,
    ].join(' '),
  );
</script>

<figure class="spiral" class:band={L?.band} role="img" aria-label={summary} bind:clientWidth={w}>
  {#if L}
    <div class="plate" style:width="{L.w}px" style:height="{L.h}px">
      <!-- The glow: the lit lines again, whole, wide and soft, under the plate. It breathes. -->
      <svg class="glow" viewBox="0 0 {L.w} {L.h}" aria-hidden="true">
        <g mask="url(#{uid}-g)">
          {#each L.zones as z (z.k)}
            <path class="zone-glow" class:on={z.k < reached} d={z.glow} style:--c={rows[z.k].color ?? 'transparent'} />
          {/each}
          <path class="serpent-glow" class:on={beyond} d={L.serpent.glow} mask="url(#{uid}-lit)" />
        </g>
        <circle class="halo" class:none={best === null} class:unplaced={!pos} cx={f(starAt[0])} cy={f(starAt[1])} r={f(L.star.glory * 0.9)} />
        <mask id="{uid}-g" maskUnits="userSpaceOnUse" x="0" y="0" width={L.w} height={L.h}>
          <rect width={L.w} height={L.h} fill="white" />
          {#if spot}<rect x={f(spot[0] - 1.5)} y={f(spot[1] - 1.5)} width={f(spot[2] + 3)} height={f(spot[3] + 3)} fill="black" />{/if}
        </mask>
      </svg>

      <svg class="lines" viewBox="0 0 {L.w} {L.h}" aria-hidden="true">
        <defs>
          <!-- Lines stop short of the star and its number. -->
          <mask id="{uid}-m" maskUnits="userSpaceOnUse" x="0" y="0" width={L.w} height={L.h}>
            <rect width={L.w} height={L.h} fill="white" />
            {#if pos}<circle cx={f(pos[0])} cy={f(pos[1])} r={f(L.star.hole)} fill="black" />{/if}
            {#if spot}<rect x={f(spot[0] - 1.5)} y={f(spot[1] - 1.5)} width={f(spot[2] + 3)} height={f(spot[3] + 3)} fill="black" />{/if}
          </mask>
          <!-- The serpent's light, run down it from the head. -->
          <mask id="{uid}-lit" maskUnits="userSpaceOnUse" x="0" y="0" width={L.w} height={L.h}>
            <path class="lit-run" d={L.serpent.spine} pathLength="100" style:stroke-dashoffset={100 - lit * 100} stroke-width={L.serpent.a * 0.3} />
          </mask>
        </defs>

        <g mask="url(#{uid}-m)">
          <!-- Sol at the mouth. -->
          <g class="sol" style:--d="0.05s">
            <circle cx={f(L.sol.c[0])} cy={f(L.sol.c[1])} r={L.sol.r} />
            <circle class="point" cx={f(L.sol.c[0])} cy={f(L.sol.c[1])} r="0.7" />
            <path d={L.sol.rays} />
          </g>

          {#each L.zones as z (z.k)}
            {@const row = rows[z.k]}
            <g class="zone" class:on={row.reached} style:--c={row.color ?? 'transparent'}>
              <!-- The track cut double: dull while uncharted; once reached, in the zone's colour, its bed shaded. -->
              <path class="bed" d={z.bed} style:--d={sec(z.at + 0.25)} />
              {#each z.edges as s, i (i)}
                <path class="draw edge" d={s.d} pathLength="100" style:--d={sec(s.delay)} style:--t={sec(s.dur)} />
              {/each}
              {#if z.gate}<path class="gate" class:lit={z.k < reached} d={z.gate} style:--d={sec(z.at)} />{/if}
            </g>
          {/each}
          <path class="gate end" class:lit={beyond} d={L.end} style:--d={sec(L.trackDone)} />

          <!-- The ouroboros: dull until you pass 100; then lit from its head down, the further the deeper. -->
          <g class="serpent">
            {#each [false, true] as on (on)}
              <g class:lit-copy={on} mask={on ? `url(#${uid}-lit)` : undefined}>
                <path class="scales" d={L.serpent.scales} style:--d={sec(L.trackDone + 0.6)} />
                <path class="head" d={L.serpent.head} style:--d={sec(L.trackDone + 0.75)} />
                <circle class="pupil" cx={f(L.serpent.pupil[0])} cy={f(L.serpent.pupil[1])} r={f(Math.max(0.42, L.serpent.a * 0.012))} style:--d={sec(L.trackDone + 0.75)} />
                {#each L.serpent.edges as s, i (i)}
                  <path class="draw body" d={s.d} pathLength="100" style:--d={sec(s.delay)} style:--t={sec(s.dur)} />
                {/each}
              </g>
            {/each}
          </g>
        </g>

        <!-- The key: each zone by its first depth, named once reached; the rest bracketed, uncharted. -->
        <g class="key" transform="translate({f(L.key.x)} {f(L.key.y)})">
          {#each rows as r, k (k)}
            {@const y = (k + 1) * L.key.pitch - 3}
            <g class="row" class:on={r.reached} class:here={here === k} style:--c={r.color ?? 'transparent'} style:--d={sec(L.zones[k].at + 0.1)}>
              <text class="from" x="17" y={f(y)}>{r.from}</text>
              {#if r.reached}<text class="name" x="23" y={f(y)}>{r.name}</text>{/if}
            </g>
          {/each}
          <!-- Always in place (so it never replays its entrance), hidden once every zone is charted. -->
          <g class="bracket" class:gone={!uncharted} style:--d={sec(L.zones[9].at + 0.2)}>
            <path d="M20.5 {f(bracket[0])}H23V{f(bracket[1])}H20.5" />
            <text class="uncharted" x="27.5" y={f((bracket[0] + bracket[1]) / 2 + 3.6)}>uncharted</text>
          </g>
          <g class="past" class:on={beyond} style:--d={sec(L.trackDone + 0.2)}>
            <text class="from" x="17" y={f(11 * L.key.pitch + 1)}>{ZONES_END + 1}</text>
            <text class="on-and-on" x="23" y={f(11 * L.key.pitch + 1)}>on, without end</text>
          </g>
        </g>

        <!-- Your deepest: an eight-pointed star, hatched down one side of each point, in a glory of fine rays. -->
        <!-- Always in place once laid out (never re-created, so its entrance never replays); hidden until it has a station. -->
        <g class="star" class:none={best === null} class:unplaced={!pos} transform="translate({f(starAt[0])} {f(starAt[1])})">
          <g class="stamp">
            <path class="glory" d={glory} />
            <path class="star-ground" d={star?.outline} />
            <path class="star-hatch" d={star?.hatch} />
            <path class="star-line" d={star?.outline} />
            <path class="star-ridge" d={star?.ridges} />
          </g>
        </g>
        <text class="best" x={f(spot ? spot[0] + spot[2] / 2 : starAt[0])} y={f(spot ? spot[1] + spot[3] : starAt[1])}>{best ?? ''}</text>
      </svg>
    </div>

    <ul class="notes">
      <li>A new zone every ten depths, named once you reach it.</li>
      <li>{LIVES} lives each; finds from depth <span class="fig">{FINDS_FROM}</span>.</li>
      <li>
        <span class="fig">{delveTimer(1)}</span>&#8239;s to answer at the top, <span class="fig">{DELVE_MIN_TIMER}</span>&#8239;s from depth <span class="fig">{SHORTEST}</span>; the questions grow
        trickier.
      </li>
    </ul>
  {/if}
</figure>

<style>
  .spiral {
    margin: 0;
    color: var(--gold);
    --dull: #6f6453;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .spiral.band {
    flex-direction: row;
    align-items: center;
    gap: 0.9rem;
  }
  .plate {
    position: relative;
    flex: none;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }

  /* The glow: the lit lines again, wide, faint and soft, breathing. */
  .glow {
    opacity: 0.3;
    filter: blur(0.6px);
    animation:
      glow-in 1.2s 0.9s ease-out both,
      breathe 6s 2.1s ease-in-out infinite alternate;
  }
  .glow path {
    stroke-width: 2.2;
    opacity: 0;
    transition: opacity 0.6s;
  }
  .glow .on {
    opacity: 1;
  }
  .zone-glow {
    stroke: color-mix(in srgb, var(--c) 60%, #d9a45a);
  }
  .serpent-glow {
    stroke: var(--gold-hi);
  }
  .halo {
    stroke: none;
    fill: var(--gold-hi);
    opacity: 0.55;
    filter: blur(3px);
    animation: carve 0.6s 2.2s var(--ease-out) both;
  }
  .halo.none {
    opacity: 0.25;
  }
  .halo.unplaced {
    visibility: hidden;
  }

  /* Sol at the mouth. */
  .sol {
    animation: carve 0.4s var(--d) var(--ease-out) both;
  }
  .sol circle,
  .sol path {
    stroke: var(--gold-hi);
    stroke-width: 0.5;
  }
  .sol .point {
    fill: var(--gold-hi);
    stroke: none;
  }

  /* A zone: dull while uncharted; once reached, cut in its colour, its bed shaded. */
  .edge {
    stroke: var(--dull);
    stroke-width: 0.6;
    transition: stroke 0.6s;
  }
  .zone.on .edge {
    stroke: color-mix(in srgb, var(--c) 55%, #e8c98a);
  }
  .bed {
    stroke: color-mix(in srgb, var(--c) 50%, #b08d52);
    stroke-width: 0.3;
    animation: carve 0.5s var(--d) var(--ease-out) both;
    transition: opacity 0.6s;
  }
  .zone:not(.on) .bed {
    opacity: 0;
  }
  .gate {
    stroke: var(--dull);
    stroke-width: 0.5;
    animation: carve 0.3s var(--d) var(--ease-out) both;
    transition: stroke 0.6s;
  }
  .gate.lit {
    stroke: var(--gold);
  }

  /* The ouroboros. */
  .serpent .body {
    stroke: var(--dull);
    stroke-width: 0.6;
  }
  .serpent .scales,
  .serpent .head {
    stroke: var(--dull);
    stroke-width: 0.32;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .serpent .head {
    stroke-width: 0.4;
  }
  .pupil {
    fill: var(--dull);
    stroke: none;
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .lit-copy .body {
    stroke: var(--gold-hi);
  }
  .lit-copy .scales,
  .lit-copy .head {
    stroke: var(--gold);
  }
  .lit-copy .pupil {
    fill: var(--gold-hi);
  }
  .lit-run {
    stroke: white;
    fill: none;
    stroke-dasharray: 100 100;
    transition: stroke-dashoffset 0.9s var(--ease-out);
  }

  /* The key. */
  text {
    dominant-baseline: alphabetic;
  }
  .row {
    animation: carve 0.4s var(--d) var(--ease-out) both;
  }
  .from {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 9.5px;
    text-anchor: end;
    fill: var(--dull);
  }
  .row.on .from {
    fill: var(--gold-lo);
  }
  .name {
    animation: carve 0.5s var(--ease-out) both;
    font-family: var(--font-display);
    font-size: 10px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    fill: color-mix(in srgb, var(--c) 50%, #e3d3b4);
  }
  .row.here .name {
    fill: color-mix(in srgb, var(--c) 40%, #fff3d6);
  }
  .bracket {
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .bracket.gone {
    visibility: hidden;
  }
  .bracket path {
    stroke: var(--dull);
    stroke-width: 0.6;
  }
  .uncharted,
  .on-and-on {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 12px;
    fill: var(--muted);
  }
  .past {
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .past text {
    transition: fill 0.6s;
  }
  .past.on .on-and-on {
    fill: var(--gold-hi);
  }
  .past.on .from {
    fill: var(--gold);
  }
  .fig {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
    font-size: 0.86em;
  }

  /* The star: the brightest thing on the plate. */
  .star {
    transition: opacity 0.4s;
  }
  .star.none {
    opacity: 0.6;
  }
  .star.unplaced {
    visibility: hidden;
  }
  .glory {
    stroke: var(--gold-hi);
    stroke-width: 0.35;
  }
  .star-ground {
    fill: #120f0b;
    stroke: none;
  }
  .star-line {
    stroke: var(--gold-hi);
    stroke-width: 0.6;
  }
  .star-ridge {
    stroke: var(--gold-hi);
    stroke-width: 0.35;
  }
  .star-hatch {
    stroke: var(--gold-hi);
    stroke-width: 0.3;
    stroke-linecap: round;
  }
  .best {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 10.5px;
    text-anchor: middle;
    fill: var(--gold-hi);
    animation: carve 0.5s 2.35s var(--ease-out) both;
  }

  /* The notes. */
  .notes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.2rem;
    font-style: italic;
    font-size: 0.75rem;
    line-height: 1.3;
    color: #cfc2a8;
    animation: carve 0.6s 1.5s var(--ease-out) both;
  }
  .band .notes {
    flex: 1 1 0;
    min-width: 0;
  }

  /* Lines draw themselves (each piece in its turn); the star is stamped in. */
  .draw {
    stroke-dasharray: 100;
    animation: draw var(--t, 1s) var(--d, 0s) linear both;
  }
  .stamp {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 0.55s 2.2s var(--ease-out) both;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 100;
    }
  }
  @keyframes carve {
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
  @keyframes glow-in {
    from {
      opacity: 0;
    }
    55% {
      opacity: 0.48;
    }
    to {
      opacity: 0.3;
    }
  }
  @keyframes breathe {
    from {
      opacity: 0.3;
    }
    to {
      opacity: 0.1;
    }
  }
</style>
