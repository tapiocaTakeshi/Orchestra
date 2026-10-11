/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// クラウドエージェントのパネル。エディタ領域にマウントされる (cloudAgentsPane.ts)。
//
// 左: 新しいクラウドエージェントの入力欄 + セッション一覧
// 右: 選んだセッションの詳細 (トランスクリプト / 変更ファイル / 追加の指示)
//
// 状態はすべて ICloudAgentService 側にあり、このコンポーネントは表示と操作だけを受け持つ。
// スタイルはカンバンと同じく inline style + VS Code のテーマ変数 (ダーク / ライトどちらにも追従する)。

import '../styles.css'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	AlertTriangle,
	Archive,
	Bot,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Cloud,
	Download,
	FileText,
	Loader2,
	LogIn,
	Plus,
	RefreshCw,
	SendHorizontal,
	Square,
	Terminal,
	Wrench,
	X,
	XCircle,
} from 'lucide-react';

import { useAccessor, useCloudAgentState, useIsDark } from '../util/services.js';
import { TranslationKey, useTranslation } from '../util/i18n.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import {
	CLOUD_AGENTS_MAX_PARALLEL,
	CloudChange,
	CloudSession,
	CloudSessionEvent,
	CloudSessionStatus,
	isCloudSessionActive,
} from '../../../../common/cloudAgentTypes.js';
import type { CloudChangesState } from '../../../cloudAgentServiceInterface.js';


// ---------------------------------------------------------------------------
// 見た目の共通部品
// ---------------------------------------------------------------------------

const C = {
	fg: 'var(--vscode-foreground)',
	fgMuted: 'var(--vscode-descriptionForeground)',
	bg: 'var(--vscode-editor-background)',
	bgSide: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
	bgInput: 'var(--vscode-input-background)',
	fgInput: 'var(--vscode-input-foreground)',
	border: 'var(--vscode-panel-border, var(--vscode-editorGroup-border))',
	borderInput: 'var(--vscode-input-border, var(--vscode-panel-border, transparent))',
	hover: 'var(--vscode-list-hoverBackground)',
	selected: 'var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground))',
	selectedFg: 'var(--vscode-list-activeSelectionForeground, var(--vscode-foreground))',
	link: 'var(--vscode-textLink-foreground)',
	codeBg: 'var(--vscode-textCodeBlock-background, var(--vscode-editor-background))',
	error: 'var(--vscode-errorForeground, #ef4444)',
	warning: 'var(--vscode-editorWarning-foreground, #f59e0b)',
	success: 'var(--vscode-testing-iconPassed, #10b981)',
	focus: 'var(--vscode-focusBorder)',
	buttonBg: 'var(--vscode-button-background)',
	buttonFg: 'var(--vscode-button-foreground)',
	button2Bg: 'var(--vscode-button-secondaryBackground, var(--vscode-input-background))',
	button2Fg: 'var(--vscode-button-secondaryForeground, var(--vscode-foreground))',
	monoFont: 'var(--vscode-editor-font-family, monospace)',
};

const statusColor: Record<CloudSessionStatus, string> = {
	provisioning: '#8b5cf6',
	uploading: '#06b6d4',
	running: '#3b82f6',
	idle: '#10b981',
	failed: '#ef4444',
	cancelled: '#8b95a5',
};

const statusKey = (s: CloudSessionStatus): TranslationKey => `cloudAgents.status.${s}` as TranslationKey;
const changeStatusKey = (s: CloudChange['status']): TranslationKey => `cloudAgents.changes.status.${s}` as TranslationKey;

const changeStatusColor: Record<CloudChange['status'], string> = {
	added: '#10b981',
	modified: '#3b82f6',
	deleted: '#ef4444',
	renamed: '#f59e0b',
};

const inputStyle: React.CSSProperties = {
	width: '100%',
	boxSizing: 'border-box',
	background: C.bgInput,
	color: C.fgInput,
	border: `1px solid ${C.borderInput}`,
	borderRadius: '4px',
	padding: '6px 8px',
	fontSize: '12px',
	fontFamily: 'inherit',
	outline: 'none',
};

const buttonStyle = (variant: 'primary' | 'secondary' | 'ghost' | 'danger', disabled?: boolean): React.CSSProperties => ({
	display: 'inline-flex', alignItems: 'center', gap: '5px',
	padding: '4px 10px', borderRadius: '4px',
	cursor: disabled ? 'default' : 'pointer',
	opacity: disabled ? 0.5 : 1,
	fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
	whiteSpace: 'nowrap',
	...(variant === 'primary'
		? { background: C.buttonBg, color: C.buttonFg, border: '1px solid transparent' }
		: variant === 'secondary'
			? { background: C.button2Bg, color: C.button2Fg, border: `1px solid ${C.borderInput}` }
			: variant === 'danger'
				? { background: 'transparent', color: C.error, border: `1px solid ${C.borderInput}` }
				: { background: 'transparent', color: C.fgMuted, border: '1px solid transparent' }),
});

