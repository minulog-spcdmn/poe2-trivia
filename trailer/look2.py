"""look2: the trailer's second post chain, and the outro's embers (GPU, BGR (3, H, W) tensors).

Light is handled in linear light (bloom, exposure flashes, halation, vignette), then a filmic
shoulder rolls highlights off toward white instead of clipping them flat, and the colour work
is done on the display image: a gentle luma S-curve that keeps detail in the shadows, cool
shadows and warm highlights, saturation evened out (dull colours lifted, neon ones held
back), a light luma sharpen, film grain fresh every frame, and a dither before 8 bits."""
import math
import numpy as np
import torch
import gengine as G
from gengine import dev, W, H, PX, gblur, resize

# ---- linear light -------------------------------------------------------------------------
def to_lin(x): return x.clamp(0, 1) ** 2.2
def to_disp(x): return x.clamp(0, 1) ** (1 / 2.2)

def bloom(lin, amount=0.16, knee=0.4):
    """Light bleeding from what is bright: three widths, from its brightest parts only."""
    small = resize(lin, W // 4, H // 4)
    m = small.max(0, keepdim=True).values
    b = small * (((m - knee) / (1 - knee)).clamp(0, 1) ** 1.5)
    g = gblur(b, 1.6 * PX) * 0.45 + gblur(b, 5 * PX) * 0.35 + gblur(b, 15 * PX) * 0.2
    return lin + resize(g, W, H, 'bilinear') * amount

def flash(lin, amount, color=(0.80, 0.93, 1.0)):
    """An exposure flash: more light, rolled off by the shoulder rather than clipped."""
    if amount <= 0: return lin
    c = torch.tensor(color, device=dev).view(3, 1, 1)
    return lin * (1 + amount * 4.0 * c) + amount * 0.02 * c

_hal_c = torch.tensor([0.10, 0.30, 1.0], device=dev).view(3, 1, 1)     # BGR: a red-orange fringe
def halation(lin, amount=0.05):
    small = resize(lin, W // 4, H // 4)
    hl = (small.max(0, keepdim=True).values - 0.55).clamp(0, 1) * 2.2
    return lin + resize(gblur(hl, 1.5 * PX), W, H, 'bilinear') * _hal_c * amount

_vig = None
def vignette(lin, strength=0.32):
    global _vig
    if _vig is None:
        r = torch.sqrt(((G._xs - W / 2) / (W / 2)) ** 2 + ((G._ys - H / 2) / (H / 2)) ** 2) / math.sqrt(2)
        _vig = (1 - (r - 0.3).clamp(0, 1) ** 1.8 * 1.25).clamp(0, 1).unsqueeze(0)
    return lin * (1 - strength + strength * _vig)

def shoulder(lin, a=0.7, white=1.0):
    """Linear values up to `a` are kept; above, they roll off toward 1 (and toward white, so a hot
    colour never clips to a flat primary)."""
    m = lin.max(0, keepdim=True).values.clamp(min=1e-6)
    r = 1 - a
    mm = torch.where(m > a, a + r * (1 - torch.exp(-(m - a) / r)), m)
    y = lin * (mm / m)
    w = ((m - a) / (4.0 - a)).clamp(0, 1) ** 0.9 * 0.6 * white
    return y * (1 - w) + mm * w

# ---- the display image ----------------------------------------------------------------------
_luma = torch.tensor([0.0722, 0.7152, 0.2126], device=dev).view(3, 1, 1)   # BGR, Rec. 709
_sh = torch.tensor([0.018, 0.006, -0.010], device=dev).view(3, 1, 1)      # shadows: a cool teal-blue
_hi = torch.tensor([-0.016, 0.002, 0.012], device=dev).view(3, 1, 1)      # highlights: warm gold

def colour(y):
    L = (y * _luma).sum(0, keepdim=True)
    # contrast on luma: a gentle S about 0.42, a toe that keeps the shadows' detail, black at black
    Lc = L.clamp(0, 1)
    s = Lc + 0.24 * Lc * (1 - Lc) * (Lc - 0.4) * 2.2
    s = s + 0.035 * Lc * (1 - Lc) ** 6                          # lift the deepest shadows' detail a little
    y = y * (s / L.clamp(min=1e-4)).clamp(0, 3)
    L = s
    # split tone, weighted to where it shows
    y = y + _sh * ((0.35 - L) / 0.35).clamp(0, 1) * (L * 6).clamp(0, 1) + _hi * ((L - 0.5) / 0.5).clamp(0, 1)
    # saturation: dull colours a little richer, the most saturated held back
    c = y - L
    sat = c.abs().max(0, keepdim=True).values / L.clamp(min=0.04).sqrt().clamp(max=1)
    g = 1.12 - 0.3 * sat.clamp(0, 1)
    # the deepest shadows near neutral: rich black, not brown mud, for the gold to stand on
    g = g * (0.72 + 0.28 * ((L - 0.02) / 0.14).clamp(0, 1))
    return L + c * g

def sharpen(y, amount=0.32, sigma=1.1):
    L = (y * _luma).sum(0, keepdim=True)
    return y + (L - gblur(L, sigma * PX)) * amount

def ca(y, amount):
    if amount <= 0.0005: return y
    b = G.camera(y[0:1].expand(3, -1, -1), 1 + amount, 0.5, 0.5)[0]
    r = G.camera(y[2:3].expand(3, -1, -1), 1 - amount * 0.6, 0.5, 0.5)[2]
    return torch.stack([b, y[1], r], 0)

_gen = torch.Generator(device=dev)
def grain(y, f, amount=0.010):
    """Film grain, new every frame, a little soft, strongest in the mid-tones; then a dither."""
    _gen.manual_seed(1000 + f)
    n = gblur(torch.randn((1, H, W), device=dev, generator=_gen), 0.65 * PX)
    L = (y * _luma).sum(0, keepdim=True).clamp(0, 1)
    y = y + n * amount * (0.35 + 2.6 * L * (1 - L))
    # a dither, one step of the output's depth (10 bits when the pipeline runs deep: gengine.render)
    q = 1023 if __import__('os').environ.get('DEEP', '1') == '1' else 255
    return y + (torch.rand((1, H, W), device=dev, generator=_gen) - torch.rand((1, H, W), device=dev, generator=_gen)) / q

# ---- embers ---------------------------------------------------------------------------------
class Embers:
    """Embers rising through the outro: they brighten and lift on every hit, and the strongest hits
    throw a burst of sparks out from behind the logo."""
    def __init__(self, hits, t0, n=190, seed=5):
        self.hits = [(t, s) for t, s in hits if t >= t0 - 0.01]
        self.t0 = t0
        r = np.random.default_rng(seed)
        self.x0 = r.uniform(-0.05, 1.05, n); self.ph = r.uniform(0, 1, n); self.v = r.uniform(0.05, 0.13, n)
        self.dr = r.uniform(0.005, 0.03, n); self.df = r.uniform(0.1, 0.4, n); self.fl = r.uniform(4, 11, n)
        self.react = r.uniform(0.5, 1.4, n); self.warm = r.uniform(0, 1, n)
        k = r.uniform(0, 1, n)
        self.cls = np.where(k < 0.5, 0, np.where(k < 0.86, 1, 2))      # sharp, soft, out of focus
        self.b = np.where(self.cls == 0, r.uniform(0.35, 0.7, n), np.where(self.cls == 1, r.uniform(0.3, 0.6, n), r.uniform(0.12, 0.25, n)))
        # bursts: for each strong hit, sparks from the logo
        self.bursts = []
        for t, s in self.hits:
            if s < 1.85: continue
            m = int(26 + 18 * min(1.0, (s - 1.85) / 1.5))
            a = r.uniform(0, 2 * math.pi, m); sp = r.uniform(0.18, 0.55, m) * (0.8 + 0.25 * s)
            self.bursts.append((t, r.uniform(0.32, 0.68, m), r.uniform(0.44, 0.56, m), np.cos(a) * sp * 0.6, np.sin(a) * sp - 0.12,
                                r.uniform(0.6, 1.4, m), r.uniform(0.6, 1.0, m)))

    def energy(self, T):
        e = 0.0; lift = 0.0
        for t, s in self.hits:
            if T >= t:
                e += s * math.exp(-(T - t) / 0.28); lift += s * 0.28 * (1 - math.exp(-(T - t) / 0.28))
        return e, lift

    def render(self, T):
        """Their light (linear, BGR), to add to the background."""
        e, lift = self.energy(T)
        k = T - self.t0
        age = (k * self.v + self.ph) % 1.0
        ys = 1.12 - age * 1.3 - lift * 0.012 * self.react
        xs = self.x0 + self.dr * np.sin(2 * math.pi * (self.df * k + self.ph)) + 0.03 * age
        life = np.sin(math.pi * age) ** 0.6
        fl = 0.75 + 0.25 * np.sin(self.fl * k + self.ph * 40)
        br = self.b * life * fl * (1 + 0.9 * e * self.react)
        warm = self.warm
        col = np.stack([0.01 + 0.04 * warm, 0.12 + 0.30 * warm, np.ones_like(warm)], 0)   # BGR: ember red-orange to amber
        out = torch.zeros((3, H, W), device=dev)
        for c, sig in ((0, 0.9), (1, 2.6), (2, 9.0)):
            m = self.cls == c
            out += gblur(self._splat(xs[m], ys[m], br[m], col[:, m]), sig * PX) * (2 * math.pi * (sig * PX) ** 2 if c < 2 else 60.0)
        for t, bx, by, vx, vy, bs, bb in self.bursts:
            u = T - t
            if not (0 <= u < 1.6): continue
            d = (1 - math.exp(-u * 3.2)) / 3.2                                       # drag
            px = bx + vx * d; py = by + vy * d + 0.05 * u * u
            a = bb * math.exp(-u / 0.45) * (1.6 if u < 0.06 else 1.0)
            cb = np.stack([np.full_like(bb, 0.08), np.full_like(bb, 0.45), np.ones_like(bb)], 0)
            out += gblur(self._splat(px, py, a * np.ones_like(bb), cb), 1.5 * PX) * (2 * math.pi * (1.5 * PX) ** 2) * 2.6
            out += gblur(self._splat(px, py, a * np.ones_like(bb), cb), 7 * PX) * 6.0
        return out

    def _splat(self, xs, ys, br, col):
        """Bilinear points of light into a (3, H, W) buffer."""
        buf = torch.zeros((3, H * W), device=dev)
        if len(xs) == 0: return buf.view(3, H, W)
        x = torch.tensor(xs * W, device=dev, dtype=torch.float32); y = torch.tensor(ys * H, device=dev, dtype=torch.float32)
        b = torch.tensor(br, device=dev, dtype=torch.float32); c = torch.tensor(col, device=dev, dtype=torch.float32)
        x0 = x.floor(); y0 = y.floor(); fx = x - x0; fy = y - y0
        for dx, dy, w in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
            xi = (x0 + dx).long(); yi = (y0 + dy).long()
            ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
            idx = (yi * W + xi)[ok]
            for ch in range(3):
                buf[ch].index_add_(0, idx, (b * w * c[ch])[ok])
        return buf.view(3, H, W)
