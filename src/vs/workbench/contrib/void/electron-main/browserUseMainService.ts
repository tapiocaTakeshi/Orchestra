/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// browser_use の main プロセス側: Playwright (playwright-core) で Chromium を 1 つ動かし、
// エージェントの操作を 1 つずつ実行して、操作後のページのスナップショットを返す。
//
// - ブラウザはユーザーの普段のプロファイルとは別の、使い捨てのコンテキストで開く
//   (Cookie・ログイン状態・拡張機能は共有しない)。ダウンロードは受け付けない。
// - ブラウザ本体は「設定の実行ファイル → Playwright の Chromium → Chrome → Edge」の順に探す。
// - 操作は直列に実行する (同時に 2 つの操作がページを触らないように)。
// - electron-main なので workbench の実装は import しない (common/ の型だけ)。

import * as fs from 'fs';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { BrowserUseAction, BrowserUseOptions, BrowserUseResult, IBrowserUseMainService, validateBrowserUrl } from '../common/browserUseTypes.js';

const VIEWPORT = { width: 1280, height: 800 };
const ACTION_TIMEOUT_MS = 10_000;
const NAVIGATION_TIMEOUT_MS = 30_000;
const MAX_TEXT_CHARS = 6_000;
const MAX_ITEMS = 200;
const REF_ATTR = 'data-orchestra-ref';

type SnapshotData = { items: string[]; text: string; scrollY: number; scrollHeight: number; innerHeight: number };

/** ページ内で実行する: 操作できる見えている要素に番号を振り、一覧と本文を返す */
const SNAPSHOT_SCRIPT = `(() => {
	const REF = ${JSON.stringify(REF_ATTR)};
	const MAX = ${MAX_ITEMS};
	for (const el of document.querySelectorAll('[' + REF + ']')) el.removeAttribute(REF);
	const sel = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=textbox],[role=combobox],[role=searchbox],[contenteditable=""],[contenteditable=true],[onclick]';
	const visible = (el) => {
		const r = el.getBoundingClientRect();
		if (r.width < 1 || r.height < 1) return false;
		const cs = getComputedStyle(el);
		return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
	};
	const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
	const nameOf = (el) => clean(
		el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) ||
		el.getAttribute('placeholder') || (el.tagName !== 'SELECT' ? el.innerText : '') || (el.type !== 'password' && el.tagName !== 'SELECT' ? el.value : '') ||
		el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('name') || ''
	).slice(0, 80);
	const items = [];
	let n = 0;
	for (const el of document.querySelectorAll(sel)) {
		if (n >= MAX) break;
		if (!visible(el)) continue;
		n++;
		el.setAttribute(REF, String(n));
		const tag = el.tagName.toLowerCase();
		const role = el.getAttribute('role');
		let kind = role || (tag === 'a' ? 'link' : tag === 'input' ? 'input[' + (el.type || 'text') + ']' : tag);
		let extra = '';
		if (tag === 'a') extra += ' -> ' + clean(el.getAttribute('href')).slice(0, 100);
		if (tag === 'input' || tag === 'textarea') {
			if (el.type === 'checkbox' || el.type === 'radio') extra += el.checked ? ' (checked)' : ' (unchecked)';
			else if (el.type === 'password') extra += el.value ? ' (filled)' : '';
			else if (el.value) extra += ' value="' + clean(el.value).slice(0, 60) + '"';
		}
		if (tag === 'select') {
			const cur = el.selectedOptions[0];
			extra += ' value="' + clean(cur ? cur.text : '') + '" options=[' + Array.from(el.options).slice(0, 12).map(o => clean(o.text)).join(' | ') + ']';
		}
		if (el.disabled) extra += ' (disabled)';
		const r = el.getBoundingClientRect();
		if (r.bottom < 0 || r.top > innerHeight) extra += ' (offscreen)';
		items.push('[' + n + '] ' + kind + ' "' + nameOf(el) + '"' + extra);
	}
	const text = clean((document.body && document.body.innerText || '').replace(/\\n{2,}/g, ' ¶ '));
	return { items, text, scrollY: Math.round(scrollY), scrollHeight: document.documentElement.scrollHeight, innerHeight };
})()`;

export class BrowserUseMainService implements IBrowserUseMainService {
	readonly _serviceBrand: undefined;

	private browser: Browser | undefined;
	private context: BrowserContext | undefined;
	private page: Page | undefined;
	private browserLabel = '';
	private launchedWith = '';
	private queue: Promise<unknown> = Promise.resolve();
	private dialogs: string[] = [];
	private readonly adopted = new WeakSet<Page>();

	run(action: BrowserUseAction, options: BrowserUseOptions): Promise<BrowserUseResult> {
		const next = this.queue.then(() => this._run(action, options));
		this.queue = next.catch(() => undefined);
		return next;
	}

	close(): Promise<void> {
		const next = this.queue.then(() => this._close());
		this.queue = next.catch(() => undefined);
		return next;
	}

