/*--------------------------------------------------------------------------------------
 *  .division/workflow.json as a Dify-style canvas: a dotted, pannable and zoomable board with
 *  node cards that can be dragged, connected (drag from a node's right handle onto another node),
 *  added (the "+" on a node's right handle or in the middle of a connection opens the block list)
 *  and deleted (select a node or a connection, then Delete). Loops are drawn as a group around
 *  their steps. Controls (zoom / fit / tidy up) bottom left, a minimap bottom right.
 *  Pure UI: every change is handed to onChange as the next workflow.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bot, CornerDownLeft, Flag, Maximize, Minus, Play, Plus, Repeat, Split, UserCheck, Wand2, X } from 'lucide-react';
import {
	DEFAULT_WHILE_ITERATIONS, DivisionWorkflow, WorkflowEdge, WorkflowNode, WorkflowNodeType, insertAfter, insertLoopAfter, insertParallelAfter,
	layoutWorkflow, newWorkflowId, removeLoop, removeNode, workflowLoops, workflowSteps,
} from '../../../../common/divisionWorkflow.js';

export const NODE_W = 220;
/** Where connections leave and enter a card (the middle of its header). */
const HANDLE_Y = 24;
/** Horizontal room the layout gives a column (the same as layoutWorkflow). */
const COLUMN = 270;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

export const NODE_COLORS: Record<WorkflowNodeType, string> = {
	start: '#2970ff',
	role: '#e5484d',
	approval: '#f79009',
	end: '#667085',
	loop: '#7a5af8',
	loopEnd: '#7a5af8',
	parallel: '#12b76a',
};

export const NODE_ICONS = { start: Play, role: Bot, approval: UserCheck, end: Flag, loop: Repeat, loopEnd: CornerDownLeft, parallel: Split } as const;

export const NODE_TYPE_LABEL: Record<WorkflowNodeType, string> = {
	start: '開始', role: 'ロール', approval: '承認', end: '終了', loop: 'ループ', loopEnd: 'ループ終了', parallel: '並列',
};

/** A card's height (fixed per type so connections and loop groups can be drawn without measuring). */
export const nodeHeight = (n: WorkflowNode): number => {
	switch (n.type) {
		case 'start': case 'end': return 48;
		case 'loopEnd': case 'approval': case 'parallel': return 64;
		default: return 84;
	}
};

