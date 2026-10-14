"""remix.py : rebuild an edit's sound (EDIT), level it as render_fast does, and put it into finished files
(args) in place of their audio, the video copied as it is."""
import os, sys, json, re, subprocess, importlib
os.environ['GPU'] = '1'
E = importlib.import_module(os.environ['EDIT'])
import edit4 as B
FF = os.path.abspath('bin/ffmpeg.exe')
audio = E.build_sound() if hasattr(E, 'build_sound') else B.build_sound()
p1 = subprocess.run([FF, '-hide_banner', '-i', audio, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
m = json.loads(re.findall(r'\{[^{}]*\}', p1)[-1])
gain = min(-14.0 - float(m['input_i']), -1.0 - float(m['input_tp']))
lev = audio.replace('.wav', '_master.wav')
subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', audio, '-af', f'volume={gain:.2f}dB', '-c:a', 'pcm_s24le', '-ar', '48000', lev], check=True)
print(f"level: {m['input_i']} LUFS, {m['input_tp']} dBTP in; {gain:+.2f} dB")
for v in sys.argv[1:]:
    br = '256k' if v.endswith('-web.mp4') else '320k'
    tmp = v + '.tmp.mp4'
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', v, '-i', lev, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', br,
                    '-shortest', '-movflags', '+faststart', tmp], check=True)
    os.replace(tmp, v); print('remuxed', v)
