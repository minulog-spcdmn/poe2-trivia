"""60 s cut, v5 polish: whole zone names, toasts sooner, the fuse then a slow-motion reach for Detonate."""
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60d.py'), encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a[:90]; s = s.replace(a, b)
def cut(a0, a1, b):
    global s
    i = s.index(a0); j = s.index(a1); s = s[:i] + b + s[j:]

# zone names fully formed on the cut, their lock glow just after
rep("shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.1, at=t0,", "shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.4, at=t0,")
# the toasts arrive with the cut
rep("shot(42.78, 44.69, 'toasts3', src=2.1, speed=1.2, hand=2, keys=[(0, (1.7, 0.74, 0.76)), (1, (2.15, 0.79, 0.82))])", "shot(42.78, 44.69, 'toasts3', src=2.6, speed=1.1, hand=2, keys=[(0, (2.0, 0.81, 0.79)), (1, (2.3, 0.83, 0.82))])")
# the fuse to 0, then the hand reaches for Detonate in slow motion through the stop, pressing on the hit
cut("shot(47.47, 49.30, 'fuse'", "# ================= THE STOP", """shot(47.47, 49.30, 'fuse', 0.55, at=47.47, speed=(1.62 - 0.55) / (49.30 - 47.47), hand=2, keys=[(0, (1.2, 0.55, 0.55)), (1, (1.42, 0.62, 0.58))])
hit(47.47, pu=0.03)
hit(49.30, pu=0.04, sk=6)

""")
cut("shot(STOP, BIG, 'detpress'", "# ================= THE BLAST", """shot(49.30, BIG, 'detreach', 4.84, at=BIG - 0.08, speed=1.0, hand=1,
     keys=[(0, (1.3, 0.6, 0.52)), (0.55, (1.45, 0.72, 0.62)), (0.86, (1.85, 0.82, 0.86)), (1, (2.1, 0.83, 0.91))])

""")
s = s.replace("'cut60d_mix.wav'", "'cut60e_mix.wav'")
open(os.path.join(ROOT, 'edit60e.py'), 'w', encoding='utf-8').write(s)
print('edit60e written')
