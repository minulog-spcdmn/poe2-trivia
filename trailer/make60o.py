"""60 s cut, v15 (from v11): v12 without its parallax and match cuts; no cold open (the start page from the first frame); a clean end.
v12 (from v11): speed ramps into the impacts; match cuts (avatar to avatar, title to zone
name); parallax on the shots captured in two layers (the UI over the backdrop); a film finish
(halation, gate weave, a breath of flicker). Measured anchors come from anchors12.json."""
import os, json
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60k.py'), encoding='utf-8').read()
A = json.load(open(os.path.join(ROOT, 'anchors12.json')))
def rep(a, b, n=1):
    global s
    assert a in s, a[:90]; s = s.replace(a, b, n)

# ---------------- 1. speed ramps: ease down into the hit, snap through it ----------------
rep("def shot(t0, t1, name,", '''def ramp_into(t0, t1, at, moment, pre=0.42, slow=0.38, post=1.15, base=1.0):
    """(src, ramp) for a shot that eases down to `slow` over the `pre` seconds before `at`, shows the clip's
    `moment` exactly at `at`, then snaps on at `post`."""
    a = at - t0
    ks = [(0.0, base)]
    if a - pre > 0.05: ks.append((a - pre, base))
    ks += [(max(0.0, a - pre * 0.45), slow), (a - 0.004, slow), (a + 0.004, post), (t1 - t0 + 1.0, post)]
    ks = sorted({round(k, 4): v for k, v in ks}.items())
    ts = np.linspace(0, a, 4001); sp = np.interp(ts, [k for k, _ in ks], [v for _, v in ks])
    return moment - np.trapezoid(sp, ts), ks
def shot(t0, t1, name,''')
# the lobby: in on the portal
rep("shot(H4, 11.74, 'lobby12', 5.15, at=H4 + 0.06, speed=0.8, z=(1.35, 1.2), x=0.5, y=0.33, settle=0.07, hand=3)",
    "shot(H4, 11.74, 'lobby12', src=5.15 - 0.06 * 0.32, ramp=[(0, 0.32), (0.22, 0.32), (0.4, 0.95), (2, 0.95)], z=(1.35, 1.2), x=0.5, y=0.33, settle=0.07, hand=3)")
# the draw
rep("shot(H5, BUILD, 'coop12', 10.76, at=H5, speed=0.75, z=(1.55, 1.45), x=0.5, y=0.62, settle=0.06)",
    "shot(H5, BUILD, 'coop12', 10.76, at=H5, ramp=[(0, 0.3), (0.3, 0.3), (0.5, 1.0), (3, 1.0)], z=(1.55, 1.45), x=0.5, y=0.62, settle=0.06)")
# the vein: its answer
rep("shot(32.91, 34.08, 'vein3_hd', 7.66, at=33.63, speed=1.0, z=(1.4, 1.45), x=0.62, y=0.5, hand=2)",
    "_s, _r = ramp_into(32.91, 34.08, 33.63, 7.66, pre=0.4, slow=0.35, post=1.1)\nshot(32.91, 34.08, 'vein3_hd', src=_s, ramp=_r, z=(1.4, 1.45), x=0.62, y=0.5, hand=2)")
# the ward taking the hit
rep("shot(19.848, 20.966, 'ward3', 2.00, at=20.296, speed=1.0, z=(1.45, 1.35), x=0.55, y=0.4, settle=0.04, hand=2)",
    "_s, _r = ramp_into(19.848, 20.966, 20.296, 2.00, pre=0.36, slow=0.35, post=1.1)\nshot(19.848, 20.966, 'ward3', src=_s, ramp=_r, z=(1.45, 1.35), x=0.55, y=0.4, settle=0.04, hand=2)")
# the last life's wrong answer (its own take's moment, measured)
rep("WRONG = 3.60                                           # lastlife_hd: the wrong answer's reveal",
    f"WRONG = {A['wrong']:.3f}                                           # lastlife_hd: the wrong answer's reveal")
rep("shot(40.714, 42.62, 'lastlife_hd', WRONG, at=41.5, speed=1.0, hand=2,",
    "_s, _r = ramp_into(40.714, 42.62, 41.5, WRONG, pre=0.45, slow=0.32, post=1.0)\nshot(40.714, 42.62, 'lastlife_hd', src=_s, ramp=_r, hand=2,")
