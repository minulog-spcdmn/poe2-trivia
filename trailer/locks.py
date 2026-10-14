"""Find each zone clip's lock moment: the title band's brightness jumps as the name locks and lights the scene."""
import json, os, sys, glob
import numpy as np, cv2
ROOT = os.path.dirname(os.path.abspath(__file__))
out = {}
for d in sorted(glob.glob(os.path.join(ROOT, 'clips', 'zone_*')) + glob.glob(os.path.join(ROOT, 'clips', 'czone_*')) + glob.glob(os.path.join(ROOT, 'clips', 'szone_*'))):
    name = os.path.basename(d)
    if not os.path.exists(os.path.join(d, 'stamps.json')): continue
    J = json.load(open(os.path.join(d, 'stamps.json')))
    st = J['stamps']
    ts, lum = [], []
    for f, t in st[::2]:
        im = cv2.imread(os.path.join(d, f), cv2.IMREAD_GRAYSCALE)
        h = im.shape[0]
        band = im[int(h * 0.38):int(h * 0.52), int(im.shape[1] * 0.25):int(im.shape[1] * 0.75)]
        ts.append(t / 1000); lum.append(float(band.mean()))
    ts, lum = np.array(ts), np.array(lum)
    # Largest rise over ~120 ms after the letterbox closes (> 1.5 s in)
    dt = np.median(np.diff(ts)); k = max(1, int(0.12 / dt))
    rise = np.r_[lum[k:] - lum[:-k], np.zeros(k)]
    rise[(ts < 1.5) | (ts > 6.0)] = 0
    i = int(np.argmax(rise))
    # Plunge start: first big darkening (letterbox) after 0.2 s
    out[name] = {'lock': round(float(ts[i] + 0.06), 3), 'peak_rise': round(float(rise[i]), 2), 'len': round(float(ts[-1]), 2)}
    print(name, out[name])
json.dump(out, open(os.path.join(ROOT, 'clips', 'locks.json'), 'w'), indent=1)
