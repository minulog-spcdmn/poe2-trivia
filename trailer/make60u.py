"""60 s cut, v21 (from v20): the closing chord shown as a warm light rising up through the logo's letters,
a step on each note of its arpeggio (56.40 to 57.54 s), then the logo's glow breathing with the tremolo till
the chord fades (58.4 s); no glints. The vein from a take with low-res tiling off (VEIN env), unsmoothed."""
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60t.py'), encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a[:90]; s = s.replace(a, b, 1)
# no card smoothing
rep("_vc.at = _vat\n", "")
# the vein's card pick and answer from the take with the card lifted in 2D (sharp); 17 ms later there
rep("shot(SPLICE, 32.91, 'vein3_hd', 3.46,", "shot(SPLICE, 32.91, 'vein3_hd6', 3.477,")
rep("ramp_into(32.91, 34.08, 33.63, 7.66,", "ramp_into(32.91, 34.08, 33.63, 7.677,")
rep("shot(32.91, 34.08, 'vein3_hd', src=_s,", "shot(32.91, 34.08, 'vein3_hd6', src=_s,")
# the closing chord
rep("""        # the closing chord's tremolo: the logo's glow breathing with it, fading as the chord does
        if 59.6 <= t < 61.7:
            k = math.exp(-(t - 59.6) / 1.1) * (0.5 + 0.5 * math.sin(2 * math.pi * TREM * (t - 59.6)))
            img = G.put_card(img, name, opacity=0.28 * k, scale=sc * 1.003, dy=dy, blur=12 * G.PX)
        img = G.put_card(img, name, opacity=min(1, u / 0.04), scale=sc, dy=dy)
        if 59.6 <= t < 61.6: img = _glints(img, t, sc, dy)
""", """        # the closing chord's tremolo: the logo's glow breathing with it as the chord rings, fading with it
        if CH0 <= t < CH_END:
            k = min(1.0, (t - CH0) / 0.3) * min(1.0, (CH_END - t) / 0.7) * (0.55 + 0.45 * math.sin(2 * math.pi * TREM * (t - CH0)))
            img = G.put_card(img, name, opacity=0.3 * k, scale=sc * 1.003, dy=dy, blur=12 * G.PX)
        img = G.put_card(img, name, opacity=min(1, u / 0.04), scale=sc, dy=dy)
        if CH0 <= t < CH_END: img = _rising(img, t, sc, dy, name)
""")
rep("ARP = [59.679,", "ARP_OLD = [59.679,")
rep("TREM = 4.66                                                  # the keys' tremolo, Hz", '''TREM = 4.66                                                  # the keys' tremolo, Hz
NOTES = [56.395, 56.528, 56.640, 56.779, 56.896, 57.029, 57.152, 57.275, 57.413, 57.541]   # the arpeggio, rising
CH0, CH_END = 56.30, 58.40
_logo_rows = None
def _rising(img, t, sc, dy, name):
    """A warm band of light climbing the logo's letters, a step up on each note, the light kept to the letters."""
    global _logo_rows
    if _logo_rows is None:
        a = G.card(name)[3]; rows = torch.nonzero((a > 0.5).any(1)).flatten()
        _logo_rows = (float(rows.min()), float(rows.max()))
    top0, bot0 = _logo_rows
    top = G.H / 2 + (top0 - G.H / 2) * sc + dy; bot = G.H / 2 + (bot0 - G.H / 2) * sc + dy
    # its height: a step per note (each eased over 0.12 s), rising past the top after the last
    pos = 0.0
    for i, t_ in enumerate(NOTES):
        pos += B.smooth((t - t_) / 0.12) / len(NOTES)
    pos += 0.5 * B.smooth((t - NOTES[-1] - 0.1) / 0.6)
    yc = bot + (top - bot) * (pos * 1.15 - 0.05)
    w = 0.22 * (bot - top)
    k = min(1.0, (t - NOTES[0] + 0.05) / 0.15) * max(0.0, min(1.0, (CH_END - 0.5 - t) / 0.5))
    if k <= 0.002: return img
    a = G.put_card(torch.zeros_like(img), name, opacity=1.0, scale=sc, dy=dy).max(0, keepdim=True).values.clamp(0, 1)
    band = torch.exp(-((G._ys - yc) / w) ** 2).unsqueeze(0)
    return img + a * band * _RISE * (0.55 * k)''')
rep("_GLINT = torch.tensor([0.72, 0.9, 1.0], device=G.dev).view(3, 1, 1)", "_GLINT = torch.tensor([0.72, 0.9, 1.0], device=G.dev).view(3, 1, 1)\n_RISE = torch.tensor([0.55, 0.85, 1.0], device=G.dev).view(3, 1, 1)")
s = s.replace("'cut60t_mix.wav'", "'cut60u_mix.wav'")
open(os.path.join(ROOT, 'edit60u.py'), 'w', encoding='utf-8').write(s)
print('edit60u written')
