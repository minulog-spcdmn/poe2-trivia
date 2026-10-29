<script lang="ts">
  // Stutter: whether the game runs smoothly on players' devices. Each device
  // in a game counts how its frames came (lib/stutter.ts), so this is games
  // as each device saw them: the share that stuttered a day on each kind of
  // device, where a deploy that made things worse shows as a jump, and the
  // period's figures against the period before's.
  import { DEVICES, type Device } from '../lib/stutter';
  import { fmt } from './chart';
  import Delta from './Delta.svelte';
  import How from './How.svelte';
  import { DEVICE_NAMES, MOMENT_NAMES, percent, stutterTop, type Counts } from './model';
  import type { Period, Read } from './read';
  import Section from './Section.svelte';
  import ShareLine from './ShareLine.svelte';

  let { read, period, weekly }: { read: Read; period: Period; weekly: boolean } = $props();

  const L = $derived(read.now);
  const B = $derived(read.before);
  const sum = (vs: number[]) => vs.reduce((n, v) => n + v, 0);
  /** A kind of device's games in a period, those that stuttered, a lot, and the moment most of them did. */
  const figures = (c: Counts, d: Device) => {
    const f = c.frames[d];
    const [moment, most] = (Object.entries(f.worst) as [keyof typeof f.worst, number][]).reduce((a, b) => (b[1] > a[1] ? b : a));
    return { f, games: sum(f.games), part: sum(f.stuttered), many: sum(f.many), worst: most ? moment : null };
  };
  const devices = $derived(DEVICES.map((d) => ({ device: d, now: figures(L, d), before: figures(B, d) })));
  const games = $derived(devices.reduce((n, d) => n + d.now.games, 0));
  const top = $derived(stutterTop(DEVICES.map((d) => L.frames[d]), L.days, weekly));
  const share = (x: { part: number; games: number }) => (x.games ? (100 * x.part) / x.games : null);
</script>

<div class="stack">
  <Section title="Stutter a {weekly ? 'week' : 'day'}" says="The share of games that stuttered on each kind of device. A jump is a change that made things worse there.">
    {#if games}
      <div class="devices">
        {#each devices as d (d.device)}
          <div class="device">
            <div class="head">
              <h3>{DEVICE_NAMES[d.device]}</h3>
              {#if d.now.games}<span class="soft"><b class="strong">{percent(d.now.part, d.now.games)}</b> of {fmt(d.now.games)}</span>{/if}
            </div>
            {#if d.now.games}
              <ShareLine days={L.days} part={d.now.f.stuttered} many={d.now.f.many} whole={d.now.f.games} {weekly} {top} label={DEVICE_NAMES[d.device]} />
            {:else}
              <p class="soft none">No games counted in these days.</p>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <p class="soft">No games counted in these days.</p>
    {/if}
  </Section>

  <Section title="By device" says="Games each kind of device showed, and how many stuttered.">
    <div class="scroll-x">
      <table class="table" aria-label="Stutter by kind of device">
        <thead>
          <tr>
            <th scope="col">Device</th>
            <th scope="col" class="n">Games</th>
            <th scope="col" class="n">Stuttered</th>
            <th scope="col" class="n opt">A lot</th>
            <th scope="col">Mostly at</th>
          </tr>
        </thead>
        <tbody>
          {#each devices as d (d.device)}
            <tr class:none={!d.now.games}>
              <th scope="row">{DEVICE_NAMES[d.device]}</th>
              <td class="n">{fmt(d.now.games)}</td>
              <td class="n">
                <b class="strong">{percent(d.now.part, d.now.games)}</b>
                <Delta now={share(d.now)} before={share(d.before)} rate worse="up" of={{ now: d.now.games, before: d.before.games }} period={period.before} />
              </td>
              <td class="n opt">{percent(d.now.many, d.now.games)}</td>
              <td class:soft={!d.now.worst}>{d.now.worst ? MOMENT_NAMES[d.now.worst] : '–'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Section>

  <How
    items={[
      'Each device in a game counts how its frames came, while the game was on screen and the page was seen (not the lobby or the results), once the game ends or is left. So a game of four counts four times, and a device that shows the results only is no game.',
      "Stuttered: over 1% of that time went to frames longer than 50 ms; a lot: 5% or more. By time, not by frames: the same hitches are a smaller share of a fast screen's frames.",
      'Mostly at: the moment (the deal, a question, the reveal) most of the stuttering time fell in, of the games that stuttered.',
      'A game seen for less than 20 seconds counts nothing. A hollow point rests on fewer than 5 games; the dashed line is the share over the whole period.',
      'Chrome and Edge on a computer are every Chromium browser there; an iPad is counted with the iPhones (one engine), an Android tablet with the phones.',
    ]}
  />
</div>

<style>
  .stack {
    display: grid;
    gap: 1.25rem;
  }
  .devices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.8rem 2.6rem;
  }
  .device {
    min-width: 0;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.2rem 1rem;
    margin-bottom: 0.6rem;
  }
  h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--a-text);
  }
  .strong {
    font-weight: 650;
    color: var(--a-ink);
  }
  .soft {
    color: var(--a-muted);
  }
  .none {
    margin: 0;
  }
  tr.none > * {
    color: var(--a-muted);
  }
  td :global(.delta) {
    margin-left: 0.5rem;
  }
  @media (max-width: 700px) {
    .devices {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  /* A big monitor: the four side by side. */
  @media (min-width: 1900px) {
    .devices {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
