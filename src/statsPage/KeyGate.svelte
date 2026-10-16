<script lang="ts">
  // The ledger's door: the GoatCounter API key it reads with, asked once and
  // kept in this browser alone. Says where to make one (read-only), and why
  // it's safe on a page anyone could open.
  import { KEY_PAGE } from './api';

  let { onkey, refused = '' }: { onkey: (key: string) => void; refused?: string } = $props();
  let key = $state('');
  let field = $state<HTMLInputElement>();
  $effect(() => field?.focus());

  function submit(e: Event) {
    e.preventDefault();
    if (key.trim()) onkey(key.trim());
  }
</script>

<form class="gate" onsubmit={submit}>
  <h2>Open the ledger</h2>
  <p>The ledger reads PoE2.Quest's counts from GoatCounter with an API key of yours. It stays in this browser and never leaves it for anywhere but GoatCounter.</p>
  <ol>
    <li>Open <a href={KEY_PAGE} target="_blank" rel="noreferrer">GoatCounter's API settings</a> (you may need to sign in).</li>
    <li>Make a new key with only <b>Read statistics</b> ticked.</li>
    <li>Paste it here.</li>
  </ol>
  {#if refused}<p class="refused" role="alert">{refused}</p>{/if}
  <label>
    <span>API key</span>
    <input bind:this={field} bind:value={key} type="password" autocomplete="off" spellcheck="false" placeholder="Paste the key" />
  </label>
  <button class="btn primary" type="submit" disabled={!key.trim()}>Open</button>
  <p class="small">Read-only: with it nobody can change or delete anything. To take it away, delete the key in GoatCounter or press "Forget key" here.</p>
</form>

<style>
  .gate {
    position: relative;
    width: min(32rem, 100%);
    margin: 3rem auto 0;
    padding: 1.8rem 1.6rem 1.6rem;
    background: var(--plate);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .gate::before {
    content: '';
    position: absolute;
    inset: -2px;
    background: var(--filigree);
    pointer-events: none;
  }
  h2 {
    font-size: 1.35rem;
    color: var(--gold-hi);
    margin-bottom: 0.6rem;
  }
  p,
  li {
    color: var(--text);
  }
  ol {
    padding-left: 1.3rem;
    margin: 0.6rem 0 1.2rem;
  }
  li + li {
    margin-top: 0.25rem;
  }
  a {
    color: var(--gold);
  }
  a:hover {
    color: var(--gold-hi);
  }
  label {
    display: block;
    margin-bottom: 1rem;
  }
  label span {
    display: block;
    font-family: var(--font-cinzel);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 0.35rem;
  }
  input {
    width: 100%;
    padding: 0.6rem 0.75rem;
    color: var(--text);
    background: #0d0b08;
    border: 1px solid var(--line);
    border-radius: 3px;
    /* Not Cinzel: a key's letters are case-sensitive, and Cinzel has capitals only. */
    font-family: var(--font-body);
    font-size: 1rem;
  }
  input:focus {
    outline: none;
    border-color: var(--gold);
  }
  .btn {
    width: 100%;
  }
  .refused {
    color: #f0a090;
    border-left: 2px solid var(--bad);
    padding-left: 0.7rem;
  }
  .small {
    margin: 1rem 0 0;
    font-size: 0.88rem;
    color: var(--muted);
  }
</style>
