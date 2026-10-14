"""Music for the 60-second cut: track 7.0 s (the bar before the first hit) to the drop's zone roll, a seamless jump
(38.684 -> 189.778, a passage the track repeats) into its last run, ending on the slam's ring-out."""
import numpy as np, scipy.io.wavfile as wf, os
ROOT = os.path.dirname(os.path.abspath(__file__))
SEGS = [(7.0, 52.7162), (194.417, 205.0391), (217.8392, 223.2)]
XFS = [0.03, 0.25]
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
    out = None
    for i, (a, b) in enumerate(SEGS):
        n = int(XFS[i - 1] * sr) // 2 * 2 if i else 0
        seg = x[int(a * sr) - n // 2: int(b * sr) + int(0.3 * sr)].copy()
        if out is None: out = seg[:int((b - a) * sr) + int(0.3 * sr)]
        else:
            keep = len(out) - int(0.3 * sr)               # out runs 0.3 s past its cut point
            u = np.linspace(0, np.pi / 2, n)[:, None]     # equal power
            tail = out[keep - n // 2: keep + n // 2]
            mixed = tail * np.cos(u) + seg[:n] * np.sin(u)
            out = np.concatenate([out[:keep - n // 2], mixed, seg[n:]])
    y = out[:int(DURATION * sr)]
    k = int(1.0 * sr); y[:k] *= np.linspace(0, 1, k)[:, None] ** 2
    k = int(1.6 * sr); y[-k:] *= np.cos(np.linspace(0, np.pi / 2, k))[:, None] ** 2
    wf.write(path, sr, np.clip(y, -32768, 32767).astype(np.int16))
if __name__ == '__main__':
    build(os.path.join(ROOT, 'music', 'cut60c.wav')); print('duration', DURATION)
