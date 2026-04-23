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
