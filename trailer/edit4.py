"""PoE2.Quest • Delve patch trailer, cut 4. GPU=1 python edit3.py [preview|final] [t0] [t1]"""
import sys, os, json, math
import numpy as np, cv2
from engine2 import *
if os.environ.get('GPU') == '1':
    from gengine import *
import music3, mixer

DURATION = music3.DURATION
LOCKS = json.load(open(os.path.join(CLIPS, 'locks.json')))
def lock(name): return LOCKS.get(name, {'lock': 3.55})['lock'] - 0.40
KICKS = [t for t, s in json.load(open(os.path.join(ROOT, 'music', 'kicks3.json'))) if s > 1.6]
def snap(T, tol=0.16):
    k = min(KICKS, key=lambda x: abs(x - T)); return k if abs(k - T) <= tol else T

S = []
def shot(t0, t1, name, moment=None, at=None, speed=1.0, src=None, sfx=1.0, **kw):
    """Clip `name` from t0 to t1, placed so clip time `moment` shows at trailer time `at` (or from `src`)."""
    if src is None: src = moment - ((at if at is not None else t0) - t0) * speed
    s = Shot(t0, t1, name, src, speed=speed, **kw); s.sfx_gain = sfx; S.append(s); return s
OV = []
def tag(name, t0, t1): OV.append(('tag', name, t0, t1))
def title(name, t0, t1, kind): OV.append((kind, name, t0, t1))
def hit(T, fl=0.0, sk=0.0, pu=0.0, ca=0.0, d=0.22, c=(0.75, 0.88, 1.0)):
    if fl: FL.append((T, fl, d, c))
    if sk: SK.append((T, sk, d * 1.6))
    if pu: PU.append((T, pu, d * 0.8))
    if ca: CA.append((T, ca, d))

# ---- accents (measured attacks in the assembled music) ----
STABS0 = [0.053, 0.407, 0.972, 1.355]
H_LOBBY, H_PORTAL, H_TOGETHER, H_CLOSE, H_DRAW, BUILD = 9.86, 12.797, 15.475, 17.846, 19.782, 21.12
BLOW, DROP = 29.813, 33.193
STOP, BIG, BIG2 = 86.952, 88.332, 89.271
STABS = [95.621, 95.982, 96.725, 97.890]
LAST, SLAM, OUT1, OUT2 = 98.856, 101.891, 106.758, 107.700
SEAM1, SEAM2, SEAM3 = 43.8708, 52.4505, 62.7856

# ================= COLD OPEN • four stabs, four flares in the dark =================
for T, nm, sv in zip(STABS0, ['plunge_31', 'plunge_51', 'plunge_121', 'plunge_91'], [0.78, 5.6, 5.4, 1.8]):
    shot(T, T + 0.36, nm, src=sv, speed=0.4, z=(1.3, 1.24), x=0.3, y=0.28, glimpse=True, sfx=0)
    hit(T, sk=5)

# ================= TODAY'S UNIQUE • the new start page, Headhunter =================
shot(1.9, 4.8, 'home4', src=0.4, speed=0.85, z=(1.02, 1.2), x=(0.5, 0.6), y=(0.5, 0.45), hand=2, tin=('fade', 1.3), sfx=0)
s_ = shot(4.8, H_LOBBY, 'home4', 7.01, at=7.818, speed=1.0, hand=2, tilt=dict(rx=(3, 2), ry=(-5, -4), focus=(0.6, 0.6), dof=0.6))
s_.keys = [(0, (1.28, 0.61, 0.53)), (0.55, (1.31, 0.615, 0.55)), (1, (1.35, 0.62, 0.56))]
tag('tag3_daily', 4.9, 7.6)

# ================= TWELVE PLAYERS • the lobby, Begin, the portal =================
shot(H_LOBBY, H_PORTAL, 'lobby12', 5.0, at=H_PORTAL - 0.04, speed=1.0, z=(1.55, 1.4), x=(0.28, 0.42), y=(0.66, 0.6), ease='out', settle=0.05, hand=2)
hit(H_LOBBY, pu=0.03, fl=0.1)
tag('tag3_twelve', H_LOBBY + 0.1, H_PORTAL - 0.15)
shot(H_PORTAL, H_TOGETHER, 'lobby12', 5.16, at=H_PORTAL, speed=0.9, z=(1.35, 1.2), x=0.5, y=(0.3, 0.38), ease='out', settle=0.07, hand=3)
hit(H_PORTAL, fl=0.35, sk=10, pu=0.04, ca=0.004, d=0.28)

