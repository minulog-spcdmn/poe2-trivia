// What can be set in any game a scene shows, besides the scene's own
// controls: the players' names, who is watching and who has gone offline.
// The desk lists them under the scene's own. Each starts as the scene has it,
// so a scene left alone shows as it was made; and a scene's named states can
// set them too (a lobby's "Long names").
//
// buildScene is how anything builds a scene (the desk, its frames, the
// tests, Play from here): the scene's own build with its controls, then these
// over it.

import { valuesOf, type Control, type Value, type Values } from './bench.ts';
import type { Built, Scene } from './scene.ts';
import { MAX_SPECTATORS, type GameState, type Spectator } from '../lib/game.ts';
import { CREATOR } from '../lib/site.ts';
import { RUBY } from '../lib/palette.ts';
import { pid, spectator } from './build/people.ts';

const LONG = [
  'Sekhema Asala Kahari',
  'Doryani of the Vaal',
  'Hooded Wanderer Kai',
  'Zelina Whitebranch',
  'Rog the Lucky Smith',
  'Una of the Eternal Vaal',
  'Alva Valai the Tempered',
  'Dannig of the Last Watch',
  'Oswin the Unrelenting',
  'Finn of the Twilight Strand',
  'Kalguur Mountainborn',
  'Renly the Ironwrought',
];
const SCRIPTS = ['桜子', 'Ярослава', 'Exile42', 'Ἀθηνᾶ', 'Zoë', '김민준', 'Ngọc Ánh', 'Søren', 'Łucja', 'Þóra', 'Ünal', '1337'];
/** Who comes to watch, in order: those of them already in the room are passed over. */
const WATCHERS = ['Finn', 'Renly', 'Oswin', 'Zelina', 'Dannig', 'Hooded One', 'Tujen', 'Gwennen', 'Navali', 'Einhar', 'Niko', 'Helena', 'Zana', 'Kirac'];

/** The keys these take in a scene's values: a scene's own controls keep clear of them. */
export const TWEAK_KEYS = ['names', 'sigils', 'joining', 'watching', 'offline'];

/**
 * What can be set in the game `built` holds, each as the scene has it.
 * Nothing out of a game. `seen` (those seen from) stay online whatever is
 * set, so they aren't offered as the one offline.
 */
export function tweaksFor(built: Built, seen: string[] = []): Control[] {
  const s = built.state;
  if (!s) return [];
  const out: Control[] = [
    {
      kind: 'choice',
      key: 'names',
      label: 'Names',
      default: 'as',
      options: [
        { value: 'as', label: 'As they are' },
        { value: 'long', label: 'Long' },
        { value: 'scripts', label: 'Other scripts, digits' },
        { value: 'creator', label: 'The creator first' },
      ],
    },
    // Every player wears a class's sigil, by their name (lib/classSigils.ts; the frame sets it as it starts).
    { kind: 'toggle', key: 'sigils', label: 'Class sigils on everyone', default: false },
  ];
  // Only an online room has spectators, and players who can drop out.
  if (s.hostId === null) return out;
  const watchers = s.spectators ?? [];
  out.push(
    { kind: 'range', key: 'joining', label: 'Watching, joining next', min: 0, max: MAX_SPECTATORS, default: watchers.filter((o) => !o.stay).length },
    { kind: 'range', key: 'watching', label: 'Watching, staying so', min: 0, max: MAX_SPECTATORS, default: watchers.filter((o) => o.stay).length },
    {
      kind: 'choice',
      key: 'offline',
      label: 'Offline',
      default: '',
      options: [
        { value: '', label: 'As it is' },
        { value: '-', label: 'No one' },
        ...s.players.filter((p) => !seen.includes(p.id)).map((p) => ({ value: p.name, label: p.name })),
        { value: '*', label: 'Everyone but you' },
      ],
    },
  );
  return out;
}

