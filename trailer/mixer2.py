"""The trailer's sound, v2: the music, the game's sounds where their shots are on screen, and the game's
transition sounds under the cuts. Each game sound is set against the music playing at that moment (by
loudness, so a click and the blast both sit in the mix rather than one set by the other), most of the way
to `rel_db` under it while keeping something of their own differences; the music gives way a little
under them."""
import os, numpy as np, scipy.io.wavfile as wf
import mixer as M

ROOT = M.ROOT
SR = M.SR

def _mavg(x, w, mode='same'):
    """Moving average of a 1-D signal over w samples, by running sums (any w costs the same)."""
    w = max(1, int(w)); c = np.concatenate([[0.0], np.cumsum(x, dtype=np.float64)])
    v = (c[w:] - c[:-w]) / w
    if mode == 'valid': return v
    pad = w - 1; a = pad // 2
    return np.concatenate([np.full(a, v[0]), v, np.full(pad - a, v[-1])])

def _rms(x):
    return float(np.sqrt((x.astype(np.float64) ** 2).mean() + 1e-12))

def _loudest(x, win=0.15):
    """RMS of the loudest `win` seconds."""
    w = int(win * SR)
    if len(x) <= w: return _rms(x)
    e = _mavg((x ** 2).mean(1), w, 'valid')
    return float(np.sqrt(e.max() + 1e-12))

def _load(path):
    sr, x = wf.read(path); x = x.astype(np.float32) / (32768 if x.dtype == np.int16 else 1)
    if x.ndim == 1: x = np.stack([x, x], 1)
    if sr != SR:
        t = np.linspace(0, len(x) - 1, int(len(x) * SR / sr))
        x = np.stack([np.interp(t, np.arange(len(x)), x[:, c]) for c in range(2)], 1)
    return x

def shot_events(s, tail=0.35, pre=0.05):
    """(trailer time, pcm) for each of shot s's game sounds in its source range, slowed with slow motion."""
    ev = M.events(s.clip)
    if ev is None or getattr(s, 'mute', False): return []
    on, offs, pcm = ev
    ts = np.linspace(s.t0, s.t1, 400); src = np.array([s.src_at(T) for T in ts])
    lo, hi = src.min(), src.max(); out = []
    for v, (a, b) in zip(on, offs):
        if not (lo - pre <= v < hi): continue
        T = float(np.interp(v, src, ts)) if src[-1] > src[0] else s.t0
        seg = pcm[a:b]
        sp = abs(s.speed_at(T)) if hasattr(s, 'speed_at') else 1.0
        if sp < 0.75:
            k = max(0.5, sp ** 0.5); n = int(len(seg) / k); x = np.linspace(0, len(seg) - 1, n)
            seg = np.stack([np.interp(x, np.arange(len(seg)), seg[:, c]) for c in range(2)], 1)
        keep = int((s.t1 + tail - T) * SR)
        if keep <= 0: continue
        seg = seg[:keep].copy()
        f = min(len(seg), int(0.25 * SR))
        if len(seg) >= keep and f > 0: seg[-f:] *= np.linspace(1, 0, f)[:, None]
        out.append((T, seg, getattr(s, 'sfx_gain', 1.0)))
    return out

def _place(track, T, seg, k):
    i = int(T * SR)
    if i >= len(track) or len(seg) == 0: return
    a = max(0, -i); i0 = max(0, i); j = min(len(track), i + len(seg))
    if j > i0: track[i0:j] += seg[a:a + j - i0] * k

def _compress(track, ratio=2.0, pct=90, rel_s=0.12):
    """Gentle compression over the track's own loud parts (above its `pct` percentile of active level)."""
    lvl = np.sqrt(_mavg((track ** 2).mean(1), int(0.01 * SR))) + 1e-9
    act = lvl[lvl > 1e-5]
    if not len(act): return track
    thr = np.percentile(act, pct)
    g = np.where(lvl > thr, (lvl / thr) ** (1 / ratio - 1), 1.0)
    rel = np.exp(-1 / (rel_s * SR)); gs = np.empty_like(g); cur = 1.0
    for i in range(0, len(g), 64):
        v = g[i:i + 64].min(); cur = v if v < cur else cur * rel ** 64 + v * (1 - rel ** 64); gs[i:i + 64] = cur
    return track * gs[:, None]

