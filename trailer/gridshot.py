"""gridshot.py out.jpg clip:t ... : source frames with a grid every 0.05 (labelled in fractions)."""
import sys, json, cv2, numpy as np
ims = []
for spec in sys.argv[2:]:
    c, t = spec.rsplit(':', 1); t = float(t)
    st = json.load(open(f'clips/{c}/stamps.json'))['stamps']; f = min(st, key=lambda s: abs(s[1] - t * 1000))[0]
    im = cv2.resize(cv2.imread(f'clips/{c}/{f}'), (960, 540), interpolation=cv2.INTER_AREA)
    for k in range(1, 20):
        x = int(960 * k / 20); y = int(540 * k / 20)
        col = (0, 200, 255) if k % 2 == 0 else (0, 90, 120)
        cv2.line(im, (x, 0), (x, 539), col, 1); cv2.line(im, (0, y), (959, y), col, 1)
        if k % 2 == 0:
            cv2.putText(im, f'{k/20:.1f}', (x + 2, 12), 0, 0.35, (0, 255, 255), 1); cv2.putText(im, f'{k/20:.1f}', (2, y - 2), 0, 0.35, (0, 255, 255), 1)
    cv2.putText(im, spec, (8, 530), 0, 0.5, (255, 255, 0), 1); ims.append(im)
while len(ims) % 2: ims.append(np.zeros_like(ims[0]))
cv2.imwrite(sys.argv[1], np.vstack([np.hstack(ims[i:i + 2]) for i in range(0, len(ims), 2)]), [cv2.IMWRITE_JPEG_QUALITY, 88])
