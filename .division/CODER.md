前回レビューで「探索や説明だけで終わらず、実ファイルの差分/新規作成を必ず出力する」「既存ファイルを全文上書きしない」という指摘があったため、今回は **SidebarChat のデザイン仕様を実装コードに落とし込んだ新規ファイル** を複数追加します。

ワークスペースに存在する唯一の既存ファイル `.build/extensions/theme-quietlight/themes/quietlight-color-theme.json` は VS Code の QuietLight テーマ定義で、今回の要求（SidebarChat の UI 演出）とは直接関係しないため、差分編集の対象からは外します（関連しない既存ファイルを編集して壊すことを避けるため）。

代わりに、中間エージェントの設計仕様（designTokens、カード化、日本語統一、状態表現の 3 点可視化）を満たす **新規ファイル** を作成します。

---

### 1. デザイントークン定義（共通スタイル基盤）

```ts:src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/designTokens.ts
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
```

---

### 2. 状態バッジ（色 + アイコン + 文言 の 3 点可視化）

```tsx:src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/StatusBadge.tsx
import * as React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Clock } from 'lucide-react';
import { semantic, textColors, labels } from './designTokens';

export type StatusKind = 'running' | 'success' | 'error' | 'rejected' | 'pending';

interface StatusBadgeProps {
	kind: StatusKind;
	/** テキストを省略してアイコンのみにする（密な UI 向け） */
	iconOnly?: boolean;
	/** テキストを上書きしたい場合 */
	text?: string;
}

const META: Record<StatusKind, { color: string; label: string; Icon: React.ComponentType<{ size?: number; className?: string }>; ariaLabel: string }> = {
	running: { color: semantic.accent, label: labels.running, Icon: Loader2, ariaLabel: '実行中' },
	success: { color: semantic.success, label: labels.done, Icon: CheckCircle2, ariaLabel: '完了' },
	error: { color: semantic.error, label: labels.error, Icon: AlertTriangle, ariaLabel: 'エラー' },
	rejected: { color: textColors.subtle, label: labels.rejected, Icon: XCircle, ariaLabel: '却下' },
	pending: { color: semantic.accent, label: labels.awaitingReview, Icon: Clock, ariaLabel: 'レビュー待ち' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ kind, iconOnly, text }) => {
	const meta = META[kind];
	const { Icon } = meta;
	const isSpinning = kind === 'running';
	return (
		<span
			role="status"
			aria-label={meta.ariaLabel}
			className="inline-flex items-center gap-1 text-[11px] font-medium leading-none select-none"
			style={{ color: meta.color }}
		>
			<Icon
				size={12}
				className={isSpinning ? 'animate-spin' : undefined}
				aria-hidden="true"
			/>
			{!iconOnly && <span>{text ?? meta.label}</span>}
		</span>
	);
};

export default StatusBadge;
```

---

### 3. 汎用カード（assistant / tool / review の共通土台）

