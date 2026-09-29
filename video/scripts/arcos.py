"""
18-second track for "Fuci, built on Arc" (src/scenes/ArcOS.tsx): minimal tech-house at 120 BPM in A minor.
A cold, glassy pad under Arc's quote; the groove (four-on-the-floor kick, off-beat hats, rim clicks and a
rolling filtered bassline) starts with "transact". A soft bell marks each chapter, small blips land with the
packets on screen, and a rising filter lifts into an open Am(add9) under the end card. Synthesized here,
so nothing needs a license.

    python3 scripts/arcos.py      # writes public/arcos.wav
"""
import math
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
FPS = 30
DUR = 18.2
N = int(DUR * SR)
rng = np.random.default_rng(120)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Kept in step with T in src/scenes/ArcOS.tsx.
T = dict(intro=0, transact=96, contract=216, coordinate=336, end=450, dur=540)
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


hz = lambda n: 440 * 2 ** ((n - 69) / 12)
tt = lambda length: np.arange(int(length * SR)) / SR
sine = lambda f, t: np.sin(2 * np.pi * f * t)


def pad(notes, length, g=0.03, attack=0.8, cutoff=2200):
    t = tt(length)
    x = sum(np.sign(sine(hz(m) * (1 + d), t)) * 0.3 + sine(hz(m) * (1 + d), t) for m in notes for d in (-0.004, 0.0, 0.004))
    env = np.clip(t / attack, 0, 1) * np.clip((length - t) / 1.0, 0, 1)
    return filt(x * env, cutoff) * g


def bell(n, g=0.05, length=2.0):
    t = tt(length)
    f = hz(n)
    x = sine(f, t) + 0.5 * sine(f * 2.76, t) * np.exp(-t * 3) + 0.25 * sine(f * 5.4, t) * np.exp(-t * 6)
    return x * np.exp(-t * 1.8) * np.clip(t / 0.002, 0, 1) * g


def kick(g=0.34):
    t = tt(0.3)
    f = 48 + 110 * np.exp(-t * 40)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * g


def hat(g=0.025, length=0.05):
    t = tt(length)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 90), 8000, "high") * g


def rim(g=0.06):
    t = tt(0.04)
    return filt(sine(1700, t) * np.exp(-t * 120) + rng.standard_normal(len(t)) * np.exp(-t * 200) * 0.4, [800, 5000], "band") * g


def bass(n, length, g=0.16, cutoff=500):
    t = tt(length)
    saw = 2 * ((hz(n) * t) % 1) - 1
    env = np.clip(t / 0.005, 0, 1) * np.exp(-t * 5)
    return filt(saw * env, cutoff) * g


def blip(n, g=0.03):
    t = tt(0.12)
    return sine(hz(n), t) * np.exp(-t * 35) * np.clip(t / 0.002, 0, 1) * g


def swell(length=1.0, g=0.04):
    t = tt(length)
    return filt(rng.standard_normal(len(t)), [500, 5000], "band") * (t / length) ** 2 * g


# Intro: a cold Am(add9) pad and a bell on "ARC", a second bell on Fuci's line.
add(pad([57, 60, 64, 71], sec(T["transact"]) + 0.6, 0.03, 1.0, 1800), 0)
add(bell(81, 0.05), sec(6))
add(bell(76, 0.045), sec(40), 1.0, 0.2)
add(swell(0.9, 0.04), sec(T["transact"]) - 0.9)

# Groove from "transact" to the end card. Chords per bar: Am, F, C, G.
CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOT = [33, 29, 36, 31]
t0 = sec(T["transact"])
b = 0
end = sec(T["end"])
while t0 < end - 0.01:
    ch = b % 4
    # the bassline filter opens across the film
    cutoff = 300 + 900 * min(1, (t0 - sec(T["transact"])) / (end - sec(T["transact"])))
    add(pad(CH[ch], 4 * BEAT, 0.012, 0.2, 1400 + cutoff), t0, 1.0, 0.0)
    for k in range(4):
        tb = t0 + k * BEAT
        add(kick(), tb)
        add(hat(), tb + BEAT / 2, 1.0, 0.3)
        add(hat(0.012, 0.03), tb + BEAT * 0.75, 1.0, -0.3)
        if k in (1, 3):
            add(rim(), tb, 1.0, 0.1)
        for s, step in enumerate((0.0, 0.5, 0.75)):
            add(bass(ROOT[ch] + (12 if s == 2 else 0), BEAT * 0.4, 0.15, cutoff), tb + BEAT * step)
    t0 += 4 * BEAT
    b += 1

# Chapter bells: transact, contract, coordinate.
for i, at in enumerate((T["transact"], T["contract"], T["coordinate"])):
    add(bell(76 + i * 2, 0.05), sec(at + 2), 1.0, -0.2 + i * 0.2)
    add(bell(83 + i * 2, 0.03), sec(at + 8), 1.0, 0.2)

# Transact: a blip as each price packet lands (4 wires, every 42 frames).
a = T["transact"]
for i in range(4):
    s = a + 44 + i * 9
    while s + 34 < a + 110:
        add(blip(88 + i * 2), sec(s + 26), 1.0, -0.3 + i * 0.2)
        s += 42
# Contract: a soft confirm per settled block.
for i in range(3):
    add(blip(84 + i * 3, 0.04), sec(T["contract"] + 52 + i * 16), 1.0, 0.1)
    add(blip(91 + i * 3, 0.03), sec(T["contract"] + 55 + i * 16), 1.0, 0.1)
# Coordinate: quiet messages along the network.
for k in range(6):
    s = T["coordinate"] + 50 + k * 7
    while s + 38 < T["end"]:
        add(blip(86 + (k % 3) * 3, 0.018), sec(s + 30), 1.0, -0.4 + k * 0.16)
        s += 48

# End card: a swell, one last kick and an open Am(add9).
add(swell(1.1, 0.05), sec(T["end"]) - 1.1)
add(kick(0.3), sec(T["end"]))
add(pad([45, 57, 60, 64, 71], DUR - sec(T["end"]) + 0.2, 0.04, 0.4, 2400), sec(T["end"]))
add(bell(81, 0.05, 3.0), sec(T["end"]) + 0.05)
add(bell(88, 0.03, 3.0), sec(T["end"] + 20), 1.0, 0.25)

out = np.stack([L, R], axis=1)
ts = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - ts) / 1.5, 0, 1) * np.clip(ts / 0.03, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.3)
out /= np.max(np.abs(out)) / 0.88
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "arcos.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
