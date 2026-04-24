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