const Spinner = ({ size = 12, color }: { size?: number; color?: string }) => (
	<Loader2 size={size} style={{ animation: 'orchestra-cloud-spin 1s linear infinite', color, flexShrink: 0 }} />
);

const StatusBadge = ({ status }: { status: CloudSessionStatus }) => {
	const { t } = useTranslation();
	const color = statusColor[status] ?? '#8b95a5';
	return (
		<span style={{
			display: 'inline-flex', alignItems: 'center', gap: '4px',
			fontSize: '10px', fontWeight: 600, lineHeight: 1.4,
			padding: '1px 7px', borderRadius: '10px',
			background: `${color}22`, color, border: `1px solid ${color}55`,
			whiteSpace: 'nowrap', flexShrink: 0,
		}}>
			{isCloudSessionActive(status) && <Spinner size={10} color={color} />}
			{t(statusKey(status))}
		</span>
	);
};

/** 「3 分前」などを定期的に更新するための現在時刻 */
const useNow = (intervalMs: number) => {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const h = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(h);
	}, [intervalMs]);
	return now;
};

const useRelativeTime = () => {
	const { t } = useTranslation();
	const now = useNow(30_000);
	return useCallback((iso: string | null | undefined) => {
		if (!iso) return '';
		const ms = Date.parse(iso);
		if (!Number.isFinite(ms)) return '';
		const diff = Math.max(0, now - ms);
		const min = Math.floor(diff / 60_000);
		if (min < 1) return t('cloudAgents.time.justNow');
		if (min < 60) return t('cloudAgents.time.minutes').replace('{n}', String(min));
		const h = Math.floor(min / 60);
		if (h < 24) return t('cloudAgents.time.hours').replace('{n}', String(h));
		return t('cloudAgents.time.days').replace('{n}', String(Math.floor(h / 24)));
	}, [now, t]);
};

const sessionTitle = (s: CloudSession) => s.title || (s.prompt.split('\n').find(l => l.trim()) ?? '').slice(0, 80) || s.id;

const formatBytes = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const isSubmitKey = (e: React.KeyboardEvent) => e.key === 'Enter' && (isMac ? e.metaKey : e.ctrlKey);


// ---------------------------------------------------------------------------
// 左: 新しいクラウドエージェント
// ---------------------------------------------------------------------------

/** パネルが閉じている間に来た「入力欄にフォーカス」の要求も拾えるよう、最後に処理した番号を覚えておく */
let lastHandledFocusRequest = 0;

const NewSessionForm = () => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();

	const [prompt, setPrompt] = useState('');
	const [count, setCount] = useState(1);
	const [includeWorkspace, setIncludeWorkspace] = useState(true);
	const [showDetails, setShowDetails] = useState(false);
	const [title, setTitle] = useState('');
	const [model, setModel] = useState('');
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		if (state.focusFormRequest > lastHandledFocusRequest) {
			lastHandledFocusRequest = state.focusFormRequest;
			textareaRef.current?.focus();
		}
	}, [state.focusFormRequest]);

	const canLaunch = !!prompt.trim() && !state.creating && state.isLoggedIn;

	const launch = useCallback(async () => {
		if (!canLaunch) return;
		const created = await cloudAgentService.createSession({
			prompt,
			title: title.trim() || undefined,
			model: model.trim() || undefined,
			includeWorkspace: includeWorkspace && !!state.workspaceName,
			count,
		});
		if (created.length) {
			setPrompt('');
			setTitle('');
		}
	}, [canLaunch, cloudAgentService, prompt, title, model, includeWorkspace, state.workspaceName, count]);

	return (
		<div style={{ padding: '12px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: C.fg }}>
				<Plus size={13} />
				{t('cloudAgents.new.title')}
			</div>
			<textarea
				ref={textareaRef}
				value={prompt}
				onChange={e => setPrompt(e.target.value)}
				onKeyDown={e => {
					if (isSubmitKey(e)) { e.preventDefault(); void launch(); }
				}}
				placeholder={t('cloudAgents.new.placeholder')}
				rows={4}
				style={{ ...inputStyle, resize: 'vertical', minHeight: '72px', lineHeight: 1.5 }}
			/>

			<div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
				<label title={t('cloudAgents.new.parallelHint')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.fg }}>
					{t('cloudAgents.new.parallel')}
					<select
						value={count}
						onChange={e => setCount(Number(e.target.value))}
						style={{ ...inputStyle, width: 'auto', padding: '3px 6px' }}
					>
						{Array.from({ length: CLOUD_AGENTS_MAX_PARALLEL }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
					</select>
				</label>
				<label
					title={state.workspaceName ? t('cloudAgents.new.includeWorkspaceHint').replace('{name}', state.workspaceName) : t('cloudAgents.new.noWorkspace')}
					style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: state.workspaceName ? C.fg : C.fgMuted, cursor: state.workspaceName ? 'pointer' : 'default' }}
				>
					<input
						type='checkbox'
						checked={includeWorkspace && !!state.workspaceName}
						disabled={!state.workspaceName}
						onChange={e => setIncludeWorkspace(e.target.checked)}
					/>
					{t('cloudAgents.new.includeWorkspace')}
				</label>
				<button type='button' onClick={() => setShowDetails(v => !v)} style={{ ...buttonStyle('ghost'), padding: '2px 4px', fontWeight: 400 }}>
					{showDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
					{t('cloudAgents.new.details')}
				</button>
			</div>

			<div style={{ fontSize: '11px', color: C.fgMuted, lineHeight: 1.4 }}>
				{state.workspaceName
					? (includeWorkspace ? t('cloudAgents.new.includeWorkspaceHint').replace('{name}', state.workspaceName) : t('cloudAgents.new.emptyFolder'))
					: t('cloudAgents.new.noWorkspace')}
			</div>

			{showDetails && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
					<label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: C.fgMuted }}>
						{t('cloudAgents.new.titleLabel')}
						<input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('cloudAgents.new.titlePlaceholder')} style={inputStyle} />
					</label>
					<label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: C.fgMuted }}>
						{t('cloudAgents.new.model')}
						<input value={model} onChange={e => setModel(e.target.value)} placeholder={t('cloudAgents.new.modelPlaceholder')} style={{ ...inputStyle, fontFamily: C.monoFont }} />
					</label>
				</div>
			)}

			<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
				<button type='button' disabled={!canLaunch} onClick={() => { void launch(); }} style={buttonStyle('primary', !canLaunch)}>
					{state.creating ? <Spinner size={12} /> : <Cloud size={12} />}
					{state.creating ? t('cloudAgents.new.launching') : count > 1 ? t('cloudAgents.new.launchN').replace('{count}', String(count)) : t('cloudAgents.new.launch')}
				</button>
				<span style={{ fontSize: '10px', color: C.fgMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
					{state.creatingProgress ?? t('cloudAgents.new.shortcut')}
				</span>
			</div>
			<div style={{ fontSize: '10px', color: C.fgMuted }}>{t('cloudAgents.billing')}</div>
		</div>
	);
};


