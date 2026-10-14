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
shot(0.0, H1, 'home4', src=0.6, speed=0.7, hand=2, tin=('fade', 1.4), sfx=0,
     keys=[(0, (1.04, 0.5, 0.5)), (1, (1.22, 0.6, 0.46))])
# drawn to Mageblood, a moment's doubt, then Headhunter on the second hit
shot(H1, H2, 'home4', 7.01, at=H2, speed=1.4, hand=2, keys=[(0, (1.32, 0.62, 0.55)), (1, (1.4, 0.63, 0.56))])
tag('tag3_daily', H1 + 0.1, H2 - 0.2)
shot(H2, H3, 'home4', 7.01, at=H2, speed=0.9, hand=2, keys=[(0, (1.45, 0.66, 0.58)), (0.35, (1.6, 0.66, 0.66)), (1, (2.45, 0.625, 0.785))])
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
shot(16.16, 19.85, 'art_auspex2', 5.25, at=19.41, speed=1.0, hand=2, keys=[(0, (1.45, 0.3, 0.66)), (0.82, (1.38, 0.42, 0.66)), (1, (1.3, 0.5, 0.64))])
hit(19.41, fl=0.2, pu=0.03)
shot(19.85, 20.97, 'ward3', 2.00, at=20.30, speed=1.0, z=(1.45, 1.35), x=0.55, y=0.4, settle=0.04, hand=2)
hit(20.30, fl=0.25, sk=8, c=(1.0, 0.75, 0.45))
tag('tag3_wards', 19.9, 20.9)
shot(20.97, 21.68, 'flare3', 2.63, at=21.02, speed=1.0, z=(1.45, 1.32), x=0.62, y=0.4, settle=0.05)
hit(21.02, fl=0.3, sk=8, ca=0.005, c=(0.85, 0.6, 1.0))
shot(21.68, BLOW, 'coop12', 12.2, at=22.21, speed=1.0, z=(1.4, 1.3), x=0.52, y=0.68, settle=0.04, hand=2)
hit(22.21, fl=0.25, pu=0.03)
# the title spells itself out and locks on the drop
shot(BLOW, DROP, 'stitle', 0.47, at=BLOW, speed=(3.22 - 0.47) / (DROP - BLOW), z=(1.55, 1.95), x=0.5, y=(0.47, 0.52), ease='in', hand=2)

# ================= THE DROP =================
ZC = [T(x) for x in [35.009, 35.601, 36.193, 36.489, 36.785, 37.09, 37.38, 37.673, 37.969, 38.111, 38.407]] + [SPLICE]
shot(DROP, ZC[0], 'stitle', 3.22, at=DROP, speed=0.85, z=(1.95, 1.75), x=0.5, y=0.52, ease='out', settle=0.08)
hit(DROP, fl=0.32, sk=12, pu=0.05, ca=0.004, d=0.12)
for i, z in enumerate([11, 21, 31, 51, 61, 81, 91, 101, 111, 121, 141]):
    t0, t1 = ZC[i], ZC[i + 1]
    shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.1, at=t0, z=(1.3, 1.24), x=(0.5 + (0.015 if i % 2 else -0.015), 0.5), y=0.46,
         ease='out', settle=0.05, sfx=0.6 if i < 3 else 0.35)
    hit(t0, fl=0.12 if i < 3 else 0.09, pu=0.015, d=0.08)
tag('tag3_zones', ZC[0] + 0.05, ZC[7] - 0.12)
tag('tag3_endless', ZC[7] + 0.02, ZC[11] - 0.05)

# ================= DELVE • the vein, a revive, streak fire, a cave-in =================
shot(SPLICE, 32.91, 'vein3', 3.46, at=32.09, speed=1.0, z=(1.3, 1.2), x=0.5, y=0.5, hand=2)
hit(32.09, fl=0.22, c=(1.0, 0.75, 0.45))
tag('tag3_vein', SPLICE + 0.05, 35.55)
shot(32.91, 34.08, 'vein3', 7.72, at=33.63, speed=1.0, z=(1.4, 1.45), x=0.62, y=0.5, hand=2)
hit(33.63, fl=0.15, c=(0.7, 1.0, 0.7))
shot(34.08, 35.69, 'vein3', 18.65, at=34.18, speed=1.0, hand=2,
     keys=[(0, (1.6, 0.58, 0.5)), (0.3, (1.25, 0.5, 0.35)), (0.82, (2.2, 0.49, 0.1)), (1, (2.3, 0.49, 0.1))])
