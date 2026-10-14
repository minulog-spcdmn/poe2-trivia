"""PoE2.Quest • Delve, the 60-second cut, v10, on the composer's remaster of its music.

A cold open (four flashes, then the dark), the start page in one take, twelve players, the vote, a
tooltip and the codex before the title; PoE2.Quest presents Delve; ten zones and the endless below;
the vein, a revive, streak fire; the last life lost to the dark, the end screen and what it earned,
matched into the achievements; the flare and dynamite on one question; the blast into the logo.
Feature titles are few and large, over the shot defocused behind them; the cuts carry the game's own
transition sounds; the game's sounds are set against the music by loudness (mixer2)."""
import os, json, math
import numpy as np
import edit4 as B          # the renderer; its shot list is replaced below
from engine2 import Shot
import music60c as music60
from scipy.interpolate import PchipInterpolator as _Pchip

ROOT = B.ROOT
S, OV, FT = [], [], []
FL, SK, PU, CA = [], [], [], []
T = music60.T_of

def path(pts):
    """A camera moving smoothly through (T, z, x, y) points."""
    a = np.array(pts, float); f = _Pchip(a[:, 0], a[:, 1:], axis=0)
    return lambda t: tuple(float(v) for v in f(min(max(t, a[0, 0]), a[-1, 0])))
_fo = B.frame_of
def _frame_of(s_, t):
    p = getattr(s_, 'path', None)
    if p is not None:
        v = p(t); s_.keys = [(0, v), (1, v)]
    return _fo(s_, t)
B.frame_of = _frame_of
ANIM = os.environ.get('ANIM') == '1'
ANIM_RATE = 24.0
def _stepped(s_, t):
    """The source time held on the shot's own twos or threes (from its first frame), the camera running on."""
    k = getattr(s_, 'step', 2)
    if k <= 1: return None
    n = math.floor((t - s_.t0) * ANIM_RATE / k + 1e-6)
    return s_.t0 + n * k / ANIM_RATE
_fo2 = B.frame_of
def _frame_of_anim(s_, t):
    if not ANIM: return _fo2(s_, t)
    tq = _stepped(s_, t)
    if tq is None: return _fo2(s_, t)
    orig = s_.src_at
    s_.src_at = lambda T, _o=orig, _q=tq: _o(_q)
    try: return _fo2(s_, t)
    finally: del s_.src_at
B.frame_of = _frame_of_anim
def solve_ramp(src0, t_at, src_at, keys_before, keys_after):
    """A ramp [(sec, speed)]: keys_before, a speed v held, keys_after; v solved so the clip reaches src_at at t_at."""
    lo, hi = 0.05, 6.0
    for _ in range(60):
        v = (lo + hi) / 2
        ks = keys_before + [(keys_before[-1][0] + 0.45, v), (keys_after[0][0] - 0.25, v)] + keys_after
        ts = np.linspace(0, t_at, 4001); sp = np.interp(ts, [k[0] for k in ks], [k[1] for k in ks])
        lo, hi = (v, hi) if src0 + np.trapezoid(sp, ts) < src_at else (lo, v)
    return ks
def ramp_into(t0, t1, at, moment, pre=0.42, slow=0.38, post=1.15, base=1.0):
    """(src, ramp) for a shot that eases down to `slow` over the `pre` seconds before `at`, shows the clip's
    `moment` exactly at `at`, then snaps on at `post`."""
    a = at - t0
    ks = [(0.0, base)]
    if a - pre > 0.05: ks.append((a - pre, base))
    ks += [(max(0.0, a - pre * 0.45), slow), (a - 0.004, slow), (a + 0.004, post), (t1 - t0 + 1.0, post)]
    ks = sorted({round(k, 4): v for k, v in ks}.items())
    ts = np.linspace(0, a, 4001); sp = np.interp(ts, [k for k, _ in ks], [v for _, v in ks])
    return moment - np.trapezoid(sp, ts), ks
