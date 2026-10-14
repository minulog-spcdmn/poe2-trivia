"""burst.py clip ... : when each streak clip's name pill bursts into its new colour (peak brightness of the
pill's region after the answer), in clip seconds."""
import sys, json, os
import numpy as np, cv2
for c in sys.argv[1:]:
    st = json.load(open(f'clips/{c}/stamps.json'))['stamps']
    ts, vs = [], []
    for f, t in st[::2]:
        if t < 2000: continue
        im = cv2.imread(f'clips/{c}/{f}', cv2.IMREAD_REDUCED_COLOR_4)
        h, w = im.shape[:2]
        reg = im[int(0.0 * h):int(0.2 * h), int(0.4 * w):int(0.6 * w)].astype(np.float32)
        ts.append(t / 1000); vs.append(reg.mean())
    vs = np.array(vs); i = int(np.argmax(np.diff(vs, prepend=vs[0])))   # the sharpest rise
    j = int(np.argmax(vs))
    print(c, 'rise', round(ts[i], 3), 'peak', round(ts[j], 3), 'base', round(float(np.median(vs)), 1), 'max', round(float(vs.max()), 1))
