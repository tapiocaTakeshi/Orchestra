import React, { useEffect, useRef } from 'react';

export interface PreviewAttachment {
	id: string;
	label: string;
	kind: 'file' | 'selection' | 'image' | 'other';
}

interface SendPreviewModalProps {
	open: boolean;
	text: string;
	attachments?: PreviewAttachment[];
	onConfirm: () => void;
	onCancel: () => void;
}

/**
 * 送信前プレビュー（H2 / 案6）
 * - 確定するまで履歴に追加しない（二重送信防止）
 * - 「修正する」で入力を失わない（呼び出し側が text を保持）
 * - Escape でキャンセル、Cmd/Ctrl+Enter で確定
 */
export const SendPreviewModal: React.FC<SendPreviewModalProps> = ({
	open,
	text,
	attachments = [],
	onConfirm,
	onCancel,
}) => {
	const confirmBtnRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!open) return;
		confirmBtnRef.current?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onCancel();
			} else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
				e.preventDefault();
				onConfirm();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, onCancel, onConfirm]);

	if (!open) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="send-preview-title"
			style={{
				position: 'absolute',
				inset: 0,
				background: 'rgba(0, 0, 0, 0.5)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 50,
				padding: 16,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onCancel();
			}}
		>
			<div
				style={{
					background: 'var(--void-bg-2, #242424)',
					border: '1px solid var(--void-border, #383838)',
					borderRadius: 8,
					maxWidth: 560,
					width: '100%',
					maxHeight: '80vh',
					display: 'flex',
					flexDirection: 'column',
					boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
				}}
			>
				<header
					style={{
						padding: '12px 16px',
						borderBottom: '1px solid var(--void-border, #383838)',
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
					}}
				>
					<h3
						id="send-preview-title"
						style={{
							margin: 0,
							fontSize: 13,
							fontWeight: 600,
							color: 'var(--void-fg-1, #ccc)',
						}}
					>
						送信内容の確認
					</h3>
					<span style={{ fontSize: 11, color: 'var(--void-fg-3, #666)' }}>
						⌘/Ctrl + Enter で送信
					</span>
				</header>

				<div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
					{attachments.length > 0 && (
						<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
							{attachments.map((a) => (
								<span
									key={a.id}
									style={{
										fontSize: 11,
										padding: '3px 8px',
										borderRadius: 12,
										background: 'var(--void-bg-3, #2d2d30)',
										border: '1px solid var(--void-border, #383838)',
										color: 'var(--void-fg-2, #999)',
									}}
								>
									{a.label}
								</span>
							))}
						</div>
					)}
					<pre
						style={{
							margin: 0,
							whiteSpace: 'pre-wrap',
							wordBreak: 'break-word',
							fontFamily: 'inherit',
							fontSize: 13,
							lineHeight: 1.6,
							color: 'var(--void-fg-1, #ccc)',
							background: 'var(--void-bg-main, #181818)',
							padding: 12,
							borderRadius: 6,
							border: '1px solid var(--void-border, #383838)',
						}}
					>
						{text}
					</pre>
				</div>

				<footer
					style={{
						padding: '10px 16px',
						borderTop: '1px solid var(--void-border, #383838)',
						display: 'flex',
						justifyContent: 'flex-end',
						gap: 8,
					}}
				>
					<button
						type="button"
						onClick={onCancel}
						style={{
							background: 'transparent',
							border: '1px solid var(--void-border, #383838)',
							color: 'var(--void-fg-1, #ccc)',
							padding: '6px 14px',
							borderRadius: 6,
							cursor: 'pointer',
							fontSize: 12,
						}}
					>
						修正する
					</button>
					<button
						type="button"
						ref={confirmBtnRef}
						onClick={onConfirm}
						style={{
							background: 'var(--void-accent, #007acc)',
							border: 'none',
							color: '#fff',
							padding: '6px 14px',
							borderRadius: 6,
							cursor: 'pointer',
							fontSize: 12,
							fontWeight: 600,
						}}
					>
						送信する
					</button>
				</footer>
			</div>
		</div>
	);
};
