<script lang="ts">
  // A guest's choice to watch rather than play, and to take a seat again
  // (the lobby, the scoreboard's watching line, the game-over screen).
  import { MAX_SPECTATORS } from '../lib/game';
  import { session } from '../lib/session.svelte';

  const s = $derived(session.state!);
  const watching = $derived(session.justWatching);
  const lobby = $derived(s.phase === 'lobby');
  // A player steps aside only into a free place to watch, or one that someone
  // waiting for a seat gives up by taking theirs (the engine refuses it otherwise).
  const full = $derived(
    !session.spectating && (s.spectators?.length ?? 0) >= MAX_SPECTATORS && !s.spectators?.some((o) => !o.stay),
  );
  const title = $derived(
    full
      ? 'There is no room for more spectators.'
      : watching
        ? lobby
          ? 'Take a seat in the party'
          : 'Play in the next game'
        : 'Watch the games without playing',
  );
</script>

<button class="btn small ghost" disabled={full} {title} onclick={() => session.watch(!watching)}>
  {watching ? (lobby ? 'Take a seat' : 'Play next game') : 'Just watch'}
</button>

<style>
  button {
    margin-inline: 0.4em;
    font-style: normal;
  }
</style>
