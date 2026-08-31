/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// disable foreign import complaints
/* eslint-disable */

/**
 * Project Context (Orchestra ローカル orchestration 用)
 *
 * Division API 側の `src/services/project-context.ts` と同じ設計・同じ出力契約を
 * ローカル実行フローにも適用するための移植版。両者は同じレポート形式を読み書きするので、
 * 片方を変更したらもう片方も合わせて更新すること。
 * 単体テストは Division 側の `tests/project-context.test.ts` にある。
 *
 * file-searcher の成果物を「全ロールが参照できる共有コンテキスト」に変換する。
 *
 * 設計方針（検索結果の全文を全ロールに配らない）:
 *
 *   Level 1 — 共有コンテキスト（全ロールに無条件で渡す）
 *     サマリ / ファイル一覧 / 依存関係 / シンボル。パスと関係性だけなので安価。
 *
 *   Level 2 — ロール別の関連ファイル（本文つき）
 *     coder / reviewer / tester / security など、ロールごとに必要なファイルだけを
 *     予算内で本文つきで渡す。
 *
 *   Level 3 — 必要になったら実ファイルを読む
 *     各ロールは自前の read_file / search_files ツールで追加取得する。ここでは
 *     Level 1 に「未添付のファイルはツールで読める」ことを明記して誘導する。
 *
 * また file-searcher は 1 度きりの検索役ではなく Context Manager として扱う。
 * 2 回目以降の file-searcher 出力は `mergeProjectContext` で既存コンテキストに
 * マージされ、ファイル一覧・依存関係・シンボルが更新されていく。
 */

// --- Types ---

export interface ContextFile {
	/** ワークスペースルートからの相対パス */
	path: string;
	/** なぜこのファイルが関連するのか（file-searcher が書く） */
	reason?: string;
	/** このファイルが公開している主要シンボル */
	symbols?: string[];
}

export interface ProjectContext {
	/** file-searcher が書いた調査サマリ */
	summary: string;
	/** 発見された全ファイルパス（本文は含まない） */
	files: string[];
	/** 関連度が高いと判断されたファイル（理由つき、優先度順） */
	relevantFiles: ContextFile[];
	/** "a/b.ts -> c/d.ts" 形式の依存エッジ */
	dependencies: string[];
	/** 主要シンボル（関数 / クラス / コンポーネント名） */
	symbols: string[];
	/** path -> ファイル本文。Level 2 の切り出し元。 */
	bodies: Record<string, string>;
	/** 元レポートの文字数（圧縮率のログ用） */
	sourceChars: number;
}

export interface RenderOptions {
	/** Level 1 に載せるファイルパスの最大件数 */
	maxListedFiles?: number;
	/** Level 2 に添付するファイル本文の合計文字数上限 */
	bodyBudgetChars?: number;
	/** Level 2 に添付するファイルの最大件数 */
	maxAttachedFiles?: number;
}

// --- Constants ---

const DEFAULT_MAX_LISTED_FILES = 200;
const DEFAULT_MAX_ATTACHED_FILES = 12;
const MAX_SUMMARY_CHARS = 1500;
const MAX_DEPENDENCY_EDGES = 60;
const MAX_SYMBOLS = 80;
/** 1 ファイルあたりの添付上限。これを超えたら先頭だけを渡す。 */
const MAX_BODY_CHARS_PER_FILE = 12000;

/**
 * file-searcher のタスク入力に追記する出力契約。
 * 構造化 JSON を末尾に出させることで、後段ロールへの配布を機械的に行える。
 * JSON が無くても Markdown からヒューリスティックに復元するので必須ではない。
 */
