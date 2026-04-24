import React from 'react';

interface DisableReasonProps {
	message: string | null;
	severity: 'info' | 'warning' | 'error' | null;
}

const ICONS: Record<'info' | 'warning' | 'error', JSX.Element> = {
	info: (
		<svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" aria-hidden="true">
			<path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 11V7h1.5v4h-1.5zm0-5.25V4.25h1.5V5.75h-1.5z" />
		</svg>
	),
	warning: (
		<svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" aria-hidden="true">
			<path fillRule="evenodd" d="M8.22 1.754a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368L8.22 1.754zM9 11a1 1 0 11-2 0 1 1 0 012 0zm-.25-5.25a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z" />
		</svg>
	),
	error: (
		<svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" aria-hidden="true">
			<path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 4.25h1.5v4.5h-1.5v-4.5zm0 6h1.5v1.5h-1.5v-1.5z" />
		</svg>
	),
};

const SEVERITY_STYLE: Record<'info' | 'warning' | 'error', React.CSSProperties> = {
	info: {
		color: 'var(--vscode-notificationsInfoIcon-foreground, var(--void-fg-2, #999))',
		background: 'var(--void-bg-2, rgba(255,255,255,0.04))',
		border: '1px solid var(--void-border, #383838)',
	},
	warning: {
		color: 'var(--vscode-notificationsWarningIcon-foreground, #cca700)',
		background: 'rgba(204, 167, 0, 0.1)',
		border: '1px solid rgba(204, 167, 0, 0.5)',
	},
	error: {
		color: 'var(--vscode-notificationsErrorIcon-foreground, #f48771)',
		background: 'rgba(244, 135, 113, 0.1)',
		border: '1px solid rgba(244, 135, 113, 0.5)',
	},
};

export const DisableReason: React.FC<DisableReasonProps> = ({ message, severity }) => {
	if (!message || !severity) return null;

	return (
		<div
			id="chat-input-error"
			role="status"
			aria-live="polite"
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				padding: '6px 10px',
				borderRadius: 6,
				fontSize: 12,
				lineHeight: 1.4,
				...SEVERITY_STYLE[severity],
			}}
		>
			<span style={{ display: 'inline-flex', flexShrink: 0 }}>{ICONS[severity]}</span>
			<span>{message}</span>
		</div>
	);
};
