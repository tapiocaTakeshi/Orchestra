/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// カンバン UI の共通部品。
//
// スタイルは Tailwind ではなく inline style + `var(--void-*)` で書いている。
// このパネルはエディタ領域に直接マウントされるので、テーマ変数をそのまま参照するのが
// いちばん確実で、role-output パネルと同じ流儀。

import React, { useEffect, useRef, useState } from 'react';
import {
	KanbanColumnRole,
	KanbanPriority,
	KanbanRunStatus,
} from '../../../../common/kanbanServiceTypes.js';
import { UILanguage } from '../../../../common/voidSettingsTypes.js';

// ---------------------------------------------------------------------------
// 色・ラベル
// ---------------------------------------------------------------------------

export const priorityColor: Record<KanbanPriority, string> = {
	urgent: '#ef4444',
	high: '#f59e0b',
	normal: '#3b82f6',
	low: '#8b95a5',
};

export const priorityLabel = (priority: KanbanPriority, lang: UILanguage): string => {
	const labels: Record<KanbanPriority, { en: string; ja: string }> = {
		urgent: { en: 'Urgent', ja: '最優先' },
		high: { en: 'High', ja: '高' },
		normal: { en: 'Normal', ja: '中' },
		low: { en: 'Low', ja: '低' },
	};
	return labels[priority][lang] ?? labels[priority].en;
};

export const columnRoleLabel = (role: KanbanColumnRole, lang: UILanguage): string => {
	const labels: Record<KanbanColumnRole, { en: string; ja: string }> = {
		'none': { en: 'No role', ja: '役割なし' },
		'todo': { en: 'To Do', ja: '実行待ち' },
		'in-progress': { en: 'In Progress', ja: '実行中' },
		'done': { en: 'Done', ja: '完了' },
		'error': { en: 'Failed', ja: '失敗' },
	};
	return labels[role][lang] ?? labels[role].en;
};

export const runStatusColor: Record<KanbanRunStatus, string> = {
	'done': '#10b981',
	'error': '#ef4444',
	'timeout': '#f59e0b',
	'canceled': '#8b95a5',
	'dry-run': '#60a5fa',
};

export const runStatusLabel = (status: KanbanRunStatus, lang: UILanguage): string => {
	const labels: Record<KanbanRunStatus, { en: string; ja: string }> = {
		'done': { en: 'Done', ja: '完了' },
		'error': { en: 'Error', ja: 'エラー' },
		'timeout': { en: 'Timed out', ja: 'タイムアウト' },
		'canceled': { en: 'Canceled', ja: '中断' },
		'dry-run': { en: 'Dry run', ja: 'ドライラン' },
	};
	return labels[status][lang] ?? labels[status].en;
};

/**
 * ラベル文字列から安定した色を決める。
 * ユーザーに色を選ばせなくても、同じラベルは常に同じ色で出る。
 */
export const labelColor = (label: string): string => {
	const palette = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#f43f5e', '#84cc16'];
	let hash = 0;
	for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
	return palette[Math.abs(hash) % palette.length];
};

export const formatTimestamp = (ms: number): string => {
	if (!ms) return '';
	return new Date(ms).toLocaleString();
};

// ---------------------------------------------------------------------------
// 小さな UI 部品
// ---------------------------------------------------------------------------

export const IconButton = ({ title, onClick, children, active, danger, disabled }: {
	title: string;
	onClick: (e: React.MouseEvent) => void;
	children: React.ReactNode;
	active?: boolean;
	danger?: boolean;
	disabled?: boolean;
}) => {
	const [hover, setHover] = useState(false);
	return (
		<button
			type='button'
			title={title}
			aria-label={title}
			disabled={disabled}
			onClick={onClick}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				display: 'flex', alignItems: 'center', justifyContent: 'center',
				width: '24px', height: '24px', flexShrink: 0,
				border: 'none', borderRadius: '4px', cursor: disabled ? 'default' : 'pointer',
				background: hover && !disabled ? 'var(--void-bg-2-hover)' : 'transparent',
				color: disabled ? 'var(--void-fg-4)' : danger ? '#ef4444' : active ? 'var(--void-fg-1)' : 'var(--void-fg-3)',
				opacity: disabled ? 0.5 : 1,
			}}
		>
			{children}
		</button>
	);
};

