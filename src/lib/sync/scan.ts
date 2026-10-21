// Reading another device's QR code with this one's camera (SyncDialog): in
// the game itself, so a game added to an iPhone's home screen, whose storage
// is its own and not Safari's, pairs as well as the browser. The browser's
// own reader where it has one (BarcodeDetector: Chrome on Android, among
// others); elsewhere jsQR, loaded only then.

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorClass = { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };

/** Whether this browser can be asked for a camera at all. */
export const canScan = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** The browser's own QR reader, or null for none. */
async function browserReader(): Promise<Detector | null> {
  const D = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  try {
    return D && (await D.getSupportedFormats()).includes('qr_code') ? new D({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

/** How often a frame is looked at. */
const EVERY_MS = 150;
/** The widest a frame is looked at by jsQR (a phone's camera gives far more; the code fills much of it). */
const MAX_SIDE = 720;

/**
 * Shows the back camera in `video` and reads each frame until `found` takes
 * what it reads (returns true). Resolves to what stops it, or rejects when
 * there's no camera or the player says no to it.
 */
export async function scan(video: HTMLVideoElement, found: (text: string) => boolean): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    for (const t of stream.getTracks()) t.stop();
    video.srcObject = null;
  };
  try {
    video.srcObject = stream;
    await video.play();
    const reader = await browserReader();
    const jsQR = reader ? null : (await import('jsqr')).default;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const look = async () => {
      if (stopped) return;
      let text: string | null = null;
      if (video.readyState >= 2 && video.videoWidth) {
        if (reader) text = (await reader.detect(video).catch(() => []))[0]?.rawValue ?? null;
        else if (jsQR && ctx) {
          const k = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * k);
          canvas.height = Math.round(video.videoHeight * k);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          text = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
        }
      }
      if (stopped) return;
      if (text && found(text)) return stop();
      timer = setTimeout(() => void look(), EVERY_MS);
    };
    void look();
  } catch (err) {
    stop();
    throw err;
  }
  return stop;
}
