planner と designer の出力を踏まえ、Phase 1（送信不可理由のインライン表示・送信前プレビュー）と Phase 2（tool 折りたたみ）の中核コンポーネントを実装します。

既存ファイルの具体的内容はコンテキスト要約のみで完全には参照できないため、**新規コンポーネント群**として独立配置し、既存 `SidebarChat` 側から後段で import するだけで組み込めるようにします。VS Code テーマトークン (`--void-*`) を全箇所で使用し、ARIA 属性も付与しています。

```bash
mkdir -p src/vs/workbench/contrib/void/browser/react/src/sidebar-chat/components src/vs/workbench/contrib/void/browser/react/src/sidebar-chat/hooks
```

## 1. 送信バリデーション フック（H1: 送信不可理由）

```ts:src/vs/workbench/contrib/void/browser/react/src/sidebar-chat/hooks/useSendValidation.ts
import { useMemo } from 'react';

export type SendBlockReason =
	| { kind: 'empty' }
	| { kind: 'too-long'; max: number; current: number }
	| { kind: 'in-flight' }
	| { kind: 'indexing' }
	| { kind: 'no-model' }
	| { kind: 'attachment-uploading' };

export interface SendValidationInput {
	text: string;
	maxLength?: number;
	isStreaming?: boolean;
	isIndexing?: boolean;
	hasModel?: boolean;
	isUploading?: boolean;
}

export interface SendValidationResult {
	canSend: boolean;
	reason: SendBlockReason | null;
	/** UI に直接埋め込む短文（次に何をすればよいかを含める） */
	message: string | null;
	severity: 'info' | 'warning' | 'error' | null;
}

const formatMessage = (reason: SendBlockReason): { message: string; severity: 'info' | 'warning' | 'error' } => {
	switch (reason.kind) {
		case 'empty':
			return { message: 'メッセージを入力してください。', severity: 'info' };
		case 'too-long':
			return {
				message: `最大 ${reason.max} 文字までです（現在 ${reason.current} 文字）。短くしてから送信してください。`,
				severity: 'warning',
			};
		case 'in-flight':
			return { message: '送信中です。完了後に再度お試しください。', severity: 'info' };
		case 'indexing':
			return { message: 'プロジェクトをインデックス中です。完了まで送信は一時停止されます。', severity: 'warning' };
		case 'no-model':
			return { message: 'モデルが選択されていません。設定からモデルを選んでください。', severity: 'error' };
		case 'attachment-uploading':
			return { message: '添付ファイルをアップロード中です。完了後に送信できます。', severity: 'info' };
	}
};

export const useSendValidation = (input: SendValidationInput): SendValidationResult => {
	return useMemo(() => {
		const { text, maxLength = 8000, isStreaming, isIndexing, hasModel = true, isUploading } = input;
		const trimmed = text.trim();

		let reason: SendBlockReason | null = null;
		if (!hasModel) reason = { kind: 'no-model' };
		else if (isStreaming) reason = { kind: 'in-flight' };
		else if (isIndexing) reason = { kind: 'indexing' };
		else if (isUploading) reason = { kind: 'attachment-uploading' };
		else if (trimmed.length === 0) reason = { kind: 'empty' };
		else if (text.length > maxLength) reason = { kind: 'too-long', max: maxLength, current: text.length };

		if (!reason) {
			return { canSend: true, reason: null, message: null, severity: null };
		}
		const { message, severity } = formatMessage(reason);
		return { canSend: false, reason, message, severity };
	}, [input.text, input.maxLength, input.isStreaming, input.isIndexing, input.hasModel, input.isUploading]);
};
```

## 2. インライン送信不可理由（H1）

```tsx:src/vs/workbench/contrib/void/browser/react/src/sidebar-chat/components/DisableReason.tsx
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
```

## 3. 送信前プレビュー（H2）

```tsx:src/vs/workbench/contrib/void/browser/react/src/sidebar-chat/components/SendPreviewModal.tsx
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
```

