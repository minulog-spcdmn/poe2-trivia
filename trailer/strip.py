"""strip.py out.jpg t0 t1 n : n frames of EDIT's frame() from t0 to t1, in a grid (rendered directly, no encode)."""
import os, sys, importlib
os.environ['GPU'] = '1'
import torch, cv2, numpy as np
E = importlib.import_module(os.environ.get('EDIT', 'edit60h'))
t0, t1, n = float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4])
ims = []
with torch.inference_mode():
    for k in range(n):
        T = t0 + (t1 - t0) * k / max(1, n - 1)
        im = (E.frame(T, int(T * 60)).clamp(0, 1) * 255 + 0.5).to(torch.uint8).permute(1, 2, 0).cpu().numpy()
        im = cv2.resize(im, (640, 360), interpolation=cv2.INTER_AREA); cv2.putText(im, f'{T:.3f}', (8, 22), 0, 0.7, (0, 255, 255), 2); ims.append(im)
cols = 5
while len(ims) % cols: ims.append(np.zeros_like(ims[0]))
cv2.imwrite(sys.argv[1], np.vstack([np.hstack(ims[i:i + cols]) for i in range(0, len(ims), cols)]), [cv2.IMWRITE_JPEG_QUALITY, 88])
