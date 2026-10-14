"""60 s cut, v12 (from v11): speed ramps into the impacts; match cuts (avatar to avatar, title to zone
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

# ---------------- 4. match cuts: avatar to avatar, title to zone name ----------------
# the vein's last shot ends on Alva's avatar; the revive opens with Gwennen's in its place and size
rep("""shot(34.08, 35.69, 'vein3_hd', 18.65, at=34.18, speed=1.0, hand=2,
     keys=[(0, (1.6, 0.58, 0.5)), (0.3, (1.25, 0.5, 0.35)), (0.82, (2.2, 0.49, 0.1)), (1, (2.3, 0.49, 0.1))])""",
    """shot(34.08, 35.69, 'vein3_hd', 18.65, at=34.18, speed=1.0, hand=0,
     keys=[(0, (1.6, 0.58, 0.5)), (0.3, (1.25, 0.5, 0.35)), (0.82, (2.2, 0.5, 0.24)), (1, (2.3, 0.49, 0.24))])""")
rep("shot(35.69, 37.62, 'revive3_hd', 3.80, at=35.83, speed=(5.75 - 3.8) / (37.5 - 35.83), z=(1.85, 1.75), x=0.45, y=0.17, hand=2)",
    """s_ = shot(35.69, 37.62, 'revive3_hd', 3.80, at=35.83, speed=(5.75 - 3.8) / (37.5 - 35.83), hand=0)
s_.path = path([(35.69, 2.10, 0.4177, 0.2501), (36.3, 1.95, 0.418, 0.27), (37.62, 1.553, 0.4187, 0.327)])""")
# ... and the revive ends on Gwennen's where the first streak shot has Alva's
rep("""    zz = 1.55 + 0.12 * i
    shot(a, b, f'streak4_{n}_hd', 2.77, at=a + 0.05, speed=1.0, z=(zz, zz + 0.06), x=0.5 + (0.02 if i % 2 else -0.02), y=0.2,
         settle=0.09, hand=1, sfx=0.9)
    hit(a, pu=0.02)""",
    """    zz = 1.7 + 0.1 * i
    if i == 0:
        shot(a, b, f'streak4_{n}_hd', 2.77, at=a + 0.05, speed=1.0, keys=[(0, (1.7, 0.48, 0.31)), (1, (1.76, 0.48, 0.31))], hand=0, sfx=0.9)
    else:
        shot(a, b, f'streak4_{n}_hd', 2.77, at=a + 0.05, speed=1.0, z=(zz, zz + 0.06), x=0.5 + (0.02 if i % 2 else -0.02), y=0.2,
             settle=0.09, hand=1, sfx=0.9)
        hit(a, pu=0.02)""")
rep("    TR.Cut(35.69, 'whip', 0.11, dir=(-1.0, 0.0)),                 # the vein, to the revive",
    "    TR.Cut(35.69, 'light', 0.1, focus=(0.4188, 0.3045), radius=0.06, color=(0.55, 0.8, 1.0), glow=0.5, gain=0.5),   # avatar to avatar")
rep("    TR.Cut(37.62, 'whip', 0.11, dir=(-1.0, 0.0)),                 # the revive, to the streak",
    "    TR.Cut(37.62, 'light', 0.1, focus=(0.457, 0.2365), radius=0.06, color=(0.45, 0.75, 1.0), glow=0.6, gain=0.5),   # and on to Alva's")
# the title: Delve settles where the first zone's name will be, the same height
rep("s_.path = path([(BLOW, 1.08, 0.5, 0.5), (DROP, 1.24, 0.5, 0.49), (ZC_0, 1.17, 0.5, 0.49)])",
    f"s_.path = path([(BLOW, 1.08, 0.5, 0.5), (DROP, {A['title_z'] * 1.06:.4f}, 0.5, {A['title_y']:.4f}), (ZC_0, {A['title_z']:.4f}, 0.5, {A['title_y']:.4f})])\ns_.parallax = 0.55")
rep("""    shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.4, at=t0, z=(1.42, 1.37), x=(0.5 + (0.015 if i % 2 else -0.015), 0.5), y=0.475,
         ease='out', settle=0.05, sfx=0.6 if i < 3 else 0.35)""",
    """    shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.4, at=t0, z=(1.42, 1.37), x=(0.5 + (0.015 if i % 2 else -0.015), 0.5), y=0.475,
         ease='out', settle=0.0 if i == 0 else 0.05, sfx=0.6 if i < 3 else 0.35)""")
# ... the first zone card opens with Magma Fissure where Delve was, at its height, and pulls back
rep("    hit(t0, fl=0.1 if i == 0 else 0.0, pu=0.012, d=0.08)", """    hit(t0, fl=0.1 if i == 0 else 0.0, pu=0.0 if i == 0 else 0.012, d=0.08)
    if i == 0:
        S[-1].path = path([(t0, 2.92, 0.5, 0.430), (t0 + 0.11, 2.0, 0.5, 0.45), (t0 + 0.29, 1.5, 0.49, 0.472), (t1, 1.42, 0.485, 0.475)])""")

# ---------------- 2. parallax: the shots captured in two layers ----------------
rep("s_.path = path([(2.5, 1.18, 0.58, 0.5),", "s_.parallax = 0.55\ns_.path = path([(2.5, 1.18, 0.58, 0.5),")
rep("s_.path = path([(42.784, 1.1, 0.56, 0.54),", "s_.parallax = 0.55\ns_.path = path([(42.784, 1.1, 0.56, 0.54),")
rep("B.frame_of = _frame_of_anim", '''B.frame_of = _frame_of_anim
import gengine as _G, torch as _torch
_LUMA = None
def _frame_of_layers(s_, t):
    """A shot captured in two layers: the UI moved by the camera, the backdrop behind it by less."""
    k = getattr(s_, 'parallax', None)
    bgname = s_.clip + '_bg'
    if not k or not os.path.exists(os.path.join(ROOT, 'clips', bgname, 'stamps.json')):
        return _frame_of_anim(s_, t)
    global _LUMA
    if _LUMA is None: _LUMA = _torch.tensor([0.0722, 0.7152, 0.2126], device=_G.dev).view(3, 1, 1)
    fg = _frame_of_anim(s_, t)
    p = s_.path
    z0, x0, y0 = p(s_.t0); z, x, y = p(t)
    zb = z0 * (z / z0) ** k
    xb = x0 + k * (x - x0) * z / zb; yb = y0 + k * (y - y0) * z / zb
    clip0, path0 = s_.clip, s_.path
    try:
        s_.clip = bgname
        bg1 = _frame_of_anim(s_, t)                       # the backdrop as the camera sees it
        s_.path = lambda _t, _v=(zb, xb, yb): _v
        bg2 = _frame_of_anim(s_, t)                       # ... and as it sits further back
    finally:
        s_.clip, s_.path = clip0, path0
    d = fg - bg1
    a = ((d.abs() * _LUMA).sum(0, keepdim=True) / 0.09).clamp(0, 1)
    a = _G.gblur(a, 1.2 * _G.PX).clamp(0, 1)
    return a * fg + (1 - a) * (bg2 + d)
B.frame_of = _frame_of_layers''')

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
s = s.replace("'cut60k_mix.wav'", "'cut60l_mix.wav'")
open(os.path.join(ROOT, 'edit60l.py'), 'w', encoding='utf-8').write(s)
print('edit60l written')
