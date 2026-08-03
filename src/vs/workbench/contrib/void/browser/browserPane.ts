/*--------------------------------------------------------------------------------------
 *  Orchestra Browser
 *  エディタ領域で動作する組み込みブラウザ。ローカルの開発サーバ (localhost:3000 など) や
 *  ドキュメントを IDE から離れずに確認するためのペイン。
 *
 *  構成:
 *   - OrchestraBrowserInput : URL と履歴 (戻る/進む) を保持し、webview を所有するエディタ入力
 *   - OrchestraBrowserPane  : ネイティブ DOM のツールバー + webview を重ねて表示するペイン
 *
 *  webview の中身は「iframe を 1 枚だけ持つシェル HTML」で、ナビゲーションは
 *  postMessage 経由で行う。こうすることでページを読み込み直さずに URL を切り替えられる。
 *--------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import * as nls from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService, IScopedContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorOpenContext, IEditorSerializer } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IOverlayWebview, IWebviewService } from '../../webview/browser/webview.js';

import './media/browserPane.css';


// ---------------------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------------------

export const ORCHESTRA_BROWSER_DEFAULT_URL_SETTING = 'orchestra.browser.defaultUrl';
export const ORCHESTRA_BROWSER_LOCAL_ONLY_SETTING = 'orchestra.browser.localOnly';

const FALLBACK_URL = 'http://localhost:3000';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'orchestraBrowser',
	order: 100,
	title: nls.localize('orchestraBrowser.configTitle', "Orchestra Browser"),
	type: 'object',
	properties: {
		[ORCHESTRA_BROWSER_DEFAULT_URL_SETTING]: {
			type: 'string',
			default: FALLBACK_URL,
			description: nls.localize('orchestraBrowser.defaultUrl', "組み込みブラウザを新しく開いたときに最初に表示する URL。"),
		},
		[ORCHESTRA_BROWSER_LOCAL_ONLY_SETTING]: {
			type: 'boolean',
			default: false,
			description: nls.localize('orchestraBrowser.localOnly', "有効にすると、組み込みブラウザ内では localhost / 127.0.0.1 のみ読み込みを許可し、それ以外の URL は外部ブラウザで開きます。"),
		},
	}
});


// ---------------------------------------------------------------------------------------
// URL ユーティリティ
// ---------------------------------------------------------------------------------------

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/**
 * アドレスバーに打ち込まれた文字列を実際に読み込める URL へ正規化する。
 *
 *   3000                -> http://localhost:3000
 *   :3000               -> http://localhost:3000
 *   localhost:5173/app  -> http://localhost:5173/app
 *   example.com         -> https://example.com
 *   https://example.com -> そのまま
 */
