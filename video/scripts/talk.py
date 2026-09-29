"""
15-second track for "Just tell your agent" (src/scenes/TalkAgent.tsx): neo-soul at 90 BPM in Eb major, a
different mood from the dark electronic films. A Rhodes-style electric piano on 9th chords (Ebmaj9, Cm9,
Abmaj9, Bb13), a round sub bass, a lazy swung beat with finger snaps, and playful UI sounds: bouncy pops for
stickers and chat bubbles, soft key taps while a message is typed, a tap on Confirm and a two-note "done"
chime. One command per bar (80 frames = 4 beats). Synthesized here, so nothing needs a license.

    python3 scripts/talk.py      # writes public/talk.wav
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
rng = np.random.default_rng(90)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Kept in step with T, STEP and COMMANDS in src/scenes/TalkAgent.tsx.
T = dict(title=0, first=70, step=80, end=390, dur=450)
STEP = dict(type=0, typeEnd=22, send=24, card=34, tap=54, done=60, out=76)
SAYS = ["DCA $FUCI 2 USDC every hour", "Sell half my FUCI", "Put all my idle USDC in Earn", "Turn autopilot off"]
at = lambda i: T["first"] + i * T["step"]
BEAT = 60 / 90


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


hz = lambda n: 440 * 2 ** ((n - 69) / 12)
tt = lambda length: np.arange(int(length * SR)) / SR
sine = lambda f, t: np.sin(2 * np.pi * f * t)


def rhodes(notes, length, g=0.03):
    """FM electric piano: a sine carrier, a decaying 1:1 modulator for the bark, a tine click on top."""
    t = tt(length)
    out = np.zeros(len(t))
    for k, m in enumerate(notes):
        f = hz(m)
        idx = 1.6 * np.exp(-t * 5)
        tone = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
        tine = sine(f * 7.1, t) * np.exp(-t * 40) * 0.25
        trem = 1 + 0.12 * np.sin(2 * np.pi * 4.5 * t + k)
        out += (tone + tine) * trem
    env = np.clip(t / 0.004, 0, 1) * np.exp(-t * 0.9) * np.clip((length - t) / 0.3, 0, 1)
    return filt(out * env, 3500) * g


def sub(n, length, g=0.2):
    t = tt(length)
    return (sine(hz(n), t) + 0.15 * sine(hz(n) * 2, t)) * np.clip(t / 0.01, 0, 1) * np.clip((length - t) / 0.08, 0, 1) * g


def kick(g=0.3):
    t = tt(0.3)
    f = 45 + 80 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 10) * g


def snare(g=0.1):
    t = tt(0.25)
    x = filt(rng.standard_normal(len(t)), [1200, 7000], "band") * np.exp(-t * 16) + sine(190, t) * np.exp(-t * 25) * 0.5
    return x * g


def snap(g=0.07):
    t = tt(0.08)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 90), [1500, 5000], "band") * g


def hat(g=0.02):
    t = tt(0.05)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 110), 7500, "high") * g


def pop(n, g=0.06):
    """A bouncy bubble pop: a quick upward pitch sweep."""
    t = tt(0.14)
    f = hz(n) * (1 + 0.8 * (1 - np.exp(-t * 60)))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 28) * np.clip(t / 0.002, 0, 1) * g


def key(g=0.03):
    t = tt(0.02)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 300), [2000, 6000], "band") * g


def chime(n, g=0.05, length=0.9):
    t = tt(length)
    return (sine(hz(n), t) + 0.3 * sine(hz(n) * 3, t) * np.exp(-t * 8)) * np.exp(-t * 4) * np.clip(t / 0.003, 0, 1) * g


def whoosh(length=0.3, g=0.03):
    t = tt(length)
    return filt(rng.standard_normal(len(t)), [800, 4000], "band") * np.sin(np.pi * t / length) * g


CH = [[51, 55, 58, 62, 65], [48, 51, 55, 58, 62], [44, 48, 51, 55, 58], [46, 50, 53, 56, 60]]
ROOT = [39, 36, 32, 34]

# Title: one Rhodes chord, a pop per sticker.
add(rhodes([51, 58, 62, 65, 70], 2.4, 0.04), 0.05)
for k, f in enumerate((4, 14, 24)):
    add(pop(72 + k * 4, 0.07), sec(f), 1.0, -0.3 + k * 0.3)
add(pop(67, 0.06), sec(T["first"] - 14))  # the phone springs up

# Groove: one bar per command, then the end card. Swung eighths (2/3 of a beat).
SW = BEAT * 2 / 3
t0 = sec(T["first"])
bar = 0
while t0 < DUR - 0.5:
    ch = bar % 4
    add(rhodes(CH[ch], 4 * BEAT, 0.028), t0 + 0.01, 1.0, -0.15)
    add(rhodes(CH[ch][1:], BEAT * 0.9, 0.018), t0 + BEAT * 2 + SW, 1.0, 0.2)
    add(sub(ROOT[ch], BEAT * 1.4), t0)
    add(sub(ROOT[ch], BEAT * 0.6), t0 + BEAT * 1 + SW)
    add(sub(ROOT[ch] + 7, BEAT * 0.9), t0 + BEAT * 2.5)
    for k in range(4):
        tb = t0 + k * BEAT
        add(hat(), tb, 1.0, 0.3)
        add(hat(0.012), tb + SW, 1.0, -0.3)
    add(kick(), t0)
    add(kick(0.22), t0 + BEAT * 1 + SW)
    add(kick(0.25), t0 + BEAT * 2.5)
    add(snare(), t0 + BEAT)
    add(snare(), t0 + BEAT * 3)
    add(snap(), t0 + BEAT * 3 + SW, 1.0, 0.35)
    t0 += 4 * BEAT
    bar += 1

# Each command: key taps while typing, a pop for the bubble and the card, a tap, a done chime, a whoosh out.
for i, say in enumerate(SAYS):
    s = at(i)
    n = len(say)
    for k in range(0, n, 2):
        add(key(), sec(s + STEP["type"] + (STEP["typeEnd"] - STEP["type"]) * k / n), 1.0, 0.2)
    add(pop(74, 0.06), sec(s + STEP["send"]), 1.0, 0.25)
    add(pop(79, 0.06), sec(s + STEP["card"]), 1.0, -0.2)
    add(key(0.08), sec(s + STEP["tap"]))
    add(chime(82, 0.05), sec(s + STEP["done"]), 1.0, 0.1)
    add(chime(87, 0.04), sec(s + STEP["done"]) + 0.09, 1.0, 0.2)
    add(whoosh(), sec(s + STEP["out"]))

# End card: three pops and an open Ebmaj9 on the Rhodes.
for k, f in enumerate((4, 16, 28)):
    add(pop(76 + k * 3, 0.07), sec(T["end"] + f), 1.0, -0.3 + k * 0.3)
add(rhodes([39, 51, 58, 62, 65, 70], DUR - sec(T["end"]), 0.04), sec(T["end"]) + 0.02)

out = np.stack([L, R], axis=1)
ts = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - ts) / 1.2, 0, 1) * np.clip(ts / 0.03, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.3)
out /= np.max(np.abs(out)) / 0.88
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "talk.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
