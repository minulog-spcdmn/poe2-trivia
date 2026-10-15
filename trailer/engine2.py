"""Compositor v2: camera with momentum and settle, 3D tilt with depth of field,
speed ramps with motion blur, glimpses, letterbox, film grade."""
import math, os, functools
import numpy as np, cv2
from engine import (W, H, PX, ROOT, CLIPS, CARDS, FF, clip, card, camera, motion_blur, zoom_blur, bloom,
                    put_card, vignette, grain, flash, shake, clamp01, smooth, ease_out, ease_in, ease_io, lerp, render)

# ---- the music ----------------------------------------------------------------
SPLICE_A = 61.10      # the drop's bass gap, before its bar 16
SPLICE_B = 201.26     # the ending's stop, as far before its hit (201.65) as 61.10 is before 61.49
END_T = 224.4
XF = 0.12
def T_of(track_t):
    return track_t if track_t <= SPLICE_A else SPLICE_A + (track_t - SPLICE_B)
DURATION = T_of(END_T)
DROP = 33.20
BEAT = 0.4420
def bar(k): return DROP + 4 * BEAT * k          # bars from the drop
def beat(n): return DROP + BEAT * n

def build_audio(path):
    import subprocess
    src = os.path.join(ROOT, 'music', 'full.wav')
    fc = (f"[0:a]atrim=0:{SPLICE_A + XF / 2},asetpts=PTS-STARTPTS[a];"
          f"[0:a]atrim={SPLICE_B - XF / 2}:{END_T},asetpts=PTS-STARTPTS[b];"
          f"[a][b]acrossfade=d={XF}:c1=qsin:c2=qsin,afade=t=out:st={DURATION - 1.2:.3f}:d=1.2[o]")
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-filter_complex', fc, '-map', '[o]', '-c:a', 'pcm_s16le', path], check=True)

# ---- shots ----------------------------------------------------------------------
def kv(v, u, e=ease_io):
    """A value or a (start, end) pair at u."""
    if isinstance(v, tuple): return lerp(v[0], v[1], e(u))
    return v

class Shot:
    def __init__(self, t0, t1, clip_name, src, speed=1.0, ramp=None, z=1.0, x=0.5, y=0.5, rot=0.0, ease='io',
                 settle=0.0, settle_tc=0.18, hand=0.0, tilt=None, dim=1.0, blur=0.0, tin=None, glimpse=False, mblur=True):
        self.__dict__.update(locals()); del self.__dict__['self']
        self._table = None; self.clip = clip_name
    def ease_fn(self):
        return {'io': ease_io, 'out': lambda u: ease_out(u, 3), 'lin': lambda u: u, 'in': lambda u: ease_in(u, 2), 'sine': lambda u: 0.5 - 0.5 * math.cos(math.pi * clamp01(u))}[self.ease]
    def src_at(self, T):
        """Clip time at trailer time T: a start plus the integral of the speed (a ramp: [(sec, speed), ...])."""
        dt = T - self.t0
        if not self.ramp: return self.src + dt * self.speed
        if self._table is None:
            n = int((self.t1 - self.t0 + 1.0) * 1000) + 2
            ts = np.arange(n) / 1000.0
            ks = np.array(self.ramp)
            sp = np.interp(ts, ks[:, 0], ks[:, 1])
            self._table = (ts, np.concatenate([[0], np.cumsum(sp[:-1]) / 1000.0]))
        ts, acc = self._table
        return self.src + float(np.interp(dt, ts, acc))
    def speed_at(self, T):
        if not self.ramp: return self.speed
        ks = np.array(self.ramp)
        return float(np.interp(T - self.t0, ks[:, 0], ks[:, 1]))

SK = []   # shakes (T, amp px, decay)
PU = []   # zoom punches (T, amount, decay)
FL = []   # flashes (T, amount, decay, BGR)
CA = []   # chromatic aberration hits (T, amount, decay)

def env(events, T, pre=0.0):
    v = 0.0
    for e in events:
        t, a, d = e[0], e[1], e[2]
        if 0 <= T - t < d * 5: v += a * math.exp(-(T - t) / d)
        elif pre and 0 <= t - T < pre: v += a * (1 - (t - T) / pre) ** 3 * 0.35
    return v

def handheld(T, amp, seed=3):
    if amp <= 0: return 0.0, 0.0, 0.0
    r = np.random.default_rng(seed); ph = r.random(6) * 6.283
    dx = amp * (0.6 * math.sin(T * 0.9 + ph[0]) + 0.3 * math.sin(T * 2.1 + ph[1]) + 0.1 * math.sin(T * 5.3 + ph[2]))
    dy = amp * (0.6 * math.sin(T * 0.7 + ph[3]) + 0.3 * math.sin(T * 1.9 + ph[4]) + 0.1 * math.sin(T * 4.7 + ph[5]))
    return dx * PX, dy * PX, amp * 0.012 * math.sin(T * 0.5 + ph[0])

