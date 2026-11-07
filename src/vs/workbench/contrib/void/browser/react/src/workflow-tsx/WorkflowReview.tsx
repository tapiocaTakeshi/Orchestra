/*--------------------------------------------------------------------------------------
 *  Division Project: the leader's plan as a workflow diagram that the user approves.
 *  Shared by the chat (local Division Project runs) and the Cloud Agents panel (cloud sessions).
 *  Click a node to edit it (role, title, instruction, this step's system prompt, approval after it),
 *  add a step / a loop (for / while, with the goal) / a parallel node after it or delete it;
 *  then approve (as edited), send it back with feedback, or stop.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, RotateCcw, Trash2, X, UserCheck, Bot, Play, Flag, Repeat, CornerDownLeft, Split } from 'lucide-react';
import { URI } from '../../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { useAccessor } from '../util/services.js';
import {
	DEFAULT_WHILE_ITERATIONS, DivisionWorkflow, MAX_LOOP_ITERATIONS, WorkflowNode, insertAfter, insertLoopAfter, insertParallelAfter, layoutWorkflow, loopLabel,
	newWorkflowId, normalizeWorkflow, removeLoop, removeNode, setApprovalAfter, workflowErrors, workflowLoops, workflowSteps,
} from '../../../../common/divisionWorkflow.js';

/** The JSON written to .division/workflow.json, the same shape the Division Project run writes. */
export const workflowToJson = (w: DivisionWorkflow): string => JSON.stringify(w, null, 2) + '\n';

/** Nodes without positions (all at 0,0) are laid out; positions already set are kept. */
const withLayout = (w: DivisionWorkflow): DivisionWorkflow =>
	w.nodes.length > 1 && w.nodes.every(n => n.position.x === 0 && n.position.y === 0) ? layoutWorkflow(w) : w;

const WRITE_DELAY_MS = 300;

/**
 * The workflow shown from .division/workflow.json: read when shown, read again whenever the file
 * changes on disk (the workflow editor saved it, the JSON was edited, the run rewrote it), and
 * edits are written back to the file. Without a uri (cloud sessions, answered reviews) it is just
 * local state starting from `fallback`.
 */
const useWorkflowFile = (uri: URI | undefined, fallback: DivisionWorkflow) => {
	const accessor = useAccessor();
	const fileService = accessor.get('IFileService');
	const [workflow, setWorkflowState] = useState<DivisionWorkflow>(() => layoutWorkflow(fallback));
	const [fromFile, setFromFile] = useState(false);
	/** The file's content as last read or written here: a change event with this content is our own write. */
	const lastJson = useRef<string | null>(null);
	const pendingWrite = useRef<{ timer: ReturnType<typeof setTimeout>; json: string } | null>(null);
	const mounted = useRef(true);

	const write = useCallback((json: string) => {
		if (!uri) { return; }
		fileService.writeFile(uri, VSBuffer.fromString(json)).catch(e => console.error('write workflow.json', e));
	}, [fileService, uri]);

	const load = useCallback(async () => {
		if (!uri) { return; }
		try {
			const text = (await fileService.readFile(uri)).value.toString();
			// An edit made here is about to be written: it is newer than what is on disk.
			if (!mounted.current || pendingWrite.current || text === lastJson.current) { return; }
			const parsed = normalizeWorkflow(text);
			if (!parsed) { return; } // not a workflow (yet): keep showing the last good one
			lastJson.current = text;
			setWorkflowState(withLayout(parsed));
			setFromFile(true);
		} catch {
			// No file (yet): keep showing the last good one
		}
	}, [fileService, uri]);

	useEffect(() => {
		mounted.current = true;
		void load();
		if (!uri) { return () => { mounted.current = false; }; }
		const d = fileService.onDidFilesChange(e => { if (e.contains(uri)) { void load(); } });
		return () => {
			mounted.current = false;
			d.dispose();
			// Write an edit still waiting for its delay.
			const p = pendingWrite.current;
			if (p) { clearTimeout(p.timer); pendingWrite.current = null; write(p.json); }
		};
	}, [fileService, uri, load, write]);

	const setWorkflow = useCallback((next: DivisionWorkflow) => {
		setWorkflowState(next);
		if (!uri) { return; }
		const json = workflowToJson(next);
		lastJson.current = json;
		if (pendingWrite.current) { clearTimeout(pendingWrite.current.timer); }
		pendingWrite.current = {
			json,
			timer: setTimeout(() => { pendingWrite.current = null; write(json); }, WRITE_DELAY_MS),
		};
	}, [uri, write]);

	return { workflow, setWorkflow, fromFile };
};

