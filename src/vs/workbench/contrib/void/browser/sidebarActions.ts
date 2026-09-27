/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';


import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';

import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { VOID_VIEW_CONTAINER_ID, VOID_VIEW_ID } from './sidebarPane.js';
import { IMetricsService } from '../common/metricsService.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { VOID_OPEN_SETTINGS_ACTION_ID, VOID_TOGGLE_SETTINGS_ACTION_ID } from './voidSettingsPane.js';
import { ORCHESTRA_CHAT_SHOW_LOGIN_COMMAND_ID, VOID_CTRL_L_ACTION_ID, VOID_TOGGLE_KANBAN_ACTION_ID } from './actionIDs.js';
import { localize2 } from '../../../../nls.js';
import { IChatThreadService } from './chatThreadServiceInterface.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID } from './orchestraUiModeTypes.js';

// ---------- Register commands and keybindings ----------


export const roundRangeToLines = (range: IRange | null | undefined, options: { emptySelectionBehavior: 'null' | 'line' }) => {
	if (!range)
		return null

	// treat as no selection if selection is empty
	if (range.endColumn === range.startColumn && range.endLineNumber === range.startLineNumber) {
		if (options.emptySelectionBehavior === 'null')
			return null
		else if (options.emptySelectionBehavior === 'line')
			return { startLineNumber: range.startLineNumber, startColumn: 1, endLineNumber: range.startLineNumber, endColumn: 1 }
	}

	// IRange is 1-indexed
	const endLine = range.endColumn === 1 ? range.endLineNumber - 1 : range.endLineNumber // e.g. if the user triple clicks, it selects column=0, line=line -> column=0, line=line+1
	const newRange: IRange = {
		startLineNumber: range.startLineNumber,
		startColumn: 1,
		endLineNumber: endLine,
		endColumn: Number.MAX_SAFE_INTEGER
	}
	return newRange
}

// const getContentInRange = (model: ITextModel, range: IRange | null) => {
// 	if (!range)
// 		return null
// 	const content = model.getValueInRange(range)
// 	const trimmedContent = content
// 		.replace(/^\s*\n/g, '') // trim pure whitespace lines from start
// 		.replace(/\n\s*$/g, '') // trim pure whitespace lines from end
// 	return trimmedContent
// }



const VOID_OPEN_SIDEBAR_ACTION_ID = 'void.sidebar.open'
registerAction2(class extends Action2 {
	constructor() {
		super({ id: VOID_OPEN_SIDEBAR_ACTION_ID, title: localize2('voidOpenSidebar', 'Void: Open Sidebar'), f1: true });
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService)
		const chatThreadsService = accessor.get(IChatThreadService)
		viewsService.openViewContainer(VOID_VIEW_CONTAINER_ID)
		await chatThreadsService.focusCurrentChat()
	}
})


// cmd L
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_CTRL_L_ACTION_ID,
			f1: true,
			title: localize2('voidCmdL', 'Void: Add Selection to Chat'),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyL,
				weight: KeybindingWeight.VoidExtension
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		// Get services
		const commandService = accessor.get(ICommandService)
		const viewsService = accessor.get(IViewsService)
		const metricsService = accessor.get(IMetricsService)
		const editorService = accessor.get(ICodeEditorService)
		const chatThreadService = accessor.get(IChatThreadService)

		metricsService.capture('Ctrl+L', {})

		// capture selection and model before opening the chat panel
		const editor = editorService.getActiveCodeEditor()
		const model = editor?.getModel()
		if (!model) return

		const selectionRange = roundRangeToLines(editor?.getSelection(), { emptySelectionBehavior: 'null' })

		// open panel
		const wasAlreadyOpen = viewsService.isViewContainerVisible(VOID_VIEW_CONTAINER_ID)
		if (!wasAlreadyOpen) {
			await commandService.executeCommand(VOID_OPEN_SIDEBAR_ACTION_ID)
		}

		// Add selection to chat
		// add line selection
		if (selectionRange) {
			editor?.setSelection({
				startLineNumber: selectionRange.startLineNumber,
				endLineNumber: selectionRange.endLineNumber,
				startColumn: 1,
				endColumn: Number.MAX_SAFE_INTEGER
			})
			chatThreadService.addNewStagingSelection({
				type: 'CodeSelection',
				uri: model.uri,
				language: model.getLanguageId(),
				range: [selectionRange.startLineNumber, selectionRange.endLineNumber],
				state: { wasAddedAsCurrentFile: false },
			})
		}
		// add file
		else {
			chatThreadService.addNewStagingSelection({
				type: 'File',
				uri: model.uri,
				language: model.getLanguageId(),
				state: { wasAddedAsCurrentFile: false },
			})
		}

		await chatThreadService.focusCurrentChat()
	}
})


