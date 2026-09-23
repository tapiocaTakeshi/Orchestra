"""Synthesizes the promo soundtrack (promo/music.wav) so the video needs no licensed audio.

    pip install numpy
    python3 promo/music.py

Cinematic pad + plucked arpeggio + hits synced to the scene timeline in promo.html.
"""
import os
import wave

import numpy as np

SR = 44100
DUR = 50.0
BPM = 100
BEAT = 60 / BPM
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(3)

# Scene boundaries (keep in sync with T in promo.html)
LOGO_HIT = 5.3
SCENE_HITS = [11.0, 17.2, 29.4, 38.4]
FINAL_HIT = 44.6


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env_ar(n, a, r):
    """Attack/release envelope of n samples (seconds for a, r)."""
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[n - nr:] *= np.linspace(1, 0, nr)
    return e


def saw(f, tt, harmonics=10, detune=0.0):
    out = np.zeros_like(tt)
    for k in range(1, harmonics + 1):
        out += np.sin(2 * np.pi * f * (1 + detune) * k * tt) / k ** 1.4
    return out


def place(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(sig), 0] += sig * gain * l
    buf[i:i + len(sig), 1] += sig * gain * r


def smooth(x, a, b):
    return np.clip((x - a) / (b - a), 0, 1)


mix = np.zeros((N, 2))

# --- chord progression: Am - F - C - G (i - VI - III - VII), 4 beats each
PROG = [[57, 60, 64, 69], [53, 57, 60, 65], [55, 60, 64, 67], [55, 59, 62, 67]]
BAR = 4 * BEAT

# master dynamics curve for the pad
dyn = (0.35 + 0.25 * smooth(t, 4.5, 5.5) + 0.2 * smooth(t, 17, 18) + 0.2 * smooth(t, 38, 39))
dyn *= 1 - smooth(t, 43.6, 44.5) * 0.7  # breath before the final hit

bar = 0
while bar * BAR < FINAL_HIT - 0.01:
    start = bar * BAR
    length = min(BAR, FINAL_HIT - start) + 0.6
    n = int(length * SR)
    tt = np.arange(n) / SR
    chord = PROG[bar % 4]
    sig = np.zeros(n)
    for j, note in enumerate(chord):
        f = midi(note)
        sig += saw(f, tt, 8, 0.0025) + saw(f, tt, 8, -0.0025)
    sig += 0.9 * np.sin(2 * np.pi * midi(chord[0] - 12) * tt)  # bass
    sig *= env_ar(n, 0.5, 0.6) * 0.035
    i = int(start * SR)
    sig = sig[: N - i] * dyn[i:i + n]
    place(mix, start, sig, pan=-0.15)
    place(mix, start + 0.012, sig * 0.7, pan=0.3)
    bar += 1

# --- final chord: A minor add9, long tail
n = int((DUR - FINAL_HIT) * SR)
tt = np.arange(n) / SR
sig = np.zeros(n)
for note in [45, 57, 64, 69, 71, 72, 76]:
    sig += saw(midi(note), tt, 8, 0.003) + saw(midi(note), tt, 8, -0.003)
sig *= np.exp(-tt / 3.2) * env_ar(n, 0.02, 1.5) * 0.04
place(mix, FINAL_HIT, sig)

