"""
15-second chiptune for "FUCI: Agent Quest" (src/scenes/Arcade.tsx): an 8-bit arcade game.
Pulse-wave lead, triangle bass and noise drums like an old console: a title theme, a menu blip and
a coin on INSERT $1, a running level theme with a jump and a power-up arpeggio on each pickup, a
level-up fanfare, a counting tick for the player count, and soft CONTINUE? beeps into a last jingle.
Everything is synthesized here, so nothing needs a license.

    python3 scripts/arcade.py       # writes public/arcade.wav
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
rng = np.random.default_rng(1)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Frame timings, kept in step with T in src/scenes/Arcade.tsx.
PRESS, COIN, PLAY, PICKUPS, LEVELUP, SCORES, CONT = 54, 66, 90, (124, 162, 200, 238, 276), 300, 330, 390
BPM = 150
S16 = 60 / BPM / 4  # a sixteenth note


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


def pulse(note, length, gain=0.12, duty=0.25, decay=None, slide=0.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note) * 2 ** (slide * t / max(length, 1e-3) / 12)
    ph = np.cumsum(f) / SR
    x = np.where((ph % 1) < duty, 1.0, -1.0)
    e = np.exp(-t / decay) if decay else np.ones(n)
    e *= np.clip((length - t) / 0.01, 0, 1) * np.minimum(1, t / 0.002)
    return filt(x, 9000) * e * gain


def tri(note, length, gain=0.25):
    n = int(length * SR)
    t = np.arange(n) / SR
    ph = hz(note) * t
    x = 4 * np.abs(ph - np.floor(ph + 0.5)) - 1
    x = np.round(x * 8) / 8  # 4-bit steps, like the console's triangle channel
    return x * np.clip((length - t) / 0.01, 0, 1) * gain


def noise(length, gain=0.1, decay=0.05, hi=True):
    n = int(length * SR)
    t = np.arange(n) / SR
    # Sample-and-hold noise: the console's crunchy noise channel.
    step = 6 if hi else 40
    x = np.repeat(rng.choice([-1.0, 1.0], n // step + 1), step)[:n]
    return x * np.exp(-t / decay) * gain


def kick(gain=0.3):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = 60 + 300 * np.exp(-t / 0.015)
    ph = np.cumsum(f) / SR
    x = 4 * np.abs(ph - np.floor(ph + 0.5)) - 1
    return x * np.exp(-t / 0.05) * gain


def seq(notes, t0, step, fn, **kw):
    """notes: list of MIDI numbers or None (rest); each lasts `step` seconds."""
    for k, m in enumerate(notes):
        if m is not None:
            add(fn(m, step * 0.9, **kw), t0 + k * step)


# --- Title theme (0 to PRESS): a bright C major hook. ---
title = [72, None, 76, 79, 84, None, 79, 76, 77, None, 81, 84, 83, None, 79, None]
seq(title, 0.05, S16 * 1.6, pulse, gain=0.1, duty=0.5)
seq([48, None, None, None, 53, None, None, None, 55, None, None, None, 55, None, None, None], 0.05, S16 * 1.6, tri, gain=0.28)

# PRESS START blip and the coin.
add(pulse(84, 0.06, 0.12, 0.5), sec(PRESS))
add(pulse(91, 0.08, 0.12, 0.5), sec(PRESS) + 0.07)
add(pulse(83, 0.07, 0.14, 0.5), sec(COIN))
add(pulse(88, 0.35, 0.14, 0.5, decay=0.15), sec(COIN) + 0.07)

# --- The level theme: C, Am, F, G at 150 BPM, 16ths. ---
lead_bars = [
    [72, None, 72, 74, 76, None, 72, None, 79, None, 76, None, 74, None, 72, None],
    [69, None, 69, 71, 72, None, 69, None, 76, None, 72, None, 71, None, 69, None],
    [65, None, 65, 67, 69, None, 72, None, 77, None, 76, None, 74, None, 72, None],
    [67, None, 71, None, 74, None, 79, None, 77, None, 76, None, 74, None, 71, None],
]
bass_roots = [36, 33, 29, 31]
t = sec(PLAY)
bar = 0
while t < sec(SCORES):
    b = bar % 4
    seq(lead_bars[b], t, S16, pulse, gain=0.085, duty=0.25)
    seq([bass_roots[b] + (12 if k % 4 == 2 else 0) if k % 2 == 0 else None for k in range(16)], t, S16, tri, gain=0.3)
    for k in range(16):
        tt = t + k * S16
        if k % 8 == 0:
            add(kick(0.3), tt)
        if k % 8 == 4:
            add(noise(0.12, 0.12, 0.06, hi=False), tt)
        if k % 2 == 0:
            add(noise(0.04, 0.05, 0.012), tt, 1.0, 0.3)
    t += 16 * S16
    bar += 1

# Jumps and power-ups: a rising slide, then a quick arpeggio a step higher each time.
for i, f in enumerate(PICKUPS):
    add(pulse(60 + 2 * i, 0.22, 0.08, 0.5, slide=12), sec(f - 10), 1.0, -0.3)
    for k, m in enumerate([72, 76, 79, 84, 88]):
        add(pulse(m + 2 * i, 0.06, 0.1, 0.125), sec(f) + k * 0.045, 1.0, 0.3)

# LEVEL UP fanfare.
tl = sec(LEVELUP)
for k, (m, l) in enumerate([(72, 0.1), (76, 0.1), (79, 0.1), (84, 0.45)]):
    add(pulse(m, l, 0.14, 0.5, decay=0.4), tl + k * 0.11)
    add(pulse(m - 12, l, 0.06, 0.25, decay=0.4), tl + k * 0.11)
add(tri(48, 0.8, 0.3), tl + 0.33)

# Player count: a ticking counter, then a held chord.
ts = sec(SCORES)
for k in range(24):
    add(pulse(84 + (k % 2) * 7, 0.025, 0.05, 0.5), ts + k * 0.042)
seq([60, 64, 67, 72], ts + 1.05, 0.25, pulse, gain=0.08, duty=0.5)
add(tri(36, 1.0, 0.25), ts + 1.05)

# CONTINUE?: a soft beep on each number, then a last jingle.
tc = sec(CONT)
for k in range(7):
    add(pulse(79, 0.08, 0.07, 0.5, decay=0.05), tc + k * 8 / FPS)
seq([72, 76, 79, 84, 79, 84], tc + 0.1, S16 * 2, pulse, gain=0.07, duty=0.25)
add(tri(48, 1.2, 0.25), tc)
add(pulse(84, 0.9, 0.08, 0.5, decay=0.5), sec(CONT) + 1.2)
add(pulse(76, 0.9, 0.06, 0.5, decay=0.5), sec(CONT) + 1.2)
add(tri(36, 0.8, 0.28), sec(CONT) + 1.2)

out = np.stack([L, R], axis=1)
tt = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - tt) / 1.0, 0, 1) * np.clip(tt / 0.01, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.2)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "arcade.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
