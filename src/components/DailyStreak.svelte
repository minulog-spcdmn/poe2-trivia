<script module lang="ts">
  /** The badge's entrance (its in:scale delay and duration below). */
  export const BADGE_IN_DELAY = 350;
  export const BADGE_IN_MS = BADGE_IN_DELAY + 400 + 50;
  /**
   * How the badge is drawn: `pill` (the daily's own, filled with the run's
   * colour), or the game's streak chip (QuestionView's verdict at a streak:
   * a dark pill, the count lit in the run's colour), `chip` with the game's
   * lit check before it, `plain` without. (The two chips are tried on the
   * streak's test page.)
   */
  export type StreakLook = 'pill' | 'chip' | 'plain';
</script>

<script lang="ts">
  // The daily's streak badge: the game's streak badge, counted in days and
  // burning with the game's fire, in the colour of the run's step on the
  // ladder (lib/fx/streaks). Today's unique shows it under the answers; the
  // streak's test page (streak.html) shows it on its own.
  import { scale } from 'svelte/transition';
  import { ablaze, newFlame, turnsBlue, twinkle } from '../lib/fx/moments';
  import { onFxChange, type Handle } from '../lib/fx/core';
  import { dailyFlameOf, dailyHeatOf } from '../lib/fx/streaks';

  let {
    days,
    burning = days,
    look = 'pill',
  }: {
    /** The run the badge counts. */
    days: number;
    /** The run the fire burns for: yesterday's while today's answer lands, so it grows into `days` before the player's eyes. */
    burning?: number;
    look?: StreakLook;
  } = $props();

  /** How tall the fire may lick up from the badge: about half the scoreboard's, as the answers sit just above. */
  const FLAMES = 0.55;

  /**
   * Svelte action: the badge burns for a run of `days`, a little hotter
   * every day, and up the ladder's colours (lib/fx/streaks). A run that
   * grows while shown flares up as it catches; reaching a new colour, it
   * bursts, as the game's fire does turning blue.
   */
  function burn(node: HTMLElement, days: number) {
    let fire: Handle | null = null;
    let lit = 0;
    // Not before the badge has scaled in: a fire lit on a box still growing from nothing has no room and never catches.
    let ready = false;
    const light = (catching = false) => {
      fire?.stop(0.5);
      const flame = dailyFlameOf(lit);
      fire = ready && lit > 0 ? ablaze(node, FLAMES * dailyHeatOf(lit), flame.blue, flame.tint, catching) : null;
    };
    // Lit, it catches: a kindle at its foot, and flames rising (the badge's glow warms with them, below).
    const catches = setTimeout(() => {
      ready = true;
      light(true);
    }, BADGE_IN_MS);
    const set = (next: number, first = false) => {
      if (next === lit) return;
      const was = lit;
      lit = next;
      // Going from no fire to one (a first day), it catches as it would coming in.
      light(was === 0);
      if (!first && next > was) {
        twinkle(node);
        // A new colour on the ladder bursts, as the game's fire does turning blue.
        const flame = dailyFlameOf(next);
        if (was > 0 && flame !== dailyFlameOf(was)) {
          if (flame.blue) turnsBlue(node);
          else if (flame.tint) newFlame(node, flame.tint);
        }
      }
    };
    set(days, true);
    // Effects switched off and on, or the GL context lost and restored, wipe every shape: light it again.
    const relight = onFxChange(() => {
      fire?.stop(0);
      fire = null;
      light();
    });
    return {
      update: (next: number) => set(next),
      destroy: () => {
        clearTimeout(catches);
        relight();
        fire?.stop(0.3);
      },
    };
  }
</script>

