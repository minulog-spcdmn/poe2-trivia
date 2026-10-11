<script lang="ts">
  import { playerColor } from '../lib/ui';
  import { initialOf, isHeldName } from '../lib/names';
  import { arcaneAura } from '../lib/fx/aura';
  import { CREATOR_TITLE } from '../lib/site';

  let { name, hue, size = 36, dim = false }: { name: string; hue: number; size?: number; dim?: boolean } = $props();
  const initial = $derived(initialOf(name) || '?');
  // A's thin apex and wide base make it look low when its cap height is
  // centered, so lift it slightly.
  const dy = $derived(initial === 'A' ? '0.31em' : '0.35em');
  // zoe_arcana made the game: her avatar wears a gilded ring and, with
  // effects on, a living aura (lib/fx/aura.ts).
  const creator = $derived(isHeldName(name));
</script>

<span
  class="avatar"
  class:dim
  class:creator
  style:--c={playerColor(hue)}
  style:--s="{size}px"
  role={creator ? 'img' : undefined}
  aria-label={creator ? CREATOR_TITLE : undefined}
  title={creator ? CREATOR_TITLE : undefined}
  use:arcaneAura={{ on: creator, dim }}
  ><svg viewBox="0 0 100 100"
    ><text x="50" y="50" {dy} text-anchor="middle">{initial}</text></svg
  ></span
>

<style>
  .avatar {
    flex: none;
    width: var(--s);
    height: var(--s);
    display: block;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c), white 35%), var(--c) 60%, color-mix(in srgb, var(--c), black 45%));
    box-shadow:
      0 0 0 2px #0c0a08,
      0 0 0 3px color-mix(in srgb, var(--c), black 30%),
      0 4px 10px rgba(0, 0, 0, 0.5);
    transition: filter 0.3s;
  }
  /* Her ring: a gold band set in ruby, with a faint ruby glow. It marks her
     with effects off too, and as shadows it takes no room. (BEZEL in
     lib/fx/orbit.ts is how far it reaches.) */
  .creator {
    box-shadow:
      0 0 0 1.5px #0c0a08,
      0 0 0 2.5px #efcf86,
      0 0 0 3.5px #8a1c2a,
      0 0 8px 3px rgba(222, 64, 82, 0.3),
      0 4px 10px rgba(0, 0, 0, 0.5);
  }
  /* The letter is drawn in SVG with its baseline offset by half of Cinzel's cap
     height (0.7em), so the glyph is optically centered at every size instead
     of depending on the font's asymmetric ascent/descent and line-box rounding. */
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  text {
    font-family: var(--font-cinzel);
    font-weight: 900;
    font-size: 45px;
    fill: #140f0a;
  }
  .dim {
    filter: grayscale(1) brightness(0.55);
  }
</style>
