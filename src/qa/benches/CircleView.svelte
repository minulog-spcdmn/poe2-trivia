<script lang="ts">
  // The circle bench's view (./circle.ts): the circle picked, whole and
  // hollow side by side, each as large as the end screen sizes its own, the
  // avatar a quarter of it across as the end screen has it alone; and under
  // them where it stands, read from the list the game reads
  // (lib/circlePlaces.ts), so it is always as the game has it.
  import Avatar from '../../components/Avatar.svelte';
  import { circleNamed } from '../../components/circles';
  import { PLACES } from '../../lib/circlePlaces';
  import { isPlateName, type PlateName } from '../../lib/plates/index.ts';
  import type { PieceProps } from '../bench.ts';
  import { onAction } from '../frame/pieceState.svelte.ts';
  import { circle as bench } from './circle.ts';

  let { v, set, small }: PieceProps = $props();

  const NAMES = (bench.controls.find((c) => c.key === 'circle') as { options: { value: string; label: string }[] }).options;
  const label = (name: string) => NAMES.find((o) => o.value === name)?.label ?? name;
  const which = $derived<PlateName>(isPlateName(String(v.circle)) ? (v.circle as PlateName) : 'eye');
  const Circle = $derived(circleNamed(which));
  const mood = $derived((v.mood as 'idle' | 'good' | 'bad') ?? 'idle');
  const sides = $derived(v.side === 'both' ? ['whole', 'hollow'] : [String(v.side)]);
  /** Every place, and whether this circle stands there. */
  const places = $derived(Object.values(PLACES).map((p) => ({ ...p, here: (p.circles as readonly PlateName[]).includes(which) })));

  for (const m of ['idle', 'good', 'bad']) onAction(m, () => set({ mood: m }));

  let w = $state(1200);
  let h = $state(800);
  const px = $derived(small ? (sides.length > 1 ? 82 : 168) : Math.floor(Math.min((w - 64) / sides.length - 16, h * 0.72)));
</script>

<svelte:window bind:innerWidth={w} bind:innerHeight={h} />

<div class="bench" class:small>
  <div class="pair">
    {#each sides as side (side)}
      <figure>
        {#if !small}<figcaption>{side === 'whole' ? 'whole' : 'hollow (round one avatar)'}</figcaption>{/if}
        <div class="stage" style:width="{px}px" style:height="{px}px">
          {#key `${which}${side}`}
            <Circle size="{px}px" state={mood} hollow={side === 'hollow'} />
          {/key}
          {#if v.avatar && side === 'hollow'}<div class="avatar"><Avatar name="Exile" hue={30} size={Math.round(px * 0.25)} /></div>{/if}
        </div>
      </figure>
    {/each}
  </div>
  {#if !small}
    <section class="places">
      <h2>Where the {label(which).toLowerCase()} stands</h2>
      <table>
        <tbody>
          {#each places as p (p.where)}
            <tr class:here={p.here}>
              <th>{p.where}</th>
              <td>
                {#each p.circles as name, k (name)}{k ? ', ' : ''}<button class="name" class:on={name === which} onclick={() => set({ circle: name })}>{label(name)}</button>{/each}{#if p.how}<span class="how">; {p.how}</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if !places.some((p) => p.here)}<p class="none">The {label(which).toLowerCase()} stands nowhere yet.</p>{/if}
    </section>
  {/if}
</div>

<style>
  .bench {
    display: grid;
    justify-items: center;
    gap: 28px;
  }
  .pair {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  .small .pair {
    gap: 4px;
  }
  figure {
    margin: 0;
    display: grid;
    justify-items: center;
    gap: 6px;
  }
  figcaption,
  .places h2 {
    margin: 0;
    color: var(--gold);
    font: 16px var(--font-body);
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }
  .stage {
    position: relative;
    display: grid;
    place-items: center;
  }
  .avatar {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
  }
  .places {
    width: min(760px, 100vw - 32px);
    color: var(--text);
    font: 16px var(--font-body);
  }
  .places h2 {
    margin-bottom: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 6px 10px;
    border-top: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
    font-weight: normal;
  }
  th {
    width: 38%;
    color: var(--muted);
  }
  tr.here {
    background: rgba(255, 255, 255, 0.03);
  }
  tr.here th {
    color: var(--gold-hi);
  }
  .how,
  .none {
    color: var(--muted);
  }
  button.name {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    text-decoration: underline dotted var(--line);
    cursor: pointer;
  }
  button.name.on {
    color: var(--gold-hi);
    text-decoration: none;
  }
</style>
