/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra の表示モード。
//
// 「エージェントモード (agent)」が既定。AI エージェントに作業を任せるための画面で、
// VS Code 由来の IDE 的な部品 (アクティビティバー・ステータスバー・ミニマップ・パンくず・
// レイアウトコントロール等) を隠し、エディタの空き領域にはコードではなく「エージェントに
// 何をさせるか」のホーム画面を出す。チャット (= エージェントへの指示欄) が主役になる。
//
// エージェントモードでは動作面でも「任せる」側に寄せる:
//   - チャットモードを 'agent' (ファイル編集・ツール実行あり) にする
//   - ファイル編集とターミナル実行のツールを自動承認にする (いちいち「許可」を押さなくていい)
//   - エージェントが動いている間はタイトルバーに「止める」ボタン、承認待ちなら「確認する」ボタンを出す
//
// 「上級者モード (pro)」に切り替えると、IDE の部品が通常の VS Code と同じ形で戻る。
//
// 見た目の切替は「設定の既定値の上書き (configuration defaults)」で、ユーザーの settings.json には
// 何も書き込まない。隠している部品も、ユーザーが settings.json で明示的に値を書いていれば
// そちらが優先される (既定値より常にユーザー設定が強い)。

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import Severity from '../../../../base/common/severity.js';
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
import { VOID_OPEN_SIDEBAR_ACTION_ID, VOID_VIEW_CONTAINER_ID } from './sidebarPane.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from '../../files/common/files.js';
import { TERMINAL_VIEW_ID } from '../../terminal/common/terminal.js';
import {
	ORCHESTRA_UI_MODE_SETTING,
	ORCHESTRA_UI_MODE_CONTEXT_KEY,
	ORCHESTRA_AGENT_RUNNING_CONTEXT_KEY,
	ORCHESTRA_AGENT_AWAITING_CONTEXT_KEY,
	ORCHESTRA_UI_SET_AGENT_MODE_ACTION_ID,
	ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_FILES_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_TERMINAL_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_CHAT_ACTION_ID,
	ORCHESTRA_AGENT_STOP_ACTION_ID,
	ORCHESTRA_AGENT_SHOW_PENDING_ACTION_ID,
	ORCHESTRA_CHAT_SEND_PROMPT_ACTION_ID,
	OrchestraUiMode,
} from './orchestraUiModeTypes.js';
import { IChatThreadService } from './chatThreadServiceInterface.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';


// ---------------------------------------------------------------------------------------
// 設定・コンテキストキー
// ---------------------------------------------------------------------------------------

export const OrchestraUiModeContext = new RawContextKey<OrchestraUiMode>(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'agent');
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
			enum: ['agent', 'pro'],
			enumDescriptions: [
				localize('orchestraUi.mode.agent', "エージェントモード: AI エージェントに作業を任せる画面。チャットとホーム画面が中心で、アクティビティバー・ステータスバー・ミニマップなど IDE 的な部品を隠します。"),
				localize('orchestraUi.mode.pro', "上級者モード: VS Code と同じ IDE の表示に戻します。"),
			],
			default: 'agent',
			description: localize('orchestraUi.mode', "Orchestra の見た目。AI に任せて進めるなら「エージェントモード」、自分でもコードを触るなら「上級者モード」がおすすめです。"),
		},
	},
});


// ---------------------------------------------------------------------------------------
// エージェントモードで上書きする既定値
// ---------------------------------------------------------------------------------------

// これらは「既定値」であって「ユーザー設定」ではない。ユーザーが settings.json に同じキーを
// 書いていればそちらが勝つので、エージェントモードのままミニマップだけ戻す、といったことも可能。
const AGENT_MODE_DEFAULTS: IConfigurationDefaults = {
	source: { id: 'orchestra.agentMode', displayName: 'Orchestra エージェントモード' },
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

// エージェントモードが既定なので、モジュール読み込み時点 (= 設定サービスの初期化より前) で
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


// 'pro' 以外は全部エージェントモード扱い (未設定・不正値・旧名の 'simple' を含む)。
export function getOrchestraUiMode(configurationService: IConfigurationService): OrchestraUiMode {
	return configurationService.getValue<string>(ORCHESTRA_UI_MODE_SETTING) === 'pro' ? 'pro' : 'agent';
}


// エージェントモードの「動作」側の設定。
// チャットモードを agent にし、ファイル編集とターミナル実行を自動承認にする。
// ユーザーがあとから Settings で個別に戻せるよう、モードに入った瞬間 (切替時・初回起動時) にだけ書く。
async function applyAgentModeBehaviour(settingsService: IVoidSettingsService): Promise<void> {
	await settingsService.waitForInitState;
	const { chatMode, autoApprove } = settingsService.state.globalSettings;
	if (chatMode !== 'agent') {
		settingsService.setGlobalSetting('chatMode', 'agent');
	}
	if (!autoApprove.edits || !autoApprove.terminal) {
		settingsService.setGlobalSetting('autoApprove', { ...autoApprove, edits: true, terminal: true });
	}
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
		applyAgentModeDefaults(mode === 'agent');
	}
}
registerWorkbenchContribution2(OrchestraUiModeContribution.ID, OrchestraUiModeContribution, WorkbenchPhase.BlockStartup);


