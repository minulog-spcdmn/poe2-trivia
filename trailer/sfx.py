"""In-game sound for a clip: the tapped stream (real time) cut into silence-separated events,
each stamped with the virtual time it started at. The page ran K times slow, so its sounds
played at normal speed but K times further apart: placing each event at its virtual onset,
unstretched, gives the sound as it would have been heard.
python sfx.py clip [clip ...]  -> clips/<clip>/sfx.npz (onsets, offsets into one pcm array)"""
import json, os, sys
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
SR = 48000

def extract(name, gate_db=-58.0, gap_ms=60, pre_ms=8):
    d = os.path.join(ROOT, 'clips', name)
    if not os.path.exists(os.path.join(d, 'audio.json')): return None
    J = json.load(open(os.path.join(d, 'audio.json')))['chunks']
    if not J: return None
    raw = np.fromfile(os.path.join(d, 'audio.pcm'), np.int16)
    r0 = J[0][1]
    n = int((J[-1][1] - r0) / 1000 * SR) + 8192
    y = np.zeros((n, 2), np.float32)
    vr = []                                 # (real ms, virtual s) pairs to map onsets
    for v, real, sr, off, nb in J:
        vr.append((real, v / 1000))
        if nb == 0: continue
        x = raw[off // 2:(off + nb) // 2].reshape(-1, 2).astype(np.float32) / 32768
        i = int(round((real - r0) / 1000 * SR)); y[i:i + len(x)] += x
    vr = np.array(vr)
    w = int(0.005 * SR)
    env = np.sqrt(np.convolve((y ** 2).mean(1), np.ones(w) / w, 'same'))
    on = env > 10 ** (gate_db / 20)
    # events: runs of sound, merged across short gaps
    idx = np.flatnonzero(np.diff(np.r_[0, on.astype(np.int8), 0]))
    runs = list(zip(idx[::2], idx[1::2]))
    ev = []
    for a, b in runs:
        if ev and a - ev[-1][1] < gap_ms / 1000 * SR: ev[-1][1] = b
        else: ev.append([a, b])
    onsets, offs, pcm, cur = [], [], [], 0
    for a, b in ev:
        if b - a < 0.01 * SR: continue
        a = max(0, a - int(pre_ms / 1000 * SR)); b = min(n, b + int(0.03 * SR))
        real = r0 + a / SR * 1000
        v = float(np.interp(real, vr[:, 0], vr[:, 1]))
        seg = y[a:b]
        onsets.append(v); offs.append((cur, cur + len(seg))); pcm.append(seg); cur += len(seg)
    if not pcm: return None
    np.savez(os.path.join(d, 'sfx.npz'), onsets=np.array(onsets), offs=np.array(offs), pcm=np.concatenate(pcm))
    return len(onsets)

if __name__ == '__main__':
    for nm in sys.argv[1:]:
        print(nm, extract(nm))
