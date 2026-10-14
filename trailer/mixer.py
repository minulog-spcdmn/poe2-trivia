"""The trailer's sound: the music, and under it the game's own sounds where its shots are on screen."""
import os, numpy as np, scipy.io.wavfile as wf

ROOT = os.path.dirname(os.path.abspath(__file__))
SR = 48000
_ev = {}
def events(clip):
    if clip not in _ev:
        p = os.path.join(ROOT, 'clips', clip, 'sfx.npz')
        if os.path.exists(p):
            z = np.load(p); _ev[clip] = (z['onsets'], z['offs'], z['pcm'])
        else: _ev[clip] = None
    return _ev[clip]

def place_shot(track, s, gain=1.0, tail=0.35, pre=0.05):
    """Add shot s's sounds: each event whose onset lies in the shot's source range, at the trailer time it shows."""
    ev = events(s.clip)
    if ev is None or getattr(s, 'mute', False): return
    on, offs, pcm = ev
    ts = np.linspace(s.t0, s.t1, 400)
    src = np.array([s.src_at(T) for T in ts])
    lo, hi = src.min(), src.max()
    for v, (a, b) in zip(on, offs):
        if not (lo - pre <= v < hi): continue
        T = float(np.interp(v, src, ts)) if src[-1] > src[0] else s.t0
        seg = pcm[a:b]
        sp = abs(s.speed_at(T)) if hasattr(s, 'speed_at') else 1.0
        if sp < 0.75:   # slow motion: the sound slows and drops with it, a little
            k = max(0.5, sp ** 0.5)
            n = int(len(seg) / k); x = np.linspace(0, len(seg) - 1, n)
            seg = np.stack([np.interp(x, np.arange(len(seg)), seg[:, c]) for c in range(2)], 1)
        i = int(T * SR)
        end_keep = int((s.t1 + tail - T) * SR)
        if end_keep <= 0: continue
        seg = seg[:end_keep].copy()
        f = min(len(seg), int(0.25 * SR))
        if len(seg) >= end_keep and f > 0: seg[-f:] *= np.linspace(1, 0, f)[:, None]
        j = min(len(track), i + len(seg))
        if i < len(track) and j > i: track[i:j] += seg[:j - i] * gain

def mix(music_path, shots, out_path, sfx_db=-4.5, duck_db=4.0, extra=None):
    sr, m = wf.read(music_path)
    m = m.astype(np.float32) / 32768
    if sr != SR:
        x = np.linspace(0, len(m) - 1, int(len(m) * SR / sr))
        m = np.stack([np.interp(x, np.arange(len(m)), m[:, c]) for c in range(2)], 1)
    track = np.zeros_like(m)
    for s in shots: place_shot(track, s, gain=getattr(s, 'sfx_gain', 1.0))
    if extra: extra(track)
    # compress the game's sounds (3:1 over -32 dB, fast attack, 120 ms release) so quiet ones carry under the music
    w = int(0.01 * SR)
    lvl = np.sqrt(np.convolve((track ** 2).mean(1), np.ones(w) / w, 'same')) + 1e-9
    thr = np.percentile(lvl[lvl > 1e-5], 99.5) * 10 ** (-24 / 20) if (lvl > 1e-5).any() else 1
    g = np.where(lvl > thr, (lvl / thr) ** (1 / 3 - 1), 1.0)
    rel = np.exp(-1 / (0.12 * SR)); gs = np.empty_like(g); cur = 1.0
    for i in range(0, len(g), 64):
        seg = g[i:i + 64].min(); cur = seg if seg < cur else cur * rel ** 64 + seg * (1 - rel ** 64); gs[i:i + 64] = cur
    track *= gs[:, None]
    peak = np.abs(track).max()
    if peak > 0: track *= (10 ** (sfx_db / 20)) / peak * 1.0
    # duck the music a little under loud game sounds
    w = int(0.03 * SR)
    env = np.sqrt(np.convolve((track ** 2).mean(1), np.ones(w) / w, 'same'))
    env = env / (env.max() + 1e-9)
    duck = 10 ** (-duck_db * np.clip(env * 2.5, 0, 1) / 20)
    out = m * duck[:, None] * 0.92 + track
    out = np.tanh(out * 1.05) / np.tanh(1.05)        # soft limit
    wf.write(out_path, SR, (np.clip(out, -1, 1) * 32767).astype(np.int16))
