"""
15-second track for "Receipt" (src/scenes/Receipt.tsx): a thermal printer prints what an agent bought.
A dusty lo-fi jazz beat (Rhodes 9th chords, upright-style bass, boom-bap drums, vinyl crackle), a
thermal-printer buzz for every printed row, a soft register bell on "PAID ON ARC", a paper rip on the
tear, and a warm chord for the call to action. Everything is synthesized here, so nothing needs a license.

    python3 scripts/receipt.py       # writes public/receipt.wav
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
rng = np.random.default_rng(35)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Kept in step with T, ROWS and PRINT_AT in src/scenes/Receipt.tsx.
PRINTER, PRINT, STEP, TEAR, CTA = 4, 34, 11, 318, 368
KINDS = ["title", "text", "text", "rule", "text", "text", "rule", "item", "item", "item", "rule", "total", "rule",
         "item", "item", "item", "item", "item", "gap", "barcode", "paid"]
PRINT_AT = []
for i, k in enumerate(KINDS):
    prev = PRINT - STEP if i == 0 else PRINT_AT[-1]
    PRINT_AT.append(prev + STEP + (3 if k in ("item", "total") else 0))
BPM = 88
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


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def rhodes(notes, length, gain=0.1):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for m in notes:
        f = hz(m) * (1 + 0.002 * np.sin(2 * np.pi * 0.7 * t))  # tape wobble
        ph = np.cumsum(f) / SR
        x += np.sin(2 * np.pi * ph + 0.9 * np.exp(-t / 0.3) * np.sin(2 * np.pi * 14 * ph))
    x *= (1 + 0.15 * np.sin(2 * np.pi * 4.5 * t))  # tremolo
    x = filt(x / len(notes), 2400)
    return x * np.exp(-t / 1.6) * np.minimum(1, t / 0.004) * np.clip((length - t) / 0.08, 0, 1) * gain


def bass(note, length, gain=0.3):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * hz(note) * t) + 0.25 * np.sin(4 * np.pi * hz(note) * t)
    return filt(x, 700) * np.exp(-t / 0.5) * np.minimum(1, t / 0.01) * np.clip((length - t) / 0.03, 0, 1) * gain


def kick(gain=0.5):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t / 0.03)
    return np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t / 0.13) * gain


def snare(gain=0.25):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    x = filt(rng.standard_normal(n), [1200, 6000], "band") * np.exp(-t / 0.07)
    x += 0.4 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.04)
    return filt(x, 5000) * gain


def hat(gain=0.05):
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    return filt(rng.standard_normal(n), 7000, "high") * np.exp(-t / 0.018) * gain


def printer(length=0.3, gain=0.14):
    """Thermal printer: a buzzy stepper whine with paper rustle."""
    n = int(length * SR)
    t = np.arange(n) / SR
    step = np.sign(np.sin(2 * np.pi * 420 * t)) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 38 * t)))
    rustle = filt(rng.standard_normal(n), [2500, 9000], "band") * 0.6
    env = np.minimum(1, t / 0.01) * np.clip((length - t) / 0.03, 0, 1)
    return filt(step * 0.4 + rustle, 6000) * env * gain


def rip(length=0.45, gain=0.35):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n) * (0.4 + 0.6 * (rng.random(n) > 0.7))
    out = np.zeros(n)
    seg = 512
    for i in range(0, n, seg):
        c = 1500 + 5000 * (i / n)
        out[i : i + seg] = filt(x[i : i + seg], [c * 0.6, min(c * 1.6, 18000)], "band")
    return out * np.sin(np.pi * t / length) * gain


def bell(gain=0.12):
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * hz(m) * r * t) * np.exp(-t / d) for m, r, a, d in [(88, 1, 1, 0.6), (88, 2.76, 0.4, 0.25), (93, 1, 0.6, 0.5)])
    return x * np.minimum(1, t / 0.002) * gain


def crackle(length, gain=0.04):
    n = int(length * SR)
    x = filt(rng.standard_normal(n), 3000, "high") * 0.15
    pops = (rng.random(n) > 0.9993) * rng.standard_normal(n) * 3
    return filt(x + pops, 8000) * gain


# Vinyl under everything.
add(crackle(DUR, 0.5), 0.0)

# Chords: Dm9, G13, Cmaj9, A7(b9) — two beats each.
CHORDS = [(38, [53, 57, 60, 64]), (43, [53, 57, 59, 64]), (36, [52, 55, 59, 62]), (33, [55, 58, 61, 64])]
t0 = sec(PRINTER)
bar, t = 0, t0
while t < DUR:
    root, ch = CHORDS[bar % 4]
    add(rhodes(ch, 2 * BEAT + 0.3, 0.13), t + 0.02, 1.0, -0.15)
    add(bass(root, BEAT * 0.9), t)
    add(bass(root + 7, BEAT * 0.45), t + BEAT * 1.5)
    t += 2 * BEAT
    bar += 1

# Drums come in with the first printed line; lazy swing on the hats.
t = sec(PRINT)
k = 0
while t < DUR:
    b = k % 8  # eighth notes
    sw = 0.035 if b % 2 else 0.0
    if b in (0, 5):
        add(kick(0.5), t)
    if b in (2, 6):
        add(snare(0.26), t + 0.01)
    add(hat(0.05 if b % 2 else 0.07), t + sw, 1.0, 0.3)
    t += BEAT / 2
    k += 1

# A printer burst for every row; the barcode prints longer.
for f, kind in zip(PRINT_AT, KINDS):
    if kind == "gap":
        continue
    add(printer(0.42 if kind == "barcode" else 0.28, 0.15), sec(f), 1.0, -0.25)
add(bell(0.14), sec(PRINT_AT[-1]) + 0.1, 1.0, 0.2)

# Tear, then the call to action on a warm Fmaj9.
add(rip(0.45, 0.4), sec(TEAR) - 0.05)
add(rhodes([53, 57, 60, 64, 67], DUR - sec(CTA), 0.16), sec(CTA))
add(bass(29, 1.4, 0.35), sec(CTA))

out = np.stack([L, R], axis=1)
out = filt(out.T, 11000).T  # a touch of lo-fi
tt = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - tt) / 1.2, 0, 1) * np.clip(tt / 0.2, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.4)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "receipt.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
