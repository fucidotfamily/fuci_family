"""
48-second track for the Fuci Risk tutorial (src/scenes/Tutorial.tsx): calm and unhurried, so the
screens can be read. A warm pad on a slow four-chord loop, a soft felt-piano melody, a gentle chime at
each step, key ticks while the URL and the search are typed, quiet mouse clicks, and a closing chord.
Everything is synthesized here, so nothing needs a license.

    python3 scripts/tutorial.py      # writes public/tutorial.wav
"""
import math
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
FPS = 30
DUR = 48.2
N = int(DUR * SR)
rng = np.random.default_rng(48)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Kept in step with T and CUES in src/scenes/Tutorial.tsx.
T = dict(intro=0, open=180, search=360, grade=570, why=870, token=1110, outro=1320, end=1440)
CUES = dict(typeStart=410, typeEnd=470, pick=540, openDetails=1050)
URL_TYPE = (T["open"] + 5, T["open"] + 35, 16)  # "fuci.family/risk"
SEARCH_TYPE = (CUES["typeStart"], CUES["typeEnd"], 6)  # "morpho"
CLICKS = [T["search"] + 45, CUES["pick"], CUES["openDetails"]]
BPM = 72
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


def pad(notes, length, gain=0.05):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for m in notes:
        for d in (-0.08, 0.0, 0.08):
            x += np.sin(2 * np.pi * hz(m + d) * t + rng.random() * 6.28)
    att = np.clip(t / 1.2, 0, 1)
    rel = np.clip((length - t) / 1.2, 0, 1)
    return filt(x * att * rel, 1400) * gain


def piano(note, length=2.0, gain=0.09):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t * 4) + 0.12 * np.sin(6 * np.pi * f * t) * np.exp(-t * 7)
    env = np.exp(-t * 1.6) * np.clip(t / 0.006, 0, 1)
    return filt(x * env, 2600) * gain


def bass(note, length, gain=0.12):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * hz(note) * t)
    env = np.clip(t / 0.05, 0, 1) * np.clip((length - t) / 0.4, 0, 1)
    return x * env * gain


def chime(note, gain=0.08):
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    f = hz(note)
    x = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 3) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 6)
    return x * np.exp(-t * 1.3) * gain


def tick(gain=0.05):
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n) * np.exp(-t * 260)
    return filt(x, [2500, 7000], "band") * gain


def click(gain=0.09):
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n) * np.exp(-t * 200) * 0.6 + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 120)
    return filt(x, [900, 6000], "band") * gain


# Pad and bass: Fmaj7 → Am7 → Dm9 → Bbmaj7, one bar (4 beats) each, from the start to the outro.
CHORDS = [(41, [57, 60, 64, 65]), (45, [55, 60, 64, 67]), (38, [57, 60, 64, 65]), (46, [57, 62, 65, 69])]
BAR = 4 * BEAT
bar, t = 0, 0.0
while t < sec(T["outro"]):
    root, ch = CHORDS[bar % 4]
    add(pad(ch, BAR + 1.2), t, 1.0, -0.1 if bar % 2 else 0.1)
    if t >= sec(T["open"]) - 0.5:
        add(bass(root, BAR * 0.95), t)
    t += BAR
    bar += 1

# A sparse felt-piano line once the tour starts: one note per beat on beats 1 and 3, sometimes a pickup.
MEL = [72, 69, 67, 64, 69, 72, 76, 74, 74, 72, 69, 65, 69, 67, 65, 64]
t, k = sec(T["open"]), 0
while t < sec(T["outro"]) - 1:
    add(piano(MEL[k % len(MEL)], 2.2, 0.06), t, 1.0, 0.2)
    if k % 4 == 3:
        add(piano(MEL[(k + 1) % len(MEL)] - 5, 1.2, 0.035), t + BEAT, 1.0, 0.25)
    t += 2 * BEAT
    k += 1

# A chime at every step (01–05), rising.
for f, note in zip([T["open"], T["search"], T["grade"], T["why"], T["token"]], [84, 86, 88, 89, 91]):
    add(chime(note), sec(f), 1.0, -0.2)

# Key ticks while typing, soft clicks where the cursor clicks.
for a, b, n in (URL_TYPE, SEARCH_TYPE):
    for i in range(n):
        add(tick(), sec(a + (b - a) * (i + 0.5) / n) + rng.random() * 0.02, 1.0, 0.3)
for f in CLICKS:
    add(click(), sec(f), 1.0, 0.1)

# Outro: a warm Fmaj9 that rings out, with a low F under it.
add(pad([53, 57, 60, 64, 67], DUR - sec(T["outro"]), 0.07), sec(T["outro"]))
add(bass(29, DUR - sec(T["outro"]) - 0.3, 0.14), sec(T["outro"]))
for i, m in enumerate([65, 69, 72, 76, 79]):
    add(piano(m, 4.0, 0.06), sec(T["outro"]) + i * 0.18, 1.0, -0.3 + i * 0.15)

out = np.stack([L, R], axis=1)
tt = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - tt) / 2.5, 0, 1) * np.clip(tt / 1.5, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.2)
out /= np.max(np.abs(out)) / 0.85
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "tutorial.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
