<script lang="ts">
  import { playerColor } from '../lib/ui';
  import { initialOf } from '../lib/names';
  import { creatorShown } from '../lib/creator';
  import { arcaneAura } from '../lib/fx/aura';
  import { CREATOR_TITLE } from '../lib/site';
  import VerdictSign from './VerdictSign.svelte';
  import { motion } from '../lib/motion.svelte';
  import { untrack } from 'svelte';
  import { classOf, isPlayerClass, SIGIL_FITS, sigilUrl, SMALL_INK, type PlayerClass } from '../lib/classSigils';
  import { sigilTrial } from '../lib/sigilTrial.svelte';

  /** wrong: answered wrong, the token face down (the scoreboard). sigil: their class's sigil, worn behind their initial (lib/classSigils.ts). */
  let {
    name,
    hue,
    size = 36,
    dim = false,
    wrong = false,
    sigil,
  }: {
    name: string;
    hue: number;
    size?: number;
    dim?: boolean;
    wrong?: boolean;
    sigil?: PlayerClass;
  } = $props();
  // Only one this build knows (a newer host's may not be). (On the QA desk,
  // everyone can wear one, by their name.)
  const worn = $derived(isPlayerClass(sigil) ? sigil : sigilTrial.on ? classOf(name) : undefined);
  const fit = $derived(worn ? SIGIL_FITS[worn] : undefined);
  const small = $derived(size < SMALL_INK);
  const initial = $derived(initialOf(name) || '?');
  // The worn letter's outline: 6 of the token's 100 units, as thick as it
  // gets on a 60px token, then no thicker on a larger one.
  const outline = $derived(size > 60 ? 360 / size : 6);
  // A's thin apex and wide base make it look low when its cap height is
  // centered, so lift it slightly.
  const dy = $derived(initial === 'A' ? '0.31em' : '0.35em');
  // zoe_arcana made the game: her avatar wears a gilded ring and, with
  // effects on, a living aura (lib/fx/aura.ts).
  const creator = $derived(creatorShown(name));
  // Face down, her ring gives way to the wrong verdict's sign.
  const crowned = $derived(creator && !wrong);

  /** How long the token takes to turn over (or back up): edge on halfway, where its faces swap. */
  const TURN_MS = 500;
  // It turns like a coin: the face it shows goes edge on, easing in, and the
  // other side comes round, easing out; the faces swap halfway. Turning down,
  // the face-down side only shows from there (.turn-down's face-in); turning
  // up, it is gone from there (untilEdgeOn).
  const TURN: Keyframe[] = [
    { transform: 'perspective(200px) rotateY(0deg)', easing: 'cubic-bezier(0.55, 0, 1, 0.45)' },
    { transform: 'perspective(200px) rotateY(90deg)', offset: 0.5 },
    { transform: 'perspective(200px) rotateY(-90deg)', offset: 0.501, easing: 'cubic-bezier(0, 0.55, 0.45, 1)' },
    { transform: 'perspective(200px) rotateY(0deg)' },
  ];
  let el: HTMLElement | undefined;
  // Turning down as they answer wrong, back up as the next question comes;
  // not when it mounts already face down (a rejoin), nor while held still.
  // Before the markup updates, so the face-down side's way out (untilEdgeOn)
  // already knows it is turning up.
  let turn = $state<'down' | 'up' | null>(null);
  // Whether the face-down side came round with a turn, so its cross waits to
  // draw until it has landed; mounted face down, or held still, it draws at
  // once. Left as it is while the side leaves, so its cross isn't re-timed.
  let landing = $state(false);
  let was = untrack(() => wrong);
  $effect.pre(() => {
    if (wrong === was) return;
    was = wrong;
    const still = untrack(() => motion.still);
    if (wrong) landing = !still;
    // (Nor in the very tick it mounts, before it is bound.)
    const next = still || !el ? null : wrong ? 'down' : 'up';
    turn = next;
    if (!next) return;
    // Over when it lands. A turn cut short by the next change is cancelled
    // (so never ends this one), and that one starts afresh.
    const a = el!.animate(TURN, TURN_MS);
    a.finished.then(
      () => (turn = null),
      () => {},
    );
    return () => a.cancel();
  });
  /** Keeps the face-down side on the token until the turn back up is edge on. */
  const untilEdgeOn = (_node: Element) => ({ duration: turn === 'up' ? TURN_MS / 2 : 0 });
</script>

