/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

// AI Designer: 選択した要素 (または文書全体) の修正を Division の Designer ロールに依頼する。
//
// - 送るのは「現在の HTML から切り出した対象要素」と、見た目の手がかりになる <style>、
//   Designer 用ガイド (.division/DESIGN.md) だけ。ファイル全体の再生成はさせない。
// - 返ってきた HTML はそのまま書き込まず、Design 画面で差分を確認してから適用する。

import * as vscode from 'vscode';

const BRIDGE_COMMAND = 'orchestra.design.getDesignerConnection';
const SECRET_KEY = 'orchestraDesign.divisionApiKey';
const DEFAULT_ENDPOINT = 'https://api.division.he-ro.io';
const MAX_STYLE_CHARS = 12000;
const MAX_GUIDE_CHARS = 8000;
const MAX_DOCUMENT_CHARS = 120000;

interface BridgeConnection {
	endpoint?: string;
	tokens?: string[];
	model?: string;
	effort?: string;
}

export interface DesignerConnection {
	endpoint: string;
	tokens: string[];
	model: string;
}

export interface DesignerRequest {
	instruction: string;
	/** 'element' なら target は対象要素の outerHTML、'document' なら文書全体 */
	scope: 'element' | 'document';
	target: string;
	/** 対象要素の祖先 (例: html > body > main > section) */
	ancestry?: string;
	styles: string;
	guide: string | undefined;
}

export interface DesignerResult {
	html: string;
	model: string;
	note: string | undefined;
}

export class DesignerClient {
	constructor(private readonly secrets: vscode.SecretStorage) { }

	async setApiKey(): Promise<void> {
		const value = await vscode.window.showInputBox({
			title: 'Orchestra Design: Division API キー',
			prompt: 'IDE で Division にログインしていない場合だけ使います (ak_ で始まるキー)。空にすると削除します。',
			password: true,
			ignoreFocusOut: true,
		});
		if (value === undefined) { return; }
		if (value.trim()) {
			await this.secrets.store(SECRET_KEY, value.trim());
			vscode.window.showInformationMessage('Division API キーを保存しました。');
		} else {
			await this.secrets.delete(SECRET_KEY);
			vscode.window.showInformationMessage('Division API キーを削除しました。');
		}
	}

	async resolveConnection(): Promise<DesignerConnection> {
		const config = vscode.workspace.getConfiguration('orchestraDesign');
		let bridge: BridgeConnection = {};
		try {
			bridge = (await vscode.commands.executeCommand<BridgeConnection>(BRIDGE_COMMAND)) ?? {};
		} catch {
			// Orchestra 以外の VS Code で動かしている場合など。設定とシークレットだけで動かす。
		}
		const endpoint = (config.get<string>('divisionEndpoint') || bridge.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '');
		const own = await this.secrets.get(SECRET_KEY);
		const tokens = [...new Set([...(bridge.tokens ?? []), ...(own ? [own] : [])])];
		const model = config.get<string>('designerModel') || bridge.model || 'gemini-3-flash';
		return { endpoint, tokens, model };
	}

	async edit(req: DesignerRequest, token: vscode.CancellationToken): Promise<DesignerResult> {
		const conn = await this.resolveConnection();
		if (!conn.tokens.length) {
			throw new Error('Division にログインしていません。IDE でログインするか、「Orchestra Design: Division API キーを設定」を実行してください。');
		}
		if (req.target.length > MAX_DOCUMENT_CHARS) {
			throw new Error('対象の HTML が大きすぎます。もっと小さな要素を選択してください。');
		}

		// "<provider>/<model>" 形式なら model 部分だけを送る (Orchestra 本体と同じ扱い)
		const slash = conn.model.indexOf('/');
		const provider = slash > 0 && slash < conn.model.length - 1 ? conn.model.slice(slash + 1) : conn.model;

		const controller = new AbortController();
		const sub = token.onCancellationRequested(() => controller.abort());
		try {
			let lastError = '';
			for (const bearer of conn.tokens) {
				const res = await fetch(`${conn.endpoint}/api/generate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bearer}` },
					body: JSON.stringify({
						provider,
						input: buildInput(req),
						systemPrompt: SYSTEM_PROMPT,
						maxTokens: req.scope === 'document' ? 32000 : 12000,
					}),
					signal: controller.signal,
				});
				if (res.status === 401 || res.status === 403) { lastError = `認証に失敗しました (${res.status})`; continue; }
				const body = await res.json().catch(() => undefined) as { output?: string; status?: string; error?: string; model?: string } | undefined;
				if (!res.ok || !body || body.status === 'error') {
					throw new Error(`Designer の呼び出しに失敗しました: ${body?.error ?? `HTTP ${res.status}`}`);
				}
				const parsed = extractHtml(body.output ?? '');
				if (!parsed.html) { throw new Error('Designer の応答に HTML が含まれていませんでした。指示を変えて再実行してください。'); }
				if (req.scope === 'element' && !looksLikeSingleElement(parsed.html)) {
					throw new Error('Designer が選択要素 1 つ分ではない HTML を返しました。指示を具体的にして再実行してください。');
				}
				return { html: parsed.html, note: parsed.note, model: body.model ?? provider };
			}
			throw new Error(`${lastError}。Division に再ログインするか API キーを設定し直してください。`);
		} finally {
			sub.dispose();
		}
	}
}

const SYSTEM_PROMPT = `You are the Designer role of Division, editing an existing HTML/CSS design file (.division/DESIGN.html) in place.
Rules:
- Change only what the instruction asks for. Keep every other attribute, class, id, text and structure as it is.
- Return exactly ONE fenced code block (\`\`\`html ... \`\`\`) with the replacement HTML, followed by at most one short sentence describing the change.
- When the scope is "element", the code block must contain exactly the one replacement element (same outer tag unless the instruction requires otherwise). Do not return <html>, <head> or <body>.
- When the scope is "document", return the complete document.
- Prefer inline style attributes or existing classes for small visual changes. Do not add external scripts or remote resources that were not already used.`;

function buildInput(req: DesignerRequest): string {
	const parts: string[] = [];
	if (req.guide?.trim()) {
		parts.push(`## Designer guide (.division/DESIGN.md)\n${truncate(req.guide, MAX_GUIDE_CHARS)}`);
	}
	if (req.scope === 'element' && req.styles.trim()) {
		parts.push(`## Stylesheets in the document (read-only context)\n\`\`\`css\n${truncate(req.styles, MAX_STYLE_CHARS)}\n\`\`\``);
	}
	parts.push(`## Scope\n${req.scope}${req.ancestry ? ` (location: ${req.ancestry})` : ''}`);
	parts.push(`## Current HTML\n\`\`\`html\n${req.target}\n\`\`\``);
	parts.push(`## Instruction\n${req.instruction}`);
	return parts.join('\n\n');
}

function truncate(s: string, max: number): string {
	return s.length > max ? `${s.slice(0, max)}\n/* …truncated… */` : s;
}

export function extractHtml(output: string): { html: string; note: string | undefined } {
	const fence = /```(?:html|HTML)?[^\n]*\n([\s\S]*?)```/.exec(output);
	if (fence) {
		const note = output.slice(fence.index + fence[0].length).trim().split('\n')[0]?.trim() || undefined;
		return { html: fence[1].trim(), note };
	}
	const trimmed = output.trim();
	return { html: trimmed.startsWith('<') ? trimmed : '', note: undefined };
}

function looksLikeSingleElement(html: string): boolean {
	const t = html.trim();
	return t.startsWith('<') && !/^<!doctype/i.test(t) && !/^<html[\s>]/i.test(t);
}
