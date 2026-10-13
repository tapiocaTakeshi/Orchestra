/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/*
 * DESIGN.md の「Markdown + HTML プレビュー」で使う純粋関数群 (DOM / サービス非依存)。
 *
 * - ```html / ```css フェンスの検出 (extractDesignBlocks / scanFences)
 * - ```html ブロックを iframe 用の完全な HTML 文書に包む (buildBlockDocument)
 * - プレビュー webview のページ HTML とスクリプト (buildPreviewPage)
 * - 編集した HTML を DESIGN.md の該当ブロックへ書き戻す (cleanEditedHtml / replaceHtmlBlock)
 *
 * node から単体テストできるよう、import は一切持たない。
 */

export interface DesignFence {
	/** フェンス info string の先頭語 (小文字)。```html → 'html' */
	readonly lang: string;
	/** 開始フェンス行のインデント */
	readonly indent: string;
	readonly fenceChar: '`' | '~';
	readonly fenceLength: number;
	/** 開始フェンスの行番号 (0 始まり) */
	readonly openLine: number;
	/** 終了フェンスの行番号。閉じていなければ -1 (文書末まで) */
	readonly closeLine: number;
	/** 中身 (インデントを取り除いたもの) */
	readonly code: string;
}

export interface DesignHtmlBlock {
	/** DESIGN.md 内の ```html ブロックの通し番号 (0 始まり) */
	readonly index: number;
	readonly code: string;
	/** ブロック内の最初のコメント / title / 見出しから取ったラベル */
	readonly title: string | undefined;
	readonly isFullDocument: boolean;
	readonly hasDoctype: boolean;
}

export interface ExtractedDesignDoc {
	/** ```html ブロックをプレースホルダ div に置き換えた Markdown */
	readonly markdown: string;
	readonly htmlBlocks: DesignHtmlBlock[];
	/** 文書中のすべての ```css ブロックの中身 (出現順) */
	readonly cssBlocks: string[];
}

const HTML_LANGS = new Set(['html', 'htm', 'xhtml']);
const CSS_LANGS = new Set(['css']);

export const HTML_BLOCK_PLACEHOLDER_PREFIX = 'orchestra-html-block-';

export function htmlBlockPlaceholderId(index: number): string {
	return HTML_BLOCK_PLACEHOLDER_PREFIX + index;
}

function splitLines(text: string): string[] {
	return text.split(/\r?\n/);
}

function detectEol(text: string): string {
	return /\r\n/.test(text) ? '\r\n' : '\n';
}

/** 行頭からインデント (最大 indent.length 文字の空白) を取り除く */
function stripIndent(line: string, indentWidth: number): string {
	let i = 0;
	while (i < indentWidth && i < line.length && (line[i] === ' ' || line[i] === '\t')) {
		i++;
	}
	return line.slice(i);
}

/**
 * CommonMark のフェンスコードブロックを (ほぼ) 忠実に拾う。
 * リスト内のインデントされたフェンスにも対応する。blockquote 内 (`> ````) は対象外。
 */
