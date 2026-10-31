/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// クラウドエージェントのパネル (エディタ領域) とコマンド。
//
// Cursor の Agents 画面のような 3 列: 左にエージェントの一覧 (実行中 / 完了 / 停止・失敗)、
// 中央に選んだエージェントとの会話と入力欄、右に変更ファイルと差分 (React: react/src/cloud-agents-tsx)。
//
// 出し方はモードで変わる:
//  - クラウドエージェントモード: エディタのタブではなく、タイトルバーの下の画面全体をクラウドエージェントの画面にする
//    (CloudAgentsFullscreen)。カンバンや取り込んだ差分などエディタ領域に何かが開いたら、その間だけ画面を下げ、
//    右下の「クラウドエージェントに戻る」かタイトルバーの ☁ (Ctrl+Alt+A) で戻る。
//  - 上級者モード (IDE 表示): これまでどおりエディタのタブとして開く。
// タイトルバーの ☁ は「クラウドエージェントモードへ切り替える」(orchestraUiMode.ts) で、
// クラウドエージェントモードのあいだだけ、この画面を前面に出すボタンになる。

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
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';

import { mountCloudAgents } from './react/out/cloud-agents-tsx/index.js';
import { ICloudAgentService } from './cloudAgentServiceInterface.js';
import { ORCHESTRA_UI_MODE_CONTEXT_KEY, ORCHESTRA_UI_MODE_SETTING, parseOrchestraUiMode } from './orchestraUiModeTypes.js';
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


// ---------------------------------------------------------------------------
// クラウドエージェントモード: 画面全体をクラウドエージェントの画面にする
// ---------------------------------------------------------------------------

/** 起動中の全画面表示 (クラウドエージェントモードのあいだだけある) */
let fullscreen: CloudAgentsFullscreen | undefined;

class CloudAgentsFullscreen extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestraCloudAgentsFullscreen';

	/** タイトルバーの下を覆う画面。クラウドエージェントモードのあいだだけ作る */
	private root: HTMLElement | undefined;
	/** エディタ領域に何かを開いて画面を下げているときに出す「クラウドエージェントに戻る」 */
	private backButton: HTMLElement | undefined;
	private readonly mounted = this._register(new DisposableStore());
	private shown = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ICloudAgentService private readonly cloudAgentService: ICloudAgentService,
	) {
		super();
		fullscreen = this;
		this._register(toDisposable(() => { if (fullscreen === this) fullscreen = undefined; }));
		this.sync();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ORCHESTRA_UI_MODE_SETTING)) this.sync();
		}));
		// タイトルバーの高さが変わったら (全画面表示・ズームなど) 合わせる
		this._register(this.layoutService.onDidLayoutMainContainer(() => this.position()));
		// エディタ領域に何かが開いたら (カンバン・コスト管理・取り込んだ差分など)、それが見えるよう画面を下げる
		// (既に開いているものを開き直したときは active が変わらないので、開く前のイベントも見る)
		this._register(this.editorService.onWillOpenEditor(e => {
			if (this.shown && e.editor.typeId !== CloudAgentsInput.ID) this.hide();
		}));
		this._register(this.editorService.onDidActiveEditorChange(() => {
			const active = this.editorService.activeEditor;
			if (this.shown && active && active.typeId !== CloudAgentsInput.ID) this.hide();
		}));
	}

	get isActive(): boolean { return !!this.root; }

	private isCloudMode(): boolean {
		return parseOrchestraUiMode(this.configurationService.getValue(ORCHESTRA_UI_MODE_SETTING)) === 'cloud';
	}

	private sync(): void {
		if (this.isCloudMode()) {
			this.create();
			this.show();
		} else {
			this.destroy();
		}
	}

	private create(): void {
		if (this.root) return;
		const doc = this.layoutService.mainContainer.ownerDocument;
		const root = doc.createElement('div');
		root.className = 'orchestra-cloud-agents-fullscreen';
		// エディタ・サイドバーなどの上、メニュー・クイック入力・通知・ダイアログの下
		Object.assign(root.style, { position: 'absolute', left: '0', right: '0', bottom: '0', zIndex: '40', display: 'none' });
		this.layoutService.mainContainer.appendChild(root);
		this.root = root;

		const back = doc.createElement('button');
		back.type = 'button';
		back.textContent = nls.localize('cloudAgentsFullscreen.back', "☁ クラウドエージェントに戻る");
		Object.assign(back.style, {
			position: 'absolute', right: '20px', bottom: '20px', zIndex: '40', display: 'none',
			padding: '8px 14px', borderRadius: '999px', border: '1px solid var(--vscode-contrastBorder, transparent)', cursor: 'pointer',
			background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', font: 'inherit', fontSize: '12.5px',
			boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
		});
		back.addEventListener('click', () => this.show());
		this.layoutService.mainContainer.appendChild(back);
		this.backButton = back;

		this.position();
		this.instantiationService.invokeFunction(accessor => {
			const disposeFn = mountCloudAgents(root, accessor)?.dispose;
			this.mounted.add(toDisposable(() => disposeFn?.()));
		});
		// 前回タブとして開いていたものは閉じる (同じ画面が 2 つにならないように)
		for (const { editor, groupId } of this.editorService.findEditors(CloudAgentsInput.RESOURCE)) {
			void this.editorGroupsService.getGroup(groupId)?.closeEditor(editor);
		}
	}

	private destroy(): void {
		if (!this.root) return;
		this.mounted.clear();
		this.root.remove();
		this.backButton?.remove();
		this.root = undefined;
		this.backButton = undefined;
		this.shown = false;
		this.cloudAgentService.setPaneVisible(false);
	}

	private position(): void {
		if (!this.root) return;
		this.root.style.top = `${this.layoutService.mainContainerOffset.top}px`;
	}

	show(): void {
		if (!this.root) return;
		this.position();
		this.root.style.display = '';
		if (this.backButton) this.backButton.style.display = 'none';
		this.shown = true;
		this.cloudAgentService.setPaneVisible(true);
	}

	private hide(): void {
		if (!this.root) return;
		this.root.style.display = 'none';
		if (this.backButton) this.backButton.style.display = '';
		this.shown = false;
		this.cloudAgentService.setPaneVisible(false);
	}
}
registerWorkbenchContribution2(CloudAgentsFullscreen.ID, CloudAgentsFullscreen, WorkbenchPhase.AfterRestored);


/**
 * クラウドエージェントモードなら全画面の画面を前面に出す。
 * 上級者モードでは、既に開いていれば前面に出し、なければ今のエディタグループにタブとして開く
 */
const openCloudAgentsPane = async (accessor: ServicesAccessor): Promise<void> => {
	if (fullscreen?.isActive) {
		fullscreen.show();
		return;
	}
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
			// タイトルバーにはクラウドエージェントモードのときだけ出す。他のモードでは同じ位置に
			// 「クラウドエージェントモードに切り替える」(orchestraUiMode.ts) が出る
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 5, when: ContextKeyExpr.equals(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'cloud') },
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
