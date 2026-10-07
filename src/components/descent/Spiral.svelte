<script lang="ts">
  // Placeholder: the Spiral concept for the descent drawing is being drawn.
  let { deepest = null }: { deepest?: number | null } = $props();
</script>

<div class="todo">Spiral concept<br />deepest: {deepest ?? 'no run yet'}</div>

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
