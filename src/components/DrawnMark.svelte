<!-- A cross, tick, chevron or struck ring drawn rather than set: a glyph sits
     wherever its font puts it on the line, so in a ring or a disc it lands off
     centre. The parent centres it (a grid) and sizes it: --mark-size, and
     --mark-stroke in screen pixels whatever the size. -->
<script lang="ts">
  let { shape = 'cross' }: { shape?: 'cross' | 'check' | 'chevron' | 'banned' } = $props();

  const PATHS = {
    cross: 'M1 1l8 8M9 1 1 9',
    check: 'M1 5.5 4 8.5 9 1.5',
    chevron: 'M3.5 1 7.5 5 3.5 9',
    // A ring struck through, its stroke meeting the ring: not allowed here.
    banned: 'M8.6 5a3.6 3.6 0 1 1-7.2 0a3.6 3.6 0 1 1 7.2 0M2.45 2.45l5.1 5.1',
  };
</script>

<svg viewBox="0 0 10 10" aria-hidden="true"><path d={PATHS[shape]} /></svg>

<style>
  svg {
    display: block;
    width: var(--mark-size, 8px);
    height: var(--mark-size, 8px);
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-width: var(--mark-stroke, 1px);
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  path {
    vector-effect: non-scaling-stroke;
  }
</style>
