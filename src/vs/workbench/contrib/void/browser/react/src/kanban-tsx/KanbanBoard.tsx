/*--------------------------------------------------------------------------------------
 *  Orchestra Kanban Board
 *  Orchestra 内蔵のカンバンボード。エディタ領域にマウントされる。
 *
 *  ボードの実体はサービス側 (.orchestra/kanban.json) にあり、このコンポーネントは
 *  状態を持たない。並べ替えもタスクの編集も、すべてサービスのメソッド越しに行う。
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
	AlertTriangle,
	Ban,
	CheckSquare,
	Clock,
	Loader2,
	MessageSquare,
	MoreHorizontal,
	Play,
	Plus,
	RefreshCw,
	Search,
	Settings,
	Trash2,
	X,
} from 'lucide-react';

import { useAccessor, useKanbanServiceState, useSettingsState } from '../util/services.js';
import { useTranslation } from '../util/i18n.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import {
	allLabels,
	checklistProgress,
	defaultKanbanSettings,
	isOverdue,
	KanbanColumn,
	kanbanColumnRoles,
	KanbanTask,
	latestRun,
	tasksInColumn,
} from '../../../../common/kanbanServiceTypes.js';
import {
	buttonStyle,
	Chip,
	columnRoleLabel,
	FieldRow,
	IconButton,
	InlineEditableText,
	inputStyle,
	labelColor,
	Popover,
	priorityColor,
	priorityLabel,
	runStatusColor,
	runStatusLabel,
} from './shared.js';
import { TaskDetail } from './TaskDetail.js';

const COLUMN_WIDTH = 288;

/** ドラッグ中のもの。カードとカラムでドロップ先の意味が変わるので kind で分ける */
type DragState =
	| { kind: 'task'; taskId: string; fromColumnId: string }
	| { kind: 'column'; columnId: string };

type DropTarget = { columnId: string; index: number };

// ---------------------------------------------------------------------------
// カード
// ---------------------------------------------------------------------------

const TaskCard = ({ task, isSelected, isRunning, isQueued, onSelect, onRun, onDragStart, onDragEnd, onDragOverCard }: {
	task: KanbanTask;
	isSelected: boolean;
	isRunning: boolean;
	isQueued: boolean;
	onSelect: () => void;
	onRun: () => void;
	onDragStart: () => void;
	onDragEnd: () => void;
	onDragOverCard: (e: React.DragEvent) => void;
}) => {
	const { t, language } = useTranslation();
	const [hover, setHover] = useState(false);

	const progress = checklistProgress(task);
	const run = latestRun(task);
	const overdue = isOverdue(task);

	return (
		<div
			draggable
			onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
			onDragEnd={onDragEnd}
			onDragOver={onDragOverCard}
			onClick={onSelect}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				position: 'relative',
				display: 'flex', flexDirection: 'column', gap: '6px',
				padding: '9px 10px 9px 12px',
				borderRadius: '6px',
				cursor: 'pointer',
				background: 'var(--void-bg-1)',
				border: `1px solid ${isSelected ? 'var(--void-border-1)' : 'var(--void-border-3)'}`,
				boxShadow: hover ? '0 2px 8px rgba(0,0,0,0.22)' : 'none',
				opacity: task.agentEnabled ? 1 : 0.72,
			}}
		>
			{/* 優先度は左端の帯で示す。カード本文を圧迫しない */}
			<div style={{
				position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
				borderTopLeftRadius: '6px', borderBottomLeftRadius: '6px',
				background: priorityColor[task.priority],
			}} />

			<div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
				<span style={{
					flex: 1, minWidth: 0,
					fontSize: '12px', lineHeight: 1.45, fontWeight: 500,
					color: 'var(--void-fg-1)',
					wordBreak: 'break-word',
				}}>
					{task.title}
				</span>
				{(hover || isRunning) && (
					<div onClick={e => e.stopPropagation()}>
						{isRunning
							? <Loader2 size={13} style={{ color: '#f59e0b', animation: 'spin 1s linear infinite' }} />
							: <IconButton title={t('kanban.card.run')} onClick={e => { e.stopPropagation(); onRun(); }}>
								<Play size={12} />
							</IconButton>}
					</div>
				)}
			</div>

			{task.labels.length > 0 && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
					{task.labels.map(label => <Chip key={label} text={label} color={labelColor(label)} />)}
				</div>
			)}

			<div style={{
				display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
				fontSize: '10px', color: 'var(--void-fg-4)',
			}}>
				<span style={{ color: priorityColor[task.priority], fontWeight: 600 }}>
					{priorityLabel(task.priority, language)}
				</span>

				{task.dueDate && (
					<span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: overdue ? '#ef4444' : undefined }}>
						<Clock size={10} />
						{task.dueDate}
					</span>
				)}

				{progress.total > 0 && (
					<span style={{
						display: 'inline-flex', alignItems: 'center', gap: '3px',
						color: progress.done === progress.total ? '#10b981' : undefined,
					}}>
						<CheckSquare size={10} />
						{progress.done}/{progress.total}
					</span>
				)}

				{task.comments.length > 0 && (
					<span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
						<MessageSquare size={10} />
						{task.comments.length}
					</span>
				)}

				{task.assignee && <span>@{task.assignee}</span>}

				{!task.agentEnabled && (
					<span title={t('kanban.card.agentOff')} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
						<Ban size={10} />
					</span>
				)}

				{isQueued && !isRunning && (
					<span style={{ color: '#60a5fa', fontWeight: 600 }}>•••</span>
				)}

				{run && (
					<span style={{ marginLeft: 'auto', color: runStatusColor[run.status], fontWeight: 600 }}>
						{runStatusLabel(run.status, language)}
					</span>
				)}
			</div>
		</div>
	);
};

