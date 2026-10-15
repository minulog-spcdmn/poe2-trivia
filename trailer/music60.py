"""Music for the 60-second cut: track 7.0 s (the bar before the first hit) to the drop's zone roll, a seamless jump
(38.684 -> 189.778, a passage the track repeats) into its last run, ending on the slam's ring-out."""
import numpy as np, scipy.io.wavfile as wf, os
ROOT = os.path.dirname(os.path.abspath(__file__))
SEGS = [(7.0, 38.6841), (189.7777, 219.9)]
def T_of(t):
    return t - SEGS[0][0] if t <= SEGS[0][1] else (SEGS[0][1] - SEGS[0][0]) + (t - SEGS[1][0])
DURATION = sum(b - a for a, b in SEGS)
def build(path):
    sr, x = wf.read(os.path.join(ROOT, 'music', 'full.wav')); x = x.astype(np.float32)
    n = int(0.03 * sr) // 2 * 2
    a = x[int(SEGS[0][0] * sr): int(SEGS[0][1] * sr) + n // 2].copy()
    b = x[int(SEGS[1][0] * sr) - n // 2: int(SEGS[1][1] * sr)].copy()
    f = np.linspace(0, 1, n)[:, None]; a[-n:] = a[-n:] * (1 - f) + b[:n] * f
    y = np.concatenate([a, b[n:]])
    k = int(1.0 * sr); y[:k] *= np.linspace(0, 1, k)[:, None] ** 2           # in from silence
    k = int(2.4 * sr); y[-k:] *= np.cos(np.linspace(0, np.pi / 2, k))[:, None] ** 2   # the slam rings out
    wf.write(path, sr, np.clip(y, -32768, 32767).astype(np.int16))
if __name__ == '__main__':
    build(os.path.join(ROOT, 'music', 'cut60.wav')); print('duration', DURATION)
