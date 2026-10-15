"""splice.py base.mp4 out.mp4 a0:b0 a1:b1 ... : re-render only the given stretches (seconds; on the base's
keyframes, every 2 s) of EDIT at RES/FPS and join them into the base intermediate frame-exactly, re-encoded
once at the intermediate's near-lossless quality. Then: SPLICED=out.mp4 python render_fast.py 1 <out_dir>."""
import os, sys, subprocess, importlib, time
os.environ['GPU'] = '1'
import render_fast as R, gengine as G
FF = os.path.abspath('bin/ffmpeg.exe')
base, out = sys.argv[1], sys.argv[2]
ranges = [tuple(float(v) for v in r.split(':')) for r in sys.argv[3:]]
E = importlib.import_module(os.environ['EDIT'])
import edit4 as B
soft = set(getattr(E, 'SOFT_CUTS', ()))
hard = [x.t0 for x in B.S if not any(abs(x.t0 - c) < 2e-3 for c in soft)]
fps = R.FPS
total = round(E.DURATION * fps)
patches = []
for k, (a, b) in enumerate(ranges):
    f0, f1 = round(a * fps), min(total, round(b * fps))
    p = os.path.join('seg', f'patch{k}.mp4'); t = time.time()
    G.render(R.exposed(E.frame, hard), p, fps=fps, t0=f0 / fps, t1=f1 / fps, quiet=True)
    print(f'patch {k}: frames {f0}-{f1} in {time.time() - t:.0f} s', flush=True)
    patches.append((f0, f1, p))
# the base's frames between the patches, the patches in their place, one stream
inputs, parts, last, fc = ['-i', base], [], 0, []
nb = sum(1 for f0, _, _ in patches if f0 > 0) + 1
fc.append(f'[0:v]split={nb}' + ''.join(f'[b{i}]' for i in range(nb)))
bi = 0
for k, (f0, f1, p) in enumerate(patches):
    if f0 > last:
        fc.append(f'[b{bi}]trim=start_frame={last}:end_frame={f0},setpts=PTS-STARTPTS[s{len(parts)}]'); parts.append(None); bi += 1
    inputs += ['-i', p]
    fc.append(f'[{k + 1}:v]setpts=PTS-STARTPTS[s{len(parts)}]'); parts.append(None)
    last = f1
if last < total:
    fc.append(f'[b{bi}]trim=start_frame={last}:end_frame={total},setpts=PTS-STARTPTS[s{len(parts)}]'); parts.append(None); bi += 1
while bi < nb:   # unused split outputs must still be consumed
    fc.append(f'[b{bi}]trim=end_frame=1,setpts=PTS-STARTPTS[x{bi}]'); fc.append(f'[x{bi}]nullsink'); bi += 1
fc.append(''.join(f'[s{i}]' for i in range(len(parts))) + f'concat=n={len(parts)}:v=1:a=0[v]')
cmd = [FF, '-hide_banner', '-loglevel', 'error', '-y'] + inputs + ['-filter_complex', ';'.join(fc), '-map', '[v]'] + G.NVENC10 + ['-pix_fmt', 'p010le'] + G.BT709 + [out]
subprocess.run(cmd, check=True)
n = subprocess.run([FF, '-hide_banner', '-i', out, '-map', '0:v', '-c', 'copy', '-f', 'null', '-'], capture_output=True, text=True).stderr
print('spliced ->', out, [l for l in n.splitlines() if 'frame=' in l][-1:] )
