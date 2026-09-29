"""
15-second track for "Autopilot, upgraded" (src/scenes/Sorter.tsx): a funk breakbeat at 104 BPM in E minor.
A slap bass and clavinet stabs on an Em9-A13 vamp over a swung breakbeat; a soft conveyor hum and roller
clicks under the sorting machine, a clean blip when a token clears a gate, a low thunk when a rug is knocked
off, a cash-register ding when the clean token is bought, a clock tick and coin clink for each DCA buy, a
rising counter under the PnL count-up, a mouse click on Share, and a brass swell into the end card.
Everything is synthesized here, so nothing needs a license.

    python3 scripts/sorter.py      # writes public/sorter.wav
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
rng = np.random.default_rng(104)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Kept in step with T, SPEED, X0, GATES, TRAY_X, START, DCA_TICK and PNL_CLICK in src/scenes/Sorter.tsx.
T = dict(intro=0, sort=44, dca=232, pnl=318, end=396, dur=450)
SPEED, X0 = 24, -120
GATES = [470, 710, 950, 1190, 1430]
TRAY_X = 1690
TOKENS = 6
START = lambda i: T["sort"] + 12 + i * 15
AT = lambda i, x: START(i) + (x - X0) / SPEED
DCA_TICK = lambda k: T["dca"] + 16 + k * 12
PNL_CLICK = T["pnl"] + 50

BPM = 104
BEAT = 60 / BPM
SW = 0.58  # 16th swing


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


def hz(n):
    return 440 * 2 ** ((n - 69) / 12)


def tt(length):
    return np.arange(int(length * SR)) / SR


def sine(f, t):
    return np.sin(2 * np.pi * f * t)


# ---------------------------------------------------------------- drums
def kick(g=0.5):
    t = tt(0.32)
    f = 48 + 110 * np.exp(-t * 32)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * g


def snare(g=0.28):
    t = tt(0.22)
    body = sine(190, t) * np.exp(-t * 30)
    noise = filt(rng.standard_normal(len(t)), [1500, 8000], "band") * np.exp(-t * 18)
    return (0.5 * body + noise) * g


def ghost(g=0.07):
    t = tt(0.08)
    return filt(rng.standard_normal(len(t)), [1800, 7000], "band") * np.exp(-t * 50) * g


def hat(g=0.05, open_=False):
    t = tt(0.16 if open_ else 0.035)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * (22 if open_ else 120)), 8000, "high") * g


# ---------------------------------------------------------------- instruments
def slap(n, length=0.22, g=0.3, pop=False):
    """Slap bass: a bright pluck that closes fast; the pop is an octave up with more bite."""
    t = tt(length)
    f = hz(n + (12 if pop else 0))
    x = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + sine(f, t) + 0.5 * sine(2 * f, t)
    env = np.exp(-t * (18 if pop else 9)) * np.clip(t / 0.003, 0, 1)
    cut = 900 + 3500 * np.exp(-t * 25)
    y = np.zeros_like(x)
    seg = 256
    for s in range(0, len(x), seg):
        y[s : s + seg] = filt(x[s : s + seg + 64], cut[s], "low")[: len(x[s : s + seg])]
    return y * env * g


def clav(notes, length=0.14, g=0.06):
    """Clavinet stab: a thin, bright pulse chord with a quick bite."""
    t = tt(length)
    x = sum(np.sign(np.sin(2 * np.pi * hz(m) * t)) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * hz(m) * 2.01 * t))) for m in notes)
    return filt(x, [600, 5000], "band") * np.exp(-t * 20) * np.clip(t / 0.002, 0, 1) * g


def brass(notes, length=1.2, g=0.05):
    t = tt(length)
    x = sum(np.sign(np.sin(2 * np.pi * hz(m) * (1 + d) * t)) for m in notes for d in (-0.004, 0.004))
    env = np.clip(t / 0.25, 0, 1) * np.clip((length - t) / 0.5, 0, 1)
    return filt(x, 1800) * env * g


def pad(notes, length, g=0.03):
    t = tt(length)
    x = sum(sine(hz(m) * (1 + d), t) + 0.3 * sine(2 * hz(m) * (1 + d), t) for m in notes for d in (-0.003, 0.003))
    env = np.clip(t / 0.6, 0, 1) * np.clip((length - t) / 1.2, 0, 1)
    return filt(x * env, 2800) * g


# ---------------------------------------------------------------- effects
def blip(n=84, g=0.06):
    t = tt(0.1)
    return (sine(hz(n), t) + 0.3 * sine(hz(n + 12), t)) * np.exp(-t * 35) * g


def thunk(g=0.22):
    t = tt(0.35)
    f = 150 * np.exp(-t * 6) + 45
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 10)
    knock = filt(rng.standard_normal(len(t)), [300, 1500], "band") * np.exp(-t * 40) * 0.6
    return (body + knock) * g


def ding(g=0.1):
    t = tt(1.1)
    x = sine(hz(88), t) + 0.5 * sine(hz(95), t) + 0.3 * sine(hz(88) * 2.76, t) * np.exp(-t * 4)
    return x * np.exp(-t * 3.5) * np.clip(t / 0.002, 0, 1) * g


def clockTick(g=0.1):
    t = tt(0.05)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 160), [2500, 7000], "band") * g


def clink(g=0.07):
    t = tt(0.45)
    return (sine(2400, t) + 0.6 * sine(3200, t) + 0.3 * sine(4900, t)) * np.exp(-t * 10) * g


def click(g=0.12):
    t = tt(0.03)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 300), [1200, 6000], "band") * g


def whoosh(length=0.5, g=0.07):
    t = tt(length)
    x = filt(rng.standard_normal(len(t)), [400, 3000], "band")
    return x * np.sin(np.pi * t / length) ** 2 * g


def hum(length, g=0.03):
    t = tt(length)
    x = filt(rng.standard_normal(len(t)), 180) * 3 + 0.4 * sine(55, t) + 0.2 * sine(110, t)
    env = np.clip(t / 0.3, 0, 1) * np.clip((length - t) / 0.3, 0, 1)
    return x * env * g


# ---------------------------------------------------------------- groove
# The band starts on the downbeat after the intro sting and runs until the end card.
first = sec(T["sort"]) - BEAT * 0.5
end_band = sec(T["end"])
bar = 4 * BEAT
chords = [([52, 55, 59, 62, 66], [40, 47]), ([57, 61, 64, 67, 71], [45, 52])]  # Em9, A13-ish
t0 = first
b = 0
while t0 < end_band:
    notes, bass = chords[b % 2]
    s16 = [t0 + k * BEAT / 4 + (BEAT / 4 * (SW - 0.5) * 2 if k % 2 else 0) for k in range(16)]
    # breakbeat
    for k in (0, 7, 10):
        add(kick(), s16[k])
    for k in (4, 12):
        add(snare(), s16[k], 1.0, 0.05)
    for k in (3, 9, 14):
        add(ghost(), s16[k], 1.0, 0.1)
    for k in range(16):
        add(hat(open_=(k == 6)), s16[k], 1.0 if k % 2 == 0 else 0.6, 0.3)
    # slap bass: root thumb, octave pops, a walk-up at the end of the bar
    root, fifth = bass
    for k, n, pop in ((0, root, False), (3, root, True), (6, root, False), (8, fifth, False), (10, root, True), (12, root, False), (14, root + 2, False), (15, root + 3, False)):
        add(slap(n, pop=pop), s16[k], 1.0, -0.1)
    # clav on the offbeats
    for k in (2, 6, 11, 14):
        add(clav(notes), s16[k], 1.0, 0.35 if k % 4 == 2 else -0.35)
    t0 += bar
    b += 1

# Intro: a brass swell into the downbeat.
add(brass([52, 59, 64, 67], 1.3, 0.05), 0.05)
add(whoosh(0.6, 0.05), sec(T["sort"]) - 0.5)

# Sorting machine: hum, a blip each time a clean token clears a gate, a thunk for each rug.
add(hum(sec(T["dca"] - T["sort"])), sec(T["sort"]), 1.0, 0.0)
for g in range(5):
    add(thunk(), sec(AT(g, GATES[g] - 60)), 1.0, -0.6 + g * 0.3)
    for i in range(g + 1, TOKENS):
        add(blip(79 + g * 2, 0.035), sec(AT(i, GATES[g] - 58)), 1.0, -0.6 + g * 0.3)
add(ding(), sec(AT(TOKENS - 1, TRAY_X)), 1.0, 0.6)

# DCA: a clock tick and a coin clink per buy, climbing a little each time.
add(whoosh(0.5, 0.05), sec(T["dca"]) - 0.25)
for k in range(5):
    add(clockTick(), sec(DCA_TICK(k)) - 0.2, 1.0, -0.4)
    add(clink(0.06 + k * 0.004), sec(DCA_TICK(k)) + 0.27, 1.0, 0.4)

# PnL: a rising counter under the count-up, the click on Share, a soft whoosh into the post.
add(whoosh(0.5, 0.05), sec(T["pnl"]) - 0.25)
for j in range(12):
    add(blip(72 + j, 0.03), sec(T["pnl"] + 10) + j * 0.075, 1.0, 0.2)
add(click(), sec(PNL_CLICK), 1.0, 0.1)
add(whoosh(0.6, 0.05), sec(PNL_CLICK + 8))

# End card: brass swell and a warm E major 9 to close, over a last kick.
add(kick(0.45), sec(T["end"]))
add(brass([52, 56, 59, 63, 66], 2.0, 0.055), sec(T["end"]))
add(pad([40, 52, 56, 59, 63, 66], DUR - sec(T["end"]) + 0.2, 0.04), sec(T["end"]))
add(ding(0.06), sec(T["end"] + 20))

out = np.stack([L, R], axis=1)
ts = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - ts) / 1.3, 0, 1) * np.clip(ts / 0.03, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.25)
out /= np.max(np.abs(out)) / 0.88
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "sorter.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
