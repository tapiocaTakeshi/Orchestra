/*--------------------------------------------------------------------------------------
 *  Kanban Pane
 *  Registers an editor pane that hosts Orchestra's built-in Kanban board in the
 *  main editor area (the board is wide, so it wants the editor area, not the sidebar).
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
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

import { IVoidSettingsService } from '../common/voidSettingsService.js';

import { mountKanbanBoard } from './react/out/kanban-tsx/index.js';
import {
	VOID_OPEN_KANBAN_ACTION_ID,
	VOID_OPEN_KANBAN_IN_NEW_WINDOW_ACTION_ID,
	VOID_TOGGLE_KANBAN_ACTION_ID,
} from './actionIDs.js';


class KanbanInput extends EditorInput {

	static readonly ID: string = 'workbench.input.void.kanban';

	static readonly RESOURCE = URI.from({
		scheme: 'void',
		path: 'kanban'
	});
	readonly resource = KanbanInput.RESOURCE;

	override get typeId(): string {
		return KanbanInput.ID;
	}

	override getName(): string {
		return nls.localize('kanbanInputName', 'Kanban');
	}

	override getIcon() {
		return Codicon.checklist;
	}
}


class KanbanPane extends EditorPane {
	static readonly ID = 'workbench.pane.void.kanban';

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(KanbanPane.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.style.height = '100%';
		parent.style.width = '100%';

		// 別ウィンドウ (auxiliary window) では document が別物になる。グローバルの document で
		// 作った要素を挿し込むと所有ドキュメントがずれるので、必ず親の document から作る。
		const container = parent.ownerDocument.createElement('div');
		container.style.height = '100%';
		container.style.width = '100%';
		parent.appendChild(container);

		this.instantiationService.invokeFunction(accessor => {
			const disposeFn = mountKanbanBoard(container, accessor)?.dispose;
			this._register(toDisposable(() => disposeFn?.()));
		});
	}

	layout(_dimension: Dimension): void {
		// React handles its own layout
	}

	override get minimumWidth() { return 400; }
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(KanbanPane, KanbanPane.ID, nls.localize('KanbanPane', "Kanban")),
	[new SyncDescriptor(KanbanInput)]
);


// ---------------------------------------------------------------------------
// ボードを開く
//
// 開き先は「メインのエディタ領域」と「別ウィンドウ (auxiliary window)」の 2 つ。
// ボードはサブディスプレイに出しっぱなしにしたい類の画面なので、設定 openInNewWindow が
// true なら通常のコマンドも別ウィンドウを使う。
// ---------------------------------------------------------------------------

/** 既に開いているボードのエディタ (どのウィンドウのグループにあっても拾う) */
const findOpenBoard = (accessor: ServicesAccessor) =>
	accessor.get(IEditorService).findEditors(KanbanInput.RESOURCE);

/**
 * 別ウィンドウにボードを出す。既にどこかで開いていればそれを移してくる。
 * 2 枚のボードが並ぶと紛らわしいだけなので、コピーではなく移動にしている。
 */
const openBoardInNewWindow = async (accessor: ServicesAccessor): Promise<void> => {
	const editorGroupService = accessor.get(IEditorGroupsService);
	const instantiationService = accessor.get(IInstantiationService);

	const openEditors = findOpenBoard(accessor);

	if (openEditors.length !== 0) {
		const { editor, groupId } = openEditors[0];
		const sourceGroup = editorGroupService.getGroup(groupId);

		// 既に (メイン以外の) 別ウィンドウに居るなら、もう一枚ウィンドウを作らずそれを前面に出すだけでよい。
		// この判定は auxiliaryPart を作る "前" にやる必要がある。作ってしまうと毎回別物の新しい
		// ウィンドウができてしまい、「そのまま前面に出す」が成立しなくなる。
		if (sourceGroup && sourceGroup.windowId !== editorGroupService.mainPart.windowId) {
			sourceGroup.focus();
			return;
		}

		const auxiliaryPart = await editorGroupService.createAuxiliaryEditorPart();
		if (sourceGroup) {
			sourceGroup.moveEditor(editor, auxiliaryPart.activeGroup);
		} else {
			await auxiliaryPart.activeGroup.openEditor(editor);
		}
		auxiliaryPart.activeGroup.focus();
		return;
	}

	const auxiliaryPart = await editorGroupService.createAuxiliaryEditorPart();
	await auxiliaryPart.activeGroup.openEditor(instantiationService.createInstance(KanbanInput));
	auxiliaryPart.activeGroup.focus();
};

/** メインのエディタ領域にボードを出す */
const openBoardInEditorArea = async (accessor: ServicesAccessor): Promise<void> => {
	const editorGroupService = accessor.get(IEditorGroupsService);
	const instantiationService = accessor.get(IInstantiationService);

	const openEditors = findOpenBoard(accessor);
	if (openEditors.length !== 0) {
		const { editor, groupId } = openEditors[0];
		await (editorGroupService.getGroup(groupId) ?? editorGroupService.activeGroup).openEditor(editor);
		return;
	}

	await editorGroupService.activeGroup.openEditor(instantiationService.createInstance(KanbanInput));
};

/** 設定に従って開き先を決める */
const openBoard = async (accessor: ServicesAccessor): Promise<void> => {
	const preferNewWindow = accessor.get(IVoidSettingsService).state.globalSettings.kanban?.openInNewWindow;
	if (preferNewWindow) await openBoardInNewWindow(accessor);
	else await openBoardInEditorArea(accessor);
};


// Action: Toggle the board (Ctrl+Alt+K, matching the browser pane's Ctrl+Alt+B)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_TOGGLE_KANBAN_ACTION_ID,
			title: nls.localize2('voidKanbanToggle', "Kanban: Toggle Board"),
			f1: true,
			icon: Codicon.checklist,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyK,
			},
			// タイトルバー右側のツールバー (レイアウト操作やアカウントと同じ並び) に出す。
			// ボードは「思い出したら開く」画面なので、コマンドパレットを経由せず 1 クリックで
			// 開けるところに置いておきたい。
			menu: [{
				id: MenuId.TitleBar,
				group: 'navigation',
				order: 1,
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);

		const openEditors = findOpenBoard(accessor);
		if (openEditors.length !== 0) {
			// 既に見えているなら閉じる。見えていない (裏のタブ / 別ウィンドウ) なら前面に出す。
			const openEditor = openEditors[0].editor;
			const isActive = editorService.activeEditor?.resource?.toString() === openEditor.resource?.toString();
			if (isActive) {
				await editorService.closeEditors(openEditors);
				return;
			}
		}

		await openBoard(accessor);
	}
});


// Action: Open the board (always opens / focuses, never closes)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_OPEN_KANBAN_ACTION_ID,
			title: nls.localize2('voidKanbanOpen', "Kanban: Open Board"),
			f1: true,
			icon: Codicon.checklist,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await openBoard(accessor);
	}
});


// Action: Open the board in a separate window, regardless of the setting
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_OPEN_KANBAN_IN_NEW_WINDOW_ACTION_ID,
			title: nls.localize2('voidKanbanOpenInNewWindow', "Kanban: Open Board in New Window"),
			f1: true,
			icon: Codicon.emptyWindow,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await openBoardInNewWindow(accessor);
	}
});
