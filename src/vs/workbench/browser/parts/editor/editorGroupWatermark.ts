/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isNative, OS } from '../../../../base/common/platform.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { append, clearNode, $, h } from '../../../../base/browser/dom.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { defaultKeybindingLabelStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { editorForeground, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IRecent, isRecentFolder, IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ILabelService, Verbosity } from '../../../../platform/label/common/label.js';

import { OpenFileFolderAction, OpenFolderAction } from '../../actions/workspaceActions.js';
import { IWindowOpenable } from '../../../../platform/window/common/window.js';
import { splitRecentLabel } from '../../../../base/common/labels.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';

/* eslint-disable */ // Void
import { VOID_CTRL_K_ACTION_ID, VOID_CTRL_L_ACTION_ID } from '../../../contrib/void/browser/actionIDs.js';
import {
	ORCHESTRA_CHAT_SEND_PROMPT_ACTION_ID,
	ORCHESTRA_UI_MODE_SETTING,
	ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_FILES_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_TERMINAL_ACTION_ID,
} from '../../../contrib/void/browser/orchestraUiModeTypes.js';
import { VIEWLET_ID as REMOTE_EXPLORER_VIEWLET_ID } from '../../../contrib/remote/browser/remoteExplorer.js';
/* eslint-enable */

// interface WatermarkEntry {
// 	readonly id: string;
// 	readonly text: string;
// 	readonly when?: {
// 		native?: ContextKeyExpression;
// 		web?: ContextKeyExpression;
// 	};
// }

// const showCommands: WatermarkEntry = { text: localize('watermark.showCommands', "Show All Commands"), id: 'workbench.action.showCommands' };
// const gotoFile: WatermarkEntry = { text: localize('watermark.quickAccess', "Go to File"), id: 'workbench.action.quickOpen' };
// const openFile: WatermarkEntry = { text: localize('watermark.openFile', "Open File"), id: 'workbench.action.files.openFile' };
// const openFolder: WatermarkEntry = { text: localize('watermark.openFolder', "Open Folder"), id: 'workbench.action.files.openFolder' };
// const openFileOrFolder: WatermarkEntry = { text: localize('watermark.openFileFolder', "Open File or Folder"), id: 'workbench.action.files.openFileFolder' };
// const openRecent: WatermarkEntry = { text: localize('watermark.openRecent', "Open Recent"), id: 'workbench.action.openRecent' };
// const newUntitledFile: WatermarkEntry = { text: localize('watermark.newUntitledFile', "New Untitled Text File"), id: 'workbench.action.files.newUntitledFile' };
// const findInFiles: WatermarkEntry = { text: localize('watermark.findInFiles', "Find in Files"), id: 'workbench.action.findInFiles' };
// const toggleTerminal: WatermarkEntry = { text: localize({ key: 'watermark.toggleTerminal', comment: ['toggle is a verb here'] }, "Toggle Terminal"), id: 'workbench.action.terminal.toggleTerminal', when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) } };
// const startDebugging: WatermarkEntry = { text: localize('watermark.startDebugging', "Start Debugging"), id: 'workbench.action.debug.start', when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) } };
// const openSettings: WatermarkEntry = { text: localize('watermark.openSettings', "Open Settings"), id: 'workbench.action.openSettings' };

// const showCopilot = ContextKeyExpr.or(ContextKeyExpr.equals('chatSetupHidden', false), ContextKeyExpr.equals('chatSetupInstalled', true));
// const openChat: WatermarkEntry = { text: localize('watermark.openChat', "Open Chat"), id: 'workbench.action.chat.open', when: { native: showCopilot, web: showCopilot } };
// const openCopilotEdits: WatermarkEntry = { text: localize('watermark.openCopilotEdits', "Open Copilot Edits"), id: 'workbench.action.chat.openEditSession', when: { native: showCopilot, web: showCopilot } };

// const emptyWindowEntries: WatermarkEntry[] = coalesce([
// 	showCommands,
// 	...(isMacintosh && !isWeb ? [openFileOrFolder] : [openFile, openFolder]),
// 	openRecent,
// 	isMacintosh && !isWeb ? newUntitledFile : undefined, // fill in one more on macOS to get to 5 entries
// 	openChat
// ]);

// const randomEmptyWindowEntries: WatermarkEntry[] = [
// 	/* Nothing yet */
// ];

// const workspaceEntries: WatermarkEntry[] = [
// 	showCommands,
// 	gotoFile,
// 	openChat
// ];

// const randomWorkspaceEntries: WatermarkEntry[] = [
// 	findInFiles,
// 	startDebugging,
// 	toggleTerminal,
// 	openSettings,
// 	openCopilotEdits
// ];


export class EditorGroupWatermark extends Disposable {
	private readonly rootElement: HTMLElement;
	private readonly iconElement: HTMLElement;
	private readonly shortcuts: HTMLElement;
	private readonly transientDisposables = this._register(new DisposableStore());
	// private enabled: boolean = false;
	private workbenchState: WorkbenchState;
	private currentDisposables = new Set<IDisposable>();

	constructor(
		container: HTMLElement,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		// @IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@ICommandService private readonly commandService: ICommandService,
		@IHostService private readonly hostService: IHostService,
		@ILabelService private readonly labelService: ILabelService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super();

		const elements = h('.editor-group-watermark', [
			h('.letterpress@icon'),
			h('.shortcuts@shortcuts'),
		]);

		append(container, elements.root);
		this.rootElement = elements.root;
		this.iconElement = elements.icon;
		this.shortcuts = elements.shortcuts; // shortcuts div is modified on render()

		// void icon style
		const updateTheme = () => {
			elements.icon.style.maxWidth = this.isSimpleMode() ? '96px' : '220px'
			elements.icon.style.opacity = this.isSimpleMode() ? '90%' : '70%' // Slightly higher opacity for the new logo
			// elements.icon.style.filter = isDark ? '' : 'invert(1)' //brightness(.5)
		}
		updateTheme()
		this._register(
			this.themeService.onDidColorThemeChange(updateTheme)
		)

		this.registerListeners();

		this.workbenchState = contextService.getWorkbenchState();
		this.render();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.tips.enabled') || e.affectsConfiguration(ORCHESTRA_UI_MODE_SETTING)) {
				this.render();
			}
		}));

		this._register(this.contextService.onDidChangeWorkbenchState(workbenchState => {
			if (this.workbenchState === workbenchState) {
				return;
			}

			this.workbenchState = workbenchState;
			this.render();
		}));

		// const allEntriesWhenClauses = [...noFolderEntries, ...folderEntries].filter(entry => entry.when !== undefined).map(entry => entry.when!);
		// const allKeys = new Set<string>();
		// allEntriesWhenClauses.forEach(when => when.keys().forEach(key => allKeys.add(key)));
		// this._register(this.contextKeyService.onDidChangeContext(e => {
		// 	if (e.affectsSome(allKeys)) {
		// 		this.render();
		// 	}
		// }));
	}



	// Orchestra: かんたんモードかどうか。かんたんモードでは Void 由来のショートカット表ではなく、
	// 日本語のホーム画面 (renderSimpleHome) を出す。
	private isSimpleMode(): boolean {
		return this.configurationService.getValue<string>(ORCHESTRA_UI_MODE_SETTING) !== 'pro';
	}

	private render(): void {

		this.clear();

		const simple = this.isSimpleMode();
		this.rootElement.classList.toggle('orchestra-home', simple);
		this.iconElement.style.maxWidth = simple ? '96px' : '220px';
		this.iconElement.style.opacity = simple ? '90%' : '70%';

		const voidIconBox = append(this.shortcuts, $('.watermark-box'));
		const recentsBox = append(this.shortcuts, $('div'));
		recentsBox.style.display = 'flex'
		recentsBox.style.flex = 'row'
		recentsBox.style.justifyContent = 'center'


		const update = async () => {

			// put async at top so don't need to wait (this prevents a jitter on load)
			const recentlyOpened = await this.workspacesService.getRecentlyOpened()
				.catch(() => ({ files: [], workspaces: [] })).then(w => w.workspaces);

			clearNode(voidIconBox);
			clearNode(recentsBox);

			this.currentDisposables.forEach(label => label.dispose());
			this.currentDisposables.clear();

			// Orchestra: かんたんモードのホーム画面
			if (this.isSimpleMode()) {
				this.renderSimpleHome(voidIconBox, recentlyOpened);
				return;
			}

			// Void - if the workbench is empty, show open
			if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {

				// Create a flex container for buttons with vertical direction
				const buttonContainer = $('div');
				buttonContainer.style.display = 'flex';
				buttonContainer.style.flexDirection = 'column'; // Change to column for vertical stacking
				buttonContainer.style.alignItems = 'center'; // Center the buttons horizontally
				buttonContainer.style.gap = '8px'; // Reduce gap between buttons from 16px to 8px
				buttonContainer.style.marginBottom = '16px';
				voidIconBox.appendChild(buttonContainer);

				// Open a folder
				const openFolderButton = h('button')
				openFolderButton.root.classList.add('void-openfolder-button')
				openFolderButton.root.style.display = 'block'
				openFolderButton.root.style.width = '124px' // Set width to 124px as requested
				openFolderButton.root.textContent = 'Open Folder'
				openFolderButton.root.onclick = () => {
					this.commandService.executeCommand(isMacintosh && isNative ? OpenFileFolderAction.ID : OpenFolderAction.ID)
					// if (this.contextKeyService.contextMatchesRules(ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('workspace')))) {
					// 	this.commandService.executeCommand(OpenFolderViaWorkspaceAction.ID);
					// } else {
					// 	this.commandService.executeCommand(isMacintosh ? 'workbench.action.files.openFileFolder' : 'workbench.action.files.openFolder');
					// }
				}
				buttonContainer.appendChild(openFolderButton.root);

				// Open SSH button
				const openSSHButton = h('button')
				openSSHButton.root.classList.add('void-openssh-button')
				openSSHButton.root.style.display = 'block'
				openSSHButton.root.style.backgroundColor = '#5a5a5a' // Made darker than the default gray
				openSSHButton.root.style.width = '124px' // Set width to 124px as requested
				openSSHButton.root.textContent = 'Open SSH'
				openSSHButton.root.onclick = () => {
					this.viewsService.openViewContainer(REMOTE_EXPLORER_VIEWLET_ID);
				}
				buttonContainer.appendChild(openSSHButton.root);


				// Recents
				if (recentlyOpened.length !== 0) {

					voidIconBox.append(
						...recentlyOpened.map((w, i) => {

							let fullPath: string;
							let windowOpenable: IWindowOpenable;
							if (isRecentFolder(w)) {
								windowOpenable = { folderUri: w.folderUri };
								fullPath = w.label || this.labelService.getWorkspaceLabel(w.folderUri, { verbose: Verbosity.LONG });
							}
							else {
								return null
								// fullPath = w.label || this.labelService.getWorkspaceLabel(w.workspace, { verbose: Verbosity.LONG });
								// windowOpenable = { workspaceUri: w.workspace.configPath };
							}


							const { name, parentPath } = splitRecentLabel(fullPath);

							const linkSpan = $('span');
							linkSpan.classList.add('void-link')
							linkSpan.style.display = 'flex'
							linkSpan.style.gap = '4px'
							linkSpan.style.padding = '8px'

							linkSpan.addEventListener('click', e => {
								this.hostService.openWindow([windowOpenable], {
									forceNewWindow: e.ctrlKey || e.metaKey,
									remoteAuthority: w.remoteAuthority || null // local window if remoteAuthority is not set or can not be deducted from the openable
								});
								e.preventDefault();
								e.stopPropagation();
							});

							const nameSpan = $('span');
							nameSpan.innerText = name;
							nameSpan.title = fullPath;
							linkSpan.appendChild(nameSpan);

							const dirSpan = $('span');
							dirSpan.style.paddingLeft = '4px';
							dirSpan.style.whiteSpace = 'nowrap';
							dirSpan.style.overflow = 'hidden';
							dirSpan.style.maxWidth = '300px';
							dirSpan.innerText = parentPath;
							dirSpan.title = fullPath;

							linkSpan.appendChild(dirSpan);

							return linkSpan
						})
							.filter(v => !!v)
							.slice(0, 5) // take 5 most recent
					)
				}

			}
			else {

				// show them Void keybindings
				const keys = this.keybindingService.lookupKeybinding(VOID_CTRL_L_ACTION_ID);
				const dl = append(voidIconBox, $('dl'));
				const dt = append(dl, $('dt'));
				dt.textContent = 'Chat'
				const dd = append(dl, $('dd'));
				const label = new KeybindingLabel(dd, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles });
				if (keys)
					label.set(keys);
				this.currentDisposables.add(label);


				const keys2 = this.keybindingService.lookupKeybinding(VOID_CTRL_K_ACTION_ID);
				const dl2 = append(voidIconBox, $('dl'));
				const dt2 = append(dl2, $('dt'));
				dt2.textContent = 'Quick Edit'
				const dd2 = append(dl2, $('dd'));
				const label2 = new KeybindingLabel(dd2, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles });
				if (keys2)
					label2.set(keys2);
				this.currentDisposables.add(label2);

				// const keys3 = this.keybindingService.lookupKeybinding('workbench.action.openGlobalKeybindings');
				// const button3 = append(recentsBox, $('button'));
				// button3.textContent = `Void Settings`
				// button3.style.display = 'block'
				// button3.style.marginLeft = 'auto'
				// button3.style.marginRight = 'auto'
				// button3.classList.add('void-settings-watermark-button')

				// const label3 = new KeybindingLabel(button3, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles });
				// if (keys3)
				// 	label3.set(keys3);
				// button3.onclick = () => {
				// 	this.commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID)
				// }
				// this.currentDisposables.add(label3);

			}

		};

		update();
		this.transientDisposables.add(this.keybindingService.onDidUpdateKeybindings(update));
	}

	// ---------------------------------------------------------------------------------------
	// Orchestra かんたんモードのホーム画面
	//
	// IDE の「透かし + ショートカット一覧」ではなく、次に何をすればいいかが日本語で分かる画面。
	// フォルダ未選択なら「フォルダを開く」、選択済みなら「チャットに話しかける」へ誘導する。
	// ---------------------------------------------------------------------------------------
	private renderSimpleHome(box: HTMLElement, recentlyOpened: readonly IRecent[]): void {
		const hasFolder = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
		const run = (id: string, ...args: unknown[]) => () => { this.commandService.executeCommand(id, ...args); };

		const home = append(box, $('.orchestra-home__body'));

		// 見出し
		const heading = append(home, $('.orchestra-home__heading'));
		append(heading, $('h1.orchestra-home__title')).textContent = hasFolder
			? '準備ができました'
			: 'ようこそ、Orchestra へ';
		append(heading, $('p.orchestra-home__subtitle')).textContent = hasFolder
			? '右側の AI チャットに、作りたいものや困っていることをそのまま書いてください。コードは AI が書きます。'
			: '作りたいものを日本語で伝えるだけで、AI がコードを書いてくれるアプリです。まずは作業するフォルダを選びましょう。';

		if (!hasFolder) {
			// 3 ステップ
			const steps = append(home, $('ol.orchestra-home__steps'));
			for (const [n, title, desc] of [
				['1', 'フォルダを選ぶ', '作業場所になるフォルダです。空のフォルダでも大丈夫。'],
				['2', 'チャットに話しかける', '「TODO アプリを作って」のように、日本語で。'],
				['3', 'できあがりを確認する', 'AI が作ったものを見て、気になる点をまた伝えるだけ。'],
			]) {
				const li = append(steps, $('li.orchestra-home__step'));
				append(li, $('span.orchestra-home__step-num')).textContent = n;
				const text = append(li, $('div.orchestra-home__step-text'));
				append(text, $('strong')).textContent = title;
				append(text, $('span')).textContent = desc;
			}

			// 主ボタン
			const actions = append(home, $('.orchestra-home__actions'));
			const openFolder = append(actions, $('button.orchestra-home__button.orchestra-home__button--primary'));
			openFolder.textContent = 'フォルダを開く';
			openFolder.onclick = () => {
				this.commandService.executeCommand(isMacintosh && isNative ? OpenFileFolderAction.ID : OpenFolderAction.ID);
			};
			const askAi = append(actions, $('button.orchestra-home__button'));
			askAi.textContent = 'まずは AI に相談する';
			askAi.onclick = run(ORCHESTRA_CHAT_SEND_PROMPT_ACTION_ID);

			// 最近使ったフォルダ
			const recents = recentlyOpened.filter(isRecentFolder).slice(0, 5);
			if (recents.length > 0) {
				append(home, $('h2.orchestra-home__section-title')).textContent = '最近使ったフォルダ';
				const list = append(home, $('ul.orchestra-home__recents'));
				for (const w of recents) {
					const fullPath = w.label || this.labelService.getWorkspaceLabel(w.folderUri, { verbose: Verbosity.LONG });
					const { name, parentPath } = splitRecentLabel(fullPath);
					const item = append(list, $('li'));
					const button = append(item, $('button.orchestra-home__recent'));
					button.title = fullPath;
					append(button, $('span.orchestra-home__recent-name')).textContent = name;
					append(button, $('span.orchestra-home__recent-path')).textContent = parentPath;
					button.onclick = e => {
						this.hostService.openWindow([{ folderUri: w.folderUri } satisfies IWindowOpenable], {
							forceNewWindow: e.ctrlKey || e.metaKey,
							remoteAuthority: w.remoteAuthority || null,
						});
						e.preventDefault();
						e.stopPropagation();
					};
				}
			}
		} else {
			// 例: 押すとそのままチャットに送られる
			append(home, $('h2.orchestra-home__section-title')).textContent = 'たとえば、こんなふうに';
			const examples = append(home, $('.orchestra-home__examples'));
			for (const [label, prompt] of [
				['このフォルダに何が入っているか教えて', 'このフォルダの中身を見て、何のプロジェクトで、どんなファイルがあるのか初心者にも分かるように説明してください。'],
				['シンプルな TODO アプリを作って', 'このフォルダに、ブラウザで動くシンプルな TODO アプリを作ってください。HTML / CSS / JavaScript だけで作り、開き方も教えてください。'],
				['エラーが出たので直してほしい', 'いまエラーが出ています。原因を調べて直してください。必要なら、どのエラーメッセージを貼ればいいか教えてください。'],
			]) {
				const chip = append(examples, $('button.orchestra-home__example'));
				chip.textContent = label;
				chip.title = 'クリックするとチャットに送信します';
				chip.onclick = run(ORCHESTRA_CHAT_SEND_PROMPT_ACTION_ID, prompt);
			}

			const actions = append(home, $('.orchestra-home__actions'));
			const chat = append(actions, $('button.orchestra-home__button.orchestra-home__button--primary'));
			chat.textContent = 'チャットに話しかける';
			chat.onclick = run(ORCHESTRA_CHAT_SEND_PROMPT_ACTION_ID);
			const files = append(actions, $('button.orchestra-home__button'));
			files.textContent = 'ファイル一覧を見る';
			files.onclick = run(ORCHESTRA_UI_TOGGLE_FILES_ACTION_ID);
			const terminal = append(actions, $('button.orchestra-home__button'));
			terminal.textContent = 'ターミナルを開く';
			terminal.onclick = run(ORCHESTRA_UI_TOGGLE_TERMINAL_ACTION_ID);
		}

		// 上級者向けの逃げ道
		const footer = append(home, $('p.orchestra-home__footer'));
		append(footer, $('span')).textContent = 'エディタの操作に慣れている方は ';
		const pro = append(footer, $('button.orchestra-home__link'));
		pro.textContent = '上級者モード (IDE 表示)';
		pro.onclick = run(ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID);
		append(footer, $('span')).textContent = ' に切り替えられます。';
	}

	private clear(): void {
		clearNode(this.shortcuts);
		this.transientDisposables.clear();
	}

	override dispose(): void {
		super.dispose();
		this.clear();
		this.currentDisposables.forEach(label => label.dispose());
	}
}

