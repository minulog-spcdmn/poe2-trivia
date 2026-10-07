<script lang="ts">
  // Placeholder: plate A of the descent is being drawn.
  let { deepest = null }: { deepest?: number | null } = $props();
</script>

<div class="todo">Plate A<br />deepest: {deepest ?? 'no run yet'}</div>

<style>
  .todo {
    display: grid;
    place-items: center;
    height: 14rem;
    border: 1px dashed var(--line);
    color: var(--muted);
    font-style: italic;
    text-align: center;
  }
</style>
