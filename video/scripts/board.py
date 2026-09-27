"""
13-second track for the "Fuci Market" departures-board clip (src/scenes/Market.tsx).
An airport chime opens and closes it; every split-flap run clatters as it flips; a minimal beat
(124 BPM) carries the board; the agent's search types, a 402 buzz, a coin "ka-ching" on the
payment and a bright arpeggio on 200 OK. Everything is synthesized here, so nothing needs a license.

    python3 scripts/board.py        # writes public/board.wav
"""
import math
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
FPS = 30
DUR = 13.2
N = int(DUR * SR)
rng = np.random.default_rng(21)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Frame timings, kept in step with T in src/scenes/Market.tsx.
TITLE, TITLE_OUT, BOARD, ROWS, ROW_GAP, LIVE = 6, 58, 62, 74, 11, 18
STATS, SEARCH, PICK, PAY, FINALE = 182, 250, 272, (282, 298, 314), 334


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


def saw(f, n):
    t = np.arange(n) / SR
    return 2 * ((t * f) % 1.0) - 1


# ---------- instruments ----------
def flap():
    """One split-flap leaf falling: a papery tick with a small plastic body."""
    n = int(0.025 * SR)
    tick = filt(rng.standard_normal(n), [1800 + rng.random() * 1500, 6500], "band") * env(n, 0.0003, 0.004)
    body = sine(900 + rng.random() * 500, n) * env(n, 0.0005, 0.006) * 0.3
    return (tick + body) * 0.5


def clatter(start_f, end_f, cells, gain=1.0, pan=0.0):
    """A run of flaps: dense while every cell spins, thinning out as they settle."""
    t0, t1 = sec(start_f), sec(end_f)
    rate = min(90, 6 * cells)  # flaps per second at the start
    t = t0
    while t < t1:
        p = (t - t0) / max(1e-3, t1 - t0)
        add(flap(), t, gain * (0.8 + 0.4 * rng.random()), pan + rng.uniform(-0.35, 0.35))
        t += rng.exponential(1 / (rate * (1 - 0.8 * p) + 1e-3))


def bell(note, length=2.0, gain=0.2):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note)
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in [(1, 1, 1.6), (2.0, 0.35, 3), (3.0, 0.15, 5), (4.1, 0.08, 7)])
    return x * env(n, 0.003, 6) * gain


def chime(t, gain=1.0):
    """Airport announcement ding-dong (and a third tone)."""
    for k, note in enumerate([76, 72, 67]):
        add(bell(note, 2.4, 0.22), t + k * 0.32, gain, [-0.2, 0.2, 0][k])


def kick():
    n = int(0.3 * SR)
    return np.tanh(2.2 * sine(52, n, sweep=170, rate=38) * env(n, 0.001, 0.14)) * 0.8


def hat(open_=False):
    n = int((0.12 if open_ else 0.04) * SR)
    return filt(rng.standard_normal(n), 8500, "high") * env(n, 0.001, 0.05 if open_ else 0.012) * 0.16


def bass(note, length=0.2):
    n = int(length * SR)
    x = filt(saw(hz(note), n), 600) + 0.5 * sine(hz(note), n)
    return np.tanh(1.4 * x) * env(n, 0.003, 0.09) * 0.4


def blip(note, length=0.1, gain=0.2):
    n = int(length * SR)
    return (sine(hz(note), n) + 0.3 * sine(hz(note + 12), n)) * env(n, 0.002, length / 3) * gain


def key():
    n = int(0.03 * SR)
    return filt(rng.standard_normal(n), 3500 + rng.random() * 2000, "high") * env(n, 0.0003, 0.004) * 0.3 + sine(240, n) * env(n, 0.001, 0.008) * 0.15


def buzz():
    """402: a short low 'denied' buzz, two pulses."""
    out = np.zeros(int(0.4 * SR))
    for k in range(2):
        n = int(0.12 * SR)
        x = filt(saw(110, n) + saw(116.5, n), 1200) * env(n, 0.004, 0.08, s=0.6, r=0.02, hold=0.1)
        j = int(k * 0.17 * SR)
        out[j : j + n] += x * 0.35
    return out


def kaching():
    """Coin register: a metallic chord ringing after a bright noise 'cha'."""
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    cha = filt(rng.standard_normal(n), 4000, "high") * env(n, 0.001, 0.05) * 0.5
    ring = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, a, d in [(2093, 1, 3), (2637, 0.8, 3.5), (3136, 0.6, 4), (4186, 0.4, 6), (5274, 0.25, 8)])
    delay = int(0.07 * SR)
    ring = np.concatenate([np.zeros(delay), ring[:-delay]])
    return (cha + ring * 0.18) * 0.9


# ---------- arrangement ----------
chime(sec(0), 0.9)

# Title flaps
clatter(TITLE, TITLE + 30, 21, 0.9)

# Beat from the board's arrival to the finale
beat = 60 / 124
t_start, t_end = sec(BOARD), sec(FINALE) - 0.05
line = [38, 38, 50, 38, 41, 38, 50, 43]
b = 0
t = t_start
while t < t_end:
    add(kick(), t, 0.75)
    add(hat(), t + beat / 2, 0.9, 0.25)
    if b % 4 == 3:
        add(hat(True), t + beat * 0.75, 0.7, -0.25)
    add(bass(line[b % len(line)]), t + beat / 2, 1.0)
    t += beat
    b += 1

# Board rows: a clatter per row, a green blip when it goes LIVE
for i in range(8):
    at = ROWS + i * ROW_GAP
    clatter(at, at + 20, 40, 0.55, -0.4 + i * 0.1)
    add(blip(84 + (i % 4) * 2, 0.12, 0.14), sec(at + LIVE + 6), 1.0, 0.5)

# Totals strip
for k in range(3):
    clatter(STATS + k * 8, STATS + k * 8 + 18, 6, 0.8, -0.3 + 0.3 * k)
    add(blip(79 + k * 5, 0.14, 0.16), sec(STATS + k * 8 + 18), 1.0)

# The agent types its search
for c in range(10):
    add(key(), sec(SEARCH + 4) + c * 1.6 / FPS, 1.0, rng.uniform(-0.2, 0.2))
add(blip(91, 0.18, 0.2), sec(PICK), 1.0)  # row picked
add(buzz(), sec(PAY[0]), 1.0)  # 402
add(kaching(), sec(PAY[1]), 1.0)  # paid
for k, note in enumerate([72, 76, 79, 84]):  # 200 OK
    add(blip(note, 0.16, 0.2), sec(PAY[2]) + k * 0.06, 1.0, -0.3 + 0.2 * k)

# Finale: the title flaps, the chime, a warm chord
clatter(FINALE, FINALE + 22, 11, 1.0)
chime(sec(FINALE) + 0.55, 1.0)
n = int((DUR - sec(FINALE)) * SR)
chord = sum(filt(saw(hz(m), n), 1400) for m in [48, 55, 60, 64, 67]) / 5
add(chord * env(n, 0.3, 1.0, s=0.8, r=0.8, hold=n / SR - 0.8) * 0.35, sec(FINALE), 1.0)

out = np.stack([L, R], axis=1)
fade = np.clip((DUR - 0.1 - np.arange(N) / SR) / 0.8, 0, 1) * np.clip(np.arange(N) / (0.02 * SR), 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.2)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "board.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