export function normalizeBrowserUrl(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		return '';
	}

	// 既にスキーム付き
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
		return trimmed;
	}

	// ポート番号だけ ("3000" / ":3000")
	const portOnly = /^:?(\d{2,5})(\/.*)?$/.exec(trimmed);
	if (portOnly) {
		return `http://localhost:${portOnly[1]}${portOnly[2] ?? ''}`;
	}

	// localhost 系はスキームを補って http に (dev サーバは大抵 https ではない)
	const hostPart = trimmed.split(/[/?#]/, 1)[0].split(':', 1)[0].toLowerCase();
	if (LOCAL_HOSTNAMES.has(hostPart)) {
		return `http://${trimmed}`;
	}

	return `https://${trimmed}`;
}

export function isLocalBrowserUrl(url: string): boolean {
	try {
		return LOCAL_HOSTNAMES.has(new URL(url).hostname.toLowerCase());
	} catch {
		return false;
	}
}

/** タブに表示する短いラベル。 */
function labelForUrl(url: string): string {
	if (!url) {
		return nls.localize('orchestraBrowser.newTab', "New Tab");
	}
	try {
		const parsed = new URL(url);
		return parsed.host || url;
	} catch {
		return url;
	}
}


// ---------------------------------------------------------------------------------------
// webview のシェル HTML
// ---------------------------------------------------------------------------------------

function generateNonce(): string {
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let text = '';
	for (let i = 0; i < 64; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

/**
 * webview に一度だけ流し込むシェル。以降のナビゲーションは postMessage で行うため、
 * この HTML 自体が再読み込みされることはない (webview 自体が作り直された場合を除く)。
 */
function getShellHtml(nonce: string): string {
	return /* html */ `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; frame-src *;">
	<style nonce="${nonce}">
		html, body { height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; background: var(--vscode-editor-background); }
		#frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; background: #ffffff; display: block; }
		body.is-blank #frame { visibility: hidden; }
	</style>
</head>
<body class="is-blank">
	<iframe id="frame" sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-popups allow-modals allow-pointer-lock"></iframe>
	<script nonce="${nonce}">
	(function () {
		const vscode = acquireVsCodeApi();
		const frame = document.getElementById('frame');
		let currentUrl = '';
		let frameWasFocused = false;

		function navigateTo(rawUrl, bustCache) {
			const nextUrl = rawUrl || '';

			// タブを切り替えるたびにホストが現在の URL を送り直してくるため、同じ URL の
			// 再送は無視する。そうしないと表示中のページが毎回読み込み直されてしまう。
			if (!bustCache && nextUrl === currentUrl && frame.hasAttribute('src')) {
				vscode.postMessage({ type: 'didLoad', url: currentUrl });
				return;
			}

			currentUrl = nextUrl;
			if (!currentUrl) {
				frame.removeAttribute('src');
				document.body.classList.add('is-blank');
				vscode.postMessage({ type: 'didLoad', url: '' });
				return;
			}
			document.body.classList.remove('is-blank');

			let src = currentUrl;
			if (bustCache) {
				// iframe のキャッシュを確実に破棄する手段が他に無いため、クエリを足して再読込させる
				try {
					const parsed = new URL(currentUrl);
					parsed.searchParams.set('orchestraBrowserReqId', Date.now().toString());
					src = parsed.toString();
				} catch (e) { /* URL として解釈できなければそのまま */ }
			}
			frame.src = src;
			vscode.setState({ url: currentUrl });
		}

		window.addEventListener('message', function (e) {
			const msg = e.data;
			if (!msg) { return; }
			switch (msg.type) {
				case 'navigate': navigateTo(msg.url, msg.bustCache); break;
				case 'focusFrame': frame.focus(); break;
			}
		});

		frame.addEventListener('load', function () {
			vscode.postMessage({ type: 'didLoad', url: currentUrl });
		});

		// iframe にフォーカスが入るとキー入力が IDE へ届かなくなるため、ホスト側に知らせて
		// 「フォーカス中」の表示を出せるようにする
		setInterval(function () {
			const focused = document.activeElement === frame;
			if (focused !== frameWasFocused) {
				frameWasFocused = focused;
				vscode.postMessage({ type: 'didChangeFrameFocus', focused: focused });
			}
		}, 200);

		vscode.postMessage({ type: 'ready' });
	}());
	</script>
</body>
</html>`;
}


// ---------------------------------------------------------------------------------------
// エディタ入力
// ---------------------------------------------------------------------------------------

interface ISerializedOrchestraBrowser {
	readonly url: string;
}

export class OrchestraBrowserInput extends EditorInput {

	static readonly ID = 'workbench.input.orchestra.browser';
	static readonly SCHEME = 'orchestra-browser';

	readonly resource: URI;

	/** 戻る/進むのためのスタック。アドレスバー由来の遷移だけを積む。 */
	private _history: string[] = [];
	private _historyIndex = -1;

	private readonly _onDidChangeNavigationState = this._register(new Emitter<void>());
	readonly onDidChangeNavigationState = this._onDidChangeNavigationState.event;

	private _webview: IOverlayWebview | undefined;

	constructor(
		initialUrl: string,
		id: string = generateUuid(),
		@IWebviewService private readonly _webviewService: IWebviewService,
	) {
		super();

		this.resource = URI.from({ scheme: OrchestraBrowserInput.SCHEME, path: `/${id}` });

		if (initialUrl) {
			this._history = [initialUrl];
			this._historyIndex = 0;
		}
	}

	override get typeId(): string { return OrchestraBrowserInput.ID; }

	override getName(): string { return labelForUrl(this.url); }

	override getDescription(): string | undefined { return this.url || undefined; }

	override getIcon() { return Codicon.globe; }

	override matches(other: unknown): boolean {
		return other === this
			|| (other instanceof OrchestraBrowserInput && other.resource.toString() === this.resource.toString());
	}

	// ----- ナビゲーション状態 -----

	get url(): string { return this._history[this._historyIndex] ?? ''; }

	get canGoBack(): boolean { return this._historyIndex > 0; }

	get canGoForward(): boolean { return this._historyIndex < this._history.length - 1; }

	/** 新しい URL へ移動し、履歴に積む。 */
	navigate(url: string): void {
		if (!url || url === this.url) {
			return;
		}
		this._history = [...this._history.slice(0, this._historyIndex + 1), url];
		this._historyIndex = this._history.length - 1;
		this._didChange();
	}

	goBack(): void {
		if (!this.canGoBack) {
			return;
		}
		this._historyIndex--;
		this._didChange();
	}

	goForward(): void {
		if (!this.canGoForward) {
			return;
		}
		this._historyIndex++;
		this._didChange();
	}

	private _didChange(): void {
		this._onDidChangeNavigationState.fire();
		this._onDidChangeLabel.fire();
	}

	// ----- webview -----

	/**
	 * この入力が所有する webview。ペインが作り直されてもページを維持できるよう、
	 * ペインではなく入力側に持たせている。
	 */
	get webview(): IOverlayWebview {
		if (!this._webview) {
			const webview = this._webviewService.createWebviewOverlay({
				title: nls.localize('orchestraBrowser.webviewTitle', "Orchestra Browser"),
				options: {
					retainContextWhenHidden: true,
					enableFindWidget: false,
				},
				contentOptions: {
					allowScripts: true,
					allowForms: true,
					localResourceRoots: [],
				},
				extension: undefined,
			});
			webview.setHtml(getShellHtml(generateNonce()));
			this._webview = this._register(webview);
		}
		return this._webview;
	}

	serialize(): ISerializedOrchestraBrowser {
		return { url: this.url };
	}
}


class OrchestraBrowserInputSerializer implements IEditorSerializer {

	canSerialize(editor: EditorInput): boolean {
		return editor instanceof OrchestraBrowserInput;
	}

	serialize(editor: EditorInput): string | undefined {
		if (!(editor instanceof OrchestraBrowserInput)) {
			return undefined;
		}
		return JSON.stringify(editor.serialize());
	}

	deserialize(instantiationService: IInstantiationService, serialized: string): EditorInput | undefined {
		try {
			const data: ISerializedOrchestraBrowser = JSON.parse(serialized);
			return instantiationService.createInstance(OrchestraBrowserInput, data.url ?? '', generateUuid());
		} catch {
			return undefined;
		}
	}
}


// ---------------------------------------------------------------------------------------
// エディタペイン
// ---------------------------------------------------------------------------------------

export const ORCHESTRA_BROWSER_FOCUS_CONTEXT = new RawContextKey<boolean>('orchestraBrowserFocus', false, {
	type: 'boolean',
	description: nls.localize('orchestraBrowser.focusContext', "Orchestra の組み込みブラウザがアクティブなときに true。"),
});

const RECENT_URLS_STORAGE_KEY = 'orchestra.browser.recentUrls';
const MAX_RECENT_URLS = 20;

export class OrchestraBrowserPane extends EditorPane {

	static readonly ID = 'workbench.pane.orchestra.browser';

	private _root: HTMLElement | undefined;
	/** webview を重ねる領域 (ツールバーの下)。 */
	private _webviewPlaceholder: HTMLElement | undefined;

	private _urlInput: HTMLInputElement | undefined;
	private _urlSuggestions: HTMLDataListElement | undefined;
	private _backButton: HTMLButtonElement | undefined;
	private _forwardButton: HTMLButtonElement | undefined;

	private _visible = false;
	private _isDisposed = false;

	private readonly _inputDisposables = this._register(new DisposableStore());
	private readonly _webviewDisposables = this._register(new DisposableStore());
	private readonly _scopedContextKeyService = this._register(new MutableDisposable<IScopedContextKeyService>());

	private readonly _onDidFocusWebview = this._register(new Emitter<void>());
	override get onDidFocus(): Event<void> { return this._onDidFocusWebview.event; }

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super(OrchestraBrowserPane.ID, group, telemetryService, themeService, _storageService);

		const part = _editorGroupsService.getPart(group);
		this._register(Event.any(part.onDidScroll, part.onDidAddGroup, part.onDidRemoveGroup, part.onDidMoveGroup)(() => {
			if (this._visible) {
				this._layoutWebview();
			}
		}));
	}

	private get browserInput(): OrchestraBrowserInput | undefined {
		return this.input instanceof OrchestraBrowserInput ? this.input : undefined;
	}

	override get scopedContextKeyService(): IContextKeyService | undefined {
		return this._scopedContextKeyService.value;
	}

	// ----- 描画 -----

	protected createEditor(parent: HTMLElement): void {
		const root = DOM.append(parent, DOM.$('.orchestra-browser'));
		this._root = root;

		this._scopedContextKeyService.value = this._register(this._contextKeyService.createScoped(root));
		ORCHESTRA_BROWSER_FOCUS_CONTEXT.bindTo(this._scopedContextKeyService.value).set(true);

		const toolbar = DOM.append(root, DOM.$('.orchestra-browser-toolbar'));

		const navGroup = DOM.append(toolbar, DOM.$('.orchestra-browser-button-group'));
		this._backButton = this._createIconButton(navGroup, Codicon.arrowLeft, nls.localize('orchestraBrowser.back', "戻る"), () => this.browserInput?.goBack());
		this._forwardButton = this._createIconButton(navGroup, Codicon.arrowRight, nls.localize('orchestraBrowser.forward', "進む"), () => this.browserInput?.goForward());
		this._createIconButton(navGroup, Codicon.refresh, nls.localize('orchestraBrowser.reload', "再読み込み"), () => this.reload());

		const urlBar = DOM.append(toolbar, DOM.$('.orchestra-browser-urlbar'));
		const suggestionsId = `orchestra-browser-recent-${generateUuid()}`;
		const urlInput = DOM.append(urlBar, DOM.$<HTMLInputElement>('input.orchestra-browser-url-input'));
		urlInput.type = 'text';
		urlInput.spellcheck = false;
		urlInput.autocapitalize = 'off';
		urlInput.setAttribute('autocomplete', 'off');
		urlInput.setAttribute('aria-label', nls.localize('orchestraBrowser.urlInputLabel', "アドレス"));
		urlInput.placeholder = nls.localize('orchestraBrowser.urlPlaceholder', "URL または localhost のポート番号を入力");
		urlInput.setAttribute('list', suggestionsId);
		this._urlInput = urlInput;

		const suggestions = DOM.append(urlBar, DOM.$<HTMLDataListElement>('datalist'));
		suggestions.id = suggestionsId;
		this._urlSuggestions = suggestions;

		this._register(DOM.addDisposableListener(urlInput, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.navigateTo(urlInput.value);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				urlInput.value = this.browserInput?.url ?? '';
				this.focusWebview();
			}
		}));
		this._register(DOM.addDisposableListener(urlInput, DOM.EventType.FOCUS, () => urlInput.select()));

		const actionsGroup = DOM.append(toolbar, DOM.$('.orchestra-browser-button-group'));
		this._createIconButton(actionsGroup, Codicon.linkExternal, nls.localize('orchestraBrowser.openExternal', "外部ブラウザで開く"), () => this.openExternal());

		const content = DOM.append(root, DOM.$('.orchestra-browser-content'));
		this._webviewPlaceholder = DOM.append(content, DOM.$('.orchestra-browser-webview-placeholder'));
		// setParentFlowTo は id 経由で親を辿るため、必ず id を持たせる必要がある
		this._webviewPlaceholder.id = `orchestra-browser-webview-${generateUuid()}`;

		this._updateRecentUrlSuggestions();
	}

	private _createIconButton(parent: HTMLElement, icon: ThemeIcon, title: string, run: () => void): HTMLButtonElement {
		const button = DOM.append(parent, DOM.$<HTMLButtonElement>('button.orchestra-browser-icon-button'));
		button.type = 'button';
		button.title = title;
		button.setAttribute('aria-label', title);
		DOM.append(button, DOM.$(`span${ThemeIcon.asCSSSelector(icon)}`));
		this._register(DOM.addDisposableListener(button, DOM.EventType.CLICK, e => {
			DOM.EventHelper.stop(e, true);
			run();
		}));
		return button;
	}

	// ----- 入力の切り替え -----

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		const previous = this.browserInput;
		if (previous && previous !== input) {
			previous.webview.release(this);
			this._webviewDisposables.clear();
		}

		await super.setInput(input, options, context, token);

		if (token.isCancellationRequested || this._isDisposed || !(input instanceof OrchestraBrowserInput)) {
			return;
		}

		this._inputDisposables.clear();
		this._inputDisposables.add(input.onDidChangeNavigationState(() => {
			this._syncToolbar();
			this._postNavigate(false);
		}));

		if (this._visible) {
			this._claimWebview(input);
		}
		this._syncToolbar();
		this._postNavigate(false);
	}

	override clearInput(): void {
		this.browserInput?.webview.release(this);
		this._webviewDisposables.clear();
		this._inputDisposables.clear();
		super.clearInput();
	}

	protected override setEditorVisible(visible: boolean): void {
		this._visible = visible;

		const input = this.browserInput;
		if (input) {
			if (visible) {
				this._claimWebview(input);
			} else {
				input.webview.release(this);
				this._webviewDisposables.clear();
			}
		}

		super.setEditorVisible(visible);
	}

	private _claimWebview(input: OrchestraBrowserInput): void {
		const webview = input.webview;
		webview.claim(this, this.window, this.scopedContextKeyService);

		if (this._webviewPlaceholder) {
			this._webviewPlaceholder.setAttribute('aria-flowto', webview.container.id);
			DOM.setParentFlowTo(webview.container, this._webviewPlaceholder);
		}

		this._webviewDisposables.clear();
		this._webviewDisposables.add(this._editorGroupsService.createEditorDropTarget(webview.container, {
			containsGroup: group => this.group.id === group.id
		}));
		this._webviewDisposables.add(webview.onDidFocus(() => this._onDidFocusWebview.fire()));
		this._webviewDisposables.add(webview.onMessage(e => this._onWebviewMessage(e.message)));

		this._layoutWebview();

		// webview が作り直された直後は 'ready' を待たずに一度送っておく (取りこぼし対策)
		this._postNavigate(false);
	}

	private _onWebviewMessage(message: any): void {
		if (!message || typeof message.type !== 'string') {
			return;
		}
		switch (message.type) {
			case 'ready':
				this._postNavigate(false);
				break;
			case 'didLoad':
				this._root?.classList.remove('is-loading');
				break;
			case 'didChangeFrameFocus':
				this._root?.classList.toggle('is-frame-focused', !!message.focused);
				break;
		}
	}

	/** 現在の URL を webview へ送る。 */
	private _postNavigate(bustCache: boolean): void {
		const input = this.browserInput;
		if (!input) {
			return;
		}

		const url = input.url;
		if (this._urlInput && DOM.getActiveElement() !== this._urlInput) {
			this._urlInput.value = url;
		}

		if (url) {
			this._root?.classList.add('is-loading');
		}
		input.webview.postMessage({ type: 'navigate', url, bustCache });
	}

	private _syncToolbar(): void {
		const input = this.browserInput;
		if (this._backButton) {
			this._backButton.disabled = !input?.canGoBack;
		}
		if (this._forwardButton) {
			this._forwardButton.disabled = !input?.canGoForward;
		}
	}

	// ----- 公開操作 (アクションから呼ばれる) -----

	navigateTo(rawUrl: string): void {
		const input = this.browserInput;
		if (!input) {
			return;
		}

		const url = normalizeBrowserUrl(rawUrl);
		if (!url) {
			return;
		}

		// localOnly のときは外部サイトを webview に読み込まず、OS のブラウザへ委譲する
		if (this._configurationService.getValue<boolean>(ORCHESTRA_BROWSER_LOCAL_ONLY_SETTING) && !isLocalBrowserUrl(url)) {
			if (this._urlInput) {
				this._urlInput.value = input.url;
			}
			this._openerService.open(url, { openExternal: true });
			return;
		}

		this._addRecentUrl(url);

		if (url === input.url) {
			// 同じ URL なら履歴を増やさずに再読み込み
			this._postNavigate(true);
			return;
		}
		input.navigate(url);
	}

	reload(): void {
		this._postNavigate(true);
	}

	goBack(): void { this.browserInput?.goBack(); }

	goForward(): void { this.browserInput?.goForward(); }

	openExternal(): void {
		const url = this.browserInput?.url;
		if (url) {
			this._openerService.open(url, { openExternal: true });
		}
	}

	focusUrlBar(): void {
		this._urlInput?.focus();
		this._urlInput?.select();
	}

	focusWebview(): void {
		this.browserInput?.webview.postMessage({ type: 'focusFrame' });
	}

	// ----- 履歴サジェスト -----

	private _getRecentUrls(): string[] {
		try {
			const raw = this._storageService.get(RECENT_URLS_STORAGE_KEY, StorageScope.PROFILE);
			const parsed = raw ? JSON.parse(raw) : [];
			return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
		} catch {
			return [];
		}
	}

	private _addRecentUrl(url: string): void {
		const recent = [url, ...this._getRecentUrls().filter(u => u !== url)].slice(0, MAX_RECENT_URLS);
		this._storageService.store(RECENT_URLS_STORAGE_KEY, JSON.stringify(recent), StorageScope.PROFILE, StorageTarget.USER);
		this._updateRecentUrlSuggestions();
	}

	private _updateRecentUrlSuggestions(): void {
		const datalist = this._urlSuggestions;
		if (!datalist) {
			return;
		}
		DOM.clearNode(datalist);
		for (const url of this._getRecentUrls()) {
			const option = DOM.append(datalist, DOM.$<HTMLOptionElement>('option'));
			option.value = url;
		}
	}

	// ----- レイアウト / フォーカス -----

	override layout(dimension: DOM.Dimension): void {
		if (this._root) {
			this._root.style.height = `${dimension.height}px`;
			this._root.style.width = `${dimension.width}px`;
		}
		if (this._visible) {
			this._layoutWebview();
		}
	}

	/**
	 * webview はワークベンチのオーバーレイ層に置かれるので、ツールバーを除いた
	 * コンテンツ領域の矩形に合わせて毎回位置を計算し直す。
	 */
	private _layoutWebview(): void {
		const input = this.browserInput;
		if (!input || !this._webviewPlaceholder?.isConnected) {
			return;
		}
		const rootContainer = this._layoutService.getContainer(this.window, Parts.EDITOR_PART);
		input.webview.layoutWebviewOverElement(this._webviewPlaceholder, undefined, rootContainer);
	}

	override focus(): void {
		super.focus();
		// URL が未設定の新規タブはアドレスバーへ、それ以外はページへフォーカスする
		if (this.browserInput?.url) {
			this.browserInput.webview.focus();
		} else {
			this.focusUrlBar();
		}
	}

	override get minimumWidth() { return 300; }

	override dispose(): void {
		this._isDisposed = true;
		this._root?.remove();
		this._root = undefined;
		super.dispose();
	}
}