// New chat keybind + menu button
const VOID_CMD_SHIFT_L_ACTION_ID = 'void.cmdShiftL'
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_CMD_SHIFT_L_ACTION_ID,
			title: 'New Chat',
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
				weight: KeybindingWeight.VoidExtension,
			},
			icon: { id: 'add' },
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {

		const metricsService = accessor.get(IMetricsService)
		const chatThreadsService = accessor.get(IChatThreadService)
		const editorService = accessor.get(ICodeEditorService)
		metricsService.capture('Chat Navigation', { type: 'Start New Chat' })

		// get current selections and value to transfer
		const oldThreadId = chatThreadsService.state.currentThreadId
		const oldThread = chatThreadsService.state.allThreads[oldThreadId]

		const oldUI = await oldThread?.state.mountedInfo?.whenMounted

		const oldSelns = oldThread?.state.stagingSelections
		const oldVal = oldUI?.textAreaRef?.current?.value

		// open and focus new thread
		chatThreadsService.openNewThread()
		await chatThreadsService.focusCurrentChat()


		// set new thread values
		const newThreadId = chatThreadsService.state.currentThreadId
		const newThread = chatThreadsService.state.allThreads[newThreadId]

		const newUI = await newThread?.state.mountedInfo?.whenMounted
		chatThreadsService.setCurrentThreadState({ stagingSelections: oldSelns, })
		if (newUI?.textAreaRef?.current && oldVal) newUI.textAreaRef.current.value = oldVal


		// if has selection, add it
		const editor = editorService.getActiveCodeEditor()
		const model = editor?.getModel()
		if (!model) return
		const selectionRange = roundRangeToLines(editor?.getSelection(), { emptySelectionBehavior: 'null' })
		if (!selectionRange) return
		editor?.setSelection({ startLineNumber: selectionRange.startLineNumber, endLineNumber: selectionRange.endLineNumber, startColumn: 1, endColumn: Number.MAX_SAFE_INTEGER })
		chatThreadsService.addNewStagingSelection({
			type: 'CodeSelection',
			uri: model.uri,
			language: model.getLanguageId(),
			range: [selectionRange.startLineNumber, selectionRange.endLineNumber],
			state: { wasAddedAsCurrentFile: false },
		})
	}
})

// History menu button
const VOID_HISTORY_ACTION_ID = 'void.historyAction'
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_HISTORY_ACTION_ID,
			title: 'View Past Chats',
			icon: { id: 'history' },
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {

		// do not do anything if there are no messages (without this it clears all of the user's selections if the button is pressed)
		// TODO the history button should be disabled in this case so we can remove this logic
		const thread = accessor.get(IChatThreadService).getCurrentThread()
		if (thread.messages.length === 0) {
			return;
		}

		const metricsService = accessor.get(IMetricsService)

		const commandService = accessor.get(ICommandService)

		metricsService.capture('Chat Navigation', { type: 'History' })
		commandService.executeCommand(VOID_CMD_SHIFT_L_ACTION_ID)

	}
})


// Settings gear
const VOID_SETTINGS_ACTION_ID = 'void.settingsAction'
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_SETTINGS_ACTION_ID,
			title: `Void's Settings`,
			icon: { id: 'settings-gear' },
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService)
		commandService.executeCommand(VOID_TOGGLE_SETTINGS_ACTION_ID)
	}
})



// ---------- Chat title bar ----------
// チャット上部のボタンは、すべてこのタイトルバー 1 段に並べる。以前は React 側にもう 1 段ヘッダーがあり、歯車が 2 つ並んでいた。
// ツールチップとメニューは Orchestra の表示言語 (uiLanguage) に合わせる。メニューのタイトルは静的なので、日英を両方登録して context key で出し分ける。

const OrchestraLoggedInContext = new RawContextKey<boolean>('orchestraLoggedIn', false)
const OrchestraUiLanguageContext = new RawContextKey<string>('orchestraUiLanguage', 'ja')

class OrchestraChatTitleContextContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestraChatTitleContext'

	constructor(
		@IVoidSettingsService voidSettingsService: IVoidSettingsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super()
		const loggedIn = OrchestraLoggedInContext.bindTo(contextKeyService)
		const language = OrchestraUiLanguageContext.bindTo(contextKeyService)
		const sync = () => {
			const { isLoggedIn, uiLanguage } = voidSettingsService.state.globalSettings
			loggedIn.set(!!isLoggedIn)
			language.set(uiLanguage ?? 'ja')
		}
		sync()
		this._register(voidSettingsService.onDidChangeState(sync))
	}
}
registerWorkbenchContribution2(OrchestraChatTitleContextContribution.ID, OrchestraChatTitleContextContribution, WorkbenchPhase.AfterRestored)

