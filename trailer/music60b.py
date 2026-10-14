"""Music for the 60-second cut: track 7.0 s (the bar before the first hit) to the drop's zone roll, a seamless jump
(38.684 -> 189.778, a passage the track repeats) into its last run, ending on the slam's ring-out."""
import numpy as np, scipy.io.wavfile as wf, os
ROOT = os.path.dirname(os.path.abspath(__file__))
SEGS = [(7.0, 52.7162), (194.353, 205.0391), (217.8392, 223.2)]
def T_of(t):
    T = 0.0
    for a, b in SEGS:
        if a <= t <= b: return T + (t - a)
        T += b - a
    raise ValueError(t)
def _old(t):
    return t - SEGS[0][0] if t <= SEGS[0][1] else (SEGS[0][1] - SEGS[0][0]) + (t - SEGS[1][0])
DURATION = sum(b - a for a, b in SEGS)
def build(path):
    sr, x = wf.read(os.path.join(ROOT, 'music', 'full.wav')); x = x.astype(np.float32)
    n = int(0.03 * sr) // 2 * 2; f = np.linspace(0, 1, n)[:, None]
    out = None
    for i, (a, b) in enumerate(SEGS):
        seg = x[int(a * sr) - (n // 2 if i else 0): int(b * sr) + n // 2].copy()
        if out is None: out = seg
        else:
            out[-n:] = out[-n:] * (1 - f) + seg[:n] * f
            out = np.concatenate([out, seg[n:]])
    y = out[:int(DURATION * sr)]
    k = int(1.0 * sr); y[:k] *= np.linspace(0, 1, k)[:, None] ** 2
    k = int(1.6 * sr); y[-k:] *= np.cos(np.linspace(0, np.pi / 2, k))[:, None] ** 2
    wf.write(path, sr, np.clip(y, -32768, 32767).astype(np.int16))
if __name__ == '__main__':
    build(os.path.join(ROOT, 'music', 'cut60b.wav')); print('duration', DURATION)
