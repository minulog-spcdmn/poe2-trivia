"""60 s cut, v17: the grade without its haze (grade.py: lifts scale, never add); the gate weave moved
into the shot camera (one resample a frame, so text edges don't shimmer); gentler sharpening."""
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60p.py'), encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a[:90]; s = s.replace(a, b, 1)
rep("    y = y + (L2.sharpen(y) - y) * m if m is not None else L2.sharpen(y)   # sharpened: the UI only",
    "    y = y + (L2.sharpen(y, 0.2) - y) * m if m is not None else L2.sharpen(y, 0.2)   # sharpened: the UI only")
rep("""    # gate weave: the frame sits a little loose in the gate, drifting a fraction of a pixel; and a breath of flicker
    wx = 0.55 * math.sin(t * 2 * math.pi * 1.7 + 0.3) + 0.35 * math.sin(t * 2 * math.pi * 3.9 + 1.9)
    wy = 0.45 * math.sin(t * 2 * math.pi * 1.3 + 2.4) + 0.3 * math.sin(t * 2 * math.pi * 4.6 + 0.7)
    y = G.camera(y, 1.0, 0.5, 0.5, 0.0, wx * G.PX, wy * G.PX, clamp=False)
""", """    # a breath of flicker (the gate weave rides on the shot camera: see weave)
""")
rep("def frame(t, f):", """# gate weave: the frame sits a little loose in the gate, drifting a fraction of a pixel. Added to the shot
# camera's own handheld drift, so the picture is resampled once, not again as a whole (which made edges shimmer).
def weave(t):
    return (0.55 * math.sin(t * 2 * math.pi * 1.7 + 0.3) + 0.35 * math.sin(t * 2 * math.pi * 3.9 + 1.9),
            0.45 * math.sin(t * 2 * math.pi * 1.3 + 2.4) + 0.3 * math.sin(t * 2 * math.pi * 4.6 + 0.7))
_hh0 = B.handheld
def _handheld(T, amt, seed=0):
    hx, hy, hr = _hh0(T, amt, seed=seed); wx, wy = weave(T)
    return hx + wx * G.PX, hy + wy * G.PX, hr
B.handheld = _handheld
def frame(t, f):""")
s = s.replace("'cut60p_mix.wav'", "'cut60q_mix.wav'")
open(os.path.join(ROOT, 'edit60q.py'), 'w', encoding='utf-8').write(s)
print('edit60q written')
