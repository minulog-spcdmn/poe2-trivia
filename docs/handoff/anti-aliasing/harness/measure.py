"""Flicker of a turning circle, from frames shot 1/60 s apart (shoot.mjs).

flicker(s): mean over pixels and frames of |L[k+s] - 2 L[k] + L[k-s]| in
linear light, over the mean line light. Smooth motion is near linear over a
few frames, so this is what's left over: the twinkle and the crawl.
A 'ref' run is drawn at 4x and box-filtered down in linear light: the
floor an ideal antialiased render would reach.
python -I measure.py <outDir> [heatmap-run]
"""
import json, os, sys
import numpy as np
from PIL import Image

out = sys.argv[1]
heat = sys.argv[2:] if len(sys.argv) > 2 else []


def lin(a):
    a = a / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def load(run, target=None):
    d = os.path.join(out, run)
    files = sorted(f for f in os.listdir(d) if f.endswith('.png'))
    frames = []
    for f in files:
        im = np.asarray(Image.open(os.path.join(d, f)).convert('RGB'), dtype=np.float64)
        L = lin(im) @ np.array([0.2126, 0.7152, 0.0722])
        if target is not None and L.shape != target:
            k = 4
            h, w = target
            L = L[: h * k, : w * k]
            if L.shape != (h * k, w * k):
                L = np.pad(L, ((0, h * k - L.shape[0]), (0, w * k - L.shape[1])), mode='edge')
            L = L.reshape(h, k, w, k).mean(axis=(1, 3))
        frames.append(L)
    return np.stack(frames)


def metrics(F):
    bg = np.percentile(F[0], 5)
    light = max(1e-9, (F.mean(axis=0) - bg).clip(0).mean())
    r = {}
    for s in (1, 4):
        d2 = np.abs(F[2 * s :] - 2 * F[s:-s] + F[: -2 * s])
        r[f'flicker{s}'] = d2.mean() / light
    tot = (F - bg).clip(0).sum(axis=(1, 2))
    r['pulse'] = tot.std() / tot.mean()
    return r


def one(run):
    target = None
    if run.endswith('-ref'):
        key = run.rsplit('-', 1)[0]
        d = os.path.join(out, key + '-now')
        f0 = sorted(f for f in os.listdir(d) if f.endswith('.png'))[0]
        w, h = Image.open(os.path.join(d, f0)).size
        target = (h, w)
    F = load(run, target)
    if run in heat:
        d2 = np.abs(F[8:] - 2 * F[4:-4] + F[:-8]).mean(axis=0)
        v = (d2 / np.percentile(d2, 99.5)).clip(0, 1) ** 0.5
        Image.fromarray((v * 255).astype(np.uint8)).save(os.path.join(out, f'heat-{run}.png'))
    m = metrics(F)
    key = run.rsplit('-', 1)[0]
    rd = os.path.join(out, key + '-ref')
    if not run.endswith('-ref') and os.path.isdir(rd):
        R = load(key + '-ref', F.shape[1:])
        n = min(len(F), len(R))
        bg = np.percentile(R[0], 5)
        light = max(1e-9, (R.mean(axis=0) - bg).clip(0).mean())
        m['err'] = np.abs(F[:n] - R[:n]).mean() / light
        m['bright'] = (F[:n] - bg).clip(0).mean() / light
    return run, m


if __name__ == '__main__':
    from multiprocessing import Pool
    runs = sorted(r for r in os.listdir(out) if os.path.isdir(os.path.join(out, r)))
    with Pool(16) as pool:
        rows = pool.map(one, runs)

    print(f"{'run':32} {'flicker1':>9} {'flicker4':>9} {'pulse':>8} {'err':>7} {'bright':>7}")
    for run, m in sorted(rows):
        print(f"{run:32} {m['flicker1']:9.4f} {m['flicker4']:9.4f} {m['pulse']:8.4f} {m.get('err', 0):7.3f} {m.get('bright', 1):7.3f}")
