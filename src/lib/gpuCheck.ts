// Whether the browser draws without the GPU: hardware acceleration switched
// off (gamers often do, to leave the GPU to their game) or a GPU it won't
// use. WebGL then runs in software, and the backdrop and the effects turn
// the game into a slideshow (6 fps where a GPU gives 168). Nothing changes
// how the game looks; the player is told, once, how to switch it back on
// (lib/gpuNotice.ts).
//
// Asked of a WebGL2 context of its own, made once and let go at once, in a
// worker (lib/gpuWorker.ts): made on the page, a context holds the main
// thread up 10 to 60 ms waiting on the GPU process. The browser refuses one
// made with failIfMajorPerformanceCaveat when it would draw in software,
// where a plain one is still given. The
// renderer's name backs that up where the browser shows it (Chrome's
// software paths: Microsoft's Basic Render Driver on Windows, SwiftShader;
// Mesa's llvmpipe and softpipe on Linux). The name is only tested here,
// never kept, stored or sent.

/** A renderer's name that says it draws in software. */
const SOFTWARE = /basic render driver|swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i;

export const softwareRenderer = (name: string | null | undefined) => !!name && SOFTWARE.test(name);

/** What a context of each kind turned out to be: null where the browser gave none. */
export interface Probe {
  /** One made with failIfMajorPerformanceCaveat: refused in software. */
  strict(): { renderer: string | null } | null;
  /** A plain one, asked only when the strict one was refused. */
  plain(): { renderer: string | null } | null;
}

/**
 * Whether the page draws in software. Without WebGL at all it doesn't: the
 * game then paints its CSS backdrop, which runs smoothly anyway.
 */
export function drawsInSoftware(p: Probe): boolean {
  const strict = p.strict();
  if (strict) return softwareRenderer(strict.renderer);
  return p.plain() !== null;
}

/** The renderer's name, unmasked where the browser allows it (only to test it: softwareRenderer). */
function rendererOf(gl: WebGL2RenderingContext): string | null {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    return typeof name === 'string' ? name : null;
  } catch {
    return null;
  }
}

/** Makes one context of the kind on a canvas of its own, reads it and lets it go (none without OffscreenCanvas). */
function contextOf(strict: boolean): { renderer: string | null } | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = new OffscreenCanvas(1, 1).getContext('webgl2', { failIfMajorPerformanceCaveat: strict, antialias: false, depth: false, stencil: false, powerPreference: 'default' });
  } catch {}
  if (!gl) return null;
  const out = { renderer: rendererOf(gl) };
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return out;
}

/** The browser's own probe (see drawsInSoftware), for the worker to run. */
export const browserProbe: Probe = { strict: () => contextOf(true), plain: () => contextOf(false) };

/** The fix in the player's own browser, to follow "For smooth play, ": where the setting is, and the restart it needs. */
export function accelerationFix(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "turn on Edge's Settings › System and performance › “Use graphics acceleration when available”, then restart it.";
  if (/OPR\//.test(userAgent)) return "turn on Opera's Settings › System › “Use hardware acceleration when available”, then restart it.";
  if (/Firefox\//.test(userAgent)) return "turn on hardware acceleration in Firefox's Settings › General › Performance, then restart it.";
  if (/Chrome\//.test(userAgent)) return "turn on Chrome's Settings › System › “Use graphics acceleration when available”, then relaunch it.";
  return "turn on hardware acceleration in your browser's settings, then restart it.";
}
