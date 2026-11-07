/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// チャット入力欄の音声入力。
// マイクボタンを押すとウインドウの真ん中に声の大きさに合わせて動くエフェクトを出し、話し終えたら文字にして入力欄へ入れる。
// 文字起こしは、OpenAI の API キーが設定されていればそれ (録音して送る) を使い、なければ Chromium の音声認識を試す。
// Electron の音声認識は使えないことが多いので、その場合は API キーを入れるよう案内する。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic } from 'lucide-react';
import { useSettingsState } from './services.js';
import { TranslationKey, useTranslation } from './i18n.js';

type Phase = 'starting' | 'listening' | 'transcribing' | 'error'

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

/** 入力欄に並べるマイクボタン。押すと音声入力のオーバーレイを開く。 */
export const ButtonVoiceInput = ({ onTranscript, disabled }: { onTranscript: (text: string) => void, disabled?: boolean }) => {
	const { t } = useTranslation()
	const [isOpen, setIsOpen] = useState(false)
	return <>
		<button
			type='button'
			className={`p-1 rounded text-void-fg-3 transition-colors duration-150 ${disabled ? 'opacity-50 cursor-default' : 'cursor-pointer hover:text-void-fg-1 hover:bg-void-bg-2'} ${isOpen ? 'text-void-fg-1 bg-void-bg-2' : ''}`}
			onClick={(e) => { e.stopPropagation(); if (!disabled) setIsOpen(true) }}
			disabled={disabled}
			data-tooltip-id='void-tooltip'
			data-tooltip-content={t('chat.voice.start')}
			data-tooltip-place='top'
			aria-label={t('chat.voice.start')}
			aria-pressed={isOpen}
		>
			<Mic size={16} className='stroke-[1.5]' />
		</button>
		{isOpen && <VoiceInputOverlay
			onClose={() => setIsOpen(false)}
			onTranscript={(text) => { setIsOpen(false); onTranscript(text) }}
		/>}
	</>
}

