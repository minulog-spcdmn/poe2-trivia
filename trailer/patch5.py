# Cut 5 review fixes, applied on top of make_edit4's output.
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(ROOT, 'edit4.py'); s = open(p, encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a[:80]; s = s.replace(a, b)
# 1. cold open: four zone names flashing in on the stabs, readable
rep("""for T, nm, sv in zip(STABS0, ['plunge_31', 'plunge_51', 'plunge_121', 'plunge_91'], [0.78, 5.6, 5.4, 1.8]):
    shot(T, T + 0.36, nm, src=sv, speed=0.4, z=(1.3, 1.24), x=0.3, y=0.28, glimpse=True, sfx=0)""",
"""for T, nm in zip(STABS0, ['szone_11', 'szone_51', 'szone_91', 'szone_141']):
    shot(T, T + 0.38, nm, src=lock(nm) + 0.45, speed=0.4, z=(1.45, 1.38), x=0.5, y=0.46, glimpse=True, sfx=0)""")
# 2. a flare burns, then the dynamite goes off
rep("shot(58.46, 61.47, 'dynamite3', 1.53, at=snap(59.26), speed=1.0, z=(1.7, 1.15), x=(0.82, 0.5), y=(0.86, 0.5), ease='in')",
"""shot(58.46, 58.95, 'flare3', 2.63, at=58.52, speed=1.0, z=(1.45, 1.35), x=0.62, y=0.4, settle=0.05)
hit(58.52, fl=0.25, c=(0.85, 0.6, 1.0))
shot(58.95, 61.47, 'dynamite3', 1.53, at=snap(59.26), speed=1.0, z=(1.6, 1.15), x=(0.8, 0.5), y=(0.84, 0.5), ease='in')""")
rep("tag('tag3_finds', 58.5, 59.15)", "tag('tag3_finds', 58.5, 59.2)")
# 3. deeper than ever, briefly; the toasts sooner
rep("shot(SEAM3, 65.43, 'end3', src=0.2, speed=1.0, z=(1.3, 1.2), x=0.5, y=0.45, settle=0.04)",
    "shot(SEAM3, 64.15, 'end3', src=0.6, speed=1.0, z=(1.3, 1.22), x=0.5, y=0.45, settle=0.04)")
rep("shot(65.43, 68.38, 'toasts3', src=2.3, speed=1.0, z=(1.35, 1.6), x=(0.62, 0.72), y=(0.62, 0.78), ease='out', hand=2)\ntag('tag3_ach', 65.48, 68.25)",
    "shot(64.15, 68.38, 'toasts3', src=1.3, speed=1.0, z=(1.3, 1.6), x=(0.6, 0.72), y=(0.6, 0.78), ease='io', hand=2)\ntag('tag3_ach', 64.2, 68.25)")
# 4. the codex breakdown: overview, the collection, an item; the achievements stay with the glide before it
rep("""shot(72.3, 74.6, 'codex3', src=0.4, speed=1.0, z=(1.15, 1.2), x=0.5, y=(0.4, 0.5), hand=2, tin=('xfade', 0.5))""",
    """shot(72.3, 74.3, 'codex3', src=0.4, speed=1.0, z=(1.15, 1.2), x=0.5, y=(0.4, 0.5), hand=2, tin=('xfade', 0.5))""")
rep("""shot(74.6, 76.3, 'codex3', src=8.1, speed=1.0, z=(1.35, 1.45), x=0.5, y=0.45, hand=2, tin=('xfade', 0.35))
shot(76.3, 78.07, 'codex3', src=13.9, speed=1.0, z=(1.2, 1.3), x=0.5, y=0.48, hand=2, tin=('xfade', 0.35))""",
"""shot(74.3, 75.9, 'codex3', src=4.3, speed=1.0, z=(1.3, 1.4), x=(0.4, 0.5), y=0.55, hand=2, tin=('xfade', 0.35))
shot(75.9, 78.07, 'codex3', src=7.9, speed=1.0, z=(1.3, 1.4), x=0.5, y=0.45, hand=2, tin=('xfade', 0.35))""")
# 5. the lobby: all twelve in the party, then over to Begin as it's clicked
rep("shot(H_LOBBY, H_PORTAL, 'lobby12', 5.0, at=H_PORTAL - 0.04, speed=1.0, z=(1.55, 1.4), x=(0.28, 0.42), y=(0.66, 0.6), ease='out', settle=0.05, hand=2)",
    "s_ = shot(H_LOBBY, H_PORTAL, 'lobby12', 5.0, at=H_PORTAL - 0.04, speed=1.0, settle=0.05, hand=2)\ns_.keys = [(0, (1.3, 0.37, 0.61)), (0.55, (1.27, 0.38, 0.61)), (0.85, (1.35, 0.62, 0.7)), (1, (1.38, 0.66, 0.74))]")
# 6. the revive held until Gwennen's chamber is full
rep("shot(49.05, 50.52, 'revive3', 3.80, at=49.35, speed=1.0, z=(1.85, 1.75), x=0.45, y=0.17, hand=2)\ntag('tag3_revive', 49.1, 50.45)",
    "shot(49.05, 50.99, 'revive3', 3.80, at=49.35, speed=1.15, z=(1.85, 1.75), x=0.45, y=0.17, hand=2)\ntag('tag3_revive', 49.1, 50.9)")
rep("shot(50.52, SEAM2, 'cavein3'", "shot(50.99, SEAM2, 'cavein3'")
# 7. camera: shots may look past the frame's edge
rep("    img = camera(img, z, x, y, rr, dx + hx, dy + hy)", "    img = camera(img, z, x, y, rr, dx + hx, dy + hy, clamp=not getattr(s, 'noclamp', False))")
# 8. the stop: the cursor finds Detonate and presses it; the bars come in on the blast
rep("def letterbox_at(T):\n    if T < DROP: return 1.0\n    if T < STOP: return 0.0", "def letterbox_at(T):\n    if T < DROP: return 1.0\n    if T < BIG: return 0.0")
rep("shot(BIG, BIG2, 'dynslow'", """s_ = shot(STOP, BIG, 'detpress', 0.93, at=BIG - 0.08, speed=0.7, hand=1)
s_.keys = [(0, (1.45, 0.72, 0.8)), (0.75, (1.95, 0.83, 0.93)), (1, (2.1, 0.83, 0.94))]
shot(BIG, BIG2, 'dynslow'""")
# 9. the clock ring, centred, pushed in, reaching 0 on the slam
rep("shot(LAST + 0.3, SLAM - 0.08, 'flare3', src=0.3, speed=0.45, z=(3.0, 3.4), x=0.865, y=0.355, ease='lin', dim=0.85, tin=('fade', 0.35), sfx=0)",
    "s_ = shot(LAST + 0.3, SLAM - 0.06, 'flare3', 2.55, at=SLAM - 0.06, speed=1.0, z=(2.4, 3.8), x=0.865, y=0.355, ease='in', dim=0.9, tin=('fade', 0.3), sfx=1.0)\ns_.noclamp = True")
open(p, 'w', encoding='utf-8').write(s); print('patched')