<span
  class="avatar"
  class:dim
  class:creator={crowned}
  class:turn-down={turn === 'down'}
  class:worn
  class:small
  style:--c={playerColor(hue)}
  style:--s="{size}px"
  style:--outline="{outline}px"
  style:--turn="{TURN_MS}ms"
  role={crowned ? 'img' : undefined}
  aria-label={crowned ? CREATOR_TITLE : undefined}
  title={crowned ? CREATOR_TITLE : undefined}
  bind:this={el}
  use:arcaneAura={{ on: creator, dim: dim || !crowned || turn !== null }}
  >{#if worn && fit}<span
      class="sigil"
      class:gilt={!small}
      style:--sigil="url({sigilUrl(worn)})"
      style:--fw={fit[0]}
      style:--fh={fit[1]}
      style:--fx={fit[2]}
      style:--fy={fit[3]}><span></span></span
    >{/if}<svg viewBox="0 0 100 100"
    ><text x="50" y="50" {dy} text-anchor="middle">{initial}</text></svg
  >{#if wrong}<span class="face-down" class:landing out:untilEdgeOn role="img" aria-label="{name} answered wrong" title="Answered wrong"
      ><VerdictSign icon="cross" token /></span
    >{/if}</span
>

<style>
  .avatar {
    flex: none;
    width: var(--s);
    height: var(--s);
    display: block;
    border-radius: 50%;
    --face: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c), white 35%), var(--c) 60%, color-mix(in srgb, var(--c), black 45%));
    --rim: 0 0 0 2px #0c0a08, 0 0 0 3px color-mix(in srgb, var(--c), black 30%), 0 4px 10px rgba(0, 0, 0, 0.5);
    background: var(--face);
    box-shadow: var(--rim);
    transition: filter 0.3s;
  }
  /* Her ring: a gold band set in ruby, with a faint ruby glow. It marks her
     with effects off too, and as shadows it takes no room. (BEZEL in
     lib/fx/orbit.ts is how far it reaches.) */
  .creator {
    box-shadow:
      0 0 0 1.5px #0c0a08,
      0 0 0 2.5px #efcf86,
      0 0 0 3.5px #8a1c2a,
      0 0 8px 3px rgba(222, 64, 82, 0.3),
      0 4px 10px rgba(0, 0, 0, 0.5);
  }
  /* The letter is drawn in SVG with its baseline offset by half of Cinzel's cap
     height (0.7em), so the glyph is optically centered at every size instead
     of depending on the font's asymmetric ascent/descent and line-box rounding. */
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  text {
    font-family: var(--font-cinzel);
    font-weight: 900;
    font-size: 45px;
    fill: #140f0a;
  }
  /* A class's sigil, worn behind the letter: the token's face their colour
     darkened, with a sheen lit from the top left, the sigil in their colour
     on it, and their colour the token's own fine rim, a gold line inside it
     (not below SMALL_INK). The letter pale, tinted with their colour and
     outlined in it darkened, so the sigil breaks around it; below SMALL_INK
     white, outlined in black. */
  .worn {
    position: relative;
  }
  .worn:not(.creator) {
    box-shadow:
      0 0 0 1px #0c0a08,
      0 0 0 2.5px var(--c),
      0 4px 10px rgba(0, 0, 0, 0.5);
  }
  .worn svg {
    position: relative;
  }
  .sigil {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    overflow: hidden;
    background-image:
      radial-gradient(ellipse 70% 55% at 35% 22%, rgba(255, 244, 225, 0.16), transparent 70%),
      radial-gradient(circle at 40% 35%, color-mix(in srgb, var(--c), black 58%), color-mix(in srgb, var(--c), black 86%) 75%);
    box-shadow:
      inset 0 1px 0 rgba(255, 244, 225, 0.1),
      inset 0 -2px 3px rgba(0, 0, 0, 0.55);
  }
  .gilt {
    box-shadow:
      inset 0 0 0 1px rgba(239, 207, 134, 0.7),
      inset 0 2px 0 rgba(255, 244, 225, 0.08),
      inset 0 -2px 3px rgba(0, 0, 0, 0.55);
  }
  /* Each glyph fitted to the token by its own bounds (SIGIL_FITS), in
     fractions of the token as it is drawn, so a token a page shrinks (the
     scoreboard on a phone) takes its sigil with it; the token's round edge
     trims what reaches past it. */
  .sigil > span {
    position: absolute;
    left: calc(var(--fx) * 100%);
    top: calc(var(--fy) * 100%);
    width: calc(var(--fw) * 100%);
    height: calc(var(--fh) * 100%);
    background: color-mix(in srgb, var(--c), white 8%);
    mask: var(--sigil) no-repeat;
    mask-size: 100% 100%;
    opacity: 0.6;
  }
  .worn text {
    fill: color-mix(in srgb, var(--c), white 72%);
    stroke: color-mix(in srgb, var(--c), black 55%);
    stroke-width: var(--outline);
    stroke-linejoin: round;
    paint-order: stroke;
  }
  .worn.small text {
    fill: #fff;
    stroke: #000;
  }
  /* Not while the face-down side is on it (turning back up included): red
     stays red, whoever answered wrong. */
  .dim:not(:has(> .face-down)) {
    filter: grayscale(1) brightness(0.55);
  }
  /* Answered wrong: the token turns face down, its letter hidden, its face the
     wrong verdict's sign (VerdictSign, as at the reveal) drawn large, its rim
     where the ring was, so it never reads as a kick's seal on the corner. */
  /* Whenever the face-down side is on it, turning back up included. */
  .avatar:has(> .face-down) {
    position: relative;
  }
  .face-down {
    --v-icon: var(--verdict-bad-icon);
    --v-tint: var(--verdict-bad-tint);
    position: absolute;
    inset: -3px;
    border-radius: 50%;
  }
  /* Its cross drawn as it settles from turning over (VerdictSign's --draw-at). */
  .landing {
    --draw-at: 0.42s;
  }
  /* Turning down, the face-down side shows from halfway (TURN, above). */
  .turn-down .face-down {
    animation: face-in var(--turn) linear;
  }
  @keyframes face-in {
    0%,
    50% {
      opacity: 0;
    }
    50.1%,
    100% {
      opacity: 1;
    }
  }
</style>
