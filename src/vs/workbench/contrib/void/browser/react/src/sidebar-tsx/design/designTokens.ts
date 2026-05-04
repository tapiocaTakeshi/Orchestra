/*---------------------------------------------------------------------------------------------
 *  SidebarChat Design Tokens
 *  writer 成果物（デザイン仕様書 §4, §6, §9, §14）を実装に落としたもの。
 *  - VS Code テーマ変数 / void-* カスタムプロパティをラップし、TS から参照できるようにする。
 *  - 直接色を書かず必ずこのファイル経由で参照することで「ダーク/ライト両対応」を担保する。
 *--------------------------------------------------------------------------------------------*/

export const surfaces = {
	/** メイン面 / 入力欄ベース */
	primary: 'var(--void-bg-1)',
	/** assistant card / tool header 面 */
	secondary: 'var(--void-bg-2)',
	/** 展開コンテンツ / コード背景 / command bar */
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

export const semanticColors = {
	/** accent（assistant 左ストライプ / focus / 進行中） */
	accent: 'var(--vscode-focusBorder)',
	warning: 'var(--void-warning)',
	/** success / approved */
	success: 'rgb(34 197 94)',
	/** error / rejected */
	error: 'rgb(239 68 68)',
	/** DnD / info tint */
	infoDrop: 'rgb(96 165 250)',
} as const;

export const radius = {
	sm: '4px',
	md: '6px',
	lg: '8px',
	xl: '12px',
	full: '9999px',
} as const;

export const motion = {
	/** hover / border などの即時フィードバック */
	fast: '100ms',
	/** 開閉 / カード遷移の標準 */
	normal: '200ms',
	/** streaming / loading dots */
	loading: '300ms',
} as const;

/**
 * 4px グリッドに揃えたスペーシング。
 * Tailwind の gap-1 = 4, gap-2 = 8, gap-3 = 12, gap-4 = 16 と対応させる。
 */
export const spacing = {
	dense: 4,
	base: 8,
	group: 12,
	section: 16,
} as const;

/**
 * writer §8 で定義されたすべてのステートを enum 化。
 * コンポーネントはこの値に対して一意に styling を決定する。
 */
export const messageState = {
	committed: 'committed',
	streaming: 'streaming',
	checkpointGhost: 'checkpointGhost',
	editing: 'editing',
} as const;
export type MessageState = typeof messageState[keyof typeof messageState];

export const toolState = {
	toolRequest: 'tool_request',
	runningNow: 'running_now',
	success: 'success',
	rejected: 'rejected',
	toolError: 'tool_error',
	invalidParams: 'invalid_params',
} as const;
export type ToolState = typeof toolState[keyof typeof toolState];

export const reviewState = {
	pending: 'pending',
	approved: 'approved',
	rejected: 'rejected',
} as const;
export type ReviewState = typeof reviewState[keyof typeof reviewState];

export const threadState = {
	idle: 'idle',
	llmRunning: 'llm_running',
	toolRunning: 'tool_running',
	awaitingUser: 'awaiting_user',
} as const;
export type ThreadState = typeof threadState[keyof typeof threadState];

/**
 * role → accent color mapper。
 * assistant は focusBorder、tool は状態に応じて warning/subtle を返す。
 */
export const getAccentForTool = (s: ToolState): string => {
	switch (s) {
		case toolState.toolError:
		case toolState.invalidParams:
			return semanticColors.warning;
		case toolState.rejected:
			return textColors.subtle;
		case toolState.success:
			return semanticColors.success;
		case toolState.runningNow:
		case toolState.toolRequest:
		default:
			return semanticColors.accent;
	}
};

export const getAccentForReview = (s: ReviewState): string => {
	switch (s) {
		case reviewState.approved: return semanticColors.success;
		case reviewState.rejected: return semanticColors.error;
		case reviewState.pending:
		default: return semanticColors.accent;
	}
};

export const designSpec = {
	surfaces,
	text: textColors,
	border: borderColors,
	semantic: semanticColors,
	radius,
	motion,
	spacing,
};

export default designSpec;