# ================= DELVE TOGETHER • eleven pointers, the vote, the draw =================
shot(H_TOGETHER, H_CLOSE, 'coop12', 10.76, at=H_DRAW, speed=1.25, z=(1.45, 1.35), x=(0.45, 0.5), y=(0.6, 0.6), settle=0.04, hand=2)
hit(H_TOGETHER, pu=0.03, sk=4)
tag('tag3_together', H_TOGETHER + 0.1, H_DRAW - 0.2)
shot(H_CLOSE, H_DRAW, 'coop12', 10.76, at=H_DRAW, speed=1.25, z=(1.85, 1.75), x=(0.52, 0.5), y=(0.66, 0.64), settle=0.04, hand=2)
hit(H_CLOSE, pu=0.025)
shot(H_DRAW, BUILD, 'coop12', 10.76, at=H_DRAW, speed=0.6, z=(1.55, 1.45), x=0.5, y=0.62, settle=0.08)
hit(H_DRAW, fl=0.3, sk=8, ca=0.004)

# ================= THE BUILD • tooltips, the art, a ward, a flare; quicker and quicker =================
s_ = shot(BUILD, 23.66, 'tooltip3', 1.40, at=21.9, speed=1.0, hand=1)
s_.keys = [(0, (1.85, 0.4, 0.62)), (0.22, (1.8, 0.4, 0.6)), (0.6, (1.17, 0.43, 0.47)), (1, (1.15, 0.435, 0.47))]
tag('tag3_tooltips', BUILD + 0.05, 22.35)
shot(23.66, 25.6, 'art_auspex', src=1.5, speed=1.3, z=(1.4, 1.55), x=0.3, y=0.67, hand=2, tilt=dict(rx=(-3, -1), ry=(7, 4), focus=(0.5, 0.5), dof=1.0))
shot(25.6, 27.3, 'ward3', 2.00, at=snap(26.468), speed=1.0, z=(1.45, 1.35), x=0.55, y=0.4, settle=0.04, hand=2)
hit(snap(26.468), fl=0.25, sk=8, c=(1.0, 0.75, 0.45))
tag('tag3_wards', 25.65, 27.2)
shot(27.3, 28.81, 'flare3', 2.63, at=snap(27.97), speed=1.0, z=(1.5, 1.3), x=(0.6, 0.66), y=(0.25, 0.4), ease='out', hand=2)
hit(snap(27.97), fl=0.3, sk=10, ca=0.005, c=(0.85, 0.6, 1.0))
shot(28.81, BLOW, 'art_2', src=1.6, speed=1.0, z=(1.9, 2.0), x=0.3, y=0.62)

# ================= THE TITLE • the game's own zone card, locking on the drop =================
shot(BLOW, DROP, 'stitle', 0.47, at=BLOW, speed=(3.22 - 0.47) / (DROP - BLOW), z=(1.55, 1.95), x=0.5, y=(0.47, 0.52), ease='in', hand=2)
hit(32.17, pu=0.02)

# ================= THE DROP =================
shot(DROP, 35.009, 'stitle', 3.22, at=DROP, speed=0.85, z=(1.95, 1.75), x=0.5, y=0.52, ease='out', settle=0.08)
hit(DROP, fl=0.32, sk=12, pu=0.05, ca=0.004, d=0.12)
# Fifteen zones on the drums: the hits, then one every two triplets through the roll
ZC = [35.009, 35.601, 36.193, 36.489, 36.785, 37.09, 37.38, 37.673, 37.969, 38.111, 38.407]
for i, z in enumerate([21, 31, 41, 51, 61, 71, 81, 91, 101, 111]):
    t0, t1 = ZC[i], ZC[i + 1]
    shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.1, at=t0, z=(1.3, 1.24), x=(0.5 + (0.015 if i % 2 else -0.015), 0.5), y=0.46, ease='out', settle=0.05, sfx=0.6 if i < 3 else 0.35)
    hit(t0, fl=0.12 if i < 3 else 0.09, pu=0.015, d=0.08)
