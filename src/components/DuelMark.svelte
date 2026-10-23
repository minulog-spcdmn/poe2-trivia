<script lang="ts" module>
  // The deathmatch's mark: two swords crossed, in place of the ⚔ a font would
  // set, and the size of a capital beside it. Engraved like the lobby's mode
  // emblems (ModeIcon), but drawn to sit in a line of text: a few lines that
  // keep their width in screen pixels whatever its size, the sword behind cut
  // where the one in front crosses it, as the plates weave their straps
  // (docs/arcane-style.md), and a soft copy of the lines under them for the
  // glow. 32 unit viewBox, each sword drawn upright about the middle, then turned.

  /** A sword, point up, crossing the other halfway up its blade (on the origin): blade, guard, grip and pommel. */
  const SWORD = 'M0 -16.5V7.5M-4.6 7.5H4.6M0 7.5V12.4M1.3 13.7a1.3 1.3 0 1 1 -2.6 0a1.3 1.3 0 1 1 2.6 0Z';
  /** What of the sword in front the one behind is cut short of: its blade and guard. */
  const CUT = 'M0 -16.5V7.5M-4.6 7.5H4.6';
</script>

<script lang="ts">
  const uid = $props.id();
</script>

<svg class="duel-mark" viewBox="0 0 32 32" aria-hidden="true">
  <defs>
    <mask id="{uid}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
      <rect width="32" height="32" fill="#fff" />
      <path d={CUT} transform="translate(16 16) rotate(45)" stroke="#000" stroke-width="2.6" stroke-linecap="round" />
    </mask>
  </defs>
  <g mask="url(#{uid}-cut)">
    <g transform="translate(16 16) rotate(-45)">
      <path class="glow" d={SWORD} />
      <path class="lines" d={SWORD} />
    </g>
  </g>
  <g transform="translate(16 16) rotate(45)">
    <path class="glow" d={SWORD} />
    <path class="lines" d={SWORD} />
  </g>
</svg>

<style>
  /* A capital's height (Cinzel's, about 0.7em), centred on the capitals beside it. */
  .duel-mark {
    display: inline-block;
    width: var(--mark-size, 0.95em);
    height: var(--mark-size, 0.95em);
    vertical-align: -0.12em;
    overflow: visible;
    fill: none;
    stroke: currentColor;
  }
  path {
    vector-effect: non-scaling-stroke;
  }
  .lines {
    stroke-width: var(--mark-stroke, 1.15px);
    stroke-linecap: round;
  }
  /* A soft copy of the lines under them: the glow, never on the lines themselves. */
  .glow {
    stroke-width: calc(var(--mark-stroke, 1.15px) * 2.4);
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: var(--glow, 0.18);
  }
</style>
