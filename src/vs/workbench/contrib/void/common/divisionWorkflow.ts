/*--------------------------------------------------------------------------------------
 *  Division Project workflow (the leader's plan as a node graph that the user approves).
 *
 *  Same format as the Division API (src/services/cloud-agent/workflow.ts) and the Division
 *  website's editor, written to .division/workflow.json:
 *    { version: 1, enabled: true,
 *      nodes: [{ id, type: 'start' | 'role' | 'approval' | 'end', position: { x, y }, data }],
 *      edges: [{ id, source, target }] }
 *    role      data: { role, title?, instruction?, systemPrompt? }
 *    approval  data: { title? } — the user checks the result of the role step(s) before it
 *  Pure functions only: used by the main process (running the steps) and the UI (drawing and editing).
 *--------------------------------------------------------------------------------------*/

export type WorkflowNodeType = 'start' | 'role' | 'approval' | 'end';

export type WorkflowNodeData = {
	role?: string;
	title?: string;
	instruction?: string;
	/** This step's own system prompt, added after the role's prompt. */
	systemPrompt?: string;
};

export type WorkflowNode = {
	id: string;
	type: WorkflowNodeType;
	position: { x: number; y: number };
	data: WorkflowNodeData;
};

export type WorkflowEdge = { id: string; source: string; target: string };

export type DivisionWorkflow = {
	version: 1;
	enabled: boolean;
	nodes: WorkflowNode[];
	edges: WorkflowEdge[];
};

export type WorkflowStep = {
	nodeId: string;
	role: string;
	title: string;
	instruction: string;
	systemPrompt: string;
	/** An approval node follows this step. */
	approval: boolean;
	/** Indices of the earlier steps this one follows. */
	dependsOn: number[];
};

export const WORKFLOW_FILE_NAME = 'workflow.json';
export const MAX_WORKFLOW_STEPS = 20;
const COLUMN_X = 270;
const ROW_Y = 150;

const str = (v: unknown, max = 8000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Normalise stored or received JSON into a workflow (null when it is not one). */
export const normalizeWorkflow = (raw: unknown): DivisionWorkflow | null => {
	let v = raw;
	if (typeof v === 'string') {
		try { v = JSON.parse(v); } catch { return null; }
	}
	if (!v || typeof v !== 'object') return null;
	const w = v as Record<string, unknown>;
	if (!Array.isArray(w.nodes) || !Array.isArray(w.edges)) return null;
	const types = new Set<WorkflowNodeType>(['start', 'role', 'approval', 'end']);
	const nodes: WorkflowNode[] = [];
	for (const n of w.nodes as unknown[]) {
		if (!n || typeof n !== 'object') continue;
		const o = n as Record<string, unknown>;
		if (typeof o.id !== 'string' || !o.id || !types.has(o.type as WorkflowNodeType) || nodes.some(x => x.id === o.id)) continue;
		const pos = (o.position ?? {}) as Record<string, unknown>;
		const data = (o.data ?? {}) as Record<string, unknown>;
		const type = o.type as WorkflowNodeType;
		const d: WorkflowNodeData = {};
		if (type === 'role') d.role = str(data.role, 100);
		if ((type === 'role' || type === 'approval') && str(data.title, 120)) d.title = str(data.title, 120);
		if (type === 'role' && str(data.instruction, 4000)) d.instruction = str(data.instruction, 4000);
		if (type === 'role' && str(data.systemPrompt)) d.systemPrompt = str(data.systemPrompt);
		const x = Number(pos.x);
		const y = Number(pos.y);
		nodes.push({ id: o.id, type, position: { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }, data: d });
	}
	const ids = new Set(nodes.map(n => n.id));
	const edges: WorkflowEdge[] = [];
	for (const e of w.edges as unknown[]) {
		if (!e || typeof e !== 'object') continue;
		const o = e as Record<string, unknown>;
		const source = String(o.source ?? '');
		const target = String(o.target ?? '');
		if (!ids.has(source) || !ids.has(target) || source === target || edges.some(x => x.source === source && x.target === target)) continue;
		edges.push({ id: typeof o.id === 'string' && o.id ? o.id : `e-${source}-${target}`, source, target });
	}
	return { version: 1, enabled: w.enabled !== false, nodes, edges };
};

const byPosition = (a: WorkflowNode, b: WorkflowNode) => (a.position.y !== b.position.y ? a.position.y - b.position.y : a.position.x - b.position.x);

/** Run order from the start node; branches top to bottom; nodes on a cycle or unreachable are left out. */
export const workflowOrder = (w: Pick<DivisionWorkflow, 'nodes' | 'edges'>): WorkflowNode[] => {
	const byId = new Map(w.nodes.map(n => [n.id, n]));
	const out = new Map<string, string[]>();
	for (const e of w.edges) { if (!out.has(e.source)) { out.set(e.source, []); } out.get(e.source)!.push(e.target); }
	const starts = w.nodes.filter(n => n.type === 'start');
	const roots = starts.length ? starts : w.nodes.filter(n => !w.edges.some(e => e.target === n.id));
	const reach = new Set<string>();
	const stack = roots.map(n => n.id);
	while (stack.length) {
		const id = stack.pop()!;
		if (reach.has(id)) { continue; }
		reach.add(id);
		for (const t of out.get(id) ?? []) { stack.push(t); }
	}
	const indegree = new Map<string, number>();
	for (const id of reach) { indegree.set(id, 0); }
	for (const e of w.edges) { if (reach.has(e.source) && reach.has(e.target)) { indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1); } }
	const ready = [...reach].filter(id => indegree.get(id) === 0).map(id => byId.get(id)!);
	const order: WorkflowNode[] = [];
	while (ready.length) {
		ready.sort(byPosition);
		const n = ready.shift()!;
		order.push(n);
		for (const t of out.get(n.id) ?? []) {
			if (!reach.has(t)) { continue; }
			const d = (indegree.get(t) ?? 0) - 1;
			indegree.set(t, d);
			if (d === 0) { ready.push(byId.get(t)!); }
		}
	}
	return order;
};

