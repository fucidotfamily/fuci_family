"""
15-second track for "Know Your Agent" (src/scenes/Kya.tsx): minimal checkpoint tech at 110 BPM in D minor.
A sub drone and soft ticking hats, a filtered-noise scanner sweep for each scan, a tick per check
(bright for a pass, muted for a fail), a bell chime and coin clink for the approved agent, a soft low
"bwomp" and a lock click for the anonymous one, quick rising blips while the crowd is graded, and a
D major chord under the end card. Everything is synthesized here, so nothing needs a license.

    python3 scripts/kya.py      # writes public/kya.wav
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
rng = np.random.default_rng(8004)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Kept in step with T, SCAN_LEN and CHECK_AT in src/scenes/Kya.tsx.
T = dict(in1=0, scan1=40, stamp1=86, pay1=98, out1=124, in2=146, scan2=180, stamp2=226, lock2=236, out2=262, grid=292, gridStep=2, end=366, dur=450)
SCAN_LEN = 38
CHECK_AT = lambda scan, i: scan + 8 + i * 8
BPM = 110
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


def drone(length, g=0.12):
    t = tt(length)
    x = sine(hz(26), t) + 0.5 * sine(hz(38), t) + 0.25 * sine(hz(45) * 1.002, t)
    wob = 0.75 + 0.25 * np.sin(2 * np.pi * 0.25 * t)
    env = np.clip(t / 1.5, 0, 1) * np.clip((length - t) / 0.6, 0, 1)
    return x * wob * env * g


def hat(g=0.035, open_=False):
    t = tt(0.12 if open_ else 0.04)
    return filt(rng.standard_normal(len(t)) * np.exp(-t * (30 if open_ else 110)), 7000, "high") * g


def kick(g=0.4):
    t = tt(0.35)
    f = 40 + 90 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * g


def sweep(length, g=0.09):
    """Scanner: band-passed noise whose centre rises, in short windows so it sounds like a moving beam."""
    t = tt(length)
    noise = rng.standard_normal(len(t))
    out = np.zeros(len(t))
    steps = 24
    seg = len(t) // steps
    for s in range(steps):
        f = 500 * (6 ** (s / steps))
        chunk = filt(noise[s * seg : (s + 1) * seg + 400], [f * 0.8, f * 1.25], "band")[:seg]
        out[s * seg : s * seg + len(chunk)] += chunk
    env = np.sin(np.pi * np.clip(t / length, 0, 1)) ** 0.7
    tone = 0.25 * sine(hz(74) + 200 * t / length, t)
    return (out + tone) * env * g


def tick(n, g=0.08):
    t = tt(0.18)
    return (sine(hz(n), t) + 0.25 * sine(2 * hz(n), t)) * np.exp(-t * 22) * g


def bell(n, length=1.6, g=0.08):
    t = tt(length)
    x = sine(hz(n), t) + 0.45 * sine(hz(n) * 2.76, t) * np.exp(-t * 3) + 0.25 * sine(hz(n) * 5.4, t) * np.exp(-t * 6)
    return x * np.exp(-t * 2.4) * np.clip(t / 0.003, 0, 1) * g


def clink(g=0.07):
    t = tt(0.5)
    return (sine(2350, t) + 0.6 * sine(3140, t) + 0.3 * sine(4700, t)) * np.exp(-t * 9) * g


def bwomp(g=0.12):
    """Soft denial: two low filtered squares a semitone apart, gliding down (no harsh buzz)."""
    t = tt(0.7)
    f = hz(38) * (1 - 0.08 * t)
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) + np.sign(np.sin(2 * np.pi * np.cumsum(f * 1.059) / SR))
    return filt(x, 500) * np.exp(-t * 3.2) * np.clip(t / 0.01, 0, 1) * g


def lockclick(g=0.08):
    t = tt(0.08)
    a = filt(rng.standard_normal(len(t)) * np.exp(-t * 180), [1500, 5000], "band")
    return a * g


def pad(notes, length, g=0.04):
    t = tt(length)
    x = sum(sine(hz(m) * (1 + d), t) + 0.3 * sine(2 * hz(m) * (1 + d), t) for m in notes for d in (-0.003, 0.003))
    env = np.clip(t / 0.6, 0, 1) * np.clip((length - t) / 1.0, 0, 1)
    return filt(x * env, 3000) * g


# Bed: drone through the checkpoint scenes, hats and a soft kick from the first scan to the crowd.
add(drone(sec(T["end"]) + 0.4), 0)
t = sec(T["scan1"]) - BEAT
k = 0
while t < sec(T["end"]):
    if k % 4 == 0:
        add(kick(), t)
    add(hat(open_=(k % 4 == 2)), t + BEAT / 2, 1.0, 0.25)
    add(hat(0.02), t + BEAT / 4, 1.0, -0.25)
    add(hat(0.02), t + 3 * BEAT / 4, 1.0, -0.25)
    t += BEAT
    k += 1

# Footsteps as agents walk in (light low taps).
for start in (T["in1"], T["in2"]):
    for s in range(4):
        add(tick(40, 0.06), sec(start) + s * 0.16, 1.0, -0.4)

# Scans.
for scan in (T["scan1"], T["scan2"]):
    add(sweep(sec(SCAN_LEN)), sec(scan), 1.0, 0.0)

# Checks: passes climb D minor pentatonic brightly; fails are low and muted.
for i, n in enumerate([74, 77, 79, 81]):
    add(tick(n), sec(CHECK_AT(T["scan1"], i)), 1.0, 0.3)
for i, ok in enumerate([False, None, False, None]):
    add(tick(50 if ok is False else 57, 0.07 if ok is False else 0.04), sec(CHECK_AT(T["scan2"], i)), 1.0, 0.3)

# Approved: stamp thump, bell arpeggio (D F# A D), coin clink as it lands.
add(kick(0.3), sec(T["stamp1"]))
for i, n in enumerate([74, 78, 81, 86]):
    add(bell(n), sec(T["stamp1"]) + i * 0.07, 1.0, -0.2 + 0.13 * i)
add(clink(), sec(T["pay1"] + 16))

# Denied: stamp thump, soft bwomp, lock click.
add(kick(0.3), sec(T["stamp2"]))
add(bwomp(), sec(T["stamp2"]) + 0.02)
add(lockclick(), sec(T["lock2"] + 6))

# Crowd: a quick blip per stamped agent, rising.
SCALE = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84]
for i in range(24):
    add(tick(SCALE[i % len(SCALE)] + 12 * (i // 10), 0.05), sec(T["grid"] + 10 + i * T["gridStep"]), 1.0, -0.5 + (i % 8) / 7)

# End card: D major 9, the logo scan, and a final bell when its A lands.
add(pad([50, 57, 62, 66, 69, 76], DUR - sec(T["end"]) + 0.2, 0.05), sec(T["end"]))
add(sweep(sec(36), 0.05), sec(T["end"] + 4))
add(bell(86, 2.2, 0.08), sec(T["end"] + 40))
add(bell(81, 2.2, 0.05), sec(T["end"] + 40) + 0.05)

out = np.stack([L, R], axis=1)
ts = np.arange(N) / SR
fade = np.clip((DUR - 0.1 - ts) / 1.4, 0, 1) * np.clip(ts / 0.05, 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.3)
out /= np.max(np.abs(out)) / 0.88
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "kya.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
