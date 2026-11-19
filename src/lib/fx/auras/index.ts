// Every player aura's burn (lib/auraKinds.ts), by its kind.

import type { AuraKind } from '../../auraKinds';
import type { AuraContext, Burning } from './common';
import { burn as breach } from './breach';
import { burn as delirium } from './delirium';
import { burn as ritual } from './ritual';
import { burn as expedition } from './expedition';
import { burn as abyss } from './abyss';
import { burn as azmeri } from './azmeri';
import { burn as tower } from './tower';
import { burn as chronomancer } from './chronomancer';
import { burn as chayula } from './chayula';
import { burn as lich } from './lich';
import { burn as divine } from './divine';
import { burn as corrupted } from './corrupted';
import { burn as mirror } from './mirror';
import { burn as ice } from './ice';
import { burn as blacksun } from './blacksun';
import { burn as runeseal } from './runeseal';
import { burn as twilight } from './twilight';
import { burn as slayer } from './slayer';
import { burn as shadow } from './shadow';

export const BURNS: Record<AuraKind, (ctx: AuraContext) => Burning> = { breach, delirium, ritual, expedition, abyss, azmeri, tower, chronomancer, chayula, lich, divine, corrupted, mirror, ice, blacksun, runeseal, twilight, slayer, shadow };