# --- plucked arpeggio (16ths) from the chaos scene through the stats scene
ARP_START, ARP_END = 11.0, 44.2
step = BEAT / 4
k = int(np.ceil(ARP_START / step))
pattern = [0, 2, 1, 3, 2, 1, 3, 2]
while k * step < ARP_END:
    st = k * step
    chord = PROG[int(st // BAR) % 4]
    note = chord[pattern[k % 8]] + 12 + (12 if (k // 8) % 4 == 3 and k % 2 else 0)
    nn = int(0.45 * SR)
    tt = np.arange(nn) / SR
    f = midi(note)
    pl = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt) + 0.12 * np.sin(6 * np.pi * f * tt))
    pl *= np.exp(-tt / 0.11) * env_ar(nn, 0.003, 0.05)
    vel = 0.55 + 0.45 * (k % 4 == 0)
    level = 0.05 * (0.5 + 0.5 * smooth(st, 17, 18)) * (1 - 0.6 * smooth(st, 43, 44))
    place(mix, st, pl * vel * level, pan=0.45 * np.sin(k * 0.7))
    k += 1

# --- soft pulse (kick) on beats during the orchestration & feature scenes
b = int(np.ceil(17.2 / BEAT))
while b * BEAT < 44.0:
    st = b * BEAT
    nn = int(0.35 * SR)
    tt = np.arange(nn) / SR
    f = 50 + 70 * np.exp(-tt / 0.03)
    kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.12)
    place(mix, st, kick * 0.22 * (0.6 if b % 2 else 1.0))
    b += 1


# --- hits and risers
def boom(dur=3.0, gain=0.5):
    nn = int(dur * SR)
    tt = np.arange(nn) / SR
    f = 38 + 60 * np.exp(-tt / 0.08)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.9)
    noise = rng.standard_normal(nn) * np.exp(-tt / 0.05) * 0.3
    return (body + noise) * gain


def riser(dur, gain=0.12):
    nn = int(dur * SR)
    tt = np.arange(nn) / SR
    x = rng.standard_normal(nn)
    # crude rising band: difference of two moving averages whose width shrinks over time
    c = np.cumsum(x)
    out = np.zeros(nn)
    for i0 in range(0, nn, 512):
        w = int(40 - 36 * i0 / nn)
        a = c[i0:i0 + 512]
        bshift = c[max(0, i0 - w):max(0, i0 - w) + len(a)]
        if len(bshift) == len(a):
            out[i0:i0 + len(a)] = (a - bshift) / w
    return out * (tt / dur) ** 2 * gain


def whoosh(dur=1.2, gain=0.08):
    nn = int(dur * SR)
    tt = np.arange(nn) / SR
    x = rng.standard_normal(nn)
    x = np.convolve(x, np.ones(12) / 12, mode='same')
    e = np.sin(np.pi * tt / dur) ** 2
    return x * e * gain


place(mix, LOGO_HIT - 1.8, riser(1.8, 0.25))
place(mix, LOGO_HIT, boom(3.5, 0.55))
for s in SCENE_HITS:
    place(mix, s - 0.6, whoosh(1.2, 0.35), pan=-0.3)
place(mix, FINAL_HIT - 2.0, riser(2.0, 0.3))
place(mix, FINAL_HIT, boom(4.0, 0.7))

# --- shimmer on the logo reveal (high sine cluster)
for base_t, g in [(LOGO_HIT, 0.018), (FINAL_HIT, 0.022)]:
    nn = int(4 * SR)
    tt = np.arange(nn) / SR
    sh = sum(np.sin(2 * np.pi * midi(n) * tt + ph) for n, ph in [(81, 0), (88, 1), (93, 2), (96, 3)])
    sh *= np.exp(-tt / 1.4) * env_ar(nn, 0.05, 0.5) * g
    place(mix, base_t, sh, pan=0.2)


# --- reverb: FFT convolution with a decaying stereo noise impulse
def reverb(x, secs=2.6, wet=0.28):
    nn = int(secs * SR)
    tt = np.arange(nn) / SR
    out = np.zeros_like(x)
    L = len(x) + nn
    nfft = 1 << (L - 1).bit_length()
    for ch in range(2):
        ir = rng.standard_normal(nn) * np.exp(-tt / (secs / 5))
        ir = np.convolve(ir, np.ones(6) / 6, mode='same')
        ir /= np.sqrt(np.sum(ir ** 2))
        y = np.fft.irfft(np.fft.rfft(x[:, ch], nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]
        out[:, ch] = x[:, ch] + wet * y
    return out


mix = reverb(mix)
# fade in/out and normalize
mix *= smooth(t, 0, 0.3)[:, None] * (1 - smooth(t, DUR - 1.2, DUR))[:, None]
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix /= np.max(np.abs(mix)) / 0.89

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'music.wav')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
