/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra の表示モード。モードは 2 つだけ。
//
// 「クラウドエージェントモード (cloud)」が既定。クラウドで動くエージェントだけを扱う画面 (Cursor の Agents 画面のような形)。
// VS Code 由来の IDE 的な部品 (アクティビティバー・ステータスバー・ミニマップ・パンくず・
// レイアウトコントロール等) を隠したうえで、サイドバー・パネル・右のチャット (補助バー) を閉じ、
// エディタ領域いっぱいにクラウドエージェントのパネル (cloudAgentsPane.ts) を出す。
// このモードのあいだ、右のチャットは「強制非表示」: ショートカットや他のコマンドで開かれても、すぐに隠し直す。
// 上級者モードに切り替えると、チャットと (入る前に開いていた) サイドバー・パネルを戻す。
//
// 「上級者モード (pro)」は IDE モード。IDE の部品が通常の VS Code と同じ形で戻る。
//
// (以前あった「エージェントモード (agent)」は廃止した。設定に 'agent' が残っていてもクラウドエージェントモードとして扱う。)
//
// 見た目の切替は「設定の既定値の上書き (configuration defaults)」で、ユーザーの settings.json には
// 何も書き込まない。隠している部品も、ユーザーが settings.json で明示的に値を書いていれば
// そちらが優先される (既定値より常にユーザー設定が強い)。

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationDefaults, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { GroupsArrangement, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { VOID_OPEN_SIDEBAR_ACTION_ID, VOID_VIEW_CONTAINER_ID } from './sidebarPane.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from '../../files/common/files.js';
import { TERMINAL_VIEW_ID } from '../../terminal/common/terminal.js';
import {
	ORCHESTRA_UI_MODE_SETTING,
	ORCHESTRA_UI_MODE_CONTEXT_KEY,
	ORCHESTRA_AGENT_RUNNING_CONTEXT_KEY,
	ORCHESTRA_AGENT_AWAITING_CONTEXT_KEY,
	ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID,
	ORCHESTRA_UI_SET_CLOUD_MODE_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_FILES_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_TERMINAL_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_CHAT_ACTION_ID,
	ORCHESTRA_AGENT_STOP_ACTION_ID,
	ORCHESTRA_AGENT_SHOW_PENDING_ACTION_ID,
	ORCHESTRA_CHAT_SEND_PROMPT_ACTION_ID,
	OrchestraUiMode,
	parseOrchestraUiMode,
} from './orchestraUiModeTypes.js';
import { IChatThreadService } from './chatThreadServiceInterface.js';
import { ICloudAgentService } from './cloudAgentServiceInterface.js';
import { CLOUD_AGENTS_OPEN_ACTION_ID } from '../common/cloudAgentTypes.js';


// ---------------------------------------------------------------------------------------
// 設定・コンテキストキー
// ---------------------------------------------------------------------------------------

export const OrchestraUiModeContext = new RawContextKey<OrchestraUiMode>(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'cloud');
export const OrchestraAgentRunningContext = new RawContextKey<boolean>(ORCHESTRA_AGENT_RUNNING_CONTEXT_KEY, false);
export const OrchestraAgentAwaitingContext = new RawContextKey<boolean>(ORCHESTRA_AGENT_AWAITING_CONTEXT_KEY, false);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'orchestraUi',
	order: 1,
	title: localize('orchestraUi.configTitle', "Orchestra 表示モード"),
	type: 'object',
	properties: {
		[ORCHESTRA_UI_MODE_SETTING]: {
			type: 'string',
			enum: ['cloud', 'pro'],
			enumDescriptions: [
				localize('orchestraUi.mode.cloud', "クラウドエージェントモード: クラウドで動くエージェントの一覧・会話・変更だけを、エディタ領域いっぱいに表示します。右のチャットは常に隠れます。"),
				localize('orchestraUi.mode.pro', "上級者モード: VS Code と同じ IDE の表示に戻します。"),
			],
			default: 'cloud',
			description: localize('orchestraUi.mode', "Orchestra の見た目。クラウドでエージェントに任せるなら「クラウドエージェントモード」、自分でもコードを触るなら「上級者モード (IDE 表示)」がおすすめです。"),
		},
	},
});


