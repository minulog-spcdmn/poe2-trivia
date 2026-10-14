"""Trailer compositor: clips captured in virtual time, a shot list on the music's
beat grid, camera moves, transitions, title cards, grade, grain. Frames are piped
to ffmpeg."""
import json, os, math, subprocess, functools, sys
import numpy as np, cv2

ROOT = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(ROOT, 'clips')
CARDS = os.path.join(ROOT, 'cards')
FF = os.path.join(ROOT, 'bin', 'ffmpeg.exe')

# RES=2160 renders in 4K (the 1080p copy is then made from it: supersampled)
W, H = (960, 540) if os.environ.get('PREVIEW') == '1' else ((3840, 2160) if os.environ.get('RES') == '2160' else (1920, 1080))
PX = W / 1920

# ---- the music's grid -------------------------------------------------------
MUSIC_IN = 10.06          # where the trailer's music starts in the track
BEAT0 = 10.101            # a downbeat (kick) in the track
BEAT = 0.4430             # seconds per beat (135.44 BPM)
DROP_END_TRACK = BEAT0 + 116 * BEAT          # 61.489: the drop's 16 bars end
OUTRO_IN = 215.133 - 4 * BEAT                # one bar of break before the outro's slam
OUTRO_END = 224.4
XF = 0.04                                    # audio crossfade at the splice
SPLICE_T = DROP_END_TRACK - MUSIC_IN         # trailer time of the splice
def beat(n):
    """Trailer time of beat n (n=0 the first kick; the drop is n=52)."""
    return BEAT0 + n * BEAT - MUSIC_IN
def bar(k): return beat(4 * k)
def outro(track_t):
    """Trailer time of a moment in the outro section of the track."""
    return SPLICE_T + (track_t - OUTRO_IN)
DURATION = outro(OUTRO_END)

# ---- easing ---------------------------------------------------------------
def clamp01(x): return 0.0 if x < 0 else 1.0 if x > 1 else x
def smooth(x): x = clamp01(x); return x * x * (3 - 2 * x)
def ease_out(x, p=3): x = clamp01(x); return 1 - (1 - x) ** p
def ease_in(x, p=3): x = clamp01(x); return x ** p
def ease_io(x): x = clamp01(x); return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2
def lerp(a, b, u): return a + (b - a) * u

def keyed(keys, u, ease=ease_io):
    """Interpolate a list of (u, value-or-tuple) keyframes at u."""
    if u <= keys[0][0]: return keys[0][1]
    for (u0, v0), (u1, v1) in zip(keys, keys[1:]):
        if u <= u1:
            e = ease((u - u0) / max(1e-9, u1 - u0))
            if isinstance(v0, tuple): return tuple(lerp(a, b, e) for a, b in zip(v0, v1))
            return lerp(v0, v1, e)
    return keys[-1][1]

# ---- clips ----------------------------------------------------------------
class Clip:
    def __init__(self, name):
        self.name = name
        self.dir = os.path.join(CLIPS, name)
        J = json.load(open(os.path.join(self.dir, 'stamps.json')))
        self.files = [s[0] for s in J['stamps']]
        self.t = np.array([s[1] / 1000 for s in J['stamps']])
        self.marks = dict((m[0], m[1] / 1000) for m in J.get('marks', []))
        self.len = self.t[-1]
    def img(self, i):
        return self._img8(i).astype(np.float32) * (1 / 255)
    @functools.lru_cache(maxsize=40)
    def _img8(self, i):
        im = cv2.imread(os.path.join(self.dir, self.files[i]), cv2.IMREAD_COLOR)
        if W < 1920: im = cv2.resize(im, (im.shape[1] * W // 1920, im.shape[0] * W // 1920), interpolation=cv2.INTER_AREA)
        return im
    def at(self, t, blend=True):
        """The frame at virtual time t (seconds), blended between the two nearest."""
        t = min(max(t, self.t[0]), self.t[-1])
        j = int(np.searchsorted(self.t, t))
        if j <= 0: return self.img(0)
        if j >= len(self.t): return self.img(len(self.t) - 1)
        t0, t1 = self.t[j - 1], self.t[j]
        u = (t - t0) / max(1e-6, t1 - t0)
        if not blend or u < 0.15: return self.img(j - 1)
        if u > 0.85: return self.img(j)
        return self.img(j - 1) * (1 - u) + self.img(j) * u

_clips = {}
def clip(name):
    if name not in _clips: _clips[name] = Clip(name)
    return _clips[name]

@functools.lru_cache(maxsize=32)
def card(name):
    im = cv2.imread(os.path.join(CARDS, name + '.png'), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
    if im.shape[1] != W: im = cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)
    return im  # BGRA, straight alpha

# ---- image ops ------------------------------------------------------------
def camera(img, zoom=1.0, cx=0.5, cy=0.5, rot=0.0, dx=0.0, dy=0.0, clamp=True):
    """Look at (cx, cy) (fractions of the frame) zoomed in `zoom`, rotated `rot` degrees, shifted (dx, dy) output px.
    The source may be larger than the output (a hi-res capture): it's sampled directly."""
    sh, sw = img.shape[:2]
    if zoom == 1.0 and rot == 0 and cx == 0.5 and cy == 0.5 and dx == 0 and dy == 0:
        return img if sw == W else cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
    half = 0.5 / max(zoom, 1e-3)
    if zoom >= 1 and clamp:
        cx = min(max(cx, half), 1 - half); cy = min(max(cy, half), 1 - half)
    k = zoom * W / sw
    if k < 0.75:  # shrinking a lot: pre-shrink so it doesn't alias
        img = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA); sh, sw = H, W; k = zoom
    M = cv2.getRotationMatrix2D((cx * sw, cy * sh), rot, k)
    M[0, 2] += W / 2 - cx * sw + dx
    M[1, 2] += H / 2 - cy * sh + dy
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)

