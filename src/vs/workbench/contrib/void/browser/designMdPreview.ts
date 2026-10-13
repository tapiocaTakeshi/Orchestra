/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/*
 * 「Markdown + HTML プレビュー」 (DESIGN.md 用)。
 *
 * デザイナーロールが書く `.division/DESIGN.md` は Markdown の仕様書で、見た目の部分は ```html ブロック、
 * デザイントークンは ```css ブロック (`:root { --color-...: ...; }`) に入っている。
 * このプレビューは Markdown を通常どおり描画し、各 ```html ブロックを sandbox 付きの iframe で
 * そのまま表示する (コード表示への切り替え・外部ブラウザで開く・ビジュアル編集して DESIGN.md へ保存)。
 *
 * - 描画はリリースノートと同じく内部 webview (IWebviewWorkbenchService.openWebview) + renderMarkdownDocument
 * - HTML 生成・書き戻しの純粋ロジックは common/designMdPreviewHtml.ts
 * - ファイル監視 / 開いているテキストモデルの変更でライブ更新 (編集中のブロックがある間は保留)
 * - `.division/DESIGN.md` が作成・更新されたら通知 (プレビューが開いていれば通知せず更新だけ)
 */

import { Codicon } from '../../../../base/common/codicons.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import * as marked from '../../../../base/common/marked/marked.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename, dirname, extname, isEqual, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { TokenizationRegistry } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { generateTokensCSSForColorMap } from '../../../../editor/common/languages/supports/tokenization.js';
import { tokenizeToString } from '../../../../editor/common/languages/textToHtmlTokenizer.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { FileChangeType, IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationHandle, INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from '../../markdown/browser/markdownDocumentRenderer.js';
import { asWebviewUri, decodeAuthority, webviewGenericCspSource, webviewRootResourceAuthority } from '../../webview/common/webview.js';
import { WebviewInput } from '../../webviewPanel/browser/webviewEditorInput.js';
import { IWebviewWorkbenchService } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import {
	buildBlockDocument, buildPreviewPage, cleanEditedHtml, ExtractedDesignDoc, extractDesignBlocks,
	getHtmlBlockCode, PreviewBlockData, PreviewLabels, replaceHtmlBlock,
} from '../common/designMdPreviewHtml.js';

export const DESIGN_MD_PREVIEW_COMMAND_ID = 'orchestra.designPreview.open';
const DESIGN_MD_PREVIEW_VIEW_TYPE = 'orchestra.designMdPreview';
const DIVISION_DIR = '.division';
const DESIGN_MD_FILE = 'DESIGN.md';

export interface IDesignMdPreviewOpenOptions {
	readonly toSide?: boolean;
	readonly preserveFocus?: boolean;
}

export interface IDesignMdPreviewService {
	readonly _serviceBrand: undefined;
	open(resource: URI, options?: IDesignMdPreviewOpenOptions): Promise<void>;
	isOpen(resource: URI): boolean;
}

export const IDesignMdPreviewService = createDecorator<IDesignMdPreviewService>('orchestraDesignMdPreviewService');

function previewLabels(): PreviewLabels {
	return {
		htmlPreview: localize('designPreview.htmlPreview', "HTML プレビュー"),
		preview: localize('designPreview.mode.preview', "プレビュー"),
		code: localize('designPreview.mode.code', "コード"),
		both: localize('designPreview.mode.both', "両方"),
		openExternal: localize('designPreview.openExternal', "新しいウィンドウで開く"),
		edit: localize('designPreview.edit', "編集"),
		save: localize('designPreview.save', "保存"),
		cancel: localize('designPreview.cancel', "キャンセル"),
		undo: localize('designPreview.undo', "元に戻す"),
		unsaved: localize('designPreview.unsaved', "未保存の変更があります"),
		saving: localize('designPreview.saving', "保存中…"),
		selectHint: localize('designPreview.selectHint', "要素をクリックして選択・テキストは直接編集できます"),
		textColor: localize('designPreview.prop.color', "文字色"),
		background: localize('designPreview.prop.background', "背景"),
		fontSize: localize('designPreview.prop.fontSize', "フォントサイズ"),
		padding: localize('designPreview.prop.padding', "パディング"),
		margin: localize('designPreview.prop.margin', "マージン"),
		borderRadius: localize('designPreview.prop.borderRadius', "角丸"),
		width: localize('designPreview.prop.width', "幅"),
		height: localize('designPreview.prop.height', "高さ"),
		selectParent: localize('designPreview.selectParent', "親要素"),
		duplicate: localize('designPreview.duplicate', "複製"),
		remove: localize('designPreview.remove', "削除"),
		editingOther: localize('designPreview.editingOther', "別のブロックを編集中です"),
		empty: localize('designPreview.empty', "このファイルは空です"),
	};
}

