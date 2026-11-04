/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

// プレビュー用: デザイン HTML が相対パスで参照する別ファイル (CSS・画像・フォント) をプレビューの HTML に埋め込む。
//
// プレビューは sandbox iframe の srcdoc (opaque origin、ベース URL は about:srcdoc) なので、
// 相対パスの <link> も <img src> も CSS の url() も解決できず、HTML だけが表示されていた。
// そこでファイルを拡張機能側で読み、
// - <link rel="stylesheet"> を同じ内容の <style> に置き換える。
// - CSS 内の @import (相対パス) は再帰的に展開する (循環・深さは制限)。
// - CSS (別ファイル・<style>・style 属性) 内の url() の画像・フォントは data: URI に変換する (サイズ上限あり)。
// - <img src> / srcset、<source>、<input type="image">、<video poster>、SVG の <image href> も data: URI に変換する。
// - 読めるのはワークスペース (root) の中のファイルだけ。外を指す / 無いファイルは元の <link> のまま。
// 保存されるのは HTML ファイルそのもので、ここでの変換はプレビューにだけ使う。

import * as path from 'path';
import { ParsedHtml, HtmlAttr, getAttr, decodeEntities, parseHtml, applyPatches, TextPatch } from './htmlPatchService';

export interface AssetReader {
	/** テキストを読む (開いているエディタの未保存の内容を優先してよい)。無ければ undefined */
	readText(absPath: string): string | undefined;
	/** バイナリを読む。無い / 大きすぎるときは undefined */
	readBytes(absPath: string): Uint8Array | undefined;
}

export interface InlineOptions {
	/** HTML ファイルの絶対パス (相対パスの基準) */
	documentPath: string;
	/** 読んでよいフォルダ (ワークスペース)。この外のファイルは読まない */
	root: string;
	reader: AssetReader;
}

export interface InlineResult {
	html: string;
	/** 埋め込んだファイル (CSS と url() の参照先)。変更監視に使う */
	files: string[];
}

const MAX_IMPORT_DEPTH = 8;
export const MAX_DATA_URI_BYTES = 2 * 1024 * 1024;

const MIME: Record<string, string> = {
	'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
	'.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
	'.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject',
	'.css': 'text/css',
};

/** スキームも // も付いていない、ファイルの相対 (またはルート相対) パスか */
export function isLocalRef(ref: string): boolean {
	const r = ref.trim();
	if (!r || r.startsWith('#') || r.startsWith('//')) { return false; }
	return !/^[a-z][a-z0-9+.-]*:/i.test(r);
}

