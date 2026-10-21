// Pairing devices to sync (components/SyncDialog.svelte): this device's
// code as a QR code (where a computer opens it), waiting for the other or
// linked to it, a code taken from another, the code typed in, the camera
// reading another's (where a phone opens it), and a pairing link asking
// first. The
// frame never syncs (lib/sync/store.ts SYNC_HERE): the link's state is the
// controls', so nothing reaches the matchmaking server. The camera is the
// frame's own, so Scan a code on a phone reads a real QR code.

import type { PieceBench } from '../bench.ts';

export const sync: PieceBench = {
  kind: 'piece',
  key: 'sync',
  label: 'Sync',
  about: "Pairing the player's devices: the QR code and how the link stands, a code taken, entering the code, scanning one, and a pairing link asking first.",
  files: ['src/components/SyncDialog.svelte', 'src/components/SyncSeal.svelte', 'src/lib/sync/qr.ts', 'src/lib/sync/scan.ts', 'src/lib/sync/code.ts', 'src/components/Settings.svelte'],
  cell: 480,
  controls: [
    {
      kind: 'choice',
      key: 'view',
      label: 'Opened at',
      options: [
        { value: 'show', label: 'The code' },
        { value: 'joined', label: 'A code taken' },
        { value: 'type', label: 'Enter a code' },
        { value: 'scan', label: 'Scan a code' },
        { value: 'offered', label: 'A pairing link' },
      ],
      default: 'show',
    },
    {
      kind: 'choice',
      key: 'status',
      label: 'The link',
      options: [
        { value: 'connecting', label: 'Connecting' },
        { value: 'waiting', label: 'Waiting for the other' },
        { value: 'linked', label: 'Linked' },
        { value: 'offline', label: 'Server out of reach' },
      ],
      default: 'waiting',
    },
    { kind: 'range', key: 'linked', label: 'Devices linked', min: 1, max: 4, default: 1 },
  ],
  states: [
    { label: 'Waiting for the other device', values: { view: 'show', status: 'waiting' } },
    { label: 'Linked', values: { view: 'show', status: 'linked' } },
    { label: 'Linked to three', values: { view: 'show', status: 'linked', linked: 3 } },
    { label: 'Server out of reach', values: { view: 'show', status: 'offline' } },
    { label: 'Paired, the other not yet online', values: { view: 'joined', status: 'waiting' } },
    { label: 'Paired and synced', values: { view: 'joined', status: 'linked' } },
    { label: 'Enter a code', values: { view: 'type' } },
    { label: 'Scan a code', values: { view: 'scan' } },
    { label: 'A pairing link', values: { view: 'offered' } },
  ],
  view: () => import('./SyncView.svelte'),
};