const NODE_W = 190;
const NODE_H = 58;
const PAD = 24;

const COLORS: Record<WorkflowNode['type'], string> = {
	start: '#3b82f6',
	role: '#dc2626',
	approval: '#f59e0b',
	end: '#71717a',
	loop: '#8b5cf6',
	loopEnd: '#8b5cf6',
	parallel: '#10b981',
};

const ICONS = { start: Play, role: Bot, approval: UserCheck, end: Flag, loop: Repeat, loopEnd: CornerDownLeft, parallel: Split } as const;

/** How a node is titled on the diagram. */
const nodeTitle = (n: WorkflowNode, roleNames?: Record<string, string>): string => {
	switch (n.type) {
		case 'role': return n.data.title || roleNames?.[n.data.role ?? ''] || n.data.role || 'ロール未選択';
		case 'approval': return n.data.title || '承認';
		case 'start': return '開始';
		case 'end': return '終了';
		case 'loop': return n.data.title || (n.data.loop === 'while' ? 'while ループ' : 'for ループ');
		case 'loopEnd': return n.data.title || 'ループ終了';
		case 'parallel': return n.data.title || '並列';
	}
};

/** The line under a node's title. */
const nodeSub = (n: WorkflowNode, roleNames?: Record<string, string>): string => {
	switch (n.type) {
		case 'role': return `${roleNames?.[n.data.role ?? ''] ?? n.data.role ?? ''}${n.data.systemPrompt ? ' · SP' : ''}`;
		case 'approval': return 'あなたが確認';
		case 'loop': return n.data.loop === 'while'
			? `目標: ${n.data.goal || '(未設定)'} · 最大${n.data.maxIterations ?? DEFAULT_WHILE_ITERATIONS}回`
			: `${n.data.count ?? 2} 回くり返す`;
		case 'loopEnd': return 'ここまでを繰り返す';
		case 'parallel': return '分岐を同時に実行';
		default: return '';
	}
};

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** The diagram: nodes at their positions, edges as curves; clicking a node selects it. */
export const WorkflowDiagram = ({ workflow, selectedId, onSelect, roleNames }: {
	workflow: DivisionWorkflow;
	selectedId?: string | null;
	onSelect?: (id: string | null) => void;
	roleNames?: Record<string, string>;
}) => {
	// A step in a loop appears once per round; label it with its first step number.
	const steps = useMemo(() => {
		const m = new Map<string, number>();
		workflowSteps(workflow).forEach((s, i) => { if (!m.has(s.nodeId)) { m.set(s.nodeId, i + 1); } });
		return m;
	}, [workflow]);
	if (!workflow.nodes.length) return null;
	const xs = workflow.nodes.map(n => n.position.x);
	const ys = workflow.nodes.map(n => n.position.y);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	const width = Math.max(...xs) - minX + NODE_W + PAD * 2;
	const height = Math.max(...ys) - minY + NODE_H + PAD * 2;
	const at = (n: WorkflowNode) => ({ x: n.position.x - minX + PAD, y: n.position.y - minY + PAD });
	const byId = new Map(workflow.nodes.map(n => [n.id, n]));

	return (
		<div style={{ overflowX: 'auto', overflowY: 'hidden', border: '1px solid var(--void-border-2)', borderRadius: 6, background: 'var(--void-bg-1)' }}>
			<svg width={width} height={height} style={{ display: 'block' }} onClick={() => onSelect?.(null)} role='img' aria-label='ワークフロー図'>
				<defs>
					<marker id='wf-arrow' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'>
						<path d='M 0 0 L 10 5 L 0 10 z' fill='var(--void-fg-3)' />
					</marker>
				</defs>
				{workflow.edges.map(e => {
					const s = byId.get(e.source);
					const t = byId.get(e.target);
					if (!s || !t) return null;
					const a = at(s);
					const b = at(t);
					const x1 = a.x + NODE_W;
					const y1 = a.y + NODE_H / 2;
					const x2 = b.x - 2;
					const y2 = b.y + NODE_H / 2;
					const dx = Math.max(30, (x2 - x1) / 2);
					return <path key={e.id} d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`} fill='none' stroke='var(--void-fg-3)' strokeWidth={1.4} markerEnd='url(#wf-arrow)' />;
				})}
				{workflow.nodes.map(n => {
					const p = at(n);
					const selected = n.id === selectedId;
					const Icon = ICONS[n.type];
					const title = nodeTitle(n, roleNames);
					const sub = nodeSub(n, roleNames);
					return (
						<g key={n.id} transform={`translate(${p.x}, ${p.y})`} style={{ cursor: onSelect ? 'pointer' : 'default' }}
							onClick={ev => { ev.stopPropagation(); onSelect?.(n.id); }}>
							<rect width={NODE_W} height={NODE_H} rx={9} fill='var(--void-bg-2)'
								stroke={selected ? 'var(--void-fg-1)' : COLORS[n.type]} strokeWidth={selected ? 2 : 1.2}
								strokeDasharray={n.type === 'approval' || n.type === 'loopEnd' ? '5 3' : undefined} />
							<rect x={9} y={10} width={20} height={20} rx={5} fill={COLORS[n.type]} />
							<foreignObject x={11} y={12} width={16} height={16}><Icon size={16} color='#fff' /></foreignObject>
							<text x={36} y={24} fontSize={12} fontWeight={600} fill='var(--void-fg-1)'>{truncate(title, 18)}</text>
							{sub && <text x={36} y={42} fontSize={10.5} fill='var(--void-fg-3)'>{truncate(sub, 24)}</text>}
							{steps.has(n.id) && <text x={NODE_W - 10} y={24} fontSize={10.5} textAnchor='end' fill='var(--void-fg-3)'>#{steps.get(n.id)}</text>}
						</g>
					);
				})}
			</svg>
		</div>
	);
};

const fieldStyle: React.CSSProperties = {
	width: '100%', padding: '5px 7px', background: 'var(--void-bg-1)', color: 'var(--void-fg-1)',
	border: '1px solid var(--void-border-2)', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
};
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--void-fg-3)' };
const buttonStyle = (kind: 'primary' | 'plain' | 'danger'): React.CSSProperties => ({
	display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
	border: `1px solid ${kind === 'primary' ? '#0e70c0' : kind === 'danger' ? 'rgba(239,68,68,0.5)' : 'var(--void-border-2)'}`,
	background: kind === 'primary' ? '#0e70c0' : 'transparent',
	color: kind === 'primary' ? '#fff' : kind === 'danger' ? '#f87171' : 'var(--void-fg-2)',
});

/** One line per loop under the diagram: what repeats and until when. */
export const WorkflowLoopSummary = ({ workflow }: { workflow: DivisionWorkflow }) => {
	const steps = useMemo(() => workflowSteps(workflow), [workflow]);
	const loops = useMemo(() => workflowLoops(workflow).loops, [workflow]);
	if (!loops.length) { return null; }
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, color: 'var(--void-fg-2)' }}>
			{loops.map(l => {
				const rounds = steps.filter(s => s.loops?.some(t => t.id === l.id && t.iteration === 1)).length;
				const label = loopLabel([{ id: l.id, kind: l.kind, iteration: 1, of: l.iterations, title: l.title }]).replace(/ 1\/\d+ 回目$/, '');
				return <div key={l.id}>🔁 {label}: {rounds} ステップを{l.kind === 'while' ? `「${l.goal || '目標未設定'}」を達成するまで (最大 ${l.iterations} 回)` : ` ${l.iterations} 回`}くり返す</div>;
			})}
		</div>
	);
};

/** The roles a step can be given: the given ones (not the leader) and the ones the workflow already uses. */
export const useWorkflowRoleOptions = (workflow: DivisionWorkflow, roleOptions?: string[]): string[] => useMemo(() => {
	const set = new Set((roleOptions ?? []).filter(r => r && r !== 'leader'));
	for (const n of workflow.nodes) { if (n.type === 'role' && n.data.role) { set.add(n.data.role); } }
	return [...set];
}, [roleOptions, workflow]);

/** Edit the selected node: its fields, and add a step / loop / parallel node after it, or delete it. */
export const WorkflowNodeEditor = ({ workflow, selected, options, roleNames, change, setSelectedId }: {
	workflow: DivisionWorkflow;
	selected: WorkflowNode;
	options: string[];
	roleNames?: Record<string, string>;
	change: (next: DivisionWorkflow) => void;
	setSelectedId: (id: string | null) => void;
}) => {
	const patchSelected = (patch: Partial<WorkflowNode['data']>) => {
		change({ ...workflow, nodes: workflow.nodes.map(n => (n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n)) });
	};
	const hasApprovalAfter = (id: string) => workflow.edges.some(e => e.source === id && workflow.nodes.find(n => n.id === e.target)?.type === 'approval');
	return (
			<div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 6, border: '1px solid var(--void-border-2)' }}>
				{selected.type === 'role' && <>
					<label style={labelStyle}>ロール
						<select style={fieldStyle} value={selected.data.role ?? ''} onChange={e => patchSelected({ role: e.target.value })}>
							{options.map(r => <option key={r} value={r}>{roleNames?.[r] ? `${roleNames[r]} (${r})` : r}</option>)}
						</select>
					</label>
					<label style={labelStyle}>ステップ名
						<input style={fieldStyle} value={selected.data.title ?? ''} maxLength={120} onChange={e => patchSelected({ title: e.target.value })} />
					</label>
					<label style={labelStyle}>指示
						<textarea style={fieldStyle} rows={4} value={selected.data.instruction ?? ''} maxLength={4000} onChange={e => patchSelected({ instruction: e.target.value })} />
					</label>
					<label style={labelStyle}>システムプロンプト (このステップだけ・ロールのプロンプトの後に追加)
						<textarea style={fieldStyle} rows={4} value={selected.data.systemPrompt ?? ''} maxLength={8000}
							placeholder='例: 出力は日本語の箇条書き。既存の API は変えないこと。'
							onChange={e => patchSelected({ systemPrompt: e.target.value })} />
					</label>
					<label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 6, color: 'var(--void-fg-2)' }}>
						<input type='checkbox' checked={hasApprovalAfter(selected.id)} onChange={e => change(setApprovalAfter(workflow, selected.id, e.target.checked))} />
						このステップの後で承認する
					</label>
				</>}
				{selected.type === 'approval' && (
					<label style={labelStyle}>承認の名前
						<input style={fieldStyle} value={selected.data.title ?? ''} maxLength={120} onChange={e => patchSelected({ title: e.target.value })} />
					</label>
				)}
				{selected.type === 'loop' && <>
					<label style={labelStyle}>くり返し方
						<select style={fieldStyle} value={selected.data.loop ?? 'for'} onChange={e => patchSelected(e.target.value === 'while'
							? { loop: 'while', goal: selected.data.goal ?? '', maxIterations: selected.data.maxIterations ?? DEFAULT_WHILE_ITERATIONS }
							: { loop: 'for', count: selected.data.count ?? 2 })}>
							<option value='for'>for — 決まった回数くり返す</option>
							<option value='while'>while — 目標を達成するまでくり返す</option>
						</select>
					</label>
					{selected.data.loop === 'while' ? <>
						<label style={labelStyle}>目標 (達成したらループを抜ける。毎回の前に Leader が判定)
							<textarea style={fieldStyle} rows={3} value={selected.data.goal ?? ''} maxLength={4000}
								placeholder='例: テストがすべて通り、画面がデザインどおりになっている'
								onChange={e => patchSelected({ goal: e.target.value })} />
						</label>
						<label style={labelStyle}>最大回数
							<input style={fieldStyle} type='number' min={1} max={MAX_LOOP_ITERATIONS} value={selected.data.maxIterations ?? DEFAULT_WHILE_ITERATIONS}
								onChange={e => patchSelected({ maxIterations: Math.max(1, Math.min(MAX_LOOP_ITERATIONS, Number(e.target.value) || 1)) })} />
						</label>
					</> : (
						<label style={labelStyle}>回数
							<input style={fieldStyle} type='number' min={1} max={MAX_LOOP_ITERATIONS} value={selected.data.count ?? 2}
								onChange={e => patchSelected({ count: Math.max(1, Math.min(MAX_LOOP_ITERATIONS, Number(e.target.value) || 1)) })} />
						</label>
					)}
					<label style={labelStyle}>ループの名前
						<input style={fieldStyle} value={selected.data.title ?? ''} maxLength={120} onChange={e => patchSelected({ title: e.target.value })} />
					</label>
					<div style={{ fontSize: 11, color: 'var(--void-fg-3)' }}>このノードと「ループ終了」の間のステップを繰り返します。「次にステップを追加」でループの中にステップを入れます。</div>
				</>}
				{selected.type === 'parallel' && <>
					<label style={labelStyle}>並列の名前
						<input style={fieldStyle} value={selected.data.title ?? ''} maxLength={120} onChange={e => patchSelected({ title: e.target.value })} />
					</label>
					<div style={{ fontSize: 11, color: 'var(--void-fg-3)' }}>このノードから出た分岐を同時に実行し、次に分岐が集まるノードで合流します。</div>
				</>}
				{selected.type === 'loopEnd' && <div style={{ fontSize: 11, color: 'var(--void-fg-3)' }}>対応する「ループ」からここまでを繰り返します。</div>}
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					{selected.type !== 'end' && (
						<button type='button' style={buttonStyle('plain')} onClick={() => {
							const id = newWorkflowId('step');
							change(insertAfter(workflow, selected.id, { id, type: 'role', data: { role: options.find(r => /^(coder|coding)$/.test(r)) ?? options[0] ?? 'coder', title: '新しいステップ' } }));
							setSelectedId(id);
						}}><Plus size={12} /> 次にステップを追加</button>
					)}
					{selected.type !== 'end' && <>
						<button type='button' style={buttonStyle('plain')} onClick={() => { change(insertLoopAfter(workflow, selected.id, 'for')); }}>
							<Repeat size={12} /> for ループ
						</button>
						<button type='button' style={buttonStyle('plain')} onClick={() => {
							const next = insertLoopAfter(workflow, selected.id, 'while');
							change(next);
							// Select the new loop so the goal can be written straight away.
							const added = next.nodes.find(n => n.type === 'loop' && !workflow.nodes.some(o => o.id === n.id));
							if (added) { setSelectedId(added.id); }
						}}><Repeat size={12} /> while ループ (目標)</button>
						<button type='button' style={buttonStyle('plain')} onClick={() => {
							change(insertParallelAfter(workflow, selected.id, options.find(r => /^(search|searcher)$/.test(r)) ?? options[0] ?? 'coder'));
						}}><Split size={12} /> 並列</button>
					</>}
					{selected.type !== 'start' && selected.type !== 'end' && (
						<button type='button' style={buttonStyle('danger')} onClick={() => {
							// A loop and its end go together (the steps inside stay).
							const pairOf = selected.type === 'loopEnd' ? workflowLoops(workflow).loops.find(l => l.endId === selected.id)?.id : undefined;
							change(selected.type === 'loop' ? removeLoop(workflow, selected.id) : pairOf ? removeLoop(workflow, pairOf) : removeNode(workflow, selected.id));
							setSelectedId(null);
						}}>
							<Trash2 size={12} /> 削除
						</button>
					)}
				</div>
			</div>
	);
};

export type WorkflowReviewStatus = 'pending' | 'approved' | 'revised' | 'rejected';

/** Review and edit the leader's workflow, then approve / send back / stop. */
export const WorkflowReview = ({ workflow: initial, fileUri, status, leader, roleOptions, roleNames, onApprove, onRevise, onReject, busy }: {
	workflow: DivisionWorkflow;
	/** .division/workflow.json: when given, the diagram shows that file (and follows it), and edits are written to it */
	fileUri?: URI;
	status: WorkflowReviewStatus;
	leader?: string;
	/** Role slugs a step can be given (the project's assigned roles) */
	roleOptions?: string[];
	roleNames?: Record<string, string>;
	/** workflow is passed only when the user edited it */
	onApprove: (workflow?: DivisionWorkflow) => void;
	onRevise: (feedback: string) => void;
	onReject?: () => void;
	busy?: boolean;
}) => {
	const { workflow, setWorkflow, fromFile } = useWorkflowFile(fileUri, initial);
	// Edited = differs from the leader's plan, whether edited here or in workflow.json.
	const initialJson = useMemo(() => workflowToJson(normalizeWorkflow(initial) ?? initial), [initial]);
	const [editedHere, setEditedHere] = useState(false);
	const edited = editedHere || (fromFile && workflowToJson(normalizeWorkflow(workflow) ?? workflow) !== initialJson);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	// The file may drop the node being edited.
	useEffect(() => { setSelectedId(id => (id && workflow.nodes.some(n => n.id === id) ? id : null)); }, [workflow]);
	const [feedbackOpen, setFeedbackOpen] = useState(false);
	const [feedback, setFeedback] = useState('');
	const pending = status === 'pending';
	const errors = useMemo(() => workflowErrors(workflow), [workflow]);
	const selected = workflow.nodes.find(n => n.id === selectedId) ?? null;
	const options = useWorkflowRoleOptions(workflow, roleOptions);

	const change = (next: DivisionWorkflow) => { setWorkflow(next); setEditedHere(true); };

	const statusLabel = status === 'approved' ? '✅ 承認済み' : status === 'revised' ? '↩️ 差し戻し済み' : status === 'rejected' ? '⏹ 中止' : null;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', margin: '6px 0', borderRadius: 8, border: '1px solid var(--void-border-2)', background: 'var(--void-bg-2)' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--void-fg-1)' }}>🗺️ リーダーのワークフロー案</span>
				{leader && <span style={{ fontSize: 11, color: 'var(--void-fg-3)' }}>{leader}</span>}
				{statusLabel && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--void-fg-3)' }}>{statusLabel}</span>}
			</div>
			{pending && fromFile && <div style={{ fontSize: 11, color: 'var(--void-fg-3)' }}>表示しているのは <code>.division/workflow.json</code> です。ここでの編集はファイルに書き込まれ、ファイルを保存するとここにも反映されます。</div>}
			{pending && <div style={{ fontSize: 11.5, color: 'var(--void-fg-3)' }}>ノードを押すと編集できます。承認するとこの順で各ロールが実行し、「承認」ノードの所であなたの確認を待ちます。繰り返しは for / while ループ (目標はここに書きます)、同時に進めたい作業は並列ノードで組めます。</div>}
			<WorkflowLoopSummary workflow={workflow} />

			<WorkflowDiagram workflow={workflow} selectedId={selectedId} onSelect={pending ? setSelectedId : undefined} roleNames={roleNames} />

			{pending && selected && <WorkflowNodeEditor workflow={workflow} selected={selected} options={options} roleNames={roleNames} change={change} setSelectedId={setSelectedId} />}

			{pending && errors.length > 0 && <div style={{ fontSize: 11.5, color: '#f87171' }}>{errors.join(' ')}</div>}

			{pending && (feedbackOpen ? (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
					<textarea style={fieldStyle} rows={3} autoFocus value={feedback} onChange={e => setFeedback(e.target.value)} placeholder='どう直してほしいか (例: 実装の前にデザインを入れて、レビューは2回)' />
					<div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
						<button type='button' style={buttonStyle('plain')} onClick={() => setFeedbackOpen(false)} disabled={busy}>やめる</button>
						<button type='button' style={buttonStyle('primary')} disabled={busy || !feedback.trim()} onClick={() => onRevise(feedback.trim())}>
							<RotateCcw size={12} /> リーダーに作り直させる
						</button>
					</div>
				</div>
			) : (
				<div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
					{onReject && <button type='button' style={buttonStyle('plain')} onClick={onReject} disabled={busy}><X size={12} /> 中止</button>}
					<button type='button' style={buttonStyle('plain')} onClick={() => setFeedbackOpen(true)} disabled={busy}><RotateCcw size={12} /> 差し戻す</button>
					<button type='button' style={buttonStyle('primary')} disabled={busy || errors.length > 0} onClick={() => onApprove(edited ? workflow : undefined)}>
						<Check size={12} /> {edited ? '編集して承認' : '承認して実行'}
					</button>
				</div>
			))}
		</div>
	);
};
