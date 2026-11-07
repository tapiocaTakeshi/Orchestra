/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/*
 * .division/workflow.json opens as the workflow diagram (react/src/workflow-tsx/WorkflowFileEditor.tsx)
 * instead of JSON text. "JSON で開く" in the diagram, or "Reopen Editor With… → Text Editor", shows the text.
 */

import * as nls from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { basename } from '../../../../base/common/resources.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorExtensions, IEditorFactoryRegistry, IEditorOpenContext, IEditorSerializer, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

import { mountWorkflowFileEditor } from './react/out/workflow-tsx/index.js';

const WORKFLOW_GLOB = '**/.division/workflow.json';

const isWorkflowFile = (resource: URI): boolean =>
	basename(resource) === 'workflow.json' && resource.path.split('/').slice(-2, -1)[0] === '.division';

export class WorkflowFileInput extends EditorInput {
	static readonly ID = 'workbench.input.orchestra.workflowFile';

	constructor(readonly resource: URI) {
		super();
	}

	override get typeId(): string { return WorkflowFileInput.ID; }
	override get editorId(): string { return WorkflowFileInput.ID; }

	override getName(): string {
		return nls.localize('orchestraWorkflowFileName', "ワークフロー");
	}

	override getDescription(): string {
		return '.division/workflow.json';
	}

	override getIcon() { return Codicon.typeHierarchy; }

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) { return true; }
		return other instanceof WorkflowFileInput && other.resource.toString() === this.resource.toString();
	}
}

class WorkflowFilePane extends EditorPane {
	static readonly ID = 'workbench.pane.orchestra.workflowFile';

	private container: HTMLElement | undefined;
	private mounted: ReturnType<typeof mountWorkflowFileEditor>;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(WorkflowFilePane.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.style.height = '100%';
		parent.style.width = '100%';
		const container = this.container = parent.ownerDocument.createElement('div');
		container.style.height = '100%';
		container.style.width = '100%';
		parent.appendChild(container);
		this._register(toDisposable(() => this.mounted?.dispose()));
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (!(input instanceof WorkflowFileInput) || !this.container) { return; }
		const uri = input.resource;
		const props = {
			uri,
			// The same file as JSON text, in place of the diagram.
			openAsText: () => {
				void this.editorService.openEditor({ resource: uri, options: { override: DEFAULT_EDITOR_ASSOCIATION.id, pinned: true } }, this.group);
			},
		};
		if (this.mounted) {
			this.mounted.rerender(props);
		} else {
			const container = this.container;
			this.instantiationService.invokeFunction(accessor => {
				this.mounted = mountWorkflowFileEditor(container, accessor, props);
			});
		}
	}

	layout(_dimension: Dimension): void {
		// React handles its own layout
	}

	override get minimumWidth() { return 320; }
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(WorkflowFilePane, WorkflowFilePane.ID, nls.localize('orchestraWorkflowFilePane', "Workflow")),
	[new SyncDescriptor(WorkflowFileInput)]
);

class WorkflowFileInputSerializer implements IEditorSerializer {
	canSerialize(editor: EditorInput): boolean { return editor instanceof WorkflowFileInput; }
	serialize(editor: EditorInput): string | undefined {
		return editor instanceof WorkflowFileInput ? JSON.stringify({ resource: editor.resource.toJSON() }) : undefined;
	}
	deserialize(instantiationService: IInstantiationService, serialized: string): EditorInput | undefined {
		try {
			const { resource } = JSON.parse(serialized);
			return instantiationService.createInstance(WorkflowFileInput, URI.revive(resource));
		} catch {
			return undefined;
		}
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(WorkflowFileInput.ID, WorkflowFileInputSerializer);

/** Opening .division/workflow.json picks the diagram by default (the text editor stays under "Reopen Editor With…"). */
class WorkflowFileEditorContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestra.workflowFileEditor';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		editorResolverService.registerEditor(
			WORKFLOW_GLOB,
			{
				id: WorkflowFileInput.ID,
				label: nls.localize('orchestraWorkflowEditorLabel', "Workflow Diagram"),
				detail: 'Orchestra',
				priority: RegisteredEditorPriority.default,
			},
			{
				singlePerResource: true,
				canSupportResource: isWorkflowFile,
			},
			{
				createEditorInput: ({ resource }) => ({ editor: instantiationService.createInstance(WorkflowFileInput, resource) }),
			}
		);
	}
}

registerWorkbenchContribution2(WorkflowFileEditorContribution.ID, WorkflowFileEditorContribution, WorkbenchPhase.BlockStartup);