// ---------------------------------------------------------------------------------------
// 登録
// ---------------------------------------------------------------------------------------

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(OrchestraBrowserPane, OrchestraBrowserPane.ID, nls.localize('orchestraBrowserPane', "Orchestra Browser")),
	[new SyncDescriptor(OrchestraBrowserInput)]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	OrchestraBrowserInput.ID,
	OrchestraBrowserInputSerializer
);


// ---------------------------------------------------------------------------------------
// アクション
// ---------------------------------------------------------------------------------------

export const ORCHESTRA_BROWSER_OPEN_ACTION_ID = 'orchestra.browser.open';
export const ORCHESTRA_BROWSER_OPEN_URL_ACTION_ID = 'orchestra.browser.openUrl';
export const ORCHESTRA_BROWSER_RELOAD_ACTION_ID = 'orchestra.browser.reload';
export const ORCHESTRA_BROWSER_BACK_ACTION_ID = 'orchestra.browser.back';
export const ORCHESTRA_BROWSER_FORWARD_ACTION_ID = 'orchestra.browser.forward';
export const ORCHESTRA_BROWSER_FOCUS_URL_BAR_ACTION_ID = 'orchestra.browser.focusUrlBar';
export const ORCHESTRA_BROWSER_OPEN_EXTERNAL_ACTION_ID = 'orchestra.browser.openExternal';

