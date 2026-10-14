"""preview.py out.mp4 a0:b0 a1:b1 ... : just those stretches of EDIT, at 1080p 30 fps with their sound, one after
the other in one short file (for a look before the full render)."""
import os, sys, subprocess, importlib
os.environ['GPU'] = '1'
import render_fast as R, gengine as G
FF = os.path.abspath('bin/ffmpeg.exe')
out = sys.argv[1]; ranges = [tuple(float(v) for v in r.split(':')) for r in sys.argv[2:]]
E = importlib.import_module(os.environ['EDIT'])
import edit4 as B
audio = E.build_sound()
soft = set(getattr(E, 'SOFT_CUTS', ()))
hard = [x.t0 for x in B.S if not any(abs(x.t0 - c) < 2e-3 for c in soft)]
parts = []
for k, (a, b) in enumerate(ranges):
    p = os.path.join('seg', f'prev{k}.mp4'); parts.append(p)
    G.render(R.exposed(E.frame, hard), p, fps=R.FPS, t0=a, t1=b, audio=audio, quiet=True)
lst = os.path.join('seg', 'prev.txt'); open(lst, 'w').write(''.join(f"file '{os.path.basename(p)}'\n" for p in parts))
subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c:v', 'libx264', '-crf', '16', '-preset', 'fast',
                '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], check=True)
print('preview ->', out)
