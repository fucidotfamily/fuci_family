"""
12-second track for the "$FUCI dev bag locked" clip (src/scenes/Lock.tsx).
A storm on the surface (rain, wind, thunder on each lightning bolt), a muffled plunge into calm deep
water with a slow bowed-string tone for the holdfast, one heavy low note on "Neither does the dev",
then a chain rattle and a metal lock clank, and a warm resolving chord. Everything is synthesized
here, so nothing needs a license.

    python3 scripts/storm.py        # writes public/storm.wav
"""
import math
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
FPS = 30
DUR = 12.2
N = int(DUR * SR)
rng = np.random.default_rng(3)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Frame timings, kept in step with T in src/scenes/Lock.tsx.
LINES, BOLTS, DESCEND, CARD, SLAM, ROWS, OUTRO = [12, 118, 178], [22, 64, 96], (100, 150), 222, 244, 262, 312


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


def sine(f, n, sweep=None, rate=30):
    t = np.arange(n) / SR
    if sweep is None:
        return np.sin(2 * np.pi * f * t)
    freq = f + (sweep - f) * np.exp(-t * rate)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR)


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune) if detune else (0,):
        out += 2 * ((t * f * (1 + d)) % 1.0) - 1
    return out / (3 if detune else 1)


# ---------- instruments ----------
def thunder(length=3.0):
    n = int(length * SR)
    crack = filt(rng.standard_normal(n), 2500, "high") * env(n, 0.001, 0.05) * 0.8
    rumble = filt(rng.standard_normal(n), 140, order=3) * env(n, 0.03, 1.1) * 9
    roll = filt(rng.standard_normal(n), 400) * (0.5 + 0.5 * np.sin(np.arange(n) / SR * 2 * np.pi * 3.5)) * env(n, 0.1, 0.9) * 1.5
    return np.tanh(crack + rumble + roll) * 0.8


def bowed(note, length, gain=0.2):
    """Slow-attack bowed string: detuned saws, soft vibrato, dark filter."""
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note) * (1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / 0.8))
    x = sum(2 * ((np.cumsum(f * (1 + d)) / SR) % 1.0) - 1 for d in (-0.003, 0, 0.003)) / 3
    return filt(x, 900) * env(n, 0.6, 3, s=0.85, r=0.6, hold=length - 0.6) * gain


def piano_low(note, length=3.0, gain=0.4):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note)
    x = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (1.2 + k * 0.9)) for k, a in [(1, 1), (2, 0.5), (3, 0.25), (4, 0.12)])
    hammer = filt(rng.standard_normal(n), 1200) * env(n, 0.001, 0.02) * 0.3
    return (x + hammer) * env(n, 0.003, 4) * gain


def clank():
    """Heavy metal lock: inharmonic ringing partials plus a hard transient."""
    n = int(1.8 * SR)
    t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, a, d in [(180, 1, 6), (437, 0.7, 9), (822, 0.5, 12), (1390, 0.35, 16), (2210, 0.25, 22)])
    hit = filt(rng.standard_normal(n), 3000, "high") * env(n, 0.0005, 0.012) * 1.5
    thud = sine(60, n, sweep=140, rate=25) * env(n, 0.001, 0.2) * 1.2
    return np.tanh((x * 0.5 + hit + thud) * 1.4) * 0.7


def chain():
    """A rattle of small metal links."""
    n = int(0.5 * SR)
    out = np.zeros(n)
    for k in range(9):
        j = int((k / 9) ** 0.8 * n * 0.9)
        m = int(0.03 * SR)
        f = 2400 + rng.random() * 2600
        s = np.sin(2 * np.pi * f * np.arange(m) / SR) * env(m, 0.0005, 0.008)
        out[j : j + m] += s[: n - j] * (0.5 + 0.5 * rng.random())
    return out * 0.35


def tick():
    n = int(0.03 * SR)
    return filt(rng.standard_normal(n), 3500, "high") * env(n, 0.0005, 0.004) * 0.25


def pad(notes, length, gain=0.3):
    n = int(length * SR)
    x = sum(saw(hz(m), n, detune=0.006) for m in notes) / len(notes)
    return filt(x, 1700) * env(n, 0.4, 1.0, s=0.8, r=1.0, hold=length - 1.0) * gain


# ---------- storm (0 → descend) ----------
t_down0, t_down1 = sec(DESCEND[0]), sec(DESCEND[1])
storm_len = t_down1 + 0.5
n = int(storm_len * SR)
duck = np.clip((t_down1 - np.arange(n) / SR) / (t_down1 - t_down0), 0, 1)  # fades as we sink
rain = filt(rng.standard_normal(n), 1500, "high") * 0.18
rain += filt(rng.standard_normal(n), 5000) * 0.08
wind = filt(rng.standard_normal(n), 500) * (0.6 + 0.4 * np.sin(np.arange(n) / SR * 2 * np.pi * 0.35)) * 0.9
add((rain + wind) * duck * np.minimum(1, np.arange(n) / (0.3 * SR)), 0.0, 1.0)
for i, b in enumerate(BOLTS):
    add(thunder(3.2 - i * 0.5) * (1.0 if sec(b) < t_down0 else 0.5), sec(b), 1.0 - 0.15 * i, [-0.4, 0.4, 0.0][i])

# ---------- the deep (descend → card) ----------
n = int(0.9 * SR)  # the plunge: a muffled splash sweeping down
splash = filt(rng.standard_normal(n), 900) * env(n, 0.02, 0.3) * 0.6
add(splash, t_down0 + 0.3, 1.0)
add(bowed(38, 5.2, 0.28), sec(LINES[1]) - 0.3, 1.0)  # D2 low string under the holdfast
add(bowed(45, 4.6, 0.18), sec(LINES[1]) + 0.3, 1.0, 0.25)
add(bowed(53, 3.6, 0.12), sec(LINES[1]) + 0.9, 1.0, -0.25)
add(piano_low(26, 4.0, 0.55), sec(LINES[2]), 1.0)  # "Neither does the dev." — one heavy D
add(piano_low(38, 3.5, 0.3), sec(LINES[2]), 1.0)

# ---------- the lock ----------
add(chain(), sec(SLAM) - 0.45, 1.0, -0.2)
add(chain(), sec(SLAM) - 0.25, 0.8, 0.2)
add(clank(), sec(SLAM), 1.0)
for i in range(4):  # one tick per row
    add(tick(), sec(ROWS + i * 8), 1.0, -0.3 + 0.2 * i)
add(pad([50, 54, 57, 62, 66], DUR - sec(SLAM) - 0.1, 0.32), sec(SLAM) + 0.05, 1.0)  # warm D major resolve
add(bowed(62, DUR - sec(OUTRO), 0.1), sec(OUTRO), 1.0)
add(piano_low(74, 3.0, 0.18), sec(OUTRO), 1.0, 0.2)
add(piano_low(78, 3.0, 0.12), sec(OUTRO) + 0.12, 1.0, -0.2)

out = np.stack([L, R], axis=1)
# The storm is dense; lift the calm half so the holdfast, clank and resolve carry on phone speakers.
out *= np.interp(np.arange(N) / SR, [0, t_down0, t_down1, DUR], [1.0, 1.0, 1.9, 2.2])[:, None]
fade = np.clip((DUR - 0.1 - np.arange(N) / SR) / 0.8, 0, 1) * np.clip(np.arange(N) / (0.02 * SR), 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.1)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "storm.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