export const FILE_SEARCHER_OUTPUT_CONTRACT = `

---

## 出力契約（重要）

通常の Markdown レポートを書いたあと、**レポートの最後に** 次の JSON ブロックを 1 つだけ付けてください。
この JSON は後続の全ロール（coder / reviewer / tester / security など）へ共有コンテキストとして自動配布されます。

\`\`\`json division-context
{
	"summary": "調査結果の要約（3〜5行）",
	"relevant_files": [
		{ "path": "src/auth/Auth.ts", "reason": "認証処理の中心", "symbols": ["Auth.login"] }
	],
	"dependencies": ["src/pages/Login.tsx -> src/auth/AuthProvider.tsx"],
	"symbols": ["Auth.login", "AuthProvider"]
}
\`\`\`

- \`relevant_files\` は関連度の高い順に並べてください（多くても 40 件程度）。
- \`reason\` は「なぜ後続ロールがこのファイルを見る必要があるか」を 1 行で書いてください。
- パスはワークスペースルートからの相対パスにしてください。`;

// --- Parsing ---

const FILE_HEADING_RE = /^#{2,4}\s+`([^`\n]+)`\s*$/;
const FENCE_RE = /^```/;
/** Markdown 本文やツリー表示から拾えるパスらしき文字列 */
const PATH_LIKE_RE =
	/(?:^|[\s`"'(\[])((?:[A-Za-z0-9_.@-]+\/){0,12}[A-Za-z0-9_.@-]+\.[A-Za-z0-9]{1,8})(?=$|[\s`"')\],:])/g;

const IGNORED_PATH_SEGMENTS = ["node_modules/", "/dist/", "/build/", ".git/"];

/**
 * ディレクトリを含まない文字列（`Auth.login` のようなシンボル名）を
 * ファイル扱いしてしまわないための拡張子ホワイトリスト。
 */
const KNOWN_FILE_EXTENSIONS = new Set([
	"ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts", "json", "jsonc",
	"py", "rb", "go", "rs", "java", "kt", "kts", "swift", "c", "h", "cc", "cpp",
	"hpp", "cs", "php", "dart", "scala", "sh", "bash", "zsh", "ps1",
	"html", "htm", "css", "scss", "sass", "less", "vue", "svelte", "astro",
	"md", "mdx", "txt", "yml", "yaml", "toml", "ini", "cfg", "conf", "env",
	"sql", "prisma", "graphql", "gql", "proto", "lock", "gradle", "xml",
	"png", "jpg", "jpeg", "svg", "gif", "webp", "ico",
]);

function looksLikePath(p: string): boolean {
	if (!p || p.length > 300) return false;
	if (p.startsWith("http://") || p.startsWith("https://")) return false;
	for (const seg of IGNORED_PATH_SEGMENTS) {
		if (p.includes(seg)) return false;
	}
	// "v1.2.3" や "3.14" のようなバージョン/数値を除外
	if (/^[\d.]+$/.test(p)) return false;
	const extMatch = p.match(/\.([A-Za-z0-9]{1,8})$/);
	if (!extMatch) return false;
	const basename = p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p;
	// `.env.example` や `.gitignore` のようなドットファイルは拡張子で判定できないので通す
	if (basename.startsWith(".")) return true;
	// ディレクトリを含まないものは、既知の拡張子でなければシンボル名とみなして捨てる
	if (!p.includes("/") && !KNOWN_FILE_EXTENSIONS.has(extMatch[1].toLowerCase())) return false;
	return true;
}

