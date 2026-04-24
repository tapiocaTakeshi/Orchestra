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