export const nodeTitle = (n: WorkflowNode, roleNames?: Record<string, string>): string => {
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

const nodeBody = (n: WorkflowNode, roleNames?: Record<string, string>): { tag?: string; text?: string } => {
	switch (n.type) {
		case 'role': return { tag: roleNames?.[n.data.role ?? ''] ?? n.data.role, text: n.data.instruction || (n.data.systemPrompt ? 'システムプロンプトあり' : '指示なし') };
		case 'approval': return { text: 'あなたが結果を確認してから次へ' };
		case 'loop': return n.data.loop === 'while'
			? { tag: `最大 ${n.data.maxIterations ?? DEFAULT_WHILE_ITERATIONS} 回`, text: `目標: ${n.data.goal || '(未設定)'}` }
			: { tag: `${n.data.count ?? 2} 回`, text: 'ループ終了までをくり返す' };
		case 'loopEnd': return { text: 'ここまでをくり返す' };
		case 'parallel': return { text: '分岐を同時に実行' };
		default: return {};
	}
};

// ---------------------------------------------------------------------------------------------
// Keeping the user's positions when a helper (insertAfter, removeNode, ...) lays the graph out again

const reachable = (edges: WorkflowEdge[], from: Iterable<string>): Set<string> => {
	const seen = new Set<string>();
	const stack = [...from];
	while (stack.length) {
		const id = stack.pop()!;
		for (const e of edges) { if (e.source === id && !seen.has(e.target)) { seen.add(e.target); stack.push(e.target); } }
	}
	return seen;
};

/**
 * The editing helpers lay the whole graph out again. Keep the nodes where the user put them: nodes
 * that already existed stay; new nodes are placed next to the node they were added after, and the
 * nodes downstream of them move right to make room.
 */
export const keepPositions = (prev: DivisionWorkflow, next: DivisionWorkflow): DivisionWorkflow => {
	const before = new Map(prev.nodes.map(n => [n.id, n.position]));
	const added = next.nodes.filter(n => !before.has(n.id));
	if (!added.length) {
		return { ...next, nodes: next.nodes.map(n => ({ ...n, position: before.get(n.id) ?? n.position })) };
	}
	const addedIds = new Set(added.map(n => n.id));
	const anchorId = next.edges.find(e => before.has(e.source) && addedIds.has(e.target))?.source;
	if (!anchorId) { return next; }
	const laid = next.nodes.find(n => n.id === anchorId)!.position;
	const kept = before.get(anchorId)!;
	const dx = kept.x - laid.x;
	const dy = kept.y - laid.y;
	const placed = new Map(added.map(n => [n.id, { x: n.position.x + dx, y: n.position.y + dy }]));
	const shift = Math.max(0, Math.max(...[...placed.values()].map(p => p.x)) - kept.x);
	const downstream = reachable(next.edges, addedIds);
	return {
		...next,
		nodes: next.nodes.map(n => {
			const p = placed.get(n.id);
			if (p) { return { ...n, position: p }; }
			const old = before.get(n.id)!;
			return { ...n, position: downstream.has(n.id) && old.x > kept.x ? { x: old.x + shift, y: old.y } : old };
		}),
	};
};

/** Put a node into a connection (source → node → target), making room to its right if needed. */
const insertIntoEdge = (w: DivisionWorkflow, edge: WorkflowEdge, node: Omit<WorkflowNode, 'position'>): DivisionWorkflow => {
	const s = w.nodes.find(n => n.id === edge.source);
	const t = w.nodes.find(n => n.id === edge.target);
	if (!s || !t) { return w; }
	const room = s.position.x + COLUMN * 2 - t.position.x;
	const moved = room > 0 ? new Set([t.id, ...reachable(w.edges, [t.id])]) : new Set<string>();
	return {
		...w,
		nodes: [
			...w.nodes.map(n => (moved.has(n.id) ? { ...n, position: { x: n.position.x + room, y: n.position.y } } : n)),
			{ ...node, position: { x: s.position.x + COLUMN, y: Math.round((s.position.y + t.position.y) / 2) } },
		],
		edges: [
			...w.edges.filter(e => e.id !== edge.id),
			{ id: newWorkflowId('e'), source: s.id, target: node.id },
			{ id: newWorkflowId('e'), source: node.id, target: t.id },
		],
	};
};

// ---------------------------------------------------------------------------------------------
// The block list ("+")

type BlockKind = { kind: 'role'; role: string } | { kind: 'approval' } | { kind: 'for' } | { kind: 'while' } | { kind: 'parallel' };

type Picker = { x: number; y: number; after?: string; edge?: WorkflowEdge };

const BlockPicker = ({ picker, roles, roleNames, onPick, onClose }: {
	picker: Picker;
	roles: string[];
	roleNames?: Record<string, string>;
	onPick: (b: BlockKind) => void;
	onClose: () => void;
}) => {
	const [query, setQuery] = useState('');
	const q = query.trim().toLowerCase();
	const match = (s: string) => !q || s.toLowerCase().includes(q);
	const item = (key: string, type: WorkflowNodeType, label: string, sub: string, b: BlockKind) => {
		if (!match(label) && !match(sub)) { return null; }
		const Icon = NODE_ICONS[type];
		return (
			<button key={key} type='button' className='wfc-pick-item' onClick={() => onPick(b)}>
				<span className='wfc-icon' style={{ background: NODE_COLORS[type] }}><Icon size={13} color='#fff' /></span>
				<span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
					<span style={{ fontSize: 12.5, color: 'var(--void-fg-1)' }}>{label}</span>
					<span style={{ fontSize: 10.5, color: 'var(--void-fg-3)' }}>{sub}</span>
				</span>
			</button>
		);
	};
	const roleItems = roles.map(r => item(`r-${r}`, 'role', roleNames?.[r] ?? r, r, { kind: 'role', role: r })).filter(Boolean);
	// Loops and parallel nodes put more than one node in place: only after a node, not into a connection.
	const logic = [
		item('approval', 'approval', '承認', 'あなたが結果を確認', { kind: 'approval' }),
		...(picker.edge ? [] : [
			item('for', 'loop', 'for ループ', '決まった回数くり返す', { kind: 'for' }),
			item('while', 'loop', 'while ループ', '目標を達成するまでくり返す', { kind: 'while' }),
			item('parallel', 'parallel', '並列', '2 つの分岐を同時に実行', { kind: 'parallel' }),
		]),
	].filter(Boolean);
	return (
		<div className='wfc-picker' style={{ left: picker.x, top: picker.y }} onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 8px 4px' }}>
				<input autoFocus className='wfc-search' placeholder='ブロックを検索' value={query} onChange={e => setQuery(e.target.value)}
					onKeyDown={e => { if (e.key === 'Escape') { onClose(); } }} />
				<button type='button' className='wfc-icon-btn' onClick={onClose} title='閉じる'><X size={13} /></button>
			</div>
			<div style={{ maxHeight: 320, overflowY: 'auto', padding: '0 4px 6px' }}>
				{roleItems.length > 0 && <div className='wfc-pick-head'>ロール</div>}
				{roleItems}
				{logic.length > 0 && <div className='wfc-pick-head'>ロジック</div>}
				{logic}
				{!roleItems.length && !logic.length && <div style={{ fontSize: 12, color: 'var(--void-fg-3)', padding: 8 }}>見つかりません</div>}
			</div>
		</div>
	);
};

// ---------------------------------------------------------------------------------------------
// The canvas

type View = { x: number; y: number; zoom: number };

type Drag =
	| { kind: 'pan'; px: number; py: number; vx: number; vy: number; moved: boolean }
	| { kind: 'node'; id: string; px: number; py: number; ox: number; oy: number; moved: boolean }
	| { kind: 'connect'; from: string; px: number; py: number; moved: boolean };

const edgePath = (x1: number, y1: number, x2: number, y2: number) => {
	const dx = Math.max(40, Math.abs(x2 - x1) / 2);
	return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

export const WorkflowCanvas = ({ workflow, onChange, selectedId, onSelect, roleNames, roles, fitKey }: {
	workflow: DivisionWorkflow;
	onChange: (next: DivisionWorkflow) => void;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	roleNames?: Record<string, string>;
	/** Roles a new step can be given */
	roles: string[];
	/** Fit the view again whenever this changes (for example after a reload from disk). */
	fitKey?: unknown;
}) => {
	const boxRef = useRef<HTMLDivElement>(null);
	// 0 until measured: the first fit waits for the real size.
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 });
	const [moving, setMoving] = useState<{ id: string; x: number; y: number } | null>(null);
	const [wire, setWire] = useState<{ from: string; x: number; y: number } | null>(null);
	const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
	const [hoverEdge, setHoverEdge] = useState<string | null>(null);
	const [picker, setPicker] = useState<Picker | null>(null);
	const drag = useRef<Drag | null>(null);

	useLayoutEffect(() => {
		const el = boxRef.current;
		if (!el) { return; }
		const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el);
		setSize({ w: el.clientWidth, h: el.clientHeight });
		return () => ro.disconnect();
	}, []);

	const pos = useCallback((n: WorkflowNode) => (moving?.id === n.id ? { x: moving.x, y: moving.y } : n.position), [moving]);
	const byId = useMemo(() => new Map(workflow.nodes.map(n => [n.id, n])), [workflow]);

	const bounds = useCallback((w: DivisionWorkflow) => {
		if (!w.nodes.length) { return { x: 0, y: 0, w: NODE_W, h: 100 }; }
		const x0 = Math.min(...w.nodes.map(n => n.position.x));
		const y0 = Math.min(...w.nodes.map(n => n.position.y));
		const x1 = Math.max(...w.nodes.map(n => n.position.x + NODE_W));
		const y1 = Math.max(...w.nodes.map(n => n.position.y + nodeHeight(n)));
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	}, []);

	const fit = useCallback((w: DivisionWorkflow = workflow) => {
		const b = bounds(w);
		const pad = 60;
		// Fit, but not so small that the cards cannot be read: a long workflow then starts at the left.
		const zoom = Math.max(0.5, Math.min(1, (size.w - pad * 2) / b.w, (size.h - pad * 2) / b.h));
		const x = b.w * zoom <= size.w - pad * 2 ? (size.w - b.w * zoom) / 2 : pad;
		setView({ zoom, x: x - b.x * zoom, y: (size.h - b.h * zoom) / 2 - b.y * zoom });
	}, [workflow, bounds, size]);

	// Fit once the canvas has its size, and again when asked to.
	const fitted = useRef<unknown>(Symbol());
	useEffect(() => {
		if (size.w < 50 || fitted.current === fitKey) { return; }
		fitted.current = fitKey;
		fit();
	}, [fitKey, size, fit]);

	const zoomAt = (factor: number, cx = size.w / 2, cy = size.h / 2) => {
		setView(v => {
			const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
			const k = zoom / v.zoom;
			return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
		});
	};

	// Wheel: pan, or zoom with Ctrl / ⌘ (also a trackpad pinch). Not passive, so the page does not scroll.
	useEffect(() => {
		const el = boxRef.current;
		if (!el) { return; }
		const onWheel = (e: WheelEvent) => {
			if ((e.target as HTMLElement).closest('.wfc-picker')) { return; }
			e.preventDefault();
			if (e.ctrlKey || e.metaKey) {
				const r = el.getBoundingClientRect();
				zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
			} else {
				setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
			}
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	});

	const toWorld = (clientX: number, clientY: number) => {
		const r = boxRef.current!.getBoundingClientRect();
		return { x: (clientX - r.left - view.x) / view.zoom, y: (clientY - r.top - view.y) / view.zoom };
	};
	const toScreen = (x: number, y: number) => ({ x: x * view.zoom + view.x, y: y * view.zoom + view.y });

	// ---- editing
	const apply = (next: DivisionWorkflow) => { onChange(keepPositions(workflow, next)); };

	const connect = (from: string, to: string) => {
		if (from === to || workflow.edges.some(e => e.source === from && e.target === to)) { return; }
		const target = byId.get(to);
		const source = byId.get(from);
		if (!target || !source || target.type === 'start' || source.type === 'end') { return; }
		// No cycles: a loop is a loop node, not a connection back.
		if (reachable(workflow.edges, [to]).has(from)) { return; }
		onChange({ ...workflow, edges: [...workflow.edges, { id: newWorkflowId('e'), source: from, target: to }] });
	};

	const deleteSelection = () => {
		if (selectedEdge) {
			onChange({ ...workflow, edges: workflow.edges.filter(e => e.id !== selectedEdge) });
			setSelectedEdge(null);
			return;
		}
		const n = selectedId ? byId.get(selectedId) : undefined;
		if (!n || n.type === 'start' || n.type === 'end') { return; }
		onDelete(n);
	};

	const onDelete = (n: WorkflowNode) => {
		// Same as the side panel: a loop goes together with its end; the steps inside stay.
		const pairOf = n.type === 'loopEnd' ? loops.find(l => l.endId === n.id)?.id : undefined;
		apply(n.type === 'loop' ? removeLoop(workflow, n.id) : pairOf ? removeLoop(workflow, pairOf) : removeNode(workflow, n.id));
		onSelect(null);
	};

	const pick = (b: BlockKind) => {
		const p = picker;
		setPicker(null);
		if (!p) { return; }
		const node: Omit<WorkflowNode, 'position'> | null =
			b.kind === 'role' ? { id: newWorkflowId('step'), type: 'role', data: { role: b.role, title: roleNames?.[b.role] ?? b.role } }
				: b.kind === 'approval' ? { id: newWorkflowId('approval'), type: 'approval', data: {} }
					: null;
		if (p.edge && node) {
			onChange(insertIntoEdge(workflow, p.edge, node));
			onSelect(node.id);
			return;
		}
		if (!p.after) { return; }
		if (node) { apply(insertAfter(workflow, p.after, node)); onSelect(node.id); return; }
		if (b.kind === 'for' || b.kind === 'while') {
			const next = insertLoopAfter(workflow, p.after, b.kind);
			apply(next);
			const added = next.nodes.find(n => n.type === 'loop' && !byId.has(n.id));
			if (added) { onSelect(added.id); }
			return;
		}
		if (b.kind === 'parallel') { apply(insertParallelAfter(workflow, p.after, roles.find(r => /^(search|searcher)$/.test(r)) ?? roles[0] ?? 'coder')); }
	};

	const openPicker = (clientX: number, clientY: number, target: Omit<Picker, 'x' | 'y'>) => {
		const r = boxRef.current!.getBoundingClientRect();
		const x = Math.min(clientX - r.left + 8, size.w - 250);
		const y = Math.min(clientY - r.top - 20, size.h - 380);
		setPicker({ x: Math.max(8, x), y: Math.max(8, y), ...target });
	};

	// ---- pointer handling
	const onBoardPointerDown = (e: React.PointerEvent) => {
		if (e.button !== 0 && e.button !== 1) { return; }
		boxRef.current?.focus();
		setPicker(null);
		drag.current = { kind: 'pan', px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};

	const onNodePointerDown = (e: React.PointerEvent, n: WorkflowNode) => {
		if (e.button !== 0) { return; }
		e.stopPropagation();
		boxRef.current?.focus();
		setPicker(null);
		setSelectedEdge(null);
		drag.current = { kind: 'node', id: n.id, px: e.clientX, py: e.clientY, ox: n.position.x, oy: n.position.y, moved: false };
		boxRef.current?.setPointerCapture(e.pointerId);
	};

	const onHandlePointerDown = (e: React.PointerEvent, n: WorkflowNode) => {
		if (e.button !== 0) { return; }
		e.stopPropagation();
		setPicker(null);
		drag.current = { kind: 'connect', from: n.id, px: e.clientX, py: e.clientY, moved: false };
		boxRef.current?.setPointerCapture(e.pointerId);
	};

	const onPointerMove = (e: React.PointerEvent) => {
		const d = drag.current;
		if (!d) { return; }
		if (d.kind === 'pan') {
			const dx = e.clientX - d.px;
			const dy = e.clientY - d.py;
			if (Math.abs(dx) + Math.abs(dy) > 3) { d.moved = true; }
			setView(v => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
		} else if (d.kind === 'node') {
			const dx = (e.clientX - d.px) / view.zoom;
			const dy = (e.clientY - d.py) / view.zoom;
			if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3 / view.zoom) { return; }
			d.moved = true;
			setMoving({ id: d.id, x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) });
		} else {
			if (!d.moved && Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) < 4) { return; }
			d.moved = true;
			const w = toWorld(e.clientX, e.clientY);
			setWire({ from: d.from, x: w.x, y: w.y });
		}
	};

	const onPointerUp = (e: React.PointerEvent) => {
		const d = drag.current;
		drag.current = null;
		if (!d) { return; }
		if (d.kind === 'pan') {
			if (!d.moved) { onSelect(null); setSelectedEdge(null); }
		} else if (d.kind === 'node') {
			if (d.moved && moving) {
				const snap = (v: number) => Math.round(v / 8) * 8;
				onChange({ ...workflow, nodes: workflow.nodes.map(n => (n.id === d.id ? { ...n, position: { x: snap(moving.x), y: snap(moving.y) } } : n)) });
			} else {
				onSelect(d.id);
			}
			setMoving(null);
		} else {
			setWire(null);
			const el = document.elementFromPoint(e.clientX, e.clientY);
			const targetId = (el instanceof Element ? el.closest('[data-node-id]') : null)?.getAttribute('data-node-id');
			// A click on the handle, or a drop on the board, opens the block list (as in Dify); a drop on a node connects.
			if (!d.moved || !targetId) { openPicker(e.clientX, e.clientY, { after: d.from }); }
			else if (targetId !== d.from) { connect(d.from, targetId); }
		}
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (isTyping(e.target)) { return; }
		if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
		else if (e.key === 'Escape') { setPicker(null); onSelect(null); setSelectedEdge(null); }
		else if ((e.key === '=' || e.key === '+') && !e.ctrlKey && !e.metaKey) { zoomAt(1.2); }
		else if (e.key === '-' && !e.ctrlKey && !e.metaKey) { zoomAt(1 / 1.2); }
	};

	// ---- derived drawing data
	const steps = useMemo(() => {
		const m = new Map<string, number>();
		workflowSteps(workflow).forEach((s, i) => { if (!m.has(s.nodeId)) { m.set(s.nodeId, i + 1); } });
		return m;
	}, [workflow]);
	const loops = useMemo(() => workflowLoops(workflow).loops, [workflow]);

	const groups = loops.map(l => {
		const members = [l.id, l.endId, ...l.body].map(id => byId.get(id)).filter((n): n is WorkflowNode => !!n);
		if (!members.length) { return null; }
		const ps = members.map(n => ({ p: pos(n), h: nodeHeight(n) }));
		const x0 = Math.min(...ps.map(({ p }) => p.x)) - 16;
		const y0 = Math.min(...ps.map(({ p }) => p.y)) - 34;
		const x1 = Math.max(...ps.map(({ p }) => p.x + NODE_W)) + 16;
		const y1 = Math.max(...ps.map(({ p, h }) => p.y + h)) + 16;
		const label = `${l.title || (l.kind === 'while' ? 'while ループ' : 'for ループ')} · ${l.kind === 'while' ? `目標まで (最大 ${l.iterations} 回)` : `${l.iterations} 回`}`;
		return { id: l.id, x0, y0, x1, y1, label };
	}).filter(Boolean) as Array<{ id: string; x0: number; y0: number; x1: number; y1: number; label: string }>;

	const out = (n: WorkflowNode) => { const p = pos(n); return { x: p.x + NODE_W, y: p.y + HANDLE_Y }; };
	const inn = (n: WorkflowNode) => { const p = pos(n); return { x: p.x, y: p.y + HANDLE_Y }; };

	const dot = 20 * view.zoom;
	const activeEdge = selectedEdge ?? hoverEdge;

	// Minimap
	const b = bounds(workflow);
	const mmW = 180;
	const mmH = 110;
	const viewWorld = { x: -view.x / view.zoom, y: -view.y / view.zoom, w: size.w / view.zoom, h: size.h / view.zoom };
	const mmX0 = Math.min(b.x, viewWorld.x) - 40;
	const mmY0 = Math.min(b.y, viewWorld.y) - 40;
	const mmX1 = Math.max(b.x + b.w, viewWorld.x + viewWorld.w) + 40;
	const mmY1 = Math.max(b.y + b.h, viewWorld.y + viewWorld.h) + 40;
	const mmK = Math.min(mmW / (mmX1 - mmX0), mmH / (mmY1 - mmY0));

	return (
		<div ref={boxRef} className='wfc-board' tabIndex={0} onKeyDown={onKeyDown}
			onPointerDown={onBoardPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
			style={{
				backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--void-fg-3) 45%, transparent) 1px, transparent 1.2px)',
				backgroundSize: `${dot}px ${dot}px`,
				backgroundPosition: `${view.x}px ${view.y}px`,
				cursor: drag.current?.kind === 'pan' && (drag.current as { moved: boolean }).moved ? 'grabbing' : 'default',
			}}>
			<div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
				{/* Loop groups behind everything */}
				{groups.map(g => (
					<div key={g.id} className='wfc-group' style={{ left: g.x0, top: g.y0, width: g.x1 - g.x0, height: g.y1 - g.y0 }}>
						<span className='wfc-group-label'><Repeat size={11} /> {g.label}</span>
					</div>
				))}

				{/* Connections */}
				<svg style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none' }}>
					{workflow.edges.map(e => {
						const s = byId.get(e.source);
						const t = byId.get(e.target);
						if (!s || !t) { return null; }
						const a = out(s);
						const c = inn(t);
						const d = edgePath(a.x, a.y, c.x, c.y);
						const on = activeEdge === e.id;
						return (
							<g key={e.id}>
								<path d={d} fill='none' stroke='transparent' strokeWidth={14} style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
									onPointerDown={ev => { ev.stopPropagation(); setSelectedEdge(e.id); onSelect(null); setPicker(null); boxRef.current?.focus(); }}
									onPointerEnter={() => setHoverEdge(e.id)} onPointerLeave={() => setHoverEdge(h => (h === e.id ? null : h))} />
								<path d={d} fill='none' stroke={on ? 'var(--void-ring-color)' : 'color-mix(in srgb, var(--void-fg-3) 70%, transparent)'} strokeWidth={on ? 2.2 : 1.6} />
							</g>
						);
					})}
					{wire && byId.get(wire.from) && (() => {
						const a = out(byId.get(wire.from)!);
						return <path d={edgePath(a.x, a.y, wire.x, wire.y)} fill='none' stroke='var(--void-ring-color)' strokeWidth={2} strokeDasharray='6 4' />;
					})()}
				</svg>

				{/* "+" and "×" in the middle of the hovered / selected connection */}
				{activeEdge && (() => {
					const e = workflow.edges.find(x => x.id === activeEdge);
					const s = e && byId.get(e.source);
					const t = e && byId.get(e.target);
					if (!e || !s || !t) { return null; }
					const a = out(s);
					const c = inn(t);
					const mx = (a.x + c.x) / 2;
					const my = (a.y + c.y) / 2;
					return (
						<div className='wfc-edge-tools' style={{ left: mx, top: my }}
							onPointerEnter={() => setHoverEdge(e.id)} onPointerLeave={() => setHoverEdge(h => (h === e.id ? null : h))}>
							<button type='button' className='wfc-round-btn' title='ここにブロックを追加'
								onPointerDown={ev => ev.stopPropagation()} onClick={ev => openPicker(ev.clientX, ev.clientY, { edge: e })}><Plus size={11} /></button>
							{selectedEdge === e.id && (
								<button type='button' className='wfc-round-btn danger' title='接続を削除 (Delete)'
									onPointerDown={ev => ev.stopPropagation()} onClick={() => { onChange({ ...workflow, edges: workflow.edges.filter(x => x.id !== e.id) }); setSelectedEdge(null); }}><X size={11} /></button>
							)}
						</div>
					);
				})()}

				{/* Nodes */}
				{workflow.nodes.map(n => {
					const p = pos(n);
					const Icon = NODE_ICONS[n.type];
					const color = NODE_COLORS[n.type];
					const selected = n.id === selectedId;
					const body = nodeBody(n, roleNames);
					return (
						<div key={n.id} data-node-id={n.id} className={`wfc-node${selected ? ' selected' : ''}${moving?.id === n.id ? ' moving' : ''}`}
							style={{ left: p.x, top: p.y, width: NODE_W, height: nodeHeight(n), ['--wfc-color' as string]: color }}
							onPointerDown={e => onNodePointerDown(e, n)}>
							<div className='wfc-node-head'>
								<span className='wfc-icon' style={{ background: color }}><Icon size={13} color='#fff' /></span>
								<span className='wfc-node-title'>{nodeTitle(n, roleNames)}</span>
								{steps.has(n.id) && <span className='wfc-step'>#{steps.get(n.id)}</span>}
							</div>
							{(body.tag || body.text) && (
								<div className='wfc-node-body'>
									{body.tag && <span className='wfc-tag' style={{ color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)` }}>{body.tag}</span>}
									{body.text && <span className='wfc-node-text'>{body.text}</span>}
								</div>
							)}
							{n.type !== 'start' && <span className='wfc-handle in' style={{ top: HANDLE_Y }} />}
							{n.type !== 'end' && (
								<span className='wfc-handle out' style={{ top: HANDLE_Y }} title='ドラッグでつなぐ / クリックでブロックを追加'
									onPointerDown={e => onHandlePointerDown(e, n)}>
									<Plus size={10} />
								</span>
							)}
						</div>
					);
				})}
			</div>

			{picker && <BlockPicker picker={picker} roles={roles} roleNames={roleNames} onPick={pick} onClose={() => setPicker(null)} />}

			{/* Controls */}
			<div className='wfc-controls' onPointerDown={e => e.stopPropagation()}>
				<button type='button' className='wfc-icon-btn' title='縮小 (-)' onClick={() => zoomAt(1 / 1.2)}><Minus size={14} /></button>
				<button type='button' className='wfc-zoom' title='100%' onClick={() => setView(v => ({ zoom: 1, x: size.w / 2 - (size.w / 2 - v.x) / v.zoom, y: size.h / 2 - (size.h / 2 - v.y) / v.zoom }))}>{Math.round(view.zoom * 100)}%</button>
				<button type='button' className='wfc-icon-btn' title='拡大 (+)' onClick={() => zoomAt(1.2)}><Plus size={14} /></button>
				<span className='wfc-sep' />
				<button type='button' className='wfc-icon-btn' title='全体を表示' onClick={() => fit()}><Maximize size={14} /></button>
				<button type='button' className='wfc-icon-btn' title='整列 (自動レイアウト)' onClick={() => { const laid = layoutWorkflow(workflow); onChange(laid); fit(laid); }}><Wand2 size={14} /></button>
			</div>

			{/* Minimap */}
			<svg className='wfc-minimap' width={mmW} height={mmH} onPointerDown={e => {
				e.stopPropagation();
				const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
				const wx = (e.clientX - r.left) / mmK + mmX0;
				const wy = (e.clientY - r.top) / mmK + mmY0;
				setView(v => ({ ...v, x: size.w / 2 - wx * v.zoom, y: size.h / 2 - wy * v.zoom }));
			}}>
				{workflow.nodes.map(n => {
					const p = pos(n);
					return <rect key={n.id} x={(p.x - mmX0) * mmK} y={(p.y - mmY0) * mmK} width={NODE_W * mmK} height={nodeHeight(n) * mmK} rx={2} fill={NODE_COLORS[n.type]} opacity={0.75} />;
				})}
				<rect x={(viewWorld.x - mmX0) * mmK} y={(viewWorld.y - mmY0) * mmK} width={viewWorld.w * mmK} height={viewWorld.h * mmK}
					fill='color-mix(in srgb, var(--void-ring-color) 10%, transparent)' stroke='var(--void-ring-color)' strokeWidth={1} />
			</svg>
		</div>
	);
};

export const WORKFLOW_CANVAS_CSS = `
.wfc-board { position: relative; flex: 1; min-height: 0; overflow: hidden; outline: none; touch-action: none; user-select: none;
	background-color: color-mix(in srgb, var(--void-bg-3) 94%, #000 6%); }
.wfc-node { position: absolute; box-sizing: border-box; border-radius: 12px; background: var(--void-bg-1);
	border: 1.5px solid color-mix(in srgb, var(--void-border-2) 80%, transparent);
	box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10); cursor: pointer; transition: box-shadow .12s, border-color .12s; }
.wfc-node:hover { box-shadow: 0 4px 8px -2px rgba(16,24,40,.12), 0 2px 4px -2px rgba(16,24,40,.08); }
.wfc-node.selected { border-color: var(--void-ring-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--void-ring-color) 22%, transparent); }
.wfc-node.moving { cursor: grabbing; opacity: .92; box-shadow: 0 12px 24px -6px rgba(16,24,40,.25); }
.wfc-node-head { display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 12px; box-sizing: border-box; }
.wfc-node-title { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; color: var(--void-fg-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wfc-step { font-size: 10.5px; color: var(--void-fg-3); font-variant-numeric: tabular-nums; }
.wfc-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 7px; flex: none; }
.wfc-node-body { display: flex; align-items: flex-start; gap: 6px; padding: 0 12px 10px; margin-top: -8px; min-width: 0; }
.wfc-tag { flex: none; font-size: 10px; line-height: 16px; padding: 0 6px; border: 1px solid; border-radius: 5px; white-space: nowrap; max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
.wfc-node-text { font-size: 11px; line-height: 16px; color: var(--void-fg-3); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-all; }
.wfc-handle { position: absolute; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; box-sizing: border-box;
	background: var(--void-ring-color); border: 2px solid var(--void-bg-1); display: inline-flex; align-items: center; justify-content: center; }
.wfc-handle.in { left: -5px; width: 4px; height: 14px; margin-top: -7px; border-radius: 2px; border: none; }
.wfc-handle.out { right: -5px; cursor: crosshair; color: transparent; transition: all .1s; }
.wfc-handle.out svg { pointer-events: none; }
.wfc-node:hover .wfc-handle.out, .wfc-node.selected .wfc-handle.out { width: 18px; height: 18px; margin-top: -9px; right: -10px; color: #fff; border-width: 0; }
.wfc-group { position: absolute; border-radius: 16px; border: 1.5px dashed color-mix(in srgb, #7a5af8 55%, transparent);
	background: color-mix(in srgb, #7a5af8 6%, transparent); pointer-events: none; }
.wfc-group-label { position: absolute; left: 12px; top: 8px; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: #7a5af8; white-space: nowrap; }
.wfc-edge-tools { position: absolute; display: flex; gap: 4px; transform: translate(-50%, -50%); }
.wfc-round-btn { width: 18px; height: 18px; border-radius: 50%; border: none; padding: 0; display: inline-flex; align-items: center; justify-content: center;
	background: var(--void-ring-color); color: #fff; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.wfc-round-btn.danger { background: #f04438; }
.wfc-controls { position: absolute; left: 16px; bottom: 16px; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 10px;
	background: var(--void-bg-1); border: 1px solid var(--void-border-2); box-shadow: 0 2px 6px rgba(16,24,40,.10); }
.wfc-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; border-radius: 7px; background: transparent; color: var(--void-fg-2); cursor: pointer; padding: 0; flex: none; }
.wfc-icon-btn:hover, .wfc-zoom:hover { background: color-mix(in srgb, var(--void-fg-1) 8%, transparent); }
.wfc-zoom { min-width: 48px; height: 28px; border: none; border-radius: 7px; background: transparent; color: var(--void-fg-2); font-size: 12px; cursor: pointer; font-variant-numeric: tabular-nums; }
.wfc-sep { width: 1px; height: 16px; background: var(--void-border-2); margin: 0 3px; }
.wfc-minimap { position: absolute; right: 16px; bottom: 16px; border-radius: 10px; background: var(--void-bg-1); border: 1px solid var(--void-border-2);
	box-shadow: 0 2px 6px rgba(16,24,40,.10); cursor: pointer; }
.wfc-picker { position: absolute; z-index: 5; width: 240px; border-radius: 12px; background: var(--void-bg-1); border: 1px solid var(--void-border-2);
	box-shadow: 0 12px 16px -4px rgba(16,24,40,.12), 0 4px 6px -2px rgba(16,24,40,.06); user-select: none; }
.wfc-search { flex: 1; min-width: 0; height: 28px; padding: 0 8px; border-radius: 7px; border: 1px solid var(--void-border-2); background: var(--void-bg-2); color: var(--void-fg-1); font-size: 12px; outline: none; }
.wfc-search:focus { border-color: var(--void-ring-color); }
.wfc-pick-head { font-size: 10.5px; font-weight: 600; color: var(--void-fg-3); padding: 8px 8px 4px; }
.wfc-pick-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: none; border-radius: 8px; background: transparent; cursor: pointer; text-align: left; }
.wfc-pick-item:hover { background: color-mix(in srgb, var(--void-fg-1) 7%, transparent); }
`;
