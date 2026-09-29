"""
18-second track for "Your agent earns. Just ask." (src/scenes/EarnChat.tsx): a bright product-keynote pulse at
112 BPM in G major. A soft pad and a single felt-piano chord under the title; then a plucked arpeggio with a
pulsing, gently ducked pad, a round sub and a light clap on 2 and 4. Soft key taps while the message is typed,
a quiet "thinking" shimmer, a rising two-note chime when the agent's proposal appears, a click on Confirm, a
warm confirmation tone when the wallet signs, a rising sparkle as the balance earns, one tick per extra
command, and an open Gmaj9 under the end card. Everything is synthesized here, so nothing needs a license.

    python3 scripts/earnchat.py      # writes public/earnchat.wav
"""
import math
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
FPS = 30
DUR = 18.2
N = int(DUR * SR)
rng = np.random.default_rng(112)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Kept in step with T, MORE_AT and PROMPT in src/scenes/EarnChat.tsx.
T = dict(intro=0, chat=64, typeEnd=112, think=114, card=132, click=184, sign=190, signed=214, done=222, earn=262, more=384, end=468, dur=540)
MORE_AT = lambda i: T["more"] + 8 + i * 22
PROMPT_LEN = len("Put all my idle USDC in Earn")

BPM = 112
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


def hz(n):
    return 440 * 2 ** ((n - 69) / 12)


def tt(length):
    return np.arange(int(length * SR)) / SR


def sine(f, t):
    return np.sin(2 * np.pi * f * t)


def pluck(n, length=0.35, g=0.05):
    t = tt(length)
    f = hz(n)
    x = sine(f, t) + 0.35 * sine(2 * f, t) * np.exp(-t * 14) + 0.2 * np.sign(sine(f, t)) * np.exp(-t * 30)
    return filt(x, 5000) * np.exp(-t * 9) * np.clip(t / 0.002, 0, 1) * g


def pad(notes, length, g=0.03, attack=0.5):
    t = tt(length)
    x = sum(sine(hz(m) * (1 + d), t) + 0.3 * sine(2 * hz(m) * (1 + d), t) for m in notes for d in (-0.003, 0.003))
    env = np.clip(t / attack, 0, 1) * np.clip((length - t) / 0.8, 0, 1)
    return filt(x * env, 2600) * g


def piano(notes, length=2.4, g=0.05):
    t = tt(length)
    x = sum(sine(hz(m), t) + 0.45 * sine(2 * hz(m), t) * np.exp(-t * 2.5) + 0.2 * sine(3 * hz(m), t) * np.exp(-t * 4) for m in notes)
    return x * np.exp(-t * 1.6) * np.clip(t / 0.005, 0, 1) * g


def sub(n, length, g=0.18):
    t = tt(length)
    return sine(hz(n), t) * np.clip(t / 0.01, 0, 1) * np.clip((length - t) / 0.06, 0, 1) * g


def kick(g=0.3):
    t = tt(0.25)
    f = 50 + 90 * np.exp(-t * 35)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11) * g


def clap(g=0.09):
    t = tt(0.18)
    x = filt(rng.standard_normal(len(t)), [1000, 6000], "band")
    env = sum(np.exp(-np.clip(t - o, 0, None) * 60) * (t >= o) for o in (0, 0.008, 0.016)) * np.exp(-t * 8)
    return x * env * g


def hat(g=0.02):
    t = tt(0.03)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 150), 9000, "high") * g


def keytap(g=0.035):
    t = tt(0.025)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 260), [1800, 6000], "band") * g


def chime(n, g=0.05, length=1.2):
    t = tt(length)
    x = sine(hz(n), t) + 0.3 * sine(hz(n) * 2.01, t) * np.exp(-t * 4)
    return x * np.exp(-t * 3) * np.clip(t / 0.003, 0, 1) * g


def click(g=0.1):
    t = tt(0.03)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 320), [1500, 7000], "band") * g


def shimmer(length, g=0.02):
    t = tt(length)
    x = filt(rng.standard_normal(len(t)), [5000, 12000], "band")
    return x * np.sin(np.pi * t / length) * g


