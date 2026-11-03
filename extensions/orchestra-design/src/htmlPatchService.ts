/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

// .division/DESIGN.html を唯一の保存元として扱うための、ソース位置つき HTML パーサーと差分パッチ。
//
// - パースは寛容 (壊れた HTML でも落ちない)。各要素のソース上の開始/終了位置を保持する。
// - 要素 ID は「ソース中の開始タグの出現順 (0 始まり)」。プレビューには data-od-id として注入し、
//   保存するファイルには一切書き込まない。
// - 編集は該当範囲だけを書き換える最小のテキスト差分 (TextPatch) で返す。既存の CSS / JS・
//   インデント・コメントはそのまま残る。
//
// vscode に依存しない純粋なモジュールなので、node だけで単体テストできる (test/htmlPatchService.test.js)。

export interface HtmlAttr {
	name: string;
	/** 値が無い属性 (例: disabled) は undefined */
	value: string | undefined;
	/** 属性全体 (name="value") の範囲 */
	start: number;
	end: number;
	/** 値の範囲 (引用符を含まない)。値が無いときは end と同じ */
	valueStart: number;
	valueEnd: number;
	quote: '"' | '\'' | '';
}

export interface HtmlNode {
	id: number;
	/** 小文字のタグ名 */
	tag: string;
	/** '<' の位置 */
	start: number;
	/** タグ名の直後 */
	nameEnd: number;
	/** 開始タグの '>' の直後 */
	openEnd: number;
	/** 終了タグ '</' の位置。終了タグが無い (void / 暗黙に閉じた) ときは undefined */
	closeStart: number | undefined;
	/** 要素全体の終端 (終了タグの '>' の直後、または暗黙に閉じた位置) */
	end: number;
	attrs: HtmlAttr[];
	parent: number;
	children: number[];
	selfClosing: boolean;
}

export interface ParsedHtml {
	text: string;
	nodes: HtmlNode[];
	/** 親を持たない要素 */
	roots: number[];
}

export interface TextPatch {
	start: number;
	end: number;
	text: string;
}