// 初回起動時 (エージェントモード) の整形。
// 「ファイル一覧」と「ターミナル」は最初は閉じておき、エージェント (チャット) はウィンドウ幅の 4 割ほどに広げる。
// あわせてエージェントモードの動作設定 (agent チャット・自動承認) を入れる。
// 一度やったら記録して二度と触らない (以降はユーザーがドラッグした幅や変えた設定を尊重する)。
class OrchestraAgentModeFirstRun extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestraAgentModeFirstRun';
	private static readonly STORAGE_KEY = 'orchestra.ui.agentModeInitialized';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IViewsService viewsService: IViewsService,
		@IVoidSettingsService settingsService: IVoidSettingsService,
	) {
		super();

		if (getOrchestraUiMode(configurationService) !== 'agent') {
			return;
		}
		if (storageService.getBoolean(OrchestraAgentModeFirstRun.STORAGE_KEY, StorageScope.APPLICATION, false)) {
			return;
		}
		storageService.store(OrchestraAgentModeFirstRun.STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);

		applyAgentModeBehaviour(settingsService).catch(err => {
			console.warn('[Orchestra] エージェントモードの初期設定に失敗しました', err);
		});

		try {
			layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
			layoutService.setPartHidden(true, Parts.PANEL_PART);
			layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			viewsService.openViewContainer(VOID_VIEW_CONTAINER_ID);

			const dimension = layoutService.mainContainerDimension;
			const current = layoutService.getSize(Parts.AUXILIARYBAR_PART);
			const wanted = Math.max(360, Math.min(560, Math.round(dimension.width * 0.4)));
			if (current.width < wanted) {
				layoutService.setSize(Parts.AUXILIARYBAR_PART, { width: wanted, height: current.height });
			}
		} catch (err) {
			// レイアウトが取れないケース (テスト・ヘッドレス等) は黙って通す。見た目の初期化なので失敗しても支障はない。
			console.warn('[Orchestra] 初回レイアウトの整形に失敗しました', err);
		}
	}
}
registerWorkbenchContribution2(OrchestraAgentModeFirstRun.ID, OrchestraAgentModeFirstRun, WorkbenchPhase.AfterRestored);


// エージェントの稼働状況をコンテキストキーに流す。
// エージェントモードではチャットを閉じたまま作業させることもあるので、タイトルバーから
// 「止める」「確認する」ができるようにし、承認待ちになったらチャットが隠れていても知らせる。
class OrchestraAgentActivityContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestraAgentActivity';

	private readonly runningKey: IContextKey<boolean>;
	private readonly awaitingKey: IContextKey<boolean>;
	private wasAwaiting = false;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatThreadService private readonly chatThreadService: IChatThreadService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
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

		// 承認待ちに「なった」瞬間だけ、チャットが見えていなければ知らせる。
		if (awaiting && !this.wasAwaiting && getOrchestraUiMode(this.configurationService) === 'agent' && !this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			this.notificationService.prompt(
				Severity.Info,
				localize('orchestraAgent.awaitingNotification', "エージェントがあなたの確認を待っています。"),
				[{
					label: localize('orchestraAgent.awaitingNotification.open', "確認する"),
					run: () => { this.commandService.executeCommand(ORCHESTRA_AGENT_SHOW_PENDING_ACTION_ID); },
				}],
				{ sticky: true },
			);
		}
		this.wasAwaiting = awaiting;
	}
}
registerWorkbenchContribution2(OrchestraAgentActivityContribution.ID, OrchestraAgentActivityContribution, WorkbenchPhase.AfterRestored);