const EXTRA_MARKDOWN_CSS = `
pre { background-color: var(--vscode-textCodeBlock-background); }
code { font-size: 0.95em; }
:not(pre) > code { padding: 1px 4px; border-radius: 3px; background-color: var(--vscode-textCodeBlock-background); }
table { margin: 12px 0; }
th, td { border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
`;

const WEBVIEW_RESOURCE_SUFFIX = '.' + webviewRootResourceAuthority;

/** asWebviewUri で作った https://{scheme}+{authority}.vscode-resource.vscode-cdn.net/... を元の URI に戻す */
function fromWebviewUri(uri: URI): URI | undefined {
	if (uri.scheme !== Schemas.https || !uri.authority.endsWith(WEBVIEW_RESOURCE_SUFFIX)) {
		return undefined;
	}
	const prefix = uri.authority.slice(0, -WEBVIEW_RESOURCE_SUFFIX.length);
	const plus = prefix.indexOf('+');
	if (plus <= 0) {
		return undefined;
	}
	return URI.from({ scheme: prefix.slice(0, plus), authority: decodeAuthority(prefix.slice(plus + 1)), path: uri.path, query: uri.query });
}

type WebviewToHostMessage =
	| { type: 'ready'; version: number }
	| { type: 'editState'; editing: boolean; index: number }
	| { type: 'openExternal'; index: number }
	| { type: 'saveBlock'; index: number; html: string; version: number };

class DesignMdPreview extends Disposable {

	private _version = 0;
	private _renderSeq = 0;
	private _ready = false;
	private _editing = false;
	private _pendingRender = false;
	private _extracted: ExtractedDesignDoc | undefined;
	private readonly _scheduler = this._register(new RunOnceScheduler(() => this._render(), 200));
	private readonly _modelListener = this._register(new MutableDisposable<IDisposable>());

	constructor(
		readonly resource: URI,
		readonly input: WebviewInput,
		@IFileService private readonly _fileService: IFileService,
		@IModelService private readonly _modelService: IModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IEditorService private readonly _editorService: IEditorService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// ワークスペース外のファイルは既定のウォッチャーの対象外なので個別に監視する
		if (!this._workspaceContextService.isInsideWorkspace(resource)) {
			this._register(this._fileService.watch(resource));
		}
		this._register(this._fileService.onDidFilesChange(e => {
			if (e.contains(resource)) {
				this._scheduler.schedule();
			}
		}));
		this._attachModel(this._modelService.getModel(resource));
		this._register(this._modelService.onModelAdded(model => {
			if (isEqual(model.uri, resource)) {
				this._attachModel(model);
				this._scheduler.schedule();
			}
		}));
		this._register(this._modelService.onModelRemoved(model => {
			if (isEqual(model.uri, resource)) {
				this._modelListener.clear();
				this._scheduler.schedule();
			}
		}));
		// テーマ (トークン色) が変わったらコード表示を塗り直す
		this._register(TokenizationRegistry.onDidChange(() => this._scheduler.schedule()));

		this._register(input.webview.onDidClickLink(link => this._onDidClickLink(link)));
		this._register(input.webview.onMessage(e => this._onMessage(e.message as WebviewToHostMessage)));
	}

	refresh(): void {
		this._scheduler.schedule();
	}

