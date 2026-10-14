"""grade_measure.py : each shot's levels and cast as the post chain leaves them (grade off), into grade.json
with the curve and white balance that bring it to the trailer's targets."""
import os, json, importlib
os.environ['GPU'] = '1'; os.environ['GRADE_OFF'] = '1'
import numpy as np, torch
E = importlib.import_module(os.environ.get('EDIT', 'edit60p'))
import edit4 as B, gengine as G
OWN_COLOUR = ('szone_', 'presents', 'flare3', 'ward3', 'streak4')   # their colour is the point: no white balance
SKIP = ('presents',)                                           # designed as it is: no curve either
out = {}
rows = []
with torch.inference_mode():
    for s in B.S:
        if s.t0 >= E.SLAM: continue
        ts = np.linspace(s.t0, s.t1, 7)[1:-1]
        px = []
        for t in ts:
            E.frame(float(t), int(t * 30)); y = E.GR.last
            lb = int(round((G.H - G.W / 2.39) / 2 * B.letterbox_at(float(t))))
            px.append(y[:, lb + 2:G.H - lb - 2, ::2].clamp(0, 1).reshape(3, -1).cpu().numpy())
        p = np.concatenate(px, 1)
        L = p[0] * 0.0722 + p[1] * 0.7152 + p[2] * 0.2126
        b, m, w = np.percentile(L, 1), np.percentile(L, 50), np.percentile(L, 99.5)
        cast = (p[2].mean() - p[0].mean()) * 255                 # R - B
        if any(s.clip.startswith(k) for k in SKIP):
            curve, wb = [], [1.0, 1.0, 1.0]
        else:
            bt = max(b, 6 / 255)
            mt = float(max(m, min(max(m * 1.45, 20 / 255), 52 / 255)))     # never darker than it was
            wt = float(min(235 / 255, max(w, min(215 / 255, w * 1.6))))
            q = float(np.sqrt(m * w)); qt = float(min(wt - 0.02, np.sqrt(mt * wt) * 1.06))   # the upper mids kept steep: punch
            curve = [(float(b), float(bt)), (float(m), mt), (q, qt), (float(w), wt)]
            if any(s.clip.startswith(k) for k in OWN_COLOUR) or abs(cast) > 25: wb = [1.0, 1.0, 1.0]   # a burst of light is no cast
            else:
                d = float(np.clip((cast - 6.0) * 0.5, -4, 4)) / 255   # half way to a gently warm neutral, a few levels at most
                k = d / max(1e-3, p[2].mean() + p[0].mean())
                wb = [float(1 + k), 1.0, float(1 - k)]              # BGR
        out[f'{s.t0:.3f}'] = {'clip': s.clip, 'curve': curve, 'wb': wb}
        rows.append((s.t0, s.clip, b * 255, m * 255, w * 255, cast))
json.dump(out, open('grade.json', 'w'), indent=1)
for r in rows: print(f'{r[0]:6.2f} {r[1]:16s} black {r[2]:5.1f} mid {r[3]:5.1f} peak {r[4]:5.1f} cast {r[5]:+5.1f}')
