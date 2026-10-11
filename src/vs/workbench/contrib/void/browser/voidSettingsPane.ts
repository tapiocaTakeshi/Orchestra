/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import * as nls from '../../../../nls.js';
import { EditorExtensions } from '../../../common/editor.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';


import { mountVoidSettings } from './react/out/void-settings-tsx/index.js'
import { Codicon } from '../../../../base/common/codicons.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ORCHESTRA_OPEN_COST_MANAGEMENT_ACTION_ID, ORCHESTRA_OPEN_DIVISION_PROJECTS_ACTION_ID } from './actionIDs.js';
import { ORCHESTRA_UI_MODE_CONTEXT_KEY } from './orchestraUiModeTypes.js';
import { isVoidSettingsTab, requestVoidSettingsTab, VoidSettingsTab } from './voidSettingsTabRequest.js';


// refer to preferences.contribution.ts keybindings editor

class VoidSettingsInput extends EditorInput {

	static readonly ID: string = 'workbench.input.void.settings';

	static readonly RESOURCE = URI.from({ // I think this scheme is invalid, it just shuts up TS
		scheme: 'void',  // Custom scheme for our editor (try Schemas.https)
		path: 'settings'
	})
	readonly resource = VoidSettingsInput.RESOURCE;

	constructor() {
		super();
	}

	override get typeId(): string {
		return VoidSettingsInput.ID;
	}

	override getName(): string {
		return nls.localize('voidSettingsInputsName', 'Void\'s Settings');
	}

	override getIcon() {
		return Codicon.checklist // symbol for the actual editor pane
	}

}


class VoidSettingsPane extends EditorPane {
	static readonly ID = 'workbench.test.myCustomPane';

	// private _scrollbar: DomScrollableElement | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(VoidSettingsPane.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.style.height = '100%';
		parent.style.width = '100%';

		const settingsElt = document.createElement('div');
		settingsElt.style.height = '100%';
		settingsElt.style.width = '100%';

		parent.appendChild(settingsElt);

		// this._scrollbar = this._register(new DomScrollableElement(scrollableContent, {}));
		// parent.appendChild(this._scrollbar.getDomNode());
		// this._scrollbar.scanDomNode();

		// Mount React into the scrollable content
		this.instantiationService.invokeFunction(accessor => {
			const disposeFn = mountVoidSettings(settingsElt, accessor)?.dispose;
			this._register(toDisposable(() => disposeFn?.()))

			// setTimeout(() => { // this is a complete hack and I don't really understand how scrollbar works here
			// 	this._scrollbar?.scanDomNode();
			// }, 1000)
		});
	}

	layout(dimension: Dimension): void {
		// if (!settingsElt) return
		// settingsElt.style.height = `${dimension.height}px`;
		// settingsElt.style.width = `${dimension.width}px`;
	}


	override get minimumWidth() { return 700 }

}

// register Settings pane
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(VoidSettingsPane, VoidSettingsPane.ID, nls.localize('VoidSettingsPane', "Void\'s Settings Pane")),
	[new SyncDescriptor(VoidSettingsInput)]
);


// register the gear on the top right
export const VOID_TOGGLE_SETTINGS_ACTION_ID = 'workbench.action.toggleVoidSettings'
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_TOGGLE_SETTINGS_ACTION_ID,
			title: nls.localize2('voidSettings', "Void: Toggle Settings"),
			icon: Codicon.settingsGear,
			menu: [
				{
					id: MenuId.LayoutControlMenuSubmenu,
					group: 'z_end',
				},
				{
					id: MenuId.LayoutControlMenu,
					when: ContextKeyExpr.equals('config.workbench.layoutControl.type', 'both'),
					group: 'z_end'
				}
			]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorGroupService = accessor.get(IEditorGroupsService);

		const instantiationService = accessor.get(IInstantiationService);

		// if is open, close it
		const openEditors = editorService.findEditors(VoidSettingsInput.RESOURCE); // should only have 0 or 1 elements...
		if (openEditors.length !== 0) {
			const openEditor = openEditors[0].editor
			const isCurrentlyOpen = editorService.activeEditor?.resource?.fsPath === openEditor.resource?.fsPath
			if (isCurrentlyOpen)
				await editorService.closeEditors(openEditors)
			else
				await editorGroupService.activeGroup.openEditor(openEditor)
			return;
		}


		// else open it
		const input = instantiationService.createInstance(VoidSettingsInput);

		await editorGroupService.activeGroup.openEditor(input);
	}
})



