<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fly, scale } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { playerColor } from '../lib/ui';
  import Avatar from './Avatar.svelte';
  import PlayerName from './PlayerName.svelte';
  import ArcaneCircle from './ArcaneCircle.svelte';
  import CrownMark from './CrownMark.svelte';
  import { CREATOR, DONATE_URL, SITE_URL, inviteUrl } from '../lib/site';
  import { nightShare, siteLink } from '../lib/invite';
  import { backdropShadow } from '../lib/backdropShadow';
  import { fxActive, fxUserOn, onFxChange } from '../lib/fx/core';
  import { CROWN_LANDS, crownPassed, glyphLanded, twinkle, victory } from '../lib/fx/moments';
  import { honours, type Honour } from '../lib/honours';
  import { sfx } from '../lib/sound';
  import { MAX_PLAYERS } from '../lib/game';
  import { REMATCH_MS, crownChange, crownLine, crownedId, ledgerLine, nightWins, rematchCount } from '../lib/series';
  import { fallen } from '../lib/fx/delveEnd';
  import { shareText } from '../lib/delveShare';
  import { portal } from '../lib/portal';
  import { delveStandings, delveTeam, isGroupRun, shownDepth } from '../lib/delve';
  import { BLUE_FROM, accentAt } from '../lib/descent';
  import { zoneAt } from '../lib/zoneSigils';
  import { delverText, lossDepths, namesOf } from '../lib/difficultyText';

  const s = $derived(session.state!);
  const won = (id: string) => s.winners.includes(id);
  /** Delve: the depth the run ended at (alone, the delver's; together, the team's). */
  const endDepth = $derived(s.delve ? (isGroupRun(s) ? delveTeam(s).depth : (delveStandings(s)[0]?.depth ?? s.round)) : 0);
  // Delve: ranked by how deep each went, and alone there is no winner, only a depth.
  const run = $derived(s.delve ?? null);
  const solo = $derived(!!run && !isGroupRun(s));
  /** This run went deeper than every one before it of its kind, alone or together (lib/delveRecord.ts). */
  const newBest = $derived(!!run && session.delveResult?.id === run.startedAt && session.delveResult.best);
  const delveRows = $derived(run ? delveStandings(s) : []);
  /** Delve together: one result for the team (its depth, where the last of them perished), and each delver's part in it. */
  const team = $derived(run && !solo ? delveTeam(s) : null);
  // Four faces fit the circle; a bigger team shows three and how many more.
  const teamFaces = $derived(team ? (s.players.length > 4 ? s.players.slice(0, 3) : s.players) : []);
  const teamMore = $derived(team ? s.players.length - teamFaces.length : 0);
  const depthOf = (id: string) => delveRows.find((r) => r.id === id)?.depth ?? 0;
  // Winners first among equal scores: a deathmatch can be won by the only duelist left, level on points.
  const standings = $derived(
    run
      ? delveRows.map((r) => s.players.find((p) => p.id === r.id)!).filter(Boolean)
      : [...s.players].sort((a, b) => b.score - a.score || +won(b.id) - +won(a.id)),
  );
  const winner = $derived(s.players.find((p) => s.winners.includes(p.id)) ?? standings[0]);
  const spectators = $derived(s.spectators ?? []);

  // One click only: a second one while this screen fades out would restart the new game.
  let leaving = $state(false);
  function again(play: boolean) {
    if (leaving) return;
    leaving = true;
    session.dispatch({ type: 'restart', play });
    // Still here (the restart was refused)? Let the host try again.
    setTimeout(() => (leaving = false), 1500);
  }

  // Online turns and race: the guests vote for another game, and once every
  // one still connected is ready the room counts down and the next starts by
  // itself (lib/series.ts, session.svelte.ts scheduleRematch).
  const voting = $derived(session.mode !== 'local' && !run);
  const votes = $derived(voting ? rematchCount(s) : { guests: [], ready: [] });
  const ready = $derived(new Set(votes.ready));
  const me = $derived(session.myPlayerId);
  const seated = $derived(!!me && s.players.some((p) => p.id === me));
  const myReady = $derived(!!me && ready.has(me));
  /** The other guests the vote still waits for. */
  const waiting = $derived(votes.guests.filter((id) => id !== me && !ready.has(id)));
  const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name ?? '';
  /** Watching: the next game seats them, as long as it has a seat left for them. */
  const seatNext = $derived.by(() => {
    const i = spectators.findIndex((o) => o.id === me);
    return i >= 0 && s.players.filter((p) => p.connected).length + i < MAX_PLAYERS;
  });
  /** Who takes a seat in the next game (a spectator who is told so above isn't named to themselves). */
  const joining = $derived(voting && seatNext ? spectators.filter((o) => o.id !== me) : spectators);
  /** When the next game starts by itself (host clock), once everyone is in. */
  const rematchAt = $derived(voting ? (s.rematch?.at ?? null) : null);
  function vote(yes: boolean) {
    session.dispatch({ type: 'rematch', ready: yes });
  }
  // The countdown follows the host's clock every frame, so every screen
  // drains its bar together; the last three seconds tick.
  let left = $state(0);
  let drain = $state(1);
  $effect(() => {
    const at = rematchAt;
    if (at === null) return;
    let frame = 0;
    let ticked = Infinity;
    const tick = () => {
      const ms = Math.max(0, at - session.hostNow());
      drain = Math.min(1, ms / REMATCH_MS);
      left = Math.ceil(ms / 1000);
      if (left >= 1 && left <= 3 && left < ticked) {
        ticked = left;
        sfx('tick');
      }
      if (ms > 0) frame = requestAnimationFrame(tick);
    };
    untrack(tick);
    return () => cancelAnimationFrame(frame);
  });
  // A check that appears on a row twinkles (not those already there as the screen opens).
  const openedAt = Date.now();
  function readied(node: HTMLElement) {
    if (Date.now() - openedAt > 1500) twinkle(node);
  }
  const iWon = $derived(session.mode !== 'local' && winner?.id === session.myPlayerId);
  // A descent has no victory: alone it ends where you fell, and a group's
  // deepest delver went furthest before falling (or stood last), nothing more.
  const headline = $derived.by(() => {
    if (!run) return iWon ? 'You are victorious!' : `${winner?.name} wins!`;
    if (solo) return `Depth ${shownDepth(winner ? depthOf(winner.id) : s.round)}`;
    return `Depth ${shownDepth(team?.depth ?? s.round)}`;
  });
  /** Deeper than this browser has been before in a run of its kind (not the very first one). */
  const deeper = $derived(newBest && session.delveResult?.previousBest !== null);
  // The night (lib/series.ts): what became of the Crown in this game, and who wears it into the next.
  const change = $derived(run ? null : crownChange(s));
  const kicker = $derived(
    !run
      ? change?.held
        ? 'The crown holds'
        : change?.from
          ? 'The crown falls'
          : 'Victory'
      : deeper
        ? solo
          ? 'Deeper than ever'
          : 'Deeper than ever together'
        : solo
          ? 'Perished'
          : 'The descent ends',
  );
  /** The night's score and the Crown's story, under the result. */
  const ledger = $derived(run ? [] : [ledgerLine(s, nameOf), crownLine(s, nameOf)].filter(Boolean));
  /** Under them, what this game did to the rivalries this device remembers (lib/rivals.ts): yours online, the couch's pairs on one device. */
  const rivalry = $derived.by(() => {
    const r = session.rivalsResult;
    return !run && r && r.game === s.startedAt ? r.lines : [];
  });
  /** From the second game, each row counts the games its player has won tonight. */
  const tally = $derived(!run && (s.series?.played ?? 0) >= 2);
  const champ = $derived(run ? null : crownedId(s));
  /** The game's winner, in the circle, wears the Crown now: it lands on them (a change), or they wore it already. */
  const wears = $derived(!!winner && champ === winner.id);
  /**
   * Delve: how the run measured up against this browser's records of its
   * kind (lib/delveRecord.ts), alone or together; nothing for a run whose
   * rules changed as it was resumed.
   */
  const record = $derived.by(() => {
    const r = run && session.delveResult?.id === run.startedAt ? session.delveResult : null;
    if (!r || run!.mixed) return '';
    const kind = solo ? '' : ' together';
    if (!r.best) return r.previousBest === null ? '' : ` Your best${kind} is depth ${shownDepth(r.previousBest)}.`;
    return r.previousBest === null ? ` Your first descent${kind}.` : ` Your previous best${kind} was ${shownDepth(r.previousBest)}.`;
  });
  /** Delve: what the depth means, and how a tie was settled. */
  const delveSub = $derived.by(() => {
    if (!run || !winner) return '';
    const row = delveRows.find((r) => r.id === winner.id);
    if (!row) return '';
    // A new best, the kicker says.
    if (solo) return ((row.losses.length ? `Lives lost at ${lossDepths(row.losses)}.` : '') + record).trim();
    // Together: the team's depth is the result (the headline), nobody wins.
    const given = team?.revives.length ?? 0;
    const parts = [team?.perished ? 'You perished together.' : '', given ? `${given === 1 ? 'One life was' : `${given} lives were`} passed between you.` : ''].filter(Boolean);
    return (parts.join(' ') + record).trim();
  });
  /** Delve together: the zone the team reached, in its colour. */
  const zone = $derived(team ? { name: zoneAt(team.depth), accent: accentAt(team.depth) } : null);

  // Delve: dare someone to go deeper. Turns and race: bring a challenger,
  // with the night's result and a link that seats them in the room's next
  // game (lib/invite.ts); on one device, the site's address.
  let shared = $state(false);
  function resultText() {
    // Alone, your depth; together, the team's.
    if (run) return team ? shareText(team.depth, true) : shareText(winner ? depthOf(winner.id) : s.round);
    const local = session.mode === 'local';
    const others = s.players.filter((p) => !won(p.id));
    const host = s.players.find((p) => p.id === s.hostId)?.name ?? '';
    return nightShare({
      winnerName: s.winners.length ? namesOf(s.winners, nameOf, null) : (winner?.name ?? ''),
      winnerIsMe: !local && s.winners.length === 1 && s.winners[0] === me,
      score: winner?.score ?? 0,
      runnerUp: others.length ? Math.max(...others.map((p) => p.score)) : null,
      played: s.series?.played ?? 0,
      champName: champ ? nameOf(champ) : '',
      champIsMe: !local && !!champ && champ === me,
      hotSeat: local,
      link: local ? siteLink() : inviteUrl(session.code, host),
    });
  }
  async function shareResult(e: MouseEvent) {
    if (!canShare) return;
    const text = resultText();
    if (!run) twinkle(e.currentTarget as HTMLElement);
    try {
      if (matchMedia('(pointer: coarse)').matches && navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        shared = true;
        setTimeout(() => (shared = false), 2000);
      }
    } catch {
      /* dismissed */
    }
  }
  // Only a delver shares a depth: on this device, the one who delved alone; online, a player of the run (never someone watching).
  // A challenger is brought by any player of a game against others (never someone watching), or from one device played by two or more.
  const canShare = $derived(
    run
      ? session.mode === 'local'
        ? solo
        : seated
      : s.players.length >= 2 && (session.mode === 'local' || seated),
  );

  let canvas: HTMLCanvasElement;
  let crown = $state<HTMLElement>();
  let title = $state<HTMLElement>();
  let standingsEl = $state<HTMLElement>();
  // A player who lost (online) sees a quieter screen. (Delve has its own ending, below.)
  const iLost = $derived(
    session.mode !== 'local' && !!session.myPlayerId && s.players.some((p) => p.id === session.myPlayerId) && !s.winners.includes(session.myPlayerId),
  );

  // The celebration: rays, fireworks and glitter (lib/fx/moments.ts). A
  // descent ends instead with its last embers going out (lib/fx/delveEnd.ts).
  onMount(() => {
    if (!crown || !title || !winner) return;
    const h = run
      ? fallen(crown, title, { best: deeper, standings: solo ? null : standingsEl })
      : victory(crown, title, playerColor(winner.hue), iLost, standingsEl);
    return () => h.stop();
  });

  // The Crown goes to its winner once the victory's first beats are over: a
  // stream from the row of whoever wore it into the game (or gold out of
  // the air), landing on the winner with the milestone's gong. Timed here
  // rather than on the effects' clock, so the gong sounds with effects off too.
  const CROWN_DELAY = 2200;
  let worn = $state<HTMLElement>();
  onMount(() => {
    if (!change) return;
    const from = change.from;
    const pass = setTimeout(() => {
      const row = from ? (standingsEl?.querySelector(`li[data-id="${CSS.escape(from)}"]`) ?? null) : null;
      if (worn) crownPassed(row, worn);
    }, CROWN_DELAY);
    const gong = setTimeout(() => sfx('stratum'), CROWN_DELAY + CROWN_LANDS * 1000);
    return () => {
      clearTimeout(pass);
      clearTimeout(gong);
    };
  });

  // Honours (lib/honours.ts): a line from this game for nearly everyone,
  // stamped onto the standings one by one, top to bottom, once the
  // victory's main beats are over and the Crown has landed. Each lands with
  // a small slam and a light tick; under reduced motion they are simply there.
  // Judged once, as the game ended (nothing that happens on this screen changes them).
  const hon: Map<string, Honour> = untrack(() => (run ? new Map() : honours(s)));
  const HONOURS_AT = 3000;
  const HONOUR_EVERY = 350;
  /** How long a stamp takes to come down (the slam is as it lands). */
  const STAMP_LANDS = 170;
  let stamped = $state(new Set<string>());
  onMount(() => {
    const order = standings.filter((p) => hon.has(p.id)).map((p) => p.id);
    if (!order.length) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stamped = new Set(order);
      return;
    }
    const start = change ? Math.max(HONOURS_AT, CROWN_DELAY + CROWN_LANDS * 1000 + 450) : HONOURS_AT;
    const timers: ReturnType<typeof setTimeout>[] = [];
    order.forEach((id, i) => {
      const at = start + i * HONOUR_EVERY;
      timers.push(setTimeout(() => (stamped = new Set([...stamped, id])), at));
      timers.push(
        setTimeout(() => {
          const chip = standingsEl?.querySelector(`li[data-id="${CSS.escape(id)}"] .honour`);
          if (chip) glyphLanded(chip);
          sfx('draw');
        }, at + STAMP_LANDS),
      );
    });
    return () => timers.forEach(clearTimeout);
  });

  // Without the effects layer (no WebGL2), simpler gold sparks on a 2D canvas;
  // also once it turns out not to come, should it still be on its way now.
  onMount(() => {
    let stop: (() => void) | null = null;
    const start = () => {
      if (stop || matchMedia('(prefers-reduced-motion: reduce)').matches || fxActive() || !fxUserOn() || iLost || run) return;
      stop = sparks();
    };
    start();
    const off = onFxChange(start);
    return () => {
      off();
      stop?.();
    };
  });
  function sparks() {
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, devicePixelRatio);
    // Sized from the canvas, which keeps its height while a phone's toolbars
    // slide (innerHeight follows them), and only when that size changes:
    // setting the size clears the canvas.
    let w = 0;
    let h = 0;
    const resize = () => {
      if (canvas.clientWidth === w && canvas.clientHeight === h) return;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const colors = ['#f1d99b', '#c9a45c', '#e08a44', '#fff4d6', playerColor(winner?.hue ?? 0)];
    type P = { x: number; y: number; vx: number; vy: number; life: number; size: number; c: string; spin: number };
    const parts: P[] = [];
    const burst = (x: number, y: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 2 + Math.random() * 7;
        parts.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 4,
          life: 1,
          size: 2 + Math.random() * 4,
          c: colors[Math.floor(Math.random() * colors.length)],
          spin: Math.random() * 6,
        });
      }
    };
    let raf = 0;
    let t = 0;
    const tick = () => {
      t++;
      if (t < 200 && t % 40 === 1) burst(w * (0.2 + Math.random() * 0.6), h * (0.2 + Math.random() * 0.3), 90);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += 0.12;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.008;
        p.spin += 0.2;
        if (p.life <= 0 || p.y > h + 20) {
          parts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.min(1, p.life * 1.5);
        ctx.fillStyle = p.c;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < 200 || parts.length) raf = requestAnimationFrame(tick);
      else {
        // Over and cleared: let the full-screen bitmap go. The canvas keeps
        // its CSS size, and w and h stay, so resize() only makes a new one
        // if the canvas really changes size.
        canvas.width = 0;
        canvas.height = 0;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }

  let rank = $derived.by(() => {
    if (run) return delveRows.map((r) => r.rank);
    const ranks: number[] = [];
    // A winner never shares its rank with a player who didn't win.
    standings.forEach((p, i) => {
      const prev = standings[i - 1];
      ranks.push(prev && p.score === prev.score && won(p.id) === won(prev.id) ? ranks[i - 1] : i + 1);
    });
    return ranks;
  });
</script>

<!-- Fixed to the viewport, so it leaves the app shell (which camera shake moves).
     Behind a dialog it only darkens: the sparks are soft already, and a blur
     would be redone every frame. -->
<canvas bind:this={canvas} class="sparks" use:portal={'dim'} aria-hidden="true"></canvas>

<div class="over" class:delve={!!run} class:deeper>
  <p class="kicker" in:fly={{ y: -10, duration: 600 }}>{kicker}</p>
  {#if winner}
    <div class="crown" class:fallen={!!run} bind:this={crown} in:scale={{ start: 0.4, duration: 900, delay: 200 }}>
      <!-- Delve: the deeper the run went, the colder the circle. -->
      <ArcaneCircle
        size="212px"
        color={run && endDepth >= BLUE_FROM
          ? `color-mix(in srgb, #a9bfdc ${Math.round(Math.min(1, 0.15 + ((endDepth - BLUE_FROM) / 16) * 0.85) * 100)}%, #f1d99b)`
          : `color-mix(in srgb, ${playerColor(winner.hue)}, #f1d99b 45%)`}
        strength={run ? (deeper ? 0.42 : 0.3) : iLost ? 0.35 : 0.6}
      />
      {#if team}
        <!-- Together: the whole team in the circle, perished side by side. -->
        <span class="team n{teamFaces.length + (teamMore ? 1 : 0)}">
          {#each teamFaces as p (p.id)}<Avatar name={p.name} hue={p.hue} size={teamFaces.length > 2 ? 54 : 64} />{/each}
          {#if teamMore}<span class="more" title="{teamMore} more">+{teamMore}</span>{/if}
        </span>
      {:else}
        <Avatar name={winner.name} hue={winner.hue} size={110} />
        {#if wears}
          <!-- The night's Crown, on the winner: it lands as its stream arrives (crownPassed), or was theirs already. -->
          <span class="worn" class:lands={!!change} style:--lands="{CROWN_DELAY + CROWN_LANDS * 1000}ms" bind:this={worn} title="Wears the Crown"><CrownMark size={46} /></span>
        {/if}
      {/if}
    </div>
    <h1 bind:this={title} in:fly={{ y: 20, duration: 700, delay: 500 }}>
      <span class="shade" aria-hidden="true">{headline}</span>
      <span class="gold">{headline}</span>
    </h1>
    <p class="sub muted" in:fly={{ y: 10, duration: 700, delay: 700 }}>
      {#if run}
        {delveSub}{#if run.mixed}{delveSub ? ' ' : ''}Finished under newer rules.{/if}
        {#if zone}<span class="zone" style:--accent={zone.accent}>{zone.name}</span>{/if}
      {:else}
        {winner.score} {winner.score === 1 ? 'point' : 'points'} after {s.round} {s.settings.mode === 'race' ? (s.round === 1 ? 'question' : 'questions') : s.round === 1 ? 'round' : 'rounds'}
        {#if s.deathmatch}· won the deathmatch in round {s.deathmatch.round}{/if}
      {/if}
    </p>
    {#if ledger.length || rivalry.length}
      <p class="ledger" in:fly={{ y: 10, duration: 700, delay: 800 }}>
        {#each ledger as line, i (i)}<span>{line}</span>{/each}
        {#each rivalry as line, i (i)}<span class="rival" class:apart={i === 0 && ledger.length > 0}>{line}</span>{/each}
      </p>
    {/if}
  {/if}

  <ol class="standings panel" bind:this={standingsEl} use:backdropShadow={{ fill: 'linear' }} in:fly={{ y: 30, duration: 700, delay: 900 }}>
    {#each standings as p, i (p.id)}
      {@const row = team?.players.find((r) => r.id === p.id)}
      {@const wins = tally ? nightWins(s, p.id) : 0}
      <li data-id={p.id} class:first={!team && rank[i] === 1} class:delver={!!row} in:fly={{ x: -20, duration: 400, delay: 1100 + i * 100 }}>
        {#if !team}<span class="rank">{rank[i]}</span>{/if}
        <Avatar name={p.name} hue={p.hue} size={30} />
        {#if row}
          <!-- Together: what each of them lost, gave and was given; their number is where they last perished. -->
          <span class="name">
            <PlayerName name={p.name} />{#if p.id === session.myPlayerId && session.mode !== 'local'}<em>&nbsp;(you)</em>{/if}
            <span class="detail"
              >{#each delverText(row).split(/(\d+)/) as part, j (j)}{#if j % 2}<span class="n">{part}</span>{:else}{part}{/if}{/each}</span
            >
          </span>
          <span class="pts depth" title={row.lives ? 'Still standing' : `Perished at depth ${shownDepth(row.depth)}`}>{shownDepth(row.depth)}</span>
        {:else}
        {@const honour = hon.get(p.id)}
        <span class="name"
          ><span class="line"
            ><PlayerName name={p.name} />{#if honour}<span class="honour" class:stamped={stamped.has(p.id)}>{honour.title}</span>{/if}{#if ready.has(p.id)}<span
                class="ready"
                role="img"
                aria-label="Ready for another"
                title="Ready for another"
                use:readied
                in:scale={{ start: 0.2, duration: 380 }}
                ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span
              >{/if}</span
          >{#if honour}<span class="detail earned" class:stamped={stamped.has(p.id)}>{honour.detail}</span>{/if}</span
        >
        {/if}
        {#if team}
          <!-- Its depth is beside the name, above. -->
        {:else if run}
          <span class="pts depth" title="Perished at depth {shownDepth(depthOf(p.id))}">{shownDepth(depthOf(p.id))}</span>
        {:else}
          {#if wins > 0}
            <span class="wins" title="{wins} {wins === 1 ? 'game' : 'games'} won tonight"><CrownMark size={13} /><span class="n">{wins}</span></span>
          {/if}
          <span class="pts">{p.score}</span>
        {/if}
      </li>
    {/each}
  </ol>

  <div class="actions" in:fly={{ y: 20, duration: 600, delay: 1300 }}>
    {#if session.isHost}
      <button class="btn primary big" class:again={votes.ready.length > 0 && rematchAt === null} disabled={leaving} onclick={() => again(true)}>
        {#if rematchAt !== null}Play now{:else}Play again{#if votes.ready.length}<span class="count"><span class="dot"> • </span>{votes.ready.length} of {votes.guests.length} ready</span>{/if}{/if}
      </button>
      <button class="btn ghost" disabled={leaving} onclick={() => again(false)}>{#if run}<span><span class="roomy">Back to</span> lobby</span>{:else}Change settings{/if}</button>
    {:else if voting && seated}
      {#if !myReady}
        <button class="btn primary big" onclick={() => vote(true)}>Again!</button>
      {:else}
        {#if rematchAt === null}
          <p class="muted">Ready. Waiting for {waiting.length ? namesOf(waiting, nameOf, me) : 'the host'}.</p>
        {/if}
        <button class="btn ghost small" onclick={() => vote(false)}>Not yet</button>
      {/if}
    {:else if voting && seatNext}
      <p class="muted">You'll play in the next game.</p>
    {:else}
      <p class="muted">Waiting for the host to start a new game…</p>
    {/if}
    {#if canShare}
      <span class="share" class:labelled={!run}>
        <button
          class="btn ghost"
          onclick={shareResult}
          aria-label={run ? (team ? "Share the team's depth" : 'Share your depth') : undefined}
          title={run ? (team ? "Share the team's depth" : 'Share your depth') : session.mode === 'local' ? 'Share the night with a friend' : 'Share the result; the link seats a friend in the next game'}
        >
          {#snippet check()}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{/snippet}
          <!-- Three linked seals: the share sign. -->
          {#snippet seals()}<svg viewBox="0 0 24 24" aria-hidden="true"
              ><circle cx="18" cy="5.5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="18.5" r="2.6" /><path
                d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4"
              /></svg
            >{/snippet}
          {#if !run}
            <!-- Copied: said in place of the words, in a cell sized to the longer, so the button keeps its width. -->
            <span class="say" aria-live="polite"
              ><span class:off={shared}>{@render seals()}Bring a challenger</span><span class:off={!shared}>{@render check()}Copied</span></span
            >
          {:else if shared}
            {@render check()}
          {:else}
            {@render seals()}
          {/if}
        </button>
        {#if shared && run}<span class="copied" role="status" transition:fly={{ y: 4, duration: 200 }}>Copied</span>{/if}
      </span>
    {/if}
  </div>
  {#if rematchAt !== null}
    <div class="countdown" transition:fly={{ y: 6, duration: 250 }}>
      <p aria-live="polite">Everyone's in. Next game in <b class="n">{left}</b></p>
      <span class="drain" style:transform="scaleX({drain})"></span>
    </div>
  {/if}
  {#if champ}
    <!-- Shown as the Crown lands, when it changes hands (or is held again). -->
    <p class="crowned" in:fly={{ y: 10, duration: 600, delay: change ? CROWN_DELAY + CROWN_LANDS * 1000 : 1500 }}>
      <CrownMark size={16} />Next game, {champ === me && session.mode !== 'local' ? 'you wear' : `${nameOf(champ)} wears`} the Crown.
    </p>
  {/if}
  {#if joining.length}
    <p class="joining muted" in:fly={{ y: 10, duration: 600, delay: 1400 }}>
      {joining.map((o) => o.name).join(', ')} {joining.length === 1 ? 'joins' : 'join'} the next game.
    </p>
  {/if}

  <p class="credit" in:fly={{ y: 10, duration: 600, delay: 1600 }}>
    <a href={SITE_URL} target="_blank" rel="noreferrer">poe2.quest</a> · made by
    <a class="maker" href={DONATE_URL} target="_blank" rel="noopener noreferrer" title="Support {CREATOR}">{CREATOR}</a>
    · <a class="tip" href={DONATE_URL} target="_blank" rel="noopener noreferrer">♥ support the project</a>
  </p>
</div>

<style>
  .sparks {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: var(--screen-h);
    pointer-events: none;
    z-index: 5;
  }
  .over {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 3rem 1rem 3rem;
    text-align: center;
  }
  .kicker {
    /* Clear the rune circle, which reaches 51px beyond the avatar. */
    margin: 0 0 calc(51px + 1.4rem);
    font-family: var(--font-display);
    letter-spacing: 0.6em;
    /* Letter spacing also trails the last letter; balance it so the word is centred. */
    padding-left: 0.6em;
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  .crown {
    position: relative;
    isolation: isolate;
    margin-bottom: calc(51px + 1rem);
  }
  /* On the avatar only: a filter over the turning rune circle would repaint it every frame. */
  .crown :global(.avatar) {
    filter: drop-shadow(0 0 30px rgba(241, 217, 155, 0.45));
  }
  /* The rune circle sits behind the avatar. */
  .crown :global(.arcane) {
    z-index: -1;
    margin: auto;
    inset: -51px;
  }
  h1 {
    font-size: clamp(2.25rem, 6.7vw, 3.8rem);
    font-weight: 900;
    /* The shadow and the gold are two copies of the text, stacked. */
    display: grid;
  }
  h1 > span {
    grid-area: 1 / 1;
  }
  /* The shadow on a layer of its own, painted once: as a filter on the gold
     it would be blurred again on every frame of the gleam. */
  .shade {
    color: transparent;
    text-shadow: 0 4px 16px rgba(0, 0, 0, 0.9);
    will-change: transform;
  }
  .gold {
    /* Positioned, so it paints over the shade, which its layer would otherwise lift above it. */
    position: relative;
    /* A band of light sweeps across the gold every few seconds. */
    background:
      linear-gradient(100deg, transparent 42%, rgba(255, 250, 232, 0.8) 50%, transparent 58%) no-repeat,
      linear-gradient(180deg, #fff1c9 10%, #d7b068 55%, #8b6526);
    background-size:
      250% 100%,
      100% 100%;
    background-position:
      160% 0,
      0 0;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: gleam 5s ease-in-out 1.4s infinite;
  }
  @keyframes gleam {
    0% {
      background-position:
        160% 0,
        0 0;
    }
    25%,
    100% {
      background-position:
        -60% 0,
        0 0;
    }
  }
  /* Delve: no victory. The title is cold, worn metal and holds still; the
     kicker is ash, warming to gold only for a run deeper than ever. */
  .delve .kicker {
    color: var(--muted);
  }
  .delve.deeper .kicker {
    color: var(--gold-hi);
    text-shadow: 0 0 14px rgba(241, 217, 155, 0.35);
  }
  .delve .gold {
    background: linear-gradient(180deg, #ece4d4 8%, #a89f90 55%, #5f574b);
    -webkit-background-clip: text;
    background-clip: text;
    animation: none;
  }
  .delve.deeper .gold {
    background: linear-gradient(180deg, #fbecc6 8%, #c9a45c 55%, #7a5a26);
    -webkit-background-clip: text;
    background-clip: text;
  }
  /* Alone, the fallen delver's portrait has lost its colour. */
  .crown.fallen :global(.avatar) {
    filter: grayscale(0.75) brightness(0.8) drop-shadow(0 0 22px rgba(169, 191, 220, 0.25));
  }
  /* Together: the team's faces in the circle, two side by side, three or four in a cluster. */
  .team {
    display: grid;
    grid-template-columns: repeat(2, auto);
    justify-content: center;
    align-items: center;
    gap: 4px;
    width: 110px;
    height: 110px;
    place-content: center;
  }
  .team.n1 {
    grid-template-columns: auto;
  }
  .team.n3 > :global(:first-child) {
    grid-column: 1 / -1;
    justify-self: center;
  }
  .crown.fallen .team :global(.avatar) {
    filter: grayscale(0.75) brightness(0.8);
  }
  /* The rest of a big team, as a count in the fourth place. */
  .team .more {
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    padding-top: 2px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 1rem;
    color: var(--gold-hi);
    background: #1a130c;
    border: 1px solid var(--gold-lo);
    border-radius: 50%;
  }
  .detail .n {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-size: 0.92em;
  }
  .zone {
    display: block;
    margin-top: 0.5rem;
    font-family: var(--font-display);
    font-style: normal;
    font-size: 0.78rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--accent);
    text-shadow: 0 0 12px color-mix(in srgb, var(--accent), transparent 60%);
  }
  .detail {
    display: block;
    font-size: 0.85rem;
    font-style: italic;
    color: var(--muted);
  }
  .standings li.delver .name em {
    color: var(--muted);
    font-size: 0.85em;
  }
  .standings li.delver .pts {
    font-family: var(--font-cinzel);
  }
  .sub {
    margin: 0.4rem 0 1.8rem;
    font-style: italic;
    font-size: 1.1rem;
  }
  .standings {
    list-style: none;
    margin: 0;
    padding: 0.8rem;
    width: min(460px, 100%);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .standings li {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.45rem 0.7rem;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
  }
  .standings li.first {
    background: linear-gradient(90deg, rgba(201, 164, 92, 0.18), rgba(0, 0, 0, 0.2));
    border: 1px solid rgba(201, 164, 92, 0.35);
  }
  .rank {
    width: 1.6rem;
    font-family: var(--font-display);
    font-weight: 900;
    color: var(--muted);
  }
  .first .rank {
    color: var(--gold-hi);
  }
  .name {
    flex: 1;
    text-align: left;
    font-size: 1.1rem;
  }
  .pts {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.2rem;
    color: var(--gold-hi);
  }
  .actions {
    display: flex;
    gap: 0.8rem;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 1.8rem;
  }
  .credit {
    margin: 2.2rem 0 0;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .credit a {
    color: var(--gold);
    text-decoration: none;
  }
  .credit .maker {
    color: var(--gold-hi);
    border-bottom: 1px dotted var(--gold-lo);
  }
  .credit .tip {
    color: #e0907c;
  }
  .credit a:hover {
    color: #fff1cf;
  }
  .joining {
    margin: 1rem 0 0;
    font-style: italic;
  }
  /* Share: an icon button the height of its neighbours, with a note when the text was copied. */
  .share {
    position: relative;
    display: inline-flex;
  }
  .share .btn {
    padding: 0.7em;
  }
  /* Bring a challenger: the sign before its words. */
  .share.labelled .btn {
    padding: 0.7em 1.2em 0.7em 1em;
  }
  .share.labelled svg {
    width: 1.25em;
    height: 1.25em;
  }
  .say {
    display: grid;
  }
  .say > span {
    grid-area: 1 / 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5em;
  }
  .say .off {
    visibility: hidden;
  }
  .share svg {
    width: 1.45em;
    height: 1.45em;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .copied {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 0.45rem);
    translate: -50% 0;
    padding: 0.2em 0.6em;
    font-family: var(--font-display);
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--gold-hi);
    background: rgba(13, 10, 7, 0.9);
    border: 1px solid var(--gold-lo);
    border-radius: 3px;
    pointer-events: none;
  }
  /* A phone fits Delve's three actions on one row as Play again, Lobby and the share icon. */
  @media (max-width: 420px) {
    .roomy {
      display: none;
    }
  }
  .actions p {
    margin: 0;
    font-style: italic;
  }
  /* Ready for another: a small gold check after the name. */
  .ready {
    display: inline-grid;
    place-items: center;
    width: 1.15rem;
    height: 1.15rem;
    color: var(--gold-hi);
    filter: drop-shadow(0 0 5px rgba(241, 217, 155, 0.45));
  }
  .ready svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* Play again and how many are ready: on a phone the count goes under it, smaller. */
  .again .count {
    font-size: 0.78em;
    letter-spacing: 0.1em;
  }
  @media (max-width: 420px) {
    .btn.again {
      flex-direction: column;
      gap: 0.15em;
      padding-block: 0.65em;
    }
    .again .dot {
      display: none;
    }
  }
  /* The night's score, under the result (closer to it than the standings are). */
  .ledger {
    max-width: 30rem;
    margin: -1.3rem 0 1.7rem;
    font-size: 1.05rem;
    color: #cbb994;
  }
  /* The score, then the Crown's story on a line of its own. */
  .ledger span {
    display: block;
  }
  /* This device's rivalries, quieter: the night is the room's, these are yours. */
  .ledger .rival {
    font-size: 0.95rem;
    font-style: italic;
    font-variant-numeric: lining-nums;
    color: var(--muted);
  }
  .ledger .rival.apart {
    margin-top: 0.35rem;
  }
  /* The Crown on the winner in the circle: over the top of the avatar, set
     off from it by a shadow; when it changes hands, stamped on as its gold
     lands (crownPassed), shown at once without motion. */
  .worn {
    position: absolute;
    left: 50%;
    top: 0;
    translate: -50% -60%;
    z-index: 1;
    line-height: 0;
    --crown: #f1d99b;
    --glow: 0.3;
    filter: drop-shadow(0 0 1.5px #0c0a08) drop-shadow(0 2px 5px rgba(0, 0, 0, 0.75));
  }
  .worn.lands {
    animation: crown-lands 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.15) var(--lands) both;
  }
  @keyframes crown-lands {
    from {
      opacity: 0;
      scale: 1.7;
    }
  }
  /* The name, then its honour and the check of a player ready for another:
     what doesn't fit goes on under the name, flush with it. */
  .name .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 0.45rem;
  }
  /* Honours: a chip stamped on beside the name, and what earned it on a line
     under it. Both hold their place from the start, so nothing moves as they
     land: the chip comes down hard and settles, its line fades in after it. */
  .honour {
    padding: 0.25em 0.55em 0.2em;
    font-family: var(--font-display);
    font-size: 0.6rem;
    line-height: 1.2;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--gold-hi);
    background: rgba(201, 164, 92, 0.12);
    border: 1px solid rgba(201, 164, 92, 0.55);
    border-radius: 2px;
    box-shadow: 0 0 10px rgba(241, 217, 155, 0.12);
    opacity: 0;
  }
  .honour.stamped {
    opacity: 1;
    animation: stamp 0.26s ease-in both;
  }
  @keyframes stamp {
    0% {
      opacity: 0;
      scale: 2.3;
    }
    65% {
      opacity: 1;
      scale: 0.92;
    }
    100% {
      scale: 1;
    }
  }
  .detail.earned {
    font-variant-numeric: lining-nums;
    opacity: 0;
    transition: opacity 0.5s 0.15s;
  }
  .detail.earned.stamped {
    opacity: 1;
  }
  /* Games won tonight: a small crown and the count, beside the points. */
  .wins {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.92rem;
    color: var(--gold);
  }
  .wins .n {
    padding-top: 1px;
  }
  .crowned {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    margin: 1rem 0 0;
    font-style: italic;
    color: var(--gold);
  }
  /* Everyone's in: the count over a gold line that drains to the next game. */
  .countdown {
    position: relative;
    margin-top: 1.1rem;
    padding-bottom: 0.45rem;
  }
  .countdown p {
    margin: 0;
    font-size: 1.1rem;
    font-style: italic;
    color: var(--gold-hi);
  }
  .countdown .n {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
  }
  .drain {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 2px;
    background: var(--gold-hi);
    box-shadow: 0 0 8px rgba(241, 217, 155, 0.5);
    transform-origin: left;
  }
</style>