// ---------------------------------------------------------------------------------------
// クラウドエージェントモードで上書きする既定値
// ---------------------------------------------------------------------------------------

// これらは「既定値」であって「ユーザー設定」ではない。ユーザーが settings.json に同じキーを
// 書いていればそちらが勝つ。
const AGENT_MODE_DEFAULTS: IConfigurationDefaults = {
	source: { id: 'orchestra.agentMode', displayName: 'Orchestra クラウドエージェントモード' },
	overrides: {
		// レイアウト: 左端のアイコン列と下端のステータスバーを消す。
		'workbench.activityBar.location': 'hidden',
		'workbench.statusBar.visible': false,
		'workbench.layoutControl.enabled': false,
		'window.commandCenter': false,
		'workbench.tips.enabled': false,
		'workbench.startupEditor': 'none',
		// エージェントが開いたファイルを眺めるのに要らない要素を減らす。
		'breadcrumbs.enabled': false,
		'editor.minimap.enabled': false,
		'editor.glyphMargin': false,
		'editor.scrollBeyondLastLine': false,
		'editor.stickyScroll.enabled': false,
		'editor.wordWrap': 'on',
		'editor.fontSize': 15,
		'editor.lineHeight': 1.6,
		'editor.padding.top': 12,
		// エクスプローラーはフォルダをまとめて折りたたまない (a/b/c のような表示は分かりにくい)。
		'explorer.compactFolders': false,
		'explorer.confirmDelete': true,
		'explorer.confirmDragAndDrop': true,
	},
};

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

// クラウドエージェントモードが既定なので、モジュール読み込み時点 (= 設定サービスの初期化より前) で
// 既定値を登録しておく。上級者モードのユーザーは起動時の contribution で外す。
let agentDefaultsRegistered = false;
function applyAgentModeDefaults(enable: boolean): void {
	if (enable === agentDefaultsRegistered) {
		return;
	}
	agentDefaultsRegistered = enable;
	if (enable) {
		configurationRegistry.registerDefaultConfigurations([AGENT_MODE_DEFAULTS]);
	} else {
		configurationRegistry.deregisterDefaultConfigurations([AGENT_MODE_DEFAULTS]);
	}
}
applyAgentModeDefaults(true);

// 'pro' 以外は全部クラウドエージェントモード扱い (未設定・不正値・廃止した 'agent' / 'simple' を含む)。
export function getOrchestraUiMode(configurationService: IConfigurationService): OrchestraUiMode {
	return parseOrchestraUiMode(configurationService.getValue<string>(ORCHESTRA_UI_MODE_SETTING));
}


// ---------------------------------------------------------------------------------------
// contribution
// ---------------------------------------------------------------------------------------

// レイアウトの作成 (renderWorkbench) より前に走らせたいので BlockStartup。
// ここで既定値の登録/解除をしておけば、LayoutStateModel が設定変更イベントで追従し、
// 最初の描画から正しい形で出る。
class OrchestraUiModeContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestraUiMode';

	private readonly modeContextKey: IContextKey<OrchestraUiMode>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.modeContextKey = OrchestraUiModeContext.bindTo(contextKeyService);
		this.sync();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ORCHESTRA_UI_MODE_SETTING)) {
				this.sync();
			}
		}));
	}

	private sync(): void {
		const mode = getOrchestraUiMode(this.configurationService);
		this.modeContextKey.set(mode);
		applyAgentModeDefaults(mode !== 'pro');
	}
}
registerWorkbenchContribution2(OrchestraUiModeContribution.ID, OrchestraUiModeContribution, WorkbenchPhase.BlockStartup);