registerColor('editorWatermark.foreground', { dark: transparent(editorForeground, 0.6), light: transparent(editorForeground, 0.68), hcDark: editorForeground, hcLight: editorForeground }, localize('editorLineHighlight', 'Foreground color for the labels in the editor watermark.'));



// /*---------------------------------------------------------------------------------------------
//  *  Copyright (c) Microsoft Corporation. All rights reserved.
//  *  Licensed under the MIT License. See License.txt in the project root for license information.
//  *--------------------------------------------------------------------------------------------*/

// import { $, append, clearNode, h } from '../../../../base/browser/dom.js';
// import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
// import { coalesce, shuffle } from '../../../../base/common/arrays.js';
// import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
// import { isMacintosh, isWeb, OS } from '../../../../base/common/platform.js';
// import { localize } from '../../../../nls.js';
// import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
// import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
// import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
// import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
// import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
// import { defaultKeybindingLabelStyles } from '../../../../platform/theme/browser/defaultStyles.js';
// import { editorForeground, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
// import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';

// interface WatermarkEntry {
// 	readonly id: string;
// 	readonly text: string;
// 	readonly when?: {
// 		native?: ContextKeyExpression;
// 		web?: ContextKeyExpression;
// 	};
// }

// const showCommands: WatermarkEntry = { text: localize('watermark.showCommands', "Show All Commands"), id: 'workbench.action.showCommands' };
// const gotoFile: WatermarkEntry = { text: localize('watermark.quickAccess', "Go to File"), id: 'workbench.action.quickOpen' };
// const openFile: WatermarkEntry = { text: localize('watermark.openFile', "Open File"), id: 'workbench.action.files.openFile' };
// const openFolder: WatermarkEntry = { text: localize('watermark.openFolder', "Open Folder"), id: 'workbench.action.files.openFolder' };
// const openFileOrFolder: WatermarkEntry = { text: localize('watermark.openFileFolder', "Open File or Folder"), id: 'workbench.action.files.openFileFolder' };
// const openRecent: WatermarkEntry = { text: localize('watermark.openRecent', "Open Recent"), id: 'workbench.action.openRecent' };
// const newUntitledFile: WatermarkEntry = { text: localize('watermark.newUntitledFile', "New Untitled Text File"), id: 'workbench.action.files.newUntitledFile' };
// const findInFiles: WatermarkEntry = { text: localize('watermark.findInFiles', "Find in Files"), id: 'workbench.action.findInFiles' };
// const toggleTerminal: WatermarkEntry = { text: localize({ key: 'watermark.toggleTerminal', comment: ['toggle is a verb here'] }, "Toggle Terminal"), id: 'workbench.action.terminal.toggleTerminal', when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) } };
// const startDebugging: WatermarkEntry = { text: localize('watermark.startDebugging', "Start Debugging"), id: 'workbench.action.debug.start', when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) } };
// const openSettings: WatermarkEntry = { text: localize('watermark.openSettings', "Open Settings"), id: 'workbench.action.openSettings' };

