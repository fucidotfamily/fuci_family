"""
15-second score for "The Deep" (src/scenes/Deep.tsx): a nature-documentary cue on deep-sea footage.
Deep-water rumble, a slow cello drone, sparse felt-piano notes under the narration, soft strings that
rise into the glowing close-up, a celesta note as each field-guide line appears, a hush on "a new
species is spreading", and a warm full chord for the call to action.
Everything is synthesized here, so nothing needs a license.

    python3 scripts/deep.py       # writes public/deep.wav
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
rng = np.random.default_rng(287)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Frame timings, kept in step with T in src/scenes/Deep.tsx.
LINE1, LINE2, CARD, ROWS, SPREAD, CTA = 10, 100, 196, (214, 230, 246, 262, 278), 330, 392


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


def reverb(x, decay=2.2, mix=0.35):
    """A cheap hall: a few filtered, spread echoes."""
    out = x.copy()
    for d, g in [(0.031, 0.6), (0.047, 0.5), (0.071, 0.45), (0.113, 0.35), (0.167, 0.3), (0.241, 0.22), (0.353, 0.15)]:
        k = int(d * SR)
        e = np.zeros_like(x)
        e[k:] = x[:-k] * g * math.exp(-d / decay * 3)
        out += filt(e, 3500) * mix
    return out


def piano(note, gain=0.2, length=3.0):
    """Felt piano: inharmonic partials, soft hammer, long decay."""
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note)
    x = np.zeros(n)
    for k, a in enumerate([1.0, 0.42, 0.2, 0.1, 0.05], start=1):
        fk = f * k * math.sqrt(1 + 0.0004 * k * k)
        x += a * np.sin(2 * np.pi * fk * t) * np.exp(-t * (0.9 + 0.6 * k))
    x = filt(x, 2800)
    return x * np.minimum(1, t / 0.006) * gain


def strings(notes, length, gain=0.1, attack=1.5):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for m in notes:
        for d in (-0.004, 0.0, 0.005):
            vib = 1 + 0.0035 * np.sin(2 * np.pi * (5 + 30 * d) * t + m)
            ph = np.cumsum(hz(m) * (1 + d) * vib) / SR
            x += 2 * (ph - np.floor(ph + 0.5))
    x = filt(x / (len(notes) * 3), 1800)
    return x * np.clip(t / attack, 0, 1) * np.clip((length - t) / 0.8, 0, 1) * gain


def cello(note, length, gain=0.14):
    n = int(length * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 4.8 * t)
    ph = np.cumsum(hz(note) * vib) / SR
    x = 2 * (ph - np.floor(ph + 0.5))
    x = filt(x, 900)
    return x * np.clip(t / 1.2, 0, 1) * np.clip((length - t) / 1.0, 0, 1) * gain


def celesta(note, gain=0.08, length=1.8):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note)
    x = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t / 0.08)
    return x * np.exp(-t / 0.55) * np.minimum(1, t / 0.002) * gain


def rumble(length, gain=0.2):
    n = int(length * SR)
    x = filt(rng.standard_normal(n), 140)
    t = np.arange(n) / SR
    return x * (0.7 + 0.3 * np.sin(2 * np.pi * t / 5.3)) * gain


def swell(length, gain=0.25):
    n = int(length * SR)
    t = np.arange(n) / SR
    return filt(rng.standard_normal(n), 600) * (t / length) ** 2 * gain


# Deep water under everything.
add(rumble(DUR, 0.5), 0.0)
add(cello(38, sec(SPREAD) + 0.5, 0.2), 0.0)  # D2 drone

# Narration: sparse felt piano in D minor.
for t, m, g in [(sec(LINE1), 62, 0.2), (sec(LINE1) + 1.1, 65, 0.15), (sec(LINE1) + 2.2, 69, 0.14), (sec(LINE2), 60, 0.18), (sec(LINE2) + 1.0, 64, 0.15), (sec(LINE2) + 2.0, 67, 0.15)]:
    add(piano(m, g), t, 1.0, (m - 64) / 20)
add(strings([50, 57, 62], sec(CARD) - sec(LINE1), 0.08, 2.5), sec(LINE1))

# The close-up: strings bloom (Bb major, then F), a low piano octave.
add(piano(34, 0.22, 4.0), sec(CARD))
add(piano(46, 0.14, 4.0), sec(CARD))
add(strings([58, 62, 65, 70], 2.4, 0.13, 0.6), sec(CARD))
add(strings([53, 60, 65, 69], sec(SPREAD) - sec(CARD) - 2.2, 0.13, 0.8), sec(CARD) + 2.2)
for i, f in enumerate(ROWS):
    add(celesta([81, 84, 86, 89, 91][i]), sec(f), 1.0, -0.4 + 0.2 * i)

# "A new species is spreading": hush, a single high note, a slow swell.
add(strings([74, 81], sec(CTA) - sec(SPREAD), 0.06, 0.8), sec(SPREAD))
add(piano(74, 0.12, 2.5), sec(SPREAD) + 0.2)
add(swell(sec(CTA) - sec(SPREAD), 0.25), sec(SPREAD))

# Call to action: a warm D major chord, piano and a last celesta.
tc = sec(CTA)
add(piano(38, 0.25, 3.5), tc)
add(piano(50, 0.16, 3.5), tc)
add(strings([50, 57, 62, 66, 69, 74], DUR - tc, 0.16, 0.4), tc)
add(cello(38, DUR - tc, 0.18), tc)
for k, m in enumerate([78, 81, 86]):
    add(celesta(m, 0.07, 2.0), tc + 0.5 + 0.18 * k, 1.0, -0.3 + 0.3 * k)

L[:] = reverb(L)
R[:] = reverb(R)
out = np.stack([L, R], axis=1)
tt = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - tt) / 1.4, 0, 1) * np.clip(tt / 0.4, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.2)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "deep.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
