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
 *    loop      data: { title?, loop: 'for' | 'while', count?, goal?, maxIterations? } — opens a loop;
 *              the steps between it and its 'loopEnd' node repeat (for: count times; while: until the
 *              goal is achieved, at most maxIterations times). The workflow's goal is written here.
 *    loopEnd   data: { title? } — closes the nearest open loop
 *    parallel  data: { title? } — the branches that start from it run at the same time
 *  Pure functions only: used by the main process (running the steps) and the UI (drawing and editing).
 *--------------------------------------------------------------------------------------*/

export type WorkflowNodeType = 'start' | 'role' | 'approval' | 'end' | 'loop' | 'loopEnd' | 'parallel';

export const WORKFLOW_NODE_TYPES: readonly WorkflowNodeType[] = ['start', 'role', 'approval', 'end', 'loop', 'loopEnd', 'parallel'];

export type WorkflowLoopKind = 'for' | 'while';

export const MAX_LOOP_ITERATIONS = 10;
export const DEFAULT_WHILE_ITERATIONS = 5;
/** Steps after the loops are unrolled. */
export const MAX_EXPANDED_STEPS = 60;

export type WorkflowNodeData = {
	role?: string;
	title?: string;
	instruction?: string;
	/** This step's own system prompt, added after the role's prompt. */
	systemPrompt?: string;
	/** loop: for = a fixed count, while = until the goal is achieved */
	loop?: WorkflowLoopKind;
	/** loop (for): rounds */
	count?: number;
	/** loop (while): the goal to achieve */
	goal?: string;
	/** loop (while): rounds at most */
	maxIterations?: number;
};

/** Which loop a step runs in, and in which round. */
export type WorkflowLoopTag = { id: string; kind: WorkflowLoopKind; iteration: number; of: number; title?: string; goal?: string };

/** A while loop's later round starts with this step: judge the goal first, and skip the rest of the loop once it is met. */
export type WorkflowWhileCheck = { loopId: string; iteration: number; goal: string };

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
	/** The loops this step runs in (outermost first), with its round. */
	loops?: WorkflowLoopTag[];
	whileCheck?: WorkflowWhileCheck;
	/** The parallel node this step's branch starts from. */
	parallel?: string;
};

export const WORKFLOW_FILE_NAME = 'workflow.json';
export const MAX_WORKFLOW_STEPS = 20;
const COLUMN_X = 270;
const ROW_Y = 150;

