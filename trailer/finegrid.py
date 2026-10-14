"""finegrid.py out.jpg x0 x1 y0 y1 clip:t ... : a region of source frames with a grid every 0.01."""
import sys, json, cv2, numpy as np
x0, x1, y0, y1 = map(float, sys.argv[2:6]); ims = []
for spec in sys.argv[6:]:
    c, t = spec.rsplit(':', 1); t = float(t)
    st = json.load(open(f'clips/{c}/stamps.json'))['stamps']; f = min(st, key=lambda s: abs(s[1] - t * 1000))[0]
    im = cv2.imread(f'clips/{c}/{f}'); h, w = im.shape[:2]
    cr = im[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
    W = 900; H = int(W * cr.shape[0] / cr.shape[1]); cr = cv2.resize(cr, (W, H), interpolation=cv2.INTER_AREA)
    for k in range(int(x0 * 100), int(x1 * 100) + 1):
        x = int((k / 100 - x0) / (x1 - x0) * W); bold = k % 5 == 0
        cv2.line(cr, (x, 0), (x, H), (0, 200, 255) if bold else (0, 70, 90), 1)
        if bold: cv2.putText(cr, f'{k/100:.2f}', (x + 2, 12), 0, 0.38, (0, 255, 255), 1)
    for k in range(int(y0 * 100), int(y1 * 100) + 1):
        y = int((k / 100 - y0) / (y1 - y0) * H); bold = k % 5 == 0
        cv2.line(cr, (0, y), (W, y), (0, 200, 255) if bold else (0, 70, 90), 1)
        if bold: cv2.putText(cr, f'{k/100:.2f}', (2, y - 2), 0, 0.38, (0, 255, 255), 1)
    cv2.putText(cr, spec, (8, H - 8), 0, 0.5, (255, 255, 0), 1); ims.append(cr)
cv2.imwrite(sys.argv[1], np.vstack(ims), [cv2.IMWRITE_JPEG_QUALITY, 88])
