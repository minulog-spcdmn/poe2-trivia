// The settings page, opened from the start page (#settings): as it comes,
// with the sound turned down and keys changed, and a key waiting to be set.
// And the same settings over a game, from the header's gear.

import { rebind, DEFAULT_BINDINGS } from '../../lib/keys.ts';
import type { Control } from '../bench.ts';
import { Table } from '../build/play.ts';
import type { Built, Scene } from '../scene.ts';

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

/** A code to be paired with, the same every time (as the sync bench's). */
const SYNC_CODE = 'K7QXM2PA9FHE3TDW';

/** Option 1 on Q, and Q's old place freed: what a player who moved the answers to the left hand has. */
const CHANGED = rebind(rebind(DEFAULT_BINDINGS, 'option1', 0, 'KeyQ'), 'detonate', 1, 'KeyX');

export function settingsScenes(): Scene[] {
  return [
    {
      key: 'settings/page',
      screen: 'settings',
      group: 'Settings',
      label: 'The settings page',
      seats: [{ mode: 'none', me: null }],
      controls: [SOUND, KEYS, COLOUR, KEPT],
      states: [
        { label: 'As it comes', values: {} },
        { label: 'Sound down, keys changed', values: { sound: 'quiet', keys: true } },
        { label: 'Sound off', values: { sound: 'off' } },
        { label: 'Sapphire picked', values: { colour: true } },
        { label: "zoe_arcana's ruby, kept", values: { kept: true } },
      ],
      build: (v = {}): Built => ({
        state: null,
        hash: '#settings',
        sound: v.sound === 'off' ? { muted: true } : v.sound === 'quiet' ? { volume: 0.35, ambience: 0 } : undefined,
        stored: { ...(v.keys ? { keys: JSON.stringify(CHANGED) } : {}), ...(v.colour ? { colour: '1' } : {}), ...(v.kept ? { name: 'zoe_arcana' } : {}) },
      }),
    },
    {
      // Sync, under the name: what it does, or how it stands (its light, when it last synced) and Unpair (the pairing dialog is the sync bench's).
      key: 'settings/sync',
      screen: 'settings',
      group: 'Settings',
      label: 'Sync, paired or not',
      seats: [{ mode: 'none', me: null }],
      controls: [SYNC, ASKED],
      states: [
        { label: 'Not paired', values: { sync: 'off' } },
        { label: 'A code waiting', values: { sync: 'waiting' } },
        { label: 'Paired, the other away', values: { sync: 'paired' } },
        { label: 'Paired, not synced since', values: { sync: 'never' } },
        { label: 'Synced', values: { sync: 'linked' } },
        { label: 'Synced with three', values: { sync: 'three' } },
        { label: 'Server out of reach', values: { sync: 'offline' } },
        { label: 'Unpair asked for', values: { sync: 'linked', asked: 'unpair' } },
      ],
      build: (v = {}): Built => {
        const s = String(v.sync ?? 'paired');
        const met = s !== 'off' && s !== 'waiting';
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
          ...(met && v.asked === 'unpair' ? { steps: [{ click: '.sync-row .reset' }] } : {}),
        };
      },
    },
    {
      key: 'settings/key',
      screen: 'settings',
      group: 'Settings',
      label: 'A key waiting to be set',
      seats: [{ mode: 'none', me: null }],
      build: (): Built => ({ state: null, hash: '#settings', steps: [{ click: '.seal' }] }),
    },
    {
      key: 'settings/over',
      screen: 'settings',
      group: 'Settings',
      label: "Over a question, from the header's gear",
      seats: [{ mode: 'local', me: null }],
      build: (): Built => {
        const t = new Table(['Kalguur', 'Doryani', 'Una of the Vaal'], {}, { host: null }).start().pick();
        return { state: t.s, act: t.room, at: t.clock.now + 3000, hash: '#settings' };
      },
    },
  ];
}