// const showCopilot = ContextKeyExpr.or(ContextKeyExpr.equals('chatSetupHidden', false), ContextKeyExpr.equals('chatSetupInstalled', true));
// const openChat: WatermarkEntry = { text: localize('watermark.openChat', "Open Chat"), id: 'workbench.action.chat.open', when: { native: showCopilot, web: showCopilot } };

// const emptyWindowEntries: WatermarkEntry[] = coalesce([
// 	showCommands,
// 	...(isMacintosh && !isWeb ? [openFileOrFolder] : [openFile, openFolder]),
// 	openRecent,
// 	isMacintosh && !isWeb ? newUntitledFile : undefined, // fill in one more on macOS to get to 5 entries
// 	openChat
// ]);

// const randomEmptyWindowEntries: WatermarkEntry[] = [
// 	/* Nothing yet */
// ];

// const workspaceEntries: WatermarkEntry[] = [
// 	showCommands,
// 	gotoFile,
// 	openChat
// ];

// const randomWorkspaceEntries: WatermarkEntry[] = [
// 	findInFiles,
// 	startDebugging,
// 	toggleTerminal,
// 	openSettings,
// ];

// export class EditorGroupWatermark extends Disposable {

// 	private static readonly CACHED_WHEN = 'editorGroupWatermark.whenConditions';

