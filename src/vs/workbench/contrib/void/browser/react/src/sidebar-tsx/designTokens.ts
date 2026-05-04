/**
 * SidebarChat デザイントークン
 *
 * - VS Code / void テーマ変数を最優先で使用
 * - 黒ベタ（bg-black/80 等）は禁止。必ず token 経由で指定する
 * - 状態は「色 + アイコン + 文言」の 3 点で伝える
 */

export const surfaces = {
	primary: 'var(--void-bg-1)',
	secondary: 'var(--void-bg-2)',
	tertiary: 'var(--void-bg-3)',
} as const;

export const textColors = {
	primary: 'var(--void-fg-1)',
	secondary: 'var(--void-fg-2)',
	muted: 'var(--void-fg-3)',
	subtle: 'var(--void-fg-4)',
} as const;

export const borderColors = {
	strong: 'var(--void-border-1)',
	default: 'var(--void-border-2)',
	outer: 'var(--void-border-3)',
} as const;

export const semantic = {
	accent: 'var(--vscode-focusBorder)',
	warning: 'var(--void-warning)',
	success: 'rgb(34, 197, 94)',    // green-500
	error: 'rgb(239, 68, 68)',      // red-500
	infoDrop: 'rgb(96, 165, 250)',  // blue-400
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
	loading: '300ms',
	easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/** カードの役割別スタイル（assistant / tool / review / user） */
export const cardStyles = {
	assistant: {
		background: `linear-gradient(135deg, ${surfaces.secondary} 0%, color-mix(in srgb, ${surfaces.secondary} 92%, ${semantic.accent} 8%) 100%)`,
		border: `1px solid ${borderColors.strong}`,
		borderLeft: `3px solid ${semantic.accent}`,
		borderRadius: radius.lg,
		padding: '12px 14px',
		boxShadow: '0 1px 4px rgba(0, 0, 0, 0.06)',
	},
	user: {
		background: `linear-gradient(135deg, ${surfaces.primary} 0%, color-mix(in srgb, ${surfaces.primary} 94%, ${semantic.accent} 6%) 100%)`,
		border: `1px solid ${borderColors.strong}`,
		borderRadius: radius.xl,
		padding: '10px 12px',
		boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
	},
	tool: {
		background: surfaces.secondary,
		border: `1px solid ${borderColors.strong}`,
		borderRadius: radius.md,
	},
	review: {
		background: surfaces.primary,
		border: `1px solid ${borderColors.strong}`,
		borderRadius: radius.lg,
		padding: '12px',
	},
} as const;

/** ツール／レビューの状態カラー（左アクセント線に使う） */
export const statusAccent = {
	normal: semantic.accent,
	running: semantic.accent,
	success: semantic.success,
	error: semantic.warning,
	rejected: textColors.subtle,
	pending: semantic.accent,
} as const;

/** 日本語ラベル辞書（英日混在を避けるための統一用） */
export const labels = {
	send: '送信',
	stop: '停止',
	approve: '承認',
	reject: '拒否',
	approveAll: 'すべて承認',
	rejectAll: 'すべて拒否',
	cancel: 'キャンセル',
	copy: 'コピー',
	error: 'エラー',
	thinking: '思考中',
	searching: '検索中',
	reading: '読み込み',
	coding: '実装中',
	running: '実行中',
	done: '完了',
	awaitingReview: 'レビュー待ち',
	approved: '承認済み',
	rejected: '却下',
	noLintErrors: 'lint エラーはありません',
	noOutput: '出力はありません',
	resultsTruncated: '結果は省略されています',
	scrollToBottom: '一番下へスクロール',
	attachImage: '画像を添付',
	openSettings: '設定を開く',
	currentFile: '現在のファイル',
	checkpoint: 'チェックポイント',
	disabledWhileRunning: '実行中は無効です',
	disabledAnotherThread: '他のスレッド実行中のため無効です',
	generating: '生成中',
	filesChanged: (n: number) => (n === 0 ? '変更されたファイルはありません' : `${n}件の変更されたファイル`),
	approveNextStep: '承認して次へ進む',
	retry: 'やり直す',
	dropHere: 'ここにファイルをドロップ',
	taskGenerationFlow: 'タスク生成フロー',
	taskExecutionFlow: 'タスク実行フロー',
	showContextInput: 'コンテキスト入力を表示',
	hideContextInput: 'コンテキスト入力を非表示',
} as const;
