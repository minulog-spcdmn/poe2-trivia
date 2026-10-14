"""Transitions across a cut, on the GPU, for the 60 s cut's frame (edit60h).

Each is centred on a cut between two shots and drawn from both: the outgoing shot held on its last
frame past the cut, the incoming on its first before it (a few frames either side; under the
transition's light or blur a hold doesn't show).
  light  a dissolve through light: the two mixed in linear light while the exposure swells, and a
         glow at a focus point (the thing that changes, as a streak's flames) blooming and fading
  whip   a whip pan: the outgoing shot flung out one way and the incoming in from the other side,
         both smeared along the move
  zoom   a zoom through: the outgoing rushing in on a point, the incoming settling out of the rush,
         both smeared outward from it
  dip    a breath of black between the two"""
import math
import torch
import gengine as G
from gengine import dev, W, H, PX

def smooth(u): u = min(1.0, max(0.0, u)); return u * u * (3 - 2 * u)

def shift(img, dx, dy=0.0):
    return G.camera(img, 1.0, 0.5, 0.5, 0.0, dx, dy, clamp=False)

def _box(img, L, dim):
    """An exact box blur L px long along dim (2: across, 1: down): a running sum, so any length is smooth."""
    L = int(round(L))
    if L < 2: return img
    p = L // 2
    x = torch.nn.functional.pad(img.unsqueeze(0), (p, L - p, 0, 0) if dim == 2 else (0, 0, p, L - p), mode='replicate')[0]
    c = torch.cumsum(x, dim=dim)
    c = torch.nn.functional.pad(c, (1, 0, 0, 0) if dim == 2 else (0, 0, 1, 0))
    n = img.shape[dim]
    a = c.narrow(dim, L, n) - c.narrow(dim, 0, n)
    return a / L

def smear(img, dx, dy=0.0):
    """Motion blur along the move (whips run straight across or down)."""
    if abs(dx) >= 2: img = _box(_box(img, abs(dx) * 0.6, 2), abs(dx) * 0.6, 2)
    if abs(dy) >= 2: img = _box(_box(img, abs(dy) * 0.6, 1), abs(dy) * 0.6, 1)
    return img

def rush(img, amount, cx=0.5, cy=0.5, n=18):
    """Radial blur outward from (cx, cy): copies scaled from 1 to 1 + amount, averaged."""
    if amount < 0.004: return img
    acc = torch.zeros_like(img)
    for k in range(n):
        acc += G.camera(img, 1 + amount * k / (n - 1), cx, cy, 0.0, 0.0, 0.0, clamp=False)
    return acc / n

def glow_at(fx, fy, radius, color):
    r = torch.sqrt((G._xs - fx * W) ** 2 + (G._ys - fy * H) ** 2) / (radius * W)
    c = torch.tensor(color, device=dev).view(3, 1, 1)
    return torch.exp(-r * r).unsqueeze(0) * c

class Cut:
    def __init__(self, t, kind, d, **kw):
        self.t, self.kind, self.d, self.kw = t, kind, d, kw

def apply(cut, T, a_img, b_img):
    """The frame at T within `cut` (|T - cut.t| < its reach), from a_img (the outgoing shot at T, held)
    and b_img (the incoming, held); both display-referred (3, H, W)."""
    k, d = cut.kind, cut.d
    if k == 'light':
        u = (T - (cut.t - d / 2)) / d
        e = math.sin(math.pi * min(1, max(0, u)))
        la, lb = a_img.clamp(0, 1) ** 2.2, b_img.clamp(0, 1) ** 2.2
        lin = la * (1 - smooth(u)) + lb * smooth(u)
        lin = lin * (1 + cut.kw.get('gain', 0.9) * e)
        fx, fy = cut.kw.get('focus', (0.5, 0.5))
        lin = lin + glow_at(fx, fy, cut.kw.get('radius', 0.12), cut.kw.get('color', (0.35, 0.7, 1.0))) * e * cut.kw.get('glow', 0.6)
        return lin.clamp(0, 4) ** (1 / 2.2)
    if k == 'ignite':
        # a hard cut on the beat everywhere but around the focus, where the two dissolve through a burst of light
        u = (T - (cut.t - d / 2)) / d
        e = math.sin(math.pi * min(1, max(0, u)))
        fx, fy = cut.kw.get('focus', (0.5, 0.5))
        rad = cut.kw.get('radius', 0.1)
        r = torch.sqrt((G._xs - fx * W) ** 2 + ((G._ys - fy * H) * cut.kw.get('aspect', 1.8)) ** 2) / (cut.kw.get('mask', 0.16) * W)
        m = torch.exp(-r * r).unsqueeze(0)
        wgt = m * smooth(u) + (1 - m) * (1.0 if T >= cut.t else 0.0)
        la, lb = a_img.clamp(0, 1) ** 2.2, b_img.clamp(0, 1) ** 2.2
        lin = la * (1 - wgt) + lb * wgt
        lin = lin * (1 + cut.kw.get('gain', 0.8) * e * (0.15 + 0.85 * m))
        lin = lin + glow_at(fx, fy, rad, cut.kw.get('color', (0.35, 0.7, 1.0))) * e * cut.kw.get('glow', 0.8)
        return lin.clamp(0, 4) ** (1 / 2.2)
    if k == 'whip':
        dirx, diry = cut.kw.get('dir', (-1.0, 0.0))
        span = cut.kw.get('span', 0.3) * W
        if T < cut.t:
            u = (T - (cut.t - d)) / d; p = u ** 2.4
            off = p * span; v = 2.4 * u ** 1.4 * span / (d * 60)
            # the camera leans into the move as it goes: a push in that gathers with the whip
            a_img = G.camera(a_img, 1 + 0.07 * p, 0.5, 0.5, 0.0, 0.0, 0.0, clamp=False)
            return smear(shift(a_img, dirx * off, diry * off), dirx * v * 2.2, diry * v * 2.2)
        u = (T - cut.t) / d; p = (1 - u) ** 2.4
        off = p * span; v = 2.4 * (1 - u) ** 1.4 * span / (d * 60)
        return smear(shift(b_img, -dirx * off, -diry * off), dirx * v * 2.2, diry * v * 2.2)
    if k == 'zoom':
        cx, cy = cut.kw.get('focus', (0.5, 0.5))
        if T < cut.t:
            u = (T - (cut.t - d)) / d; p = u ** 2.2
            img = G.camera(a_img, 1 + p * cut.kw.get('into', 0.9), cx, cy, 0.0, 0.0, 0.0, clamp=False)
            return rush(img, p * 0.35, 0.5, 0.5)
        u = (T - cut.t) / d; p = (1 - u) ** 2.2
        img = G.camera(b_img, 1 + p * 0.35, 0.5, 0.5, 0.0, 0.0, 0.0, clamp=False)
        return rush(img, p * 0.3, 0.5, 0.5)
    if k == 'dip':
        u = abs(T - cut.t) / d
        return (a_img if T < cut.t else b_img) * smooth(u)
    return b_img if T >= cut.t else a_img

def reach(cut):
    return (cut.d / 2, cut.d / 2) if cut.kind in ('light', 'ignite') else (cut.d, cut.d)
