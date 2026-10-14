"""60 s cut, v18: the dynamite's blast heard in full on the hit; the end card answering the outro's hits
(a push and a glow on the logo, the magma breathing, and on the strongest hits the trailer's big moments
flashing dim and soft behind the logo)."""
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60q.py'), encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a[:90]; s = s.replace(a, b, 1)
# the blast: the game's own, whole, on the hit
rep("         (44.69, os.path.join(SFX, 'zoneSting.wav'), -2.0)]       # in on the achievements",
    "         (44.69, os.path.join(SFX, 'zoneSting.wav'), -2.0),       # in on the achievements\n"
    "         (BIG, os.path.join(SFX, 'blast_body.wav'), 12.0)]        # the dynamite going off, slowed with the picture, its rumble carried")
# the end card on the hits
rep("_bg0 = B.outro_bg\nB.outro_bg = lambda t: _bg0(t) * 1.05", '''_bg0 = B.outro_bg
OUT_HITS = [(t_, s_) for t_, s_ in json.load(open(os.path.join(ROOT, 'music', 'kicks60c.json'))) if SLAM + 0.3 < t_ < DUR - 0.4 and s_ >= 1.6]
def out_energy(t):
    """How hard the outro's last hits are still ringing at t (0 to about 1)."""
    return min(1.2, sum(s_ / 2.4 * math.exp(-(t - t_) / 0.14) for t_, s_ in OUT_HITS if 0 <= t - t_ < 0.9))
# on the strongest hits, the trailer's big moments, dim and soft behind the logo
RECAP = [('home4_hd', 7.15, 1.5, 0.66, 0.6), ('coop12', 10.85, 1.5, 0.5, 0.6), ('ward3', 2.05, 1.4, 0.55, 0.4),
         ('streak4_100_hd', 2.8, 1.7, 0.5, 0.22), ('vein3_hd', 18.7, 1.3, 0.5, 0.4), ('revive3_hd', 5.6, 1.8, 0.45, 0.22),
         ('flaredet_hd', 3.86, 1.5, 0.75, 0.36), ('lastlife_hd', 3.64, 1.5, 0.6, 0.45)]
RECAP_HITS = [t_ for t_, s_ in OUT_HITS if s_ >= 1.9]
_TINT = None
def _outro_bg(t):
    global _TINT
    img = _bg0(t) * 1.05 * (1 + 0.45 * out_energy(t))
    for k, t_ in enumerate(RECAP_HITS):
        u = t - t_
        if 0 <= u < 0.6:
            clip, src, z, cx, cy = RECAP[k % len(RECAP)]
            fl = B.clip(clip).at(src + u * 0.6)
            fl = G.gblur(G.camera(fl, z * (1 + 0.03 * u), cx, cy), 6 * G.PX)
            if _TINT is None: _TINT = torch.tensor([0.75, 0.9, 1.0], device=G.dev).view(3, 1, 1)
            img = img + fl * _TINT * (0.34 * math.exp(-u / 0.17))
    return img
B.outro_bg = _outro_bg''')
rep("""        sc = 1.0 + 0.06 * math.exp(-u / 0.09) + 0.05 * B.ease_io(min(1.0, u / 7.8))
        dy = -40 * G.PX * B.ease_io(min(1.0, max(0.0, (t - (OUT_A - 0.4)) / 0.7)))
        img = G.put_card(img, name, opacity=min(1, u / 0.04), scale=sc, dy=dy)""",
"""        e = out_energy(t)
        sc = 1.0 + 0.06 * math.exp(-u / 0.09) + 0.05 * B.ease_io(min(1.0, u / 7.8)) + 0.012 * e
        dy = -40 * G.PX * B.ease_io(min(1.0, max(0.0, (t - (OUT_A - 0.4)) / 0.7)))
        if e > 0.02: img = G.put_card(img, name, opacity=0.3 * min(1.0, e), scale=sc * 1.003, dy=dy, blur=10 * G.PX)   # its glow on the hit
        img = G.put_card(img, name, opacity=min(1, u / 0.04), scale=sc, dy=dy)""")
s = s.replace("'cut60q_mix.wav'", "'cut60r_mix.wav'")
open(os.path.join(ROOT, 'edit60r.py'), 'w', encoding='utf-8').write(s)
print('edit60r written')
