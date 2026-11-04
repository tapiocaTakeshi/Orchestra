/*--------------------------------------------------------------------------------------
 *  Persistent app-production workflow for Division Project mode.
 *  Research -> Specification -> Design -> Implementation.
 *--------------------------------------------------------------------------------------*/

export const APP_PAPER_FILE = 'paper.md';
export const APP_SPECIFICATION_FILE = 'specification.md';
export const APP_DESIGN_DIR = 'design';

export type AppWorkflowTask = {
	taskId: string;
	role: string;
	title: string;
	dependsOn?: string[];
	description?: string;
};

const roleStage = (role: string): number => {
	switch (role.toLowerCase()) {
		case 'search': case 'searcher': case 'research': case 'researcher':
		case 'deep-research': case 'deep-researcher': return 0;
		case 'writing': case 'writer': return 1;
		case 'design': case 'designer': return 2;
		case 'coder': case 'coding': case 'code': return 3;
		default: return -1;
	}
};

/**
 * Apply the four-stage workflow only to app/software creation requests.
 * Bug fixes, general questions, and standalone writing tasks are not forced through it.
 */
export function isAppCreationRequest(request: string): boolean {
	const app = /(アプリ|ソフトウェア|プログラム|ウェブサイト|webサイト|サービス開発|application|software|website|web\s*app|mobile\s*app|\bapp\b)/i.test(request);
	const creation = /(作成|制作|作る|開発|構築|新規|実装|設計|立ち上げ|create|build|develop|implement|design|make)/i.test(request);
	return app && creation;
}

/**
 * The Leader may omit a stage or assign backwards dependencies. Add only missing
 * stages and enforce the document dependency chain before topological sorting.
 * Do not discard unrelated tasks, task metadata or the Leader's valid dependencies.
 */
export function ensureAppWorkflowTasks<T extends AppWorkflowTask>(original: T[]): T[] {
	const tasks = original.map(t => ({ ...t, dependsOn: [...(t.dependsOn ?? [])] }));
	if (!tasks.some(t => roleStage(t.role) === 3)) return tasks;

	const stages: Array<{ role: string; title: string; description: string }> = [
		{ role: 'research', title: '論文・技術調査', description: '既存の paper.md を読み、根拠・関連研究・技術選定を追加更新する。' },
		{ role: 'writing', title: '仕様書更新', description: 'paper.md を根拠として specification.md を差分更新する。' },
		{ role: 'design', title: 'デザイン更新', description: 'specification.md をもとに既存 design/ 内の必要なページだけ更新する。' },
		{ role: 'coder', title: 'ソフトウェア実装', description: 'specification.md と design/ に従い既存コードを差分実装する。' },
	];
	for (let stage = 0; stage < stages.length - 1; stage++) {
		if (tasks.some(t => roleStage(t.role) === stage)) continue;
		const spec = stages[stage];
		let id = `auto-app-${spec.role}`;
		let suffix = 2;
		while (tasks.some(t => t.taskId === id)) id = `auto-app-${spec.role}-${suffix++}`;
		tasks.push({ taskId: id, role: spec.role, title: spec.title, description: spec.description, dependsOn: [] } as T);
	}

	for (const task of tasks) {
		const stage = roleStage(task.role);
		if (stage < 1) continue;
		// Remove only backward dependencies inside the four-stage workflow.
		const safeDependencies = (task.dependsOn ?? []).filter(id => {
			const source = tasks.find(t => t.taskId === id);
			return !source || roleStage(source.role) < 0 || roleStage(source.role) <= stage;
		});
		const previousStage = tasks.filter(t => roleStage(t.role) === stage - 1).map(t => t.taskId);
		task.dependsOn = [...new Set([...safeDependencies, ...previousStage].filter(id => id !== task.taskId))];
	}
	return tasks;
}

/**
 * Keep the full history of an app document, rather than replacing its contents.
 * The most recent update is authoritative where statements conflict.
 */
export function appendAppDocumentVersion(existing: string, update: string, timestamp: string): string {
	const next = update.trim();
	if (!next) return existing;
	const previous = existing.trimEnd();
	if (!previous) return next + '\n';
	if (previous === next || previous.endsWith('\n\n' + next)) return previous + '\n';
	return previous + '\n\n---\n\n## 更新 ' + timestamp + '\n\n' + next + '\n';
}