function normalizePath(p: string): string {
	return p.trim().replace(/^\.\//, "").replace(/\\/g, "/");
}

function uniq(items: string[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		if (!item) continue;
		if (seen.has(item)) continue;
		seen.add(item);
		out.push(item);
	}
	return out;
}

/** レポート末尾の ```json division-context ブロック（無ければ他の json ブロック）を読む。 */
function extractStructuredBlock(markdown: string): Record<string, unknown> | null {
	const fences = [...markdown.matchAll(/```(?:json)?[^\S\n]*(division-context)?[^\n]*\n([\s\S]*?)```/g)];
	// division-context タグ付きを優先し、無ければ relevant_files を含む JSON を探す
	const tagged = fences.filter((m) => m[1]);
	const candidates = (tagged.length > 0 ? tagged : fences).reverse();
	for (const m of candidates) {
		const body = (m[2] || "").trim();
		if (!body.startsWith("{")) continue;
		try {
			const parsed = JSON.parse(body) as unknown;
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
			const obj = parsed as Record<string, unknown>;
			if (m[1] || "relevant_files" in obj || "relevantFiles" in obj) return obj;
		} catch {
			/* 壊れた JSON は無視して Markdown 側の復元に任せる */
		}
	}
	return null;
}

function readStructuredFiles(obj: Record<string, unknown>): ContextFile[] {
	const raw = (obj.relevant_files ?? obj.relevantFiles) as unknown;
	if (!Array.isArray(raw)) return [];
	const out: ContextFile[] = [];
	for (const entry of raw) {
		if (typeof entry === "string") {
			const p = normalizePath(entry);
			if (looksLikePath(p)) out.push({ path: p });
			continue;
		}
		if (!entry || typeof entry !== "object") continue;
		const rec = entry as Record<string, unknown>;
		const p = normalizePath(String(rec.path ?? rec.file ?? ""));
		if (!looksLikePath(p)) continue;
		const symbols = Array.isArray(rec.symbols)
			? rec.symbols.filter((s): s is string => typeof s === "string")
			: undefined;
		out.push({
			path: p,
			reason: typeof rec.reason === "string" ? rec.reason.trim() : undefined,
			...(symbols && symbols.length > 0 ? { symbols } : {}),
		});
	}
	return out;
}

function readStringArray(obj: Record<string, unknown>, ...keys: string[]): string[] {
	for (const key of keys) {
		const raw = obj[key];
		if (Array.isArray(raw)) {
			return raw.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
		}
	}
	return [];
}

/**
 * `### \`path/to/file\`` + fenced code block 形式のレポートからファイル本文を取り出す。
 * Orchestra 側のローカル file-search / サーバ側 file-searcher の双方がこの形を出す。
 */
function extractFileBodies(markdown: string): Record<string, string> {
	const bodies: Record<string, string> = {};
	const lines = markdown.split("\n");
	let i = 0;
	while (i < lines.length) {
		const heading = lines[i].match(FILE_HEADING_RE);
		if (!heading) {
			i++;
			continue;
		}
		const filePath = normalizePath(heading[1]);
		i++;
		// 見出しの直後（空行を挟んでも可）にコードフェンスが来る場合だけ本文とみなす
		while (i < lines.length && lines[i].trim() === "") i++;
		if (i >= lines.length || !FENCE_RE.test(lines[i])) continue;
		i++;
		const buf: string[] = [];
		while (i < lines.length && !FENCE_RE.test(lines[i])) {
			buf.push(lines[i]);
			i++;
		}
		i++; // 閉じフェンス
		if (!looksLikePath(filePath)) continue;
		const body = buf.join("\n");
		if (body.trim()) bodies[filePath] = body;
	}
	return bodies;
}

/** ツリー表示やファイル一覧の行（`- src/foo.ts`, `├── bar.ts` 等）か。 */
function isBarePathLine(line: string): boolean {
	const content = line.replace(/^[\s\-*+│├└─|`]+/, "").replace(/[\s`]+$/, "");
	if (!content) return false;
	return looksLikePath(normalizePath(content));
}

/**
 * レポート冒頭（最初のファイル見出しまで）をサマリとして使う。
 * ディレクトリツリーやファイル一覧は Level 1 で別途描画するので、ここでは落とす。
 */
function extractSummary(markdown: string, structured: Record<string, unknown> | null): string {
	const fromJson = structured && typeof structured.summary === "string" ? structured.summary.trim() : "";
	if (fromJson) return fromJson.slice(0, MAX_SUMMARY_CHARS);

	const lines = markdown.split("\n");
	const buf: string[] = [];
	for (const line of lines) {
		if (FILE_HEADING_RE.test(line)) break;
		if (FENCE_RE.test(line)) break;
		if (isBarePathLine(line)) continue;
		if (/ディレクトリツリー|directory tree/i.test(line)) continue;
		buf.push(line);
		if (buf.join("\n").length > MAX_SUMMARY_CHARS) break;
	}
	return buf.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_SUMMARY_CHARS);
}

