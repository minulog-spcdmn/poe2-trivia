<script lang="ts">
  // The QA desk: a bench for each thing of the game's (src/qa/benches): the
  // pieces, and a screen each of the game's. Its list on the left, the thing
  // itself live in the middle at the size picked, and its panel on the
  // right: its states, its controls, what can happen to it. Keys do the rest
  // (docs/qa.md lists them). The bench, its state, its controls and the size
  // are in the address, so a reload, the back button and a link sent to
  // someone all show the same.
  import { benchByKey, benchOfScene, benches, shelfOf } from '../benches/index.ts';
  import { sceneByKey } from '../scenes/index.ts';
  import sceneFiles from '../../data/sceneFiles.json';
  import { benchesTouched, touched } from '../change.ts';
  import { seatLabel, seatsIn, type Scene } from '../scene.ts';
  import { buildScene } from '../tweaks.ts';
  import { SIZES, isSizeKey, sizeOf, type SizeKey } from '../sizes.ts';
  import type { DeskMessage, FrameMessage } from '../messages.ts';
  import { KIND_LABEL, type Problem } from '../frame/checks.ts';
  import { sceneStateAt, stateAt, stateValues, valuesOf, valuesQuery, type Bench, type PieceBench, type SceneBench, type Value, type Values } from '../bench.ts';
  import Shelf from './Shelf.svelte';
  import Panel from './Panel.svelte';
  import Stage from './Stage.svelte';
  import Grid from './Grid.svelte';
  import Live from './Live.svelte';
  import Closeup from './Closeup.svelte';
  import { CantShow, askBefore, beforeSrc, compareShots, shotSrc, type Before, type Compared, type Shown } from './compare.ts';
  import { liveRoom, type LiveRoom } from '../live/room.ts';
  import { BETA, LOCAL } from '../../lib/channel.ts';

  /**
   * Live rooms only where their seats get rooms and storage of their own
   * (storage.ts' QA_SEAT, peer.ts): the dev server's channel and the beta's.
   * Under npm run dev:live a room would open among the live game's.
   */
  const LIVE_ROOMS = BETA || LOCAL;

  /** The design's boards, by name (docs/handoff/end-screen/screens). */
  const BOARDS: Record<string, string> = Object.fromEntries(
    Object.entries(import.meta.glob('../../../docs/handoff/end-screen/screens/*.webp', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [
      path.split('/').pop()!.replace('.webp', ''),
      url as string,
    ]),
  );

  const ALL = benches();
  const SCENES = ALL.flatMap((b) => (b.kind === 'scenes' ? b.scenes : []));

  /** A size to show at: a device's, or (fit) the desk's own window, the frame as large as the room there, at 1:1. */
  type Pick = SizeKey | 'fit';
  /** The view the address asks for. */
  type Asked = { bench: Bench; scene: Scene | null; given: Record<string, string>; size: Pick | null; seat: number | 'all' | null; all: boolean; zoomed: boolean; outlines: boolean; compare: boolean };
  function fromAddress(): Asked | null {
    const p = new URLSearchParams(location.search);
    const scene = sceneByKey(p.get('s')) ?? null;
    // (A scene's key gone since, folded into another's states: its screen.)
    const bench = scene ? benchOfScene(scene) : benchByKey(p.get('b') ?? p.get('s'));
    if (!bench) return null;
    const size = p.get('size');
    const seat = p.get('seat');
    return {
      bench,
      scene: scene ?? (bench.kind === 'scenes' ? bench.scenes[0] : null),
      given: Object.fromEntries([...p].filter(([k]) => k.startsWith('k.')).map(([k, v]) => [k.slice(2), v])),
      size: isSizeKey(size) || size === 'fit' ? size : null,
      seat: seat === 'all' ? 'all' : seat !== null && Number.isInteger(Number(seat)) ? Number(seat) : null,
      all: p.get('all') === '1',
      zoomed: p.get('z') === '1',
      outlines: p.get('o') !== '0',
      compare: p.get('cmp') === '1',
    };
  }
  const first = fromAddress();

  let bench = $state.raw<Bench>(first?.bench ?? ALL[0]);
  let scene = $state.raw<Scene | null>(first?.scene ?? null);
  /** The size picked: kept from bench to bench, so one size can be gone through at a time. */
  let size = $state<Pick>(first?.size ?? 'fit');
  let seatPicked = $state<number | 'all' | null>(first?.seat ?? null);
  let all = $state(first?.all ?? false);
  let zoomed = $state(first?.zoomed ?? false);
  let outlines = $state(first?.outlines ?? true);
  let frozen = $state(false);
  /** S: the UI's shadows and fills left to CSS, not the backdrop. */
  let css = $state(false);
  let reloads = $state(0);
  let holding = $state(false);
  let panning = $state(false);
  let query = $state('');
  /** Before and after (B): the code before this change beside the code now. */
  let comparing = $state(first?.compare ?? false);

  /** A piece's controls as set, by bench (each keeps its own while another is looked at). */
  let values = $state<Record<string, Values>>({});
  /** A scene's controls as set (only those set: the rest at their defaults), by scene. */
  let sceneSet = $state<Record<string, Record<string, Value | string>>>({});
  if (first) {
    if (first.bench.kind === 'piece') values[first.bench.key] = valuesOf(first.bench.controls, first.given);
    else if (first.scene) sceneSet[first.scene.key] = first.given;
  }

  const piece = $derived<PieceBench | null>(bench.kind === 'piece' ? bench : null);
  const screen = $derived<SceneBench | null>(bench.kind === 'scenes' ? bench : null);
  const v = $derived(piece ? (values[piece.key] ?? valuesOf(piece.controls)) : {});
  /** The scene as set: built, its controls (its own and every game's) and their values. */
  const set = $derived(screen && scene ? buildScene(scene, sceneSet[scene.key]) : null);
  const built = $derived(set?.built);
  /** A scene's controls away from their defaults, as its frames' address gives them. */
  const sceneQuery = $derived(set ? valuesQuery(set.controls, set.values) : []);
  const ownControls = $derived(scene?.controls ?? []);
  const sz = $derived(size === 'fit' ? null : sizeOf(size));
  /** Who the scene can be seen as, as set (a room without a seat's player has no seat for them). */
  const seats = $derived(scene && built ? seatsIn(scene, built) : []);
  /** A scene's seats shown: all side by side on a touch screen (they fit), one at a time on a larger one, unless one was picked. */
  // (A seat picked on a scene with more stays the last one there is on one with fewer.)
  // (Before and after shows one seat: the first, if all were side by side.)
  const seatShown = $derived<number | 'all'>(
    seats.length <= 1 ? 0 : seatPicked === 'all' ? (comparing ? 0 : 'all') : seatPicked !== null ? Math.min(seatPicked, seats.length - 1) : sz?.touch && !comparing ? 'all' : 0,
  );
  const seatNames = $derived(built ? seats.map((s) => seatLabel(s, built.state)) : []);
  const stateIndex = $derived(piece ? stateAt(piece, v) : screen && scene && set ? sceneStateAt(screen, scene, set.controls, set.values) : -1);
  const states = $derived(piece ? piece.states.map((s) => ({ label: s.label, group: '' })) : (screen?.states.map((s) => ({ label: s.label, group: s.group })) ?? []));
  /** The design's board, where the scene has one at this size and stands as it was drawn (its controls at their defaults). */
  const board = $derived(size !== 'fit' && scene?.boards?.[size] && !sceneQuery.length ? BOARDS[scene.boards[size]!] : undefined);

  /**
   * Going to another bench or state by hand (not a slider moved, not a frame
   * moving its own controls): a step the back button returns to.
   */
  let moves = $state(0);

  /**
   * This change: the benches the branch's files touch (src/qa/change.ts),
   * from the dev server (its git) or, on the beta, the list written as it
   * was built. The desk opens on the first when the address names none.
   */
  let change = $state<{ benches: { key: string; why: string }[]; uncovered: string[]; scenes: Set<string> } | null>(null);
  /** On the dev server (it answered for This change): where before and after can run. */
  let devServer = $state(false);
  void (async () => {
    for (const url of ['./__qa/change', './qa-change.json']) {
      const got = await fetch(url).then((r) => (r.ok ? r.json() : null), () => null);
      if (!got?.files) continue;
      devServer = url === './__qa/change';
      const hit = touched(got.files, sceneFiles, SCENES);
      change = { ...benchesTouched(got.files, hit, ALL), scenes: new Set(hit.scenes.map((s) => s.key)) };
      const opening = change.benches.map((t) => ALL.find((b) => b.key === t.key)).find(Boolean);
      // Not if the address named a bench, or one was picked meanwhile; and in place of the first, not a step after it.
      if (!first && opening && moves === 0) open(opening, opening.kind === 'scenes' ? opening.states.findIndex((s) => change!.scenes.has(s.scene.key)) : undefined, false);
      return;
    }
  })();

  /** Opens `b`, at its state `at` (a screen's first, by default). */
  function open(b: Bench, at?: number, step = true) {
    if (step) moves++;
    if (live) live = null;
    if (b !== bench) {
      seatPicked = null;
      all = false;
    }
    bench = b;
    scene = b.kind === 'scenes' ? b.scenes[0] : null;
    if (at !== undefined && at >= 0) goState(at, false);
  }
  function goState(i: number, step = true) {
    if (step) moves++;
    if (live) live = null;
    all = false;
    if (piece) {
      const s = piece.states[Math.max(0, Math.min(piece.states.length - 1, i))];
      if (s) values[piece.key] = stateValues(piece, s, v);
    } else if (screen) {
      const s = screen.states[Math.max(0, Math.min(screen.states.length - 1, i))];
      if (!s) return;
      scene = s.scene;
      sceneSet[s.scene.key] = { ...s.values };
    }
  }
  /** The benches in the order the list shows them, as the search leaves them. */
  let listed = $state.raw<Bench[]>(ALL);
  function goBench(dir: 1 | -1) {
    const i = listed.indexOf(bench);
    const next = listed[i < 0 ? 0 : Math.max(0, Math.min(listed.length - 1, i + dir))];
    if (next) open(next);
  }
  function setValue(key: string, value: Value) {
    if (piece) values[piece.key] = { ...v, [key]: value };
    else if (scene) {
      // (The watchers as shown, not as last asked for: one the other's share held back stays so, not coming back later.)
      const shown: Record<string, Value> = set && (key === 'joining' || key === 'watching') && 'joining' in set.values ? { joining: set.values.joining, watching: set.values.watching } : {};
      sceneSet[scene.key] = { ...sceneSet[scene.key], ...shown, [key]: value };
    }
  }
  /** The state last gone to, by bench: what "As it was" goes back to once a control has moved it off. */
  let picked = $state<Record<string, number>>({});
  $effect(() => {
    if (stateIndex >= 0) picked[bench.key] = stateIndex;
  });
  /** Back to the state last gone to (or, on another scene now, that scene as it comes). */
  function resetControls() {
    const i = picked[bench.key];
    if (screen && scene && screen.states[i]?.scene !== scene) sceneSet[scene.key] = {};
    else if (i !== undefined) goState(i, false);
    else if (piece) values[piece.key] = valuesOf(piece.controls);
    else if (scene) sceneSet[scene.key] = {};
  }

  /** What the frames shown found wrong, by frame, once checked: only those of the view up now. */
  let results = $state<Record<string, Problem[]>>({});
  /** The code before this change, while before and after is on (asked again until it's ready). */
  let before = $state<Before | null>(null);
  $effect(() => {
    if (!comparing) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const ask = async () => {
      // (Turned on afresh, a preparation that failed is tried again.)
      const got = await askBefore(first);
      first = false;
      if (stop) return;
      before = got;
      if (got.state === 'preparing') t = setTimeout(ask, 1000);
    };
    void ask();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  });
  const beforeOrigin = $derived(comparing && before?.state === 'ready' ? before.origin : null);

  /** What the frames show, as one string: a change makes them afresh. A piece's controls aren't in it: they reach its frame as they move. */
  const showing = $derived(
    (piece ? `${piece.key}|${size}|${all}|${reloads}` : `${scene?.key}|${size}|${seatShown}|${JSON.stringify(sceneQuery)}|${all}|${reloads}`) + (comparing ? `|before ${beforeOrigin}` : ''),
  );
  $effect(() => {
    void showing;
    results = {};
    frozen = false;
  });
  const problems = $derived.by(() => {
    const out: Problem[] = [];
    for (const p of Object.values(results).flat()) {
      const same = out.find((o) => o.kind === p.kind);
      if (same) {
        same.count += p.count;
        same.examples = [...new Set([...same.examples, ...p.examples])].slice(0, 3);
      } else out.push({ ...p, examples: [...p.examples] });
    }
    return out;
  });

  /** The frames of the view: a piece's one (every state, side by side, in that one too), or a seat's each. */
  const own = $derived.by((): Shown[] => {
    const base = (slot: string) => {
      const p = new URLSearchParams({ frame: slot, size });
      if (!outlines) p.set('o', '0');
      return p;
    };
    if (piece) {
      const p = base('p0');
      p.set('b', piece.key);
      for (const [k, x] of valuesQuery(piece.controls, v)) p.set(`k.${k}`, x);
      if (all) p.set('all', '1');
      return [{ src: `${location.pathname}?${p}`, title: piece.label, caption: all ? 'Every state' : '' }];
    }
    if (!scene) return [];
    const shown = seatShown === 'all' ? seats.map((_, i) => i) : [seatShown];
    return shown.map((seat, i) => {
      const p = base(`s${i}`);
      p.set('s', scene!.key);
      p.set('seat', String(seat));
      for (const [k, x] of sceneQuery) p.set(`k.${k}`, x);
      return { src: `${location.pathname}?${p}`, title: seatNames[seat] ?? 'The game', caption: shown.length > 1 || seats.length > 1 ? (seatNames[seat] ?? '') : '' };
    });
  });

  /** Each frame's size as the stage lays it out (CSS px): what a shot of it is taken at. */
  let box = $state<{ w: number; h: number } | null>(null);
  /** Where the view before and now differ, once compared (for `key`: what was shot). */
  let compared = $state.raw<{ key: string; state: 'checking' | 'done' | 'failed'; got?: Compared; error?: string; cantShow?: 'before' | 'now' } | null>(null);
  /** The area looked at close up, and whether what differs is laid over the frame now (D). */
  let closeup = $state(-1);
  let layered = $state(false);
  /** Before and after: the view's frame as the code before draws it, then as the code now does, each with what differs marked. */
  const frames = $derived.by((): Shown[] => {
    if (!comparing || !own.length) return own;
    const now = own[0];
    const areas = compared?.state === 'done' ? compared.got!.diff.areas : undefined;
    const base = before && 'base' in before && before.base ? ` (main at ${before.base.slice(0, 7)})` : '';
    const note = !before || before.state === 'preparing' ? `Getting the code before this change ready${before?.state === 'preparing' && before.step ? `: ${before.step}` : ''}…` : before.state === 'ready' ? undefined : 'No code from before here';
    return [
      { src: beforeOrigin ? beforeSrc(now.src, beforeOrigin, 'b0') : '', title: `Before${base}`, caption: `Before this change${base}`, note, marks: areas },
      { ...now, caption: 'Now', marks: areas, layer: layered && compared?.state === 'done' ? compared.got!.layer : undefined },
    ];
  });
  // Shot and compared a moment after what's shown stops changing: the view, a piece's controls, the frames' size.
  // (The frame's address as shot, without its outlines: O doesn't call for new shots.)
  const shotKey = $derived(comparing && beforeOrigin && box && own[0] ? `${showing}|${piece ? JSON.stringify(valuesQuery(piece.controls, v)) : ''}|${box.w}x${box.h}|${shotSrc(own[0].src)}` : '');
  $effect(() => {
    const key = shotKey;
    closeup = -1;
    if (!key) {
      compared = null;
      return;
    }
    const nowSrc = own[0].src;
    const { w, h } = box!;
    const origin = beforeOrigin!;
    const stop = new AbortController();
    compared = { key, state: 'checking' };
    const t = setTimeout(async () => {
      try {
        const got = await compareShots(shotSrc(nowSrc, origin), shotSrc(nowSrc), w, h, stop.signal);
        if (!stop.signal.aborted) compared = { key, state: 'done', got };
        else release(got);
      } catch (e) {
        if (!stop.signal.aborted) compared = { key, state: 'failed', error: (e as Error).message, cantShow: e instanceof CantShow ? e.side : undefined };
      }
    }, 700);
    return () => {
      clearTimeout(t);
      stop.abort();
    };
  });
  /** Lets go of a comparison's pictures: the shots and the difference laid over now. */
  function release(got: Compared) {
    URL.revokeObjectURL(got.layer);
    got.before.close();
    got.now.close();
  }
  // A comparison's pictures go once another takes its place (or the comparison came too late to be shown).
  $effect(() => {
    const got = compared?.got;
    return () => {
      if (got) release(got);
    };
  });
  function showAll(on: boolean) {
    all = on;
    if (on) comparing = false;
  }
  function compareOn(on: boolean) {
    comparing = on;
    if (on) all = false;
    closeup = -1;
  }

  /** To every frame up (a piece's, or each seat's), on its own origin (the code before's is another). */
  function tellFrames(m: DeskMessage) {
    for (const f of document.querySelectorAll<HTMLIFrameElement>('.middle > .stage-box iframe, .middle > .grid iframe')) f.contentWindow?.postMessage(m, new URL(f.src, location.href).origin);
  }
  $effect(() => tellFrames({ qa: 'outlines', on: outlines }));
  $effect(() => tellFrames({ qa: 'freeze', on: frozen }));
  $effect(() => tellFrames({ qa: 'css', on: css }));
  // A piece's controls, as they move.
  $effect(() => {
    if (piece) tellFrames({ qa: 'values', values: $state.snapshot(v) });
  });
  function replay() {
    frozen = false;
    if (piece) tellFrames({ qa: 'replay' });
    else reloads++;
  }
  function act(key: string) {
    frozen = false;
    tellFrames({ qa: 'action', key });
  }

  function onframe(m: FrameMessage, i = -1) {
    // (What's wrong is the code now's to find: the frame before only shows how it was.)
    if (m.qa === 'checked' && comparing && i === 0) return;
    if (m.qa === 'checked') results = { ...results, [m.slot]: m.problems };
    else if (m.qa === 'ready') {
      // (What changed while it loaded, before it listened.)
      if (frozen) tellFrames({ qa: 'freeze', on: true });
      if (css) tellFrames({ qa: 'css', on: true });
      if (piece) tellFrames({ qa: 'values', values: $state.snapshot(v) });
    }
    else if (m.qa === 'set' && piece) values[piece.key] = { ...v, ...m.values };
    else if (m.qa === 'pick') goState(m.index);
    else if (m.qa === 'key') press(m.key, m.up, m.repeat);
  }

  /** Play from here: the scene as a live room, while one is up. */
  let live = $state.raw<{ room: LiveRoom; scene: Scene; size: SizeKey } | null>(null);
  async function play() {
    if (!scene || !built?.state) return;
    const room = await liveRoom(built);
    if (room) live = { room, scene, size: size === 'fit' ? 'desktop' : size };
  }

  let shelf = $state<{ focus: () => void }>();
  function press(key: string, up = false, repeat = false) {
    if (live) return;
    if (key === 'h' || key === 'H') holding = !up && !!board;
    else if (key === 'Alt') panning = !up && zoomed;
    else if (up) return;
    // Held down, only the arrows go on: a switch held a moment too long would flip back and forth.
    else if (repeat && !key.startsWith('Arrow')) return;
    // (A control moved off every state: on from the state last gone to.)
    else if (key === 'ArrowDown') goState((stateIndex >= 0 ? stateIndex : (picked[bench.key] ?? -1)) + 1);
    else if (key === 'ArrowUp') goState(Math.max(0, (stateIndex >= 0 ? stateIndex : (picked[bench.key] ?? 1)) - 1));
    else if (key === 'ArrowRight') goBench(1);
    else if (key === 'ArrowLeft') goBench(-1);
    else if (/^[1-9]$/.test(key)) goState(Number(key) - 1);
    else if (key === 'a' || key === 'A') showAll(!all);
    else if ((key === 'b' || key === 'B') && devServer) compareOn(!comparing);
    else if ((key === 'd' || key === 'D') && comparing) layered = !layered;
    else if (key === 'Escape' && closeup >= 0) closeup = -1;
    else if (key === 'r' || key === 'R') replay();
    else if (key === 'f' || key === 'F') frozen = !frozen;
    else if (key === 'z' || key === 'Z') zoomed = !zoomed;
    else if (key === 'o' || key === 'O') outlines = !outlines;
    else if ((key === 's' || key === 'S') && !piece) css = !css;
    else if (key === '/') shelf?.focus();
  }
  /** Keys a slider moves itself by, while it has the focus. */
  const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
  function onkeydown(e: KeyboardEvent) {
    const t = e.target;
    // Typing in a box or a menu keeps every key; a slider keeps its own and a switch its space, the desk has the rest.
    if (t instanceof HTMLElement && (t.matches('textarea, select, input:not([type="range"], [type="checkbox"])') || (t.matches('input[type="range"]') && SLIDER_KEYS.has(e.key)))) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || (e.altKey && e.key !== 'Alt')) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '/', 'Alt'].includes(e.key)) e.preventDefault();
    press(e.key, false, e.repeat);
  }
  function onkeyup(e: KeyboardEvent) {
    if (['h', 'H', 'Alt'].includes(e.key)) press(e.key, true);
  }

  // The address follows: going to another bench or state by hand is a step back
  // can return to; the rest only changes the current one, a moment after it
  // stops moving (a slider dragged writes it once, and the browser's limit on
  // how often it's written is never met).
  let lastMoves = 0;
  let pending: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const p = new URLSearchParams();
    if (piece) {
      p.set('b', piece.key);
      for (const [k, x] of valuesQuery(piece.controls, v)) p.set(`k.${k}`, x);
    } else if (scene) {
      p.set('s', scene.key);
      for (const [k, x] of sceneQuery) p.set(`k.${k}`, x);
      if (seatPicked !== null) p.set('seat', String(seatPicked));
    }
    p.set('size', size);
    if (all) p.set('all', '1');
    if (zoomed) p.set('z', '1');
    if (!outlines) p.set('o', '0');
    if (comparing) p.set('cmp', '1');
    const url = `${location.pathname}?${p}`;
    const step = moves !== lastMoves;
    lastMoves = moves;
    clearTimeout(pending);
    if (url === location.pathname + location.search) return;
    if (step) history.pushState(null, '', url);
    else pending = setTimeout(() => history.replaceState(null, '', url), 250);
  });
  $effect(() => {
    const back = () => {
      const a = fromAddress();
      if (!a) return;
      clearTimeout(pending);
      live = null;
      bench = a.bench;
      scene = a.scene;
      if (a.bench.kind === 'piece') values[a.bench.key] = valuesOf(a.bench.controls, a.given);
      else if (a.scene) sceneSet[a.scene.key] = a.given;
      if (a.size) size = a.size;
      seatPicked = a.seat;
      all = a.all;
      zoomed = a.zoomed;
      outlines = a.outlines;
      comparing = a.compare;
    };
    addEventListener('popstate', back);
    return () => removeEventListener('popstate', back);
  });

  /** The sizes offered as buttons; the rest are in the menu beside them. */
  const QUICK: SizeKey[] = ['phone', 'tablet', 'laptop', 'desktop', 'uhd150', 'uhd'];
  const SHORT: Partial<Record<SizeKey, string>> = { phone: 'Phone', tablet: 'Tablet', laptop: 'Laptop', desktop: 'Desktop', uhd150: '4K 150%', uhd: '4K' };
