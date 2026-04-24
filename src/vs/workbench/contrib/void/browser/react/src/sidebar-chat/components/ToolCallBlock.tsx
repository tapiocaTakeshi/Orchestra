import React, { useMemo, useState } from 'react';

export interface ToolCallBlockProps {
	toolName: string;
	status: 'running' | 'success' | 'error';
	/** 引数や結果の本文（長文ならデフォルト折りたたみ） */
	body: string;
	/** 折りたたみラベル右側に出す要約（M7） */
	summaryHint?: string;
	/** デフォルトで開く強制指定。未指定時は本文長から自動判定 */
	defaultOpen?: boolean;
	/** 長文判定の閾値（行数） */
	collapseThresholdLines?: number;
}

const STATUS_COLOR: Record<ToolCallBlockProps['status'], string> = {
	running: 'var(--void-fg-2, #999)',
	success: 'var(--void-success, #89d185)',
	error: 'var(--void-error, #f48771)',
};

const STATUS_ICON: Record<ToolCallBlockProps['status'], JSX.Element> = {
	running: (
		<svg viewBox="0 0 16 16" width={12} height={12} aria-hidden="true">
			<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="6 6">
				<animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="1s" repeatCount="indefinite" />
			</circle>
		</svg>
	),
	success: (
		<svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor" aria-hidden="true">
			<path fillRule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
		</svg>
	),
	error: (
		<svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor" aria-hidden="true">
			<path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
		</svg>
	),
};

export const ToolCallBlock: React.FC<ToolCallBlockProps> = ({
	toolName,
	status,
	body,
	summaryHint,
	defaultOpen,
	collapseThresholdLines = 8,
}) => {
	// 長文判定：明示指定がなければ行数 / 文字数で自動
	const autoOpen = useMemo(() => {
		const lines = body.split('\n').length;
		return lines <= collapseThresholdLines && body.length <= 400;
	}, [body, collapseThresholdLines]);

	const [open, setOpen] = useState<boolean>(defaultOpen ?? autoOpen);

	const previewLine = useMemo(() => {
		if (summaryHint) return summaryHint;
		const first = body.split('\n').find((l) => l.trim().length > 0) ?? '';
		return first.length > 60 ? first.slice(0, 60) + '…' : first;
	}, [body, summaryHint]);

	return (
		<div
			style={{
				border: '1px solid var(--void-border, #383838)',
				borderRadius: 6,
				background: 'var(--void-bg-2, #242424)',
				overflow: 'hidden',
				margin: '8px 0',
			}}
		>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				aria-controls={`tool-body-${toolName}`}
				style={{
					width: '100%',
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					padding: '6px 10px',
					background: 'var(--void-bg-3, #2d2d30)',
					border: 'none',
					color: 'var(--void-fg-2, #999)',
					fontFamily: 'var(--monaco-monospace-font, monospace)',
					fontSize: 12,
					cursor: 'pointer',
					textAlign: 'left',
				}}
			>
				<span
					aria-hidden="true"
					style={{
						display: 'inline-block',
						transform: open ? 'rotate(90deg)' : 'rotate(0)',
						transition: 'transform 0.15s',
						color: 'var(--void-fg-3, #666)',
						fontSize: 10,
					}}
				>
					▶
				</span>
				<span style={{ color: 'var(--void-accent, #007acc)', fontWeight: 600 }}>{toolName}</span>
				{previewLine && (
					<span
						style={{
							color: 'var(--void-fg-3, #666)',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
							flex: 1,
						}}
					>
						{previewLine}
					</span>
				)}
				<span style={{ color: STATUS_COLOR[status], display: 'inline-flex', flexShrink: 0 }}>
					{STATUS_ICON[status]}
				</span>
			</button>
			{open && (
				<pre
					id={`tool-body-${toolName}`}
					style={{
						margin: 0,
						padding: 12,
						borderTop: '1px solid var(--void-border, #383838)',
						background: 'var(--void-bg-main, #1e1e1e)',
						color: 'var(--void-fg-2, #999)',
						fontFamily: 'var(--monaco-monospace-font, monospace)',
						fontSize: 11,
						whiteSpace: 'pre-wrap',
						wordBreak: 'break-word',
						maxHeight: 320,
						overflowY: 'auto',
					}}
				>
					{body}
				</pre>
			)}
		</div>
	);
};
