"""60 s cut, v16: v15 graded shot by shot (grade.py, measured by grade_measure.py into grade.json)."""
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ROOT, 'edit60o.py'), encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a[:90]; s = s.replace(a, b, 1)
rep("""    y = L2.colour(L2.to_disp(L2.shoulder(lin)))
    y = L2.ca(y, B.env(B.CA, t))
    y = L2.sharpen(y)
""", """    y = L2.colour(L2.to_disp(L2.shoulder(lin)))
    y = GR.apply(y, t)                                    # the shot's own grade
    m = GR.ui_mask(y) if GR.on else None
    if m is not None: y = GR.chapter(y, t, m)             # the chapter's colour, on the backdrop
    y = L2.ca(y, B.env(B.CA, t))
    y = y + (L2.sharpen(y) - y) * m if m is not None else L2.sharpen(y)   # sharpened: the UI only
""")
rep("def frame(t, f):", """import grade as _grade
GR = _grade.Grade(os.path.join(ROOT, 'grade.json'), [s_ for s_ in B.S if s_.t0 < SLAM], enabled=os.environ.get('GRADE_OFF') != '1')
def frame(t, f):""")
s = s.replace("'cut60o_mix.wav'", "'cut60p_mix.wav'")
open(os.path.join(ROOT, 'edit60p.py'), 'w', encoding='utf-8').write(s)
print('edit60p written')
