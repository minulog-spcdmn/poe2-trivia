<script lang="ts">
  // The duel's two lines, always at the foot of the run (Cinzel): the Seed's
  // life and hit, and yours. The spread feeds the Seed's; your life feeds yours.
  import type { Run } from './rules';
  import { seedLine, youLine } from './words';

  let { run }: { run: Run } = $props();
</script>

<footer class="duel" aria-label="The duel">
  <p class="seed">{seedLine(run)}</p>
  <p class="you">{youLine(run)}</p>
</footer>

<style>
  .duel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 0 2px;
    border-top: 1px solid rgba(125, 99, 51, 0.3);
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
    text-align: center;
  }
  p {
    margin: 0;
  }
  .seed {
    color: #e8907a;
  }
  .you {
    color: var(--gold-hi);
  }
</style>
