/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

// デザインのページ (.division/design/*.html) の一覧と新規作成。
// 規約は Orchestra 本体の src/vs/workbench/contrib/void/common/designPages.ts と同じ:
// 1 画面 = 1 ファイル、index.html が先頭 (デザインシステム + 画面一覧)。

import * as vscode from 'vscode';
import * as path from 'path';
import { parseHtml } from './htmlPatchService';

/** 新しいデザインフォルダのページと、以前の単一ファイル */
export const DESIGN_GLOB = '**/.division/{design/*.html,DESIGN.html}';
export const INDEX_PAGE = 'index.html';

export function isPageFolder(uri: vscode.Uri): boolean {
	return path.basename(path.dirname(uri.fsPath)) === 'design' && path.basename(path.dirname(path.dirname(uri.fsPath))) === '.division';
}

export function sortPageUris(uris: vscode.Uri[]): vscode.Uri[] {
	const rank = (u: vscode.Uri) => (path.basename(u.fsPath) === INDEX_PAGE ? 0 : path.basename(u.fsPath) === 'DESIGN.html' ? 2 : 1);
	return [...new Map(uris.map(u => [u.toString(), u])).values()]
		.sort((a, b) => rank(a) - rank(b) || a.fsPath.localeCompare(b.fsPath));
}

/** 同じフォルダのページ (index.html が先頭)。単一ファイルの DESIGN.html ならそれだけ */
export async function listSiblingPages(page: vscode.Uri): Promise<vscode.Uri[]> {
	if (!isPageFolder(page)) { return [page]; }
	const dir = vscode.Uri.file(path.dirname(page.fsPath));
	try {
		const entries = await vscode.workspace.fs.readDirectory(dir);
		return sortPageUris(entries
			.filter(([name, type]) => type === vscode.FileType.File && /\.html?$/i.test(name))
			.map(([name]) => vscode.Uri.joinPath(dir, name)));
	} catch {
		return [page];
	}
}

/** ページ名として使える名前 (英小文字・数字・ハイフン) */
export function toPageName(raw: string): string | undefined {
	const name = raw.trim().replace(/\.html?$/i, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
	return name ? `${name}.html` : undefined;
}

/**
 * 新しいページを作る。from (今のページ) の <head> (トークン・<style>) を引き継ぎ、本文は空にする。
 * 作ったファイルの Uri を返す (キャンセルなら undefined)。
 */
export async function createDesignPage(from: vscode.Uri | undefined, workspaceRoot: vscode.Uri | undefined): Promise<vscode.Uri | undefined> {
	const dir = from && isPageFolder(from)
		? vscode.Uri.file(path.dirname(from.fsPath))
		: workspaceRoot ? vscode.Uri.joinPath(workspaceRoot, '.division', 'design') : undefined;
	if (!dir) { return undefined; }
	const existing = new Set((await vscode.workspace.fs.readDirectory(dir).then(e => e.map(([n]) => n), () => [] as string[])));

	const raw = await vscode.window.showInputBox({
		title: 'Orchestra Design: 新しいページ',
		prompt: '.division/design/ に作る画面のファイル名 (英小文字・数字・ハイフン)',
		placeHolder: 'login',
		validateInput: v => {
			const name = toPageName(v);
			if (!name) { return '英小文字・数字・ハイフンで入力してください。'; }
			return existing.has(name) ? `${name} は既にあります。` : undefined;
		},
	});
	const name = raw === undefined ? undefined : toPageName(raw);
	if (!name) { return undefined; }

	let head = '<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>';
	let lang = 'ja';
	if (from) {
		try {
			const text = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(from));
			const doc = parseHtml(text);
			const h = doc.nodes.find(n => n.tag === 'head');
			if (h) { head = text.slice(h.start, h.end); }
			lang = doc.nodes.find(n => n.tag === 'html')?.attrs.find(a => a.name.toLowerCase() === 'lang')?.value ?? lang;
		} catch { /* 既定の <head> */ }
	}
	const title = name.replace(/\.html$/, '');
	head = /<title\b[^>]*>[\s\S]*?<\/title>/i.test(head)
		? head.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
		: head.replace(/<\/head>/i, `<title>${title}</title>\n</head>`);
	const html = `<!DOCTYPE html>\n<html lang="${lang}">\n${head}\n<body>\n<main>\n<h1>${title}</h1>\n</main>\n</body>\n</html>\n`;
	const uri = vscode.Uri.joinPath(dir, name);
	await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(html));
	return uri;
}
