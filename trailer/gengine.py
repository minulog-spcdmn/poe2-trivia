"""The compositor on the GPU (PyTorch CUDA): the same operations as engine/engine2, on (3, H, W)
BGR float tensors. Frames are decoded on the GPU (nvJPEG) and cached there; NVENC encodes."""
import os, math, json, subprocess, time, collections
import numpy as np, cv2, torch
import torch.nn.functional as F
from torchvision.io import decode_jpeg, read_file

dev = torch.device('cuda')
torch.backends.cudnn.benchmark = True
ROOT = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(ROOT, 'clips'); CARDS = os.path.join(ROOT, 'cards'); FF = os.path.join(ROOT, 'bin', 'ffmpeg.exe')
# RES=2160 renders in 4K (the 1080p copy is then made from it: supersampled)
W, H = (960, 540) if os.environ.get('PREVIEW') == '1' else ((3840, 2160) if os.environ.get('RES') == '2160' else (1920, 1080))
PX = W / 1920

# ---- pixel grids --------------------------------------------------------------------
_ys, _xs = torch.meshgrid(torch.arange(H, device=dev, dtype=torch.float32), torch.arange(W, device=dev, dtype=torch.float32), indexing='ij')
_ones = torch.ones_like(_xs)
_XY1 = torch.stack([_xs, _ys, _ones], 0).reshape(3, -1)   # (3, H*W) output pixel centres

def _sample(src, Minv, sw, sh, mode='bicubic', pad='reflection', persp=False):
    """Sample src (C, sh, sw) at output pixels mapped through Minv (3x3, output px to source px)."""
    m = torch.as_tensor(Minv, dtype=torch.float32, device=dev)
    p = m @ _XY1
    if persp: p = p[:2] / p[2:3]
    gx = (2 * p[0] + 1) / sw - 1; gy = (2 * p[1] + 1) / sh - 1
    grid = torch.stack([gx, gy], -1).reshape(1, H, W, 2)
    return F.grid_sample(src.unsqueeze(0), grid, mode=mode, padding_mode=pad, align_corners=False)[0]

def _inv_affine(M):
    A = np.vstack([M, [0, 0, 1]]); return np.linalg.inv(A)

def resize(img, w, h, mode='area'):
    return F.interpolate(img.unsqueeze(0), size=(h, w), mode=mode, **({} if mode == 'area' else {'align_corners': False}))[0]

def black(): return torch.zeros((3, H, W), device=dev)

# ---- blur -----------------------------------------------------------------------------
_kern = {}
def _k1d(sigma):
    key = round(sigma, 2)
    if key not in _kern:
        r = max(1, int(math.ceil(sigma * 3)))
        x = torch.arange(-r, r + 1, device=dev, dtype=torch.float32)
        k = torch.exp(-x ** 2 / (2 * sigma ** 2)); _kern[key] = k / k.sum()
    return _kern[key]
