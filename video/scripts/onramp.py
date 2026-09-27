"""
15-second track for the onramp hype clip (src/scenes/Onramp.tsx), ~128 BPM (one beat = 14 frames).
Impact slams on the opening words, a four-on-the-floor groove, UI taps and a "cha-ching" when the
payment clears, a snare roll and riser into a supersaw drop, then a final hit.
Everything is synthesized here, so nothing needs a license.

    python3 scripts/onramp.py       # writes public/onramp.wav
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
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Frame timings, kept in step with T in src/scenes/Onramp.tsx.
BEAT = 14
SLAMS, FUND, METHODS, PHONE = (0, 28), 56, 70, 126
TAP_BUY, SHEET, TAP_PAY, PAID, BAL, AUTO = 144, 156, 196, 208, (214, 244), 256
DROP, GO, END = 280, 364, 392


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
    return 440.0 * 2 ** ((note - 69) / 12)


def sine(f, n, sweep=None, rate=30):
    t = np.arange(n) / SR
    if sweep is None:
        return np.sin(2 * np.pi * f * t)
    freq = f + (sweep - f) * np.exp(-t * rate)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR)


def saw(f, n, detune=0.0, voices=1):
    t = np.arange(n) / SR
    out = np.zeros(n)
    ds = np.linspace(-detune, detune, voices) if voices > 1 else [0.0]
    for d in ds:
        out += 2 * ((t * f * (1 + d) + rng.random()) % 1.0) - 1
    return out / len(ds)


# ---------- instruments ----------
def kick(gain=1.0):
    n = int(0.35 * SR)
    return np.tanh(2.6 * sine(48, n, sweep=190, rate=35) * env(n, 0.001, 0.16)) * 0.9 * gain


def clap():
    n = int(0.22 * SR)
    x = filt(filt(rng.standard_normal(n), 1200, "high"), 7000)
    e = env(n, 0.001, 0.07)
    for k in (0.008, 0.017):
        j = int(k * SR)
        e[j:] += 0.7 * env(n - j, 0.001, 0.05)
    return x * e * 0.5


def hat(open_=False):
    n = int((0.16 if open_ else 0.04) * SR)
    return filt(rng.standard_normal(n), 9000, "high") * env(n, 0.001, 0.07 if open_ else 0.012) * 0.2


def snare(g=1.0):
    n = int(0.15 * SR)
    return (filt(rng.standard_normal(n), 1800, "high") * env(n, 0.001, 0.05) * 0.5 + sine(200, n) * env(n, 0.001, 0.03) * 0.3) * g


def impact():
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * np.cumsum(30 + 90 * np.exp(-t * 10)) / SR) * env(n, 0.001, 0.7)
    crack = filt(rng.standard_normal(n), 2500, "high") * env(n, 0.001, 0.08)
    return np.tanh(2 * (body + 0.6 * crack)) * 0.9


def supersaw(notes, length, cutoff=3200, gain=0.3):
    n = int(length * SR)
    x = sum(saw(hz(m), n, detune=0.012, voices=5) for m in notes) / len(notes)
    return filt(x, cutoff) * env(n, 0.01, 0.4, s=0.7, r=0.08, hold=length - 0.08) * gain


def bass(note, length):
    n = int(length * SR)
    x = saw(hz(note), n) + 0.7 * sine(hz(note), n)
    return np.tanh(1.6 * filt(x, 500)) * env(n, 0.004, 0.12, s=0.6, r=0.03, hold=length - 0.03) * 0.45


def pluck(note, length=0.2, gain=0.18):
    n = int(length * SR)
    return filt(saw(hz(note), n, detune=0.006, voices=3), 3500) * env(n, 0.002, 0.08) * gain


def blip(note, length=0.1, gain=0.2):
    n = int(length * SR)
    return (sine(hz(note), n) + 0.3 * sine(hz(note + 12), n)) * env(n, 0.002, length / 3) * gain


def tap():
    n = int(0.05 * SR)
    return (filt(rng.standard_normal(n), 2500, "high") * env(n, 0.0005, 0.006) * 0.5 + sine(700, n) * env(n, 0.001, 0.015) * 0.4)


def swoosh(length=0.35, up=True):
    n = int(length * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    for c in range(20):
        a, b = c * n // 20, (c + 1) * n // 20
        f = 400 + 5000 * (c / 20 if up else 1 - c / 20)
        out[a:b] = filt(x[a:b], f)
    return out * np.sin(np.pi * np.arange(n) / n) ** 2 * 0.4


def kaching():
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    cha = filt(rng.standard_normal(n), 4000, "high") * env(n, 0.001, 0.05) * 0.5
    ring = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, a, d in [(2093, 1, 3), (2637, 0.8, 3.5), (3136, 0.6, 4), (4186, 0.4, 6)])
    delay = int(0.06 * SR)
    ring = np.concatenate([np.zeros(delay), ring[:-delay]])
    return (cha + ring * 0.2) * 0.9


def riser(length):
    n = int(length * SR)
    t = np.arange(n) / n
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    for c in range(30):
        a, b = c * n // 30, (c + 1) * n // 30
        out[a:b] = filt(noise[a:b], 300 + 9000 * (c / 30) ** 2)
    tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * t**2) / SR)
    return (out * 0.5 + tone * 0.2) * t**2 * 0.7


# ---------- arrangement ----------
b = sec(BEAT)
PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]  # Am F C G
ROOTS = [33, 29, 36, 31]

# A. Slams
for s in SLAMS:
    add(impact(), sec(s), 1.0)
add(swoosh(0.4), sec(SLAMS[1]) - 0.4, 0.8)
add(riser(b * 2), sec(FUND) - b * 2, 0.6)

# B. Four on the floor from FUND to PHONE, a hit on each payment method
t = sec(FUND)
k = 0
while t < sec(PHONE) - 0.01:
    add(kick(), t)
    add(hat(), t + b / 2, 1.0, 0.3)
    if k % 2 == 1:
        add(clap(), t, 0.9)
    add(bass(ROOTS[(k // 4) % 4] + 12, b * 0.45), t + b / 2)
    t += b
    k += 1
add(impact(), sec(FUND), 0.6)
for i in range(2):  # debit card, bank transfer: two beats each
    add(supersaw(PROG[i], b * 1.8, 2500, 0.22), sec(METHODS + i * 2 * BEAT))
    add(swoosh(0.2), sec(METHODS + i * 2 * BEAT) - 0.2, 0.5)

# C. Half-time groove under the phone, with UI sounds
t = sec(PHONE)
k = 0
melody = [69, 72, 76, 72, 74, 72, 69, 67]
while t < sec(DROP) - 0.01:
    if k % 2 == 0:
        add(kick(0.8), t)
    if k % 4 == 2:
        add(clap(), t, 0.8)
    add(hat(), t + b / 2, 0.8, -0.3)
    add(pluck(melody[k % len(melody)]), t, 1.0, 0.2 if k % 2 else -0.2)
    if k % 4 == 0:
        add(supersaw(PROG[(k // 4) % 4], b * 3.8, 1400, 0.12), t)
    t += b
    k += 1
add(swoosh(0.5), sec(PHONE), 0.7)
add(tap(), sec(TAP_BUY), 1.0)
add(swoosh(0.35), sec(SHEET) - 0.1, 0.7)
add(tap(), sec(TAP_PAY), 1.0)
add(kaching(), sec(PAID), 1.0)
for i in range(12):
    add(blip(84 + (i % 4) * 2, 0.05, 0.12), sec(BAL[0]) + i * (sec(BAL[1] - BAL[0]) / 12), 1.0, -0.4 + i / 15)
for k2, m in enumerate([72, 76, 79, 84]):
    add(blip(m, 0.14, 0.2), sec(AUTO) + k2 * 0.05, 1.0)
# Build: snare roll + riser into the drop
roll_start = sec(DROP) - b * 4
n_hits = 24
for i in range(n_hits):
    p = i / n_hits
    add(snare(0.4 + 0.6 * p), roll_start + (b * 4) * (1 - (1 - p) ** 1.6), 1.0)
add(riser(b * 4), roll_start, 1.0)

# D. The drop
t = sec(DROP)
k = 0
while t < sec(END) - 0.01:
    add(kick(1.1), t)
    add(hat(True), t + b / 2, 0.9, 0.3)
    if k % 2 == 1:
        add(clap(), t, 1.0)
    chord = PROG[(k // 2) % 4]
    add(supersaw([c + 12 for c in chord], b * 0.95, 4200, 0.3), t + 0.01)
    add(bass(ROOTS[(k // 2) % 4], b * 0.9), t + 0.02)
    t += b
    k += 1
for s in (DROP, DROP + BEAT * 2, DROP + BEAT * 4, GO, GO + BEAT):
    add(impact(), sec(s), 0.7)

# E. Final hit and a held chord
add(impact(), sec(END), 1.0)
add(supersaw([57, 64, 69, 72, 76], DUR - sec(END) - 0.1, 2600, 0.3), sec(END))
add(kaching(), sec(END) + 0.1, 0.5)

out = np.stack([L, R], axis=1)
# Sidechain-style pump on the drop for the hype feel.
tt = np.arange(N) / SR
pump = np.ones(N)
m = (tt >= sec(DROP)) & (tt < sec(END))
phase = ((tt[m] - sec(DROP)) % b) / b
pump[m] = 0.55 + 0.45 * np.minimum(1, phase * 3)
out *= pump[:, None]
# The half-time phone section is sparse: lift it so it carries on phone speakers.
out *= np.interp(tt, [sec(PHONE) - 0.1, sec(PHONE), sec(DROP) - b * 4, sec(DROP) - b * 2], [1.0, 1.9, 1.9, 1.0])[:, None]
fade = np.clip((DUR - 0.1 - tt) / 1.0, 0, 1) * np.clip(tt / 0.005, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.3)
out /= np.max(np.abs(out)) / 0.9
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "onramp.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
