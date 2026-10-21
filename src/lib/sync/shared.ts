// What sync passes between the player's devices, as they store it
// (lib/sync/store.ts says why it comes in two kinds):
// - the copies: each device's counted progress, which the others keep
//   apart and read with their own (the codex, the Delve records, practice);
// - the rest, which is the same wherever it was made and is taken into this
//   device's own: the achievements, the best run of wins, the class sigils
//   and the one worn, and today's unique.

import { absorbAchievements, absorbWins, ownAchievementsRaw, ownWinsRaw } from '../achievements.ts';
import { ownCodexRaw, ownPracticeRaw } from '../codex.ts';
import { absorbDaily, ownDailyRaw } from '../daily.ts';
import { ownRecordsRaw } from '../delveRecord.ts';
import { absorbSigils, ownSigilsRaw } from '../sigils.ts';
import { readStored, writeStored } from '../storage.ts';
import type { CopyKind } from './store.ts';

/** This device's own progress of each copied kind, as stored (null for none). */
export const OWN: Record<CopyKind, () => string | null> = {
  codex: ownCodexRaw,
  delve: ownRecordsRaw,
  practice: ownPracticeRaw,
};

/** The names each kind of own progress is stored under, to hear when it changes. */
export const OWN_NAMES: Record<CopyKind, string[]> = {
  codex: ['codex2', 'codex'],
  delve: ['delve2', 'delve'],
  practice: ['practice'],
};

/** What is taken in, by what it is sent as: how to read this device's, how to take in another's, and the name it is stored under. */
const TAKEN: Record<string, { own: () => string | null; take: (raw: string) => boolean; name: string }> = {
  achievements: { own: ownAchievementsRaw, take: absorbAchievements, name: 'achievements' },
  wins: { own: ownWinsRaw, take: absorbWins, name: 'achievements.wins' },
  sigils: { own: ownSigilsRaw, take: absorbSigils, name: 'sigils' },
  daily: { own: ownDailyRaw, take: (raw) => absorbDaily(raw), name: 'daily' },
};

/** The names of everything taken in, to hear when this device's own changes. */
export const TAKEN_NAMES = Object.values(TAKEN).map((t) => t.name);

/** The longest any of them can be (each is a short list). */
const MAX_TAKEN = 100_000;

/** This device's, to send. */
export function takenNow(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, t] of Object.entries(TAKEN)) {
    const raw = t.own();
    if (raw) out[k] = raw;
  }
  return out;
}

/** Takes in another device's; the names of what changed. */
export function takeIn(given: unknown): string[] {
  if (typeof given !== 'object' || given === null) return [];
  const changed: string[] = [];
  for (const [k, raw] of Object.entries(given)) {
    const t = Object.hasOwn(TAKEN, k) ? TAKEN[k] : undefined;
    if (t && typeof raw === 'string' && raw.length <= MAX_TAKEN && t.take(raw)) changed.push(t.name);
  }
  return changed;
}

// ---- when this device's own copies last changed ---------------------------------

const STAMPS = 'sync.own';

/** A string's 32-bit FNV-1a hash, with its length: enough to tell a change. */
function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${s.length}:${h >>> 0}`;
}

type Stamps = Partial<Record<CopyKind, { at: number; print: string }>>;

function readStamps(): Stamps {
  try {
    const v: unknown = JSON.parse(readStored(STAMPS) ?? 'null');
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Stamps) : {};
  } catch {
    return {};
  }
}

/**
 * This device's own progress of `kind` and when it last changed (on this
 * device's clock, always later than the time before, so a copy made from it
 * replaces the last one everywhere): null when there is none.
 */
export function ownNow(kind: CopyKind): { at: number; raw: string } | null {
  const raw = OWN[kind]();
  if (!raw) return null;
  const stamps = readStamps();
  const was = stamps[kind];
  const print = fingerprint(raw);
  if (was && was.print === print && Number.isSafeInteger(was.at)) return { at: was.at, raw };
  const at = Math.max(Date.now(), (was?.at ?? 0) + 1);
  writeStored(STAMPS, JSON.stringify({ ...stamps, [kind]: { at, print } }));
  return { at, raw };
}
