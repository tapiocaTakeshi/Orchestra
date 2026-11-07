/*--------------------------------------------------------------------------------------
 *  Division Project: the leader's plan as a workflow diagram that the user approves.
 *  Shared by the chat (local Division Project runs) and the Cloud Agents panel (cloud sessions).
 *  Click a node to edit it (role, title, instruction, this step's system prompt, approval after it),
 *  add a step after it or delete it; then approve (as edited), send it back with feedback, or stop.
 *--------------------------------------------------------------------------------------*/

import React, { useMemo, useState } from 'react';
import { Check, Plus, RotateCcw, Trash2, X, UserCheck, Bot, Play, Flag } from 'lucide-react';
import {
	DivisionWorkflow, WorkflowNode, insertAfter, layoutWorkflow, newWorkflowId, removeNode, setApprovalAfter, workflowErrors, workflowSteps,
} from '../../../../common/divisionWorkflow.js';

const NODE_W = 190;
const NODE_H = 58;
const PAD = 24;

const COLORS: Record<WorkflowNode['type'], string> = {
	start: '#3b82f6',
	role: '#dc2626',
	approval: '#f59e0b',
	end: '#71717a',
};

const ICONS = { start: Play, role: Bot, approval: UserCheck, end: Flag } as const;

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** The diagram: nodes at their positions, edges as curves; clicking a node selects it. */
export const WorkflowDiagram = ({ workflow, selectedId, onSelect, roleNames }: {
	workflow: DivisionWorkflow;
	selectedId?: string | null;
	onSelect?: (id: string | null) => void;
	roleNames?: Record<string, string>;
}) => {
	const steps = useMemo(() => new Map(workflowSteps(workflow).map((s, i) => [s.nodeId, i + 1])), [workflow]);
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
					const title = n.type === 'role'
						? (n.data.title || roleNames?.[n.data.role ?? ''] || n.data.role || 'ロール未選択')
						: n.type === 'approval' ? (n.data.title || '承認') : n.type === 'start' ? '開始' : '終了';
					const sub = n.type === 'role'
						? `${roleNames?.[n.data.role ?? ''] ?? n.data.role ?? ''}${n.data.systemPrompt ? ' · SP' : ''}`
						: n.type === 'approval' ? 'あなたが確認' : '';
					return (
						<g key={n.id} transform={`translate(${p.x}, ${p.y})`} style={{ cursor: onSelect ? 'pointer' : 'default' }}
							onClick={ev => { ev.stopPropagation(); onSelect?.(n.id); }}>
							<rect width={NODE_W} height={NODE_H} rx={9} fill='var(--void-bg-2)'
								stroke={selected ? 'var(--void-fg-1)' : COLORS[n.type]} strokeWidth={selected ? 2 : 1.2}
								strokeDasharray={n.type === 'approval' ? '5 3' : undefined} />
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

export type WorkflowReviewStatus = 'pending' | 'approved' | 'revised' | 'rejected';

/** Review and edit the leader's workflow, then approve / send back / stop. */
export const WorkflowReview = ({ workflow: initial, status, leader, roleOptions, roleNames, onApprove, onRevise, onReject, busy }: {
	workflow: DivisionWorkflow;
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
	const [workflow, setWorkflow] = useState<DivisionWorkflow>(() => layoutWorkflow(initial));
	const [edited, setEdited] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [feedbackOpen, setFeedbackOpen] = useState(false);
	const [feedback, setFeedback] = useState('');
	const pending = status === 'pending';
	const errors = useMemo(() => workflowErrors(workflow), [workflow]);
	const selected = workflow.nodes.find(n => n.id === selectedId) ?? null;
	const options = useMemo(() => {
		const set = new Set((roleOptions ?? []).filter(r => r && r !== 'leader'));
		for (const n of workflow.nodes) { if (n.type === 'role' && n.data.role) { set.add(n.data.role); } }
		return [...set];
	}, [roleOptions, workflow]);

	const change = (next: DivisionWorkflow) => { setWorkflow(next); setEdited(true); };
	const patchSelected = (patch: Partial<WorkflowNode['data']>) => {
		if (!selected) { return; }
		change({ ...workflow, nodes: workflow.nodes.map(n => (n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n)) });
	};
	const hasApprovalAfter = (id: string) => workflow.edges.some(e => e.source === id && workflow.nodes.find(n => n.id === e.target)?.type === 'approval');

	const statusLabel = status === 'approved' ? '✅ 承認済み' : status === 'revised' ? '↩️ 差し戻し済み' : status === 'rejected' ? '⏹ 中止' : null;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', margin: '6px 0', borderRadius: 8, border: '1px solid var(--void-border-2)', background: 'var(--void-bg-2)' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--void-fg-1)' }}>🗺️ リーダーのワークフロー案</span>
				{leader && <span style={{ fontSize: 11, color: 'var(--void-fg-3)' }}>{leader}</span>}
				{statusLabel && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--void-fg-3)' }}>{statusLabel}</span>}
			</div>
			{pending && <div style={{ fontSize: 11.5, color: 'var(--void-fg-3)' }}>ノードを押すと編集できます。承認するとこの順で各ロールが実行し、「承認」ノードの所であなたの確認を待ちます。</div>}

			<WorkflowDiagram workflow={workflow} selectedId={selectedId} onSelect={pending ? setSelectedId : undefined} roleNames={roleNames} />

			{pending && selected && (
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
					<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
						{selected.type !== 'end' && (
							<button type='button' style={buttonStyle('plain')} onClick={() => {
								const id = newWorkflowId('step');
								change(insertAfter(workflow, selected.id, { id, type: 'role', data: { role: options.find(r => /^(coder|coding)$/.test(r)) ?? options[0] ?? 'coder', title: '新しいステップ' } }));
								setSelectedId(id);
							}}><Plus size={12} /> 次にステップを追加</button>
						)}
						{selected.type !== 'start' && selected.type !== 'end' && (
							<button type='button' style={buttonStyle('danger')} onClick={() => { change(removeNode(workflow, selected.id)); setSelectedId(null); }}>
								<Trash2 size={12} /> 削除
							</button>
						)}
					</div>
				</div>
			)}

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
