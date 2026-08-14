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
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

import { mountKanbanBoard } from './react/out/kanban-tsx/index.js';
import { VOID_OPEN_KANBAN_ACTION_ID, VOID_TOGGLE_KANBAN_ACTION_ID } from './actionIDs.js';


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

		const container = document.createElement('div');
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
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		const instantiationService = accessor.get(IInstantiationService);

		const openEditors = editorService.findEditors(KanbanInput.RESOURCE);
		if (openEditors.length !== 0) {
			const openEditor = openEditors[0].editor;
			const isCurrentlyOpen = editorService.activeEditor?.resource?.toString() === openEditor.resource?.toString();
			if (isCurrentlyOpen) {
				await editorService.closeEditors(openEditors);
			} else {
				await editorGroupService.activeGroup.openEditor(openEditor);
			}
			return;
		}

		const input = instantiationService.createInstance(KanbanInput);
		await editorGroupService.activeGroup.openEditor(input);
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
		const editorService = accessor.get(IEditorService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		const instantiationService = accessor.get(IInstantiationService);

		const openEditors = editorService.findEditors(KanbanInput.RESOURCE);
		if (openEditors.length !== 0) {
			await editorGroupService.activeGroup.openEditor(openEditors[0].editor);
			return;
		}

		const input = instantiationService.createInstance(KanbanInput);
		await editorService.openEditor(input);
	}
});
