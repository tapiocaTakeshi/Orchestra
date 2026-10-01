#!/usr/bin/env python3
"""Procedural background music for the Orchestra intro video.

Everything is synthesized from scratch with numpy (no samples), so the track
is royalty-free and reproducible. The arrangement is driven by music.json:

  {
    "bpm": 120, "duration": 76,
    "progression": [["A2", ["A3","C4","E4"]], ...],   # bass note + chord, one per bar
    "sections": [{"start": 0, "end": 8, "kind": "intro"}, ...],
    "hits": [8.0, 16.0],          # impacts (boom + crash) on these times
    "risers": [[6.0, 8.0]],       # noise/pitch risers over [start, end]
    "ending": 70.0                # final chord + tail from here
  }

kinds: intro (pad + soft pulse), build (adds arp + hats), main (full groove),
break (pad + arp only), outro (pad only, fading).

  python3 tools/music.py [spec.json] [out.wav]
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
RNG = np.random.default_rng(7)
NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def midi(name):
	pitch, octave = name[:-1], int(name[-1])
	return 12 * (octave + 1) + NOTE[pitch]


def freq(m):
	return 440.0 * 2 ** ((m - 69) / 12)


def tvec(n):
	return np.arange(n) / SR


def adsr(n, a, d, s, r, sustain_len=None):
	"""Envelope of n samples: attack a, decay d to level s, release r at the end."""
	env = np.ones(n) * s
	na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
	na = min(na, n)
	env[:na] = np.linspace(0, 1, na, endpoint=False) if na else env[:na]
	nd = min(nd, max(0, n - na))
	env[na:na + nd] = np.linspace(1, s, nd, endpoint=False) if nd else env[na:na + nd]
	nr = min(nr, n)
	if nr:
		env[n - nr:] *= np.linspace(1, 0, nr) ** 2
	return env


def fft_filter(x, lo=None, hi=None, slope=2.0):
	"""Zero-phase spectral band filter with smooth (Butterworth-like) skirts."""
	spec = np.fft.rfft(x, axis=0)
	f = np.fft.rfftfreq(x.shape[0], 1 / SR)
	g = np.ones_like(f)
	if hi:
		g *= 1 / np.sqrt(1 + (f / hi) ** (2 * slope))
	if lo:
		with np.errstate(divide='ignore'):
			g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * slope))
	if x.ndim == 2:
		g = g[:, None]
	return np.fft.irfft(spec * g, n=x.shape[0], axis=0)


def additive(f0, n, bright, decay_per_harm=0.0, detune_cents=0.0, vib=0.0, phase_seed=0):
	"""Band-limited saw-ish tone. bright: array/float cutoff in Hz for harmonic rolloff."""
	t = tvec(n)
	out = np.zeros(n)
	f = f0 * 2 ** (detune_cents / 1200)
	if vib:
		phase_mod = vib * np.sin(2 * np.pi * 5.2 * t + phase_seed) / (2 * np.pi * 5.2)
	else:
		phase_mod = 0
	rng = np.random.default_rng(abs(int(phase_seed)) + 1000)
	k = 1
	while k * f < min(SR / 2.2, 9000):
		cutoff = bright
		w = (1.0 / k) / np.sqrt(1 + ((k * f) / cutoff) ** 4)
		ph = rng.uniform(0, 2 * np.pi)
		partial = np.sin(2 * np.pi * k * f * (t + phase_mod) + ph)
		if decay_per_harm:
			partial *= np.exp(-t * decay_per_harm * k)
		out += w * partial
		k += 1
	return out


def pan(mono, p):
	"""p in [-1, 1] -> stereo (equal power)."""
	a = (p + 1) * np.pi / 4
	return np.stack([mono * np.cos(a), mono * np.sin(a)], axis=1)


class Mix:
	def __init__(self, seconds):
		self.n = int(seconds * SR)
		self.stems = {}

	def add(self, stem, start, stereo):
		buf = self.stems.setdefault(stem, np.zeros((self.n, 2)))
		i = int(start * SR)
		if i >= self.n:
			return
		j = min(self.n, i + stereo.shape[0])
		buf[i:j] += stereo[:j - i]


def reverb(x, seconds=2.6, mix=0.3, pre=0.02):
	n = int(seconds * SR)
	t = tvec(n)
	ir = np.zeros((n, 2))
	for c in range(2):
		noise = RNG.standard_normal(n)
		ir[:, c] = noise * np.exp(-t * 6.9 / seconds)
	ir = fft_filter(ir, lo=180, hi=7000)
	ir[: int(pre * SR)] = 0
	ir /= np.sqrt((ir ** 2).sum(axis=0, keepdims=True))
	L = x.shape[0] + n
	size = 1 << int(np.ceil(np.log2(L)))
	wet = np.fft.irfft(np.fft.rfft(x, size, axis=0) * np.fft.rfft(ir, size, axis=0), size, axis=0)[: x.shape[0]]
	return x * (1 - mix) + wet * mix * 0.9


def main():
	spec_path = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name('music.json'))
	out_path = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / 'out' / 'music.wav')
	spec = json.loads(spec_path.read_text())
	bpm = spec['bpm']
	beat = 60.0 / bpm
	bar = beat * 4
	dur = spec['duration']
	tail = 3.0
	mix = Mix(dur + tail)
	prog = spec['progression']
	sections = spec['sections']
	ending = spec.get('ending', dur - 6)

	def kind_at(t):
		for s in sections:
			if s['start'] <= t < s['end']:
				return s['kind']
		return 'outro'

	nbars = int(np.ceil(ending / bar))
	# ------------------------------------------------------------- per bar parts
	for b in range(nbars):
		t0 = b * bar
		kind = kind_at(t0 + 1e-3)
		bass_note, chord = prog[b % len(prog)]
		chord_m = [midi(c) for c in chord]
		section = next((s for s in sections if s['start'] <= t0 < s['end']), {'start': 0, 'end': dur})
		# 0..1 progress through the current section (drives filter opening in builds)
		sp = (t0 - section['start']) / max(section['end'] - section['start'], 1e-3)

		# Pad: three detuned voices per chord tone, slow attack, legato across the bar.
		n = int((bar + 1.0) * SR)
		bright = {'intro': 900, 'build': 900 + 2200 * sp, 'main': 3200, 'break': 1400, 'outro': 1100}[kind]
		pad_gain = {'intro': .10, 'build': .10, 'main': .085, 'break': .12, 'outro': .1}[kind]
		for i, m in enumerate(chord_m):
			for d, p in ((-9, -.6), (0, 0), (8, .6)):
				tone = additive(freq(m), n, bright, detune_cents=d, vib=0.0025, phase_seed=b * 31 + i * 7 + d)
				env = adsr(n, .5, .4, .85, 1.0)
				mix.add('pad', t0, pan(tone * env * pad_gain / len(chord_m), p * .7))

		# Low strings an octave under the root (adds the "orchestra" body).
		if kind in ('build', 'main', 'break'):
			tone = additive(freq(midi(bass_note) + 12), n, 700, vib=.003, phase_seed=b)
			mix.add('pad', t0, pan(tone * adsr(n, .25, .3, .8, .5) * .07, 0))

		# Bass: sine + 2nd harmonic, eighth-note pulse in main, whole notes otherwise.
		fb = freq(midi(bass_note))
		if kind == 'main':
			for e in range(8):
				nn = int(beat / 2 * SR)
				tt = tvec(nn)
				tone = np.sin(2 * np.pi * fb * tt) + .35 * np.sin(4 * np.pi * fb * tt) + .12 * np.sin(6 * np.pi * fb * tt)
				env = adsr(nn, .005, .08, .7, .05)
				mix.add('bass', t0 + e * beat / 2, pan(tone * env * .26, 0))
		elif kind in ('build', 'break', 'intro'):
			nn = int(bar * SR)
			tt = tvec(nn)
			tone = np.sin(2 * np.pi * fb * tt) + .25 * np.sin(4 * np.pi * fb * tt)
			mix.add('bass', t0, pan(tone * adsr(nn, .05, .3, .7, .3) * (.14 if kind == 'intro' else .2), 0))

		# Pizzicato / pluck arpeggio in 16ths (build, main, break).
		if kind in ('build', 'main', 'break'):
			pattern = [0, 1, 2, 1, 0, 2, 1, 2] * 2
			up = [m + 12 for m in chord_m]
			step = beat / 4
			for s_i, idx in enumerate(pattern):
				if kind == 'build' and sp < .25 and s_i % 2:
					continue
				m = up[idx % len(up)] + (12 if s_i in (6, 14) else 0)
				nn = int(.45 * SR)
				tone = additive(freq(m), nn, 4200, decay_per_harm=1.6, phase_seed=s_i + b * 17)
				env = adsr(nn, .003, .12, .25, .25) * np.exp(-tvec(nn) * 7)
				vel = .9 if s_i % 4 == 0 else .62
				mix.add('arp', t0 + s_i * step, pan(tone * env * vel * .11, -.45 if s_i % 2 else .45))

		# Drums.
		if kind == 'main':
			for k in range(4):
				mix.add('drums', t0 + k * beat, kick())
			for k in (1, 3):
				mix.add('drums', t0 + k * beat, clap())
			for k in range(8):
				mix.add('drums', t0 + k * beat / 2, hat(open_=(k % 2 == 1)))
		elif kind == 'build':
			# Soft pulse kick on 1 and 3 that becomes four-on-the-floor late in the build.
			for k in (range(4) if sp > .5 else (0, 2)):
				mix.add('drums', t0 + k * beat, kick(.6))
			for k in range(8 if sp > .3 else 4):
				mix.add('drums', t0 + k * beat / (2 if sp > .3 else 1), hat(gain=.5))
		elif kind == 'intro':
			mix.add('drums', t0, kick(.35))

	# ------------------------------------------------------------- risers + hits
	for a, b in spec.get('risers', []):
		mix.add('fx', a, riser(b - a))
	for h in spec.get('hits', []):
		mix.add('fx', h, impact())

	# ------------------------------------------------------------- ending chord
	last_bass, last_chord = spec.get('final', prog[0])
	n = int((dur + tail - ending) * SR)
	for i, m in enumerate([midi(c) for c in last_chord] + [midi(last_bass) + 12]):
		for d, p in ((-8, -.6), (0, 0), (7, .6)):
			tone = additive(freq(m), n, 2600, detune_cents=d, vib=.002, phase_seed=900 + i * 5 + d)
			env = adsr(n, .02, 1.5, .55, 0) * np.exp(-tvec(n) * .35)
			mix.add('pad', ending, pan(tone * env * .07, p * .7))
	tt = tvec(n)
	sub = np.sin(2 * np.pi * freq(midi(last_bass)) * tt) * np.exp(-tt * .6)
	mix.add('bass', ending, pan(sub * .28, 0))
	mix.add('fx', ending, impact(1.2))

	# ------------------------------------------------------------- mixdown
	stems = mix.stems
	# Sidechain-style ducking of pad/bass/arp from the kick, only where drums play.
	duck = np.ones(mix.n)
	for b in range(nbars):
		if kind_at(b * bar + 1e-3) != 'main':
			continue
		for k in range(4):
			i = int((b * bar + k * beat) * SR)
			nn = int(beat * SR)
			j = min(mix.n, i + nn)
			curve = 1 - .45 * np.exp(-tvec(j - i) * 14)
			duck[i:j] = np.minimum(duck[i:j], curve)
	for s in ('pad', 'arp', 'bass'):
		if s in stems:
			stems[s] *= duck[:, None]

	if 'pad' in stems:
		stems['pad'] = reverb(stems['pad'], 3.2, .45)
	if 'arp' in stems:
		stems['arp'] = reverb(fft_filter(stems['arp'], lo=250), 2.2, .35)
	if 'drums' in stems:
		stems['drums'] = reverb(stems['drums'], 1.2, .12)
	if 'fx' in stems:
		stems['fx'] = reverb(stems['fx'], 3.5, .35)
	if 'bass' in stems:
		stems['bass'] = fft_filter(stems['bass'], hi=900)
	gains = {'pad': 1.0, 'arp': .9, 'bass': 1.0, 'drums': .85, 'fx': .8}
	out = sum(stems[k] * gains.get(k, 1) for k in stems)
	out = fft_filter(out, lo=28)
	# Fade in, then glue with a soft clipper and normalize to -1 dBFS.
	fi = int(.6 * SR)
	out[:fi] *= np.linspace(0, 1, fi)[:, None]
	out = np.tanh(out * 1.6) / np.tanh(1.6)
	out *= 10 ** (-1 / 20) / np.max(np.abs(out))
	fo = int(1.5 * SR)
	out[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 2

	out_path.parent.mkdir(parents=True, exist_ok=True)
	with wave.open(str(out_path), 'wb') as w:
		w.setnchannels(2)
		w.setsampwidth(2)
		w.setframerate(SR)
		w.writeframes((out * 32767).astype('<i2').tobytes())
	print(f'{out_path}  ({out.shape[0] / SR:.1f}s @ {bpm} BPM)')


def kick(gain=1.0):
	n = int(.5 * SR)
	t = tvec(n)
	f = 46 + 110 * np.exp(-t * 32)
	ph = 2 * np.pi * np.cumsum(f) / SR
	body = np.sin(ph) * np.exp(-t * 7.5)
	click = fft_filter(RNG.standard_normal(n) * np.exp(-t * 300), lo=1500) * .25
	return pan((body + click) * .55 * gain, 0)


def clap(gain=1.0):
	n = int(.35 * SR)
	t = tvec(n)
	noise = fft_filter(RNG.standard_normal(n), lo=900, hi=5200)
	env = np.exp(-t * 22)
	for off in (.0, .011, .022):  # three quick slaps
		i = int(off * SR)
		env[i:i + int(.004 * SR)] = np.maximum(env[i:i + int(.004 * SR)], 1)
	body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * .3
	return pan((noise * env * .22 + body * .2) * gain, 0)


def hat(open_=False, gain=1.0):
	n = int((.18 if open_ else .06) * SR)
	t = tvec(n)
	noise = fft_filter(RNG.standard_normal(n), lo=7000)
	env = np.exp(-t * (22 if open_ else 70))
	return pan(noise * env * (.07 if open_ else .085) * gain, .25 if open_ else -.2)


def riser(seconds):
	n = int(seconds * SR)
	t = tvec(n)
	k = t / seconds
	noise = RNG.standard_normal(n)
	# Sweep a band upward by blending progressively brighter filtered copies.
	lo = fft_filter(noise, lo=300, hi=1500)
	hi = fft_filter(noise, lo=2500, hi=12000)
	sweep = lo * (1 - k) + hi * k
	tone_f = 220 * 2 ** (2 * k)
	tone = np.sin(2 * np.pi * np.cumsum(tone_f) / SR) * .25
	env = k ** 2.2
	mono = (sweep * .5 + tone) * env * .22
	return np.stack([mono * (1 - .3 * np.sin(6 * k)), mono * (1 + .3 * np.sin(6 * k))], axis=1)


def impact(gain=1.0):
	n = int(3.0 * SR)
	t = tvec(n)
	boom = np.sin(2 * np.pi * (38 + 40 * np.exp(-t * 9)) * t) * np.exp(-t * 2.2)
	crash = fft_filter(RNG.standard_normal(n), lo=3000) * np.exp(-t * 2.8) * .18
	return pan((boom * .6 + crash) * .5 * gain, 0)


if __name__ == '__main__':
	main()
