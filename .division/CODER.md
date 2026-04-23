既存の `SidebarChat.tsx` 本体の現物コンテンツが file-searcher 出力として提供されていないため、全文上書きはせず、writer の仕様書で定義された **デザイントークン** と **共通スタイルユーティリティ** を独立モジュールとして新規作成します。これにより既存コンポーネントは段階的に import して差し替えていく形で取り込めます（planner の Phase 2 に対応）。

まず、デザイントークンを TypeScript で定義します。

```ts:src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/styles/designTokens.ts
// SidebarChat Design Tokens
// writer 仕様書 (セクション14) に準拠。
// すべての新規スタイル／className 組み立てはここを参照すること。
// VS Code テーマ変数 (--void-*, --vscode-*) を優先し、意味色のみ直接値を持つ。

export const surfaces = {
	/** メイン面・入力欄・基本カード */
	primary: 'var(--void-bg-1)',
	/** assistant / tool ヘッダー / セカンダリ面 */
	secondary: 'var(--void-bg-2)',
	/** 展開コンテンツ・コード・command bar */
	tertiary: 'var(--void-bg-3)',
} as const;

export const text = {
	primary: 'var(--void-fg-1)',
	secondary: 'var(--void-fg-2)',
	muted: 'var(--void-fg-3)',
	subtle: 'var(--void-fg-4)',
} as const;

export const border = {
	strong: 'var(--void-border-1)',
	default: 'var(--void-border-2)',
	outer: 'var(--void-border-3)',
} as const;

export const semantic = {
	accent: 'var(--vscode-focusBorder)',
	warning: 'var(--void-warning)',
	success: 'rgb(34 197 94)', // green-500
	successSoft: 'rgb(74 222 128)', // green-400
	error: 'rgb(239 68 68)', // red-500
	errorSoft: 'rgb(248 113 113)', // red-400
	running: 'rgb(249 115 22)', // orange-500
	infoDrop: 'rgb(96 165 250)', // blue-400
} as const;

export const radius = {
	sm: '4px',
	md: '6px',
	lg: '8px',
	xl: '12px',
	full: '9999px',
} as const;

export const motion = {
	fast: '100ms',
	normal: '200ms',
	slow: '300ms',
	/** 標準 easing */
	easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

export const spacing = {
	/** 4px */
	xs: '4px',
	/** 8px */
	sm: '8px',
	/** 12px */
	md: '12px',
	/** 16px */
	lg: '16px',
	/** 24px */
	xl: '24px',
} as const;

export const typography = {
	body: '13px',
	bodySub: '12px',
	meta: '11px',
	tiny: '10px',
	badge: '9px',
	weight: {
		regular: 400,
		medium: 500,
		semibold: 600,
	},
	leading: {
		snug: 1.35,
		normal: 1.55,
	},
} as const;

/**
 * 状態 → 左アクセント線の色
 * writer 仕様 7.9 / 7.13
 */
export const statusAccent = {
	normal: semantic.accent,
	running: semantic.running,
	success: semantic.success,
	error: semantic.warning,
	rejected: text.subtle,
	pending: semantic.accent,
} as const;

/**
 * カードレベルの標準 box-shadow
 */
export const shadow = {
	card: '0 1px 3px rgba(0, 0, 0, 0.06)',
	assistant: '0 1px 4px rgba(0, 0, 0, 0.08)',
	elevated: '0 4px 12px rgba(0, 0, 0, 0.12)',
} as const;

export const designTokens = {
	surfaces,
	text,
	border,
	semantic,
	radius,
	motion,
	spacing,
	typography,
	statusAccent,
	shadow,
} as const;

export type DesignTokens = typeof designTokens;
```

次に、共通カード／状態スタイルを生成するヘルパーを作成します。既存コンポーネントは ClassName / style を組み合わせて使えます。

