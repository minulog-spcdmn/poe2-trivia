<script module lang="ts">
  /** The card on screen, stopped at a moment for tuning (zones.html), or let run again (null). */
  let seeker: ((ms: number | null) => void) | null = null;
  export function seekCard(ms: number | null) {
    seeker?.(ms);
  }
</script>

<script lang="ts">
  // Delve: a new zone's title card, shown over the scene as it plunges into
  // the zone (lib/zoneArrival.svelte.ts sets it up; lib/zoneTitle.ts says
  // what it shows, lib/zoneTitleTiming.ts when). Letterbox bars close in
  // with the plunge's first blow and the scene behind darkens a little; as
  // the sound dies down the zone's seal draws itself and the meta line
  // ("Depth 10 • Zone II") tracks out between its rules; the letters of its
  // name gather, a soft tick each, and lock on the sound's second swell,
  // lighting the scene behind them, a divider struck out under them; the
  // subtitle follows, then what is new from here, each with its mark. Then
  // it leaves, as its place has it (./family.ts and the families beside it:
  // burning, shattering, drifting off...), and the bars open as the cards
  // are dealt. Held still (reduced motion, the effects off) it fades in
  // whole, holds and fades out; a screen that saw the run move on late gets
  // the same, sooner (compact). It lies over the game (portalled), under
  // toasts and dialogs, and takes no clicks but on its bars, which cover
  // the header's stale depth. It is scaled up with the stage on large
  // windows (lib/stage.ts), as the header is, so what it measures on screen
  // it turns into its own px.
  import { onMount } from 'svelte';
  import { portal } from '../../lib/portal';
  import { ownRect, zoomOf } from '../../lib/stage';
  import { holdLight } from '../../lib/lights';
  import { accentLight, fxDensity, hdr } from '../../lib/fx/moments';
  import { fxActive, type Vec3 } from '../../lib/fx/core';
  import { flare, glints } from '../../lib/fx/effects';
  import { line, star8 } from '../../lib/arcane';
  import { LUNA, LUNA_HATCH, SOL_RAYS } from '../../lib/alchemy';
  import { zoneSunk } from '../../lib/descent';
  import { ZONE_DESCENT_MS } from '../../lib/delve';
  import { T, glowAt } from '../../lib/zoneTitleTiming';
  import type { Arrival } from '../../lib/zoneArrival.svelte';
  import { FAMILIES } from './families';
  import { IN, OUT, drift, enterDefault, exitDefault, seeded, seedOf, type Ctx } from './family';
  import ZoneSeal from './ZoneSeal.svelte';
  import NewsMark from './NewsMark.svelte';

  let { a, bar }: { a: Arrival; /** How tall the bars are: the header's height (its own px, as the card's; they reach a px past it, as it is measured in whole px and under the stage's zoom its gold hairline hangs a little below it). */ bar: number } = $props();

  const title = $derived(a.title);
  const tl = $derived(a.tl);
  const t = $derived(title.treatment);
  const full = $derived(tl.mode === 'full');
  const chars = $derived([...title.name]);
  const seed = $derived(seedOf(title.name));
  const [nameMix, nameInto] = $derived(t.nameMix);

  let root: HTMLElement;
  let plate: HTMLElement;
  let word: HTMLElement;
  let letters: HTMLElement;
  let glowCopy: HTMLElement;
  let flashCopy: HTMLElement;
  let seal = $state<HTMLElement>();
  let divider: SVGSVGElement;
  let fit = $state<number | null>(null);
  let built = $state(false);
  let nameW = $state(0);

  /** The divider's geometry, from the name's width: two rules either side of a star, 3 px apart. */
  const div = $derived.by(() => {
    const w = Math.max(120, nameW + 32);
    const c = w / 2;
    const gap = 8;
    return {
      w,
      upper: [line([c - gap, 4.5], [8, 4.5]), line([c + gap, 4.5], [w - 8, 4.5])],
      lower: [line([c - gap, 7.5], [16, 7.5]), line([c + gap, 7.5], [w - 16, 7.5])],
      star: star8([c, 6], 5),
    };
  });

  const anims: Animation[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let gone = false;
  /** Stopped at this moment for tuning (seekCard), or running (null). */
  let frozen: number | null = null;

  /** Ms into the card now (or where it is stopped). */
  const now = () => frozen ?? performance.now() - a.t0;

  const play: Ctx['play'] = (el, frames, o) => {
    const an = el.animate(frames, { duration: Math.max(1, o.ms), delay: o.at, easing: o.easing ?? 'linear', fill: o.fill ?? 'both', composite: o.composite ?? 'replace' });
    // On the card's clock: started as the plunge did, so one mounted late lands part-way.
    const doc = document.timeline.currentTime;
    if (typeof doc === 'number') an.startTime = doc - (performance.now() - a.t0);
    // Kept once finished, though a later one (an exit) takes its place: stopped
    // at an earlier moment (zones.html), the card still shows what it did then.
    an.persist?.();
    // Made while the card is stopped: stopped with it.
    if (frozen !== null) {
      an.pause();
      an.currentTime = frozen;
    }
    anims.push(an);
    return an;
  };
  /** (Its effects never fire while it is stopped: they can't be.) */
  const at: Ctx['at'] = (ms, fn) => {
    timers.push(setTimeout(() => !gone && frozen === null && fn(), Math.max(0, ms - (performance.now() - a.t0))));
  };

  onMount(() => {
    const still = tl.mode !== 'full';
    const rich = fxActive() && matchMedia('(pointer: fine)').matches && fxDensity() >= 0.75;
    const phone = matchMedia('(pointer: coarse)').matches;
    let light: ReturnType<typeof holdLight> | null = null;
    let raf = 0;
    let stopAmbient: (() => void) | void;

    // The bars, the scrim and the parallax, from the start.
    const bars = [...root.querySelectorAll<HTMLElement>('.bar')];
    const scrim = root.querySelector<HTMLElement>('.scrim')!;
    if (still) {
      // (Hidden, not only faded, while out of sight: the bars take clicks only while they are seen.)
      for (const el of [...bars, scrim]) {
        play(el, [{ opacity: 0, visibility: 'hidden' }, { opacity: 1, visibility: 'visible' }], { at: 300, ms: 600 });
        play(el, [{ opacity: 1, visibility: 'visible' }, { opacity: 0, visibility: 'hidden' }], { at: tl.gone - 500, ms: 500, fill: 'forwards' });
      }
      const fade = tl.mode === 'compact' ? 400 : 600;
      play(plate, [{ opacity: 0 }, { opacity: 1 }], { at: tl.showAt, ms: fade });
      play(plate, [{ opacity: 1 }, { opacity: 0 }], { at: tl.exit, ms: fade, fill: 'forwards' });
    } else {
      bars.forEach((el, i) => {
        const off = i ? '101%' : '-101%';
        play(el, [{ transform: `translateY(${off})` }, { transform: 'none' }], { at: T.BARS, ms: T.BARS_MS, easing: OUT });
        play(el, [{ transform: 'none' }, { transform: `translateY(${off})` }], { at: tl.gone - 600, ms: 600, easing: 'cubic-bezier(0.64, 0, 0.78, 0)', fill: 'forwards' });
        play(el.querySelector('.hair')!, [{ transform: 'scaleX(0)' }, { transform: 'none' }], { at: T.HAIRS, ms: T.HAIRS_MS, easing: OUT });
      });
      play(scrim, [{ opacity: 0 }, { opacity: 1 }], { at: T.SCRIM, ms: T.SCRIM_MS, easing: 'ease-out' });
      play(scrim, [{ opacity: 1 }, { opacity: 0 }], { at: tl.exit + 200, ms: 700, easing: 'ease-in', fill: 'forwards' });
      // The column sinks with the scene a little (it lies in the shaft the scene falls through).
      const sunk = Array.from({ length: 9 }, (_, i) => ({ translate: `0 ${(18 - 36 * zoneSunk(i / 8)).toFixed(1)}px` }));
      play(plate, sunk, { at: 0, ms: ZONE_DESCENT_MS });
    }

    // The rest once the name has its size (the letters wait for their fonts, hidden till their entrance).
    void document.fonts.ready.then(() => {
      if (gone) return;
      const avail = plate.clientWidth * 0.95;
      const w = letters.scrollWidth;
      if (w > avail) fit = (parseFloat(getComputedStyle(letters).fontSize) * avail) / w;
      requestAnimationFrame(() => {
        if (gone) return;
        nameW = letters.scrollWidth;
        build(still, rich, phone);
      });
    });

    function build(still: boolean, rich: boolean, phone: boolean) {
      const outer = [...letters.querySelectorAll<HTMLElement>('.l')];
      const inner = outer.map((o) => o.firstElementChild as HTMLElement);
      // Measured on screen, in the card's own px (what the letters are moved by).
      const z = zoomOf(word);
      const own = (el: Element) => ownRect(el, z);
      const mid = own(word);
      const dx = outer.map((o) => {
        const b = own(o);
        return b.left + b.width / 2 - (mid.left + mid.width / 2);
      });
      const sb = own(seal!);
      const toSeal: [number, number] = [sb.left + sb.width / 2 - (mid.left + mid.width / 2), sb.top + sb.height / 2 - (mid.top + mid.height / 2)];
      const tint = hdr(title.accent, 1);
      const main: Vec3 = [tint[0] * 2.7, tint[1] * 2.7, tint[2] * 2.7];
      const pale: Vec3 = [1.6 + tint[0] * 1.2, 1.6 + tint[1] * 1.2, 1.6 + tint[2] * 1.2];
      const c: Ctx = {
        play,
        at,
        tl,
        t,
        has: (v) => t.variants.includes(v),
        outer,
        inner,
        dx,
        toSeal,
        glyphs: chars.flatMap((ch, i) => (ch.trim() ? [i] : [])),
        word,
        letters,
        glow: glowCopy,
        flash: flashCopy,
        seal: seal!,
        rules: [...divider.querySelectorAll<SVGPathElement>('.rule')],
        star: divider.querySelector<SVGGElement>('.star')!,
        plate,
        main,
        pale,
        rich,
        phone,
        rnd: seeded(seed),
      };
      built = true;
      if (!still) animate(c);
      // The light the name casts into the scene, from the sigil's drawing to the exit (as far on screen as the name is wide).
      if (!still && fxActive()) {
        const reach = Math.max(240, nameW * 0.75) * z;
        light = holdLight(word, accentLight(title.accent), reach);
        const fam = FAMILIES[t.family];
        const step = () => {
          const ms = now();
          light?.set(glowAt(ms, tl) * (fam.flicker?.(ms) ?? 1), reach * (ms > tl.lock && ms < tl.lock + 600 ? 1.25 : 1));
          if (ms < tl.exit + 750 || frozen !== null) raf = requestAnimationFrame(step);
          else light?.release();
        };
        raf = requestAnimationFrame(step);
      }
    }

    function animate(c: Ctx) {
      const fam = FAMILIES[t.family];
      // Meta line: it tracks out of a blur, its rules drawn outward, their seals stamped.
      const meta = root.querySelector<HTMLElement>('.meta-text')!;
      play(meta, [{ opacity: 0, letterSpacing: '0.12em', filter: 'blur(2px)' }, { opacity: 1, letterSpacing: 'var(--meta-track)', filter: 'none' }], { at: T.META, ms: T.META_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      for (const r of root.querySelectorAll('.meta-rule .rule-line')) play(r, [{ transform: 'scaleX(0)' }, { transform: 'none' }], { at: T.META + 100, ms: 420, easing: OUT });
      for (const s of root.querySelectorAll('.meta-rule .sign')) play(s, [{ opacity: 0, transform: 'scale(1.5)' }, { opacity: 1, transform: 'none' }], { at: T.META + 380, ms: 300, easing: OUT });
      // The name drifts wider while it holds.
      drift(c);
      // Its glow: up as it locks, then breathing.
      play(glowCopy, [{ opacity: 0 }, { opacity: t.glowPeak, offset: 280 / 1180 }, { opacity: 0.32 }], { at: tl.lock - 200, ms: 1180, easing: 'ease-out' });
      play(glowCopy, [{ opacity: 0.32 }, { opacity: 0.2 }, { opacity: 0.3 }, { opacity: 0.22 }], { at: tl.lock + 980, ms: Math.max(1, tl.exit - tl.lock - 980), easing: 'ease-in-out', fill: 'forwards' });
      play(flashCopy, [{ opacity: 0 }, { opacity: 0.7, offset: 80 / 700 }, { opacity: 0 }], { at: tl.lock, ms: 700 });
      play(word, [{ scale: 1 }, { scale: 1.03, offset: 0.28 }, { scale: 1 }], { at: tl.lock - 60, ms: 620, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      play(seal!, [{ scale: 1 }, { scale: 1.06, offset: 0.3 }, { scale: 1 }], { at: tl.lock - 40, ms: 600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      // The divider struck out under it (a fire zone's upper rule is its fissure, opened sooner).
      c.rules.forEach((r, i) => {
        const early = fam.fissure && i < 2;
        play(r, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { at: early ? 1500 : tl.lock, ms: early ? 400 : 600, easing: OUT });
      });
      play(c.star, [{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'none' }], { at: tl.lock - 40, ms: 400, easing: OUT });
      // The letters come in, as the family has them.
      (fam.enter ?? enterDefault)(c);
      // The subtitle.
      const sub = root.querySelector<HTMLElement>('.subtitle');
      if (sub)
        play(sub, [{ opacity: 0, letterSpacing: '0.04em', filter: 'blur(3px)', transform: 'translateY(0.2em)' }, { opacity: 1, letterSpacing: 'var(--sub-track)', filter: 'none', transform: 'none' }], {
          at: T.SUBTITLE,
          ms: T.SUBTITLE_MS,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        });
      // The lock: the name's own flare and glints, and its family's.
      at(tl.lock, () => {
        if (!fxActive()) return;
        const w = word.getBoundingClientRect().width;
        flare(word, { size: 14, streak: w * 0.7, life: 0.9, color: c.pale, intensity: 0.3 });
        glints(word, { count: 4, area: 'edge', size: [4, 8], color: c.pale, delay: [0.05, 0.6] });
        fam.lock?.(c);
      });
      if (c.rich && fam.ambient)
        at(tl.lock + 400, () => {
          stopAmbient = fam.ambient!(c);
          at(tl.exit, () => stopAmbient?.());
        });
      // Leaving: small things first, then the name its own way, the ornaments with it.
      const small = [...root.querySelectorAll<HTMLElement>('.meta, .subtitle, .news')];
      for (const el of small) play(el, [{ opacity: 1 }, { opacity: 0 }], { at: tl.exit, ms: 500, easing: IN, fill: 'forwards' });
      play(glowCopy, [{ opacity: 0.22 }, { opacity: 0 }], { at: tl.exit, ms: 300, fill: 'forwards' });
      for (const el of [seal!, divider]) play(el, [{ opacity: 1 }, { opacity: 0 }], { at: tl.exit + 50, ms: 500, easing: IN, fill: 'forwards' });
      (fam.exit ?? exitDefault)(c);
    }

    const seek = (ms: number | null) => {
      frozen = ms;
      for (const an of anims) {
        if (ms === null) an.play();
        else {
          an.pause();
          an.currentTime = ms;
        }
      }
    };
    seeker = seek;

    return () => {
      gone = true;
      if (seeker === seek) seeker = null;
      cancelAnimationFrame(raf);
      light?.release();
      stopAmbient?.();
      for (const tm of timers) clearTimeout(tm);
      for (const an of anims) an.cancel();
    };
  });
</script>

<div
  class="zc"
  class:still={tl.mode !== 'full'}
  class:built
  bind:this={root}
  use:portal={'dim'}
  aria-hidden="true"
  style:--accent={title.accent}
  style:--bar="{Math.max(44, bar + 1)}px"
  style:--name-c="color-mix(in srgb, {title.accent} {nameMix}%, {nameInto})"
  style:--glow-blur="{t.glowBlur}px"
  style:--track="{t.track}em"
>
  <div class="scrim"></div>
  <div class="bar top"><span class="hair"></span></div>
  <div class="bar bottom"><span class="hair"></span></div>
  <div class="plate" bind:this={plate}>
    <ZoneSeal sigil={title.sigil} {play} still={!full} {seed} bind:el={seal} />
    <div class="meta">
      <!-- Its rules: each a line as long as there is room for, ending short of a small seal (Sol on the left, Luna on the right) drawn at its own size. -->
      {#each ['sol', 'luna'] as side (side)}
        <span class="meta-rule {side}" style:order={side === 'sol' ? 0 : 2}>
          <span class="rule-line"></span>
          <svg class="rule-seal" viewBox="-7 -7 14 14">
            <!-- (Stamped by its own transform, so the scale below stays.) -->
            <g class="sign">
              <g transform="scale(0.42)">
                {#if side === 'sol'}
                  <circle r="5" /><circle r="1.1" /><path d={SOL_RAYS} />
                {:else}
                  <g transform="rotate(180)"><path d={LUNA} /><path d={LUNA_HATCH} class="hatch" /></g>
                {/if}
              </g>
            </g>
          </svg>
        </span>
      {/each}
      <span class="meta-text">{title.meta}</span>
    </div>
    <div class="word" bind:this={word} style:font-size={fit ? `${fit}px` : null}>
      <span class="copy glow" bind:this={glowCopy}>{title.name}</span>
      <span class="copy flash" bind:this={flashCopy}>{title.name}</span>
      <span class="letters" bind:this={letters}>
        {#each chars as ch, i (i)}<span class="l"><span class="li">{ch}</span></span>{/each}
      </span>
    </div>
    <svg class="divider" bind:this={divider} width={div.w} height="12" viewBox="0 0 {div.w} 12">
      {#each [...div.upper, ...div.lower] as d, i (i)}<path {d} class="rule" class:hair={i > 1} pathLength="100" />{/each}
      <g class="star">
        <path d={div.star.outline} />
        <path d={div.star.hatch} class="hatch" />
      </g>
    </svg>
    {#if title.subtitle}<p class="subtitle">{title.subtitle}</p>{/if}
    {#if title.news.length}
      <div class="news">
        {#each title.news as n, i (n.key)}<NewsMark news={n} {play} at={T.NEWS + i * T.NEWS_GAP} still={!full} />{/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Scaled up on large windows (lib/stage.ts), as the header its bars cover is. */
  .zc {
    zoom: var(--stage-zoom, 1);
    position: fixed;
    inset: 0;
    z-index: 60;
    pointer-events: none;
    contain: strict;
    --ink: color-mix(in srgb, var(--accent) 55%, var(--gold));
    --ink-hi: color-mix(in srgb, var(--accent) 45%, var(--gold-hi));
    --glow-c: color-mix(in srgb, var(--accent) 65%, #d9a45a);
    --seal: clamp(48px, 2vw + 40px, 72px);
    --meta-track: 0.3em;
    --sub-track: 0.16em;
  }
  /* The letterbox: it closes in over the header (and its stale depth), and takes the clicks meant for what it hides. */
  .bar {
    position: absolute;
    left: 0;
    right: 0;
    height: calc(var(--bar) + env(safe-area-inset-top));
    background: #050403;
    pointer-events: auto;
  }
  .bar.top {
    top: 0;
  }
  .bar.bottom {
    bottom: 0;
    height: calc(var(--bar) + env(safe-area-inset-bottom));
  }
  .bar .hair {
    position: absolute;
    left: 6%;
    right: 6%;
    height: 1px;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 35%, var(--gold-lo)) 30%, color-mix(in srgb, var(--accent) 35%, var(--gold-lo)) 70%, transparent);
    opacity: 0.6;
  }
  .top .hair {
    bottom: 0;
  }
  .bottom .hair {
    top: 0;
  }
  /* The scene darkened behind the card: at its edges, and a pool under the text.
     So dark a fade over the whole screen would show 8-bit steps as rings; under
     it, a tile of the same black at 0 to 10/255 opacity, a different one each
     pixel (white noise), stirs its opacity a little, so the scene blended under
     it rounds up or down at random and the rings dissolve (a grain on top would
     only blur their edges). Drawn pixel for pixel, as smoothing would average it out. */
  .scrim {
    position: absolute;
    inset: 0;
    --dither: url('../../assets/dither.png');
    image-rendering: pixelated;
    background:
      radial-gradient(ellipse 60% 34% at 50% 46%, rgb(5 4 3 / 0.4), transparent 80%),
      radial-gradient(ellipse 120% 90% at 50% 46%, transparent 40%, rgb(5 4 3 / 0.55)),
      var(--dither);
  }
  /* Till the name has its size, nothing of the column shows (held still, it is shown whole). */
  .zc:not(.still):not(.built) .plate {
    visibility: hidden;
  }
  /* (The window's size in the card's zoomed px, lib/stage.ts.) */
  .plate {
    position: absolute;
    inset: calc(var(--bar) + env(safe-area-inset-top) + 12px) 0 calc(var(--bar) + env(safe-area-inset-bottom) + 6vh / var(--stage-zoom, 1));
    margin: 0 auto;
    width: min(46rem, 100vw / var(--stage-zoom, 1) - 32px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.8em;
    margin-top: 14px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: clamp(0.62rem, 0.3vw + 0.55rem, 0.78rem);
    text-transform: uppercase;
    color: color-mix(in srgb, var(--accent) 45%, var(--muted));
    white-space: nowrap;
  }
  .meta-text {
    order: 1;
    letter-spacing: var(--meta-track);
    padding-left: var(--meta-track);
  }
  .meta-rule {
    display: flex;
    align-items: center;
    gap: 1.5px;
    width: clamp(28px, 7vw, 72px);
  }
  .meta-rule.sol {
    flex-direction: row-reverse;
  }
  .rule-line {
    flex: 1;
    height: 1px;
    background: var(--ink);
    opacity: 0.7;
    transform-origin: right;
  }
  .luna .rule-line {
    transform-origin: left;
  }
  .rule-seal {
    flex: none;
    width: 14px;
    height: 14px;
    overflow: visible;
  }
  .rule-seal path,
  .rule-seal circle {
    fill: none;
    stroke: var(--ink-hi);
    stroke-width: 1.3px;
  }
  .rule-seal .hatch {
    stroke-width: 0.8px;
    stroke: var(--ink);
  }
  .rule-seal .sign {
    transform-box: fill-box;
    transform-origin: center;
  }
  .word {
    position: relative;
    display: grid;
    margin-top: 10px;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(2.5rem, 4vw + 1.5rem, 4.75rem);
    line-height: 1.05;
    white-space: nowrap;
    letter-spacing: var(--track);
    font-kerning: none;
    font-variant-ligatures: none;
  }
  .word > * {
    grid-area: 1 / 1;
    padding-left: var(--track);
  }
  .copy {
    opacity: 0;
  }
  .glow {
    color: var(--accent);
    filter: blur(var(--glow-blur));
  }
  .flash {
    color: var(--ink-hi);
    text-shadow: 0 0 18px color-mix(in srgb, var(--accent) 70%, transparent);
  }
  .letters {
    color: var(--name-c);
    text-shadow:
      0 1px 2px rgb(0 0 0 / 0.9),
      0 0 14px color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .l {
    position: relative;
    display: inline-block;
    white-space: pre;
  }
  .li {
    display: inline-block;
    opacity: 0;
  }
  .built .li,
  .still .li,
  .still .copy.glow {
    opacity: 1;
  }
  .still .copy.glow {
    opacity: 0.3;
  }
  .divider {
    margin-top: 0.1rem;
    overflow: visible;
    max-width: 100%;
  }
  .divider path {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.8px;
    stroke-dasharray: 100;
  }
  .divider .hair {
    stroke-width: 0.55px;
  }
  .divider .star path {
    stroke: var(--ink-hi);
    stroke-dasharray: none;
    stroke-width: 0.6px;
  }
  .divider .star .hatch {
    stroke-width: 0.35px;
    stroke: var(--ink);
  }
  .divider .star {
    transform-box: fill-box;
    transform-origin: center;
  }
  .subtitle {
    margin: 12px 0 0;
    max-width: 26em;
    font-family: var(--font-cinzel);
    font-weight: 500;
    font-size: clamp(0.8rem, 0.4vw + 0.7rem, 1.05rem);
    letter-spacing: var(--sub-track);
    padding-left: var(--sub-track);
    text-wrap: balance;
    color: color-mix(in srgb, var(--accent) 22%, var(--text));
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.9);
  }
  .news {
    display: flex;
    justify-content: center;
    gap: 0.6rem;
    margin-top: 22px;
  }
  .plate > :global(*) {
    flex-shrink: 0;
  }
  /* A short screen (a phone turned on its side): a smaller seal and name, and no row of news. */
  @media (max-height: 520px) {
    .zc {
      --seal: 36px;
    }
    /* The column fills what is left between the bars, over the scoreboard,
       so it is darker behind it (only the world's light comes through). */
    .scrim {
      background:
        radial-gradient(ellipse 70% 62% at 50% 50%, rgb(5 4 3 / 0.95) 30%, rgb(5 4 3 / 0.75) 80%, rgb(5 4 3 / 0.6)),
        var(--dither);
    }
    .plate {
      inset: calc(var(--bar) + env(safe-area-inset-top) + 4px) 0 calc(var(--bar) + env(safe-area-inset-bottom) + 4px);
    }
    .word {
      font-size: clamp(1.6rem, 3vw + 1rem, 2.6rem);
    }
    .news {
      display: none;
    }
  }
  @media (max-width: 640px) {
    .zc {
      --meta-track: 0.22em;
      --sub-track: 0.12em;
    }
    .word {
      margin-top: 6px;
    }
    .subtitle {
      margin-top: 10px;
    }
    .news {
      margin-top: 16px;
      gap: 0.2rem;
    }
  }
</style>
