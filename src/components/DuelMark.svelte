<script lang="ts" module>
  // The deathmatch's mark: two swords crossed, engraved like the lobby's mode
  // emblems (ModeIcon) but drawn to sit in a line of text, so its strokes keep
  // their width in screen pixels whatever its size. The sword behind is cut
  // where the one in front crosses it, as the plates weave their straps
  // (docs/arcane-style.md); a soft copy of the lines under them is the glow.
  // 32 unit viewBox, each sword drawn upright about the middle, then turned.

  /** A sword, point up, its middle on the origin. */
  const SWORD = {
    lines: [
      // The blade, open at the guard.
      'M-1.4 5.4V-11.4L0 -15.4L1.4 -11.4V5.4',
      // The guard, the grip and the pommel.
      'M-5.6 5.4H5.6V7H-5.6Z',
      'M-0.85 7V11.3M0.85 7V11.3',
      'M1.5 12.8a1.5 1.5 0 1 1 -3 0a1.5 1.5 0 1 1 3 0Z',
    ].join(''),
    // Its ridge, and the grip's wraps.
    hair: 'M0 -11.6V4.4M-0.85 8.5L0.85 7.9M-0.85 10L0.85 9.4',
    // What of it the sword behind is cut short of: the blade and guard, a little wider.
    cut: 'M-1.4 5.4V-11.4L0 -15.4L1.4 -11.4V5.4ZM-5.6 5.4H5.6V7H-5.6Z',
  };
</script>

<script lang="ts">
  /** strike: the swords swing in and cross (the duel strip's entrance, Game.svelte). */
  let { strike = false }: { strike?: boolean } = $props();
  const uid = $props.id();
</script>

<svg class="duel-mark" class:strike viewBox="0 0 32 32" aria-hidden="true">
  <defs>
    <mask id="{uid}-cut" maskUnits="userSpaceOnUse" x="-8" y="-8" width="48" height="48">
      <rect x="-8" y="-8" width="48" height="48" fill="#fff" />
      <g transform="translate(16 16) rotate(45)"><g class="swing over"><path d={SWORD.cut} fill="#000" stroke="#000" stroke-width="2.2" stroke-linejoin="round" /></g></g>
    </mask>
  </defs>
  {#each ['under', 'over'] as side (side)}
    <g mask={side === 'under' ? `url(#${uid}-cut)` : undefined}>
      <g transform="translate(16 16) rotate({side === 'under' ? -45 : 45})">
        <g class="swing {side}">
          <path class="glow" d={SWORD.lines + SWORD.hair} />
          <path class="lines" d={SWORD.lines} />
          <path class="hair" d={SWORD.hair} />
        </g>
      </g>
    </g>
  {/each}
</svg>

<style>
  .duel-mark {
    display: inline-block;
    width: var(--mark-size, 1.4em);
    height: var(--mark-size, 1.4em);
    vertical-align: -0.35em;
    /* (Taller than the letters beside it, without making their line taller.) */
    margin-block: -0.2em;
    overflow: visible;
    fill: none;
    stroke: currentColor;
  }
  path {
    vector-effect: non-scaling-stroke;
  }
  .lines {
    stroke-width: var(--mark-stroke, 1px);
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .hair {
    stroke-width: calc(var(--mark-stroke, 1px) * 0.55);
    stroke-linecap: round;
    opacity: 0.85;
  }
  /* A soft copy of the lines under them: the glow, never on the lines themselves. */
  .glow {
    stroke-width: calc(var(--mark-stroke, 1px) * 2.8);
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: var(--glow, 0.2);
  }
  /* Struck: each sword swings in from wide of its place and crosses the other. */
  .strike .swing {
    animation: swing 0.5s cubic-bezier(0.6, 0, 0.9, 0.5) var(--strike-delay, 0s) backwards;
  }
  .strike .swing.under {
    --from: -40deg;
  }
  .strike .swing.over {
    --from: 40deg;
  }
  @keyframes swing {
    from {
      rotate: var(--from);
      opacity: 0;
    }
    40% {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .strike .swing {
      animation: none;
    }
  }
</style>