const str = (v: unknown, max = 8000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
	const n = Math.round(Number(v));
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Normalise stored or received JSON into a workflow (null when it is not one). */
export const normalizeWorkflow = (raw: unknown): DivisionWorkflow | null => {
	let v = raw;
	if (typeof v === 'string') {
		try { v = JSON.parse(v); } catch { return null; }
	}
	if (!v || typeof v !== 'object') return null;
	const w = v as Record<string, unknown>;
	if (!Array.isArray(w.nodes) || !Array.isArray(w.edges)) return null;
	const types = new Set<WorkflowNodeType>(WORKFLOW_NODE_TYPES);
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
		if (type !== 'start' && type !== 'end' && str(data.title, 120)) { d.title = str(data.title, 120); }
		if (type === 'loop') {
			d.loop = data.loop === 'while' ? 'while' : 'for';
			if (d.loop === 'for') { d.count = clampInt(data.count, 1, MAX_LOOP_ITERATIONS, 2); }
			else {
				d.maxIterations = clampInt(data.maxIterations, 1, MAX_LOOP_ITERATIONS, DEFAULT_WHILE_ITERATIONS);
				if (str(data.goal, 4000)) { d.goal = str(data.goal, 4000); }
			}
		}
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

/** A loop: its node, its loopEnd and the nodes in between. */
export type WorkflowLoop = { id: string; endId: string; kind: WorkflowLoopKind; iterations: number; title: string; goal: string; body: Set<string> };

const reachFrom = (edges: WorkflowEdge[], from: string, forward: boolean): Set<string> => {
	const seen = new Set<string>();
	const stack = [from];
	while (stack.length) {
		const id = stack.pop()!;
		for (const e of edges) {
			const next = forward ? (e.source === id ? e.target : null) : (e.target === id ? e.source : null);
			if (next && !seen.has(next)) { seen.add(next); stack.push(next); }
		}
	}
	return seen;
};

/** The loops (each loop node paired with the loopEnd that closes it) and what is left unmatched. */
export const workflowLoops = (w: Pick<DivisionWorkflow, 'nodes' | 'edges'>): { loops: WorkflowLoop[]; unmatchedLoops: string[]; unmatchedEnds: string[] } => {
	const stack: WorkflowNode[] = [];
	const loops: WorkflowLoop[] = [];
	const unmatchedEnds: string[] = [];
	for (const n of workflowOrder(w)) {
		if (n.type === 'loop') { stack.push(n); continue; }
		if (n.type !== 'loopEnd') { continue; }
		let k = stack.length - 1;
		while (k >= 0 && !reachFrom(w.edges, stack[k].id, true).has(n.id)) { k--; }
		if (k < 0) { unmatchedEnds.push(n.id); continue; }
		const open = stack.splice(k, 1)[0];
		const after = reachFrom(w.edges, open.id, true);
		const before = reachFrom(w.edges, n.id, false);
		const kind: WorkflowLoopKind = open.data.loop === 'while' ? 'while' : 'for';
		loops.push({
			id: open.id,
			endId: n.id,
			kind,
			iterations: kind === 'for' ? clampInt(open.data.count, 1, MAX_LOOP_ITERATIONS, 2) : clampInt(open.data.maxIterations, 1, MAX_LOOP_ITERATIONS, DEFAULT_WHILE_ITERATIONS),
			title: open.data.title ?? '',
			goal: open.data.goal ?? '',
			body: new Set([...after].filter(id => before.has(id) && id !== open.id && id !== n.id)),
		});
	}
	return { loops, unmatchedLoops: stack.map(n => n.id), unmatchedEnds };
};

/** "while ループ 2/5 回目" for a step in a loop (its innermost loop). */
export const loopLabel = (loops: WorkflowLoopTag[] | undefined): string => {
	const l = loops?.[loops.length - 1];
	if (!l) { return ''; }
	return `${l.title || (l.kind === 'for' ? 'for ループ' : 'while ループ')} ${l.iteration}/${l.of} 回目`;
};

/** The role steps in run order, with approvals and dependencies; loops are unrolled (each round is its own copy). */
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
	const parallelOf = (id: string): string | undefined => {
		const seen = new Set<string>();
		const stack = [...(incoming.get(id) ?? [])];
		while (stack.length) {
			const src = stack.pop()!;
			if (seen.has(src)) { continue; }
			seen.add(src);
			const n = byId.get(src);
			if (!n || n.type === 'role') { continue; }
			if (n.type === 'parallel') { return n.id; }
			stack.push(...(incoming.get(src) ?? []));
		}
		return undefined;
	};
	const base: WorkflowStep[] = roles.map((n, i) => {
		const parallel = parallelOf(n.id);
		return {
			nodeId: n.id,
			role: (n.data.role ?? '').toLowerCase(),
			title: n.data.title ?? '',
			instruction: n.data.instruction ?? '',
			systemPrompt: n.data.systemPrompt ?? '',
			approval: needsApproval.has(n.id),
			dependsOn: ancestors(n.id).filter(d => d < i),
			...(parallel ? { parallel } : {}),
		};
	});

	const { loops } = workflowLoops(w);
	if (!loops.length) { return base; }
	const loopsOf = base.map(st => loops.filter(l => l.body.has(st.nodeId)).sort((a, b) => b.body.size - a.body.size));
	const out: WorkflowStep[] = [];
	const lastOf = new Map<number, number>();
	type Frame = { body: Set<number>; redirect: number[] | null };
	const resolve = (d: number, frames: Frame[]): number[] => {
		for (let f = frames.length - 1; f >= 0; f--) {
			if (frames[f].body.has(d)) { break; }
			if (frames[f].redirect) { return frames[f].redirect!; }
		}
		const at = lastOf.get(d);
		return at === undefined ? [] : [at];
	};
	const emitBlock = (list: number[], tags: WorkflowLoopTag[], frames: Frame[]): void => {
		const done = new Set<number>();
		for (const b of list) {
			if (done.has(b)) { continue; }
			const loop = loopsOf[b][tags.length];
			if (!loop) {
				done.add(b);
				if (out.length >= MAX_EXPANDED_STEPS) { continue; }
				const st = base[b];
				const deps = [...new Set(st.dependsOn.flatMap(d => resolve(d, frames)))].sort((x, y) => x - y);
				lastOf.set(b, out.length);
				out.push({ ...st, dependsOn: deps, ...(tags.length ? { loops: tags.map(t => ({ ...t })) } : {}) });
				continue;
			}
			const inner = list.filter(x => loopsOf[x][tags.length] === loop);
			inner.forEach(x => done.add(x));
			const innerSet = new Set(inner);
			let prevExits: number[] | null = null;
			for (let k = 1; k <= loop.iterations; k++) {
				const tag: WorkflowLoopTag = { id: loop.id, kind: loop.kind, iteration: k, of: loop.iterations, ...(loop.title ? { title: loop.title } : {}), ...(loop.goal ? { goal: loop.goal } : {}) };
				const startLen = out.length;
				emitBlock(inner, [...tags, tag], [...frames, { body: innerSet, redirect: prevExits }]);
				const copies: number[] = [];
				for (let i = startLen; i < out.length; i++) { copies.push(i); }
				if (!copies.length) { break; }
				const inRound = new Set(copies);
				if (loop.kind === 'while' && k > 1) {
					for (const i of copies) {
						if (!out[i].dependsOn.some(d => inRound.has(d))) { out[i] = { ...out[i], whileCheck: { loopId: loop.id, iteration: k, goal: loop.goal } }; }
					}
				}
				prevExits = copies.filter(i => !copies.some(j => out[j].dependsOn.includes(i)));
			}
		}
	};
	emitBlock(base.map((_, i) => i), [], []);
	return out;
};

/** Why the workflow can't run as drawn (empty when it can). */
export const workflowErrors = (w: Pick<DivisionWorkflow, 'nodes' | 'edges'>): string[] => {
	const errors: string[] = [];
	if (w.nodes.filter(n => n.type === 'start').length !== 1) { errors.push('「開始」ノードはちょうど1つ必要です。'); }
	if (!w.nodes.some(n => n.type === 'end')) { errors.push('「終了」ノードが必要です。'); }
	const roles = w.nodes.filter(n => n.type === 'role');
	if (!roles.length) { errors.push('ロールのステップが1つ以上必要です。'); }
	if (roles.some(n => !n.data.role)) { errors.push('ロールを選んでいないステップがあります。'); }
	// workflowSteps() only runs the first MAX_WORKFLOW_STEPS roles: refuse more instead of dropping the rest.
	if (roles.length > MAX_WORKFLOW_STEPS) { errors.push(`ロールのステップは ${MAX_WORKFLOW_STEPS} 個までです (いまは ${roles.length} 個)。ステップを減らすか、ループでくり返してください。`); }
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
		if ([...reach].some(id => !order.has(id))) { errors.push('循環する接続があります。繰り返しは「ループ」ノードと「ループ終了」ノードで囲んでください。'); }
		const lonely = roles.filter(n => !reach.has(n.id));
		if (lonely.length) { errors.push(`開始からつながっていないステップがあります (${lonely.map(n => n.data.title || n.data.role).join(', ')})。`); }
	}
	const { loops, unmatchedLoops, unmatchedEnds } = workflowLoops(w);
	if (unmatchedLoops.length) { errors.push('「ループ終了」で閉じていない「ループ」があります。'); }
	if (unmatchedEnds.length) { errors.push('対応する「ループ」がない「ループ終了」があります。'); }
	const typeOf = new Map(w.nodes.map(n => [n.id, n.type]));
	for (const l of loops) {
		const name = l.title || (l.kind === 'for' ? 'for ループ' : 'while ループ');
		if (![...l.body].some(id => typeOf.get(id) === 'role')) { errors.push(`「${name}」の中にロールのステップがありません。`); }
		if (l.kind === 'while' && !l.goal) { errors.push(`「${name}」(while) に目標を書いてください。目標を達成するまで中のステップを繰り返します。`); }
		const inside = new Set([...l.body, l.id, l.endId]);
		if (w.edges.some(e => (l.body.has(e.target) && !inside.has(e.source)) || (l.body.has(e.source) && !inside.has(e.target)))) {
			errors.push(`「${name}」の中のステップが、ループの外とつながっています。ループの中は「ループ」から「ループ終了」の間だけでつないでください。`);
		}
	}
	if (!errors.length && workflowSteps(w).length >= MAX_EXPANDED_STEPS) { errors.push(`ループを展開するとステップが ${MAX_EXPANDED_STEPS} 個を超えます。回数を減らしてください。`); }
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
	loops?: WorkflowLoopTag[]; whileCheck?: WorkflowWhileCheck; parallel?: string;
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
		...(s.loops?.length ? { loops: s.loops } : {}),
		...(s.whileCheck ? { whileCheck: s.whileCheck } : {}),
		...(s.parallel ? { parallel: s.parallel } : {}),
		reason: 'ユーザーが承認したワークフローのステップ',
	}));

