/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra の表示モード。
//
// 「かんたんモード (simple)」が既定で、VS Code 由来の IDE 的な部品 (アクティビティバー・
// ステータスバー・ミニマップ・パンくず・レイアウトコントロール等) を隠し、
// エディタの空き領域にはコードではなく日本語のホーム画面を出す。チャットが主役になる。
//
// 「上級者モード (pro)」に切り替えると、それらの部品が通常の VS Code と同じ形で戻る。
//
// 仕組みは「設定の既定値の上書き (configuration defaults)」で、ユーザーの settings.json には
// 何も書き込まない。かんたんモードで隠している部品も、ユーザーが settings.json で明示的に
// 値を書いていればそちらが優先される (既定値より常にユーザー設定が強い)。

import { Disposable } from '../../../../base/common/lifecycle.js';
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
import { VOID_OPEN_SIDEBAR_ACTION_ID, VOID_VIEW_CONTAINER_ID } from './sidebarPane.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from '../../files/common/files.js';
import { TERMINAL_VIEW_ID } from '../../terminal/common/terminal.js';
import {
	ORCHESTRA_UI_MODE_SETTING,
	ORCHESTRA_UI_MODE_CONTEXT_KEY,
	ORCHESTRA_UI_SET_SIMPLE_MODE_ACTION_ID,
	ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_FILES_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_TERMINAL_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_CHAT_ACTION_ID,
	ORCHESTRA_CHAT_SEND_PROMPT_ACTION_ID,
	OrchestraUiMode,
} from './orchestraUiModeTypes.js';
import { IChatThreadService } from './chatThreadServiceInterface.js';


// ---------------------------------------------------------------------------------------
// 設定・コンテキストキー
// ---------------------------------------------------------------------------------------

export const OrchestraUiModeContext = new RawContextKey<OrchestraUiMode>(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'simple');

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'orchestraUi',
	order: 1,
	title: localize('orchestraUi.configTitle', "Orchestra 表示モード"),
	type: 'object',
	properties: {
		[ORCHESTRA_UI_MODE_SETTING]: {
			type: 'string',
			enum: ['simple', 'pro'],
			enumDescriptions: [
				localize('orchestraUi.mode.simple', "かんたんモード: チャットとホーム画面が中心。アクティビティバー・ステータスバー・ミニマップなど IDE 的な部品を隠します。"),
				localize('orchestraUi.mode.pro', "上級者モード: VS Code と同じ IDE の表示に戻します。"),
			],
			default: 'simple',
			description: localize('orchestraUi.mode', "Orchestra の見た目。初めての方は「かんたんモード」、慣れている方は「上級者モード」がおすすめです。"),
		},
	},
});


// ---------------------------------------------------------------------------------------
// かんたんモードで上書きする既定値
// ---------------------------------------------------------------------------------------

// これらは「既定値」であって「ユーザー設定」ではない。ユーザーが settings.json に同じキーを
// 書いていればそちらが勝つので、かんたんモードのままミニマップだけ戻す、といったことも可能。
const SIMPLE_MODE_DEFAULTS: IConfigurationDefaults = {
	source: { id: 'orchestra.simpleMode', displayName: 'Orchestra かんたんモード' },
	overrides: {
		// レイアウト: 左端のアイコン列と下端のステータスバーを消す。
		'workbench.activityBar.location': 'hidden',
		'workbench.statusBar.visible': false,
		'workbench.layoutControl.enabled': false,
		'window.commandCenter': false,
		'workbench.tips.enabled': false,
		'workbench.startupEditor': 'none',
		// 「ここが何なのか分からない」要素を減らす。
		'breadcrumbs.enabled': false,
		'editor.minimap.enabled': false,
		'editor.glyphMargin': false,
		'editor.scrollBeyondLastLine': false,
		'editor.stickyScroll.enabled': false,
		'editor.wordWrap': 'on',
		'editor.fontSize': 15,
		'editor.lineHeight': 1.6,
		'editor.padding.top': 12,
		// エクスプローラーはフォルダをまとめて折りたたまない (a/b/c のような表示は初心者に分かりにくい)。
		'explorer.compactFolders': false,
		'explorer.confirmDelete': true,
		'explorer.confirmDragAndDrop': true,
	},
};

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

// かんたんモードが既定なので、モジュール読み込み時点 (= 設定サービスの初期化より前) で
// 既定値を登録しておく。上級者モードのユーザーは起動時の contribution で外す。
let simpleDefaultsRegistered = false;
function applySimpleModeDefaults(enable: boolean): void {
	if (enable === simpleDefaultsRegistered) {
		return;
	}
	simpleDefaultsRegistered = enable;
	if (enable) {
		configurationRegistry.registerDefaultConfigurations([SIMPLE_MODE_DEFAULTS]);
	} else {
		configurationRegistry.deregisterDefaultConfigurations([SIMPLE_MODE_DEFAULTS]);
	}
}
applySimpleModeDefaults(true);


export function getOrchestraUiMode(configurationService: IConfigurationService): OrchestraUiMode {
	return configurationService.getValue<string>(ORCHESTRA_UI_MODE_SETTING) === 'pro' ? 'pro' : 'simple';
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
		applySimpleModeDefaults(mode === 'simple');
	}
}
registerWorkbenchContribution2(OrchestraUiModeContribution.ID, OrchestraUiModeContribution, WorkbenchPhase.BlockStartup);