# ---- 3D tilt with depth of field -------------------------------------------------
def tilt(img, rx=0.0, ry=0.0, focus=(0.5, 0.5), dof=0.0, over=1.12, fov=38.0):
    """Lay the frame on a plane turned rx/ry degrees, seen through a lens; blur by distance from the focus."""
    f = (W / 2) / math.tan(math.radians(fov / 2))
    hw, hh = W / 2 * over, H / 2 * over
    pts = np.array([[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0]], np.float64)
    a, b = math.radians(rx), math.radians(ry)
    Rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
    Ry = np.array([[math.cos(b), 0, math.sin(b)], [0, 1, 0], [-math.sin(b), 0, math.cos(b)]])
    P = pts @ (Ry @ Rx).T
    P[:, 2] += f
    scr = np.stack([P[:, 0] / P[:, 2] * f + W / 2, P[:, 1] / P[:, 2] * f + H / 2], 1).astype(np.float32)
    srcq = np.array([[0, 0], [W, 0], [W, H], [0, H]], np.float32)
    M = cv2.getPerspectiveTransform(srcq, scr)
    out = cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0.02, 0.02, 0.025))
    if dof <= 0: return out
    # 1/z is affine across the screen for a plane: fit it from the corners.
    A = np.c_[scr, np.ones(4)]
    w = np.linalg.lstsq(A, 1 / P[:, 2], rcond=None)[0]
    ys, xs = np.mgrid[0:H:8, 0:W:8].astype(np.float32)
    z = 1 / (w[0] * xs + w[1] * ys + w[2])
    zf = 1 / (w[0] * focus[0] * W + w[1] * focus[1] * H + w[2])
    amt = np.abs(z - zf) / f * dof
    amt = cv2.resize(amt.astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
    lv = [out, cv2.GaussianBlur(out, (0, 0), 3 * PX), cv2.GaussianBlur(out, (0, 0), 7 * PX), cv2.GaussianBlur(out, (0, 0), 14 * PX)]
    a3 = np.clip(amt, 0, 2.999)[:, :, None]
    i0 = np.floor(a3)
    res = np.zeros_like(out)
    for i in range(3):
        wgt = np.clip(1 - np.abs(a3 - i), 0, 1) * (a3 < 3)
        res += lv[i] * wgt
    wgt = np.clip(a3 - 2, 0, 1)
    res = res * (1 - wgt) + lv[3] * wgt
    return res

def defocus(img, amount):
    if amount < 0.3: return img
    return cv2.GaussianBlur(img, (0, 0), amount * PX)

# ---- grade -------------------------------------------------------------------------
_lut_x = np.linspace(0, 1, 256)
def _curve(x):
    # gentle S, deep blacks, soft highlight roll-off
    y = np.clip((x - 0.015) / 0.985, 0, 1)
    y = y + 0.18 * y * (1 - y) * (2 * y - 1) * -1.0
    y = 1 - (1 - y) ** 1.08
    return y
_lut = _curve(_lut_x).astype(np.float32)
def grade(img, halation=0.22, ca=0.0):
    img = np.clip(img, 0, 1)
    img = np.interp(img, _lut_x, _lut).astype(np.float32)
    lum = img.mean(axis=2, keepdims=True)
    sh = np.clip(1 - lum * 3, 0, 1)
    img = img + sh * np.array([0.010, 0.004, -0.004], np.float32) * 1.0   # cool, teal-ish shadows (BGR)
    hi = np.clip((lum - 0.55) * 2.5, 0, 1)
    img = img + hi * np.array([-0.012, 0.0, 0.014], np.float32)            # warm highlights
    if halation > 0:
        small = cv2.resize(img, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
        hl = np.clip(small.max(axis=2, keepdims=True) - 0.6, 0, 1) * 2
        hal = cv2.GaussianBlur(hl, (0, 0), 6)[:, :, None] * np.array([0.15, 0.35, 1.0], np.float32)
        img = img + cv2.resize(hal, (W, H), interpolation=cv2.INTER_LINEAR) * halation
    if ca > 0.0005:
        b = camera(img[:, :, 0:1].repeat(3, 2), 1 + ca, 0.5, 0.5)[:, :, 0]
        r = camera(img[:, :, 2:3].repeat(3, 2), 1 - ca * 0.6, 0.5, 0.5)[:, :, 2]
        img = np.stack([b, img[:, :, 1], r], 2)
    return img

def letterbox(img, amount):
    """Bars to 2.39:1 at amount 1."""
    if amount <= 0.001: return img
    h = int(round((H - W / 2.39) / 2 * amount))
    if h <= 0: return img
    img = img.copy(); img[:h] = 0; img[H - h:] = 0
    return img

def black(): return np.zeros((H, W, 3), np.float32)
def gblur(img, s): return cv2.GaussianBlur(img, (0, 0), s) if s >= 0.3 else img
def card_sweep(img, name, k, opacity):
    if not (0 <= k <= 1): return img
    a = card(name)[:, :, 3:4] * opacity
    xs = np.linspace(0, 1, W, dtype=np.float32)[None, :, None]
    return img + a * np.exp(-((xs - (k * 1.4 - 0.2)) / 0.05) ** 2) * 0.55