	renderNow(): Promise<void> {
		this._scheduler.cancel();
		return this._render();
	}

	private _attachModel(model: ITextModel | null): void {
		this._modelListener.value = model ? model.onDidChangeContent(() => this._scheduler.schedule()) : undefined;
	}

	private async _readText(): Promise<string> {
		const model = this._modelService.getModel(this.resource);
		if (model) {
			return model.getValue();
		}
		try {
			return (await this._fileService.readFile(this.resource)).value.toString();
		} catch {
			return `> ${localize('designPreview.notFound', "{0} が見つかりません。", this.resource.fsPath || this.resource.toString())}`;
		}
	}

	private _workspaceFolderOf(resource: URI): URI | undefined {
		return this._workspaceContextService.getWorkspaceFolder(resource)?.uri;
	}

	/** Markdown の相対リンク / 画像を webview から読める URI に解決する */
	private _resolveHref(href: string): string {
		if (!href || href.startsWith('#') || href.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
			return href;
		}
		const hashAt = href.indexOf('#');
		const fragment = hashAt >= 0 ? href.slice(hashAt) : '';
		const pathPart = (hashAt >= 0 ? href.slice(0, hashAt) : href).split('?')[0];
		let decoded = pathPart;
		try { decoded = decodeURIComponent(pathPart); } catch { /* そのまま使う */ }
		const base = decoded.startsWith('/') ? (this._workspaceFolderOf(this.resource) ?? dirname(this.resource)) : dirname(this.resource);
		return asWebviewUri(joinPath(base, decoded)).toString() + fragment;
	}

	private async _render(): Promise<void> {
		if (this._editing) {
			this._pendingRender = true;
			return;
		}
		const seq = ++this._renderSeq;
		try {
			const text = await this._readText();
			const extracted = extractDesignBlocks(text);
			const bodyHtml = await renderMarkdownDocument(extracted.markdown, this._extensionService, this._languageService, {
				shouldSanitize: true,
				markedExtensions: [{
					walkTokens: (token: marked.Token) => {
						if (token.type === 'link' || token.type === 'image') {
							const t = token as marked.Tokens.Link | marked.Tokens.Image;
							t.href = this._resolveHref(t.href);
						}
					}
				}],
			});
			await this._extensionService.whenInstalledExtensionsRegistered();
			const blocks: PreviewBlockData[] = await Promise.all(extracted.htmlBlocks.map(async b => ({
				index: b.index,
				title: b.title,
				srcdoc: buildBlockDocument(b.code, extracted.cssBlocks),
				codeHtml: await tokenizeToString(this._languageService, b.code, 'html'),
				isFullDocument: b.isFullDocument,
				hasDoctype: b.hasDoctype,
			})));
			if (seq !== this._renderSeq || this._store.isDisposed) {
				return;
			}
			if (this._editing) {
				this._pendingRender = true;
				return;
			}
			this._extracted = extracted;
			this._version++;
			if (this._ready) {
				await this.input.webview.postMessage({ type: 'update', version: this._version, bodyHtml, blocks });
			} else {
				this.input.webview.setHtml(this._buildPage(bodyHtml, blocks));
			}
		} catch (e) {
			this._logService.error('[DesignMdPreview] render failed', e);
		}
	}

	private _buildPage(bodyHtml: string, blocks: PreviewBlockData[]): string {
		const colorMap = TokenizationRegistry.getColorMap();
		const tokenCss = colorMap ? generateTokensCSSForColorMap(colorMap) : '';
		return buildPreviewPage({
			title: basename(this.resource),
			version: this._version,
			bodyHtml,
			blocks,
			cspSource: webviewGenericCspSource,
			baseHref: asWebviewUri(dirname(this.resource)).toString(true) + '/',
			extraCss: DEFAULT_MARKDOWN_STYLES + EXTRA_MARKDOWN_CSS + tokenCss,
			labels: previewLabels(),
		});
	}

