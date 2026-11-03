/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// browser_use: Playwright で実際のブラウザ (Chromium) を操作するエージェント用ツール。
//
// ブラウザは main プロセス (electron-main/browserUseMainService.ts) で動かし、レンダラーの
// ツール (browser/toolsService.ts) からは IPC チャンネル越しに 1 操作ずつ呼ぶ。
// モデルにはページの「スナップショット」(操作できる要素に [番号] を振った一覧 + 本文) を返し、
// モデルはその番号 (ref) を指定して click / type などを行う。

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const BROWSER_USE_CHANNEL_NAME = 'void-channel-browserUse';

export const browserUseActions = [
	'navigate', 'snapshot', 'click', 'type', 'select', 'press', 'scroll', 'back', 'forward', 'wait', 'close',
] as const;
export type BrowserUseActionName = typeof browserUseActions[number];

export type BrowserUseAction = {
	action: BrowserUseActionName;
	/** navigate */
	url?: string;
	/** click / type / select: スナップショットの [番号] */
	ref?: number;
	/** type: 入力する文字 / select: 選ぶ option の value かラベル */
	text?: string;
	/** type: 入力後に Enter を押す */
	submit?: boolean;
	/** press: キー (例: Enter, Escape, ArrowDown, Control+A) */
	key?: string;
	/** scroll */
	direction?: 'up' | 'down';
	/** wait: ミリ秒 (上限 10 秒) */
	ms?: number;
};

export type BrowserUseOptions = {
	/** true ならウィンドウを出さずに動かす */
	headless: boolean;
	/** Chromium / Chrome の実行ファイル。空なら自動で探す */
	executablePath: string;
};

export type BrowserUseResult = {
	/** 操作後のページ (close のときは空) */
	url: string;
	title: string;
	/** モデルに返すスナップショット (操作できる要素の一覧 + 本文) */
	snapshot: string;
	/** 操作後のビューポートのスクリーンショット (JPEG の data URL)。チャットに表示する */
	screenshot: string | null;
	/** 操作の結果の一言 (例: "Clicked [3] button \"Sign in\"") */
	message: string;
	/** 使ったブラウザ (例: "Chrome 131 (headed)") */
	browser: string;
};

export interface IBrowserUseMainService {
	readonly _serviceBrand: undefined;
	/** 1 操作を実行し、操作後のページの状態を返す。失敗したら Error (メッセージはモデルに返る) */
	run(action: BrowserUseAction, options: BrowserUseOptions): Promise<BrowserUseResult>;
	/** ブラウザを閉じる */
	close(): Promise<void>;
}

export const IBrowserUseMainService = createDecorator<IBrowserUseMainService>('browserUseMainService');

/** 開いてよい URL か (http / https / about:blank だけ。file: や javascript: は不可) */
export function validateBrowserUrl(raw: string): string {
	let s = raw.trim();
	if (!s) { throw new Error('url is required for navigate.'); }
	// "example.com" や "localhost:3000" のようにスキームが無ければ補う
	if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^(about|data|javascript|file|chrome|blob|view-source|vbscript):/i.test(s)) {
		s = (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(s) ? 'http://' : 'https://') + s;
	}
	let u: URL;
	try { u = new URL(s); } catch { throw new Error(`Invalid URL: ${raw}`); }
	if (s === 'about:blank') { return s; }
	if (u.protocol !== 'http:' && u.protocol !== 'https:') {
		throw new Error(`Only http(s) URLs can be opened (got ${u.protocol}).`);
	}
	return u.toString();
}
