"""60 s cut, v20 (from v19): the zone cards' names keep their colour (no bloom or roll-off to white on
them); the vein from a take with its cards' art drawn smooth (vein3_hd2); the outro's closing chord and
its rising arpeggio: a glint along the logo's letters on each note, its glow breathing with the tremolo."""
import os, json
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60s.py'), encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a[:90]; s = s.replace(a, b, 1)
V = json.load(open(os.path.join(ROOT, 'vein2.json'))) if os.path.exists(os.path.join(ROOT, 'vein2.json')) else None
if V:
    s = s.replace("'vein3_hd'", "'vein3_hd2'")
    for a_, b_ in V['rep']: rep(a_, b_)
# the zone cards: light kept off their names
rep("    lin = L2.bloom(lin)\n", "    hot = _hot(t)\n    lin = L2.bloom(lin, 0.05) if hot else L2.bloom(lin)\n")
rep("    lin = L2.halation(lin, 0.11)\n", "    lin = L2.halation(lin, 0.03 if hot else 0.11)\n")
rep("    y = L2.colour(L2.to_disp(L2.shoulder(lin)))", "    y = L2.colour(L2.to_disp(L2.shoulder(lin, 0.8, 0.15) if hot else L2.shoulder(lin)))")
rep("def frame(t, f):", '''# The vein's azurite card, while it's dealt and picked: Chrome draws its lit emblem layer at about half the 4x
# capture's scale, in steps. Only there (the middle card, src 2.4 to 3.65 s), the take is smoothed to match.
_vc = G.clip('vein3_hd'); _vat0 = _vc.at; _VM = {}
def _vat(t, blend=True):
    img = _vat0(t, blend)
    if 2.4 <= t <= 3.65:
        h, w = img.shape[-2:]
        if (h, w) not in _VM:
            ys = torch.linspace(0, 1, h, device=G.dev).view(h, 1); xs = torch.linspace(0, 1, w, device=G.dev).view(1, w)
            fx = ((xs - 0.405) / 0.02).clamp(0, 1) * ((0.595 - xs) / 0.02).clamp(0, 1)
            fy = ((ys - 0.355) / 0.02).clamp(0, 1) * ((0.835 - ys) / 0.02).clamp(0, 1)
            _VM[(h, w)] = (fx * fy).unsqueeze(0)
        m = _VM[(h, w)] * min(1.0, (t - 2.4) / 0.08, (3.65 - t) / 0.08)
        soft = G.gblur(G.resize(G.resize(img, w // 4, h // 4, 'area'), w, h, 'bilinear'), 1.2 * w / 5120)
        img = img * (1 - m) + soft * m
    return img
_vc.at = _vat
def _hot(t):
    """A zone card on screen: its name is bright pastel, and the light effects would bleach it white."""
    for s_ in B.S:
        if s_.t0 <= t < s_.t1: return s_.clip.startswith('szone_')
    return False
# the closing chord: its arpeggio's notes (measured on the remaster), a glint on each along the logo's letters
ARP = [59.679, 59.721, 59.887, 59.945, 60.004, 60.073, 60.148, 60.207, 60.303, 60.351, 60.431, 60.532, 60.633, 60.697, 60.809, 60.889, 60.969]
TREM = 4.66                                                  # the keys' tremolo, Hz
_logo_tops = None
def _glints(img, t, sc, dy):
    global _logo_tops
    if _logo_tops is None:
        a = G.card('logo2')[3]
        cols = (a > 0.5).float(); has = cols.amax(0) > 0
        top = torch.argmax(cols, 0).float()
        xs = torch.nonzero(has).flatten()
        _logo_tops = (xs.float().cpu().numpy(), top[xs].cpu().numpy())
    xs, tops = _logo_tops
    out = img
    n = len(ARP)
    for k, t_ in enumerate(ARP):
        u = t - t_
        if not (0 <= u < 0.55): continue
        f = (k + 0.5) / n                                      # left to right as the arpeggio climbs
        i = int(f * (len(xs) - 1)); x0, y0 = float(xs[i]), float(tops[i])
        # the card scaled about the centre and moved up with the logo
        x = G.W / 2 + (x0 - G.W / 2) * sc; y = G.H / 2 + (y0 - G.H / 2) * sc + dy
        life = math.sin(math.pi * min(1.0, u / 0.55)) ** 1.5
        r = (10 + 16 * life) * G.PX
        dxs = (G._xs - x).abs(); dys = (G._ys - y).abs()
        star = torch.exp(-(dys / (0.9 * G.PX)) ** 2) * torch.exp(-dxs / r) + torch.exp(-(dxs / (0.9 * G.PX)) ** 2) * torch.exp(-dys / r)
        core = torch.exp(-((dxs ** 2 + dys ** 2) / (2.4 * G.PX) ** 2))
        out = out + (star * 0.8 + core) .unsqueeze(0) * _GLINT * (0.95 * life)
    return out
def frame(t, f):''')
rep("""        img = G.put_card(img, name, opacity=min(1, u / 0.04), scale=sc, dy=dy)
""", """        # the closing chord's tremolo: the logo's glow breathing with it, fading as the chord does
        if 59.6 <= t < 61.7:
            k = math.exp(-(t - 59.6) / 1.1) * (0.5 + 0.5 * math.sin(2 * math.pi * TREM * (t - 59.6)))
            img = G.put_card(img, name, opacity=0.28 * k, scale=sc * 1.003, dy=dy, blur=12 * G.PX)
        img = G.put_card(img, name, opacity=min(1, u / 0.04), scale=sc, dy=dy)
        if 59.6 <= t < 61.6: img = _glints(img, t, sc, dy)
""")
s = s.replace("'cut60s_mix.wav'", "'cut60t_mix.wav'")
open(os.path.join(ROOT, 'edit60t.py'), 'w', encoding='utf-8').write(s)
print('edit60t written')