// ---------------------------------------------------------------------------
// 左: セッション一覧
// ---------------------------------------------------------------------------

const SessionRow = ({ session, selected, onSelect }: { session: CloudSession; selected: boolean; onSelect: () => void }) => {
	const { t } = useTranslation();
	const relTime = useRelativeTime();
	const [hover, setHover] = useState(false);
	return (
		<button
			type='button'
			onClick={onSelect}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'stretch',
				width: '100%', textAlign: 'left', boxSizing: 'border-box',
				padding: '8px 12px', border: 'none', borderLeft: `3px solid ${selected ? statusColor[session.status] : 'transparent'}`,
				background: selected ? C.selected : hover ? C.hover : 'transparent',
				color: selected ? C.selectedFg : C.fg,
				cursor: 'pointer', fontFamily: 'inherit',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
				<span style={{ flex: 1, minWidth: 0, fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
					{sessionTitle(session)}
				</span>
				<StatusBadge status={session.status} />
			</div>
			<div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: selected ? C.selectedFg : C.fgMuted, opacity: selected ? 0.85 : 1 }}>
				<span>{relTime(session.updatedAt || session.createdAt)}</span>
				{session.changedFiles > 0 && <span>{t('cloudAgents.filesChanged').replace('{count}', String(session.changedFiles))}</span>}
				{session.workspaceName && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.workspaceName}</span>}
			</div>
		</button>
	);
};

const SessionList = () => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	const running = state.sessions.filter(s => isCloudSessionActive(s.status)).length;

	return (
		<div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: C.fgMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
				<span style={{ flex: 1 }}>
					{t('cloudAgents.list.title')}
					{running > 0 && <span style={{ marginLeft: '8px', textTransform: 'none', letterSpacing: 0, color: statusColor.running }}>{t('cloudAgents.list.running').replace('{count}', String(running))}</span>}
				</span>
				{running > 1 && (
					<button type='button' title={t('cloudAgents.list.stopAll')} onClick={() => { void cloudAgentService.stopAll(); }} style={{ ...buttonStyle('ghost'), padding: '2px 4px', fontWeight: 400, textTransform: 'none' }}>
						<Square size={11} />
						{t('cloudAgents.list.stopAll')}
					</button>
				)}
				<button type='button' title={t('cloudAgents.list.refresh')} aria-label={t('cloudAgents.list.refresh')} onClick={() => { void cloudAgentService.refresh(); }} style={{ ...buttonStyle('ghost'), padding: '2px 4px' }}>
					{state.loading ? <Spinner size={12} /> : <RefreshCw size={12} />}
				</button>
			</div>
			<div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
				{state.sessions.length === 0 ? (
					<div style={{ padding: '12px', fontSize: '12px', color: C.fgMuted }}>
						{state.loading ? t('cloudAgents.list.loading') : t('cloudAgents.list.empty')}
					</div>
				) : state.sessions.map(s => (
					<SessionRow key={s.id} session={s} selected={s.id === state.selectedId} onSelect={() => cloudAgentService.select(s.id)} />
				))}
			</div>
		</div>
	);
};


