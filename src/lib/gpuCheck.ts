// Whether the browser draws without the GPU: hardware acceleration switched
// off (gamers often do, to leave the GPU to their game) or a GPU it won't
// use. WebGL then runs in software, and the backdrop and the effects turn
// the game into a slideshow (6 fps where a GPU gives 168). Nothing changes
// how the game looks; the player is told how to switch it back on
// (lib/gpuNotice.svelte.ts). (Firefox is another matter, further down: its
// WebGL stays on the GPU and the page around it turns slow.)
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
 * Whether the page draws in software. Without WebGL at all there's no
 * telling: the game paints its CSS backdrop then, smoothly where the browser
 * still puts the page together with the GPU, and nothing here says whether
 * it does.
 */
export function drawsInSoftware(p: Probe): boolean {
  const strict = p.strict();
  if (strict) return softwareRenderer(strict.renderer);
  return p.plain() !== null;
}

/** The renderer's name, unmasked where the browser allows it (only to test it: softwareRenderer). */
export function rendererOf(gl: WebGL2RenderingContext): string | null {
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

// Firefox answers none of that. It has ignored failIfMajorPerformanceCaveat
// since version 86, and with its acceleration off WebGL stays on the GPU: it
// is the page that is put together in software then (its compositor,
// "WebRender (Software)"), at 13 frames a second where the GPU gives 167
// (Firefox 159, the start page), and the contexts say "a GPU" all the while.
// Two things do change with the switch (measured there, on Windows):
// whether a 1080p video would be decoded sparing power, which only the GPU
// does, and whether WebGPU finds a GPU. Either can be missing with
// acceleration on (a driver kept from decoding video, a card too old for
// WebGPU, a browser set to resist fingerprinting, which answers "not
// sparing" to every video), so only the two together count, and a browser
// that won't say counts as drawing with the GPU. They are the page's to ask
// (lib/gpuNotice.svelte.ts): in a worker Firefox calls the tall video "not
// sparing" whatever the switch says, and only WebGPU would be left.

/** What Firefox gives away of its acceleration, each null where it can't say (no such API, an error, no answer in time). */
export interface FirefoxSigns {
  /** Whether an H.264 video this tall would be decoded sparing power (mediaCapabilities' powerEfficient). */
  sparing(height: number): Promise<boolean | null>;
  /** Whether WebGPU finds a GPU. */
  findsGpu(): Promise<boolean | null>;
}

/** A video only the GPU decodes sparing power, and one small enough that Firefox says so without it: the check that it answers at all. */
const TALL = 1080;
const SMALL = 360;

/**
 * Whether Firefox puts the page together without the GPU: the tall video
 * not sparing, the small one sparing all the same, and no GPU for WebGPU.
 * The video is asked first: a few milliseconds, and where the GPU decodes
 * (nearly everywhere) WebGPU, which takes a tenth of a second, isn't asked.
 */
export async function firefoxInSoftware(signs: FirefoxSigns): Promise<boolean> {
  if ((await signs.sparing(TALL)) !== false) return false;
  if ((await signs.sparing(SMALL)) !== true) return false;
  return (await signs.findsGpu()) === false;
}

/** Firefox on Windows: the one place its signs were measured. (On Linux it often decodes video without the GPU, acceleration on.) */
export const firefoxOnWindows = (userAgent: string) => /Firefox\//.test(userAgent) && /Windows NT/.test(userAgent);

/** How long a sign may take (ms): past it there's no answer. */
const SIGN_MS = 4000;
function orNull<T>(asked: Promise<T>): Promise<T | null> {
  let late: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<null>((none) => (late = setTimeout(() => none(null), SIGN_MS)));
  return Promise.race([asked.catch(() => null), limit]).finally(() => clearTimeout(late));
}

/** The browser's own signs (see firefoxInSoftware), asked on the page. */
export const browserSigns: FirefoxSigns = {
  sparing: (height) =>
    orNull(
      (async () => {
        const { mediaCapabilities } = navigator as Partial<Pick<Navigator, 'mediaCapabilities'>>;
        if (!mediaCapabilities) return null;
        const video = { contentType: 'video/mp4; codecs="avc1.640028"', width: Math.round((height * 16) / 9), height, bitrate: 4_000_000, framerate: 30 };
        const says = await mediaCapabilities.decodingInfo({ type: 'file', video });
        return says.supported ? says.powerEfficient : null;
      })(),
    ),
  findsGpu: () =>
    orNull(
      (async () => {
        const { gpu } = navigator as Partial<Pick<Navigator, 'gpu'>>;
        return gpu ? (await gpu.requestAdapter()) != null : null;
      })(),
    ),
};

/** How to switch it back on, as the notice's steps (components/GpuDialog.svelte). */
export interface AccelerationFix {
  /** What the browser's own settings call it, for the notice's title and the settings' line: the player looks for that word. */
  name: string;
  /**
   * The settings page the switch is on, where the browser has an address for
   * it. For the address bar of a new tab: a page may not open it, so the
   * notice offers it to copy. Null: "Open your browser's settings."
   */
  address: string | null;
  /** The switch to turn on there. */
  turnOn: string;
  /** The restart it takes. */
  restart: string;
}

/** The switch as Chrome and Edge name it. (Opera's keeps the older name, as Firefox's does.) */
const SWITCH = 'Turn on “Use graphics acceleration when available”.';
const GRAPHICS = 'Graphics acceleration';
const HARDWARE = 'Hardware acceleration';

/** The steps in general: for a browser with no address to give, and the notice's own when it has no browser to go by. */
export const GENERAL_FIX: AccelerationFix = {
  name: HARDWARE,
  address: null,
  turnOn: 'Turn on hardware acceleration (some call it graphics acceleration).',
  restart: 'Restart the browser.',
};

/**
 * The fix in the player's own browser: where the switch is, and the restart
 * it needs. None on phones and tablets, nor in Safari: their browsers have
 * no such setting (a GPU they won't use stays unused). Whatever else says it is Chrome
 * (Brave, Vivaldi) takes Chrome's: its address opens theirs too, and no step
 * names the browser.
 */
export function accelerationFix(userAgent: string): AccelerationFix | null {
  if (/Android|iPhone|iPad|iPod|Mobile/.test(userAgent)) return null;
  if (/Edg\//.test(userAgent)) return { name: GRAPHICS, address: 'edge://settings/system', turnOn: SWITCH, restart: 'Press Restart, the button that shows once it’s on.' };
  if (/OPR\//.test(userAgent))
    return {
      name: HARDWARE,
      address: 'opera://settings/system',
      turnOn: 'Turn on “Use hardware acceleration when available”.',
      restart: 'Press Relaunch, the button that shows beside it.',
    };
  if (/Firefox\//.test(userAgent))
    return {
      name: HARDWARE,
      address: 'about:preferences#general',
      // (With it off, “Use recommended performance settings” above it is unticked already, and this box shows: read in Firefox 159.)
      turnOn: 'Under Performance, tick “Use hardware acceleration when available”.',
      restart: 'Restart Firefox.',
    };
  if (/Chrome\//.test(userAgent)) return { name: GRAPHICS, address: 'chrome://settings/system', turnOn: SWITCH, restart: 'Press Relaunch, the button that shows beside it.' };
  // (Safari has no such switch either, on a Mac or an iPad, which says it is one.)
  if (/Safari\//.test(userAgent)) return null;
  return GENERAL_FIX;
}
