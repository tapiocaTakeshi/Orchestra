/*--------------------------------------------------------------------------------------
 *  .division/workflow.json opens as a diagram (the Division Project workflow) instead of the
 *  JSON text. The editor is registered as the default for that file; "Reopen Editor With..." or
 *  the "JSON で開く" button opens the text editor. Edits mark the editor dirty and Save (Ctrl+S)
 *  writes the JSON back. The diagram itself is React (react/src/workflow-file-tsx).
 *--------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import * as nls from '../../../../nls.js';
import { EditorExtensions, EditorInputCapabilities, GroupIdentifier, IEditorFactoryRegistry, IEditorOpenContext, IEditorSerializer, ISaveOptions, IRevertOptions, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';

import { mountWorkflowFileEditor } from './react/out/workflow-file-tsx/index.js';

const WORKFLOW_FILE_GLOB = '**/.division/workflow.json';
const WORKFLOW_EDITOR_ID = 'void.workflowFileEditor';


/** One opened workflow.json; holds the unsaved JSON and writes it on save. */
class WorkflowFileInput extends EditorInput {

	static readonly ID: string = 'workbench.input.void.workflowFile';

	private pending: string | undefined;
	private readonly _onDidRevert = this._register(new Emitter<void>());
	readonly onDidRevert = this._onDidRevert.event;

	constructor(
		readonly resource: URI,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
	}

	override get typeId(): string { return WorkflowFileInput.ID; }
	override get editorId(): string { return WORKFLOW_EDITOR_ID; }

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Singleton;
	}

	override getName(): string { return basename(this.resource); }
	override getDescription(): string { return nls.localize('workflowFileDescription', "ワークフロー図"); }
	override getIcon() { return Codicon.typeHierarchy; }

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) { return true; }
		return other instanceof WorkflowFileInput && isEqual(other.resource, this.resource);
	}

	override isDirty(): boolean { return this.pending !== undefined; }

	setPending(json: string | undefined): void {
		const wasDirty = this.isDirty();
		this.pending = json;
		if (wasDirty !== this.isDirty()) { this._onDidChangeDirty.fire(); }
	}

	async write(): Promise<void> {
		if (this.pending === undefined) { return; }
		const json = this.pending;
		await this.fileService.writeFile(this.resource, VSBuffer.fromString(json));
		// Edits made while writing stay pending.
		if (this.pending === json) { this.setPending(undefined); }
	}

	override async save(_group: GroupIdentifier, _options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		await this.write();
		return this;
	}

	override async revert(_group: GroupIdentifier, _options?: IRevertOptions): Promise<void> {
		this.setPending(undefined);
		this._onDidRevert.fire();
	}

	override toUntyped(): IUntypedEditorInput {
		return { resource: this.resource, options: { override: WORKFLOW_EDITOR_ID } };
	}
}


class WorkflowFilePane extends EditorPane {
	static readonly ID = 'workbench.pane.void.workflowFile';

	private mounted: { rerender: (props?: any) => void; dispose: () => void } | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(WorkflowFilePane.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.style.height = '100%';
		parent.style.width = '100%';

		const container = document.createElement('div');
		container.style.height = '100%';
		container.style.width = '100%';
		parent.appendChild(container);

		this.instantiationService.invokeFunction(accessor => {
			this.mounted = mountWorkflowFileEditor(container, accessor);
			this._register(toDisposable(() => this.mounted?.dispose()));
		});
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (!(input instanceof WorkflowFileInput)) { return; }
		this.mounted?.rerender({
			bridge: {
				uri: input.resource,
				setPending: (json: string | undefined) => input.setPending(json),
				isDirty: () => input.isDirty(),
				onDidChangeDirty: input.onDidChangeDirty,
				onDidRevert: input.onDidRevert,
				save: () => input.write(),
			},
		});
	}

	override clearInput(): void {
		this.mounted?.rerender({ bridge: undefined });
		super.clearInput();
	}

	layout(_dimension: Dimension): void {
		// React handles its own layout
	}

	override get minimumWidth() { return 320; }
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(WorkflowFilePane, WorkflowFilePane.ID, nls.localize('WorkflowFilePane', "Workflow")),
	[new SyncDescriptor(WorkflowFileInput)]
);

// Reopen the diagram after a restart (unsaved edits are not kept).
class WorkflowFileInputSerializer implements IEditorSerializer {
	canSerialize(editor: EditorInput): boolean { return editor instanceof WorkflowFileInput; }
	serialize(editor: EditorInput): string | undefined {
		return editor instanceof WorkflowFileInput ? JSON.stringify({ resource: editor.resource.toJSON() }) : undefined;
	}
	deserialize(instantiationService: IInstantiationService, raw: string): EditorInput | undefined {
		try {
			const { resource } = JSON.parse(raw);
			return instantiationService.createInstance(WorkflowFileInput, URI.revive(resource));
		} catch {
			return undefined;
		}
	}
}
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(WorkflowFileInput.ID, WorkflowFileInputSerializer);


/** Makes the diagram the default editor for .division/workflow.json. */
class WorkflowFileEditorContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.void.workflowFileEditor';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(editorResolverService.registerEditor(
			WORKFLOW_FILE_GLOB,
			{
				id: WORKFLOW_EDITOR_ID,
				label: nls.localize('workflowFileEditorLabel', "ワークフロー図"),
				detail: 'Orchestra',
				priority: RegisteredEditorPriority.default,
			},
			{
				singlePerResource: true,
				canSupportResource: uri => basename(uri) === 'workflow.json',
			},
			{
				createEditorInput: ({ resource }) => ({ editor: instantiationService.createInstance(WorkflowFileInput, resource) }),
			}
		));
	}
}

registerWorkbenchContribution2(WorkflowFileEditorContribution.ID, WorkflowFileEditorContribution, WorkbenchPhase.BlockStartup);