// 	private readonly cachedWhen: { [when: string]: boolean };

// 	private readonly shortcuts: HTMLElement;
// 	private readonly transientDisposables = this._register(new DisposableStore());
// 	private readonly keybindingLabels = this._register(new DisposableStore());

// 	private enabled = false;
// 	private workbenchState: WorkbenchState;

// 	constructor(
// 		container: HTMLElement,
// 		@IKeybindingService private readonly keybindingService: IKeybindingService,
// 		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
// 		@IContextKeyService private readonly contextKeyService: IContextKeyService,
// 		@IConfigurationService private readonly configurationService: IConfigurationService,
// 		@IStorageService private readonly storageService: IStorageService
// 	) {
// 		super();

// 		this.cachedWhen = this.storageService.getObject(EditorGroupWatermark.CACHED_WHEN, StorageScope.PROFILE, Object.create(null));
// 		this.workbenchState = this.contextService.getWorkbenchState();

// 		const elements = h('.editor-group-watermark', [
// 			h('.letterpress'),
// 			h('.shortcuts@shortcuts'),
// 		]);

// 		append(container, elements.root);
// 		this.shortcuts = elements.shortcuts;

// 		this.registerListeners();

// 		this.render();
// 	}

// 	private registerListeners(): void {
// 		this._register(this.configurationService.onDidChangeConfiguration(e => {
// 			if (e.affectsConfiguration('workbench.tips.enabled') && this.enabled !== this.configurationService.getValue<boolean>('workbench.tips.enabled')) {
// 				this.render();
// 			}
// 		}));

