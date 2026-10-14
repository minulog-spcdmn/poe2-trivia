"""PoE2.Quest • Delve, the 60-second cut: its own edit on its own music path (music60.py).
Intro (26 s, the tension rising hit by hit), the drop, the Delve features, Detonate in the stop,
the blast into the together and meta block, four hero stabs, the clock into the slam, a short card."""
import os, json
import edit4 as B          # the renderer (frame, camera, grade, overlays); its shot list is replaced below
from engine2 import Shot
import music60

ROOT = B.ROOT
S, OV = [], []
FL, SK, PU, CA = [], [], [], []
KICKS = [t for t, s in json.load(open(os.path.join(ROOT, 'music', 'kicks60.json')))]
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
STABS = [T(208.922), T(209.283), T(210.026), T(211.191)]
LAST, SLAM = T(212.157), T(215.192)
DUR = music60.DURATION

# ================= INTRO • the start page, Today's unique =================
shot(0.0, H1, 'home4', src=0.6, speed=0.7, hand=2, tin=('fade', 1.4), sfx=0,
     keys=[(0, (1.04, 0.5, 0.5)), (1, (1.22, 0.6, 0.46))])
# drawn to Mageblood, a moment's doubt, then Headhunter on the second hit
shot(H1, H2, 'home4', 7.01, at=H2, speed=1.4, hand=2, keys=[(0, (1.32, 0.62, 0.55)), (1, (1.4, 0.63, 0.56))])
tag('tag3_daily', H1 + 0.1, H2 - 0.2)
shot(H2, H3, 'home4', 7.01, at=H2, speed=0.85, hand=2, keys=[(0, (1.45, 0.64, 0.56)), (1, (1.22, 0.6, 0.5))])
hit(H2, fl=0.25, pu=0.04)
# ================= twelve players, the portal, the vote, the draw =================
shot(H3, H4, 'lobby12', src=1.0, speed=1.0, hand=2, keys=[(0, (1.3, 0.37, 0.61)), (1, (1.27, 0.38, 0.61))])
hit(H3, pu=0.03, fl=0.08)
tag('tag3_twelve', H3 + 0.1, H4 - 0.2)
shot(H4, 11.74, 'lobby12', 5.15, at=H4 + 0.06, speed=0.8, z=(1.35, 1.2), x=0.5, y=0.33, settle=0.07, hand=3)
hit(H4, fl=0.35, sk=10, pu=0.04, ca=0.004, d=0.28)
shot(11.74, H5, 'coop12', src=7.6, speed=1.2, z=(1.45, 1.5), x=0.5, y=0.6, hand=2)
tag('tag3_together', 11.8, BUILD - 0.15)
shot(H5, BUILD, 'coop12', 10.76, at=H5, speed=0.75, z=(1.55, 1.45), x=0.5, y=0.62, settle=0.06)
hit(H5, fl=0.3, sk=8, ca=0.004)

# ================= THE BUILD • quickening =================
shot(BUILD, 16.16, 'tooltip3', 1.40, at=14.6, speed=1.0, hand=1,
     keys=[(0, (1.85, 0.4, 0.62)), (0.22, (1.8, 0.4, 0.6)), (0.6, (1.17, 0.43, 0.47)), (1, (1.15, 0.435, 0.47))])