// ---------------------------------------------------------------------------
// 右: トランスクリプト
// ---------------------------------------------------------------------------

/** ツール呼び出しの「何に対して」を 1 つだけ拾う (コマンド・パス・検索語など) */
const keyArgOf = (args: any): string => {
	if (!args || typeof args !== 'object') return typeof args === 'string' ? args : '';
	for (const k of ['command', 'cmd', 'path', 'file', 'filePath', 'uri', 'query', 'pattern', 'url', 'dir', 'directory']) {
		if (typeof args[k] === 'string' && args[k]) return args[k];
	}
	const firstString = Object.values(args).find(v => typeof v === 'string' && v);
	return typeof firstString === 'string' ? firstString : '';
};

const safeJson = (v: unknown) => {
	try { return JSON.stringify(v, null, 2); } catch { return String(v); }
};

const preStyle: React.CSSProperties = {
	margin: 0, padding: '8px 10px',
	background: C.codeBg, color: C.fg,
	borderRadius: '4px', border: `1px solid ${C.border}`,
	fontFamily: C.monoFont, fontSize: '11px', lineHeight: 1.5,
	whiteSpace: 'pre-wrap', wordBreak: 'break-word',
	maxHeight: '320px', overflow: 'auto',
};

const ToolRow = ({ data }: { data: any }) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const name = typeof data?.name === 'string' ? data.name : 'tool';
	const keyArg = keyArgOf(data?.args);
	const ok = data?.ok !== false;
	const isCommand = /command|shell|exec|bash|terminal/i.test(name);
	return (
		<div style={{ border: `1px solid ${C.border}`, borderRadius: '6px', overflow: 'hidden' }}>
			<button
				type='button'
				onClick={() => setOpen(v => !v)}
				style={{
					display: 'flex', alignItems: 'center', gap: '6px', width: '100%', boxSizing: 'border-box',
					padding: '5px 8px', border: 'none', background: 'transparent', color: C.fg,
					cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', textAlign: 'left',
				}}
			>
				{open ? <ChevronDown size={12} style={{ flexShrink: 0 }} /> : <ChevronRight size={12} style={{ flexShrink: 0 }} />}
				{isCommand ? <Terminal size={12} style={{ flexShrink: 0, color: C.fgMuted }} /> : <Wrench size={12} style={{ flexShrink: 0, color: C.fgMuted }} />}
				<span style={{ fontWeight: 600, flexShrink: 0 }}>{name}</span>
				<span style={{ flex: 1, minWidth: 0, color: C.fgMuted, fontFamily: C.monoFont, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{keyArg}</span>
				{typeof data?.durationMs === 'number' && <span style={{ color: C.fgMuted, fontSize: '10px', flexShrink: 0 }}>{(data.durationMs / 1000).toFixed(1)}s</span>}
				{ok ? <CheckCircle2 size={12} style={{ color: C.success, flexShrink: 0 }} /> : <XCircle size={12} style={{ color: C.error, flexShrink: 0 }} />}
			</button>
			{open && (
				<div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
					<div style={{ fontSize: '10px', color: C.fgMuted }}>{t('cloudAgents.transcript.args')}</div>
					<pre style={preStyle}>{safeJson(data?.args ?? {})}</pre>
					<div style={{ fontSize: '10px', color: C.fgMuted }}>{t('cloudAgents.transcript.output')}</div>
					<pre style={{ ...preStyle, color: ok ? C.fg : C.error }}>{typeof data?.output === 'string' && data.output ? data.output : t('cloudAgents.transcript.noOutput')}</pre>
				</div>
			)}
		</div>
	);
};

const EventView = ({ event, onReviewChanges }: { event: CloudSessionEvent; onReviewChanges: () => void }) => {
	const { t } = useTranslation();
	const data = event.data ?? {};
	switch (event.type) {
		case 'user':
			return (
				<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
					<div style={{
						maxWidth: '80%', padding: '8px 12px', borderRadius: '10px 10px 2px 10px',
						background: C.button2Bg, color: C.button2Fg, border: `1px solid ${C.border}`,
						fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
					}}>
						<div style={{ fontSize: '10px', color: C.fgMuted, marginBottom: '2px' }}>{t('cloudAgents.transcript.you')}</div>
						{String(data.text ?? '')}
					</div>
				</div>
			);
		case 'assistant': {
			const text = typeof data.text === 'string' ? data.text.trim() : '';
			if (!text) return null;
			return (
				<div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
					<Bot size={14} style={{ marginTop: '3px', flexShrink: 0, color: C.fgMuted }} />
					<div style={{ flex: 1, minWidth: 0, fontSize: '13px', lineHeight: 1.6, color: C.fg }}>
						<ChatMarkdownRender string={text} chatMessageLocation={undefined} isApplyEnabled={false} isLinkDetectionEnabled={false} />
					</div>
				</div>
			);
		}
		case 'tool':
			return <ToolRow data={data} />;
		case 'status': {
			const status = data.status as CloudSessionStatus | undefined;
			return (
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: C.fgMuted }}>
					<div style={{ flex: 1, height: '1px', background: C.border }} />
					<span>
						{status ? t('cloudAgents.transcript.status').replace('{status}', t(statusKey(status))) : ''}
						{data.message ? `${status ? ' — ' : ''}${data.message}` : ''}
					</span>
					<div style={{ flex: 1, height: '1px', background: C.border }} />
				</div>
			);
		}
		case 'error':
			return (
				<div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '12px', color: C.error, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
					<AlertTriangle size={13} style={{ marginTop: '2px', flexShrink: 0 }} />
					<span>{String(data.message ?? '')}</span>
				</div>
			);
		case 'done': {
			const changed = typeof data.changedFiles === 'number' ? data.changedFiles : 0;
			return (
				<div style={{ border: `1px solid ${C.success}`, borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: C.success }}>
						<CheckCircle2 size={13} />
						{t('cloudAgents.done.title')}
						{changed > 0 && <span style={{ fontWeight: 400, color: C.fgMuted }}>· {t('cloudAgents.filesChanged').replace('{count}', String(changed))}</span>}
					</div>
					{typeof data.summary === 'string' && data.summary.trim() && (
						<div style={{ fontSize: '13px', lineHeight: 1.6, color: C.fg }}>
							<ChatMarkdownRender string={data.summary} chatMessageLocation={undefined} isApplyEnabled={false} isLinkDetectionEnabled={false} />
						</div>
					)}
					{changed > 0 && (
						<div>
							<button type='button' onClick={onReviewChanges} style={buttonStyle('secondary')}>
								<FileText size={12} />
								{t('cloudAgents.done.review')}
							</button>
						</div>
					)}
				</div>
			);
		}
		default:
			return null;
	}
};