hit(34.18, fl=0.3, d=0.35, c=(0.45, 0.8, 1.0))
shot(35.69, 37.62, 'revive3', 3.80, at=35.83, speed=(5.75 - 3.8) / (37.5 - 35.83), z=(1.85, 1.75), x=0.45, y=0.17, hand=2)
tag('tag3_revive', 35.74, 37.5)
SC = [37.62, 38.06, 38.5, 38.98, 39.38, 39.82, 40.22, 40.71]
for i, n in enumerate([3, 20, 30, 40, 60, 80, 100]):
    shot(SC[i], SC[i + 1], f'streak4_{n}', src=2.3, speed=1.0, z=(1.2, 1.28), x=0.47, y=(0.45, 0.42), settle=0.05, sfx=0.8)
    hit(SC[i], fl=0.1, pu=0.015, d=0.1)
tag('tag3_streaks', SC[0] + 0.05, SC[4])
shot(40.71, 42.78, 'cavein3', 4.98, at=41.5, speed=1.0, z=(1.4, 1.25), x=0.35, y=0.5, settle=0.04, hand=2)
hit(41.5, sk=20, ca=0.009, fl=0.18, c=(0.45, 0.45, 1.0), d=0.3)

# ================= achievements, the codex =================
shot(42.78, 44.69, 'toasts3', src=2.1, speed=1.2, hand=2, keys=[(0, (1.7, 0.74, 0.76)), (1, (2.15, 0.79, 0.82))])
hit(42.78, pu=0.03, sk=5)
tag('tag3_ach', 42.83, 44.6)
shot(44.69, 45.716, 'codex3', src=0.6, speed=1.0, z=(1.2, 1.26), x=0.5, y=0.42, settle=0.06)
hit(44.69, fl=0.15, pu=0.03)
tag('tag3_codex', 44.74, 45.65)

# ================= the dynamite chapter: the dark closes in, a flare; the fuse burns to 0 =================
shot(45.716, 47.47, 'flare3', 2.63, at=47.06, speed=1.0, hand=2, keys=[(0, (1.25, 0.6, 0.46)), (0.75, (1.6, 0.74, 0.4)), (1, (1.5, 0.72, 0.42))])
hit(47.06, fl=0.3, sk=10, ca=0.005, c=(0.85, 0.6, 1.0))
tag('tag3_finds', 45.77, 47.4)
shot(47.47, 49.30, 'fuse', 0.55, at=47.47, speed=(1.2 - 0.55) / (49.30 - 47.47), hand=2, keys=[(0, (1.22, 0.55, 0.55)), (1, (1.35, 0.6, 0.6))])
hit(47.47, pu=0.03)
s_ = shot(49.30, STOP, 'fuse', 1.2, at=49.30, speed=(1.95 - 1.2) / (STOP - 49.30), hand=1, ease='in', keys=[(0, (1.45, 0.72, 0.5)), (1, (1.8, 0.8, 0.45))])
hit(49.30, pu=0.04, sk=6)

# ================= THE STOP • Detonate =================
shot(STOP, BIG, 'detpress', 0.80, at=BIG - 0.12, speed=0.6, hand=1,
     keys=[(0, (1.5, 0.78, 0.82)), (0.7, (1.9, 0.82, 0.9)), (1, (2.15, 0.83, 0.92))])

# ================= THE BLAST • and the title =================
shot(BIG, SLAM, 'dynslow', 0.53, at=BIG, ramp=[(0, 0.22), (0.5, 0.3), (0.9, 1.0)], z=(1.15, 1.08), x=0.5, y=0.5, sfx=0)
hit(BIG, sk=22, ca=0.012, fl=0.3, d=0.4)
OV += [('slam', 'logo2', SLAM, DUR + 1), ('rise', 'end_out', OUT_A - 0.02, DUR + 1), ('rise', 'end_credit', OUT_B - 0.02, DUR + 1)]
hit(SLAM, fl=0.25, sk=16, ca=0.01, d=0.25)
hit(OUT_A, fl=0.1, d=0.3); hit(OUT_B, fl=0.07, d=0.3)

# ---- install into the renderer ----
S.sort(key=lambda s: s.t0)
B.S[:] = S; B.OV[:] = OV
for l, new in zip([B.FL, B.SK, B.PU, B.CA], [FL, SK, PU, CA]): l[:] = new
B.DURATION = DUR; B.DROP = DROP; B.STOP = STOP; B.BIG = BIG; B.SLAM = SLAM; B.OUT1 = OUT_A
DURATION = DUR
frame = B.frame
def build_sound():
    music = os.path.join(ROOT, 'music', 'cut60c.wav'); music60.build(music)
    out = os.path.join(ROOT, 'music', 'cut60d_mix.wav'); B.mixer.mix(music, B.S, out)
    return out
B.build_sound = build_sound
