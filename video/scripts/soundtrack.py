"""
Original soundtrack for the Fuci launch video: a 120 BPM electronic track (A minor, Am-F-C-G)
plus UI sound effects timed to the animation. Everything is synthesized here, so there is
nothing to license. Frame numbers match src/Root.tsx and the scenes (30 fps).

    pip install numpy scipy
    python3 scripts/soundtrack.py        # writes public/soundtrack.wav
"""
import math
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
FPS = 30
TOTAL_FRAMES = 1430
DUR = TOTAL_FRAMES / FPS + 0.5
N = int(DUR * SR)
rng = np.random.default_rng(7)

# Scene starts (frames), from src/Root.tsx: durations minus the 10-frame cross-fade.
INTRO, HOOK, SPAWN, ASK, AUTO, NET, STACK, CTA = 0, 95, 220, 450, 695, 955, 1140, 1265
sec = lambda f: f / FPS

BEAT = 0.5  # 120 BPM
T0 = sec(HOOK) - 6 * BEAT  # put a downbeat exactly on the hook's first frame
BAR = 4 * BEAT

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


# ---------- the track ----------
CHORDS = [  # Am, F, C, G: pad notes, bass root
    ([57, 60, 64], 45),
    ([53, 57, 60], 41),
    ([60, 64, 67], 48),
    ([55, 59, 62], 43),
]

end_t = sec(TOTAL_FRAMES)
drums_on = lambda t: sec(HOOK) - 0.01 <= t < sec(STACK) or sec(CTA) - 0.01 <= t < end_t - 1.6
light = lambda t: sec(SPAWN) <= t < sec(NET)  # a bit sparser under the UI demos

# Pads and bass over every bar (bar grid starts before 0 so the intro has a pad).
bar_i = -2
while T0 + bar_i * BAR < end_t:
    bt = T0 + bar_i * BAR
    notes, root = CHORDS[bar_i % 4]
    if bt + BAR > 0:
        g = 0.55 if bt < sec(HOOK) else 1.0
        add(pad(notes, BAR + 0.3), bt, g * 0.9, -0.2)
        add(pad([m + 12 for m in notes], BAR + 0.3), bt, g * 0.35, 0.3)
    for k in range(8):  # eighth-note bass, with the octave on the offbeats
        t = bt + k * BEAT / 2
        if drums_on(t) or (sec(STACK) <= t < sec(CTA) and k % 4 == 0):
            add(bass(root + (12 if k % 2 else 0), BEAT / 2 - 0.02), t, 0.9)
    for k in range(16):  # sixteenth-note arp
        t = bt + k * BEAT / 4
        if t < sec(HOOK) - 0.01 or t >= end_t - 1.6:
            continue
        if light(t) and k % 2:
            continue
        tones = notes + [notes[0] + 12, notes[1] + 12]
        note = tones[[0, 2, 1, 3, 4, 2, 3, 1][k % 8]] + 12
        p = 0.5 if k % 2 else -0.5
        add(pluck(note), t, 0.55, p)
        add(pluck(note), t + 0.375, 0.18, -p)  # dotted-eighth echo
    bar_i += 1

# Drums, with the kick ducking everything else (sidechain pump).
duck = np.ones(N)
beat_i = 0
while T0 + beat_i * BEAT < end_t:
    t = T0 + beat_i * BEAT
    if t >= 0 and drums_on(t):
        add(kick(), t, 0.95)
        i = int(t * SR)
        m = min(N - i, int(0.3 * SR))
        duck[i : i + m] = np.minimum(duck[i : i + m], 0.45 + 0.55 * (np.arange(m) / m) ** 0.6)
        if beat_i % 2 == 1 and not light(t):
            add(clap(), t, 0.8)
        if beat_i % 2 == 1 and light(t):
            add(clap(), t, 0.45)
        add(hat(), t + BEAT / 2, 0.8, 0.3)
        if not light(t):
            add(hat(), t + BEAT / 4, 0.35, -0.3)
            add(hat(), t + 3 * BEAT / 4, 0.35, -0.3)
        if beat_i % 8 == 7:
            add(hat(True), t + BEAT / 2, 0.5, 0.2)
    beat_i += 1