export function scanFences(markdown: string): DesignFence[] {
	const lines = splitLines(markdown);
	const fences: DesignFence[] = [];
	const openRe = /^(\s*)(`{3,}|~{3,})(.*)$/;
	let i = 0;
	while (i < lines.length) {
		const m = openRe.exec(lines[i]);
		if (!m) { i++; continue; }
		const indent = m[1];
		const fence = m[2];
		const info = m[3].trim();
		const fenceChar = fence[0] as '`' | '~';
		// バッククォートのフェンスは info string にバッククォートを含められない
		if (fenceChar === '`' && info.includes('`')) { i++; continue; }
		const lang = (info.split(/[\s{:,]+/, 1)[0] || '').toLowerCase();
		const closeRe = new RegExp('^\\s*' + (fenceChar === '`' ? '`' : '~') + '{' + fence.length + ',}\\s*$');
		let j = i + 1;
		while (j < lines.length && !closeRe.test(lines[j])) {
			j++;
		}
		const closed = j < lines.length;
		const body = lines.slice(i + 1, closed ? j : lines.length).map(l => stripIndent(l, indent.length));
		fences.push({
			lang,
			indent,
			fenceChar,
			fenceLength: fence.length,
			openLine: i,
			closeLine: closed ? j : -1,
			code: body.join('\n'),
		});
		i = closed ? j + 1 : lines.length;
	}
	return fences;
}

export function isFullHtmlDocument(code: string): boolean {
	const head = code.replace(/^(\s|<!--[\s\S]*?-->)+/, '').slice(0, 200).toLowerCase();
	return head.startsWith('<!doctype html') || /^<html[\s>]/.test(head) || (/<html[\s>]/i.test(code) && /<\/html>/i.test(code));
}

function hasDoctype(code: string): boolean {
	return /^\s*(<!--[\s\S]*?-->\s*)*<!doctype\s/i.test(code);
}

function decodeBasicEntities(s: string): string {
	return s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&');
}

/** ブロックの表示名: 最初の HTML コメント → <title> → 最初の見出し の順で探す */
export function deriveBlockTitle(code: string): string | undefined {
	const clip = (s: string) => {
		const t = decodeBasicEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
		if (!t) { return undefined; }
		return t.length > 60 ? t.slice(0, 59) + '…' : t;
	};
	const comment = /<!--([\s\S]*?)-->/.exec(code);
	if (comment) {
		const c = clip(comment[1]);
		if (c) { return c; }
	}
	const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(code);
	if (title) {
		const t = clip(title[1]);
		if (t) { return t; }
	}
	const heading = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i.exec(code);
	if (heading) {
		return clip(heading[2]);
	}
	return undefined;
}

/**
 * DESIGN.md から ```html / ```css ブロックを抜き出す。
 * ```html ブロックは `<div id="orchestra-html-block-N" class="orchestra-html-block"></div>` に置き換える
 * (sanitize を通っても id / class は残る)。```css ブロックは Markdown にもそのまま残す。
 */
export function extractDesignBlocks(markdown: string): ExtractedDesignDoc {
	const lines = splitLines(markdown);
	const fences = scanFences(markdown);
	const htmlBlocks: DesignHtmlBlock[] = [];
	const cssBlocks: string[] = [];
	const out: string[] = [];
	let cursor = 0;
	for (const f of fences) {
		if (CSS_LANGS.has(f.lang)) {
			cssBlocks.push(f.code);
			continue;
		}
		if (!HTML_LANGS.has(f.lang)) {
			continue;
		}
		const index = htmlBlocks.length;
		htmlBlocks.push({
			index,
			code: f.code,
			title: deriveBlockTitle(f.code),
			isFullDocument: isFullHtmlDocument(f.code),
			hasDoctype: hasDoctype(f.code),
		});
		out.push(...lines.slice(cursor, f.openLine));
		// 前後に空行を入れて独立した HTML ブロックとして解釈させる (段落に吸収されないように)
		out.push('', `${f.indent}<div id="${htmlBlockPlaceholderId(index)}" class="orchestra-html-block"></div>`, '');
		cursor = f.closeLine === -1 ? lines.length : f.closeLine + 1;
	}
	out.push(...lines.slice(cursor));
	return { markdown: out.join('\n'), htmlBlocks, cssBlocks };
}

// ---------------------------------------------------------------------------
// iframe 文書
// ---------------------------------------------------------------------------

/** iframe 内の CSP (親 webview の CSP も継承されるので、こちらはさらに絞るだけ) */
export const BLOCK_DOCUMENT_CSP = `default-src 'none'; img-src https: data: blob:; media-src https: data: blob:; style-src 'unsafe-inline' https:; font-src https: data:; script-src 'unsafe-inline' https:`;

/** iframe の高さを親へ通知する小さなスクリプト (sandbox="allow-scripts" のときだけ動く) */
export const AUTOSIZE_SCRIPT = `<script data-orchestra-autosize>(function(){var last=-1;function h(){var d=document.documentElement,b=document.body;return Math.ceil(Math.max(d?d.getBoundingClientRect().height:0,b?b.scrollHeight:0));}function post(){var v=h();if(Math.abs(v-last)<2)return;last=v;try{parent.postMessage({type:'orchestra-design-height',height:v},'*');}catch(e){}}function observe(){post();try{var ro=new ResizeObserver(post);ro.observe(document.documentElement);if(document.body)ro.observe(document.body);}catch(e){}try{new MutationObserver(post).observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});}catch(e){}}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',observe);}else{observe();}addEventListener('load',post);addEventListener('resize',post);setTimeout(post,300);setTimeout(post,1500);})();</script>`;

const BASE_SNIPPET_STYLE = `html{color-scheme:light}body{margin:0;padding:16px;background:#ffffff;color:#1f2328;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Noto Sans JP",Roboto,sans-serif;font-size:14px;line-height:1.5}`;

/** `</style` が CSS 中にあっても style 要素を抜け出せないようにする */
function escapeStyleText(css: string): string {
	return css.replace(/<\/(style)/gi, '<\\/$1');
}

export interface BuildBlockDocumentOptions {
	/** 高さ通知スクリプトを入れる (既定 true) */
	readonly autosize?: boolean;
	/** CSP meta を入れる (既定 true) */
	readonly csp?: boolean;
	/** 相対 URL 解決用の <base href> (外部ブラウザで開くときなど) */
	readonly baseHref?: string;
}

/**
 * ```html ブロックの中身を iframe (srcdoc) 用の完全な HTML 文書にする。
 * DESIGN.md の ```css ブロックはスニペット自身のスタイルより前に注入する。
 * 注入したものにはすべて data-orchestra-* 属性を付ける (保存時に cleanEditedHtml が取り除く)。
 */
export function buildBlockDocument(code: string, cssBlocks: readonly string[], options: BuildBlockDocumentOptions = {}): string {
	const parts: string[] = [];
	if (options.csp !== false) {
		parts.push(`<meta http-equiv="Content-Security-Policy" content="${BLOCK_DOCUMENT_CSP}" data-orchestra-csp>`);
	}
	if (options.baseHref) {
		parts.push(`<base href="${escapeAttribute(options.baseHref)}" data-orchestra-base-href>`);
	}
	const css = cssBlocks.map(c => c.trim()).filter(Boolean).join('\n\n');
	const injectedCss = css ? `<style data-orchestra-injected>\n${escapeStyleText(css)}\n</style>` : '';
	const autosize = options.autosize === false ? '' : AUTOSIZE_SCRIPT;

	if (!isFullHtmlDocument(code)) {
		return `<!DOCTYPE html>\n<html><head><meta charset="utf-8" data-orchestra-charset>${parts.join('')}<style data-orchestra-base>${BASE_SNIPPET_STYLE}</style>${injectedCss}${autosize}</head><body>\n${code}\n</body></html>`;
	}

	const inject = parts.join('') + injectedCss + autosize;
	const headOpen = /<head(\s[^>]*)?>/i.exec(code);
	if (headOpen) {
		const at = headOpen.index + headOpen[0].length;
		return code.slice(0, at) + inject + code.slice(at);
	}
	const htmlOpen = /<html(\s[^>]*)?>/i.exec(code);
	if (htmlOpen) {
		const at = htmlOpen.index + htmlOpen[0].length;
		return code.slice(0, at) + `<head>${inject}</head>` + code.slice(at);
	}
	const doctype = /<!doctype[^>]*>/i.exec(code);
	if (doctype) {
		const at = doctype.index + doctype[0].length;
		return code.slice(0, at) + `<head>${inject}</head>` + code.slice(at);
	}
	return `<head>${inject}</head>` + code;
}

export function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// 編集結果の書き戻し
// ---------------------------------------------------------------------------

/**
 * webview の編集モードで直列化した HTML から編集用の痕跡を取り除く。
 * - data-orchestra-* 属性を持つ style / script / meta / base 要素 (注入した :root CSS・CSP・高さ通知・選択枠)
 * - contenteditable / data-orchestra-* 属性
 * - 前後の空行
 */
export function cleanEditedHtml(html: string): string {
	let s = html;
	s = s.replace(/<(style|script)\b[^>]*\bdata-orchestra-[\w-]*[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
	s = s.replace(/<(meta|base)\b[^>]*\bdata-orchestra-[\w-]*[^>]*>/gi, '');
	// 属性の除去 (タグの中だけを対象にする)
	s = s.replace(/<([a-zA-Z][\w:-]*)(\s[^<>]*?)?(\/?)>/g, (whole, tag: string, attrs: string | undefined, selfClose: string) => {
		if (!attrs) { return whole; }
		const cleaned = attrs
			.replace(/\s+contenteditable(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
			.replace(/\s+data-orchestra-[\w-]*(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi, '');
		return `<${tag}${cleaned}${selfClose}>`;
	});
	return s.replace(/^\s*\n/, '').replace(/\n\s*$/, '').replace(/^\s+$/, '');
}

/**
 * index 番目の ```html ブロックの中身だけを newHtml に置き換える。フェンス行やそれ以外の行には触れない。
 * ブロックが見つからなければ undefined。
 */
export function replaceHtmlBlock(markdown: string, index: number, newHtml: string): string | undefined {
	const eol = detectEol(markdown);
	const lines = splitLines(markdown);
	const htmlFences = scanFences(markdown).filter(f => HTML_LANGS.has(f.lang));
	const f = htmlFences[index];
	if (!f) {
		return undefined;
	}
	const newLines = splitLines(newHtml).map(l => l.length ? f.indent + l : l);
	// 中身にフェンスと同じかそれ以上の長さの行があると途中で閉じてしまうので、フェンスを延ばす
	let fenceLength = f.fenceLength;
	const runRe = f.fenceChar === '`' ? /^\s*(`{3,})/ : /^\s*(~{3,})/;
	for (const l of newLines) {
		const m = runRe.exec(l);
		if (m && m[1].length >= fenceLength) {
			fenceLength = m[1].length + 1;
		}
	}
	let openLine = lines[f.openLine];
	if (fenceLength !== f.fenceLength) {
		openLine = openLine.replace(f.fenceChar.repeat(f.fenceLength), f.fenceChar.repeat(fenceLength));
	}
	const closeLine = f.indent + f.fenceChar.repeat(fenceLength);
	const before = lines.slice(0, f.openLine);
	const after = f.closeLine === -1 ? [] : lines.slice(f.closeLine + 1);
	const closing = f.closeLine === -1 ? [closeLine] : [fenceLength !== f.fenceLength ? closeLine : lines[f.closeLine]];
	return [...before, openLine, ...newLines, ...closing, ...after].join(eol);
}

/** index 番目の ```html ブロックの現在の中身 (保存前の競合チェック用) */
export function getHtmlBlockCode(markdown: string, index: number): string | undefined {
	return scanFences(markdown).filter(f => HTML_LANGS.has(f.lang))[index]?.code;
}

// ---------------------------------------------------------------------------
// webview ページ
// ---------------------------------------------------------------------------

export interface PreviewBlockData {
	readonly index: number;
	readonly title: string | undefined;
	readonly srcdoc: string;
	/** コード表示用の HTML (シンタックスハイライト済み、またはエスケープ済み) */
	readonly codeHtml: string;
	readonly isFullDocument: boolean;
	readonly hasDoctype: boolean;
}

export interface PreviewLabels {
	readonly htmlPreview: string;
	readonly preview: string;
	readonly code: string;
	readonly both: string;
	readonly openExternal: string;
	readonly edit: string;
	readonly save: string;
	readonly cancel: string;
	readonly undo: string;
	readonly unsaved: string;
	readonly saving: string;
	readonly selectHint: string;
	readonly textColor: string;
	readonly background: string;
	readonly fontSize: string;
	readonly padding: string;
	readonly margin: string;
	readonly borderRadius: string;
	readonly width: string;
	readonly height: string;
	readonly selectParent: string;
	readonly duplicate: string;
	readonly remove: string;
	readonly editingOther: string;
	readonly empty: string;
}

export const DEFAULT_PREVIEW_LABELS: PreviewLabels = {
	htmlPreview: 'HTML プレビュー',
	preview: 'プレビュー',
	code: 'コード',
	both: '両方',
	openExternal: '新しいウィンドウで開く',
	edit: '編集',
	save: '保存',
	cancel: 'キャンセル',
	undo: '元に戻す',
	unsaved: '未保存の変更があります',
	saving: '保存中…',
	selectHint: '要素をクリックして選択・テキストは直接編集できます',
	textColor: '文字色',
	background: '背景',
	fontSize: 'フォントサイズ',
	padding: 'パディング',
	margin: 'マージン',
	borderRadius: '角丸',
	width: '幅',
	height: '高さ',
	selectParent: '親要素',
	duplicate: '複製',
	remove: '削除',
	editingOther: '別のブロックを編集中です',
	empty: 'このファイルは空です',
};

export interface PreviewPageData {
	readonly version: number;
	readonly bodyHtml: string;
	readonly blocks: readonly PreviewBlockData[];
}

export interface BuildPreviewPageOptions extends PreviewPageData {
	readonly title: string;
	/** webview の cspSource (内部 webview なら webviewGenericCspSource) */
	readonly cspSource: string;
	/** 相対リンク解決用 (asWebviewUri(dirname(file)) + '/') */
	readonly baseHref?: string;
	/** DEFAULT_MARKDOWN_STYLES + トークン色 CSS など */
	readonly extraCss?: string;
	readonly labels?: PreviewLabels;
}

/**
 * プレビュー webview の CSP。
 * srcdoc の iframe は親文書の CSP を継承するため、親側でも iframe 内のインライン script / style、
 * https の画像・フォント・スクリプトを許可しておく必要がある (nonce を使うと 'unsafe-inline' が無効になり、
 * スニペット内のスクリプトがすべて止まる)。Markdown 本文は DOMPurify で sanitize 済みなので
 * 親文書に任意のスクリプトが入ることはない。
 */
export function buildPreviewCsp(cspSource: string): string {
	return [
		`default-src 'none'`,
		`img-src ${cspSource} https: data: blob:`,
		`media-src ${cspSource} https: data: blob:`,
		`style-src ${cspSource} 'unsafe-inline' https:`,
		`font-src ${cspSource} https: data:`,
		`script-src 'unsafe-inline' https:`,
		`frame-src 'self' about: data: blob:`,
	].join('; ');
}

/** <script type="application/json"> に安全に埋め込める JSON */
export function jsonForScriptTag(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026');
}

export function buildPreviewPage(options: BuildPreviewPageOptions): string {
	const labels = options.labels ?? DEFAULT_PREVIEW_LABELS;
	const data = { version: options.version, bodyHtml: options.bodyHtml, blocks: options.blocks, labels };
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="${buildPreviewCsp(options.cspSource)}">
	${options.baseHref ? `<base href="${escapeAttribute(options.baseHref)}">` : ''}
	<title>${escapeHtml(options.title)}</title>
	<style>
${options.extraCss ?? ''}
${PREVIEW_PAGE_CSS}
	</style>
</head>
<body>
	<div id="orchestra-design-root"></div>
	<script type="application/json" id="orchestra-design-data">${jsonForScriptTag(data)}</script>
	<script>${PREVIEW_PAGE_SCRIPT}</script>
</body>
</html>`;
}

export const PREVIEW_PAGE_CSS = `
body { max-width: 980px; }
#orchestra-design-root > .odp-empty { opacity: .7; font-style: italic; }
.odp-block {
	margin: 16px 0;
	border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
	border-radius: 8px;
	overflow: hidden;
	background: var(--vscode-editor-background);
}
.odp-header {
	display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
	padding: 6px 8px 6px 12px;
	font-size: 12px; line-height: 18px;
	background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
	border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
}
.odp-label { font-weight: 600; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.odp-seg { display: inline-flex; border: 1px solid var(--vscode-button-secondaryBackground, rgba(128,128,128,.4)); border-radius: 5px; overflow: hidden; }
.odp-seg button, .odp-btn {
	font: inherit; font-size: 12px; cursor: pointer; border: 0; margin: 0;
	padding: 2px 10px; color: var(--vscode-foreground); background: transparent;
}
.odp-seg button + button { border-left: 1px solid var(--vscode-button-secondaryBackground, rgba(128,128,128,.4)); }
.odp-seg button[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.odp-btn { border: 1px solid var(--vscode-button-secondaryBackground, rgba(128,128,128,.4)); border-radius: 5px; }
.odp-btn:hover:not(:disabled), .odp-seg button:hover:not([aria-pressed="true"]):not(:disabled) { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.2)); }
.odp-btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
.odp-btn.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
.odp-btn[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
.odp-btn:disabled, .odp-seg button:disabled { opacity: .45; cursor: default; }
.odp-editbar, .odp-props {
	display: none; align-items: center; gap: 8px; flex-wrap: wrap;
	padding: 6px 12px; font-size: 12px;
	border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
	background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
}
.odp-block.editing .odp-editbar, .odp-block.editing.has-selection .odp-props { display: flex; }
.odp-block.editing { border-color: var(--vscode-focusBorder); box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
.odp-status { flex: 1 1 auto; opacity: .8; }
.odp-status.error { color: var(--vscode-errorForeground); opacity: 1; }
.odp-tag { font-family: var(--vscode-editor-font-family); padding: 1px 6px; border-radius: 4px; background: var(--vscode-textCodeBlock-background); }
.odp-field { display: inline-flex; align-items: center; gap: 4px; }
.odp-field input[type="text"] {
	width: 84px; font: inherit; font-size: 12px; padding: 2px 4px;
	color: var(--vscode-input-foreground); background: var(--vscode-input-background);
	border: 1px solid var(--vscode-input-border, rgba(128,128,128,.4)); border-radius: 3px;
}
.odp-field input[type="color"] { width: 22px; height: 20px; padding: 0; border: 1px solid var(--vscode-input-border, rgba(128,128,128,.4)); border-radius: 3px; background: none; cursor: pointer; }
.odp-body { display: flex; flex-direction: column; }
.odp-preview { background: #ffffff; }
.odp-preview iframe { display: block; width: 100%; border: 0; height: 120px; background: #ffffff; }
.odp-code { display: none; margin: 0; }
.odp-code pre { margin: 0; border-radius: 0; max-height: 640px; background-color: var(--vscode-textCodeBlock-background); }
.odp-block[data-mode="code"] .odp-preview { display: none; }
.odp-block[data-mode="code"] .odp-code { display: block; }
.odp-block[data-mode="both"] .odp-code { display: block; border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
`;

/*
 * webview 内で動くスクリプト。
 * 通常のプレビューは sandbox="allow-scripts" (allow-same-origin なし) の srcdoc iframe。
 * 編集中だけ sandbox="allow-same-origin" (allow-scripts なし) に作り直し、親から contentDocument を直接操作する。
 * 両方を同時に付けることは絶対にしない。
 * (テンプレート文字列に埋め込むため、バッククォートと $ { は使わないこと)
 */
export const PREVIEW_PAGE_SCRIPT = String.raw`
(function () {
	'use strict';
	var vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
	var root = document.getElementById('orchestra-design-root');
	var initial = JSON.parse(document.getElementById('orchestra-design-data').textContent);
	var L = initial.labels;
	var saved = (vscode && vscode.getState()) || {};
	var modes = saved.modes || {};
	var heights = {};
	var blocks = {};
	var version = initial.version;
	var editing = null;
	var MAX_H = 1600, MIN_H = 40;
	var SEL = 'data-orchestra-selected', HOV = 'data-orchestra-hover';

	function post(msg) {
		if (vscode) { vscode.postMessage(msg); }
		else { (window.__orchestraOutbox = window.__orchestraOutbox || []).push(msg); }
	}
	function persist() { if (vscode) { vscode.setState({ modes: modes }); } }
	function h(tag, cls, text) {
		var e = document.createElement(tag);
		if (cls) { e.className = cls; }
		if (text !== undefined) { e.textContent = text; }
		return e;
	}
	function button(text, cls, onClick) {
		var b = h('button', cls, text);
		b.type = 'button';
		b.addEventListener('click', function (ev) { ev.preventDefault(); onClick(ev); });
		return b;
	}
	function clampHeight(v) { return Math.max(MIN_H, Math.min(MAX_H, Math.ceil(v))); }

	function render(data) {
		var y = window.scrollY;
		version = data.version;
		blocks = {};
		root.innerHTML = data.bodyHtml || '';
		if (!root.textContent.trim() && !data.blocks.length) {
			root.appendChild(h('p', 'odp-empty', L.empty));
		}
		data.blocks.forEach(function (b) {
			var ph = document.getElementById('orchestra-html-block-' + b.index);
			if (ph) { mountBlock(ph, b); }
		});
		window.scrollTo(0, y);
	}

	function mountBlock(ph, b) {
		ph.textContent = '';
		ph.className = 'odp-block';
		ph.setAttribute('data-index', String(b.index));
		var ctx = { block: b, el: ph, frame: null };
		blocks[b.index] = ctx;

		var header = h('div', 'odp-header');
		var label = h('span', 'odp-label', L.htmlPreview + ' ' + (b.index + 1) + (b.title ? ' — ' + b.title : ''));
		label.title = label.textContent;
		header.appendChild(label);

		var seg = h('div', 'odp-seg');
		seg.setAttribute('role', 'group');
		ctx.segButtons = {};
		[['preview', L.preview], ['code', L.code], ['both', L.both]].forEach(function (m) {
			var btn = button(m[1], '', function () { setMode(ctx, m[0]); });
			btn.setAttribute('data-mode', m[0]);
			ctx.segButtons[m[0]] = btn;
			seg.appendChild(btn);
		});
		header.appendChild(seg);
		ctx.editButton = button(L.edit, 'odp-btn odp-edit', function () {
			if (editing && editing.ctx === ctx) { return; }
			startEdit(ctx);
		});
		header.appendChild(ctx.editButton);
		header.appendChild(button(L.openExternal, 'odp-btn odp-open', function () { post({ type: 'openExternal', index: b.index }); }));
		ph.appendChild(header);

		// 編集バー
		var editbar = h('div', 'odp-editbar');
		ctx.status = h('span', 'odp-status', L.selectHint);
		ctx.undoButton = button(L.undo, 'odp-btn odp-undo', function () { if (editing) { undo(); } });
		ctx.saveButton = button(L.save, 'odp-btn primary odp-save', function () { if (editing) { save(); } });
		editbar.appendChild(ctx.status);
		editbar.appendChild(ctx.undoButton);
		editbar.appendChild(button(L.cancel, 'odp-btn odp-cancel', function () { if (editing) { cancelEdit(); } }));
		editbar.appendChild(ctx.saveButton);
		ph.appendChild(editbar);

		// プロパティパネル
		var props = h('div', 'odp-props');
		ctx.tag = h('span', 'odp-tag', '');
		props.appendChild(ctx.tag);
		ctx.fields = {};
		[
			['color', L.textColor, true], ['backgroundColor', L.background, true], ['fontSize', L.fontSize],
			['padding', L.padding], ['margin', L.margin], ['borderRadius', L.borderRadius], ['width', L.width], ['height', L.height]
		].forEach(function (f) { props.appendChild(makeField(ctx, f[0], f[1], !!f[2])); });
		props.appendChild(button(L.selectParent, 'odp-btn odp-parent', function () { selectParent(); }));
		props.appendChild(button(L.duplicate, 'odp-btn odp-duplicate', function () { duplicateSelected(); }));
		props.appendChild(button(L.remove, 'odp-btn odp-remove', function () { removeSelected(); }));
		ph.appendChild(props);

		var body = h('div', 'odp-body');
		ctx.previewHost = h('div', 'odp-preview');
		var code = h('div', 'odp-code');
		var pre = h('pre');
		var codeEl = h('code');
		codeEl.innerHTML = b.codeHtml;
		pre.appendChild(codeEl);
		code.appendChild(pre);
		body.appendChild(ctx.previewHost);
		body.appendChild(code);
		ph.appendChild(body);

		applyMode(ctx, modes[b.index] || 'preview');
		createFrame(ctx, false);
		refreshEditButtons();
	}

	function makeField(ctx, prop, labelText, isColor) {
		var wrap = h('label', 'odp-field');
		wrap.appendChild(h('span', '', labelText));
		var text = h('input');
		text.type = 'text';
		text.setAttribute('data-prop', prop);
		var swatch = null;
		if (isColor) {
			swatch = h('input');
			swatch.type = 'color';
			swatch.setAttribute('data-prop', prop);
			var snapped = false;
			swatch.addEventListener('input', function () {
				if (!editing || !editing.selected) { return; }
				if (!snapped) { snapshot(); snapped = true; }
				editing.selected.style[prop] = swatch.value;
				text.value = swatch.value;
				changed();
			});
			swatch.addEventListener('change', function () { snapped = false; });
			wrap.appendChild(swatch);
		}
		text.addEventListener('change', function () {
			if (!editing || !editing.selected) { return; }
			snapshot();
			editing.selected.style[prop] = text.value.trim();
			changed();
			updatePanel();
		});
		text.addEventListener('keydown', function (e) { if (e.key === 'Enter') { text.blur(); } });
		wrap.appendChild(text);
		ctx.fields[prop] = { text: text, swatch: swatch };
		return wrap;
	}

	function setMode(ctx, mode) {
		if (editing && editing.ctx === ctx) { return; }
		modes[ctx.block.index] = mode;
		persist();
		applyMode(ctx, mode);
	}
	function applyMode(ctx, mode) {
		ctx.el.setAttribute('data-mode', mode);
		Object.keys(ctx.segButtons).forEach(function (k) { ctx.segButtons[k].setAttribute('aria-pressed', String(k === mode)); });
	}

	function createFrame(ctx, editMode) {
		var f = document.createElement('iframe');
		// 編集中は allow-same-origin のみ / 通常は allow-scripts のみ。両方は付けない。
		f.setAttribute('sandbox', editMode ? 'allow-same-origin' : 'allow-scripts');
		f.setAttribute('title', ctx.block.title || (L.htmlPreview + ' ' + (ctx.block.index + 1)));
		f.style.height = (heights[ctx.block.index] || 120) + 'px';
		if (editMode) {
			f.addEventListener('load', function () { setupEditing(ctx, f); });
		}
		f.srcdoc = ctx.block.srcdoc;
		ctx.previewHost.textContent = '';
		ctx.previewHost.appendChild(f);
		ctx.frame = f;
	}

	function setHeight(ctx, v) {
		var px = clampHeight(v);
		heights[ctx.block.index] = px;
		if (ctx.frame) { ctx.frame.style.height = px + 'px'; }
	}

	window.addEventListener('message', function (e) {
		var d = e.data;
		if (!d || typeof d !== 'object') { return; }
		if (d.type === 'orchestra-design-height') {
			for (var k in blocks) {
				var ctx = blocks[k];
				if (ctx.frame && ctx.frame.contentWindow === e.source && !(editing && editing.ctx === ctx)) {
					if (typeof d.height === 'number' && isFinite(d.height)) { setHeight(ctx, d.height); }
					return;
				}
			}
			return;
		}
		if (e.source && e.source !== window && e.source !== window.parent) { return; }
		if (d.type === 'update') {
			if (editing) { return; }
			render(d);
		} else if (d.type === 'saveResult') {
			if (!editing) { return; }
			if (d.ok) {
				finishEdit(false);
			} else {
				editing.saving = false;
				setStatus(d.error || 'Error', true);
				refreshEditState();
			}
		}
	});

	// -------------------------------------------------------------- 編集

	function refreshEditButtons() {
		for (var k in blocks) {
			var ctx = blocks[k];
			var mine = editing && editing.ctx === ctx;
			ctx.editButton.disabled = !!editing && !mine;
			ctx.editButton.title = editing && !mine ? L.editingOther : '';
			ctx.editButton.setAttribute('aria-pressed', String(!!mine));
			Object.keys(ctx.segButtons).forEach(function (m) { ctx.segButtons[m].disabled = !!mine; });
		}
	}

	function startEdit(ctx) {
		if (editing) { return; }
		editing = { ctx: ctx, doc: null, selected: null, stack: [], dirty: false, typingSnap: false, saving: false, timer: 0 };
		if ((modes[ctx.block.index] || 'preview') === 'code') { applyMode(ctx, 'preview'); }
		ctx.el.classList.add('editing');
		setStatus(L.selectHint, false);
		createFrame(ctx, true);
		refreshEditButtons();
		refreshEditState();
		post({ type: 'editState', editing: true, index: ctx.block.index });
	}

	function setupEditing(ctx, f) {
		if (!editing || editing.ctx !== ctx || ctx.frame !== f) { return; }
		var doc = f.contentDocument;
		if (!doc || !doc.body) { return; }
		editing.doc = doc;
		var style = doc.createElement('style');
		style.setAttribute('data-orchestra-edit', '');
		style.textContent = '[' + SEL + ']{outline:2px solid #3b82f6 !important;outline-offset:1px !important}' +
			'[' + HOV + ']:not([' + SEL + ']){outline:1px dashed #60a5fa !important;outline-offset:1px !important}' +
			'body{cursor:text}';
		(doc.head || doc.documentElement).appendChild(style);
		doc.body.setAttribute('contenteditable', 'true');

		doc.addEventListener('mouseover', function (e) {
			var t = e.target;
			if (t && t.nodeType === 1 && t !== doc.documentElement) { clearAttr(HOV); t.setAttribute(HOV, ''); }
		});
		doc.addEventListener('mouseleave', function () { clearAttr(HOV); });
		doc.addEventListener('click', function (e) {
			var t = e.target;
			if (t && t.closest && t.closest('a, button, input[type=submit], form')) { e.preventDefault(); }
			if (t && t.nodeType === 1) { select(t === doc.documentElement ? doc.body : t); }
		}, true);
		doc.addEventListener('submit', function (e) { e.preventDefault(); }, true);
		doc.addEventListener('beforeinput', function () {
			if (!editing.typingSnap) { snapshot(); editing.typingSnap = true; }
		});
		doc.addEventListener('input', function () { changed(); });
		doc.addEventListener('keydown', function (e) {
			var mod = e.ctrlKey || e.metaKey;
			if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); }
			else if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && editing.stack.length) { e.preventDefault(); undo(); }
			else if (e.key === 'Escape') { select(null); }
		});
		measure();
		editing.timer = setInterval(measure, 600);
	}

	function measure() {
		if (!editing || !editing.doc) { return; }
		var d = editing.doc;
		var v = Math.max(d.documentElement.getBoundingClientRect().height, d.body ? d.body.scrollHeight : 0);
		setHeight(editing.ctx, v);
	}

	function clearAttr(name) {
		if (!editing || !editing.doc) { return; }
		var list = editing.doc.querySelectorAll('[' + name + ']');
		for (var i = 0; i < list.length; i++) { list[i].removeAttribute(name); }
	}

	function select(elm) {
		if (!editing) { return; }
		clearAttr(SEL);
		editing.selected = elm;
		editing.typingSnap = false;
		if (elm) { elm.setAttribute(SEL, ''); }
		editing.ctx.el.classList.toggle('has-selection', !!elm);
		updatePanel();
	}

	function describe(elm) {
		var s = elm.tagName.toLowerCase();
		if (elm.id) { s += '#' + elm.id; }
		var cls = (elm.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
		if (cls.length) { s += '.' + cls.join('.'); }
		return '<' + s + '>';
	}

	function toHex(c) {
		var m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c || '');
		if (!m) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#000000'; }
		return '#' + [m[1], m[2], m[3]].map(function (n) { var x = (+n).toString(16); return x.length < 2 ? '0' + x : x; }).join('');
	}

	function updatePanel() {
		if (!editing) { return; }
		var ctx = editing.ctx, elm = editing.selected;
		if (!elm) { return; }
		ctx.tag.textContent = describe(elm);
		var cs = editing.doc.defaultView.getComputedStyle(elm);
		Object.keys(ctx.fields).forEach(function (prop) {
			var f = ctx.fields[prop];
			if (document.activeElement !== f.text) { f.text.value = elm.style[prop] || ''; }
			f.text.placeholder = cs[prop] || '';
			if (f.swatch) { f.swatch.value = toHex(cs[prop]); }
		});
		var isBody = elm === editing.doc.body;
		ctx.el.querySelector('.odp-parent').disabled = isBody;
		ctx.el.querySelector('.odp-duplicate').disabled = isBody;
		ctx.el.querySelector('.odp-remove').disabled = isBody;
	}

	function snapshot() {
		if (!editing || !editing.doc) { return; }
		var b = editing.doc.body;
		editing.stack.push({ html: b.innerHTML, style: b.getAttribute('style') });
		if (editing.stack.length > 100) { editing.stack.shift(); }
		refreshEditState();
	}

	function undo() {
		var s = editing.stack.pop();
		if (!s) { return; }
		var b = editing.doc.body;
		b.innerHTML = s.html;
		if (s.style === null) { b.removeAttribute('style'); } else { b.setAttribute('style', s.style); }
		clearAttr(SEL); clearAttr(HOV);
		select(null);
		editing.dirty = true;
		refreshEditState();
		measure();
	}

	function changed() {
		editing.dirty = true;
		refreshEditState();
		measure();
	}

	function selectParent() {
		if (!editing || !editing.selected) { return; }
		var p = editing.selected.parentElement;
		if (p && p !== editing.doc.documentElement) { select(p); }
	}

	function duplicateSelected() {
		if (!editing || !editing.selected || editing.selected === editing.doc.body) { return; }
		snapshot();
		var clone = editing.selected.cloneNode(true);
		clone.removeAttribute(SEL); clone.removeAttribute(HOV);
		// id が重複しないように複製側の id は外す
		clone.removeAttribute('id');
		var withId = clone.querySelectorAll('[id]');
		for (var i = 0; i < withId.length; i++) { withId[i].removeAttribute('id'); }
		editing.selected.parentNode.insertBefore(clone, editing.selected.nextSibling);
		select(clone);
		changed();
	}

	function removeSelected() {
		if (!editing || !editing.selected || editing.selected === editing.doc.body) { return; }
		snapshot();
		editing.selected.remove();
		select(null);
		changed();
	}

	function setStatus(text, isError) {
		if (!editing) { return; }
		editing.ctx.status.textContent = text;
		editing.ctx.status.classList.toggle('error', !!isError);
	}

	function refreshEditState() {
		if (!editing) { return; }
		var ctx = editing.ctx;
		ctx.undoButton.disabled = !editing.stack.length || editing.saving;
		ctx.saveButton.disabled = !editing.dirty || editing.saving;
		if (editing.saving) { setStatus(L.saving, false); }
		else if (editing.dirty && !ctx.status.classList.contains('error')) { setStatus(L.unsaved, false); }
	}

	function serialize() {
		var doc = editing.doc;
		clearAttr(SEL); clearAttr(HOV);
		if (editing.ctx.block.isFullDocument) {
			return (editing.ctx.block.hasDoctype ? '<!DOCTYPE html>\n' : '') + doc.documentElement.outerHTML;
		}
		return doc.body.innerHTML;
	}

	function save() {
		if (!editing || !editing.doc || editing.saving || !editing.dirty) { return; }
		var html = serialize();
		if (editing.selected) { editing.selected.setAttribute(SEL, ''); }
		editing.saving = true;
		editing.ctx.status.classList.remove('error');
		refreshEditState();
		post({ type: 'saveBlock', index: editing.ctx.block.index, html: html, version: version });
	}

	function cancelEdit() { finishEdit(true); }

	function finishEdit(cancelled) {
		var ctx = editing.ctx;
		clearInterval(editing.timer);
		editing = null;
		ctx.el.classList.remove('editing', 'has-selection');
		applyMode(ctx, modes[ctx.block.index] || 'preview');
		createFrame(ctx, false);
		refreshEditButtons();
		post({ type: 'editState', editing: false, index: ctx.block.index, cancelled: cancelled });
	}

	window.__orchestraDesignPreview = {
		render: render,
		get editing() { return editing; }
	};

	render(initial);
	post({ type: 'ready', version: version });
})();
`;