	private _onMessage(message: WebviewToHostMessage): void {
		if (!message || typeof message !== 'object') {
			return;
		}
		switch (message.type) {
			case 'ready':
				this._ready = true;
				// webview が作り直された (古い HTML で復元された) 場合や編集中にリロードされた場合
				this._editing = false;
				if (message.version !== this._version || this._pendingRender) {
					this._pendingRender = false;
					this._scheduler.schedule(0);
				}
				break;
			case 'editState':
				this._editing = !!message.editing;
				if (!this._editing && this._pendingRender) {
					this._pendingRender = false;
					this._scheduler.schedule(0);
				}
				break;
			case 'openExternal':
				this._openBlockExternally(Number(message.index));
				break;
			case 'saveBlock':
				this._saveBlock(Number(message.index), String(message.html ?? ''));
				break;
		}
	}

	private async _saveBlock(index: number, html: string): Promise<void> {
		const reply = (ok: boolean, error?: string) => this.input.webview.postMessage({ type: 'saveResult', ok, error });
		const noBlock = localize('designPreview.save.noBlock', "保存先のブロックが見つかりません。");
		const original = this._extracted?.htmlBlocks[index]?.code;
		if (original === undefined) {
			reply(false, noBlock);
			return;
		}
		try {
			const model = this._modelService.getModel(this.resource);
			const current = model ? model.getValue() : (await this._fileService.readFile(this.resource)).value.toString();
			if (getHtmlBlockCode(current, index) !== original) {
				reply(false, localize('designPreview.save.conflict', "編集中に DESIGN.md が変更されたため保存できませんでした。キャンセルして最新の内容から編集し直してください。"));
				return;
			}
			const next = replaceHtmlBlock(current, index, cleanEditedHtml(html));
			if (next === undefined) {
				reply(false, noBlock);
				return;
			}
			if (model && this._textFileService.isDirty(this.resource)) {
				// エディタ側に未保存の変更がある場合はディスクへ書かずにモデルへ反映する (保存はユーザーに任せる)
				model.pushEditOperations([], [{ range: model.getFullModelRange(), text: next }], () => null);
			} else {
				await this._fileService.writeFile(this.resource, VSBuffer.fromString(next));
			}
			this._editing = false;
			this._pendingRender = false;
			await reply(true);
			await this.renderNow();
		} catch (e) {
			this._logService.error('[DesignMdPreview] save failed', e);
			reply(false, localize('designPreview.save.failed', "保存に失敗しました: {0}", e instanceof Error ? e.message : String(e)));
		}
	}

	private async _openBlockExternally(index: number): Promise<void> {
		const extracted = this._extracted;
		const block = extracted?.htmlBlocks[index];
		if (!extracted || !block) {
			return;
		}
		try {
			const baseHref = this.resource.scheme === Schemas.file ? dirname(this.resource).toString() + '/' : undefined;
			const doc = buildBlockDocument(block.code, extracted.cssBlocks, { autosize: false, csp: false, baseHref });
			const tmpDir = (this._environmentService as Partial<INativeEnvironmentService>).tmpDir;
			const dir = tmpDir ? joinPath(tmpDir, 'orchestra-design-preview') : joinPath(this._environmentService.cacheHome, 'orchestra-design-preview');
			const stem = basename(this.resource).replace(/\.[^.]+$/, '') || 'design';
			const file = joinPath(dir, `${stem}-block-${index + 1}.html`);
			await this._fileService.writeFile(file, VSBuffer.fromString(doc));
			await this._openerService.open(file, { openExternal: true });
		} catch (e) {
			this._notificationService.error(localize('designPreview.openExternal.failed', "HTML ブロックを外部ブラウザで開けませんでした: {0}", e instanceof Error ? e.message : String(e)));
		}
	}

	private _onDidClickLink(link: string): void {
		let uri: URI;
		try { uri = URI.parse(link); } catch { return; }
		const local = fromWebviewUri(uri);
		if (local) {
			this._editorService.openEditor({ resource: local });
			return;
		}
		if (uri.scheme === Schemas.http || uri.scheme === Schemas.https || uri.scheme === Schemas.mailto) {
			this._openerService.open(uri);
		}
	}
}

