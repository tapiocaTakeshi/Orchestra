/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// 音声入力の共通ロジック (IDE チャットとクラウドエージェントで同じ規則を使う)。
// DOM に依存しない純粋関数だけを置き、テストできるようにする。

/**
 * 認識したテキストを入力欄の今の値の末尾に足す。既存の文字は上書きしない。
 * 区切り: 空・空白で終わる・日本語 (全角) で終わるときは何も挟まず、それ以外は半角スペースを 1 つ挟む。
 * 認識結果が空 (空白のみ) なら今の値をそのまま返す。
 */
export const appendVoiceTranscript = (current: string, transcript: string): string => {
	const text = transcript.trim();
	if (!text) { return current; }
	const sep = !current || /\s$/.test(current) ? '' : (/[\u3000-\u9fff\uff00-\uffef]$/.test(current) ? '' : ' ');
	return current + sep + text;
};

/** 波形の寸法・動き (デザイン .division/design/index.html の波形仕様) */
export const VOICE_WAVE = {
	/** canvas の論理高さ (px)。幅は CSS の --wave-width に合わせて実測する */
	height: 120,
	/** 録音中の最大振幅 (中央から ±px) */
	maxAmplitude: 48,
	/** starting / transcribing の待機波形の振幅 (±px) */
	idleAmplitude: 6,
	/** 待機波形の位相移動の周期 (秒) */
	idlePeriodSec: 2.4,
	/** 主線の線幅 */
	stroke: 2.5,
	/** glow 線の線幅 */
	glowStroke: 8,
	/** 波形を描く点の数 */
	points: 96,
	/** これより小さい入力 (−1〜1) は無音として 0 にする */
	noiseGate: 0.02,
	/** 小さな声でも見えるように持ち上げる倍率 */
	gain: 3,
	/** 振幅平滑化の係数 (0〜1、大きいほど速く追従) */
	smoothing: 0.35,
} as const;

const clamp = (v: number, min: number, max: number) => v < min ? min : v > max ? max : v;

/**
 * AnalyserNode.getByteTimeDomainData() の値 (0〜255、128 が無音) から、波形の各点の相対振幅 (−1〜1) を求める。
 * ノイズゲート・倍率・clamp をかけ、前フレームの値 `smoothed` を平滑化しながらその場で更新して返す。
 * samples が空なら 0 に向かって減衰する。
 */
export const updateWaveAmplitudes = (samples: ArrayLike<number>, smoothed: Float32Array, opts: { noiseGate?: number; gain?: number; smoothing?: number } = {}): Float32Array => {
	const noiseGate = opts.noiseGate ?? VOICE_WAVE.noiseGate;
	const gain = opts.gain ?? VOICE_WAVE.gain;
	const k = clamp(opts.smoothing ?? VOICE_WAVE.smoothing, 0, 1);
	const n = smoothed.length;
	const len = samples.length;
	for (let i = 0; i < n; i++) {
		let v = 0;
		if (len > 0) {
			const idx = n > 1 ? Math.round((i * (len - 1)) / (n - 1)) : 0;
			const raw = (samples[idx] - 128) / 128;
			v = Math.abs(raw) < noiseGate ? 0 : clamp(raw * gain, -1, 1);
		}
		// 両端は 0 に寄せて、線が枠で切れて見えないようにする
		const edge = n > 1 ? Math.sin((Math.PI * i) / (n - 1)) : 1;
		smoothed[i] += (v * edge - smoothed[i]) * k;
		smoothed[i] = clamp(smoothed[i], -1, 1);
	}
	return smoothed;
};

/**
 * 実音声に連動しない待機波形の i 番目の点の値 (−1〜1)。starting / transcribing / 解析失敗時に使う。
 * reducedMotion のときは位相を動かさない (静的な波形)。
 */
export const idleWaveValue = (i: number, count: number, timeSec: number, reducedMotion: boolean): number => {
	const x = count > 1 ? i / (count - 1) : 0;
	const phase = reducedMotion ? 0 : (timeSec / VOICE_WAVE.idlePeriodSec) * Math.PI * 2;
	return Math.sin(x * Math.PI * 4 - phase) * Math.sin(Math.PI * x);
};

/** 相対振幅 (−1〜1) を canvas の y 座標にする。必ず描画範囲内に収める */
export const waveY = (value: number, amplitudePx: number, height: number = VOICE_WAVE.height): number => {
	const mid = height / 2;
	return clamp(mid - clamp(value, -1, 1) * amplitudePx, 0, height);
};
