"""
8-second track for the "Fuci is open source" clip (src/scenes/OpenSource.tsx). It has a different
mood from the stings: a lo-fi beat with Rhodes chords and vinyl crackle, mechanical key clicks on
the `git clone` typing, a whoosh into the repo page, ticks on the file tree, a ding on the star and
an arpeggio lift under the headline. Everything is synthesized here, so nothing needs a license.

    python3 scripts/github.py       # writes public/github.wav
"""
import math
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
FPS = 30
DUR = 8.2
N = int(DUR * SR)
rng = np.random.default_rng(42)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Frame timings, kept in step with T in src/scenes/OpenSource.tsx.
TYPE_START, CPS, CMD_LEN = 8, 40, len("git clone https://github.com/fucidotfamily/fuci_family")
LINES, SWAP, ROWS, STAR, CHIPS, HEADLINE = [54, 60, 66], 70, 94, 138, 150, 180


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
    b, a = butter(order, np.clip(cutoff / (SR / 2), 1e-4, 0.999), btype=kind)
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
    return 440.0 * 2 ** ((note - 69) / 12)


def sine(f, n, sweep=None):
    t = np.arange(n) / SR
    if sweep is None:
        return np.sin(2 * np.pi * f * t)
    freq = f + (sweep - f) * np.exp(-t * 25)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR)


# ---------- instruments ----------
def rhodes(note, length):
    """Electric-piano tone: a sine with a bell-like 2nd/3rd partial, slow tremolo, soft decay."""
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 6) + 0.12 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t * 9)
    trem = 1 - 0.18 * (0.5 + 0.5 * np.sin(2 * np.pi * 4.5 * t))
    return x * trem * env(n, 0.008, 1.4, s=0.25, r=0.25, hold=length - 0.25) * 0.14


def chord(notes, length):
    return sum(rhodes(m, length) for m in notes)


def kick():
    n = int(0.4 * SR)
    return np.tanh(1.8 * sine(48, n, sweep=120) * env(n, 0.002, 0.18)) * 0.9


def snare():
    n = int(0.3 * SR)
    noise = filt(filt(rng.standard_normal(n), 1800, "high"), 7000) * env(n, 0.001, 0.07)
    body = sine(190, n) * env(n, 0.001, 0.05)
    return filt(noise * 0.6 + body * 0.4, 5000) * 0.55  # dusty, lo-fi top end


def hat():
    n = int(0.05 * SR)
    return filt(rng.standard_normal(n), 8000, "high") * env(n, 0.001, 0.015) * 0.18


def keyclick():
    """Mechanical switch: a sharp click plus a short thock."""
    n = int(0.03 * SR)
    click = filt(rng.standard_normal(n), 3000 + rng.random() * 2500, "high") * env(n, 0.0003, 0.003)
    thock = sine(220 + rng.random() * 80, n) * env(n, 0.001, 0.008)
    return click * 0.35 + thock * 0.2


def blip(note, length=0.1, gain=0.25):
    n = int(length * SR)
    return (sine(hz(note), n) + 0.25 * sine(hz(note + 12), n)) * env(n, 0.002, length / 3) * gain


def whoosh(length=0.5):
    n = int(length * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    chunks = 20
    for c in range(chunks):
        a, b = c * n // chunks, (c + 1) * n // chunks
        out[a:b] = filt(x[a:b], 400 + 4200 * c / chunks)
    return out * np.sin(np.pi * np.arange(n) / n) ** 2 * 0.3


def ding():
    """Bright bell for the star: inharmonic partials with a long ring."""
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    f = hz(88)
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in [(1, 1, 2.2), (2.76, 0.5, 4), (5.4, 0.25, 7), (0.5, 0.3, 3)])
    return x * env(n, 0.001, 5) * 0.28


def crackle():
    x = np.zeros(N)
    pops = rng.random(N) < 0.00035
    x[pops] = rng.uniform(-1, 1, pops.sum())
    hiss = filt(rng.standard_normal(N), 5000, "high") * 0.012
    return filt(x, 3000) * 0.5 + hiss


# ---------- arrangement ----------
BEAT = 60 / 90
t0 = sec(SWAP)  # the beat drops when the repo page appears

# Vinyl bed across the whole clip.
cr = crackle()
L += cr * 0.8
R += cr * 0.8

# Rhodes: Fmaj7 → Em7 → Dm7 → Cmaj7, two beats each, starting soft under the typing.
prog = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]
start = t0 - 4 * BEAT
for i in range(8):
    add(chord(prog[i % 4], 2 * BEAT + 0.3), start + i * 2 * BEAT, 0.6 if i < 2 else 1.0)
add(chord([53, 57, 60, 64, 67], 2.2), sec(HEADLINE), 1.1)  # land on Fmaj9 under the headline

# Hats only while typing, then the full beat from the swap.
t = 0.0
while t < t0:
    add(hat(), t, 0.7, 0.3)
    t += BEAT / 2
for b in range(int((DUR - t0) / BEAT) + 1):
    bt = t0 + b * BEAT
    if b % 4 in (0, 2) or b % 8 == 7:
        add(kick(), bt + (0.33 * BEAT if b % 8 == 7 else 0), 0.9)
    if b % 2 == 1:
        add(snare(), bt + 0.02, 0.8)  # lazy, behind the beat
    add(hat(), bt, 0.8, 0.3)
    add(hat(), bt + BEAT / 2 + 0.03, 0.5, -0.3)  # swung off-beat

# Key clicks on each typed character.
for c in range(CMD_LEN):
    add(keyclick(), sec(TYPE_START) + c / CPS, 1.0, rng.uniform(-0.25, 0.25))
add(keyclick(), sec(LINES[0] - 3), 1.4)  # Enter
for i, f in enumerate(LINES):
    add(blip(72 + i * 4, 0.08, 0.16), sec(f), 1.0, -0.2 + 0.2 * i)

add(whoosh(0.45), sec(SWAP) - 0.3, 1.0)
for i in range(7):  # file tree rows
    add(blip(84, 0.05, 0.12), sec(ROWS + i * 5), 1.0, -0.3 + 0.1 * i)
add(ding(), sec(STAR), 1.0)
for i, note in enumerate([76, 79, 83, 86]):  # chips
    add(blip(note, 0.16, 0.2), sec(CHIPS + i * 6), 1.0, -0.45 + 0.3 * i)
for i, note in enumerate([65, 69, 72, 76, 79, 84]):  # arpeggio lift under the headline
    add(rhodes(note, 1.2), sec(HEADLINE) + i * 0.08, 1.4, -0.3 + 0.12 * i)

out = np.stack([L, R], axis=1)
out = np.stack([filt(out[:, 0], 9000), filt(out[:, 1], 9000)], axis=1)  # warm lo-fi top
fade = np.clip((DUR - 0.1 - np.arange(N) / SR) / 0.7, 0, 1) * np.clip(np.arange(N) / (0.02 * SR), 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.2)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "github.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
