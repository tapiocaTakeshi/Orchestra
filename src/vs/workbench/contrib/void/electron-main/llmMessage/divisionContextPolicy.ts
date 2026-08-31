/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// disable foreign import complaints
/* eslint-disable */

/**
 * Context Policy Layer (Orchestra ローカル orchestration 用)
 *
 * Division API 側の `src/services/context-policy.ts` の移植版。両者は同じルールを
 * 適用するので、片方を変更したらもう片方も合わせて更新すること。
 * 単体テストは Division 側の `tests/context-policy.test.ts` にある。
 *
 * Leader AI が「誰に何を渡すか」を決め、このレイヤーがルールで制約する。
 * 配分の判断は AI に任せてよいが、次のものは任せない:
 *
 *   - ファイルサイズ制限
 *   - 秘密情報の除外
 *   - ロールごとの権限
 *   - コンテキスト上限
 *   - 循環呼び出し防止
 *
 *        Leader AI
 *           │
 *     「これを渡したい」
 *           │
 *           ▼
 *    ┌──────────────┐
 *    │ Policy Layer │
 *    └──────┬───────┘
 *           │
 *       許可 / 制限
 *           │
 *           ▼
 *          Role
 *
 * Leader が指名したファイルも、ロールが Pull 型で要求したファイルも、
 * 自動選択されたファイルも、すべてこの 1 か所を通る。
 */

import {
	normalizeContextRoleSlug,
	relevanceForRole,
	type ContextFile,
	type ProjectContext,
} from './divisionProjectContext.js';

// --- Types ---

export type PolicyRejectionReason =
	| "not-found"
	| "secret-file"
	| "too-large"
	| "role-not-permitted"
	| "budget-exceeded"
	| "duplicate"
	| "already-granted"
	| "request-limit";

export interface PolicyRejection {
	path: string;
	reason: PolicyRejectionReason;
	detail?: string;
}

export interface GrantedFile extends ContextFile {
	/** ポリシー適用後の本文（秘密情報の行はマスク済み） */
	body: string;
	/** 本文中の秘密らしき値をマスクしたか */
	redacted: boolean;
	/** サイズ上限で末尾を切ったか */
	truncated: boolean;
}

export interface ContextDecision {
	granted: GrantedFile[];
	rejected: PolicyRejection[];
	totalChars: number;
}

export interface PolicyOptions {
	/** 1 ファイルあたりの本文上限。既定 12,000 字 */
	maxCharsPerFile?: number;
	/** このロールへ渡す本文の合計上限。既定はロール別の予算 */
	maxTotalChars?: number;
	/** 渡すファイル数の上限。既定 40 */
	maxFiles?: number;
	/** 既にこのロールへ渡し済みのパス（重複配布と循環要求の抑止） */
	alreadyGranted?: Iterable<string>;
}

// --- Limits ---

const DEFAULT_MAX_CHARS_PER_FILE = 12000;
const DEFAULT_MAX_FILES = 40;
/** ロール別予算が引けなかった場合の保険 */
const FALLBACK_TOTAL_CHARS = 16000;

/** 1 タスクが Pull 型で追加要求できる回数 */
export const MAX_PULL_ROUNDS_PER_TASK = 2;
/** 1 回の実行全体で許す Pull 型要求の総数 */
export const MAX_PULL_REQUESTS_PER_RUN = 6;
/** 1 回の要求で指名できるファイル数 */
export const MAX_PULL_PATHS_PER_REQUEST = 8;

// --- Secret detection ---

/**
 * 「そのファイル自体が資格情報の置き場」であるもの。本文はどのロールにも渡さない。
 * `.env.example` のようなテンプレートは実際の値を持たないので対象外にする。
 */
