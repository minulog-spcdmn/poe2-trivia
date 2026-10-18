<script lang="ts">
  // The QA desk: one stop of the walk at a time (a scene at a size, from its
  // seats), as large as the window allows, and a strip with a mark for every
  // stop. Arrow keys walk it (docs/qa.md has every key). The stop, the
  // search and the zoom are in the address, so reloading, going back and
  // sending a link all give the same view.
  import { catalog } from '../scenes/index.ts';
  import sceneFiles from '../../data/sceneFiles.json';
  import { touched, type Touched } from '../change.ts';
  import { seatLabel } from '../scene.ts';
  import { isSizeKey, sizeOf, type SizeKey } from '../sizes.ts';
  import { isFrameMessage, type FrameMessage } from '../messages.ts';
  import { KIND_LABEL, type Problem } from '../frame/checks.ts';
  import { matches, stopOf, walk, type Stop } from './walk.ts';
  import Stage from './Stage.svelte';
  import Strip from './Strip.svelte';
  import Live from './Live.svelte';
  import { liveRoom, type LiveRoom } from '../live/room.ts';
  import type { Scene } from '../scene.ts';

  /** The design's boards, by name (docs/handoff/end-screen/screens). */
  const BOARDS: Record<string, string> = Object.fromEntries(
    Object.entries(import.meta.glob('../../../docs/handoff/end-screen/screens/*.webp', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [
      path.split('/').pop()!.replace('.webp', ''),
      url as string,
    ]),
  );

  const ALL = catalog();

  type View = { id: string | null; q: string; zoomed: boolean; outlines: boolean; view: 'change' | 'all' | null };
  function fromAddress(): View {
    const p = new URLSearchParams(location.search);
    const s = p.get('s');
    const size = p.get('size');
    const seat = p.get('seat');
    return { id: s && size ? `${s}|${size}|${seat ?? 0}` : null, q: p.get('q') ?? '', zoomed: p.get('z') === '1', outlines: p.get('o') !== '0', view: p.get('v') === 'change' ? 'change' : p.get('v') === 'all' ? 'all' : null };
  }
  const first = fromAddress();
  let query = $state(first.q);
  let zoomed = $state(first.zoomed);
  let outlines = $state(first.outlines);

  /**
   * This change: the scenes the branch's files touch (src/qa/change.ts), from
   * the dev server (its git) or, on the beta, the list written as it was
   * built. Walked by default when there are some and no stop was asked for.
   */
  let change = $state<(Touched & { base: string }) | null>(null);
  let view = $state<'change' | 'all'>(first.view ?? 'all');
  void (async () => {
    for (const url of ['./__qa/change', './qa-change.json']) {
      const got = await fetch(url).then((r) => (r.ok ? r.json() : null), () => null);
      if (!got?.files) continue;
      change = { base: got.base, ...touched(got.files, sceneFiles, ALL) };
      if (first.view === null && first.id === null && change.scenes.length) view = 'change';
      return;
    }
  })();
  const changing = $derived(new Map((change?.scenes ?? []).map((s) => [s.key, s.why])));
  /** What each stop's frames found wrong, by stop and frame, once checked. */
  let results = $state<Record<string, Record<string, Extract<FrameMessage, { qa: 'checked' }>>>>({});
  /**
   * What the last sweep found (scripts/qa.mjs, through the dev server): the
   * problems by stop, and the sizes a scene isn't walked at but had some at,
   * which join its walk.
   */
  type Shot = { scene: string; seat: number; size: string; problems: Problem[]; failed?: string; before?: string | null; changed?: number };
  let sweep = $state<{ at: string; shots: Shot[] } | null>(null);
  void fetch('./__qa/latest')
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => (sweep = m), () => {});
  const sweepMore = $derived.by(() => {
    const more = new Map<string, SizeKey[]>();
    for (const sh of sweep?.shots ?? []) if ((sh.problems.length || sh.failed) && isSizeKey(sh.size)) more.set(sh.scene, [...(more.get(sh.scene) ?? []), sh.size]);
    return more;
  });
  const swept = $derived.by(() => {
    const by: Record<string, Problem[]> = {};
    const seatsOf = new Map(ALL.map((s) => [s.key, s.seats.length]));
    for (const sh of sweep?.shots ?? []) {
      const n = seatsOf.get(sh.scene);
      if (!n || !isSizeKey(sh.size)) continue;
      const found = sh.failed ? [{ kind: 'error' as const, count: 1, examples: [`The sweep couldn't show it: ${sh.failed}`] }, ...sh.problems] : sh.problems;
      if (found.length) (by[stopOf(sh.scene, n, sh.size, sh.seat)] ??= []).push(...found);
    }
    return by;
  });
  const stops = $derived(walk(ALL.filter((s) => matches(s, query) && (view === 'all' || changing.has(s.key))), sweepMore));
  /** The stop shown, by id; a stop the search hides falls back to the walk's first. */
  let wanted = $state<string | null>(first.id);
  const at = $derived.by(() => {
    const i = stops.findIndex((s) => s.id === wanted);
    if (i >= 0 || wanted === null) return Math.max(0, i);
    // Gone (another seat or size than the walk has): the scene's first stop, if it's there.
    return Math.max(0, stops.findIndex((s) => wanted!.startsWith(`${s.scene.key}|`)));
  });
  const stop = $derived<Stop | undefined>(stops[at]);
  /** A stop's problems, every frame's together: as its frames found them here, or else as the last sweep did. */
  const problemsAt = (id: string): Problem[] => (results[id] ? Object.values(results[id]).flatMap((r) => r.problems) : (swept[id] ?? []));
  const bad = $derived(new Set(stops.map((s) => s.id).filter((id) => problemsAt(id).length)));
  /** Whether the stop's problems are the sweep's (it hasn't been checked here yet). */
  const fromSweep = $derived(!!stop && !results[stop.id] && !!swept[stop.id]);
  const problems = $derived.by(() => {
    const out: Problem[] = [];
    if (stop)
      for (const p of problemsAt(stop.id)) {
        const same = out.find((o) => o.kind === p.kind);
        if (same) {
          same.count += p.count;
          same.examples = [...new Set([...same.examples, ...p.examples])].slice(0, 3);
        } else out.push({ ...p, examples: [...p.examples] });
      }
    return out;
  });
  /** The last sweep's shots of the stop's seats as they were before (--before), and how much has changed since. */
  const shotsHere = $derived(stop ? stop.seats.map((seat) => sweep?.shots.find((sh) => sh.scene === stop.scene.key && sh.size === stop.size && sh.seat === seat)) : []);
  const befores = $derived(shotsHere.map((sh) => (sh?.before ? `./__qa/shot/${sh.before}` : null)));
  const changedBy = $derived(Math.max(0, ...shotsHere.map((sh) => sh?.changed ?? 0)));
  let holdingBefore = $state(false);
  /** Play from here: the stop's scene as a live room, while one is up. */
  let live = $state<{ room: LiveRoom; scene: Scene; size: SizeKey } | null>(null);
  async function play() {
    if (!stop || !built?.state) return;
    const room = await liveRoom(built);
    if (room) live = { room, scene: stop.scene, size: stop.size };
  }
  let reloads = $state(0);
  let holding = $state(false);
  let panning = $state(false);
  let searchEl = $state<HTMLInputElement>();

  const board = $derived(stop && stop.scene.boards?.[stop.size] ? BOARDS[stop.scene.boards[stop.size]!] : undefined);
  const built = $derived(stop?.scene.build());
  const seats = $derived(stop && built ? stop.seats.map((i) => seatLabel(stop.scene.seats[i], built.state)) : []);
  const size = $derived(stop ? sizeOf(stop.size) : undefined);

  function go(i: number) {
    const next = stops[Math.max(0, Math.min(stops.length - 1, i))];
    if (next) wanted = next.id;
  }
  /** The next scene's first stop; back: this scene's first, or from there the one before's. */
  function goScene(dir: 1 | -1) {
    if (!stop) return;
    let i = at;
    if (dir === 1) {
      while (stops[i]?.scene === stop.scene) i++;
      return go(i);
    }
    if (stops[i - 1]?.scene !== stop.scene) i--;
    const scene = stops[i]?.scene;
    while (stops[i - 1] && stops[i - 1].scene === scene) i--;
    go(i);
  }

  function press(key: string, up = false) {
    if (live) return;
    if (key === 'h' || key === 'H') holding = !up && !!board;
    else if (key === 'b' || key === 'B') holdingBefore = !up && befores.some(Boolean);
    else if (key === 'Alt') panning = !up && zoomed;
    else if (up) return;
    else if (key === 'ArrowRight') go(at + 1);
    else if (key === 'ArrowLeft') go(at - 1);
    else if (key === 'ArrowDown') goScene(1);
    else if (key === 'ArrowUp') goScene(-1);
    else if (key === 'z' || key === 'Z') zoomed = !zoomed;
    else if (key === 'o' || key === 'O') outlines = !outlines;
    else if (key === 'r' || key === 'R') reloads++;
    else if (key === '/') searchEl?.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.target === searchEl) {
      if (e.key === 'Escape' || e.key === 'Enter') searchEl?.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || (e.altKey && e.key !== 'Alt')) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '/', 'Alt'].includes(e.key)) e.preventDefault();
    press(e.key);
  }
  function onkeyup(e: KeyboardEvent) {
    if (['h', 'H', 'b', 'B', 'Alt'].includes(e.key)) press(e.key, true);
  }
  // The frames hand on the desk's keys pressed in them.
  $effect(() => {
    const heard = (e: MessageEvent) => {
      if (e.origin !== location.origin || !isFrameMessage(e.data) || e.data.qa !== 'key') return;
      press(e.data.key, e.data.up);
    };
    addEventListener('message', heard);
    return () => removeEventListener('message', heard);
  });

  // The address follows: a new stop is a step back can return to; the rest only changes the current one.
  let lastStop: string | null = null;
  $effect(() => {
    const p = new URLSearchParams();
    if (stop) {
      const [s, sz, seat] = stop.id.split('|');
      p.set('s', s);
      p.set('size', sz);
      if (seat !== '0') p.set('seat', seat);
    }
    if (query) p.set('q', query);
    if (zoomed) p.set('z', '1');
    if (!outlines) p.set('o', '0');
    if (view === 'change') p.set('v', 'change');
    const url = `${location.pathname}?${p}`;
    if (url === location.pathname + location.search) return;
    if (lastStop !== null && stop && stop.id !== lastStop) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
    lastStop = stop?.id ?? null;
  });
  $effect(() => {
    const back = () => {
      const v = fromAddress();
      lastStop = v.id;
      wanted = v.id;
      query = v.q;
      zoomed = v.zoomed;
      outlines = v.outlines;
      view = v.view ?? 'all';
    };
    addEventListener('popstate', back);
    return () => removeEventListener('popstate', back);
  });
