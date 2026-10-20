<script lang="ts">
  import { sfx } from '../lib/sound';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { playerColor } from '../lib/ui';
  import Avatar from './Avatar.svelte';
  import PlayerName from './PlayerName.svelte';
  import Phial from './Phial.svelte';
  import Inventory from './Inventory.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { onDestroy, tick, untrack, type Snippet } from 'svelte';
  import { fxActive, onFxChange, type Handle } from '../lib/fx/core';
  import {
    FILL_SPAN,
    FILL_START,
    FIND_LANDS,
    FIND_START,
    GIFT_LANDS,
    SCORE_LANDS,
    ablaze,
    doused,
    findGained,
    flareFound,
    lifeGiven,
    lifeHeld,
    lifeLost,
    lostPoint,
    newFlame,
    turnsBlue,
    wardBlocked,
    wardFormed,
    itemBlown,
  } from '../lib/fx/moments';
  import { scoreRow, scoreRowOf } from '../lib/scoreRows';
  import { FLARE_IGNITE_MS, flareStrike } from '../lib/flareBurn';
  import { flameOf, heatOf, streakOf } from '../lib/fx/streaks';
  import { flat, fullRoom, handheld, upright } from '../lib/layout';
  import { arrival } from '../lib/zoneArrival.svelte';
  import { dealing } from '../lib/dealing.svelte';
  import { kickConfirm } from '../lib/kick';
  import { cavesIn, fellAt, inventoryOf, isGroupRun, livesOf, reviveProblem, shownDepth, type FindKind, type Inventory as Carried, type ItemKind } from '../lib/delve';
  import { inventoryChanges, itemsBlown } from '../lib/delveSession';
  import { CASINGS, WARD_BREAK, WARD_NEXT, momentOf, type InventoryMoment } from '../lib/inventoryArt';
  import { MOMENTS } from '../lib/soundDesign';
  import type { GameState, Revive } from '../lib/game';
  import Gallery from './Gallery.svelte';
  import KickButton from './KickButton.svelte';
  import { zoomOf } from '../lib/stage';
  import HeartOfLight from './HeartOfLight.svelte';
  import StandingMark from './StandingMark.svelte';
  import { readsShellHeights } from '../lib/shellHeights.svelte';

  // Its styles read the shell's --header-h (App.svelte).
  readsShellHeights();

  /** Shown at the end of the row (the timer, on phones). */
  let { aside }: { aside?: Snippet } = $props();

  const s = $derived(session.state!);
  /**
   * A full room in the header's row (a phone on its side): every entry its
   * avatar alone, whoever's turn it is too (the banner names them), in one
   * row that scrolls sideways if it must, the one whose turn it is (or you,
   * together) kept in view.
   */
  const tight = $derived(flat.current && fullRoom(s.players.length));
  /** A full room on a phone, on its side (`tight`) or upright (in two rows at most, under the header): every entry its avatar alone. */
  const bare = $derived((flat.current || upright.current) && fullRoom(s.players.length));
  /**
   * A zone's card is up: on a phone on its side its bar covers the header's
   * row and the scoreboard in it, so the streaks' fire (drawn over the page,
   * lib/fx) goes out until the card has gone, and is lit again quietly.
   */
  const underBar = $derived(flat.current && !!arrival.card && dealing.held);
  let boardEl = $state<HTMLElement>();
  $effect(() => {
    if (!tight || !boardEl) return;
    void s.turn;
    void s.phase;
    boardEl.querySelector<HTMLElement>('li.active, li.you')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  // And smaller, as far as it must (down to 70%) for every entry to fit the
  // row: it scrolls only past that. Again whenever the row's width or an
  // entry changes (someone joins or leaves, a score gains a digit, a streak
  // lights) and once the fonts are in. --board-zoom lets the kick buttons
  // keep their touch size (KickButton.svelte).
  $effect(() => {
    const board = boardEl;
    if (!tight || !board) return;
    const fit = () => {
      board.style.zoom = '';
      board.style.removeProperty('--board-zoom');
      const need = board.scrollWidth;
      const room = board.clientWidth;
      if (need <= room) return;
      const zoom = String(Math.max(0.7, room / need));
      board.style.zoom = zoom;
      board.style.setProperty('--board-zoom', zoom);
    };
    fit();
    void document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(board.parentElement!);
    // (Its entries' own changes, not its style: fitting never sets this off again.)
    const mo = new MutationObserver(fit);
    mo.observe(board, { subtree: true, childList: true, characterData: true, attributeFilter: ['class'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      board.style.zoom = '';
      board.style.removeProperty('--board-zoom');
    };
  });
  const target = $derived(s.settings.targetScore);
  const race = $derived(s.settings.mode === 'race');
  const missed = $derived(new Set(s.question?.misses.map((m) => m.playerId) ?? []));
  const canKick = $derived(session.mode === 'host');
  /** Delve: lives instead of a score. */
  const run = $derived(s.delve ?? null);
  /** Delve together: nobody has a turn; on phones your own entry is the one spelled out. */
  const coop = $derived(!!run && isGroupRun(s));
  const me = $derived(session.mode === 'local' ? null : session.myPlayerId);
  /** Delve together: who answered the question in play (wrong, or it would be over). */
  const struck = $derived(new Set(coop && s.phase === 'question' ? (s.question?.struck ?? []).map((x) => x.by) : []));

  /**
   * The phial shown in a player's entry: upright beside the avatar (phones,
   * an entry shrunk to its avatar) or lying under the name.
   */
  function shownPhial(li: Element): { phial: Element; upright: boolean } | null {
    const side = li.querySelector('.phial-side');
    if (side && getComputedStyle(side).display !== 'none') {
      const phial = side.querySelector('.phial');
      if (phial) return { phial, upright: true };
    }
    const phial = li.querySelector('.info .phial');
    return phial ? { phial, upright: false } : null;
  }

  /** Seconds a lost life's chamber takes to pour out (Phial.svelte's pour), and its jet with it. */
  const POUR = 1.1;

  /**
   * Delve: when player `id` loses something on the question in play and it
   * is a find that caves in (an Azurite Vein), the key it is heard by, so the
   * cave-in sounds once however many lives and wards it takes; null otherwise.
   */
  function caveInOf(st: GameState, id: string): string | null {
    const q = st.question;
    return q?.find && cavesIn(q.find) ? `${q.askedAt}:${id}` : null;
  }
  /** Cave-ins already heard: one per player per vein, however their losses interleave (several on one device). */
  const cavesHeard = new Set<string>();
  /** The cave-in's sound, once per cave-in (`key` from caveInOf), from the entry it caves in on. */
  function caveInHeard(key: string, from: Element | null) {
    if (cavesHeard.has(key)) return;
    cavesHeard.add(key);
    sfx('caveIn', { from: { from } });
  }
  // Delve: a life lost makes the player's entry flinch, and the chamber of the
  // phial pours its light out, in step with the reveal's verdict, a moment
  // after the answer shows. Until then the life stays lit (`held`), and a
  // player who just fell keeps their phial until it has poured out.
  let hit = $state<Record<string, number>>({});
  let held = $state<Record<string, number>>({});
  // The lives' and revives' timers, cleared when the board goes (they write its state and draw on its rows).
  const pending = new Set<ReturnType<typeof setTimeout>>();
  function later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      pending.delete(t);
      fn();
    }, ms);
    pending.add(t);
  }
  $effect(() => () => {
    pending.forEach(clearTimeout);
    pending.clear();
  });
  let livesSeen: Record<string, number> = {};
  let lossesSeen: Record<string, number> = {};
  let runSeen = 0;
  $effect(() => {
    if (!run) return;
    if (run.startedAt !== runSeen) {
      runSeen = run.startedAt;
      livesSeen = {};
      lossesSeen = {};
    }
    for (const p of s.players) {
      const now = livesOf(s, p.id);
      const was = livesSeen[p.id];
      livesSeen[p.id] = now;
      const losses = run.losses[p.id]?.length ?? 0;
      const lossesWere = lossesSeen[p.id];
      lossesSeen[p.id] = losses;
      if (was === undefined || now >= was) continue;
      // A life given to a teammate isn't lost: it flows to them (playRevive below).
      if (lossesWere !== undefined && losses <= lossesWere) continue;
      const id = p.id;
      const mine = session.mode === 'local' ? true : id === session.myPlayerId;
      held[id] = was;
      // A cave-in can take two lives: they pour out one after the other, the
      // top chamber first. When a ward broke first, its shatter leads. It is
      // heard once, as a cave-in, not as each life going.
      const r = s.reveal;
      const after = 450 + (r?.caveIn && r.lost?.wards ? 650 : 0);
      const caved = caveInOf(s, id);
      for (let k = was - 1; k >= now; k--) {
        const left = k;
        later(
          () => {
            if (left === now) delete held[id];
            else held[id] = left;
            hit[id] = left;
            const li = scoreRowOf(id);
            // The light jets out of the end of whichever phial shows (lying or upright).
            const flow = li ? shownPhial(li) : null;
            const chamber = flow?.phial.querySelector(`.chamber[data-k="${left}"]`);
            if (li) lifeLost(li, chamber ?? li, left, mine, flow ?? undefined);
            // A cave-in rumbles once; each life it takes still sounds as it goes.
            if (mine) {
              if (caved) caveInHeard(caved, li);
              sfx('lifeLost', { from: { from: chamber ?? li } });
            }
            later(() => {
              if (hit[id] === left) delete hit[id];
            }, POUR * 1000);
          },
          after + (was - 1 - k) * POUR * 750,
        );
      }
    }
  });

  // Delve: what each player carries, on their phial. A change shows in step
  // with what caused it: a ward shatters at the reveal just as a life would
  // pour out, a find lands as the result line comes in, a flare burns at once.
  // Until then the entry keeps what they held (`invHeld`); `invMoment` plays
  // the change on the phial (Phial.svelte, its wards on the chambers; Inventory.svelte,
  // the counted finds) and here in the effects layer.
  let invHeld = $state<Record<string, Carried>>({});
  let invMoment = $state<Record<string, InventoryMoment>>({});
  /** A flare or dynamite on its way to a player's entry (findFlows): its place is kept for it. */
  let expecting = $state<Record<string, 'flare' | 'dynamite'>>({});
  /**
   * A ward taking a loss (or a cave-in's two wards, its two in turn): the
   * barrier its crystal throws round the phial (Phial.svelte's `guard`),
   * kept apart from `invMoment`, which a blast's own moment may replace
   * before the barrier's shards have flown.
   */
  let guard = $state<Record<string, { key: number; n: number; mine: boolean }>>({});
  /** What a blast destroyed (a Dynamite Cache missed), still shown until it blows apart after the rest of the loss. */
  let blownHeld = $state<Record<string, ItemKind>>({});
  let invPrev: GameState | null = null;
  let momentKey = 0;
  const carried = (id: string) => {
    if (invHeld[id]) return invHeld[id];
    const inv = inventoryOf(s, id);
    const item = blownHeld[id];
    return item ? { ...inv, [item]: inv[item] + 1 } : inv;
  };
  /** What inventoryChanges and itemsBlown read of a state, copied: the next state may be the same object, changed. */
  const invSnapshot = (st: GameState) =>
    ({
      phase: st.phase,
      players: st.players.map((p) => ({ id: p.id })),
      question: st.question && { askedAt: st.question.askedAt, struck: [...(st.question.struck ?? [])] },
      delve: st.delve && {
        startedAt: st.delve.startedAt,
        inventory: Object.fromEntries(Object.entries(st.delve.inventory ?? {}).map(([id, inv]) => [id, { ...inv }])),
        banked: st.delve.banked && { ...st.delve.banked },
      },
    }) as unknown as GameState;
  $effect(() => {
    const next = s;
    const was = invPrev;
    invPrev = invSnapshot(next);
    if (!run || !was) return;
    const atReveal = next.phase === 'reveal' && was.phase !== 'reveal';
    // A vein's haul just went into the pack (the way out, or the dig's end): its wards flow in as a find's do.
    const banking = !!next.delve?.banked && next.delve.banked.at !== was.delve?.banked?.at;
    const byPlayer = new Map<string, ReturnType<typeof inventoryChanges>>();
    for (const c of inventoryChanges(was, next)) byPlayer.set(c.playerId, [...(byPlayer.get(c.playerId) ?? []), c]);
    // A Dynamite Cache missed: what its blast destroyed is a moment of its
    // own, once the loss has shown (a ward taking it, or a life pouring out).
    const blownBy = new Map(itemsBlown(was, next).map((b) => [b.playerId, b.item]));
    for (const [id, item] of blownBy) {
      blownHeld[id] = item;
      later(() => {
        delete blownHeld[id];
        playMoment(id, 'blown', 1, false, null, item);
      }, BLOWN_AT);
    }
    for (const [id, all] of byPlayer) {
      // What the blast took is left to its own moment (a second ward gone with a ward that took the loss stays a shatter).
      const blownItem = blownBy.get(id);
      const changes = blownItem ? all.filter((c) => c.item !== blownItem || inventoryOf(was, id)[c.item] - inventoryOf(next, id)[c.item] > 1) : all;
      const kind = momentOf(changes);
      if (!kind) continue;
      // Perishing drops everything; only a ward breaking on the way (a cave-in) is a moment.
      if (kind !== 'shatter' && livesOf(next, id) === 0) continue;
      // A find answered right: its item flows from the answer to its place
      // (findFlows) and lands with the sparks; so does a vein's haul banked.
      const found = (atReveal || (banking && kind === 'ward')) && FOUND.has(kind);
      const delay = found ? (FIND_START + 0.1) * 1000 : !atReveal ? 0 : kind === 'shatter' ? 450 : 700;
      // A cave-in can break two wards at once (one of them the blast's, it has its own moment).
      const broke = Math.max(1, inventoryOf(was, id).wards - inventoryOf(next, id).wards - (blownItem === 'wards' ? 1 : 0));
      if (delay) invHeld[id] = inventoryOf(was, id);
      // Whether the sparks really flew is known a tick later (findFlows), well before the item lands.
      const flow = found ? untrack(() => findFlows(id, kind, inventoryOf(was, id).wards, banking && !atReveal)) : null;
      const caved = kind === 'shatter' ? caveInOf(next, id) : null;
      later(() => playMoment(id, kind, kind === 'shatter' ? broke : 1, !!flow?.fed, caved), delay);
    }
  });

  /** Moments of a find answered right, and the find each comes from. */
  const FOUND = new Map<InventoryMoment['kind'], FindKind>([
    ['ward', 'azurite'],
    ['flare', 'flare'],
    ['dynamite', 'dynamite'],
  ]);

  /**
   * A find answered right: a stream of sparks in its card's colours flows
   * from the right answer to the very place its item appears in player
   * `id`'s entry (findGained in lib/fx/moments.ts), as a point flows into
   * the bar in the other modes: a ward to the casing it forms on (round the
   * first chamber without a ward, `wards` being how many they had), a flare
   * or dynamite to its engraving beside the phial (or the avatar), its place
   * kept for it meanwhile. Whoever got it hears it flow in. Its `fed` turns true, a tick
   * later, once the sparks do fly (with effects off, or no answer or place
   * to fly between, nothing does). `banked`: a vein's haul going into the
   * pack, its wards flowing from the way out's card (its lantern) as it
   * leaves, or, the dig ended by itself, from the strike's right answer.
   */
  function findFlows(id: string, kind: InventoryMoment['kind'], wards: number, banked = false): { fed: boolean } {
    const flow = { fed: false };
    const find = FOUND.get(kind);
    if (!find || !fxActive()) return flow;
    const item = kind === 'flare' || kind === 'dynamite' ? kind : null;
    if (item) expecting[id] = item;
    // The find's ring, on its last layer, lands with the item (FIND_LANDS).
    const ringAt = MOMENTS.findReward.layers.reduce((at, l) => Math.max(at, l.delay), 0);
    const startAt = performance.now();
    void tick().then(() => {
      const li = scoreRowOf(id);
      // The right answer, as the reveal marks it (QuestionView.svelte); a haul banked, the way out's lantern.
      const answer =
        (banked ? document.querySelector('.choose .card.out .icon') : null) ?? document.querySelector('.question .option.right, .question .tile.right');
      if (!li || !answer) return;
      const { flow: phial, counts } = shownVessel(li);
      // Its slot (followed as the entry moves), and within it the exact part the item takes.
      const casing = phial?.phial.querySelector(`.slot[data-slot="${Math.min(wards, CASINGS.length - 1)}"]`);
      const slot = item ? counts?.querySelector(`[data-pip="${item}"]`) : casing;
      const aim = item ? slot?.querySelector('.grow') : casing;
      if (!slot) return;
      findGained(answer, slot, find, aim ?? slot);
      flow.fed = true;
      if (session.mode === 'local' || id === session.myPlayerId)
        later(
          // Heard flying in with the sparks, the ring landing on the slot.
          () => sfx('findReward', { from: { from: answer, to: aim ?? slot, seconds: ringAt / 1000 } }),
          Math.max(0, FIND_LANDS * 1000 - ringAt - (performance.now() - startAt)),
        );
    });
    return flow;
  }

  /** The phial showing in a player's entry, with what it carries, and the counted finds beside it. */
  function shownVessel(li: Element) {
    const flow = shownPhial(li);
    const vessel = flow?.phial.closest('.vessel') ?? null;
    return { flow, vessel, counts: flow?.upright ? li.querySelector('.side-counts') : vessel };
  }

  /**
   * ms from a Dynamite Cache's miss until its blast takes something from the
   * pack: after the loss has shown (a life starts pouring out, or a ward
   * shatters, 450 ms in) and a beat more, as the cave-in's lives follow its wards.
   */
  const BLOWN_AT = 450 + 650;

  /**
   * `fed`: a find's sparks flowed into it (findFlows), and were heard.
   * `caved`: a cave-in's key (caveInOf), to be heard as one. `item`: what a
   * blast destroyed (`blown`).
   */
  function playMoment(id: string, kind: InventoryMoment['kind'], n = 1, fed = false, caved: string | null = null, item?: ItemKind) {
    delete invHeld[id];
    delete expecting[id];
    const key = ++momentKey;
    invMoment[id] = { kind, key, ...(n > 1 ? { n } : {}), ...(item ? { item } : {}) };
    setTimeout(() => {
      if (invMoment[id]?.key === key) delete invMoment[id];
    }, 1300);
    const mine = session.mode === 'local' || id === session.myPlayerId;
    if (kind === 'shatter') {
      // The barrier catches each loss, breaks, and the lives behind it shine on.
      guard[id] = { key, n, mine };
      later(() => {
        if (guard[id]?.key === key) delete guard[id];
      }, ((n - 1) * WARD_NEXT + 1.1) * 1000);
      later(() => (surge[id] = (untrack(() => surge[id]) ?? 0) + 1), ((n - 1) * WARD_NEXT + WARD_BREAK + 0.15) * 1000);
    }
    void tick().then(() => {
      const li = scoreRowOf(id);
      if (!li) return;
      const { vessel, counts } = shownVessel(li);
      const pip = (sel: string) => vessel?.querySelector(sel) ?? null;
      // A ward's casing is on the chambers; a breaking ward bursts off its own.
      if (kind === 'ward') {
        const el = pip('.casing.whole.fresh');
        if (el) wardFormed(el, fed);
        if (mine && !fed) sfx('findReward', { from: { from: el ?? li } });
      } else if (kind === 'shatter') {
        // Each barrier catches its blow in turn, and its casing breaks with it.
        const barriers = vessel?.querySelectorAll('.aegis') ?? [];
        const casings = vessel?.querySelectorAll('.casing.ghost:not(.blown)') ?? [];
        for (let i = 0; i < n; i++) {
          const at = barriers[i] ?? vessel ?? li;
          setTimeout(() => wardBlocked(at, casings[i] ?? null, li, mine), i * WARD_NEXT * 1000);
        }
        // A cave-in rumbles once; each ward it breaks still shatters, in step with its barrier.
        if (mine) {
          if (caved) caveInHeard(caved, li);
          for (let i = 0; i < n; i++) setTimeout(() => sfx('wardShatter', { from: { from: barriers[i] ?? vessel ?? li } }), i * WARD_NEXT * 1000);
        }
      } else if (kind === 'flare' || kind === 'dynamite') {
        const el = counts?.querySelector(`[data-pip="${kind}"]`);
        if (el && kind === 'flare') flareFound(el);
        if (mine && !fed) sfx('findReward', { from: { from: el ?? li } });
      } else if (kind === 'burn') {
        // The ring on screen (the last one: an old one may still be fading
        // out). The flare flares here and its light streaks to it; the ring
        // burns on (TimerRing.svelte).
        const timer = [...document.querySelectorAll('.timer')].filter((t) => t.getClientRects().length).at(-1) ?? null;
        const icon = counts?.querySelector('[data-pip="flare"]') ?? null;
        flareStrike({ timer, pill: li, icon });
        // Everyone hears it: the clock everyone watches just got longer. It streaks from the entry to the clock.
        sfx('flare', { from: { from: icon ?? li, to: timer, seconds: FLARE_IGNITE_MS / 1000, far: !mine } });
      } else if (kind === 'blown' && item) {
        // What it was: a ward's casing on the chambers (bursting off,
        // Phial.svelte), a flare or stick beside the phial.
        const el =
          item === 'wards'
            ? (vessel?.querySelector('.casing.ghost.blown') ?? null)
            : (counts?.querySelector(`[data-pip="${item === 'flares' ? 'flare' : 'dynamite'}"]`) ?? null);
        if (el) itemBlown(el, li, item, mine);
        if (mine) sfx('itemBlown', { from: { from: el ?? li } });
      }
      // A blast is heard as the question it blasted away gives way (session.svelte.ts).
    });
  }

  // Delve together: a teammate gives one of their lives to one who perished.
  // The giver's chamber that empties pours its light out and it streams
  // across into the very chamber of the other's phial it fills (lifeGiven in
  // lib/fx/moments.ts), which lights as it lands. Until then each entry
  // shows what it had (`held`).
  let giving = $state<Record<string, number>>({});
  /** The chamber a given life lights in its taker's phial, while its light flows in. */
  let inflow = $state<Record<string, number>>({});
  let revivesSeen = 0;
  let revivesRun = 0;
  $effect(() => {
    if (!run) return;
    const list = run.revives ?? [];
    if (run.startedAt !== revivesRun || list.length < revivesSeen) {
      revivesRun = run.startedAt;
      revivesSeen = list.length;
      return;
    }
    const fresh = list.slice(revivesSeen);
    revivesSeen = list.length;
    for (const r of fresh) untrack(() => playRevive(r));
  });
  function playRevive(r: Revive) {
    // The giver's chamber that empties (their top life), and the taker's that fills (the first, or the next).
    const k = livesOf(s, r.by);
    const into = Math.max(0, livesOf(s, r.to) - 1);
    held[r.by] = k + 1;
    held[r.to] = into;
    later(() => {
      delete held[r.by];
      giving[r.by] = k;
      const giver = scoreRowOf(r.by);
      const taker = scoreRowOf(r.to);
      const from = giver ? shownPhial(giver) : null;
      const to = taker ? shownPhial(taker) : null;
      const chamber = from?.phial.querySelector(`.chamber[data-k="${k}"]`) ?? giver;
      const target = to?.phial.querySelector(`.chamber[data-k="${into}"]`) ?? to?.phial;
      if (giver && taker && chamber && target) lifeGiven(chamber, giver, target, taker);
      // Heard streaming across with the light; a teammate's (not one at this screen) from farther off.
      sfx('revive', { from: { from: chamber, to: target, seconds: GIFT_LANDS, far: session.mode !== 'local' && r.by !== session.myPlayerId } });
      later(() => {
        if (giving[r.by] === k) delete giving[r.by];
      }, POUR * 1000);
      later(() => {
        delete held[r.to];
        inflow[r.to] = into;
        surge[r.to] = (untrack(() => surge[r.to]) ?? 0) + 1;
        revived[r.to] = (untrack(() => revived[r.to]) ?? 0) + 1;
        later(() => delete revived[r.to], 1200);
        later(() => {
          if (inflow[r.to] === into) delete inflow[r.to];
        }, 1000);
      }, GIFT_LANDS * 1000);
    }, 300);
  }
  /** Entries just brought back (a glow while the light settles in). */
  let revived = $state<Record<string, number>>({});

  // Delve together: give one of your lives to a teammate who perished
  // (between questions, with two lives or more). Asked once more before it's given.
  const canRevive = (id: string) => coop && !!me && reviveProblem(s, me, id) === null;
  let asking = $state<string | null>(null);
  const askingName = $derived(asking ? (s.players.find((p) => p.id === asking)?.name ?? null) : null);
  // The question came, or they were brought back by someone else meanwhile: the offer goes.
  $effect(() => {
    if (asking && !canRevive(asking)) asking = null;
  });
  function revive() {
    if (!asking || !canRevive(asking)) return;
    session.dispatch({ type: 'revive', target: asking });
    asking = null;
  }
  /** Closes the offer and puts focus back on the heart that opened it. */
  function closeAsk() {
    const id = asking;
    asking = null;
    if (!id) return;
    void tick().then(() => (scoreRowOf(id)?.querySelector('.revive') as HTMLElement | null)?.focus());
  }
  /** Svelte action: the offer takes focus as it opens, on its first button. */
  function takeFocus(node: HTMLElement) {
    node.querySelector('button')?.focus();
  }

  // Delve has no points: a question survived sends a wave of light through
  // the phial instead, as the result line comes in.
  let surge = $state<Record<string, number>>({});
  let survivedSeen: Record<string, number> = {};
  $effect(() => {
    if (!run) return;
    const reveal = s.phase === 'reveal';
    for (const p of s.players) {
      const was = survivedSeen[p.id];
      survivedSeen[p.id] = p.score;
      if (was === undefined || p.score <= was || !reveal) continue;
      const id = p.id;
      setTimeout(() => {
        surge[id] = (untrack(() => surge[id]) ?? 0) + 1;
        const li = scoreRowOf(id);
        const flow = li ? shownPhial(li) : null;
        if (flow) lifeHeld(flow.phial);
      }, 550);
    }
  });

  // Changes that wait for a point to land (the score ticking up, a streak's
  // fire growing), per player: the value they land on and their timers.
  // Other updates from the host in the meantime leave them running.
  type Landing = { to: number; timers: ReturnType<typeof setTimeout>[] };
  /** Cancels whatever is under way for player `id` in `under`. */
  function cancel(under: Map<string, Landing>, id: string) {
    under.get(id)?.timers.forEach(clearTimeout);
    under.delete(id);
  }
  /** Runs `steps` (seconds from now, action) for player `id`, landing on `to`. The last step ends it. */
  function land(under: Map<string, Landing>, id: string, to: number, steps: [number, () => void][]) {
    cancel(under, id);
    const timers = steps.map(([at, act], i) =>
      setTimeout(() => {
        if (i === steps.length - 1) under.delete(id);
        act();
      }, at * 1000),
    );
    under.set(id, { to, timers });
  }

  // Scores as shown. A point won at a reveal flows into the scorer's bar as a
  // stream of sparks (see fillBar in lib/fx/moments.ts): the bar fills while
  // they land, and the number ticks up when the last one has.
  let shown = $state<Record<string, number>>({});
  let barShown = $state<Record<string, number>>({});
  let filling = $state<Record<string, boolean>>({});
  const awards = new Map<string, Landing>();
  const latest = (id: string, fallback: number) => session.state?.players.find((x) => x.id === id)?.score ?? fallback;
  $effect(() => {
    for (const p of s.players) {
      const score = p.score;
      const was = untrack(() => shown[p.id]);
      if (was === undefined || score === was) {
        if (was === undefined) shown[p.id] = barShown[p.id] = score;
        continue;
      }
      if (awards.get(p.id)?.to === score) continue;
      if (score > was && fxActive() && s.phase === 'reveal') {
        land(awards, p.id, score, [
          [
            FILL_START,
            () => {
              filling[p.id] = true;
              barShown[p.id] = latest(p.id, score);
            },
          ],
          [
            SCORE_LANDS,
            () => {
              filling[p.id] = false;
              shown[p.id] = barShown[p.id] = latest(p.id, score);
              // A streak's fire grows as the number ticks up.
              burning[p.id] = streakOf(session.state?.players.find((x) => x.id === p.id));
            },
          ],
        ]);
      } else {
        cancel(awards, p.id);
        if (score < was) {
          const li = scoreRowOf(p.id);
          if (li) lostPoint(li);
        }
        filling[p.id] = false;
        shown[p.id] = barShown[p.id] = score;
      }
    }
  });
  const scoreOf = (id: string, fallback: number) => shown[id] ?? fallback;
  const barOf = (id: string, fallback: number) => barShown[id] ?? fallback;

  // Players on a streak burn. The fire grows with the score, as the number
  // ticks up (the award's last step above); a broken streak puts it out at once.
  // The streak as the fire shows it, per player.
  let burning = $state<Record<string, number>>({});
  $effect(() => {
    const here = new Set<string>();
    for (const p of s.players) {
      here.add(p.id);
      const n = streakOf(p);
      const was = untrack(() => burning[p.id] ?? 0);
      if (n > was && awards.has(p.id)) continue;
      if (n !== was) burning[p.id] = n;
    }
    // Players who left take their fire with them.
    for (const id of Object.keys(untrack(() => burning))) if (!here.has(id)) delete burning[id];
  });
  $effect(() => () => {
    for (const id of [...awards.keys()]) cancel(awards, id);
  });

  /**
   * Svelte action: sets a row burning for a streak of `n`, re-lit as its heat
   * or colour changes. `delve`: the long scale and the colours past blue
   * (lib/fx/streaks). Reaching a new colour, it bursts in it. `hidden`: out
   * for now, put out and lit again without a word (no douse, no burst).
   */
  function burn(node: HTMLElement, o: { n: number; delve: boolean; hidden?: boolean }) {
    let fire: Handle | null = null;
    let lit = { heat: 0, flame: flameOf(0) };
    let hid = false;
    const light = () => (fire = lit.heat > 0 && !hid ? ablaze(node, lit.heat, lit.flame.blue, lit.flame.tint) : null);
    const set = ({ n, delve, hidden = false }: { n: number; delve: boolean; hidden?: boolean }) => {
      if (hidden !== hid) {
        hid = hidden;
        fire?.stop(hidden ? 0.2 : 0);
        light();
      }
      const next = { heat: heatOf(n, delve), flame: flameOf(n, delve) };
      if (next.heat === lit.heat && (next.heat === 0 || next.flame === lit.flame)) return;
      const was = lit;
      lit = next;
      fire?.stop(0.5);
      light();
      if (hid) return;
      if (was.heat > 0 && next.heat === 0) doused(node);
      if (was.heat > 0 && next.heat > 0 && next.flame !== was.flame) {
        if (next.flame.blue) turnsBlue(node);
        else if (next.flame.tint) newFlame(node, next.flame.tint);
      }
    };
    set(o);
    // Effects switched off and on, or the GL context lost and restored, wipe
    // every shape: light it again on the new one.
    const relight = onFxChange(() => {
      fire?.stop(0);
      light();
    });
    return {
      update: set,
      destroy: () => {
        relight();
        fire?.stop(0.3);
      },
    };
  }

  // Kicking takes two clicks (lib/kick), so neither a stray tap nor a double
  // click removes anyone.
  let confirming = $state<string | null>(null);
  const kicker = kickConfirm((id) => (confirming = id));
  onDestroy(kicker.dispose);
  function kick(id: string) {
    if (kicker.click(id)) session.kick(id);
  }

  /**
   * Svelte animation: entries glide to their new places. Unlike flip it never
   * scales them, which would stretch a pill (and its avatar) as it grows or
   * shrinks between turns on phones. It moves them with `translate`, so the
   * active entry's own transform stays.
   */
  function glide(node: Element, { from, to }: { from: DOMRect; to: DOMRect }) {
    // Measured on screen: in the entry's own px under the stage's zoom.
    const z = zoomOf(node);
    const dx = (from.left - to.left) / z;
    const dy = (from.top - to.top) / z;
    return { duration: 400, easing: cubicOut, css: (_t: number, u: number) => `translate: ${u * dx}px ${u * dy}px` };
  }

  // Stuck (phones only, either way up): the strip sticks 1px above the top of the screen, so
  // once it has, it no longer fits in the view. Its background then covers
  // what the backdrop draws under the entries, so CSS paints their shadows.
  let strip = $state<HTMLElement>();
  let stuck = $state(false);
  $effect(() => {
    stuck = false;
    if (!handheld.current || !strip) return;
    const io = new IntersectionObserver(([e]) => (stuck = e.intersectionRatio < 1 && e.boundingClientRect.top < 0), {
      threshold: 1,
    });
    io.observe(strip);
    return () => io.disconnect();
  });
</script>


<!-- While the offer to give a life is open, Escape closes it and hands focus back to its heart. -->
<!-- Escape closes the revive question, or takes an armed kick back; a press anywhere but the armed Kick takes it back too. -->
<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    if (asking) (e.preventDefault(), closeAsk());
    else kicker.disarm();
  }}
  onpointerdown={(e) => !(e.target as Element).closest?.('.kick.armed') && kicker.disarm()}
