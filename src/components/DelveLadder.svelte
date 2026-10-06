<script lang="ts">
  import { DELVE_LADDER } from '../lib/difficultyText';

  /** From here the depths are cold and deep: their numbers turn to ice. */
  const DEEP = 25;
</script>

<!-- How a descent gets harder, depth by depth: a thin engraved line down
     through a diamond at each step, fading out below the last (it goes on). -->
<ol class="ladder" aria-label="How Delve gets harder">
  {#each DELVE_LADDER as row (row.depth)}
    <li class:deep={row.depth >= DEEP}>
      <span class="depth"><span class="visually-hidden">Depth </span>{row.depth}</span>
      <span class="mark" aria-hidden="true"></span>
      <span class="text">{row.text}</span>
    </li>
  {/each}
</ol>

<style>
  .ladder {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: grid;
    grid-template-columns: 1.4rem 0.9rem 1fr;
    column-gap: 0.4rem;
    align-items: start;
  }
  .depth {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.82rem;
    line-height: 1.6rem;
    color: var(--gold-hi);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  li.deep .depth {
    color: #b9cff0;
  }
  .text {
    padding: 0.16rem 0;
    font-size: 0.92rem;
    line-height: 1.2rem;
    color: var(--muted);
  }
  /* The line runs the whole row, so the rows join into one; the diamond sits on it at the first line of text. */
  .mark {
    position: relative;
    align-self: stretch;
  }
  .mark::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
    translate: -50% 0;
    background: var(--gold-lo);
  }
  li:first-child .mark::before {
    top: 0.8rem;
  }
  li:last-child .mark::before {
    bottom: -0.6rem;
    background: linear-gradient(var(--gold-lo), transparent);
  }
  .mark::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 0.8rem;
    width: 5px;
    height: 5px;
    translate: -50% -50%;
    rotate: 45deg;
    background: var(--bg);
    border: 1px solid var(--gold);
    box-shadow: 0 0 6px rgba(201, 164, 92, 0.35);
  }
  li:first-child .mark::after {
    background: var(--gold);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