```tsx:src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/ChatCard.tsx
import * as React from 'react';
import { cardStyles, statusAccent, motion, radius, borderColors, surfaces } from './designTokens';

type Variant = 'assistant' | 'user' | 'tool' | 'review';
type Status = keyof typeof statusAccent;

interface ChatCardProps {
	variant: Variant;
	status?: Status;
	className?: string;
	style?: React.CSSProperties;
	role?: string;
	ariaLabel?: string;
	children: React.ReactNode;
}

/**
 * SidebarChat 内のカード表現を 1 つに統一するラッパー。
 * - variant で基本の面・ボーダー・角丸を決定
 * - status で左アクセント線の色のみを切り替え（本文は赤く塗らない）
 */
export const ChatCard: React.FC<ChatCardProps> = ({
	variant,
	status = 'normal',
	className,
	style,
	role,
	ariaLabel,
	children,
}) => {
	const base = cardStyles[variant];
	const accentColor = statusAccent[status as keyof typeof statusAccent] ?? statusAccent.normal;

	const mergedStyle: React.CSSProperties = {
		...base,
		// variant が assistant の場合は既存の borderLeft を尊重しつつ status で上書き
		borderLeft:
			variant === 'assistant' || variant === 'tool'
				? `3px solid ${accentColor}`
				: (base as React.CSSProperties).borderLeft,
		transition: `background ${motion.normal} ${motion.easing}, border-color ${motion.normal} ${motion.easing}, box-shadow ${motion.normal} ${motion.easing}`,
		...style,
	};

	return (
		<div
			role={role}
			aria-label={ariaLabel}
			className={className}
			style={mergedStyle}
		>
			{children}
		</div>
	);
};

/** collapse/expand を伴うカード内ヘッダー（ToolHeaderWrapper 互換の簡易版） */
export const ChatCardHeader: React.FC<{
	title: React.ReactNode;
	meta?: React.ReactNode;
	right?: React.ReactNode;
	isOpen?: boolean;
	onToggle?: () => void;
	ariaControls?: string;
}> = ({ title, meta, right, isOpen, onToggle, ariaControls }) => {
	const clickable = typeof onToggle === 'function';
	return (
		<div
			role={clickable ? 'button' : undefined}
			tabIndex={clickable ? 0 : undefined}
			aria-expanded={clickable ? isOpen : undefined}
			aria-controls={ariaControls}
			onClick={clickable ? onToggle : undefined}
			onKeyDown={
				clickable
					? (e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onToggle!();
							}
						}
					: undefined
			}
			className="flex items-center justify-between gap-2 px-2.5 py-1.5 min-h-[28px] select-none"
			style={{
				cursor: clickable ? 'pointer' : 'default',
				borderTopLeftRadius: radius.md,
				borderTopRightRadius: radius.md,
				color: 'var(--void-fg-2)',
				background: surfaces.secondary,
				borderBottom: isOpen ? `1px solid ${borderColors.default}` : undefined,
				transition: `background ${motion.fast} ${motion.easing}`,
			}}
			onMouseEnter={(e) => {
				if (clickable) (e.currentTarget as HTMLElement).style.background = surfaces.tertiary;
			}}
			onMouseLeave={(e) => {
				if (clickable) (e.currentTarget as HTMLElement).style.background = surfaces.secondary;
			}}
		>
			<div className="flex items-center gap-2 min-w-0 flex-1">
				{clickable && (
					<span
						aria-hidden="true"
						className="inline-block transition-transform"
						style={{
							transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
							transitionDuration: motion.fast,
						}}
					>
						▸
					</span>
				)}
				<span className="text-[12px] font-medium truncate">{title}</span>
				{meta && <span className="text-[11px] truncate" style={{ color: 'var(--void-fg-3)' }}>{meta}</span>}
			</div>
			{right && <div className="flex items-center gap-1.5 shrink-0">{right}</div>}
		</div>
	);
};

export default ChatCard;
```

---

### 4. SidebarChat 専用の polish スタイル（Tailwind 非依存のスタイルシート）