def mix(music_path, shots, out_path, rel_db=-2.5, duck_db=2.0, cues=(), cue_db=-7.0):
    """Each game sound is set most of the way (65%, in dB) to `rel_db` under the music around it, so a click
    and the blast both sit in the mix while the game's own loud and soft still show; then gently
    compressed together. The transition sounds (cues: trailer time of their peak, wav, gain dB) are set
    `cue_db` under the music where they fall. The music gives way by up to `duck_db` under loud game
    sounds, and a peak limiter keeps the whole under -2.2 dBFS (room for the peaks between samples)."""
    m = _load(music_path)
    menv = np.sqrt(_mavg((m ** 2).mean(1), int(0.4 * SR)) + 1e-12)
    track = np.zeros_like(m)
    floor = float(np.percentile(menv, 30))                 # in a hush, not as quiet as the hush
    for s_ in shots:
        for T, seg, g in shot_events(s_):
            i = int(T * SR); here = max(float(menv[max(0, i):i + SR // 2].mean()) if i < len(menv) else floor, floor)
            L = 20 * np.log10(_loudest(seg)); target = 20 * np.log10(here) + rel_db
            # most of the way to the target, so the game's own loud and soft still show
            gain_db = float(np.clip(0.65 * (target - L), -12.0, 24.0))
            _place(track, T, seg, g * 10 ** (gain_db / 20))
    track = _compress(track)
    track = room(highpass(track))                        # out of the music's low end, and into its space
    for t_peak, path, gdb in cues:
        x = _load(path)
        pk = int(np.argmax(_mavg(np.abs(x).mean(1), 480)))
        i = int(t_peak * SR); here = max(float(menv[max(0, i - SR // 4):i + SR // 4].mean()), floor)
        k = here * 10 ** ((cue_db + gdb) / 20) / _loudest(x)
        _place(track, t_peak - pk / SR, x, k)
    tenv = np.sqrt(_mavg((track ** 2).mean(1), int(0.05 * SR)) + 1e-12)
    ratio = np.clip(tenv / (menv * 10 ** (rel_db / 20) + 1e-9), 0, 1)
    duck = 10 ** (-duck_db * ratio ** 2 / 20)
    out = m * duck[:, None] + track
    out = limit(out)
    wf.write(out_path, SR, (np.clip(out, -1, 1) * 32767).astype(np.int16))
    return out

def highpass(x, hz=90.0):
    """Two poles at hz (12 dB an octave): the game's sounds kept out of the music's low end."""
    from scipy.signal import butter, sosfiltfilt
    return sosfiltfilt(butter(2, hz, 'highpass', fs=SR, output='sos'), x, axis=0).astype(np.float32)

def room(x, wet_db=-15.0, rt60=0.9, predelay=0.012, seed=4):
    """A short, dark room around the game's sounds, so they sit in the music's space rather than dry on
    top of it: decorrelated noise for each ear, decaying over rt60, its highs fading as it does."""
    from scipy.signal import fftconvolve, butter, sosfilt
    n = int(rt60 * 1.2 * SR); g = np.random.default_rng(seed)
    t = np.arange(n) / SR; env = 10 ** (-3 * t / rt60)
    ir = g.standard_normal((n, 2)).astype(np.float32) * env[:, None]
    lo = butter(1, 2500, 'lowpass', fs=SR, output='sos'); ir = sosfilt(lo, ir, axis=0)
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True))
    ir = np.concatenate([np.zeros((int(predelay * SR), 2), np.float32), ir])
    wet = np.stack([fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], 1).astype(np.float32)
    return x + wet * 10 ** (wet_db / 20)

def limit(x, ceiling=0.78, attack=0.002, release=0.08):
    """A peak limiter: only the samples that would pass the ceiling are turned down, the gain reaching
    its low a moment before them (lookahead) and recovering after; the rest is left as it is."""
    env = np.abs(x).max(1)
    need = np.minimum(1.0, ceiling / np.maximum(env, 1e-9))
    w = max(1, int(attack * SR))
    # the lowest gain needed within the lookahead window, so the gain is down before the peak arrives
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(need, size=2 * w + 1)
    rel = np.exp(-1 / (release * SR)); out = np.empty_like(g); cur = 1.0
    for i in range(0, len(g), 32):
        v = g[i:i + 32].min()
        cur = v if v < cur else cur * rel ** 32 + v * (1 - rel ** 32)
        out[i:i + 32] = cur
    return x * np.minimum(out, g)[:, None]
