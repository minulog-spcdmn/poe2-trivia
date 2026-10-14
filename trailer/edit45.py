"""The 45-second cutdown: the full cut's build, title and zone roll, a fast feature run, and its ending.
Music: 27.97 s to 38.684 s of the track, then a seamless jump (a passage the track repeats) to 189.778 s and on to the end."""
import os, copy, json
import numpy as np, scipy.io.wavfile as wf
import edit4 as B
from engine2 import Shot

ROOT = B.ROOT
SEGS = [(27.97, 38.6841), (189.7777, 224.4)]
XF = 0.03
DUR = sum(b - a for a, b in SEGS)
A0, A1 = 29.813, 38.684          # full-cut stretch reused as is (track time = full-cut time here)
SHIFT_A = 27.97
B0 = 86.952                      # full cut from the stop to the end, reused
SHIFT_B = B0 - (SEGS[0][1] - SEGS[0][0] + (200.2530 - SEGS[1][0]))
M0, M1 = 76.476, B0              # full-cut times of the middle stretch's music (for its kicks)

def cut_of_full(T):
    return T - SHIFT_B

def build_music(path):
    sr, x = wf.read(os.path.join(ROOT, 'music', 'full.wav')); x = x.astype(np.float32)
    n = int(XF * sr) // 2 * 2
    a = x[int(SEGS[0][0] * sr): int(SEGS[0][1] * sr) + n // 2].copy()
    b = x[int(SEGS[1][0] * sr) - n // 2: int(SEGS[1][1] * sr)].copy()
    fade = np.linspace(0, 1, n)[:, None]
    a[-n:] = a[-n:] * (1 - fade) + b[:n] * fade
    y = np.concatenate([a, b[n:]])
    f = int(0.12 * sr); y[:f] *= np.linspace(0, 1, f)[:, None]
    f = int(1.2 * sr); y[-f:] *= np.linspace(1, 0, f)[:, None] ** 2
    wf.write(path, sr, np.clip(y, -32768, 32767).astype(np.int16))

# ---- keep the reused stretches, shifted ----
full_S, full_OV = list(B.S), list(B.OV)
fx_lists = [B.FL, B.SK, B.PU, B.CA]
full_fx = [list(l) for l in fx_lists]
S = []
def moved(s, d, t_end=None):
    s2 = copy.copy(s); s2.t0 -= d; s2.t1 = (min(s.t1, t_end) if t_end else s.t1) - d; s2._table = None
    return s2
for s in full_S:
    if A0 - 1e-6 <= s.t0 < A1: S.append(moved(s, SHIFT_A, A1))
    elif s.t0 >= B0 - 1e-6: S.append(moved(s, SHIFT_B))
OV = [(k, n, t0 - (SHIFT_A if t0 < A1 else SHIFT_B), t1 - (SHIFT_A if t0 < A1 else SHIFT_B)) for k, n, t0, t1 in full_OV
      if (A0 <= t0 < A1) or t0 >= B0]
FX = [[], [], [], []]
for i, l in enumerate(full_fx):
    for e in l:
        if A0 - 0.01 <= e[0] < A1: FX[i].append((e[0] - SHIFT_A,) + tuple(e[1:]))
        elif e[0] >= B0 - 0.01: FX[i].append((e[0] - SHIFT_B,) + tuple(e[1:]))

def shot(t0, t1, name, moment=None, at=None, speed=1.0, src=None, sfx=1.0, **kw):
    if src is None: src = moment - ((at if at is not None else t0) - t0) * speed
    s = Shot(t0, t1, name, src, speed=speed, **kw); s.sfx_gain = sfx; S.append(s); return s
def hit(T, fl=0.0, sk=0.0, pu=0.0, ca=0.0, d=0.22, c=(0.75, 0.88, 1.0)):
    if fl: FX[0].append((T, fl, d, c))
    if sk: FX[1].append((T, sk, d * 1.6))
    if pu: FX[2].append((T, pu, d * 0.8))
    if ca: FX[3].append((T, ca, d))
def tag(name, t0, t1): OV.append(('tag', name, t0, t1))

# ---- the opener: two hits before the title's first blow ----
shot(0.0, 0.71, 'ward3', 2.00, at=0.06, speed=0.9, z=(1.5, 1.42), x=0.55, y=0.4, settle=0.05, hand=2)
hit(0.06, fl=0.25, sk=8, c=(1.0, 0.75, 0.45))
shot(0.71, A0 - SHIFT_A, 'cavein3', 4.98, at=0.75, speed=0.9, z=(1.45, 1.3), x=0.35, y=0.5, settle=0.05, hand=2)
hit(0.75, sk=18, ca=0.008, fl=0.18, c=(0.45, 0.45, 1.0), d=0.3)

# ---- the feature run (music: the full cut's 76.48 to 86.95 s; cut on its kicks) ----
KICKS = [t for t, s in json.load(open(os.path.join(ROOT, 'music', 'kicks3.json'))) if s > 1.6 and M0 - 0.2 <= t <= M1 + 0.2]
def snapf(T, tol=0.13):
    k = min(KICKS, key=lambda x: abs(x - T)); return k if abs(k - T) <= tol else T
c = cut_of_full
m0 = c(M0)
# the vein: Back to the Light, the ward flying into Alva's pack
t1 = c(snapf(78.44))
s_ = shot(m0, t1, 'vein3', 18.65, at=m0 + 0.3, speed=1.0, hand=2)
s_.keys = [(0, (1.4, 0.55, 0.5)), (0.3, (1.25, 0.5, 0.35)), (0.8, (2.2, 0.49, 0.1)), (1, (2.3, 0.49, 0.1))]
hit(m0 + 0.3, fl=0.3, d=0.35, c=(0.45, 0.8, 1.0))
tag('tag3_vein', m0 + 0.05, t1 - 0.1)
# the revive, to Gwennen's full chamber
t0, t1 = t1, c(snapf(80.07))
shot(t0, t1, 'revive3', 3.80, at=t0 + 0.12, speed=(5.75 - 3.8) / (t1 - t0 - 0.12), z=(1.85, 1.75), x=0.45, y=0.17, hand=2)
tag('tag3_revive', t0 + 0.05, t1 - 0.1)
# every streak colour, a kick each
t = t1
cuts = [snapf(80.07 + i * 0.47, 0.12) for i in range(8)]
for i, n in enumerate([3, 20, 30, 40, 60, 80, 100]):
    a, b = c(cuts[i]), c(cuts[i + 1])
    shot(a, b, f'streak4_{n}', src=2.5, speed=1.0, z=(1.2, 1.28), x=0.47, y=(0.45, 0.42), settle=0.05, sfx=0.8)
    hit(a, fl=0.1, pu=0.015, d=0.1)
tag('tag3_streaks', c(cuts[0]) + 0.05, c(cuts[3]))
# twelve players' pointers on the vote, the draw on a kick
t0, t1 = c(cuts[-1]), c(snapf(85.48))
dr = c(snapf(84.70))
shot(t0, t1, 'coop12', 10.76, at=dr, speed=1.0, z=(1.6, 1.5), x=(0.5, 0.52), y=0.62, settle=0.04, hand=2)
hit(dr, fl=0.3, sk=8, ca=0.004)
tag('tag3_twelve', t0 + 0.05, dr - 0.1)
# a race won, into the stop
t0 = t1
shot(t0, c(B0), 'race4', 6.16, at=c(snapf(86.0)), speed=1.0, z=(1.3, 1.4), x=(0.55, 0.62), y=(0.5, 0.55), hand=2)
hit(c(snapf(86.0)), fl=0.2, pu=0.03)

# the reused stretch ends on the vein's first frames: the last zone card holds instead
S[:] = [x for x in S if not (x.clip == 'vein3' and x.t0 < m0 - 0.01)]
last = max((x for x in S if x.clip.startswith('szone_') and x.t0 < m0), key=lambda x: x.t0); last.t1 = m0
OV[:] = [o for o in OV if o[1] != 'tag3_vein' or o[2] >= m0 - 0.01]
# ---- install into the full cut's renderer ----
S.sort(key=lambda s: s.t0)
B.S[:] = S; B.OV[:] = OV
for l, new in zip(fx_lists, FX): l[:] = new
B.DURATION = DUR
B.DROP = 33.193 - SHIFT_A
B.STOP = c(B0); B.BIG = c(B.BIG); B.SLAM = c(B.SLAM); B.OUT1 = c(B.OUT1)
frame = B.frame

def build_sound():
    music = os.path.join(ROOT, 'music', 'cut45.wav')
    build_music(music)
    out = os.path.join(ROOT, 'music', 'cut45_mix.wav')
    B.mixer.mix(music, B.S, out)
    return out
B.build_sound = build_sound
DURATION = DUR