// 初回起動時 (かんたんモード) のレイアウト整形。
// 「ファイル一覧」と「ターミナル」は最初は閉じておき、チャットはウィンドウ幅の 4 割ほどに広げる。
// 一度やったら記録して二度と触らない (以降はユーザーがドラッグした幅を VS Code が覚える)。
class OrchestraSimpleLayoutFirstRun extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestraSimpleLayoutFirstRun';
	private static readonly STORAGE_KEY = 'orchestra.ui.simpleLayoutInitialized';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IViewsService viewsService: IViewsService,
	) {
		super();

		if (getOrchestraUiMode(configurationService) !== 'simple') {
			return;
		}
		if (storageService.getBoolean(OrchestraSimpleLayoutFirstRun.STORAGE_KEY, StorageScope.APPLICATION, false)) {
			return;
		}
		storageService.store(OrchestraSimpleLayoutFirstRun.STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);

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
registerWorkbenchContribution2(OrchestraSimpleLayoutFirstRun.ID, OrchestraSimpleLayoutFirstRun, WorkbenchPhase.AfterRestored);


// ---------------------------------------------------------------------------------------
// コマンド
// ---------------------------------------------------------------------------------------

const isSimpleMode = ContextKeyExpr.equals(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'simple');
const isProMode = ContextKeyExpr.equals(ORCHESTRA_UI_MODE_CONTEXT_KEY, 'pro');

async function setUiMode(accessor: ServicesAccessor, mode: OrchestraUiMode): Promise<void> {
	const configurationService = accessor.get(IConfigurationService);
	const notificationService = accessor.get(INotificationService);
	if (getOrchestraUiMode(configurationService) === mode) {
		return;
	}
	// 既定値が simple なので、simple に戻すときは undefined を書いてユーザー設定から消す。
	await configurationService.updateValue(ORCHESTRA_UI_MODE_SETTING, mode === 'simple' ? undefined : mode, ConfigurationTarget.USER);
	notificationService.info(mode === 'simple'
		? localize('orchestraUi.switchedToSimple', "かんたんモードに切り替えました。チャットに話しかけるだけで作業を始められます。")
		: localize('orchestraUi.switchedToPro', "上級者モードに切り替えました。IDE の全ての部品が表示されます。「Orchestra: かんたんモードに戻す」でいつでも戻せます。"));
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID,
			title: localize2('orchestraUi.setPro', "Orchestra: 上級者モード (IDE 表示) に切り替える"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.tools,
			precondition: isSimpleMode,
		});
	}
	run(accessor: ServicesAccessor) {
		return setUiMode(accessor, 'pro');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_SET_SIMPLE_MODE_ACTION_ID,
			title: localize2('orchestraUi.setSimple', "Orchestra: かんたんモードに戻す"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.sparkle,
			precondition: isProMode,
		});
	}
	run(accessor: ServicesAccessor) {
		return setUiMode(accessor, 'simple');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID,
			title: localize2('orchestraUi.toggle', "Orchestra: 表示モードを切り替える (かんたん / 上級者)"),
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
		return setUiMode(accessor, mode === 'simple' ? 'pro' : 'simple');
	}
});


// かんたんモードではアクティビティバーが無いので、「ファイル一覧」「ターミナル」「チャット」の
// 開閉ボタンをタイトルバー右側に、言葉付きのツールチップで置く。上級者モードでは出さない。

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_UI_TOGGLE_FILES_ACTION_ID,
			title: localize2('orchestraUi.toggleFiles', "ファイル一覧を表示 / 隠す"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.files,
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 1, when: isSimpleMode },
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
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 2, when: isSimpleMode },
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
			title: localize2('orchestraUi.toggleChat', "AI チャットを表示 / 隠す"),
			category: localize2('orchestraUi.category', "Orchestra"),
			f1: true,
			icon: Codicon.commentDiscussion,
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 3, when: isSimpleMode },
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

// タイトルバーの一番右: 上級者モードへ / かんたんモードへ。
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'orchestra.ui.titleBar.switchToPro',
			title: localize2('orchestraUi.titleBar.toPro', "上級者モード (IDE 表示) に切り替える"),
			icon: Codicon.tools,
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 9, when: isSimpleMode },
		});
	}
	run(accessor: ServicesAccessor) {
		return setUiMode(accessor, 'pro');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'orchestra.ui.titleBar.switchToSimple',
			title: localize2('orchestraUi.titleBar.toSimple', "かんたんモードに戻す"),
			icon: Codicon.sparkle,
			menu: { id: MenuId.TitleBar, group: 'navigation', order: 9, when: isProMode },
		});
	}
	run(accessor: ServicesAccessor) {
		return setUiMode(accessor, 'simple');
	}
});


// ---------------------------------------------------------------------------------------
// ホーム画面などから、文字列を 1 つ渡してそのままチャットに送る
// ---------------------------------------------------------------------------------------

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_CHAT_SEND_PROMPT_ACTION_ID,
			title: localize2('orchestraUi.sendPrompt', "Orchestra: チャットにメッセージを送る"),
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
