"""PoE2.Quest • Delve, the 60-second cut: its own edit on its own music path (music60.py).
Intro (26 s, the tension rising hit by hit), the drop, the Delve features, Detonate in the stop,
the blast into the together and meta block, four hero stabs, the clock into the slam, a short card."""
import os, json
import edit4 as B          # the renderer (frame, camera, grade, overlays); its shot list is replaced below
from engine2 import Shot
import music60c as music60

ROOT = B.ROOT
S, OV = [], []
FL, SK, PU, CA = [], [], [], []
KICKS = [t for t, s in json.load(open(os.path.join(ROOT, 'music', 'kicks60c.json')))]
T = music60.T_of

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
def tag(name, t0, t1): OV.append(('tag', name, t0, t1))
lock = B.lock

# music landmarks (measured attacks, mapped from the track)
H1, H2, H3, H4, H5 = T(9.86), T(12.797), T(15.475), T(17.846), T(19.782)
BUILD, BLOW, DROP = T(21.12), T(29.813), T(33.193)
SPLICE = T(38.6841)
STOP, BIG, BIG2 = T(200.253), T(201.633), T(202.572)
SLAM, OUT_A, OUT_B = BIG2, T(220.06), T(221.0)
DUR = music60.DURATION

# ================= INTRO • the start page, Today's unique =================
shot(0.0, H1, 'home4_hd', src=0.6, speed=0.7, hand=2, tin=('fade', 1.4), sfx=0,
     keys=[(0, (1.04, 0.5, 0.5)), (1, (1.22, 0.6, 0.46))])
# drawn to Mageblood, a moment's doubt, then Headhunter on the second hit
shot(H1, H2, 'home4_hd', 7.01, at=H2, speed=1.4, hand=2, keys=[(0, (1.32, 0.62, 0.55)), (1, (1.4, 0.63, 0.56))])
tag('tag3_daily', H1 + 0.1, H2 - 0.2)
shot(H2, H3, 'home4_hd', 7.01, at=H2, speed=0.9, hand=2, keys=[(0, (1.45, 0.66, 0.58)), (0.35, (1.6, 0.66, 0.66)), (1, (2.45, 0.625, 0.785))])
hit(H2, fl=0.25, pu=0.04)
# ================= twelve players, the portal, the vote, the draw =================
shot(H3, H4, 'lobby12', src=1.0, speed=1.0, hand=2, keys=[(0, (1.3, 0.37, 0.61)), (1, (1.27, 0.38, 0.61))])
hit(H3, pu=0.02)
tag('tag3_twelve', H3 + 0.1, H4 - 0.2)
shot(H4, 11.74, 'lobby12', 5.15, at=H4 + 0.06, speed=0.8, z=(1.35, 1.2), x=0.5, y=0.33, settle=0.07, hand=3)
hit(H4, fl=0.3, sk=6, pu=0.04, ca=0.003, d=0.28)
shot(11.74, H5, 'coop12', src=7.6, speed=1.2, z=(1.45, 1.5), x=0.5, y=0.6, hand=2)
tag('tag3_together', 11.8, BUILD - 0.15)
shot(H5, BUILD, 'coop12', 10.76, at=H5, speed=0.75, z=(1.55, 1.45), x=0.5, y=0.62, settle=0.06)
hit(H5, fl=0.22, sk=4, ca=0.003)

# ================= THE BUILD • quickening =================
shot(BUILD, 16.16, 'tooltip3', 1.40, at=14.6, speed=1.0, hand=1,
     keys=[(0, (1.85, 0.4, 0.62)), (0.22, (1.8, 0.4, 0.6)), (0.6, (1.17, 0.43, 0.47)), (1, (1.15, 0.435, 0.47))])
