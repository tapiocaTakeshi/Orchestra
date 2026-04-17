/*--------------------------------------------------------------------------------------
 *  Role Output Pane
 *  Registers an editor pane that displays each agent role's markdown output
 *  in the main editor area.
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

import { mountRoleOutputPanel } from './react/out/role-output-tsx/index.js';


class RoleOutputInput extends EditorInput {

	static readonly ID: string = 'workbench.input.void.roleOutput';

	static readonly RESOURCE = URI.from({
		scheme: 'void',
		path: 'role-output'
	});
	readonly resource = RoleOutputInput.RESOURCE;

	constructor() {
		super();
	}

	override get typeId(): string {
		return RoleOutputInput.ID;
	}

	override getName(): string {
		return nls.localize('roleOutputInputName', 'Role Output');
	}

	override getIcon() {
		return Codicon.output;
	}
}


class RoleOutputPane extends EditorPane {
	static readonly ID = 'workbench.pane.void.roleOutput';

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(RoleOutputPane.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.style.height = '100%';
		parent.style.width = '100%';

		const container = document.createElement('div');
		container.style.height = '100%';
		container.style.width = '100%';
		parent.appendChild(container);

		this.instantiationService.invokeFunction(accessor => {
			const disposeFn = mountRoleOutputPanel(container, accessor)?.dispose;
			this._register(toDisposable(() => disposeFn?.()));
		});
	}

	layout(_dimension: Dimension): void {
		// React handles its own layout
	}

	override get minimumWidth() { return 400; }
}

// Register the editor pane
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(RoleOutputPane, RoleOutputPane.ID, nls.localize('RoleOutputPane', "Role Output")),
	[new SyncDescriptor(RoleOutputInput)]
);


// Action: Toggle Role Output Panel
export const VOID_TOGGLE_ROLE_OUTPUT_ACTION_ID = 'workbench.action.toggleVoidRoleOutput';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_TOGGLE_ROLE_OUTPUT_ACTION_ID,
			title: nls.localize2('voidRoleOutput', "Void: Toggle Role Output"),
			f1: true,
			icon: Codicon.output,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		const instantiationService = accessor.get(IInstantiationService);

		const openEditors = editorService.findEditors(RoleOutputInput.RESOURCE);
		if (openEditors.length !== 0) {
			const openEditor = openEditors[0].editor;
			const isCurrentlyOpen = editorService.activeEditor?.resource?.fsPath === openEditor.resource?.fsPath;
			if (isCurrentlyOpen) {
				await editorService.closeEditors(openEditors);
			} else {
				await editorGroupService.activeGroup.openEditor(openEditor);
			}
			return;
		}

		const input = instantiationService.createInstance(RoleOutputInput);
		await editorGroupService.activeGroup.openEditor(input);
	}
});

// Action: Open Role Output Panel (always opens, no toggle)
export const VOID_OPEN_ROLE_OUTPUT_ACTION_ID = 'workbench.action.openVoidRoleOutput';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_OPEN_ROLE_OUTPUT_ACTION_ID,
			title: nls.localize2('voidRoleOutputOpen', "Void: Open Role Output"),
			f1: true,
			icon: Codicon.output,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);

		const openEditors = editorService.findEditors(RoleOutputInput.RESOURCE);
		if (openEditors.length > 0) {
			await editorService.closeEditors(openEditors);
		}

		const input = instantiationService.createInstance(RoleOutputInput);
		await editorService.openEditor(input);
	}
});
