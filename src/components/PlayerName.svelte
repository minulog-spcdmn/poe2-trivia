<script lang="ts">
  // A player's name as the label beside their avatar. The site creator's is
  // struck in gold foil, and now and then a glint of light crosses it (see
  // lib/glint.ts); everyone else's is the plain text. The foil only changes
  // the paint, never the metrics, so nothing moves when it's applied.
  import { isHeldName } from '../lib/names';
  import { CREATOR_TITLE } from '../lib/site';
  import { glint } from '../lib/glint';

  let { name }: { name: string } = $props();
  const creator = $derived(isHeldName(name));
</script>

{#if creator}<span class="creator" title={CREATOR_TITLE}
    ><span class="foil">{name}</span><span class="glint" use:glint aria-hidden="true"><span>{name}</span></span><span class="hint"
      >, {CREATOR_TITLE}</span
    ></span
  >{:else}{name}{/if}

<style>
  .creator {
    position: relative;
  }
  /* Gold leaf: pale along the tops of the letters, a deeper seam through the
     middle and a warm bounce near the baseline, like stamped foil, kept
     brighter than the other names around it. The faint halo is a static
     filter: the glint is a sibling layer, so it never makes it redraw. */
  .foil {
    background: linear-gradient(180deg, #fffaf0 12%, #fbe6b0 36%, #e7c078 55%, #f6db9c 71%, #cf9f52 92%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 0 5px rgba(240, 190, 100, 0.28));
  }
  /* The slit's mask is three names wide with the band in its middle, and at
     rest it waits off to the left of the name; lib/glint.ts slides the mask
     across. The slit is slanted, and its copy slanted back over the letters,
     both held still. */
  .glint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    pointer-events: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-mask-image: linear-gradient(90deg, transparent calc(50% - 16% / 3), #000 50%, transparent calc(50% + 16% / 3));
    mask-image: linear-gradient(90deg, transparent calc(50% - 16% / 3), #000 50%, transparent calc(50% + 16% / 3));
    -webkit-mask-size: 300% 100%;
    mask-size: 300% 100%;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: 100% 0;
    mask-position: 100% 0;
    transform: skewX(-20deg);
  }
  .glint > span {
    flex: none;
    white-space: nowrap;
    color: #fffaf0;
    text-shadow: 0 0 5px rgba(255, 236, 190, 0.85);
    transform: skewX(20deg);
  }
  /* Read out after the name, never shown (the tooltip says it on hover), and
     left out when the name is copied. */
  .hint {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    -webkit-user-select: none;
    user-select: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .glint {
      display: none;
    }
  }
</style>
