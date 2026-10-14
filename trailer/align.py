"""Align a splice a->b: try destination offsets, keep the one whose onsets continue the grid before the seam."""
import numpy as np, librosa, sys
y, sr = librosa.load('music/full.wav', sr=44100, mono=True)
a, b = float(sys.argv[1]), float(sys.argv[2])
P = float(sys.argv[3]) if len(sys.argv) > 3 else 0.1475   # the hat period
def onsets(sig):
    env = librosa.onset.onset_strength(y=sig, sr=sr, hop_length=64)
    return librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=64, units='time', backtrack=False, delta=0.1)
pre = [t - 3 for t in onsets(y[int((a - 3) * sr):int(a * sr)]) if t - 3 > -2.5]
pre = np.array(pre)
# the grid before the seam: phase that best fits
ph = min(np.arange(0, P, 0.0005), key=lambda p: np.mean(((pre - p + P / 2) % P - P / 2) ** 2))
best = None
for d in np.arange(-0.08, 0.0805, 0.001):
    post = onsets(y[int((b + d) * sr):int((b + d + 2.0) * sr)])
    post = post[post < 1.9]
    if len(post) < 4: continue
    err = np.mean(np.abs((post - ph + P / 2) % P - P / 2))
    if best is None or err < best[0]: best = (err, d)
print(f'grid phase {ph:.4f}; best dest shift {best[1]*1000:+.0f} ms (err {best[0]*1000:.1f} ms) -> dest {b + best[1]:.4f}')