// ---------------------------------------------------------------------------
// カラム
// ---------------------------------------------------------------------------

const ColumnSettingsPopover = ({ column, columnCount, onClose }: {
	column: KanbanColumn;
	columnCount: number;
	onClose: () => void;
}) => {
	const accessor = useAccessor();
	const kanbanService = accessor.get('IKanbanService');
	const { t, language } = useTranslation();

	return (
		<Popover onClose={onClose}>
			<FieldRow label={t('kanban.column.role')}>
				<select
					value={column.role}
					onChange={e => kanbanService.updateColumn(column.id, { role: e.target.value as KanbanColumn['role'] })}
					style={{ ...inputStyle, padding: '4px 6px' }}
				>
					{kanbanColumnRoles.map(role => (
						<option key={role} value={role}>{columnRoleLabel(role, language)}</option>
					))}
				</select>
			</FieldRow>
			<span style={{ fontSize: '10px', color: 'var(--void-fg-4)', lineHeight: 1.5 }}>
				{t('kanban.column.roleDetail')}
			</span>

			<FieldRow label={t('kanban.column.wipLimit')}>
				<input
					type='number'
					min={0}
					max={99}
					value={column.wipLimit}
					onChange={e => kanbanService.updateColumn(column.id, { wipLimit: Math.max(0, parseInt(e.target.value, 10) || 0) })}
					style={inputStyle}
				/>
			</FieldRow>

			<FieldRow label={t('kanban.column.color')}>
				<input
					type='color'
					value={column.color || '#8b95a5'}
					onChange={e => kanbanService.updateColumn(column.id, { color: e.target.value })}
					style={{ ...inputStyle, padding: '2px', height: '26px' }}
				/>
			</FieldRow>

			{columnCount > 1 && (
				<button
					type='button'
					onClick={() => {
						const count = tasksInColumn(kanbanService.state.board, column.id).length;
						if (count > 0 && !window.confirm(t('kanban.column.deleteWithTasks').replace('{count}', String(count)))) return;
						kanbanService.deleteColumn(column.id);
						onClose();
					}}
					style={{ ...buttonStyle('secondary'), color: '#ef4444', justifyContent: 'center' }}
				>
					<Trash2 size={11} />
					{t('kanban.column.delete')}
				</button>
			)}
		</Popover>
	);
};