def swell(length=0.8, g=0.04):
    t = tt(length)
    return filt(rng.standard_normal(len(t)), [400, 4000], "band") * (t / length) ** 2 * g


# G major: Gmaj9, Em9, Cmaj9, Dsus. Roots for the sub.
CHORDS = [[55, 59, 62, 66, 69], [52, 55, 59, 62, 66], [48, 52, 55, 59, 62], [50, 55, 57, 62, 64]]
ROOTS = [43, 40, 36, 38]
bar = 4 * BEAT

# Title: a warm pad and one piano chord, a swell into the groove.
add(pad(CHORDS[0], sec(T["chat"]) + 0.4, 0.035, 0.8), 0)
add(piano([55, 62, 66, 71], 2.6, 0.045), 0.15)
add(swell(0.8, 0.04), sec(T["chat"]) - 0.8)

# Groove from the chat until the end card: pulsing ducked pad, plucked arpeggio, sub, kick, clap, hats.
t0 = sec(T["chat"])
b = 0
while t0 < sec(T["end"]) - 0.01:
    ch = b % 4
    notes = CHORDS[ch]
    s8 = [t0 + k * BEAT / 2 for k in range(8)]
    for k in range(8):
        # the pad breathes on every eighth, ducked right after each beat
        add(pad(notes, BEAT / 2, 0.012, 0.03), s8[k])
        add(pluck(notes[[0, 2, 4, 3, 1, 3, 4, 2][k]] + 12, 0.35, 0.035 if k % 2 else 0.045), s8[k], 1.0, -0.3 + 0.08 * k)
        add(hat(), s8[k] + BEAT / 4, 1.0, 0.35)
    for k in (0, 4):
        add(kick(), s8[k])
    for k in (2, 6):
        add(clap(), s8[k], 1.0, 0.05)
    add(sub(ROOTS[ch], BEAT * 1.8), s8[0])
    add(sub(ROOTS[ch], BEAT * 1.6), s8[4])
    t0 += bar
    b += 1

# Chat: key taps while typing, a shimmer while it thinks, a chime for the proposal, the click, the signature.
start_type = sec(T["chat"] + 12)
for i in range(PROMPT_LEN):
    add(keytap(), start_type + i * (sec(T["typeEnd"]) - start_type) / PROMPT_LEN, 1.0, 0.25)
add(click(0.08), sec(T["typeEnd"] + 2), 1.0, 0.2)
add(shimmer(sec(T["card"] - T["think"]), 0.02), sec(T["think"]))
add(chime(79), sec(T["card"]), 1.0, 0.2)
add(chime(86, 0.04), sec(T["card"]) + 0.12, 1.0, 0.3)
add(click(), sec(T["click"]), 1.0, 0.1)
add(swell(0.35, 0.02), sec(T["sign"]))
add(chime(74, 0.045, 1.4), sec(T["signed"]), 1.0, 0.0)
add(chime(78, 0.04, 1.4), sec(T["signed"]) + 0.08, 1.0, 0.1)
add(chime(81, 0.04, 1.6), sec(T["done"]), 1.0, 0.15)

# Earn: a slow rising sparkle while the balance ticks up.
for i in range(12):
    add(chime(86 + (i % 5) * 2, 0.012, 0.5), sec(T["earn"] + 20) + i * 0.3, 1.0, -0.4 + (i % 6) * 0.16)

# More commands: one soft tick when each result appears.
for i in range(3):
    add(chime(83 + i * 2, 0.035, 0.9), sec(MORE_AT(i) + 12), 1.0, 0.3)

# End card: swell, a last kick, open Gmaj9 on pad and piano.
add(swell(0.9, 0.045), sec(T["end"]) - 0.9)
add(kick(0.3), sec(T["end"]))
add(pad([43, 55, 59, 62, 66, 69], DUR - sec(T["end"]) + 0.2, 0.045, 0.3), sec(T["end"]))
add(piano([55, 62, 66, 69, 74], 3.0, 0.05), sec(T["end"]) + 0.05)

out = np.stack([L, R], axis=1)
ts = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - ts) / 1.5, 0, 1) * np.clip(ts / 0.03, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.3)
out /= np.max(np.abs(out)) / 0.88
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "earnchat.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
