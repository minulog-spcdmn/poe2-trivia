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
      controls: [SOUND, KEYS, COLOUR],
      states: [
        { label: 'As it comes', values: {} },
        { label: 'Sound down, keys changed', values: { sound: 'quiet', keys: true } },
        { label: 'Sound off', values: { sound: 'off' } },
        { label: 'Sapphire picked', values: { colour: true } },
      ],
      build: (v = {}): Built => ({
        state: null,
        hash: '#settings',
        sound: v.sound === 'off' ? { muted: true } : v.sound === 'quiet' ? { volume: 0.35, ambience: 0 } : undefined,
        stored: { ...(v.keys ? { keys: JSON.stringify(CHANGED) } : {}), ...(v.colour ? { colour: '1' } : {}) },
      }),
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
