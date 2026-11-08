/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// The chat log of a workflow's parallel node (the ```division-parallel block, see common/parallelLog.ts):
// one lane per branch with its status and elapsed time, and the chosen branch's own log below.
// "並べる" shows every branch side by side instead, each with its own scroll.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Columns3, Loader2, Rows3, Split, Square, X, Clock } from 'lucide-react';

import { formatLaneElapsed, isParallelLaneActive, laneElapsedMs, laneLastLine, ParallelLane, ParallelLaneStatus, ParallelLog, parallelLogCounts } from '../../../../common/parallelLog.js';

const STATUS_COLOR: Record<ParallelLaneStatus, string> = {
	waiting: 'var(--void-fg-4)',
	running: '#3b82f6',
	done: '#10b981',
	error: '#ef4444',
	stopped: 'var(--void-fg-3)',
};

const STATUS_LABEL: Record<ParallelLaneStatus, string> = {
	waiting: '待機中',
	running: '実行中',
	done: '完了',
	error: 'エラー',
	stopped: '停止',
};

const ACCENT = '#12b76a'; // the workflow canvas's parallel-node colour

const StatusIcon = ({ status, size = 12 }: { status: ParallelLaneStatus, size?: number }) => {
	const color = STATUS_COLOR[status];
	switch (status) {
		case 'running': return <Loader2 size={size} className='animate-spin' style={{ color, flexShrink: 0 }} />;
		case 'done': return <Check size={size} style={{ color, flexShrink: 0 }} />;
		case 'error': return <X size={size} style={{ color, flexShrink: 0 }} />;
		case 'stopped': return <Square size={size - 2} style={{ color, flexShrink: 0 }} />;
		default: return <Clock size={size} style={{ color, flexShrink: 0 }} />;
	}
};

/** Re-render once a second while any branch is running, for the elapsed time. */
const useNow = (active: boolean) => {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!active) { return; }
		setNow(Date.now());
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [active]);
	return now;
};

/** A scroll area that keeps to the bottom while the branch writes, unless the user scrolled up. */
const FollowScroll = ({ children, maxHeight, deps }: { children: React.ReactNode, maxHeight: number, deps: unknown }) => {
	const ref = useRef<HTMLDivElement>(null);
	const pinned = useRef(true);
	useLayoutEffect(() => {
		const el = ref.current;
		if (el && pinned.current) { el.scrollTop = el.scrollHeight; }
	}, [deps]);
	return (
		<div
			ref={ref}
			onScroll={e => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
			style={{ maxHeight, overflowY: 'auto', padding: '8px 10px' }}
		>
			{children}
		</div>
	);
};

const laneName = (lane: ParallelLane) => `${lane.step > 0 ? `${lane.step}. ` : ''}${lane.role}`;

const Elapsed = ({ lane, now }: { lane: ParallelLane, now: number }) => {
	const ms = laneElapsedMs(lane, now);
	if (ms === undefined) { return null; }
	return <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--void-fg-3)', fontSize: '10.5px', flexShrink: 0 }}>{formatLaneElapsed(ms)}</span>;
};

const LaneBody = ({ lane, renderMarkdown }: { lane: ParallelLane, renderMarkdown: (md: string) => React.ReactNode }) => {
	if (lane.text.trim()) { return <div className='prose prose-sm break-words max-w-none' style={{ fontSize: '12.5px' }}>{renderMarkdown(lane.text)}</div>; }
	return <div style={{ fontSize: '12px', color: 'var(--void-fg-3)' }}>
		{lane.status === 'waiting' ? '他の準備が終わるのを待っています…' : lane.status === 'running' ? '出力を待っています…' : '(出力なし)'}
	</div>;
};