// ---------------------------------------------------------------------------------------
// コマンド
// ---------------------------------------------------------------------------------------

const isAgentMode = ContextKeyExpr.equals(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'agent');
const isProMode = ContextKeyExpr.equals(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'pro');
const isAgentRunning = ContextKeyExpr.equals(ORCHESTRA_AGENT_RUNNING_CONTEXT_KEY, true);
const isAgentAwaiting = ContextKeyExpr.equals(ORCHESTRA_AGENT_AWAITING_CONTEXT_KEY, true);

async function setUiMode(accessor: ServicesAccessor, mode: OrchestraUiMode): Promise<void> {
	const configurationService = accessor.get(IConfigurationService);
	const notificationService = accessor.get(INotificationService);
	const settingsService = accessor.get(IVoidSettingsService);
	if (getOrchestraUiMode(configurationService) === mode) {
		return;
	}
	// 既定値が agent なので、agent に戻すときは undefined を書いてユーザー設定から消す。
	await configurationService.updateValue(ORCHESTRA_UI_MODE_SETTING, mode === 'agent' ? undefined : mode, ConfigurationTarget.USER);
	if (mode === 'agent') {
		await applyAgentModeBehaviour(settingsService);
	}
	notificationService.info(mode === 'agent'
		? localize('orchestraUi.switchedToAgent', "エージェントモードに切り替えました。やってほしいことを伝えるだけで、エージェントがファイル編集やコマンド実行まで進めます。")
		: localize('orchestraUi.switchedToPro', "上級者モードに切り替えました。IDE の全ての部品が表示されます。「Orchestra: エージェントモードに戻す」でいつでも戻せます。"));
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID,
			title: localize2('orchestraUi.setPro', "Orchestra: 上級者モード (IDE 表示) に切り替える"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.tools,
			precondition: isAgentMode,
		});
	}
	run(accessor: ServicesAccessor) {
		return setUiMode(accessor, 'pro');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_SET_AGENT_MODE_ACTION_ID,
			title: localize2('orchestraUi.setAgent', "Orchestra: エージェントモードに戻す"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.robot,
			precondition: isProMode,
		});
	}
	run(accessor: ServicesAccessor) {
		return setUiMode(accessor, 'agent');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID,
			title: localize2('orchestraUi.toggle', "Orchestra: 表示モードを切り替える (エージェント / 上級者)"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyU,
			},
		});
	}
	run(accessor: ServicesAccessor) {
		const mode = getOrchestraUiMode(accessor.get(IConfigurationService));
		return setUiMode(accessor, mode === 'agent' ? 'pro' : 'agent');
	}
});


// エージェントモードではアクティビティバーが無いので、「ファイル一覧」「ターミナル」「エージェント」の
// 開閉ボタンをタイトルバー右側に、言葉付きのツールチップで置く。上級者モードでは出さない。

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_TOGGLE_FILES_ACTION_ID,
			title: localize2('orchestraUi.toggleFiles', "ファイル一覧を表示 / 隠す"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.files,
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 1, when: isAgentMode },
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
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 2, when: isAgentMode },
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
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 3, when: isAgentMode },
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
// どちらもエージェントモードのタイトルバーに出る (チャットを閉じていても手が届くように)。

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_AGENT_STOP_ACTION_ID,
			title: localize2('orchestraAgent.stop', "エージェントを止める"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.debugStop,
			precondition: isAgentRunning,
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 4, when: ContextKeyExpr.and(isAgentMode, isAgentRunning) },
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
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 4, when: ContextKeyExpr.and(isAgentMode, isAgentAwaiting) },
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


// タイトルバーの一番右: 上級者モードへ / エージェントモードへ。
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'orchestra.ui.titleBar.switchToPro',
			title: localize2('orchestraUi.titleBar.toPro', "上級者モード (IDE 表示) に切り替える"),
			icon: Codicon.tools,
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 9, when: isAgentMode },
		});
	}
	run(accessor: ServicesAccessor) {
		return setUiMode(accessor, 'pro');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'orchestra.ui.titleBar.switchToAgent',
			title: localize2('orchestraUi.titleBar.toAgent', "エージェントモードに戻す"),
			icon: Codicon.robot,
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 9, when: isProMode },
		});
	}
	run(accessor: ServicesAccessor) {
		return setUiMode(accessor, 'agent');
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
