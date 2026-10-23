<!-- An answer's ✓ or ✕ at the reveal (QuestionView's rows and tiles, Today's
     unique), drawn as the page's other icons are: round strokes in the
     text's colour, the two of one weight and size, the ✓ upright with its long stroke
     curving a little, as a pen makes it. The box is cut close round them, so
     it takes no more room beside the answer than the glyph did. Sized by the
     parent's font: about as big as the glyph it stands for. Says "right" or
     "wrong" to a screen reader, as the glyph did. -->
<script lang="ts">
  let { shape }: { shape: 'check' | 'cross' } = $props();
</script>

<svg viewBox="3 3 18 18" aria-hidden="true"
  ><path d={shape === 'check' ? 'M5.5 13l4 4.5C12 13 15 8 19 4' : 'M5.5 5.5l13 13M18.5 5.5l-13 13'} /></svg
><span class="sr-only">{shape === 'check' ? 'right' : 'wrong'}</span>

<style>
  svg {
    display: block;
    width: 0.86em;
    height: 0.86em;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
