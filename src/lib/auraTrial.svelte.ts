// The QA desk's player auras (qa/tweaks.ts, set as a frame starts in
// qa/frame/boot.ts): every player wears one, so any scene shows them where
// the game draws avatars (the lobby, the votes, the pills, the end screen)
// before players can earn their own. Each their own (dealt in an order the
// desk's shuffle rolls, when it has), or everyone the one picked. Or the
// shuffle's alone: about half wear one, picked by the roll `seed` and their
// name, as a real room might be.

import { WORN, type AuraKind } from './auraKinds';
import { seededRandom } from './patches';

export const auraTrial = $state({ kind: '' as '' | 'each' | 'mix' | AuraKind, seed: 0 });

/** Each their own: in turn, as names first show, so a room of up to sixteen never has two alike. */
const given = new Map<string, AuraKind>();

/** The aura `name` wears on the desk, if any. */
export function trialAura(name: string): AuraKind | null {
  const k = auraTrial.kind;
  if (!k) return null;
  if (k === 'mix') {
    // FNV-1a over the roll and the name.
    let h = 2166136261 ^ auraTrial.seed;
    for (const ch of name) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
    h >>>= 0;
    return h % 100 < 50 ? WORN[(h >>> 8) % WORN.length] : null;
  }
  if (k !== 'each') return k;
  let a = given.get(name);
  if (!a) given.set(name, (a = dealt()[given.size % WORN.length]));
  return a;
}

/** The order they're dealt in: as listed, or shuffled by the roll when there is one. */
let deck: readonly AuraKind[] | null = null;
function dealt() {
  if (deck) return deck;
  if (!auraTrial.seed) return (deck = WORN);
  // Fisher-Yates over the roll.
  const rand = seededRandom(auraTrial.seed);
  const d = [...WORN];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return (deck = d);
}

/**
 * The QA desk's aura on a card (scenes/game.ts, "An aura on a card"; the
 * frame sets it as it starts): the card dealt at `at` holds `kind`, burning
 * in its window round the item as it would on a token `size` px across, the
 * item in the token's place. A try-out of how an aura's card could look.
 */
export const cardAura = $state({ kind: '' as '' | AuraKind, at: 1, size: 132 });