export const ParallelLogBlock = ({ log, renderMarkdown }: { log: ParallelLog, renderMarkdown: (md: string) => React.ReactNode }) => {
	const counts = parallelLogCounts(log);
	const now = useNow(counts.active > 0);
	const [layout, setLayout] = useState<'lanes' | 'columns'>('lanes');
	// The chosen branch; by default the first one still running (or the first one).
	const [picked, setPicked] = useState<number | null>(null);
	const selected = log.lanes.find(l => l.key === picked)
		?? log.lanes.find(l => l.status === 'running')
		?? log.lanes[0];

	const finished = counts.done + counts.error;
	const groupStart = Math.min(...log.lanes.map(l => l.startedAt ?? Infinity));
	const groupEnd = counts.active > 0 ? now : Math.max(...log.lanes.map(l => l.endedAt ?? l.startedAt ?? 0));
	const groupMs = isFinite(groupStart) ? groupEnd - groupStart : undefined;

	return (
		<div style={{
			margin: '10px 0',
			border: '1px solid var(--void-border-2)',
			borderLeft: `3px solid ${ACCENT}`,
			borderRadius: '8px',
			background: 'var(--void-bg-2)',
			overflow: 'hidden',
		}}>
			{/* header */}
			<div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderBottom: '1px solid var(--void-border-2)' }}>
				<Split size={13} style={{ color: ACCENT, flexShrink: 0 }} />
				<span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--void-fg-1)' }}>並列実行</span>
				<span style={{ fontSize: '11px', color: 'var(--void-fg-3)' }}>
					{log.lanes.length} 分岐 · {counts.active > 0 ? `${finished}/${log.lanes.length} 完了` : counts.error > 0 ? `${counts.error} 件エラー` : 'すべて完了'}
					{groupMs !== undefined ? ` · ${formatLaneElapsed(groupMs)}` : ''}
				</span>
				<div style={{ flex: 1 }} />
				<div role='group' aria-label='表示' style={{ display: 'flex', border: '1px solid var(--void-border-2)', borderRadius: '6px', overflow: 'hidden' }}>
					{([['lanes', Rows3, '1 つずつ'], ['columns', Columns3, '並べる']] as const).map(([value, Icon, label]) => (
						<button
							key={value}
							type='button'
							title={label}
							aria-pressed={layout === value}
							onClick={() => setLayout(value)}
							style={{
								display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 7px', fontSize: '10.5px', border: 'none', cursor: 'pointer',
								background: layout === value ? 'var(--void-bg-3)' : 'transparent',
								color: layout === value ? 'var(--void-fg-1)' : 'var(--void-fg-3)',
							}}
						>
							<Icon size={11} />{label}
						</button>
					))}
				</div>
			</div>

			{/* overall progress */}
			<div style={{ display: 'flex', height: '2px', background: 'var(--void-border-2)' }}>
				{log.lanes.map(l => (
					<div key={l.key} style={{ flex: 1, background: isParallelLaneActive(l.status) ? 'transparent' : STATUS_COLOR[l.status], transition: 'background 200ms' }} />
				))}
			</div>

			{layout === 'lanes' ? <>
				<div role='tablist' style={{ display: 'flex', flexDirection: 'column' }}>
					{log.lanes.map(lane => {
						const isSel = lane.key === selected.key;
						const preview = laneLastLine(lane);
						return (
							<button
								key={lane.key}
								type='button'
								role='tab'
								aria-selected={isSel}
								onClick={() => setPicked(lane.key)}
								style={{
									display: 'flex', flexDirection: 'column', gap: '1px', textAlign: 'left', width: '100%', padding: '6px 10px', border: 'none', cursor: 'pointer',
									borderBottom: '1px solid var(--void-border-2)',
									boxShadow: isSel ? `inset 2px 0 0 ${STATUS_COLOR[lane.status]}` : 'none',
									background: isSel ? 'var(--void-bg-1)' : 'transparent',
								}}
							>
								<span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, width: '100%' }}>
									<StatusIcon status={lane.status} />
									<span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--void-fg-1)', flexShrink: 0 }}>{laneName(lane)}</span>
									<span style={{ fontSize: '11.5px', color: 'var(--void-fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{lane.title}</span>
									<span style={{ fontSize: '10.5px', color: STATUS_COLOR[lane.status], flexShrink: 0 }}>{STATUS_LABEL[lane.status]}</span>
									<Elapsed lane={lane} now={now} />
								</span>
								{!isSel && preview && (
									<span style={{ fontSize: '11px', color: 'var(--void-fg-3)', paddingLeft: '18px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{preview}</span>
								)}
							</button>
						);
					})}
				</div>
				<FollowScroll maxHeight={420} deps={`${selected.key}:${selected.text.length}`}>
					<LaneBody lane={selected} renderMarkdown={renderMarkdown} />
				</FollowScroll>
			</> : (
				<div style={{ display: 'flex', overflowX: 'auto' }}>
					{log.lanes.map((lane, idx) => (
						<div key={lane.key} style={{ flex: '1 0 240px', minWidth: 0, borderLeft: idx ? '1px solid var(--void-border-2)' : 'none', display: 'flex', flexDirection: 'column' }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderBottom: '1px solid var(--void-border-2)', borderTop: `2px solid ${STATUS_COLOR[lane.status]}` }}>
								<StatusIcon status={lane.status} />
								<span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--void-fg-1)', flexShrink: 0 }}>{laneName(lane)}</span>
								<span title={lane.title} style={{ fontSize: '11px', color: 'var(--void-fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{lane.title}</span>
								<Elapsed lane={lane} now={now} />
							</div>
							<FollowScroll maxHeight={360} deps={lane.text.length}>
								<LaneBody lane={lane} renderMarkdown={renderMarkdown} />
							</FollowScroll>
						</div>
					))}
				</div>
			)}
		</div>
	);
};
