// Over the game: being turned out of a room (removed, the room closed by its
// host or by the owner, the game moved to another tab), the dialog before
// leaving one (the owner's with Close room too; the header's
// leave, or the browser's back, which closes what's open first, the codex's
// item card too), news arriving mid-question (where the stack stands on a
// phone, either way up; achievements; a guest's link to the host lost), an
// item's window as another item opens in it, and coming back
// from a crash (Root.svelte: a guest
// leaves the room, a second crash soon after leaves any game, and one with
// no game left stops the page).

import { pid, player } from '../build/people.ts';
import { Table } from '../build/play.ts';
import { endScenes } from './over.ts';
import { PRESETS, type Settings } from '../../lib/game.ts';
import { ACHIEVEMENTS } from '../../lib/achievements.ts';
import { METALS, TIERS, type Tier } from '../../lib/metals.ts';
// (A namespace: the code before this change has no ACHIEVEMENT_SOUNDS, and a name it lacks fails the whole screen there.)
import * as soundDesign from '../../lib/soundDesign.ts';
import { OFFER } from '../../lib/backup/words.ts';
import type { Control, Values } from '../bench.ts';
import type { Built, Scene, Seat, Step } from '../scene.ts';

const THREE = ['Kalguur', 'Doryani', 'Una of the Vaal'];
/** `owner`: whom the room has as the owner (GameState owner), as the host's check of their signature would name them. */
const inGame = (steps: Step[], answered = false, owner?: string): Built => {
  const t = new Table(THREE).start().pick();
  if (answered) t.answer(t.turn, true);
  if (owner) t.s.owner = { id: pid(owner) };
  // (Turned out, it lands on the start page: its room list finds nothing.)
  return { state: t.s, act: t.room, at: t.clock.now + 3000, steps, rooms: [] };
};
/** A question asked in pictures, Doryani's pick wrong: the reveal names two, each opening its item's window. */
const pictured = (steps: Step[], seed?: number): Built => {
  const t = new Table(THREE, { difficulty: 'custom', custom: { ...PRESETS.merciless, artChance: 1 } }, { seed }).start().pick();
  t.answer(t.turn, false);
  return { state: t.s, act: t.room, at: t.clock.now, steps: [{ wait: 1200 }, ...steps], rooms: [] };
};
/** The lobby, its host editing the custom difficulty (the edit button on Custom). */
const CUSTOM: Settings['custom'] = { options: 6, similarNames: 1, fakes: 2, artChance: 0.5, veil: 'slow', grayscale: 'art', mirror: 0.3, lockout: 3 };
const editingCustom = (steps: Step[]): Built => {
  const t = new Table(THREE, { difficulty: 'custom', custom: CUSTOM });
  return { state: t.s, act: t.room, steps: [{ click: 'button.edit' }, { wait: 400 }, ...steps] };
};
/** The codex, an item's card open from its collection (out of a room: the codex's own step, lib/backGuard.ts PageLayers). */
const codexItem = (steps: Step[]): Built => ({ state: null, hash: '#codex', met: 140, steps: [{ click: '.tile' }, { wait: 800 }, ...steps] });
/** The end of a run alone, an item's card open from its missed items (in a room: the guard's layer). */
const endItem = (steps: Step[]): Built => {
  const { state, delveResult, log, runs } = endScenes().find((e) => e.key === 'd-solo')!;
  return { state, delveResult, log, runs, steps: [{ wait: 2500 }, { click: 'button.thumb' }, { wait: 800 }, ...steps] };
};
/** A question, then the notices for achievements of `tier` (the first four not kept secret): one alone, then three at once, sounding in their metal. */
const achievementNotices = (tier: Tier): Built => {
  const [alone, ...burst] = ACHIEVEMENTS.filter((a) => a.tier === tier && !a.secret).slice(0, 4);
  const seal = (a: typeof alone) => ({ sign: a.sign, tier: a.tier });
  return inGame([
    { toast: alone.title, opts: { title: 'Achievement earned', seal: seal(alone) } },
    { toast: burst.map((a) => a.title).join(' • '), opts: { title: `${burst.length} achievements earned`, seal: seal(burst[0]) } },
    { sound: soundDesign.ACHIEVEMENT_SOUNDS?.[tier], from: '.toasts' },
  ]);
};
const overlay = (key: string, label: string, seats: Seat[], build: () => Built): Scene => ({ key: `overlay/${key}`, screen: 'overlay', group: 'Over the game', label, seats, build });
const doryani: Seat = { mode: 'client', me: pid('Doryani') };
const kalguur: Seat = { mode: 'host', me: pid('Kalguur') };
const nobody: Seat = { mode: 'none', me: null };
/** The player a notice is about, in their colour in the room. */
const una = { name: 'Una of the Vaal', hue: player('Una of the Vaal').hue };

