#!/usr/bin/env python3
# Upscales the item art for the site. poe2db only has the art at about 104 px
# per inventory cell (108 x 108 for a ring), and lossy, which the game draws
# much bigger than that. Real-ESRGAN (x4plus) redraws each picture at 4x, which
# is kept at 4x for items up to 2 x 2 cells and scaled down to 2x for larger
# ones (scale_of, artScale in src/lib/ui-paths.ts: small items are drawn the
# most enlarged), and mixed with the original (smoothly enlarged) by its size
# (mix_of), then saved to public/items/ as
# AVIF, with smaller copies for small spots (public/items/<size>/, at most
# that many px on the longest side; see itemThumb in src/lib/ui-paths.ts).
# The originals stay in art-source/items/ (fetch-data puts them there); only
# those without an upscaled copy yet are done, unless --all.
#
# On its own the model repaints the art (smooth, waxy, painterly). In blind
# tests the mix at 30% beat 50% and 70% (and the plain model, other models,
# and the original as it was) on 35 items, small and big alike. Small items
# are drawn the most enlarged, so they take more of the model (MIX): for
# one-cell items, 75% beat 50% 21 to 3 in a blind test on 24 of them, but
# the precursor tablets' stone came out too smooth at 75% (MIX_GROUP); items
# up to 2 x 2 take 50%. AVIF at
# QUALITY came out a third smaller than WebP at 90 and closer to the
# unencoded picture (SSIM, over 48 items).
#
# Setup, once (CPU is enough; the whole set takes about an hour):
#   python3 -m venv .venv-art
#   .venv-art/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
#   .venv-art/bin/pip install pillow numpy
#   curl -L -o .venv-art/RealESRGAN_x4plus.pth \
#     https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
# Run:
#   .venv-art/bin/python scripts/upscale-art.py [--all] [ids...]
# With ART_KEEP=<folder> set, the model's own 4x pictures are kept there too
# (lossless), and an item whose picture is kept there is made from it without
# running the model, so a later change to the mix or the scale takes minutes:
#   ART_KEEP=<folder> .venv-art/bin/python scripts/upscale-art.py --all

import json
import os
import sys

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'art-source', 'items')
OUT_DIR = os.path.join(ROOT, 'public', 'items')
MODEL = os.environ.get('ART_MODEL', os.path.join(ROOT, '.venv-art', 'RealESRGAN_x4plus.pth'))
# Pixels per art pixel, by the item's size in inventory cells (CELL px each,
# about): one cell, up to 2 x 2, larger (keep in step with artScale in
# src/lib/ui-paths.ts).
SCALE = {'small': 4, 'medium': 4, 'large': 2}
# How much of the model's picture goes into the mix, the rest being the
# original, by size as SCALE.
MIX = {'small': 0.75, 'medium': 0.5, 'large': 0.3}
# Groups (src/data/items.json) that take their own share whatever their size.
MIX_GROUP = {'Tablets': 0.5}
CELL = 104
QUALITY = 80
# The smaller copies' longest sides, px (keep in step with ITEM_THUMBS in src/lib/ui-paths.ts).
THUMBS = (256, 128)


# Real-ESRGAN's RRDBNet (x4), as in github.com/xinntao/Real-ESRGAN.
class RDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        return self.conv5(torch.cat((x, x1, x2, x3, x4), 1)) * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = RDB(nf, gc), RDB(nf, gc), RDB(nf, gc)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, nf=64, nb=23, gc=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def load_model():
    sd = torch.load(MODEL, map_location='cpu', weights_only=True)
    net = RRDBNet()
    net.load_state_dict(sd.get('params_ema', sd.get('params', sd)), strict=True)
    return net.eval()


def run(net, rgb):
    """rgb (h, w, 3) uint8 -> (4h, 4w, 3) uint8. Mirrored padding gives the edges context."""
    t = torch.from_numpy(rgb.copy()).permute(2, 0, 1)[None].float() / 255
    p = 8
    t = F.pad(t, (p, p, p, p), mode='reflect')
    with torch.no_grad():
        o = net(t).clamp(0, 1)
    o = o[:, :, 4 * p : -4 * p, 4 * p : -4 * p]
    return (o[0].permute(1, 2, 0).numpy() * 255).round().astype(np.uint8)


def upscale(net, src, out):
    im = Image.open(src).convert('RGBA')
    keep = os.environ.get('ART_KEEP')
    kept = keep and os.path.join(keep, os.path.basename(src))
    if kept and os.path.exists(kept):
        return finish(Image.open(kept).convert('RGBA'), im, out)
    a = np.asarray(im)
    rgb = run(net, a[..., :3])
    # The alpha goes through the model too, so the edges stay as crisp as the colour.
    alpha = run(net, np.repeat(a[..., 3:], 3, 2)).mean(2).round().astype(np.uint8)
    big = Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')
    if keep:
        os.makedirs(keep, exist_ok=True)
        # exact: keep the colour under clear pixels too, which AVIF's colour
        # coding sees, so a picture made from the kept one comes out the same.
        big.save(kept, 'WEBP', lossless=True, exact=True)
    finish(big, im, out)


