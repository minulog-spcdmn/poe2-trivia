"""cmp.py out.jpg clipA clipB t1 t2 ... : the two clips' frames at the same source times, side by side."""
import sys, json, os
from PIL import Image, ImageDraw
out, a, b = sys.argv[1], sys.argv[2], sys.argv[3]; ts = [float(x) for x in sys.argv[4:]]
def fr(c, t):
    st = json.load(open(f'clips/{c}/stamps.json'))['stamps']; f = min(st, key=lambda s: abs(s[1] - t * 1000))[0]
    return Image.open(f'clips/{c}/{f}').convert('RGB').resize((640, 360))
sh = Image.new('RGB', (1280, 360 * len(ts)))
for i, t in enumerate(ts):
    sh.paste(fr(a, t), (0, 360 * i)); sh.paste(fr(b, t), (640, 360 * i)); ImageDraw.Draw(sh).text((6, 360 * i + 4), f'{t:.2f}', fill=(255, 255, 0))
sh.save(out, quality=85)