/** Why the room turned this device out. */
const WHY: Control = {
  kind: 'choice',
  key: 'why',
  label: 'Why',
  options: [
    { value: 'removed', label: 'Removed by the host' },
    { value: 'closed', label: 'The host closed it' },
    { value: 'owner', label: 'The owner closed it' },
    { value: 'mine', label: 'The owner’s own page' },
    { value: 'moved', label: 'Moved to another tab' },
  ],
  default: 'removed',
};
function turnedOut(v: Values = {}): Built {
  // The owner closed it (session.svelte.ts closeAsOwner): every guest and the host are told so alike.
  if (v.why === 'owner') return inGame([{ fail: 'shut' }]);
  const built = v.why === 'mine' ? inGame([{ fail: 'mine' }], false, 'Doryani') : inGame([{ fail: v.why === 'closed' ? 'closed' : v.why === 'moved' ? 'replaced' : 'kicked' }]);
  return { ...built, seat: doryani };
}

/** The notices that come during a question. */
const NOTICES: Control = {
  kind: 'choice',
  key: 'notices',
  label: 'Notices',
  options: [
    { value: 'news', label: 'A burst of news' },
    { value: 'link', label: 'The link to the host lost' },
    { value: 'backup', label: 'The offer to keep it safe, and kept' },
    ...TIERS.map((t) => ({ value: String(t), label: `Achievements in ${METALS[t].name}` })),
  ],
  default: 'news',
};
function notices(v: Values = {}): Built {
  // A guest's link to the host lost under a notice already up: its row pinned at the head of the stack (the notice
  // moving over for it), its words and seal cross-fading as reconnecting is given up, then gone as the link comes back.
  if (v.notices === 'link')
    return inGame([
      { toast: 'Brea', opts: { title: 'Spectator joined', who: { name: 'Brea' } } },
      { wait: 1200 },
      { link: 'lost' },
      { wait: 2600 },
      { link: 'gaveUp' },
      { wait: 2600 },
      { link: 'back' },
    ]);
  // The offer after a game to keep the progress safe with a passkey, worded as lib/backup/backup.svelte.ts offerBackup words it, with its button; then what a press brings.
  if (v.notices === 'backup')
    return inGame([
      { toast: OFFER.message, opts: { ...OFFER.opts, action: { label: 'Keep it safe', run: () => {} } } },
      { wait: 2600 },
      { toast: 'Your progress is kept with your passkey from now on, saved as you play.', opts: { title: 'Kept safe' } },
    ]);
  // Achievements earned mid-question, worded as lib/achievementToasts.ts words them: one alone, and three as one notice under the first's seal, all of the metal picked.
  if (v.notices !== undefined && v.notices !== 'news') return achievementNotices(Number(v.notices) as Tier);
  // A burst of news during a question: wide screens (and a phone on its side) stack it bottom right, upright phones at the top, as many as they keep.
  // Last the longest a guest gets mid-question (session.svelte.ts TOO_QUICK), two lines: the one a phone on its side shows.
  return inGame([
    { toast: 'Una of the Vaal', kind: 'warn', opts: { title: 'Player disconnected', who: una } },
    { toast: 'Una of the Vaal', kind: 'warn', opts: { title: 'Turn skipped', who: una } },
    { toast: 'Brea', opts: { title: 'Spectator joined', who: { name: 'Brea' } } },
    { toast: 'Too quick to count: the question had only just reached you. Answer again.', kind: 'error' },
  ]);
}

/** What's open as the browser's back is pressed. */
const OPEN: Control = {
  kind: 'choice',
  key: 'open',
  label: 'Open',
  options: [
    { value: 'nothing', label: 'Nothing, in a game' },
    { value: 'custom', label: 'The lobby’s custom difficulty' },
    { value: 'item', label: 'An item’s window, in a game' },
    { value: 'codex', label: 'An item, in the codex' },
    { value: 'end', label: 'An item, on the end screen' },
  ],
  default: 'nothing',
};
// The browser's back (lib/backGuard.ts): with nothing open it asks, as the header's leave does; with the item's window open, it closes that alone.
function back(v: Values = {}): Built {
  const step: Step = { back: true };
  if (v.open === 'custom') return { ...editingCustom([step]), seat: kalguur };
  if (v.open === 'item') return { ...inGame([{ click: 'button.details' }, { wait: 800 }, step], true), seat: kalguur };
  if (v.open === 'codex') return { ...codexItem([step]), seat: nobody };
  if (v.open === 'end') return { ...endItem([step]), seat: { mode: 'local', me: null } };
  return inGame([step]);
}