def finish(big, im, out):
    """The model's 4x picture of `im`, at the item's scale, mixed and saved with its smaller copies at `out`."""
    k = scale_of(*im.size)
    model = big if k == 4 else big.resize((im.width * k, im.height * k), Image.LANCZOS)
    model = np.asarray(model).astype(np.float32)
    save_all(mix(model, im, group_of(os.path.splitext(os.path.basename(out))[0])), out)


_groups = None


def group_of(iid):
    """An item's group, from src/data/items.json."""
    global _groups
    if _groups is None:
        with open(os.path.join(ROOT, 'src', 'data', 'items.json')) as f:
            _groups = {it['id']: it['group'] for it in json.load(f)}
    return _groups.get(iid)


def size_of(w, h):
    """An item's size class by its art (px): 'small' (one cell), 'medium' (up to 2 x 2: 1 x 2, 2 x 1, 2 x 2) or 'large'.

    Halves round up, as Math.round in artScale does (Python's round would
    send them to the even side).
    """
    cells = lambda px: max(1, int(px / CELL + 0.5))
    cw, ch = cells(w), cells(h)
    return 'small' if cw == ch == 1 else 'medium' if cw <= 2 and ch <= 2 else 'large'


def scale_of(w, h):
    """Pixels per art pixel in an item's picture (SCALE)."""
    return SCALE[size_of(w, h)]


def mix_of(w, h, group=None):
    """How much of the model goes into an item's mix: its group's own share (MIX_GROUP), else by its size (MIX)."""
    return MIX_GROUP[group] if group in MIX_GROUP else MIX[size_of(w, h)]


def mix(model, im, group=None):
    """The model's picture (float RGBA at the item's scale) mixed with the original enlarged smoothly, by mix_of; the model's alpha, whose edges are crisper.

    Each picture's colour counts by how opaque it is there: the original is
    black where it is clear, so where the model's edge reaches past the
    original's, a plain mix would darken the rim.
    """
    base = np.asarray(im.resize((model.shape[1], model.shape[0]), Image.BICUBIC)).astype(np.float32)
    ma, ba = model[..., 3:] / 255, base[..., 3:] / 255
    t = mix_of(*im.size, group)
    weight = t * ma + (1 - t) * ba
    rgb = (t * model[..., :3] * ma + (1 - t) * base[..., :3] * ba) / np.maximum(weight, 1e-6)
    rgb = np.where(weight > 1e-6, rgb, model[..., :3])
    out = np.dstack([rgb, model[..., 3:]]).round().clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def save(im, out):
    im.save(out, 'AVIF', quality=QUALITY, speed=4)


def save_all(im, out):
    """The picture at `out` (public/items/<id>.avif), and its smaller copies beside it."""
    save(im, out)
    folder, name = os.path.split(out)
    for size in THUMBS:
        os.makedirs(os.path.join(folder, str(size)), exist_ok=True)
        k = min(1, size / max(im.size))
        small = im if k == 1 else im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        save(small, os.path.join(folder, str(size), name))


def done(iid):
    """Whether an item has its pictures, the full one at its scale (so a change to SCALE redoes the items it moves)."""
    full = os.path.join(OUT_DIR, f'{iid}.avif')
    if not all(os.path.exists(p) for p in [full] + [os.path.join(OUT_DIR, str(t), f'{iid}.avif') for t in THUMBS]):
        return False
    w, h = Image.open(os.path.join(SRC_DIR, f'{iid}.webp')).size
    k = scale_of(w, h)
    return Image.open(full).size == (w * k, h * k)


def main():
    args = sys.argv[1:]
    redo = '--all' in args
    ids = [a for a in args if not a.startswith('--')]
    if not ids:
        ids = sorted(f[: -len('.webp')] for f in os.listdir(SRC_DIR) if f.endswith('.webp'))
    todo = [i for i in ids if redo or not done(i)]
    if not todo:
        print('All item art is upscaled.')
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    torch.set_num_threads(os.cpu_count() or 4)
    keep = os.environ.get('ART_KEEP')
    # The model only loads if some item has no kept picture to start from.
    net = None if keep and all(os.path.exists(os.path.join(keep, f'{i}.webp')) for i in todo) else load_model()
    for n, i in enumerate(todo, 1):
        upscale(net, os.path.join(SRC_DIR, f'{i}.webp'), os.path.join(OUT_DIR, f'{i}.avif'))
        print(f'[{n}/{len(todo)}] {i}', flush=True)


if __name__ == '__main__':
    main()