const Transcript = ({ session, events, onReviewChanges }: { session: CloudSession; events: CloudSessionEvent[] | undefined; onReviewChanges: () => void }) => {
	const { t } = useTranslation();
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const stickToBottom = useRef(true);

	// 一番下を見ているときだけ、新しいイベントで自動スクロールする
	useEffect(() => {
		const el = scrollRef.current;
		if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
	}, [events?.length, session.id]);
	useEffect(() => { stickToBottom.current = true; }, [session.id]);

	return (
		<div
			ref={scrollRef}
			onScroll={e => {
				const el = e.currentTarget;
				stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
			}}
			style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}
		>
			{events === undefined ? (
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.fgMuted }}><Spinner /> {t('cloudAgents.transcript.loading')}</div>
			) : events.length === 0 ? (
				<div style={{ fontSize: '12px', color: C.fgMuted }}>{t('cloudAgents.transcript.empty')}</div>
			) : events.map(ev => <EventView key={ev.seq} event={ev} onReviewChanges={onReviewChanges} />)}
			{session.status === 'running' && (
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: statusColor.running }}>
					<Spinner color={statusColor.running} /> {t('cloudAgents.transcript.working')}
				</div>
			)}
			{session.status === 'failed' && session.errorMsg && !events?.some(e => e.type === 'error') && (
				<div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: C.error }}>
					<AlertTriangle size={13} style={{ marginTop: '2px', flexShrink: 0 }} />
					<span style={{ whiteSpace: 'pre-wrap' }}>{session.errorMsg}</span>
				</div>
			)}
		</div>
	);
};


// ---------------------------------------------------------------------------
// 右: 変更ファイル
// ---------------------------------------------------------------------------

