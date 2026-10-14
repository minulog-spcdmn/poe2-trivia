"""60 s cut, v19 (from v18): the end card answers the outro's stabs (measured on the remaster) with a gold
glint across the logo, a glow and a small push, the magma lifting with them; no recap flashes. The shots
captured again at 4x swapped in (hd2.json: clip names and the anchors that moved)."""
import os, json, re
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60r.py'), encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a[:90]; s = s.replace(a, b, 1)
i = s.index("OUT_HITS = [(t_, s_) for t_, s_ in json.load("); j = s.index("B.outro_bg = _outro_bg")
s = s[:i] + '''# the outro's stabs, measured on the remaster (its mid band: the hits you hear between 0:54 and 0:56)
OUT_HITS = [(54.32, 1.0), (54.765, 1.0), (55.105, 0.85), (55.54, 1.0), (55.995, 1.0), (56.34, 0.8)]
def out_energy(t):
    """How hard the last stab is still ringing at t (0 to 1)."""
    return min(1.0, max([s_ * math.exp(-(t - t_) / 0.16) for t_, s_ in OUT_HITS if 0 <= t - t_ < 1.0] or [0.0]))
def _outro_bg(t):
    return _bg0(t) * 1.05 * (1 + 0.5 * out_energy(t))
''' + s[j:]
rep("""        if e > 0.02: img = G.put_card(img, name, opacity=0.3 * min(1.0, e), scale=sc * 1.003, dy=dy, blur=10 * G.PX)   # its glow on the hit
        img = G.put_card(img, name, opacity=min(1, u / 0.04), scale=sc, dy=dy)""",
"""        if e > 0.02: img = G.put_card(img, name, opacity=0.32 * e, scale=sc * 1.003, dy=dy, blur=10 * G.PX)   # its glow on the stab
        img = G.put_card(img, name, opacity=min(1, u / 0.04), scale=sc, dy=dy)
        # on each stab a gold glint runs across the letters, left to right, in a third of a second
        for t_, s_ in OUT_HITS:
            v = (t - t_) / 0.32
            if 0 <= v < 1:
                a = G.put_card(torch.zeros_like(img), name, opacity=1.0, scale=sc, dy=dy).max(0, keepdim=True).values.clamp(0, 1)
                xs = torch.linspace(0, 1, G.W, device=G.dev).view(1, 1, G.W)
                band = torch.exp(-((xs - (0.2 + 0.6 * v)) / 0.05) ** 2)
                img = img + a * band * _GLINT * (1.1 * s_)""")
rep("_WARM = torch.tensor([0.80, 0.93, 1.0], device=G.dev).view(3, 1, 1)", "_WARM = torch.tensor([0.80, 0.93, 1.0], device=G.dev).view(3, 1, 1)\n_GLINT = torch.tensor([0.72, 0.9, 1.0], device=G.dev).view(3, 1, 1)")
s = s.replace("e = out_energy(t)\n        sc = 1.0 + 0.06 * math.exp(-u / 0.09) + 0.05 * B.ease_io(min(1.0, u / 7.8)) + 0.012 * e",
              "e = out_energy(t)\n        sc = 1.0 + 0.06 * math.exp(-u / 0.09) + 0.05 * B.ease_io(min(1.0, u / 7.8)) + 0.01 * e")
# the 4x recaptures
H2 = json.load(open(os.path.join(ROOT, 'hd2.json'))) if os.path.exists(os.path.join(ROOT, 'hd2.json')) else {'swap': [], 'rep': []}
for c in H2['swap']:
    s = re.sub(r"'%s'" % re.escape(c), "'%s_hd'" % c, s)
    s = s.replace("f'szone_{z}'", "f'szone_{z}_hd'") if c == 'szone' else s
for a_, b_ in H2['rep']:
    rep(a_, b_)
s = s.replace("'cut60r_mix.wav'", "'cut60s_mix.wav'")
open(os.path.join(ROOT, 'edit60s.py'), 'w', encoding='utf-8').write(s)
print('edit60s written')
