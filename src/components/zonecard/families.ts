// The zone title card's families of motion (lib/zoneTitle.ts Family), each
// in its own file beside this one.

import type { Family } from '../../lib/zoneTitle';
import type { FamilyMotion } from './family';
import { ember } from './ember';
import { rime } from './rime';
import { spore } from './spore';
import { voidFamily } from './void';
import { light } from './light';
import { fume } from './fume';

export const FAMILIES: Record<Family, FamilyMotion> = { ember, rime, spore, void: voidFamily, light, fume };
