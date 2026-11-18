// The zone sigils' blind rating: three drawings of each Delve zone's sigil
// (lib/zoneSigils.ts as it is, lib/zoneSigilsScenes.ts, lib/zoneSigilsThird.ts)
// weighed two at a time, unnamed, each pair twice with its sides swapped, at
// the sizes the game draws a zone's sigil (ZonesigilsView.svelte). A drawing
// can be sent back for a redesign instead: it leaves the pool, so the trials
// still to come skip it, and the answers it was in no longer count. The deal
// and the answers are kept in the desk's own storage, so a reload carries
// on, and a drawing redrawn since drops only the answers it was in: the next
// round asks only about the new drawings. Once all are in, each zone's kept
// drawings are ranked by their wins.

import type { PieceBench } from '../bench.ts';

/** The three sets, as the results name them. */
export const SETS = ['current', 'scenes', 'third'] as const;
export type SetKey = (typeof SETS)[number];
/** The ten zones (lib/zoneSigils.ts SIGIL_NAMES, written out so the desk's list loads none of the drawings). */
export const RATED_ZONES = ['The Mines', 'Magma Fissure', 'Frozen Hollow', 'Fungal Caverns', 'Vaal Outpost', 'Abyssal Depths', 'Petrified Forest', 'Sulphur Vents', 'Abyssal City', 'Primeval Ruins'];

export type Trial = { zone: string; left: SetKey; right: SetKey };
export type Pick = 'left' | 'right' | 'tie';
/** One answer, in the order given: a pick in a trial (by its place in the deal), or a zone's drawing sent back for a redesign. */
export type Step = { trial: number; pick: Pick } | { zone: string; out: SetKey };
export type Rating = { trials: Trial[]; steps: Step[] };

/** The drawings sent back, each as `zone|set`. */
export function outOf(r: Rating): Set<string> {
  const out = new Set<string>();
  for (const s of r.steps) if ('out' in s) out.add(`${s.zone}|${s.out}`);
  return out;
}

/** The trials still to answer, by their place in the deal: not yet picked, and neither side sent back. */
export function pending(r: Rating): number[] {
  const out = outOf(r);
  const picked = new Set(r.steps.flatMap((s) => ('trial' in s ? [s.trial] : [])));
  return r.trials.flatMap((t, i) => (picked.has(i) || out.has(`${t.zone}|${t.left}`) || out.has(`${t.zone}|${t.right}`) ? [] : [i]));
}

/** `r` with a zone's drawing sent back, or taken back into the pool if it was out (its trials then come again). */
export function toggleOut(r: Rating, zone: string, set: SetKey): Rating {
  const isIt = (s: Step) => 'out' in s && s.zone === zone && s.out === set;
  return { ...r, steps: r.steps.some(isIt) ? r.steps.filter((s) => !isIt(s)) : [...r.steps, { zone, out: set }] };
}

/** Every trial: for each zone, each pair of sets, once each way round (6 a zone, 60 in all), unshuffled. */
export function allTrials(): Trial[] {
  const out: Trial[] = [];
  for (const zone of RATED_ZONES)
    for (let i = 0; i < SETS.length; i++)
      for (let j = i + 1; j < SETS.length; j++) {
        out.push({ zone, left: SETS[i], right: SETS[j] });
        out.push({ zone, left: SETS[j], right: SETS[i] });
      }
  return out;
}

/** The trials in a random order in which no zone comes twice in a row (`rnd` as Math.random). */
export function deal(rnd: () => number = Math.random): Trial[] {
  for (;;) {
    const left = allTrials();
    const out: Trial[] = [];
    while (left.length) {
      const last = out.at(-1)?.zone;
      // A zone with more than half of what is left has to come now, or it would have to come twice running later.
      const count = new Map<string, number>();
      for (const t of left) count.set(t.zone, (count.get(t.zone) ?? 0) + 1);
      const forced = [...count].find(([z, n]) => z !== last && n > (left.length - 1) / 2 + 0.5)?.[0];
      const can = left.map((t, i) => ({ t, i })).filter(({ t }) => t.zone !== last && (!forced || t.zone === forced));
      if (!can.length) break;
      const { i } = can[Math.floor(rnd() * can.length)];
      out.push(left.splice(i, 1)[0]);
    }
    if (out.length === 60) return out;
  }
}

const isPick = (p: unknown): p is Pick => p === 'left' || p === 'right' || p === 'tie';

