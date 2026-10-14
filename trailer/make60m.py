"""60 s cut, v13 (from v11): v12 without its parallax and match cuts; and the reel running out at the end.
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
# ---------------- the cold open: a countdown to darkness ----------------
_i = s.index("# ================= COLD OPEN"); _j = s.index("DARK = [(1.388, 2.40)")
s = s[:_i] + """# ================= COLD OPEN • the last life, deep down, nobody answering: the clock counts down on the
# intro's first hits (3, 2, 1, then 0 on the fourth), and the darkness takes you =================
CO = marks('coldopen_hd')
_co_path = path([(0.0, 1.3, 0.58, 0.36), (1.388, 1.7, 0.64, 0.3), (2.45, 1.9, 0.64, 0.29)])
_beats = [(0.0, CO['at3'] - 0.214), (0.214, CO['at3']), (0.522, CO['at2']), (0.804, CO['at1']), (1.388, CO['at0']), (2.45, CO['at0'] + 1.062)]
for (a_, sa), (b_, sb) in zip(_beats, _beats[1:]):
    s_ = shot(a_, b_, 'coldopen_hd', src=sa, speed=(sb - sa) / (b_ - a_), hand=1, sfx=1.0)
    s_.path = _co_path
LL = marks('lastlife_hd')
""" + s[_j:]
s = s.replace("DARK = [(1.388, 2.40), (40.714, 42.62)]", "DARK = [(0.25, 2.40), (40.714, 42.62)]")
# ---------------- the reel runs out ----------------
rep("    if t > DUR - 1.2: y = y * B.smooth((DUR - t) / 1.2)\n    return L2.grain(y, f, amount=0.0)\n", "    return y\n")
rep("def frame(t, f):\n", "def frame_core(t, f):\n")
rep("def build_sound():", '''import runout as RO
RUN = RO.Runout(cue=60.15, shaky=60.35, slip=60.75, flash=61.0, leader=61.28, dark=62.0)
VDUR = 62.2
def frame(t, f):
    y = frame_core(t, f)
    return RUN.apply(y, t)
B.DURATION = VDUR; DURATION = VDUR

def build_sound():''')
rep("    mixer2.mix(music, B.S, out, cues=CUES)\n    return out", '''    import scipy.io.wavfile as wf
    sr, m = wf.read(music); m = m.astype(np.float32) / 32768
    m = np.concatenate([m, np.zeros((int((VDUR + 0.3) * sr) - len(m), 2), np.float32)])
    padded = os.path.join(ROOT, 'music', 'remaster', 'remaster_pad.wav'); wf.write(padded, sr, (m * 32767).astype(np.int16))
    mix = mixer2.mix(padded, B.S, out, cues=CUES)
    pro = RO.flap_sound(sr, RUN.shaky, RUN.flash, RUN.leader, RUN.dark, len(mix) / sr)
    pro *= 10 ** (-20 / 20) / (np.abs(pro).max() + 1e-9)
    mix = mixer2.limit(mix + pro)
    wf.write(out, sr, (np.clip(mix, -1, 1) * 32767).astype(np.int16))
    return out''')
s = s.replace("'cut60k_mix.wav'", "'cut60m_mix.wav'")
open(os.path.join(ROOT, 'edit60m.py'), 'w', encoding='utf-8').write(s)
print('edit60m written')