def shot(t0, t1, name, moment=None, at=None, speed=1.0, src=None, sfx=1.0, keys=None, **kw):
    if src is None: src = moment - ((at if at is not None else t0) - t0) * speed
    s = Shot(t0, t1, name, src, speed=speed, **kw); s.sfx_gain = sfx
    if keys: s.keys = keys
    S.append(s); return s
def hit(t, fl=0.0, sk=0.0, pu=0.0, ca=0.0, d=0.22, c=(0.75, 0.88, 1.0)):
    if fl: FL.append((t, fl, d, c))
    if sk: SK.append((t, sk, d * 1.6))
    if pu: PU.append((t, pu, d * 0.8))
    if ca: CA.append((t, ca, d))
def title(name, t0, t1, defocus=True): FT.append((name, t0, t1, defocus))
lock = B.lock
marks = lambda c: {k: v / 1000 for k, v in json.load(open(os.path.join(ROOT, 'clips', c, 'stamps.json')))['marks']}

H1, H2, H3, H4, H5 = T(9.86), T(12.797), T(15.475), T(17.846), T(19.782)
BUILD, BLOW, DROP = T(21.12), T(29.813), T(33.193)
SPLICE = T(38.6841)
STOP, BIG, BIG2 = T(200.253), T(201.633), T(202.572)
SLAM, OUT_A, OUT_B = BIG2, T(220.06), T(221.0)
DUR = music60.DURATION
ZC_0 = T(35.009)

LL = marks('lastlife_hd')
DARK = [(40.714, 42.62)]                 # the darkness closing in to black

# ================= INTRO • the start page in one take, Headhunter on the hit =================
_ramp = solve_ramp(1.55, H2, 7.01, [(0, 0.95), (0.3, 0.95)], [(H2 - 0.05, 0.9), (H3, 0.9)])
s_ = shot(0.0, H3, 'home4_hd', src=1.55, ramp=_ramp, hand=2, tin=('fade', 0.5), sfx=1.0)
s_.path = path([(0.0, 1.1, 0.56, 0.5), (H1, 1.25, 0.6, 0.49), (4.7, 1.36, 0.625, 0.55), (H2, 1.46, 0.655, 0.585),
                (6.85, 1.64, 0.66, 0.67), (H3, 2.4, 0.625, 0.785)])
hit(H2, fl=0.25, pu=0.04)

# ================= twelve players, the portal, the vote, the draw =================
shot(H3, H4, 'lobby12', src=1.0, speed=1.0, hand=2, keys=[(0, (1.3, 0.37, 0.61)), (1, (1.27, 0.38, 0.61))])
title('tag4_twelve', H3 + 0.06, H3 + 1.0)
shot(H4, 11.74, 'lobby12', src=5.15 - 0.06 * 0.32, ramp=[(0, 0.32), (0.22, 0.32), (0.4, 0.95), (2, 0.95)], z=(1.35, 1.2), x=0.5, y=0.33, settle=0.07, hand=3)
hit(H4, fl=0.3, sk=6, pu=0.04, ca=0.003, d=0.28)
shot(11.74, H5, 'coop12', src=7.6, speed=1.2, z=(1.45, 1.5), x=0.5, y=0.6, hand=2)
shot(H5, BUILD, 'coop12', 10.76, at=H5, ramp=[(0, 0.3), (0.3, 0.3), (0.5, 1.0), (3, 1.0)], z=(1.55, 1.45), x=0.5, y=0.62, settle=0.06)
hit(H5, fl=0.22, sk=4, ca=0.003)

# ================= THE BUILD • a tooltip, the codex, a ward, a flare, twelve answer =================
shot(BUILD, 16.162, 'tooltip3', 1.40, at=14.6, speed=1.0, hand=1,
     keys=[(0, (1.85, 0.4, 0.62)), (0.22, (1.8, 0.4, 0.6)), (0.6, (1.17, 0.43, 0.47)), (1, (1.15, 0.435, 0.47))])
