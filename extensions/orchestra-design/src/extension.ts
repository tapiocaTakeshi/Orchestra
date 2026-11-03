/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

// Orchestra Design: Division の Designer ロールが生成したデザイン HTML を、その場で編集する Design モード。
//
// デザインは .division/design/ フォルダの複数の HTML (1 画面 = 1 ファイル、index.html が先頭)。
// 以前の単一ファイル .division/DESIGN.html も開ける。新しい形式のデザインデータは作らず、
// これらの HTML だけを書き換える。

import * as vscode from 'vscode';
import { DesignEditorProvider, DESIGN_VIEW_TYPE } from './designEditorProvider';
import { DesignerClient } from './designerClient';
import { DESIGN_GLOB, createDesignPage, sortPageUris } from './designPages';

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

		vscode.commands.registerCommand('orchestra.design.newPage', async (from?: vscode.Uri) => {
			const folder = vscode.workspace.workspaceFolders?.[0];
			const base = from ?? (folder ? (await findDesignFiles())[0] : undefined);
			if (!folder && !base) { return; }
			const created = await createDesignPage(base, folder?.uri);
			if (created) { await vscode.commands.executeCommand('vscode.openWith', created, DESIGN_VIEW_TYPE); }
		}),

		vscode.commands.registerCommand('orchestra.design.setApiKey', () => designer.setApiKey()),
	);

	watchForDesignerOutput(context);
}

export function deactivate() { }

async function findDesignFiles(): Promise<vscode.Uri[]> {
	return sortPageUris(await vscode.workspace.findFiles(DESIGN_GLOB, '**/node_modules/**', 200));
}

async function pickDesignFile(): Promise<vscode.Uri | undefined> {
	const files = await findDesignFiles();
	if (!files.length) {
		vscode.window.showInformationMessage('.division/design/ にデザイン HTML がありません。Division の Designer ロールにデザインを作らせると、ここで編集できます。');
		return undefined;
	}
	if (files.length === 1) { return files[0]; }
	const picked = await vscode.window.showQuickPick(
		files.map(uri => ({ label: vscode.workspace.asRelativePath(uri), uri })),
		{ title: 'Orchestra Design: 開くデザイン HTML を選択' },
	);
	return picked?.uri;
}

/**
 * Designer ロールがデザイン HTML を新しく作ったら Design モードで開くよう知らせる。
 * 複数ページが一度に書かれるので、少し待ってから 1 回だけ知らせる。
 * (既に開いているページは TextDocument の変更としてそのままプレビューに反映される)
 */
function watchForDesignerOutput(context: vscode.ExtensionContext) {
	if (!vscode.workspace.workspaceFolders?.length) { return; }
	const watcher = vscode.workspace.createFileSystemWatcher(DESIGN_GLOB, false, true, true);
	let created: vscode.Uri[] = [];
	let timer: ReturnType<typeof setTimeout> | undefined;
	const flush = async () => {
		timer = undefined;
		const uris = sortPageUris(created);
		created = [];
		if (!uris.length || !vscode.workspace.getConfiguration('orchestraDesign').get<boolean>('notifyOnCreate', true)) { return; }
		const open = 'Design で開く';
		const what = uris.length === 1 ? vscode.workspace.asRelativePath(uris[0]) : `デザイン ${uris.length} ページ`;
		const picked = await vscode.window.showInformationMessage(`Designer が ${what} を作成しました。`, open);
		if (picked === open) { await vscode.commands.executeCommand('vscode.openWith', uris[0], DESIGN_VIEW_TYPE); }
	};
	context.subscriptions.push(watcher, watcher.onDidCreate(uri => {
		created.push(uri);
		if (timer) { clearTimeout(timer); }
		timer = setTimeout(flush, 1500);
	}), { dispose: () => { if (timer) { clearTimeout(timer); } } });
}
