// The ledger (stats.html): PoE2.Quest's counts, read from GoatCounter with
// the owner's key (src/statsPage/api.ts). Built into every build, linked
// from nowhere, and kept out of search results; without the key it shows
// nothing but the door.

import { mount } from 'svelte';
import '../app.css';
import { installCursor } from '../lib/ownCursor';
import Ledger from './Ledger.svelte';

installCursor();
mount(Ledger, { target: document.getElementById('app')! });
