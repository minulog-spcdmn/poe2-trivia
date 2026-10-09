#!/usr/bin/env python3
# Upscales the item art for the site. poe2db only has the art at about 104 px
# per inventory cell (108 x 108 for a ring), and lossy, which the game draws
# much bigger than that. Real-ESRGAN (x4plus) redraws each picture at 4x, which
# is then scaled down to ART_SCALE (2x, src/lib/ui-paths.ts) and mixed with
# the original (smoothly enlarged) at MIX, then saved to public/items/. The
# originals stay in art-source/items/ (fetch-data puts them there); only those
# without an upscaled copy yet are done, unless --all.
#
# On its own the model repaints the art (smooth, waxy, painterly). In blind
# tests the mix at 30% beat 50% and 70% (and the plain model, other models,
# and the original as it was) on 35 items, small and big alike.
#
# Setup, once (CPU is enough; the whole set takes about an hour):
#   python3 -m venv .venv-art
#   .venv-art/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
#   .venv-art/bin/pip install pillow numpy
#   curl -L -o .venv-art/RealESRGAN_x4plus.pth \
#     https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
# Run:
#   .venv-art/bin/python scripts/upscale-art.py [--all] [ids...]

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
# Keep in step with ART_SCALE in src/lib/ui-paths.ts.
ART_SCALE = 2
# How much of the model's picture goes into the mix; the rest is the original.
MIX = 0.3
QUALITY = 90


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
    a = np.asarray(im)
    rgb = run(net, a[..., :3])
    # The alpha goes through the model too, so the edges stay as crisp as the colour.
    alpha = run(net, np.repeat(a[..., 3:], 3, 2)).mean(2).round().astype(np.uint8)
    big = Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')
    size = (im.width * ART_SCALE, im.height * ART_SCALE)
    model = np.asarray(big.resize(size, Image.LANCZOS)).astype(np.float32)
    save(mix(model, im), out)


def mix(model, im):
    """The model's picture (float RGBA at ART_SCALE) mixed with the original enlarged smoothly; the model's alpha, whose edges are crisper."""
    base = np.asarray(im.resize((model.shape[1], model.shape[0]), Image.BICUBIC)).astype(np.float32)
    out = (MIX * model + (1 - MIX) * base).round().clip(0, 255).astype(np.uint8)
    out[..., 3] = model[..., 3].astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def save(im, out):
    im.save(out, 'WEBP', quality=QUALITY, alpha_quality=100, method=6)


def main():
    args = sys.argv[1:]
    redo = '--all' in args
    ids = [a for a in args if not a.startswith('--')]
    if not ids:
        ids = sorted(f[: -len('.webp')] for f in os.listdir(SRC_DIR) if f.endswith('.webp'))
    todo = [i for i in ids if redo or not os.path.exists(os.path.join(OUT_DIR, f'{i}.webp'))]
    if not todo:
        print('All item art is upscaled.')
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    torch.set_num_threads(os.cpu_count() or 4)
    net = load_model()
    for n, i in enumerate(todo, 1):
        upscale(net, os.path.join(SRC_DIR, f'{i}.webp'), os.path.join(OUT_DIR, f'{i}.webp'))
        print(f'[{n}/{len(todo)}] {i}', flush=True)


main()
