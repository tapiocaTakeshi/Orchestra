/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

// Orchestra Design: デザイン HTML (.division/design/*.html、以前の .division/DESIGN.html) の Custom Text Editor。
//
// 1 ページ = 1 エディタ。上部のページ切り替えで同じフォルダの別のページを開く。
// 保存元は VS Code の TextDocument (= そのページの HTML ファイルそのもの) だけ。
// - キャンバス・Properties での変更は htmlPatchService の最小差分を WorkspaceEdit で適用する。
//   そのため Undo / Redo / 保存 / 未保存表示は通常のテキストエディタと同じ仕組みで動き、
//   同じファイルをテキストエディタ (Code) で開いていても常に同期する。
// - プレビューは Webview 内の sandbox iframe (allow-scripts のみ、opaque origin) で描画する。
//   デザイン HTML のスクリプトは VS Code API にも拡張機能にも触れられない。
// - AI 編集は差分を提示するだけで、ユーザーが「適用」したときに初めて書き込む。

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
	ParsedHtml, TextPatch, HtmlPatchError, ID_ATTR,
	parseHtml, instrumentForPreview, buildLayers, elementInfo,
	setStyleProperty, setTextContent, setAttribute, replaceOuterHtml, outerHtml, applyPatches,
} from './htmlPatchService';
import { DesignerClient } from './designerClient';
import { createDesignPage, isPageFolder, listSiblingPages } from './designPages';
import { AssetReader, InlineOptions, MAX_DATA_URI_BYTES, inlineStylesheets, linkedStylesheets } from './previewAssets';

export const DESIGN_VIEW_TYPE = 'orchestra.designEditor';

type EditOp =
	| { kind: 'style'; id: number; prop: string; value: string }
	| { kind: 'text'; id: number; text: string }
	| { kind: 'attr'; id: number; name: string; value: string | null };

type WebviewMessage =
	| { type: 'ready' }
	| { type: 'select'; id: number | null }
	| { type: 'edit'; ops: EditOp[] }
	| { type: 'undo' } | { type: 'redo' } | { type: 'save' }
	| { type: 'openCode' }
	| { type: 'openPage'; name: string }
	| { type: 'newPage' }
	| { type: 'setRunScripts'; value: boolean }
	| { type: 'ai'; instruction: string; id: number | null }
	| { type: 'aiCancel' }
	| { type: 'aiApply'; proposalId: number }
	| { type: 'aiDiscard'; proposalId: number };

interface Proposal {
	id: number;
	version: number;
	scope: 'element' | 'document';
	elementId: number | null;
	html: string;
}