</script>

<svelte:window {onkeydown} {onkeyup} onblur={() => ((holding = false), (panning = false))} />

<div class="desk">
  <Shelf benches={ALL} current={bench} touched={change} bind:query bind:listed bind:this={shelf} onopen={open} {shelfOf} />

  <div class="middle">
    <header class="top">
      <p class="where">
        <span class="scene">{bench.label}</span>
        {#if all}<span class="sep">•</span><span class="state">every state</span>
        {:else if stateIndex >= 0}<span class="sep">•</span><span class="state">{states[stateIndex].label}</span>
        {:else if scene}<span class="sep">•</span><span class="state">{scene.label}</span><span class="adjusted">as set</span>
        {:else}<span class="sep">•</span><span class="adjusted">as set</span>{/if}
        {#if scene && seatShown !== 'all' && seats.length > 1}<span class="sep">•</span><span>{seatNames[seatShown]}</span>{/if}
      </p>
      <div class="sizes" role="group" aria-label="Size">
        <button class:on={size === 'fit'} onclick={() => (size = 'fit')} title="As large as the room here, at 1:1">Window</button>
        {#each QUICK as k (k)}
          <button class:on={size === k} onclick={() => (size = k)} title="{sizeOf(k).label}, {sizeOf(k).w} × {sizeOf(k).h}">{SHORT[k]}</button>
        {/each}
        <select class:on={size !== 'fit' && !QUICK.includes(size)} value={size} onchange={(e) => ((size = e.currentTarget.value as SizeKey), e.currentTarget.blur())} aria-label="Every size">
          <option value="fit">This window</option>
          {#each SIZES as s (s.key)}<option value={s.key}>{s.label} • {s.w} × {s.h}</option>{/each}
        </select>
      </div>
    </header>
    {#if problems.length}
      <p class="problems" role="status">
        {#each problems as p, i (p.kind)}
          {#if i > 0}<span class="sep">•</span>{/if}
          <span title={p.examples.join(' • ')}>{KIND_LABEL[p.kind]}{#if p.count > 1}<span class="num times">×{p.count}</span>{/if}<span class="example">{p.examples[0]}</span></span>
        {/each}
        <span class="hint"><kbd>O</kbd> {outlines ? 'hides' : 'shows'} the outlines</span>
      </p>
    {/if}

    {#if live}
      <Live room={live.room} scene={live.scene} size={live.size} onexit={() => (live = null)} />
    {:else if all && screen}
      <Grid bench={screen} size={size === 'fit' ? 'desktop' : size} seat={seatShown === 'all' ? 0 : seatShown} {outlines} current={stateIndex} {onframe} onpick={(i) => goState(i)} />
    {:else}
      {#if comparing}
        <p class="compare" role="status">
          {#if !before || before.state === 'preparing'}Getting the code before this change ready…
          {:else if before.state !== 'ready'}No code from before this change here{#if before.state === 'failed'}: <span class="example">{before.error}</span>{/if}
          {:else if !compared || compared.state === 'checking'}Comparing…
          {:else if compared.cantShow === 'before'}<span class="differs">The code before can't show this</span><span class="sep">•</span>it's new in this change, or uses something that is:<span class="example">{compared.error}</span>
          {:else if compared.cantShow === 'now'}<span class="differs">This can't show</span><span class="sep">•</span>the code now fails on it:<span class="example">{compared.error}</span>
          {:else if compared.state === 'failed'}Couldn't compare: <span class="example">{compared.error}</span>
          {:else if !compared.got!.diff.areas.length}<span class="same">Looks the same</span>{#if compared.got!.diff.restless}<span class="sep">•</span>left out what moves on its own{/if}
          {:else}<span class="differs">Differs in {compared.got!.diff.areas.length} {compared.got!.diff.areas.length === 1 ? 'place' : 'places'}</span><span class="sep">•</span><span><span class="num">{(compared.got!.diff.share * 100).toFixed(compared.got!.diff.share < 0.01 ? 2 : 1)}%</span> of it</span>{#if compared.got!.diff.restless}<span class="sep">•</span>left out what moves on its own{/if}<span class="hint">click a mark to see it close up • <kbd>D</kbd> {layered ? 'hides' : 'lays'} what differs over now</span>{/if}
          <button class="off" onclick={() => compareOn(false)}>Done <kbd>B</kbd></button>
        </p>
      {/if}
      <Stage
        {frames}
        size={sz}
        {showing}
        {zoomed}
        {panning}
        board={holding ? board : undefined}
        origins={beforeOrigin ? [beforeOrigin] : []}
        picked={closeup}
        {onframe}
        onbox={(w, h) => (box = { w, h })}
        onmark={(j) => (closeup = j)}
      />
      {#if closeup >= 0 && compared?.state === 'done' && compared.got!.diff.areas[closeup]}
        <Closeup
          before={compared.got!.before}
          now={compared.got!.now}
          area={compared.got!.diff.areas[closeup]}
          n={closeup}
          of={compared.got!.diff.areas.length}
          onpick={(j) => (closeup = j)}
          onclose={() => (closeup = -1)}
        />
      {/if}
    {/if}
  </div>

  <Panel
    {bench}
    {states}
    {stateIndex}
    {all}
    controls={piece ? piece.controls : ownControls}
    tweaks={set ? set.controls.slice(ownControls.length) : []}
    v={piece ? v : (set?.values ?? {})}
    changed={piece ? undefined : (i) => !!change?.scenes.has(screen!.states[i].scene.key)}
    seats={seatNames}
    seat={seatShown}
    {frozen}
    {css}
    hasBoard={!!board}
    canPlay={!!built?.state && LIVE_ROOMS && !live}
    reason={change?.benches.find((t) => t.key === bench.key)?.why}
    onstate={goState}
    onall={() => showAll(!all)}
    canCompare={devServer && !live && (comparing || !!change?.benches.some((t) => t.key === bench.key))}
    {comparing}
    oncompare={() => compareOn(!comparing)}
    onvalue={setValue}
    onreset={resetControls}
    onseat={(s) => (seatPicked = s)}
    onact={act}
    onreplay={replay}
    onfreeze={() => (frozen = !frozen)}
    oncss={() => (css = false)}
    onplay={play}
    onhold={(on) => (holding = on)}
  />
</div>