/**
 * `x` as a rating this bench keeps (all 60 trials, each once; each trial picked
 * at most once; each drawing sent back at most once), or null. A rating kept
 * before drawings could be sent back (its picks in the deal's order) is read
 * as those picks.
 */
export function asRating(x: unknown): Rating | null {
  if (!x || typeof x !== 'object') return null;
  const { trials, steps, picks } = x as Rating & { picks?: unknown };
  if (!Array.isArray(trials) || trials.length !== 60) return null;
  const want = new Set(allTrials().map((t) => `${t.zone}|${t.left}|${t.right}`));
  for (const t of trials) if (!t || !want.delete(`${t.zone}|${t.left}|${t.right}`)) return null;
  if (want.size) return null;
  const given: unknown = Array.isArray(steps) ? steps : Array.isArray(picks) ? picks.map((pick, trial) => ({ trial, pick })) : null;
  if (!Array.isArray(given)) return null;
  const seen = new Set<string>();
  for (const s of given as Record<string, unknown>[]) {
    if (!s || typeof s !== 'object') return null;
    const key =
      typeof s.trial === 'number' && Number.isInteger(s.trial) && s.trial >= 0 && s.trial < 60 && isPick(s.pick)
        ? `t${s.trial}`
        : typeof s.zone === 'string' && RATED_ZONES.includes(s.zone) && SETS.includes(s.out as SetKey)
          ? `o${s.zone}|${s.out}`
          : null;
    if (!key || seen.has(key)) return null;
    seen.add(key);
  }
  return { trials, steps: given as Step[] };
}

export type ZoneResult = {
  zone: string;
  /** The kept sets from best to worst, each with its score, the trials it rests on, and its place (equal scores share one). */
  ranking: { set: SetKey; score: number; of: number; place: number }[];
  /** The sets sent back for a redesign. */
  redesign: SetKey[];
  trials: { left: SetKey; right: SetKey; pick: Pick; winner: SetKey | null }[];
};

/**
 * Each zone's kept sets ranked by score (a win 1, a tie a half), counting only
 * the trials between two kept drawings: one sent back has left the pool, so
 * a win over it says nothing about the drawings that stay.
 */
export function results(r: Rating): ZoneResult[] {
  const out = outOf(r);
  return RATED_ZONES.map((zone) => {
    const kept = SETS.filter((s) => !out.has(`${zone}|${s}`));
    const scores = Object.fromEntries(SETS.map((s) => [s, 0])) as Record<SetKey, number>;
    const of = Object.fromEntries(SETS.map((s) => [s, 0])) as Record<SetKey, number>;
    const trials: ZoneResult['trials'] = [];
    for (const s of r.steps) {
      if (!('trial' in s)) continue;
      const t = r.trials[s.trial];
      if (t.zone !== zone || !kept.includes(t.left) || !kept.includes(t.right)) continue;
      const winner = s.pick === 'tie' ? null : t[s.pick];
      if (winner) scores[winner] += 1;
      else {
        scores[t.left] += 0.5;
        scores[t.right] += 0.5;
      }
      of[t.left] += 1;
      of[t.right] += 1;
      trials.push({ left: t.left, right: t.right, pick: s.pick, winner });
    }
    const order = [...kept].sort((a, b) => scores[b] - scores[a] || SETS.indexOf(a) - SETS.indexOf(b));
    const ranking = order.map((set) => ({ set, score: scores[set], of: of[set], place: 1 + order.filter((o) => scores[o] > scores[set]).length }));
    return { zone, ranking, redesign: SETS.filter((s) => out.has(`${zone}|${s}`)), trials };
  });
}

export const zonesigils: PieceBench = {
  kind: 'piece',
  key: 'zonesigils',
  label: 'Zone sigils, rated blind',
  about: 'Three drawings of each Delve zone’s sigil, two at a time and unnamed, at the sizes the game draws them: pick the better of each pair, or send one back for a redesign (it isn’t asked about again), then see each zone’s ranking.',
  files: ['src/lib/zoneSigils.ts', 'src/lib/zoneSigilsScenes.ts', 'src/lib/zoneSigilsThird.ts', 'src/components/zonecard/ZoneSeal.svelte'],
  cell: 520,
  controls: [],
  states: [{ label: 'The rating', values: {} }],
  view: () => import('./ZonesigilsView.svelte'),
};
