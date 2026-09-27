"""
15-second track for "FNN, Fuci News Network" (src/scenes/News.tsx): a TV news broadcast.
A brass-and-timpani news sting, a BREAKING hit, then the classic newsroom bed (ticking pulse,
driving bass, soft strings) with a stab and a whoosh on each story, a hush on the lore line and a
full sign-off chord. Everything is synthesized here, so nothing needs a license.

    python3 scripts/news.py       # writes public/news.wav
"""
import math
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
FPS = 30
DUR = 15.2
N = int(DUR * SR)
rng = np.random.default_rng(2)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Frame timings, kept in step with T in src/scenes/News.tsx.
BREAKING, STUDIO, STORIES, LORE, SIGNOFF = 38, 66, (80, 148, 216, 284), 352, 400
BPM = 120
BEAT = 60 / BPM


def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    sig = sig[: N - i]
    L[i : i + len(sig)] += sig * gain * math.sqrt(0.5 * (1 - pan))
    R[i : i + len(sig)] += sig * gain * math.sqrt(0.5 * (1 + pan))


def filt(x, cutoff, kind="low", order=2):
    b, a = butter(order, np.clip(np.array(cutoff) / (SR / 2), 1e-4, 0.999), btype=kind)
    return lfilter(b, a, x)


def env(n, a=0.005, d=0.2, s=0.0, r=0.05, hold=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    dec = s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4))
    e = np.where(t < a, e, dec)
    if hold is not None:
        e *= np.clip((hold + r - t) / r, 0, 1)
    return e


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    ph = (f * (1 + detune)) * t
    return 2 * (ph - np.floor(ph + 0.5))


def brass(notes, length, gain=0.2, attack=0.02, decay=0.5, sustain=0.35, bright=3200):
    """A brass section stab: detuned saws with a filter that opens on the attack."""
    n = int(length * SR)
    x = np.zeros(n)
    for m in notes:
        for d in (-0.004, 0.0, 0.005):
            x += saw(hz(m), n, d)
    x /= len(notes) * 3
    t = np.arange(n) / SR
    # Opening filter: split into two bands and crossfade from dark to bright.
    dark, lite = filt(x, 900), filt(x, bright)
    k = np.clip(t / 0.06, 0, 1) * np.exp(-t / 0.4)
    x = dark * (1 - k) + lite * k
    return x * env(n, attack, decay, sustain, 0.12, hold=length - 0.12) * gain


def timpani(note=38, gain=0.5, length=1.4):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note) * (1 + 0.15 * np.exp(-t / 0.03))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.35 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)
    skin = filt(rng.standard_normal(n), 1800) * np.exp(-t / 0.02) * 0.4
    return (body * np.exp(-t / 0.45) + skin) * gain


def roll(length, note=38, gain=0.3):
    out = np.zeros(int(length * SR) + int(1.4 * SR))
    hits = int(length / 0.055)
    for k in range(hits):
        g = gain * (0.35 + 0.65 * k / max(1, hits - 1))
        s = timpani(note, g, 0.5)
        i = int(k * 0.055 * SR)
        out[i : i + len(s)] += s
    return out


def tick(gain=0.1):
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    return filt(rng.standard_normal(n), 6000, "high") * np.exp(-t / 0.008) * gain


def blip(note, gain=0.08, length=0.09):
    n = int(length * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * hz(note) * t) * np.exp(-t / 0.03) * gain


def kick(gain=0.5):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 48 + 90 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16) * gain


def bass(note, length, gain=0.22):
    n = int(length * SR)
    x = filt(saw(hz(note), n) + 0.5 * np.sin(2 * np.pi * hz(note) * np.arange(n) / SR), 500)
    return x * env(n, 0.005, 0.25, 0.5, 0.04, hold=length - 0.04) * gain


def strings(notes, length, gain=0.12, attack=0.6):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for m in notes:
        vib = 1 + 0.003 * np.sin(2 * np.pi * 5.2 * t)
        for d in (-0.003, 0.003):
            x += np.sin(2 * np.pi * np.cumsum(hz(m) * (1 + d) * vib) / SR)
            x += 0.3 * saw(hz(m), n, d)
    x = filt(x / (len(notes) * 2), 2600)
    return x * np.clip(t / attack, 0, 1) * np.clip((length - t) / 0.4, 0, 1) * gain


def whoosh(length=0.5, gain=0.18, up=True):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    lo, hi = (600, 5000) if up else (5000, 600)
    out = np.zeros(n)
    seg = 512
    for i in range(0, n, seg):
        c = lo + (hi - lo) * (i / n)
        out[i : i + seg] = filt(x[i : i + seg], [c * 0.7, min(c * 1.3, 18000)], "band")[: len(out[i : i + seg])]
    shape = np.sin(np.pi * t / length) ** 2
    return out * shape * gain


