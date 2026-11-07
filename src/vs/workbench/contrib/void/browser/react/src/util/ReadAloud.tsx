/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// AI が書いた文章の読み上げ。
// OS の音声 (speechSynthesis) が使えればそれで読み、使えなければ OpenAI の API キーがあるときだけ OpenAI の音声合成で読む。
// 同時に読むのは 1 つだけ。別の文章を読み始めたら前のものは止まる。

import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { useSettingsState } from './services.js';
import { useTranslation } from './i18n.js';

// ---------- 読み上げ用に Markdown をふつうの文にする ----------

export const markdownToSpeechText = (md: string, codeLabel: string): string => {
	let s = md.replace(/\r\n/g, '\n')
	// コードブロックは読まない
	s = s.replace(/```[\s\S]*?(```|$)/g, `\n${codeLabel}\n`)
	s = s.replace(/~~~[\s\S]*?(~~~|$)/g, `\n${codeLabel}\n`)
	s = s.replace(/<[^>\n]+>/g, ' ')                              // HTML タグ
	s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')                 // 画像
	s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')                  // リンク
	s = s.replace(/https?:\/\/\S+/g, ' ')                          // 生の URL
	s = s.replace(/`([^`]*)`/g, '$1')                              // インラインコード
	s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '')                       // 見出し
	s = s.replace(/^\s*>\s?/gm, '')                                // 引用
	s = s.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')                // チェックボックス
	s = s.replace(/^\s*[-*+]\s+/gm, '')                            // 箇条書き
	s = s.replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '') // 表の区切り
	s = s.replace(/^[ \t]*\|[ \t]*|[ \t]*\|[ \t]*$/gm, '')          // 表の行の両端
	s = s.replace(/\|/g, '、')                                      // 表のセル
	s = s.replace(/^\s*([-*_]\s*){3,}$/gm, '')                     // 区切り線
	s = s.replace(/(\*\*|__)(.*?)\1/g, '$2')                       // 太字
	s = s.replace(/(\*|_)([^*_\n]+)\1/g, '$2')                     // 斜体
	s = s.replace(/~~(.*?)~~/g, '$1')
	s = s.replace(/[ \t]+/g, ' ')
	s = s.replace(/\n{2,}/g, '\n')
	return s.trim()
}

const looksJapanese = (s: string) => {
	const ja = (s.match(/[぀-ヿ㐀-鿿]/g) ?? []).length
	return ja > 0 && ja * 4 >= (s.match(/[A-Za-z]/g) ?? []).length
}

// 長い発話は Chromium が途中で止めることがあるので、文の切れ目でおおよそ max 文字ずつに分ける
const splitForSpeech = (text: string, max: number): string[] => {
	const sentences = text.split(/(?<=[。！？!?\n]|\.\s)/)
	const out: string[] = []
	let cur = ''
	for (const raw of sentences) {
		const sentence = raw.trim()
		if (!sentence) continue
		if (sentence.length > max) {
			if (cur) { out.push(cur); cur = '' }
			for (let i = 0; i < sentence.length; i += max) out.push(sentence.slice(i, i + max))
			continue
		}
		if ((cur + ' ' + sentence).length > max && cur) { out.push(cur); cur = sentence }
		else cur = cur ? `${cur} ${sentence}` : sentence
	}
	if (cur) out.push(cur)
	return out
}

// ---------- 再生 (アプリ全体で 1 つ) ----------

type PlayerState = { id: string | null, status: 'idle' | 'loading' | 'speaking' }
let state: PlayerState = { id: null, status: 'idle' }
const listeners = new Set<() => void>()
const setState = (s: PlayerState) => { state = s; listeners.forEach(l => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const getSnapshot = () => state

let runToken = 0
let stopCurrent: (() => void) | null = null

export const stopReadAloud = () => {
	runToken++
	stopCurrent?.()
	stopCurrent = null
	setState({ id: null, status: 'idle' })
}

const synth = (): SpeechSynthesis | undefined => (globalThis as any).speechSynthesis

const loadVoices = async (): Promise<SpeechSynthesisVoice[]> => {
	const s = synth()
	if (!s) return []
	let voices = s.getVoices()
	if (voices.length) return voices
	await new Promise<void>(resolve => {
		const done = () => { s.removeEventListener?.('voiceschanged', done); resolve() }
		s.addEventListener?.('voiceschanged', done)
		setTimeout(done, 1200)
	})
	voices = s.getVoices()
	return voices
}

const pickVoice = (voices: SpeechSynthesisVoice[], lang: 'ja' | 'en') => {
	const matching = voices.filter(v => v.lang.toLowerCase().startsWith(lang))
	if (!matching.length) return undefined
	// 自然に聞こえることが多い声を優先する
	const preferred = matching.find(v => /natural|neural|premium|enhanced|siri|google/i.test(v.name))
	return preferred ?? matching.find(v => v.localService) ?? matching[0]
}

const speakWithSystem = (chunks: string[], voice: SpeechSynthesisVoice, token: number): Promise<void> => new Promise((resolve, reject) => {
	const s = synth()!
	s.cancel()
	let i = 0
	stopCurrent = () => { s.cancel(); resolve() }
	const next = () => {
		if (token !== runToken) return resolve()
		if (i >= chunks.length) return resolve()
		const u = new SpeechSynthesisUtterance(chunks[i++])
		u.voice = voice
		u.lang = voice.lang
		u.onend = next
		u.onerror = (e) => {
			if (e.error === 'canceled' || e.error === 'interrupted') return resolve()
			reject(new Error(e.error))
		}
		s.speak(u)
	}
	next()
})

const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech'

const fetchOpenAISpeech = async (text: string, apiKey: string, signal: AbortSignal): Promise<ArrayBuffer> => {
	const res = await fetch(OPENAI_SPEECH_URL, {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: text, response_format: 'mp3' }),
		signal,
	})
	if (!res.ok) {
		let detail = `HTTP ${res.status}`
		try { const j = await res.json(); if (j?.error?.message) detail = j.error.message } catch { /* not json */ }
		throw new Error(detail)
	}
	return res.arrayBuffer()
}

// ウインドウの CSP では blob: の音声を <audio> で鳴らせないので、Web Audio で鳴らす
const speakWithOpenAI = async (chunks: string[], apiKey: string, token: number, onFirstAudio: () => void): Promise<void> => {
	const controller = new AbortController()
	const ctx = new AudioContext()
	let source: AudioBufferSourceNode | null = null
	let stopped = false
	stopCurrent = () => {
		stopped = true
		controller.abort()
		try { source?.stop() } catch { /* not started */ }
		ctx.close().catch(() => { })
	}
	try {
		// 次の部分は今の部分を鳴らしている間に取ってくる
		let pending = fetchOpenAISpeech(chunks[0], apiKey, controller.signal)
		for (let i = 0; i < chunks.length; i++) {
			const buf = await pending
			if (stopped || token !== runToken) return
			if (i + 1 < chunks.length) pending = fetchOpenAISpeech(chunks[i + 1], apiKey, controller.signal)
			const audio = await ctx.decodeAudioData(buf)
			if (stopped || token !== runToken) return
			if (i === 0) onFirstAudio()
			await new Promise<void>(resolve => {
				source = ctx.createBufferSource()
				source.buffer = audio
				source.connect(ctx.destination)
				source.onended = () => resolve()
				source.start()
			})
		}
	} catch (e: any) {
		if (stopped || e?.name === 'AbortError') return
		throw e
	} finally {
		if (!stopped) ctx.close().catch(() => { })
	}
}

class NoEngineError extends Error { }

export const startReadAloud = async (id: string, text: string, openAIKey: string) => {
	stopReadAloud()
	const token = runToken
	setState({ id, status: 'loading' })
	const lang: 'ja' | 'en' = looksJapanese(text) ? 'ja' : 'en'
	try {
		const voices = await loadVoices()
		if (token !== runToken) return
		const voice = pickVoice(voices, lang)
		if (voice) {
			setState({ id, status: 'speaking' })
			await speakWithSystem(splitForSpeech(text, 180), voice, token)
		} else if (openAIKey) {
			await speakWithOpenAI(splitForSpeech(text, 3500), openAIKey, token, () => {
				if (token === runToken) setState({ id, status: 'speaking' })
			})
		} else {
			throw new NoEngineError()
		}
	} finally {
		if (token === runToken) { stopCurrent = null; setState({ id: null, status: 'idle' }) }
	}
}

// ---------- ボタン ----------

/**
 * 読み上げボタン。押すと text (Markdown) を読み、読んでいる間は停止ボタンになる。
 * id はアプリ全体でこの文章を見分けるためのもの。
 */
export const ReadAloudButton = ({ id, text, showLabel = false, className = '' }: { id: string, text: string, showLabel?: boolean, className?: string }) => {
	const { t } = useTranslation()
	const openAIKey = useSettingsState().settingsOfProvider.openAI?.apiKey?.trim() || ''
	const player = useSyncExternalStore(subscribe, getSnapshot)
	const isMine = player.id === id
	const status = isMine ? player.status : 'idle'
	const [error, setError] = useState<string | null>(null)

	// 画面から消えたら読み上げも止める
	useEffect(() => () => { if (getSnapshot().id === id) stopReadAloud() }, [id])

	useEffect(() => {
		if (!error) return
		const timer = setTimeout(() => setError(null), 6000)
		return () => clearTimeout(timer)
	}, [error])

	const onClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
		if (status !== 'idle') { stopReadAloud(); return }
		const speech = markdownToSpeechText(text, t('chat.readAloud.codeOmitted'))
		if (!speech) return
		setError(null)
		startReadAloud(id, speech, openAIKey).catch((err: any) => {
			setError(err instanceof NoEngineError ? t('chat.readAloud.error.noEngine') : `${t('chat.readAloud.error.failed')}: ${err?.message ?? err}`)
		})
	}, [id, openAIKey, status, t, text])

	const label = status === 'idle' ? t('chat.readAloud.start') : t('chat.readAloud.stop')
	const tooltip = error ?? label

	return <button
		type='button'
		onClick={onClick}
		className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] cursor-pointer transition-colors duration-150
			${error ? 'text-[var(--vscode-errorForeground)]' : status !== 'idle' ? 'text-void-fg-1 bg-void-bg-2' : 'text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-2'}
			${className}`}
		data-tooltip-id='void-tooltip'
		data-tooltip-content={tooltip}
		data-tooltip-place='top'
		aria-label={label}
		aria-pressed={status !== 'idle'}
	>
		{status === 'loading' ? <Loader2 size={13} className='animate-spin' />
			: status === 'speaking' ? <SpeakingIcon />
				: <Volume2 size={13} className='stroke-[1.8]' />}
		{showLabel && <span>{label}</span>}
		{error && !showLabel && <span className='max-w-[220px] truncate'>{error}</span>}
	</button>
}

// 読んでいる間の印: 揺れる 3 本の線。押すと止まることが分かるよう、ホバーで停止の四角に変える
const SpeakingIcon = () => {
	const [hover, setHover] = useState(false)
	if (hover) return <span onMouseLeave={() => setHover(false)} className='inline-flex'><Square size={12} className='stroke-[2.2]' /></span>
	return <span onMouseEnter={() => setHover(true)} className='inline-flex items-end gap-[2px] h-[13px] w-[13px] justify-center' aria-hidden='true'>
		<style>{`@keyframes orchestra-read-aloud-bar { 0%,100% { transform: scaleY(0.35) } 50% { transform: scaleY(1) } }`}</style>
		{[0, 0.2, 0.4].map((d, i) => <span key={i} style={{
			display: 'inline-block', width: 2.5, height: 12, borderRadius: 2, background: 'currentColor',
			transformOrigin: 'bottom', animation: `orchestra-read-aloud-bar 0.9s ease-in-out ${d}s infinite`,
		}} />)}
	</span>
}