ZEND = ZC[-1]
tag('tag3_zones', 35.05, 36.45)
# The Azurite Vein: its card, the cold, a ward dug out, the two cards, back to the light
shot(ZEND, 40.0, 'vein3', src=0.55, speed=1.0, z=(1.35, 1.6), x=0.5, y=0.5, hand=2)
tag('tag3_vein', ZEND + 0.05, 42.4)
shot(40.0, 42.0, 'vein3', 3.46, at=snap(40.55), speed=1.0, z=(1.3, 1.2), x=0.5, y=0.5, settle=0.04)
hit(snap(40.55), fl=0.22, c=(1.0, 0.75, 0.45))
shot(42.0, SEAM1, 'vein3', 7.72, at=snap(42.62), speed=1.0, z=(1.4, 1.5), x=0.62, y=0.5, hand=2)
hit(snap(42.62), fl=0.15, c=(0.7, 1.0, 0.7))
shot(SEAM1, 46.24, 'vein3', 12.42, at=snap(44.0), speed=1.0, z=(1.3, 1.5), x=0.5, y=0.58, hand=2)
s_ = shot(46.24, 49.05, 'vein3', 18.65, at=snap(47.27), speed=1.0, hand=2)
s_.keys = [(0, (1.8, 0.6, 0.6)), (0.36, (1.3, 0.55, 0.5)), (0.55, (1.25, 0.5, 0.35)), (0.85, (2.2, 0.49, 0.1)), (1, (2.3, 0.49, 0.1))]
hit(snap(47.27), fl=0.3, d=0.35, c=(0.45, 0.8, 1.0))
# Revive a teammate
shot(49.05, 50.52, 'revive3', 3.80, at=49.35, speed=1.0, z=(1.85, 1.75), x=0.45, y=0.17, hand=2)
tag('tag3_revive', 49.1, 50.45)
# A cave-in
shot(50.52, SEAM2, 'cavein3', 4.98, at=snap(51.45), speed=1.0, z=(1.4, 1.25), x=0.35, y=0.5, settle=0.04)
hit(snap(51.45), sk=20, ca=0.009, fl=0.18, c=(0.45, 0.45, 1.0), d=0.3)
# Streak fire, every colour: orange, blue, ice, chaos, violet, crimson, gold
tiers = [3, 20, 30, 40, 60, 80, 100]
t = SEAM2
for i, n in enumerate(tiers):
    d = 0.86 if n != 100 else 1.0
    t1 = snap(t + d, 0.12) if n != 100 else 58.46
    shot(t, t1, f'streak4_{n}', src=2.5, speed=1.0, z=(1.2, 1.28), x=0.47, y=(0.45, 0.42), settle=0.05, sfx=0.8)
    hit(t, fl=0.1, pu=0.015, d=0.1)
    t = t1
tag('tag3_streaks', SEAM2 + 0.05, 55.0)
# Flares and dynamite
shot(58.46, 61.47, 'dynamite3', 1.53, at=snap(59.26), speed=1.0, z=(1.7, 1.15), x=(0.82, 0.5), y=(0.86, 0.5), ease='in')
hit(snap(59.26), sk=24, ca=0.011, d=0.35)
tag('tag3_finds', 58.5, 59.15)
shot(61.47, SEAM3, 'art_1', src=1.4, speed=1.0, z=(1.8, 2.0), x=0.3, y=0.64, hand=2, tilt=dict(rx=(-3, -2), ry=(8, 6), focus=(0.5, 0.5), dof=1.0))
# Deeper than ever; achievements
shot(SEAM3, 65.43, 'end3', src=0.2, speed=1.0, z=(1.3, 1.2), x=0.5, y=0.45, settle=0.04)
shot(65.43, 68.38, 'toasts3', src=2.3, speed=1.0, z=(1.35, 1.6), x=(0.62, 0.72), y=(0.62, 0.78), ease='out', hand=2)
tag('tag3_ach', 65.48, 68.25)
s_ = shot(68.38, 72.3, 'codex3', src=17.6, speed=0.9, hand=1, tilt=dict(rx=(5, 3), ry=(-6, 4), focus=(0.5, 0.5), dof=0.35), tin=('xfade', 0.25), ease='sine')
s_.keys = [(0, (1.45, 0.38, 0.58)), (1, (1.4, 0.56, 0.55))]