CT = 'codextour_hd'; CM = marks(CT)
shot(16.162, 17.206, CT, src=0.85, speed=1.0, hand=2, keys=[(0, (1.36, 0.5, 0.42)), (1, (1.5, 0.5, 0.43))])          # the collection
title('tag4_codex', 16.22, 16.98)
shot(17.206, 18.40, CT, src=CM['grid'] + 0.15, speed=1.0, hand=2, keys=[(0, (1.3, 0.44, 0.44)), (1, (1.42, 0.56, 0.5))])  # its items
shot(18.40, 19.186, CT, CM['delve'], at=18.52, speed=1.0, hand=2, keys=[(0, (1.5, 0.5, 0.42)), (1, (1.58, 0.5, 0.44))])  # Delve
shot(19.186, 19.848, CT, src=CM['kills'] + 0.2, speed=1.0, hand=1, keys=[(0, (1.7, 0.3, 0.36)), (1, (1.78, 0.33, 0.38))])  # what kills you
_s, _r = ramp_into(19.848, 20.966, 20.296, 2.00, pre=0.36, slow=0.35, post=1.1)
shot(19.848, 20.966, 'ward3', src=_s, ramp=_r, z=(1.45, 1.35), x=0.55, y=0.4, settle=0.04, hand=2)
hit(20.296, fl=0.22, sk=5, c=(1.0, 0.75, 0.45))
shot(20.966, 21.676, 'flare3', 2.63, at=21.02, speed=1.0, z=(1.45, 1.32), x=0.62, y=0.4, settle=0.05)
hit(21.02, fl=0.25, sk=4, ca=0.004, c=(0.85, 0.6, 1.0))
shot(21.676, BLOW, 'coop12', 12.2, at=22.21, speed=1.0, z=(1.4, 1.3), x=0.52, y=0.68, settle=0.04, hand=2)
hit(22.21, fl=0.25, pu=0.03)

# ================= PoE2.Quest presents • Delve, locked on the drop =================
PM = marks('presents_hd')
s_ = shot(BLOW, ZC_0, 'presents_hd', PM['p1'], at=BLOW + 0.05, speed=1.0, hand=1, sfx=0)
s_.path = path([(BLOW, 1.08, 0.5, 0.5), (DROP, 1.24, 0.5, 0.49), (ZC_0, 1.17, 0.5, 0.49)])
GLOW_TITLE = (BLOW, ZC_0)                             # its warm glow, drawn here in floating point (no banding)
hit(DROP, fl=0.32, sk=12, pu=0.05, ca=0.004, d=0.12)

# ================= ten zones, then the endless deep =================
ZC = [T(x) for x in [35.009, 35.601, 36.193, 36.489, 36.785, 37.09, 37.38, 37.673, 37.969, 38.111, 38.407]] + [SPLICE]
for i, z in enumerate([11, 21, 31, 51, 61, 81, 91, 101, 111, 121, 141]):
    t0, t1 = ZC[i], ZC[i + 1]
    shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.4, at=t0, z=(1.42, 1.37), x=(0.5 + (0.015 if i % 2 else -0.015), 0.5), y=0.475,
         ease='out', settle=0.05, sfx=0.6 if i < 3 else 0.35)
    hit(t0, fl=0.1 if i == 0 else 0.0, pu=0.012, d=0.08)
title('tag4_zones', ZC[0] + 0.05, ZC[2] - 0.05, defocus=False)
title('tag4_endless', ZC[7] + 0.02, ZC[11] - 0.05, defocus=False)

