"""60 s cut, v9: the intro in one take (its answers' glow no longer clipped); the title its own card
(PoE2.Quest presents, the arcane circle, Delve); each streak tier bursting into its colour on the
beat, framed closer tier by tier; the codex toured (collection, its items, Delve, what kills you,
achievements); a quicker hand after the flare; the blast in deep slow motion; the logo out of a
bloom of light."""
import os, json
import numpy as np
from scipy.interpolate import PchipInterpolator
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60h.py'), encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a[:90]; s = s.replace(a, b, 1)
def cut(a0, a1, b):
    global s
    i = s.index(a0); j = s.index(a1, i); s = s[:i] + b + s[j:]
marks = lambda c: {k: v / 1000 for k, v in json.load(open(os.path.join(ROOT, 'clips', c, 'stamps.json')))['marks']}

# ---- camera paths: smooth through their points (no stop at each), and speed ramps solved to land a moment ----
rep("def shot(t0, t1, name,", '''from scipy.interpolate import PchipInterpolator as _Pchip
def path(pts):
    """A camera moving smoothly through (T, z, x, y) points."""
    a = np.array(pts, float); f = _Pchip(a[:, 0], a[:, 1:], axis=0)
    return lambda T: tuple(float(v) for v in f(min(max(T, a[0, 0]), a[-1, 0])))
_fo = B.frame_of
def _frame_of(s_, T):
    p = getattr(s_, 'path', None)
    if p is not None:
        v = p(T); s_.keys = [(0, v), (1, v)]
    return _fo(s_, T)
B.frame_of = _frame_of
import numpy as np
def solve_ramp(src0, t_at, src_at, keys_before, keys_after, D):
    """A ramp [(sec, speed)]: keys_before, then a speed v held, then keys_after; v solved so the clip
    reaches src_at at t_at (seconds into the shot)."""
    lo, hi = 0.05, 6.0
    for _ in range(60):
        v = (lo + hi) / 2
        ks = keys_before + [(keys_before[-1][0] + 0.45, v), (keys_after[0][0] - 0.25, v)] + keys_after
        ts = np.linspace(0, t_at, 4001); sp = np.interp(ts, [k[0] for k in ks], [k[1] for k in ks])
        lo, hi = (v, hi) if src0 + np.trapezoid(sp, ts) < src_at else (lo, v)
    return ks
def shot(t0, t1, name,''')

# ---- the intro: one take, the camera drifting in, pushing to Headhunter, then down to the streak ----
cut("shot(0.0, H1, 'home4_hd'", "hit(H2, fl=0.25, pu=0.04)", '''_ramp = solve_ramp(0.6, H2, 7.01, [(0, 0.7), (2.55, 0.7)], [(H2 - 0.05, 0.9), (H3, 0.9)], H3)
s_ = shot(0.0, H3, 'home4_hd', src=0.6, ramp=_ramp, hand=2, tin=('fade', 1.4), sfx=1.0)
s_.path = path([(0.0, 1.04, 0.5, 0.5), (H1, 1.24, 0.6, 0.48), (4.7, 1.36, 0.625, 0.55), (H2, 1.46, 0.655, 0.585),
                (6.85, 1.64, 0.66, 0.67), (H3, 2.4, 0.625, 0.785)])
tag('tag3_daily', H1 + 0.1, H2 - 0.2)
''')

# ---- the title: its own card ----
PM = marks('presents_hd')
rep("shot(BLOW, DROP, 'stitle_hd', src=0.58, ramp=[(0, 0.9), (0.38, 0.9), (0.52, 2.6), (0.85, 2.6), (1.05, 0.3848), (3.38, 0.3848)], z=(1.5, 2.0), x=0.5, y=(0.42, 0.52), ease='in', hand=2)",
    f'''s_ = shot(BLOW, ZC_0, 'presents_hd', {PM['p1']:.3f}, at=BLOW + 0.05, speed=1.0, hand=1, sfx=0)
s_.path = path([(BLOW, 1.08, 0.5, 0.5), (DROP, 1.24, 0.5, 0.49), (ZC_0, 1.17, 0.5, 0.49)])''')
rep("shot(DROP, ZC[0], 'stitle_hd', 3.22, at=DROP, speed=0.85, z=(1.95, 1.75), x=0.5, y=0.52, ease='out', settle=0.08)\n", "")
rep("# ================= THE BUILD", "ZC_0 = T(35.009)\n# ================= THE BUILD")

