"""
15-second track for the "$FUCI listed on DexScreener" clip (src/scenes/Dex.tsx).
The lore half is ambient and underwater: a deep drone, a slow heartbeat sub, whale-like glides,
bubble plops and a chime on each lore line. At the surface flash it swells into a boom and a bright
bell chord, then a steady pulse and a rising arpeggio carry the DexScreener card.
Everything is synthesized here, so nothing needs a license.

    python3 scripts/lore.py         # writes public/lore.wav
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
rng = np.random.default_rng(7)
sec = lambda f: f / FPS
L = np.zeros(N)
R = np.zeros(N)

# Frame timings, kept in step with T in src/scenes/Dex.tsx.
LINES, FLASH, CANDLES, STAMP, OUTRO = [10, 70, 130, 190, 250], 298, 322, 384, 405


def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    sig = sig[: N - i]
    L[i : i + len(sig)] += sig * gain * math.sqrt(0.5 * (1 - pan))
    R[i : i + len(sig)] += sig * gain * math.sqrt(0.5 * (1 + pan))


def echo(sig, t, gain=1.0, pan=0.0, taps=4, delay=0.23, fb=0.45):
    """Cheap space: ping-ponged, darkening repeats."""
    add(sig, t, gain, pan)
    for k in range(1, taps + 1):
        sig = filt(sig, 3500)
        add(sig, t + k * delay, gain * fb**k, -pan if k % 2 else pan)


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


def hz(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def sine(f, n, sweep=None, rate=30):
    t = np.arange(n) / SR
    if sweep is None:
        return np.sin(2 * np.pi * f * t)
    freq = f + (sweep - f) * np.exp(-t * rate)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR)


def glide(freqs, n):
    """A sine whose pitch moves smoothly through `freqs`, with a slow vibrato."""
    t = np.arange(n) / SR
    f = np.interp(np.linspace(0, len(freqs) - 1, n), np.arange(len(freqs)), freqs)
    f = f * (1 + 0.012 * np.sin(2 * np.pi * 5 * t))
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune) if detune else (0,):
        out += 2 * ((t * f * (1 + d)) % 1.0) - 1
    return out / (3 if detune else 1)


def swept(x, lo, hi, chunks=40):
    n = len(x)
    out = np.zeros(n)
    for c in range(chunks):
        a, b = c * n // chunks, (c + 1) * n // chunks
        out[a:b] = filt(x[a:b], lo + (hi - lo) * math.sin(math.pi * c / chunks) ** 2)
    return out


# ---------- instruments ----------
def drone(notes, length):
    n = int(length * SR)
    x = sum(saw(hz(m), n, detune=0.005) for m in notes) / len(notes)
    return swept(x, 180, 900) * env(n, 2.0, 5, s=0.9, r=1.2, hold=length - 1.2) * 0.35


def thump():
    n = int(0.35 * SR)
    return sine(42, n, sweep=70, rate=18) * env(n, 0.004, 0.16) * 0.7


def bubble():
    n = int(0.05 * SR)
    f0 = 350 + rng.random() * 500
    t = np.arange(n) / SR
    f = f0 * (1 + 3 * t / t[-1])
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.02) * 0.18


def bell(note, length=2.5, gain=0.2):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note)
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in [(1, 1, 1.4), (2.0, 0.4, 2.5), (3.01, 0.2, 4), (4.2, 0.1, 6)])
    return x * env(n, 0.002, 6) * gain


def riser(length):
    n = int(length * SR)
    t = np.arange(n) / n
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    for c in range(30):
        a, b = c * n // 30, (c + 1) * n // 30
        out[a:b] = filt(noise[a:b], 300 + 7000 * (c / 30) ** 2)
    tone = np.sin(2 * np.pi * np.cumsum(110 + 330 * t**2) / SR)
    return (out * 0.5 + tone * 0.25) * t**2.5 * 0.6


def boom():
    n = int(2.2 * SR)
    body = np.tanh(2.5 * sine(36, n, sweep=110, rate=10) * env(n, 0.002, 0.9))
    hit = filt(rng.standard_normal(n), 1500) * env(n, 0.001, 0.12)
    return body * 0.9 + hit * 0.4


def kick():
    n = int(0.35 * SR)
    return np.tanh(2 * sine(50, n, sweep=150) * env(n, 0.001, 0.15)) * 0.8


def shaker():
    n = int(0.07 * SR)
    return filt(rng.standard_normal(n), 6000, "high") * env(n, 0.008, 0.025) * 0.2


def pluck(note, length=0.25, gain=0.18):
    n = int(length * SR)
    return filt(saw(hz(note), n, detune=0.004), 2800) * env(n, 0.002, 0.1) * gain


def pad(notes, length, gain=0.3):
    n = int(length * SR)
    x = sum(saw(hz(m), n, detune=0.006) for m in notes) / len(notes)
    return filt(x, 1600) * env(n, 0.3, 1.0, s=0.8, r=0.8, hold=length - 0.8) * gain


# ---------- the deep (0 → flash) ----------
t_flash = sec(FLASH)
add(drone([38, 45, 50, 53], t_flash + 0.6), 0.0, 1.0)  # D minor, low and wide
add(drone([57, 62], t_flash - 3.5), 3.5, 0.5, 0.3)  # upper voices join as the forest grows
for k, t in enumerate(np.arange(sec(LINES[1]), t_flash - 0.4, 1.4)):  # heartbeat
    add(thump(), t, 0.8 + 0.2 * k / 6)
    add(thump(), t + 0.24, 0.5)
for t0, path in [(1.0, [260, 330, 240, 280]), (5.2, [300, 220, 310, 260])]:  # whale song
    n = int(2.6 * SR)
    w = filt(glide(path, n), 1200) * env(n, 0.5, 3, s=0.7, r=0.6, hold=2.0) * 0.12
    echo(w, t0, 1.0, -0.4 if t0 < 3 else 0.4, taps=3, delay=0.37, fb=0.35)
for t in np.sort(rng.uniform(0.3, t_flash - 0.3, 40)):  # bubbles
    add(bubble(), t, 1.0, rng.uniform(-0.7, 0.7))
for i, note in enumerate([74, 77, 81, 79, 86]):  # a chime on each lore line
    echo(bell(note, 2.2, 0.16), sec(LINES[i]), 1.0, -0.3 + 0.15 * i, taps=4, delay=0.3, fb=0.4)

# ---------- the surface (flash → end) ----------
add(riser(1.6), t_flash - 1.6, 1.0)
add(boom(), t_flash, 1.0)
for m in [62, 66, 69, 74, 78]:  # bright D major bell chord
    echo(bell(m, 3.0, 0.12), t_flash + 0.02, 1.0, rng.uniform(-0.4, 0.4), taps=3, delay=0.25, fb=0.35)

beat = 0.5  # 120 BPM
start = t_flash + 0.5
for b in range(int((DUR - 0.8 - start) / beat)):
    t = start + b * beat
    add(kick(), t, 0.75)
    add(shaker(), t + beat / 2, 1.0, 0.3)
    add(shaker(), t + beat * 0.75, 0.6, -0.3)
    add(filt(saw(hz(38), int(0.4 * SR)), 300) * env(int(0.4 * SR), 0.005, 0.2) * 0.4, t, 1.0)  # bass pulse
arp = [62, 66, 69, 74, 78, 81, 86]
for k in range(int((DUR - 0.8 - start) / (beat / 4))):
    step = k % 8
    note = arp[min(len(arp) - 1, step + k // 16)]  # climbs as it goes
    add(pluck(note, 0.22, 0.12), start + k * beat / 4, 1.0, -0.35 + 0.1 * step)

for i in range(24):  # candle ticks, rising
    add(pluck(74 + (i * 12) // 24, 0.08, 0.08), sec(CANDLES + i * 2.5), 1.0, -0.5 + i / 24)
add(boom(), sec(STAMP), 0.55)
echo(bell(86, 2.0, 0.18), sec(STAMP), 1.0, 0.0, taps=3, delay=0.25, fb=0.35)
add(pad([50, 54, 57, 62, 66], DUR - sec(OUTRO)), sec(OUTRO), 1.0)  # closing D major

out = np.stack([L, R], axis=1)
# Lift the quiet lore half so it carries on phone speakers; the reveal stays the loudest part.
out *= np.interp(np.arange(N) / SR, [0, t_flash - 1.2, t_flash], [1.8, 1.8, 1.0])[:, None]
fade = np.clip((DUR - 0.1 - np.arange(N) / SR) / 0.9, 0, 1) * np.clip(np.arange(N) / (0.05 * SR), 0, 1)
out *= fade[:, None]
out = np.tanh(out * 1.1)
out /= np.max(np.abs(out)) / 0.89
pcm = (out * 32767).astype("<i2")
path = Path(__file__).resolve().parent.parent / "public" / "lore.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {path} ({DUR:.1f}s)")