/** The role steps in run order, with approvals and dependencies. */
export const workflowSteps = (w: Pick<DivisionWorkflow, 'nodes' | 'edges'>): WorkflowStep[] => {
	const byId = new Map(w.nodes.map(n => [n.id, n]));
	const incoming = new Map<string, string[]>();
	for (const e of w.edges) { if (!incoming.has(e.target)) { incoming.set(e.target, []); } incoming.get(e.target)!.push(e.source); }
	const needsApproval = new Set<string>();
	for (const n of w.nodes) {
		if (n.type !== 'approval') { continue; }
		const seen = new Set<string>();
		const stack = [...(incoming.get(n.id) ?? [])];
		while (stack.length) {
			const id = stack.pop()!;
			if (seen.has(id)) { continue; }
			seen.add(id);
			const src = byId.get(id);
			if (src?.type === 'role') { needsApproval.add(id); }
			else if (src?.type === 'approval') { stack.push(...(incoming.get(id) ?? [])); }
		}
	}
	const roles = workflowOrder(w).filter(n => n.type === 'role' && !!n.data.role).slice(0, MAX_WORKFLOW_STEPS);
	const indexOf = new Map(roles.map((n, i) => [n.id, i]));
	const ancestors = (id: string): number[] => {
		const found = new Set<number>();
		const seen = new Set<string>();
		const stack = [...(incoming.get(id) ?? [])];
		while (stack.length) {
			const src = stack.pop()!;
			if (seen.has(src)) { continue; }
			seen.add(src);
			if (indexOf.has(src)) { found.add(indexOf.get(src)!); }
			else { stack.push(...(incoming.get(src) ?? [])); }
		}
		return [...found].sort((a, b) => a - b);
	};
	return roles.map((n, i) => ({
		nodeId: n.id,
		role: (n.data.role ?? '').toLowerCase(),
		title: n.data.title ?? '',
		instruction: n.data.instruction ?? '',
		systemPrompt: n.data.systemPrompt ?? '',
		approval: needsApproval.has(n.id),
		dependsOn: ancestors(n.id).filter(d => d < i),
	}));
};