L *= duck
R *= duck

# ---------- intro, transitions, build-ups ----------
add(riser(sec(HOOK) - 0.2), 0.2, 0.9)
add(impact(), sec(4), 0.5)  # the frond finishes drawing
add(impact(), sec(HOOK), 0.8)  # the drop
for f in (SPAWN, ASK, AUTO, NET, STACK):
    add(whoosh(0.7), sec(f) - 0.45, 0.8)
add(riser(sec(CTA) - sec(STACK) - 0.2), sec(STACK) + 0.2, 1.1)
for k in range(8):  # snare roll into the CTA
    add(clap(), sec(CTA) - 1.0 + k * 0.125, 0.25 + k * 0.06)
add(impact(), sec(CTA), 1.0)
last = end_t - 1.6
add(pad([57, 60, 64, 69], 2.2), last, 0.9)  # final Am
add(impact(), last, 0.5)

# ---------- UI sound effects ----------
def typing(start, text_len, cps):
    for k in range(1, text_len + 1):
        f = start + math.ceil(k * FPS / cps)
        add(click(0.35, 3000 + rng.random() * 2500), sec(f), 1.0, rng.uniform(-0.3, 0.3))


# 01 Spawn (see src/scenes/Spawn.tsx)
typing(SPAWN + 28, 5, 10)
typing(SPAWN + 51, 51, 34)
add(click(0.9, 1500), sec(SPAWN + 106), 1.0)
add(blip(76, 0.2, 0.3), sec(SPAWN + 106), 1.0)
for k, note in enumerate([79, 83, 86, 91]):
    add(blip(note, 0.25, 0.28), sec(SPAWN + 128 + k * 12), 1.0, -0.3 + k * 0.2)

# 02 Ask (see src/scenes/Ask.tsx)
typing(ASK + 24, 31, 26)
asked = ASK + 68
for k in range(6):
    note = 70 if k == 1 else 84 if k >= 3 else 79
    add(blip(note, 0.12, 0.25), sec(asked + k * 14), 1.0, 0.2)
    if k >= 3:
        add(blip(note + 7, 0.18, 0.18), sec(asked + k * 14) + 0.05, 1.0, -0.2)
for k, note in enumerate([88, 91, 95]):
    add(blip(note, 0.4, 0.15), sec(asked + 90) + k * 0.06, 1.0, 0.3 - k * 0.3)

# 03 Autopilot (see src/scenes/Autopilot.tsx)
for k in range(6):
    add(click(0.7, 2000), sec(AUTO + 30 + k * 16), 1.0)
    add(blip(72 + [0, 2, 4, 7, 9, 12][k], 0.14, 0.22), sec(AUTO + 30 + k * 16), 1.0)
for k, note in enumerate([69, 76, 81, 84]):  # "Autopilot on"
    add(blip(note, 0.6, 0.2), sec(AUTO + 150) + k * 0.04, 1.0)

# 04 Network (see src/scenes/Network.tsx)
for k in range(6):
    add(blip(84 + [0, 3, 7, 10, 12, 15][k], 0.1, 0.22), sec(NET + 34 + k * 8), 1.0, -0.6 + k * 0.24)

# Stack chips pop in (see src/scenes/Outro.tsx)
for k in range(8):
    add(click(0.5, 2500), sec(STACK + 12 + k * 4), 1.0, -0.5 + k * 0.14)

# ---------- master ----------
out = np.stack([L, R], axis=1)
fade_in = np.clip(np.arange(N) / (0.05 * SR), 0, 1)
fade_out = np.clip((DUR - 0.2 - np.arange(N) / SR) / 1.2, 0, 1)
out *= (fade_in * fade_out)[:, None]
out = np.tanh(out * 1.1)
out /= np.max(np.abs(out)) / 0.89  # about -1 dBFS
pcm = (out * 32767).astype("<i2")

path = Path(__file__).resolve().parent.parent / "public" / "soundtrack.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