// クラウドエージェントモードのレイアウト。
//
// 入ったとき (切り替えたとき・起動時にクラウドエージェントモードだったとき):
//   - 右のチャット (補助バー)・サイドバー・パネルを閉じる
//   - クラウドエージェントのパネルをエディタ領域に開き、エディタグループが複数あればそのグループを最大化する
//   - このモードのあいだは、補助バーやチャットが表示されたらすぐに隠し直す (強制非表示)
// 出たとき (上級者モードへ):
//   - チャットを戻し、入る前に開いていたサイドバー・パネルも戻す。最大化したグループは元に戻す
class OrchestraCloudModeLayout extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestraCloudModeLayout';
	/** 入る前のサイドバー・パネルの表示状態 (ワークスペースごと。再起動をまたいでも出るときに戻せるように) */
	private static readonly SAVED_LAYOUT_KEY = 'orchestra.ui.cloudMode.savedLayout';

	private mode: OrchestraUiMode;
	/** クラウドエージェントモードのあいだだけ持つリスナー (強制非表示) */
	private readonly cloudListeners = this._register(new DisposableStore());
	private rehideScheduled = false;
	/** このクラスがグループを最大化したか (出るときにだけ戻す。ユーザーが自分で最大化したものは触らない) */
	private maximizedByUs = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IViewsService private readonly viewsService: IViewsService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ICommandService private readonly commandService: ICommandService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.mode = getOrchestraUiMode(this.configurationService);
		if (this.mode === 'cloud') {
			// 起動時: 前回の「入る前のレイアウト」は残したまま (上書きすると、出るときに戻せなくなる)
			this.enter(false);
		}
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(ORCHESTRA_UI_MODE_SETTING)) {
				return;
			}
			const prev = this.mode;
			const next = getOrchestraUiMode(this.configurationService);
			if (prev === next) {
				return;
			}
			this.mode = next;
			if (next === 'cloud') {
				this.enter(true);
			} else if (prev === 'cloud') {
				this.leave();
			}
		}));
	}

	private enter(saveLayout: boolean): void {
		if (saveLayout) {
			const saved = {
				sidebar: this.layoutService.isVisible(Parts.SIDEBAR_PART),
				panel: this.layoutService.isVisible(Parts.PANEL_PART),
			};
			this.storageService.store(OrchestraCloudModeLayout.SAVED_LAYOUT_KEY, JSON.stringify(saved), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}

		try {
			this.hideChat();
			this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
			this.layoutService.setPartHidden(true, Parts.PANEL_PART);
		} catch (err) {
			console.warn('[Orchestra] クラウドエージェントモードのレイアウトに失敗しました', err);
		}

		// 強制非表示: 補助バーが表示された / チャットのビューが表示されたら、すぐに隠し直す。
		// レイアウトの更新の途中で呼ばれるので、その場では触らず、今の処理が終わった直後 (マイクロタスク) に隠す。
		this.cloudListeners.clear();
		this.cloudListeners.add(this.layoutService.onDidChangePartVisibility(() => {
			if (this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this.scheduleRehide();
			}
		}));
		this.cloudListeners.add(this.viewsService.onDidChangeViewContainerVisibility(e => {
			if (e.id === VOID_VIEW_CONTAINER_ID && e.visible) {
				this.scheduleRehide();
			}
		}));

		void this.openCloudPane();
	}

	private leave(): void {
		this.cloudListeners.clear();

		let saved: { sidebar?: boolean; panel?: boolean } = {};
		try {
			saved = JSON.parse(this.storageService.get(OrchestraCloudModeLayout.SAVED_LAYOUT_KEY, StorageScope.WORKSPACE, '{}')) ?? {};
		} catch {
			saved = {};
		}
		this.storageService.remove(OrchestraCloudModeLayout.SAVED_LAYOUT_KEY, StorageScope.WORKSPACE);

		try {
			if (this.maximizedByUs && this.editorGroupsService.mainPart.hasMaximizedGroup()) {
				this.editorGroupsService.toggleMaximizeGroup();
			}
			this.maximizedByUs = false;
			// チャット (= エージェントへの指示欄) を戻す
			this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			void this.viewsService.openViewContainer(VOID_VIEW_CONTAINER_ID);
			if (saved.sidebar) {
				this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
			}
			if (saved.panel) {
				this.layoutService.setPartHidden(false, Parts.PANEL_PART);
			}
		} catch (err) {
			console.warn('[Orchestra] レイアウトを元に戻せませんでした', err);
		}
	}

	private hideChat(): void {
		if (this.viewsService.isViewContainerVisible(VOID_VIEW_CONTAINER_ID)) {
			// ユーザーがチャットのビューを補助バー以外 (サイドバーなど) へ動かしていても閉じる
			this.viewsService.closeViewContainer(VOID_VIEW_CONTAINER_ID);
		}
		if (this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		}
	}

	private scheduleRehide(): void {
		if (this.rehideScheduled) {
			return;
		}
		this.rehideScheduled = true;
		queueMicrotask(() => {
			this.rehideScheduled = false;
			if (this.mode !== 'cloud') {
				return;
			}
			try {
				this.hideChat();
			} catch (err) {
				console.warn('[Orchestra] チャットを隠せませんでした', err);
			}
		});
	}

	private async openCloudPane(): Promise<void> {
		try {
			await this.commandService.executeCommand(CLOUD_AGENTS_OPEN_ACTION_ID);
			if (this.mode !== 'cloud') {
				return;
			}
			// エディタを分割していたら、クラウドエージェントのグループだけを見せる
			if (this.editorGroupsService.count > 1 && !this.editorGroupsService.mainPart.hasMaximizedGroup()) {
				this.editorGroupsService.arrangeGroups(GroupsArrangement.MAXIMIZE, this.editorGroupsService.activeGroup);
				this.maximizedByUs = true;
			}
		} catch (err) {
			console.warn('[Orchestra] クラウドエージェントのパネルを開けませんでした', err);
		}
	}
}
registerWorkbenchContribution2(OrchestraCloudModeLayout.ID, OrchestraCloudModeLayout, WorkbenchPhase.AfterRestored);