/** ウインドウの真ん中に出す音声入力の画面。開いた時点で聞き取りを始める。 */
const VoiceInputOverlay = ({ onClose, onTranscript }: { onClose: () => void, onTranscript: (text: string) => void }) => {
	const { t, language } = useTranslation()
	const openAIKey = useSettingsState().settingsOfProvider.openAI?.apiKey?.trim() || ''

	const [phase, setPhase] = useState<Phase>('starting')
	const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)
	const [errorDetail, setErrorDetail] = useState('')
	const [liveText, setLiveText] = useState('')

	const canvasRef = useRef<HTMLCanvasElement | null>(null)
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

	const fail = useCallback((key: TranslationKey, detail = '') => {
		setErrorKey(key)
		setErrorDetail(detail)
		setPhaseBoth('error')
	}, [setPhaseBoth])

	// マイク・音声認識・描画をすべて止める。何度呼んでもよい。
	const stopEverything = useCallback(() => {
		if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
		rafRef.current = null
		try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop() } catch { /* already stopped */ }
		try { recognitionRef.current?.abort() } catch { /* already stopped */ }
		recognitionRef.current = null
		streamRef.current?.getTracks().forEach(tr => tr.stop())
		streamRef.current = null
		audioCtxRef.current?.close().catch(() => { })
		audioCtxRef.current = null
		analyserRef.current = null
	}, [])

	const cancel = useCallback(() => {
		closedRef.current = true
		abortRef.current?.abort()
		stopEverything()
		onClose()
	}, [onClose, stopEverything])

	const deliver = useCallback((text: string) => {
		if (closedRef.current) return
		const trimmed = text.trim()
		if (!trimmed) { stopEverything(); fail('chat.voice.error.empty'); return }
		closedRef.current = true
		stopEverything()
		onTranscript(trimmed)
	}, [fail, onTranscript, stopEverything])

	// 話し終えた: 録音なら送って文字にし、音声認識なら止めて結果を受け取る。
	const finish = useCallback(() => {
		if (phaseRef.current !== 'listening' || finishingRef.current) return
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
			const mime = recorder.mimeType || 'audio/webm'
			const blob = new Blob(chunksRef.current, { type: mime })
			// 録音は済んだのでマイクは先に離す (描画は文字起こし中も続ける)
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
				deliver(typeof j?.text === 'string' ? j.text : '')
			} catch (e: any) {
				if (closedRef.current || e?.name === 'AbortError') return
				stopEverything()
				fail('chat.voice.error.transcribe', e?.message ?? String(e))
			}
		}
		try { recorder.stop() } catch { deliver('') }
	}, [deliver, fail, language, openAIKey, setPhaseBoth, stopEverything])

	// 開いたらマイクを取り、聞き取りを始める
	useEffect(() => {
		let disposed = false
		const start = async () => {
			let stream: MediaStream
			try {
				stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
			} catch (e: any) {
				if (!disposed) fail('chat.voice.error.mic', e?.message ?? '')
				return
			}
			if (disposed) { stream.getTracks().forEach(tr => tr.stop()); return }
			streamRef.current = stream

			// 声の大きさを読むための解析器
			try {
				const ctx = new AudioContext()
				const source = ctx.createMediaStreamSource(stream)
				const analyser = ctx.createAnalyser()
				analyser.fftSize = 256
				analyser.smoothingTimeConstant = 0.75
				source.connect(analyser)
				audioCtxRef.current = ctx
				analyserRef.current = analyser
			} catch { /* エフェクトは声に反応しないだけで、入力はできる */ }

			if (openAIKey && typeof MediaRecorder !== 'undefined') {
				const mimeType = pickRecorderMimeType()
				const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
				chunksRef.current = []
				recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data) }
				recorder.start(250)
				recorderRef.current = recorder
				setPhaseBoth('listening')
				return
			}

			const Ctor = getSpeechRecognitionCtor()
			if (!Ctor) { stopEverything(); fail('chat.voice.error.noEngine'); return }
			const recognition = new Ctor()
			recognition.lang = language === 'en' ? 'en-US' : 'ja-JP'
			recognition.continuous = true
			recognition.interimResults = true
			recognition.onresult = (ev: any) => {
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
				stopEverything()
				if (err === 'not-allowed') fail('chat.voice.error.mic')
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
				stopEverything()
				fail('chat.voice.error.noEngine', e?.message ?? '')
				return
			}
			recognitionRef.current = recognition
			setPhaseBoth('listening')
		}
		start()
		return () => {
			disposed = true
			closedRef.current = true
			abortRef.current?.abort()
			stopEverything()
		}
		// 開いたときに一度だけ始める
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// エフェクトの描画
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const g = canvas.getContext('2d')
		if (!g) return
		const SIZE = 280
		const dpr = window.devicePixelRatio || 1
		canvas.width = SIZE * dpr
		canvas.height = SIZE * dpr
		g.scale(dpr, dpr)

		const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
		const BAR_COUNT = 64
		const freq = new Uint8Array(128)
		const smoothBars = new Float32Array(BAR_COUNT)
		let level = 0
		const t0 = performance.now()

		const draw = () => {
			const now = performance.now()
			const time = (now - t0) / 1000
			const analyser = analyserRef.current
			const p = phaseRef.current

			let raw = 0
			if (analyser && p === 'listening') {
				analyser.getByteFrequencyData(freq)
				let sum = 0
				for (let i = 0; i < freq.length; i++) sum += freq[i]
				raw = Math.min(1, (sum / freq.length / 255) * 2.6)
			}
			level += (raw - level) * 0.18

			const cx = SIZE / 2
			const cy = SIZE / 2
			g.clearRect(0, 0, SIZE, SIZE)

			const isWaiting = p === 'transcribing' || p === 'starting'
			const pulse = isWaiting ? (Math.sin(time * 3) + 1) / 2 : 0
			const baseR = 58
			const r = baseR + level * 26 + pulse * 6

			// 外側のぼんやりした光
			const glow = g.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 2.1)
			glow.addColorStop(0, `rgba(139, 92, 246, ${0.35 + level * 0.35})`)
			glow.addColorStop(0.5, `rgba(56, 189, 248, ${0.12 + level * 0.2})`)
			glow.addColorStop(1, 'rgba(56, 189, 248, 0)')
			g.fillStyle = glow
			g.beginPath()
			g.arc(cx, cy, r * 2.1, 0, Math.PI * 2)
			g.fill()

			// 声に合わせて伸びる放射状の線
			if (p === 'listening') {
				const rot = reducedMotion ? 0 : time * 0.25
				for (let i = 0; i < BAR_COUNT; i++) {
					// 左右対称にして見た目を落ち着かせる
					const half = BAR_COUNT / 2
					const k = i < half ? i : BAR_COUNT - 1 - i
					const v = analyser ? freq[Math.floor((k / half) * 72) + 2] / 255 : 0
					smoothBars[i] += (v - smoothBars[i]) * 0.3
					const len = 4 + smoothBars[i] * 46
					const a = rot + (i / BAR_COUNT) * Math.PI * 2
					const x1 = cx + Math.cos(a) * (r + 10)
					const y1 = cy + Math.sin(a) * (r + 10)
					const x2 = cx + Math.cos(a) * (r + 10 + len)
					const y2 = cy + Math.sin(a) * (r + 10 + len)
					const hue = 200 + (i / BAR_COUNT) * 120
					g.strokeStyle = `hsla(${hue}, 90%, 70%, ${0.45 + smoothBars[i] * 0.55})`
					g.lineWidth = 3
					g.lineCap = 'round'
					g.beginPath()
					g.moveTo(x1, y1)
					g.lineTo(x2, y2)
					g.stroke()
				}
			}

			// 文字起こし中は回る弧
			if (isWaiting && !reducedMotion) {
				g.strokeStyle = 'rgba(255,255,255,0.85)'
				g.lineWidth = 3
				g.lineCap = 'round'
				g.beginPath()
				g.arc(cx, cy, r + 16, time * 4, time * 4 + Math.PI * 0.6)
				g.stroke()
			}

			// 中心の玉 (表面がゆらぐ)
			const orb = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
			orb.addColorStop(0, '#8b5cf6')
			orb.addColorStop(0.55, '#6366f1')
			orb.addColorStop(1, '#22d3ee')
			g.fillStyle = orb
			g.beginPath()
			const POINTS = 72
			for (let i = 0; i <= POINTS; i++) {
				const a = (i / POINTS) * Math.PI * 2
				const wobble = reducedMotion ? 0 : (Math.sin(a * 3 + time * 2.2) * 0.5 + Math.sin(a * 5 - time * 3.1) * 0.5) * (1.5 + level * 7)
				const rr = r + wobble
				const x = cx + Math.cos(a) * rr
				const y = cy + Math.sin(a) * rr
				if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
			}
			g.closePath()
			g.fill()

			// 玉のつや
			const shine = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 2, cx - r * 0.2, cy - r * 0.2, r)
			shine.addColorStop(0, 'rgba(255,255,255,0.45)')
			shine.addColorStop(1, 'rgba(255,255,255,0)')
			g.fillStyle = shine
			g.beginPath()
			g.arc(cx, cy, r, 0, Math.PI * 2)
			g.fill()

			rafRef.current = requestAnimationFrame(draw)
		}
		rafRef.current = requestAnimationFrame(draw)
		return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); rafRef.current = null }
	}, [phase === 'error'])

	// Enter で完了、Esc でやめる
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel() }
			else if (e.key === 'Enter' && phaseRef.current === 'listening') { e.preventDefault(); e.stopPropagation(); finish() }
		}
		window.addEventListener('keydown', onKey, true)
		return () => window.removeEventListener('keydown', onKey, true)
	}, [cancel, finish])

	const statusText = phase === 'listening' ? t('chat.voice.listening')
		: phase === 'transcribing' ? t('chat.voice.transcribing')
			: phase === 'starting' ? '…'
				: ''

	const buttonBase: React.CSSProperties = {
		border: '1px solid rgba(255,255,255,0.28)',
		borderRadius: 999,
		padding: '7px 18px',
		fontSize: 13,
		cursor: 'pointer',
		color: '#fff',
		background: 'rgba(255,255,255,0.08)',
	}

	return createPortal(
		<div
			role='dialog'
			aria-modal='true'
			aria-label={t('chat.voice.start')}
			onMouseDown={(e) => { if (e.target === e.currentTarget) cancel() }}
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 100000,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 14,
				padding: 16,
				background: 'rgba(8, 8, 16, 0.55)',
				backdropFilter: 'blur(6px)',
				WebkitBackdropFilter: 'blur(6px)',
				color: '#fff',
				fontFamily: 'var(--vscode-font-family, system-ui, sans-serif)',
				animation: 'orchestra-voice-fade-in 160ms ease-out',
			}}
		>
			<style>{`@keyframes orchestra-voice-fade-in { from { opacity: 0 } to { opacity: 1 } }`}</style>

			{phase !== 'error' ? <>
				<canvas
					ref={canvasRef}
					style={{ width: 280, height: 280, maxWidth: '80vw', maxHeight: '80vw', cursor: phase === 'listening' ? 'pointer' : 'default' }}
					onClick={finish}
					aria-hidden='true'
				/>
				<div role='status' aria-live='polite' style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.3 }}>{statusText}</div>
				{liveText && (
					<div style={{ maxWidth: 520, textAlign: 'center', fontSize: 14, lineHeight: 1.6, opacity: 0.92, maxHeight: 120, overflow: 'auto' }}>{liveText}</div>
				)}
				<div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
					<button type='button' style={buttonBase} onClick={cancel}>{t('chat.voice.cancel')}</button>
					<button
						type='button'
						style={{ ...buttonBase, background: '#fff', color: '#111', border: '1px solid #fff', opacity: phase === 'listening' ? 1 : 0.5, cursor: phase === 'listening' ? 'pointer' : 'default' }}
						onClick={finish}
						disabled={phase !== 'listening'}
					>{t('chat.voice.done')}</button>
				</div>
				<div style={{ fontSize: 11, opacity: 0.6 }}>{t('chat.voice.hint')}</div>
			</> : <>
				<div style={{
					width: 72, height: 72, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
					background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
				}}>
					<Mic size={30} />
				</div>
				<div role='alert' style={{ maxWidth: 440, textAlign: 'center', fontSize: 14, lineHeight: 1.6 }}>
					{errorKey ? t(errorKey) : ''}
					{errorDetail && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4, wordBreak: 'break-word' }}>{errorDetail}</div>}
				</div>
				<button type='button' style={buttonBase} onClick={cancel}>{t('chat.voice.close')}</button>
			</>}
		</div>,
		document.body
	)
}