/>

<!-- On phones the row sticks to the top of the screen; once it has, it takes a
     background of its own over the content scrolling under it. -->
<!-- data-cursor: where other players' pointers are placed (PeerCursors): the strip, each player's row in it. -->
<div class="strip" data-cursor="board" class:stuck bind:this={strip}>
  <ol class="board" class:crowded={fullRoom(s.players.length)} class:tight bind:this={boardEl}>
    {#each s.players as p, i (p.id)}
      {@const active = race ? s.phase === 'reveal' && s.reveal?.winnerId === p.id : !coop && i === s.turn && s.phase !== 'over'}
      {@const wide = !bare && (coop ? p.id === me : active)}
      {@const out = (race && s.phase !== 'over' && missed.has(p.id)) || struck.has(p.id)}
      {@const benched = !!s.deathmatch && s.phase !== 'over' && !s.deathmatch.alive.includes(p.id)}
      {@const duelist = !!s.deathmatch && s.phase !== 'over' && s.deathmatch.alive.includes(p.id)}
      {@const score = scoreOf(p.id, p.score)}
      {@const streakShown = burning[p.id] ?? 0}
      {@const fire = heatOf(streakShown, !!run)}
      {@const lives = run ? livesOf(s, p.id) : 0}
      {@const fell = run && !(p.id in hit) && !(p.id in held) ? fellAt(s, p.id) : null}
      {@const shownLives = held[p.id] ?? lives}
      {@const inv = run ? carried(p.id) : null}
      {@const moment = invMoment[p.id] ?? null}
      {@const expect = expecting[p.id] ?? null}
      {@const reviveOk = fell !== null && canRevive(p.id)}
      <li
        data-cursor="row:{i}"
        use:backdropShadow={{ off: stuck }}
        use:scoreRow={p.id}
        use:burn={{ n: streakShown, delve: !!run, hidden: underBar }}
        class:ablaze={fire > 0}
        style:--heat={fire}
        style:--flame-rgb={flameOf(streakShown, !!run).css}
        class:armed={confirming === p.id}
        class:active class:you={coop && p.id === me} class:wide class:revivable={reviveOk} class:revived={p.id in revived} class:out class:benched class:duelist class:fallen={fell !== null} class:hit={p.id in hit} class:warded={p.id in guard} class:offline={!p.connected} animate:glide style:--c={playerColor(p.hue)}>
        <Avatar name={p.name} hue={p.hue} size={32} dim={!p.connected} wrong={out} />
        <div class="info">
          <span class="name-row">
            <span class="name">
              <PlayerName name={p.name} />{#if session.mode !== 'local' && p.id === session.myPlayerId && s.players.length > 1}<em>&nbsp;(you)</em>{/if}
            </span>
            <!-- Online, room for the offline mark after the name is always kept, so nothing moves when it comes. -->
            {#if session.mode !== 'local'}<span class="off-slot">{#if !p.connected}{@render offline()}{/if}</span>{/if}
          </span>
          {#if run && fell !== null}
            <span class="fell-at">Perished at depth {shownDepth(fell)}</span>
          {:else if run}
            <Phial lives={shownLives} draining={hit[p.id] ?? giving[p.id] ?? -1} filling={inflow[p.id] ?? -1} surge={surge[p.id] ?? 0} {inv} {moment} {expect} guard={guard[p.id] ?? null} />
          {:else}
            <span class="bar" class:filling={filling[p.id]} style:--fill-span="{FILL_SPAN}s"
              ><span style:width="{Math.max(0, Math.min(100, (barOf(p.id, p.score) / target) * 100))}%"></span></span
            >
          {/if}
        </div>
        {#if run}
          <!-- Phones only, on the entries shrunk to an avatar: the phial upright beside it. -->
          <!-- Hidden from screen readers: the phial under the name (also in the entry) says the same. -->
          <span class="phial-side" aria-hidden="true"><Phial lives={shownLives} draining={hit[p.id] ?? giving[p.id] ?? -1} filling={inflow[p.id] ?? -1} surge={surge[p.id] ?? 0} vertical {inv} {moment} guard={guard[p.id] ?? null} /></span>
          <!-- And there, the flares and dynamite they carry, on the avatar's other corner. -->
          {#if fell === null && inv && (inv.flares > 0 || inv.dynamite > 0 || moment?.kind === 'burn' || moment?.kind === 'blast' || (moment?.kind === 'blown' && (moment.item === 'flares' || moment.item === 'dynamite')) || expect)}
            <span class="side-counts"><Inventory {inv} {moment} {expect} /></span>
          {/if}
        {:else}
          {#key score}
            <span class="score" class:negative={score < 0} class:bump={race ? active : score > 0} class:down={out}
              >{score}</span
            >
          {/key}
        {/if}
        {#if guard[p.id]}
          <!-- A ward taking a loss: the entry braces, rimmed in azurite light. -->
          {#key guard[p.id].key}<span class="ward-rim" class:theirs={!guard[p.id].mine} aria-hidden="true"></span>{/key}
        {/if}
        <!-- Phones, on the entries shrunk to an avatar (no name to follow): on the avatar's free top right
             corner (the host's remove × has the left), giving way to a wrong answer's mark there. Not in a
             delve, whose upright phial holds that edge: the greyed avatar says it there. Screen readers have
             the mark after the name already (the name is only hidden from sight). -->
        {#if !p.connected && !out && !run}<span class="off-corner" aria-hidden="true">{@render offline()}</span>{/if}
        {#if canKick && p.id !== s.hostId}
          <span class="kick-at" class:armed={confirming === p.id}>
            <KickButton name={p.name} armed={confirming === p.id} title="Remove {p.name} from the game" onclick={() => kick(p.id)} />
          </span>
        {/if}
        {#if reviveOk}
          <!-- Delve together: revive them with one of your lives. A heart of
               light in the entry, beating as the phial's lives do. -->
          <button
            class="revive"
            class:open={asking === p.id}
            onclick={() => (asking = asking === p.id ? null : p.id)}
            aria-label="Revive {p.name}: give them one of your lives"
            aria-expanded={asking === p.id}
            ><span class="heart" aria-hidden="true"><HeartOfLight /></span></button
          >
        {/if}
      </li>
    {/each}
  </ol>
  {@render aside?.()}
  <!-- Who's watching hangs under the strip, so nothing moves when someone comes in to watch. Not while the offer to give a life hangs there. -->
  {#if !asking && (!session.spectating || flat.current)}<Gallery hang />{/if}
  {#if asking && askingName && me}
    <!-- Focus moves in as it opens; Escape or Not now hands it back to the heart. -->
    <div
      class="revive-ask"
      data-cursor="ask"
      role="group"
      aria-label="Give a life"
      use:takeFocus
      transition:fly={{ y: -6, duration: 200 }}
    >
      <span class="ask">Give {askingName} one of your lives?</span>
      <span class="ask-actions">
        <button class="btn small primary" onclick={revive}>Give a life</button>
        <button class="btn small ghost" onclick={closeAsk}>Not now</button>
      </span>
    </div>
  {/if}
</div>
<!-- A spectator's own view: the gallery in the flow, with their choice to play next game
     (on a phone on its side, where the page has no height to spare, it hangs under the header's row as the players' does). -->
{#if session.spectating && !flat.current}<Gallery />{/if}

<!-- Gone: the lobby's offline mark (StandingMark), a phone's signal with no bar lit, struck through. -->
{#snippet offline()}
  <span class="off"><StandingMark mark="offline" title="Offline" /></span>
{/snippet}

<style>
  .board {
    list-style: none;
    margin: 0;
    padding: 1rem 0.2rem 0.6rem;
    display: flex;
    gap: 0.6rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  li {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 160px;
    padding: 0.45rem 0.8rem 0.45rem 0.5rem;
    background: rgba(12, 10, 8, 0.75);
    border: 1px solid var(--line);
    border-radius: 999px;
    --bs1: 0px 22px;
    box-shadow:
      0 0 0 1px var(--bs-ring),
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent), 0 var(--bs2, 0 0) var(--bs2-color, transparent));
    transition:
      border-color 0.35s,
      --bs-ring 0.35s,
      --bs1-color 0.35s,
      transform 0.35s var(--ease-out),
      opacity 0.35s;
  }
  li.active .name {
    color: #fff4e0;
  }
  li.active {
    background: rgba(20, 16, 11, 0.85);
    border-color: var(--c);
    --bs-ring: color-mix(in srgb, var(--c), transparent 60%);
    --bs1-color: color-mix(in srgb, var(--c), transparent 70%);
    transform: translateY(-2px) scale(1.04);
  }
  /* On a streak: the entry smoulders under its flames (and still glows with effects off). */
  li.ablaze {
    /* Orange, blue at the top of a streak, and in Delve on up the daily's colours (lib/fx/streaks). */
    --flame: rgb(var(--flame-rgb, 255, 110, 30));
  }
  /* Borders that say something (whose turn, answered wrong, a duelist) win over the fire's. */
  li.ablaze:not(.active, .out, .duelist) {
    border-color: color-mix(in srgb, var(--flame) calc(50% + 50% * var(--heat)), transparent);
  }
  li.ablaze::before {
    content: '';
    position: absolute;
    inset: -1px;
    z-index: -1;
    border-radius: inherit;
    pointer-events: none;
    box-shadow:
      0 0 calc(8px + 20px * var(--heat)) calc(4px * var(--heat)) color-mix(in srgb, var(--flame) calc(35% + 40% * var(--heat)), transparent),
      0 calc(-6px * var(--heat)) calc(14px + 26px * var(--heat)) color-mix(in srgb, var(--flame) calc(20% + 40% * var(--heat)), transparent);
    /* A fixed pace: changing an infinite animation's duration as the heat steps up makes it jump. */
    animation: smoulder 0.9s ease-in-out infinite alternate;
  }
  @keyframes smoulder {
    to {
      opacity: 0.55;
    }
  }
  li.active::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -10px;
    translate: -50% 0;
    border: 5px solid transparent;
    border-top-color: var(--c);
  }
  /* The kick, as the lobby's (KickButton): a small seal on the entry's
     corner, shown while the entry is pointed at; pointed at itself, it and
     the entry's edge warm red; armed, it grows sideways into a pill reading
     Kick, while the entry takes the wrong-answer colours. */
  .kick-at {
    position: absolute;
    top: -8px;
    left: -6px;
    display: flex;
    --kick-size: 20px;
    --kick-armed: 50px;
    opacity: 0;
    transition: opacity 0.2s;
  }
  li:hover .kick-at,
  .kick-at:focus-within,
  .kick-at.armed {
    opacity: 1;
  }
  li:has(:global(.kick:hover)) {
    border-color: rgba(224, 85, 63, 0.45);
  }
  /* Armed: the whole entry asks, in the wrong-answer colours, the avatar dimmed. */
  li.armed {
    border-color: #8e4434;
    background: linear-gradient(90deg, rgba(78, 32, 22, 0.9), rgba(34, 15, 11, 0.92));
  }
  li.armed :global(.avatar:not(:has(> .face-down))) {
    filter: saturate(0.4) brightness(0.75);
  }
  li.armed .name {
    color: #eab3a3;
  }
  @media (hover: none) {
    .kick-at {
      opacity: 0.8;
    }
  }
  li.benched {
    opacity: 0.4;
    filter: grayscale(0.7);
  }
  /* Fallen: once the last life has poured out, the entry fades to grey. */
  li.fallen {
    opacity: 0.45;
    filter: grayscale(0.85);
    transition:
      border-color 0.35s,
      --bs-ring 0.35s,
      --bs1-color 0.35s,
      transform 0.35s var(--ease-out),
      opacity 0.9s ease,
      filter 0.9s ease;
  }
  .fell-at {
    animation: fell-in 0.6s ease both;
    font-size: 0.8rem;
    font-style: italic;
    line-height: 1;
    color: var(--muted);
  }
  @keyframes fell-in {
    from {
      opacity: 0;
    }
  }
  li.hit {
    animation: flinch 0.5s var(--ease-out);
    border-color: rgba(200, 60, 45, 0.7);
  }
  @keyframes flinch {
    20% {
      translate: -4px 0;
    }
    45% {
      translate: 3px 0;
    }
    70% {
      translate: -1px 0;
    }
  }
  /* A ward taking a loss: rather than flinch, the entry braces (swells a
     little as the barrier catches the blow, and settles), rimmed in azurite
     light that flares and fades. */
  li.warded {
    animation: brace 0.45s cubic-bezier(0.3, 0.7, 0.4, 1);
    border-color: rgba(110, 165, 240, 0.75);
  }
  @keyframes brace {
    25% {
      scale: 1.035;
    }
  }
  /* While a ward's barrier shows, the avatar stays above it, whose tip reaches
     toward it; only then, so at rest the badges on its corners stay on top. */
  li.warded > :global(.avatar) {
    position: relative;
    z-index: 1;
  }
  .ward-rim {
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    border: 1px solid rgba(170, 214, 255, 0.95);
    box-shadow:
      0 0 14px rgba(70, 140, 255, 0.55),
      inset 0 0 10px rgba(70, 140, 255, 0.3);
    pointer-events: none;
    opacity: 0;
    animation: ward-rim 1s ease-out both;
  }
  .ward-rim.theirs {
    box-shadow:
      0 0 8px rgba(70, 140, 255, 0.45),
      inset 0 0 6px rgba(70, 140, 255, 0.25);
  }
  @keyframes ward-rim {
    12% {
      opacity: 1;
    }
    45% {
      opacity: 0.8;
    }
    to {
      opacity: 0;
    }
  }
  /* The upright phial only shows on phones, beside an entry shrunk to an avatar (below). */
  .phial-side,
  .side-counts {
    display: none;
  }
  .info :global(.phial) {
    margin-top: 2px;
  }

  /* Delve together: perished, but a teammate here can bring them back. The
     entry stays grey; its heart stays lit. */
  li.fallen.revivable {
    opacity: 1;
    filter: none;
  }
  /* (Not the remove button, which keeps its own showing: on hover only.) */
  li.fallen.revivable > :not(.revive, .kick-at) {
    opacity: 0.45;
    filter: grayscale(0.85);
  }
  /* The revive: a heart of light at the end of the entry, inside it. It
     beats in the phial's rhythm (Phial.svelte's .beat, lub-dub and rest),
     a soft rose glow swelling behind it; only opacity and transform move. */
  .revive {
    position: relative;
    flex: none;
    width: 28px;
    height: 28px;
    margin: -4px -6px -4px -2px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: none;
    color: inherit;
    cursor: pointer;
  }
  /* A touch target a little bigger than the heart, unseen. */
  .revive::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
  }
  .revive::before {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(255, 196, 168, 0.55), rgba(236, 58, 72, 0.28) 55%, rgba(236, 58, 72, 0) 100%);
    opacity: 0.45;
    animation: heartbeat 1.3s ease-out infinite;
    pointer-events: none;
  }
  .heart {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    animation: heartbeat-glyph 1.3s ease-out infinite;
  }
  @keyframes heartbeat {
    0% {
      opacity: 0.45;
      transform: scale(0.86);
    }
    11% {
      opacity: 1;
      transform: scale(1.1);
    }
    24% {
      opacity: 0.6;
      transform: scale(0.94);
    }
    35% {
      opacity: 0.9;
      transform: scale(1.04);
    }
    62%,
    100% {
      opacity: 0.45;
      transform: scale(0.86);
    }
  }
  @keyframes heartbeat-glyph {
    0%,
    62%,
    100% {
      transform: none;
    }
    11% {
      transform: scale(1.08);
    }
    24% {
      transform: scale(0.98);
    }
    35% {
      transform: scale(1.04);
    }
  }
  .revive:hover::before,
  .revive:focus-visible::before,
  .revive.open::before {
    background: radial-gradient(closest-side, rgba(255, 220, 196, 0.75), rgba(255, 110, 90, 0.4) 55%, rgba(236, 58, 72, 0) 100%);
  }
  .revive:focus-visible {
    outline: 1px solid var(--gold-hi);
    outline-offset: 1px;
  }
  :global(html[data-still]) .revive::before,
  :global(html[data-still]) .heart {
    animation: none;
  }
  /* Just brought back: the entry glows rose for a moment. */
  li.revived {
    border-color: rgba(255, 130, 110, 0.75);
    --bs1-color: rgba(255, 110, 90, 0.3);
  }
  /* Asked once more before a life is given. */
  /* Laid over what is under the scoreboard, so nothing below moves. */
  .strip {
    position: relative;
  }
  .revive-ask {
    position: absolute;
    left: 50%;
    top: calc(100% - 0.2rem);
    translate: -50% 0;
    z-index: 11;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.5rem 0.9rem;
    padding: 0.5rem 0.9rem;
    width: max-content;
    max-width: 100%;
    border: 1px solid rgba(236, 58, 72, 0.45);
    border-radius: 6px;
    background: rgba(20, 10, 9, 0.92);
    box-shadow: 0 0 22px rgba(236, 58, 72, 0.15);
  }
  .ask {
    font-size: 1rem;
  }
  .ask-actions {
    display: flex;
    gap: 0.5rem;
  }
  @media (prefers-reduced-motion: reduce) {
    li.hit,
    li.warded,
    .ward-rim,
    .revive::before,
    .heart {
      animation: none;
    }
    /* Held while the ward takes the loss, without the flare. */
    .ward-rim {
      opacity: 0.85;
    }

  }
  li.duelist {
    border-color: rgba(224, 85, 63, 0.55);
  }
  /* Answered wrong: the avatar turns face down (Avatar's wrong), and the rest
     of the entry is set back, fading as the entry would; the token keeps the
     verdict's full colour (scoped, these never reach the avatar, its own
     component), and a ward's rim keeps its own flare. The transition as
     :where, so a child's own transition wins over it. */
  li > :where(:not(.kick-at, .revive, .ward-rim)) {
    transition: opacity 0.35s;
  }
  li.out {
    border-color: rgba(224, 85, 63, 0.45);
  }
  li.out > :not(.kick-at, .revive, .ward-rim),
  li.out .kick-at > :global(.kick) {
    opacity: 0.75;
  }
  /* Perished as well: set back further, as the two together always were. */
  li.out.fallen.revivable > :not(.kick-at, .revive, .ward-rim) {
    opacity: calc(0.45 * 0.75);
  }
  .negative {
    color: #ff9c86;
  }
  .down {
    animation: down 0.7s var(--ease-back);
  }
  @keyframes down {
    0% {
      transform: scale(2.1);
      color: var(--bad);
      text-shadow: 0 0 16px var(--bad);
    }
  }
  li.offline {
    opacity: 0.5;
  }
  .info {
    flex: 1;
    /* Short names keep the pill from shrinking to a stub (about as wide as "zoe_arcana" on a phone). */
    min-width: 57px;
    /* A little more air after the avatar than the row's gap. */
    margin-left: 2px;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .name {
    /* Above a ward's barrier round the phial below it (Phial.svelte), so the name stays readable. */
    position: relative;
    z-index: 1;
    font-size: 0.98rem;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 9.5rem;
    /* Room for descenders (g, y) that overflow: hidden would clip at line-height 1.1 */
    padding-bottom: 0.2em;
    margin-bottom: -0.2em;
  }
  .name em {
    color: var(--muted);
    font-size: 0.85em;
  }
  .bar {
    height: 3px;
    background: rgba(255, 255, 255, 0.07);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar {
    overflow: visible;
  }
  .bar span {
    position: relative;
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, color-mix(in srgb, var(--c), black 30%), var(--c));
    box-shadow: 0 0 6px color-mix(in srgb, var(--c), transparent 40%);
    transition: width 0.8s var(--ease-out);
  }
  /* Filling in step with the stream of sparks landing on it. */
  .bar.filling span {
    transition: width var(--fill-span) linear;
  }
  .bar.filling span::after {
    width: 7px;
    height: 7px;
    background: #fff4d8;
  }
  /* A hot spark at the bar's leading edge. */
  .bar span::after {
    content: '';
    position: absolute;
    right: -2px;
    top: 50%;
    width: 5px;
    height: 5px;
    translate: 0 -50%;
    border-radius: 50%;
    background: color-mix(in srgb, var(--c), white 60%);
    box-shadow:
      0 0 6px 1px var(--c),
      0 0 12px 2px color-mix(in srgb, var(--c), transparent 50%);
    opacity: 0.9;
  }
  .bar span[style*='width: 0%']::after {
    opacity: 0;
  }
  .score {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.3rem;
    color: var(--gold-hi);
    min-width: 1.4ch;
    text-align: right;
  }
  .bump {
    animation: bump 0.7s var(--ease-back);
  }
  @keyframes bump {
    0% {
      transform: scale(2.4);
      color: #fff6d8;
      text-shadow:
        0 0 10px var(--gold-hi),
        0 0 24px var(--unique-hi);
    }
    35% {
      color: #d9e6b8;
      text-shadow: 0 0 12px rgba(190, 210, 140, 0.6);
    }
  }
  .name-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }
  .name-row .name {
    min-width: 0;
  }
  .off-slot {
    flex: none;
    width: 17px;
    height: 17px;
  }
  .off {
    display: grid;
    --standing-size: 17px;
  }
  .off :global(.mark) {
    margin: 0;
  }
  .off-corner {
    display: none;
  }
  /* Kept legible where it sits on an avatar's corner. */
  .off-corner :global(svg) {
    filter: drop-shadow(0 0 1.5px #000) drop-shadow(0 0 1px #000);
  }

  /* (And on a phone on its side, lib/layout.ts `flat`, where the screen is too short for the full entries.) */
  @media (max-width: 640px), (orientation: landscape) and (max-height: 500px) {
    /* Pinned to the top of the screen while playing (lib/layout.ts): one slim
       row of avatars and scores, with the name and progress of whoever's turn
       it is, and the timer at the end. Sticky rather than fixed, so it shakes
       with the page and the effects aimed at a score land where it is. */
    .strip {
      position: sticky;
      /* 1px above the top, so it knows when it's stuck (see sticking). */
      top: -1px;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      /* Edge to edge, over the game's side padding. */
      margin: 0 -1rem;
      padding: calc(1px + 0.25rem) max(1rem, env(safe-area-inset-right)) 0.25rem max(1rem, env(safe-area-inset-left));
      border-bottom: 1px solid transparent;
      transition:
        background-color 0.25s,
        border-color 0.25s,
        box-shadow 0.25s;
    }
    .strip.stuck {
      background-color: var(--pinned-bg);
      border-bottom: var(--pinned-line);
      box-shadow: 0 8px var(--pinned-shadow);
    }
    /* Who's watching stays at the top of the page; pinned, the strip goes without it. */
    .strip.stuck :global(.gallery) {
      opacity: 0;
      visibility: hidden;
    }
    /* One row while it fits (the name of whoever's turn it is gives way first). */
    .board {
      flex: 1;
      min-width: 0;
      flex-wrap: nowrap;
      justify-content: flex-start;
      /* Room for the score badges that hang off the avatars' corners. */
      gap: 0.45rem;
      /* As tall as the timer beside it, so the strip keeps its height when
         the timer comes and goes. */
      min-height: 44px;
      align-items: center;
      align-content: center;
      padding: 0.25rem 0;
    }
    .board.crowded {
      flex-wrap: wrap;
    }
    li {
      flex: none;
      min-width: 0;
      gap: 0.4rem;
      padding: 2px 0.6rem 2px 2px;
    }
    li.wide {
      flex: 0 1 auto;
    }
    /* The kick a little further onto the corner, so it overlaps a wrong
       answer's face-down token (Avatar) less. */
    li .kick-at {
      top: -10px;
      left: -9px;
    }
    li :global(.avatar) {
      width: 26px;
      height: 26px;
    }
    /* The others are an avatar with their score on it. Their names stay for screen readers. */
    li:not(.wide) {
      padding: 2px;
    }
    li:not(.wide) .info {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    li:not(.wide) .score {
      position: absolute;
      right: -6px;
      bottom: -4px;
      display: grid;
      place-items: center;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      font-size: 0.72rem;
      line-height: 1;
      background: #0c0a08;
      border: 1px solid color-mix(in srgb, var(--c), black 30%);
      border-radius: 9px;
    }
    /* Delve: the phial stands upright beside the avatar, centred on it, close
       to its own avatar, with more room after it before the next player's. */
    li:not(.wide):has(> .phial-side) {
      margin-right: 0.65rem;
    }
    li:not(.wide) .phial-side {
      display: block;
      position: absolute;
      right: -5px;
      top: 50%;
      translate: 0 -50%;
      filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.9));
    }
    /* The flares and dynamite they carry: a small dark chip on the avatar's lower left corner. */
    li:not(.wide) .side-counts {
      display: block;
      position: absolute;
      left: -6px;
      bottom: -5px;
      padding: 1px 3px 1px 2px;
      background: #0c0a08;
      border: 1px solid color-mix(in srgb, var(--c), black 45%);
      border-radius: 7px;
      --inv-h: 9px;
      line-height: 0;
    }
    li:not(.wide) .side-counts :global(.inventory) {
      gap: 3px;
    }
    li.wide .info {
      min-width: 0;
    }
    /* Delve: a slimmer phial (and finds beside it) under the name, so the
       pill stands no taller than the avatars beside it. */
    li.wide .info:has(:global(.phial)) {
      gap: 2px;
      --phial-w: 46px;
      --inv-h: 9px;
    }
    li.wide .info :global(.phial) {
      margin-top: 0;
    }
    /* The count's digits stand a little taller than the phial: they may reach past its line rather than heighten it. */
    li.wide .info :global(.vessel) {
      height: 9px;
    }
    /* The timer at the end of the row, smaller than on the task line on wider screens. */
    /* (.timer twice, to outweigh TimerRing's own size whatever the bundle's order.) */
    .strip :global(.timer.timer) {
      flex: none;
      width: 44px;
      height: 44px;
    }
    .strip :global(.timer span) {
      font-size: 1.05rem;
    }
    .name {
      max-width: 6rem;
      font-size: 0.85rem;
    }
    .score {
      font-size: 1.05rem;
    }
    /* The offer to give a life hangs under the strip, wherever it is pinned. */
    .revive-ask {
      left: 1rem;
      right: 1rem;
      top: calc(100% + 6px);
      translate: none;
      width: auto;
    }
    /* An entry shrunk to its avatar takes the heart in beside it, the heart
       laid a little over the avatar's edge so the entry grows only a little;
       with four or more such entries the row breaks in two rather than run
       off the screen. */
    li.revivable:not(.wide) {
      gap: 0;
      padding-right: 3px;
    }
    li:not(.wide) .revive {
      width: 22px;
      height: 22px;
      margin: 0 0 0 -7px;
    }
    .board:has(> li.revivable:not(.wide) ~ li.revivable:not(.wide) ~ li.revivable:not(.wide) ~ li.revivable:not(.wide)) {
      flex-wrap: wrap;
    }
    /* On a lone avatar the name is hidden, so the offline mark sits on its top right corner. */
    li:not(.wide) .off-corner {
      display: grid;
      position: absolute;
      top: -7px;
      right: -5px;
    }
    li:not(.wide) .off-corner .off {
      --standing-size: 15px;
    }
  }
  /* A phone on its side (lib/layout.ts `flat`): the strip rides in the
     header's row (App.svelte's `folded`), from the screen's left edge to the
     round and the buttons at its right end (--header-right), so the game
     gets the height of a row of its own. */
  @media (orientation: landscape) and (max-height: 500px) {
    .strip {
      height: var(--header-h, 47px);
      margin: calc(-1 * var(--header-h, 47px)) calc(var(--header-right, 0px) + 0.9rem - max(1rem, env(safe-area-inset-right))) 0
        calc(-1 * max(1rem, env(safe-area-inset-left)));
      padding-block: 0;
      padding-right: 0;
    }
    .board {
      padding: 2px 0;
    }
    /* A full room: one row, every entry its avatar, closer together; it
       scrolls sideways if it must (room kept over and under it for the
       score badges and the kick on the avatars' corners). */
    .board.tight {
      flex-wrap: nowrap;
      gap: 0.3rem;
      align-self: stretch;
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      padding: 8px 6px 6px 10px;
      margin-left: -10px;
    }
    .board.tight::-webkit-scrollbar {
      display: none;
    }
    /* Who's watching: under the header's row at its left, beside the banner's
       title rather than over it; a spectator's choice to play next game at
       its right, under the header's buttons (the strip's right margin undone),
       clear of the banner's lines either side. */
    .strip :global(.gallery.hang) {
      top: calc(100% + 4px);
      right: calc(-1 * (var(--header-right, 0px) + 0.9rem - max(1rem, env(safe-area-inset-right))));
      left: max(1rem, env(safe-area-inset-left));
      padding-right: 0;
      justify-content: space-between;
    }
    .strip :global(.hang .list) {
      right: auto;
      left: 0;
    }
  }
  /* A full room on a phone upright, its browser's bars up: the two rows of
     avatars a little smaller (--board-zoom keeps the kick buttons' touch
     size, KickButton.svelte), so the game under them keeps its height. */
  @media (orientation: portrait) and (max-width: 640px) and (max-height: 700px) {
    .board.crowded {
      zoom: 0.85;
      --board-zoom: 0.85;
      padding-block: 2px;
    }
  }
</style>
