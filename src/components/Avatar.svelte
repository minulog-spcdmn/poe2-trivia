<script lang="ts">
  import { playerColor } from '../lib/ui';

  let { name, hue, size = 36, dim = false }: { name: string; hue: number; size?: number; dim?: boolean } = $props();
  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?');
</script>

<span class="avatar" class:dim style:--c={playerColor(hue)} style:--s="{size}px">{initial}</span>

<style>
  .avatar {
    flex: none;
    width: var(--s);
    height: var(--s);
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: calc(var(--s) * 0.45);
    color: #140f0a;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c), white 35%), var(--c) 60%, color-mix(in srgb, var(--c), black 45%));
    box-shadow:
      0 0 0 2px #0c0a08,
      0 0 0 3px color-mix(in srgb, var(--c), black 30%),
      0 4px 10px rgba(0, 0, 0, 0.5);
    transition: filter 0.3s;
  }
  .dim {
    filter: grayscale(1) brightness(0.55);
  }
</style>