def gblur(img, sigma):
    if sigma < 0.3: return img
    c, h, w = img.shape
    if sigma > 6:
        f = int(sigma // 3)
        small = resize(img, max(1, w // f), max(1, h // f))
        return resize(gblur(small, sigma / f), w, h, 'bilinear')
    k = _k1d(sigma); r = (len(k) - 1) // 2
    x = img.unsqueeze(0)
    x = F.conv2d(F.pad(x, (r, r, 0, 0), mode='reflect'), k.view(1, 1, 1, -1).expand(c, 1, 1, -1), groups=c)
    x = F.conv2d(F.pad(x, (0, 0, r, r), mode='reflect'), k.view(1, 1, -1, 1).expand(c, 1, -1, 1), groups=c)
    return x[0]

# ---- clips ------------------------------------------------------------------------------
# One frame cache for all clips, on the GPU, within a budget.
CACHE_BYTES = int(float(os.environ.get('CACHE_GB', '2')) * (1 << 30))
_cache = collections.OrderedDict(); _cache_bytes = 0

def _decode_checked(path):
    """A frame, decoded on the CPU (OpenCV, BGR) and moved to the GPU. nvJPEG was faster but, under the
    load of two renderers, now and then handed back a frame with blocks of wrong colour; the CPU decode
    is exact, and each frame is decoded only once (the cache keeps it)."""
    data = np.fromfile(path, np.uint8)
    full = cv2.imdecode(data, cv2.IMREAD_COLOR)
    return torch.from_numpy(full).to(dev).permute(2, 0, 1).contiguous()
DECODE_REDO = 0
REDONE = [0]

class Clip:
    def __init__(self, name):
        self.name = name; self.dir = os.path.join(CLIPS, name)
        J = json.load(open(os.path.join(self.dir, 'stamps.json')))
        self.files = [s[0] for s in J['stamps']]
        self.t = np.array([s[1] / 1000 for s in J['stamps']])
        self.len = self.t[-1]
    def img8(self, i):
        key = (self.name, i)
        if key in _cache:
            _cache.move_to_end(key); return _cache[key]
        path = os.path.join(self.dir, self.files[i])
        x = _decode_checked(path)
        if W < 1920: x = resize(x.float(), x.shape[2] * W // 1920, x.shape[1] * W // 1920).round().clamp(0, 255).to(torch.uint8)
        global _cache_bytes
        _cache[key] = x; _cache_bytes += x.numel()
        while _cache_bytes > CACHE_BYTES:
            _, old = _cache.popitem(last=False); _cache_bytes -= old.numel()
        return x
    def img(self, i): return self.img8(i).float() * (1 / 255)
    def at(self, t, blend=True):
        t = min(max(t, self.t[0]), self.t[-1])
        j = int(np.searchsorted(self.t, t))
        if j <= 0: return self.img(0)
        if j >= len(self.t): return self.img(len(self.t) - 1)
        t0, t1 = self.t[j - 1], self.t[j]; u = (t - t0) / max(1e-6, t1 - t0)
        if not blend or u < 0.15: return self.img(j - 1)
        if u > 0.85: return self.img(j)
        return self.img(j - 1) * (1 - u) + self.img(j) * u
_clips = {}
def clip(name):
    if name not in _clips: _clips[name] = Clip(name)
    return _clips[name]

_cards = {}
def card(name):
    if name not in _cards:
        im = cv2.imread(os.path.join(CARDS, name + '.png'), cv2.IMREAD_UNCHANGED)
        t = torch.from_numpy(im).to(dev).permute(2, 0, 1).float() / 255
        if t.shape[2] != W: t = resize(t, W, H)
        _cards[name] = t
    return _cards[name]

# ---- camera, tilt -----------------------------------------------------------------------
def camera(img, zoom=1.0, cx=0.5, cy=0.5, rot=0.0, dx=0.0, dy=0.0, clamp=True):
    sh, sw = img.shape[1], img.shape[2]
    if zoom == 1.0 and rot == 0 and cx == 0.5 and cy == 0.5 and dx == 0 and dy == 0:
        return img if sw == W else resize(img, W, H)
    half = 0.5 / max(zoom, 1e-3)
    if zoom >= 1 and clamp:
        cx = min(max(cx, half), 1 - half); cy = min(max(cy, half), 1 - half)
    k = zoom * W / sw
    if k < 0.9:   # shrinking: area-resample first so it doesn't alias
        nw, nh = max(2, int(round(sw * k / 0.95))), max(2, int(round(sh * k / 0.95)))
        img = resize(img, nw, nh); sh, sw = nh, nw; k = zoom * W / sw
    M = cv2.getRotationMatrix2D((cx * sw, cy * sh), rot, k)
    M[0, 2] += W / 2 - cx * sw + dx; M[1, 2] += H / 2 - cy * sh + dy
    return _sample(img, _inv_affine(M), sw, sh, 'bicubic', 'reflection' if clamp else 'zeros')

def tilt(img, rx=0.0, ry=0.0, focus=(0.5, 0.5), dof=0.0, over=1.12, fov=38.0):
    f = (W / 2) / math.tan(math.radians(fov / 2))
    hw, hh = W / 2 * over, H / 2 * over
    pts = np.array([[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0]], np.float64)
    a, b = math.radians(rx), math.radians(ry)
    Rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
    Ry = np.array([[math.cos(b), 0, math.sin(b)], [0, 1, 0], [-math.sin(b), 0, math.cos(b)]])
    P = pts @ (Ry @ Rx).T; P[:, 2] += f
    scr = np.stack([P[:, 0] / P[:, 2] * f + W / 2, P[:, 1] / P[:, 2] * f + H / 2], 1).astype(np.float32)
    srcq = np.array([[0, 0], [W, 0], [W, H], [0, H]], np.float32)
    Mh = cv2.getPerspectiveTransform(srcq, scr)
    out = _sample(img, np.linalg.inv(Mh), W, H, 'bilinear', 'zeros', persp=True)
    if dof <= 0: return out
    A = np.c_[scr, np.ones(4)]
    w = np.linalg.lstsq(A, 1 / P[:, 2], rcond=None)[0]
    z = 1 / (w[0] * _xs + w[1] * _ys + w[2])
    zf = 1 / (w[0] * focus[0] * W + w[1] * focus[1] * H + w[2])
    amt = ((z - zf).abs() / f * dof).clamp(0, 2.999).unsqueeze(0)
    lv = [out, gblur(out, 3 * PX), gblur(out, 7 * PX), gblur(out, 14 * PX)]
    res = torch.zeros_like(out)
    for i in range(3): res += lv[i] * (1 - (amt - i).abs()).clamp(0, 1)
    wgt = (amt - 2).clamp(0, 1)
    return res * (1 - wgt) + lv[3] * wgt

# ---- light, grade -------------------------------------------------------------------------
def bloom(img, strength=0.35, thresh=0.55, sigma=18):
    small = resize(img, W // 4, H // 4)
    lum = small.max(0, keepdim=True).values
    bright = small * ((lum - thresh) / (1 - thresh)).clamp(0, 1)
    b = gblur(bright, sigma / 4) * 0.6 + gblur(bright, sigma) * 0.6
    b = resize(b, W, H, 'bilinear')
    return 1 - (1 - img) * (1 - b * strength)

def flash(img, amount, color=(0.80, 0.93, 1.0)):
    if amount <= 0: return img
    c = torch.tensor(color, device=dev).view(3, 1, 1)
    return img * (1 + amount * 2.2 * c) + amount * 0.05

_tone_sh = torch.tensor([0.010, 0.004, -0.004], device=dev).view(3, 1, 1)
_tone_hi = torch.tensor([-0.012, 0.0, 0.014], device=dev).view(3, 1, 1)
_hal_c = torch.tensor([0.15, 0.35, 1.0], device=dev).view(3, 1, 1)
def grade(img, halation=0.22, ca=0.0):
    y = ((img.clamp(0, 1) - 0.015) / 0.985).clamp(0, 1)
    y = y - 0.18 * y * (1 - y) * (2 * y - 1)
    y = 1 - (1 - y).clamp(min=0) ** 1.08
    lum = y.mean(0, keepdim=True)
    y = y + (1 - lum * 3).clamp(0, 1) * _tone_sh + ((lum - 0.55) * 2.5).clamp(0, 1) * _tone_hi
    if halation > 0:
        small = resize(y, W // 4, H // 4)
        hl = (small.max(0, keepdim=True).values - 0.6).clamp(0, 1) * 2
        y = y + resize(gblur(hl, 6 * PX * 4 / 4) * _hal_c, W, H, 'bilinear') * halation
    if ca > 0.0005:
        b = camera(y[0:1].expand(3, -1, -1), 1 + ca, 0.5, 0.5)[0]
        r = camera(y[2:3].expand(3, -1, -1), 1 - ca * 0.6, 0.5, 0.5)[2]
        y = torch.stack([b, y[1], r], 0)
    return y

_vig = None
def vignette(img, strength=0.35):
    global _vig
    if _vig is None:
        r = torch.sqrt(((_xs - W / 2) / (W / 2)) ** 2 + ((_ys - H / 2) / (H / 2)) ** 2) / math.sqrt(2)
        _vig = (1 - (r - 0.35).clamp(0, 1) ** 1.6).unsqueeze(0)
    return img * (1 - strength + strength * _vig)

_gen = torch.Generator(device=dev); _gen.manual_seed(7)
_grain = [torch.randn((1, H, W), device=dev, generator=_gen) for _ in range(6)]
def grain(img, f, amount=0.018): return img + _grain[f % 6] * amount

def letterbox(img, amount):
    if amount <= 0.001: return img
    h = int(round((H - W / 2.39) / 2 * amount))
    if h <= 0: return img
    img = img.clone(); img[:, :h] = 0; img[:, H - h:] = 0
    return img

def put_card(base, name, opacity=1.0, scale=1.0, dx=0.0, dy=0.0, blur=0.0, wipe=None):
    if opacity <= 0.002: return base
    c = card(name)
    if scale != 1.0 or dx or dy:
        M = cv2.getRotationMatrix2D((W / 2, H / 2), 0, scale); M[0, 2] += dx; M[1, 2] += dy
        c = _sample(c, _inv_affine(M), W, H, 'bilinear', 'zeros')
    if blur > 0.3: c = gblur(c, blur)
    a = c[3:4] * opacity
    if wipe is not None:
        u, x0, x1 = wipe
        xs = torch.linspace(0, 1, W, device=dev)
        edge = x0 + (x1 - x0) * u
        a = a * ((edge - xs * (x1 - x0) - x0 + 0.04) / 0.04).clamp(0, 1).view(1, 1, W)
    return base * (1 - a) + c[:3] * a

def card_sweep(img, name, k, opacity):
    """A light band crossing a card's letters at k (0..1)."""
    if not (0 <= k <= 1): return img
    a = card(name)[3:4] * opacity
    xs = torch.linspace(0, 1, W, device=dev).view(1, 1, W)
    band = torch.exp(-((xs - (k * 1.4 - 0.2)) / 0.05) ** 2)
    return img + a * band * 0.55

# ---- render ---------------------------------------------------------------------------------
NVENC = ['-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'vbr', '-cq', '15', '-b:v', '0', '-maxrate', '60M', '-bufsize', '120M', '-profile:v', 'high', '-g', '120', '-bf', '3', '-spatial-aq', '1']
# The intermediate segments: 10-bit HEVC at a constant, very low quantiser (near lossless), so the dark
# gradients aren't quantised to 8 bits until the very end (and then with error diffusion: render_fast).
NVENC10 = ['-c:v', 'hevc_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'constqp', '-qp', '6', '-profile:v', 'main10', '-g', '60', '-bf', '2']
BT709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']
def render(frame_fn, out_path, fps=60, scale=1.0, t0=0.0, t1=None, audio=None, crf=16, preset='slow', venc=None, quiet=False):
    deep = os.environ.get('DEEP', '1') == '1'           # 16 bits a channel out, 10-bit segments
    cmd = [FF, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr48le' if deep else 'bgr24', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-']
    if audio: cmd += ['-ss', f'{t0:.3f}', '-t', f'{t1 - t0:.3f}', '-i', audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k']
    # RGB to YUV with the BT.709 matrix, and said so in the stream: players read untagged HD as BT.709.
    cmd += ['-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int'] + (venc or (NVENC10 if deep else NVENC))
    cmd += ['-pix_fmt', 'p010le' if deep else 'yuv420p'] + BT709 + ['-movflags', '+faststart', out_path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n0, n1 = int(round(t0 * fps)), int(round(t1 * fps))
    tt = time.time()
    _log = []
    prev_small = None
    with torch.inference_mode():
        for f in range(n0, n1):
            img = frame_fn(f / fps, f)
            # Now and then, under sustained load, a frame came out corrupted (blocks of wrong colour) though
            # computing it again gives it clean. A frame that jumps from the last one is computed again: a cut
            # comes out the same twice, a corrupted frame doesn't, and the second (clean) one is kept.
            small = F.interpolate(img.unsqueeze(0).clamp(0, 1), size=(36, 64), mode='area')[0]
            if prev_small is not None and (small - prev_small).abs().mean().item() > 0.035:
                img2 = frame_fn(f / fps, f)
                small2 = F.interpolate(img2.unsqueeze(0).clamp(0, 1), size=(36, 64), mode='area')[0]
                if (small2 - small).abs().mean().item() > 0.008:
                    img3 = frame_fn(f / fps, f)
                    small3 = F.interpolate(img3.unsqueeze(0).clamp(0, 1), size=(36, 64), mode='area')[0]
                    # keep whichever two agree
                    img, small = (img2, small2) if (small3 - small2).abs().mean().item() < 0.008 else (img3, small3)
                    REDONE[0] += 1
            prev_small = small
            if deep:
                out = (img.clamp(0, 1) * 65535 + 0.5).to(torch.int32).permute(1, 2, 0).contiguous().cpu().numpy().astype(np.uint16)
            else:
                out = (img.clamp(0, 1) * 255 + 0.5).to(torch.uint8).permute(1, 2, 0).contiguous().cpu().numpy()
            if os.environ.get('FRAMELOG'): _log.append(out[::8, ::8].reshape(-1, 3).mean(0) / (257 if deep else 1))
            p.stdin.write(out.tobytes())
            if not quiet and (f - n0) % 120 == 0:
                print(f'\r  {f / fps:6.2f}s / {t1:.2f}  ({(f - n0 + 1) / max(time.time() - tt, 1e-3):.1f} fps)', end='', flush=True)
    p.stdin.close(); p.wait(); print()
    if os.environ.get('FRAMELOG'): np.save(out_path + '.means.npy', np.array(_log))
    if REDONE[0]: print(f'  {REDONE[0]} corrupted frames computed again', flush=True)
    if DECODE_REDO: print(f'  {DECODE_REDO} frames decoded again on the CPU (the GPU decode came back wrong)', flush=True)
