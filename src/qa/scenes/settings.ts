// The settings page, opened from the start page (#settings): as it comes,
// with the sound turned down and keys changed, and a key waiting to be set;
// its sync as it stands, paired by hand, its light coming and going. And the
// same settings over a game, from the header's gear. And both as they are
// when the settings never came (the Wi-Fi gone as they were fetched).

import { rebind, DEFAULT_BINDINGS } from '../../lib/keys.ts';
import type { Control } from '../bench.ts';
import { Table } from '../build/play.ts';
import type { Built, Scene, Step } from '../scene.ts';

const SOUND: Control = {
  kind: 'choice',
  key: 'sound',
  label: 'Sound',
  options: [
    { value: 'on', label: 'As it comes' },
    { value: 'quiet', label: 'Turned down, ambience off' },
    { value: 'off', label: 'Off' },
  ],
  default: 'on',
};
const KEYS: Control = { kind: 'toggle', key: 'keys', label: 'Keys changed', default: false };
const COLOUR: Control = { kind: 'toggle', key: 'colour', label: 'A colour picked', default: false };
const KEPT: Control = { kind: 'toggle', key: 'kept', label: 'Named zoe_arcana (ruby kept)', default: false };
const SAVER: Control = { kind: 'toggle', key: 'saver', label: 'Battery saver on', default: false };
/** The browser draws without the GPU: the line that opens the notice's steps again (the dialog itself is the Graphics notice bench's). */
const GPU: Control = { kind: 'toggle', key: 'gpu', label: 'Graphics acceleration off', default: false };
const SYNC: Control = {
  kind: 'choice',
  key: 'sync',
  label: 'Sync',
  options: [
    { value: 'off', label: 'Not paired' },
    { value: 'waiting', label: 'A code waiting for the other device' },
    { value: 'paired', label: 'Paired, the other not on the site' },
    { value: 'never', label: 'Paired, not synced since' },
    { value: 'linked', label: 'Synced with one' },
    { value: 'three', label: 'Synced with three' },
    { value: 'offline', label: 'Server out of reach' },
  ],
  default: 'paired',
};
const ASKED: Control = {
  kind: 'choice',
  key: 'asked',
  label: 'Asked for',
  options: [
    { value: 'none', label: 'Nothing' },
    { value: 'unpair', label: 'Unpair' },
  ],
  default: 'none',
};
/** What happens to sync once the page shows (played). */
const PLAY: Control = {
  kind: 'choice',
  key: 'play',
  label: 'Then',
  options: [
    { value: 'none', label: 'Nothing' },
    { value: 'pair', label: 'Paired by hand' },
    { value: 'light', label: 'The other device comes and goes' },
  ],
  default: 'none',
};
const LOST: Control = { kind: 'toggle', key: 'lost', label: 'Didn’t come', default: false };

/** Where the settings are first opened from. */
const FROM: Control = {
  kind: 'choice',
  key: 'from',
  label: 'Opened from',
  options: [
    { value: 'start', label: 'The start page' },
    { value: 'game', label: 'The header’s gear, over a game' },
  ],
  default: 'start',
};
/** When: after the page has settled and fetched the settings ahead (App.svelte), the start page's circle drawn in. */
const FIRST_OPEN_MS = 4000;

/** A code to be paired with, the same every time (as the sync bench's). */
const SYNC_CODE = 'K7QXM2PA9FHE3TDW';

/**
 * What's played on sync, as steps. Pairing, by hand: Pair a device, its code;
 * Enter a code, and Back; the code typed and paired; the other device there a
 * moment later. Each view's title, heart, what's under it and the line fade
 * into the next's. Paired, the other device coming and going: the light and
 * the line fade on and off.
 */