/** import / require / from 文からファイル間の依存エッジを推定する。 */
function deriveDependencies(bodies: Record<string, string>, knownFiles: string[]): string[] {
	const known = new Set(knownFiles);
	/** 拡張子を落としたパス -> 実パス（相対 import の解決用） */
	const byStem = new Map<string, string>();
	for (const f of knownFiles) {
		const stem = f.replace(/\.[A-Za-z0-9]+$/, "");
		if (!byStem.has(stem)) byStem.set(stem, f);
		const idx = stem.match(/\/index$/) ? stem.replace(/\/index$/, "") : "";
		if (idx && !byStem.has(idx)) byStem.set(idx, f);
	}

	const resolve = (fromFile: string, spec: string): string | null => {
		if (!spec.startsWith(".")) {
			// 非相対 import はエイリアス (@/foo) だけ拾う
			const aliased = spec.replace(/^[@~]\//, "");
			if (aliased === spec) return null;
			for (const prefix of ["src/", "app/", ""]) {
				const cand = byStem.get(prefix + aliased);
				if (cand) return cand;
			}
			return null;
		}
		const dir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
		const segments = (dir ? dir + "/" + spec : spec).split("/");
		const stack: string[] = [];
		for (const seg of segments) {
			if (seg === "." || seg === "") continue;
			if (seg === "..") {
				stack.pop();
				continue;
			}
			stack.push(seg);
		}
		const joined = stack.join("/");
		if (known.has(joined)) return joined;
		return byStem.get(joined) ?? null;
	};

	const edges: string[] = [];
	const importRe = /(?:import\s[^'"\n]*from\s*|import\s*|require\s*\(\s*|from\s+)['"]([^'"\n]+)['"]/g;
	for (const [file, body] of Object.entries(bodies)) {
		for (const m of body.matchAll(importRe)) {
			const target = resolve(file, m[1]);
			if (!target || target === file) continue;
			edges.push(`${file} -> ${target}`);
		}
	}
	return uniq(edges).slice(0, MAX_DEPENDENCY_EDGES);
}

/** export された関数 / クラス / 定数名を主要シンボルとして拾う。 */
function deriveSymbols(bodies: Record<string, string>): Record<string, string[]> {
	const symbolRe =
		/(?:export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|interface|type|enum)\s+([A-Za-z_$][\w$]*)|^\s*(?:public\s+)?class\s+([A-Za-z_$][\w$]*)|^\s*def\s+([A-Za-z_$][\w$]*))/gm;
	const out: Record<string, string[]> = {};
	for (const [file, body] of Object.entries(bodies)) {
		const found: string[] = [];
		for (const m of body.matchAll(symbolRe)) {
			const name = m[1] || m[2] || m[3];
			// 1〜2 文字の名前はほぼノイズ（`t`, `x` 等）なので落とす
			if (name && name.length >= 3) found.push(name);
		}
		if (found.length > 0) out[file] = uniq(found).slice(0, 12);
	}
	return out;
}

export function emptyProjectContext(): ProjectContext {
	return {
		summary: "",
		files: [],
		relevantFiles: [],
		dependencies: [],
		symbols: [],
		bodies: {},
		sourceChars: 0,
	};
}

export function isEmptyProjectContext(ctx: ProjectContext | null | undefined): boolean {
	if (!ctx) return true;
	return (
		ctx.files.length === 0 &&
		ctx.relevantFiles.length === 0 &&
		ctx.dependencies.length === 0 &&
		!ctx.summary.trim()
	);
}

/**
 * file-searcher の Markdown レポートを構造化コンテキストに変換する。
 * 構造化 JSON ブロックがあればそれを優先し、無ければ Markdown から復元する。
 */
export function parseProjectContext(markdown: string): ProjectContext {
	const text = String(markdown ?? "");
	if (!text.trim()) return emptyProjectContext();

	const structured = extractStructuredBlock(text);
	const bodies = extractFileBodies(text);

	// 1. ファイル一覧: 本文つき見出し + JSON の relevant_files + 本文中のパスらしき文字列
	const structuredFiles = structured ? readStructuredFiles(structured) : [];
	const pathsInProse: string[] = [];
	for (const m of text.matchAll(PATH_LIKE_RE)) {
		const p = normalizePath(m[1]);
		if (looksLikePath(p)) pathsInProse.push(p);
	}
	const files = uniq([
		...Object.keys(bodies),
		...structuredFiles.map((f) => f.path),
		...pathsInProse,
	]);

	// 2. シンボル（ファイル単位 → 全体）
	const symbolsByFile = deriveSymbols(bodies);
	const structuredSymbols = structured ? readStringArray(structured, "symbols") : [];

	// 3. relevantFiles: JSON があればそれを正とし、無ければ本文つきファイルを関連ファイルとみなす
	const relevantFiles: ContextFile[] = [];
	const seenRelevant = new Set<string>();
	const pushRelevant = (f: ContextFile) => {
		if (seenRelevant.has(f.path)) return;
		seenRelevant.add(f.path);
		relevantFiles.push({
			...f,
			symbols: f.symbols && f.symbols.length > 0 ? f.symbols : symbolsByFile[f.path],
		});
	};
	for (const f of structuredFiles) pushRelevant(f);
	for (const p of Object.keys(bodies)) pushRelevant({ path: p });

	// 4. 依存関係
	const structuredDeps = structured ? readStringArray(structured, "dependencies") : [];
	const derivedDeps = deriveDependencies(bodies, files);

	return {
		summary: extractSummary(text, structured),
		files,
		relevantFiles,
		dependencies: uniq([...structuredDeps, ...derivedDeps]).slice(0, MAX_DEPENDENCY_EDGES),
		symbols: uniq([
			...structuredSymbols,
			...Object.values(symbolsByFile).flat(),
		]).slice(0, MAX_SYMBOLS),
		bodies,
		sourceChars: text.length,
	};
}

/**
 * file-searcher を Context Manager として使うためのマージ。
 * 2 回目以降の調査結果は既存コンテキストを置き換えず、差分を積み上げる。
 */
export function mergeProjectContext(base: ProjectContext | null, next: ProjectContext): ProjectContext {
	if (!base || isEmptyProjectContext(base)) return next;
	if (isEmptyProjectContext(next)) return base;

	const relevantFiles: ContextFile[] = [];
	const seen = new Set<string>();
	for (const f of [...next.relevantFiles, ...base.relevantFiles]) {
		if (seen.has(f.path)) continue;
		seen.add(f.path);
		relevantFiles.push(f);
	}

	return {
		summary: next.summary.trim() || base.summary,
		files: uniq([...base.files, ...next.files]),
		relevantFiles,
		dependencies: uniq([...base.dependencies, ...next.dependencies]).slice(0, MAX_DEPENDENCY_EDGES),
		symbols: uniq([...base.symbols, ...next.symbols]).slice(0, MAX_SYMBOLS),
		bodies: { ...base.bodies, ...next.bodies },
		sourceChars: base.sourceChars + next.sourceChars,
	};
}

// --- Level 2: role-based relevance ---

interface RoleRelevance {
	/** このロールにとって主戦場となるパスキーワード（強く加点） */
	primary: string[];
	/** 参考として見たいパスキーワード（弱く加点） */
	secondary: string[];
	/** パスに含まれると減点されるキーワード */
	demote: string[];
	/** Level 2 でファイル本文を添付するか（false なら Level 1 のみ） */
	attachBodies: boolean;
	/** 本文添付の合計文字数上限 */
	bodyBudgetChars: number;
}

const TEST_HINTS = ["test", "spec", "__tests__", "e2e", "cypress", "playwright"];
const DOC_HINTS = ["readme", "docs/", ".md", "changelog", "license"];
const SECURITY_HINTS = [
	"auth", "login", "session", "token", "jwt", "oauth", "password", "crypt",
	"secret", "env", "middleware", "permission", "role", "acl", "cors", "csrf",
];
const UI_HINTS = [
	"component", "components", "page", "pages", "view", "views", "style", "styles",
	"css", "scss", "tailwind", "theme", "layout", "ui/", ".tsx", ".jsx", ".vue", ".svelte", ".html",
];
const CONFIG_HINTS = [
	"package.json", "tsconfig", "vite.config", "next.config", "webpack", "dockerfile",
	"docker-compose", ".yml", ".yaml", ".toml", "makefile",
];

const ROLE_RELEVANCE: Record<string, RoleRelevance> = {
	coder: { primary: ["src/", "app/", "lib/", "components/", "pages/", "api/"], secondary: CONFIG_HINTS, demote: [...TEST_HINTS, ...DOC_HINTS], attachBodies: true, bodyBudgetChars: 60000 },
	writer: { primary: DOC_HINTS, secondary: ["src/", "app/"], demote: TEST_HINTS, attachBodies: true, bodyBudgetChars: 20000 },
	reviewer: { primary: ["src/", "app/", "lib/"], secondary: [...TEST_HINTS, ...CONFIG_HINTS], demote: DOC_HINTS, attachBodies: true, bodyBudgetChars: 40000 },
	tester: { primary: TEST_HINTS, secondary: ["src/", "api/", "app/"], demote: DOC_HINTS, attachBodies: true, bodyBudgetChars: 40000 },
	"security-reviewer": { primary: SECURITY_HINTS, secondary: ["api/", "server/", ...CONFIG_HINTS], demote: [...DOC_HINTS, ...TEST_HINTS], attachBodies: true, bodyBudgetChars: 40000 },
	security: { primary: SECURITY_HINTS, secondary: ["api/", "server/", ...CONFIG_HINTS], demote: [...DOC_HINTS, ...TEST_HINTS], attachBodies: true, bodyBudgetChars: 40000 },
	designer: { primary: UI_HINTS, secondary: ["src/", "app/"], demote: [...TEST_HINTS, "api/", "server/"], attachBodies: true, bodyBudgetChars: 30000 },
	documenter: { primary: DOC_HINTS, secondary: ["src/"], demote: TEST_HINTS, attachBodies: true, bodyBudgetChars: 20000 },
	planner: { primary: CONFIG_HINTS, secondary: [], demote: [], attachBodies: false, bodyBudgetChars: 0 },
	leader: { primary: CONFIG_HINTS, secondary: [], demote: [], attachBodies: false, bodyBudgetChars: 0 },
	ideaman: { primary: DOC_HINTS, secondary: [], demote: TEST_HINTS, attachBodies: false, bodyBudgetChars: 0 },
	searcher: { primary: [], secondary: [], demote: [], attachBodies: false, bodyBudgetChars: 0 },
	researcher: { primary: [], secondary: [], demote: [], attachBodies: false, bodyBudgetChars: 0 },
	imager: { primary: UI_HINTS, secondary: [], demote: [], attachBodies: false, bodyBudgetChars: 0 },
};

const DEFAULT_RELEVANCE: RoleRelevance = {
	primary: [],
	secondary: [],
	demote: [],
	attachBodies: true,
	bodyBudgetChars: 16000,
};

/** 呼び出し側ごとに表記が揺れるロール名を ROLE_RELEVANCE のキーに寄せる。 */
const ROLE_SLUG_ALIASES: Record<string, string> = {
	coding: "coder",
	code: "coder",
	writing: "writer",
	design: "designer",
	review: "reviewer",
	image: "imager",
	planning: "planner",
	test: "tester",
	testing: "tester",
	qa: "tester",
	"file-search": "file-searcher",
	file_search: "file-searcher",
	filesearch: "file-searcher",
	filesearcher: "file-searcher",
	"security-review": "security-reviewer",
	securityreviewer: "security-reviewer",
	"deep-research": "researcher",
	research: "researcher",
	search: "searcher",
};

/** ロール名を正規化する（`filesearch` → `file-searcher` など）。 */
export function normalizeContextRoleSlug(roleSlug: string): string {
	const raw = String(roleSlug ?? "").trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
	if (!raw) return "";
	return ROLE_SLUG_ALIASES[raw] ?? ROLE_SLUG_ALIASES[raw.replace(/-/g, "_")] ?? raw;
}

export function relevanceForRole(roleSlug: string): RoleRelevance {
	return ROLE_RELEVANCE[normalizeContextRoleSlug(roleSlug)] ?? DEFAULT_RELEVANCE;
}

/**
 * ロールに関連するファイルを優先度順に返す。
 * file-searcher が付けた relevantFiles の順序を基準に、ロール別のキーワードで並べ替える。
 */
export function selectRelevantFilesForRole(
	ctx: ProjectContext,
	roleSlug: string,
	limit = DEFAULT_MAX_ATTACHED_FILES
): ContextFile[] {
	const rel = relevanceForRole(roleSlug);
	const candidates: ContextFile[] =
		ctx.relevantFiles.length > 0 ? ctx.relevantFiles : ctx.files.map((path) => ({ path }));

	const scored = candidates.map((file, index) => {
		const lower = file.path.toLowerCase();
		// file-searcher が付けた順序を基礎点にする（先頭ほど高い）
		let score = Math.max(0, 100 - index);
		for (const kw of rel.primary) {
			if (lower.includes(kw)) score += 60;
		}
		for (const kw of rel.secondary) {
			if (lower.includes(kw)) score += 15;
		}
		for (const kw of rel.demote) {
			if (lower.includes(kw)) score -= 45;
		}
		// 本文を持っているファイルは Level 2 で実際に渡せるので優先
		if (ctx.bodies[file.path]) score += 15;
		return { file, score, index };
	});

	scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));
	return scored.slice(0, Math.max(0, limit)).map((s) => s.file);
}