const Column = ({ column, tasks, index, columnCount, isFiltered, selectedTaskId, runningTaskId, queuedTaskIds, drag, dropTarget, onSelectTask, onRunTask, onDragStateChange, onDropTargetChange, onDrop }: {
	column: KanbanColumn;
	tasks: KanbanTask[];
	index: number;
	columnCount: number;
	isFiltered: boolean;
	selectedTaskId: string | null;
	runningTaskId: string | null;
	queuedTaskIds: string[];
	drag: DragState | null;
	dropTarget: DropTarget | null;
	onSelectTask: (taskId: string) => void;
	onRunTask: (taskId: string) => void;
	onDragStateChange: (drag: DragState | null) => void;
	onDropTargetChange: (target: DropTarget | null) => void;
	onDrop: () => void;
}) => {
	const accessor = useAccessor();
	const kanbanService = accessor.get('IKanbanService');
	const { t, language } = useTranslation();

	const [showSettings, setShowSettings] = useState(false);
	const [composing, setComposing] = useState(false);
	const [draft, setDraft] = useState('');
	const composerRef = useRef<HTMLTextAreaElement>(null);

	const overWipLimit = column.wipLimit > 0 && tasks.length > column.wipLimit;
	const accentColor = column.color || 'var(--void-fg-3)';

	const submitDraft = () => {
		const title = draft.trim();
		if (title) kanbanService.createTask({ title, columnId: column.id });
		setDraft('');
		// 続けて積めるように入力欄は開けたままにする
		composerRef.current?.focus();
	};

	const dropIndicator = (i: number) =>
		drag?.kind === 'task' && dropTarget?.columnId === column.id && dropTarget.index === i
			? <div key={`drop-${i}`} style={{ height: '2px', borderRadius: '1px', background: 'var(--void-link-color, #3b82f6)' }} />
			: null;

	return (
		<div
			style={{
				display: 'flex', flexDirection: 'column',
				width: `${COLUMN_WIDTH}px`, flexShrink: 0,
				maxHeight: '100%',
				borderRadius: '8px',
				background: 'var(--void-bg-2)',
				border: `1px solid ${drag?.kind === 'task' && dropTarget?.columnId === column.id ? 'var(--void-border-1)' : 'var(--void-border-3)'}`,
			}}
			onDragOver={e => {
				if (drag?.kind === 'task') {
					e.preventDefault();
					// カード上での dragOver は stopPropagation しているので、
					// ここに来るのは「カードの隙間 / 空きスペース」= 末尾への挿入。
					onDropTargetChange({ columnId: column.id, index: tasks.length });
				} else if (drag?.kind === 'column') {
					e.preventDefault();
				}
			}}
			onDrop={e => {
				e.preventDefault();
				if (drag?.kind === 'column') {
					if (drag.columnId !== column.id) kanbanService.moveColumn(drag.columnId, index);
					onDragStateChange(null);
					return;
				}
				onDrop();
			}}
		>
			{/* ヘッダ (掴んでカラムごと並べ替えられる) */}
			<div
				draggable
				onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStateChange({ kind: 'column', columnId: column.id }); }}
				onDragEnd={() => onDragStateChange(null)}
				style={{
					position: 'relative',
					display: 'flex', alignItems: 'center', gap: '6px',
					padding: '8px 8px 8px 10px',
					borderBottom: '1px solid var(--void-border-3)',
					cursor: 'grab',
				}}
			>
				<span style={{ width: '8px', height: '8px', borderRadius: '50%', background: accentColor, flexShrink: 0 }} />

				<InlineEditableText
					value={column.title}
					ariaLabel={column.title}
					onCommit={next => kanbanService.updateColumn(column.id, { title: next })}
					style={{ fontSize: '12px', fontWeight: 700, color: 'var(--void-fg-1)', minWidth: 0, flex: 1 }}
					inputStyleOverride={{ fontSize: '12px', fontWeight: 700 }}
				/>

				<span style={{
					fontSize: '10px', fontWeight: 600,
					padding: '1px 6px', borderRadius: '8px',
					background: 'var(--void-bg-1)',
					color: overWipLimit ? '#ef4444' : 'var(--void-fg-4)',
				}}
					title={overWipLimit ? t('kanban.board.wipExceeded') : undefined}
				>
					{tasks.length}{column.wipLimit > 0 ? `/${column.wipLimit}` : ''}
				</span>

				{column.role !== 'none' && (
					<span style={{
						fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
						padding: '1px 5px', borderRadius: '3px',
						background: 'var(--void-bg-1)', color: 'var(--void-fg-3)',
					}}>
						{columnRoleLabel(column.role, language)}
					</span>
				)}

				<IconButton title={t('kanban.column.addTask')} onClick={() => { setComposing(true); setTimeout(() => composerRef.current?.focus(), 0); }}>
					<Plus size={13} />
				</IconButton>
				<IconButton title={t('kanban.column.settings')} onClick={() => setShowSettings(v => !v)} active={showSettings}>
					<MoreHorizontal size={13} />
				</IconButton>

				{showSettings && (
					<ColumnSettingsPopover column={column} columnCount={columnCount} onClose={() => setShowSettings(false)} />
				)}
			</div>

			{/* カード一覧 */}
			<div style={{
				display: 'flex', flexDirection: 'column', gap: '6px',
				padding: '8px', overflowY: 'auto', flex: 1, minHeight: '60px',
			}}>
				{tasks.length === 0 && (
					<div style={{ padding: '14px 4px', textAlign: 'center', fontSize: '11px', color: 'var(--void-fg-4)' }}>
						{isFiltered ? t('kanban.board.noMatches') : t('kanban.board.emptyColumn')}
					</div>
				)}

				{tasks.map((task, i) => (
					<React.Fragment key={task.id}>
						{dropIndicator(i)}
						<TaskCard
							task={task}
							isSelected={selectedTaskId === task.id}
							isRunning={runningTaskId === task.id}
							isQueued={queuedTaskIds.includes(task.id)}
							onSelect={() => onSelectTask(task.id)}
							onRun={() => onRunTask(task.id)}
							onDragStart={() => onDragStateChange({ kind: 'task', taskId: task.id, fromColumnId: column.id })}
							onDragEnd={() => { onDragStateChange(null); onDropTargetChange(null); }}
							onDragOverCard={e => {
								if (drag?.kind !== 'task') return;
								e.preventDefault();
								// カラム側のハンドラ (= 末尾へ) に上書きされないよう止める
								e.stopPropagation();
								const rect = e.currentTarget.getBoundingClientRect();
								const insertBefore = e.clientY < rect.top + rect.height / 2;
								onDropTargetChange({ columnId: column.id, index: insertBefore ? i : i + 1 });
							}}
						/>
					</React.Fragment>
				))}
				{dropIndicator(tasks.length)}

				{composing ? (
					<div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
						<textarea
							ref={composerRef}
							value={draft}
							rows={2}
							placeholder={t('kanban.board.newTaskPlaceholder')}
							onChange={e => setDraft(e.target.value)}
							onKeyDown={e => {
								if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitDraft(); }
								if (e.key === 'Escape') { setDraft(''); setComposing(false); }
							}}
							style={{ ...inputStyle, resize: 'vertical' }}
						/>
						<div style={{ display: 'flex', gap: '5px' }}>
							<button type='button' onClick={submitDraft} style={buttonStyle('primary')}>
								{t('kanban.board.newTask')}
							</button>
							<button type='button' onClick={() => { setDraft(''); setComposing(false); }} style={buttonStyle('ghost')}>
								{t('kanban.detail.close')}
							</button>
						</div>
					</div>
				) : (
					<button
						type='button'
						onClick={() => { setComposing(true); setTimeout(() => composerRef.current?.focus(), 0); }}
						style={{ ...buttonStyle('ghost'), justifyContent: 'flex-start', width: '100%' }}
					>
						<Plus size={12} />
						{t('kanban.board.newTask')}
					</button>
				)}
			</div>
		</div>
	);
};

