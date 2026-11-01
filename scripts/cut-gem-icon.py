#!/usr/bin/env python3
# Cuts the lineage gems' category emblem (public/icons/lineage-gems.avif, and
# its 128 px copy in public/icons/128/; lib/categoryArt) out of a gem's art.
# Gem art comes as a square tile on cloth, so the brooch is cut from the
# tile's upscaled picture (public/items/, 4x as every one-cell item;
# scripts/upscale-art.py) with rembg's BiRefNet, the speckles it leaves in
# the openwork filled, and given the soft drop shadow the poe2db item art
# carries, padded as the cut-out has always been. Run it again after the
# gem's art is upscaled again, then npm run bake-icons.
#
# Setup, once (rembg fetches its model, about 1 GB, on the first run; a GPU
# build of onnxruntime is used if there is one):
#   python3 -m venv .venv-cut
#   .venv-cut/bin/pip install "rembg[gpu]" pillow numpy scipy
# Run:
#   .venv-cut/bin/python scripts/cut-gem-icon.py ["Gem's name"]

import json
import os
import sys

import numpy as np
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage as nd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEM = sys.argv[1] if len(sys.argv) > 1 else "Oisín's Oath"
OUT = os.path.join(ROOT, 'public', 'icons')
NAME = 'lineage-gems.avif'
QUALITY = 80  # as upscale-art.py
GLYPH = 128
# Where the brooch's bounds (its pixels at least half opaque) sit in the
# picture, as parts of their own size: the margins left and above, and the
# picture's width and height (the first cut-out's, kept so the glyph sits
# the same; the card fits the brooch alone, lib/iconFit).
LEFT, TOP, WIDTH, HEIGHT = 30 / 177, 29 / 177, 237 / 177, 235 / 177
# The drop shadow: down and right, its blur (sigma) and its strength, in
# pixels of a brooch 177 px across, scaled with it.
SHADOW_DOWN, SHADOW_RIGHT, SHADOW_BLUR, SHADOW_ALPHA = 2, 1, 2.5, 0.6
# Holes in the brooch smaller than this (px) are speckles, not openwork; and
# dips in it narrower than DIP px are filled too.
SPECKLE = 200
DIP = 5

items = json.load(open(os.path.join(ROOT, 'src', 'data', 'items.json'), encoding='utf-8'))
gem = next(it for it in items if it['name'] == GEM and it['kind'] == 'gem')
tile = Image.open(os.path.join(ROOT, 'public', 'items', f"{gem['id']}.avif")).convert('RGBA')
src = np.asarray(tile).astype(float) / 255

# The brooch, found on the tile laid on black (on white BiRefNet loses the
# patina's curl at the top left).
on_black = Image.new('RGBA', tile.size, (0, 0, 0, 255))
on_black.alpha_composite(tile)
mask = remove(on_black.convert('RGB'), session=new_session('birefnet-general'), only_mask=True)
obj = np.minimum(np.asarray(mask.convert('L')).astype(float) / 255, src[..., 3])

solid = obj >= 0.5
holes, n = nd.label(~solid)
sizes = nd.sum(np.ones_like(obj), holes, range(1, n + 1))
edge = set(np.unique(np.concatenate([holes[0], holes[-1], holes[:, 0], holes[:, -1]])))
small = [i + 1 for i, s in enumerate(sizes) if s < SPECKLE and (i + 1) not in edge]
fill = nd.gaussian_filter(np.isin(holes, small).astype(float), 0.7)
obj = np.maximum(obj, np.clip(fill * 1.5, 0, 1))
obj = nd.grey_closing(obj, size=(DIP, DIP))

ys, xs = np.nonzero(obj >= 0.5)
x0, y0 = xs.min(), ys.min()
bw, bh = xs.max() - x0 + 1, ys.max() - y0 + 1
L, T = round(LEFT * bw), round(TOP * bh)
W, H = round(WIDTH * bw), round(HEIGHT * bh)
k = (bw * bh) ** 0.5 / 177

# The brooch at its own pixels (not resampled), placed on the picture.
oa = np.zeros((H, W))
rgb = np.zeros((H, W, 3))
dx, dy = L - x0, T - y0
sy0, sx0 = max(0, -dy), max(0, -dx)
sy1, sx1 = min(obj.shape[0], H - dy), min(obj.shape[1], W - dx)
oa[sy0 + dy:sy1 + dy, sx0 + dx:sx1 + dx] = obj[sy0:sy1, sx0:sx1]
rgb[sy0 + dy:sy1 + dy, sx0 + dx:sx1 + dx] = src[sy0:sy1, sx0:sx1, :3]

shadow = nd.gaussian_filter(nd.shift(oa, (SHADOW_DOWN * k, SHADOW_RIGHT * k), order=1), SHADOW_BLUR * k) * SHADOW_ALPHA
a = oa + shadow * (1 - oa)
rgb = np.where(a[..., None] > 0, rgb * oa[..., None] / np.maximum(a, 1e-6)[..., None], 0)
im = Image.fromarray(np.round(np.clip(np.dstack([rgb, a]), 0, 1) * 255).astype(np.uint8), 'RGBA')

im.save(os.path.join(OUT, NAME), 'AVIF', quality=QUALITY, speed=4)
s = GLYPH / max(im.size)
os.makedirs(os.path.join(OUT, str(GLYPH)), exist_ok=True)
im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS).save(os.path.join(OUT, str(GLYPH), NAME), 'AVIF', quality=QUALITY, speed=4)
print(f'{GEM}: {im.width} x {im.height} → public/icons/{NAME}, and its {GLYPH} px copy; now npm run bake-icons')
