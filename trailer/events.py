"""Per clip: the moments where the picture jumps (bursts, flashes, cuts in the UI). Prints the top peaks."""
import json, os, sys
import numpy as np, cv2
ROOT = os.path.dirname(os.path.abspath(__file__))
names = sys.argv[1:]
out = {}
for n in names:
    d = os.path.join(ROOT, 'clips', n)
    st = json.load(open(os.path.join(d, 'stamps.json')))['stamps']
    ts, lum, prev, diff = [], [], None, []
    for f, t in st[::2]:
        im = cv2.imread(os.path.join(d, f), cv2.IMREAD_GRAYSCALE)
        im = cv2.resize(im, (160, 90), interpolation=cv2.INTER_AREA).astype(np.float32)
        ts.append(t / 1000); lum.append(im.mean())
        diff.append(0 if prev is None else float(np.abs(im - prev).mean())); prev = im
    ts, lum, diff = np.array(ts), np.array(lum), np.array(diff)
    dt = np.median(np.diff(ts)); k = max(1, int(0.06 / dt))
    rise = np.r_[lum[k:] - lum[:-k], np.zeros(k)]
    from scipy.signal import find_peaks
    pk, pr = find_peaks(rise, distance=int(0.3 / dt), height=1.0)
    top = sorted(zip(rise[pk], ts[pk]), reverse=True)[:6]
    pk2, _ = find_peaks(diff, distance=int(0.3 / dt), height=0.8)
    top2 = sorted(zip(diff[pk2], ts[pk2]), reverse=True)[:6]
    print(f'{n:12s} len {ts[-1]:.2f}  brighten: ' + '  '.join(f'{t:.2f}({v:.0f})' for v, t in sorted(top, key=lambda x: x[1])))
    print(f'{"":12s}            change:   ' + '  '.join(f'{t:.2f}({v:.1f})' for v, t in sorted(top2, key=lambda x: x[1])))
    out[n] = {'brighten': [[float(t), float(v)] for v, t in top], 'change': [[float(t), float(v)] for v, t in top2], 'lum': [ts[::3].round(3).tolist(), lum[::3].round(1).tolist()]}
p = os.path.join(ROOT, 'clips', 'events.json')
old = json.load(open(p)) if os.path.exists(p) else {}
old.update(out); json.dump(old, open(p, 'w'))