// --- Rendering ---

function renderFileLine(file: ContextFile): string {
	const reason = file.reason ? ` — ${file.reason}` : "";
	const symbols =
		file.symbols && file.symbols.length > 0 ? ` _(${file.symbols.slice(0, 6).join(", ")})_` : "";
	return `- \`${file.path}\`${reason}${symbols}`;
}

function languageForPath(p: string): string {
	const ext = p.includes(".") ? p.slice(p.lastIndexOf(".") + 1) : "";
	return ext || "text";
}

/**
 * Level 1: 全ロールに配る共有コンテキスト。
 * ファイル本文は含めず、構造と関係性だけを渡す。
 */
export function renderSharedContext(ctx: ProjectContext, opts: RenderOptions = {}): string {
	if (isEmptyProjectContext(ctx)) return "";
	const maxListed = opts.maxListedFiles ?? DEFAULT_MAX_LISTED_FILES;

	const lines: string[] = [
		"# プロジェクト共有コンテキスト（file-searcher が生成）",
		"",
		"> これはワークスペースの現状を要約した共有コンテキストです。すべてのロールが同じものを参照しています。",
		"> ここに本文が載っていないファイルは、必要になった時点であなたのツール（read_file / search_files 等）で読み取ってください。",
		"",
	];

	if (ctx.summary.trim()) {
		lines.push("## サマリ", "", ctx.summary.trim(), "");
	}

	if (ctx.relevantFiles.length > 0) {
		lines.push("## 関連ファイル", "");
		for (const f of ctx.relevantFiles.slice(0, maxListed)) lines.push(renderFileLine(f));
		if (ctx.relevantFiles.length > maxListed) {
			lines.push(`- _（他 ${ctx.relevantFiles.length - maxListed} 件）_`);
		}
		lines.push("");
	}

	const listedPaths = new Set(ctx.relevantFiles.map((f) => f.path));
	const otherFiles = ctx.files.filter((p) => !listedPaths.has(p));
	if (otherFiles.length > 0) {
		lines.push("## その他の発見ファイル", "");
		for (const p of otherFiles.slice(0, maxListed)) lines.push(`- \`${p}\``);
		if (otherFiles.length > maxListed) {
			lines.push(`- _（他 ${otherFiles.length - maxListed} 件）_`);
		}
		lines.push("");
	}

	if (ctx.dependencies.length > 0) {
		lines.push("## 依存関係", "");
		for (const d of ctx.dependencies) lines.push(`- ${d}`);
		lines.push("");
	}

	if (ctx.symbols.length > 0) {
		lines.push("## 主要シンボル", "", ctx.symbols.map((s) => `\`${s}\``).join(", "), "");
	}

	return lines.join("\n").trimEnd();
}