def motion_blur(img, dx, dy):
    """Directional blur along (dx, dy) pixels."""
    n = int(max(abs(dx), abs(dy)))
    if n < 2: return img
    n = min(n, 301)
    k = np.zeros((n | 1, n | 1), np.float32)
    c = (n | 1) // 2
    cv2.line(k, (int(c - dx / 2 * (n | 1) / max(1, n)), int(c - dy / 2 * (n | 1) / max(1, n))), (int(c + dx / 2 * (n | 1) / max(1, n)), int(c + dy / 2 * (n | 1) / max(1, n))), 1.0, 1)
    k /= max(1e-6, k.sum())
    return cv2.filter2D(img, -1, k, borderType=cv2.BORDER_REFLECT)

def zoom_blur(img, amount, cx=0.5, cy=0.5, n=8):
    """Radial blur outward from (cx, cy)."""
    if amount < 0.004: return img
    acc = np.zeros_like(img)
    for i in range(n):
        s = 1 + amount * i / (n - 1)
        acc += camera(img, s, cx, cy)
    return acc / n

def bloom(img, strength=0.35, thresh=0.55, sigma=18):
    small = cv2.resize(img, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    lum = small.max(axis=2, keepdims=True)
    bright = small * np.clip((lum - thresh) / (1 - thresh), 0, 1)
    b = cv2.GaussianBlur(bright, (0, 0), sigma / 4) * 0.6 + cv2.GaussianBlur(bright, (0, 0), sigma) * 0.6
    b = cv2.resize(b, (W, H), interpolation=cv2.INTER_LINEAR)
    return 1 - (1 - img) * (1 - b * strength)

def over(base, layer, alpha):
    """Composite a BGR layer with alpha (HxWx1 or scalar) over base."""
    return base * (1 - alpha) + layer * alpha

def put_card(base, name, opacity=1.0, scale=1.0, dx=0.0, dy=0.0, blur=0.0, wipe=None):
    """Composite a title card. `wipe`: (u, from_left) a soft reveal from the left edge of its content."""
    if opacity <= 0.002: return base
    c = card(name)
    if scale != 1.0 or dx or dy:
        M = cv2.getRotationMatrix2D((W / 2, H / 2), 0, scale)
        M[0, 2] += dx; M[1, 2] += dy
        c = cv2.warpAffine(c, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    if blur > 0.3:
        c = cv2.GaussianBlur(c, (0, 0), blur)
    a = c[:, :, 3:4] * opacity
    if wipe is not None:
        u, x0, x1 = wipe
        xs = np.linspace(0, 1, W, dtype=np.float32)
        edge = x0 + (x1 - x0) * u
        m = np.clip((edge - xs * (x1 - x0) - x0 + 0.04) / 0.04, 0, 1)
        a = a * m[None, :, None]
    return base * (1 - a) + c[:, :, :3] * a

_vig = None
def vignette(img, strength=0.35):
    global _vig
    if _vig is None:
        y, x = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2) / math.sqrt(2)
        _vig = (1 - np.clip(r - 0.35, 0, 1) ** 1.6)[:, :, None]
    return img * (1 - strength + strength * _vig)

_rng = np.random.default_rng(7)
_grain = [(_rng.standard_normal((H, W, 1)).astype(np.float32)) for _ in range(6)]
def grain(img, f, amount=0.018):
    """Fine grain; also dithers the 8-bit output so soft gradients don't band."""
    return img + _grain[f % 6] * amount

_scrim = None
def lower_scrim(img, opacity):
    """A frosted dark corner behind a lower-third, so it reads over busy UI."""
    global _scrim
    if _scrim is None:
        y, x = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((x - W * 0.05) / (W * 0.62)) ** 2 + ((y - H * 0.85) / (H * 0.55)) ** 2)
        _scrim = (np.clip(1.25 - d, 0, 1) ** 0.9)[:, :, None]
        _scrim = np.minimum(_scrim, 0.9)
    m = _scrim * opacity
    small = cv2.resize(img, (W // 8, H // 8), interpolation=cv2.INTER_AREA)
    fro = cv2.resize(cv2.GaussianBlur(small, (0, 0), 2.5), (W, H), interpolation=cv2.INTER_LINEAR) * 0.35
    return img * (1 - m) + fro * m * 0.45

def flash(img, amount, color=(0.80, 0.93, 1.0)):
    """Additive light: color is BGR."""
    if amount <= 0: return img
    # exposure, not fog: the light grows, the blacks stay
    return img * (1 + amount * 2.2 * np.array(color, np.float32)) + amount * 0.05

def shake(t, amp, freq=22.0, seed=0):
    amp *= PX
    r = np.random.default_rng(seed)
    ph = r.random(6) * 6.28
    dx = amp * (math.sin(t * freq + ph[0]) * 0.6 + math.sin(t * freq * 1.7 + ph[1]) * 0.4)
    dy = amp * (math.sin(t * freq * 1.3 + ph[2]) * 0.6 + math.sin(t * freq * 2.1 + ph[3]) * 0.4)
    rot = amp * 0.02 * math.sin(t * freq * 0.9 + ph[4])
    return dx, dy, rot

# ---- rendering ------------------------------------------------------------
def render(frame_fn, out_path, fps=60, scale=1.0, t0=0.0, t1=None, audio=None, crf=16, preset='slow', venc=None, quiet=False):
    t1 = DURATION if t1 is None else t1
    ow, oh = int(W * scale) // 2 * 2, int(H * scale) // 2 * 2
    cmd = [FF, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{ow}x{oh}', '-r', str(fps), '-i', '-']
    if audio:
        cmd += ['-ss', f'{t0:.3f}', '-t', f'{t1 - t0:.3f}', '-i', audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k']
    cmd += (venc or ['-c:v', 'libx264', '-preset', preset, '-crf', str(crf)]) + ['-pix_fmt', 'yuv420p', '-movflags', '+faststart', out_path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n0, n1 = int(round(t0 * fps)), int(round(t1 * fps))
    import time; tt = time.time()
    for f in range(n0, n1):
        t = f / fps
        img = frame_fn(t, f)
        img = np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)
        if scale != 1.0: img = cv2.resize(img, (ow, oh), interpolation=cv2.INTER_AREA)
        p.stdin.write(img.tobytes())
        if not quiet and (f - n0) % 120 == 0:
            el = time.time() - tt
            print(f'\r  {t:6.2f}s / {t1:.2f}  ({(f - n0 + 1) / max(el, 1e-3):.1f} fps)', end='', flush=True)
    p.stdin.close(); p.wait()
    print()

def build_audio(path):
    src = os.path.join(ROOT, 'music', 'full.wav')
    a0, a1 = MUSIC_IN, DROP_END_TRACK
    fc = (f"[0:a]atrim={a0}:{a1 + XF},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.03[a];"
          f"[0:a]atrim={OUTRO_IN}:{OUTRO_END},asetpts=PTS-STARTPTS[b];"
          f"[a][b]acrossfade=d={XF}:c1=tri:c2=tri,afade=t=out:st={DURATION - 1.6:.3f}:d=1.6[o]")
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-filter_complex', fc, '-map', '[o]', '-c:a', 'pcm_s16le', path], check=True)