rep("s_ = shot(42.784, 45.716, 'lastlife_hd', src=5.72,", f"s_ = shot(42.784, 45.716, 'lastlife_hd', src={A['over'] + 0.237:.3f},")
# the flare: down into its burst, then on, landing where the next shot picks the take up
rep("""shot(45.716, 49.30, 'flaredet_hd', FD_FLARE, at=47.06, speed=FD_SPEED, hand=2,""",
    """_post = FD_SPEED
for _ in range(40):                                    # the speed after the burst that meets the next shot at 49.30
    _s, _r = ramp_into(45.716, 49.30, 47.06, FD_FLARE, pre=0.42, slow=0.32, post=_post, base=FD_SPEED)
    _end = FD_FLARE + _post * (49.30 - 47.06)
    _want = FD_BLAST - (BIG - 49.30) * FD_SPEED
    _post += (_want - _end) / (49.30 - 47.06)
shot(45.716, 49.30, 'flaredet_hd', src=_s, ramp=_r, hand=2,""")

# ---------------- 7. a film finish ----------------
rep("    lin = L2.halation(lin)\n", "    lin = L2.halation(lin, 0.11)\n")
rep("    y = G.letterbox(y, B.letterbox_at(t))\n    if t > DUR - 1.2:", '''    # gate weave: the frame sits a little loose in the gate, drifting a fraction of a pixel; and a breath of flicker
    wx = 0.55 * math.sin(t * 2 * math.pi * 1.7 + 0.3) + 0.35 * math.sin(t * 2 * math.pi * 3.9 + 1.9)
    wy = 0.45 * math.sin(t * 2 * math.pi * 1.3 + 2.4) + 0.3 * math.sin(t * 2 * math.pi * 4.6 + 0.7)
    y = G.camera(y, 1.0, 0.5, 0.5, 0.0, wx * G.PX, wy * G.PX, clamp=False)
    y = y * (1 + 0.006 * math.sin(t * 2 * math.pi * 11.3) + 0.004 * math.sin(t * 2 * math.pi * 17.9 + 1.0))
    y = G.letterbox(y, B.letterbox_at(t))
    if t > DUR - 1.2:''')
rep("def shot_image(t):", "SOFT_CUTS = [c.t for c in CUTS]                       # transitions: blurred across like any motion\ndef shot_image(t):")
# ---------------- no cold open: the start page from the first frame, already moving ----------------
_i = s.index("# ================= COLD OPEN"); _j = s.index("DARK = [(1.388, 2.40)")
s = s[:_i] + "LL = marks('lastlife_hd')\n" + s[_j:]
s = s.replace("DARK = [(1.388, 2.40), (40.714, 42.62)]", "DARK = [(40.714, 42.62)]")
rep("CUES += [(2.40, os.path.join(SFX, 'zoneShatter.wav'), 0.0),       # the cold open's dark\n         (42.70,", "CUES += [(42.70,")
rep("B.letterbox_at = lambda t: 1.0 if t < 2.5 else _letterbox0(t)", "B.letterbox_at = _letterbox0")
rep("_ramp = solve_ramp(2.3, H2 - 2.5, 7.01, [(0, 0.95), (0.3, 0.95)], [(H2 - 2.5 - 0.05, 0.9), (H3 - 2.5, 0.9)])",
    "_ramp = solve_ramp(1.55, H2, 7.01, [(0, 0.95), (0.3, 0.95)], [(H2 - 0.05, 0.9), (H3, 0.9)])")
rep("s_ = shot(2.5, H3, 'home4_hd', src=2.3, ramp=_ramp, hand=2, tin=('fade', 0.55), sfx=1.0)",
    "s_ = shot(0.0, H3, 'home4_hd', src=1.55, ramp=_ramp, hand=2, tin=('fade', 0.5), sfx=1.0)")
rep("s_.path = path([(2.5, 1.18, 0.58, 0.5),", "s_.path = path([(0.0, 1.1, 0.56, 0.5),")
s = s.replace("'cut60k_mix.wav'", "'cut60o_mix.wav'")
open(os.path.join(ROOT, 'edit60o.py'), 'w', encoding='utf-8').write(s)
print('edit60o written')