class DesignMdPreviewService extends Disposable implements IDesignMdPreviewService {
	declare readonly _serviceBrand: undefined;

	private readonly _previews = new Map<string, DesignMdPreview>();

	constructor(
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	isOpen(resource: URI): boolean {
		return this._previews.has(resource.toString());
	}

	async open(resource: URI, options?: IDesignMdPreviewOpenOptions): Promise<void> {
		const key = resource.toString();
		const existing = this._previews.get(key);
		if (existing) {
			this._webviewWorkbenchService.revealWebview(existing.input, existing.input.group ?? ACTIVE_GROUP, !!options?.preserveFocus);
			existing.refresh();
			return;
		}

		const title = localize('designPreview.title', "プレビュー {0}", basename(resource));
		const roots = [dirname(resource), ...this._workspaceContextService.getWorkspace().folders.map(f => f.uri)];
		const input = this._webviewWorkbenchService.openWebview(
			{
				title,
				options: {
					enableFindWidget: true,
					retainContextWhenHidden: true,
				},
				contentOptions: {
					allowScripts: true,
					localResourceRoots: roots,
				},
				extension: undefined,
			},
			DESIGN_MD_PREVIEW_VIEW_TYPE,
			title,
			{ group: options?.toSide ? SIDE_GROUP : ACTIVE_GROUP, preserveFocus: !!options?.preserveFocus },
		);

		const preview = this._instantiationService.createInstance(DesignMdPreview, resource, input);
		this._previews.set(key, preview);
		const store = new DisposableStore();
		store.add(input.onWillDispose(() => {
			this._previews.delete(key);
			preview.dispose();
			store.dispose();
		}));
		await preview.renderNow();
	}

	override dispose(): void {
		for (const p of this._previews.values()) {
			p.dispose();
		}
		this._previews.clear();
		super.dispose();
	}
}

registerSingleton(IDesignMdPreviewService, DesignMdPreviewService, InstantiationType.Delayed);

// ---------------------------------------------------------------------------
// コマンド「Markdown + HTML プレビュー」
// ---------------------------------------------------------------------------

function isMarkdownUri(uri: URI | undefined): uri is URI {
	if (!uri) {
		return false;
	}
	const ext = extname(uri).toLowerCase();
	return ext === '.md' || ext === '.markdown';
}

/** コマンド引数 (URI / URI 文字列 / 絶対パス) を URI にする */
function toUri(arg: unknown, workspaceContextService: IWorkspaceContextService): URI | undefined {
	if (URI.isUri(arg)) {
		return arg;
	}
	if (typeof arg === 'string' && arg.trim()) {
		const s = arg.trim();
		if (/^[a-z][a-z0-9+.-]+:\/\//i.test(s)) {
			return URI.parse(s);
		}
		const folder = workspaceContextService.getWorkspace().folders[0]?.uri;
		if (folder && folder.scheme !== Schemas.file) {
			return folder.with({ path: s.replace(/\\/g, '/') });
		}
		return URI.file(s);
	}
	return undefined;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: DESIGN_MD_PREVIEW_COMMAND_ID,
			title: localize2('designPreview.command', "Markdown + HTML プレビュー"),
			icon: Codicon.openPreview,
			f1: true,
			menu: [{
				id: MenuId.EditorTitle,
				when: ContextKeyExpr.or(
					ContextKeyExpr.equals('resourceLangId', 'markdown'),
					ContextKeyExpr.regex('resourceExtname', /^\.(md|markdown)$/i),
				),
				group: 'navigation',
				order: -5,
			}],
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyV,
				weight: KeybindingWeight.WorkbenchContrib,
			},
		});
	}

	async run(accessor: ServicesAccessor, arg?: unknown): Promise<void> {
		const previewService = accessor.get(IDesignMdPreviewService);
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);
		const modelService = accessor.get(IModelService);
		const notificationService = accessor.get(INotificationService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);

		const activeUri = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
		const activeIsMarkdown = !!activeUri && (isMarkdownUri(activeUri) || modelService.getModel(activeUri)?.getLanguageId() === 'markdown');

		let target = toUri(arg, workspaceContextService);
		if (!target && activeIsMarkdown) {
			target = activeUri;
		}
		if (!target) {
			const folder = workspaceContextService.getWorkspace().folders[0];
			if (!folder) {
				notificationService.warn(localize('designPreview.noWorkspace', "プレビューする Markdown ファイルがありません。Markdown ファイルを開くか、ワークスペースを開いてください。"));
				return;
			}
			target = joinPath(folder.uri, DIVISION_DIR, DESIGN_MD_FILE);
		}

		if (!modelService.getModel(target) && !(await fileService.exists(target))) {
			notificationService.warn(localize('designPreview.missing', "{0} が見つかりません。", target.fsPath || target.toString()));
			return;
		}

		// エディタタイトルのボタン (= 表示中のファイル) から開いたときは横に並べる
		const toSide = !!activeUri && isEqual(activeUri, target);
		await previewService.open(target, { toSide });
	}
});

