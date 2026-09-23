"""Synthesizes the promo soundtrack (promo/music.wav) so the video needs no licensed audio.

    pip install numpy
    python3 promo/music.py

Upbeat 120 BPM pop groove (kick / clap / hats / bass / chord stabs) with whooshes and
impacts placed on the scene cuts of promo.html.
"""
import os
import wave

import numpy as np

SR = 44100
DUR = 28.0
BPM = 120
BEAT = 60 / BPM
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(5)

# Keep in sync with T in promo.html
CUTS = [3.4, 6.0, 8.4, 9.5, 10.7, 16.6, 19.6, 22.4]
LOGO_TILE = 12.85     # 3D tile lands, rays burst
DROP = 14.4           # groove returns after the logo break
FINAL = 24.5          # swoop logo lands
GROOVE = [(3.4, 12.0), (DROP, FINAL)]

mix = np.zeros((N, 2))


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def place(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i < 0 or i >= N:
        return
    sig = sig[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    mix[i:i + len(sig), 0] += sig * gain * l
    mix[i:i + len(sig), 1] += sig * gain * r


def tt(d):
    return np.arange(int(d * SR)) / SR


def lowpass(x, k):
    return np.convolve(x, np.ones(k) / k, mode='same')


def in_groove(s):
    return any(a <= s < b for a, b in GROOVE)


# ---- sounds
def kick():
    x = tt(0.4)
    f = 45 + 110 * np.exp(-x / 0.025)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / 0.16)


def clap():
    x = tt(0.3)
    n = rng.standard_normal(len(x))
    n = n - lowpass(n, 6)
    e = np.exp(-x / 0.07) * (1 + 0.6 * np.exp(-((x - 0.012) / 0.004) ** 2) + 0.4 * np.exp(-((x - 0.024) / 0.004) ** 2))
    return n * e


def hat(open_=False):
    x = tt(0.25 if open_ else 0.06)
    n = rng.standard_normal(len(x))
    n = n - lowpass(n, 3)
    return n * np.exp(-x / (0.08 if open_ else 0.015))


def pluck(note, d=0.35, bright=1.0):
    x = tt(d)
    f = midi(note)
    s = sum(np.sin(2 * np.pi * f * k * x) * (bright ** (k - 1)) / k for k in range(1, 7))
    return s * np.exp(-x / 0.09) * np.minimum(1, x / 0.002)


def bass(note, d):
    x = tt(d)
    f = midi(note)
    s = np.sin(2 * np.pi * f * x) + 0.35 * np.sin(4 * np.pi * f * x) + 0.15 * np.sign(np.sin(2 * np.pi * f * x))
    env = np.minimum(1, x / 0.004) * np.exp(-x / 0.35)
    env[-200:] *= np.linspace(1, 0, 200)
    return s * env


def pad(notes, d, detune=0.004):
    x = tt(d)
    s = np.zeros(len(x))
    for n in notes:
        for dt in (-detune, 0, detune):
            f = midi(n) * (1 + dt)
            s += sum(np.sin(2 * np.pi * f * k * x) / k ** 1.6 for k in range(1, 6))
    a = np.minimum(1, x / 0.25) * np.minimum(1, (d - x) / 0.4)
    return s * a


def whoosh(d=0.6, up=True):
    x = tt(d)
    n = rng.standard_normal(len(x))
    n = n - lowpass(n, 4)
    e = (x / d) ** 3 if up else np.exp(-x / (d / 4))
    return n * e * (np.minimum(1, (d - x) / 0.02) if up else 1)


def impact(d=2.5):
    x = tt(d)
    f = 35 + 90 * np.exp(-x / 0.06)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / 0.7)
    n = rng.standard_normal(len(x)) * np.exp(-x / 0.12)
    return body + 0.4 * lowpass(n, 3)


def shimmer(d=2.5):
    x = tt(d)
    s = sum(np.sin(2 * np.pi * midi(n) * x + i) for i, n in enumerate([84, 88, 91, 96, 100]))
    return s * np.exp(-x / 0.8) * np.minimum(1, x / 0.01)


# ---- harmony: F - G - Em - Am (IV V iii vi), one chord per bar
PROG = [(53, [65, 69, 72, 76]), (55, [67, 71, 74, 79]), (52, [64, 67, 71, 76]), (57, [69, 72, 76, 81])]
BAR = 4 * BEAT