const VOID_ELEMENTS = new Set([
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noscript']);
/** <p> を暗黙に閉じるブロック要素 */
const CLOSES_P = new Set([
	'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer',
	'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre',
	'section', 'table', 'ul',
]);

/** ある開始タグが来たとき、スタック上の直近の要素を暗黙に閉じるかどうか */
function impliesClose(open: string, current: string): boolean {
	if (current === 'p' && CLOSES_P.has(open)) { return true; }
	if (open === 'li' && current === 'li') { return true; }
	if ((open === 'dt' || open === 'dd') && (current === 'dt' || current === 'dd')) { return true; }
	if ((open === 'td' || open === 'th') && (current === 'td' || current === 'th')) { return true; }
	if (open === 'tr' && (current === 'tr' || current === 'td' || current === 'th')) { return true; }
	if ((open === 'option' || open === 'optgroup') && current === 'option') { return true; }
	if ((open === 'thead' || open === 'tbody' || open === 'tfoot') && (current === 'thead' || current === 'tbody' || current === 'tfoot' || current === 'tr' || current === 'td' || current === 'th')) { return true; }
	return false;
}

const isNameChar = (c: string) => /[A-Za-z0-9_:.\-]/.test(c);
const isSpace = (c: string) => c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\f';

export function parseHtml(text: string): ParsedHtml {
	const nodes: HtmlNode[] = [];
	const roots: number[] = [];
	const stack: number[] = [];
	const len = text.length;
	let i = 0;

	const closeTop = (at: number) => {
		const id = stack.pop()!;
		nodes[id].end = at;
	};

	while (i < len) {
		const lt = text.indexOf('<', i);
		if (lt < 0) { break; }
		i = lt;

		// コメント
		if (text.startsWith('<!--', i)) {
			const close = text.indexOf('-->', i + 4);
			i = close < 0 ? len : close + 3;
			continue;
		}
		// <!DOCTYPE>, <![CDATA[...]]>, <?xml?>
		if (text[i + 1] === '!' || text[i + 1] === '?') {
			if (text.startsWith('<![CDATA[', i)) {
				const close = text.indexOf(']]>', i);
				i = close < 0 ? len : close + 3;
			} else {
				const gt = text.indexOf('>', i);
				i = gt < 0 ? len : gt + 1;
			}
			continue;
		}
		// 終了タグ
		if (text[i + 1] === '/') {
			let j = i + 2;
			while (j < len && isNameChar(text[j])) { j++; }
			const name = text.slice(i + 2, j).toLowerCase();
			const gt = text.indexOf('>', j);
			const tagEnd = gt < 0 ? len : gt + 1;
			if (name) {
				let k = stack.length - 1;
				while (k >= 0 && nodes[stack[k]].tag !== name) { k--; }
				if (k >= 0) {
					while (stack.length - 1 > k) { closeTop(i); }
					const id = stack.pop()!;
					nodes[id].closeStart = i;
					nodes[id].end = tagEnd;
				}
			}
			i = tagEnd;
			continue;
		}
		// 開始タグ
		if (!/[A-Za-z]/.test(text[i + 1] ?? '')) { i++; continue; }

		let j = i + 1;
		while (j < len && isNameChar(text[j])) { j++; }
		const tag = text.slice(i + 1, j).toLowerCase();
		const nameEnd = j;
		const attrs: HtmlAttr[] = [];
		let selfClosing = false;
		let openEnd = len;

		while (j < len) {
			while (j < len && isSpace(text[j])) { j++; }
			if (j >= len) { break; }
			if (text[j] === '>') { openEnd = j + 1; break; }
			if (text[j] === '/' && text[j + 1] === '>') { selfClosing = true; openEnd = j + 2; break; }
			if (text[j] === '/') { j++; continue; }
			const aStart = j;
			while (j < len && !isSpace(text[j]) && text[j] !== '=' && text[j] !== '>' && !(text[j] === '/' && text[j + 1] === '>')) { j++; }
			const aName = text.slice(aStart, j);
			let k = j;
			while (k < len && isSpace(text[k])) { k++; }
			if (text[k] === '=') {
				k++;
				while (k < len && isSpace(text[k])) { k++; }
				const q = text[k];
				if (q === '"' || q === '\'') {
					const close = text.indexOf(q, k + 1);
					const vEnd = close < 0 ? len : close;
					attrs.push({ name: aName, value: text.slice(k + 1, vEnd), start: aStart, end: Math.min(len, vEnd + 1), valueStart: k + 1, valueEnd: vEnd, quote: q });
					j = Math.min(len, vEnd + 1);
				} else {
					const vStart = k;
					while (k < len && !isSpace(text[k]) && text[k] !== '>') { k++; }
					attrs.push({ name: aName, value: text.slice(vStart, k), start: aStart, end: k, valueStart: vStart, valueEnd: k, quote: '' });
					j = k;
				}
			} else {
				if (aName) { attrs.push({ name: aName, value: undefined, start: aStart, end: j, valueStart: j, valueEnd: j, quote: '' }); }
				if (j === aStart) { j++; }
			}
		}

		while (stack.length && impliesClose(tag, nodes[stack[stack.length - 1]].tag)) { closeTop(i); }

		const id = nodes.length;
		const parent = stack.length ? stack[stack.length - 1] : -1;
		const node: HtmlNode = { id, tag, start: i, nameEnd, openEnd, closeStart: undefined, end: openEnd, attrs, parent, children: [], selfClosing };
		nodes.push(node);
		if (parent >= 0) { nodes[parent].children.push(id); } else { roots.push(id); }

		if (selfClosing || VOID_ELEMENTS.has(tag)) {
			i = openEnd;
			continue;
		}
		if (RAW_TEXT_ELEMENTS.has(tag)) {
			const re = new RegExp(`</${tag}[\\s>/]`, 'ig');
			re.lastIndex = openEnd;
			const m = re.exec(text);
			if (m) {
				const gt = text.indexOf('>', m.index);
				node.closeStart = m.index;
				node.end = gt < 0 ? len : gt + 1;
			} else {
				node.end = len;
			}
			i = node.end;
			continue;
		}
		stack.push(id);
		i = openEnd;
	}
	while (stack.length) { closeTop(len); }
	return { text, nodes, roots };
}

// ---------------------------------------------------------------------------
// エスケープ
// ---------------------------------------------------------------------------

export function escapeText(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–' };

export function decodeEntities(s: string): string {
	return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, body: string) => {
		if (body[0] === '#') {
			const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
		}
		return NAMED_ENTITIES[body.toLowerCase()] ?? m;
	});
}

// ---------------------------------------------------------------------------
// style 属性
// ---------------------------------------------------------------------------

export function parseStyle(style: string): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	let depth = 0;
	let quote = '';
	let cur = '';
	const flush = () => {
		const idx = cur.indexOf(':');
		if (idx > 0) {
			const prop = cur.slice(0, idx).trim().toLowerCase();
			const value = cur.slice(idx + 1).trim();
			if (prop) { out.push([prop, value]); }
		}
		cur = '';
	};
	for (const c of style) {
		if (quote) {
			if (c === quote) { quote = ''; }
		} else if (c === '"' || c === '\'') {
			quote = c;
		} else if (c === '(') {
			depth++;
		} else if (c === ')') {
			depth = Math.max(0, depth - 1);
		} else if (c === ';' && depth === 0) {
			flush();
			continue;
		}
		cur += c;
	}
	flush();
	return out;
}

