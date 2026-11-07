/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Keeping a Division Project on its goal (the same rules as Division's cloud agent, src/services/cloud-agent/drift.ts).
 *
 * The more often AI revises the documents, the further they drift from what the user first asked for.
 * Following the specification is not the same as serving the user's goal: if the specification itself
 * drifts, a coder that follows it perfectly still builds the wrong thing. So:
 *
 *   .division/goal.md     the goal the user set first. Written once from the first request; AI never changes it
 *                         (a change made during a flow is undone). Only the user edits it.
 *   .division/changes.md  one entry per update of a living document: what changed, why, and the line counts.
 *   drift check           before the coder implements, the reviewer compares the documents with goal.md and the
 *                         flow stops for the user when they have drifted (.division/drift.md).
 *
 * Pure helpers only; the IDE's main process reads and writes the files.
 */

/** File names under .division/ */
export const GOAL_FILE = 'goal.md';
export const CHANGES_FILE = 'changes.md';
export const DRIFT_FILE = 'drift.md';

/** goal.md written from the user's first request, when the project has none. */
export const goalDocument = (request: string, date: Date = new Date()): string => `# 目的

> このファイルはユーザーが最初に決めた目的で、論文・仕様書・デザイン・実装のすべてを判断する最上位の基準です。
> AI は変更しません。目的を変えるときは、ユーザーがこのファイルを直接編集してください。

## 最初の依頼 (${date.toISOString().slice(0, 10)})

${request.trim()}
`;

/** The block every role's instruction starts with: the goal, and that it is not to be changed. */
export const goalInstructionBlock = (goal: string): string => goal.trim()
	? [
		`## 目的 (.division/${GOAL_FILE}) — 最上位の基準`,
		`ユーザーが最初に決めた目的です。論文・仕様書・デザイン・実装のすべてをこれに照らして判断してください。仕様書どおりでも、目的から外れていれば正しくありません。`,
		`このファイルは変更しないでください (目的を変えるのはユーザーだけです)。依頼や文書が目的と食い違うと思ったら、回答の最後にそう書いてください。`,
		``,
		'````markdown',
		goal.trim(),
		'````',
	].join('\n')
	: '';

/** Lines added and removed between two versions (multiset of lines; good enough for a change log). */
export const lineChanges = (before: string, after: string): { added: number; removed: number } => {
	const count = (s: string) => {
		const m = new Map<string, number>();
		for (const l of s ? s.split('\n') : []) m.set(l, (m.get(l) ?? 0) + 1);
		return m;
	};
	const a = count(before);
	const b = count(after);
	let added = 0;
	let removed = 0;
	for (const [l, n] of b) added += Math.max(0, n - (a.get(l) ?? 0));
	for (const [l, n] of a) removed += Math.max(0, n - (b.get(l) ?? 0));
	return { added, removed };
};

/**
 * Why the document was changed, as its author wrote it: the last entry of its "## 変更履歴" section
 * (the paper and the specification keep one), or '' when there is none.
 */
export const latestChangeNote = (doc: string): string => {
	const at = doc.search(/^##\s*変更履歴\s*$/m);
	if (at < 0) return '';
	const rest = doc.slice(at).split('\n').slice(1);
	const end = rest.findIndex(l => /^#{1,2}\s/.test(l));
	// bullets, numbered items or table rows (not the header separator)
	const items = (end < 0 ? rest : rest.slice(0, end)).map(l => l.trim()).filter(l => l && !/^\|?\s*:?-{3,}/.test(l));
	const last = items[items.length - 1] ?? '';
	return last.replace(/^([-*]|\d+\.)\s+/, '').replace(/^\||\|$/g, '').replace(/\s*\|\s*/g, ' — ').trim();
};

export const CHANGES_HEADER = `# 変更履歴 (論文・仕様書・デザイン)

生きた文書を更新するたびに、何を・なぜ変えたかを記録します。新しい記録は下に追加されます。
基準は .division/${GOAL_FILE} (ユーザーが最初に決めた目的) です。前の版は .division/history/ に残っています。
`;

export type ChangeEntry = {
	label: string;
	role: string;
	title: string;
	request: string;
	/** What changed and why. */
	why: string;
	added: number;
	removed: number;
	/** Workspace-relative folder of the earlier version, or null when the document is new. */
	snapshot: string | null;
	date?: Date;
};

export const changeEntry = (c: ChangeEntry): string => {
	const when = (c.date ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z');
	const oneLine = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);
	return [
		``,
		`## ${when} — ${c.label}`,
		`- 担当: [${c.role}] ${oneLine(c.title, 200)}`,
		`- 依頼: ${oneLine(c.request, 300) || '(なし)'}`,
		`- 何を・なぜ: ${oneLine(c.why, 1500) || '(理由の記載なし。文書の「## 変更履歴」に理由を書くこと)'}`,
		`- 差分: +${c.added} / -${c.removed} 行${c.snapshot ? ` (前の版: ${c.snapshot}/)` : ' (新規作成)'}`,
		``,
	].join('\n');
};

// ---------------------------------------------------------------------------
// Drift check
// ---------------------------------------------------------------------------

export const DRIFT_CHECK_PROMPT = `あなたは AI エージェントチームの Reviewer として、実装を始める前に「ドリフト検証」を行います。
ドリフトとは、AI が文書の修正を重ねるうちに、論文・仕様書・デザインがユーザーの当初の目的から少しずつ離れてしまうことです。
最上位の基準は .division/${GOAL_FILE} (ユーザーが最初に決めた目的) です。仕様書どおりであることと、目的どおりであることは別の問題です。仕様書そのものが目的から変質していないかを見てください。

論文・仕様書・デザインのそれぞれを目的と比べ、次のどれかに当たるものを逸脱とします:
- 目的が求めることを削った・弱めた・別のものに置き換えた
- 目的に無い機能・対象ユーザー・方針を、目的の代わりに中心に据えている
- 目的と矛盾する決定がある
目的を具体化しただけのもの、目的の達成に必要な補足、ユーザーの後からの依頼に沿った追加、細かな表現の違いは逸脱ではありません。
変更履歴があれば、どの変更で離れたかの手がかりにしてください。確信が持てないものは逸脱にせず notes に書いてください。

JSON だけを返してください (説明文は不要。コードブロックも不要):
{"drift": true | false, "issues": [{"document": "<文書>", "finding": "<何が目的から離れているか>", "goal": "<目的のどの点に反するか>"}], "notes": "<気になる点 (任意)>", "reason": "<判定の理由を 1〜2 文で>"}`;

export type DriftDocuments = { goal: string; paper?: string; spec?: string; design?: string; changes?: string };

export const hasDocumentsToCheck = (d: DriftDocuments): boolean => !!d.goal.trim() && !!(d.paper?.trim() || d.spec?.trim() || d.design?.trim());

export const driftCheckInput = (d: DriftDocuments, request: string): string => [
	`## 目的 (.division/${GOAL_FILE})\n${d.goal}`,
	request.trim() ? `## 今回の依頼\n${request.trim().slice(0, 4000)}` : '',
	d.paper ? `## 論文 (.division/paper.md)\n${d.paper}` : '',
	d.spec ? `## 仕様書 (.division/specification.md)\n${d.spec}` : '',
	d.design ? `## デザイン (.division/design/ のページ一覧と index.html)\n${d.design}` : '',
	d.changes ? `## 変更履歴 (最近のもの)\n${d.changes}` : '',
].filter(Boolean).join('\n\n');

export type DriftIssue = { document: string; finding: string; goal: string };
export type DriftVerdict = { drift: boolean | null; issues: DriftIssue[]; notes: string; reason: string };

export const parseDriftVerdict = (output: string): DriftVerdict => {
	let v: Record<string, unknown> | null = null;
	const fence = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(output);
	for (const c of [fence?.[1], output]) {
		if (!c) continue;
		const s = c.indexOf('{');
		const e = c.lastIndexOf('}');
		if (s < 0 || e <= s) continue;
		try { v = JSON.parse(c.slice(s, e + 1)); break; } catch { /* next */ }
	}
	const str = (x: unknown, n: number) => (typeof x === 'string' ? x.trim().slice(0, n) : '');
	const issues = Array.isArray(v?.issues)
		? (v!.issues as unknown[])
			.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
			.map(i => ({ document: str(i.document, 200), finding: str(i.finding, 1000), goal: str(i.goal, 500) }))
			.filter(i => i.finding)
			.slice(0, 12)
		: [];
	return { drift: v && typeof v.drift === 'boolean' ? v.drift : null, issues, notes: str(v?.notes, 1500), reason: str(v?.reason, 800) };
};

export const driftReport = (v: DriftVerdict, taskTitle: string, date: Date = new Date()): string => {
	const issues = v.issues.length
		? v.issues.map((i, n) => `${n + 1}. **${i.document || '文書'}**: ${i.finding}${i.goal ? `\n   - 目的との関係: ${i.goal}` : ''}`).join('\n')
		: '(具体的な指摘なし)';
	return `# ドリフト検証: 実装を止めました

${date.toISOString().slice(0, 10)} — 次の実装「${taskTitle}」の前に、文書を .division/${GOAL_FILE} (ユーザーが最初に決めた目的) と比べたところ、目的から離れている点が見つかりました。

## 判定の理由
${v.reason || '(なし)'}

## 目的から離れている点
${issues}
${v.notes ? `\n## そのほか気になる点\n${v.notes}\n` : ''}
## どう進めるか
- **承認**: 指摘を確認したうえで、このまま実装を進めます。
- **やり直す**: 承認せずに、どう直すか (例: 「仕様書の○○を目的に合わせて戻して」) をチャットで送ってください。Leader が計画を立て直します。
- 目的そのものを変えたいときは、.division/${GOAL_FILE} を編集してから送ってください。
`;
};