{#if look === 'pill'}
  <b class="streak" style:--flame-rgb={dailyFlameOf(burning).css} style:--heat={dailyHeatOf(burning)} use:burn={burning} in:scale={{ start: 0.5, duration: 400, delay: BADGE_IN_DELAY }}>
    {#if days === 1}First day{:else}<span class="num">{days}</span> days in a row{/if}
  </b>
{:else}
  <b class="chip" class:plain={look === 'plain'} style:--flame-rgb={dailyFlameOf(burning).css} style:--heat={dailyHeatOf(burning)} use:burn={burning} in:scale={{ start: 0.5, duration: 400, delay: BADGE_IN_DELAY }}>
    {#if look === 'chip'}<span class="glyph" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 6.5" /></svg></span>{/if}
    {#if days === 1}<span class="word count">First day</span>{:else}<span class="word count"><b>{days}</b> days in a row</span>{/if}
  </b>
{/if}

<style>
  /* A streak of days: a small pill in the display type, warming with the streak. */
  .streak {
    position: relative;
    align-self: center;
    padding: 0.15em 0.75em 0.1em;
    font-family: var(--font-display);
    font-style: normal;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    /* In the colour of the run's step on the ladder (lib/fx/streaks DAILY_LADDER), hotter
       (--heat, 0 to 1) every day, as the scoreboard's fire. */
    --flame: rgb(var(--flame-rgb, 255, 110, 30));
    color: #fff1dc;
    background: linear-gradient(180deg, rgba(var(--flame-rgb, 255, 110, 30), 0.42), rgba(var(--flame-rgb, 255, 110, 30), 0.12)), rgba(10, 8, 6, 0.6);
    border: 1px solid color-mix(in srgb, var(--flame) calc(50% + 50% * var(--heat, 0)), transparent);
    border-radius: 999px;
    box-shadow:
      0 0 calc(10px + 18px * var(--heat, 0)) calc(3px * var(--heat, 0)) color-mix(in srgb, var(--flame) calc(30% + 40% * var(--heat, 0)), transparent),
      0 calc(-4px * var(--heat, 0)) calc(12px + 20px * var(--heat, 0)) color-mix(in srgb, var(--flame) calc(15% + 35% * var(--heat, 0)), transparent);
    text-shadow: 0 0 10px color-mix(in srgb, var(--flame) 70%, transparent);
    transition:
      box-shadow 1s,
      border-color 1s,
      background 1s;
    /* Its glow warms up as the fire catches (BADGE_IN_MS), not at full heat while it scales in. */
    animation: warm 0.45s ease-out 0.8s backwards;
  }
  @keyframes warm {
    from {
      border-color: color-mix(in srgb, var(--flame) 35%, transparent);
      box-shadow:
        0 0 0 0 transparent,
        0 0 0 0 transparent;
      text-shadow: 0 0 0 transparent;
    }
  }
  /* It smoulders: a wider glow fades in and out on a layer of its own. */
  .streak::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    box-shadow: 0 0 24px color-mix(in srgb, var(--flame) 40%, transparent);
    opacity: 0;
    animation: smoulder-badge 1.6s ease-in-out 1.3s infinite;
    pointer-events: none;
  }
  @keyframes smoulder-badge {
    50% {
      opacity: 1;
    }
  }
  .num {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
    font-size: 0.9em;
  }

  /* The game's streak chip (QuestionView's .verdict with its .count): a dark
     pill in the display type's capitals, the words lit in the run's colour
     as hot as it burns, the count in the body serif's lining figures. */
  .chip {
    --v-tint: 150, 200, 105;
    --flame: rgb(var(--flame-rgb, 255, 110, 30));
    position: relative;
    align-self: center;
    display: flex;
    align-items: center;
    gap: 0.55em;
    /* Letter spacing also trails the last letter: the right padding gives it back. */
    padding: 0.4em calc(1.1em - 0.16em) 0.4em 0.4em;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8rem;
    line-height: 1.45;
    font-style: normal;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    white-space: nowrap;
    background:
      radial-gradient(ellipse 3.2em 130% at 1.1em 50%, rgba(var(--v-tint), 0.2), transparent),
      rgba(0, 0, 0, 0.4);
    border: 1px solid var(--gold-lo);
    border-radius: 999px;
  }
  .chip.plain {
    padding-left: 1.1em;
    background: rgba(0, 0, 0, 0.4);
  }
  /* The game's lit check, as tall as the line. */
  .glyph {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.45em;
    height: 1.45em;
    color: #c2e3a6;
    border: 1px solid rgba(var(--v-tint), 0.75);
    border-radius: 50%;
    background: radial-gradient(circle at 50% 35%, rgba(var(--v-tint), 0.45), rgba(var(--v-tint), 0.12) 70%), rgba(0, 0, 0, 0.5);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 0 8px rgba(var(--v-tint), 0.45);
  }
  .glyph svg {
    width: 1.05em;
    height: 1.05em;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 2px rgba(var(--v-tint), 0.8));
  }
  .count {
    color: color-mix(in srgb, color-mix(in srgb, var(--flame) 55%, #fff4e0) calc(60% + 40% * var(--heat)), var(--gold-hi));
    text-shadow:
      0 0 calc(4px + 14px * var(--heat)) color-mix(in srgb, var(--flame) calc(30% + 70% * var(--heat)), transparent),
      0 0 calc(1px + 3px * var(--heat)) color-mix(in srgb, var(--flame) calc(40% + 50% * var(--heat)), transparent);
  }
  .count b {
    font-family: var(--font-body);
    font-variant-numeric: lining-nums;
    font-weight: 500;
    font-size: 1.3em;
    letter-spacing: 0;
    line-height: 1;
  }
</style>
