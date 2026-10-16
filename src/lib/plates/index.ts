// Every rune circle's plate, by the name a circle reads it as
// (`virtual:plate/<name>`, vite.config.ts).
import { build as blackSun } from './blackSun.ts';
import { build as eye } from './eye.ts';
import { build as monad } from './monad.ts';
import { build as moth } from './moth.ts';
import { build as rose } from './rose.ts';

export const PLATES: Record<string, () => unknown> = { eye, monad, rose, blackSun, moth };