# --- 0 to BREAKING: the FNN sting. Timpani roll into a big brass fanfare in D. ---
add(roll(0.5, 38, 0.22), 0.0)
fan = [(0.55, [50, 57, 62, 66], 0.18), (0.8, [50, 57, 62, 66], 0.14), (0.95, [52, 59, 64, 67], 0.2)]
for t, ch, l in fan:
    add(brass(ch, l, 0.3), t, 1.0, -0.2)
add(timpani(38, 0.55), 0.55)
add(brass([45, 57, 62, 66, 69, 74], 1.2, 0.34, sustain=0.45), sec(BREAKING) - 0.2, 1.0, 0.15)

# --- BREAKING: a hard low hit, a telex burst. ---
add(timpani(33, 0.7, 1.8), sec(BREAKING))
add(kick(0.6), sec(BREAKING))
add(brass([38, 45, 50, 53, 57], 0.9, 0.3, bright=2400), sec(BREAKING), 1.0, 0.0)
for k in range(8):
    add(blip(86 + (k % 3) * 2, 0.06), sec(BREAKING) + 0.35 + k * 0.06, 1.0, 0.4)

# --- STUDIO to LORE: the newsroom bed. Ticking 16ths, bass in D minor, strings, kick on 1 and 3. ---
t0, t1 = sec(STUDIO), sec(LORE)
prog = [(38, [62, 65, 69]), (34, [62, 65, 70]), (36, [60, 64, 67]), (33, [61, 64, 69])]
t, bar = t0, 0
while t < t1:
    root, chord = prog[bar % 4]
    bl = min(4 * BEAT, t1 - t)
    add(strings(chord, bl + 0.3, 0.1, 0.3), t, 1.0, 0.0)
    for b in range(8):
        tt = t + b * BEAT / 2
        if tt >= t1:
            break
        add(bass(root + (12 if b % 4 == 3 else 0), BEAT / 2 - 0.02, 0.2), tt)
    for b in range(4):
        if t + b * BEAT < t1 and b % 2 == 0:
            add(kick(0.42), t + b * BEAT)
    t += 4 * BEAT
    bar += 1
k = 0
t = t0
while t < t1:
    add(tick(0.1 if k % 4 == 0 else 0.055), t, 1.0, 0.35 if k % 2 else -0.35)
    t += BEAT / 4
    k += 1

# Each story: a whoosh in, a short brass stab and a counting blip run while the number climbs.
for i, s in enumerate(STORIES):
    ts = sec(s)
    add(whoosh(0.45, 0.16), ts - 0.4, 1.0, -0.4 + 0.25 * i)
    stab = [[62, 69, 74], [65, 69, 74], [64, 67, 72], [61, 64, 69]][i]
    add(brass(stab, 0.35, 0.22, decay=0.15, sustain=0.2), ts, 1.0, 0.1)
    add(timpani(38 if i % 2 == 0 else 33, 0.3, 0.8), ts)
    for j in range(10):
        add(blip(81 + j, 0.035, 0.05), ts + 0.1 + j * 0.05, 1.0, 0.3)

# --- LORE: the bed drops out. Low drone, a soft strings chord, a slow timpani swell. ---
tl = sec(LORE)
add(strings([50, 57, 62, 65, 69], sec(SIGNOFF) - tl + 0.4, 0.2, 0.5), tl)
add(bass(26, sec(SIGNOFF) - tl, 0.24), tl)
add(roll(sec(SIGNOFF) - tl - 0.1, 38, 0.18), tl + 0.1)
add(whoosh(0.9, 0.14), sec(SIGNOFF) - 0.85)

# --- SIGNOFF: full fanfare resolving to D major, timpani, a bell on top. ---
ts = sec(SIGNOFF)
add(timpani(38, 0.7, 1.8), ts)
add(kick(0.55), ts)
add(brass([50, 57, 62, 66, 69], 0.3, 0.3), ts, 1.0, -0.2)
add(brass([52, 59, 64, 67, 71], 0.3, 0.3), ts + 0.3, 1.0, 0.2)
add(brass([38, 50, 57, 62, 66, 69, 74], DUR - ts - 0.6, 0.36, sustain=0.5), ts + 0.6)
add(timpani(38, 0.55, 1.6), ts + 0.6)
add(strings([62, 66, 69, 74, 78], DUR - ts - 0.6, 0.12, 0.2), ts + 0.6)
for k, m in enumerate([86, 90, 93, 98]):
    n = int(1.2 * SR)
    tt = np.arange(n) / SR
    bell = (np.sin(2 * np.pi * hz(m) * tt) + 0.3 * np.sin(2 * np.pi * hz(m) * 2.76 * tt)) * np.exp(-tt / 0.4) * 0.05
    add(bell, ts + 0.65 + 0.09 * k, 1.0, -0.3 + 0.2 * k)

out = np.stack([L, R], axis=1)
fade = np.clip((DUR - 0.1 - np.arange(N) / SR) / 1.0, 0, 1) * np.clip(np.arange(N) / (0.02 * SR), 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.4)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "news.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