/** 参照を絶対パスにする。root の外を指すときは undefined */
export function resolveRef(ref: string, fromFile: string, root: string): string | undefined {
	let r = ref.trim().replace(/[?#].*$/, '');
	try { r = decodeURIComponent(r); } catch { /* そのまま使う */ }
	if (!r) { return undefined; }
	const abs = r.startsWith('/') ? path.join(root, r) : path.resolve(path.dirname(fromFile), r);
	const rel = path.relative(root, abs);
	if (rel.startsWith('..') || path.isAbsolute(rel)) { return undefined; }
	return abs;
}

/** <link> がスタイルシートを読み込むものか */
function isStylesheetLink(doc: ParsedHtml, id: number): boolean {
	const node = doc.nodes[id];
	if (node.tag !== 'link') { return false; }
	const rel = getAttr(node, 'rel')?.value;
	if (!rel || !rel.toLowerCase().split(/\s+/).includes('stylesheet')) { return false; }
	// rel="alternate stylesheet" は既定では適用されない
	return !rel.toLowerCase().split(/\s+/).includes('alternate');
}

/** HTML が読み込むローカルの CSS ファイル (AI に文脈として渡すときなど) */
export function linkedStylesheets(doc: ParsedHtml, opts: InlineOptions): Array<{ path: string; css: string }> {
	const out: Array<{ path: string; css: string }> = [];
	for (const node of doc.nodes) {
		if (!isStylesheetLink(doc, node.id)) { continue; }
		const href = getAttr(node, 'href')?.value;
		if (href === undefined || !isLocalRef(decodeEntities(href))) { continue; }
		const abs = resolveRef(decodeEntities(href), opts.documentPath, opts.root);
		const css = abs === undefined ? undefined : opts.reader.readText(abs);
		if (abs !== undefined && css !== undefined) { out.push({ path: abs, css }); }
	}
	return out;
}

/** <link rel="stylesheet"> (ローカル) を <style> に置き換えた HTML を返す */
export function inlineStylesheets(html: string, opts: InlineOptions): InlineResult {
	const doc = parseHtml(html);
	const files = new Set<string>();
	const patches: TextPatch[] = [];
	for (const node of doc.nodes) {
		if (!isStylesheetLink(doc, node.id)) { continue; }
		const hrefAttr = getAttr(node, 'href');
		if (hrefAttr?.value === undefined) { continue; }
		const href = decodeEntities(hrefAttr.value);
		if (!isLocalRef(href)) { continue; }
		const abs = resolveRef(href, opts.documentPath, opts.root);
		if (abs === undefined) { continue; }
		const css = expandCss(abs, opts, files, new Set(), 0);
		if (css === undefined) { continue; }
		// <link> の他の属性 (data-od-id, media, id, class など) は <style> に引き継ぐ
		const keep = node.attrs
			.filter(a => !/^(rel|href|type|as|integrity|crossorigin|referrerpolicy|onload|onerror|data-od-disabled-onload|data-od-disabled-onerror)$/i.test(a.name))
			.map(a => html.slice(a.start, a.end))
			.join(' ');
		const open = `<style${keep ? ' ' + keep : ''} data-od-href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;
		patches.push({ start: node.start, end: node.end, text: `${open}\n${escapeStyleText(css)}\n</style>` });
	}
	return { html: patches.length ? applyPatches(html, patches) : html, files: [...files] };
}

/** src などに画像のパスを 1 つ持つ属性 (タグ → 属性) */
const IMAGE_ATTRS: Record<string, string[]> = {
	img: ['src'], source: ['src'], input: ['src'], video: ['poster'], embed: ['src'], object: ['data'],
	image: ['href', 'xlink:href'], feimage: ['href', 'xlink:href'],
};
const SRCSET_TAGS = new Set(['img', 'source']);

/**
 * 画像などの相対パスを data: URI にした HTML を返す。
 * 対象: IMAGE_ATTRS の属性、srcset、style 属性と <style> の中の url() (と <style> 内の @import)。
 * 画像として扱える拡張子 (MIME が分かるもの) で、ワークスペース内にあり、サイズ上限以下のものだけ変換する。
 */
export function inlineImages(html: string, opts: InlineOptions): InlineResult {
	const doc = parseHtml(html);
	const files = new Set<string>();
	const patches: TextPatch[] = [];
	const setAttr = (a: HtmlAttr, value: string) => {
		patches.push({ start: a.start, end: a.end, text: `${a.name}="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"` });
	};
	for (const node of doc.nodes) {
		for (const name of IMAGE_ATTRS[node.tag] ?? []) {
			const a = getAttr(node, name);
			if (a?.value === undefined) { continue; }
			if (node.tag === 'input' && getAttr(node, 'type')?.value?.toLowerCase() !== 'image') { continue; }
			const uri = refToDataUri(decodeEntities(a.value), opts, files);
			if (uri !== undefined) { setAttr(a, uri); }
		}
		if (SRCSET_TAGS.has(node.tag)) {
			const a = getAttr(node, 'srcset');
			if (a?.value !== undefined) {
				const before = decodeEntities(a.value);
				const after = rewriteSrcset(before, opts, files);
				if (after !== before) { setAttr(a, after); }
			}
		}
		const style = getAttr(node, 'style');
		if (style?.value !== undefined && /url\(/i.test(style.value)) {
			const before = decodeEntities(style.value);
			const after = rewriteCss(before, opts.documentPath, opts, files, new Set(), 0);
			if (after !== before) { setAttr(style, after); }
		}
		if (node.tag === 'style' && node.closeStart !== undefined) {
			const before = html.slice(node.openEnd, node.closeStart);
			if (/url\(|@import/i.test(before)) {
				const after = rewriteCss(before, opts.documentPath, opts, files, new Set([opts.documentPath]), 0);
				if (after !== before) { patches.push({ start: node.openEnd, end: node.closeStart, text: escapeStyleText(after) }); }
			}
		}
	}
	return { html: patches.length ? applyPatches(html, patches) : html, files: [...files] };
}

/** 別ファイルの CSS と画像の両方を埋め込む (プレビューで使う) */
export function inlinePreviewAssets(html: string, opts: InlineOptions): InlineResult {
	const css = inlineStylesheets(html, opts);
	const img = inlineImages(css.html, opts);
	return { html: img.html, files: [...new Set([...css.files, ...img.files])] };
}

/** srcset の各候補 (URL 幅/密度) の URL を data: URI にする */
function rewriteSrcset(srcset: string, opts: InlineOptions, files: Set<string>): string {
	return srcset.split(',').map(candidate => {
		const m = /^(\s*)(\S+)(.*)$/s.exec(candidate);
		if (!m) { return candidate; }
		const uri = refToDataUri(m[2], opts, files);
		return uri === undefined ? candidate : `${m[1]}${uri}${m[3]}`;
	}).join(',');
}

function refToDataUri(ref: string, opts: InlineOptions, files: Set<string>, fromFile = opts.documentPath): string | undefined {
	if (!isLocalRef(ref)) { return undefined; }
	const abs = resolveRef(ref, fromFile, opts.root);
	const uri = abs === undefined ? undefined : toDataUri(abs, opts.reader);
	if (uri === undefined) { return undefined; }
	files.add(abs!);
	return uri + (/#.*$/.exec(ref.trim())?.[0] ?? '');
}

/** <style> の中で終了タグとして解釈されないようにする */
function escapeStyleText(css: string): string {
	return css.replace(/<\/(style)/gi, '<\\/$1');
}

/** CSS を読み、@import の展開と url() の data: 化をした文字列を返す */
function expandCss(file: string, opts: InlineOptions, files: Set<string>, stack: Set<string>, depth: number): string | undefined {
	if (stack.has(file) || depth > MAX_IMPORT_DEPTH) { return ''; }
	const css = opts.reader.readText(file);
	if (css === undefined) { return undefined; }
	files.add(file);
	stack.add(file);
	try {
		return rewriteCss(css, file, opts, files, stack, depth);
	} finally {
		stack.delete(file);
	}
}

// コメントと文字列を飛ばしながら @import と url() を書き換える
const CSS_TOKEN = /\/\*[\s\S]*?\*\/|@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|"([^"]*)"|'([^']*)')([^;]*);|url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]*))\s*\)|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/gi;

function rewriteCss(css: string, file: string, opts: InlineOptions, files: Set<string>, stack: Set<string>, depth: number): string {
	return css.replace(CSS_TOKEN, (m, i1, i2, i3, i4, i5, importRest: string | undefined, u1, u2, u3) => {
		if (m.startsWith('/*') || m.startsWith('"') || m.startsWith('\'')) { return m; }
		if (/^@import/i.test(m)) {
			const ref: string = i1 ?? i2 ?? i3 ?? i4 ?? i5 ?? '';
			if (!isLocalRef(ref)) { return m; }
			const abs = resolveRef(ref, file, opts.root);
			const inner = abs === undefined ? undefined : expandCss(abs, opts, files, stack, depth + 1);
			if (inner === undefined) { return m; }
			const media = (importRest ?? '').trim();
			// @import 自体は先頭にしか書けないが、展開後の中身はそのまま置いてよい
			return media ? `@media ${media} {\n${inner}\n}` : inner;
		}
		const uri = refToDataUri(u1 ?? u2 ?? u3 ?? '', opts, files, file);
		// data: URI (base64) は空白・引用符・括弧を含まないので引用符なしで書ける (style 属性の中でも安全)
		return uri === undefined ? m : `url(${uri})`;
	});
}

function toDataUri(file: string, reader: AssetReader): string | undefined {
	const mime = MIME[path.extname(file).toLowerCase()];
	if (!mime) { return undefined; }
	const bytes = reader.readBytes(file);
	if (!bytes || bytes.byteLength > MAX_DATA_URI_BYTES) { return undefined; }
	return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}