tag('tag3_tooltips', BUILD + 0.08, 15.35)
shot(16.16, 19.41, 'art_auspex', src=0.9, speed=1.1, z=(1.4, 1.55), x=0.3, y=0.67, hand=2)
shot(19.41, 20.97, 'ward3', 2.00, at=19.85, speed=1.0, z=(1.45, 1.35), x=0.55, y=0.4, settle=0.04, hand=2)
hit(19.85, fl=0.25, sk=8, c=(1.0, 0.75, 0.45))
tag('tag3_wards', 19.45, 20.9)
shot(20.97, 21.68, 'flare3', 2.63, at=21.02, speed=1.0, z=(1.45, 1.32), x=0.62, y=0.4, settle=0.05)
hit(21.02, fl=0.3, sk=8, ca=0.005, c=(0.85, 0.6, 1.0))
shot(21.68, 22.21, 'art_1', src=2.0, speed=1.0, z=(1.8, 1.9), x=0.3, y=0.64)
hit(21.68, pu=0.02)
shot(22.21, BLOW, 'art_2', src=2.8, speed=1.0, z=(1.9, 2.0), x=0.3, y=0.62)
hit(22.21, pu=0.02)
# the title spells itself out and locks on the drop
shot(BLOW, DROP, 'stitle', 0.47, at=BLOW, speed=(3.22 - 0.47) / (DROP - BLOW), z=(1.55, 1.95), x=0.5, y=(0.47, 0.52), ease='in', hand=2)

# ================= THE DROP =================
ZC = [T(x) for x in [35.009, 35.601, 36.193, 36.489, 36.785, 37.09, 37.38, 37.673, 37.969, 38.111, 38.407]] + [SPLICE]
shot(DROP, ZC[0], 'stitle', 3.22, at=DROP, speed=0.85, z=(1.95, 1.75), x=0.5, y=0.52, ease='out', settle=0.08)
hit(DROP, fl=0.32, sk=12, pu=0.05, ca=0.004, d=0.12)
for i, z in enumerate([11, 21, 31, 41, 51, 61, 81, 101, 121, 131, 141]):
    t0, t1 = ZC[i], ZC[i + 1]
    shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.1, at=t0, z=(1.3, 1.24), x=(0.5 + (0.015 if i % 2 else -0.015), 0.5), y=0.46,
         ease='out', settle=0.05, sfx=0.6 if i < 3 else 0.35)
    hit(t0, fl=0.12 if i < 3 else 0.09, pu=0.015, d=0.08)
tag('tag3_zones', ZC[0] + 0.05, ZC[2] - 0.1)

# ================= DELVE • the vein, a revive, streak fire, a cave-in =================
shot(SPLICE, 33.21, 'vein3', 3.46, at=32.31, speed=1.0, z=(1.3, 1.2), x=0.5, y=0.5, hand=2)
hit(32.31, fl=0.22, c=(1.0, 0.75, 0.45))
tag('tag3_vein', SPLICE + 0.05, 35.6)
shot(33.21, 34.08, 'vein3', 7.72, at=33.65, speed=1.0, z=(1.4, 1.45), x=0.62, y=0.5, hand=2)
hit(33.65, fl=0.15, c=(0.7, 1.0, 0.7))
shot(34.08, 35.71, 'vein3', 18.65, at=34.18, speed=1.0, hand=2,
     keys=[(0, (1.6, 0.58, 0.5)), (0.3, (1.25, 0.5, 0.35)), (0.82, (2.2, 0.49, 0.1)), (1, (2.3, 0.49, 0.1))])
hit(34.18, fl=0.3, d=0.35, c=(0.45, 0.8, 1.0))
sp = (5.75 - 3.8) / (37.6 - 35.85)
shot(35.71, 37.66, 'revive3', 3.80, at=35.85, speed=sp, z=(1.85, 1.75), x=0.45, y=0.17, hand=2)
tag('tag3_revive', 35.76, 37.55)
SC = [37.66, 38.08, 38.56, 38.87, 39.17, 39.52, 39.91, 40.37]
for i, n in enumerate([3, 20, 30, 40, 60, 80, 100]):
    shot(SC[i], SC[i + 1], f'streak4_{n}', src=2.3, speed=1.0, z=(1.2, 1.28), x=0.47, y=(0.45, 0.42), settle=0.05, sfx=0.8)
    hit(SC[i], fl=0.1, pu=0.015, d=0.1)
tag('tag3_streaks', SC[0] + 0.05, SC[4])
shot(40.37, STOP, 'cavein3', 4.98, at=41.04, speed=1.0, z=(1.4, 1.25), x=0.35, y=0.5, settle=0.04, hand=2)
hit(41.04, sk=20, ca=0.009, fl=0.18, c=(0.45, 0.45, 1.0), d=0.3)