# ================= the vein, a revive, streak fire =================
shot(SPLICE, 32.91, 'vein3_hd', 3.46, at=32.498, speed=1.0, z=(1.3, 1.2), x=0.5, y=0.5, hand=2)
hit(32.498, fl=0.22, c=(1.0, 0.75, 0.45))
title('tag4_vein', SPLICE + 0.04, 32.42)
_s, _r = ramp_into(32.91, 34.08, 33.63, 7.66, pre=0.4, slow=0.35, post=1.1)
shot(32.91, 34.08, 'vein3_hd', src=_s, ramp=_r, z=(1.4, 1.45), x=0.62, y=0.5, hand=2)
hit(33.63, fl=0.15, c=(0.7, 1.0, 0.7))
shot(34.08, 35.69, 'vein3_hd', 18.65, at=34.18, speed=1.0, hand=2,
     keys=[(0, (1.6, 0.58, 0.5)), (0.3, (1.25, 0.5, 0.35)), (0.82, (2.2, 0.49, 0.1)), (1, (2.3, 0.49, 0.1))])
hit(34.18, fl=0.3, d=0.35, c=(0.45, 0.8, 1.0))
shot(35.69, 37.62, 'revive3_hd', 3.80, at=35.83, speed=(5.75 - 3.8) / (37.5 - 35.83), z=(1.85, 1.75), x=0.45, y=0.17, hand=2)
title('tag4_revive', 35.75, 36.48)
SC = [37.62, 38.06, 38.5, 38.98, 39.38, 39.82, 40.22, 40.714]
for i, n in enumerate([3, 20, 30, 40, 60, 80, 100]):
    a, b = SC[i], SC[i + 1]
    zz = 1.55 + 0.12 * i
    shot(a, b, f'streak4_{n}_hd', 2.77, at=a + 0.05, speed=1.0, z=(zz, zz + 0.06), x=0.5 + (0.02 if i % 2 else -0.02), y=0.2,
         settle=0.09, hand=1, sfx=0.9)
    hit(a, pu=0.02)
title('tag4_streaks', SC[0] + 0.04, SC[2] - 0.04, defocus=False)

# ================= the last life: the dark closes in, a wrong answer, the end; what it earned =================
WRONG = 3.588                                           # lastlife_hd: the wrong answer's reveal
_s, _r = ramp_into(40.714, 42.62, 41.5, WRONG, pre=0.45, slow=0.32, post=1.0)
shot(40.714, 42.62, 'lastlife_hd', src=_s, ramp=_r, hand=2,
     keys=[(0, (1.35, 0.6, 0.42)), (0.4, (1.5, 0.62, 0.4)), (1, (1.7, 0.6, 0.38))])
hit(41.5, fl=0.18, sk=7, ca=0.005, c=(1.0, 0.55, 0.45))
s_ = shot(42.784, 45.716, 'lastlife_hd', src=5.712, speed=1.25, hand=1, tin=('fade', 0.3))
s_.path = path([(42.784, 1.1, 0.56, 0.54), (44.0, 1.15, 0.62, 0.6), (44.69, 1.3, 0.7, 0.68), (45.25, 2.3, 0.8, 0.79), (45.716, 2.5, 0.81, 0.8)])
s_.step = 3
hit(44.69, pu=0.035)

# ================= the dynamite chapter: the dark closes in, a flare; the fuse burns to 0 =================
FD_FLARE, FD_BLAST = 3.85, 9.17
FD_SPEED = (FD_BLAST - FD_FLARE) / (BIG - 47.06)
_post = FD_SPEED
for _ in range(40):                                    # the speed after the burst that meets the next shot at 49.30
    _s, _r = ramp_into(45.716, 49.30, 47.06, FD_FLARE, pre=0.42, slow=0.32, post=_post, base=FD_SPEED)
    _end = FD_FLARE + _post * (49.30 - 47.06)
    _want = FD_BLAST - (BIG - 49.30) * FD_SPEED
    _post += (_want - _end) / (49.30 - 47.06)
shot(45.716, 49.30, 'flaredet_hd', src=_s, ramp=_r, hand=2,
     keys=[(0, (1.25, 0.6, 0.38)), (0.3, (1.45, 0.68, 0.34)), (0.45, (1.6, 0.74, 0.37)), (1, (1.42, 0.69, 0.44))])
