"""60 s cut, v6: the dynamite chapter is one question in one take (flaredet): the clock runs out, a flare
burns, the cursor weighs the options, the fuse lights, Detonate. A steady 0.9x puts the flare's burst on
47.06 and the blast on BIG; one hard cut on the stop, to a closer angle, the take running on through it."""
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60e.py'), encoding='utf-8').read()
def cut(a0, a1, b):
    global s
    i = s.index(a0); j = s.index(a1); s = s[:i] + b + s[j:]

cut("shot(45.716, 47.47, 'flare3'", "OV += [('slam'", """FD_FLARE, FD_BLAST = 3.86, 9.13                     # flaredet: the flare's burst, the blast's flash
FD_SPEED = (FD_BLAST - FD_FLARE) / (BIG - 47.06)
# the clock's last second, Alva's flare flying to it, its burst on the hit
shot(45.716, 49.30, 'flaredet', FD_FLARE, at=47.06, speed=FD_SPEED, hand=2,
     keys=[(0, (1.25, 0.6, 0.38)), (0.3, (1.45, 0.68, 0.34)), (0.45, (1.6, 0.74, 0.37)), (1, (1.42, 0.69, 0.44))])
hit(47.06, fl=0.3, sk=10, ca=0.005, c=(0.85, 0.6, 1.0))
tag('tag3_finds', 45.77, 46.55)
# on the hit, closer, the take running on: the cursor weighs the options
shot(49.30, STOP, 'flaredet', FD_BLAST, at=BIG, speed=FD_SPEED, hand=2,
     keys=[(0, (1.95, 0.72, 0.56)), (1, (1.8, 0.74, 0.64))])
hit(49.30, pu=0.03, sk=5)
# the stop: wider again, the fuse lit; the push into Detonate
shot(STOP, BIG, 'flaredet', FD_BLAST, at=BIG, speed=FD_SPEED, hand=1,
     keys=[(0, (1.45, 0.58, 0.74)), (0.55, (1.75, 0.76, 0.84)), (1, (2.2, 0.83, 0.92))])
hit(STOP, pu=0.04, sk=6)

# ================= THE BLAST • and the title =================
shot(BIG, SLAM, 'flaredet', 9.36, at=BIG, ramp=[(0, 0.3), (0.6, 0.26), (0.9, 0.8)], z=(1.3, 1.12), x=(0.42, 0.47), y=(0.5, 0.5), sfx=0)
hit(BIG, sk=22, ca=0.012, fl=0.3, d=0.16)
""")
s = s.replace("'cut60e_mix.wav'", "'cut60f_mix.wav'")
open(os.path.join(ROOT, 'edit60f.py'), 'w', encoding='utf-8').write(s)
print('edit60f written')