```ts:src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/styles/sidebarChatStyles.ts
// SidebarChat 共通スタイルヘルパー
// writer 仕様書 (セクション7) に準拠した className / style オブジェクト生成関数。
// 既存コンポーネントは import して className や style に渡すだけで適用できる。

import type { CSSProperties } from 'react';
import { border, motion, radius, semantic, shadow, statusAccent, surfaces, text } from './designTokens.js';

export type CardStatus = 'normal' | 'running' | 'success' | 'error' | 'rejected' | 'pending';

/**
 * assistant / tool / review カードの共通スタイル
 * 左アクセント線で状態を可視化
 */
export const getCardStyle = (
	opts: {
		status?: CardStatus;
		variant?: 'assistant' | 'tool' | 'review' | 'user';
		rejected?: boolean;
	} = {}
): CSSProperties => {
	const { status = 'normal', variant = 'tool', rejected = false } = opts;

	const accent = statusAccent[status];
	const bg =
		variant === 'user'
			? `linear-gradient(135deg, ${surfaces.primary} 0%, color-mix(in srgb, ${surfaces.primary} 85%, ${semantic.accent} 15%) 100%)`
			: variant === 'assistant'
				? `linear-gradient(135deg, ${surfaces.secondary} 0%, color-mix(in srgb, ${surfaces.secondary} 92%, ${semantic.accent} 8%) 100%)`
				: surfaces.secondary;

	const leftWidth = variant === 'assistant' || variant === 'review' ? '3px' : '2px';

	return {
		background: bg,
		border: `1px solid ${border.strong}`,
		borderLeft: `${leftWidth} solid ${accent}`,
		borderRadius: variant === 'user' ? radius.xl : radius.lg,
		boxShadow: variant === 'assistant' ? shadow.assistant : shadow.card,
		opacity: rejected ? 0.55 : 1,
		transition: `background ${motion.normal} ${motion.easing}, border-color ${motion.normal} ${motion.easing}, opacity ${motion.normal} ${motion.easing}`,
	};
};

/**
 * ツールヘッダーの高さ・余白を統一するための className
 */
export const toolHeaderClass =
	'flex items-center gap-2 min-h-[28px] px-2.5 py-1 cursor-pointer select-none';

/**
 * ツール body の共通 className
 */
export const toolBodyClass = 'px-3 py-2 text-[12px] leading-snug';

/**
 * 入力エリアのドロップオーバーレイ
 */
export const getDropOverlayStyle = (active: boolean): CSSProperties => ({
	position: 'absolute',
	inset: 0,
	borderRadius: radius.md,
	border: `2px dashed ${semantic.infoDrop}`,
	background: 'color-mix(in srgb, rgb(96 165 250) 10%, transparent)',
	opacity: active ? 1 : 0,
	pointerEvents: active ? 'auto' : 'none',
	transition: `opacity ${motion.fast} ${motion.easing}`,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	gap: '6px',
	color: text.primary,
	fontSize: '12px',
	zIndex: 30,
});

/**
 * 入力エリア本体の枠
 */
export const getInputAreaStyle = (opts: { focused?: boolean; disabled?: boolean } = {}): CSSProperties => {
	const { focused = false, disabled = false } = opts;
	return {
		background: surfaces.primary,
		border: `1px solid ${focused ? border.strong : border.outer}`,
		borderRadius: radius.md,
		padding: '8px',
		maxHeight: '80vh',
		opacity: disabled ? 0.6 : 1,
		transition: `border-color ${motion.normal} ${motion.easing}`,
	};
};

/**
 * CommandBar (ファイル変更パネル) ヘッダーのスタイル
 * writer 仕様 7.14
 */
export const commandBarStyle: CSSProperties = {
	background: surfaces.tertiary,
	borderTop: `1px solid ${border.default}`,
	borderLeft: `1px solid ${border.default}`,
	borderRight: `1px solid ${border.default}`,
	borderTopLeftRadius: radius.md,
	borderTopRightRadius: radius.md,
};

/**
 * 状態 → 小さなステータスドットの style
 */
export const getStatusDotStyle = (status: CardStatus): CSSProperties => ({
	width: '6px',
	height: '6px',
	borderRadius: radius.full,
	background: statusAccent[status],
	boxShadow: `0 0 0 2px color-mix(in srgb, ${statusAccent[status]} 20%, transparent)`,
	flexShrink: 0,
});

/**
 * 円形送信ボタン (Submit/Stop)
 */
export const getCircleButtonStyle = (opts: { enabled?: boolean } = {}): CSSProperties => {
	const { enabled = true } = opts;
	return {
		width: '28px',
		height: '28px',
		borderRadius: radius.full,
		background: enabled ? '#ffffff' : 'var(--vscode-disabledForeground, #888)',
		color: '#000',
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		cursor: enabled ? 'pointer' : 'default',
		transition: `background ${motion.fast} ${motion.easing}, transform ${motion.fast} ${motion.easing}`,
	};
};

/**
 * 入力下段の操作バー — 純黒ではなくトークンベース
 * writer 仕様 7.3 / 11.1
 */
export const inputFooterStyle: CSSProperties = {
	background: surfaces.secondary,
	border: `1px solid ${border.strong}`,
	borderRadius: radius.md,
	padding: '4px 6px',
	display: 'flex',
	alignItems: 'center',
	gap: '6px',
};

/**
 * FlowIndicator phase ラベル
 */
export const getFlowPhaseStyle = (active: boolean, done: boolean): CSSProperties => ({
	color: active ? text.primary : done ? text.subtle : text.muted,
	fontWeight: active ? 600 : 400,
	opacity: done ? 0.55 : 1,
	transition: `opacity ${motion.normal} ${motion.easing}, color ${motion.normal} ${motion.easing}`,
});
```