type ChatTitleText = { ja: string; en: string }
const CHAT_TITLE_TEXT = {
	newChat: { ja: '新しいチャット', en: 'New Chat' },
	history: { ja: '過去のチャット', en: 'Past Chats' },
	kanban: { ja: 'タスクボード', en: 'Task Board' },
	logIn: { ja: 'ログイン', en: 'Log In' },
	account: { ja: 'アカウント', en: 'Account' },
	settings: { ja: '設定', en: 'Settings' },
	uiMode: { ja: '表示モードを切り替える (エージェント / 上級者)', en: 'Switch Display Mode (Agent / Pro)' },
	themeLight: { ja: 'テーマ: ライト', en: 'Theme: Light' },
	themeDark: { ja: 'テーマ: ダーク', en: 'Theme: Dark' },
	themeSunRed: { ja: 'テーマ: サンレッド', en: 'Theme: Sun Red' },
	signedInAs: { ja: '{email} でログイン中', en: 'Signed in as {email}' },
	signOutItem: { ja: 'サインアウト…', en: 'Sign Out…' },
	signOutConfirm: { ja: 'Orchestra からサインアウトしますか？', en: 'Sign out of Orchestra?' },
	signOutConfirmDetail: { ja: 'チャットを使うには、もう一度ログインが必要です。', en: 'You will need to log in again to use the chat.' },
	signOut: { ja: 'サインアウト', en: 'Sign Out' },
	cancel: { ja: 'キャンセル', en: 'Cancel' },
} satisfies Record<string, ChatTitleText>

const chatTitleLanguage = (voidSettingsService: IVoidSettingsService): keyof ChatTitleText =>
	voidSettingsService.state.globalSettings.uiLanguage === 'en' ? 'en' : 'ja'

const inChatView = ContextKeyExpr.equals('view', VOID_VIEW_ID)
const appendChatTitleItem = (id: string, text: ChatTitleText, options: { group: string; order: number; icon?: ThemeIcon; when?: ContextKeyExpression; toggled?: ContextKeyExpression }) => {
	for (const [language, languageWhen] of [['ja', OrchestraUiLanguageContext.notEqualsTo('en')], ['en', OrchestraUiLanguageContext.isEqualTo('en')]] as const) {
		MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
			command: { id, title: text[language], icon: options.icon, toggled: options.toggled },
			group: options.group,
			order: options.order,
			when: ContextKeyExpr.and(inChatView, languageWhen, options.when),
		})
	}
}

const ORCHESTRA_CHAT_LOG_IN_ACTION_ID = 'orchestra.chat.logIn'
registerAction2(class extends Action2 {
	constructor() {
		super({ id: ORCHESTRA_CHAT_LOG_IN_ACTION_ID, title: localize2('orchestraChatLogIn', 'Orchestra: ログイン') })
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService)
		const commandService = accessor.get(ICommandService)
		await viewsService.openViewContainer(VOID_VIEW_CONTAINER_ID)
		// ログイン画面はサイドバーの中に出す。サイドバーがまだ描画されていなければ、ログインボタンのある設定画面を開く。
		if (CommandsRegistry.getCommand(ORCHESTRA_CHAT_SHOW_LOGIN_COMMAND_ID)) {
			await commandService.executeCommand(ORCHESTRA_CHAT_SHOW_LOGIN_COMMAND_ID)
		} else {
			await commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID)
		}
	}
})

