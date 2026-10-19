// Every piece bench (../bench.ts): a component on its own, with its
// controls. A new one is a file here beside the others and a line below;
// the desk lists it, and its frame draws it.

import type { PieceBench } from '../bench.ts';
import { avatar } from './avatar.ts';
import { circle } from './circle.ts';
import { descent } from './descent.ts';
import { streak } from './streak.ts';
import { wraeclast } from './wraeclast.ts';
import { wraeclastRun } from './wraeclastRun.ts';

export const PIECES: PieceBench[] = [avatar, streak, descent, circle, wraeclast, wraeclastRun];

export const pieceByKey = (key: string | null) => PIECES.find((p) => p.key === key);