# ================= BREAKDOWN • the codex, calmly =================
shot(72.3, 74.6, 'codex3', src=0.4, speed=1.0, z=(1.15, 1.2), x=0.5, y=(0.4, 0.5), hand=2, tin=('xfade', 0.5))
tag('tag3_codex', 72.4, 77.9)
shot(74.6, 76.3, 'codex3', src=8.1, speed=1.0, z=(1.35, 1.45), x=0.5, y=0.45, hand=2, tin=('xfade', 0.35))
shot(76.3, 78.07, 'codex3', src=13.9, speed=1.0, z=(1.2, 1.3), x=0.5, y=0.48, hand=2, tin=('xfade', 0.35))

# ================= SECOND BUILD • the race, then twelve pointers on one answer =================
shot(78.07, 80.25, 'race4', 2.2, at=79.0, speed=0.9, z=(1.35, 1.45), x=(0.4, 0.36), y=(0.3, 0.27), hand=2)
hit(79.0, pu=0.02)
tag('tag3_race', 78.12, 80.1)
shot(80.25, 82.46, 'race4', 6.16, at=snap(82.46), speed=1.0, z=(1.3, 1.4), x=(0.55, 0.62), y=(0.5, 0.55), hand=2)
hit(snap(82.46), fl=0.2, pu=0.03)
shot(82.46, STOP, 'coop12', src=11.0, speed=1.0, z=(1.35, 1.5), x=0.5, y=0.6, hand=2)
hit(82.46 + 1.86, fl=0.2, pu=0.03)

# ================= THE ENDING =================
shot(BIG, BIG2, 'dynslow', 0.53, at=BIG, ramp=[(0, 0.22), (0.6, 0.3), (0.94, 1.0)], z=(1.2, 1.1), x=0.5, y=0.5, sfx=0)
hit(BIG, sk=22, ca=0.012, fl=0.3, d=0.4)
HEROES = [(89.271, 'home4', 7.08, 1.5, 0.66, 0.55), (90.16, 'lobby12', 2.6, 1.3, 0.3, 0.6), (90.70, 'lobby12', 5.25, 1.3, 0.5, 0.33),
          (91.13, 'coop12', 10.82, 1.5, 0.5, 0.62), (91.60, 'stitle', 3.5, 1.7, 0.5, 0.52)]
ends = [h[0] for h in HEROES[1:]] + [92.33]
for (t0, nm, src, z, x, y), t1 in zip(HEROES, ends):
    shot(t0, t1, nm, src=src, speed=0.6, z=(z, z * 0.95), x=x, y=y, settle=0.06, sfx=0)
    hit(t0, fl=0.25, sk=10, pu=0.03, ca=0.004, d=0.18)
RECAP = [('tooltip3', 2.6, 1.5, 0.33, 0.49), ('art_auspex', 4.2, 1.6, 0.31, 0.63), ('ward3', 2.05, 1.4, 0.55, 0.4), ('flare3', 2.7, 1.3, 0.62, 0.4),
         ('szone_21', lock('szone_21') + 0.2, 1.25, 0.5, 0.46), ('szone_41', lock('szone_41') + 0.2, 1.25, 0.5, 0.46), ('vein3', 1.4, 1.5, 0.5, 0.5),
         ('vein3', 3.6, 1.25, 0.5, 0.5), ('vein3', 7.8, 1.4, 0.62, 0.5), ('vein3', 12.7, 1.4, 0.5, 0.58), ('vein3', 18.8, 1.3, 0.55, 0.5),
         ('vein3', 20.0, 2.2, 0.49, 0.1), ('revive3', 4.4, 1.8, 0.45, 0.17), ('cavein3', 5.05, 1.3, 0.35, 0.5), ('streak4_20', 2.9, 1.25, 0.47, 0.42),
         ('streak4_40', 2.9, 1.25, 0.47, 0.42), ('streak4_60', 2.9, 1.25, 0.47, 0.42), ('streak4_80', 2.9, 1.25, 0.47, 0.42), ('dynamite3', 1.6, 1.15, 0.5, 0.5),
         ('art_1', 2.6, 1.8, 0.3, 0.64), ('end3', 1.4, 1.25, 0.5, 0.45), ('toasts3', 3.6, 1.5, 0.72, 0.78), ('codex3', 0.6, 1.15, 0.5, 0.45),
         ('codex3', 9.0, 1.35, 0.5, 0.45), ('codex3', 18.4, 1.2, 0.5, 0.5), ('race4', 2.6, 1.35, 0.4, 0.3), ('race4', 6.3, 1.3, 0.6, 0.55),
         ('coop12', 12.95, 1.35, 0.5, 0.6), ('szone_61', lock('szone_61') + 0.2, 1.25, 0.5, 0.46), ('szone_81', lock('szone_81') + 0.2, 1.25, 0.5, 0.46),
         ('szone_121', lock('szone_121') + 0.2, 1.25, 0.5, 0.46), ('szone_131', lock('szone_131') + 0.2, 1.25, 0.5, 0.46)]