/**
 * Level 2: ロールごとの関連ファイル本文。
 * `renderSharedContext` の続きとして使うことを想定している。
 */
export function renderRoleFileContext(
	ctx: ProjectContext,
	roleSlug: string,
	opts: RenderOptions = {}
): string {
	const rel = relevanceForRole(roleSlug);
	if (!rel.attachBodies) return "";

	const budget = opts.bodyBudgetChars ?? rel.bodyBudgetChars;
	if (budget <= 0) return "";

	const normalizedRole = normalizeContextRoleSlug(roleSlug) || roleSlug;
	const files = selectRelevantFilesForRole(ctx, roleSlug, opts.maxAttachedFiles ?? DEFAULT_MAX_ATTACHED_FILES);
	const lines: string[] = [];
	let used = 0;
	let attached = 0;
	const skipped: string[] = [];

	for (const file of files) {
		const body = ctx.bodies[file.path];
		if (!body) continue;
		if (used >= budget) {
			skipped.push(file.path);
			continue;
		}
		const remaining = Math.min(budget - used, MAX_BODY_CHARS_PER_FILE);
		const clipped = body.length > remaining ? body.slice(0, remaining) + "\n... (以降は省略。全文が必要ならツールで読んでください)" : body;
		lines.push(`### \`${file.path}\`${file.reason ? ` — ${file.reason}` : ""}`);
		lines.push("```" + languageForPath(file.path));
		lines.push(clipped);
		lines.push("```");
		lines.push("");
		used += clipped.length;
		attached++;
	}

	if (attached === 0) return "";

	const header = [
		`## ${normalizedRole} 向けの関連ファイル本文（${attached} 件）`,
		"",
		"> このロールの作業に必要と判断したファイルだけを添付しています。他のファイルが必要になったらツールで読んでください。",
		"",
	];
	const footer = skipped.length > 0
		? [`> 予算超過のため本文を省略したファイル: ${skipped.map((p) => `\`${p}\``).join(", ")}`, ""]
		: [];

	return [...header, ...lines, ...footer].join("\n").trimEnd();
}

/**
 * Level 1 + Level 2 をまとめたロール向けコンテキスト。
 * これが「全ロールに渡すが、全文は渡さない」の実体。
 */
export function renderContextForRole(
	ctx: ProjectContext,
	roleSlug: string,
	opts: RenderOptions = {}
): string {
	if (isEmptyProjectContext(ctx)) return "";
	const shared = renderSharedContext(ctx, opts);
	const roleFiles = renderRoleFileContext(ctx, roleSlug, opts);
	return [shared, roleFiles].filter(Boolean).join("\n\n");
}