const SECRET_FILE_PATTERNS: RegExp[] = [
	/(^|\/)\.env(\.[A-Za-z0-9_-]+)?$/i,
	/(^|\/)\.npmrc$/i,
	/(^|\/)\.netrc$/i,
	/(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
	/\.(pem|key|p12|pfx|jks|keystore|ppk)$/i,
	/(^|\/)(credentials|secrets?)(\.[A-Za-z0-9]+)?$/i,
	/service[-_]?account.*\.json$/i,
	/(^|\/)\.aws\//i,
	/(^|\/)\.ssh\//i,
];

/** 値を持たないテンプレートなので秘密扱いしない */
const SECRET_FILE_EXCEPTIONS: RegExp[] = [
	/\.(example|sample|template|dist|tpl)$/i,
	/(^|\/)\.env\.(example|sample|template)$/i,
];

export function isSecretFile(path: string): boolean {
	const p = String(path ?? "");
	if (!p) return false;
	for (const ex of SECRET_FILE_EXCEPTIONS) {
		if (ex.test(p)) return false;
	}
	return SECRET_FILE_PATTERNS.some((re) => re.test(p));
}

/**
 * 普通のソースに紛れ込んだ秘密らしき値を行単位でマスクする。
 * ファイルごと落とすと実装が読めなくなるので、値だけを潰して本文は残す。
 */
const SECRET_VALUE_PATTERNS: { re: RegExp; replace: string }[] = [
	// KEY = "..." / "apiKey": "..." のような代入
	{
		re: /((?:api[_-]?key|secret|token|password|passwd|pwd|credential|private[_-]?key|access[_-]?key|auth)[A-Za-z0-9_]*\s*[:=]\s*["'`])([^"'`\n]{8,})(["'`])/gi,
		replace: "$1***REDACTED***$3",
	},
	// 環境変数形式 (KEY=value)
	{
		re: /^([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)[A-Z0-9_]*\s*=\s*)(\S{8,})$/gm,
		replace: "$1***REDACTED***",
	},
	// よく知られたトークン書式
	{ re: /\bsk-[A-Za-z0-9]{16,}\b/g, replace: "***REDACTED***" },
	{ re: /\bghp_[A-Za-z0-9]{20,}\b/g, replace: "***REDACTED***" },
	{ re: /\bAKIA[0-9A-Z]{16}\b/g, replace: "***REDACTED***" },
	{
		re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
		replace: "-----BEGIN PRIVATE KEY-----\n***REDACTED***\n-----END PRIVATE KEY-----",
	},
];

export function redactSecrets(body: string): { text: string; redacted: boolean } {
	let text = String(body ?? "");
	let redacted = false;
	for (const { re, replace } of SECRET_VALUE_PATTERNS) {
		const next = text.replace(re, replace);
		if (next !== text) redacted = true;
		text = next;
	}
	return { text, redacted };
}

// --- Role permissions ---

/**
 * ロールごとに「本文を渡さない」パス。読む必要が無いものを配らないための線引きで、
 * 秘密情報の遮断（上の isSecretFile）とは別レイヤー。
 */
const ROLE_DENY_PATTERNS: Record<string, RegExp[]> = {
	designer: [/(^|\/)(migrations?|seeds?)\//i, /\.(sql|prisma)$/i],
	imager: [/./],
	searcher: [/./],
	researcher: [/./],
	planner: [/./],
	leader: [/./],
	ideaman: [/./],
};

export function isRoleAllowedPath(roleSlug: string, path: string): boolean {
	const role = normalizeContextRoleSlug(roleSlug);
	const deny = ROLE_DENY_PATTERNS[role];
	if (!deny) return true;
	return !deny.some((re) => re.test(path));
}

/** そのロールがそもそもファイル本文を受け取るか */
export function roleReceivesFileBodies(roleSlug: string): boolean {
	return relevanceForRole(roleSlug).attachBodies;
}

// --- The policy gate ---

function budgetForRole(roleSlug: string, opts: PolicyOptions): number {
	if (typeof opts.maxTotalChars === "number") return Math.max(0, opts.maxTotalChars);
	const budget = relevanceForRole(roleSlug).bodyBudgetChars;
	return budget > 0 ? budget : FALLBACK_TOTAL_CHARS;
}

/**
 * 要求されたファイル群に対してポリシーを適用し、実際に渡すものを決める。
 *
 * 入口はここ 1 つだけ。Leader の指名・ロールの Pull 要求・自動選択のいずれも
 * 同じルールを通る。
 */
export function applyContextPolicy(
	roleSlug: string,
	requested: ContextFile[],
	ctx: ProjectContext,
	opts: PolicyOptions = {}
): ContextDecision {
	const granted: GrantedFile[] = [];
	const rejected: PolicyRejection[] = [];

	const maxPerFile = opts.maxCharsPerFile ?? DEFAULT_MAX_CHARS_PER_FILE;
	const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
	const budget = budgetForRole(roleSlug, opts);

	if (!roleReceivesFileBodies(roleSlug)) {
		for (const f of requested) {
			rejected.push({ path: f.path, reason: "role-not-permitted", detail: `${roleSlug} は本文を受け取らないロール` });
		}
		return { granted, rejected, totalChars: 0 };
	}

	const alreadyGranted = new Set(opts.alreadyGranted ?? []);
	const seen = new Set<string>();
	let totalChars = 0;

	for (const file of requested) {
		const path = String(file.path ?? "").trim();
		if (!path) continue;

		if (seen.has(path)) {
			rejected.push({ path, reason: "duplicate" });
			continue;
		}
		seen.add(path);

		if (alreadyGranted.has(path)) {
			rejected.push({ path, reason: "already-granted", detail: "同じロールに配布済み" });
			continue;
		}

		if (isSecretFile(path)) {
			rejected.push({ path, reason: "secret-file", detail: "資格情報を含みうるため本文は配布しない" });
			continue;
		}

		if (!isRoleAllowedPath(roleSlug, path)) {
			rejected.push({ path, reason: "role-not-permitted" });
			continue;
		}

		const body = ctx.bodies[path];
		if (body === undefined) {
			// file-searcher がまだ本文を持っていない。パスは分かっているので
			// ロールは Level 3（自分のツール）で読みにいける。
			rejected.push({ path, reason: "not-found", detail: "本文が未取得。必要ならツールで読むこと" });
			continue;
		}

		if (granted.length >= maxFiles) {
			rejected.push({ path, reason: "budget-exceeded", detail: `ファイル数の上限 ${maxFiles} 件` });
			continue;
		}

		const remaining = budget - totalChars;
		if (remaining <= 0) {
			rejected.push({ path, reason: "budget-exceeded", detail: `合計 ${budget} 字の上限` });
			continue;
		}

		const { text, redacted } = redactSecrets(body);
		const limit = Math.min(maxPerFile, remaining);
		const truncated = text.length > limit;
		if (truncated && limit < 200) {
			// 200 字未満しか渡せないなら、断片を渡すより渡さない方が誤解が少ない
			rejected.push({ path, reason: "budget-exceeded", detail: `合計 ${budget} 字の上限` });
			continue;
		}
		const finalText = truncated ? text.slice(0, limit) : text;

		granted.push({
			...file,
			path,
			body: finalText,
			redacted,
			truncated,
		});
		totalChars += finalText.length;
	}

	return { granted, rejected, totalChars };
}

// --- Rendering ---

function languageForPath(p: string): string {
	const ext = p.includes(".") ? p.slice(p.lastIndexOf(".") + 1) : "";
	return ext || "text";
}

const REJECTION_LABELS: Record<PolicyRejectionReason, string> = {
	"not-found": "本文未取得（ツールで読めます）",
	"secret-file": "秘密情報のため非配布",
	"too-large": "サイズ上限超過",
	"role-not-permitted": "このロールには配布しない",
	"budget-exceeded": "コンテキスト上限超過",
	duplicate: "重複指定",
	"already-granted": "配布済み",
	"request-limit": "要求回数の上限",
};

/**
 * ポリシー適用後のファイル群を Markdown にする。
 * 弾いたものも理由つきで見せる — 黙って消すと、ロールは「存在しない」と誤解して
 * ゼロから書き直しにいく。
 */
export function renderDecision(roleSlug: string, decision: ContextDecision): string {
	if (decision.granted.length === 0 && decision.rejected.length === 0) return "";

	const lines: string[] = [];

	if (decision.granted.length > 0) {
		lines.push(`## ${normalizeContextRoleSlug(roleSlug) || roleSlug} に配分されたファイル（${decision.granted.length} 件）`);
		lines.push("");
		lines.push("> Leader が配分し、Division API のポリシーを通過したファイルです。");
		lines.push("");
		for (const f of decision.granted) {
			const notes: string[] = [];
			if (f.reason) notes.push(f.reason);
			if (f.redacted) notes.push("秘密情報はマスク済み");
			if (f.truncated) notes.push("上限により末尾を省略");
			lines.push(`### \`${f.path}\`${notes.length > 0 ? ` — ${notes.join(" / ")}` : ""}`);
			lines.push("```" + languageForPath(f.path));
			lines.push(f.body);
			lines.push("```");
			lines.push("");
		}
	}

	if (decision.rejected.length > 0) {
		lines.push("### 配布しなかったファイル");
		lines.push("");
		for (const r of decision.rejected) {
			lines.push(`- \`${r.path}\` — ${REJECTION_LABELS[r.reason]}${r.detail ? `（${r.detail}）` : ""}`);
		}
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}

// --- Pull 型: ロールからの追加要求 ---

export interface ContextRequest {
	paths: string[];
	reason?: string;
}

/**
 * ロールの出力に埋め込まれた追加コンテキスト要求を読む。
 *
 * ```json context-request
 * { "paths": ["src/auth/Auth.ts"], "reason": "実装に必要" }
 * ```
 */
export function parseContextRequest(output: string): ContextRequest | null {
	const text = String(output ?? "");
	if (!text.includes("context-request")) return null;

	const fences = [...text.matchAll(/```(?:json)?[^\S\n]*context-request[^\n]*\n([\s\S]*?)```/g)];
	const paths: string[] = [];
	let reason: string | undefined;

	for (const m of fences) {
		const body = (m[1] || "").trim();
		if (!body.startsWith("{")) continue;
		try {
			const parsed = JSON.parse(body) as Record<string, unknown>;
			const raw = parsed.paths ?? parsed.files;
			if (Array.isArray(raw)) {
				for (const p of raw) {
					if (typeof p === "string" && p.trim()) paths.push(p.trim().replace(/^\.\//, ""));
				}
			}
			if (!reason && typeof parsed.reason === "string") reason = parsed.reason.trim();
		} catch {
			/* 壊れた要求は無視する。要求が読めないことは失敗ではない。 */
		}
	}

	if (paths.length === 0) return null;
	return { paths: paths.slice(0, MAX_PULL_PATHS_PER_REQUEST), reason };
}

/**
 * Pull 型の要求を許すかどうか。循環（同じファイルを何度も要求し続ける）と
 * 暴走（実行全体で要求が増え続ける）を止める。
 */
export class ContextRequestLedger {
	private roundsByTask = new Map<number, number>();
	private grantedByTask = new Map<number, Set<string>>();
	private totalRequests = 0;

	/**
	 * そのタスクへ配布済みのパス。
	 *
	 * ロール単位ではなくタスク単位で持つ。各タスクは独立した 1 回の LLM 呼び出しで、
	 * 前のタスクに渡したものを覚えてはいないので、同じロールの別タスクには
	 * 改めて渡す必要がある。「配布済みだから省く」を効かせたいのは、同じタスクの
	 * Pull 型 2 周目以降だけ。
	 */
	grantedPathsFor(taskIndex: number): Set<string> {
		let set = this.grantedByTask.get(taskIndex);
		if (!set) {
			set = new Set<string>();
			this.grantedByTask.set(taskIndex, set);
		}
		return set;
	}

	recordGranted(taskIndex: number, paths: string[]): void {
		const set = this.grantedPathsFor(taskIndex);
		for (const p of paths) set.add(p);
	}

	/**
	 * 追加要求を受け付けるか。受け付ける場合はラウンド数を消費する。
	 * @returns 拒否理由。null なら許可。
	 */
	tryConsume(taskIndex: number, request: ContextRequest): string | null {
		if (this.totalRequests >= MAX_PULL_REQUESTS_PER_RUN) {
			return `この実行での追加コンテキスト要求が上限 (${MAX_PULL_REQUESTS_PER_RUN} 回) に達しました`;
		}
		const rounds = this.roundsByTask.get(taskIndex) ?? 0;
		if (rounds >= MAX_PULL_ROUNDS_PER_TASK) {
			return `このタスクでの追加コンテキスト要求が上限 (${MAX_PULL_ROUNDS_PER_TASK} 回) に達しました`;
		}
		const already = this.grantedPathsFor(taskIndex);
		if (request.paths.every((p) => already.has(p))) {
			return "要求されたファイルはすべて配布済みです（同じ要求の繰り返しを検出）";
		}

		this.roundsByTask.set(taskIndex, rounds + 1);
		this.totalRequests++;
		return null;
	}
}