export function serializeStyle(decls: Array<[string, string]>): string {
	return decls.map(([p, v]) => `${p}: ${v}`).join('; ');
}

/** CSS プロパティ名として安全か (ベンダープレフィックス・カスタムプロパティ可) */
export function isValidCssProperty(prop: string): boolean {
	return /^(--[A-Za-z0-9_-]+|-?[a-z][a-z0-9-]*)$/.test(prop);
}

// ---------------------------------------------------------------------------
// 編集 (最小差分)
// ---------------------------------------------------------------------------

export class HtmlPatchError extends Error { }

function nodeOf(doc: ParsedHtml, id: number): HtmlNode {
	const node = doc.nodes[id];
	if (!node) { throw new HtmlPatchError(`要素 #${id} が見つかりません。プレビューを再読み込みしてください。`); }
	return node;
}

export function getAttr(node: HtmlNode, name: string): HtmlAttr | undefined {
	const lower = name.toLowerCase();
	return node.attrs.find(a => a.name.toLowerCase() === lower);
}

/** 属性を設定 (value === null で削除) */
export function setAttribute(doc: ParsedHtml, id: number, name: string, value: string | null): TextPatch[] {
	if (!/^[A-Za-z_:][A-Za-z0-9_:.\-]*$/.test(name)) { throw new HtmlPatchError(`属性名が不正です: ${name}`); }
	const node = nodeOf(doc, id);
	const attr = getAttr(node, name);
	if (value === null) {
		if (!attr) { return []; }
		// 直前の空白ごと削除
		let s = attr.start;
		while (s > node.nameEnd && isSpace(doc.text[s - 1])) { s--; }
		return [{ start: s, end: attr.end, text: '' }];
	}
	if (attr && attr.quote === '"') {
		return [{ start: attr.valueStart, end: attr.valueEnd, text: escapeAttr(value) }];
	}
	if (attr && attr.quote === '\'' && !value.includes('\'')) {
		return [{ start: attr.valueStart, end: attr.valueEnd, text: value.replace(/&/g, '&amp;') }];
	}
	const rendered = `${attr ? attr.name : name}="${escapeAttr(value)}"`;
	if (attr) { return [{ start: attr.start, end: attr.end, text: rendered }]; }
	return [{ start: node.nameEnd, end: node.nameEnd, text: ` ${rendered}` }];
}