export const VOID_OPEN_SETTINGS_ACTION_ID = 'workbench.action.openVoidSettings'
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_OPEN_SETTINGS_ACTION_ID,
			title: nls.localize2('voidSettingsAction2', "Void: Open Settings"),
			f1: true,
			icon: Codicon.settingsGear,
		});
	}
	// 引数 { tab } でタブを指定できる (例: executeCommand(VOID_OPEN_SETTINGS_ACTION_ID, { tab: 'division' }))
	async run(accessor: ServicesAccessor, options?: unknown): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);

		// close all instances if found
		const openEditors = editorService.findEditors(VoidSettingsInput.RESOURCE);
		if (openEditors.length > 0) {
			await editorService.closeEditors(openEditors);
		}

		// 閉じてから頼む (閉じる前だと、閉じる設定画面のほうが受け取ってしまう)
		const tab = options && typeof options === 'object' ? (options as { tab?: unknown }).tab : undefined;
		if (isVoidSettingsTab(tab)) requestVoidSettingsTab(tab);

		// then, open one single editor
		const input = instantiationService.createInstance(VoidSettingsInput);
		await editorService.openEditor(input);
	}
})


// ---------------------------------------------------------------------------
// 設定画面を特定のタブで開く: Division プロジェクト / コスト管理
//
// 右のチャット (プロジェクトの選択やコスト調整のチップがある) を隠すクラウドエージェントモードでも、
// IDE モードと同じ画面に手が届くようにする。エディタ領域に開くので、チャットは戻さない。
// 開いていれば (閉じずに) 前面に出してタブを切り替え、なければ今のエディタグループに開く。
// ---------------------------------------------------------------------------

const openVoidSettingsAtTab = async (accessor: ServicesAccessor, tab: VoidSettingsTab): Promise<void> => {
	const editorService = accessor.get(IEditorService);
	const editorGroupService = accessor.get(IEditorGroupsService);
	const instantiationService = accessor.get(IInstantiationService);

	requestVoidSettingsTab(tab);
	const openEditors = editorService.findEditors(VoidSettingsInput.RESOURCE);
	if (openEditors.length !== 0) {
		const { editor, groupId } = openEditors[0];
		const group = editorGroupService.getGroup(groupId) ?? editorGroupService.activeGroup;
		await group.openEditor(editor);
		group.focus();
		return;
	}
	await editorGroupService.activeGroup.openEditor(instantiationService.createInstance(VoidSettingsInput), { pinned: true });
};

const isCloudModeContext = ContextKeyExpr.equals(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'cloud');

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_OPEN_DIVISION_PROJECTS_ACTION_ID,
			title: nls.localize2('orchestraOpenDivisionProjects', "Division プロジェクトを開く (ロールとモデルの割り当て)"),
			category: nls.localize2('orchestraCategory', "Orchestra"),
			f1: true,
			icon: Codicon.organization,
			// タイトルバーにはクラウドエージェントモードのときだけ (他のモードではチャットのプロジェクト選択から行ける)
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 6, when: isCloudModeContext },
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await openVoidSettingsAtTab(accessor, 'division');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_OPEN_COST_MANAGEMENT_ACTION_ID,
			title: nls.localize2('orchestraOpenCostManagement', "コスト管理を開く (コストの自動調整・クレジット・利用額)"),
			category: nls.localize2('orchestraCategory', "Orchestra"),
			f1: true,
			icon: Codicon.creditCard,
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 6.5, when: isCloudModeContext },
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await openVoidSettingsAtTab(accessor, 'cost');
	}
});





// add to settings gear on bottom left
MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
	group: '0_command',
	command: {
		id: VOID_TOGGLE_SETTINGS_ACTION_ID,
		title: nls.localize('voidSettingsActionGear', "Void\'s Settings")
	},
	order: 1
});
