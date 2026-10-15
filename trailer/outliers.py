"""outliers.py video fps : frames unlike both neighbours while those agree (a one-frame glitch)."""
import subprocess, sys, os, numpy as np, cv2
FF = os.path.abspath('bin/ffmpeg.exe')
v, fps = sys.argv[1], float(sys.argv[2])
p = subprocess.run([FF, '-loglevel', 'error', '-i', v, '-vf', 'scale=160:90', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True)
a = np.frombuffer(p.stdout, np.uint8).reshape(-1, 90, 160, 3).astype(np.float32)
d = lambda i, j: np.abs(a[i] - a[j]).mean()
out = []
for i in range(1, len(a) - 1):
    dp, dn, pn = d(i, i - 1), d(i, i + 1), d(i - 1, i + 1)
    if dp > 8 and dn > 8 and pn < 0.45 * min(dp, dn): out.append((round(i / fps, 3), round(dp, 1), round(pn, 1)))
print(os.path.basename(v), len(a), 'frames; outliers:', out)
if out:
    i = int(round(out[0][0] * fps)); cv2.imwrite('outlier.jpg', np.hstack([a[i - 1], a[i], a[i + 1]]).astype(np.uint8))