function played(play: unknown, now = Date.now()): Step[] {
  if (play === 'pair')
    return [
      { wait: 1000 },
      { click: '.sync-row .btn.small' },
      { wait: 1600 },
      { click: '.sync .routes .route:last-of-type' },
      { wait: 1400 },
      { click: '.sync .actions .btn.ghost' },
      { wait: 1400 },
      { click: '.sync .routes .route:last-of-type' },
      { wait: 900 },
      { fill: '.sync .code-field', text: SYNC_CODE },
      { wait: 500 },
      { click: '.sync .actions .btn.primary' },
      { wait: 1600 },
      { sync: { code: SYNC_CODE, met: true, status: 'linked', linked: 1, lastAt: now } },
    ];
  if (play === 'light')
    return [
      { wait: 1000 },
      { sync: { status: 'linked', linked: 1 } },
      { wait: 2200 },
      { sync: { status: 'waiting', linked: 0, lastAt: now } },
      { wait: 2200 },
      { sync: { status: 'offline' } },
      { wait: 2200 },
      { sync: { status: 'linked', linked: 2 } },
    ];
  return [];
}

/** Option 1 on Q, and Q's old place freed: what a player who moved the answers to the left hand has. */
const CHANGED = rebind(rebind(DEFAULT_BINDINGS, 'option1', 0, 'KeyQ'), 'detonate', 1, 'KeyX');

/** The settings opened over a question of a game on this device. */
function overAQuestion(): Built {
  const t = new Table(['Kalguur', 'Doryani', 'Una of the Vaal'], {}, { host: null }).start().pick();
  return { state: t.s, act: t.room, at: t.clock.now + 3000, hash: '#settings' };
}

