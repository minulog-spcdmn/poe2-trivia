"""60 s cut, v7: the title builds without dead air (the sun burst on the blow, the empty sky rushed,
the sigil and the name given the time); the codex on its Delve page; embers in the outro that
answer the music's hits, the logo pushing in slowly and glowing on each; and a new post chain
(look2.py), with the encode's colour matrix fixed to BT.709 (gengine.py, render_fast.py)."""
import os
import numpy as np
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60f.py'), encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a[:90]; s = s.replace(a, b)

# ---- the title build: a speed ramp landing "Delve" whole on the drop ----
def solve(src0, src1, D, keys_fast):
    """keys_fast: [(sec, speed), ...] up to the slow part; returns the ramp with the slow speed solved."""
    lo, hi = 0.05, 3.0
    for _ in range(60):
        sp = (lo + hi) / 2
        ks = keys_fast + [(keys_fast[-1][0] + 0.2, sp), (D, sp)]
        ts = np.linspace(0, D, 20001); v = np.interp(ts, [k[0] for k in ks], [k[1] for k in ks])
        tot = np.trapezoid(v, ts)
        lo, hi = (sp, hi) if src0 + tot < src1 else (lo, sp)
    return [(round(a, 4), round(b, 4)) for a, b in ks]
import importlib.util, sys
sys.path.insert(0, ROOT)
os.environ.setdefault('GPU', '1')
spec = importlib.util.spec_from_file_location('e60f', os.path.join(ROOT, 'edit60f.py')); E = importlib.util.module_from_spec(spec); spec.loader.exec_module(E)
D = E.DROP - E.BLOW
RAMP = solve(0.58, 3.22, D, [(0, 0.9), (0.38, 0.9), (0.52, 2.6), (0.85, 2.6)])
print('title ramp', RAMP)
rep("shot(BLOW, DROP, 'stitle', 0.47, at=BLOW, speed=(3.22 - 0.47) / (DROP - BLOW), z=(1.55, 1.95), x=0.5, y=(0.47, 0.52), ease='in', hand=2)",
    f"shot(BLOW, DROP, 'stitle', src=0.58, ramp={RAMP}, z=(1.5, 2.0), x=0.5, y=(0.42, 0.52), ease='in', hand=2)")

# ---- the codex on its Delve page, cut on the kick before the big hit ----
rep("shot(42.78, 44.69, 'toasts3', src=2.6, speed=1.1,", "shot(42.78, 44.256, 'toasts3', src=2.6, speed=1.1,")
rep("tag('tag3_ach', 42.83, 44.6)", "tag('tag3_ach', 42.83, 44.15)")
rep("shot(44.69, 45.716, 'codex3', src=0.6, speed=1.0, z=(1.2, 1.26), x=0.5, y=0.42, settle=0.06)",
    "shot(44.256, 45.716, 'codexdelve', src=0.25, speed=1.0, hand=2, keys=[(0, (1.45, 0.5, 0.66)), (1, (1.6, 0.5, 0.68))], settle=0.05)")
rep("hit(44.69, fl=0.15, pu=0.03)", "hit(44.256, fl=0.12, pu=0.025)\nhit(44.69, pu=0.03, fl=0.06)")
rep("tag('tag3_codex', 44.74, 45.65)", "tag('tag3_codex', 44.31, 45.6)")

# ---- the new frame: look2's post chain, the embers, the logo's push ----
rep("frame = B.frame\n", '''import math, look2 as L2, gengine as G
KICKS60 = json.load(open(os.path.join(ROOT, 'music', 'kicks60c.json')))
EMB = L2.Embers([(t, s) for t, s in KICKS60 if t >= SLAM - 0.02], SLAM)
_bg0 = B.outro_bg
B.outro_bg = lambda T: _bg0(T) * 1.1
SLAMS = [o for o in B.OV if o[0] == 'slam']
B.OV[:] = [o for o in B.OV if o[0] != 'slam']

def overlays(img, T):
    for kind, name, t0, t1 in SLAMS:
        if not (t0 <= T < t1 + 0.4): continue
        u = T - t0
        e, _ = EMB.energy(T)
        sc = 1.0 + 0.06 * math.exp(-u / 0.09) + 0.05 * B.ease_io(min(1.0, u / 7.8))
        dy = -40 * G.PX * B.ease_io(min(1.0, max(0.0, (T - (OUT_A - 0.4)) / 0.7)))
        glow = min(0.55, 0.12 * e)
        if glow > 0.01: img = G.put_card(img, name, opacity=glow, scale=sc * 1.004, dy=dy, blur=9 * G.PX)
        img = G.put_card(img, name, opacity=min(1, u / 0.04), scale=sc, dy=dy)
        img = G.card_sweep(img, name, (u - 0.15) / 1.1, 1.0)
    return B.overlays(img, T)

def frame(T, f):
    img = B.base(T)
    lin = L2.to_lin(img)
    if T >= SLAM: lin = lin + EMB.render(T)
    lin = L2.bloom(lin)
    for (t, a, d, c) in B.FL:
        if 0 <= T - t < d * 5: lin = L2.flash(lin, a * math.exp(-(T - t) / d), c)
    lin = L2.halation(lin)
    lin = L2.vignette(lin)
    y = L2.colour(L2.to_disp(L2.shoulder(lin)))
    y = L2.ca(y, B.env(B.CA, T))
    y = L2.sharpen(y)
    y = overlays(y, T)
    y = G.letterbox(y, B.letterbox_at(T))
    if T > DUR - 1.2: y = y * B.smooth((DUR - T) / 1.2)
    return L2.grain(y, f)
''')
s = s.replace("'cut60f_mix.wav'", "'cut60g_mix.wav'")
open(os.path.join(ROOT, 'edit60g.py'), 'w', encoding='utf-8').write(s)
print('edit60g written')