/**
 * `built` with `v` set over it: who's offline (by name, as the scene has
 * them), the watchers, then the names. `seen` are the players seen from
 * (the scene's seats): they stay in the room and online whatever is set.
 */
export function applyTweaks(built: Built, v: Values, seen: string[]): Built {
  const s0 = built.state;
  if (!s0) return built;
  const as = valuesOf(tweaksFor(built), {});
  if (TWEAK_KEYS.every((k) => v[k] === undefined || v[k] === as[k])) return built;
  // (A scene may hand out the same state each time it's built: never change it in place.)
  let s: GameState = structuredClone(s0);
  const kept = new Set(seen);

  // Who drops or comes back goes through the engine where the game was played
  // on one (a race ends when only one is left, Delve together moves on
  // without them), so it shows only what the game would; a game built by hand
  // just has its flags set.
  const off = v.offline;
  if (typeof off === 'string' && off !== '' && s.hostId !== null) {
    for (const p of s0.players) {
      const connected = kept.has(p.id) || (off === '-' ? true : off === '*' ? false : p.name === off ? false : p.connected);
      if (connected === p.connected) continue;
      if (built.act) s = built.act(s, { type: 'connection', playerId: p.id, connected });
      else s.players.find((q) => q.id === p.id)!.connected = connected;
    }
  }

  if (s.hostId !== null && (v.joining !== as.joining || v.watching !== as.watching)) {
    const joining = Math.max(0, Math.min(MAX_SPECTATORS, Number(v.joining ?? as.joining)));
    const watching = Math.max(0, Math.min(MAX_SPECTATORS - joining, Number(v.watching ?? as.watching)));
    const taken = new Set([...s.players, ...(s.spectators ?? [])].map((p) => p.id));
    const fresh = WATCHERS.filter((n) => !taken.has(pid(n)));
    /** `n` of `had` (those seen from first, and always), topped up with newcomers. */
    const some = (had: Spectator[], n: number, stay: boolean) => {
      const out = [...had.filter((o) => kept.has(o.id)), ...had.filter((o) => !kept.has(o.id))].slice(0, Math.max(n, had.filter((o) => kept.has(o.id)).length));
      while (out.length < n && fresh.length) out.push(spectator(fresh.shift()!, stay));
      return out;
    };
    const had = s.spectators ?? [];
    s.spectators = [...some(had.filter((o) => !o.stay), joining, false), ...some(had.filter((o) => o.stay), watching, true)];
  }

  if (v.names === 'long' || v.names === 'scripts') {
    const names = v.names === 'long' ? LONG : SCRIPTS;
    [...s.players, ...(s.spectators ?? [])].forEach((p, i) => (p.name = names[i % names.length]));
  } else if (v.names === 'creator' && s.players[0]) {
    s.players[0].name = CREATOR;
    s.players[0].hue = RUBY;
  }
  return { ...built, state: s };
}

/** The players a scene is seen from (its seats'). */
export const seenFrom = (scene: Scene) => scene.seats.map((seat) => seat.me).filter((id): id is string => !!id);

/** Everything that can be set in `scene`: its own controls, and every game's as the scene, built with `own`, has them. */
export function buildScene(scene: Scene, given: Record<string, Value | string | null | undefined> = {}): { built: Built; controls: Control[]; values: Values } {
  const own = valuesOf(scene.controls ?? [], given);
  const base = scene.build(own);
  const seen = seenFrom(scene);
  const tweaks = tweaksFor(base, seen);
  const set = valuesOf(tweaks, given);
  const built = applyTweaks(base, set, seen);
  // The watchers as they came out (joining and staying share MAX_SPECTATORS, and those seen from always stay): the controls say what's shown.
  const watchers = built.state?.spectators;
  if (built !== base && watchers && 'joining' in set) {
    set.joining = watchers.filter((o) => !o.stay).length;
    set.watching = watchers.filter((o) => o.stay).length;
  }
  return { built, controls: [...(scene.controls ?? []), ...tweaks], values: { ...own, ...set } };
}