// 		this._register(this.contextService.onDidChangeWorkbenchState(workbenchState => {
// 			if (this.workbenchState !== workbenchState) {
// 				this.workbenchState = workbenchState;
// 				this.render();
// 			}
// 		}));

// 		this._register(this.storageService.onWillSaveState(e => {
// 			if (e.reason === WillSaveStateReason.SHUTDOWN) {
// 				const entries = [...emptyWindowEntries, ...randomEmptyWindowEntries, ...workspaceEntries, ...randomWorkspaceEntries];
// 				for (const entry of entries) {
// 					const when = isWeb ? entry.when?.web : entry.when?.native;
// 					if (when) {
// 						this.cachedWhen[entry.id] = this.contextKeyService.contextMatchesRules(when);
// 					}
// 				}

// 				this.storageService.store(EditorGroupWatermark.CACHED_WHEN, JSON.stringify(this.cachedWhen), StorageScope.PROFILE, StorageTarget.MACHINE);
// 			}
// 		}));
// 	}

// 	private render(): void {
// 		this.enabled = this.configurationService.getValue<boolean>('workbench.tips.enabled');

// 		clearNode(this.shortcuts);
// 		this.transientDisposables.clear();

// 		if (!this.enabled) {
// 			return;
// 		}

// 		const fixedEntries = this.filterEntries(this.workbenchState !== WorkbenchState.EMPTY ? workspaceEntries : emptyWindowEntries, false /* not shuffled */);
// 		const randomEntries = this.filterEntries(this.workbenchState !== WorkbenchState.EMPTY ? randomWorkspaceEntries : randomEmptyWindowEntries, true /* shuffled */).slice(0, Math.max(0, 5 - fixedEntries.length));
// 		const entries = [...fixedEntries, ...randomEntries];