export class DesignEditorProvider implements vscode.CustomTextEditorProvider {
	private agentScript: string | undefined;
	private nextProposalId = 1;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly designer: DesignerClient,
	) { }

	public async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
		const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');
		panel.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
		panel.webview.html = this.getShellHtml(panel.webview);
		// タブのアイコン (Orchestra Design のアイコン)
		const tabIcon = vscode.Uri.joinPath(mediaRoot, 'icon-32.png');
		panel.iconPath = { light: tabIcon, dark: tabIcon };

		let parsed: ParsedHtml = parseHtml(document.getText());
		let parsedVersion = document.version;
		let selfEditDepth = 0;
		let proposal: Proposal | undefined;
		let aiCancel: vscode.CancellationTokenSource | undefined;

		const current = (): ParsedHtml => {
			if (parsedVersion !== document.version) {
				parsed = parseHtml(document.getText());
				parsedVersion = document.version;
			}
			return parsed;
		};
		const runScripts = () => previewRunsScripts();
		const post = (msg: unknown) => panel.webview.postMessage(msg);
		const pageNameOf = (u: vscode.Uri) => path.basename(u.fsPath);
		let pages: vscode.Uri[] = [document.uri];

		// 別ファイルの CSS (<link rel="stylesheet">) とその url() の参照先。変わったらプレビューを読み直す
		const assetWatchers = new Map<string, vscode.Disposable>();
		let assetReloadTimer: ReturnType<typeof setTimeout> | undefined;
		const reloadForAssets = () => {
			if (assetReloadTimer) { clearTimeout(assetReloadTimer); }
			assetReloadTimer = setTimeout(() => { assetReloadTimer = undefined; sendDocument(true); }, 150);
		};
		const watchAssets = (files: string[]) => {
			const wanted = new Set(files);
			for (const [file, w] of assetWatchers) {
				if (!wanted.has(file)) { w.dispose(); assetWatchers.delete(file); }
			}
			for (const file of wanted) {
				if (assetWatchers.has(file)) { continue; }
				const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file)));
				assetWatchers.set(file, vscode.Disposable.from(watcher, watcher.onDidChange(reloadForAssets), watcher.onDidCreate(reloadForAssets), watcher.onDidDelete(reloadForAssets)));
			}
		};
		const renderPreview = (doc: ParsedHtml): string => {
			const { html, files } = this.previewHtml(doc, document.uri);
			watchAssets(files);
			return html;
		};
		const sendPages = async () => {
			pages = await listSiblingPages(document.uri);
			post({ type: 'pages', current: pageNameOf(document.uri), pages: pages.map(pageNameOf), folder: isPageFolder(document.uri) });
		};

		const sendDocument = (reload: boolean) => {
			const doc = current();
			post({
				type: 'document',
				reload,
				version: document.version,
				fileName: path.basename(document.uri.fsPath),
				isDirty: document.isDirty,
				source: doc.text,
				html: reload ? renderPreview(doc) : undefined,
				layers: buildLayers(doc),
				tags: doc.nodes.map(n => n.tag),
				runScripts: runScripts(),
			});
		};

		const applyPatches_ = async (patches: TextPatch[]): Promise<boolean> => {
			if (!patches.length) { return true; }
			const edit = new vscode.WorkspaceEdit();
			for (const p of patches) {
				edit.replace(document.uri, new vscode.Range(document.positionAt(p.start), document.positionAt(p.end)), p.text);
			}
			selfEditDepth++;
			try {
				return await vscode.workspace.applyEdit(edit);
			} finally {
				selfEditDepth--;
			}
		};

		const showError = (err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			post({ type: 'error', message });
			if (!(err instanceof HtmlPatchError)) { console.error('[orchestra-design]', err); }
		};

		const disposables: vscode.Disposable[] = [];
		disposables.push(vscode.workspace.onDidChangeTextDocument(e => {
			// 読み込んでいる CSS をテキストエディタで編集中なら、保存前でもプレビューに反映する
			if (e.contentChanges.length && e.document.uri.scheme === 'file' && assetWatchers.has(e.document.uri.fsPath)) { reloadForAssets(); return; }
			if (e.document.uri.toString() !== document.uri.toString() || !e.contentChanges.length) { return; }
			// キャンバスで行った変更はプレビュー上に既に反映済みなので iframe を再読み込みしない
			sendDocument(selfEditDepth === 0);
		}));
		disposables.push(vscode.workspace.onDidSaveTextDocument(d => {
			if (d.uri.toString() === document.uri.toString()) { post({ type: 'saved' }); }
		}));
		disposables.push(vscode.workspace.onDidGrantWorkspaceTrust(() => sendDocument(true)));
		if (isPageFolder(document.uri)) {
			// 同じフォルダにページが増えたり消えたりしたら、ページ切り替えの一覧を更新する
			const pageWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(path.dirname(document.uri.fsPath)), '*.html'), false, true, false);
			disposables.push(pageWatcher, pageWatcher.onDidCreate(() => sendPages()), pageWatcher.onDidDelete(() => sendPages()));
		}
		disposables.push(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('orchestraDesign.preview.runScripts')) { sendDocument(true); }
		}));
		panel.onDidDispose(() => {
			aiCancel?.cancel();
			if (assetReloadTimer) { clearTimeout(assetReloadTimer); }
			assetWatchers.forEach(w => w.dispose());
			disposables.forEach(d => d.dispose());
		});

		panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
			try {
				switch (msg.type) {
					case 'ready':
						sendDocument(true);
						await sendPages();
						return;
					case 'openPage': {
						const target = pages.find(u => pageNameOf(u) === msg.name);
						if (target && target.toString() !== document.uri.toString()) {
							await vscode.commands.executeCommand('vscode.openWith', target, DESIGN_VIEW_TYPE, panel.viewColumn);
						}
						return;
					}
					case 'newPage': {
						const created = await createDesignPage(document.uri, vscode.workspace.getWorkspaceFolder(document.uri)?.uri);
						if (created) { await vscode.commands.executeCommand('vscode.openWith', created, DESIGN_VIEW_TYPE, panel.viewColumn); }
						return;
					}
					case 'select': {
						const info = typeof msg.id === 'number' ? elementInfo(current(), msg.id) : undefined;
						post({ type: 'elementInfo', info: info ?? null });
						return;
					}
					case 'edit': {
						// 同じ属性への複数操作が積み重なるよう、1 操作ずつ現在の文書に対して適用する
						const ops = Array.isArray(msg.ops) ? msg.ops : [];
						for (const op of ops) {
							if (!Number.isInteger(op.id)) { continue; }
							const doc = current();
							const patches = op.kind === 'style' ? setStyleProperty(doc, op.id, String(op.prop), String(op.value ?? ''))
								: op.kind === 'text' ? setTextContent(doc, op.id, String(op.text ?? ''))
									: op.kind === 'attr' ? setAttribute(doc, op.id, String(op.name), op.value === null ? null : String(op.value))
										: [];
							await applyPatches_(patches);
						}
						if (ops[0]) { post({ type: 'elementInfo', info: elementInfo(current(), ops[0].id) ?? null }); }
						return;
					}
					case 'undo':
					case 'redo':
						panel.reveal(undefined, false);
						await vscode.commands.executeCommand(msg.type);
						return;
					case 'save':
						await document.save();
						return;
					case 'openCode':
						await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default', vscode.ViewColumn.Beside);
						return;
					case 'setRunScripts':
						await vscode.workspace.getConfiguration('orchestraDesign').update('preview.runScripts', !!msg.value, vscode.ConfigurationTarget.Global);
						return;
					case 'ai': {
						aiCancel?.cancel();
						const cts = aiCancel = new vscode.CancellationTokenSource();
						const doc = current();
						const version = document.version;
						const elementId = typeof msg.id === 'number' && doc.nodes[msg.id] ? msg.id : null;
						const scope: 'element' | 'document' = elementId === null ? 'document' : 'element';
						const instruction = String(msg.instruction ?? '').trim();
						if (!instruction) { return; }
						post({ type: 'aiStatus', busy: true, message: 'Designer に依頼しています…' });
						try {
							const result = await this.designer.edit({
								instruction,
								scope,
								target: elementId === null ? doc.text : outerHtml(doc, elementId),
								ancestry: elementId === null ? undefined : (elementInfo(doc, elementId)?.path.map(p => p.tag).join(' > ')),
								styles: collectStyles(doc, this.assetOptions(document.uri)),
								guide: await this.readGuide(document.uri),
								page: pageNameOf(document.uri),
								otherPages: pages.map(pageNameOf).filter(n => n !== pageNameOf(document.uri)),
							}, cts.token);
							if (cts.token.isCancellationRequested) { return; }
							if (scope === 'element' && parseHtml(result.html).roots.length !== 1) {
								throw new Error('Designer が選択要素 1 つ分ではない HTML を返しました。指示を具体的にして再実行してください。');
							}
							const before = scope === 'element' ? outerHtml(doc, elementId!) : doc.text;
							const afterDoc = scope === 'element'
								? applyPatches(doc.text, replaceOuterHtml(doc, elementId!, result.html))
								: result.html;
							proposal = { id: this.nextProposalId++, version, scope, elementId, html: result.html };
							post({
								type: 'aiProposal',
								proposalId: proposal.id,
								scope,
								elementId,
								before,
								after: result.html,
								note: result.note,
								model: result.model,
								previewHtml: renderPreview(parseHtml(afterDoc)),
							});
						} catch (err) {
							if (!cts.token.isCancellationRequested) { showError(err); }
						} finally {
							if (aiCancel === cts) { aiCancel = undefined; }
							post({ type: 'aiStatus', busy: false });
						}
						return;
					}
					case 'aiCancel':
						aiCancel?.cancel();
						return;
					case 'aiDiscard':
						if (proposal?.id === msg.proposalId) { proposal = undefined; }
						sendDocument(true);
						return;
					case 'aiApply': {
						const p = proposal;
						if (!p || p.id !== msg.proposalId) { return; }
						proposal = undefined;
						if (p.version !== document.version) {
							throw new HtmlPatchError(`提案の作成後に ${pageNameOf(document.uri)} が変更されました。もう一度 AI に依頼してください。`);
						}
						const doc = current();
						const patches = p.scope === 'element'
							? replaceOuterHtml(doc, p.elementId!, p.html)
							: [{ start: 0, end: doc.text.length, text: p.html }];
						await applyPatches_(patches);
						sendDocument(true);
						post({ type: 'aiApplied', elementId: p.elementId });
						return;
					}
				}
			} catch (err) {
				showError(err);
				if (msg.type === 'edit') { sendDocument(true); }
			}
		});
	}

	/**
	 * プレビュー用 HTML: data-od-id を付け、別ファイルの CSS を埋め込み、選択・ハイライト用のエージェントを先頭に差し込む。
	 * files は埋め込んだファイル (変更監視用)。
	 */
	private previewHtml(doc: ParsedHtml, documentUri: vscode.Uri): { html: string; files: string[] } {
		const inlined = documentUri.scheme === 'file'
			? inlineStylesheets(instrumentForPreview(doc, { runScripts: previewRunsScripts() }), this.assetOptions(documentUri))
			: { html: instrumentForPreview(doc, { runScripts: previewRunsScripts() }), files: [] };
		const html = inlined.html;
		const agent = `<script data-od-agent>${this.getAgentScript().replace(/<\/script/gi, '<\\/script')}</script>`;
		// 再パースして挿入位置 (<head> の直後 → <html> の直後 → DOCTYPE の直後) を決める
		const reparsed = parseHtml(html);
		const head = reparsed.nodes.find(n => n.tag === 'head');
		const root = reparsed.nodes.find(n => n.tag === 'html');
		const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
		const at = head ? head.openEnd : root ? root.openEnd : doctype ? doctype[0].length : 0;
		return { html: html.slice(0, at) + agent + html.slice(at), files: inlined.files };
	}

	/** 別ファイルの CSS を読む設定。読めるのはそのページのワークスペースの中だけ */
	private assetOptions(documentUri: vscode.Uri): InlineOptions {
		const folder = vscode.workspace.getWorkspaceFolder(documentUri);
		const root = folder && folder.uri.scheme === 'file' ? folder.uri.fsPath : path.dirname(documentUri.fsPath);
		return { documentPath: documentUri.fsPath, root, reader: fileAssetReader };
	}

	private getAgentScript(): string {
		if (this.agentScript === undefined) {
			const file = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'agent.js').fsPath;
			this.agentScript = fs.readFileSync(file, 'utf8').replace(/__OD_ID_ATTR__/g, ID_ATTR);
		}
		return this.agentScript;
	}

	/** .division/DESIGN.md (Designer 用ガイド)。ページは .division/design/ にあるので 1 つ上を見る */
	private async readGuide(designUri: vscode.Uri): Promise<string | undefined> {
		const guideUri = isPageFolder(designUri) ? vscode.Uri.joinPath(designUri, '..', '..', 'DESIGN.md') : vscode.Uri.joinPath(designUri, '..', 'DESIGN.md');
		try {
			const bytes = await vscode.workspace.fs.readFile(guideUri);
			return new TextDecoder('utf-8').decode(bytes);
		} catch {
			return undefined;
		}
	}

	private getShellHtml(webview: vscode.Webview): string {
		const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', file));
		// デザイン HTML は sandbox iframe (srcdoc) で描画する。srcdoc は親の CSP を引き継ぐので、
		// nonce を付けると 'unsafe-inline' が無効になりデザイン HTML 自身のインラインスクリプトが
		// 動かなくなる。そのため nonce は使わず、外側の文書には拡張機能のスクリプト以外を置かない
		// (信頼できない HTML を外側に挿入しない。表示は textContent のみ) ことで守る。
		const csp = [
			`default-src 'none'`,
			`img-src ${webview.cspSource} https: http: data: blob:`,
			`media-src ${webview.cspSource} https: data: blob:`,
			`font-src ${webview.cspSource} https: data:`,
			`style-src ${webview.cspSource} 'unsafe-inline' https:`,
			`script-src ${webview.cspSource} 'unsafe-inline' https:`,
			`frame-src ${webview.cspSource} about: data: blob:`,
			`connect-src https:`,
		].join('; ');
		const scripts = ['canvas.js', 'layers.js', 'properties.js', 'aiDesigner.js', 'main.js']
			.map(f => `<script src="${media(f)}"></script>`).join('\n\t');
		return /* html */ `<!DOCTYPE html>
<html lang="ja">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="${csp}">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" href="${media('design.css')}">
	<title>Orchestra Design</title>
</head>
<body>
	<header class="od-toolbar">
		<div class="od-title"><img class="od-logo" src="${media('icon-64.png')}" alt="" width="18" height="18"> Orchestra Design
			<select id="od-pages" class="od-pages" title="ページ (.division/design/ の画面)"></select>
			<button id="od-new-page" class="od-icon" title="新しいページを作る (今のページのトークンと &lt;style&gt; を引き継ぐ)">＋</button>
			<span class="od-file" id="od-file"></span><span class="od-dirty" id="od-dirty" hidden>●</span></div>
		<nav class="od-tabs" role="tablist">
			<button role="tab" data-mode="design" class="active" title="要素を選択して編集">Design</button>
			<button role="tab" data-mode="code" title="このページの HTML をテキストエディタで横に開く">Code</button>
			<button role="tab" data-mode="preview" title="操作できるプレビュー (選択なし)">Preview</button>
		</nav>
		<div class="od-actions">
			<div class="od-devices" role="group" aria-label="表示幅">
				<button data-device="desktop" class="active" title="PC (幅いっぱい)">PC</button>
				<button data-device="tablet" title="タブレット (768px)">Tablet</button>
				<button data-device="mobile" title="スマホ (390px)">Mobile</button>
			</div>
			<button id="od-undo" title="元に戻す (Ctrl+Z)">↶</button>
			<button id="od-redo" title="やり直し (Ctrl+Shift+Z)">↷</button>
			<label class="od-toggle" title="デザイン HTML の &lt;script&gt; をプレビューで実行する"><input type="checkbox" id="od-run-scripts"> JS</label>
			<button id="od-save" class="primary" title="このページの HTML に保存 (Ctrl+S)">保存</button>
		</div>
	</header>
	<main class="od-main">
		<aside class="od-layers" aria-label="Layers">
			<div class="od-panel-title">Layers</div>
			<div id="od-layers-tree" class="od-tree" role="tree"></div>
		</aside>
		<section class="od-canvas-wrap">
			<div id="od-banner" class="od-banner" hidden></div>
			<div id="od-error" class="od-error" hidden></div>
			<div class="od-canvas" id="od-canvas">
				<iframe id="od-frame" title="Design preview" sandbox="allow-scripts"></iframe>
			</div>
			<div class="od-breadcrumb" id="od-breadcrumb"></div>
		</section>
		<aside class="od-side" id="od-side">
			<div class="od-side-resizer" id="od-side-resizer" role="separator" aria-orientation="vertical" title="ドラッグで幅を変更 (ダブルクリックで元の幅)"></div>
			<div class="od-props" id="od-props" aria-label="Properties">
				<div class="od-panel-title">Properties</div>
				<div id="od-props-body" class="od-props-body"><p class="od-muted">キャンバスか Layers で要素を選択してください。<br>ダブルクリックで文字を直接編集できます。</p></div>
			</div>
			<div class="od-split" id="od-split" role="separator" aria-orientation="horizontal" title="ドラッグで Properties と AI Designer の高さを変更 (ダブルクリックで元に戻す)"></div>
			<div class="od-ai" id="od-ai" aria-label="AI Designer">
				<div class="od-panel-title od-ai-title">AI Designer
					<button id="od-ai-expand" class="od-icon" title="AI Designer を右側いっぱいに広げる">⤢</button>
				</div>
				<div class="od-ai-scope" id="od-ai-scope">対象: ページ全体</div>
				<textarea id="od-ai-input" rows="6" placeholder="例: 選択したボタンを丸くして、色をブランドカラーに (Ctrl+Enter で依頼)"></textarea>
				<div class="od-ai-row">
					<span id="od-ai-status" class="od-muted"></span>
					<button id="od-ai-cancel" hidden>中止</button>
					<button id="od-ai-run" class="primary">依頼</button>
				</div>
				<div id="od-ai-proposal" class="od-ai-proposal" hidden>
					<div class="od-ai-note" id="od-ai-note"></div>
					<details open><summary>変更前</summary><pre id="od-ai-before"></pre></details>
					<details open><summary>変更後</summary><pre id="od-ai-after"></pre></details>
					<div class="od-ai-row">
						<button id="od-ai-discard">破棄</button>
						<button id="od-ai-apply" class="primary">適用</button>
					</div>
				</div>
			</div>
		</aside>
	</main>
	${scripts}
</body>
</html>`;
	}
}

