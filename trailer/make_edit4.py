"""Cut 4: edit3 with the review's changes."""
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit3.py'), encoding='utf-8').read()

def rep(a, b):
    global s
    assert a in s, a[:80]
    s = s.replace(a, b)

def cut(a0, a1, b):
    global s
    i = s.index(a0); j = s.index(a1)
    s = s[:i] + b + s[j:]

rep('Delve patch trailer, cut 3.', 'Delve patch trailer, cut 4.')
# keyframed camera paths
rep("""    z = kv(s.z, u, e); x = kv(s.x, u, e); y = kv(s.y, u, e); rot = kv(s.rot, u, e)""",
"""    if getattr(s, 'keys', None):
        from engine import keyed
        z, x, y = keyed(s.keys, u, ease=smooth); rot = kv(s.rot, u, e)
    else:
        z = kv(s.z, u, e); x = kv(s.x, u, e); y = kv(s.y, u, e); rot = kv(s.rot, u, e)""")

# 1. Today's unique: the new take with a hesitation over Mageblood, framed to keep the answers in
cut("shot(1.9, 5.6, 'home3'", "tag('tag3_daily'", """shot(1.9, 4.8, 'home4', src=0.4, speed=0.85, z=(1.02, 1.2), x=(0.5, 0.6), y=(0.5, 0.45), hand=2, tin=('fade', 1.3), sfx=0)
s_ = shot(4.8, H_LOBBY, 'home4', 7.01, at=7.818, speed=1.0, hand=2, tilt=dict(rx=(3, 2), ry=(-5, -4), focus=(0.6, 0.6), dof=0.6))
s_.keys = [(0, (1.28, 0.61, 0.53)), (0.55, (1.31, 0.615, 0.55)), (1, (1.35, 0.62, 0.56))]
""")
rep("tag('tag3_daily', 5.7, H_LOBBY - 0.15)", "tag('tag3_daily', 4.9, 7.6)")

# 2. Tooltip: close on the button, then pull back to the whole tooltip as it opens
rep("""shot(BUILD, 23.66, 'tooltip3', 1.40, at=21.9, speed=1.0, z=(1.35, 1.75), x=(0.3, 0.18), y=(0.46, 0.47), ease='out', hand=2,
     tilt=dict(rx=(3, 2), ry=(-9, -6), focus=(0.35, 0.5), dof=0.9))""",
"""s_ = shot(BUILD, 23.66, 'tooltip3', 1.40, at=21.9, speed=1.0, hand=1)
s_.keys = [(0, (1.85, 0.4, 0.62)), (0.22, (1.8, 0.4, 0.6)), (0.6, (1.17, 0.43, 0.47)), (1, (1.15, 0.435, 0.47))]""")

# 3. The title centred on its word, so the drop's punch and fringes come from the word
rep("shot(BLOW, DROP, 'stitle', 0.47, at=BLOW, speed=(3.22 - 0.47) / (DROP - BLOW), z=(1.55, 1.95), x=0.5, y=0.43, ease='in', hand=2)",
    "shot(BLOW, DROP, 'stitle', 0.47, at=BLOW, speed=(3.22 - 0.47) / (DROP - BLOW), z=(1.55, 1.95), x=0.5, y=(0.47, 0.52), ease='in', hand=2)")
rep("shot(DROP, 34.86, 'stitle', 3.22, at=DROP, speed=0.85, z=(1.95, 1.75), x=0.5, y=0.44, ease='out', settle=0.08)\nhit(DROP, fl=0.32, sk=18, pu=0.05, ca=0.008, d=0.12)",
    "shot(DROP, 35.009, 'stitle', 3.22, at=DROP, speed=0.85, z=(1.95, 1.75), x=0.5, y=0.52, ease='out', settle=0.08)\nhit(DROP, fl=0.32, sk=12, pu=0.05, ca=0.004, d=0.12)")