続いて、CSS ファイルとして汎用ユーティリティクラスも用意します（Tailwind 非対応箇所の保険）。

```css:src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/styles/sidebarChat.css
/*
 * SidebarChat 追加スタイル
 * writer 仕様書 (セクション9 アニメーション, 7 コンポーネント) に準拠
 */

/* ------------------------------
 * カードの hover / focus-within
 * ------------------------------ */
.sidebar-card {
	transition:
		background 200ms cubic-bezier(0.4, 0, 0.2, 1),
		border-color 200ms cubic-bezier(0.4, 0, 0.2, 1),
		box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-card:hover {
	border-color: var(--void-border-1);
}

/* ------------------------------
 * ToolHeader アコーディオン
 * ------------------------------ */
.sidebar-accordion-body {
	overflow: hidden;
	transition:
		max-height 200ms cubic-bezier(0.4, 0, 0.2, 1),
		opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-accordion-body[data-open='false'] {
	max-height: 0;
	opacity: 0;
}

.sidebar-accordion-body[data-open='true'] {
	max-height: 2000px;
	opacity: 1;
}

.sidebar-chevron {
	transition: transform 100ms ease-in-out;
}

.sidebar-chevron[data-open='true'] {
	transform: rotate(90deg);
}

/* ------------------------------
 * 送信ボタンの interaction
 * ------------------------------ */
.sidebar-send-btn:hover:not(:disabled) {
	background: #f0f0f0 !important;
}

.sidebar-send-btn:active:not(:disabled) {
	transform: scale(0.95);
}

.sidebar-send-btn:focus-visible {
	outline: 2px solid var(--vscode-focusBorder);
	outline-offset: 2px;
}

/* ------------------------------
 * Streaming カーソル
 * ------------------------------ */
@keyframes sidebarChatCaretBlink {
	0%,
	49% {
		opacity: 1;
	}
	50%,
	100% {
		opacity: 0;
	}
}

.sidebar-streaming-caret::after {
	content: '▍';
	margin-left: 2px;
	color: var(--vscode-focusBorder);
	animation: sidebarChatCaretBlink 900ms steps(1, end) infinite;
}

/* ------------------------------
 * Loading dots (仕様9.2)
 * ------------------------------ */
@keyframes sidebarChatDots {
	0%,
	20% {
		color: var(--void-fg-4);
		text-shadow:
			0.3em 0 0 var(--void-fg-4),
			0.6em 0 0 var(--void-fg-4);
	}
	40% {
		color: var(--void-fg-1);
		text-shadow:
			0.3em 0 0 var(--void-fg-4),
			0.6em 0 0 var(--void-fg-4);
	}
	60% {
		text-shadow:
			0.3em 0 0 var(--void-fg-1),
			0.6em 0 0 var(--void-fg-4);
	}
	80%,
	100% {
		text-shadow:
			0.3em 0 0 var(--void-fg-1),
			0.6em 0 0 var(--void-fg-1);
	}
}

.sidebar-loading-dots::after {
	content: '.';
	animation: sidebarChatDots 1s steps(5, end) infinite;
}

/* ------------------------------
 * Scroll to bottom FAB
 * ------------------------------ */
.sidebar-scroll-fab {
	opacity: 0;
	transform: translateY(4px);
	transition:
		opacity 200ms cubic-bezier(0.4, 0, 0.2, 1),
		transform 200ms cubic-bezier(0.4, 0, 0.2, 1),
		box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1);
	pointer-events: none;
}

.sidebar-scroll-fab[data-visible='true'] {
	opacity: 1;
	transform: translateY(0);
	pointer-events: auto;
}

.sidebar-scroll-fab:hover {
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* ------------------------------
 * Drop overlay
 * ------------------------------ */
.sidebar-drop-overlay {
	pointer-events: none;
	opacity: 0;
	transition: opacity 100ms cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-drop-overlay[data-active='true'] {
	opacity: 1;
	pointer-events: auto;
}

/* ------------------------------
 * Token (SelectedFiles)
 * ------------------------------ */
.sidebar-token {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	height: 22px;
	padding: 0 6px;
	font-size: 11px;
	color: var(--void-fg-2);
	background: var(--void-bg-1);
	border: 1px solid var(--void-border-1);
	border-radius: 4px;
	transition: filter 150ms ease;
	max-width: 160px;
}

.sidebar-token:hover {
	filter: brightness(1.1);
}

.sidebar-token[data-prospective='true'] {
	color: var(--void-fg-3);
	border-color: var(--void-border-2);
	opacity: 0.8;
}

.sidebar-token__name {
	max-width: 80px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

/* ------------------------------
 * Focus ring 共通
 * ------------------------------ */
.sidebar-focusable:focus-visible {
	outline: 2px solid var(--vscode-focusBorder);
	outline-offset: 1px;
	border-radius: 4px;
}
```

