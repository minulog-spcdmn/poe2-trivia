"""60 s cut, v11: the end screen holds on what it earned (no codex repeat after it); and an option to
render the footage on twos and threes (ANIM=1, at 24 fps): the game's own animation held for 2 or 3
frames while the camera, the transitions, the light and the titles move on every frame."""
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60j.py'), encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a[:90]; s = s.replace(a, b, 1)

# ---- the end screen: wide while the toasts arrive, then in on them from the big hit; no codex after ----
i = s.index("s_ = shot(42.784, 44.69, 'lastlife_hd'"); j = s.index("# ================= the dynamite chapter")
s = s[:i] + '''s_ = shot(42.784, 45.716, 'lastlife_hd', src=5.72, speed=1.25, hand=1, tin=('fade', 0.3))
s_.path = path([(42.784, 1.1, 0.56, 0.54), (44.0, 1.15, 0.62, 0.6), (44.69, 1.3, 0.7, 0.68), (45.25, 2.3, 0.8, 0.79), (45.716, 2.5, 0.81, 0.8)])
s_.step = 3
hit(44.69, pu=0.035)

''' + s[j:]
rep("         (44.69, os.path.join(SFX, 'zoneSting.wav'), 3.0)]        # the match into the achievements",
    "         (44.69, os.path.join(SFX, 'zoneSting.wav'), -2.0)]       # in on the achievements")

# ---- on twos and threes ----
rep("B.frame_of = _frame_of", '''B.frame_of = _frame_of
ANIM = os.environ.get('ANIM') == '1'
ANIM_RATE = 24.0
def _stepped(s_, t):
    """The source time held on the shot's own twos or threes (from its first frame), the camera running on."""
    k = getattr(s_, 'step', 2)
    if k <= 1: return None
    n = math.floor((t - s_.t0) * ANIM_RATE / k + 1e-6)
    return s_.t0 + n * k / ANIM_RATE
_fo2 = B.frame_of
def _frame_of_anim(s_, t):
    if not ANIM: return _fo2(s_, t)
    tq = _stepped(s_, t)
    if tq is None: return _fo2(s_, t)
    orig = s_.src_at
    s_.src_at = lambda T, _o=orig, _q=tq: _o(_q)
    try: return _fo2(s_, t)
    finally: del s_.src_at
B.frame_of = _frame_of_anim''')
# which shots on which: impacts on ones, the weighty moments on threes, the rest on twos
rep("# ---- install into the renderer ----", '''# ---- on twos and threes: impacts on ones, the weighty moments on threes, the rest on twos ----
for s_ in S:
    if s_.t1 <= 1.31: s_.step = 1                                  # the cold open's flashes
    elif s_.clip in ('presents_hd',) or (s_.clip == 'flaredet_hd' and s_.t0 >= BIG - 1e-3): s_.step = 3
    elif s_.clip == 'lastlife_hd' and s_.t0 > 42: s_.step = 3       # the end screen
# ---- install into the renderer ----''')
s = s.replace("'cut60j_mix.wav'", "'cut60k_mix.wav'")
open(os.path.join(ROOT, 'edit60k.py'), 'w', encoding='utf-8').write(s)
print('edit60k written')
