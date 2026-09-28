"""
15-second track for "Agents paying right now" (src/scenes/Terminal.tsx): dark synthwave at 100 BPM.
Key clicks while the command is typed, then a night-drive groove (warm pad, pulsing octave bass, a
filtered arpeggio, soft kick and snare) with a clean blip for every settled payment line, and a wide
chord under the end card. Everything is synthesized here, so nothing needs a license.

    python3 scripts/terminal.py      # writes public/terminal.wav
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
rng = np.random.default_rng(526)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Kept in step with T and LINE_AT in src/scenes/Terminal.tsx (12 payment lines).
T = dict(typeStart=14, typeEnd=50, lines=64, gap=21, end=342, dur=450)
LINES = [T["lines"] + i * T["gap"] for i in range(12)]
BPM = 100
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


def hz(n):
    return 440 * 2 ** ((n - 69) / 12)


def tt(length):
    return np.arange(int(length * SR)) / SR


def saw(f, t):
    return 2 * ((f * t) % 1) - 1


def pad(notes, length, g=0.05):
    t = tt(length)
    x = sum(saw(hz(m) * (1 + d), t) for m in notes for d in (-0.004, 0.004))
    env = np.clip(t / 0.8, 0, 1) * np.clip((length - t) / 0.8, 0, 1)
    return filt(x * env, 1200) * g


def bass(n, length, g=0.16):
    t = tt(length)
    x = saw(hz(n), t)
    return filt(x * np.exp(-t * 6) * np.clip(t / 0.004, 0, 1), 700) * g


def arp(n, length=0.16, g=0.05):
    t = tt(length)
    x = np.sign(np.sin(2 * np.pi * hz(n) * t))
    return filt(x * np.exp(-t * 14), 2200) * g


def kick(g=0.45):
    t = tt(0.3)
    f = 45 + 100 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * g


def snare(g=0.16):
    t = tt(0.25)
    n = filt(rng.standard_normal(len(t)), [1200, 6000], "band")
    return (n * np.exp(-t * 18) + 0.4 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25)) * g


def click(g=0.05):
    t = tt(0.025)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 300), [2500, 8000], "band") * g


def blip(n, g=0.07):
    t = tt(0.35)
    return (np.sin(2 * np.pi * hz(n) * t) + 0.3 * np.sin(4 * np.pi * hz(n) * t)) * np.exp(-t * 11) * g


# Typing: a key click every other character.
for k in range(15):
    add(click(), sec(T["typeStart"]) + k * (sec(T["typeEnd"] - T["typeStart"]) / 15) + rng.random() * 0.01, 1.0, 0.3)

# Groove from the first line to the end card: Am - F - C - G, one bar each.
CH = [(45, [57, 60, 64]), (41, [57, 60, 65]), (48, [55, 60, 64]), (43, [55, 59, 62])]
t0 = sec(T["lines"]) - BEAT
end = sec(T["end"])
bar, t = 0, t0
while t < end - 0.01:
    root, ch = CH[bar % 4]
    add(pad(ch, 4 * BEAT + 0.8), t, 1.0, -0.1)
    for b in range(4):
        tb = t + b * BEAT
        if tb >= end:
            break
        add(kick(), tb)
        if b in (1, 3):
            add(snare(), tb, 1.0, 0.05)
        for e in range(2):
            add(bass(root - 12 + (12 if e else 0), BEAT * 0.45), tb + e * BEAT / 2)
        for s16 in range(4):
            add(arp(ch[(b * 4 + s16) % 3] + 12), tb + s16 * BEAT / 4, 1.0, 0.25 if s16 % 2 else -0.25)
    t += 4 * BEAT
    bar += 1

# A blip per settled payment line, stepping up a pentatonic scale.
SCALE = [81, 84, 86, 88, 91, 93]
for i, f in enumerate(LINES):
    add(blip(SCALE[i % len(SCALE)]), sec(f) + 0.02, 1.0, 0.15)

# End card: wide Am9 that rings out.
add(pad([45, 57, 60, 64, 67, 71], DUR - end, 0.07), end)
add(bass(33, 1.8, 0.2), end)
add(blip(93, 0.08), end + 0.05)

out = np.stack([L, R], axis=1)
ts = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - ts) / 1.6, 0, 1) * np.clip(ts / 0.05, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.3)
out /= np.max(np.abs(out)) / 0.88
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "terminal.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