const ChangesPanel = ({ session, changes }: { session: CloudSession; changes: CloudChangesState | undefined }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set());
	const [showPatch, setShowPatch] = useState(false);

	useEffect(() => {
		if (!changes || (!changes.changes && !changes.loading && !changes.error)) void cloudAgentService.loadChanges(session.id);
		// セッションを切り替えたら選択を戻す
		setUnchecked(new Set());
		setShowPatch(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session.id]);

	const list = changes?.changes ?? [];
	const selected = list.filter(c => !unchecked.has(c.path));
	const conflicts = new Set(changes?.lastApply?.conflicts ?? []);
	const failed = new Map((changes?.lastApply?.failed ?? []).map(f => [f.path, f.error] as const));
	const allChecked = list.length > 0 && selected.length === list.length;
	const noFolder = !state.workspaceName;

	const toggle = (p: string) => setUnchecked(prev => {
		const next = new Set(prev);
		if (next.has(p)) next.delete(p); else next.add(p);
		return next;
	});

	return (
		<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
				<button
					type='button'
					disabled={!selected.length || !!changes?.applying || noFolder}
					onClick={() => { void cloudAgentService.applyChanges(session.id, selected.map(c => c.path)); }}
					style={buttonStyle('primary', !selected.length || !!changes?.applying || noFolder)}
				>
					{changes?.applying ? <Spinner /> : <Download size={12} />}
					{changes?.applying ? t('cloudAgents.changes.applying') : t('cloudAgents.changes.apply').replace('{count}', String(selected.length))}
				</button>
				<button type='button' onClick={() => { void cloudAgentService.loadChanges(session.id); }} style={buttonStyle('secondary')}>
					{changes?.loading ? <Spinner /> : <RefreshCw size={12} />}
					{changes?.changes ? t('cloudAgents.changes.reload') : t('cloudAgents.changes.load')}
				</button>
				{!!changes?.patch && (
					<button type='button' onClick={() => setShowPatch(v => !v)} style={buttonStyle('ghost')}>
						<FileText size={12} />
						{showPatch ? t('cloudAgents.changes.hidePatch') : t('cloudAgents.changes.showPatch')}
					</button>
				)}
			</div>
			<div style={{ fontSize: '11px', color: noFolder ? C.warning : C.fgMuted }}>
				{noFolder ? t('cloudAgents.changes.noFolder') : t('cloudAgents.changes.applyHint')}
			</div>

			{changes?.error && <div style={{ fontSize: '12px', color: C.error, whiteSpace: 'pre-wrap' }}>{changes.error}</div>}

			{changes?.lastApply && (
				<div style={{ fontSize: '11px', color: C.fgMuted }}>
					{t('cloudAgents.changes.lastApply')
						.replace('{applied}', String(changes.lastApply.applied.length))
						.replace('{deleted}', String(changes.lastApply.deleted.length))
						.replace('{unchanged}', String(changes.lastApply.unchanged.length))
						.replace('{failed}', String(changes.lastApply.failed.length))}
				</div>
			)}

			{changes?.loading && !changes.changes ? (
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.fgMuted }}><Spinner /> {t('cloudAgents.changes.loading')}</div>
			) : changes?.changes && list.length === 0 ? (
				<div style={{ fontSize: '12px', color: C.fgMuted }}>{t('cloudAgents.changes.none')}</div>
			) : list.length > 0 && (
				<div style={{ border: `1px solid ${C.border}`, borderRadius: '6px', overflow: 'hidden' }}>
					<label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', fontSize: '11px', color: C.fgMuted, borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
						<input type='checkbox' checked={allChecked} onChange={() => setUnchecked(allChecked ? new Set(list.map(c => c.path)) : new Set())} />
						{t('cloudAgents.changes.selectAll')} ({selected.length}/{list.length})
					</label>
					{list.map(c => {
						const color = changeStatusColor[c.status] ?? '#8b95a5';
						const conflict = conflicts.has(c.path);
						const error = failed.get(c.path);
						return (
							<label key={c.path} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', fontSize: '12px', color: C.fg, cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}>
								<input type='checkbox' checked={!unchecked.has(c.path)} onChange={() => toggle(c.path)} />
								<span style={{ fontSize: '10px', fontWeight: 600, color, width: '58px', flexShrink: 0 }}>{t(changeStatusKey(c.status))}</span>
								<span title={c.oldPath ? `${c.oldPath} → ${c.path}` : c.path} style={{ flex: 1, minWidth: 0, fontFamily: C.monoFont, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
									{c.oldPath ? `${c.oldPath} → ${c.path}` : c.path}
								</span>
								{conflict && (
									<span title={t('cloudAgents.changes.conflict')} style={{ display: 'inline-flex', color: C.warning, flexShrink: 0 }}>
										<AlertTriangle size={12} />
									</span>
								)}
								{error && (
									<span title={error} style={{ display: 'inline-flex', color: C.error, flexShrink: 0 }}>
										<XCircle size={12} />
									</span>
								)}
								{c.binary || c.additions < 0 ? (
									<span style={{ fontSize: '10px', color: C.fgMuted, flexShrink: 0 }}>{t('cloudAgents.changes.binary')}</span>
								) : (
									<span style={{ fontSize: '11px', fontFamily: C.monoFont, flexShrink: 0 }}>
										<span style={{ color: changeStatusColor.added }}>+{c.additions}</span>{' '}
										<span style={{ color: changeStatusColor.deleted }}>−{c.deletions}</span>
									</span>
								)}
							</label>
						);
					})}
				</div>
			)}

			{conflicts.size > 0 && (
				<div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: C.warning }}>
					<AlertTriangle size={12} style={{ marginTop: '1px', flexShrink: 0 }} />
					<span>{t('cloudAgents.changes.conflict')}: {[...conflicts].join(', ')}</span>
				</div>
			)}

			{showPatch && changes?.patch && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
					{changes.patchTruncated && <div style={{ fontSize: '11px', color: C.warning }}>{t('cloudAgents.changes.patchTruncated')}</div>}
					<pre style={{ ...preStyle, maxHeight: 'none' }}>{changes.patch}</pre>
				</div>
			)}
		</div>
	);
};