const BROWSER_CATEGORY = nls.localize2('orchestraBrowser.category', "Orchestra Browser");

/**
 * ブラウザタブがアクティブなエディタかどうか。コマンドパレットの有効/無効はこちらで判定する
 * (パレットを開くとフォーカスがクイック入力へ移り、フォーカス用のコンテキストキーは外れるため)。
 */
const ORCHESTRA_BROWSER_ACTIVE_CONTEXT = ActiveEditorContext.isEqualTo(OrchestraBrowserPane.ID);

function defaultUrl(accessor: ServicesAccessor): string {
	const configured = accessor.get(IConfigurationService).getValue<string>(ORCHESTRA_BROWSER_DEFAULT_URL_SETTING);
	return normalizeBrowserUrl(configured || FALLBACK_URL);
}

/** アクティブなグループにブラウザタブを開く。 */
async function openBrowser(accessor: ServicesAccessor, url: string): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const instantiationService = accessor.get(IInstantiationService);

	const input = instantiationService.createInstance(OrchestraBrowserInput, url, generateUuid());
	await editorService.openEditor(input, { pinned: true });
}

/** 現在アクティブなブラウザペイン (無ければ undefined)。 */
function activeBrowserPane(accessor: ServicesAccessor): OrchestraBrowserPane | undefined {
	const pane = accessor.get(IEditorService).activeEditorPane;
	return pane instanceof OrchestraBrowserPane ? pane : undefined;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_BROWSER_OPEN_ACTION_ID,
			title: nls.localize2('orchestraBrowser.openTitle', "ブラウザを開く"),
			category: BROWSER_CATEGORY,
			f1: true,
			icon: Codicon.globe,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyB,
			},
		});
	}
	async run(accessor: ServicesAccessor, url?: string): Promise<void> {
		await openBrowser(accessor, url ? normalizeBrowserUrl(url) : defaultUrl(accessor));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_BROWSER_OPEN_URL_ACTION_ID,
			title: nls.localize2('orchestraBrowser.openUrlTitle', "URL を指定してブラウザを開く..."),
			category: BROWSER_CATEGORY,
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const value = await quickInputService.input({
			prompt: nls.localize('orchestraBrowser.openUrlPrompt', "開く URL を入力してください"),
			placeHolder: nls.localize('orchestraBrowser.openUrlPlaceholder', "https://example.com / localhost:3000 / 3000"),
			value: defaultUrl(accessor),
		});
		if (value) {
			await openBrowser(accessor, normalizeBrowserUrl(value));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_BROWSER_RELOAD_ACTION_ID,
			title: nls.localize2('orchestraBrowser.reloadTitle', "ページを再読み込み"),
			category: BROWSER_CATEGORY,
			f1: true,
			precondition: ORCHESTRA_BROWSER_ACTIVE_CONTEXT,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ORCHESTRA_BROWSER_FOCUS_CONTEXT,
				primary: KeyMod.CtrlCmd | KeyCode.KeyR,
			},
		});
	}
	run(accessor: ServicesAccessor): void {
		activeBrowserPane(accessor)?.reload();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_BROWSER_BACK_ACTION_ID,
			title: nls.localize2('orchestraBrowser.backTitle', "戻る"),
			category: BROWSER_CATEGORY,
			f1: true,
			precondition: ORCHESTRA_BROWSER_ACTIVE_CONTEXT,
		});
	}
	run(accessor: ServicesAccessor): void {
		activeBrowserPane(accessor)?.goBack();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_BROWSER_FORWARD_ACTION_ID,
			title: nls.localize2('orchestraBrowser.forwardTitle', "進む"),
			category: BROWSER_CATEGORY,
			f1: true,
			precondition: ORCHESTRA_BROWSER_ACTIVE_CONTEXT,
		});
	}
	run(accessor: ServicesAccessor): void {
		activeBrowserPane(accessor)?.goForward();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_BROWSER_FOCUS_URL_BAR_ACTION_ID,
			title: nls.localize2('orchestraBrowser.focusUrlBarTitle', "アドレスバーにフォーカス"),
			category: BROWSER_CATEGORY,
			f1: true,
			precondition: ORCHESTRA_BROWSER_ACTIVE_CONTEXT,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ORCHESTRA_BROWSER_FOCUS_CONTEXT,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyL,
			},
		});
	}
	run(accessor: ServicesAccessor): void {
		activeBrowserPane(accessor)?.focusUrlBar();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ORCHESTRA_BROWSER_OPEN_EXTERNAL_ACTION_ID,
			title: nls.localize2('orchestraBrowser.openExternalTitle', "外部ブラウザで開く"),
			category: BROWSER_CATEGORY,
			f1: true,
			precondition: ORCHESTRA_BROWSER_ACTIVE_CONTEXT,
			icon: Codicon.linkExternal,
		});
	}
	run(accessor: ServicesAccessor): void {
		activeBrowserPane(accessor)?.openExternal();
	}
});

// 表示メニュー ("Command Palette..." / "Open View..." と同じグループ) から開けるようにする
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '1_open',
	command: {
		id: ORCHESTRA_BROWSER_OPEN_ACTION_ID,
		title: nls.localize({ key: 'miOrchestraBrowser', comment: ['&& denotes a mnemonic'] }, "&&Browser"),
	},
	order: 3,
});