tag('tag3_tooltips', BUILD + 0.08, 15.35)
shot(16.16, 19.85, 'art_auspex2', 5.25, at=19.41, speed=1.0, hand=2, keys=[(0, (1.45, 0.3, 0.66)), (0.82, (1.38, 0.42, 0.66)), (1, (1.3, 0.5, 0.64))])
hit(19.41, fl=0.2, pu=0.03)
shot(19.85, 20.97, 'ward3', 2.00, at=20.30, speed=1.0, z=(1.45, 1.35), x=0.55, y=0.4, settle=0.04, hand=2)
hit(20.30, fl=0.22, sk=5, c=(1.0, 0.75, 0.45))
tag('tag3_wards', 19.9, 20.9)
shot(20.97, 21.68, 'flare3', 2.63, at=21.02, speed=1.0, z=(1.45, 1.32), x=0.62, y=0.4, settle=0.05)
hit(21.02, fl=0.25, sk=4, ca=0.004, c=(0.85, 0.6, 1.0))
shot(21.68, BLOW, 'coop12', 12.2, at=22.21, speed=1.0, z=(1.4, 1.3), x=0.52, y=0.68, settle=0.04, hand=2)
hit(22.21, fl=0.25, pu=0.03)
# the title spells itself out and locks on the drop
shot(BLOW, DROP, 'stitle_hd', src=0.58, ramp=[(0, 0.9), (0.38, 0.9), (0.52, 2.6), (0.85, 2.6), (1.05, 0.3848), (3.38, 0.3848)], z=(1.5, 2.0), x=0.5, y=(0.42, 0.52), ease='in', hand=2)

# ================= THE DROP =================
ZC = [T(x) for x in [35.009, 35.601, 36.193, 36.489, 36.785, 37.09, 37.38, 37.673, 37.969, 38.111, 38.407]] + [SPLICE]
shot(DROP, ZC[0], 'stitle_hd', 3.22, at=DROP, speed=0.85, z=(1.95, 1.75), x=0.5, y=0.52, ease='out', settle=0.08)
hit(DROP, fl=0.32, sk=12, pu=0.05, ca=0.004, d=0.12)
for i, z in enumerate([11, 21, 31, 51, 61, 81, 91, 101, 111, 121, 141]):
    t0, t1 = ZC[i], ZC[i + 1]
    shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.4, at=t0, z=(1.42, 1.37), x=(0.5 + (0.015 if i % 2 else -0.015), 0.5), y=0.475,
         ease='out', settle=0.05, sfx=0.6 if i < 3 else 0.35)
    hit(t0, fl=0.1 if i == 0 else 0.0, pu=0.012, d=0.08)
tag('tag3_zones', ZC[0] + 0.05, ZC[7] - 0.12)
tag('tag3_endless', ZC[7] + 0.02, ZC[11] - 0.05)

# ================= DELVE • the vein, a revive, streak fire, a cave-in =================
shot(SPLICE, 32.91, 'vein3_hd', 3.46, at=32.09, speed=1.0, z=(1.3, 1.2), x=0.5, y=0.5, hand=2)
hit(32.09, fl=0.22, c=(1.0, 0.75, 0.45))
tag('tag3_vein', SPLICE + 0.05, 35.55)
shot(32.91, 34.08, 'vein3_hd', 7.66, at=33.63, speed=1.0, z=(1.4, 1.45), x=0.62, y=0.5, hand=2)
hit(33.63, fl=0.15, c=(0.7, 1.0, 0.7))
shot(34.08, 35.69, 'vein3_hd', 18.65, at=34.18, speed=1.0, hand=2,
     keys=[(0, (1.6, 0.58, 0.5)), (0.3, (1.25, 0.5, 0.35)), (0.82, (2.2, 0.49, 0.1)), (1, (2.3, 0.49, 0.1))])
hit(34.18, fl=0.3, d=0.35, c=(0.45, 0.8, 1.0))
shot(35.69, 37.62, 'revive3_hd', 3.80, at=35.83, speed=(5.75 - 3.8) / (37.5 - 35.83), z=(1.85, 1.75), x=0.45, y=0.17, hand=2)
tag('tag3_revive', 35.74, 37.5)
SC = [37.62, 38.06, 38.5, 38.98, 39.38, 39.82, 40.22, 40.71]
def streak_cam(T):
    u = B.ease_io(min(1.0, max(0.0, (T - SC[0]) / (SC[-1] - SC[0]))))
    return (1.22 + 0.3 * u, 0.5, 0.42 - 0.08 * u)
for i, n in enumerate([3, 20, 30, 40, 60, 80, 100]):
    a, b = SC[i], SC[i + 1]
    keys = [(k / 8, streak_cam(a + (b - a) * k / 8)) for k in range(9)]
    shot(a, b, f'streak4_{n}', src=2.3, speed=1.0, keys=keys, sfx=0.8)