// ---------------------------------------------------------------------------
// .division/DESIGN.md の作成・更新を通知
// ---------------------------------------------------------------------------

class DesignMdWatcherContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestraDesignMdWatcher';

	private readonly _burst = this._register(new RunOnceScheduler(() => this._flush(), 1500));
	private _changed = new Map<string, { uri: URI; added: boolean }>();
	private _lastUserSave = new Map<string, number>();
	private _notification: INotificationHandle | undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ITextFileService textFileService: ITextFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IDesignMdPreviewService private readonly _previewService: IDesignMdPreviewService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();
		this._register(this._fileService.onDidFilesChange(e => {
			for (const uri of this._designUris()) {
				const added = e.contains(uri, FileChangeType.ADDED) || e.contains(dirname(uri), FileChangeType.ADDED);
				if (added || e.contains(uri, FileChangeType.UPDATED)) {
					const key = uri.toString();
					const prev = this._changed.get(key);
					this._changed.set(key, { uri, added: added || !!prev?.added });
					this._burst.schedule(); // 書き込みが続く間は延長し、落ち着いたら 1 回だけ通知
				}
			}
		}));
		// ユーザーがエディタで保存しただけなら通知しない
		this._register(textFileService.files.onDidSave(e => {
			this._lastUserSave.set(e.model.resource.toString(), Date.now());
		}));
	}

	private _designUris(): URI[] {
		return this._workspaceContextService.getWorkspace().folders.map(f => joinPath(f.uri, DIVISION_DIR, DESIGN_MD_FILE));
	}

	private async _flush(): Promise<void> {
		const changed = [...this._changed.values()];
		this._changed = new Map();
		for (const { uri, added } of changed) {
			const key = uri.toString();
			if (Date.now() - (this._lastUserSave.get(key) ?? 0) < 4000) {
				continue;
			}
			// プレビューが開いていればプレビュー自身が更新されるので通知しない
			if (this._previewService.isOpen(uri)) {
				continue;
			}
			if (!(await this._fileService.exists(uri))) {
				continue;
			}
			if (this._notification) {
				continue; // 前の通知がまだ出ている
			}
			const message = added
				? localize('designPreview.notify.created', "デザイン仕様 (DESIGN.md) を作成しました")
				: localize('designPreview.notify.updated', "デザイン仕様 (DESIGN.md) を更新しました");
			const handle = this._notificationService.prompt(Severity.Info, message, [
				{ label: localize('designPreview.notify.preview', "プレビュー"), run: () => { this._previewService.open(uri); } },
				{ label: localize('designPreview.notify.open', "開く"), run: () => { this._editorService.openEditor({ resource: uri }); } },
			]);
			this._notification = handle;
			const listener = handle.onDidClose(() => {
				listener.dispose();
				if (this._notification === handle) {
					this._notification = undefined;
				}
			});
		}
	}
}

registerWorkbenchContribution2(DesignMdWatcherContribution.ID, DesignMdWatcherContribution, WorkbenchPhase.Eventually);
