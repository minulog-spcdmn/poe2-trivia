"""Render edit4 with several GPU processes at once (each a stretch of frames, NVENC), stitch, mux the mix,
and encode the deliverables, also on NVENC. python render_fast.py [workers] [out_dir]"""
import os, sys, subprocess, time
os.environ['GPU'] = '1'
ROOT = os.path.dirname(os.path.abspath(__file__))
FF = os.path.join(ROOT, 'bin', 'ffmpeg.exe')
FPS = int(os.environ.get('FPS', '60'))
# Below 60 fps each frame is exposed as a film camera would: a 180 degree shutter (open half the frame's
# time), sampled at SHUTTER instants and averaged, so motion blurs instead of stepping.
SHUTTER = int(os.environ.get('SHUTTER', '6' if FPS < 60 else '1'))
def exposed(frame, cuts=()):
    """The frame exposed over the shutter; never across a hard cut (`cuts`): only the instants on the
    frame's own side of it are kept, so a cut stays a clean cut."""
    if SHUTTER <= 1: return frame
    cuts = sorted(cuts)
    def f(t, i):
        ts = [t + (k + 0.5) / SHUTTER * (0.5 / FPS) - 0.25 / FPS for k in range(SHUTTER)]
        for c in cuts:
            if ts[0] < c <= ts[-1]:
                ts = [x for x in ts if (x >= c) == (t >= c)] or [t]
        acc = None
        for k, x in enumerate(ts):
            y = frame(x, i * SHUTTER + k)
            acc = y if acc is None else acc + y
        return acc / len(ts)
    return f

def work(args):
    k, f0, f1 = args
    import importlib, gengine
    edit4 = importlib.import_module(os.environ.get('EDIT', 'edit4'))
    out = os.path.join(ROOT, 'seg', f'{k:02d}.mp4')
    import edit4 as _B
    soft = set(getattr(edit4, 'SOFT_CUTS', ()))
    hard = [x.t0 for x in _B.S if not any(abs(x.t0 - c) < 2e-3 for c in soft)]
    gengine.render(exposed(edit4.frame, hard), out, fps=FPS, t0=f0 / FPS, t1=f1 / FPS, quiet=True)
    return k

if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    out_dir = sys.argv[2] if len(sys.argv) > 2 else ROOT
    a = time.time()
    import importlib
    edit4 = importlib.import_module(os.environ.get('EDIT', 'edit4'))
    audio = edit4.build_sound()
    # level: a plain gain toward -14 LUFS integrated, held so the true peak stays under -1 dBTP (no
    # compression: the music arrives mastered, and its dynamics are left as they are)
    import json as _j, re as _re
    p1 = subprocess.run([FF, '-hide_banner', '-i', audio, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = _j.loads(_re.findall(r'\{[^{}]*\}', p1)[-1])
    gain = min(-14.0 - float(m['input_i']), -1.0 - float(m['input_tp']))
    mastered = audio.replace('.wav', '_master.wav')
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', audio, '-af', f'volume={gain:.2f}dB', '-c:a', 'pcm_s24le', '-ar', '48000', mastered], check=True)
    print(f"level: {m['input_i']} LUFS, {m['input_tp']} dBTP in; {gain:+.2f} dB -> {float(m['input_i']) + gain:.1f} LUFS", flush=True)
    audio = mastered
    total = round(edit4.DURATION * FPS)
    cuts = [round(total * i / n) for i in range(n + 1)]
    os.makedirs(os.path.join(ROOT, 'seg'), exist_ok=True)
    lst = os.path.join(ROOT, 'seg', 'list.txt')
    if os.environ.get('SPLICED'):                        # splice.py made the picture: only the sound and the encodes
        open(lst, 'w').write(f"file '{os.path.abspath(os.environ['SPLICED'])}'\n")
    else:
        from multiprocessing import Pool
        with Pool(n) as p:
            for k in p.imap_unordered(work, [(i, cuts[i], cuts[i + 1]) for i in range(n)]):
                print(f'segment {k} done at {time.time() - a:.0f} s', flush=True)
        open(lst, 'w').write(''.join(f"file '{i:02d}.mp4'\n" for i in range(n)))
    NAME = os.environ.get('NAME', 'poe2quest-delve-trailer')
    master = os.path.join(ROOT, NAME + '_master.mp4')
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-i', audio,
                    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', master], check=True)
    tags = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']
    # the master: 10-bit HEVC (no banding in the dark gradients; YouTube takes it)
    HEVC = ['-c:v', 'hevc_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'vbr', '-multipass', 'fullres', '-spatial-aq', '1', '-temporal-aq', '1',
            '-rc-lookahead', '32', '-bf', '3', '-profile:v', 'main10', '-pix_fmt', 'p010le', '-tag:v', 'hvc1', '-movflags', '+faststart'] + tags + [
            '-bsf:v', 'hevc_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0']
    # the web copy: 8-bit H.264 for anything that plays, brought down from 10 bits with error diffusion, and
    # encoded by x264 on every CPU thread with adaptive quantisation mode 3, which gives the dark, flat areas
    # the bits they need (NVENC smoothed the dither away and the gradients stepped again)
    big = os.environ.get('RES') == '2160'               # rendered in 4K: the web copy is the 1080p made from it
    H264 = ['-vf', ('zscale=w=1920:h=1080:filter=spline36:' if big else 'zscale=') + 'dither=error_diffusion:matrix=709:matrixin=709:range=limited:rangein=limited,format=yuv420p',
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'film',
            '-x264-params', f'aq-mode=3:aq-strength=1.0:deblock=-1,-1:threads={os.cpu_count()}', '-movflags', '+faststart'] + tags + [
            '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0']
    jobs = [subprocess.Popen([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', master] + HEVC +
                             (['-b:v', '100M', '-maxrate', '130M', '-bufsize', '260M'] if big else ['-b:v', '40M', '-maxrate', '55M', '-bufsize', '110M']) + ['-c:a', 'copy', os.path.join(out_dir, NAME + '.mp4')]),
            subprocess.Popen([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', master] + H264 +
                             ['-c:a', 'aac', '-b:a', '256k', os.path.join(out_dir, NAME + '-web.mp4')])]
    for j in jobs: j.wait()
    print(f'all done in {time.time() - a:.0f} s')
