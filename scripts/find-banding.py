#!/usr/bin/env python3
# Finds banding in a screenshot: a staircase of flat runs (at least W px wide)
# each one level from the next, the same way, along rows and columns of any
# channel. That is what a soft gradient or glow drawn in 8 bits without
# dither looks like (CLAUDE.md, "Banding"); dithered, the runs break up. Writes
# a copy with the banded pixels in magenta. Screenshots from headless
# Chromium are drawn on the CPU, so a glow that bands only on a GPU won't show.
#
#   python3 scripts/find-banding.py shot.png [marked.png]

import sys

import numpy as np
from PIL import Image

W = 6


def stairs(a):
    out = np.zeros(a.shape, dtype=bool)
    w = a.shape[1]
    for y in range(0, a.shape[0], 2):
        row = a[y].astype(int)
        cuts = np.flatnonzero(np.diff(row)) + 1
        starts, ends = np.r_[0, cuts], np.r_[cuts, w]
        vals = row[starts]
        for i in range(1, len(starts) - 1):
            step = vals[i] - vals[i - 1]
            if abs(step) == 1 and vals[i + 1] - vals[i] == step and ends[i] - starts[i] >= W and ends[i - 1] - starts[i - 1] >= W:
                out[y, starts[i]:ends[i]] = True
    return out


def main():
    img = np.asarray(Image.open(sys.argv[1]).convert('RGB'))
    hit = np.zeros(img.shape[:2], dtype=bool)
    for c in range(3):
        hit |= stairs(img[:, :, c])
        hit |= stairs(img[:, :, c].T).T
    print(f'{sys.argv[1]}: {hit.sum()} banded px ({100 * hit.mean():.2f}%)')
    if len(sys.argv) > 2:
        marked = (img * 0.5).astype('uint8')
        marked[hit] = [255, 0, 255]
        Image.fromarray(marked).save(sys.argv[2])


if __name__ == '__main__':
    main()