/** インラインスタイルの 1 プロパティを設定 (value が空なら削除) */
export function setStyleProperty(doc: ParsedHtml, id: number, prop: string, value: string): TextPatch[] {
	const p = prop.trim().toLowerCase();
	if (!isValidCssProperty(p)) { throw new HtmlPatchError(`CSS プロパティ名が不正です: ${prop}`); }
	const v = value.trim().replace(/;+\s*$/, '');
	const node = nodeOf(doc, id);
	const attr = getAttr(node, 'style');
	const decls = parseStyle(decodeEntities(attr?.value ?? ''));
	const idx = decls.findIndex(([k]) => k === p);
	if (!v) {
		if (idx < 0) { return []; }
		decls.splice(idx, 1);
	} else if (idx >= 0) {
		decls[idx] = [p, v];
	} else {
		decls.push([p, v]);
	}
	return setAttribute(doc, id, 'style', decls.length ? serializeStyle(decls) : null);
}

/** 子要素を持たない要素の文字列を置き換える (前後の空白・インデントは保つ) */
export function setTextContent(doc: ParsedHtml, id: number, value: string): TextPatch[] {
	const node = nodeOf(doc, id);
	if (node.closeStart === undefined) { throw new HtmlPatchError(`<${node.tag}> は文字を持てません。`); }
	if (node.children.length) { throw new HtmlPatchError('子要素を含む要素の文字は直接編集できません。内側の要素を選択してください。'); }
	if (RAW_TEXT_ELEMENTS.has(node.tag) && node.tag !== 'title' && node.tag !== 'textarea') { throw new HtmlPatchError(`<${node.tag}> の中身はここでは編集できません。`); }
	const inner = doc.text.slice(node.openEnd, node.closeStart);
	const lead = /^\s*/.exec(inner)![0];
	const trail = inner.length > lead.length ? /\s*$/.exec(inner)![0] : '';
	return [{ start: node.openEnd + lead.length, end: node.closeStart - trail.length, text: escapeText(value) }];
}

/** 要素を丸ごと置き換える (AI 編集の適用) */
export function replaceOuterHtml(doc: ParsedHtml, id: number, html: string): TextPatch[] {
	const node = nodeOf(doc, id);
	return [{ start: node.start, end: node.end, text: html }];
}

export function outerHtml(doc: ParsedHtml, id: number): string {
	const node = nodeOf(doc, id);
	return doc.text.slice(node.start, node.end);
}

/** パッチを文字列に適用する (範囲が重ならないこと) */
export function applyPatches(text: string, patches: TextPatch[]): string {
	const sorted = [...patches].sort((a, b) => b.start - a.start);
	let out = text;
	for (const p of sorted) { out = out.slice(0, p.start) + p.text + out.slice(p.end); }
	return out;
}

// ---------------------------------------------------------------------------
// プレビュー用の注入
// ---------------------------------------------------------------------------

export const ID_ATTR = 'data-od-id';

/**
 * 全要素の開始タグに data-od-id を付けた HTML を返す (プレビュー専用。保存はしない)。
 * runScripts が false のときは <script> 要素を取り除き、on* 属性を無効化する。
 */
export function instrumentForPreview(doc: ParsedHtml, options: { runScripts: boolean }): string {
	const patches: TextPatch[] = [];
	for (const node of doc.nodes) {
		if (!options.runScripts && node.tag === 'script') {
			patches.push({ start: node.start, end: node.end, text: '' });
			continue;
		}
		patches.push({ start: node.nameEnd, end: node.nameEnd, text: ` ${ID_ATTR}="${node.id}"` });
		if (!options.runScripts) {
			for (const a of node.attrs) {
				if (/^on/i.test(a.name)) { patches.push({ start: a.start, end: a.start + 2, text: 'data-od-disabled-on' }); }
			}
		}
	}
	// 取り除いた <script> の内側にある要素へのパッチは捨てる
	const removed = patches.filter(p => p.text === '' && p.end > p.start);
	const kept = patches.filter(p => p.text !== '' && !removed.some(r => p.start > r.start && p.start < r.end));
	return applyPatches(doc.text, [...removed, ...kept]);
}