# ================= THE STOP • Detonate =================
shot(STOP, BIG, 'detpress', 0.93, at=BIG - 0.08, speed=0.7, hand=1,
     keys=[(0, (1.6, 0.8, 0.84)), (0.75, (1.95, 0.83, 0.93)), (1, (2.1, 0.83, 0.94))])
tag('tag3_finds', STOP + 0.35, BIG - 0.12)

# ================= THE BLAST • together, and what you keep =================
shot(BIG, 44.49, 'dynslow', 0.53, at=BIG, ramp=[(0, 0.22), (0.5, 0.3), (0.9, 1.0)], z=(1.15, 1.08), x=0.5, y=0.5, sfx=0)
hit(BIG, sk=22, ca=0.012, fl=0.3, d=0.4)
shot(44.49, 46.31, 'race4', src=2.0, speed=1.0, z=(1.35, 1.45), x=(0.4, 0.36), y=(0.3, 0.27), hand=2)
hit(44.49, pu=0.03, sk=6)
tag('tag3_race', 44.55, 46.2)
shot(46.31, 47.54, 'race4', 6.16, at=46.45, speed=1.0, z=(1.3, 1.4), x=0.6, y=0.55, hand=2)
hit(46.45, fl=0.2, pu=0.03)
shot(47.54, 49.29, 'toasts3', src=2.0, speed=1.3, hand=2, keys=[(0, (1.35, 0.6, 0.6)), (1, (1.6, 0.72, 0.78))])
hit(47.54, pu=0.03)
tag('tag3_ach', 47.6, 49.2)
shot(49.29, STABS[0], 'codex3', src=13.6, speed=1.0, z=(1.3, 1.45), x=0.5, y=0.4, hand=2)
hit(49.29, pu=0.03)
tag('tag3_codex', 49.35, STABS[0] - 0.1)
# four stabs, four heroes
for (t0, t1), (nm, src, z, x, y) in zip(zip(STABS, STABS[1:] + [LAST]),
        [('art_auspex', 5.3, 1.55, 0.3, 0.67), ('streak4_100', 3.0, 1.7, 0.5, 0.2), ('coop12', 13.5, 1.4, 0.5, 0.6), ('szone_141', lock('szone_141') + 0.2, 1.35, 0.5, 0.46)]):
    shot(t0, t1, nm, src=src, speed=0.5, z=(z, z * 0.96), x=x, y=y, settle=0.06, sfx=0)
    hit(t0, fl=0.3, sk=12, ca=0.006, d=0.25)
hit(LAST, sk=10)

# ================= THE CLOCK • into the slam =================
s_ = shot(LAST + 0.3, SLAM - 0.06, 'flare3', 2.55, at=SLAM - 0.06, speed=1.0, z=(2.4, 3.8), x=0.865, y=0.355, ease='in', dim=0.9, tin=('fade', 0.3), sfx=1.0)
s_.noclamp = True
OV += [('slam', 'logo2', SLAM, DUR + 1), ('rise', 'end_out', SLAM + 1.2, DUR + 1), ('rise', 'end_credit', SLAM + 2.0, DUR + 1)]
hit(SLAM, fl=0.14, sk=16, ca=0.01, d=0.2)

# ---- install into the renderer ----
S.sort(key=lambda s: s.t0)
B.S[:] = S; B.OV[:] = OV
for l, new in zip([B.FL, B.SK, B.PU, B.CA], [FL, SK, PU, CA]): l[:] = new
B.DURATION = DUR; B.DROP = DROP; B.STOP = STOP; B.BIG = BIG; B.SLAM = SLAM; B.OUT1 = SLAM + 1.2
DURATION = DUR
frame = B.frame
def build_sound():
    music = os.path.join(ROOT, 'music', 'cut60.wav'); music60.build(music)
    out = os.path.join(ROOT, 'music', 'cut60_mix.wav'); B.mixer.mix(music, B.S, out)
    return out
B.build_sound = build_sound