// ---------------------------------------------------------------------------
// 右: 追加の指示
// ---------------------------------------------------------------------------

const FollowUpInput = ({ session }: { session: CloudSession }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	const [text, setText] = useState('');
	const sending = !!state.sendingById[session.id];
	const disabled = !state.isLoggedIn || sending;
	const canSend = !disabled && !!text.trim();

	// セッションを切り替えたら下書きを消す
	useEffect(() => { setText(''); }, [session.id]);

	const send = async () => {
		if (!canSend) return;
		const ok = await cloudAgentService.sendMessage(session.id, text);
		if (ok) setText('');
	};

	return (
		<div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
			<div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
				<textarea
					value={text}
					disabled={disabled}
					onChange={e => setText(e.target.value)}
					onKeyDown={e => { if (isSubmitKey(e)) { e.preventDefault(); void send(); } }}
					placeholder={state.isLoggedIn ? t('cloudAgents.followup.placeholder') : t('cloudAgents.followup.loginRequired')}
					rows={2}
					style={{ ...inputStyle, flex: 1, resize: 'vertical', minHeight: '44px', lineHeight: 1.5 }}
				/>
				<button type='button' disabled={!canSend} onClick={() => { void send(); }} style={buttonStyle('primary', !canSend)}>
					{sending ? <Spinner /> : <SendHorizontal size={12} />}
					{t('cloudAgents.followup.send')}
				</button>
			</div>
			{!isCloudSessionActive(session.status) && state.isLoggedIn && (
				<div style={{ fontSize: '10px', color: C.fgMuted }}>{t('cloudAgents.followup.restartHint')}</div>
			)}
		</div>
	);
};


// ---------------------------------------------------------------------------
// 右: セッションの詳細
// ---------------------------------------------------------------------------

type DetailTab = 'transcript' | 'changes';

const SessionDetail = ({ session }: { session: CloudSession }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	const [tab, setTab] = useState<DetailTab>('transcript');
	const changes = state.changesById[session.id];
	const active = isCloudSessionActive(session.status);

	useEffect(() => { setTab('transcript'); }, [session.id]);

	const info = session.workspaceInfo;
	const workspaceText = session.workspaceName
		? `${session.workspaceName}${info ? ` · ${t('cloudAgents.detail.workspaceFiles').replace('{count}', String(info.fileCount))} · ${formatBytes(info.bytes)}` : ''}${info?.gitBranch ? ` · ${info.gitBranch}${info.gitCommit ? `@${info.gitCommit.slice(0, 7)}` : ''}` : ''}`
		: t('cloudAgents.detail.noWorkspace');

	const tabButton = (id: DetailTab, label: string) => (
		<button
			type='button'
			onClick={() => setTab(id)}
			style={{
				padding: '6px 10px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
				fontSize: '12px', fontWeight: 600,
				color: tab === id ? C.fg : C.fgMuted,
				borderBottom: `2px solid ${tab === id ? C.focus : 'transparent'}`,
			}}
		>
			{label}
		</button>
	);

	return (
		<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
			{/* ヘッダー */}
			<div style={{ padding: '12px 18px 0', borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
					<span style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 600, color: C.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={session.prompt}>
						{sessionTitle(session)}
					</span>
					<StatusBadge status={session.status} />
					{active && (
						<button type='button' onClick={() => { void cloudAgentService.stop(session.id); }} style={buttonStyle('danger')}>
							<Square size={11} />
							{t('cloudAgents.detail.stop')}
						</button>
					)}
					<button
						type='button'
						disabled={!!changes?.applying || !state.workspaceName}
						title={!state.workspaceName ? t('cloudAgents.changes.noFolder') : undefined}
						onClick={() => { setTab('changes'); void cloudAgentService.applyChanges(session.id); }}
						style={buttonStyle('secondary', !!changes?.applying || !state.workspaceName)}
					>
						{changes?.applying ? <Spinner /> : <Download size={12} />}
						{t('cloudAgents.detail.apply')}
					</button>
					<button type='button' title={t('cloudAgents.detail.archive')} onClick={() => { void cloudAgentService.archive(session.id); }} style={buttonStyle('ghost')}>
						<Archive size={12} />
						{t('cloudAgents.detail.archive')}
					</button>
				</div>
				<div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '11px', color: C.fgMuted }}>
					<span>{t('cloudAgents.detail.model')}: <span style={{ color: C.fg }}>{session.modelLabel || session.model || t('cloudAgents.detail.modelDefault')}</span></span>
					<span>{t('cloudAgents.detail.workspace')}: <span style={{ color: C.fg }}>{workspaceText}</span></span>
					{info && info.skipped > 0 && <span style={{ color: C.warning }}>{t('cloudAgents.detail.skipped').replace('{count}', String(info.skipped))}</span>}
				</div>
				<div style={{ display: 'flex', gap: '4px' }}>
					{tabButton('transcript', t('cloudAgents.detail.transcript'))}
					{tabButton('changes', `${t('cloudAgents.detail.changes')}${session.changedFiles ? ` (${session.changedFiles})` : ''}`)}
				</div>
			</div>

			{tab === 'transcript'
				? <Transcript session={session} events={state.eventsById[session.id]} onReviewChanges={() => setTab('changes')} />
				: <ChangesPanel session={session} changes={changes} />}

			<FollowUpInput session={session} />
		</div>
	);
};