# 4. Fifteen zones on the drums: two hits, then one every two triplets through the roll
cut("# Fifteen zones, one a beat", "# The Azurite Vein", """# Fifteen zones on the drums: the hits, then one every two triplets through the roll
ZC = [35.009, 35.601, 36.193, 36.489, 36.785, 37.09, 37.38, 37.673, 37.969, 38.111, 38.407]
for i, z in enumerate([21, 31, 41, 51, 61, 71, 81, 91, 101, 111]):
    t0, t1 = ZC[i], ZC[i + 1]
    shot(t0, t1, f'szone_{z}', lock(f'szone_{z}') + 0.1, at=t0, z=(1.3, 1.24), x=(0.5 + (0.015 if i % 2 else -0.015), 0.5), y=0.46, ease='out', settle=0.05, sfx=0.6 if i < 3 else 0.35)
    hit(t0, fl=0.12 if i < 3 else 0.09, pu=0.015, d=0.08)
ZEND = ZC[-1]
tag('tag3_zones', 35.05, 36.45)
""")

# 5. Back to the Light: held until the ward lands in Alva's pack, pushing in on it
rep("""shot(46.24, 48.17, 'vein3', 18.65, at=snap(47.27), speed=1.0, z=(1.8, 1.2), x=(0.6, 0.5), y=(0.6, 0.5), hand=2)""",
"""s_ = shot(46.24, 49.05, 'vein3', 18.65, at=snap(47.27), speed=1.0, hand=2)
s_.keys = [(0, (1.8, 0.6, 0.6)), (0.36, (1.3, 0.55, 0.5)), (0.55, (1.25, 0.5, 0.35)), (0.85, (2.2, 0.49, 0.1)), (1, (2.3, 0.49, 0.1))]""")
rep("shot(48.17, 50.52, 'revive3', 3.80, at=snap(49.02), speed=1.0, z=(1.85, 1.75), x=0.45, y=0.17, hand=2)\ntag('tag3_revive', 48.22, 50.4)",
    "shot(49.05, 50.52, 'revive3', 3.80, at=49.35, speed=1.0, z=(1.85, 1.75), x=0.45, y=0.17, hand=2)\ntag('tag3_revive', 49.1, 50.45)")

# 6. After the toasts: an angled flight over the codex's achievements, not a stray zone card
cut("shot(68.38, 70.37, 'szone_101'", "# ================= BREAKDOWN", """s_ = shot(68.38, 72.3, 'codex3', src=17.6, speed=0.9, hand=1, tilt=dict(rx=(5, 3), ry=(-6, 4), focus=(0.5, 0.5), dof=0.35), tin=('xfade', 0.25), ease='sine')
s_.keys = [(0, (1.45, 0.38, 0.58)), (1, (1.4, 0.56, 0.55))]

""")

# 7. The race: Gwennen's miss, clearly, then the others and Alva
cut("shot(78.07, 82.46, 'race12'", "hit(snap(82.46), fl=0.2, pu=0.03)", """shot(78.07, 80.25, 'race4', 2.2, at=79.0, speed=0.9, z=(1.35, 1.45), x=(0.4, 0.36), y=(0.3, 0.27), hand=2)
hit(79.0, pu=0.02)
tag('tag3_race', 78.12, 80.1)
shot(80.25, 82.46, 'race4', 6.16, at=snap(82.46), speed=1.0, z=(1.3, 1.4), x=(0.55, 0.62), y=(0.5, 0.55), hand=2)
""")