/** Why the workflow can't run as drawn (empty when it can). */
export const workflowErrors = (w: Pick<DivisionWorkflow, 'nodes' | 'edges'>): string[] => {
	const errors: string[] = [];
	if (w.nodes.filter(n => n.type === 'start').length !== 1) { errors.push('「開始」ノードはちょうど1つ必要です。'); }
	if (!w.nodes.some(n => n.type === 'end')) { errors.push('「終了」ノードが必要です。'); }
	const roles = w.nodes.filter(n => n.type === 'role');
	if (!roles.length) { errors.push('ロールのステップが1つ以上必要です。'); }
	if (roles.some(n => !n.data.role)) { errors.push('ロールを選んでいないステップがあります。'); }
	const order = new Set(workflowOrder(w).map(n => n.id));
	const start = w.nodes.find(n => n.type === 'start');
	if (start) {
		const reach = new Set<string>();
		const stack = [start.id];
		while (stack.length) {
			const id = stack.pop()!;
			if (reach.has(id)) { continue; }
			reach.add(id);
			for (const e of w.edges) { if (e.source === id) { stack.push(e.target); } }
		}
		if ([...reach].some(id => !order.has(id))) { errors.push('ループ (循環する接続) があります。'); }
		const lonely = roles.filter(n => !reach.has(n.id));
		if (lonely.length) { errors.push(`開始からつながっていないステップがあります (${lonely.map(n => n.data.title || n.data.role).join(', ')})。`); }
	}
	return errors;
};

/** Layered left-to-right layout (each node one column after its furthest predecessor). */
export const layoutWorkflow = (w: DivisionWorkflow): DivisionWorkflow => {
	const order = workflowOrder(w);
	const column = new Map<string, number>();
	for (const n of order) {
		const preds = w.edges.filter(e => e.target === n.id).map(e => column.get(e.source)).filter((c): c is number => c !== undefined);
		column.set(n.id, preds.length ? Math.max(...preds) + 1 : 0);
	}
	const cols = new Map<number, WorkflowNode[]>();
	for (const n of order) { const c = column.get(n.id)!; if (!cols.has(c)) { cols.set(c, []); } cols.get(c)!.push(n); }
	const placed = new Map<string, { x: number; y: number }>();
	for (const [c, col] of cols) { col.forEach((n, i) => placed.set(n.id, { x: c * COLUMN_X, y: Math.round((i - (col.length - 1) / 2) * ROW_Y) })); }
	let extra = 0;
	return { ...w, nodes: w.nodes.map(n => ({ ...n, position: placed.get(n.id) ?? { x: extra++ * COLUMN_X, y: ROW_Y * 3 } })) };
};

