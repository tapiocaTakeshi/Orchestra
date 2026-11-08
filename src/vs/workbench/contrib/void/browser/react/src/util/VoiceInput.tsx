/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// 入力欄の音声入力 (IDE チャットとクラウドエージェントで共通)。
// マイクボタンを押すとウインドウの真ん中に、声に合わせて動く赤い波形を出し、話し終えたら文字にして入力欄へ入れる。
// 文字起こしは、OpenAI の API キーが設定されていればそれ (録音して送る) を使い、なければ Chromium の音声認識を試す。
// Electron の音声認識は使えないことが多いので、その場合は API キーを入れるよう案内する。
// 結果は入力欄に入れるだけで、送信はしない (ユーザーが確かめてから送る)。

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic } from 'lucide-react';
import { useIsDark, useOrchestraUiMode, useSettingsState } from './services.js';
import { TranslationKey, useTranslation } from './i18n.js';
import { idleWaveValue, updateWaveAmplitudes, VOICE_WAVE, waveY } from '../../../../common/voiceInput.js';

type Phase = 'starting' | 'recording' | 'transcribing' | 'error'

const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions'
const OPENAI_TRANSCRIBE_MODEL = 'whisper-1'

const getSpeechRecognitionCtor = (): any => {
	const w = globalThis as any
	return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const pickRecorderMimeType = (): string | undefined => {
	if (typeof MediaRecorder === 'undefined') return undefined
	for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
		if (MediaRecorder.isTypeSupported?.(m)) return m
	}
	return undefined
}

const extensionOfMimeType = (mime: string) => mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm'

// デザイン (.division/design/index.html) の :root トークン。オーバーレイは body 直下に出すので、そのルートとボタンに付ける。
// 色テーマは VS Code のテーマ (useIsDark) で切り替える。
// 注意: React のビルドは scope-tailwind で JSX の className に "void-" を付けるが、CSS 文字列のセレクタは書き換えない。
// className を条件付きのテンプレートで組む箇所もあるので、ここではクラスではなく data 属性をセレクタに使う (書き換えの影響を受けない)。
export const VOICE_CSS = `
[data-orchestra-voice], [data-orchestra-voice-btn] {
	--color-overlay:rgba(8,8,16,0.55);
	--color-text:#f4f4f6; --color-text-muted:#a0a0ad; --color-text-faint:#6b6b78;
	--color-surface-2:#1f1f29;
	--color-border:rgba(255,255,255,0.14); --color-border-strong:rgba(255,255,255,0.28);
	--color-wave:#ef4444; --color-wave-soft:#f87171; --color-wave-strong:#dc2626;
	--color-wave-glow:rgba(239,68,68,0.25); --color-wave-baseline:rgba(239,68,68,0.20);
	--color-on-accent:#ffffff; --color-error:#ef4444;
	--space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:24px;
	--radius-pill:999px;
	--wave-width:min(640px,80vw); --wave-height:120px; --wave-stroke:2.5px;
}
[data-orchestra-voice][data-theme="light"], [data-orchestra-voice-btn][data-theme="light"] {
	--color-overlay:rgba(250,250,252,0.65);
	--color-text:#17171d; --color-text-muted:#5a5a66; --color-text-faint:#8b8b96;
	--color-surface-2:#f0f0f4;
	--color-border:rgba(20,20,30,0.12); --color-border-strong:rgba(20,20,30,0.28);
	--color-wave:#dc2626; --color-wave-soft:#ef4444; --color-wave-strong:#b91c1c;
	--color-wave-glow:rgba(220,38,38,0.22); --color-wave-baseline:rgba(220,38,38,0.20);
	--color-error:#dc2626;
}
@keyframes orchestra-voice-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes orchestra-voice-pulse { 0%,100% { box-shadow: 0 0 0 0 var(--color-wave-glow) } 50% { box-shadow: 0 0 0 6px transparent } }
[data-orchestra-voice] [data-ov-btn] { display:inline-flex; align-items:center; justify-content:center; gap:6px; border-radius:var(--radius-pill); padding:7px 18px; font-size:13px; font-family:inherit; cursor:pointer; border:1px solid transparent; min-height:34px; transition:background .15s, border-color .15s, opacity .15s; }
[data-orchestra-voice] [data-ov-btn]:disabled { opacity:.45; cursor:default; }
[data-orchestra-voice] [data-ov-btn="primary"] { background:var(--color-wave); color:var(--color-on-accent); border-color:var(--color-wave); }
[data-orchestra-voice] [data-ov-btn="primary"]:hover:not(:disabled) { background:var(--color-wave-strong); }
[data-orchestra-voice] [data-ov-btn="primary"]:focus-visible { outline:2px solid var(--color-wave-soft); outline-offset:2px; }
[data-orchestra-voice] [data-ov-btn="secondary"] { background:transparent; color:var(--color-text); border-color:var(--color-border-strong); }
[data-orchestra-voice] [data-ov-btn="secondary"]:hover:not(:disabled) { background:var(--color-surface-2); }
[data-orchestra-voice] [data-ov-btn="secondary"]:focus-visible { outline:2px solid var(--color-wave-soft); outline-offset:2px; }
[data-orchestra-voice-btn][data-variant="icon"] { border:1px solid var(--color-border); background:transparent; }
[data-orchestra-voice-btn][data-variant="icon"]:hover:not(:disabled) { color:var(--color-wave); background:transparent; }
[data-orchestra-voice-btn][data-variant="icon"]:focus-visible { outline:2px solid var(--color-wave-soft); outline-offset:2px; }
[data-orchestra-voice-btn][data-recording="true"] { background:var(--color-wave) !important; border-color:var(--color-wave) !important; color:var(--color-on-accent) !important; animation: orchestra-voice-pulse 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
	[data-orchestra-voice] { animation:none !important; }
	[data-orchestra-voice-btn][data-recording="true"] { animation:none; }
}
`