// ---------------------------------------------------------------------------
// 空の状態
// ---------------------------------------------------------------------------

const Explanation = ({ showSelectHint }: { showSelectHint: boolean }) => {
	const { t } = useTranslation();
	const points: TranslationKey[] = ['cloudAgents.empty.point1', 'cloudAgents.empty.point2', 'cloudAgents.empty.point3', 'cloudAgents.empty.point4'];
	return (
		<div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', overflowY: 'auto' }}>
			<div style={{ maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px', fontWeight: 600, color: C.fg }}>
					<Cloud size={22} />
					{t('cloudAgents.empty.title')}
				</div>
				<ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', lineHeight: 1.6, color: C.fg, listStyle: 'disc' }}>
					{points.map(k => <li key={k}>{t(k)}</li>)}
				</ul>
				<div style={{ fontSize: '12px', color: C.fgMuted }}>{t('cloudAgents.billing')}</div>
				{showSelectHint && <div style={{ fontSize: '12px', color: C.fgMuted }}>{t('cloudAgents.detail.selectHint')}</div>}
			</div>
		</div>
	);
};

const LoginPrompt = () => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const commandService = accessor.get('ICommandService');
	return (
		<div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
			<div style={{ maxWidth: '460px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
				<Cloud size={36} style={{ color: C.fgMuted }} />
				<div style={{ fontSize: '16px', fontWeight: 600, color: C.fg }}>{t('cloudAgents.login.title')}</div>
				<div style={{ fontSize: '13px', lineHeight: 1.6, color: C.fgMuted }}>{t('cloudAgents.login.hint')}</div>
				<button type='button' onClick={() => { void commandService.executeCommand('orchestra.chat.logIn'); }} style={buttonStyle('primary')}>
					<LogIn size={12} />
					{t('cloudAgents.login.button')}
				</button>
			</div>
		</div>
	);
};

const ErrorBanner = () => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	if (!state.lastError) return null;
	return (
		<div style={{
			display: 'flex', alignItems: 'flex-start', gap: '8px',
			padding: '8px 14px', fontSize: '12px', color: C.error,
			background: 'var(--vscode-inputValidation-errorBackground, transparent)',
			borderBottom: `1px solid var(--vscode-inputValidation-errorBorder, ${C.border})`,
		}}>
			<AlertTriangle size={13} style={{ marginTop: '2px', flexShrink: 0 }} />
			<span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap', color: C.fg }}>{state.lastError}</span>
			<button type='button' title={t('cloudAgents.error.dismiss')} aria-label={t('cloudAgents.error.dismiss')} onClick={() => cloudAgentService.dismissError()} style={{ ...buttonStyle('ghost'), padding: '0 2px' }}>
				<X size={12} />
			</button>
		</div>
	);
};


// ---------------------------------------------------------------------------
// ルート
// ---------------------------------------------------------------------------

const CloudAgentsPanelInner = () => {
	const { t } = useTranslation();
	const state = useCloudAgentState();
	const selected = useMemo(() => state.sessions.find(s => s.id === state.selectedId) ?? null, [state.sessions, state.selectedId]);

	if (!state.isLoggedIn) {
		return <LoginPrompt />;
	}

	return (
		<div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
			<ErrorBanner />
			<div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
				{/* 左 */}
				<div style={{ width: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border}`, background: C.bgSide }}>
					<div style={{ padding: '10px 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
						<Cloud size={14} style={{ color: C.fg }} />
						<span style={{ fontSize: '13px', fontWeight: 600, color: C.fg }}>{t('cloudAgents.title')}</span>
					</div>
					<div style={{ padding: '2px 12px 0', fontSize: '11px', color: C.fgMuted }}>{t('cloudAgents.subtitle')}</div>
					<NewSessionForm />
					<SessionList />
				</div>
				{/* 右 */}
				{selected ? <SessionDetail session={selected} /> : <Explanation showSelectHint={state.sessions.length > 0} />}
			</div>
		</div>
	);
};

export const CloudAgentsPanel = () => {
	const isDark = useIsDark();
	return (
		<div
			className={`@@void-scope ${isDark ? 'dark' : ''}`}
			style={{ height: '100%', width: '100%', overflow: 'hidden', background: C.bg, color: C.fg, fontSize: '13px' }}
		>
			<style>{`@keyframes orchestra-cloud-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
			<ErrorBoundary>
				<CloudAgentsPanelInner />
			</ErrorBoundary>
		</div>
	);
};