hit(47.06, fl=0.26, sk=5, ca=0.004, c=(0.85, 0.6, 1.0))
title('tag4_finds', 45.78, 46.55)
shot(49.30, STOP, 'flaredet_hd', FD_BLAST, at=BIG, speed=FD_SPEED, hand=2, keys=[(0, (1.95, 0.72, 0.56)), (1, (1.8, 0.74, 0.64))])
hit(49.30, pu=0.02)
shot(STOP, BIG, 'flaredet_hd', FD_BLAST, at=BIG, speed=FD_SPEED, hand=1,
     keys=[(0, (1.45, 0.58, 0.74)), (0.55, (1.75, 0.76, 0.84)), (1, (2.2, 0.83, 0.92))])
hit(STOP, pu=0.03)

# ================= THE BLAST • the logo out of its light =================
shot(BIG, SLAM, 'flaredet_hd', 9.42, at=BIG, ramp=[(0, 0.3), (0.55, 0.26), (0.9, 0.9)], z=(1.3, 1.12), x=(0.42, 0.47), y=(0.5, 0.5), sfx=0)
hit(BIG, sk=22, ca=0.012, fl=0.3, d=0.16)
OV += [('rise', 'end_out', OUT_A - 0.02, DUR + 1), ('rise', 'end_credit', OUT_B - 0.02, DUR + 1)]
SLAMS = [('slam', 'logo2', SLAM, DUR + 1)]
hit(SLAM, sk=6, ca=0.006, d=0.25)
hit(OUT_A, fl=0.1, d=0.3); hit(OUT_B, fl=0.07, d=0.3)

# ---- on twos and threes: impacts on ones, the weighty moments on threes, the rest on twos ----
for s_ in S:
    if s_.t1 <= 1.31: s_.step = 1                                  # the cold open's flashes
    elif s_.clip in ('presents_hd',) or (s_.clip == 'flaredet_hd' and s_.t0 >= BIG - 1e-3): s_.step = 3
    elif s_.clip == 'lastlife_hd' and s_.t0 > 42: s_.step = 3       # the end screen
# ---- install into the renderer ----
S.sort(key=lambda s: s.t0)
B.S[:] = S; B.OV[:] = OV
for l, new in zip([B.FL, B.SK, B.PU, B.CA], [FL, SK, PU, CA]): l[:] = new
B.DURATION = DUR; B.DROP = DROP; B.STOP = STOP; B.BIG = BIG; B.SLAM = SLAM; B.OUT1 = OUT_A
DURATION = DUR
import torch, look2 as L2, gengine as G, trans as TR
_bg0 = B.outro_bg
B.outro_bg = lambda t: _bg0(t) * 1.05
_letterbox0 = B.letterbox_at
B.letterbox_at = _letterbox0

# ---- the cuts: the game's own transition sounds under them ----
CUTS = [
    TR.Cut(8.475, 'whip', 0.11, dir=(-1.0, 0.0)),                 # the daily, to the lobby
    TR.Cut(11.74, 'light', 0.22, focus=(0.5, 0.5), radius=0.3, color=(0.45, 0.75, 1.0), glow=0.35, gain=0.6),
    TR.Cut(14.12, 'whip', 0.11, dir=(0.0, -1.0)),                 # the draw, up to the tooltip
    TR.Cut(16.162, 'zoom', 0.12, focus=(0.42, 0.5), into=0.8),    # through the tooltip into the codex
    TR.Cut(17.206, 'whip', 0.10, dir=(0.0, -1.0)),                # down the collection to its items
    TR.Cut(18.40, 'whip', 0.10, dir=(-1.0, 0.0)),                 # across to the Delve page
    TR.Cut(19.186, 'whip', 0.10, dir=(0.0, -1.0)),                # down to what kills you
    TR.Cut(22.813, 'light', 0.18, focus=(0.5, 0.4), radius=0.2, color=(0.4, 0.75, 1.0), glow=0.5, gain=0.7),
    TR.Cut(31.684, 'zoom', 0.12, focus=(0.5, 0.45), into=0.9),    # out of the zones, into the vein
    TR.Cut(35.69, 'whip', 0.11, dir=(-1.0, 0.0)),                 # the vein, to the revive
    TR.Cut(37.62, 'whip', 0.11, dir=(-1.0, 0.0)),                 # the revive, to the streak
]
SFX = os.path.join(ROOT, 'music', 'sfxbank')
CUES = []
for c in CUTS:
    if c.kind == 'whip': CUES.append((c.t, os.path.join(SFX, 'zoneDrift.wav'), 0.0))
    elif c.kind == 'zoom': CUES.append((c.t, os.path.join(SFX, 'zoneLock.wav'), 0.0))
    elif c.kind == 'light': CUES.append((c.t + 0.05, os.path.join(SFX, 'zoneSting.wav'), 2.0))
