"""
15-second track for the Fuci motion reel (src/scenes/Reel.tsx): 128 BPM, one scene per bar.
Four-on-the-floor house groove with an offbeat bass and a bright arp; a whoosh into every cut and a
soft sub hit on it; scene sounds on top (tile-flip ticks, packet blips, a stab on each slammed word,
a shimmer as the swarm settles, counter ticks) and a wide final chord. No harsh transients.
Everything is synthesized here, so nothing needs a license.

    python3 scripts/reel.py       # writes public/reel.wav
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
rng = np.random.default_rng(128)
L = np.zeros(N)
R = np.zeros(N)

BPM = 128
BEAT = 60 / BPM
BAR = 4 * BEAT
CUTS = [round(i * BAR * FPS) / FPS for i in range(9)]  # same rounding as CUTS in Reel.tsx


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


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def saw(f, n, d=0.0):
    ph = f * (1 + d) * np.arange(n) / SR + rng.random()
    return 2 * (ph - np.floor(ph + 0.5))


def kick(gain=0.55):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t / 0.025)
    return np.tanh(1.5 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t / 0.14) * gain


def clap(gain=0.22):
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    e = np.exp(-t / 0.06)
    for d in (0.0, 0.009, 0.018):
        e = e + (t >= d) * np.exp(-np.maximum(t - d, 0) / 0.005) * 0.6
    return filt(rng.standard_normal(n), [1000, 6000], "band") * e * gain


def hat(gain=0.05, open_=False):
    n = int((0.16 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    return filt(rng.standard_normal(n), 8000, "high") * np.exp(-t / (0.05 if open_ else 0.012)) * gain


def bass(note, length, gain=0.24):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = filt(saw(hz(note), n) + 0.6 * np.sin(2 * np.pi * hz(note) * t), 420)
    return x * np.minimum(1, t / 0.004) * np.exp(-t / 0.18) * gain


def pluck(note, length=0.18, gain=0.07):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = saw(hz(note), n, -0.004) + saw(hz(note), n, 0.004)
    x = filt(x, 3200)
    return x * np.exp(-t / 0.07) * np.minimum(1, t / 0.002) * gain


def pad(notes, length, gain=0.06, attack=0.4):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = sum(saw(hz(m), n, d) for m in notes for d in (-0.008, 0.0, 0.009))
    x = filt(x / (len(notes) * 3), 2200)
    return x * np.clip(t / attack, 0, 1) * np.clip((length - t) / 0.3, 0, 1) * gain


def whoosh(length=0.4, gain=0.18):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n)
    seg = 512
    for i in range(0, n, seg):
        c = 500 + 6000 * (i / n) ** 1.5
        out[i : i + seg] = filt(x[i : i + seg], [c * 0.6, min(c * 1.5, 18000)], "band")
    return out * (t / length) ** 2 * gain


def impact(gain=0.45):
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    f = 40 + 60 * np.exp(-t / 0.05)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3)
    air = filt(rng.standard_normal(n), 2500) * np.exp(-t / 0.08) * 0.3
    return (sub + air) * gain


def tick(note, gain=0.05, length=0.04):
    n = int(length * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * hz(note) * t) * np.exp(-t / 0.012) * gain


def stab(notes, gain=0.12):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    x = sum(saw(hz(m), n, d) for m in notes for d in (-0.006, 0.006))
    x = filt(x / (len(notes) * 2), 4000)
    return x * np.exp(-t / 0.12) * np.minimum(1, t / 0.003) * gain


def shimmer(length, gain=0.06):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * hz(m) * t + m) for m in (84, 88, 91, 96))
    return x * (0.5 + 0.5 * np.sin(2 * np.pi * 7 * t)) * np.sin(np.pi * t / length) * gain / 4


# Chords per bar: Am, F, C, G, Am, F, C, G (roots) with a lifting final C/E.
ROOTS = [45, 41, 36, 43, 45, 41, 36, 43]
CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62], [57, 60, 64], [53, 57, 60], [55, 60, 64], [52, 55, 60, 64]]
ARP = [0, 2, 1, 2, 0, 1, 2, 1]

for b in range(8):
    t0 = CUTS[b]
    root, ch = ROOTS[b], CHORDS[b]
    add(pad(ch, BAR + 0.1, 0.05 if b < 7 else 0.09), t0)
    for k in range(4):
        tb = t0 + k * BEAT
        if b < 7 or k == 0:
            add(kick(0.5 if b else 0.3), tb)
        if k in (1, 3) and b > 0 and b < 7:
            add(clap(0.2), tb)
        add(bass(root - 12, BEAT * 0.4), tb + BEAT / 2)
        for h in range(2):
            add(hat(0.045 if h else 0.03, open_=(h == 1 and k == 3)), tb + h * BEAT / 2, 1.0, 0.35)
    if b > 0:  # arp from the second bar on
        for s in range(16):
            add(pluck(ch[ARP[s % 8]] + 12 + (12 if s % 8 == 7 else 0)), t0 + s * BEAT / 4, 1.0, -0.3 + 0.04 * (s % 16))

# Every cut: whoosh in, soft sub hit on it.
for c in CUTS[1:8]:
    add(whoosh(0.42, 0.2), c - 0.42, 1.0, 0.0)
    add(impact(0.42), c)

# Scene sounds.
s = CUTS
add(stab([69, 72, 76], 0.1), s[0] + 10 / FPS)  # logo letters
for i in range(4):
    add(tick(84 + i * 3, 0.06), s[0] + (10 + i * 4) / FPS)
add(stab([65, 69, 72], 0.12), s[1] + BEAT)  # morph snaps
add(stab([67, 71, 74], 0.12), s[1] + BEAT * 2.2)
for k in range(24):  # tile flip wave
    add(tick(76 + (k % 5) * 2, 0.035, 0.03), s[2] + k * 2.2 / FPS, 1.0, -0.6 + (k % 12) / 10)
for k in range(9):  # packets
    add(tick(91 - (k % 3) * 5, 0.05, 0.06), s[3] + (18 + k * 4) / FPS, 1.0, -0.5 + k / 8)
for k in range(4):  # word slams
    add(stab([57 + (k % 2) * 5, 64, 69], 0.16), s[4] + k * BEAT)
    add(impact(0.25), s[4] + k * BEAT)
add(shimmer(1.6, 0.12), s[5] + 0.1)  # swarm settles
for k in range(20):  # counters
    add(tick(96, 0.03, 0.025), s[6] + (6 + k * 1.2) / FPS, 1.0, -0.4 + (k % 4) * 0.27)

# Final resolve: wide chord, a reverse swell into it.
add(whoosh(0.8, 0.22), s[7] - 0.8)
add(impact(0.55), s[7])
add(pad([48, 55, 60, 64, 67, 72], DUR - s[7], 0.1, 0.05), s[7])
add(stab([60, 64, 67, 72], 0.14), s[7] + 14 / FPS)

out = np.stack([L, R], axis=1)
tt = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - tt) / 1.0, 0, 1) * np.clip(tt / 0.01, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.3)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "reel.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
