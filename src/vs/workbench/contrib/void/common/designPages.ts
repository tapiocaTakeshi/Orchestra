/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Designer ロールの成果物は .division/design/ フォルダの複数の HTML ファイル (1 画面 = 1 ファイル)。
//
//   .division/design/index.html   ← デザインシステム (トークン・コンポーネント) と各画面へのリンク
//   .division/design/login.html
//   .division/design/dashboard.html
//
// Designer は ```html <ファイル名> のように、コードブロックの開始行にファイル名を付けて画面ごとに出力する。
// ファイル名が無いブロックは 1 つ目を index.html、以降を page-2.html … とする。
// 出力しなかったページは消さずに残す (一部の画面だけ直すことがあるため)。
// 以前の単一ファイル .division/DESIGN.html も読み込みだけは引き続きサポートする。

/** .division の下のフォルダ名 */
export const DESIGN_DIR = 'design';
/** 先頭に置くページ (デザインシステム + 画面一覧) */
export const DESIGN_INDEX_PAGE = 'index.html';
/** 以前の単一ファイル (.division/DESIGN.html) */
export const LEGACY_DESIGN_FILE = 'DESIGN.html';

export type DesignPage = { name: string; html: string };

/** ファイル名を design/ 直下の安全な .html 名にする (パス区切り・.. は使えない) */
export function sanitizeDesignPageName(raw: string): string | null {
	let name = raw.trim().replace(/^["'`]+|["'`]+$/g, '');
	name = name.replace(/^.*[\\/]/, ''); // フォルダ部分は捨てる (design/login.html → login.html)
	name = name.replace(/\.html?$/i, '');
	name = name.normalize('NFKC').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
	return name ? `${name}.html` : null;
}

/** ```html の開始行 (info string) からファイル名を取り出す: "html login.html" / "html:login.html" / 'html title="login.html"' */
function nameFromInfo(info: string): string | null {
	const rest = info.replace(/^html?\b:?/i, '').trim();
	if (!rest) { return null; }
	const attr = /(?:title|file|filename|name|path)\s*=\s*(?:"([^"]+)"|'([^']+)'|(\S+))/i.exec(rest);
	const candidate = attr ? (attr[1] ?? attr[2] ?? attr[3]) : rest.split(/\s+/)[0];
	return /\.html?$/i.test(candidate) || attr ? sanitizeDesignPageName(candidate) : null;
}

/** ブロック直前の行 (例: "### login.html", "**dashboard.html**", "File: design/settings.html") からファイル名を取り出す */
function nameFromPrecedingText(text: string): string | null {
	const lines = text.split('\n').map(l => l.trim()).filter(Boolean).slice(-2).reverse();
	for (const line of lines) {
		const m = /([A-Za-z0-9_\-./\\]+\.html?)\b/.exec(line);
		if (m) { return sanitizeDesignPageName(m[1]); }
	}
	return null;
}

/** HTML 文書の中のコメント <!-- page: login.html --> */
function nameFromComment(html: string): string | null {
	const m = /<!--\s*(?:page|file)\s*:\s*([^\s>]+?\.html?)\s*-->/i.exec(html);
	return m ? sanitizeDesignPageName(m[1]) : null;
}

const wrapPlainText = (content: string): string => {
	const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return `<!DOCTYPE html>\n<html lang="ja">\n<head><meta charset="utf-8"><title>DESIGN</title></head>\n<body><pre style="white-space:pre-wrap;font:14px/1.6 system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem">${escaped}</pre></body>\n</html>\n`;
};

/**
 * Designer の出力を画面ごとのページに分ける。
 * HTML が 1 つも無ければ、文章をそのまま表示する index.html 1 枚にする (ファイルは必ずできる)。
 */
export function splitDesignPages(content: string): DesignPage[] {
	const pages: DesignPage[] = [];
	const used = new Set<string>();
	const add = (name: string | null, html: string) => {
		let n = name ?? (used.has(DESIGN_INDEX_PAGE) || pages.length ? `page-${pages.length + 1}.html` : DESIGN_INDEX_PAGE);
		if (used.has(n)) {
			const base = n.replace(/\.html$/, '');
			let i = 2;
			while (used.has(`${base}-${i}.html`)) { i++; }
			n = `${base}-${i}.html`;
		}
		used.add(n);
		pages.push({ name: n, html: html.trim() + '\n' });
	};

	const fence = /```([^\n`]*)\n([\s\S]*?)\n```/g;
	let m: RegExpExecArray | null;
	let last = 0;
	while ((m = fence.exec(content))) {
		const info = m[1].trim();
		const body = m[2];
		const isHtml = /^html?\b/i.test(info) || (!info && /^\s*<(!doctype|html)/i.test(body));
		if (isHtml && /<[a-z!]/i.test(body)) {
			add(nameFromInfo(info) ?? nameFromComment(body) ?? nameFromPrecedingText(content.slice(last, m.index)), body);
		}
		last = m.index + m[0].length;
	}
	if (pages.length) { return pages; }

	// コードブロックが無い: 素の HTML 文書が並んでいればそれぞれをページにする
	const docs = content.match(/<!DOCTYPE html[\s\S]*?<\/html>/gi);
	if (docs?.length) {
		for (const d of docs) { add(nameFromComment(d), d); }
		return pages;
	}
	return [{ name: DESIGN_INDEX_PAGE, html: wrapPlainText(content) }];
}

/** ページ名の並び順: index.html を先頭に、あとは名前順 */
export function sortDesignPageNames(names: string[]): string[] {
	return [...names].sort((a, b) => (a === DESIGN_INDEX_PAGE ? -1 : b === DESIGN_INDEX_PAGE ? 1 : a.localeCompare(b)));
}