/** 信頼されていないワークスペースではデザイン HTML のスクリプトを実行しない */
function previewRunsScripts(): boolean {
	return vscode.workspace.isTrusted && vscode.workspace.getConfiguration('orchestraDesign').get<boolean>('preview.runScripts', true);
}

/** 開いているエディタの (未保存も含む) 内容を優先し、無ければディスクから読む */
const fileAssetReader: AssetReader = {
	readText(absPath) {
		const open = vscode.workspace.textDocuments.find(d => d.uri.scheme === 'file' && d.uri.fsPath === absPath);
		if (open) { return open.getText(); }
		try {
			return fs.statSync(absPath).isFile() ? fs.readFileSync(absPath, 'utf8').replace(/^\uFEFF/, '') : undefined;
		} catch {
			return undefined;
		}
	},
	readBytes(absPath) {
		try {
			const st = fs.statSync(absPath);
			return st.isFile() && st.size <= MAX_DATA_URI_BYTES ? fs.readFileSync(absPath) : undefined;
		} catch {
			return undefined;
		}
	},
};

/** <style> と別ファイルの CSS の中身を集める (AI に見た目の文脈として渡す) */
function collectStyles(doc: ParsedHtml, assets: InlineOptions): string {
	const inline = doc.nodes
		.filter(n => n.tag === 'style' && n.closeStart !== undefined)
		.map(n => doc.text.slice(n.openEnd, n.closeStart));
	const linked = linkedStylesheets(doc, assets)
		.map(s => `/* ${path.relative(path.dirname(assets.documentPath), s.path).split(path.sep).join('/')} */\n${s.css}`);
	return [...linked, ...inline].join('\n');
}
