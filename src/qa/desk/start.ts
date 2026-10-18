// The desk itself (qa.html without ?frame): the scenes are built here once
// with an engine of the desk's own, for their names, seats and sizes; each
// frame builds its own scene again with the session's.

import { mount } from 'svelte';
import '../../app.css';
import './desk.css';
import itemData from '../../data/items.json';
import fakeNames from '../../data/fakes.json';
import { Engine, type Item } from '../../lib/game.ts';
import { useEngine } from '../build/engine.ts';
import Desk from './Desk.svelte';

useEngine(new Engine(itemData as Item[], { fakes: fakeNames }));
mount(Desk, { target: document.getElementById('app')! });
