/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// クラウドエージェントのパネル (エディタ領域) とコマンド。
//
// 左に「新しいクラウドエージェント」の入力欄とセッション一覧、右に選んだセッションの
// トランスクリプト・変更ファイル・追加指示の入力欄を出す (React: react/src/cloud-agents-tsx)。
// 表示モード (エージェント / 上級者) のどちらでも、タイトルバーの ☁ ボタンと Ctrl+Alt+A で開ける。

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
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

import { mountCloudAgents } from './react/out/cloud-agents-tsx/index.js';
import { ICloudAgentService } from './cloudAgentServiceInterface.js';
import {
	CLOUD_AGENTS_NEW_ACTION_ID,
	CLOUD_AGENTS_OPEN_ACTION_ID,
	CLOUD_AGENTS_STOP_ALL_ACTION_ID,
	isCloudSessionActive,
} from '../common/cloudAgentTypes.js';


/** 動いているクラウドエージェントがあるか (「すべて止める」の有効 / 無効に使う) */
const CloudAgentsActiveContext = new RawContextKey<boolean>('orchestra.cloudAgentsActive', false);


class CloudAgentsInput extends EditorInput {

	static readonly ID: string = 'workbench.input.void.cloudAgents';

	static readonly RESOURCE = URI.from({
		scheme: 'void',
		path: 'cloud-agents'
	});
	readonly resource = CloudAgentsInput.RESOURCE;

	override get typeId(): string {
		return CloudAgentsInput.ID;
	}

	override getName(): string {
		return nls.localize('cloudAgentsInputName', 'クラウドエージェント');
	}

	override getIcon() {
		return Codicon.cloud;
	}
}


class CloudAgentsPane extends EditorPane {
	static readonly ID = 'workbench.pane.void.cloudAgents';

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICloudAgentService private readonly cloudAgentService: ICloudAgentService,
	) {
		super(CloudAgentsPane.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.style.height = '100%';
		parent.style.width = '100%';

		// 別ウィンドウ (auxiliary window) に移したときも壊れないよう、親の document から作る
		const container = parent.ownerDocument.createElement('div');
		container.style.height = '100%';
		container.style.width = '100%';
		parent.appendChild(container);

		this.instantiationService.invokeFunction(accessor => {
			const disposeFn = mountCloudAgents(container, accessor)?.dispose;
			this._register(toDisposable(() => disposeFn?.()));
		});
		this._register(toDisposable(() => this.cloudAgentService.setPaneVisible(false)));
	}

	protected override setEditorVisible(visible: boolean): void {
		super.setEditorVisible(visible);
		// 表示中はポーリングを速くする
		this.cloudAgentService.setPaneVisible(visible);
	}

	layout(_dimension: Dimension): void {
		// React handles its own layout
	}

	override get minimumWidth() { return 480; }
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(CloudAgentsPane, CloudAgentsPane.ID, nls.localize('CloudAgentsPane', "クラウドエージェント")),
	[new SyncDescriptor(CloudAgentsInput)]
);


/** 既に開いていれば前面に出し、なければ今のエディタグループに開く */
const openCloudAgentsPane = async (accessor: ServicesAccessor): Promise<void> => {
	const editorService = accessor.get(IEditorService);
	const editorGroupService = accessor.get(IEditorGroupsService);
	const instantiationService = accessor.get(IInstantiationService);

	const openEditors = editorService.findEditors(CloudAgentsInput.RESOURCE);
	if (openEditors.length !== 0) {
		const { editor, groupId } = openEditors[0];
		const group = editorGroupService.getGroup(groupId) ?? editorGroupService.activeGroup;
		await group.openEditor(editor);
		group.focus();
		return;
	}
	await editorGroupService.activeGroup.openEditor(instantiationService.createInstance(CloudAgentsInput), { pinned: true });
};


// ---------------------------------------------------------------------------
// コマンド
// ---------------------------------------------------------------------------

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CLOUD_AGENTS_OPEN_ACTION_ID,
			title: nls.localize2('orchestraCloudAgents.open', "クラウドエージェントを開く"),
			category: nls.localize2('orchestraCloudAgents.category', "Orchestra"),
			f1: true,
			icon: Codicon.cloud,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyA,
			},
			// エージェントモード・上級者モードのどちらのタイトルバーにも出す (表示モードの when は付けない)
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 5 },
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await openCloudAgentsPane(accessor);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CLOUD_AGENTS_NEW_ACTION_ID,
			title: nls.localize2('orchestraCloudAgents.new', "新しいクラウドエージェントを起動"),
			category: nls.localize2('orchestraCloudAgents.category', "Orchestra"),
			f1: true,
			icon: Codicon.add,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const cloudAgentService = accessor.get(ICloudAgentService);
		await openCloudAgentsPane(accessor);
		cloudAgentService.select(null);
		cloudAgentService.requestFocusForm();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CLOUD_AGENTS_STOP_ALL_ACTION_ID,
			title: nls.localize2('orchestraCloudAgents.stopAll', "動いているクラウドエージェントをすべて止める"),
			category: nls.localize2('orchestraCloudAgents.category', "Orchestra"),
			f1: true,
			icon: Codicon.debugStop,
			precondition: CloudAgentsActiveContext,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const cloudAgentService = accessor.get(ICloudAgentService);
		const notificationService = accessor.get(INotificationService);
		const stopped = await cloudAgentService.stopAll();
		notificationService.info(stopped
			? nls.localize('orchestraCloudAgents.stopped', "{0} 個のクラウドエージェントを止めました。", stopped)
			: nls.localize('orchestraCloudAgents.nothingToStop', "動いているクラウドエージェントはありません。"));
	}
});


// ---------------------------------------------------------------------------
// 起動時: サービスを立ち上げてポーリングを始める (パネルを開いていなくても、完了を通知できるように)。
// 動いているものがあるかをコンテキストキーに流す。
// ---------------------------------------------------------------------------

class CloudAgentsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestraCloudAgents';

	constructor(
		@ICloudAgentService cloudAgentService: ICloudAgentService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const active = CloudAgentsActiveContext.bindTo(contextKeyService);
		const sync = () => active.set(cloudAgentService.state.sessions.some(s => isCloudSessionActive(s.status)));
		sync();
		this._register(cloudAgentService.onDidChangeState(sync));
	}
}
registerWorkbenchContribution2(CloudAgentsContribution.ID, CloudAgentsContribution, WorkbenchPhase.Eventually);
