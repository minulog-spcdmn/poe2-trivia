<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { session } from '../lib/session.svelte';
  import { sfx } from '../lib/sound';
  import { timerGone, timerTick } from '../lib/fx/moments';
  import { FLARE_MS, clockLeft, questionTimer, veinWindowMs } from '../lib/delve';
  import { FLARE_IGNITE_MS, flareBurning, onFlareLands, type FlareBurn } from '../lib/flareBurn';
  import { claimPressure, endHold, flareEase, flarePressure, pressureOf, resolveDark, type Pressure } from '../lib/darkness';
  import { darkOutcome } from '../lib/delveSession';
  import { motion } from '../lib/motion.svelte';

  /**
   * `deadline` null: the clock hasn't started yet (Delve waits for the art), so
   * the ring stays full. `warnFrom`: the seconds that tick and glow urgent.
   */
  let {
    deadline,
    total,
    stopped = false,
    warnFrom = 5,
  }: { deadline: number | null; total: number; stopped?: boolean; warnFrom?: number } = $props();

  // Delve: the ring spans the time the question started with (a find's is
  // always the shortest, whatever `total` says before its clock starts, and a
  // flare's extra time fills it back up rather than stretching it). On an
  // Azurite Vein its fast window (veinWindowMs: a right answer in it earns a
  // ward) is drawn in azurite at the head of the ring.
  const st = $derived(session.state);
  const q = $derived(st?.delve ? st.question : null);
  const azurite = $derived(q?.find === 'azurite');
  const span = $derived(st?.delve && q ? questionTimer(st) : total);
  /** Milliseconds left on the clock when the fast window closes. */
  const fastMs = $derived(st ? veinWindowMs(st) : 0);
  const fastEnd = $derived(deadline !== null && q?.clockAt !== undefined ? deadline - q.clockAt - fastMs : span * 1000 - fastMs);

  let remaining = $state(Infinity);

  // A flare burnt (the question is `flared`): its streak flies from the
  // player's entry to the clock (lib/flareBurn.ts flareStrike, played by
  // Scoreboard.svelte), which stays at 0 until it lands (`holdUntil`); then
  // the ring flares back up and burns while the added seconds run (`lit`).
  // Not on any move of the deadline, which a pause moves on too. Mounting a
  // question already flared (a refresh or rejoin) only lights it, while its
  // clock still runs.
  let flaring = $state(false);
  let lit = $state(false);
  let holdUntil = 0;
  /**
   * The dark (lib/darkness.ts) while a flare burns: when its light bloomed
   * (performance.now(); -Infinity for one already burning when the ring
   * mounted, null for none), and how dark it was then. Until it blooms the
   * dark holds where the clock left it; then it draws back (flareEase).
   */
  let litAt: number | null = null;
  let heldDark = 0;
  /** The dark as last set. */
  let shownDark = 0;
  let wasFlared: boolean | null = null;
  // Its own derived, so that only the flare itself (not every new state) runs the effect again.
  const flared = $derived(!!q?.flared);
  $effect(() => {
    const now = flared;
    const was = wasFlared;
    wasFlared = now;
    if (!now) {
      lit = false;
      litAt = null;
    } else if (was === false) {
      // Lit as the streak lands, or soon after it should have (none flew: the entry is not on screen).
      let t: ReturnType<typeof setTimeout> | undefined;
      const ignite = () => {
        stopWaiting();
        clearTimeout(t);
        holdUntil = 0;
        // The dark draws back from here, in step with its light.
        litAt = performance.now();
        heldDark = shownDark;
        flaring = lit = true;
        t = setTimeout(() => (flaring = false), 1600);
      };
      const stopWaiting = onFlareLands(ignite);
      holdUntil = Infinity;
      t = setTimeout(ignite, FLARE_IGNITE_MS + 250);
      return () => {
        stopWaiting();
        clearTimeout(t);
        holdUntil = 0;
      };
    } else if (was === null) {
      const end = untrack(() => (stopped ? null : deadline));
      if (end !== null && leftAt(end, session.hostNow()) > 0) {
        lit = true;
        litAt = -Infinity;
      }
    }
  });
  // The ring burning (lib/flareBurn.ts), its light dying down with the added
  // seconds (the clock's loop sets it); it goes out as the question ends.
  // Lit untracked: it reads whether to hold still (lib/motion.svelte.ts) as
  // it catches, and a change of that mid-burn must not put it out and light
  // it again from the start.
  let burn: FlareBurn | null = null;
  $effect(() => {
    if (!lit || stopped || !el) return;
    const ring = el;
    const b = untrack(() => flareBurning(ring));
    burn = b;
    return () => {
      b.stop();
      if (burn === b) burn = null;
    };
  });
  /**
   * The time left at `now`: held still while a pause is on (the lab's; see
   * clockLeft). Read off the session's state, not `q`: a ring going out
   * under the next question must not read its deriveds (derived_inert).
   */
  const leftAt = (end: number, now: number) =>
    untrack(() => clockLeft({ deadline: end, held: session.state?.delve ? session.state.question?.held : undefined }, now));
  /**
   * The last whole second the clock was seen on (null until it is first
   * seen): the urgent tick sounds only as the clock crosses into a new
   * second, so it keeps its beat. A clock seen first part way through a
   * second (a mount mid-question, or a flare's added seconds as its streak
   * lands) waits for the next whole second instead of ticking at once and
   * then again a moment later.
   */
  let lastSecs: number | null = null;
  let started = false;

  // Delve: while the clock runs, the light shrinks with it (lib/darkness.ts).
  // The ring of the question on screen drives it (a new one takes over from
  // one still fading out), and lets it lift when the clock stops. Not again
  // as the deadline moves (a flare, a pause): letting go would lift the dark
  // at once, before the flare's light has caught (the loop below holds it
  // while its streak flies).
  const delve = $derived(!!st?.delve);
  const clocked = $derived(deadline !== null);
  let dark: Pressure | null = null;
  $effect(() => {
    if (!delve || !clocked || stopped) return;
    const own = claimPressure();
    dark = own;
    return () => {
      own.release();
      if (dark === own) dark = null;
    };
  });

  // The question ends at its reveal (in step with the answer marked right or
  // wrong, its sound and effects): the dark settles as it went for this
  // device's player (lib/darkness.ts resolveDark), gentler held still. Only
  // for a clock this ring ran: one mounted at the reveal (a refresh, a
  // rejoin) has no dark to settle. A perish's dark holds until the reveal is
  // over: the run's end screen, or the next depth dealt (this ring going).
  let wasStopped = untrack(() => stopped);
  $effect(() => {
    const now = stopped;
    if (now && !wasStopped && started && delve) {
      untrack(() => {
        // (Hot-seat: nobody in particular holds this device; the team's, as a spectator's.)
        const me = session.mode === 'local' ? null : session.myPlayerId;
        const outcome = session.state ? darkOutcome(session.state, me) : null;
        if (outcome) resolveDark(outcome, motion.still);
      });
    }
    wasStopped = now;
  });
  onDestroy(() => endHold());
  /** What the countdown's effects were started on (el may be gone by teardown): they end with this ring. */
  let tickedOn: Element | null = null;
  onDestroy(() => {
    if (tickedOn) timerGone(tickedOn);
  });

  $effect(() => {
    if (deadline === null) {
      remaining = span * 1000;
      return;
    }
    const end = deadline;
    if (stopped) {
      // Mounted already stopped (a refresh or rejoin during a reveal): show the time that was left.
      // A ring that ran keeps the value it froze at.
      if (!started) remaining = leftAt(end, session.hostNow());
      return;
    }
    started = true;
    // Read once: the loop must not touch this component's deriveds, which go
    // inert while the ring fades out under a new question.
    const spanMs = span * 1000;
    const warn = warnFrom;
    const asked = untrack(() => session.state?.question?.askedAt);
    let raf = 0;
    const loop = () => {
      // A new question took over (this ring is going out): stop.
      if (untrack(() => session.state?.question?.askedAt) !== asked) return;
      // A flare's streak on its way: the clock stays out until it lands.
      if (performance.now() < holdUntil) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const left = leftAt(end, session.hostNow());
      burn?.set(left / FLARE_MS, left / spanMs);
      const secs = Math.ceil(left / 1000);
      // While a flare burns, its light holds the dark back (lib/darkness.ts):
      // from when it blooms, drawing back from where the clock had it.
      shownDark =
        litAt === null ? pressureOf(left, spanMs, warn) : flareEase(heldDark, flarePressure(left / FLARE_MS), performance.now() - litAt);
      dark?.set(shownDark);
      // The ring is redrawn only once its end has moved a third of a pixel
      // (or the number changes): on a 20 s timer about 25 times a second
      // rather than every frame, and each redraw repaints its glow.
      if (secs !== Math.ceil(remaining / 1000) || left === 0 || (Math.abs(remaining - left) * C) / spanMs >= 1 / 3) {
        remaining = left;
      }
      if (secs !== lastSecs) {
        const crossed = lastSecs !== null && secs < lastSecs;
        lastSecs = secs;
        if (crossed && secs <= warn && secs > 0) {
          sfx('tick');
          if (el) timerTick((tickedOn = el), secs, !delve);
        }
      }
      if (left > 0) raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  });

  const R = 26;
  const C = 2 * Math.PI * R;
  const frac = $derived(Math.min(1, remaining / (span * 1000)));
  const secs = $derived(Number.isFinite(remaining) ? Math.ceil(remaining / 1000) : span);
  const urgent = $derived(remaining <= warnFrom * 1000);
  /** The fast window is still open: from where it closes on the ring up to the ring's head. */
  const fast = $derived(azurite && remaining > fastEnd);
  const fastFrom = $derived(Math.max(0, Math.min(1, fastEnd / (span * 1000))));
  /** Where the window closes, as a notch across the ring (the svg is turned so 0° is the top). */
  const notch = $derived.by(() => {
    const a = fastFrom * 2 * Math.PI;
    const at = (r: number) => `${(32 + r * Math.cos(a)).toFixed(2)} ${(32 + r * Math.sin(a)).toFixed(2)}`;
    return `M${at(R - 4.5)}L${at(R + 4.5)}`;
  });

  let el = $state<HTMLElement>();
</script>

<div
  class="timer"
  bind:this={el}
  class:urgent={urgent && !fast}
  class:stopped
  class:azurite
  class:fast
  class:flaring
  class:burning={lit && !stopped}
  role="timer"
  aria-label={fast ? `${secs} seconds left, ${Math.ceil((remaining - fastEnd) / 1000)} to earn a ward` : `${secs} seconds left`}
>
  <svg viewBox="0 0 64 64">
    <circle class="track" cx="32" cy="32" r={R} />
    <circle class="fill" cx="32" cy="32" r={R} stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} />
    {#if fast}
      <circle class="window" cx="32" cy="32" r={R} stroke-dasharray="{C * Math.max(0, frac - fastFrom)} {C}" stroke-dashoffset={-C * fastFrom} />
      <path class="notch" d={notch} />
    {/if}
  </svg>
  <span>{secs}</span>
</div>

<style>
  .timer {
    position: relative;
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
  }
  svg {
    position: absolute;
    inset: 0;
    rotate: -90deg;
    /* Let the ring's drop-shadow glow extend past the 64px viewBox. */
    overflow: visible;
  }
  circle {
    fill: none;
    stroke-width: 4;
  }
  .track {
    stroke: rgba(255, 255, 255, 0.08);
    fill: rgba(0, 0, 0, 0.6);
  }
  .fill {
    stroke: var(--gold);
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(201, 164, 92, 0.6));
    transition: stroke 0.3s;
  }
  span {
    position: relative;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.35rem;
    color: var(--gold-hi);
  }
  .urgent .fill {
    stroke: var(--bad);
    filter: drop-shadow(0 0 6px rgba(224, 85, 63, 0.8));
  }
  .urgent span {
    color: #ff9c86;
    animation: throb 1s ease-in-out infinite;
  }
  /* Azurite: the fast window in cold blue at the ring's head, a notch where
     it closes; once it has, the ring goes on in gold. */
  .azurite .track {
    stroke: rgba(110, 170, 240, 0.12);
  }
  .window {
    stroke: #6fb4ff;
    stroke-linecap: round;
    filter: drop-shadow(0 0 5px rgba(80, 150, 255, 0.85));
  }
  .notch {
    stroke: #d4e9ff;
    stroke-width: 1.4;
    filter: drop-shadow(0 0 3px rgba(80, 150, 255, 0.9));
  }
  .fast span {
    color: #d4e9ff;
    text-shadow: 0 0 10px rgba(80, 150, 255, 0.8);
  }
  /* A flare: the ring fills back up in a burst of its red light. */
  .flaring .fill {
    stroke: #ffd3dc;
    filter: drop-shadow(0 0 8px rgba(236, 62, 92, 0.95));
    transition:
      stroke-dashoffset 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2),
      stroke 0.3s;
  }
  .flaring span {
    color: #fff0f3;
    animation: flare-up 0.8s ease-out;
  }
  .flaring::after {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(247, 163, 179, 0.6), transparent 65%);
    animation: flare-burst 1.4s ease-out forwards;
    pointer-events: none;
  }
  @keyframes flare-up {
    30% {
      transform: scale(1.45);
      text-shadow: 0 0 14px rgba(236, 62, 92, 0.95);
    }
  }
  @keyframes flare-burst {
    from {
      opacity: 1;
      transform: scale(0.6);
    }
    to {
      opacity: 0;
      transform: scale(1.5);
    }
  }
  /* Burning on a flare's added seconds (its glow, tip and sparks are
     lib/flareBurn.ts's): the ring in the flare's red, the number pale over it. */
  .burning .track {
    stroke: rgba(247, 163, 179, 0.16);
  }
  .burning .fill {
    stroke: #f7a3b3;
    filter: drop-shadow(0 0 5px rgba(236, 62, 92, 0.95));
  }
  .burning span {
    color: #fff0f3;
    text-shadow:
      0 0 8px rgba(236, 62, 92, 0.9),
      0 1px 2px rgba(0, 0, 0, 0.9);
  }
  .stopped {
    opacity: 0.4;
  }
  .stopped span {
    animation: none;
  }
  @keyframes throb {
    50% {
      transform: scale(1.2);
    }
  }
</style>