STREAK_CUTS = SC[1:-1]
tag('tag3_streaks', SC[0] + 0.05, SC[4])
shot(40.71, 42.534, 'cavein3', 4.98, at=41.5, speed=1.0, z=(1.4, 1.25), x=0.35, y=0.5, settle=0.04, hand=2)
hit(41.5, sk=20, ca=0.009, fl=0.18, c=(0.45, 0.45, 1.0), d=0.3)

# ================= achievements, the codex =================
shot(42.534, 43.666, 'toasts3_hd', src=2.75, speed=1.1, hand=2, keys=[(0, (2.0, 0.81, 0.79)), (1, (2.3, 0.83, 0.82))])
tag('tag3_ach', 42.6, 43.55)
# the Delve tab clicked: the collection gives way to the deepest run
shot(43.666, 44.69, 'codexseq_hd', 1.46, at=44.08, speed=1.0, hand=2,
     keys=[(0, (1.7, 0.56, 0.36)), (0.3, (1.6, 0.54, 0.38)), (1, (1.42, 0.5, 0.47))])
tag('tag3_codex', 43.72, 44.6)
# on the hit: what kills you, held to be read
shot(44.69, 45.716, 'codexseq_hd', src=5.75, speed=0.9, hand=1, keys=[(0, (1.62, 0.34, 0.37)), (1, (1.68, 0.38, 0.39))])
hit(44.69, pu=0.02)

# ================= the dynamite chapter: the dark closes in, a flare; the fuse burns to 0 =================
FD_FLARE, FD_BLAST = 3.86, 9.13                     # flaredet: the flare's burst, the blast's flash
FD_SPEED = (FD_BLAST - FD_FLARE) / (BIG - 47.06)
# the clock's last second, Alva's flare flying to it, its burst on the hit
shot(45.716, 49.30, 'flaredet_hd', FD_FLARE, at=47.06, speed=FD_SPEED, hand=2,
     keys=[(0, (1.25, 0.6, 0.38)), (0.3, (1.45, 0.68, 0.34)), (0.45, (1.6, 0.74, 0.37)), (1, (1.42, 0.69, 0.44))])
hit(47.06, fl=0.26, sk=5, ca=0.004, c=(0.85, 0.6, 1.0))
tag('tag3_finds', 45.77, 46.55)
# on the hit, closer, the take running on: the cursor weighs the options
shot(49.30, STOP, 'flaredet_hd', FD_BLAST, at=BIG, speed=FD_SPEED, hand=2,
     keys=[(0, (1.95, 0.72, 0.56)), (1, (1.8, 0.74, 0.64))])
hit(49.30, pu=0.02)
# the stop: wider again, the fuse lit; the push into Detonate
shot(STOP, BIG, 'flaredet_hd', FD_BLAST, at=BIG, speed=FD_SPEED, hand=1,
     keys=[(0, (1.45, 0.58, 0.74)), (0.55, (1.75, 0.76, 0.84)), (1, (2.2, 0.83, 0.92))])
hit(STOP, pu=0.03)

# ================= THE BLAST • and the title =================
shot(BIG, SLAM, 'flaredet_hd', 9.38, at=BIG, ramp=[(0, 0.3), (0.6, 0.26), (0.9, 0.8)], z=(1.3, 1.12), x=(0.42, 0.47), y=(0.5, 0.5), sfx=0)
hit(BIG, sk=22, ca=0.012, fl=0.3, d=0.16)
OV += [('slam', 'logo2', SLAM, DUR + 1), ('rise', 'end_out', OUT_A - 0.02, DUR + 1), ('rise', 'end_credit', OUT_B - 0.02, DUR + 1)]
hit(SLAM, fl=0.25, sk=16, ca=0.01, d=0.25)
hit(OUT_A, fl=0.1, d=0.3); hit(OUT_B, fl=0.07, d=0.3)

