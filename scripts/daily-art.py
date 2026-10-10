#!/usr/bin/env python3
# Finds the items too thin to be Today's unique: the start page shows the
# day's item big in the arcane circle, as its eye-catcher, and a bare stick
# (most staves, spears and quarterstaves) leaves the circle all but empty.
# For every item that isn't a gem it measures how much of the art box the
# picture covers, opaque pixels at the size the start page draws it, and
# writes the items under MIN_COVER to src/data/dailyArt.json; the daily and
# its practice questions never ask those (lib/daily.ts). Run it after
# scripts/upscale-art.py adds new art:
#   python3 scripts/daily-art.py
# (Pillow with AVIF and numpy, as in .venv-art from upscale-art.py.)

import json
import math
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ITEMS = os.path.join(ROOT, 'src', 'data', 'items.json')
ART = os.path.join(ROOT, 'public', 'items')
OUT = os.path.join(ROOT, 'src', 'data', 'dailyArt.json')

# The art box as the start page draws it on a desktop (DailyUnique.svelte):
# a 520 px circle, the box inset 14% 26% 21% of it, the picture at most 4
# times its art pixels, and its round fit reaching ROUND box widths across.
CIRCLE = 520
BOX_W, BOX_H = CIRCLE * 0.48, CIRCLE * 0.65
SCALE = 4
ROUND = 1.4167
# Keep in step with ART_SCALE in src/lib/ui-paths.ts.
ART_SCALE = 2
# The share of the box an item must cover. Below it are the bare sticks (in
# a contact sheet of the thinnest, every one under 0.075 was a staff, spear
# or quarterstaff, or a bow that is mostly string); from it up, items with
# a head, wings or a body to them.
MIN_COVER = 0.075


def cover(path: str) -> float:
    """The share of the art box the picture's opaque pixels cover, drawn as ArtImage's round fit draws it."""
    im = Image.open(path).convert('RGBA')
    alpha = np.asarray(im)[:, :, 3].astype(float) / 255
    w, h = im.width / ART_SCALE, im.height / ART_SCALE
    in_box = min(BOX_W, BOX_H * w / h)
    in_circle = ROUND * BOX_W * w / math.hypot(w, h)
    drawn_w = min(w * SCALE, max(in_box, in_circle))
    k = drawn_w / im.width
    return float(alpha.sum()) * k * k / (BOX_W * BOX_H)


def main():
    items = [it for it in json.load(open(ITEMS)) if it['kind'] != 'gem']
    measured = {it['id']: cover(os.path.join(ART, f"{it['id']}.avif")) for it in items}
    thin = sorted(i for i, c in measured.items() if c < MIN_COVER)
    with open(OUT, 'w') as f:
        json.dump({'minCover': MIN_COVER, 'thin': thin}, f, indent=1)
        f.write('\n')
    names = {it['id']: it['name'] for it in items}
    print(f'{len(thin)} of {len(items)} items are too thin for the daily:')
    for i in sorted(thin, key=measured.get):
        print(f'  {measured[i]:.3f}  {names[i]}')


if __name__ == '__main__':
    main()
