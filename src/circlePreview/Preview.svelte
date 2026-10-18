<script lang="ts">
  import { circleNamed } from '../components/circles';
  import Avatar from '../components/Avatar.svelte';
  import { PLACES } from '../lib/circlePlaces';
  import { isPlateName, type PlateName } from '../lib/plates/index.ts';

  /** The circles, by their plates' names, as the page names them. */
  const NAMES: [PlateName, string][] = [
    ['eye', 'Eye'],
    ['monad', 'Monad'],
    ['rose', 'Rose'],
    ['moth', 'Moth'],
    ['blackSun', 'Black sun'],
  ];
  const label = (name: PlateName) => NAMES.find(([n]) => n === name)?.[1] ?? name;
  const asked = new URLSearchParams(location.search).get('c');
  let which = $state<PlateName>(isPlateName(asked) ? asked : 'eye');
  const Circle = $derived(circleNamed(which));
  /** Every place, as the game reads it (lib/circlePlaces.ts), and whether this circle stands there. */
  const places = $derived(Object.values(PLACES).map((p) => ({ ...p, here: (p.circles as readonly PlateName[]).includes(which) })));
  let replay = $state(0);
  let mood = $state<'idle' | 'good' | 'bad'>('idle');
  let avatar = $state(true);
  let w = $state(1200);
  let h = $state(800);
  // Two side by side, each as the end screen sizes its circle; the avatar 25% of it, as the end screen has it alone.
  const px = $derived(Math.floor(Math.min(w * 0.45, h * 0.72)));
</script>

<svelte:window bind:innerWidth={w} bind:innerHeight={h} />

<main>
  <nav>
    {#each NAMES as [name, text] (name)}
      <button class:on={which === name} onclick={() => (which = name)}>{text}</button>
    {/each}
    <span></span>
    <button class:on={avatar} onclick={() => (avatar = !avatar)}>Avatar</button>
    <button onclick={() => (replay += 1)}>Draw in again</button>
    <button onclick={() => (mood = 'idle')}>Idle</button>
    <button onclick={() => (mood = 'good')}>Right</button>
    <button onclick={() => (mood = 'bad')}>Wrong</button>
  </nav>
  <div class="pair">
    {#each ['whole', 'hollow'] as side (side)}
      <figure>
        <figcaption>{side === 'whole' ? 'whole' : 'hollow (round one avatar)'}</figcaption>
        <div class="stage" style:width="{px}px" style:height="{px}px">
          {#key `${which}${replay}${side}`}
            <Circle size="{px}px" state={mood} hollow={side === 'hollow'} />
          {/key}
          {#if avatar && side === 'hollow'}<div class="avatar"><Avatar name="Exile" hue={30} size={Math.round(px * 0.25)} /></div>{/if}
        </div>
      </figure>
    {/each}
  </div>
  <!-- Where each circle stands, read from the list the game reads (lib/circlePlaces.ts), so it is always as the game has it. -->
  <section class="places">
    <h2>Where the {label(which).toLowerCase()} stands</h2>
    <table>
      <tbody>
        {#each places as p (p.where)}
          <tr class:here={p.here}>
            <th>{p.where}</th>
            <td>
              {#each p.circles as name, k (name)}{k ? ', ' : ''}<button class="name" class:on={name === which} onclick={() => (which = name)}>{label(name)}</button>{/each}{#if p.how}<span class="how">; {p.how}</span>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if !places.some((p) => p.here)}<p class="none">The {label(which).toLowerCase()} stands nowhere yet.</p>{/if}
  </section>
</main>

<style>
  main {
    min-height: 100vh;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 28px;
    padding: 0 16px 40px;
    box-sizing: border-box;
    background: #0a0908;
  }
  .places {
    width: min(760px, 100%);
    color: #cbbfa8;
    font: 16px 'EB Garamond', serif;
  }
  .places h2 {
    margin: 0 0 8px;
    color: #d9a45a;
    font: 16px 'EB Garamond', serif;
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 6px 10px;
    border-top: 1px solid #2a231b;
    text-align: left;
    vertical-align: top;
    font-weight: normal;
  }
  th {
    width: 38%;
    color: #8f8471;
  }
  tr.here th {
    color: #e8c98e;
  }
  tr.here {
    background: #17130e;
  }
  .how {
    color: #8f8471;
  }
  .none {
    color: #8f8471;
  }
  button.name {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    text-decoration: underline dotted #5a4c3a;
  }
  button.name.on {
    color: #e8c98e;
    text-decoration: none;
  }
  .pair {
    display: flex;
    gap: 2vw;
    align-items: center;
  }
  figure {
    margin: 0;
    display: grid;
    justify-items: center;
    gap: 6px;
  }
  figcaption {
    color: #d9a45a;
    font: 16px 'EB Garamond', serif;
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
  nav {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    padding: 10px 0;
    background: #0a0908;
  }
  nav span {
    width: 16px;
  }
  button {
    font: 15px 'EB Garamond', serif;
    white-space: nowrap;
    padding: 4px 12px;
    color: #d9a45a;
    background: #1a1612;
    border: 1px solid #3a3024;
    cursor: pointer;
  }
  button.on {
    border-color: #d9a45a;
  }
</style>