export const Chip = ({ text, color, onRemove }: { text: string; color: string; onRemove?: () => void }) => (
	<span style={{
		display: 'inline-flex', alignItems: 'center', gap: '4px',
		fontSize: '10px', fontWeight: 600, lineHeight: 1.4,
		padding: '2px 7px', borderRadius: '10px',
		background: `${color}22`, color,
		border: `1px solid ${color}44`,
		maxWidth: '100%',
	}}>
		<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
		{onRemove && (
			<button
				type='button'
				onClick={e => { e.stopPropagation(); onRemove(); }}
				style={{ border: 'none', background: 'transparent', color, cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '11px' }}
			>
				×
			</button>
		)}
	</span>
);

export const inputStyle: React.CSSProperties = {
	width: '100%',
	boxSizing: 'border-box',
	background: 'var(--void-bg-1)',
	border: '1px solid var(--void-border-3)',
	borderRadius: '4px',
	padding: '5px 8px',
	fontSize: '12px',
	color: 'var(--void-fg-1)',
	fontFamily: 'inherit',
	outline: 'none',
};

export const buttonStyle = (variant: 'primary' | 'secondary' | 'ghost'): React.CSSProperties => ({
	display: 'inline-flex', alignItems: 'center', gap: '5px',
	padding: '4px 10px', borderRadius: '4px', cursor: 'pointer',
	fontSize: '11px', fontWeight: 600, fontFamily: 'inherit',
	whiteSpace: 'nowrap',
	...(variant === 'primary'
		? { background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: '1px solid transparent' }
		: variant === 'secondary'
			? { background: 'var(--void-bg-1)', color: 'var(--void-fg-1)', border: '1px solid var(--void-border-3)' }
			: { background: 'transparent', color: 'var(--void-fg-3)', border: '1px solid transparent' }),
});

/**
 * クリックすると入力欄に変わるテキスト。ボード名やカラム名の変更に使う。
 * Enter で確定、Escape で取り消し。
 */
export const InlineEditableText = ({ value, onCommit, style, inputStyleOverride, ariaLabel }: {
	value: string;
	onCommit: (next: string) => void;
	style?: React.CSSProperties;
	inputStyleOverride?: React.CSSProperties;
	ariaLabel: string;
}) => {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
	useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

	const commit = () => {
		setEditing(false);
		const next = draft.trim();
		if (next && next !== value) onCommit(next);
		else setDraft(value);
	};

	if (editing) {
		return (
			<input
				ref={inputRef}
				value={draft}
				aria-label={ariaLabel}
				onChange={e => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={e => {
					if (e.key === 'Enter') { e.preventDefault(); commit(); }
					if (e.key === 'Escape') { e.preventDefault(); setDraft(value); setEditing(false); }
				}}
				style={{ ...inputStyle, ...style, ...inputStyleOverride }}
			/>
		);
	}

	return (
		<span
			role='button'
			tabIndex={0}
			title={ariaLabel}
			onClick={() => setEditing(true)}
			onKeyDown={e => { if (e.key === 'Enter') setEditing(true); }}
			style={{ cursor: 'text', ...style }}
		>
			{value}
		</span>
	);
};

/** クリック外し / Escape で閉じる小さなポップオーバー */
export const Popover = ({ onClose, children, style }: {
	onClose: () => void;
	children: React.ReactNode;
	style?: React.CSSProperties;
}) => {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// ボードは別ウィンドウ (auxiliary window) にも出せる。そこではグローバルの window は
		// メインウィンドウを指すので、購読先は必ず自分が実際に載っているウィンドウから取る。
		const win = ref.current?.ownerDocument.defaultView;
		if (!win) return;

		const onPointerDown = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) onClose();
		};
		const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
		// capture 相当のタイミングにしないと、開いた瞬間のクリックで閉じてしまう
		const timer = win.setTimeout(() => {
			win.addEventListener('mousedown', onPointerDown);
			win.addEventListener('keydown', onKeyDown);
		}, 0);
		return () => {
			win.clearTimeout(timer);
			win.removeEventListener('mousedown', onPointerDown);
			win.removeEventListener('keydown', onKeyDown);
		};
	}, [onClose]);

	return (
		<div
			ref={ref}
			style={{
				position: 'absolute', zIndex: 50, top: '100%', right: 0, marginTop: '4px',
				minWidth: '220px', padding: '10px',
				display: 'flex', flexDirection: 'column', gap: '8px',
				background: 'var(--vscode-editorWidget-background, var(--void-bg-2))',
				border: '1px solid var(--void-border-2)',
				borderRadius: '6px',
				boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
				...style,
			}}
		>
			{children}
		</div>
	);
};

export const FieldRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
	<label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
		<span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--void-fg-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
			{label}
		</span>
		{children}
	</label>
);