t, d, i = 92.33, 0.24, 0
while t < STABS[0] - 0.03:
    nm, src, z, x, y = RECAP[i % len(RECAP)]
    dd = min(d, STABS[0] - t)
    shot(t, t + dd, nm, src=src, speed=0.5, z=z, x=x, y=y, sfx=0)
    hit(t, fl=0.06 + min(0.25, i * 0.008), d=0.05)
    t += dd; i += 1; d = max(1 / 20, d * 0.93)
shot(STABS[0], STABS[1], 'szone_141', lock('szone_141') + 0.2, at=STABS[0], speed=0.5, z=1.3, x=0.5, y=0.46, sfx=0)
shot(STABS[1], STABS[2], 'streak4_100', src=3.2, speed=0.5, z=(1.6, 1.55), x=0.5, y=0.2, sfx=0)
shot(STABS[2], STABS[3], 'lobby12', src=9.5, speed=0.5, z=(1.25, 1.2), x=0.5, y=0.35, sfx=0)
shot(STABS[3], LAST, 'end3', src=4.0, speed=0.6, z=(1.3, 1.25), x=0.5, y=0.42, sfx=0)
for tr in STABS: hit(tr, fl=0.3, sk=12, ca=0.006, d=0.25)
hit(LAST, sk=10)
shot(LAST + 0.3, SLAM - 0.08, 'flare3', src=0.3, speed=0.45, z=(3.0, 3.4), x=0.865, y=0.355, ease='lin', dim=0.85, tin=('fade', 0.35), sfx=0)
title('logo2', SLAM, DURATION + 1, 'slam')
title('end_out', OUT1 - 0.02, DURATION + 1, 'rise')
title('end_credit', OUT2 - 0.02, DURATION + 1, 'rise')
hit(SLAM, fl=0.14, sk=16, ca=0.01, d=0.2)
hit(OUT1, fl=0.1, d=0.3); hit(OUT2, fl=0.07, d=0.3)

# =========================================================================================
def letterbox_at(T):
    if T < DROP: return 1.0
    if T < STOP: return 0.0
    return 1.0

def frame_of(s, T):
    c = clip(s.clip)
    st = s.src_at(T)
    sp = abs(s.speed_at(T))
    if sp > 1.6:
        dt = sp / 60 / 3
        img = (c.at(st - dt) + c.at(st) + c.at(st + dt)) / 3
    else:
        img = c.at(st)
    u = (T - s.t0) / max(1e-6, s.t1 - s.t0)
    e = s.ease_fn()
    if getattr(s, 'keys', None):
        from engine import keyed
        z, x, y = keyed(s.keys, u, ease=smooth); rot = kv(s.rot, u, e)
    else:
        z = kv(s.z, u, e); x = kv(s.x, u, e); y = kv(s.y, u, e); rot = kv(s.rot, u, e)
    z *= 1 + s.settle * math.exp(-(T - s.t0) / s.settle_tc) + env(PU, T)
    hx, hy, hr = handheld(T, s.hand, seed=int(s.t0 * 7))
    dx = dy = 0.0; rr = rot + hr
    for (t, a, d) in SK:
        if 0 <= T - t < d * 4:
            sx, sy, sr = shake(T, a * math.exp(-(T - t) / d), seed=int(t * 100)); dx += sx; dy += sy; rr += sr
    img = camera(img, z, x, y, rr, dx + hx, dy + hy)
    if s.tilt:
        tl = s.tilt
        img = tilt(img, kv(tl.get('rx', 0), u), kv(tl.get('ry', 0), u), tl.get('focus', (0.5, 0.5)), tl.get('dof', 0))
    if s.glimpse:
        img = img * (math.exp(-(T - s.t0) / 0.11) * 1.6)
    if s.dim != 1.0: img = img * s.dim
    return img