// エージェント (手元のチャット) の稼働状況をコンテキストキーに流す。「止める」「確認する」コマンドの precondition に使う。
class OrchestraAgentActivityContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestraAgentActivity';

	private readonly runningKey: IContextKey<boolean>;
	private readonly awaitingKey: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatThreadService private readonly chatThreadService: IChatThreadService,
	) {
		super();
		this.runningKey = OrchestraAgentRunningContext.bindTo(contextKeyService);
		this.awaitingKey = OrchestraAgentAwaitingContext.bindTo(contextKeyService);
		this.sync();
		this._register(this.chatThreadService.onDidChangeStreamState(() => this.sync()));
	}

	private sync(): void {
		let running = false;
		let awaiting = false;
		for (const s of Object.values(this.chatThreadService.streamState)) {
			if (!s?.isRunning) { continue; }
			if (s.isRunning === 'awaiting_user') { awaiting = true; }
			else { running = true; }
		}
		this.runningKey.set(running);
		this.awaitingKey.set(awaiting);
	}
}
registerWorkbenchContribution2(OrchestraAgentActivityContribution.ID, OrchestraAgentActivityContribution, WorkbenchPhase.AfterRestored);


// ---------------------------------------------------------------------------------------
// コマンド
// ---------------------------------------------------------------------------------------

export const isProMode = ContextKeyExpr.equals(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'pro');
export const isCloudMode = ContextKeyExpr.equals(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'cloud');
const isNotProMode = ContextKeyExpr.notEquals(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'pro');
const isNotCloudMode = ContextKeyExpr.notEquals(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'cloud');
const isAgentRunning = ContextKeyExpr.equals(ORCHESTRA_AGENT_RUNNING_CONTEXT_KEY, true);
const isAgentAwaiting = ContextKeyExpr.equals(ORCHESTRA_AGENT_AWAITING_CONTEXT_KEY, true);

