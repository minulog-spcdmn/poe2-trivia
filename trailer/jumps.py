"""Find seamless jump points: places where the music before AND after match closely."""
import numpy as np, librosa, sys
y, sr = librosa.load('music/full.wav', sr=22050, mono=True)
hop = 1024                      # ~46 ms
ch = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
mf = librosa.feature.mfcc(y=y, sr=sr, hop_length=hop, n_mfcc=20)[1:]
rms = librosa.feature.rms(y=y, hop_length=hop)
def z(x): return (x - x.mean(1, keepdims=True)) / (x.std(1, keepdims=True) + 1e-6)
X = np.vstack([z(ch) * 1.0, z(mf) * 0.7, z(np.log(rms + 1e-4)) * 1.0])
fps = sr / hop
T = X.shape[1]; t = np.arange(T) / fps
L = int(2.0 * fps)              # 2 s windows before and after
def win(i, sgn):
    a, b = (i - L, i) if sgn < 0 else (i, i + L)
    return X[:, a:b].ravel()
def emb(sgn):
    E = np.stack([win(i, sgn) if L <= i < T - L else np.zeros(X.shape[0] * L) for i in range(T)])
    n = np.linalg.norm(E, axis=1, keepdims=True) + 1e-6
    return E / n
Epre, Epost = emb(-1), emb(+1)
def region(a, b): return np.where((t >= a) & (t < b))[0]
src = region(float(sys.argv[1]), float(sys.argv[2])); dst = region(float(sys.argv[3]), float(sys.argv[4]))
Spre = Epre[src] @ Epre[dst].T; Spost = Epost[src] @ Epost[dst].T
S = np.minimum(Spre, Spost)
flat = np.argsort(S.ravel())[::-1]
seen = []
for k in flat[:400000]:
    i, j = divmod(k, len(dst))
    ti, tj = t[src[i]], t[dst[j]]
    if tj - ti < float(sys.argv[5]) if len(sys.argv) > 5 else False: continue
    if any(abs(ti - a) < 1.5 and abs(tj - b) < 1.5 for a, b in seen): continue
    seen.append((ti, tj))
    print(f'jump {ti:7.2f} -> {tj:7.2f}   pre {Spre[i, j]:.3f} post {Spost[i, j]:.3f}')
    if len(seen) >= 15: break
