/*--------------------------------------------------------------------------------------
 *  Orchestra Kanban - task detail drawer
 *  カードをクリックすると右に開く編集パネル。ボード側と同じくサービスが唯一の真実で、
 *  ここはテキスト入力の途中経過だけをローカルに持つ。
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Play, Plus, Trash2, X } from 'lucide-react';

import { useAccessor } from '../util/services.js';
import { useTranslation } from '../util/i18n.js';
import {
	KanbanBoard as KanbanBoardType,
	KanbanPriority,
	kanbanPriorities,
	KanbanRunRecord,
	KanbanTask,
} from '../../../../common/kanbanServiceTypes.js';
import {
	buttonStyle,
	Chip,
	FieldRow,
	formatTimestamp,
	IconButton,
	inputStyle,
	labelColor,
	priorityColor,
	priorityLabel,
	runStatusColor,
	runStatusLabel,
} from './shared.js';

const DRAWER_WIDTH = 380;

const Section = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
	<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
		<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
			<span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--void-fg-3)' }}>
				{title}
			</span>
			<div style={{ flex: 1 }} />
			{action}
		</div>
		{children}
	</div>
);

const RunEntry = ({ run, onOpenThread }: { run: KanbanRunRecord; onOpenThread: (threadId: string) => void }) => {
	const { t, language } = useTranslation();
	const [expanded, setExpanded] = useState(false);
	const durationSec = Math.max(0, Math.round((run.endedAt - run.startedAt) / 1000));

	return (
		<div style={{
			display: 'flex', flexDirection: 'column', gap: '4px',
			padding: '6px 8px', borderRadius: '4px',
			background: 'var(--void-bg-1)', border: '1px solid var(--void-border-3)',
		}}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px' }}>
				<span style={{ color: runStatusColor[run.status], fontWeight: 700 }}>{runStatusLabel(run.status, language)}</span>
				<span style={{ color: 'var(--void-fg-4)' }}>{durationSec}s</span>
				<span style={{ color: 'var(--void-fg-4)' }}>{formatTimestamp(run.startedAt)}</span>
				<div style={{ flex: 1 }} />
				{run.threadId && (
					<button type='button' onClick={() => onOpenThread(run.threadId!)} style={{ ...buttonStyle('ghost'), padding: '0 2px', fontSize: '10px' }}>
						{t('kanban.detail.openThread')}
					</button>
				)}
			</div>

			{run.error && <div style={{ fontSize: '10px', color: '#ef4444', lineHeight: 1.5 }}>{run.error}</div>}

			{run.summary && (
				<>
					<div style={{
						fontSize: '11px', color: 'var(--void-fg-2)', lineHeight: 1.55,
						whiteSpace: 'pre-wrap', wordBreak: 'break-word',
						maxHeight: expanded ? 'none' : '4.6em', overflow: 'hidden',
					}}>
						{run.summary}
					</div>
					<button type='button' onClick={() => setExpanded(v => !v)} style={{ ...buttonStyle('ghost'), padding: 0, alignSelf: 'flex-start', fontSize: '10px' }}>
						{expanded ? '▲' : '▼'}
					</button>
				</>
			)}
		</div>
	);
};

export const TaskDetail = ({ task, board, onClose }: {
	task: KanbanTask;
	board: KanbanBoardType;
	onClose: () => void;
}) => {
	const accessor = useAccessor();
	const kanbanService = accessor.get('IKanbanService');
	const chatThreadService = accessor.get('IChatThreadService');
	const commandService = accessor.get('ICommandService');
	const { t, language } = useTranslation();

	// テキスト入力は打っている間だけローカルに持ち、blur で確定する。
	// task.id が変わったときだけ引き直すので、他所からの更新で入力中の文字が消えない。
	const [title, setTitle] = useState(task.title);
	const [description, setDescription] = useState(task.description);
	const [labelDraft, setLabelDraft] = useState('');
	const [checklistDraft, setChecklistDraft] = useState('');
	const [commentDraft, setCommentDraft] = useState('');
	const labelInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setTitle(task.title);
		setDescription(task.description);
		setLabelDraft('');
		setChecklistDraft('');
		setCommentDraft('');
	}, [task.id]);

	const addLabel = () => {
		const label = labelDraft.trim();
		if (!label || task.labels.includes(label)) { setLabelDraft(''); return; }
		kanbanService.updateTask(task.id, { labels: [...task.labels, label] });
		setLabelDraft('');
		labelInputRef.current?.focus();
	};

	const openThread = (threadId: string) => {
		chatThreadService.switchToThread(threadId);
		void commandService.executeCommand('void.sidebar.open');
	};

	return (
		<div style={{
			display: 'flex', flexDirection: 'column',
			width: `${DRAWER_WIDTH}px`, flexShrink: 0, height: '100%',
			borderLeft: '1px solid var(--void-border-3)',
			background: 'var(--void-bg-2)',
		}}>
			{/* ヘッダ */}
			<div style={{
				display: 'flex', alignItems: 'center', gap: '6px',
				padding: '8px 8px 8px 12px',
				borderBottom: '1px solid var(--void-border-3)',
			}}>
				<span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--void-fg-3)' }}>
					{t('kanban.detail.createdAt').replace('{time}', formatTimestamp(task.createdAt))}
				</span>
				<div style={{ flex: 1 }} />
				<IconButton
					title={t('kanban.detail.delete')}
					danger
					onClick={() => {
						if (!window.confirm(t('kanban.detail.deleteConfirm').replace('{title}', task.title))) return;
						kanbanService.deleteTask(task.id);
						onClose();
					}}
				>
					<Trash2 size={13} />
				</IconButton>
				<IconButton title={t('kanban.detail.close')} onClick={onClose}>
					<X size={14} />
				</IconButton>
			</div>

			<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

				{/* タイトル */}
				<textarea
					value={title}
					rows={2}
					aria-label={t('kanban.detail.titleLabel')}
					onChange={e => setTitle(e.target.value)}
					onBlur={() => {
						const next = title.trim();
						if (next && next !== task.title) kanbanService.updateTask(task.id, { title: next });
						else setTitle(task.title);
					}}
					style={{ ...inputStyle, fontSize: '14px', fontWeight: 600, resize: 'vertical', lineHeight: 1.4 }}
				/>

				{/* 実行 */}
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
					<button type='button' onClick={() => { void kanbanService.runTask(task.id); }} style={buttonStyle('primary')}>
						<Play size={12} />
						{t('kanban.card.run')}
					</button>
					<label
						title={t('kanban.detail.agentEnabledDetail')}
						style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--void-fg-2)', cursor: 'pointer' }}
					>
						<input
							type='checkbox'
							checked={task.agentEnabled}
							onChange={e => kanbanService.updateTask(task.id, { agentEnabled: e.target.checked })}
						/>
						{t('kanban.detail.agentEnabled')}
					</label>
				</div>

				{/* メタ情報 */}
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
					<FieldRow label={t('kanban.detail.column')}>
						<select
							value={task.columnId}
							onChange={e => kanbanService.moveTask(task.id, e.target.value, 0)}
							style={inputStyle}
						>
							{board.columns.map(column => <option key={column.id} value={column.id}>{column.title}</option>)}
						</select>
					</FieldRow>

					<FieldRow label={t('kanban.detail.priority')}>
						<select
							value={task.priority}
							onChange={e => kanbanService.updateTask(task.id, { priority: e.target.value as KanbanPriority })}
							style={{ ...inputStyle, color: priorityColor[task.priority] }}
						>
							{kanbanPriorities.map(priority => (
								<option key={priority} value={priority}>{priorityLabel(priority, language)}</option>
							))}
						</select>
					</FieldRow>

					<FieldRow label={t('kanban.detail.dueDate')}>
						<input
							type='date'
							value={task.dueDate}
							onChange={e => kanbanService.updateTask(task.id, { dueDate: e.target.value })}
							style={inputStyle}
						/>
					</FieldRow>

					<FieldRow label={t('kanban.detail.assignee')}>
						<input
							value={task.assignee}
							onChange={e => kanbanService.updateTask(task.id, { assignee: e.target.value })}
							style={inputStyle}
						/>
					</FieldRow>
				</div>

				{/* 説明 */}
				<Section title={t('kanban.detail.description')}>
					<textarea
						value={description}
						rows={6}
						placeholder={t('kanban.detail.descriptionPlaceholder')}
						onChange={e => setDescription(e.target.value)}
						onBlur={() => {
							if (description !== task.description) kanbanService.updateTask(task.id, { description });
						}}
						style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55 }}
					/>
				</Section>

				{/* ラベル */}
				<Section title={t('kanban.detail.labels')}>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
						{task.labels.map(label => (
							<Chip
								key={label}
								text={label}
								color={labelColor(label)}
								onRemove={() => kanbanService.updateTask(task.id, { labels: task.labels.filter(l => l !== label) })}
							/>
						))}
					</div>
					<input
						ref={labelInputRef}
						value={labelDraft}
						list='void-kanban-label-suggestions'
						placeholder={t('kanban.detail.addLabel')}
						onChange={e => setLabelDraft(e.target.value)}
						onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
						onBlur={addLabel}
						style={inputStyle}
					/>
					<datalist id='void-kanban-label-suggestions'>
						{[...new Set(board.tasks.flatMap(t2 => t2.labels))].map(label => <option key={label} value={label} />)}
					</datalist>
				</Section>

				{/* チェックリスト */}
				<Section title={t('kanban.detail.checklist')}>
					{task.checklist.map(item => (
						<div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
							<input
								type='checkbox'
								checked={item.done}
								onChange={e => kanbanService.updateChecklistItem(task.id, item.id, { done: e.target.checked })}
							/>
							<input
								value={item.text}
								onChange={e => kanbanService.updateChecklistItem(task.id, item.id, { text: e.target.value })}
								style={{
									...inputStyle,
									border: '1px solid transparent',
									background: 'transparent',
									padding: '2px 4px',
									textDecoration: item.done ? 'line-through' : 'none',
									color: item.done ? 'var(--void-fg-4)' : 'var(--void-fg-1)',
								}}
							/>
							<IconButton title={t('kanban.detail.delete')} onClick={() => kanbanService.deleteChecklistItem(task.id, item.id)}>
								<X size={11} />
							</IconButton>
						</div>
					))}
					<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
						<Plus size={12} style={{ color: 'var(--void-fg-4)', flexShrink: 0 }} />
						<input
							value={checklistDraft}
							placeholder={t('kanban.detail.addChecklistItem')}
							onChange={e => setChecklistDraft(e.target.value)}
							onKeyDown={e => {
								if (e.key !== 'Enter') return;
								e.preventDefault();
								kanbanService.addChecklistItem(task.id, checklistDraft);
								setChecklistDraft('');
							}}
							style={inputStyle}
						/>
					</div>
				</Section>

				{/* コメント */}
				<Section title={t('kanban.detail.comments')}>
					{task.comments.map(comment => (
						<div key={comment.id} style={{
							display: 'flex', flexDirection: 'column', gap: '3px',
							padding: '6px 8px', borderRadius: '4px',
							background: 'var(--void-bg-1)',
							border: `1px solid ${comment.author === 'agent' ? 'var(--void-border-2)' : 'var(--void-border-3)'}`,
						}}>
							<div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: 'var(--void-fg-4)' }}>
								<MessageSquare size={10} />
								<span style={{ fontWeight: 700, color: comment.author === 'agent' ? 'var(--void-link-color, #60a5fa)' : 'var(--void-fg-3)' }}>
									{comment.author === 'agent' ? t('kanban.detail.authorAgent') : t('kanban.detail.authorUser')}
								</span>
								<span>{formatTimestamp(comment.createdAt)}</span>
								<div style={{ flex: 1 }} />
								<IconButton title={t('kanban.detail.delete')} onClick={() => kanbanService.deleteComment(task.id, comment.id)}>
									<X size={10} />
								</IconButton>
							</div>
							<div style={{ fontSize: '11px', color: 'var(--void-fg-2)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
								{comment.body}
							</div>
						</div>
					))}

					<textarea
						value={commentDraft}
						rows={2}
						placeholder={t('kanban.detail.addComment')}
						onChange={e => setCommentDraft(e.target.value)}
						onKeyDown={e => {
							if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								kanbanService.addComment(task.id, commentDraft);
								setCommentDraft('');
							}
						}}
						style={{ ...inputStyle, resize: 'vertical' }}
					/>
					{commentDraft.trim() && (
						<button
							type='button'
							onClick={() => { kanbanService.addComment(task.id, commentDraft); setCommentDraft(''); }}
							style={{ ...buttonStyle('secondary'), alignSelf: 'flex-start' }}
						>
							{t('kanban.detail.post')}
						</button>
					)}
				</Section>

				{/* 実行履歴 */}
				<Section title={t('kanban.detail.runHistory')}>
					{task.runs.length === 0
						? <span style={{ fontSize: '11px', color: 'var(--void-fg-4)' }}>{t('kanban.detail.noRuns')}</span>
						: task.runs.map((run, i) => <RunEntry key={`${run.startedAt}-${i}`} run={run} onOpenThread={openThread} />)}
				</Section>
			</div>
		</div>
	);
};