/**
 * Put a loop around the node `afterId` leads into: a loop node right after `afterId` and its loopEnd
 * right after it, so the steps added in between (insertAfter on the loop node) are the loop's body.
 */
export const insertLoopAfter = (w: DivisionWorkflow, afterId: string, kind: WorkflowLoopKind): DivisionWorkflow => {
	const loopId = newWorkflowId('loop');
	const endId = newWorkflowId('loop-end');
	const data: WorkflowNodeData = kind === 'for' ? { loop: 'for', count: 2 } : { loop: 'while', goal: '', maxIterations: DEFAULT_WHILE_ITERATIONS };
	const withLoop = insertAfter(w, afterId, { id: loopId, type: 'loop', data });
	return insertAfter(withLoop, loopId, { id: endId, type: 'loopEnd', data: {} });
};

/** Add a parallel node after `afterId`, with two empty branches of the given role that join again. */
export const insertParallelAfter = (w: DivisionWorkflow, afterId: string, role: string): DivisionWorkflow => {
	const pid = newWorkflowId('parallel');
	const withPar = insertAfter(w, afterId, { id: pid, type: 'parallel', data: {} });
	const next = withPar.edges.filter(e => e.source === pid).map(e => e.target);
	const a = newWorkflowId('step');
	const b = newWorkflowId('step');
	const edges = [
		...withPar.edges.filter(e => e.source !== pid),
		{ id: newWorkflowId('e'), source: pid, target: a },
		{ id: newWorkflowId('e'), source: pid, target: b },
		...next.flatMap(t => [{ id: newWorkflowId('e'), source: a, target: t }, { id: newWorkflowId('e'), source: b, target: t }]),
	];
	return layoutWorkflow({
		...withPar,
		nodes: [...withPar.nodes, { id: a, type: 'role', position: { x: 0, y: 0 }, data: { role } }, { id: b, type: 'role', position: { x: 0, y: 0 }, data: { role } }],
		edges,
	});
};