def active(T):
    for i in range(len(S) - 1, -1, -1):
        if S[i].t0 <= T < S[i].t1: return i
    return None

def base(T):
    i = active(T)
    if i is None:
        if T >= SLAM - 0.001: return outro_bg(T)
        return black()
    s = S[i]
    img = frame_of(s, T)
    if s.tin:
        kind, d = s.tin[0], s.tin[1]
        k = (T - s.t0) / d
        if k < 1:
            if kind == 'fade': img = img * smooth(k)
            elif kind == 'xfade' and i > 0 and abs(S[i - 1].t1 - s.t0) < 1e-3:
                img = frame_of(S[i - 1], T) * (1 - smooth(k)) + img * smooth(k)
    return img

def outro_bg(T):
    k = T - SLAM
    img = clip('plunge_11').at(4.8 + k * 0.35)
    img = camera(img, 1.15 + k * 0.01, 0.5, 0.55)
    img = gblur(img, 3 * PX)
    return img * (0.25 * math.exp(-k / 2.0) + 0.3)

def overlays(img, T):
    for kind, name, t0, t1 in OV:
        if not (t0 <= T < t1 + 0.4): continue
        u = T - t0; left = t1 - T
        if kind == 'tag':
            a = min(ease_out(u / 0.3), smooth(left / 0.25) if left > 0 else 0)
            lb = (H - W / 2.39) / 2 * letterbox_at(T)
            img = put_card(img, name, opacity=a, dx=-20 * PX * (1 - ease_out(u / 0.45)), dy=-lb * 0.8, wipe=(ease_out(u / 0.4), 0.03, 0.5))
        elif kind == 'slam':
            sc = 1.0 + 0.06 * math.exp(-u / 0.09) + 0.025 * (1 - ease_out(u / 6))
            img = put_card(img, name, opacity=min(1, u / 0.04), scale=sc, dy=-40 * PX * ease_io((T - (OUT1 - 0.4)) / 0.7))
            img = card_sweep(img, name, (u - 0.15) / 1.1, 1.0)
        elif kind == 'rise':
            img = put_card(img, name, opacity=ease_out(u / 0.5), dy=14 * PX * (1 - ease_out(u / 0.8)), blur=5 * (1 - ease_out(u / 0.4)))
    return img

def frame(T, f):
    img = base(T)
    img = bloom(img, 0.3)
    for (t, a, d, c) in FL:
        if 0 <= T - t < d * 5: img = flash(img, a * math.exp(-(T - t) / d), c)
    img = grade(img, halation=0.22, ca=env(CA, T))
    img = vignette(img, 0.36)
    img = overlays(img, T)
    img = letterbox(img, letterbox_at(T))
    if T > DURATION - 1.2: img = img * smooth((DURATION - T) / 1.2)
    img = grain(img, f, 0.018)
    return img

def build_sound():
    music = os.path.join(ROOT, 'music', 'trailer3.wav')
    if not os.path.exists(music): music3.build(music)
    out = os.path.join(ROOT, 'music', 'trailer4_mix.wav')
    mixer.mix(music, S, out)
    return out

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'preview'
    t0 = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
    t1 = float(sys.argv[3]) if len(sys.argv) > 3 else DURATION
    audio = build_sound()
    name = 'preview4.mp4' if mode == 'preview' else 'trailer4.mp4'
    render(frame, os.path.join(ROOT, name), fps=30 if mode == 'preview' else 60, t0=t0, t1=t1, audio=audio)
