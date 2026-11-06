"""The Gladiator's and the Assassin's sigils as engravings, for PoE2's 1.0
countdown (src/lib/hourglass.ts): each sigil's outline, traced round its
picture's alpha (public/classes/, 288 x 360), and its relief as the game's
own pictures have it, each blade bevelled along its middle: the faces turned
from the light (Sol's, from the upper left) cut in parallel strokes.
Writes src/data/sigilEngravings.json, in the picture's px.

    python scripts/engrave-sigils.py [preview-dir]

With a folder, it also draws each engraving there at four times its size,
to look at.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SIGILS = ['gladiator', 'assassin']
OUT = ROOT / 'src' / 'data' / 'sigilEngravings.json'

# The outline: traced where the alpha crosses a half, kept to within SIMPLIFY px.
EDGE = 0.5
SIMPLIFY = 0.45
# The hatching: strokes GAP px apart at ANGLE degrees (0 across, rising to the
# right), on the faces turned from the light more than SHADE (the cosine
# between the face's edge and the way the light goes); kept INSET px inside
# the outline, none shorter than SHORTEST px.
GAP = 6.0
ANGLE = -38
SHADE = 0.15
LIGHT = np.array([1.0, 0.55]) / np.hypot(1.0, 0.55)
INSET = 1.6
SHORTEST = 3.0


def contours(alpha: np.ndarray, level: float) -> list[list[tuple[float, float]]]:
    """Closed loops where `alpha` crosses `level`, by marching squares, each crossing placed between its two pixels
    as their alphas say (a pixel's centre at +0.5, as the picture's own px)."""
    h, w = alpha.shape
    pad = np.zeros((h + 2, w + 2))
    pad[1:-1, 1:-1] = alpha
    on = pad > level
    segs: dict[tuple, list[tuple]] = {}

    def cross(y0, x0, y1, x1):
        a, b = pad[y0, x0], pad[y1, x1]
        t = (level - a) / (b - a) if b != a else 0.5
        # (Keyed by the edge, so the two cells that share it meet on the same point.)
        return ((min(y0, y1), min(x0, x1), y0 != y1), (x0 + (x1 - x0) * t - 0.5, y0 + (y1 - y0) * t - 0.5))

    pts: dict[tuple, tuple[float, float]] = {}

    def add(p, q):
        (kp, vp), (kq, vq) = p, q
        pts[kp], pts[kq] = vp, vq
        segs.setdefault(kp, []).append(kq)
        segs.setdefault(kq, []).append(kp)

    for y in range(h + 1):
        for x in range(w + 1):
            tl, tr, br, bl = on[y, x], on[y, x + 1], on[y + 1, x + 1], on[y + 1, x]
            k = tl * 8 + tr * 4 + br * 2 + bl
            if k in (0, 15):
                continue
            t = cross(y, x, y, x + 1)
            r = cross(y, x + 1, y + 1, x + 1)
            b = cross(y + 1, x, y + 1, x + 1)
            l = cross(y, x, y + 1, x)
            cases = {
                1: [(l, b)], 2: [(b, r)], 3: [(l, r)], 4: [(t, r)], 5: [(l, t), (b, r)], 6: [(t, b)], 7: [(l, t)],
                8: [(l, t)], 9: [(t, b)], 10: [(t, r), (l, b)], 11: [(t, r)], 12: [(l, r)], 13: [(b, r)], 14: [(l, b)],
            }
            for p, q in cases[k]:
                add(p, q)
    loops = []
    seen = set()
    for start in list(segs):
        if start in seen:
            continue
        loop = [start]
        seen.add(start)
        prev, cur = None, start
        while True:
            nxt = [q for q in segs[cur] if q != prev and q not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            seen.add(cur)
            loop.append(cur)
        if len(loop) > 8:
            loops.append([pts[k] for k in loop])
    return loops


def simplify(pts: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """Ramer-Douglas-Peucker on a closed loop (split at its two farthest points)."""

    def rdp(p):
        if len(p) < 3:
            return p
        a, b = np.array(p[0]), np.array(p[-1])
        ab = b - a
        n = np.hypot(*ab) or 1e-9
        d = [abs(ab[0] * (q[1] - a[1]) - ab[1] * (q[0] - a[0])) / n for q in p[1:-1]]
        i = int(np.argmax(d)) + 1
        if d[i - 1] > tol:
            return rdp(p[: i + 1])[:-1] + rdp(p[i:])
        return [p[0], p[-1]]

    far = int(np.argmax([np.hypot(x - pts[0][0], y - pts[0][1]) for x, y in pts]))
    return rdp(pts[: far + 1])[:-1] + rdp(pts[far:] + [pts[0]])[:-1]


def engrave(name: str):
    im = Image.open(ROOT / 'public' / 'classes' / f'{name}.webp').convert('RGBA')
    alpha = np.asarray(im.getchannel('A'), dtype=float) / 255
    # Kept off the outline: the inside shrunk by INSET.
    core = np.asarray(Image.fromarray((alpha > EDGE).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(int(2 * INSET) | 1))) > 127

    outline = [simplify(loop, SIMPLIFY) for loop in contours(alpha, EDGE)]
    outline = [[(round(x, 1), round(y, 1)) for x, y in loop] for loop in outline if len(loop) >= 3]

    # In shade: each blade bevelled along its middle, as the game draws them, so a point takes the light of the
    # edge nearest it; the faces whose edge looks away from the light (LIGHT, from the upper left) are in shade.
    h, w = alpha.shape
    segs = np.array([(*loop[i], *loop[(i + 1) % len(loop)]) for loop in outline for i in range(len(loop))])
    a0, a1 = segs[:, :2], segs[:, 2:]
    d = a1 - a0
    n = np.stack([d[:, 1], -d[:, 0]], 1) / np.maximum(np.hypot(d[:, 0], d[:, 1]), 1e-9)[:, None]
    # Each edge's normal turned outward: the side its picture is clear.
    m = (a0 + a1) / 2 + 2 * n
    clear = np.array([alpha[int(np.clip(y + 0.5, 0, h - 1)), int(np.clip(x + 0.5, 0, w - 1))] < EDGE for x, y in m])
    n[~clear] *= -1
    ys, xs = np.nonzero(core)
    p = np.stack([xs, ys], 1).astype(float)
    best = np.full(len(p), np.inf)
    facing = np.zeros(len(p))
    for i in range(0, len(segs), 64):
        s0, sd, sn = a0[i : i + 64], d[i : i + 64], n[i : i + 64]
        t = np.clip(((p[:, None, :] - s0[None]) * sd[None]).sum(2) / np.maximum((sd * sd).sum(1), 1e-9)[None], 0, 1)
        q = s0[None] + t[..., None] * sd[None]
        dist = np.hypot(*(p[:, None, :] - q).transpose(2, 0, 1))
        k = dist.argmin(1)
        near = dist[np.arange(len(p)), k]
        better = near < best
        best[better] = near[better]
        facing[better] = (sn[k] @ LIGHT)[better]
    shade = np.zeros_like(core)
    shade[ys, xs] = facing > SHADE

    th = np.radians(ANGLE)
    dx, dy = np.cos(th), np.sin(th)
    nx, ny = -dy, dx
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    offs = [x * nx + y * ny for x, y in corners]
    hatch = []
    o = min(offs) + GAP / 2
    span = max(abs(x * dx + y * dy) for x, y in corners) * 1.5
    while o < max(offs):
        cx, cy = nx * o, ny * o
        run = None
        for s in np.arange(-span, span, 0.5):
            x, y = cx + dx * s, cy + dy * s
            xi, yi = int(x), int(y)
            on = 0 <= xi < w and 0 <= yi < h and core[yi, xi] and shade[yi, xi]
            if on and run is None:
                run = (x, y)
            elif not on and run is not None:
                if np.hypot(x - run[0], y - run[1]) >= SHORTEST:
                    hatch.append([round(run[0], 1), round(run[1], 1), round(x, 1), round(y, 1)])
                run = None
        o += GAP
    return {'outline': outline, 'hatch': hatch}


def preview(name: str, e, folder: Path):
    k = 4
    img = Image.new('RGB', (288 * k, 360 * k), (20, 16, 12))
    d = ImageDraw.Draw(img)
    for loop in e['outline']:
        d.line([(x * k, y * k) for x, y in loop + loop[:1]], fill=(217, 164, 90), width=3)
    for x0, y0, x1, y1 in e['hatch']:
        d.line([(x0 * k, y0 * k), (x1 * k, y1 * k)], fill=(170, 128, 70), width=2)
    img.save(folder / f'{name}-engraved.png')


def main():
    out = {name: engrave(name) for name in SIGILS}
    OUT.write_text(json.dumps(out, separators=(',', ':')) + '\n', encoding='utf-8', newline='\n')
    for name, e in out.items():
        print(name, 'loops', len(e['outline']), 'points', sum(map(len, e['outline'])), 'strokes', len(e['hatch']))
    if len(sys.argv) > 1:
        folder = Path(sys.argv[1])
        folder.mkdir(parents=True, exist_ok=True)
        for name, e in out.items():
            preview(name, e, folder)


if __name__ == '__main__':
    main()