CUES += [(42.70, os.path.join(SFX, 'defeat.wav'), 1.0),           # the end of the descent, into the end screen
         (44.69, os.path.join(SFX, 'zoneSting.wav'), -2.0)]       # in on the achievements

def _shot_at(t, start):
    for s_ in B.S:
        if abs((s_.t0 if start else s_.t1) - t) < 2e-3: return s_
SOFT_CUTS = [c.t for c in CUTS]                       # transitions: blurred across like any motion
def shot_image(t):
    for c in CUTS:
        lo, hi = TR.reach(c)
        if c.t - lo <= t < c.t + hi:
            a, b = _shot_at(c.t, False), _shot_at(c.t, True)
            if a is None or b is None: break
            ia = B.frame_of(a, min(t, a.t1 - 1e-4))
            ib = B.frame_of(b, max(t, b.t0))
            return TR.apply(c, t, ia, ib)
    return B.base(t)

# ---- the dark closing in; the title's glow; feature titles over a defocused shot ----
_R = None
def darkness(img, t):
    global _R
    for a, b in DARK:
        if a <= t < b + 0.25:
            if _R is None:
                _R = (torch.sqrt(((G._xs - G.W / 2) / (G.W / 2)) ** 2 * 0.75 + ((G._ys - G.H / 2) / (G.H / 2)) ** 2) / 1.17).unsqueeze(0)
            k = min(1.0, max(0.0, (t - a) / (b - a)))
            r = 1.55 * (1 - k ** 2.4)                      # it creeps in, then closes fast
            m = ((r - _R) / 0.6).clamp(0, 1) ** 1.6
            return img * m
    return img
_glow = None
def title_glow(lin, t):
    global _glow
    if not (GLOW_TITLE[0] <= t < GLOW_TITLE[1]): return lin
    if _glow is None:
        r = torch.sqrt(((G._xs - G.W / 2) / (G.W * 0.34)) ** 2 + ((G._ys - G.H / 2) / (G.H * 0.5)) ** 2)
        _glow = (torch.exp(-r ** 2 * 1.4).unsqueeze(0) * torch.tensor([0.0016, 0.0042, 0.0075], device=G.dev).view(3, 1, 1))
    u = min(1.0, (t - GLOW_TITLE[0]) / 0.8)
    return lin + _glow * u
def titles_up(t):
    """(card, opacity, defocus) of the feature title showing at t."""
    for name, a, b, df in FT:
        if a <= t < b + 0.25:
            o = min(B.ease_out(min(1, (t - a) / 0.18)), B.smooth(max(0.0, (b - t) / 0.22)) if t < b else 0.0)
            return name, o, df
    return None

