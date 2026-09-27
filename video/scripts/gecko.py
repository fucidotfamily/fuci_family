"""
15-second track for "$FUCI is on CoinGecko" (src/scenes/Gecko.tsx): bright disco-house at 120 BPM.
Soft keys while "fuci" is typed (a tick per letter), a select blip on the result, then the drop when the
coin spins in: four-on-the-floor kick, claps, offbeat open hats, an octave-jumping bass and string stabs.
A coin shimmer, a tick per fact row, a rising chime per listing, and a closing chord on the end card.
Everything is synthesized here, so nothing needs a license.

    python3 scripts/gecko.py        # writes public/gecko.wav
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
rng = np.random.default_rng(1402)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Kept in step with T, ROW_AT and CHIP_AT in src/scenes/Gecko.tsx.
T = dict(search=0, typeStart=14, pick=78, coin=104, sheet=222, trail=318, end=400, dur=450)
ROWS = [T["sheet"] + 24 + i * 14 for i in range(6)]
CHIPS = [T["trail"] + 10 + i * 10 for i in range(4)]
TYPE = [T["typeStart"] + i * 34 / 4 for i in range(4)]
BPM = 120
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


def kick(g=0.55):
    t = tt(0.32)
    f = 48 + 110 * np.exp(-t * 32)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * g


def clap(g=0.22):
    t = tt(0.22)
    n = rng.standard_normal(len(t))
    env = sum(np.exp(-np.clip(t - d, 0, None) * 60) * (t >= d) for d in (0, 0.011, 0.022)) + 0.6 * np.exp(-t * 18)
    return filt(n * env, [900, 5200], "band") * g


def hat(g=0.07, open_=False):
    t = tt(0.22 if open_ else 0.05)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * (14 if open_ else 90)), 7000, "high") * g


def bass(n, length, g=0.2):
    t = tt(length)
    ph = 2 * np.pi * hz(n) * t
    x = np.sign(np.sin(ph)) * 0.4 + np.sin(ph)
    env = np.clip(t / 0.005, 0, 1) * np.exp(-t * 5)
    return filt(x * env, 900) * g


def stab(notes, length=0.28, g=0.07):
    t = tt(length)
    x = sum(sum(np.sign(np.sin(2 * np.pi * hz(m + d) * t)) for d in (-0.1, 0.1)) for m in notes)
    env = np.clip(t / 0.004, 0, 1) * np.exp(-t * 9)
    return filt(x * env, 2600) * g


def keys(notes, length, g=0.06):
    t = tt(length)
    x = sum(np.sin(2 * np.pi * hz(m) * t) + 0.3 * np.sin(4 * np.pi * hz(m) * t) * np.exp(-t * 3) for m in notes)
    return x * np.exp(-t * 1.4) * np.clip(t / 0.01, 0, 1) * g


def chime(n, g=0.1):
    t = tt(1.4)
    f = hz(n)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 4)
    return x * np.exp(-t * 2.6) * g


def tick(g=0.06):
    t = tt(0.03)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * 260), [2500, 8000], "band") * g


def blip(g=0.12):
    t = tt(0.16)
    f = 880 + 700 * (t / 0.16)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22) * g


def shimmer(g=0.1):
    t = tt(1.6)
    x = sum(np.sin(2 * np.pi * hz(n) * t + k) * np.exp(-t * (2 + k)) for k, n in enumerate([96, 100, 103, 108]))
    swell = np.clip(t / 0.05, 0, 1)
    return x * swell * g


def riser(length, g=0.1):
    t = tt(length)
    n = filt(rng.standard_normal(len(t)), 5000, "high") * (t / length) ** 2
    return n * g


# Intro: soft keys while typing (Fmaj9 → Am7).
add(keys([65, 69, 72, 76], 2.2, 0.05), 0.05, 1.0, -0.2)
add(keys([64, 69, 72, 76], 2.2, 0.05), 2.0, 1.0, 0.2)
for f in TYPE:
    add(tick(), sec(f), 1.0, 0.25)
add(blip(), sec(T["pick"]), 1.0, 0.1)
add(riser(sec(T["coin"]) - sec(T["pick"]), 0.09), sec(T["pick"]))

# Drop at the coin: disco-house groove until the end card.
t0 = sec(T["coin"])
CHORDS = [(41, [65, 69, 72, 76]), (45, [64, 69, 72, 76]), (38, [65, 69, 72, 74]), (43, [67, 71, 74, 77])]
end = sec(T["end"])
b, t = 0, t0
while t < end - 0.01:
    root, ch = CHORDS[(b // 4) % 4]
    add(kick(), t)
    if b % 2 == 1:
        add(clap(), t, 1.0, 0.05)
    add(hat(0.05), t, 1.0, 0.3)
    add(hat(0.06, True), t + BEAT / 2, 1.0, -0.3)
    add(bass(root - 12, BEAT * 0.45), t + BEAT / 2)
    add(bass(root, BEAT * 0.3, 0.14), t + BEAT * 0.75)
    if b % 4 in (0, 2):
        add(stab(ch), t + BEAT * 0.5, 1.0, -0.15 if b % 8 < 4 else 0.15)
    t += BEAT
    b += 1
add(shimmer(0.11), t0)

# Fact rows tick; each listing rings a rising chime, CoinGecko the brightest.
for f in ROWS:
    add(tick(0.07), sec(f), 1.0, -0.2)
for i, f in enumerate(CHIPS):
    add(chime([84, 86, 88, 91][i], 0.09 if i < 3 else 0.14), sec(f), 1.0, 0.2)

# End card: a warm Fmaj9 that rings out.
add(keys([53, 60, 65, 69, 72, 76], DUR - end, 0.07), end)
add(bass(29, 1.6, 0.25), end)
add(shimmer(0.07), end + 0.1)

out = np.stack([L, R], axis=1)
ts = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - ts) / 1.4, 0, 1) * np.clip(ts / 0.05, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.3)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "gecko.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