// 		const box = append(this.shortcuts, $('.watermark-box'));

// 		const update = () => {
// 			clearNode(box);
// 			this.keybindingLabels.clear();

// 			for (const entry of entries) {
// 				const keys = this.keybindingService.lookupKeybinding(entry.id);
// 				if (!keys) {
// 					continue;
// 				}

// 				const dl = append(box, $('dl'));
// 				const dt = append(dl, $('dt'));
// 				dt.textContent = entry.text;

// 				const dd = append(dl, $('dd'));

// 				const label = this.keybindingLabels.add(new KeybindingLabel(dd, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles }));
// 				label.set(keys);
// 			}
// 		};

// 		update();
// 		this.transientDisposables.add(this.keybindingService.onDidUpdateKeybindings(update));
// 	}

// 	private filterEntries(entries: WatermarkEntry[], shuffleEntries: boolean): WatermarkEntry[] {
// 		const filteredEntries = entries
// 			.filter(entry => (isWeb && !entry.when?.web) || (!isWeb && !entry.when?.native) || this.cachedWhen[entry.id])
// 			.filter(entry => !!CommandsRegistry.getCommand(entry.id))
// 			.filter(entry => !!this.keybindingService.lookupKeybinding(entry.id));

// 		if (shuffleEntries) {
// 			shuffle(filteredEntries);
// 		}

// 		return filteredEntries;
// 	}
// }

// registerColor('editorWatermark.foreground', { dark: transparent(editorForeground, 0.6), light: transparent(editorForeground, 0.68), hcDark: editorForeground, hcLight: editorForeground }, localize('editorLineHighlight', 'Foreground color for the labels in the editor watermark.'));