	private async _close(): Promise<void> {
		const browser = this.browser;
		this.browser = undefined;
		this.context = undefined;
		this.page = undefined;
		if (browser) { await browser.close().catch(() => undefined); }
	}

	private async _run(action: BrowserUseAction, options: BrowserUseOptions): Promise<BrowserUseResult> {
		if (action.action === 'close') {
			await this._close();
			return { url: '', title: '', snapshot: 'Browser closed.', screenshot: null, message: 'Closed the browser.', browser: this.browserLabel };
		}
		const page = await this.ensurePage(options);
		this.dialogs = [];
		const message = await this.perform(page, action);
		const current = this.page ?? page; // クリックで新しいタブが開いたらそちらに切り替わっている
		await this.settle(current);
		return this.describe(current, message);
	}

	private async ensurePage(options: BrowserUseOptions): Promise<Page> {
		const wanted = `${options.headless}|${options.executablePath}`;
		if (this.browser && (!this.browser.isConnected() || this.launchedWith !== wanted)) { await this._close(); }
		if (!this.browser) {
			this.browser = await this.launch(options);
			this.launchedWith = wanted;
			this.browser.on('disconnected', () => {
				this.browser = undefined;
				this.context = undefined;
				this.page = undefined;
			});
		}
		if (!this.context) {
			this.context = await this.browser.newContext({ viewport: VIEWPORT, acceptDownloads: false });
			this.context.setDefaultTimeout(ACTION_TIMEOUT_MS);
			this.context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
			// ポップアップや target=_blank で開いたタブを、以降の操作対象にする
			this.context.on('page', p => this.adoptPage(p));
		}
		if (!this.page || this.page.isClosed()) {
			const pages = this.context.pages().filter(p => !p.isClosed());
			this.adoptPage(pages[pages.length - 1] ?? await this.context.newPage());
		}
		return this.page!;
	}

	private adoptPage(p: Page) {
		this.page = p;
		if (this.adopted.has(p)) { return; }
		this.adopted.add(p);
		p.on('dialog', d => {
			this.dialogs.push(`${d.type()}: ${d.message()}`);
			d.dismiss().catch(() => undefined);
		});
		p.on('close', () => {
			if (this.page === p) {
				const rest = this.context?.pages().filter(x => !x.isClosed()) ?? [];
				this.page = rest[rest.length - 1];
			}
		});
	}

	private async launch(options: BrowserUseOptions): Promise<Browser> {
		let chromium: typeof import('playwright-core').chromium;
		try {
			chromium = (await import('playwright-core')).chromium;
		} catch (e) {
			throw new Error(`Playwright (playwright-core) is not available in this build: ${errorMessage(e)}`);
		}
		const base = { headless: options.headless, args: ['--no-first-run', '--no-default-browser-check'] };
		const candidates: Array<{ label: string; opts: Parameters<typeof chromium.launch>[0] }> = [];
		if (options.executablePath.trim()) {
			candidates.push({ label: options.executablePath.trim(), opts: { ...base, executablePath: options.executablePath.trim() } });
		}
		let bundled = '';
		try { bundled = chromium.executablePath(); } catch { /* not installed */ }
		if (bundled && fs.existsSync(bundled)) { candidates.push({ label: 'Playwright Chromium', opts: base }); }
		candidates.push({ label: 'Google Chrome', opts: { ...base, channel: 'chrome' } });
		candidates.push({ label: 'Microsoft Edge', opts: { ...base, channel: 'msedge' } });

		const errors: string[] = [];
		for (const c of candidates) {
			try {
				const browser = await chromium.launch(c.opts);
				this.browserLabel = `${c.label} ${browser.version()}${options.headless ? ' (headless)' : ''}`;
				return browser;
			} catch (e) {
				errors.push(`${c.label}: ${errorMessage(e).split('\n')[0]}`);
			}
		}
		throw new Error(
			'No Chromium-based browser could be started. Install Google Chrome or Microsoft Edge, run "npx playwright install chromium", '
			+ 'or set "Browser Use: Executable Path" in Orchestra settings.\n' + errors.join('\n'),
		);
	}