// ServicesAccessor は await をまたいで使えないので、サービスは最初にまとめて取る。
async function setUiMode(accessor: ServicesAccessor, mode: OrchestraUiMode): Promise<void> {
	const configurationService = accessor.get(IConfigurationService);
	const notificationService = accessor.get(INotificationService);
	const commandService = accessor.get(ICommandService);
	if (getOrchestraUiMode(configurationService) === mode) {
		// 既にクラウドエージェントモード: パネルを前面に出すだけ (閉じていたら開き直す)
		if (mode === 'cloud') {
			await commandService.executeCommand(CLOUD_AGENTS_OPEN_ACTION_ID);
		}
		return;
	}
	// 既定値が cloud なので、cloud に戻すときは undefined を書いてユーザー設定から消す。
	// レイアウト (チャットを隠す・戻す、パネルを開く) は OrchestraCloudModeLayout が設定の変化を見て行う。
	await configurationService.updateValue(ORCHESTRA_UI_MODE_SETTING, mode === 'cloud' ? undefined : mode, ConfigurationTarget.USER);
	notificationService.info(
		mode === 'cloud' ? localize('orchestraUi.switchedToCloud', "クラウドエージェントモードに切り替えました。クラウドで動くエージェントの一覧と会話だけを表示します (右のチャットは隠れます)。タイトルバーの 🔧 で上級者モード (IDE 表示) に切り替えられます。")
			: localize('orchestraUi.switchedToPro', "上級者モードに切り替えました。IDE の全ての部品が表示されます。タイトルバーの ☁ でいつでもクラウドエージェントモードに戻せます。"));
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID,
			title: localize2('orchestraUi.setPro', "Orchestra: 上級者モード (IDE 表示) に切り替える"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.tools,
			precondition: isNotProMode,
		});
	}
	run(accessor: ServicesAccessor) {
		return setUiMode(accessor, 'pro');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_SET_CLOUD_MODE_ACTION_ID,
			title: localize2('orchestraUi.setCloud', "Orchestra: クラウドエージェントモードに切り替える"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.cloud,
		});
	}
	async run(accessor: ServicesAccessor, options?: unknown): Promise<void> {
		const cloudAgentService = accessor.get(ICloudAgentService);
		await setUiMode(accessor, 'cloud');
		const opts = (options && typeof options === 'object' ? options : {}) as { newAgent?: unknown; sessionId?: unknown };
		if (typeof opts.sessionId === 'string' && opts.sessionId) {
			// カンバンの「クラウドで開く」などから: そのエージェントを選んで、パネルを前面に出す
			cloudAgentService.select(opts.sessionId);
			await cloudAgentService.openPane();
		} else if (opts.newAgent === true) {
			// ホーム画面の「クラウドで並列に任せる」などから: 「新しいエージェント」の入力欄を開く
			cloudAgentService.select(null);
			cloudAgentService.requestFocusForm();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID,
			title: localize2('orchestraUi.toggle', "Orchestra: 表示モードを切り替える (クラウドエージェント / 上級者)"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyU,
			},
		});
	}
	run(accessor: ServicesAccessor) {
		// クラウドエージェント ⇄ 上級者
		const mode = getOrchestraUiMode(accessor.get(IConfigurationService));
		return setUiMode(accessor, mode === 'cloud' ? 'pro' : 'cloud');
	}
});


// 「ファイル一覧」「ターミナル」「エージェント」の開閉 (コマンドパレット・ホーム画面などから使う)。

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_TOGGLE_FILES_ACTION_ID,
			title: localize2('orchestraUi.toggleFiles', "ファイル一覧を表示 / 隠す"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.files,
		});
	}
	run(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const viewsService = accessor.get(IViewsService);
		const visible = layoutService.isVisible(Parts.SIDEBAR_PART);
		if (visible) {
			layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
		} else {
			layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
			viewsService.openViewContainer(EXPLORER_VIEWLET_ID);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_TOGGLE_TERMINAL_ACTION_ID,
			title: localize2('orchestraUi.toggleTerminal', "ターミナルを表示 / 隠す"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.terminal,
		});
	}
	run(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const viewsService = accessor.get(IViewsService);
		const visible = layoutService.isVisible(Parts.PANEL_PART);
		if (visible) {
			layoutService.setPartHidden(true, Parts.PANEL_PART);
		} else {
			layoutService.setPartHidden(false, Parts.PANEL_PART);
			viewsService.openViewContainer(TERMINAL_VIEW_ID);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_TOGGLE_CHAT_ACTION_ID,
			title: localize2('orchestraUi.toggleChat', "エージェントを表示 / 隠す"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.robot,
			// クラウドエージェントモードではチャットを強制的に隠しているので、開けないようにしておく
			precondition: isNotCloudMode,
		});
	}
	run(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const viewsService = accessor.get(IViewsService);
		const visible = layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (visible) {
			layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		} else {
			layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			viewsService.openViewContainer(VOID_VIEW_CONTAINER_ID);
		}
	}
});