// ---------------------------------------------------------------------------
// Layers / Properties 用の要約
// ---------------------------------------------------------------------------

const HIDDEN_IN_LAYERS = new Set(['script', 'style', 'meta', 'link', 'head', 'title', 'base', 'noscript', 'template']);

export interface LayerNode {
	id: number;
	tag: string;
	label: string;
	children: LayerNode[];
}

export interface ElementInfo {
	id: number;
	tag: string;
	attrs: Record<string, string>;
	inlineStyle: Record<string, string>;
	/** 子要素を持たず文字を直接編集できるときの文字列 */
	text: string | undefined;
	path: Array<{ id: number; tag: string }>;
}

function directText(doc: ParsedHtml, node: HtmlNode): string {
	if (node.closeStart === undefined || RAW_TEXT_ELEMENTS.has(node.tag)) { return ''; }
	let out = '';
	let pos = node.openEnd;
	for (const c of node.children) {
		out += doc.text.slice(pos, doc.nodes[c].start);
		pos = doc.nodes[c].end;
	}
	out += doc.text.slice(pos, node.closeStart);
	return decodeEntities(out.replace(/<!--[\s\S]*?-->/g, '')).replace(/\s+/g, ' ').trim();
}

export function layerLabel(doc: ParsedHtml, node: HtmlNode): string {
	const idAttr = getAttr(node, 'id')?.value;
	const cls = getAttr(node, 'class')?.value?.trim().split(/\s+/)[0];
	let label = node.tag;
	if (idAttr) { label += `#${idAttr}`; } else if (cls) { label += `.${cls}`; }
	const t = directText(doc, node);
	if (t) { label += ` “${t.length > 28 ? t.slice(0, 27) + '…' : t}”`; }
	return label;
}

export function buildLayers(doc: ParsedHtml): LayerNode[] {
	const build = (id: number): LayerNode | undefined => {
		const node = doc.nodes[id];
		if (HIDDEN_IN_LAYERS.has(node.tag)) { return undefined; }
		return {
			id,
			tag: node.tag,
			label: layerLabel(doc, node),
			children: node.children.map(build).filter((n): n is LayerNode => !!n),
		};
	};
	const body = doc.nodes.find(n => n.tag === 'body');
	if (body) { return [build(body.id)!]; }
	const html = doc.nodes.find(n => n.tag === 'html');
	const top = html ? html.children : doc.roots;
	return top.map(build).filter((n): n is LayerNode => !!n);
}

export function elementInfo(doc: ParsedHtml, id: number): ElementInfo | undefined {
	const node = doc.nodes[id];
	if (!node) { return undefined; }
	const attrs: Record<string, string> = {};
	for (const a of node.attrs) { attrs[a.name.toLowerCase()] = decodeEntities(a.value ?? ''); }
	const inlineStyle: Record<string, string> = {};
	for (const [k, v] of parseStyle(attrs['style'] ?? '')) { inlineStyle[k] = v; }
	const editableText = node.closeStart !== undefined && !node.children.length && (!RAW_TEXT_ELEMENTS.has(node.tag) || node.tag === 'title' || node.tag === 'textarea');
	const path: Array<{ id: number; tag: string }> = [];
	for (let p: number = id; p >= 0; p = doc.nodes[p].parent) { path.unshift({ id: p, tag: doc.nodes[p].tag }); }
	return { id, tag: node.tag, attrs, inlineStyle, text: editableText ? directText(doc, node) : undefined, path };
}
