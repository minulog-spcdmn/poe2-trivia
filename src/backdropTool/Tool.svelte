<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity';
  import { cloneData, ENV_TONES, ENVIRONMENTS, FIELDS, GROUPS, MOTION_RANGES, stopsOf, toneOf, type FieldSpec, type GenSettings, type Group, type Look, type MotionTweak, type RGB } from '../lib/backdropData';
  import { endgameAt, likenessAt, SHIPPED } from '../lib/backdrops';
  import { generate, hsv, seedOf, swatchOf, variationSeed } from '../lib/backdropGen';
  import { accentAt, brightnessAt, FX_SLOTS, luminanceAt, stratumName } from '../lib/descent';
  import { UNLIKE } from '../lib/likeness';
  import { PROFILE_NAMES } from '../lib/emberProfiles';
  import { readStored, writeStored } from '../lib/storage';
  import * as T from './state.svelte';

  const tool = T.tool;

  // ---- the panel: docked on the right on wide screens, a drawer on phones ----
  const wide = new MediaQuery('(min-width: 900px)');
  let open = $state(readStored('open') !== '0');
  $effect(() => {
    writeStored('open', open ? '1' : '0');
  });
  const DEV = import.meta.env.DEV;
  // Docked open, the panel would hide the scene's right side (the frost on
  // that wall, the lamps there): the scene ends where it begins instead.
  $effect(() => {
    document.documentElement.toggleAttribute('data-docked', wide.current && open);
  });

  // ---- reading -------------------------------------------------------------------
  const zoneName = (k: number) => SHIPPED.zones[k].name;
  const stratumOfDepth = (d: number) => Math.max(0, Math.floor((d - 1) / 10));
  /** What is shown changes: read again (the curve, the endgame's strata). */
  const shown = $derived(tool.shownVersion);
  const here = $derived.by(() => {
    void shown;
    return stratumName(stratumOfDepth(tool.depth));
  });

  // ---- colours -------------------------------------------------------------------
  /** How a field's colour is kept, as a multiplier of 0-255 (a tint about 1 is shown at 1.2 as white). */
  const SCALE: Record<string, number> = { rgb255: 1, rgb1: 255, tint: 255 / 1.2 };
  const DIGITS: Record<string, number> = { rgb255: 0, rgb1: 2, tint: 2 };
  const hex = (c: readonly number[], scale: number) =>
    '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v * scale))).toString(16).padStart(2, '0')).join('');
  function fromHex(h: string, scale: number, digits: number): [number, number, number] {
    const k = 10 ** digits;
    return [1, 3, 5].map((i) => Math.round((parseInt(h.slice(i, i + 2), 16) / scale) * k) / k) as [number, number, number];
  }
  const css = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(v)).join(' ')})`;

  // ---- writing the work ----------------------------------------------------------
  const look = $derived(tool.work.look);
  const fieldsOf = (g: Group) => FIELDS.filter((f) => f.group === g);
  function setColour(spec: FieldSpec, value: string) {
    (tool.work.look as unknown as Record<string, unknown>)[spec.key] = fromHex(value, SCALE[spec.kind], DIGITS[spec.kind]);
    T.changed();
  }
  function setNumber(key: keyof Look, value: number) {
    (tool.work.look as unknown as Record<string, unknown>)[key] = value;
    T.changed();
  }
  function setEnv(i: number, value: number) {
    tool.work.look.env[i] = value;
    T.changed();
  }
  /** Environment i's colours, the look's own from the first change on (three stops, its own colours to start from). */
  function ownTone(i: number) {
    const name = ENVIRONMENTS[i];
    const tones = tool.work.look.tones;
    const t = tones[name];
    if (!t || t.colors.length < 3) tones[name] = { colors: cloneData(stopsOf(toneOf(tool.work.look, i))), vary: toneOf(tool.work.look, i).vary };
    return tones[name]!;
  }
  function setStop(i: number, k: number, value: string) {
    ownTone(i).colors[k] = fromHex(value, 1, 0) as RGB;
    T.changed();
  }
  function setVary(i: number, value: number) {
    ownTone(i).vary = value;
    T.changed();
  }
  /** Back to the environment's own colours. */
  function ownColours(i: number) {
    delete tool.work.look.tones[ENVIRONMENTS[i]];
    T.changed();
  }
  const isOwn = (i: number) => JSON.stringify(toneOf(look, i)) === JSON.stringify(ENV_TONES[ENVIRONMENTS[i]].tone);
  /** The most details this zone and either neighbour show together through their handover (at most FX_SLOTS show). */
  const crowd = $derived.by(() => {
    const k = tool.zone;
    const zones = tool.draft.zones;
    const on = (env: number[]) => env.flatMap((v, i) => (v > 0 ? [i] : []));
    const mine = on(look.env);
    const both = (j: number) => (zones[j] ? new Set([...mine, ...on(zones[j].look.env)]).size : mine.length);
    return Math.max(both(k - 1), both(k + 1));
  });
  function setMotion(key: Exclude<keyof MotionTweak, 'profile'>, value: number) {
    tool.work.motion[key] = value;
    T.changed();
  }
  const num = (e: Event) => (e.currentTarget as HTMLInputElement).valueAsNumber;
  const fill = (v: number, lo: number, hi: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const fmt = (v: number, step = 0.01) => (step >= 1 ? String(Math.round(v)) : v.toFixed(step < 0.01 ? 3 : 2));

  const ENV_LABELS: Record<string, string> = { city: 'City lights' };
  const envLabel = (name: string) => ENV_LABELS[name] ?? name[0].toUpperCase() + name.slice(1);
  const MIST = ENVIRONMENTS.indexOf('mist');

  // ---- the generator's settings -------------------------------------------------
  /** The settings being set: the zones' generator's, or the endgame's (in the draft). */
  const settingsFor = (endgame: boolean): GenSettings => (endgame ? tool.draft.endgame.settings : tool.settings);
  function setSetting(endgame: boolean, change: (s: GenSettings) => void) {
    change(settingsFor(endgame));
    if (endgame) T.apply();
    else T.keep();
  }
  const hueStrip = Array.from({ length: 13 }, (_, i) => css(hsv(i * 30, 0.6, 0.9).map((v) => v * 255))).join(', ');

  // ---- variations ------------------------------------------------------------------
  const zoneStrip = $derived(T.stripSeeds().map((seed) => ({ seed, look: generate(seed, $state.snapshot(tool.settings) as GenSettings).look })));
  const stratum = $derived.by(() => {
    void shown;
    const seed = T.stratumSeed();
    return { name: stratumName(tool.stratum), gen: endgameAt(tool.stratum, seed), seed, pinned: T.pinnedSeed() };
  });
  /** How alike the stratum shown is to its nearest zone and its neighbours (lib/likeness.ts): similarity, 1 less the difference. */
  const likeness = $derived.by(() => {
    void shown;
    const l = likenessAt(tool.stratum, stratum.seed);
    const like = (d: number) => 1 - d;
    const most = 1 - UNLIKE;
    return { zone: zoneName(l.zone), zoneLike: like(l.difference), before: like(l.before), after: like(l.after), most, beforeName: tool.stratum === T.ZONES ? zoneName(T.ZONES - 1) : `stratum ${tool.stratum}` };
  });
  const stratumStrip = $derived.by(() => {
    void shown;
    const base = T.stratumSeed();
    return Array.from({ length: 6 }, (_, i) => {
      const seed = variationSeed(base, i);
      return { seed, look: endgameAt(tool.stratum, seed).look };
    });
  });
  const pins = $derived(
    Object.entries(tool.draft.endgame.pinned)
      .map(([n, seed]) => ({ n: Number(n), seed }))
      .sort((a, b) => a.n - b.n),
  );

  let seedText = $state('');
  // The seed the look came from, to read or copy (or type over).
  $effect(() => {
    if (tool.seed !== null) seedText = String(tool.seed);
  });
  function onSeed(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (!v.trim()) return;
    T.generateWork(seedOf(v));
    tool.strip = seedOf(v);
  }
  let baseText = $state('');
  function onBase(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (!v.trim()) return;
    tool.draft.endgame.seed = seedOf(v);
    T.apply();
  }
  function newBase() {
    tool.draft.endgame.seed = Math.floor(Math.random() * 0x100000000) >>> 0;
    T.apply();
  }

  // ---- depth -----------------------------------------------------------------------
  $effect(() => {
    if (!tool.walking) return;
    const id = setInterval(() => {
      if (tool.depth >= T.MAX_DEPTH) tool.walking = false;
      else T.setDepth(tool.depth + 1);
    }, 1500);
    return () => clearInterval(id);
  });
  const CHIPS = [1, 11, 21, 31, 41, 51, 61, 71, 81, 91, 101, 151, 201];

  // ---- the brightness curve --------------------------------------------------------
  const CURVE = 200;
  let curve = $state<{ drawn: number[]; target: number[]; rises: number[] }>({ drawn: [], target: [], rises: [] });
  $effect(() => {
    void shown;
    const id = setTimeout(() => {
      const drawn: number[] = [];
      const target: number[] = [];
      const rises: number[] = [];
      for (let d = 1; d <= CURVE; d++) {
        drawn.push(brightnessAt(d));
        target.push(luminanceAt(d));
        if (d > 1 && drawn[d - 1] > drawn[d - 2] * 1.008) rises.push(d);
      }
      curve = { drawn, target, rises };
    }, 150);
    return () => clearTimeout(id);
  });
  const W = 300;
  const H = 64;
  const top = $derived(Math.max(1e-6, ...curve.drawn, ...curve.target) * 1.06);
  const px = (d: number) => ((d - 1) / (CURVE - 1)) * W;
  const py = (v: number) => H - (v / top) * (H - 4);
  const line = (vs: number[]) => vs.map((v, i) => `${px(i + 1).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  /** The zones whose measured corrections are dropped as shown (a look not as measured). */
  const dropped = $derived.by(() => {
    void shown;
    return T.shown().zones.map((z) => !z.measured);
  });
</script>

{#snippet swatch(l: Look, label: string, on: boolean, pick: () => void, title: string)}
  {@const sw = swatchOf(l)}
  <button
    class="swatch"
    class:on
    onclick={pick}
    {title}
    style:--s0={sw.smoke[0]}
    style:--s1={sw.smoke[1]}
    style:--s2={sw.smoke[2]}
    style:--s3={sw.smoke[3]}
    style:--floor={sw.floor}
    style:--haze={sw.haze}
    style:--ember={sw.ember}
  >
    <span class="spark"></span>
    {#if label}<i class="num">{label}</i>{/if}
  </button>
{/snippet}

{#snippet range(label: string, value: number, lo: number, hi: number, step: number, set: (v: number) => void)}
  <label class="field">
    <span class="lbl">{label}</span>
    <input type="range" min={lo} max={hi} {step} {value} oninput={(e) => set(num(e))} style:--fill={fill(value, lo, hi)} />
    <i class="num val">{fmt(value, step)}</i>
  </label>
{/snippet}

{#snippet settings(endgame: boolean)}
  {@const s = settingsFor(endgame)}
  <div class="hues" style:--strip={hueStrip}>
    {@render range('Hue from', s.hue[0], 0, 360, 1, (v) => setSetting(endgame, (x) => (x.hue = [v, x.hue[1]])))}
    {@render range('Hue to', s.hue[1], 0, 360, 1, (v) => setSetting(endgame, (x) => (x.hue = [x.hue[0], v])))}
  </div>
  {@render range('Saturation from', s.sat[0], 0, 1, 0.01, (v) => setSetting(endgame, (x) => (x.sat = [Math.min(v, x.sat[1]), x.sat[1]])))}
  {@render range('Saturation to', s.sat[1], 0, 1, 0.01, (v) => setSetting(endgame, (x) => (x.sat = [x.sat[0], Math.max(v, x.sat[0])])))}
  {@render range('Darkness', s.darkness, 0, 1, 0.01, (v) => setSetting(endgame, (x) => (x.darkness = v)))}
  {@render range('Detail', s.detail, 0, 1, 0.01, (v) => setSetting(endgame, (x) => (x.detail = v)))}
  {@render range('Embers', s.embers, 0, 1, 0.01, (v) => setSetting(endgame, (x) => (x.embers = v)))}
{/snippet}

{#if !wide.current && !open}
  <button class="fab" onclick={() => (open = true)} aria-label="Open the backdrop tool">Backdrops</button>
{/if}

<aside class="tool" class:wide={wide.current} class:open class:shut={wide.current && !open} aria-label="Backdrop tool">
  {#if wide.current && !open}
    <button class="tab" onclick={() => (open = true)} aria-label="Open the backdrop tool"><span>Backdrops</span></button>
  {:else}
    <header>
      <div class="title">
        <b>Backdrops</b>
        <span class="status">Depth <i class="num" style:color={accentAt(tool.depth)}>{tool.depth}</i> • {here}</span>
      </div>
      <button class="close" onclick={() => (open = false)} aria-label="Close the backdrop tool">{wide.current ? '›' : '×'}</button>
    </header>

    <div class="body">
      <details open>
        <summary>Depth</summary>
        <div class="line">
          <button class="small" onclick={() => T.setDepth(tool.depth - 1)} disabled={tool.depth <= 1} aria-label="One depth up">−</button>
          <input type="range" min="1" max={T.MAX_DEPTH} value={tool.depth} oninput={(e) => T.setDepth(num(e))} aria-label="Depth" style:--fill={fill(tool.depth, 1, T.MAX_DEPTH)} />
          <button class="small" onclick={() => T.setDepth(tool.depth + 1)} disabled={tool.depth >= T.MAX_DEPTH} aria-label="One depth down">+</button>
          <i class="num big">{tool.depth}</i>
        </div>
        <div class="chips">
          {#each CHIPS as d (d)}
            <button class="chip" class:on={stratumOfDepth(tool.depth) === stratumOfDepth(d)} onclick={() => T.setDepth(d)} style:--accent={accentAt(d)} title="Depth {d}">
              <i class="num">{d}</i>
            </button>
          {/each}
          <button class="chip walk" class:on={tool.walking} onclick={() => (tool.walking = !tool.walking)}>{tool.walking ? 'Stop' : 'Walk down'}</button>
        </div>
        <p class="hint">Walk down goes a depth every 1.5 s, as a run would, to judge the handovers: the next zone's embers take over one by one, its light, smoke and details from its fourth depth. A jump of more than three depths cross-fades.</p>
      </details>

      <details open>
        <summary>Brightness</summary>
        <svg class="curve" viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="Estimated brightness from depth 1 to 200">
          <polyline class="target" points={line(curve.target)} />
          <polyline class="drawn" points={line(curve.drawn)} />
          {#each curve.rises as d (d)}<circle class="rise" cx={px(d)} cy={py(curve.drawn[d - 1])} r="2.2" />{/each}
          {#if tool.depth <= CURVE}<line class="here" x1={px(tool.depth)} x2={px(tool.depth)} y1="0" y2={H} />{/if}
        </svg>
        <div class="axis"><i class="num">1</i><i class="num">100</i><i class="num">200</i></div>
        <p class="hint">
          The scene's average brightness by depth as the game estimates it (lib/descent.ts; nothing is drawn or read back): solid with its solved light, dashed the curve it keeps to.
          {#if curve.rises.length}<b class="warn">Brighter than the depth before at <i class="num">{curve.rises.slice(0, 6).join(', ')}</i>.</b>{/if}
          The measured corrections hold only for the zones as shipped{#if dropped.some((x) => x)}; dropped here for {dropped.flatMap((x, k) => (x ? [zoneName(k)] : [])).join(', ')}{/if}.
        </p>
      </details>

      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={tool.tab === 'zones'} class:on={tool.tab === 'zones'} onclick={() => T.showTab('zones')}>Zones</button>
        <button role="tab" aria-selected={tool.tab === 'endgame'} class:on={tool.tab === 'endgame'} onclick={() => T.showTab('endgame')}>Endgame</button>
      </div>

      {#if tool.tab === 'zones'}
        <div class="zones">
          {#each SHIPPED.zones as z, k (z.name)}
            <button class="zone" class:on={k === tool.zone} onclick={() => T.pickZone(k)} style:--accent={css(tool.draft.zones[k].look.accent)}>
              <i class="num">{k + 1}</i>
              <span>{z.name.replace(/^The /, '')}</span>
              {#if T.zoneChanged(k)}<em class="dot" title="Changed in the draft"></em>{/if}
            </button>
          {/each}
        </div>
        <div class="current">
          <div class="pname">
            {zoneName(tool.zone)}
            <em class="tag">depths <i class="num">{10 * tool.zone + 1}</i> to <i class="num">{10 * tool.zone + 10}</i></em>
          </div>
          <p class="hint">
            {#if T.unused()}Changed here, not yet used for the zone.{:else if T.zoneChanged(tool.zone)}The draft gives it a new look.{:else}As shipped.{/if}
            {#if tool.seed !== null}Generated from seed <i class="num">{tool.seed}</i>.{/if}
            Its light: <i class="num">{T.workLight().toFixed(2)}</i>{#if dropped[tool.zone]}, worked out from the estimate (its measured corrections dropped){:else}, as measured{/if}.
          </p>
          <div class="grid three">
            <button class="primary" onclick={T.useForZone} disabled={!T.unused()}>Use for this zone</button>
            <button onclick={() => T.revertWork()} disabled={!T.unused()}>Revert</button>
            <button onclick={() => T.revertWork(true)}>As shipped</button>
          </div>
        </div>

        <details open>
          <summary>Generate</summary>
          <div class="line">
            <button class="small primary" onclick={T.generateNew}>Generate</button>
            <input class="seed" type="text" placeholder="Seed" bind:value={seedText} onchange={onSeed} aria-label="Seed (a number or any word)" />
            <button class="small" onclick={T.aroundZoneHue} title="Set the hue range to this look's hue, 30 degrees either way">Around its hue</button>
          </div>
          <span class="sub">Variations</span>
          <div class="strip">
            {#each zoneStrip as v (v.seed)}{@render swatch(v.look, '', v.seed === tool.seed, () => T.generateWork(v.seed), `Seed ${v.seed}`)}{/each}
          </div>
          {@render settings(false)}
          <p class="hint">Locked groups (below) stay as they are when the rest is generated again.</p>
        </details>

        {#each GROUPS as g (g.id)}
          <div class="group">
            <label class="lock" title="Keep it as it is when the rest is generated again">
              <input type="checkbox" checked={tool.locked.includes(g.id)} onchange={() => T.toggleLock(g.id)} /> Lock
            </label>
            <details open={g.id !== 'details' && g.id !== 'glints'}>
              <summary>{g.label}</summary>
              {#if g.id === 'motion'}
                <label class="field">
                  <span class="lbl">Profile</span>
                  <select value={tool.work.motion.profile} onchange={(e) => T.setProfile((e.currentTarget as HTMLSelectElement).value)}>
                    {#each PROFILE_NAMES as name (name)}<option value={name}>{name}</option>{/each}
                  </select>
                </label>
                {#each Object.entries(MOTION_RANGES) as [key, [lo, hi, label]] (key)}
                  {@const k = key as Exclude<keyof MotionTweak, 'profile'>}
                  {@render range(label, tool.work.motion[k], lo, hi, 0.01, (v) => setMotion(k, v))}
              {/each}
                <p class="hint">A zone's embers all move one way: a profile (the zones' own, or the start page's) with its speed, rise or fall (negative falls), drift, turbulence and swirl round the eddies.</p>
              {:else if g.id === 'details'}
                {#each ENVIRONMENTS as name, i (name)}
                  {@render range(envLabel(name), look.env[i], 0, 1, 0.01, (v) => setEnv(i, v))}
                  {#if look.env[i] > 0}
                    {@const tone = toneOf(look, i)}
                    <div class="tone">
                      {#each stopsOf(tone) as c, k (k)}
                        <label class="stop" title={ENV_TONES[name].labels[k]}>
                          <input type="color" value={hex(c, 1)} oninput={(e) => setStop(i, k, (e.currentTarget as HTMLInputElement).value)} aria-label="{envLabel(name)}: {ENV_TONES[name].labels[k]}" />
                          <span>{ENV_TONES[name].labels[k]}</span>
                        </label>
                      {/each}
                      <button class="small" onclick={() => ownColours(i)} disabled={isOwn(i)} title="Back to this detail's own colours">Own</button>
                    </div>
                    {@render range('Variation', tone.vary, 0, 1, 0.01, (v) => setVary(i, v))}
                  {/if}
              {/each}
                <p class="hint">
                  The details the backdrop already draws, each at its own strength, in its colours: what each stop colours is named under it, and Variation is how far the colour wanders between them, across the screen and slowly over time. Mist past <i class="num">0.45</i> brings stone trunks in{#if look.env[MIST] >= 0.45}<b class="warn">: showing now</b>{/if}.
                  At most <i class="num">{FX_SLOTS}</i> show at once, a handover between two zones included{#if crowd > FX_SLOTS}<b class="warn">: this zone and its neighbour show <i class="num">{crowd}</i>, so the faintest are left out as they hand over</b>{/if}.
                </p>
              {:else}
                {#each fieldsOf(g.id) as spec (spec.key)}
                  {#if spec.kind === 'number'}
                    {@render range(spec.label, look[spec.key] as number, spec.min, spec.max, spec.step, (v) => setNumber(spec.key, v))}
                  {:else}
                    {@const c = look[spec.key] as number[]}
                    <label class="field">
                      <span class="lbl">{spec.label}</span>
                      <input type="color" value={hex(c, SCALE[spec.kind])} oninput={(e) => setColour(spec, (e.currentTarget as HTMLInputElement).value)} />
                      <i class="num val rgb">{c.map((v) => fmt(v, spec.kind === 'rgb255' ? 1 : 0.01)).join(' ')}</i>
                    </label>
                  {/if}
              {/each}
              {/if}
            </details>
          </div>
        {/each}
      {:else}
        <div class="current">
          <div class="line">
            <button class="small" onclick={() => T.showStratum(tool.stratum - 1)} disabled={tool.stratum <= T.ZONES} aria-label="The stratum before">‹</button>
            <div class="pname grow">
              Stratum <i class="num">{tool.stratum + 1}</i> • {stratum.name}
              <em class="tag">depths <i class="num">{10 * tool.stratum + 1}</i> to <i class="num">{10 * tool.stratum + 10}</i></em>
            </div>
            <button class="small" onclick={() => T.showStratum(tool.stratum + 1)} aria-label="The next stratum">›</button>
          </div>
          <div class="line">
            {@render swatch(stratum.gen.look, '', true, () => T.showStratum(tool.stratum), 'Show it')}
            <p class="hint grow">
              Seed <i class="num">{stratum.seed}</i>,
              {#if tool.trial !== null}being tried{:else if stratum.pinned !== undefined}pinned{:else}its own{/if}{#if stratum.gen.rolled}, re-rolled <i class="num">{stratum.gen.rolled}</i> on to seed <i class="num">{stratum.gen.seed}</i> to stay unlike the zones and its neighbours{/if}; hue <i class="num">{stratum.gen.hue}</i>; embers {stratum.gen.motion.profile}.
            </p>
          </div>
          <p class="hint">
            Nearest zone: {likeness.zone} • similarity <i class="num">{likeness.zoneLike.toFixed(2)}</i>{#if likeness.zoneLike > likeness.most + 1e-9}<b class="warn"> • too like it</b>{/if}<br />
            To {likeness.beforeName} <i class="num">{likeness.before.toFixed(2)}</i>{#if likeness.before > likeness.most + 1e-9}<b class="warn"> • too alike</b>{/if}
            • to the next <i class="num">{likeness.after.toFixed(2)}</i>{#if likeness.after > likeness.most + 1e-9}<b class="warn"> • too alike</b>{/if}<br />
            A generated stratum keeps to at most <i class="num">{likeness.most.toFixed(2)}</i>, re-rolling its seed where it must.
            {#if (stratum.pinned !== undefined || tool.trial !== null) && Math.max(likeness.zoneLike, likeness.before, likeness.after) > likeness.most + 1e-9}<b class="warn">This seed is your choice, so it is kept as it is.</b>{/if}
          </p>
          <div class="grid three">
            <button onclick={() => T.tryStratumSeed(Math.floor(Math.random() * 0x100000000) >>> 0)}>Try another</button>
            {#if stratum.pinned !== undefined && tool.trial === null}
              <button onclick={() => T.unpin()}>Unpin</button>
            {:else}
              <button class="primary" onclick={T.pin}>Pin this seed</button>
            {/if}
            <button onclick={() => T.tryStratumSeed(null)} disabled={tool.trial === null}>Back to its own</button>
          </div>
          <span class="sub">Variations</span>
          <div class="strip">
            {#each stratumStrip as v (v.seed)}{@render swatch(v.look, '', v.seed === tool.trial, () => T.tryStratumSeed(v.seed), `Seed ${v.seed}`)}{/each}
          </div>
          <p class="hint">Every stratum past the zones is generated from its own seed, the same for everyone; its hue moves on from the one before's, and it is steered clear of every zone and of its neighbours (re-rolled where it still comes out too alike), so none looks like a hand-made zone or the stratum before. Pin a seed to keep a stratum as it is: a pinned seed is never re-rolled.</p>
        </div>
        <details open>
          <summary>Endgame generator</summary>
          <div class="line">
            <span class="lbl">Seed</span>
            <i class="num">{tool.draft.endgame.seed}</i>
            <input class="seed" type="text" placeholder="New seed" bind:value={baseText} onchange={onBase} aria-label="The endgame's seed (a number or any word)" />
            <button class="small" onclick={newBase}>New</button>
          </div>
          {@render settings(true)}
          <p class="hint">These shape every unpinned stratum past depth 100 at once, and pinned ones too (a pin keeps the seed, not the look).</p>
        </details>
        <details open>
          <summary>Pinned</summary>
          {#if pins.length}
            <ul class="pins">
              {#each pins as p (p.n)}
                <li>
                  <button class="link" onclick={() => T.showStratum(p.n - 1)}>Stratum <i class="num">{p.n}</i></button>
                  <span>seed <i class="num">{p.seed}</i></span>
                  <button class="small" onclick={() => T.unpin(p.n)}>Unpin</button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="hint">None yet.</p>
          {/if}
        </details>
      {/if}

      <details open>
        <summary>Save</summary>
        <p class="hint">
          {#if T.draftChanged()}The draft differs from src/data/backdrops.json.{:else}The draft is src/data/backdrops.json as it stands.{/if}
          {#if tool.tab === 'zones' && T.unused()}<b class="warn">This zone's changes are not used yet.</b>{/if}
          It keeps on this device as you go.
        </p>
        <div class="grid">
          {#if DEV}<button class="primary" onclick={T.saveToFile} disabled={!T.draftChanged()}>Save to the file</button>{/if}
          <button onclick={T.copyJson}>Copy JSON</button>
          <button onclick={T.downloadJson}>Download JSON</button>
          <label class="file">
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              onchange={(e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                if (f) T.importJson(f);
                (e.currentTarget as HTMLInputElement).value = '';
              }}
            />
          </label>
          <button onclick={T.discardDraft} disabled={!T.draftChanged() && !T.unused()}>Discard draft</button>
        </div>
        {#if tool.message}<p class="message">{tool.message}</p>{/if}
      </details>
    </div>
  {/if}
</aside>

<style>
  .tool {
    --panel-bg: rgba(12, 10, 8, 0.94);
    position: fixed;
    z-index: 200;
    display: flex;
    flex-direction: column;
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.3;
    color: var(--text);
    background: var(--panel-bg);
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.6);
  }
  .tool.wide {
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    border-left: 1px solid var(--gold-lo);
  }
  .tool.wide.shut {
    width: 44px;
  }
  .tool:not(.wide) {
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 62dvh;
    border-top: 1px solid var(--gold-lo);
    border-radius: 10px 10px 0 0;
  }
  .tool:not(.wide):not(.open) {
    display: none;
  }

  .fab {
    position: fixed;
    z-index: 200;
    left: 12px;
    bottom: 12px;
    padding: 0.45rem 0.9rem;
    border: 1px solid var(--gold-lo);
    border-radius: 999px;
    background: rgba(12, 10, 8, 0.94);
    color: var(--gold-hi);
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(0, 0, 0, 0.6);
  }

  .tab {
    flex: 1;
    border: 0;
    background: none;
    color: var(--gold-hi);
    cursor: pointer;
  }
  .tab span {
    display: inline-block;
    writing-mode: vertical-rl;
    font-family: var(--font-cinzel);
    letter-spacing: 0.3em;
    text-transform: uppercase;
  }
  .tab:hover {
    background: rgba(201, 164, 92, 0.08);
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title b {
    font-family: var(--font-cinzel);
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold-hi);
    font-size: 0.85rem;
  }
  .status {
    font-size: 0.82rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .close {
    width: 30px;
    height: 30px;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: none;
    color: var(--gold);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }
  .close:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }

  .body {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 0.75rem 1rem;
  }
  details {
    border-bottom: 1px solid rgba(59, 48, 36, 0.6);
    padding: 0.35rem 0 0.6rem;
  }
  summary {
    cursor: pointer;
    padding: 0.3rem 0;
    font-family: var(--font-display);
    font-size: 0.78rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--gold);
  }
  summary:hover {
    color: var(--gold-hi);
  }
  .group {
    position: relative;
  }
  .lock {
    position: absolute;
    z-index: 1;
    top: 0.62rem;
    right: 0;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-family: var(--font-body);
    font-size: 0.8rem;
    letter-spacing: 0;
    text-transform: none;
    color: var(--muted);
    cursor: pointer;
  }

  .num {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
  }
  .num.big {
    min-width: 2.6em;
    text-align: right;
    color: var(--gold-hi);
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.35rem 0;
  }
  .line input[type='range'] {
    flex: 1;
    min-width: 0;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .lbl {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .sub {
    display: block;
    margin: 0.5rem 0 0.2rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .hint {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--muted);
  }
  .warn {
    font-weight: normal;
    color: var(--unique-hi);
  }
  .message {
    margin: 0.4rem 0 0;
    font-size: 0.85rem;
    color: var(--gold-hi);
  }

  .field {
    display: grid;
    grid-template-columns: 7.2em 1fr 3.4em;
    align-items: center;
    gap: 0.45rem;
    margin: 0.22rem 0;
  }
  .field input[type='range'] {
    width: 100%;
  }
  .field input[type='color'] {
    width: 100%;
    height: 1.5rem;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: none;
    cursor: pointer;
  }
  .field select {
    grid-column: 2 / 4;
  }
  .tone {
    display: grid;
    grid-template-columns: repeat(3, 1fr) auto;
    align-items: start;
    gap: 0.4rem;
    margin: 0.1rem 0 0 7.65em;
  }
  .stop {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
    cursor: pointer;
  }
  .stop input[type='color'] {
    width: 100%;
    height: 1.3rem;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: none;
    cursor: pointer;
  }
  .stop span {
    font-size: 0.7rem;
    line-height: 1.1;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(html[data-docked] .bg) {
    right: 360px;
  }
  .val {
    font-size: 0.78rem;
    text-align: right;
    color: var(--gold-hi);
  }
  .val.rgb {
    font-size: 0.66rem;
    font-weight: 400;
    white-space: nowrap;
  }
  .hues :global(input[type='range']) {
    background: linear-gradient(90deg, var(--strip));
  }

  button {
    font: inherit;
  }
  .small,
  .grid button,
  .grid .file,
  .chip,
  .zone,
  .tabs button {
    border: 1px solid var(--line);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.35);
    color: var(--text);
    cursor: pointer;
    transition:
      border-color 0.15s,
      color 0.15s,
      background 0.15s;
  }
  .small {
    padding: 0.2rem 0.55rem;
    font-size: 0.85rem;
  }
  .small:hover:not(:disabled),
  .grid button:hover:not(:disabled),
  .grid .file:hover,
  .chip:hover,
  .zone:hover,
  .tabs button:hover {
    border-color: var(--gold-lo);
    color: var(--gold-hi);
    background: rgba(201, 164, 92, 0.1);
  }
  .primary {
    border-color: var(--gold-lo) !important;
    color: var(--gold-hi) !important;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem;
    margin: 0.4rem 0;
  }
  .grid.three {
    grid-template-columns: repeat(3, 1fr);
  }
  .grid button,
  .grid .file {
    padding: 0.35rem 0.4rem;
    font-size: 0.86rem;
    text-align: center;
  }
  .file {
    position: relative;
    overflow: hidden;
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--gold);
    cursor: pointer;
  }
  .link:hover {
    color: var(--gold-hi);
  }

  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem;
    margin: 0.6rem 0 0.2rem;
  }
  .tabs button {
    padding: 0.35rem;
    font-family: var(--font-display);
    font-size: 0.8rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .tabs button.on {
    border-color: var(--gold-lo);
    background: rgba(201, 164, 92, 0.2);
    color: var(--gold-hi);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0.35rem 0;
  }
  .chip {
    padding: 0.15rem 0.4rem;
    font-size: 0.78rem;
    border-color: color-mix(in srgb, var(--accent, var(--gold)) 35%, var(--line));
  }
  .chip .num {
    color: var(--accent);
  }
  .chip.on {
    background: color-mix(in srgb, var(--accent, var(--gold)) 20%, transparent);
    color: var(--gold-hi);
  }
  .chip.walk {
    margin-left: auto;
  }

  .zones {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
    margin: 0.5rem 0;
  }
  .zone {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.4rem;
    font-size: 0.82rem;
    text-align: left;
    border-color: color-mix(in srgb, var(--accent) 30%, var(--line));
  }
  .zone .num {
    color: var(--accent);
    min-width: 1.1em;
  }
  .zone span {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .zone.on {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--gold-hi);
  }
  .zone .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--gold-hi);
  }

  .current {
    margin: 0.4rem 0;
    padding: 0.45rem 0.55rem;
    border: 1px solid rgba(59, 48, 36, 0.7);
    border-radius: 5px;
  }
  .pname {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.45rem;
    font-family: var(--font-display);
    font-size: 0.9rem;
    color: var(--gold-hi);
  }
  .pname .tag {
    font-family: var(--font-body);
    font-style: normal;
    font-size: 0.78rem;
    color: var(--muted);
  }

  .seed {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 0.85rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #15110d;
    color: var(--text);
  }
  select {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.15rem 0.3rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #15110d;
    color: var(--text);
  }

  .strip {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.3rem;
    margin: 0.2rem 0 0.4rem;
  }
  .swatch {
    position: relative;
    aspect-ratio: 4 / 3;
    min-width: 2.6rem;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    cursor: pointer;
    background:
      radial-gradient(40% 45% at 72% 30%, var(--s2), transparent),
      radial-gradient(40% 45% at 30% 36%, var(--s3), transparent),
      radial-gradient(50% 50% at 24% 74%, var(--s0), transparent),
      radial-gradient(45% 50% at 80% 80%, var(--s1), transparent),
      radial-gradient(90% 45% at 50% 110%, var(--floor), transparent),
      radial-gradient(70% 40% at 50% -10%, var(--haze), transparent),
      #0d0b09;
  }
  .swatch.on {
    border-color: var(--gold-hi);
    box-shadow: 0 0 0 1px var(--gold-lo);
  }
  .swatch:hover {
    border-color: var(--gold);
  }
  .spark {
    position: absolute;
    left: 58%;
    top: 52%;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--ember);
    box-shadow: 0 0 6px 2px var(--ember);
  }

  .curve {
    display: block;
    width: 100%;
    height: 64px;
    margin-top: 0.3rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(59, 48, 36, 0.7);
    border-radius: 4px;
  }
  .curve polyline {
    fill: none;
    vector-effect: non-scaling-stroke;
  }
  .curve .target {
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  .curve .drawn {
    stroke: var(--gold-hi);
    stroke-width: 1.5;
  }
  .curve .rise {
    fill: var(--bad);
  }
  .curve .here {
    stroke: var(--gold-lo);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--muted);
  }

  .pins {
    margin: 0.3rem 0;
    padding: 0;
    list-style: none;
  }
  .pins li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.15rem 0;
    font-size: 0.85rem;
  }
  .pins li span {
    flex: 1;
    color: var(--muted);
  }

  input[type='range'] {
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--gold) var(--fill), var(--line) var(--fill));
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--gold-hi);
    box-shadow: 0 0 8px rgba(241, 217, 155, 0.6);
  }
  input[type='range']::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 0;
    border-radius: 50%;
    background: var(--gold-hi);
  }
  input[type='checkbox'] {
    accent-color: var(--gold);
  }
</style>
