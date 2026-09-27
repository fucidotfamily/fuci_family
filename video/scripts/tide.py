"""
15-second track for "The tide is rising" (src/scenes/Tide.tsx): a harbour tide gauge at night.
Ocean waves and a low choir under the lore; then a half-time trap beat (808 sub, hats with rolls,
claps) that opens up as the water climbs, a rising bell note each time the water passes a mark, a
long riser, a drop on "It rises." and a wash of water into a bright closing chord.
Everything is synthesized here, so nothing needs a license.

    python3 scripts/tide.py       # writes public/tide.wav
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
rng = np.random.default_rng(8)
sec = lambda f: f / FPS

# Frame timings, kept in step with T in src/scenes/Tide.tsx.
LORE1, LORE2, RISE, MARKS, LINE, SURGE, CTA = 8, 50, 92, (112, 142, 172, 202, 232, 262, 292), 318, 372, 384
BPM = 140
BEAT = 60 / BPM

# Two buses: the beat is filtered by how high the water is; everything else plays as is.
L, R = np.zeros(N), np.zeros(N)
BL, BR = np.zeros(N), np.zeros(N)


def add(sig, t, gain=1.0, pan=0.0, bus=False):
    l, r = (BL, BR) if bus else (L, R)
    i = int(t * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    sig = sig[: N - i]
    l[i : i + len(sig)] += sig * gain * math.sqrt(0.5 * (1 - pan))
    r[i : i + len(sig)] += sig * gain * math.sqrt(0.5 * (1 + pan))


def filt(x, cutoff, kind="low", order=2):
    b, a = butter(order, np.clip(np.array(cutoff) / (SR / 2), 1e-4, 0.999), btype=kind)
    return lfilter(b, a, x)


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def sub808(note, length, gain=0.6, glide_from=None):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = np.full(n, hz(note))
    if glide_from is not None:
        f = hz(note) + (hz(glide_from) - hz(note)) * np.exp(-t / 0.06)
    f = f * (1 + 1.5 * np.exp(-t / 0.012))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    x = np.tanh(x * 1.8)
    return x * np.clip((length - t) / 0.05, 0, 1) * np.exp(-t / (length * 0.9)) * gain


def kick(gain=0.5):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    f = 55 + 140 * np.exp(-t / 0.02)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09) * gain


def clap(gain=0.3):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    x = filt(rng.standard_normal(n), [900, 5000], "band")
    e = np.exp(-t / 0.09)
    for d in (0.0, 0.011, 0.022):
        e += (t >= d) * np.exp(-np.maximum(t - d, 0) / 0.006) * 0.8
    return x * e * gain


def hat(gain=0.08, open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    return filt(rng.standard_normal(n), 7500, "high") * np.exp(-t / (0.06 if open_ else 0.012)) * gain


def bell(note, gain=0.14, length=1.6):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note)
    x = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.3) + 0.25 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.12)
    return x * np.exp(-t / 0.6) * np.minimum(1, t / 0.003) * gain


def choir(notes, length, gain=0.12, attack=0.8):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for m in notes:
        for d in (-0.005, 0.0, 0.006):
            vib = 1 + 0.004 * np.sin(2 * np.pi * (4.6 + d * 100) * t)
            ph = np.cumsum(hz(m) * (1 + d) * vib) / SR
            x += np.sin(2 * np.pi * ph) + 0.25 * np.sin(4 * np.pi * ph)
    x = filt(x / (len(notes) * 3), [300, 2200], "band")
    return x * np.clip(t / attack, 0, 1) * np.clip((length - t) / 0.5, 0, 1) * gain


def supersaw(notes, length, gain=0.12):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for m in notes:
        for d in (-0.012, -0.005, 0.0, 0.006, 0.013):
            ph = hz(m) * (1 + d) * t + rng.random()
            x += 2 * (ph - np.floor(ph + 0.5))
    x = filt(x / (len(notes) * 5), 5000)
    return x * np.clip(t / 0.02, 0, 1) * np.clip((length - t) / 0.6, 0, 1) * gain


def waves(length, gain=0.2, period=3.2, phase=0.0):
    """Surf: low-passed noise that swells and falls like breaking waves."""
    n = int(length * SR)
    t = np.arange(n) / SR
    x = filt(rng.standard_normal(n), 1400) + 0.4 * filt(rng.standard_normal(n), [2000, 6000], "band")
    sw = (0.5 - 0.5 * np.cos(2 * np.pi * (t / period + phase))) ** 2
    return x * (0.25 + 0.75 * sw) * gain


def riser(length, gain=0.25):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n)
    seg = 1024
    for i in range(0, n, seg):
        c = 400 + 7000 * (i / n) ** 2
        out[i : i + seg] = filt(x[i : i + seg], [c * 0.6, min(c * 1.4, 18000)], "band")
    tone = np.sin(2 * np.pi * np.cumsum(110 * 2 ** (2.5 * t / length)) / SR) * 0.3
    return (out + tone) * (t / length) ** 2 * gain


def splash(gain=0.2):
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    return filt(rng.standard_normal(n), [800, 7000], "band") * np.exp(-t / 0.14) * np.minimum(1, t / 0.01) * gain


# --- Intro: surf, a low choir in F minor, a single deep bell on each lore line. ---
add(waves(DUR, 0.22), 0.0, 1.0, -0.3)
add(waves(DUR, 0.18, 4.1, 0.4), 0.0, 1.0, 0.35)
add(choir([53, 56, 60], sec(RISE) + 0.6, 0.2, 1.2), 0.0)
add(sub808(29, sec(RISE), 0.25), 0.0)
add(bell(65, 0.12, 2.4), sec(LORE1), 1.0, -0.2)
add(bell(68, 0.12, 2.4), sec(LORE2), 1.0, 0.2)

# --- The rise: half-time trap in F minor. Chords F m, Db, Eb, C (4 beats each). ---
prog = [(41, [53, 56, 60]), (37, [49, 53, 56]), (39, [51, 55, 58]), (36, [48, 52, 55])]
t0, t1 = sec(RISE), sec(LINE)
bar, t = 0, t0
while t < t1:
    root, chord = prog[bar % 4]
    bl = min(4 * BEAT, t1 - t)
    add(choir(chord, bl + 0.4, 0.13, 0.3), t)
    add(sub808(root, 1.5 * BEAT, 0.55), t, bus=True)
    add(sub808(root, BEAT, 0.45, glide_from=root + 12), t + 2.5 * BEAT, bus=True)
    add(kick(0.45), t, bus=True)
    add(kick(0.35), t + 2.5 * BEAT, bus=True)
    add(clap(0.32), t + 2 * BEAT, bus=True)
    for k in range(8):
        add(hat(0.08 if k % 2 == 0 else 0.05), t + k * BEAT / 2, 1.0, 0.3, bus=True)
    if bar % 2 == 1:  # a hat roll into the next bar
        for k in range(6):
            add(hat(0.05 + 0.01 * k), t + 3.5 * BEAT + k * BEAT / 12, 1.0, -0.3, bus=True)
    t += 4 * BEAT
    bar += 1

# Each mark: a bell a step higher (the water climbing), and a small splash.
scale = [65, 68, 70, 72, 75, 77, 80]
for i, f in enumerate(MARKS):
    add(bell(scale[i], 0.16, 1.4), sec(f), 1.0, -0.4 + 0.13 * i)
    add(bell(scale[i] + 12, 0.05, 0.8), sec(f) + 0.01, 1.0, 0.4 - 0.13 * i)
    add(splash(0.12), sec(f), 1.0, 0.2)

add(riser(sec(LINE) - sec(MARKS[-1]) + 0.2, 0.28), sec(MARKS[-1]) - 0.2)

# --- Drop on "It rises.": full beat, supersaw F minor, then the surge wash. ---
td = sec(LINE)
add(sub808(29, 1.2, 0.8, glide_from=41), td)
add(kick(0.6), td)
add(splash(0.3), td, 1.0, 0.0)
add(supersaw([53, 56, 60, 65], sec(SURGE) - td + 0.3, 0.16), td)
t = td
k = 0
while t < sec(SURGE):
    if k % 4 == 2:
        add(clap(0.34), t)
    if k % 4 in (0, 3):
        add(kick(0.42), t)
    for h in range(2):
        add(hat(0.07), t + h * BEAT / 2, 1.0, 0.3)
    t += BEAT
    k += 1
add(riser(0.5, 0.2), sec(SURGE) - 0.4)

# --- Surge: a wash of water, then a bright Db major lift and the last bells. ---
ts = sec(SURGE)
add(waves(1.4, 0.5, 1.4), ts)
add(sub808(25, 2.5, 0.6, glide_from=37), sec(CTA))
add(supersaw([49, 56, 60, 65, 68], DUR - sec(CTA), 0.14), sec(CTA))
add(choir([61, 65, 68, 72], DUR - sec(CTA), 0.16, 0.4), sec(CTA))
for k, m in enumerate([80, 84, 87, 92]):
    add(bell(m, 0.08, 1.6), sec(CTA) + 0.3 + 0.12 * k, 1.0, -0.3 + 0.2 * k)

# The beat opens with the water: dark (muffled) at the start of the rise, fully open by the last mark.
tt = np.arange(N) / SR
open_ = np.interp(tt, [sec(RISE), sec(MARKS[-1])], [0.0, 1.0])
for bus in (BL, BR):
    dark = filt(bus, 380)
    bus[:] = dark * (1 - open_) + bus * open_
L += BL
R += BR

out = np.stack([L, R], axis=1)
fade = np.clip((DUR - 0.1 - tt) / 1.2, 0, 1) * np.clip(tt / 0.3, 0, 1)
# Lift the quiet intro so it still carries on phone speakers.
out *= np.interp(tt, [0, sec(RISE), sec(RISE) + 0.8], [1.7, 1.7, 1.0])[:, None]
out *= fade[:, None]
out = np.tanh(out * 1.3)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "tide.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