const VOICE_STYLE_ID = 'orchestra-voice-styles'

/** 音声入力の CSS を document.head に一度だけ入れる (ボタンが複数あっても重複しない)。何度呼んでもよい。 */
export const ensureVoiceStyles = (doc: Document | undefined = typeof document === 'undefined' ? undefined : document) => {
	if (!doc) return
	let el = doc.getElementById(VOICE_STYLE_ID) as HTMLStyleElement | null
	if (!el) {
		el = doc.createElement('style')
		el.id = VOICE_STYLE_ID
		;(doc.head ?? doc.documentElement).appendChild(el)
	}
	if (el.textContent !== VOICE_CSS) el.textContent = VOICE_CSS
}

// CSS 変数が読めなかったとき (スタイル未適用など) でも波形を赤で描くための既定値 (デザインのダークテーマ値)
const WAVE_COLOR_FALLBACK = { wave: '#ef4444', glow: 'rgba(239,68,68,0.25)', baseline: 'rgba(239,68,68,0.20)' }

/**
 * 入力欄に並べるマイクボタン。押すと音声入力のオーバーレイを開く。
 * - disabled: 入力欄が disabled のときに true。開いている途中で true になったらやめる。
 * - ownerKey: 入力先 (例: クラウドのセッション ID)。変わったら進行中の音声入力をやめる (別の入力先へは入れない)。
 * - variant: 'inline' (IDE の既存 Tailwind ボタン) / 'icon' (クラウドの 26px 丸アイコン。枠 --color-border、hover で --color-wave)。
 * - UI モード (IDE / クラウド) が切り替わったときもやめる。自動では再開しない。
 */
