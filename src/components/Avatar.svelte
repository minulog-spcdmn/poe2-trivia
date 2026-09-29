<script lang="ts">
  import { playerColor } from '../lib/ui';

  let { name, hue, size = 36, dim = false }: { name: string; hue: number; size?: number; dim?: boolean } = $props();
  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?');
</script>

<span class="avatar" class:dim style:--c={playerColor(hue)} style:--s="{size}px"
  ><svg viewBox="0 0 100 100"
    ><text x="50" y="50" dy="0.35em" text-anchor="middle">{initial}</text></svg
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
  /* The letter is drawn in SVG with its baseline offset by half of Cinzel's cap
     height (0.7em), so the glyph is optically centered at every size instead
     of depending on the font's asymmetric ascent/descent and line-box rounding. */
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  text {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 45px;
    fill: #140f0a;
  }
  .dim {
    filter: grayscale(1) brightness(0.55);
  }
</style>
