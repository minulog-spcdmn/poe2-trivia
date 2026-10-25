# python unwarp.py out.png <dir>...: each frame warped back flat onto the card (from its corners), then how much each point
# changes over the frames: the shimmer, with the motion taken out. Prints the mean over the card's inside.
import sys, json, glob, numpy as np
def gaussian_filter(a, r):
    x = np.arange(-3 * r, 3 * r + 1); k = np.exp(-x * x / (2 * r * r)); k /= k.sum()
    a = np.apply_along_axis(lambda v: np.convolve(v, k, 'same'), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, 'same'), 1, a)
from PIL import Image
def lin(a): a = a / 255.0; return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
def coeffs(dst, src):
    # PIL PERSPECTIVE: for output (x, y), input = ((a x + b y + c) / (g x + h y + 1), (d x + e y + f) / (g x + h y + 1)).
    A, B = [], []
    for (x, y), (u, v) in zip(dst, src):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]; B += [u, v]
    return np.linalg.solve(np.array(A, float), np.array(B, float))
rows = []
for d in sys.argv[2:]:
    m = json.load(open(f'{d}/meta.json')); k = m['k']; dpr = m['dpr']; bx, by = m['box']['x'], m['box']['y']
    files = sorted(glob.glob(f'{d}/*.png'))
    c0 = m['corners'][0]; W, H = c0['w'], c0['h']
    S = 2 * dpr / k * 1.4  # (meta's dpr has the supersampling in it)
    ow, oh = int(W * S), int(H * S)
    out = []
    for f, c in zip(files, m['corners']):
        im = Image.open(f).convert('RGB')
        src = [((x - bx) * dpr, (y - by) * dpr) for x, y in c['q']]
        dst = [(0, 0), (ow, 0), (ow, oh), (0, oh)]
        w = im.transform((ow, oh), Image.PERSPECTIVE, tuple(coeffs(dst, src)), Image.BICUBIC)
        # Light as the eye takes it in: over about a pixel and a half of the screen (the output is ~2 px a screen px).
        out.append(gaussian_filter(lin(np.asarray(w, float)).mean(2), float(__import__('os').environ.get('BLUR', 3))))
    F = np.stack(out)
    sd = F.std(0); mu = F.mean()
    inner = sd[int(oh * .04):int(oh * .96), int(ow * .05):int(ow * .95)]
    print(f'{d:34s} shimmer {inner.mean() / mu:.4f}')
    np.save(f'{d}/sd.npy', sd / mu)
    rows.append(np.concatenate([np.clip(F[0] ** (1 / 2.2), 0, 1), np.clip(sd / (mu * 0.5), 0, 1)], 1))
h = min(r.shape[0] for r in rows); w = min(r.shape[1] for r in rows)
Image.fromarray((np.concatenate([r[:h, :w] for r in rows], 1) * 255).astype('uint8')).save(sys.argv[1])