# ---- install into the renderer ----
S.sort(key=lambda s: s.t0)
B.S[:] = S; B.OV[:] = OV
for l, new in zip([B.FL, B.SK, B.PU, B.CA], [FL, SK, PU, CA]): l[:] = new
B.DURATION = DUR; B.DROP = DROP; B.STOP = STOP; B.BIG = BIG; B.SLAM = SLAM; B.OUT1 = OUT_A
DURATION = DUR
import math, look2 as L2, gengine as G
KICKS60 = json.load(open(os.path.join(ROOT, 'music', 'kicks60c.json')))
EMB = L2.Embers([(t, s) for t, s in KICKS60 if t >= SLAM - 0.02], SLAM)
_bg0 = B.outro_bg
B.outro_bg = lambda T: _bg0(T) * 1.05
SLAMS = [o for o in B.OV if o[0] == 'slam']
B.OV[:] = [o for o in B.OV if o[0] != 'slam']

def overlays(img, T):
    for kind, name, t0, t1 in SLAMS:
        if not (t0 <= T < t1 + 0.4): continue
        u = T - t0
        sc = 1.0 + 0.06 * math.exp(-u / 0.09) + 0.05 * B.ease_io(min(1.0, u / 7.8))
        dy = -40 * G.PX * B.ease_io(min(1.0, max(0.0, (T - (OUT_A - 0.4)) / 0.7)))
        img = G.put_card(img, name, opacity=min(1, u / 0.04), scale=sc, dy=dy)
        img = G.card_sweep(img, name, (u - 0.15) / 1.1, 1.0)
    return B.overlays(img, T)

import trans as TR
CAVE_END, CODEX_IN = 42.534, 43.666
CUTS = [
    TR.Cut(8.475, 'whip', 0.11, dir=(-1.0, 0.0)),                 # the daily, to the lobby
    TR.Cut(11.74, 'light', 0.22, focus=(0.5, 0.5), radius=0.3, color=(0.45, 0.75, 1.0), glow=0.35, gain=0.6),
    TR.Cut(14.12, 'whip', 0.11, dir=(0.0, -1.0)),                 # the draw, up to the tooltip
    TR.Cut(16.16, 'zoom', 0.12, focus=(0.42, 0.5), into=0.8),     # through the tooltip into the art
    TR.Cut(22.813, 'light', 0.18, focus=(0.5, 0.35), radius=0.2, color=(0.4, 0.75, 1.0), glow=0.5, gain=0.7),
    TR.Cut(31.684, 'zoom', 0.12, focus=(0.5, 0.45), into=0.9),    # out of the zones, into the vein
    TR.Cut(35.69, 'whip', 0.11, dir=(-1.0, 0.0)),                 # the vein, to the revive
    TR.Cut(37.62, 'whip', 0.11, dir=(-1.0, 0.0)),                 # the revive, to the streak
] + [TR.Cut(t, 'ignite', 0.2, focus=(0.5, 0.13), radius=0.07, mask=0.17, color=(0.35, 0.65, 1.0), glow=0.8, gain=0.9) for t in STREAK_CUTS] + [
    TR.Cut(CAVE_END, 'whip', 0.11, dir=(0.0, -1.0)),              # the cave-in, up to the toasts
    TR.Cut(CODEX_IN, 'whip', 0.11, dir=(-1.0, 0.0)),              # the toasts, to the codex
]
def _shot_at(t, start):
    for s_ in B.S:
        if abs((s_.t0 if start else s_.t1) - t) < 2e-3: return s_
def shot_image(T):
    for c in CUTS:
        lo, hi = TR.reach(c)
        if c.t - lo <= T < c.t + hi:
            a, b = _shot_at(c.t, False), _shot_at(c.t, True)
            if a is None or b is None: break
            ia = B.frame_of(a, min(T, a.t1 - 1e-4)) if T < c.t + hi else None
            ib = B.frame_of(b, max(T, b.t0))
            return TR.apply(c, T, ia, ib)
    return B.base(T)

def frame(T, f):
    img = shot_image(T)
    lin = L2.to_lin(img)
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
    return L2.grain(y, f, amount=0.0)
def build_sound():
    music = os.path.join(ROOT, 'music', 'cut60c.wav'); music60.build(music)
    out = os.path.join(ROOT, 'music', 'cut60h_mix.wav'); B.mixer.mix(music, B.S, out)
    return out
B.build_sound = build_sound
