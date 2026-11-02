<script lang="ts">
  // The buttons' view (./buttons.ts): one button as the controls set it.
  import type { PieceProps } from '../bench.ts';

  let { v }: PieceProps = $props();

  const LABEL: Record<string, string> = { primary: 'New game', plain: 'Back', danger: 'Leave', ghost: 'Skip' };
  const look = $derived(String(v.look));
</script>

<div class="stage">
  <button
    class="btn"
    class:primary={look === 'primary'}
    class:danger={look === 'danger'}
    class:ghost={look === 'ghost'}
    class:small={v.size === 'small'}
    class:big={v.size === 'big'}
    class:wide={!!v.wide}
    disabled={!!v.disabled}>{LABEL[look]}</button
  >
</div>

<style>
  .stage {
    box-sizing: border-box;
    width: 100%;
    display: flex;
    justify-content: center;
    padding: 1.5rem;
  }
  .wide {
    width: 100%;
  }
</style>
