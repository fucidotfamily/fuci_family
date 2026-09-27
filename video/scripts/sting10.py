"""
10-second track for the "$1 puts your agent on-chain" clip (src/scenes/OneDollar.tsx): a coin ching,
button click, checks, a stamp on "Verified" and a closing chord, over a light 120 BPM groove.
Synthesized here (same instruments as soundtrack.py), so there is nothing to license.

    python3 scripts/sting10.py      # writes public/sting10.wav
"""
import math
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
FPS = 30
DUR = 10.2
N = int(DUR * SR)
rng = np.random.default_rng(11)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

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


def hz(note):  # MIDI -> Hz
    return 440.0 * 2 ** ((note - 69) / 12)


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune) if detune else (0,):
        ph = (t * f * (1 + d)) % 1.0
        out += 2 * ph - 1
    return out / (3 if detune else 1)


def sine(f, n, sweep=None):
    t = np.arange(n) / SR
    if sweep is None:
        return np.sin(2 * np.pi * f * t)
    freq = f + (sweep - f) * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR)


# ---------- instruments ----------
def kick():
    n = int(0.45 * SR)
    return np.tanh(2.2 * sine(50, n, sweep=160) * env(n, 0.001, 0.22))


def clap():
    n = int(0.25 * SR)
    x = filt(rng.standard_normal(n), 1400, "high")
    x = filt(x, 6000)
    e = env(n, 0.001, 0.08)
    for k in (0.01, 0.02):  # the "clap" flams
        j = int(k * SR)
        e[j:] += 0.6 * env(n - j, 0.001, 0.06)
    return x * e * 0.5


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    x = filt(rng.standard_normal(n), 7000, "high")
    return x * env(n, 0.001, 0.12 if open_ else 0.02) * 0.35


def bass(note, length):
    n = int(length * SR)
    x = saw(hz(note), n) + 0.6 * sine(hz(note), n)
    return np.tanh(1.5 * filt(x, 420)) * env(n, 0.004, 0.25, s=0.5, r=0.04, hold=length - 0.04) * 0.5


def pad(notes, length):
    n = int(length * SR)
    x = sum(saw(hz(m), n, detune=0.006) for m in notes) / len(notes)
    x = filt(x, 1800)
    return x * env(n, 0.35, 1.0, s=0.8, r=0.4, hold=length - 0.4) * 0.35


def pluck(note, length=0.22):
    n = int(length * SR)
    x = saw(hz(note), n, detune=0.004)
    x = filt(x, 3200) * env(n, 0.002, 0.09)
    return x * 0.3


def blip(note, length=0.12, gain=0.35):
    n = int(length * SR)
    return (sine(hz(note), n) + 0.3 * sine(hz(note + 12), n)) * env(n, 0.002, length / 3) * gain


def click(gain=0.25, bright=4000):
    n = int(0.018 * SR)
    return filt(rng.standard_normal(n), bright, "high") * env(n, 0.0005, 0.004) * gain


def whoosh(length=0.6, up=True):
    n = int(length * SR)
    x = rng.standard_normal(n)
    t = np.arange(n) / n
    # sweep the band by filtering in chunks
    out = np.zeros(n)
    chunks = 24
    for c in range(chunks):
        a, b = c * n // chunks, (c + 1) * n // chunks
        f = 300 + (5000 if up else 2500) * ((c / chunks) if up else 1 - c / chunks)
        out[a:b] = filt(x[a:b], f, "low")
    shape = np.sin(np.pi * t) ** 2
    return out * shape * 0.35


def riser(length):
    n = int(length * SR)
    t = np.arange(n) / n
    noise = filt(rng.standard_normal(n), 2000, "high") * t**2 * 0.25
    f = 200 + 1600 * t**2
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * t**2 * 0.12
    return noise + tone


def impact():
    n = int(2.5 * SR)
    boom = sine(40, n, sweep=120) * env(n, 0.001, 0.9) * 0.9
    air = filt(rng.standard_normal(n), 3000, "high") * env(n, 0.001, 0.6) * 0.15
    return np.tanh(boom + air)


# ---------- the track (frame numbers from src/scenes/OneDollar.tsx) ----------
def ching(t, gain=0.5):
    n = int(0.9 * SR)
    x = (sine(2637, n) + 0.6 * sine(3951, n) + 0.3 * sine(5274, n)) * env(n, 0.001, 0.25)
    add(x, t, gain * 0.35, 0.2)

add(riser(sec(4) - 0.02), 0.02, 0.6)
add(impact(), sec(4), 1.0)  # "$1"
add(kick(), sec(4), 1.0)
ching(sec(14))  # the coin flips in
ching(sec(18), 0.35)
# Light groove from 2 s to 9 s (120 BPM).
t = 2.0
b = 0
while t < 9.0:
    add(kick(), t, 0.7)
    add(hat(), t + 0.25, 0.6, 0.3)
    if b % 2:
        add(clap(), t, 0.4)
    add(bass([45, 41, 48, 43][(b // 4) % 4], 0.45), t, 0.55)
    t += 0.5
    b += 1
add(whoosh(0.6), sec(66) - 0.35, 0.7)  # card slides in
add(click(0.9, 1500), sec(92), 1.0)  # button press
add(blip(76, 0.2, 0.3), sec(92), 1.0)
for k, note in enumerate([79, 83, 86]):  # checks
    add(blip(note, 0.25, 0.3), sec(104 + k * 12), 1.0, -0.3 + k * 0.3)
add(whoosh(0.6), sec(164) - 0.35, 0.7)  # contract card
add(impact(), sec(186), 0.55)  # "Verified" stamp
add(clap(), sec(186), 0.6)
for k, note in enumerate([84, 88, 91]):
    add(blip(note, 0.35, 0.18), sec(186) + k * 0.05, 1.0)
add(whoosh(0.7), sec(240) - 0.4, 0.8)
add(impact(), sec(246), 0.9)  # closing line
add(pad([57, 60, 64, 69], 2.4), sec(246), 0.9)
add(pad([69, 72, 76], 2.4), sec(246), 0.4)
ching(sec(262), 0.3)

out = np.stack([L, R], axis=1)
fade = np.clip((DUR - 0.1 - np.arange(N) / SR) / 0.8, 0, 1) * np.clip(np.arange(N) / (0.02 * SR), 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.1)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "sting10.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