# intro pad + rising filter-ish swell (0 - 3.4)
place(pad([65, 69, 72, 76], 3.6), 0.0, 0.018)
place(whoosh(1.2), 3.4 - 1.2, 0.18)

# groove sections
b = 0
while b * BEAT < DUR:
    s = b * BEAT
    if in_groove(s):
        root, chord = PROG[int(s // BAR) % 4]
        beat_in_bar = b % 4
        place(kick(), s, 0.9)
        if beat_in_bar in (1, 3):
            place(clap(), s, 0.28, pan=0.05)
        # 8th hats, open on the "and" of 4
        place(hat(), s + BEAT / 2 * 0, 0.06, pan=0.3)
        place(hat(open_=beat_in_bar == 3), s + BEAT / 2, 0.1 if beat_in_bar == 3 else 0.08, pan=-0.3)
        # offbeat bass 8ths (pumping)
        place(bass(root - 12, BEAT / 2 - 0.02), s + BEAT / 2, 0.32)
        place(bass(root - 12, BEAT / 4), s, 0.12)
        # syncopated chord stabs
        for off in (0.0, 0.75, 1.5) if beat_in_bar in (0, 2) else ():
            for j, n in enumerate(chord):
                place(pluck(n, 0.3, 0.55), s + off * BEAT, 0.05, pan=(j - 1.5) * 0.25)
        # top arp 16ths during the second groove
        if s >= DROP:
            for k in range(4):
                n = chord[(b * 4 + k) % 4] + 12
                place(pluck(n, 0.18, 0.4), s + k * BEAT / 4, 0.025, pan=0.5 * np.sin(b + k))
    b += 1

# pads under grooves (soft sidechain feel handled by the kick level)
for a, e in GROOVE:
    bar = int(np.ceil(a / BAR - 1e-6))
    while bar * BAR < e - 0.01:
        root, chord = PROG[bar % 4]
        place(pad(chord, min(BAR, e - bar * BAR) + 0.3), bar * BAR, 0.009)
        bar += 1

# logo break (12.0 - 14.4): riser, impact, shimmer, tail pad
place(whoosh(0.85), LOGO_TILE - 0.85, 0.3)
place(impact(2.0), LOGO_TILE, 0.8)
place(shimmer(2.0), LOGO_TILE, 0.02, pan=0.2)
place(pad([57, 64, 69, 72, 76], 1.8), LOGO_TILE, 0.02)
place(whoosh(0.8), DROP - 0.8, 0.28)
place(impact(1.0), DROP, 0.45)

# cut accents
for c in CUTS:
    place(whoosh(0.35), c - 0.35, 0.14, pan=-0.4)
    place(whoosh(0.3, up=False), c, 0.08, pan=0.4)

# click sounds in the UI scenes
for c in [4.68, 20.45, 21.9] + [17.1, 17.7, 18.3, 18.9]:
    x = tt(0.03)
    place(np.sin(2 * np.pi * 2200 * x) * np.exp(-x / 0.004), c, 0.25)

# finale: swoop, impact on logo, bright chord ring-out
place(whoosh(0.6), FINAL - 0.6, 0.3)
place(impact(3.0), FINAL, 0.7)
ring = tt(3.0)
for j, n in enumerate([53, 65, 69, 72, 76, 79, 84]):
    f = midi(n)
    tone = sum(np.sin(2 * np.pi * f * k * ring) * 0.6 ** (k - 1) / k for k in range(1, 5))
    place(tone * np.exp(-ring / 1.0) * np.minimum(1, ring / 0.003), FINAL, 0.03, pan=(j - 3) * 0.15)
place(pad([65, 69, 72, 76, 79], 3.4), FINAL, 0.02)
place(shimmer(3.0), FINAL + 0.05, 0.02, pan=-0.2)


# ---- short room reverb + master
def reverb(x, secs=1.4, wet=0.18):
    n = int(secs * SR)
    tr = np.arange(n) / SR
    out = x.copy()
    L = len(x) + n
    nfft = 1 << (L - 1).bit_length()
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-tr / (secs / 5))
        ir = lowpass(ir, 8)
        ir /= np.sqrt(np.sum(ir ** 2))
        out[:, ch] += wet * np.fft.irfft(np.fft.rfft(x[:, ch], nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]
    return out


mix = reverb(mix)
fade = np.clip(t / 0.05, 0, 1) * np.clip((DUR - t) / 0.6, 0, 1)
mix *= fade[:, None]
mix /= np.max(np.abs(mix))
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix /= np.max(np.abs(mix)) / 0.9

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'music.wav')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
