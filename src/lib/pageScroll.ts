// How far the page is scrolled, as its last scroll event left it. Reading
// scrollX or scrollY has the browser lay the page out there and then if
// anything changed since: read as an effect started, the moment a screen
// mounted, they laid the new screen out in the middle of mounting it (21 ms
// as a Delve run began, traced on a 4K screen), and the scroll back to the
// top on a change of screen did the same (13 ms as the lobby opened). The
// page's scroll events come before each frame's own work, its animation
// frames included, so what's read there is that frame's; read between
// frames, it's at most one behind.

let at: [number, number] | null = null;
const heard = (): [number, number] => (at = [scrollX, scrollY]);
if (typeof addEventListener === 'function') addEventListener('scroll', heard, { passive: true });

/** How far the page is scrolled, [x, y] in CSS px (0 with no window, as in the tests). */
export const pageScroll = (): [number, number] => (typeof scrollY === 'number' ? (at ?? heard()) : [0, 0]);