/** Remove a loop node together with its loopEnd (the steps inside stay, joined in the same place). */
export const removeLoop = (w: DivisionWorkflow, loopId: string): DivisionWorkflow => {
	const l = workflowLoops(w).loops.find(x => x.id === loopId);
	const without = removeNode(w, loopId);
	return l ? removeNode(without, l.endId) : without;
};

/**
 * The leader's task list as a workflow graph (start → steps → end), laid out for the canvas.
 * Used to write .division/workflow.json even when the plan was not reviewed (approval mode off),
 * so the flow can always be opened, edited and reused as a diagram.
 */
export const tasksToWorkflow = (tasks: Array<{
	taskId: string; role: string; title?: string; description?: string; input?: string;
	dependsOn?: string[]; approval?: boolean; systemPrompt?: string;
}>): DivisionWorkflow => {
	const nodes: WorkflowNode[] = [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} }];
	const edges: WorkflowEdge[] = [];
	const edge = (source: string, target: string) => edges.push({ id: `e-${source}-${target}`, source, target });
	const list = tasks.slice(0, MAX_WORKFLOW_STEPS);
	const indexOf = new Map(list.map((t, i) => [t.taskId, i] as const));
	/** Where the steps after step i connect from: its approval node when it has one. */
	const exitOf: string[] = [];
	list.forEach((t, i) => {
		const id = `step-${i + 1}`;
		const data: WorkflowNodeData = { role: str(t.role, 100) };
		const title = str(t.title, 120);
		const instruction = str(t.input || t.description, 4000);
		const systemPrompt = str(t.systemPrompt, 8000);
		if (title) { data.title = title; }
		if (instruction) { data.instruction = instruction; }
		if (systemPrompt) { data.systemPrompt = systemPrompt; }
		nodes.push({ id, type: 'role', position: { x: 0, y: 0 }, data });
		const deps = [...new Set((t.dependsOn ?? []).map(d => indexOf.get(d)).filter((d): d is number => d !== undefined && d < i))];
		if (deps.length) { for (const d of deps) { edge(exitOf[d], id); } }
		else { edge('start', id); }
		if (t.approval) {
			const ok = `approval-${i + 1}`;
			nodes.push({ id: ok, type: 'approval', position: { x: 0, y: 0 }, data: { title: `${title || t.role} を確認` } });
			edge(id, ok);
			exitOf.push(ok);
		} else {
			exitOf.push(id);
		}
	});
	nodes.push({ id: 'end', type: 'end', position: { x: 0, y: 0 }, data: {} });
	const used = new Set(edges.map(e => e.source));
	for (const exit of exitOf) { if (!used.has(exit)) { edge(exit, 'end'); } }
	if (!list.length) { edge('start', 'end'); }
	return layoutWorkflow({ version: 1, enabled: true, nodes, edges });
};