export const ButtonVoiceInput = ({ onTranscript, disabled, ownerKey, className, style, variant = 'inline' }: {
	onTranscript: (text: string) => void,
	disabled?: boolean,
	ownerKey?: string,
	className?: string,
	style?: React.CSSProperties,
	variant?: 'inline' | 'icon',
}) => {
	const { t } = useTranslation()
	const uiMode = useOrchestraUiMode()
	const isDark = useIsDark()
	const [isOpen, setIsOpen] = useState(false)
	const buttonRef = useRef<HTMLButtonElement | null>(null)

	useLayoutEffect(() => { ensureVoiceStyles() }, [])

	// モード切替・入力先の変更・入力欄が使えなくなったら、進行中の音声入力を破棄する (オーバーレイを外すと後始末される)
	useEffect(() => { setIsOpen(false) }, [uiMode, ownerKey])
	useEffect(() => { if (disabled) setIsOpen(false) }, [disabled])

	const label = isOpen ? t('chat.voice.recording') : t('chat.voice.start')
	return <>
		<button
			ref={buttonRef}
			type='button'
			className={className ?? `p-1 rounded text-void-fg-3 transition-colors duration-150 ${disabled ? 'opacity-50 cursor-default' : 'cursor-pointer hover:text-void-fg-1 hover:bg-void-bg-2'}`}
			style={style}
			onClick={(e) => { e.stopPropagation(); if (!disabled) setIsOpen(true) }}
			disabled={disabled}
			data-orchestra-voice-btn=''
			data-variant={variant}
			data-theme={isDark ? 'dark' : 'light'}
			data-recording={isOpen}
			data-tooltip-id='void-tooltip'
			data-tooltip-content={label}
			data-tooltip-place='top'
			title={label}
			aria-label={label}
			aria-pressed={isOpen}
		>
			<Mic size={16} className='stroke-[1.5]' />
		</button>
		{isOpen && !disabled && <VoiceInputOverlay
			onClose={() => {
				setIsOpen(false)
				// 取り消し・閉じる: フォーカスを元のマイクボタンへ戻す
				requestAnimationFrame(() => { const b = buttonRef.current; if (b && b.isConnected && !b.disabled) b.focus() })
			}}
			onTranscript={(text) => { setIsOpen(false); onTranscript(text) }}
		/>}
	</>
}

