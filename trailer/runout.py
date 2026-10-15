"""The reel running out, at the end of the trailer (GPU, display-referred BGR (3, H, W) tensors).

On the film's own 24 frames a second: a changeover cue mark flashes top right; the projector starts to
struggle (more weave and flicker, dust and scratches); the frame slips in the gate once, its frame line
rolling through; the last frames flash, fogged by a light leak from the edge; the clear tail leader's
white light flickers with dust; the lamp goes out. Also the sound of the tail flapping in the gate."""
import math
import numpy as np, cv2, torch
import torch.nn.functional as F
import gengine as G
from gengine import dev, W, H, PX

def smooth(u): u = min(1.0, max(0.0, u)); return u * u * (3 - 2 * u)
def ramp(t, a, b): return smooth((t - a) / (b - a))

class Runout:
    def __init__(self, cue, shaky, slip, flash, leader, dark):
        self.cue, self.shaky, self.slip, self.flash, self.leader, self.dark = cue, shaky, slip, flash, leader, dark
        r = np.random.default_rng(11)
        # fractal noise, for the cue mark's ragged edge
        def fbm(h, w, seed):
            g = np.random.default_rng(seed); acc = np.zeros((h, w), np.float32); amp = 1.0; tot = 0.0
            for o in range(6):
                n = g.standard_normal((max(2, h >> (5 - o)), max(2, w >> (5 - o)))).astype(np.float32)
                acc += cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC) * amp; tot += amp; amp *= 0.55
            acc /= tot; return (acc - acc.mean()) / (acc.std() + 1e-6)
        self.n2 = torch.from_numpy(fbm(270, 480, 8)).to(dev)[None, None]
        ys, xs = G._ys / H, G._xs / W
        self.vig = (1 - ((torch.sqrt(((xs - 0.5) * 1.6) ** 2 + ((ys - 0.5) * 1.7) ** 2) - 0.55).clamp(0, 1) * 1.6).clamp(0, 1)).unsqueeze(0)
        self._dust = {}

    def _up(self, n, shift=(0.0, 0.0)):
        x = n
        if shift != (0.0, 0.0):
            th = torch.tensor([[[1, 0, shift[0]], [0, 1, shift[1]]]], device=dev, dtype=torch.float32)
            x = F.grid_sample(n, F.affine_grid(th, n.shape, align_corners=False), mode='bilinear', padding_mode='reflection', align_corners=False)
        return F.interpolate(x, size=(H, W), mode='bilinear', align_corners=False)[0]

    def dust(self, fr, amount):
        """One film frame's dirt: specks, hairs and scratches (dark on the print, a few bright)."""
        key = (fr, round(amount, 2))
        if key in self._dust: return self._dust[key]
        g = np.random.default_rng(1000 + fr)
        m = np.zeros((H, W), np.float32)                   # >0 darkens, <0 brightens
        for _ in range(int(8 * amount)):
            x, y, rr = int(g.uniform(0, W)), int(g.uniform(0, H)), g.uniform(0.8, 3.2) * PX
            cv2.circle(m, (x, y), max(1, int(rr)), float(g.choice([0.85, 0.85, -0.6])), -1, cv2.LINE_AA)
        for _ in range(int(0.5 * amount + g.uniform(0, 0.8))):                  # a hair now and then
            x, y = g.uniform(0, W), g.uniform(0, H); pts = []
            a = g.uniform(0, 2 * math.pi); L = g.uniform(30, 120) * PX
            for k in range(14):
                a += g.normal(0, 0.35); x += math.cos(a) * L / 14; y += math.sin(a) * L / 14; pts.append((x, y))
            cv2.polylines(m, [np.int32(pts)], False, 0.9, max(1, int(1.2 * PX)), cv2.LINE_AA)
        for _ in range(int(1 + amount * 1.5)):                                  # scratches running down the print
            x = g.uniform(0.05, 0.95) * W; w = g.uniform(0.8, 1.6) * PX; s = g.choice([0.55, -0.45])
            cv2.line(m, (int(x), 0), (int(x + g.normal(0, 6)), H), float(s), max(1, int(w)), cv2.LINE_AA)
        t = torch.from_numpy(cv2.GaussianBlur(m, (0, 0), 0.7 * PX)).to(dev).unsqueeze(0)
        if len(self._dust) > 64: self._dust.clear()
        self._dust[key] = t; return t

    def apply(self, y, t):
        """The finished frame y at t."""
        if t < self.cue: return y
        fr = int(math.floor(t * 24))
        g = np.random.default_rng(fr)
        # the changeover cue: a ragged white circle, top right, four film frames
        if self.cue <= t < self.cue + 4 / 24:
            yy, xx = G._ys, G._xs
            r = torch.sqrt((xx - 0.885 * W) ** 2 + (yy - 0.22 * H) ** 2) / (0.052 * H)
            edge = r + 0.12 * self._up(self.n2)[0] * 0.5
            c = ((1.0 - edge) / 0.1).clamp(0, 1).unsqueeze(0)
            ring = torch.exp(-((edge - 1.0) / 0.12) ** 2).unsqueeze(0) * 0.35
            y = y * (1 - c) * (1 - ring) + torch.tensor([0.9, 0.96, 0.98], device=dev).view(3, 1, 1) * c
        k = ramp(t, self.shaky, self.flash)
        # the projector struggling: the frame jumps, the light flickers
        if k > 0:
            jx, jy = g.normal(0, 1.4 * k) * PX, g.normal(0, 2.2 * k) * PX
            y = G.camera(y, 1.0, 0.5, 0.5, 0.0, jx, jy, clamp=False)
            y = y * (1 + g.normal(0, 0.05 * k))
        # the frame slips: the image rolls up, its frame line passing through, and the gate catches it
        if self.slip <= t < self.slip + 0.2:
            u = (t - self.slip) / 0.2; off = int(H * 0.42 * math.sin(math.pi * u) ** 0.8)
            y = torch.roll(y, -off, dims=1)
            line = int(0.055 * H); s0 = (H - off) % H
            y[:, max(0, s0 - line // 2):min(H, s0 + line // 2)] *= 0.04
        # the end of the picture: the last frames flash, overexposed, fogged by a light leak from the edge
        if t >= self.flash:
            u = ramp(t, self.flash, self.leader) ** 1.3
            xs = G._xs / W
            leak = torch.exp(-xs / 0.32).unsqueeze(0) * torch.tensor([0.12, 0.42, 1.0], device=dev).view(3, 1, 1)
            y = y * (1 + 2.2 * u) + leak * (1.3 * u) + 0.35 * u * u
        # the clear leader: the lamp's light through nothing, flickering, with dirt
        if t >= self.leader:
            fl = 0.78 + 0.22 * g.uniform()
            lead = torch.tensor([0.9, 0.97, 1.0], device=dev).view(3, 1, 1) * fl * (0.8 + 0.2 * self.vig)
            u = ramp(t, self.leader, self.leader + 0.08)
            y = y * (1 - u) + lead * u
        # dirt on every film frame from the struggle on
        if k > 0 or t >= self.flash:
            amt = 0.6 + 1.6 * k + (1.2 if t >= self.leader else 0.0)
            m = self.dust(fr, amt)
            y = y * (1 - m.clamp(min=0)) + (-m).clamp(min=0) * 0.9
        # the lamp goes out
        if t >= self.dark:
            y = y * max(0.0, 1 - (t - self.dark) / 0.06)
        return y

def flap_sound(sr, t_start, t_flash, t_leader, t_dark, length):
    """The projector: a soft whirr as it struggles, the tail slapping
    round on every frame once the film has run through, stopping as the lamp goes out."""
    n = int(length * sr); y = np.zeros((n, 2), np.float32); g = np.random.default_rng(5)
    def burst(at, dur, gain, hp):
        i = int(at * sr); m = int(dur * sr)
        if i >= n: return
        b = g.standard_normal(m).astype(np.float32) * np.exp(-np.linspace(0, 6, m))
        b = b - np.convolve(b, np.ones(hp) / hp, 'same')                  # high-passed: a dry click
        j = min(n, i + m); y[i:j] += (b[:j - i] * gain)[:, None]
    # the whirr: a 24 Hz flutter of quiet clicks, rising
    t = t_start
    while t < t_dark:
        k = min(1.0, (t - t_start) / max(0.01, t_flash - t_start))
        burst(t, 0.012, 0.012 + 0.03 * k, 6); t += 1 / 24
    t = t_leader
    while t < t_dark:                                                      # the tail slapping round
        burst(t, 0.025, 0.12 * (0.8 + 0.4 * g.uniform()), 4); t += 1 / 24
    return y
