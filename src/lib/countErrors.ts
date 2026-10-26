// Imported first by main.ts, so the game's script errors are counted
// (count.ts countScriptErrors) from before main.ts's own code runs. The
// modules main.ts imports run before it all the same (a module's imports run
// before its own code): the errors of theirs are kept until this runs by
// the inline script at the top of the page (lib/errorsFirst.ts).

import { countScriptErrors } from './count.ts';

countScriptErrors();
