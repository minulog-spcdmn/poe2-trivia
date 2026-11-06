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

// For the sweep (scripts/sweep.mjs), which opens each state's frames by itself:
// every scene's every state, listed or not (`n`), with its seats and the
// sizes it is walked at. A frame opens it by `key` with `values` (k.*): a
// place (a state with a key of its own) by its own key, which says its
// controls; any other state by its scene's, with the controls it sets.
// `place`: what the redraw check and the scene map take, each scene's first
// state and every state with a key.
Object.assign(window, {
  __qaDesk: {
    scenes: () =>
      catalog().flatMap((s) =>
        statesOf(s).map((st, n) => ({
          key: st.key ?? s.key,
          scene: s.key,
          place: !!st.key || n === 0,
          n,
          label: st.label,
          values: st.key ? [] : asQuery(st.values),
          seats: seatsIn(s, buildScene(s, st.values).built).length,
          sizes: sizesFor(s),
        })),
      ),
  },
});
