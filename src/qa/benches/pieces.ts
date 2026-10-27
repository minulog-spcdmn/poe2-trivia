// Every piece bench (../bench.ts): a component on its own, with its
// controls. A new one is a file here beside the others and a line below;
// the desk lists it, and its frame draws it.

import type { PieceBench } from '../bench.ts';
import { avatar } from './avatar.ts';
import { circle } from './circle.ts';
import { descent } from './descent.ts';
import { legal } from './legal.ts';
import { plate } from './plate.ts';
import { pointers } from './pointers.ts';
import { sigils } from './sigils.ts';
import { streak } from './streak.ts';
import { sync } from './sync.ts';
import { tip } from './tip.ts';
import { zone } from './zone.ts';

export const PIECES: PieceBench[] = [avatar, sigils, streak, plate, descent, zone, circle, sync, legal, pointers, tip];

export const pieceByKey = (key: string | null) => PIECES.find((p) => p.key === key);