export function settingsScenes(): Scene[] {
  return [
    {
      key: 'settings/page',
      screen: 'settings',
      group: 'Settings',
      label: 'The settings page',
      seats: [{ mode: 'none', me: null }],
      controls: [SOUND, KEYS, COLOUR, KEPT, SAVER, GPU],
      states: [
        { label: 'As it comes', values: {} },
        { label: 'Sound down, keys changed', values: { sound: 'quiet', keys: true } },
        { label: 'Sound off', values: { sound: 'off' }, listed: false },
        { label: 'Sapphire picked', values: { colour: true }, listed: false },
        { label: "zoe_arcana's ruby, kept", values: { kept: true }, listed: false },
        { label: 'Battery saver on', values: { saver: true }, listed: false },
        { label: 'Graphics acceleration off', values: { gpu: true }, listed: false },
      ],
      build: (v = {}): Built => ({
        state: null,
        hash: '#settings',
        sound: v.sound === 'off' ? { muted: true } : v.sound === 'quiet' ? { volume: 0.35, ambience: 0 } : undefined,
        stored: { ...(v.keys ? { keys: JSON.stringify(CHANGED) } : {}), ...(v.colour ? { colour: '1' } : {}), ...(v.kept ? { name: 'zoe_arcana' } : {}), ...(v.saver ? { saver: '1' } : {}) },
        ...(v.gpu ? { gpuOff: true } : {}),
      }),
    },
    {
      // Sync, under the name: what it does, or how it stands (its light, when it last synced) and Unpair (the pairing dialog is the sync bench's);
      // then paired by hand, from view to view, or its light as the other device comes and goes.
      key: 'settings/sync',
      screen: 'settings',
      group: 'Settings',
      label: 'Sync, paired or not',
      seats: [{ mode: 'none', me: null }],
      controls: [SYNC, ASKED, PLAY],
      states: [
        { label: 'Not paired', values: { sync: 'off' } },
        { label: 'A code waiting', values: { sync: 'waiting' }, listed: false },
        { label: 'Paired, the other away', values: { sync: 'paired' }, listed: false },
        { label: 'Paired, not synced since', values: { sync: 'never' }, listed: false },
        { label: 'Synced', values: { sync: 'linked' }, listed: false },
        { label: 'Synced with three', values: { sync: 'three' }, listed: false },
        { label: 'Server out of reach', values: { sync: 'offline' }, listed: false },
        { label: 'Unpair asked for', values: { sync: 'linked', asked: 'unpair' }, listed: false },
        { label: 'The pairing dialog, from view to view', values: { sync: 'off', play: 'pair' }, key: 'settings/sync-dialog' },
        { label: 'Sync’s light coming on and going off', values: { play: 'light' }, key: 'settings/sync-light', listed: false },
      ],
      build: (v = {}): Built => {
        const s = String(v.sync ?? 'paired');
        const met = s !== 'off' && s !== 'waiting';
        const steps: Step[] = [...(met && v.asked === 'unpair' ? [{ click: '.sync-row .reset' }] : []), ...played(v.play)];
        return {
          state: null,
          hash: '#settings',
          ...(s === 'off'
            ? {}
            : {
                sync: {
                  code: SYNC_CODE,
                  met,
                  status: s === 'linked' || s === 'three' ? 'linked' : s === 'offline' ? 'offline' : 'waiting',
                  linked: s === 'three' ? 3 : s === 'linked' ? 1 : 0,
                  // (Paired and away: last synced 25 minutes before.)
                  lastAt: s === 'paired' ? Date.now() - 25 * 60_000 : 0,
                },
              }),
          ...(steps.length ? { steps } : {}),
        };
      },
    },
    {
      // Settings opened for the first time since the page loaded, a few seconds in (once the page has settled, when its
      // chunk is fetched ahead): from the start page's menu, or over a game from the header's gear, the sheet.
      key: 'settings/first-open',
      screen: 'settings',
      group: 'Settings',
      label: 'Opened for the first time since the page loaded',
      seats: [{ mode: 'none', me: null }],
      controls: [FROM],
      states: [
        { label: 'From the start page’s Settings', values: {} },
        { label: 'Over a question, from the header’s gear: the sheet', values: { from: 'game' }, listed: false },
      ],
      build: (v = {}): Built =>
        v.from === 'game'
          ? { ...overAQuestion(), hash: undefined, seat: { mode: 'local', me: null }, steps: [{ wait: FIRST_OPEN_MS }, { click: 'header [data-cursor="gear"]' }] }
          : { state: null, rooms: [], steps: [{ wait: FIRST_OPEN_MS }, { click: ':is(.entry:nth-child(4 of .entry) .pick, .pair .pair-pick:nth-child(2))' }] },
    },
    {
      key: 'settings/key',
      screen: 'settings',
      group: 'Settings',
      label: 'A key waiting to be set',
      seats: [{ mode: 'none', me: null }],
      // (Keys only where there's a keyboard: a phone has none to set, Settings.svelte.)
      build: (): Built => ({ state: null, hash: '#settings', steps: [{ click: '.seal', ifThere: true }] }),
    },
    {
      key: 'settings/key-moved',
      screen: 'settings',
      group: 'Settings',
      label: "The keypad's Enter set for the first option: Next question loses Enter, and says so",
      seats: [{ mode: 'none', me: null }],
      build: (): Built => ({ state: null, hash: '#settings', steps: [{ click: '.seal', ifThere: true }, { press: 'NumpadEnter' }] }),
    },
    {
      key: 'settings/over',
      screen: 'settings',
      group: 'Settings',
      label: "Over a question, from the header's gear",
      seats: [{ mode: 'local', me: null }],
      controls: [LOST],
      states: [
        { label: "Over a question, from the header's gear", values: {} },
        { label: "Over a question, didn't come", values: { lost: true }, key: 'settings/over-lost', listed: false },
      ],
      build: (v = {}): Built => (v.lost ? { ...overAQuestion(), lost: 'Settings' } : overAQuestion()),
    },
    // Their chunk lost: the Reload, as each try shows it while the connection is down (lib/chunkRetry.ts).
    {
      key: 'settings/lost',
      screen: 'settings',
      group: 'Settings',
      label: "Didn't come: the connection dropped",
      seats: [{ mode: 'none', me: null }],
      build: (): Built => ({ state: null, hash: '#settings', lost: 'Settings' }),
    },
  ];
}