	private async perform(page: Page, a: BrowserUseAction): Promise<string> {
		switch (a.action) {
			case 'navigate': {
				const url = validateBrowserUrl(a.url ?? '');
				const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
				return `Opened ${url}${res && !res.ok() ? ` (HTTP ${res.status()})` : ''}`;
			}
			case 'snapshot':
				return 'Took a snapshot.';
			case 'click': {
				const { locator, label } = await this.byRef(page, a.ref);
				// target=_blank のリンクなどは新しいタブが開くので、それを待ってから操作対象を切り替える
				const opensTab = await locator.evaluate((el: Element) => {
					const link = el.closest('a');
					return !!link && link.target === '_blank';
				}).catch(() => false);
				const popup = this.context!.waitForEvent('page', { timeout: opensTab ? 5000 : 300 }).catch(() => undefined);
				await locator.click();
				const opened = await popup;
				if (opened) {
					this.adoptPage(opened);
					await opened.waitForLoadState('domcontentloaded').catch(() => undefined);
					return `Clicked ${label}; it opened a new tab, which is now the current page`;
				}
				return `Clicked ${label}`;
			}
			case 'type': {
				const { locator, label } = await this.byRef(page, a.ref);
				const text = a.text ?? '';
				try {
					await locator.fill(text);
				} catch {
					// contenteditable などは fill できないので、クリックして打ち込む
					await locator.click();
					await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
					await page.keyboard.type(text);
				}
				if (a.submit) { await locator.press('Enter'); }
				return `Typed ${JSON.stringify(text.length > 60 ? text.slice(0, 57) + '...' : text)} into ${label}${a.submit ? ' and pressed Enter' : ''}`;
			}
			case 'select': {
				const { locator, label } = await this.byRef(page, a.ref);
				const text = a.text ?? '';
				try { await locator.selectOption({ label: text }, { timeout: 3000 }); }
				catch { await locator.selectOption(text); }
				return `Selected ${JSON.stringify(text)} in ${label}`;
			}
			case 'press': {
				const key = (a.key ?? '').trim();
				if (!key) { throw new Error('key is required for press (e.g. "Enter", "Escape", "ArrowDown").'); }
				await page.keyboard.press(key);
				return `Pressed ${key}`;
			}
			case 'scroll': {
				const dir = a.direction === 'up' ? -1 : 1;
				await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
				await page.mouse.wheel(0, dir * Math.round(VIEWPORT.height * 0.8));
				return `Scrolled ${dir < 0 ? 'up' : 'down'}`;
			}
			case 'back':
				await page.goBack({ waitUntil: 'domcontentloaded' });
				return 'Went back';
			case 'forward':
				await page.goForward({ waitUntil: 'domcontentloaded' });
				return 'Went forward';
			case 'wait': {
				const ms = Math.max(0, Math.min(10_000, Number(a.ms) || 1000));
				await page.waitForTimeout(ms);
				return `Waited ${ms} ms`;
			}
			default:
				throw new Error(`Unknown browser action: ${String((a as { action: unknown }).action)}`);
		}
	}

	private async byRef(page: Page, ref: number | undefined) {
		if (typeof ref !== 'number' || !Number.isInteger(ref) || ref < 1) {
			throw new Error('ref is required: the [number] of an element in the latest snapshot.');
		}
		const locator = page.locator(`[${REF_ATTR}="${ref}"]`).first();
		if (await locator.count() === 0) {
			throw new Error(`Element [${ref}] is not on the page any more. Take a new snapshot and use the new numbers.`);
		}
		const label = await locator.evaluate((el: Element) => {
			const name = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('placeholder') || el.getAttribute('name') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
			return `${el.tagName.toLowerCase()}${name ? ` "${name}"` : ''}`;
		}).catch(() => 'element');
		return { locator, label: `[${ref}] ${label}` };
	}

	/** 操作の後、ページが落ち着くまで少し待つ (遷移・描画) */
	private async settle(page: Page) {
		await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
		await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => undefined);
		await page.waitForTimeout(150).catch(() => undefined);
	}

	private async describe(page: Page, message: string): Promise<BrowserUseResult> {
		let data: SnapshotData | undefined;
		for (let attempt = 0; attempt < 2 && !data; attempt++) {
			try {
				data = await page.evaluate(SNAPSHOT_SCRIPT) as SnapshotData;
			} catch {
				// 遷移の途中で評価が失敗することがあるので一度だけ待ってやり直す
				await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
			}
		}
		const url = page.url();
		const title = await page.title().catch(() => '');
		let screenshot: string | null = null;
		try {
			const buf = await page.screenshot({ type: 'jpeg', quality: 45, scale: 'css', timeout: 5000 });
			screenshot = `data:image/jpeg;base64,${buf.toString('base64')}`;
		} catch { /* スクリーンショットが無くても続ける */ }

		const lines = [`URL: ${url}`, `Title: ${title}`];
		if (this.dialogs.length) { lines.push(`Dialogs (dismissed): ${this.dialogs.join(' / ')}`); }
		if (data) {
			const bottom = Math.min(data.scrollHeight, data.scrollY + data.innerHeight);
			lines.push(`Viewport: ${data.scrollY}-${bottom}px of ${data.scrollHeight}px`);
			lines.push('', `Interactive elements (use the [number] as ref):`);
			lines.push(...(data.items.length ? data.items : ['(none)']));
			if (data.items.length >= MAX_ITEMS) { lines.push(`(only the first ${MAX_ITEMS} are listed)`); }
			const text = data.text.length > MAX_TEXT_CHARS ? `${data.text.slice(0, MAX_TEXT_CHARS)} …(truncated)` : data.text;
			lines.push('', 'Page text (¶ = paragraph break):', text || '(empty)');
		} else {
			lines.push('', '(Could not read the page content.)');
		}
		return { url, title, snapshot: lines.join('\n'), screenshot, message, browser: this.browserLabel };
	}
}

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