/** ウインドウの真ん中に出す音声入力の画面。開いた時点で聞き取りを始める。閉じる (unmount) とすべて止める。 */
const VoiceInputOverlay = ({ onClose, onTranscript }: { onClose: () => void, onTranscript: (text: string) => void }) => {
	const { t, language } = useTranslation()
	const isDark = useIsDark()
	const openAIKey = useSettingsState().settingsOfProvider.openAI?.apiKey?.trim() || ''

	const [phase, setPhase] = useState<Phase>('starting')
	const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)
	const [errorDetail, setErrorDetail] = useState('')
	const [liveText, setLiveText] = useState('')

	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const rootRef = useRef<HTMLDivElement | null>(null)
	const streamRef = useRef<MediaStream | null>(null)
	const audioCtxRef = useRef<AudioContext | null>(null)
	const analyserRef = useRef<AnalyserNode | null>(null)
	const rafRef = useRef<number | null>(null)
	const recorderRef = useRef<MediaRecorder | null>(null)
	const chunksRef = useRef<Blob[]>([])
	const recognitionRef = useRef<any>(null)
	const finalTextRef = useRef('')
	const interimTextRef = useRef('')
	const abortRef = useRef<AbortController | null>(null)
	const phaseRef = useRef<Phase>('starting')
	const closedRef = useRef(false)
	const finishingRef = useRef(false)

	const setPhaseBoth = useCallback((p: Phase) => { phaseRef.current = p; setPhase(p) }, [])

	useLayoutEffect(() => { ensureVoiceStyles() }, [])
	// 開いたらダイアログへフォーカスを移す (Enter / Esc はウインドウで拾う)
	useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

	// マイク・音声認識・描画・通信をすべて止める。何度呼んでもよい。
	const stopEverything = useCallback(() => {
		if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
		rafRef.current = null
		try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop() } catch { /* already stopped */ }
		recorderRef.current = null
		try { recognitionRef.current?.abort() } catch { /* already stopped */ }
		recognitionRef.current = null
		streamRef.current?.getTracks().forEach(tr => tr.stop())
		streamRef.current = null
		audioCtxRef.current?.close().catch(() => { })
		audioCtxRef.current = null
		analyserRef.current = null
	}, [])

	const fail = useCallback((key: TranslationKey, detail = '') => {
		stopEverything()
		abortRef.current?.abort()
		setErrorKey(key)
		setErrorDetail(detail)
		setPhaseBoth('error')
	}, [setPhaseBoth, stopEverything])

	const cancel = useCallback(() => {
		closedRef.current = true
		abortRef.current?.abort()
		stopEverything()
		onClose()
	}, [onClose, stopEverything])

	const deliver = useCallback((text: string) => {
		if (closedRef.current) return
		const trimmed = text.trim()
		if (!trimmed) { fail('chat.voice.error.empty'); return }
		closedRef.current = true
		stopEverything()
		onTranscript(trimmed)
	}, [fail, onTranscript, stopEverything])

	// 話し終えた: 録音なら送って文字にし、音声認識なら止めて結果を受け取る。
	const finish = useCallback(() => {
		if (phaseRef.current !== 'recording' || finishingRef.current) return
		finishingRef.current = true
		setPhaseBoth('transcribing')

		const recognition = recognitionRef.current
		if (recognition) {
			// onend で結果を渡す
			try { recognition.stop() } catch { deliver(finalTextRef.current + interimTextRef.current) }
			return
		}

		const recorder = recorderRef.current
		if (!recorder) { deliver(''); return }
		recorder.onstop = async () => {
			if (closedRef.current) return
			const mime = recorder.mimeType || 'audio/webm'
			const blob = new Blob(chunksRef.current, { type: mime })
			// 録音は済んだのでマイクは先に離す (待機波形は文字起こし中も続ける)
			streamRef.current?.getTracks().forEach(tr => tr.stop())
			if (blob.size === 0) { deliver(''); return }
			const form = new FormData()
			form.append('file', blob, `speech.${extensionOfMimeType(mime)}`)
			form.append('model', OPENAI_TRANSCRIBE_MODEL)
			form.append('language', language === 'en' ? 'en' : 'ja')
			const controller = new AbortController()
			abortRef.current = controller
			try {
				const res = await fetch(OPENAI_TRANSCRIBE_URL, {
					method: 'POST',
					headers: { Authorization: `Bearer ${openAIKey}` },
					body: form,
					signal: controller.signal,
				})
				if (!res.ok) {
					let detail = `HTTP ${res.status}`
					try { const j = await res.json(); if (j?.error?.message) detail = j.error.message } catch { /* not json */ }
					throw new Error(detail)
				}
				const j = await res.json()
				if (closedRef.current || controller.signal.aborted) return
				deliver(typeof j?.text === 'string' ? j.text : '')
			} catch (e: any) {
				if (closedRef.current || e?.name === 'AbortError') return
				fail('chat.voice.error.transcribe', e?.message ?? String(e))
			}
		}
		try { recorder.stop() } catch { deliver('') }
	}, [deliver, fail, language, openAIKey, setPhaseBoth])

	// 開いたらマイクを取り、聞き取りを始める
	useEffect(() => {
		let disposed = false
		const start = async () => {
			const useOpenAI = !!openAIKey && typeof MediaRecorder !== 'undefined'
			const Ctor = useOpenAI ? undefined : getSpeechRecognitionCtor()
			// 認識の手段がなければ、マイクを取らずにすぐ知らせる
			if (!useOpenAI && !Ctor) { fail('chat.voice.error.noEngine'); return }

			let stream: MediaStream
			try {
				if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia is not available')
				stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
			} catch (e: any) {
				if (!disposed && !closedRef.current) fail('chat.voice.error.mic', e?.message ?? '')
				return
			}
			if (disposed || closedRef.current) { stream.getTracks().forEach(tr => tr.stop()); return }
			streamRef.current = stream

			// 声の波形を読むための解析器 (失敗しても入力はでき、波形は待機波形になる)
			let ctx: AudioContext | undefined
			try {
				ctx = new AudioContext()
				// 作った直後に覚えておき、以降で失敗しても stopEverything / catch で必ず閉じる
				audioCtxRef.current = ctx
				const source = ctx.createMediaStreamSource(stream)
				const analyser = ctx.createAnalyser()
				analyser.fftSize = 1024
				analyser.smoothingTimeConstant = 0.6
				source.connect(analyser)
				analyserRef.current = analyser
				if (ctx.state === 'suspended') ctx.resume().catch(() => { })
			} catch {
				ctx?.close().catch(() => { })
				audioCtxRef.current = null
				analyserRef.current = null
			}

			if (useOpenAI) {
				try {
					const mimeType = pickRecorderMimeType()
					const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
					chunksRef.current = []
					recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data) }
					recorder.start(250)
					recorderRef.current = recorder
				} catch (e: any) {
					fail('chat.voice.error.mic', e?.message ?? '')
					return
				}
				setPhaseBoth('recording')
				return
			}

			const recognition = new Ctor()
			recognition.lang = language === 'en' ? 'en-US' : 'ja-JP'
			recognition.continuous = true
			recognition.interimResults = true
			recognition.onresult = (ev: any) => {
				if (closedRef.current || phaseRef.current === 'error') return
				let finalText = ''
				let interim = ''
				for (let i = 0; i < ev.results.length; i++) {
					const r = ev.results[i]
					if (r.isFinal) finalText += r[0].transcript
					else interim += r[0].transcript
				}
				finalTextRef.current = finalText
				interimTextRef.current = interim
				setLiveText(finalText + interim)
			}
			recognition.onerror = (ev: any) => {
				if (closedRef.current) return
				const err = ev?.error
				if (err === 'no-speech' || err === 'aborted') return
				recognitionRef.current = null
				if (err === 'not-allowed' || err === 'audio-capture') fail('chat.voice.error.mic')
				else fail('chat.voice.error.noEngine', err === 'network' || err === 'service-not-allowed' ? '' : String(err ?? ''))
			}
			recognition.onend = () => {
				if (closedRef.current || phaseRef.current === 'error') return
				if (finishingRef.current) { deliver(finalTextRef.current + interimTextRef.current); return }
				// 無音などで勝手に止まったら、聞き取りを続ける
				try { recognition.start() } catch { /* ignore */ }
			}
			try {
				recognition.start()
			} catch (e: any) {
				fail('chat.voice.error.noEngine', e?.message ?? '')
				return
			}
			recognitionRef.current = recognition
			setPhaseBoth('recording')
		}
		start()
		return () => {
			// 閉じた・モードを切り替えた・入力欄が消えた: すべて止め、遅れて届く結果も捨てる
			disposed = true
			closedRef.current = true
			abortRef.current?.abort()
			stopEverything()
		}
		// 開いたときに一度だけ始める
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// 赤い波形の描画 (error では止める。閉じたら canvas ごと消える)
	useEffect(() => {
		if (phase === 'error') return
		const canvas = canvasRef.current
		if (!canvas) return
		const g = canvas.getContext('2d')
		if (!g) return

		const H = VOICE_WAVE.height
		let W = 0
		const resize = () => {
			const dpr = window.devicePixelRatio || 1
			W = Math.max(1, canvas.clientWidth || 640)
			canvas.width = Math.round(W * dpr)
			canvas.height = Math.round(H * dpr)
			g.setTransform(dpr, 0, 0, dpr, 0, 0)
		}
		resize()
		window.addEventListener('resize', resize)

		const css = getComputedStyle(canvas)
		const color = (name: string) => css.getPropertyValue(name).trim()
		const waveColor = color('--color-wave') || WAVE_COLOR_FALLBACK.wave
		const glowColor = color('--color-wave-glow') || WAVE_COLOR_FALLBACK.glow
		const baselineColor = color('--color-wave-baseline') || WAVE_COLOR_FALLBACK.baseline

		const reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
		const N = VOICE_WAVE.points
		const smoothed = new Float32Array(N)
		let samples: Uint8Array<ArrayBuffer> | null = null
		const t0 = performance.now()

		const path = (values: Float32Array, amp: number) => {
			g.beginPath()
			for (let i = 0; i < N; i++) {
				const x = (i / (N - 1)) * W
				const y = waveY(values[i], amp, H)
				if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
			}
		}
		const values = new Float32Array(N)

		const draw = () => {
			const time = (performance.now() - t0) / 1000
			const p = phaseRef.current
			const analyser = analyserRef.current
			let amp: number = VOICE_WAVE.idleAmplitude

			if (p === 'recording' && analyser) {
				// 実音声の時間領域データに追従する
				try {
					if (!samples || samples.length !== analyser.fftSize) samples = new Uint8Array(analyser.fftSize)
					analyser.getByteTimeDomainData(samples)
					updateWaveAmplitudes(samples, smoothed)
					values.set(smoothed)
					amp = VOICE_WAVE.maxAmplitude
				} catch {
					analyserRef.current = null
					for (let i = 0; i < N; i++) values[i] = idleWaveValue(i, N, time, reducedMotion)
				}
			} else {
				// starting / transcribing / 解析失敗: 実音声に連動しない低振幅の待機波形
				for (let i = 0; i < N; i++) values[i] = idleWaveValue(i, N, time, reducedMotion)
			}

			g.clearRect(0, 0, W, H)

			// 中央の基準線 (破線)
			g.save()
			g.strokeStyle = baselineColor
			g.lineWidth = 1
			g.setLineDash([4, 6])
			g.beginPath()
			g.moveTo(0, H / 2)
			g.lineTo(W, H / 2)
			g.stroke()
			g.restore()

			g.lineCap = 'round'
			g.lineJoin = 'round'
			// 背面の glow (1 本だけ)
			g.save()
			g.globalAlpha = 0.6
			g.strokeStyle = glowColor
			g.lineWidth = VOICE_WAVE.glowStroke
			path(values, amp)
			g.stroke()
			g.restore()
			// 主線
			g.strokeStyle = waveColor
			g.lineWidth = VOICE_WAVE.stroke
			path(values, amp)
			g.stroke()

			rafRef.current = requestAnimationFrame(draw)
		}
		rafRef.current = requestAnimationFrame(draw)
		return () => {
			window.removeEventListener('resize', resize)
			if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
			rafRef.current = null
		}
	}, [phase === 'error', isDark])

	// Enter で完了、Esc でやめる
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel() }
			else if (e.key === 'Enter' && phaseRef.current === 'recording') { e.preventDefault(); e.stopPropagation(); finish() }
		}
		window.addEventListener('keydown', onKey, true)
		return () => window.removeEventListener('keydown', onKey, true)
	}, [cancel, finish])

	const statusText = phase === 'recording' ? t('chat.voice.listening')
		: phase === 'transcribing' ? t('chat.voice.transcribing')
			: phase === 'starting' ? t('chat.voice.starting')
				: ''

	return createPortal(
		<div
			ref={rootRef}
			tabIndex={-1}
			data-orchestra-voice=''
			data-theme={isDark ? 'dark' : 'light'}
			data-phase={phase}
			role='dialog'
			aria-modal='true'
			aria-label={t('chat.voice.start')}
			// portal 内のイベントは React ツリー上の祖先 (入力欄など) へ伝わるので、ここで止める
			onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) cancel() }}
			onClick={(e) => e.stopPropagation()}
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 100000,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 'var(--space-3)',
				padding: 'var(--space-4)',
				background: 'var(--color-overlay)',
				backdropFilter: 'blur(6px)',
				WebkitBackdropFilter: 'blur(6px)',
				color: 'var(--color-text)',
				fontFamily: 'var(--vscode-font-family, system-ui, sans-serif)',
				animation: 'orchestra-voice-fade-in 160ms ease-out',
				outline: 'none',
			}}
		>
			{phase !== 'error' ? <>
				<canvas
					ref={canvasRef}
					style={{ display: 'block', width: 'var(--wave-width)', height: 'var(--wave-height)', cursor: phase === 'recording' ? 'pointer' : 'default' }}
					onClick={finish}
					aria-hidden='true'
				/>
				<div role='status' aria-live='polite' style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.3 }}>{statusText}</div>
				{liveText && (
					<div style={{ maxWidth: 520, textAlign: 'center', fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-muted)', maxHeight: 120, overflow: 'auto' }}>{liveText}</div>
				)}
				<div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
					<button type='button' data-ov-btn='secondary' onClick={cancel} aria-label={t('chat.voice.cancel')}>{t('chat.voice.cancel')}</button>
					<button
						type='button'
						data-ov-btn='primary'
						onClick={finish}
						disabled={phase !== 'recording'}
						aria-label={t('chat.voice.done')}
					>{t('chat.voice.done')}</button>
				</div>
				<div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>{t('chat.voice.hint')}</div>
			</> : <>
				<div aria-hidden='true' style={{
					width: 72, height: 72, borderRadius: 'var(--radius-pill)', display: 'flex', alignItems: 'center', justifyContent: 'center',
					color: 'var(--color-error)', border: '2px solid var(--color-error)',
				}}>
					<Mic size={30} />
				</div>
				<div role='alert' style={{ maxWidth: 440, textAlign: 'center', fontSize: 14, lineHeight: 1.6 }}>
					{errorKey ? t(errorKey) : ''}
					{errorDetail && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 'var(--space-1)', wordBreak: 'break-word' }}>{errorDetail}</div>}
				</div>
				<button type='button' data-ov-btn='secondary' onClick={cancel}>{t('chat.voice.close')}</button>
			</>}
		</div>,
		document.body
	)
}