// ---------------------------------------------------------------------------
// ボード本体
// ---------------------------------------------------------------------------

const KanbanBoardInner = () => {
	const accessor = useAccessor();
	const kanbanService = accessor.get('IKanbanService');
	const commandService = accessor.get('ICommandService');
	const { t } = useTranslation();

	const state = useKanbanServiceState();
	// 旧い設定ファイルからの移行直後など、kanban キーがまだ無いことがある
	const kanbanSettings = useSettingsState().globalSettings.kanban ?? defaultKanbanSettings;

	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
	const [query, setQuery] = useState('');
	const [labelFilter, setLabelFilter] = useState('');
	const [drag, setDrag] = useState<DragState | null>(null);
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

	const board = state.board;
	const labels = useMemo(() => allLabels(board), [board]);
	const isFiltered = !!query.trim() || !!labelFilter;

	const matches = useCallback((task: KanbanTask) => {
		if (labelFilter && !task.labels.includes(labelFilter)) return false;
		const q = query.trim().toLowerCase();
		if (!q) return true;
		return task.title.toLowerCase().includes(q)
			|| task.description.toLowerCase().includes(q)
			|| task.labels.some(l => l.toLowerCase().includes(q))
			|| task.assignee.toLowerCase().includes(q);
	}, [query, labelFilter]);

	const visibleTasksByColumn = useMemo(() => {
		const map: Record<string, KanbanTask[]> = {};
		for (const column of board.columns) map[column.id] = tasksInColumn(board, column.id).filter(matches);
		return map;
	}, [board, matches]);

	const selectedTask = selectedTaskId ? board.tasks.find(t => t.id === selectedTaskId) ?? null : null;
	const runningTask = state.runningTaskId ? board.tasks.find(t => t.id === state.runningTaskId) ?? null : null;

	const handleDrop = useCallback(() => {
		if (drag?.kind !== 'task' || !dropTarget) { setDrag(null); setDropTarget(null); return; }

		// dropTarget.index は「画面に見えているカード配列」での挿入位置。moveTask が欲しいのは
		// 「ドラッグ中のカードを抜いた実データ配列」での位置なので、挿入位置の直後に来るカードを
		// 手がかりに読み替える。フィルタが効いていても同じ理屈で通る。
		const visible = visibleTasksByColumn[dropTarget.columnId] ?? [];
		const actual = tasksInColumn(board, dropTarget.columnId).filter(t => t.id !== drag.taskId);

		const anchor = visible.slice(dropTarget.index).find(t => t.id !== drag.taskId);
		const anchorIndex = anchor ? actual.findIndex(t => t.id === anchor.id) : -1;
		const index = anchorIndex === -1 ? actual.length : anchorIndex;

		kanbanService.moveTask(drag.taskId, dropTarget.columnId, index);
		setDrag(null);
		setDropTarget(null);
	}, [drag, dropTarget, board, visibleTasksByColumn, kanbanService]);

	if (!state.isLoaded) {
		return (
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '8px', color: 'var(--void-fg-3)', fontSize: '13px' }}>
				<Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
				{t('kanban.board.loading')}
			</div>
		);
	}

	return (
		<div style={{
			display: 'flex', flexDirection: 'column',
			height: '100%', width: '100%', overflow: 'hidden',
			background: 'var(--void-bg-3)', color: 'var(--void-fg-1)',
			fontFamily: 'var(--vscode-font-family)',
		}}>
			{/* keyframes をこのパネル内で完結させる (グローバル CSS を汚さない) */}
			<style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

			{/* ツールバー */}
			<div style={{
				display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
				padding: '10px 14px',
				borderBottom: '1px solid var(--void-border-3)',
				background: 'var(--void-bg-2)',
			}}>
				<InlineEditableText
					value={board.title}
					ariaLabel={board.title}
					onCommit={next => kanbanService.setBoardTitle(next)}
					style={{ fontSize: '15px', fontWeight: 700 }}
					inputStyleOverride={{ fontSize: '15px', fontWeight: 700, width: '240px' }}
				/>

				<span style={{ fontSize: '11px', color: 'var(--void-fg-4)' }}>
					{board.tasks.length}
				</span>

				<div style={{ position: 'relative', marginLeft: '8px' }}>
					<Search size={12} style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: 'var(--void-fg-4)' }} />
					<input
						value={query}
						onChange={e => setQuery(e.target.value)}
						placeholder={t('kanban.board.search')}
						style={{ ...inputStyle, width: '200px', paddingLeft: '24px' }}
					/>
				</div>

				<select
					value={labelFilter}
					onChange={e => setLabelFilter(e.target.value)}
					style={{ ...inputStyle, width: 'auto', minWidth: '120px' }}
				>
					<option value=''>{t('kanban.board.allLabels')}</option>
					{labels.map(label => <option key={label} value={label}>{label}</option>)}
				</select>

				<div style={{ flex: 1 }} />

				<label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--void-fg-2)', cursor: 'pointer' }}
					title={t('kanban.board.autoRunDetail')}
				>
					<input
						type='checkbox'
						checked={kanbanSettings.autoRunEnabled}
						onChange={e => { void kanbanService.setAutoRunEnabled(e.target.checked); }}
					/>
					{t('kanban.board.autoRun')}
				</label>

				{state.isRunning ? (
					<button type='button' onClick={() => { void kanbanService.cancelCurrent(); }} style={{ ...buttonStyle('secondary'), color: '#ef4444' }}>
						<X size={12} />
						{t('kanban.board.cancelRun')}
					</button>
				) : (
					<button type='button' onClick={() => { void kanbanService.runNow(); }} style={buttonStyle('primary')}>
						<Play size={12} />
						{t('kanban.board.runNow')}
					</button>
				)}

				<button type='button' onClick={() => kanbanService.addColumn(t('kanban.board.newColumnName'))} style={buttonStyle('secondary')}>
					<Plus size={12} />
					{t('kanban.board.addColumn')}
				</button>

				<IconButton title={t('kanban.board.reload')} onClick={() => { void kanbanService.reload(); }}>
					<RefreshCw size={13} />
				</IconButton>
				<IconButton title={t('kanban.board.openSettings')} onClick={() => { void commandService.executeCommand('workbench.action.openVoidSettings'); }}>
					<Settings size={13} />
				</IconButton>
			</div>

			{/* 状態バー */}
			{(state.isRunning || state.lastError || kanbanSettings.dryRun || state.source.kind === 'storage') && (
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{state.isRunning && (
						<Banner color='#f59e0b' icon={<Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}>
							{t('kanban.board.running').replace('{title}', runningTask?.title ?? '')}
							{state.awaitingApproval && (
								<>
									{' — '}
									<button
										type='button'
										onClick={() => { void commandService.executeCommand('void.sidebar.open'); }}
										style={{ ...buttonStyle('ghost'), padding: 0, color: '#f59e0b', textDecoration: 'underline' }}
									>
										{t('kanban.board.awaitingApproval')}
									</button>
								</>
							)}
						</Banner>
					)}
					{kanbanSettings.dryRun && (
						<Banner color='#60a5fa' icon={<AlertTriangle size={12} />}>{t('kanban.board.dryRunOn')}</Banner>
					)}
					{state.source.kind === 'storage' && (
						<Banner color='var(--void-fg-4)' icon={<AlertTriangle size={12} />}>{t('kanban.board.storedInApp')}</Banner>
					)}
					{state.lastError && (
						<Banner color='#ef4444' icon={<AlertTriangle size={12} />}>{state.lastError}</Banner>
					)}
				</div>
			)}

			{/* ボード + 詳細 */}
			<div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
				<div style={{
					display: 'flex', gap: '10px', alignItems: 'flex-start',
					flex: 1, minWidth: 0,
					padding: '12px 14px',
					overflowX: 'auto', overflowY: 'hidden',
				}}>
					{board.columns.map((column, index) => (
						<Column
							key={column.id}
							column={column}
							index={index}
							columnCount={board.columns.length}
							tasks={visibleTasksByColumn[column.id] ?? []}
							isFiltered={isFiltered}
							selectedTaskId={selectedTaskId}
							runningTaskId={state.runningTaskId}
							queuedTaskIds={state.queuedTaskIds}
							drag={drag}
							dropTarget={dropTarget}
							onSelectTask={setSelectedTaskId}
							onRunTask={taskId => { void kanbanService.runTask(taskId); }}
							onDragStateChange={setDrag}
							onDropTargetChange={setDropTarget}
							onDrop={handleDrop}
						/>
					))}
				</div>

				{selectedTask && (
					<TaskDetail
						task={selectedTask}
						board={board}
						onClose={() => setSelectedTaskId(null)}
					/>
				)}
			</div>

			{/* 保存先 */}
			{state.source.kind === 'file' && (
				<div style={{
					padding: '5px 14px',
					borderTop: '1px solid var(--void-border-3)',
					fontSize: '10px', color: 'var(--void-fg-4)',
					whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
				}}>
					{t('kanban.board.storedInFile').replace('{path}', state.source.path)}
				</div>
			)}
		</div>
	);
};

const Banner = ({ color, icon, children }: { color: string; icon: React.ReactNode; children: React.ReactNode }) => (
	<div style={{
		display: 'flex', alignItems: 'center', gap: '6px',
		padding: '5px 14px',
		fontSize: '11px', color,
		background: 'var(--void-bg-2)',
		borderBottom: '1px solid var(--void-border-3)',
	}}>
		{icon}
		<span style={{ flex: 1, minWidth: 0 }}>{children}</span>
	</div>
);

export const KanbanBoard = () => (
	<ErrorBoundary>
		<KanbanBoardInner />
	</ErrorBoundary>
);
