// The desk itself (qa.html without ?frame): the scenes are built here once
// with an engine of the desk's own, for their names, seats and sizes; each
// frame builds its own scene again with the session's.

import { mount } from 'svelte';
import '../../app.css';
import './desk.css';
import itemData from '../../data/items.json';
import fakeNames from '../../data/fakes.json';
import type { Item } from '../../lib/game.ts';
import { useItems } from '../build/engine.ts';
import { catalog } from '../scenes/index.ts';
import { useCaptured } from '../scenes/captured.ts';
import { sizesFor, walk } from './walk.ts';
import Desk from './Desk.svelte';

useItems(itemData as Item[], fakeNames);
useCaptured(import.meta.glob('../captured/*.json', { eager: true, import: 'default' }));
mount(Desk, { target: document.getElementById('app')! });

// For the sweep (scripts/qa.mjs), which opens each scene's frames by itself:
// every scene with its seats and the sizes it is walked at, and every stop.
Object.assign(window, {
  __qaDesk: {
    scenes: () => catalog().map((s) => ({ key: s.key, label: s.label, seats: s.seats.length, sizes: sizesFor(s) })),
    stops: () =>
      walk(catalog()).map((s) => ({
        id: s.id,
        scene: s.scene.key,
        label: s.scene.label,
        size: s.size,
        frames: s.seats.map((seat, i) => `?${new URLSearchParams({ frame: `s${i}`, s: s.scene.key, seat: String(seat), size: s.size })}`),
      })),
  },
});
