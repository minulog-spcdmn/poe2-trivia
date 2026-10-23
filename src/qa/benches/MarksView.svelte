<script lang="ts">
  // The marks bench's view (./marks.ts): the tile's mark on a plain mock of
  // an answer in its colours (the real tiles, and how they answer the mark,
  // are in the game's scenes), and the seal beside its word as the verdict
  // chip sets it, or alone as the face-down token.
  import AnswerMark from '../../components/AnswerMark.svelte';
  import VerdictSign from '../../components/VerdictSign.svelte';
  import type { PieceProps } from '../bench.ts';

  let { v }: PieceProps = $props();

  const tone = $derived(String(v.verdict) as 'good' | 'bad' | 'late');
  const icon = $derived(tone === 'good' ? 'check' : tone === 'bad' ? 'cross' : 'clock');
  const word = $derived(tone === 'good' ? 'Correct' : tone === 'bad' ? 'Wrong' : "Time's up");
</script>

<div class="marks">
  <!-- Out of time, the mark that shows is the right answer's. -->
  <div class="answer {tone === 'bad' ? 'wrong' : 'right'}" style:--mark="{v.mark}px">
    <span>Headhunter</span>
    <span class="mark"><AnswerMark shape={tone === 'bad' ? 'cross' : 'check'} /></span>
  </div>
  {#if v.token}
    <span class="token bad" style:--seal="{v.seal}px"><VerdictSign icon={icon} token /></span>
  {:else}
    <span class="chip {tone}" style:--seal="{v.seal}px"><span class="glyph"><VerdictSign {icon} /></span>{word}</span>
  {/if}
</div>

<style>
  .marks {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.2rem;
  }
  .answer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-width: 220px;
    padding: 0.7rem 0.9rem;
    border: 1px solid;
    border-radius: 4px;
    font-family: var(--font-body);
    font-size: 1.05rem;
  }
  .answer.right {
    border-color: #5d8a50;
    background: linear-gradient(90deg, rgba(44, 64, 36, 0.9), rgba(22, 28, 17, 0.92));
    color: #d6e8c0;
  }
  .answer.wrong {
    border-color: #8e4434;
    background: linear-gradient(90deg, rgba(78, 32, 22, 0.9), rgba(34, 15, 11, 0.92));
    color: #eab3a3;
  }
  .mark {
    font-size: var(--mark);
    line-height: 1;
  }
  .chip {
    --v-icon: var(--verdict-good-icon);
    --v-tint: var(--verdict-good-tint);
    display: flex;
    align-items: center;
    gap: 0.55em;
    padding: 0.4em 0.94em 0.4em 0.4em;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8rem;
    line-height: 1.45;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--gold-hi);
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid var(--gold-lo);
    border-radius: 999px;
  }
  .glyph {
    width: var(--seal);
    height: var(--seal);
  }
  .bad {
    --v-icon: var(--verdict-bad-icon);
    --v-tint: var(--verdict-bad-tint);
  }
  .late {
    --v-icon: var(--verdict-late-icon);
    --v-tint: var(--verdict-late-tint);
  }
  .token {
    width: var(--seal);
    height: var(--seal);
    border-radius: 50%;
  }
</style>
