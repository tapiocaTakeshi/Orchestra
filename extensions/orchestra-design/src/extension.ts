/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

// Orchestra Design: Division の Designer ロールが生成した .division/DESIGN.html を
// その場で編集する Design モード。新しいデザインファイルは作らず、DESIGN.html だけを書き換える。

import * as vscode from 'vscode';
import { DesignEditorProvider, DESIGN_VIEW_TYPE } from './designEditorProvider';
import { DesignerClient } from './designerClient';

const DESIGN_GLOB = '**/.division/DESIGN.html';

export function activate(context: vscode.ExtensionContext) {
	const designer = new DesignerClient(context.secrets);
	const provider = new DesignEditorProvider(context, designer);

	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(DESIGN_VIEW_TYPE, provider, {
			webviewOptions: { retainContextWhenHidden: true },
			supportsMultipleEditorsPerDocument: false,
		}),

		vscode.commands.registerCommand('orchestra.design.open', async (uri?: vscode.Uri) => {
			const target = uri ?? await pickDesignFile();
			if (target) { await vscode.commands.executeCommand('vscode.openWith', target, DESIGN_VIEW_TYPE); }
		}),

		vscode.commands.registerCommand('orchestra.design.openAsText', async (uri?: vscode.Uri) => {
			const activeInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
			const target = uri
				?? (activeInput instanceof vscode.TabInputCustom && activeInput.viewType === DESIGN_VIEW_TYPE ? activeInput.uri : undefined)
				?? await pickDesignFile();
			if (target) { await vscode.commands.executeCommand('vscode.openWith', target, 'default', vscode.ViewColumn.Beside); }
		}),

		vscode.commands.registerCommand('orchestra.design.setApiKey', () => designer.setApiKey()),
	);

	watchForDesignerOutput(context);
}

export function deactivate() { }

async function pickDesignFile(): Promise<vscode.Uri | undefined> {
	const files = await vscode.workspace.findFiles(DESIGN_GLOB, '**/node_modules/**', 20);
	if (!files.length) {
		vscode.window.showInformationMessage('.division/DESIGN.html が見つかりません。Division の Designer ロールにデザインを作らせると、ここで編集できます。');
		return undefined;
	}
	if (files.length === 1) { return files[0]; }
	const picked = await vscode.window.showQuickPick(
		files.map(uri => ({ label: vscode.workspace.asRelativePath(uri), uri })),
		{ title: 'Orchestra Design: 開く DESIGN.html を選択' },
	);
	return picked?.uri;
}

/**
 * Designer ロールが DESIGN.html を新しく作ったら Design モードで開くよう知らせる。
 * (既に開いているときは TextDocument の変更としてそのままプレビューに反映される)
 */
function watchForDesignerOutput(context: vscode.ExtensionContext) {
	if (!vscode.workspace.workspaceFolders?.length) { return; }
	const watcher = vscode.workspace.createFileSystemWatcher(DESIGN_GLOB, false, true, true);
	context.subscriptions.push(watcher, watcher.onDidCreate(async uri => {
		if (!vscode.workspace.getConfiguration('orchestraDesign').get<boolean>('notifyOnCreate', true)) { return; }
		const open = 'Design で開く';
		const picked = await vscode.window.showInformationMessage(`Designer が ${vscode.workspace.asRelativePath(uri)} を作成しました。`, open);
		if (picked === open) { await vscode.commands.executeCommand('vscode.openWith', uri, DESIGN_VIEW_TYPE); }
	}));
}
