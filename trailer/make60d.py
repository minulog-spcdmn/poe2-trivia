"""60 s cut, v4: ten handcrafted zones then the procedural deep; no race; achievements and codex before the
ending run; from the seam, one dynamite chapter (flare, fuse, Detonate, blast)."""
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60c.py'), encoding='utf-8').read()
def cut(a0, a1, b):
    global s
    i = s.index(a0); j = s.index(a1); s = s[:i] + b + s[j:]

# ---- the zone roll: seven handcrafted, then four procedural ----
cut("for i, z in enumerate([11, 21, 31, 41, 51, 61, 81, 101, 121, 131, 141]):", "# ================= DELVE", """for i, z in enumerate([11, 21, 31, 51, 61, 81, 91, 101, 111, 121, 141]):
    t0, t1 = ZC[i], ZC[i + 1]
    shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.1, at=t0, z=(1.3, 1.24), x=(0.5 + (0.015 if i % 2 else -0.015), 0.5), y=0.46,
         ease='out', settle=0.05, sfx=0.6 if i < 3 else 0.35)
    hit(t0, fl=0.12 if i < 3 else 0.09, pu=0.015, d=0.08)
tag('tag3_zones', ZC[0] + 0.05, ZC[7] - 0.12)
tag('tag3_endless', ZC[7] + 0.02, ZC[11] - 0.05)

""")

# ---- after the cave-in: achievements, the codex; then the dynamite chapter into the stop ----
cut("# ================= the race", "# ================= THE STOP", """# ================= achievements, the codex =================
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

""")
s = s.replace("tag('tag3_finds', STOP + 0.35, BIG - 0.12)\n", "")
s = s.replace("'cut60c_mix.wav'", "'cut60d_mix.wav'")
open(os.path.join(ROOT, 'edit60d.py'), 'w', encoding='utf-8').write(s)
print('edit60d written')
