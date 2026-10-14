"""Cut 3's music: three seamless jumps along repeats in the track."""
import numpy as np, scipy.io.wavfile as w, os, json
SEGS = [(0.0, 43.8708), (53.3156, 61.8953), (71.3610, 81.6961), (176.0867, 224.4)]
XF = 0.03
def T_of(t):
    T = 0.0
    for a, b in SEGS:
        if a <= t <= b: return T + (t - a)
        T += b - a
    raise ValueError(t)
DURATION = sum(b - a for a, b in SEGS)
def build(path):
    sr, x = w.read(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'music', 'full.wav'))
    x = x.astype(np.float32)
    out = []; n = int(XF * sr) // 2 * 2
    for k, (a, b) in enumerate(SEGS):
        seg = x[int(a * sr) - (n // 2 if k else 0): int(b * sr) + n // 2].copy()
        if out:
            fade = np.linspace(0, 1, n)[:, None]
            prev = out[-1]
            prev[-n:] = prev[-n:] * (1 - fade) + seg[:n] * fade
            seg = seg[n:]
        out.append(seg)
    y = np.concatenate(out)
    f = int(1.2 * sr); y[-f:] *= np.linspace(1, 0, f)[:, None] ** 2
    w.write(path, sr, np.clip(y, -32768, 32767).astype(np.int16))
if __name__ == '__main__':
    build(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'music', 'trailer3.wav'))
    print('duration', DURATION)
