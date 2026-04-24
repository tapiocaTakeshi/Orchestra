import React, { useCallback, useRef, useState } from 'react';
import { useSendValidation } from '../hooks/useSendValidation';
import { DisableReason } from './DisableReason';
import { SendPreviewModal, PreviewAttachment } from './SendPreviewModal';

export interface ChatInputProps {
	/** 親が状態を持ちたい場合の制御プロパティ */
	value?: string;
	onChange?: (v: string) => void;
	onSend: (text: string) => void;
	onCancel?: () => void;

	attachments?: PreviewAttachment[];
	maxLength?: number;
	isStreaming?: boolean;
	isIndexing?: boolean;
	hasModel?: boolean;
	isUploading?: boolean;

	/** 送信前にプレビューを挟むか（H2） */
	requirePreview?: boolean;
	placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
	value,
	onChange,
	onSend,
	onCancel,
	attachments = [],
	maxLength = 8000,
	isStreaming,
	isIndexing,
	hasModel = true,
	isUploading,
	requirePreview = false,
	placeholder = 'Ask Void anything...',
}) => {
	const [internalText, setInternalText] = useState('');
	const text = value ?? internalText;
	const setText = (v: string) => {
		if (onChange) onChange(v);
		else setInternalText(v);
	};

	const [previewOpen, setPreviewOpen] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const validation = useSendValidation({
		text,
		maxLength,
		isStreaming,
		isIndexing,
		hasModel,
		isUploading,
	});

	const triggerSend = useCallback(() => {
		if (!validation.canSend) return;
		if (requirePreview) {
			setPreviewOpen(true);
			return;
		}
		onSend(text);
		setText('');
	}, [validation.canSend, requirePreview, onSend, text]);

	const confirmSend = useCallback(() => {
		onSend(text);
		setText('');
		setPreviewOpen(false);
	}, [onSend, text]);

	const onKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
				e.preventDefault();
				triggerSend();
			} else if (e.key === 'Escape' && isStreaming && onCancel) {
				e.preventDefault();
				onCancel();
			}
		},
		[triggerSend, isStreaming, onCancel],
	);

	const showCharCounter = text.length > maxLength * 0.8;
	const inputDisabled = !!isStreaming;

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 8,
				padding: '12px 16px 16px',
				position: 'relative',
			}}
		>
			<DisableReason message={validation.message} severity={validation.severity} />

			<div
				style={{
					background: 'var(--void-bg-2, #242424)',
					border: `1px solid ${
						validation.severity === 'error'
							? 'var(--void-error, #f48771)'
							: 'var(--void-border, #383838)'
					}`,
					borderRadius: 8,
					transition: 'border-color 0.15s, box-shadow 0.15s',
					opacity: inputDisabled ? 0.7 : 1,
				}}
			>
				{attachments.length > 0 && (
					<div
						style={{
							display: 'flex',
							gap: 6,
							flexWrap: 'wrap',
							padding: '8px 10px 0',
						}}
					>
						{attachments.map((a) => (
							<span
								key={a.id}
								style={{
									fontSize: 11,
									padding: '3px 8px',
									borderRadius: 12,
									background: 'var(--void-bg-3, #2d2d30)',
									border: '1px solid var(--void-border, #383838)',
									color: 'var(--void-fg-1, #ccc)',
								}}
							>
								{a.label}
							</span>
						))}
					</div>
				)}

				<div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 12px' }}>
					<textarea
						ref={textareaRef}
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={onKeyDown}
						placeholder={placeholder}
						aria-label="チャット入力"
						aria-describedby={validation.message ? 'chat-input-error' : undefined}
						aria-invalid={validation.severity === 'error'}
						disabled={inputDisabled}
						rows={1}
						style={{
							flex: 1,
							background: 'transparent',
							border: 'none',
							outline: 'none',
							resize: 'none',
							color: 'var(--void-fg-1, #ccc)',
							fontFamily: 'inherit',
							fontSize: 13,
							lineHeight: 1.5,
							minHeight: 22,
							maxHeight: 200,
						}}
					/>

					{isStreaming && onCancel ? (
						<button
							type="button"
							onClick={onCancel}
							aria-label="生成をキャンセル"
							title="キャンセル (Esc)"
							style={{
								background: 'var(--void-bg-3, #2d2d30)',
								color: 'var(--void-fg-1, #ccc)',
								border: '1px solid var(--void-border, #383838)',
								borderRadius: 6,
								padding: '4px 10px',
								fontSize: 12,
								cursor: 'pointer',
							}}
						>
							停止
						</button>
					) : (
						<button
							type="button"
							onClick={triggerSend}
							disabled={!validation.canSend}
							aria-label="メッセージ送信 (Enter)"
							aria-disabled={!validation.canSend}
							title={validation.canSend ? '送信 (Enter)' : validation.message ?? ''}
							style={{
								background: validation.canSend
									? 'var(--void-accent, #007acc)'
									: 'var(--void-accent-disabled, rgba(0,122,204,0.4))',
								color: '#fff',
								border: 'none',
								borderRadius: 6,
								padding: '6px 12px',
								cursor: validation.canSend ? 'pointer' : 'not-allowed',
								display: 'inline-flex',
								alignItems: 'center',
								gap: 4,
								fontSize: 12,
							}}
						>
							<svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor" aria-hidden="true">
								<path d="M1.776 2.083l12.44 5.441c.642.28.642 1.155 0 1.436L1.776 14.4c-.652.285-1.32-.38-1.036-1.026l2.122-4.814a1.75 1.75 0 011.458-1.038l6.096-.452c.28-.02.28-.426 0-.447l-6.096-.452A1.75 1.75 0 012.862 5.13L.74 3.11c-.284-.647.384-1.31 1.036-1.027z" />
							</svg>
							送信
						</button>
					)}
				</div>
			</div>

			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					fontSize: 11,
					color: 'var(--void-fg-3, #666)',
					padding: '0 4px',
				}}
			>
				<span>⇧ + ⏎ で改行 ／ ⏎ で送信</span>
				{showCharCounter && (
					<span
						style={{
							color:
								text.length > maxLength
									? 'var(--void-error, #f48771)'
									: 'var(--void-fg-3, #666)',
						}}
						aria-live="polite"
					>
						{text.length} / {maxLength}
					</span>
				)}
			</div>

			<SendPreviewModal
				open={previewOpen}
				text={text}
				attachments={attachments}
				onConfirm={confirmSend}
				onCancel={() => setPreviewOpen(false)}
			/>
		</div>
	);
};