// エージェントの制御: 動いている間は「止める」、承認待ちなら「確認する」。

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_AGENT_STOP_ACTION_ID,
			title: localize2('orchestraAgent.stop', "エージェントを止める"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.debugStop,
			precondition: isAgentRunning,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const chatThreadService = accessor.get(IChatThreadService);
		const running = Object.entries(chatThreadService.streamState)
			.filter(([, s]) => s?.isRunning && s.isRunning !== 'awaiting_user')
			.map(([threadId]) => threadId);
		await Promise.all(running.map(threadId => chatThreadService.abortRunning(threadId)));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_AGENT_SHOW_PENDING_ACTION_ID,
			title: localize2('orchestraAgent.showPending', "エージェントの確認待ちを見る"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.bellDot,
			precondition: isAgentAwaiting,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const chatThreadService = accessor.get(IChatThreadService);
		const commandService = accessor.get(ICommandService);
		const viewsService = accessor.get(IViewsService);

		// 今のスレッドが承認待ちでなければ、承認待ちのスレッドへ切り替える。
		const currentId = chatThreadService.state.currentThreadId;
		if (chatThreadService.streamState[currentId]?.isRunning !== 'awaiting_user') {
			const pending = Object.entries(chatThreadService.streamState).find(([, s]) => s?.isRunning === 'awaiting_user');
			if (pending) {
				chatThreadService.switchToThread(pending[0]);
			}
		}
		if (!viewsService.isViewContainerVisible(VOID_VIEW_CONTAINER_ID)) {
			await commandService.executeCommand(VOID_OPEN_SIDEBAR_ACTION_ID);
		}
		await chatThreadService.focusCurrentChat();
	}
});

// タイトルバーの右側: ☁ クラウドエージェントモードへ (5) / 🔧 上級者モードへ (9)。
// 今のモード以外へのボタンだけを出す。クラウドエージェントモードの ☁ は「パネルを前面に出す」(cloudAgentsPane.ts)。
// クラウドエージェントモードでは 6〜7 に Division プロジェクト (6)・コスト管理 (6.5)・カンバン (7) が並ぶ
// (voidSettingsPane.ts / kanbanPane.ts。右のチャットが無くても、IDE モードと同じ画面をエディタ領域に開く)。
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'orchestra.ui.titleBar.switchToCloud',
			title: localize2('orchestraUi.titleBar.toCloud', "クラウドエージェントモードに切り替える"),
			icon: Codicon.cloud,
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 5, when: isNotCloudMode },
		});
	}
	run(accessor: ServicesAccessor) {
		return setUiMode(accessor, 'cloud');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'orchestra.ui.titleBar.switchToPro',
			title: localize2('orchestraUi.titleBar.toPro', "上級者モード (IDE 表示) に切り替える"),
			icon: Codicon.tools,
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 9, when: isNotProMode },
		});
	}
	run(accessor: ServicesAccessor) {
		return setUiMode(accessor, 'pro');
	}
});


// ---------------------------------------------------------------------------------------
// ホーム画面などから、文字列を 1 つ渡してそのままエージェントに送る
// ---------------------------------------------------------------------------------------

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_CHAT_SEND_PROMPT_ACTION_ID,
			title: localize2('orchestraUi.sendPrompt', "Orchestra: エージェントにメッセージを送る"),
		});
	}
	async run(accessor: ServicesAccessor, userMessage?: unknown): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const viewsService = accessor.get(IViewsService);
		const chatThreadService = accessor.get(IChatThreadService);

		if (!viewsService.isViewContainerVisible(VOID_VIEW_CONTAINER_ID)) {
			await commandService.executeCommand(VOID_OPEN_SIDEBAR_ACTION_ID);
		}
		await chatThreadService.focusCurrentChat();

		const text = typeof userMessage === 'string' ? userMessage.trim() : '';
		if (!text) {
			return;
		}
		// 途中のスレッドに混ぜない。ホーム画面から始めるのは常に新しい会話。
		if (chatThreadService.getCurrentThread().messages.length > 0) {
			chatThreadService.openNewThread();
		}
		const threadId = chatThreadService.state.currentThreadId;
		await chatThreadService.addUserMessageAndStreamResponse({ userMessage: text, threadId });
	}
});
