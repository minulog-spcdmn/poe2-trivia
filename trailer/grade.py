"""The trailer's grade, per shot (GPU, display-referred BGR (3, H, W)), applied after look2's colour.

Measured by grade_measure.py into grade.json: for each shot, where its black (p1), midtone (p50) and
peak (p99.5) luma fall, and its colour cast. Each shot gets a tone curve on luma through those points to
common targets (blacks lifted out of the crush, midtones brought up for small screens, dull peaks brought
toward white) and part of the way to a common white balance; the zone cards and the title keep their
own colour. Then a colour for each chapter, on the backdrop only (the UI's sharp detail is keyed out
and stays as it is), and the sharpening on the UI only."""
import json, os
import numpy as np, torch
from scipy.interpolate import PchipInterpolator
import gengine as G
from gengine import dev, PX

LUMA = torch.tensor([0.0722, 0.7152, 0.2126], device=dev).view(3, 1, 1)
# (from, to, BGR multipliers): the intro warm gold, the Delve features a touch cooler, the dynamite hot
CHAPTERS = [(0.0, 22.813, (0.97, 1.0, 1.025)), (31.684, 45.716, (1.025, 1.0, 0.985)), (45.716, 53.871, (0.96, 1.0, 1.03))]

class Grade:
    def __init__(self, path, shots, enabled=True):
        self.on = enabled and os.path.exists(path)
        self.data = json.load(open(path)) if self.on else {}
        self.shots = shots
        self._lut = {}
        self.last = None

    def key(self, t):
        for s in reversed(self.shots):
            if s.t0 <= t < s.t1: return f'{s.t0:.3f}'
        return None

    def lut(self, k):
        if k not in self._lut:
            d = self.data[k]
            xs, ys = [0.0], [0.0]
            for a, b in d['curve']:
                if a > xs[-1] + 0.004: xs.append(a); ys.append(max(b, ys[-1] + 0.002))
            xs.append(1.0); ys.append(max(1.0, ys[-1] + 0.002))
            f = PchipInterpolator(xs, ys)
            self._lut[k] = (torch.tensor(np.clip(f(np.linspace(0, 1, 1024)), 0, 1.2), device=dev, dtype=torch.float32),
                            torch.tensor(d['wb'], device=dev, dtype=torch.float32).view(3, 1, 1))
        return self._lut[k]

    def apply(self, y, t):
        self.last = y
        if not self.on: return y
        k = self.key(t)
        if k in self.data:
            lut, wb = self.lut(k)
            y = y * wb
            L = (y.clamp(0, 1) * LUMA).sum(0, keepdim=True)
            idx = (L * 1023).clamp(0, 1023)
            i0 = idx.floor().long(); fr = idx - i0
            L2 = lut[i0.clamp(max=1023)] * (1 - fr) + lut[(i0 + 1).clamp(max=1023)] * fr
            # scaled, never added: colour kept, black stays black (an added lift reads as a grey haze);
            # the saturation a lift drains is given back
            gain = (L2 / L.clamp(min=0.006)).clamp(0.5, 3.0)
            y = y * gain
            Ly = (y * LUMA).sum(0, keepdim=True)
            y = Ly + (y - Ly) * (1 + 0.22 * ((gain - 1) / 2).clamp(0, 1))
        return y

    def ui_mask(self, y):
        """Where the UI's sharp detail is (text, frames, icons): high local contrast, spread a little."""
        L = (y.clamp(0, 1) * LUMA).sum(0, keepdim=True)
        hp = (L - G.gblur(L, 3 * PX)).abs()
        m = (hp / 0.035).clamp(0, 1)
        return (G.gblur(m, 4 * PX) * 2.5).clamp(0, 1)

    def chapter(self, y, t, m):
        for a, b, c in CHAPTERS:
            if a <= t < b:
                tint = torch.tensor(c, device=dev).view(3, 1, 1)
                return y * (1 + (tint - 1) * (1 - m))
        return y
