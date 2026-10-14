"""60 s cut, v8: transitions with a reason (trans.py) where a hard cut was all there was; the streak
tiers as one continuous move, each tier lit into the next through the name's flames; the zone
cards framed below the app's header band; fewer reflex flashes and shakes; the outro clean (no
embers, the logo's slow push only); no grain; shots that push in close shot again at 4x
(the `_hd` clips) so they stay sharp."""
import os, re, json
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60g.py'), encoding='utf-8').read()
def rep(a, b, n=1):
    global s
    assert s.count(a) >= 1, a[:90]; s = s.replace(a, b) if n == 0 else s.replace(a, b, n)
HD = json.load(open(os.path.join(ROOT, 'hd_anchors.json')))      # measured on the _hd clips

# ---- the zone cards: below the header band, no flash on every cut ----
rep("shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.4, at=t0, z=(1.3, 1.24), x=(0.5 + (0.015 if i % 2 else -0.015), 0.5), y=0.46,",
    "shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.4, at=t0, z=(1.42, 1.37), x=(0.5 + (0.015 if i % 2 else -0.015), 0.5), y=0.475,")
rep("    hit(t0, fl=0.12 if i < 3 else 0.09, pu=0.015, d=0.08)", "    hit(t0, fl=0.1 if i == 0 else 0.0, pu=0.012, d=0.08)")

# ---- the streak tiers: one camera move through all seven, each lit into the next ----
i = s.index("SC = [37.62,"); j = s.index("tag('tag3_streaks'")
s = s[:i] + '''SC = [37.62, 38.06, 38.5, 38.98, 39.38, 39.82, 40.22, 40.71]
def streak_cam(T):
    u = B.ease_io(min(1.0, max(0.0, (T - SC[0]) / (SC[-1] - SC[0]))))
    return (1.22 + 0.3 * u, 0.5, 0.42 - 0.08 * u)
for i, n in enumerate([3, 20, 30, 40, 60, 80, 100]):
    a, b = SC[i], SC[i + 1]
    keys = [(k / 8, streak_cam(a + (b - a) * k / 8)) for k in range(9)]
    shot(a, b, f'streak4_{n}', src=2.3, speed=1.0, keys=keys, sfx=0.8)
STREAK_CUTS = SC[1:-1]
''' + s[j:]

# ---- reflex flashes and shakes down; the transitions instead ----
rep("hit(H3, pu=0.03, fl=0.08)", "hit(H3, pu=0.02)")
rep("hit(H4, fl=0.35, sk=10, pu=0.04, ca=0.004, d=0.28)", "hit(H4, fl=0.3, sk=6, pu=0.04, ca=0.003, d=0.28)")
rep("hit(H5, fl=0.3, sk=8, ca=0.004)", "hit(H5, fl=0.22, sk=4, ca=0.003)")
rep("hit(20.30, fl=0.25, sk=8, c=(1.0, 0.75, 0.45))", "hit(20.30, fl=0.22, sk=5, c=(1.0, 0.75, 0.45))")
rep("hit(21.02, fl=0.3, sk=8, ca=0.005, c=(0.85, 0.6, 1.0))", "hit(21.02, fl=0.25, sk=4, ca=0.004, c=(0.85, 0.6, 1.0))")
rep("hit(47.06, fl=0.3, sk=10, ca=0.005, c=(0.85, 0.6, 1.0))", "hit(47.06, fl=0.26, sk=5, ca=0.004, c=(0.85, 0.6, 1.0))")
rep("hit(49.30, pu=0.03, sk=5)", "hit(49.30, pu=0.02)")
rep("hit(STOP, pu=0.04, sk=6)", "hit(STOP, pu=0.03)")

# ---- the outro: clean ----
rep("    if T >= SLAM: lin = lin + EMB.render(T)\n", "")
rep("        glow = min(0.55, 0.12 * e)\n        if glow > 0.01: img = G.put_card(img, name, opacity=glow, scale=sc * 1.004, dy=dy, blur=9 * G.PX)\n", "")
rep("        e, _ = EMB.energy(T)\n", "")
rep("B.outro_bg = lambda T: _bg0(T) * 1.1", "B.outro_bg = lambda T: _bg0(T) * 1.05")

# ---- no grain (the dither stays) ----
rep("    return L2.grain(y, f)\n", "    return L2.grain(y, f, amount=0.0)\n")

