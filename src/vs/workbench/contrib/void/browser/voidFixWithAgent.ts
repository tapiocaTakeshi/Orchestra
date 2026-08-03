/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Editor の赤波線(エラー/警告)に対し、Cursor 風の「Fix with Agent」 Quick Fix を表示し、
// 押下時に該当エラーの内容(ファイル/行/メッセージ/該当スニペット) を AI チャットへ自動転送する。

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';

import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { CodeAction, CodeActionContext, CodeActionList, CodeActionProvider } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { CodeActionKind } from '../../../../editor/contrib/codeAction/common/types.js';

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarker, IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';

import { VOID_FIX_WITH_AGENT_ACTION_ID } from './actionIDs.js';
import { IChatThreadService } from './chatThreadService.js';
import { VOID_OPEN_SIDEBAR_ACTION_ID, VOID_VIEW_CONTAINER_ID } from './sidebarPane.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { FeatureName } from '../common/voidSettingsTypes.js';


// ----------------------------------------------------------------------------
// シリアライズ可能なマーカー(コマンド引数として IPC・履歴を経由するため、
// URI / クラスインスタンスは入れず、プレーンな JSON 形だけにする)
// ----------------------------------------------------------------------------
type SerializedMarker = {
	message: string;
	source?: string;
	code?: string;
	severity: MarkerSeverity;
	startLineNumber: number;
	startColumn: number;
	endLineNumber: number;
	endColumn: number;
};

const serializeMarker = (m: IMarker): SerializedMarker => ({
	message: m.message,
	source: m.source,
	code: typeof m.code === 'string' ? m.code : m.code?.value,
	severity: m.severity,
	startLineNumber: m.startLineNumber,
	startColumn: m.startColumn,
	endLineNumber: m.endLineNumber,
	endColumn: m.endColumn,
});

const severityLabel = (sev: MarkerSeverity): string => {
	switch (sev) {
		case MarkerSeverity.Error: return 'Error';
		case MarkerSeverity.Warning: return 'Warning';
		case MarkerSeverity.Info: return 'Info';
		default: return 'Hint';
	}
};


// ----------------------------------------------------------------------------
// Code Action Provider
// ----------------------------------------------------------------------------
class FixWithAgentCodeActionProvider implements CodeActionProvider {

	readonly providedCodeActionKinds = [CodeActionKind.QuickFix.value];

	constructor(
		@IMarkerService private readonly _markerService: IMarkerService,
	) { }

	provideCodeActions(
		model: ITextModel,
		range: Range | Selection,
		_context: CodeActionContext,
		_token: CancellationToken,
	): CodeActionList | undefined {
		// Error と Warning のみ拾う(Info/Hint は対象外)
		const all = this._markerService.read({
			resource: model.uri,
			severities: MarkerSeverity.Error | MarkerSeverity.Warning,
		});
		if (all.length === 0) return undefined;

		const overlapping = all.filter(m => Range.areIntersectingOrTouching(
			range,
			new Range(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn),
		));
		if (overlapping.length === 0) return undefined;

		const action: CodeAction = {
			title: '✨ Fix with Agent',
			kind: CodeActionKind.QuickFix.value,
			isPreferred: true,
			isAI: true,
			diagnostics: overlapping.map(m => ({
				severity: m.severity,
				message: m.message,
				source: m.source,
				code: m.code,
				startLineNumber: m.startLineNumber,
				startColumn: m.startColumn,
				endLineNumber: m.endLineNumber,
				endColumn: m.endColumn,
			})),
			command: {
				id: VOID_FIX_WITH_AGENT_ACTION_ID,
				title: 'Fix with Agent',
				arguments: [{
					uri: model.uri.toString(),
					markers: overlapping.map(serializeMarker),
				}],
			},
		};

		return {
			actions: [action],
			dispose: () => { /* noop */ },
		};
	}
}


