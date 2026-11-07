/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// 「選択範囲をロールの AI で直す」: クラウドのセッションの文書 (orchestra-cloud://<id>/.division/…) をエディタで
// 開いているとき、選んだ部分をその文書を書くロールの AI (論文なら researcher、仕様書なら writer …) に書き直してもらう。
// Division は提案を返すだけ。変更前 / 変更後を見せて、ユーザーが「適用」したときだけエディタに入れる (元に戻せる)。
// 保存するとサンドボックスに書く (ほかの編集と同じ)。

import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ICloudAgentService } from './cloudAgentServiceInterface.js';
import { CLOUD_DOCUMENT_SCHEME } from './cloudDocumentFileSystem.js';

export const CLOUD_DOCUMENT_AI_EDIT_ACTION_ID = 'orchestra.cloudAgents.aiEditSelection';

const PREVIEW_CHARS = 1500;
const clip = (s: string) => (s.length > PREVIEW_CHARS ? `${s.slice(0, PREVIEW_CHARS)}… (${s.length})` : s);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CLOUD_DOCUMENT_AI_EDIT_ACTION_ID,
			title: localize2('cloudDocumentAiEdit', "選択範囲をロールの AI で直す"),
			f1: true,
			precondition: ContextKeyExpr.and(ResourceContextKey.Scheme.isEqualTo(CLOUD_DOCUMENT_SCHEME), EditorContextKeys.hasNonEmptySelection, EditorContextKeys.writable),
			menu: {
				id: MenuId.EditorContext,
				group: '1_modification',
				order: 0,
				when: ContextKeyExpr.and(ResourceContextKey.Scheme.isEqualTo(CLOUD_DOCUMENT_SCHEME), EditorContextKeys.hasNonEmptySelection),
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editor = accessor.get(ICodeEditorService).getActiveCodeEditor() ?? accessor.get(ICodeEditorService).getFocusedCodeEditor();
		const quickInput = accessor.get(IQuickInputService);
		const dialogs = accessor.get(IDialogService);
		const notifications = accessor.get(INotificationService);
		const progress = accessor.get(IProgressService);
		const cloudAgentService = accessor.get(ICloudAgentService);

		const model = editor?.getModel();
		const selection = editor?.getSelection();
		if (!editor || !model || !selection || selection.isEmpty() || model.uri.scheme !== CLOUD_DOCUMENT_SCHEME) return;
		const sessionId = model.uri.authority;
		const path = model.uri.path.replace(/^\/+/, '');
		const versionAtStart = model.getVersionId();

		const instruction = await quickInput.input({
			title: '選択範囲をロールの AI で直す',
			prompt: `${path} の選んだ部分を、この文書を書くロールの AI が書き直します (保存はしません。見比べてから適用します)`,
			placeHolder: 'どう直すか (例: もっと具体的に / 短く / エラー時の動きを足して)',
		});
		if (!instruction?.trim()) return;

		// The editor's text (unsaved edits included) is what the offsets refer to.
		const content = model.getValue();
		const start = model.getOffsetAt(selection.getStartPosition());
		const end = model.getOffsetAt(selection.getEndPosition());
		const res = await progress.withProgress(
			{ location: ProgressLocation.Notification, title: 'ロールの AI が選んだ部分を書き直しています…', cancellable: false },
			() => cloudAgentService.aiEditDocument(sessionId, { path, start, end, selected: content.slice(start, end), instruction: instruction.trim(), content }),
		);
		if ('error' in res) {
			notifications.notify({ severity: Severity.Warning, message: res.error });
			return;
		}
		const p = res.proposal;
		const { result } = await dialogs.prompt<boolean>({
			type: 'info',
			message: `${p.roleName} の提案を適用しますか？`,
			detail: `${p.model ? `${p.model}\n\n` : ''}【変更前】\n${clip(p.original)}\n\n【変更後】\n${clip(p.replacement) || '(削除)'}`,
			buttons: [{ label: '適用', run: () => true }],
			cancelButton: { label: '破棄', run: () => false },
		});
		if (!(await result)) return;
		if (model.isDisposed() || (model.getVersionId() !== versionAtStart && model.getValue().slice(p.start, p.end) !== p.original)) {
			notifications.notify({ severity: Severity.Warning, message: '提案のあとで、その部分が変わりました。選び直して頼んでください。' });
			return;
		}
		const range = Range.fromPositions(model.getPositionAt(p.start), model.getPositionAt(p.end));
		editor.pushUndoStop();
		editor.executeEdits('orchestra.cloudDocumentAiEdit', [{ range, text: p.replacement }]);
		editor.pushUndoStop();
		editor.focus();
	}
});