</script>

<svelte:window {onkeydown} {onkeyup} onblur={() => ((holding = false), (holdingBefore = false), (panning = false))} />

<div class="desk">
  <div class="heads">
    <header class="top">
      <p class="where">
        {#if stop && size}
          <span class="scene" title={changing.get(stop.scene.key) ?? stop.scene.key}>{stop.scene.label}</span>
          <span class="sep">•</span>
          <span>{seats.length > 1 ? `${seats.length} seats` : seats[0]}</span>
          <span class="sep">•</span>
          <span>{size.label} <span class="num">{size.w} × {size.h}</span></span>
        {:else}
          <span class="scene">No scene matches “{query}”.</span>
        {/if}
      </p>
      {#if board}
        <button class="hold" onpointerdown={() => (holding = true)} onpointerup={() => (holding = false)} onpointerleave={() => (holding = false)}>Hold for design <kbd>H</kbd></button>
      {/if}
      {#if built?.state && !live}
        <button class="hold" onclick={play} title="This scene's room for real: every seat playable, by hand or by a bot, with its link to make bad">Play from here</button>
      {/if}
      {#if befores.some(Boolean)}
        <button class="hold" onpointerdown={() => (holdingBefore = true)} onpointerup={() => (holdingBefore = false)} onpointerleave={() => (holdingBefore = false)}>Hold for before <kbd>B</kbd></button>
      {/if}
      {#if change?.scenes.length}
        <div class="views" role="group" aria-label="Which scenes">
          <button class:on={view === 'change'} onclick={() => (view = 'change')}>This change <span class="num">{change.scenes.length}</span></button>
          <button class:on={view === 'all'} onclick={() => (view = 'all')}>Everything</button>
        </div>
      {/if}
      <div class="count">
        <button aria-label="Previous stop" onclick={() => go(at - 1)} disabled={at === 0}>‹</button>
        <span class="num">{stops.length ? at + 1 : 0} of {stops.length}</span>
        <button aria-label="Next stop" onclick={() => go(at + 1)} disabled={at >= stops.length - 1}>›</button>
      </div>
      <input class="search" type="search" placeholder="Find a scene  /" bind:value={query} bind:this={searchEl} aria-label="Find a scene" />
    </header>
    {#if view === 'change' && change?.uncovered.length}
      <p class="uncovered">No scene runs {change.uncovered.length === 1 ? 'this changed file' : `these ${change.uncovered.length} changed files`}: {change.uncovered.map((f) => f.split('/').pop()).join(', ')}</p>
    {/if}
    {#if changedBy > 0.001}
      <p class="different">Looks different from before: <span class="num">{changedBy < 0.01 ? '<1' : Math.round(changedBy * 100)}%</span> of the screen. Hold <kbd>B</kbd> to see it as it was.</p>
    {/if}
    {#if problems.length}
      <p class="problems" role="status">
        {#each problems as p, i (p.kind)}
          {#if i > 0}<span class="sep">•</span>{/if}
          <span title={p.examples.join(' • ')}>{KIND_LABEL[p.kind]}{#if p.count > 1}<span class="num times">×{p.count}</span>{/if}<span class="example">{p.examples[0]}</span></span>
        {/each}
        <span class="hint">{#if fromSweep}found by the last sweep{:else}<kbd>O</kbd> {outlines ? 'hides' : 'shows'} the outlines{/if}</span>
      </p>
    {/if}
  </div>

  {#if live}
    <Live room={live.room} scene={live.scene} size={live.size} onexit={() => (live = null)} />
  {:else if stop}
    <Stage {stop} {seats} {zoomed} {reloads} {panning} {outlines} board={holding ? board : undefined} befores={holdingBefore ? befores : undefined} onchecked={(id, slot, r) => (results[id] = { ...results[id], [slot]: r })} />
  {:else}
    <div class="empty"></div>
  {/if}

  <Strip {stops} {bad} current={stop?.id} onpick={(id) => (wanted = id)} />
</div>