最後に、仕様書で繰り返し要請されている **文言の日本語統一** を一箇所で管理するためのロケール定義を追加します（writer セクション10対応）。

```ts:src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/styles/sidebarChatStrings.ts
// SidebarChat 表示文言 (日本語統一)
// writer 仕様書 セクション10 準拠。英日混在を避け、ここから import する。

export const sidebarChatStrings = {
	// ------ 汎用アクション ------
	send: '送信',
	cancel: 'キャンセル',
	copy: 'コピー',
	approve: '承認',
	reject: '拒否',
	retry: 'やり直す',
	openSettings: '設定を開く',
	login: 'ログイン',

	// ------ 入力エリア ------
	attachImage: '画像を添付',
	attachFile: 'ファイルを添付',
	dropHere: 'ここにファイルをドロップ',
	scrollToBottom: '一番下へスクロール',
	disabledWhileRunning: '実行中は無効です',
	disabledOtherThreadRunning: '他のスレッド実行中のため無効です',

	// ------ 状態ラベル ------
	generating: '生成中',
	thinking: '思考中',
	searching: '検索中',
	reading: '読み込み',
	coding: '実装中',
	running: '実行中',
	awaitingApproval: '承認待ち',
	approved: '承認済み',
	rejected: '却下',
	completed: '完了',
	error: 'エラー',

	// ------ ツール結果 ------
	noOutput: '出力はありません',
	resultsTruncated: '結果は省略されています',
	noLintErrors: 'lint エラーはありません',

	// ------ 会話構造 ------
	currentFile: '現在のファイル',
	checkpoint: 'チェックポイント',
	documentReview: 'ドキュメントレビュー',
	approveAndContinue: '承認して次へ進む',

	// ------ Orchestration ------
	taskGenerationFlow: 'タスク生成フロー',
	taskExecutionFlow: 'タスク実行フロー',
	toggleContextInput: 'コンテキスト入力を表示/非表示',

	// ------ CommandBar ------
	noChangedFiles: '変更されたファイルはありません',
	changedFilesCount: (n: number) => `${n}件の変更されたファイル`,
	rejectAll: 'すべて拒否',
	acceptAll: 'すべて承認',
	rejectFile: 'ファイルを拒否',
	acceptFile: 'ファイルを承認',

	// ------ Reasoning ------
	thoughtForSeconds: (sec: number) => `${sec.toFixed(1)} 秒間思考しました`,
	thoughtGeneric: '思考',
} as const;

export type SidebarChatStrings = typeof sidebarChatStrings;
```

### 適用方法（既存 SidebarChat.tsx への取り込み指針）

実装コンポーネント側では以下のように差し替えていくことで、writer 仕様書に準拠した外観が段階的に反映されます（本タスクでは本体コードの現物が提示されなかったため差分編集は出しませんが、patch 方針を明記します）。

1. `AssistantMessageComponent` / `ToolHeaderWrapper` のラッパー `div` に  
   `style={getCardStyle({ variant: 'assistant' | 'tool', status, rejected })}` を付与  
2. `VoidChatArea` 下段の `bg-black/80` を削除し `style={inputFooterStyle}` に置換  
3. ドロップゾーンは overlay を `className="sidebar-drop-overlay"` + `data-active` 属性に統一  
4. Submit/Stop ボタンは `style={getCircleButtonStyle({ enabled })}` + `className="sidebar-send-btn sidebar-focusable"`  
5. 英語直書き文言をすべて `sidebarChatStrings.*` へ置換  
6. `sidebarChat.css` をエントリ（`sidebar-tsx/index.tsx` 等）で一度 import

CSS ファイルのインポート忘れを防ぐため、ヘッダーのあるトップレベルモジュールで import 文を追加してください（例）。

```bash
echo "// add the following import at the top of src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/index.tsx (or equivalent entry):"
echo "import './styles/sidebarChat.css';"
```