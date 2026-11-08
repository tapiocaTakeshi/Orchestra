/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { appendVoiceTranscript, idleWaveValue, updateWaveAmplitudes, VOICE_WAVE, waveY } from '../../common/voiceInput.js';

suite('Voice input', () => {

	test('appendVoiceTranscript appends to the end without overwriting', () => {
		assert.strictEqual(appendVoiceTranscript('', 'hello'), 'hello');
		assert.strictEqual(appendVoiceTranscript('fix the bug', 'please'), 'fix the bug please');
		assert.strictEqual(appendVoiceTranscript('fix the bug ', 'please'), 'fix the bug please');
		assert.strictEqual(appendVoiceTranscript('fix\n', 'please'), 'fix\nplease');
	});

	test('appendVoiceTranscript: no separator after Japanese / full-width text', () => {
		assert.strictEqual(appendVoiceTranscript('バグを直して', 'ください'), 'バグを直してください');
		assert.strictEqual(appendVoiceTranscript('直して。', 'テスト'), '直して。テスト');
		assert.strictEqual(appendVoiceTranscript('ＡＢＣ', 'x'), 'ＡＢＣx');
	});

	test('appendVoiceTranscript trims the transcript and ignores empty results', () => {
		assert.strictEqual(appendVoiceTranscript('abc', '  def  '), 'abc def');
		assert.strictEqual(appendVoiceTranscript('abc', '   '), 'abc');
		assert.strictEqual(appendVoiceTranscript('', ''), '');
	});

	test('updateWaveAmplitudes: silence stays flat (noise gate)', () => {
		const smoothed = new Float32Array(16);
		const silence = new Uint8Array(64).fill(128);
		silence[10] = 129; // わずかなノイズ
		for (let f = 0; f < 10; f++) { updateWaveAmplitudes(silence, smoothed); }
		for (const v of smoothed) { assert.strictEqual(v, 0); }
	});

	test('updateWaveAmplitudes: louder input gives larger amplitude, clamped to [-1, 1]', () => {
		const quiet = new Uint8Array(64);
		const loud = new Uint8Array(64);
		for (let i = 0; i < 64; i++) {
			const s = Math.sin((i / 64) * Math.PI * 8);
			quiet[i] = Math.round(128 + s * 10);
			loud[i] = Math.round(128 + s * 127);
		}
		const a = new Float32Array(33);
		const b = new Float32Array(33);
		for (let f = 0; f < 30; f++) { updateWaveAmplitudes(quiet, a); updateWaveAmplitudes(loud, b); }
		const peak = (arr: Float32Array) => Math.max(...Array.from(arr, Math.abs));
		assert.ok(peak(b) > peak(a), 'loud input should be larger');
		assert.ok(peak(a) > 0, 'quiet speech should still be visible');
		for (const v of b) { assert.ok(v >= -1 && v <= 1); }
		// 両端は 0 (枠で切れない)
		assert.ok(Math.abs(b[0]) < 1e-6 && Math.abs(b[32]) < 1e-6);
	});

	test('updateWaveAmplitudes: smoothing approaches the target gradually and decays without data', () => {
		const smoothed = new Float32Array(3);
		const full = new Uint8Array([255, 255, 255]);
		updateWaveAmplitudes(full, smoothed, { smoothing: 0.5 });
		assert.ok(smoothed[1] > 0 && smoothed[1] < 1);
		const first = smoothed[1];
		updateWaveAmplitudes([], smoothed, { smoothing: 0.5 });
		assert.ok(smoothed[1] < first);
	});

	test('updateWaveAmplitudes: rises with attack and falls slower with release (design values)', () => {
		assert.strictEqual(VOICE_WAVE.noiseGate, 0.04);
		assert.strictEqual(VOICE_WAVE.attack, 0.18);
		assert.strictEqual(VOICE_WAVE.release, 0.08);
		const smoothed = new Float32Array(3);
		updateWaveAmplitudes(new Uint8Array([255, 255, 255]), smoothed);
		assert.ok(Math.abs(smoothed[1] - 0.18) < 1e-6, `attack step: ${smoothed[1]}`);
		const before = smoothed[1];
		updateWaveAmplitudes(new Uint8Array([128, 128, 128]), smoothed);
		assert.ok(Math.abs(smoothed[1] - before * (1 - 0.08)) < 1e-6, `release step: ${smoothed[1]}`);
		// ゲート 0.04 未満 (|raw| = 4/128 ≈ 0.031) は無音扱い
		const gated = new Float32Array(3);
		updateWaveAmplitudes(new Uint8Array([132, 132, 132]), gated);
		assert.strictEqual(gated[1], 0);
	});

	test('idleWaveValue stays within range and is static with reduced motion', () => {
		for (let i = 0; i < 20; i++) {
			const v = idleWaveValue(i, 20, 1.3, false);
			assert.ok(v >= -1 && v <= 1);
			assert.strictEqual(idleWaveValue(i, 20, 0, true), idleWaveValue(i, 20, 5, true));
		}
		assert.notStrictEqual(idleWaveValue(7, 20, 0, false), idleWaveValue(7, 20, 0.6, false));
	});

	test('waveY keeps the line inside the canvas', () => {
		assert.strictEqual(waveY(0, VOICE_WAVE.maxAmplitude), VOICE_WAVE.height / 2);
		assert.strictEqual(waveY(1, VOICE_WAVE.maxAmplitude), VOICE_WAVE.height / 2 - VOICE_WAVE.maxAmplitude);
		assert.strictEqual(waveY(5, 1000), 0);
		assert.strictEqual(waveY(-5, 1000), VOICE_WAVE.height);
	});
});
