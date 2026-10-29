# What a trace from scripts/pc (game.mjs, cards.mjs) found, phase by phase:
# each phase runs from one mark to the next. For each: the frames over 25 and
# 50 ms and the worst, the GPU's time drawing the page's tiles (the GPU
# process's main thread, CrGpuMain, running the renderer's raster command
# buffer), the longest of those tasks, the raster in the phase's last second
# (what it costs at rest), and the long animation frames, with the script
# that took most of the longest.
#
# A page that hardly changes but keeps the GPU rastering is redrawing
# something every frame (docs/development.md, "Finding a stutter").
#   python scripts/pc/read.py .pc/runs/<label>.json

import json, sys, collections

path = sys.argv[1]
kept = json.load(open(path + '.frames.json'))

threads = {}
marks = {}
raster = []  # (ts us, dur us) on CrGpuMain
open_ = collections.defaultdict(list)


def done(e, dur, args):
    if e.get('name') == 'CommandBufferService:PutChanged' and 'RendererRaster' in json.dumps(args):
        raster.append((e['pid'], e['tid'], e['ts'], dur))


for line in open(path, encoding='utf-8', errors='replace'):
    line = line.strip().rstrip(',')
    if not line.startswith('{'):
        continue
    try:
        e = json.loads(line)
    except ValueError:
        continue
    ph = e.get('ph')
    if ph == 'M':
        if e.get('name') == 'thread_name':
            threads[(e['pid'], e['tid'])] = e['args']['name']
    elif ph in ('R', 'I', 'n', 'i') and e.get('cat', '').startswith('blink.user_timing'):
        marks.setdefault(e['name'], e['ts'])
    elif ph == 'X':
        done(e, e.get('dur', 0), e.get('args') or {})
    elif ph == 'B':
        open_[(e['pid'], e['tid'])].append(e)
    elif ph == 'E':
        stack = open_[(e['pid'], e['tid'])]
        if stack:
            b = stack.pop()
            done(b, e['ts'] - b['ts'], {**(b.get('args') or {}), **(e.get('args') or {})})

# The page's clock against the trace's: a mark both have.
page_marks = [(t, n) for t, n in kept['marks']]
common = next((n for t, n in page_marks if n in marks), None)
if common is None:
    sys.exit('no mark in both the trace and the page: was blink.user_timing traced?')
offset = marks[common] / 1000 - dict((n, t) for t, n in page_marks)[common]
gpu = [((ts / 1000) - offset, dur / 1000) for pid, tid, ts, dur in raster if threads.get((pid, tid)) == 'CrGpuMain']

frames = kept['frames']
end = frames[-1][0] if frames else 0
bounds = page_marks + [(end, None)]
print(f"{kept['vw']}x{kept['vh']} at {kept['dpr']}x; GPU raster in all: {sum(d for _, d in gpu):.0f} ms")
print(f"{'phase':14s} {'ms':>6s} {'>25':>4s} {'>50':>4s} {'worst':>6s} {'raster':>7s} {'longest':>8s} {'at rest':>8s}  long frames")
for (a, name), (b, _) in zip(bounds, bounds[1:]):
    if b <= a:
        continue
    ft = [d for t, d in frames if a <= t < b]
    r = [d for t, d in gpu if a <= t < b]
    rest = sum(d for t, d in gpu if max(a, b - 1000) <= t < b) * 1000 / max(1, min(1000, b - a))
    loaf = [l for l in kept['loaf'] if a <= l['t'] < b]
    worst = max(loaf, key=lambda l: l['d']) if loaf else None
    top = max(worst['scripts'], key=lambda s: s[0]) if worst and worst['scripts'] else None
    long_note = f"{len(loaf)}, longest {worst['d']} ms (style+layout {worst['style']})" + (f": {top[0]} ms in {top[3] or top[1]} ({top[2]})" if top else '') if worst else ''
    print(f"{name:14s} {b - a:6.0f} {sum(d > 25 for d in ft):4d} {sum(d > 50 for d in ft):4d} {max(ft, default=0):6.0f} {sum(r):7.0f} {max(r, default=0):8.1f} {rest:6.0f}/s  {long_note}")
