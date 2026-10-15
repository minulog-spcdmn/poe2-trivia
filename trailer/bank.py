"""bank.py : the sound bank capture (clips/sfxbank) cut into one wav per game sound (music/sfxbank/<name>.wav),
each from its first sound to where it falls silent; prints each one's length and the time of its peak."""
import json, os
import numpy as np, scipy.io.wavfile as wf
SR = 48000
d = 'clips/sfxbank'
J = json.load(open(f'{d}/audio.json'))['chunks']; marks = json.load(open(f'{d}/stamps.json'))['marks']
raw = np.fromfile(f'{d}/audio.pcm', np.int16)
v0 = J[0][0]; n = int((J[-1][0] - v0) / 1000 * SR) + 8192
y = np.zeros((n, 2), np.float32)
for v, real, sr, off, nb in J:
    if nb == 0: continue
    x = raw[off // 2:(off + nb) // 2].reshape(-1, 2).astype(np.float32) / 32768
    i = int(round((v - v0) / 1000 * SR)); y[i:i + len(x)] += x
os.makedirs('music/sfxbank', exist_ok=True)
for name, t in marks:
    a = int((t - v0) / 1000 * SR); seg = y[a:a + int(3.4 * SR)]
    env = np.abs(seg).max(1)
    on = np.flatnonzero(env > 10 ** (-60 / 20))
    if not len(on): print(name, 'silent'); continue
    s0, s1 = max(0, on[0] - 48), min(len(seg), on[-1] + 2400)
    seg = seg[s0:s1]
    pk = int(np.argmax(np.convolve(np.abs(seg).mean(1), np.ones(480) / 480, 'same')))
    wf.write(f'music/sfxbank/{name}.wav', SR, (seg * 32767).astype(np.int16))
    print(f'{name:12s} {len(seg) / SR:5.2f}s  peak at {pk / SR:5.2f}s  peak {20 * np.log10(np.abs(seg).max() + 1e-9):6.1f} dBFS')