```css:src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/sidebar-chat.polish.css
/*
 * SidebarChat のデザイン仕上げ用スタイル。
 * - bg-black/80 のような黒ベタを避け、VS Code テーマトークンに合わせる
 * - フォーカスリング / hover / disabled を一貫化
 * - 状態は色・アイコン・文言の 3 点で伝えるため、ここでは色の補助だけを担当
 */

.sc-input-wrap {
	background: var(--void-bg-1);
	border: 1px solid var(--void-border-3);
	border-radius: 6px;
	transition: border-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
		box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.sc-input-wrap:hover {
	border-color: var(--void-border-1);
}

.sc-input-wrap:focus-within {
	border-color: var(--vscode-focusBorder);
	box-shadow: 0 0 0 1px var(--vscode-focusBorder);
}

.sc-input-wrap[data-drag-over='true'] {
	border-color: rgb(96, 165, 250);
	background: color-mix(in srgb, var(--void-bg-1) 88%, rgb(96, 165, 250) 12%);
}

/* 入力欄下段の操作バー：黒ベタ禁止、必ずトークンベース */
.sc-input-bar {
	background: var(--void-bg-2);
	border-top: 1px solid var(--void-border-1);
	border-bottom-left-radius: 6px;
	border-bottom-right-radius: 6px;
}

/* Submit / Stop 円形ボタン */
.sc-round-btn {
	width: 28px;
	height: 28px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 9999px;
	background: #fff;
	color: #000;
	transition: transform 100ms ease, background 150ms ease, opacity 150ms ease;
	cursor: pointer;
}

.sc-round-btn:hover {
	background: #ececec;
}

.sc-round-btn:active {
	transform: scale(0.96);
}

.sc-round-btn:focus-visible {
	outline: 2px solid var(--vscode-focusBorder);
	outline-offset: 2px;
}

.sc-round-btn[disabled],
.sc-round-btn[aria-disabled='true'] {
	background: var(--vscode-disabledForeground, rgba(255, 255, 255, 0.3));
	cursor: default;
	opacity: 0.7;
}

/* トークン（添付ファイルチップ） */
.sc-token {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 6px;
	border: 1px solid var(--void-border-1);
	background: var(--void-bg-1);
	color: var(--void-fg-2);
	border-radius: 4px;
	font-size: 11px;
	line-height: 1.2;
	transition: filter 150ms ease, border-color 150ms ease;
}

.sc-token:hover {
	filter: brightness(1.08);
}

.sc-token[data-prospective='true'] {
	border-color: var(--void-border-2);
	color: var(--void-fg-3);
	opacity: 0.8;
}

/* FlowIndicator のフェーズ表示 */
.sc-flow-phase {
	font-size: 11px;
	line-height: 1;
	color: var(--void-fg-3);
	transition: color 150ms ease, opacity 150ms ease;
}

.sc-flow-phase[data-active='true'] {
	color: var(--void-fg-1);
	font-weight: 600;
}

.sc-flow-phase[data-done='true'] {
	opacity: 0.5;
}

/* アコーディオン */
.sc-accordion-body {
	overflow: hidden;
	transition: max-height 200ms cubic-bezier(0.4, 0, 0.2, 1),
		opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.sc-accordion-body[data-open='false'] {
	max-height: 0;
	opacity: 0;
}

.sc-accordion-body[data-open='true'] {
	max-height: 2000px;
	opacity: 1;
}

/* スクリーンリーダー用 */
.sc-sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
```

---

### 5. 使い方メモ（実装側から参照するためのインデックス）

```ts:src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/designSystem.ts
/**
 * SidebarChat デザインシステム エントリポイント。
 * 既存の SidebarChat.tsx から最小差分でインポートして使えるように集約する。
 *
 * 使用例:
 *   import { ChatCard, ChatCardHeader, StatusBadge, tokens, labels } from './designSystem';
 *   import './sidebar-chat.polish.css';
 *
 * 移行方針:
 *   1. `bg-black/80` など黒ベタクラスを見つけたら `sc-input-bar` に置換する
 *   2. ツールカードのコンテナを `ChatCard variant="tool" status={...}` に置換する
 *   3. 状態表示（Error / Running / Rejected）を `StatusBadge` に置換する
 *   4. 英語ラベルを `labels.*` 参照に置換する
 */

export { ChatCard, ChatCardHeader } from './ChatCard';
export { StatusBadge } from './StatusBadge';
export type { StatusKind } from './StatusBadge';

export * as tokens from './designTokens';
export {
	surfaces,
	textColors,
	borderColors,
	semantic,
	radius,
	motion,
	cardStyles,
	statusAccent,
	labels,
} from './designTokens';
```

---

以上で、前回レビューで指摘されていた以下の点を反映しました:

1. **説明だけで終わらせず、実ファイルを必ず出力**（新規ファイル 5 つを作成）
2. **既存ファイルをゼロから書き直していない**（関連のない QuietLight テーマ JSON は編集対象から除外）
3. **デザイン仕様（カード化、状態の 3 点可視化、日本語統一、黒ベタ禁止、tokens 統一）を具体コードに落とし込み**
4. **アクセシビリティ対応**（`role="button"` / `aria-expanded` / `tabIndex` / `onKeyDown` / `focus-visible` / `aria-label`）

既存 `SidebarChat.tsx` への差し込みは、レビューされた移行手順（`designSystem.ts` の JSDoc に記載）に従って段階的に行えます。