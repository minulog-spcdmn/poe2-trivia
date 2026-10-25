<script lang="ts">
  // A headline figure on the overview: what it is, the number with its
  // change against the period before right under it, what it means in a
  // line, and its days in a small line (`spark`) at the foot. The whole tile
  // opens the view that tells more.
  import type { Snippet } from 'svelte';

  let { label, value, means, href, change, spark }: { label: string; value: string; means: string; href: string; change?: Snippet; spark?: Snippet } = $props();
</script>

<a class="kpi" {href}>
  <span class="name">{label}<span class="more" aria-hidden="true">›</span></span>
  <span class="value">{value}</span>
  {#if change}<span class="change">{@render change()}</span>{/if}
  <span class="means">{means}</span>
  {#if spark}<span class="spark">{@render spark()}</span>{/if}
</a>

<style>
  .kpi {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
    padding: 1.4rem 1.5rem 1.5rem;
    color: inherit;
    text-decoration: none;
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-radius: 4px;
    cursor: pointer;
    transition: border-color 0.2s;
  }
  .kpi:hover {
    border-color: var(--gold-lo);
  }
  .kpi:hover .more {
    color: var(--gold-hi);
    translate: 3px 0;
  }
  .name {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--a-ink);
  }
  .more {
    color: var(--a-muted);
    transition:
      color 0.2s,
      translate 0.2s;
  }
  .value {
    font-size: clamp(2.6rem, 3.4vw, 4rem);
    font-weight: 650;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--a-ink);
  }
  .means {
    font-size: 1.05rem;
    color: var(--a-muted);
  }
  /* At the foot, so the sparks of a row line up whatever the lines above them. */
  .spark {
    margin-top: auto;
    padding-top: 0.6rem;
  }
  .change {
    font-size: 1.125rem;
  }
  @media (max-width: 600px) {
    .kpi {
      padding: 1rem;
    }
    .name {
      font-size: 1.05rem;
    }
    .value {
      font-size: 2.6rem;
    }
    .means,
    .change {
      font-size: 0.95rem;
    }
  }
</style>
