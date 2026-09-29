"""
15-second track for "Fuci, by the numbers" (src/scenes/Odometer.tsx): liquid drum & bass at 172 BPM in F minor.
An airy pad and a soft piano motif under the title, then a rolling two-step break with a warm sub. Each
odometer gets a run of mechanical clicks that speeds up and slows down with the wheels, and a solid "clunk"
plus a bell note when it locks on its number (the bells climb as the numbers grow). The end card lands on
a wide Db major 9 chord. Everything is synthesized here, so nothing needs a license.

    python3 scripts/odometer.py      # writes public/odometer.wav
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
rng = np.random.default_rng(172)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Kept in step with T and ROLL_AT in src/scenes/Odometer.tsx.
T = dict(title=0, roll=40, step=72, rollLen=42, end=352, dur=450)
ROLL_AT = lambda i: T["roll"] + i * T["step"]

BPM = 172
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


def sine(f, t):
    return np.sin(2 * np.pi * f * t)


def kick(g=0.45):
    t = tt(0.25)
    f = 50 + 120 * np.exp(-t * 40)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12) * g


def snare(g=0.26):
    t = tt(0.2)
    body = sine(210, t) * np.exp(-t * 35)
    noise = filt(rng.standard_normal(len(t)), [1800, 9000], "band") * np.exp(-t * 20)
    return (0.45 * body + noise) * g


def ghost(g=0.06):
    t = tt(0.06)
    return filt(rng.standard_normal(len(t)), [2000, 8000], "band") * np.exp(-t * 60) * g


def hat(g=0.035):
    t = tt(0.03)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 140), 9000, "high") * g


def ride(g=0.025):
    t = tt(0.4)
    x = sum(sine(f, t) for f in (3100, 4270, 5380, 6920))
    return filt(x + 0.5 * rng.standard_normal(len(t)), 5000, "high") * np.exp(-t * 7) * g


def sub(n, length, g=0.22):
    t = tt(length)
    env = np.clip(t / 0.01, 0, 1) * np.clip((length - t) / 0.05, 0, 1)
    return (sine(hz(n), t) + 0.15 * sine(2 * hz(n), t)) * env * g


def pad(notes, length, g=0.03):
    t = tt(length)
    x = sum(sine(hz(m) * (1 + d), t) + 0.35 * sine(2 * hz(m) * (1 + d), t) for m in notes for d in (-0.004, 0, 0.004))
    env = np.clip(t / 1.0, 0, 1) * np.clip((length - t) / 1.2, 0, 1)
    return filt(x * env, 2400) * g


def piano(n, length=1.2, g=0.06):
    t = tt(length)
    f = hz(n)
    x = sine(f, t) + 0.5 * sine(2 * f, t) * np.exp(-t * 3) + 0.25 * sine(3 * f, t) * np.exp(-t * 5)
    return x * np.exp(-t * 2.6) * np.clip(t / 0.004, 0, 1) * g


def bell(n, length=1.6, g=0.07):
    t = tt(length)
    x = sine(hz(n), t) + 0.4 * sine(hz(n) * 2.76, t) * np.exp(-t * 3) + 0.2 * sine(hz(n) * 5.4, t) * np.exp(-t * 6)
    return x * np.exp(-t * 2.2) * np.clip(t / 0.003, 0, 1) * g


def tick(g=0.05):
    t = tt(0.02)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 300), [2500, 7500], "band") * g


def clunk(g=0.2):
    t = tt(0.25)
    f = 120 * np.exp(-t * 10) + 60
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 18)
    knock = filt(rng.standard_normal(len(t)), [500, 2500], "band") * np.exp(-t * 60)
    return (body + 0.7 * knock) * g


def swell(length=1.0, g=0.05):
    t = tt(length)
    x = filt(rng.standard_normal(len(t)), [500, 5000], "band")
    return x * (t / length) ** 2 * g


# Chords (F minor): Fm9, Dbmaj9, Bbm9, C7sus. The piano motif plays over the title.
CHORDS = [[53, 56, 60, 63, 67], [49, 53, 56, 60, 63], [46, 49, 53, 56, 60], [48, 53, 55, 58, 62]]
ROOTS = [41, 37, 34, 36]
bar = 4 * BEAT

# Title: pad and piano motif, a swell into the drop.
add(pad(CHORDS[0], sec(T["roll"]) + 0.6, 0.035), 0)
for k, n in enumerate([72, 75, 79, 77]):
    add(piano(n, 1.4, 0.05), 0.12 + k * BEAT * 1.5, 1.0, -0.2 + k * 0.13)
add(swell(sec(T["roll"]) - 0.1, 0.045), 0.1)

# Groove from the first roll until the end card: two-step break, rides, sub following the chords.
t0 = sec(T["roll"])
b = 0
while t0 < sec(T["end"]) - 0.01:
    ch = b % 4
    s8 = [t0 + k * BEAT / 2 for k in range(8)]
    add(kick(), s8[0])
    add(kick(0.35), s8[5])
    add(snare(), s8[2], 1.0, 0.05)
    add(snare(), s8[6], 1.0, 0.05)
    for k in (3, 7):
        add(ghost(), s8[k] + BEAT / 4, 1.0, 0.1)
    for k in range(8):
        add(hat(), s8[k] + BEAT / 4, 1.0, 0.35)
    for k in (0, 4):
        add(ride(), s8[k], 1.0, -0.3)
    add(pad(CHORDS[ch], bar + 0.2, 0.022), t0)
    add(sub(ROOTS[ch], BEAT * 2.4), s8[0])
    add(sub(ROOTS[ch] + (7 if ch % 2 else 12), BEAT * 1.3), s8[5])
    t0 += bar
    b += 1

# Odometers: clicks spaced like the wheel speed (fast in the middle, slow at the end), then clunk + bell.
BELLS = [72, 75, 79, 84]
for i in range(4):
    start = sec(ROLL_AT(i))
    length = sec(T["rollLen"])
    # Ease the click rate: dense early, sparse as the wheels settle.
    ts = []
    t = 0.0
    while t < length * 0.95:
        ts.append(t)
        speed = 1 - (t / length) ** 1.6
        t += 0.028 + 0.2 * (1 - speed)
    for t in ts:
        add(tick(0.045), start + t, 1.0, -0.4 + i * 0.25)
    add(clunk(), start + length, 1.0, -0.4 + i * 0.25)
    add(bell(BELLS[i]), start + length + 0.02, 1.0, -0.3 + i * 0.2)

# End card: a swell, one last kick, and a wide Db major 9.
add(swell(0.9, 0.05), sec(T["end"]) - 0.9)
add(kick(0.4), sec(T["end"]))
add(pad([37, 49, 53, 56, 60, 63], DUR - sec(T["end"]) + 0.2, 0.05), sec(T["end"]))
add(bell(84, 2.4, 0.06), sec(T["end"] + 8))
add(bell(80, 2.4, 0.04), sec(T["end"] + 8) + 0.06)

out = np.stack([L, R], axis=1)
ts = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - ts) / 1.4, 0, 1) * np.clip(ts / 0.03, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.3)
out /= np.max(np.abs(out)) / 0.88
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "odometer.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