// ----------------------------------------------------------------------------
// Action: 押下時に呼ばれるコマンド本体
// 1) Sidebar を開く
// 2) Staging Selection に該当範囲を追加
// 3) チャット履歴に user message を積んでストリーム開始
// ----------------------------------------------------------------------------
type FixWithAgentArgs = {
	uri?: string;
	markers?: SerializedMarker[];
};

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_FIX_WITH_AGENT_ACTION_ID,
			title: localize2('voidFixWithAgentCmd', 'Void: Fix Diagnostic with Agent'),
			f1: false, // Quick Fix メニュー専用、コマンドパレットからは出さない
		});
	}

	async run(accessor: ServicesAccessor, args?: FixWithAgentArgs): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const viewsService = accessor.get(IViewsService);
		const chatThreadService = accessor.get(IChatThreadService);
		const modelService = accessor.get(IModelService);
		const settingsService = accessor.get(IVoidSettingsService);

		const uriStr = args?.uri ?? '';
		const markers = args?.markers ?? [];
		if (!uriStr || markers.length === 0) return;

		let uri: URI | undefined;
		try { uri = URI.parse(uriStr); } catch { uri = undefined; }
		if (!uri) return;

		// 1) Sidebar を開く
		const wasOpen = viewsService.isViewContainerVisible(VOID_VIEW_CONTAINER_ID);
		if (!wasOpen) {
			await commandService.executeCommand(VOID_OPEN_SIDEBAR_ACTION_ID);
		}

		// 2) Staging Selection に該当ファイル/範囲を追加
		const model = modelService.getModel(uri);
		if (model) {
			const startLine = Math.min(...markers.map(m => m.startLineNumber));
			const endLine = Math.max(...markers.map(m => m.endLineNumber));
			chatThreadService.addNewStagingSelection({
				type: 'CodeSelection',
				uri,
				language: model.getLanguageId(),
				range: [startLine, endLine],
				state: { wasAddedAsCurrentFile: false },
			});
		}

		// 3) チャットメッセージを構築して送信
		const fileLabel = uri.path.split('/').pop() || uri.fsPath;
		const lines: string[] = [];
		lines.push('以下のエディタエラーを修正してください。');
		lines.push('');
		lines.push(`**ファイル:** \`${fileLabel}\``);
		lines.push('');
		for (const m of markers) {
			const at = m.startLineNumber === m.endLineNumber
				? `L${m.startLineNumber}`
				: `L${m.startLineNumber}-${m.endLineNumber}`;
			const codeStr = m.code ? ` [${m.code}]` : '';
			const sourceStr = m.source ? ` (${m.source})` : '';
			lines.push(`- **[${severityLabel(m.severity)}]${sourceStr}${codeStr}** ${at}: ${m.message}`);
		}

		// 該当行±1 行を抜粋(モデルが手元にあるときだけ)
		if (model) {
			const startLine = Math.max(1, Math.min(...markers.map(m => m.startLineNumber)) - 1);
			const endLine = Math.min(model.getLineCount(), Math.max(...markers.map(m => m.endLineNumber)) + 1);
			const snippet = model.getValueInRange(new Range(startLine, 1, endLine, model.getLineMaxColumn(endLine)));
			lines.push('');
			lines.push('```' + (model.getLanguageId() || ''));
			lines.push(snippet);
			lines.push('```');
		}

		lines.push('');
		lines.push('原因の特定 → 修正案の提示 → 適切な範囲のみ書き換える、の順でお願いします。');

		const userMessage = lines.join('\n');

		await chatThreadService.focusCurrentChat();

		const threadId = chatThreadService.state.currentThreadId;
		if (!threadId) return;

		// 設定で「Chat と同じモデルを使う」がオフの場合のみ、ErrorFix 専用のモデル選択を使う
		const featureNameOverride: FeatureName | undefined = settingsService.state.globalSettings.syncErrorFixToChat ? undefined : 'ErrorFix';

		try {
			await chatThreadService.addUserMessageAndStreamResponse({ userMessage, threadId, featureNameOverride });
		} catch (e) {
			console.error('[VoidFixWithAgent] failed to start stream:', e);
		}
	}
});


// ----------------------------------------------------------------------------
// Workbench Contribution: 全言語に Code Action Provider を 1 度だけ登録
// ----------------------------------------------------------------------------
class VoidFixWithAgentContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.voidFixWithAgent';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this._register(
			languageFeaturesService.codeActionProvider.register(
				'*',
				instantiationService.createInstance(FixWithAgentCodeActionProvider),
			),
		);
	}
}

registerWorkbenchContribution2(
	VoidFixWithAgentContribution.ID,
	VoidFixWithAgentContribution,
	WorkbenchPhase.AfterRestored,
);