# 8 + 9. After the blast: heroes on the stabs, then a flashback through the whole trailer, faster and faster
cut("shot(BIG2, 92.33, 'plunge_11'", "shot(STABS[0], STABS[1], 'szone_141'", """HEROES = [(89.271, 'home4', 7.08, 1.5, 0.66, 0.55), (90.16, 'lobby12', 2.6, 1.3, 0.3, 0.6), (90.70, 'lobby12', 5.25, 1.3, 0.5, 0.33),
          (91.13, 'coop12', 10.82, 1.5, 0.5, 0.62), (91.60, 'stitle', 3.5, 1.7, 0.5, 0.52)]
ends = [h[0] for h in HEROES[1:]] + [92.33]
for (t0, nm, src, z, x, y), t1 in zip(HEROES, ends):
    shot(t0, t1, nm, src=src, speed=0.6, z=(z, z * 0.95), x=x, y=y, settle=0.06, sfx=0)
    hit(t0, fl=0.25, sk=10, pu=0.03, ca=0.004, d=0.18)
RECAP = [('tooltip3', 2.6, 1.5, 0.33, 0.49), ('art_3', 2.6, 1.8, 0.3, 0.64), ('ward3', 2.05, 1.4, 0.55, 0.4), ('flare3', 2.7, 1.3, 0.62, 0.4),
         ('szone_21', lock('szone_21') + 0.2, 1.25, 0.5, 0.46), ('szone_41', lock('szone_41') + 0.2, 1.25, 0.5, 0.46), ('vein3', 1.4, 1.5, 0.5, 0.5),
         ('vein3', 3.6, 1.25, 0.5, 0.5), ('vein3', 7.8, 1.4, 0.62, 0.5), ('vein3', 12.7, 1.4, 0.5, 0.58), ('vein3', 18.8, 1.3, 0.55, 0.5),
         ('vein3', 20.0, 2.2, 0.49, 0.1), ('revive3', 4.4, 1.8, 0.45, 0.17), ('cavein3', 5.05, 1.3, 0.35, 0.5), ('streak_20', 2.9, 1.25, 0.47, 0.42),
         ('streak_40', 2.9, 1.25, 0.47, 0.42), ('streak_60', 2.9, 1.25, 0.47, 0.42), ('streak_80', 2.9, 1.25, 0.47, 0.42), ('dynamite3', 1.6, 1.15, 0.5, 0.5),
         ('art_1', 2.6, 1.8, 0.3, 0.64), ('end3', 1.4, 1.25, 0.5, 0.45), ('toasts3', 3.6, 1.5, 0.72, 0.78), ('codex3', 0.6, 1.15, 0.5, 0.45),
         ('codex3', 9.0, 1.35, 0.5, 0.45), ('codex3', 18.4, 1.2, 0.5, 0.5), ('race4', 2.6, 1.35, 0.4, 0.3), ('race4', 6.3, 1.3, 0.6, 0.55),
         ('coop12', 12.95, 1.35, 0.5, 0.6), ('szone_61', lock('szone_61') + 0.2, 1.25, 0.5, 0.46), ('szone_81', lock('szone_81') + 0.2, 1.25, 0.5, 0.46),
         ('szone_121', lock('szone_121') + 0.2, 1.25, 0.5, 0.46), ('szone_131', lock('szone_131') + 0.2, 1.25, 0.5, 0.46)]
t, d, i = 92.33, 0.24, 0
while t < STABS[0] - 0.03:
    nm, src, z, x, y = RECAP[i % len(RECAP)]
    dd = min(d, STABS[0] - t)
    shot(t, t + dd, nm, src=src, speed=0.5, z=z, x=x, y=y, sfx=0)
    hit(t, fl=0.06 + min(0.25, i * 0.008), d=0.05)
    t += dd; i += 1; d = max(1 / 20, d * 0.93)
""")
s = s.replace("title('end_url', OUT2 - 0.02, DURATION + 1, 'rise')", "title('end_credit', OUT2 - 0.02, DURATION + 1, 'rise')")
s = s.replace("tag('tag3_tooltips', BUILD + 0.05, 23.5)", "tag('tag3_tooltips', BUILD + 0.05, 22.35)")
s = s.replace("name = 'preview3.mp4' if mode == 'preview' else 'trailer3.mp4'", "name = 'preview4.mp4' if mode == 'preview' else 'trailer4.mp4'")
s = s.replace("out = os.path.join(ROOT, 'music', 'trailer3_mix.wav')", "out = os.path.join(ROOT, 'music', 'trailer4_mix.wav')")
s = s.replace("f'streak_{n}'", "f'streak4_{n}'").replace("'streak_", "'streak4_")
rep("shot(23.66, 25.6, 'art_3', src=0.8, speed=0.9, z=(1.75, 2.0), x=0.3, y=0.64,", "shot(23.66, 25.6, 'art_auspex', src=1.5, speed=1.3, z=(1.4, 1.55), x=0.3, y=0.67,")
s = s.replace("('art_3', 2.6, 1.8, 0.3, 0.64)", "('art_auspex', 4.2, 1.6, 0.31, 0.63)")
open(os.path.join(ROOT, 'edit4.py'), 'w', encoding='utf-8').write(s)
print('edit4 written')