## 4. Tool 折りたたみ（H3 + M7）

```tsx:src/vs/workbench/contrib/void/browser/react/src/sidebar-chat/components/ToolCallBlock.tsx
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
```

## 5. 統合 ChatInput（H1 + H2 + M5）

```tsx:src/vs/workbench/contrib/void/browser/react/src/sidebar-chat/components/ChatInput.tsx
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
```

## 6. バレル export

```ts:src/vs/workbench/contrib/void/browser/react/src/sidebar-chat/components/index.ts
export { ChatInput } from './ChatInput';
export type { ChatInputProps } from './ChatInput';
export { DisableReason } from './DisableReason';
export { SendPreviewModal } from './SendPreviewModal';
export type { PreviewAttachment } from './SendPreviewModal';
export { ToolCallBlock } from './ToolCallBlock';
export type { ToolCallBlockProps } from './ToolCallBlock';
export { useSendValidation } from '../hooks/useSendValidation';
export type { SendValidationInput, SendValidationResult, SendBlockReason } from '../hooks/useSendValidation';
```

## 7. README（既存 SidebarChat への組み込み手順）

```md:src/vs/workbench/contrib/void/browser/react/src/sidebar-chat/components/README.md
# SidebarChat UX 改善コンポーネント

planner / designer / researcher の合意に基づく Phase 1〜2 実装。

## 構成

| コンポーネント | 担当 | 対応案 |
| --- | --- | --- |
| `ChatInput` | 統合入力欄。バリデーション + 送信前プレビュー + 状態階層化 | H1 / H2 / M5 / M6 |
| `DisableReason` | 送信不可理由のインライン表示（info/warning/error） | H1 |
| `SendPreviewModal` | 送信前プレビュー（Esc キャンセル / ⌘⏎ 確定） | H2 |
| `ToolCallBlock` | tool 結果の折りたたみ + 状態アイコン + 要約ラベル | H3 / M7 |
| `useSendValidation` | 送信可否ロジック（フック） | H1 |

## 既存 `SidebarChat` への差し込み例

```tsx
import { ChatInput, ToolCallBlock } from './components';

<ChatInput
    value={draft}
    onChange={setDraft}
    onSend={(text) => chatService.send(text)}
    onCancel={() => chatService.cancel()}
    attachments={contextItems.map(c => ({ id: c.uri, label: c.name, kind: 'file' }))}
    isStreaming={isStreaming}
    isIndexing={isIndexing}
    hasModel={!!selectedModel}
    requirePreview={settings.requirePreview ?? false}
/>

{message.toolCalls.map(tc => (
    <ToolCallBlock
        key={tc.id}
        toolName={tc.name}
        status={tc.status}
        body={tc.output ?? tc.argsPreview}
        summaryHint={tc.summary}
    />
))}
```

## デザイントークン

すべて `--void-*` および `--vscode-*` カスタムプロパティで参照。
ハードコード色はフォールバック用の第二引数のみ。

## アクセシビリティ

- `aria-label` / `aria-describedby` / `aria-invalid` / `aria-expanded` / `aria-live` を全主要要素に付与
- `Enter` 送信 / `Shift+Enter` 改行 / `Esc` キャンセル / `⌘/Ctrl+Enter` プレビュー確定
- フォーカスリング（VS Code 既定）は無効化していない
```

---

### 実装メモ
- **Phase 1（H1 / H2）と Phase 2（H3）を一括投入** しています。`requirePreview` フラグで送信前プレビューを段階導入できます（既定 OFF）。
- 既存 `SidebarChat` 本体には触れず、**追加コンポーネントとフック**のみ提供したので、既存 import / 構造を破壊しません。組み込み箇所は README の例どおり 1〜2 行差し替えで済みます。
- VS Code テーマ追従は `--vscode-*` トークンを優先し、フォールバックとして designer モックの `--void-*` を併記しています。