def overlays(img, t):
    for kind, name, t0, t1 in SLAMS:
        if not (t0 <= t < t1 + 0.4): continue
        u = t - t0
        sc = 1.0 + 0.06 * math.exp(-u / 0.09) + 0.05 * B.ease_io(min(1.0, u / 7.8))
        dy = -40 * G.PX * B.ease_io(min(1.0, max(0.0, (t - (OUT_A - 0.4)) / 0.7)))
        img = G.put_card(img, name, opacity=min(1, u / 0.04), scale=sc, dy=dy)
        img = G.card_sweep(img, name, (u - 0.15) / 1.1, 1.0)
    up = titles_up(t)
    if up:
        name, o, _ = up
        img = G.put_card(img, name, opacity=o, scale=1.0 + 0.03 * (1 - o), blur=4 * (1 - o))
    return B.overlays(img, t)

_WARM = torch.tensor([0.80, 0.93, 1.0], device=G.dev).view(3, 1, 1)
def whiteout(t):
    if SLAM - 0.45 <= t < SLAM: return ((t - (SLAM - 0.45)) / 0.45) ** 2.2
    if SLAM <= t < SLAM + 1.2: return math.exp(-(t - SLAM) / 0.24)
    return 0.0

import grade as _grade
GR = _grade.Grade(os.path.join(ROOT, 'grade.json'), [s_ for s_ in B.S if s_.t0 < SLAM], enabled=os.environ.get('GRADE_OFF') != '1')
def frame(t, f):
    img = darkness(shot_image(t), t)
    up = titles_up(t)
    if up and up[2] and up[1] > 0.01:                     # a feature title: the shot behind it goes soft and dim
        o = up[1]
        img = img * (1 - o) + G.gblur(img, 9 * G.PX) * (0.5 * o)
    lin = L2.to_lin(img)
    lin = title_glow(lin, t)
    lin = L2.bloom(lin)
    for (t0, a, d, c) in B.FL:
        if 0 <= t - t0 < d * 5: lin = L2.flash(lin, a * math.exp(-(t - t0) / d), c)
    lin = L2.halation(lin, 0.11)
    lin = L2.vignette(lin)
    y = L2.colour(L2.to_disp(L2.shoulder(lin)))
    y = GR.apply(y, t)                                    # the shot's own grade
    m = GR.ui_mask(y) if GR.on else None
    if m is not None: y = GR.chapter(y, t, m)             # the chapter's colour, on the backdrop
    y = L2.ca(y, B.env(B.CA, t))
    y = y + (L2.sharpen(y) - y) * m if m is not None else L2.sharpen(y)   # sharpened: the UI only
    y = overlays(y, t)
    w = whiteout(t)
    if w > 0.002:
        lin = y.clamp(0, 1) ** 2.2 * (1 + 9 * w) + _WARM * (0.3 * w ** 3)
        y = L2.to_disp(L2.shoulder(lin))
    # gate weave: the frame sits a little loose in the gate, drifting a fraction of a pixel; and a breath of flicker
    wx = 0.55 * math.sin(t * 2 * math.pi * 1.7 + 0.3) + 0.35 * math.sin(t * 2 * math.pi * 3.9 + 1.9)
    wy = 0.45 * math.sin(t * 2 * math.pi * 1.3 + 2.4) + 0.3 * math.sin(t * 2 * math.pi * 4.6 + 0.7)
    y = G.camera(y, 1.0, 0.5, 0.5, 0.0, wx * G.PX, wy * G.PX, clamp=False)
    y = y * (1 + 0.006 * math.sin(t * 2 * math.pi * 11.3) + 0.004 * math.sin(t * 2 * math.pi * 17.9 + 1.0))
    y = G.letterbox(y, B.letterbox_at(t))
    if t > DUR - 1.2: y = y * B.smooth((DUR - t) / 1.2)
    return L2.grain(y, f, amount=0.0)

def build_sound():
    import mixer2
    music = os.path.join(ROOT, 'music', 'remaster', 'remaster.wav')
    out = os.path.join(ROOT, 'music', 'cut60p_mix.wav')
    mixer2.mix(music, B.S, out, cues=CUES)
    return out
B.build_sound = build_sound