const ORCHESTRA_CHAT_ACCOUNT_ACTION_ID = 'orchestra.chat.account'
registerAction2(class extends Action2 {
	constructor() {
		super({ id: ORCHESTRA_CHAT_ACCOUNT_ACTION_ID, title: localize2('orchestraChatAccount', 'Orchestra: アカウント') })
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voidSettingsService = accessor.get(IVoidSettingsService)
		const quickInputService = accessor.get(IQuickInputService)
		const dialogService = accessor.get(IDialogService)
		const language = chatTitleLanguage(voidSettingsService)
		const text = (key: keyof typeof CHAT_TITLE_TEXT) => CHAT_TITLE_TEXT[key][language]

		const email = voidSettingsService.state.globalSettings.divisionUserEmail || 'Orchestra'
		const picked = await quickInputService.pick(
			[{ id: 'signOut', label: `$(sign-out) ${text('signOutItem')}` }],
			{ placeHolder: text('signedInAs').replace('{email}', email) },
		)
		if (picked?.id !== 'signOut') return

		// 押し間違いで作業中にログアウトしないよう、必ず確認してから消す
		const { confirmed } = await dialogService.confirm({
			message: text('signOutConfirm'),
			detail: text('signOutConfirmDetail'),
			primaryButton: text('signOut'),
			cancelButton: text('cancel'),
		})
		if (!confirmed) return
		voidSettingsService.setGlobalSetting('isLoggedIn', false)
		voidSettingsService.setGlobalSetting('divisionUserId', '')
		voidSettingsService.setGlobalSetting('divisionUserEmail', '')
		voidSettingsService.setGlobalSetting('divisionAccessToken', '')
		voidSettingsService.setGlobalSetting('divisionRefreshToken', '')
		voidSettingsService.setGlobalSetting('divisionApiKey', '')
	}
})

const ORCHESTRA_THEMES = [
	{ id: 'orchestra.theme.light', themeName: 'Orchestra Light', text: CHAT_TITLE_TEXT.themeLight },
	{ id: 'orchestra.theme.dark', themeName: 'Orchestra Dark', text: CHAT_TITLE_TEXT.themeDark },
	{ id: 'orchestra.theme.sunRed', themeName: 'Sun Red', text: CHAT_TITLE_TEXT.themeSunRed },
]
for (const { id, themeName } of ORCHESTRA_THEMES) {
	registerAction2(class extends Action2 {
		constructor() {
			super({ id, title: localize2('orchestraSetTheme', 'Orchestra: テーマを {0} にする', themeName) })
		}
		async run(accessor: ServicesAccessor): Promise<void> {
			await accessor.get(IConfigurationService).updateValue('workbench.colorTheme', themeName)
		}
	})
}

// よく使うものはアイコンで並べ、たまにしか使わないもの (表示モード・テーマ) は「…」メニューに入れる
appendChatTitleItem(VOID_CMD_SHIFT_L_ACTION_ID, CHAT_TITLE_TEXT.newChat, { group: 'navigation', order: 1, icon: Codicon.add })
appendChatTitleItem(VOID_HISTORY_ACTION_ID, CHAT_TITLE_TEXT.history, { group: 'navigation', order: 2, icon: Codicon.history })
appendChatTitleItem(VOID_TOGGLE_KANBAN_ACTION_ID, CHAT_TITLE_TEXT.kanban, { group: 'navigation', order: 3, icon: Codicon.checklist })
appendChatTitleItem(ORCHESTRA_CHAT_LOG_IN_ACTION_ID, CHAT_TITLE_TEXT.logIn, { group: 'navigation', order: 4, icon: Codicon.signIn, when: OrchestraLoggedInContext.negate() })
appendChatTitleItem(ORCHESTRA_CHAT_ACCOUNT_ACTION_ID, CHAT_TITLE_TEXT.account, { group: 'navigation', order: 4, icon: Codicon.account, when: OrchestraLoggedInContext })
appendChatTitleItem(VOID_SETTINGS_ACTION_ID, CHAT_TITLE_TEXT.settings, { group: 'navigation', order: 5, icon: Codicon.settingsGear })
appendChatTitleItem(ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID, CHAT_TITLE_TEXT.uiMode, { group: '1_view', order: 1 })
ORCHESTRA_THEMES.forEach(({ id, themeName, text }, i) => {
	appendChatTitleItem(id, text, { group: '2_theme', order: i + 1, toggled: ContextKeyExpr.equals('config.workbench.colorTheme', themeName) })
})



// export class TabSwitchListener extends Disposable {

// 	constructor(
// 		onSwitchTab: () => void,
// 		@ICodeEditorService private readonly _editorService: ICodeEditorService,
// 	) {
// 		super()

// 		// when editor switches tabs (models)
// 		const addTabSwitchListeners = (editor: ICodeEditor) => {
// 			this._register(editor.onDidChangeModel(e => {
// 				if (e.newModelUrl?.scheme !== 'file') return
// 				onSwitchTab()
// 			}))
// 		}

// 		const initializeEditor = (editor: ICodeEditor) => {
// 			addTabSwitchListeners(editor)
// 		}

// 		// initialize current editors + any new editors
// 		for (let editor of this._editorService.listCodeEditors()) initializeEditor(editor)
// 		this._register(this._editorService.onCodeEditorAdd(editor => { initializeEditor(editor) }))
// 	}
// }
