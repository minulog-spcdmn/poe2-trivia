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
import { sizesFor } from './walk.ts';
import { statesOf } from '../benches/index.ts';
import { asQuery } from '../bench.ts';
import { seatsIn } from '../scene.ts';
import { buildScene } from '../tweaks.ts';
import Desk from './Desk.svelte';

useItems(itemData as Item[], fakeNames);
useCaptured(import.meta.glob('../captured/*.json', { eager: true, import: 'default' }));
mount(Desk, { target: document.getElementById('app')! });

// For the sweep (scripts/qa.mjs), which opens each state's frames by itself:
// every scene's every state (`n`, its controls as `values` sets them), with
// its seats and the sizes it is walked at.
Object.assign(window, {
  __qaDesk: {
    scenes: () =>
      catalog().flatMap((s) =>
        statesOf(s).map((st, n) => ({
          key: s.key,
          n,
          label: st.label,
          values: asQuery(st.values),
          seats: seatsIn(s, buildScene(s, st.values).built).length,
          sizes: sizesFor(s),
        })),
      ),
  },
});