# ---- the streak tiers: each bursts into its colour just after its beat, each framed closer ----
cut("SC = [37.62,", "tag('tag3_streaks'", '''SC = [37.62, 38.06, 38.5, 38.98, 39.38, 39.82, 40.22, 40.71]
STREAK_BURST = 2.77
for i, n in enumerate([3, 20, 30, 40, 60, 80, 100]):
    a, b = SC[i], SC[i + 1]
    zz = 1.55 + 0.12 * i
    shot(a, b, f'streak4_{n}_hd', STREAK_BURST, at=a + 0.05, speed=1.0, z=(zz, zz + 0.06), x=0.5 + (0.02 if i % 2 else -0.02), y=0.2,
         settle=0.09, hand=1, sfx=0.9)
    hit(a, pu=0.02)
STREAK_CUTS = []
''')
rep("tag('tag3_streaks', SC[0] + 0.05, SC[4])", "tag('tag3_streaks', SC[0] + 0.05, SC[3] - 0.05)")

# ---- the codex, toured: five holds, each on a kick ----
CM = marks('codextour_hd')
rep("shot(40.71, 42.534, 'cavein3',", "shot(40.71, 42.096, 'cavein3',")
cut("# ================= achievements, the codex", "# ================= the dynamite chapter", f'''# ================= the codex, everything it keeps =================
CT = 'codextour_hd'
shot(42.096, 42.784, CT, src=0.85, speed=1.0, hand=2, keys=[(0, (1.42, 0.5, 0.4)), (1, (1.52, 0.5, 0.42))])          # the collection
tag('tag3_codex', 42.15, 42.72)
shot(42.784, 43.666, CT, src={CM['grid'] + 0.15:.3f}, speed=1.0, hand=2, keys=[(0, (1.3, 0.44, 0.44)), (1, (1.4, 0.56, 0.5))])   # its items
hit(42.784, pu=0.02)
shot(43.666, 44.256, CT, {CM['delve']:.3f}, at=43.76, speed=1.0, hand=2, keys=[(0, (1.5, 0.5, 0.42)), (1, (1.58, 0.5, 0.44))])  # Delve
shot(44.256, 44.904, CT, src={CM['kills'] + 0.2:.3f}, speed=1.0, hand=1, keys=[(0, (1.7, 0.3, 0.36)), (1, (1.78, 0.33, 0.38))])  # what kills you
hit(44.256, pu=0.02); hit(44.69, pu=0.03)
shot(44.904, 45.716, CT, src={CM['ach'] + 0.15:.3f}, speed=1.0, hand=2, keys=[(0, (1.36, 0.5, 0.52)), (1, (1.46, 0.5, 0.56))])  # achievements
hit(44.904, pu=0.02)
tag('tag3_ach', 44.95, 45.65)

''')
rep("CAVE_END, CODEX_IN = 42.534, 43.666", "CAVE_END, CODEX_IN = 42.096, 43.666")

# ---- the flare take: its own moments; the blast from its scattering cards, in deep slow motion ----
rep("FD_FLARE, FD_BLAST = 3.86, 9.13", "FD_FLARE, FD_BLAST = 3.85, 9.17")
rep("shot(BIG, SLAM, 'flaredet_hd', 9.38, at=BIG, ramp=[(0, 0.3), (0.6, 0.26), (0.9, 0.8)]", "shot(BIG, SLAM, 'flaredet_hd', 9.42, at=BIG, ramp=[(0, 0.3), (0.55, 0.26), (0.9, 0.9)]")

# ---- the logo: out of a bloom of light ----
rep("hit(SLAM, fl=0.25, sk=16, ca=0.01, d=0.25)", "hit(SLAM, sk=6, ca=0.006, d=0.25)")
rep("    y = G.letterbox(y, B.letterbox_at(T))\n", '''    w = whiteout(T)
    if w > 0.002:
        # an exposure surge in linear light: what is bright blows out to white and cools back, the dark
        # stays dark, with a brief warm lift over the cut itself
        lin = y.clamp(0, 1) ** 2.2 * (1 + 9 * w) + _WARM * (0.3 * w ** 3)
        y = L2.to_disp(L2.shoulder(lin))
    y = G.letterbox(y, B.letterbox_at(T))
''')
rep("def frame(T, f):", '''_WARM = torch.tensor([0.80, 0.93, 1.0], device=G.dev).view(3, 1, 1)
def whiteout(T):
    """The blast's light swelling into the slam, the logo coming out of it."""
    if SLAM - 0.45 <= T < SLAM: return ((T - (SLAM - 0.45)) / 0.45) ** 2.2
    if SLAM <= T < SLAM + 1.2: return math.exp(-(T - SLAM) / 0.24)
    return 0.0
def frame(T, f):''')
rep("import math, look2 as L2, gengine as G", "import math, torch, look2 as L2, gengine as G")

# ---- the music: the composer's own remaster of the cut (same timing, to the sample) ----
rep("music = os.path.join(ROOT, 'music', 'cut60c.wav'); music60.build(music)", "music = os.path.join(ROOT, 'music', 'remaster', 'remaster.wav')")
s = s.replace("'cut60h_mix.wav'", "'cut60i_mix.wav'")
open(os.path.join(ROOT, 'edit60i.py'), 'w', encoding='utf-8').write(s)
print('edit60i written')
