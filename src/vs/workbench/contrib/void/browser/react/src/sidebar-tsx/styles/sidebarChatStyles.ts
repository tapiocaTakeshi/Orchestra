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
