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
