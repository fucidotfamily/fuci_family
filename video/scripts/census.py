"""
15-second track for "The First Night" (src/scenes/Census.tsx): every agent on Arc lights up as a star.
A slow cosmic pad and sub drone, a soft glass ping as each star ignites (thicker as they rush in),
a swell and a bright chord on the 225 reveal, a sudden quiet on "Not 225 thousand", a sonar ping for
the empty star #226, and a warm rising close. Everything is synthesized here, so nothing needs a license.

    python3 scripts/census.py       # writes public/census.wav
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
rng = np.random.default_rng(226)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Frame timings, kept in step with T in src/scenes/Census.tsx.
OPEN, STARS, COUNT, SMALL, SETTLERS, SLOT, CTA = 8, (74, 196), 206, 256, 300, 318, 372
AGENTS = 225


def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    sig = sig[: N - i]
    L[i : i + len(sig)] += sig * gain * math.sqrt(0.5 * (1 - pan))
    R[i : i + len(sig)] += sig * gain * math.sqrt(0.5 * (1 + pan))


def echo(sig, t, gain=1.0, pan=0.0, taps=4, delay=0.29, fb=0.45):
    add(sig, t, gain, pan)
    for k in range(1, taps + 1):
        sig = filt(sig, 5000)
        add(sig, t + k * delay, gain * fb**k, -pan if k % 2 else pan)


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


def pad(notes, length, gain=0.2, attack=1.5):
    """Airy pad: detuned sine stacks with slow chorus, very soft attack."""
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for m in notes:
        for d, a in [(-0.004, 0.5), (0, 1), (0.004, 0.5)]:
            f = hz(m) * (1 + d) * (1 + 0.0015 * np.sin(2 * np.pi * (0.2 + rng.random() * 0.2) * t))
            x += a * np.sin(2 * np.pi * np.cumsum(f) / SR)
            x += 0.15 * a * np.sin(2 * np.pi * 2 * np.cumsum(f) / SR)
    x /= len(notes) * 2
    return x * env(n, attack, 5, s=0.9, r=1.2, hold=length - 1.2) * gain


def ping(note, gain=0.12, length=1.2):
    """Glass star: a pure sine with a quiet fifth above, bell decay."""
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 1.5 * t) * np.exp(-t * 6)
    return x * env(n, 0.002, 0.5) * gain


def boom():
    n = int(2.5 * SR)
    t = np.arange(n) / SR
    f = 34 + 60 * np.exp(-t * 8)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.005, 1.2)
    air = filt(rng.standard_normal(n), 800) * env(n, 0.01, 0.4) * 0.3
    return np.tanh(1.8 * (body + air)) * 0.8


def swell(length):
    n = int(length * SR)
    t = np.arange(n) / n
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    for c in range(30):
        a, b = c * n // 30, (c + 1) * n // 30
        out[a:b] = filt(noise[a:b], 200 + 6000 * (c / 30) ** 2)
    return out * t**3 * 0.35


def sonar(gain=0.2):
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * hz(86) * t) * np.exp(-t * 3.5)
    return x * env(n, 0.003, 2) * gain


# ---------- arrangement ----------
t_cta = sec(CTA)
# A low drone and the night pad under everything until the call to action.
add(pad([38, 45], sec(SMALL) + 0.4, 0.28, 2.0), 0.0)
add(pad([62, 66, 69, 73], sec(COUNT) - 0.2, 0.14, 2.5), 0.4)  # D major 7 shimmer
echo(ping(81, 0.14, 1.8), sec(OPEN), 1.0, 0.0)  # "Every chain has a first night."

# A ping for every star, on a D lydian scale, climbing as the rush builds.
scale = [74, 76, 78, 81, 83, 85, 86, 88, 90, 93]
for i in range(AGENTS):
    at = STARS[0] + (STARS[1] - STARS[0]) * (i / AGENTS) ** 0.55
    p = i / AGENTS
    note = scale[min(len(scale) - 1, int(p * 6 + rng.random() * 4))]
    add(ping(note, 0.05 + 0.04 * (1 - p), 0.9), sec(at) + rng.random() * 0.02, 1.0, rng.uniform(-0.8, 0.8))
add(swell(1.2), sec(COUNT) - 1.2, 1.0)

# The reveal: 225.
add(boom(), sec(COUNT), 1.0)
add(pad([50, 57, 62, 66, 69], sec(SMALL) - sec(COUNT) + 0.3, 0.3, 0.05), sec(COUNT))
for k, m in enumerate([74, 78, 81, 86]):
    echo(ping(m, 0.12, 1.5), sec(COUNT) + 0.05 * k, 1.0, -0.3 + 0.2 * k, taps=2)

# "Not 225 thousand." Everything drops to one low note.
echo(ping(50, 0.3, 2.5), sec(SMALL), 1.0, 0.0, taps=3, delay=0.4, fb=0.4)
add(pad([38], sec(CTA) - sec(SMALL), 0.2, 0.6), sec(SMALL))

# "The first ones get the names…" and the empty star #226 pinging like sonar.
add(pad([57, 62, 64, 69], t_cta - sec(SETTLERS) + 0.4, 0.12, 1.0), sec(SETTLERS))
t = sec(SLOT)
while t < t_cta - 0.1:
    echo(sonar(0.14), t, 1.0, 0.5, taps=2, delay=0.33, fb=0.35)
    t += 0.66

# It's still early: warm D major, a rising sparkle, fade out.
add(boom(), t_cta, 0.5)
add(pad([38, 50, 57, 62, 66, 69, 74], DUR - t_cta, 0.34, 0.2), t_cta)
for k, m in enumerate([74, 78, 81, 86, 90, 93]):
    echo(ping(m, 0.1, 1.4), t_cta + 0.3 + 0.1 * k, 1.0, -0.5 + 0.2 * k, taps=2)

out = np.stack([L, R], axis=1)
# Lift the quiet opening and the "Not 225 thousand" drop so they still carry on phone speakers.
tt = np.arange(N) / SR
out *= np.interp(tt, [0, sec(STARS[0]), sec(STARS[0]) + 1, sec(SMALL) - 0.1, sec(SMALL), sec(SETTLERS), sec(SETTLERS) + 0.5], [2.0, 2.0, 1.0, 1.0, 2.2, 2.2, 1.0])[:, None]
fade = np.clip((DUR - 0.1 - np.arange(N) / SR) / 1.2, 0, 1) * np.clip(np.arange(N) / (0.05 * SR), 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.3)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "census.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