# ---- the transitions ----
rep("def frame(T, f):\n    img = B.base(T)\n", '''import trans as TR
CAVE_END, CODEX_IN = 42.78, 44.256
CUTS = [
    TR.Cut(8.475, 'whip', 0.11, dir=(-1.0, 0.0)),                 # the daily, to the lobby
    TR.Cut(11.74, 'light', 0.22, focus=(0.5, 0.5), radius=0.3, color=(0.45, 0.75, 1.0), glow=0.35, gain=0.6),
    TR.Cut(14.12, 'whip', 0.11, dir=(0.0, -1.0)),                 # the draw, up to the tooltip
    TR.Cut(16.16, 'zoom', 0.12, focus=(0.42, 0.5), into=0.8),     # through the tooltip into the art
    TR.Cut(22.813, 'light', 0.18, focus=(0.5, 0.35), radius=0.2, color=(0.4, 0.75, 1.0), glow=0.5, gain=0.7),
    TR.Cut(31.684, 'zoom', 0.12, focus=(0.5, 0.45), into=0.9),    # out of the zones, into the vein
    TR.Cut(35.69, 'whip', 0.11, dir=(-1.0, 0.0)),                 # the vein, to the revive
    TR.Cut(37.62, 'whip', 0.11, dir=(-1.0, 0.0)),                 # the revive, to the streak
] + [TR.Cut(t, 'ignite', 0.2, focus=(0.5, 0.13), radius=0.07, mask=0.17, color=(0.35, 0.65, 1.0), glow=0.8, gain=0.9) for t in STREAK_CUTS] + [
    TR.Cut(CAVE_END, 'whip', 0.11, dir=(0.0, -1.0)),              # the cave-in, up to the toasts
    TR.Cut(CODEX_IN, 'whip', 0.11, dir=(-1.0, 0.0)),              # the toasts, to the codex
]
def _shot_at(t, start):
    for s_ in B.S:
        if abs((s_.t0 if start else s_.t1) - t) < 2e-3: return s_
def shot_image(T):
    for c in CUTS:
        lo, hi = TR.reach(c)
        if c.t - lo <= T < c.t + hi:
            a, b = _shot_at(c.t, False), _shot_at(c.t, True)
            if a is None or b is None: break
            ia = B.frame_of(a, min(T, a.t1 - 1e-4)) if T < c.t + hi else None
            ib = B.frame_of(b, max(T, b.t0))
            return TR.apply(c, T, ia, ib)
    return B.base(T)

def frame(T, f):
    img = shot_image(T)
''')
# ---- the cave-in a beat shorter; the toasts; the codex in two: the Delve tab clicked, then what kills you ----
rep("shot(40.71, 42.78, 'cavein3',", "shot(40.71, 42.534, 'cavein3',")
i = s.index("# ================= achievements, the codex"); j = s.index("# ================= the dynamite chapter")
s = s[:i] + """# ================= achievements, the codex =================
shot(42.534, 43.666, 'toasts3', src=2.75, speed=1.1, hand=2, keys=[(0, (2.0, 0.81, 0.79)), (1, (2.3, 0.83, 0.82))])
tag('tag3_ach', 42.6, 43.55)
# the Delve tab clicked: the collection gives way to the deepest run
shot(43.666, 44.69, 'codexseq_hd', 1.46, at=44.08, speed=1.0, hand=2,
     keys=[(0, (1.7, 0.56, 0.36)), (0.3, (1.6, 0.54, 0.38)), (1, (1.42, 0.5, 0.47))])
tag('tag3_codex', 43.72, 44.6)
# on the hit: what kills you, held to be read
shot(44.69, 45.716, 'codexseq_hd', src=5.75, speed=0.9, hand=1, keys=[(0, (1.62, 0.34, 0.37)), (1, (1.68, 0.38, 0.39))])
hit(44.69, pu=0.02)

""" + s[j:]
rep("CAVE_END, CODEX_IN = 42.78, 44.256", "CAVE_END, CODEX_IN = 42.534, 43.666")

# ---- the shots that push in close, from their 4x takes (same timing, measured) ----
for c in HD.get('swap', []):
    s = re.sub(r"'%s'" % c, "'%s_hd'" % c, s)
for a_, b_ in HD.get('rep', []):
    assert a_ in s, a_; s = s.replace(a_, b_)
s = s.replace("'cut60g_mix.wav'", "'cut60h_mix.wav'")
open(os.path.join(ROOT, 'edit60h.py'), 'w', encoding='utf-8').write(s)
print('edit60h written')