let idSeq = 0;
export const newWorkflowId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${++idSeq}`;

/**
 * Insert a node right after `afterId`: it takes over afterId's outgoing connections (so a step added
 * in the middle of a chain stays in it), then the graph is laid out again.
 */
export const insertAfter = (w: DivisionWorkflow, afterId: string, node: Omit<WorkflowNode, 'position'>): DivisionWorkflow => {
	const outgoing = w.edges.filter(e => e.source === afterId);
	const edges = [
		...w.edges.filter(e => e.source !== afterId),
		{ id: newWorkflowId('e'), source: afterId, target: node.id },
		...outgoing.map(e => ({ id: newWorkflowId('e'), source: node.id, target: e.target })),
	];
	return layoutWorkflow({ ...w, nodes: [...w.nodes, { ...node, position: { x: 0, y: 0 } }], edges });
};

const reaches = (edges: WorkflowEdge[], from: string, to: string): boolean => {
	const seen = new Set<string>();
	const stack = [from];
	while (stack.length) {
		const id = stack.pop()!;
		if (id === to) { return true; }
		if (seen.has(id)) { continue; }
		seen.add(id);
		for (const e of edges) { if (e.source === id) { stack.push(e.target); } }
	}
	return false;
};

/** Remove a node, connecting its predecessors to its successors (unless another path already joins them). */
export const removeNode = (w: DivisionWorkflow, id: string): DivisionWorkflow => {
	const preds = w.edges.filter(e => e.target === id).map(e => e.source);
	const succs = w.edges.filter(e => e.source === id).map(e => e.target);
	const edges = w.edges.filter(e => e.source !== id && e.target !== id);
	for (const p of preds) {
		for (const s of succs) {
			if (!reaches(edges, p, s)) { edges.push({ id: newWorkflowId('e'), source: p, target: s }); }
		}
	}
	return layoutWorkflow({ ...w, nodes: w.nodes.filter(n => n.id !== id), edges });
};

/** Turn an approval on or off after a role step. */
export const setApprovalAfter = (w: DivisionWorkflow, stepId: string, on: boolean): DivisionWorkflow => {
	const direct = w.edges.filter(e => e.source === stepId).map(e => w.nodes.find(n => n.id === e.target)).find(n => n?.type === 'approval');
	if (on && !direct) {
		const step = w.nodes.find(n => n.id === stepId);
		return insertAfter(w, stepId, { id: newWorkflowId('approval'), type: 'approval', data: { title: `${step?.data.title || step?.data.role || ''} を確認` } });
	}
	if (!on && direct) { return removeNode(w, direct.id); }
	return w;
};

/** The approved workflow's steps as the IDE flow's tasks. */
export const workflowToTasks = (w: Pick<DivisionWorkflow, 'nodes' | 'edges'>): Array<{
	taskId: string; role: string; title: string; description: string; input: string;
	dependsOn: string[]; approval: boolean; systemPrompt?: string; reason: string;
}> =>
	workflowSteps(w).map((s, i) => ({
		taskId: `wf-${i + 1}`,
		role: s.role,
		title: s.title || s.role,
		description: s.instruction || s.title || s.role,
		input: s.instruction || s.title || s.role,
		dependsOn: s.dependsOn.map(d => `wf-${d + 1}`),
		approval: s.approval,
		...(s.systemPrompt ? { systemPrompt: s.systemPrompt } : {}),
		reason: 'ユーザーが承認したワークフローのステップ',
	}));

/**
 * The flow's tasks as a workflow (so .division/workflow.json is written on every run, not only when
 * the leader's workflow is reviewed). A task's dependsOn are taskIds; a task without any runs after
 * the one before it (the flow runs its tasks in order). approval: an approval node after the task.
 */
export const tasksToWorkflow = (tasks: Array<{
	taskId: string; role: string; title?: string; description?: string; input?: string;
	dependsOn?: string[]; approval?: boolean; systemPrompt?: string;
}>): DivisionWorkflow => {
	const nodes: WorkflowNode[] = [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} }];
	const edges: WorkflowEdge[] = [];
	const edge = (source: string, target: string) => {
		if (!edges.some(e => e.source === source && e.target === target)) { edges.push({ id: `e-${source}-${target}`, source, target }); }
	};
	const nodeOf = new Map<string, string>();
	/** where the tasks after a task connect from (its approval node when it has one) */
	const exitOf = new Map<string, string>();
	tasks.forEach((t, i) => {
		const id = `step-${i + 1}`;
		nodeOf.set(t.taskId, id);
		const instruction = (t.description || t.input || '').trim();
		nodes.push({
			id, type: 'role', position: { x: 0, y: 0 },
			data: {
				role: t.role,
				...(t.title ? { title: t.title } : {}),
				...(instruction ? { instruction: instruction.slice(0, 4000) } : {}),
				...(t.systemPrompt ? { systemPrompt: t.systemPrompt } : {}),
			},
		});
		const deps = (t.dependsOn ?? []).map(d => exitOf.get(d)).filter((d): d is string => !!d);
		if (deps.length) { for (const d of deps) { edge(d, id); } }
		else if (i > 0) { edge(exitOf.get(tasks[i - 1].taskId)!, id); }
		else { edge('start', id); }
		if (t.approval) {
			const ok = `approval-${i + 1}`;
			nodes.push({ id: ok, type: 'approval', position: { x: 0, y: 0 }, data: { title: `${t.title || t.role} を確認` } });
			edge(id, ok);
			exitOf.set(t.taskId, ok);
		} else {
			exitOf.set(t.taskId, id);
		}
	});
	nodes.push({ id: 'end', type: 'end', position: { x: 0, y: 0 }, data: {} });
	const used = new Set(edges.map(e => e.source));
	for (const exit of exitOf.values()) { if (!used.has(exit)) { edge(exit, 'end'); } }
	if (!tasks.length) { edge('start', 'end'); }
	return layoutWorkflow({ version: 1, enabled: true, nodes, edges });
};