/** Who crashed, and how often. */
const WHO: Control = {
  kind: 'choice',
  key: 'who',
  label: 'Who crashed',
  options: [
    { value: 'host', label: 'The host' },
    { value: 'guest', label: 'A guest' },
    { value: 'out', label: 'Out of a game' },
  ],
  default: 'host',
};
const TWICE: Control = { kind: 'toggle', key: 'twice', label: 'Twice in a row', default: false };
function crash(v: Values = {}): Built {
  const step: Step = { crash: v.twice ? 2 : 1 };
  if (v.who === 'out') return { state: null, steps: [step], seat: nobody };
  return v.who === 'guest' ? { ...inGame([step]), seat: doryani } : inGame([step]);
}

/** Leaving: as the owner, in someone else's room. */
const OWNER: Control = { kind: 'toggle', key: 'owner', label: 'As the owner', default: false };

export function overlayScenes(): Scene[] {
  return [
    {
      ...overlay('turned-out', 'Turned out of the room', [doryani, kalguur], () => turnedOut()),
      controls: [WHY],
      states: [
        { label: 'Removed from the game by the host', values: {}, key: 'overlay/removed' },
        { label: 'The host closed the room', values: { why: 'closed' }, key: 'overlay/closed', listed: false },
        { label: 'The owner closed the room', values: { why: 'owner' }, key: 'overlay/closed-owner', listed: false },
        { label: 'The owner’s own page: the room it closed', values: { why: 'mine' }, key: 'overlay/closed-mine', listed: false },
        { label: 'The game moved to another tab', values: { why: 'moved' }, key: 'overlay/moved', listed: false },
      ],
      build: turnedOut,
    },
    {
      ...overlay('news', 'News during a question', [doryani], () => notices()),
      controls: [NOTICES],
      states: [
        { label: 'News during a question: a burst of notices', values: {} },
        { label: 'A guest’s link to the host lost: reconnecting, given up, back', values: { notices: 'link' }, key: 'overlay/lost', listed: false },
        { label: 'The offer to keep progress safe, then kept', values: { notices: 'backup' }, key: 'overlay/backup-offer', listed: false },
        ...TIERS.map((t, i) => ({ label: `Achievements in ${METALS[t].name}`, values: { notices: String(t) }, listed: false as const, ...(i ? {} : { key: 'overlay/achievement' }) })),
      ],
      build: notices,
    },
    {
      ...overlay('leave', 'Leaving a game: the dialog', [kalguur, doryani], () => inGame([{ click: 'button[aria-label="Leave game"]' }])),
      controls: [OWNER],
      // The owner in someone else's room: the dialog offers to close it for everyone too.
      states: [
        { label: 'Leaving a game: the dialog', values: {} },
        { label: 'Leaving as the owner: Close room too', values: { owner: true }, key: 'overlay/leave-owner', listed: false },
      ],
      build: (v = {}) => (v.owner ? { ...inGame([{ click: 'button[aria-label="Leave game"]' }], false, 'Doryani'), seat: doryani } : inGame([{ click: 'button[aria-label="Leave game"]' }])),
    },
    {
      ...overlay('back', 'Back pressed: what’s open closes first', [kalguur, doryani], () => back()),
      controls: [OPEN],
      states: [
        { label: 'Back in a game: asked before leaving', values: {} },
        { label: 'Back in the lobby with the custom difficulty open: it closes, the room stays', values: { open: 'custom' }, key: 'overlay/back-custom', listed: false },
        { label: "Back with an item's window open: it closes, the game stays", values: { open: 'item' }, key: 'overlay/back-item', listed: false },
        { label: 'Back in the codex with an item open: it closes, the codex stays as it was', values: { open: 'codex' }, key: 'overlay/back-codex-item', listed: false },
        { label: 'Back on the end screen with an item open: it closes, the room stays', values: { open: 'end' }, key: 'overlay/back-end-item', listed: false },
      ],
      build: back,
    },
    // The item's window open, another item opened in it: its name and tooltip cross-fade, and its top glides with the roll as the height changes.
    // (Seed 39: the pick's tooltip some eight lines shorter than the answer's, so the roll and the plate's glide show.)
    overlay('item-switch', "An item's window: another item opened in it", [kalguur], () => pictured([{ click: '.tile.inspect' }, { wait: 1800 }, { click: '.tile.inspect ~ .tile.inspect' }], 39)),
    {
      ...overlay('crash', 'Coming back from a crash', [kalguur], () => crash()),
      controls: [WHO, TWICE],
      states: [
        { label: 'The host crashed once: back on its feet', values: {}, key: 'overlay/crash-host' },
        { label: 'A guest crashed once: out of the room', values: { who: 'guest' }, key: 'overlay/crash-guest', listed: false },
        { label: 'The host crashed twice: out of the game', values: { twice: true }, key: 'overlay/crash-twice', listed: false },
        { label: 'Crashed twice out of a game: the page stops', values: { who: 'out', twice: true }, key: 'overlay/crash-stuck' },
      ],
      build: crash,
    },
  ];
}
