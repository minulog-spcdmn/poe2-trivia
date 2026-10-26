// Imported first by main.ts, so the game's script errors are counted
// (count.ts countScriptErrors) from before the rest of its start runs. A
// module's imports run before its own code, so the chunks main.ts imports
// (the session, the effects, the sounds) would run before this too: it and
// what it imports are a chunk of their own, which runs first (vite.config.ts,
// the errors chunk group and errorsFirst, which checks it).

import { countScriptErrors } from './count.ts';

countScriptErrors();
