"""60 s cut, v3: aligned music, low-value shots out, time to the moments that matter."""
import os, re
ROOT = os.path.dirname(os.path.abspath(__file__))

# ---- music: the drop seam on the hat grid (+64 ms), the outro seam crossfaded long ----
m = open(os.path.join(ROOT, 'music60b.py'), encoding='utf-8').read()
m = m.replace("SEGS = [(7.0, 52.7162), (194.353, 205.0391), (217.8392, 223.2)]",
              "SEGS = [(7.0, 52.7162), (194.417, 205.0391), (217.8392, 223.2)]\nXFS = [0.03, 0.25]")
old = m[m.index("def build(path):"):m.index("if __name__")]
m = m.replace(old, '''def build(path):
    sr, x = wf.read(os.path.join(ROOT, 'music', 'full.wav')); x = x.astype(np.float32)
    out = None
    for i, (a, b) in enumerate(SEGS):
        n = int(XFS[i - 1] * sr) // 2 * 2 if i else 0
        seg = x[int(a * sr) - n // 2: int(b * sr) + int(0.3 * sr)].copy()
        if out is None: out = seg[:int((b - a) * sr) + int(0.3 * sr)]
        else:
            keep = len(out) - int(0.3 * sr)               # out runs 0.3 s past its cut point
            u = np.linspace(0, np.pi / 2, n)[:, None]     # equal power
            tail = out[keep - n // 2: keep + n // 2]
            mixed = tail * np.cos(u) + seg[:n] * np.sin(u)
            out = np.concatenate([out[:keep - n // 2], mixed, seg[n:]])
    y = out[:int(DURATION * sr)]
    k = int(1.0 * sr); y[:k] *= np.linspace(0, 1, k)[:, None] ** 2
    k = int(1.6 * sr); y[-k:] *= np.cos(np.linspace(0, np.pi / 2, k))[:, None] ** 2
    wf.write(path, sr, np.clip(y, -32768, 32767).astype(np.int16))
''')
m = m.replace("cut60b.wav", "cut60c.wav")
open(os.path.join(ROOT, 'music60c.py'), 'w', encoding='utf-8').write(m)

# ---- the edit ----
s = open(os.path.join(ROOT, 'edit60b.py'), encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a[:90]; s = s.replace(a, b)
rep("import music60b as music60\n", "import music60c as music60\n")
rep("'kicks60b.json'", "'kicks60c.json'")
rep("'cut60b.wav'", "'cut60c.wav'"); rep("'cut60b_mix.wav'", "'cut60c_mix.wav'")
# times after the drop seam (45.716) moved 64 ms earlier with the music
SEAM = 45.716
def shift(mo):
    v = float(mo.group(0))
    return f'{v - 0.064:.3f}' if SEAM < v < 54 else mo.group(0)
a0 = s.index("# ================= the race"); a1 = s.index("# ================= THE STOP")
s = s[:a0] + re.sub(r'(?<![\w.])\d{2}\.\d{1,3}(?![\d])', shift, s[a0:a1]) + s[a1:]

# 1. the daily: after Headhunter, push in on the streak catching fire
rep("shot(H2, H3, 'home4', 7.01, at=H2, speed=0.85, hand=2, keys=[(0, (1.45, 0.64, 0.56)), (1, (1.22, 0.6, 0.5))])",
    "shot(H2, H3, 'home4', 7.01, at=H2, speed=0.9, hand=2, keys=[(0, (1.45, 0.66, 0.58)), (0.35, (1.6, 0.66, 0.66)), (1, (2.45, 0.625, 0.785))])")
# 2. the build: the Auspex burns in and is named on a kick; a ward; a flare; twelve answer together
a0 = s.index("shot(16.16, 19.41, 'art_auspex'"); a1 = s.index("# the title spells itself out")
s = s[:a0] + """shot(16.16, 19.85, 'art_auspex2', 5.25, at=19.41, speed=1.0, hand=2, keys=[(0, (1.45, 0.3, 0.66)), (0.82, (1.38, 0.42, 0.66)), (1, (1.3, 0.5, 0.64))])
hit(19.41, fl=0.2, pu=0.03)
shot(19.85, 20.97, 'ward3', 2.00, at=20.30, speed=1.0, z=(1.45, 1.35), x=0.55, y=0.4, settle=0.04, hand=2)
hit(20.30, fl=0.25, sk=8, c=(1.0, 0.75, 0.45))
tag('tag3_wards', 19.9, 20.9)
shot(20.97, 21.68, 'flare3', 2.63, at=21.02, speed=1.0, z=(1.45, 1.32), x=0.62, y=0.4, settle=0.05)
hit(21.02, fl=0.3, sk=8, ca=0.005, c=(0.85, 0.6, 1.0))
shot(21.68, BLOW, 'coop12', 12.2, at=22.21, speed=1.0, z=(1.4, 1.3), x=0.52, y=0.68, settle=0.04, hand=2)
hit(22.21, fl=0.25, pu=0.03)
""" + s[a1:]
s = s.replace("tag('tag3_wards', 19.45, 20.9)\n", "")
# 3. deeper than ever, briefly: the toasts sooner
rep("shot(45.4, 48.266, 'toasts3', src=0.5, speed=1.05,", "shot(45.4, 48.266, 'toasts3', src=1.2, speed=1.05,")
# 4. Detonate: pressed early in the stop, its fuse, the blast on the hit
a0 = s.index("shot(STOP, BIG, 'detpress'"); a1 = s.index("tag('tag3_finds'")
s = s[:a0] + """shot(STOP, BIG, 'detpress', 0.80, at=BIG - 0.12, speed=0.6, hand=1,
     keys=[(0, (1.5, 0.78, 0.82)), (0.7, (1.9, 0.82, 0.9)), (1, (2.15, 0.83, 0.92))])
""" + s[a1:]
open(os.path.join(ROOT, 'edit60c.py'), 'w', encoding='utf-8').write(s)
print('edit60c written')
