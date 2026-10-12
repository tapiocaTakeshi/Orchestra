/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// クラウドエージェントのパネル。エディタ領域にマウントされる (cloudAgentsPane.ts)。
// Cursor の Agents 画面 (エージェントモード) のような 3 列のレイアウト:
//
//   左   (約 260px): 「＋ 新しいエージェント」・検索欄・エージェントの一覧 (実行中 / 完了 / 停止・失敗)・
//                   ワークスペースの道具 (Division プロジェクト / コスト管理 / カンバン)・表示中の料金の合計・アカウント
//   中央          : 選んだエージェントとの会話 (指示・発言・ツールの実行・完了カード) と、下に固定した入力欄。
//                   「新しいエージェント」のときは「何を任せますか？」の画面と、作業する場所・並列数・プロジェクト・モデルを選べる入力欄
//   右   (約 360px): 変更ファイルの一覧と差分。「すべて取り込む」/ ファイルごとの「取り込む」。ヘッダーのボタンで開閉
//
// 幅が狭いとき (1000px 未満) は右の変更パネルを最初は閉じ、開いたときは上に重ねる。
// さらに狭いとき (700px 未満) は左の一覧も畳み、中央ヘッダーのボタンで重ねて出す。
//
// 状態はすべて ICloudAgentService 側にあり、このコンポーネントは表示と操作だけを受け持つ
// (入力中の下書きと、どのパネルを開いているかだけはこのコンポーネントが持つ)。
// スタイルはカンバンと同じく inline style + VS Code のテーマ変数 (ダーク / ライトどちらにも追従する)。
// :hover / :focus-within が要るものだけ、PANEL_CSS の oca- で始まるクラスで書く。
//
// クラウドエージェントモードでは右のチャットが隠れるので、チャットや IDE から使っていた Division プロジェクト・
// コスト管理・カンバンへは、左の列の「ワークスペース」から開く (どれもエディタ領域に開く既存の画面)。

import '../styles.css'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
	AlertTriangle,
	Archive,
	ArrowDown,
	ArrowUp,
	Book,
	CheckCircle2,
	ChevronDown,
	Circle,
	Coins,
	ChevronRight,
	Cloud,
	Cpu,
	Download,
	FilePen,
	FileText,
	ExternalLink,
	Folder,
	FolderOpen,
	FolderPlus,
	GitBranch,
	GitPullRequest,
	Github,
	Kanban,
	Layers,
	Link,
	Loader2,
	Lock,
	LogIn,
	PanelLeft,
	PanelRight,
	Plus,
	RefreshCw,
	Search,
	Square,
	SquareTerminal,
	Workflow,
	Wrench,
	X,
	XCircle,
} from 'lucide-react';

import { useAccessor, useCloudAgentState, useDivisionProjectConfig, useDivisionProjects, useIsDark, useOrchestraUiMode, useRefreshModelState, useSettingsState } from '../util/services.js';
import { TranslationKey, useTranslation } from '../util/i18n.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import {
	CLOUD_AGENTS_MAX_PARALLEL,
	CLOUD_DIVISION_PROJECT_MODEL,
	CLOUD_PR_TITLE_MAX,
	CloudChange,
	CloudPlanEventData,
	CloudPlanTask,
	CloudPullRequest,
	CloudPullRequestEventData,
	CloudPullRequestStatus,
	CloudSession,
	CloudSessionEvent,
	CloudSessionStatus,
	CloudTaskEventData,
	GITHUB_NOT_CONNECTED,
	GitHubRepo,
	cloudRepoLabel,
	formatCloudCostUsd,
	isCloudSessionActive,
	isGitHubRepoSession,
	sumCloudCostUsd,
	updatablePullRequest,
	validateCloudPullRequestBranch,
	validateCloudPullRequestFields,
	validateCloudRepoBranch,
	validateCloudRepoUrl,
} from '../../../../common/cloudAgentTypes.js';
import type { CloudChangesState, CloudGitHubPick, CloudModelPick, CloudPullRequestState, CloudSessionSource } from '../../../cloudAgentServiceInterface.js';
import type { DivisionProjectConfig } from '../../../divisionProjectService.js';
import { ORCHESTRA_OPEN_COST_MANAGEMENT_ACTION_ID, ORCHESTRA_OPEN_DIVISION_PROJECTS_ACTION_ID, VOID_OPEN_KANBAN_ACTION_ID } from '../../../actionIDs.js';


// ---------------------------------------------------------------------------
// 見た目の共通部品
// ---------------------------------------------------------------------------

// 色は IDE / エージェントモードのチャット (SidebarChat・Sidebar・styles.css) と同じトークンを使う。
// void-* は styles.css が VS Code のテーマ変数から作る色 (Orchestra Dark / Light / Sun Red のどれにも追従する)。
//   背景: チャットと同じ void-bg-2 (サイドバーの背景)、入力欄とポップオーバーは void-bg-1
//   文字: void-fg-1 / 補足は void-fg-3 / さらに弱いものは void-fg-4
//   枠: void-border-2〜3 (チャットの区切り線と同じ 60% の混ぜ方)
//   ホバー・選択: 文字色を 6% / 10% 混ぜる (チャットのチップ・メニューと同じ)
//   主ボタン: テーマのボタン色 (Orchestra のテーマでは赤)。送信 ↑ / 停止 ■ はチャットと同じく文字色の丸ボタン
//   強調 (実行中・フォーカス): テーマの focusBorder / リンク色 (Orchestra のテーマでは金)
const C = {
	fg: 'var(--void-fg-1)',
	fgMuted: 'var(--void-fg-3)',
	fgFaint: 'var(--void-fg-4)',
	bg: 'var(--void-bg-2)',
	bgSide: 'var(--void-bg-2-alt)',
	bgWidget: 'var(--void-bg-1)',
	bgInput: 'var(--void-bg-1)',
	fgInput: 'var(--void-fg-1)',
	border: 'color-mix(in srgb, var(--void-border-2) 60%, transparent)',
	borderInput: 'var(--void-border-3)',
	hover: 'color-mix(in srgb, var(--void-fg-1) 6%, transparent)',
	selected: 'color-mix(in srgb, var(--void-fg-1) 10%, transparent)',
	selectedFg: 'var(--void-fg-1)',
	link: 'var(--void-link-color)',
	accent: 'var(--void-link-color)',
	codeBg: 'color-mix(in srgb, var(--void-fg-1) 5%, var(--void-bg-1))',
	error: 'var(--vscode-errorForeground)',
	warning: 'var(--void-warning)',
	success: 'var(--vscode-charts-green)',
	focus: 'color-mix(in srgb, var(--vscode-focusBorder) 60%, var(--void-border-1) 40%)',
	buttonBg: 'var(--vscode-button-background)',
	buttonFg: 'var(--vscode-button-foreground)',
	buttonHoverBg: 'var(--vscode-button-hoverBackground)',
	button2Bg: 'var(--vscode-button-secondaryBackground, var(--void-bg-1))',
	button2Fg: 'var(--vscode-button-secondaryForeground, var(--void-fg-1))',
	/** チャットの送信 ↑ / 停止 ■ と同じ (文字色の丸ボタン) */
	sendBg: 'var(--void-fg-1)',
	sendFg: 'var(--void-bg-1)',
	sendDisabledBg: 'color-mix(in srgb, var(--void-fg-1) 12%, transparent)',
	shadow: 'rgba(0, 0, 0, 0.35)',
	added: 'var(--vscode-gitDecoration-addedResourceForeground)',
	deleted: 'var(--vscode-gitDecoration-deletedResourceForeground)',
	addedBg: 'var(--vscode-diffEditor-insertedLineBackground)',
	deletedBg: 'var(--vscode-diffEditor-removedLineBackground)',
	monoFont: 'var(--vscode-editor-font-family, monospace)',
};

/** 色に透明度を付ける (テーマ変数でも使えるよう color-mix で) */
const tint = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/** :hover / :focus-within / ::placeholder が要るものだけ CSS で書く (クラス名は oca- で始める) */
const PANEL_CSS = `
@keyframes orchestra-cloud-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
.oca-row { cursor: pointer; outline: none; }
.oca-row:hover { background: ${C.hover}; }
.oca-row:focus-visible { box-shadow: inset 0 0 0 1px ${C.focus}; }
.oca-row[data-selected="true"] { background: ${C.selected}; color: ${C.selectedFg}; }
.oca-row .oca-row-actions { display: none; }
.oca-row:hover .oca-row-actions, .oca-row:focus-within .oca-row-actions { display: inline-flex; }
.oca-row:hover .oca-row-hide-on-hover { display: none; }
.oca-iconbtn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; border: none; background: transparent; color: ${C.fgMuted}; border-radius: 5px; cursor: pointer; font-family: inherit; }
.oca-iconbtn:hover:not(:disabled) { background: ${C.hover}; color: ${C.fg}; }
.oca-iconbtn:disabled { opacity: 0.45; cursor: default; }
.oca-iconbtn[data-active="true"] { background: ${C.selected}; color: ${C.fg}; }
.oca-chip { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 7px; border-radius: 6px; border: 1px solid transparent; background: transparent; color: ${C.fgMuted}; font-size: 11.5px; font-family: inherit; cursor: pointer; max-width: 240px; white-space: nowrap; }
.oca-chip:hover:not(:disabled), .oca-chip[data-active="true"] { background: ${C.hover}; color: ${C.fg}; }
.oca-chip[data-warn="true"] { color: ${C.warning}; }
.oca-chip:disabled { cursor: default; }
.oca-composer { border: 1px solid ${C.borderInput}; transition: border-color 0.1s; }
.oca-composer:focus-within { border-color: ${C.focus}; }
.oca-textarea::placeholder, .oca-input::placeholder { color: ${C.fgMuted}; }
.oca-tool { border-radius: 6px; }
.oca-tool:hover { background: ${C.hover}; }
.oca-example { border: 1px solid ${C.border}; background: transparent; color: ${C.fg}; border-radius: 14px; padding: 5px 12px; font-size: 12px; font-family: inherit; cursor: pointer; }
.oca-example:hover { background: ${C.hover}; border-color: ${C.focus}; }
.oca-option { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; padding: 6px 8px; border: none; border-radius: 5px; background: transparent; color: ${C.fg}; font-size: 12px; font-family: inherit; cursor: pointer; text-align: left; }
.oca-option:hover:not(:disabled) { background: ${C.hover}; }
.oca-option:disabled { opacity: 0.5; cursor: default; }
.oca-option[data-selected="true"] { background: ${C.selected}; color: ${C.selectedFg}; }
.oca-option[data-focused="true"] { box-shadow: inset 0 0 0 1px ${C.focus}; }
.oca-nav { display: flex; align-items: center; gap: 8px; width: calc(100% - 12px); box-sizing: border-box; margin: 0 6px; padding: 5px 8px; border: none; border-radius: 6px; background: transparent; color: ${C.fg}; font-size: 12.5px; font-family: inherit; cursor: pointer; text-align: left; }
.oca-nav:hover { background: ${C.hover}; }
.oca-nav:focus-visible { outline: none; box-shadow: inset 0 0 0 1px ${C.focus}; }
.oca-link { border: none; background: transparent; padding: 0; color: ${C.link}; font-size: inherit; font-family: inherit; cursor: pointer; }
.oca-link:hover { text-decoration: underline; }
.oca-md p:first-child { margin-top: 0; }
.oca-md p:last-child { margin-bottom: 0; }
`;

const statusColor: Record<CloudSessionStatus, string> = {
	// 動いているものはチャットの強調色 (テーマのリンク色)、終わったものは緑、失敗はエラー色、止めたものは弱い文字色
	provisioning: C.accent,
	uploading: C.accent,
	running: C.accent,
	idle: C.success,
	failed: C.error,
	cancelled: C.fgFaint,
};

const statusKey = (s: CloudSessionStatus): TranslationKey => `cloudAgents.status.${s}` as TranslationKey;
const changeStatusKey = (s: CloudChange['status']): TranslationKey => `cloudAgents.changes.status.${s}` as TranslationKey;

const changeStatusColor: Record<CloudChange['status'], string> = {
	added: 'var(--vscode-gitDecoration-addedResourceForeground)',
	modified: 'var(--vscode-gitDecoration-modifiedResourceForeground)',
	deleted: 'var(--vscode-gitDecoration-deletedResourceForeground)',
	renamed: 'var(--vscode-gitDecoration-renamedResourceForeground)',
};
const changeStatusLetter: Record<CloudChange['status'], string> = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R' };

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
	padding: '4px 10px', borderRadius: '5px',
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

const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

const Spinner = ({ size = 12, color }: { size?: number; color?: string }) => (
	<Loader2 size={size} style={{ animation: 'orchestra-cloud-spin 1s linear infinite', color, flexShrink: 0 }} />
);

/** ステータスの丸 (動いているものはくるくる) */
const StatusDot = ({ status }: { status: CloudSessionStatus }) => {
	const color = statusColor[status] ?? C.fgFaint;
	if (isCloudSessionActive(status)) return <Spinner size={11} color={color} />;
	return (
		<span style={{ width: '11px', height: '11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
			<span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color }} />
		</span>
	);
};

const StatusPill = ({ status }: { status: CloudSessionStatus }) => {
	const { t } = useTranslation();
	const color = statusColor[status] ?? C.fgFaint;
	return (
		<span style={{
			display: 'inline-flex', alignItems: 'center', gap: '4px',
			fontSize: '10.5px', fontWeight: 600, lineHeight: 1.4,
			padding: '1px 7px', borderRadius: '10px',
			background: tint(color, 13), color, border: `1px solid ${tint(color, 33)}`,
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

/** リポジトリから始めたセッションなら「owner/name @ branch」、そうでなければ null */
const sessionRepoLabel = (s: CloudSession): string | null => {
	const info = s.workspaceInfo;
	const branch = info?.gitBranch ? ` @ ${info.gitBranch}` : '';
	if (info?.repoFullName) return `${info.repoFullName}${branch}`;
	if (info?.repoUrl) return `${cloudRepoLabel(info.repoUrl)}${branch}`;
	return null;
};

/** 一覧やヘッダーに出す「どこで作業しているか」: リポジトリ / フォルダ名 / 空のフォルダ */
const SessionSource = ({ session, size = 11 }: { session: CloudSession; size?: number }) => {
	const { t } = useTranslation();
	const repo = sessionRepoLabel(session);
	const info = session.workspaceInfo;
	const icon = info?.repoFullName ? <Github size={size} style={{ flexShrink: 0 }} />
		: info?.repoUrl ? <GitBranch size={size} style={{ flexShrink: 0 }} />
			: session.workspaceName ? <Folder size={size} style={{ flexShrink: 0 }} />
				: <FolderPlus size={size} style={{ flexShrink: 0 }} />;
	const label = repo ?? session.workspaceName ?? t('cloudAgents.source.empty');
	const detail = !repo && session.workspaceName && info
		? `${session.workspaceName} · ${t('cloudAgents.detail.workspaceFiles').replace('{count}', String(info.fileCount))} · ${formatBytes(info.bytes)}${info.gitBranch ? ` · ${info.gitBranch}${info.gitCommit ? `@${info.gitCommit.slice(0, 7)}` : ''}` : ''}${info.skipped > 0 ? `\n${t('cloudAgents.detail.skipped').replace('{count}', String(info.skipped))}` : ''}`
		: label;
	return (
		<span title={detail} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
			{icon}
			<span style={ellipsis}>{label}</span>
		</span>
	);
};

const sessionTitle = (s: CloudSession) => s.title || (s.prompt.split('\n').find(l => l.trim()) ?? '').slice(0, 80) || s.id;

/** Division と同期済み (projectId がある) のプロジェクト。サーバーに送れるのはこれだけ */
const useSyncedProjects = (): DivisionProjectConfig[] => {
	const projects = useDivisionProjects();
	return useMemo(() => (projects ?? []).filter(p => !!p.projectId?.trim()), [projects]);
};

/** projectId → プロジェクト名 (.division/projects.json に無ければ ID の先頭) */
const useProjectLabel = () => {
	const projects = useSyncedProjects();
	return useCallback((projectId: string | null | undefined): string | null => {
		const id = projectId?.trim();
		if (!id) return null;
		return projects.find(p => p.projectId === id)?.name || `#${id.slice(0, 8)}`;
	}, [projects]);
};

/** エージェントの Division プロジェクト (一覧の行・ヘッダー) */
const ProjectTag = ({ label, size = 10 }: { label: string | null; size?: number }) => {
	const { t } = useTranslation();
	if (!label) return null;
	return (
		<span title={`${t('cloudAgents.project.label')}: ${label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', minWidth: 0, flexShrink: 1 }}>
			<Layers size={size} style={{ flexShrink: 0 }} />
			<span style={ellipsis}>{label}</span>
		</span>
	);
};

// --- モデル (IDE のチャットのモデル選択と同じ一覧) と Division Project ---

/**
 * Division API のモデル名は `<providerId>/<modelId>` 形式 (ModelDropdown.tsx と同じ分け方)。
 * "/" を含まないもの (division-orchestrator など) は providerId を null にする
 */
const splitDivisionModelName = (modelName: string): { providerId: string | null; modelId: string } => {
	const idx = modelName.indexOf('/');
	if (idx > 0 && idx < modelName.length - 1) return { providerId: modelName.slice(0, idx), modelId: modelName.slice(idx + 1) };
	return { providerId: null, modelId: modelName };
};

type DivisionModelGroup = { providerId: string; title: string; models: { name: string; modelId: string }[] };

/**
 * IDE のモデル選択 (ModelDropdown) が divisionAPI について出しているのと同じモデル一覧を、プロバイダごとにまとめたもの。
 * 元は refreshModelService が Division の /api/models から取ってきて settingsOfProvider.divisionAPI.models に入れたもの
 * (`providerId/modelId`。サーバーは model にこの形をそのまま受け付ける)。プロバイダの表示名は globalSettings.divisionProviders
 */
const useDivisionModelGroups = (): DivisionModelGroup[] => {
	const settings = useSettingsState();
	const models = settings.settingsOfProvider?.divisionAPI?.models;
	const providers = settings.globalSettings?.divisionProviders;
	return useMemo(() => {
		const groups: DivisionModelGroup[] = [];
		const seen = new Set<string>();
		for (const m of models ?? []) {
			if (!m || m.isHidden || typeof m.modelName !== 'string' || seen.has(m.modelName)) continue;
			const { providerId, modelId } = splitDivisionModelName(m.modelName);
			// division-orchestrator (Division Project) は上の専用の行で出す。単体のモデルは provider/model のものだけ
			if (!providerId) continue;
			seen.add(m.modelName);
			let group = groups.find(g => g.providerId === providerId);
			if (!group) {
				const title = (providers ?? []).find(p => p.id === providerId)?.displayName || providerId;
				group = { providerId, title, models: [] };
				groups.push(group);
			}
			group.models.push({ name: m.modelName, modelId });
		}
		return groups;
	}, [models, providers]);
};

const isDivisionProjectSession = (s: CloudSession) => s.model === CLOUD_DIVISION_PROJECT_MODEL;

/** ヘッダー・入力欄に出すモデル名。サーバーが modelLabel を付ける前は、頼んだものから作る */
const sessionModelLabel = (s: CloudSession, projectLabel: string | null, fallback: string): string => {
	if (s.modelLabel) return s.modelLabel;
	if (isDivisionProjectSession(s)) return projectLabel ? `Division Project · ${projectLabel}` : 'Division Project';
	return s.model || fallback;
};

/** モデルのアイコン (Division Project は複数のエージェントなので別のアイコン) */
const ModelIcon = ({ division, size = 12 }: { division: boolean; size?: number }) =>
	division ? <Workflow size={size} style={{ flexShrink: 0 }} /> : <Cpu size={size} style={{ flexShrink: 0 }} />;

/** ロールごとの色 (slug から決める。同じロールはいつも同じ色) */
const ROLE_COLORS = [
	'var(--vscode-charts-blue)',
	'var(--vscode-charts-purple)',
	'var(--vscode-charts-orange)',
	'var(--vscode-charts-green)',
	'var(--vscode-charts-yellow)',
	'var(--vscode-charts-red)',
];
const roleColor = (role: string): string => {
	let h = 0;
	for (let i = 0; i < role.length; i++) h = (h * 31 + role.charCodeAt(i)) | 0;
	return ROLE_COLORS[Math.abs(h) % ROLE_COLORS.length];
};

/** Division Project のロール (計画の行・タスクの見出し・発言の横) */
const RoleChip = ({ role, name }: { role: string; name: string }) => {
	const color = roleColor(role || name);
	return (
		<span
			title={role && role !== name ? `${name} (${role})` : name}
			style={{
				display: 'inline-flex', alignItems: 'center', height: '17px', padding: '0 6px', borderRadius: '4px', flexShrink: 0,
				fontSize: '10.5px', fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis',
				color: C.fg, background: tint(color, 16), border: `1px solid ${tint(color, 40)}`,
			}}
		>
			{name || role}
		</span>
	);
};

/** ここまでの料金 ($0.12)。サーバーが付けていなければ出さない */
const CostTag = ({ costUsd, withIcon }: { costUsd: number | undefined; withIcon?: boolean }) => {
	const { t } = useTranslation();
	if (typeof costUsd !== 'number' || !Number.isFinite(costUsd)) return null;
	return (
		<span title={`${t('cloudAgents.cost.label')}: ${formatCloudCostUsd(costUsd)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: C.monoFont, fontSize: '10.5px', flexShrink: 0, whiteSpace: 'nowrap' }}>
			{withIcon && <Coins size={10} style={{ flexShrink: 0 }} />}
			{formatCloudCostUsd(costUsd)}
		</span>
	);
};

const formatBytes = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const isModKey = (e: React.KeyboardEvent) => isMac ? e.metaKey : e.ctrlKey;

/** 変更ファイルの +行 / −行 の合計 (バイナリは数えない) */
const sumChanges = (list: CloudChange[]) => {
	let additions = 0, deletions = 0;
	for (const c of list) {
		if (c.additions > 0) additions += c.additions;
		if (c.deletions > 0) deletions += c.deletions;
	}
	return { additions, deletions };
};

const basename = (p: string) => {
	const parts = p.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
	return parts[parts.length - 1] || p;
};
const dirname = (p: string) => {
	const norm = p.replace(/\\/g, '/');
	const i = norm.lastIndexOf('/');
	return i > 0 ? norm.slice(0, i) : '';
};

/** 要素の幅 (レスポンシブの切り替えに使う)。別ウィンドウに移しても動くよう、要素のウィンドウの ResizeObserver を使う */
const useElementWidth = (ref: React.RefObject<HTMLElement | null>) => {
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const RO = (el.ownerDocument.defaultView as (Window & typeof globalThis) | null)?.ResizeObserver ?? ResizeObserver;
		const ro = new RO(entries => {
			const w = entries[0]?.contentRect.width;
			if (typeof w === 'number') setWidth(Math.round(w));
		});
		ro.observe(el);
		setWidth(Math.round(el.getBoundingClientRect().width));
		return () => ro.disconnect();
	}, [ref]);
	return width;
};

/** ポップオーバーの外側をクリックしたら閉じる */
const useDismiss = (open: boolean, refs: React.RefObject<HTMLElement | null>[], onDismiss: () => void) => {
	useEffect(() => {
		if (!open) return;
		const doc = refs[0]?.current?.ownerDocument ?? document;
		const handler = (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (target && refs.some(r => r.current?.contains(target))) return;
			onDismiss();
		};
		doc.addEventListener('mousedown', handler, true);
		return () => doc.removeEventListener('mousedown', handler, true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);
};


// ---------------------------------------------------------------------------
// 新しいエージェント: GitHub のリポジトリを選ぶ部品 (入力欄の「作業する場所」のポップオーバーの中に出す)
//
//   GitHubConnectBox    … 未連携のときの「GitHub と連携」と、ブラウザで許可してもらうあいだの待ち表示
//   GitHubAccountChip   … 連携中のアカウント (アバター + @login) と「解除」
//   GitHubRepoList      … 検索 (サーバー側の q、300 ms 待ってから) とリポジトリ一覧、「もっと見る」
//   GitHubSelectedRepo  … 選んだリポジトリのカード (「変更」) とブランチの選択
//
// 連携の状態・一覧・選んだリポジトリはすべて ICloudAgentService 側にある (パネルを閉じても残る)。
// ---------------------------------------------------------------------------

/** 検索欄の入力が止まってからサーバーに問い合わせるまで */
const REPO_SEARCH_DEBOUNCE_MS = 300;

const boxStyle: React.CSSProperties = {
	border: `1px solid ${C.border}`,
	borderRadius: '6px',
	padding: '8px 10px',
	display: 'flex', flexDirection: 'column', gap: '6px',
};

const GitHubConnectBox = () => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const gh = useCloudAgentState().github;

	if (gh.waitingForAuth) {
		return (
			<div style={boxStyle} aria-live='polite'>
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.fg }}>
					<Spinner size={12} color={statusColor.running} />
					{t('cloudAgents.github.waiting')}
				</div>
				<div style={{ fontSize: '11px', color: C.fgMuted, lineHeight: 1.4 }}>{t('cloudAgents.github.waitingHint')}</div>
				<div>
					<button type='button' onClick={() => cloudAgentService.cancelGitHubConnect()} style={buttonStyle('secondary')}>
						{t('cloudAgents.github.cancel')}
					</button>
				</div>
			</div>
		);
	}
	return (
		<div style={boxStyle}>
			<div style={{ fontSize: '11px', color: C.fgMuted, lineHeight: 1.4 }}>{t('cloudAgents.github.connectHint')}</div>
			<div>
				<button type='button' disabled={gh.starting} onClick={() => { void cloudAgentService.connectGitHub(); }} style={buttonStyle('primary', gh.starting)}>
					{gh.starting ? <Spinner size={12} /> : <Github size={12} />}
					{t('cloudAgents.github.connect')}
				</button>
			</div>
		</div>
	);
};

const GitHubAccountChip = () => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const gh = useCloudAgentState().github;
	const [avatarFailed, setAvatarFailed] = useState(false);
	useEffect(() => { setAvatarFailed(false); }, [gh.avatarUrl]);

	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
			{gh.avatarUrl && !avatarFailed ? (
				<img
					src={gh.avatarUrl}
					alt=''
					width={20}
					height={20}
					onError={() => setAvatarFailed(true)}
					style={{ width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0, background: C.hover }}
				/>
			) : (
				<span style={{ width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: C.hover, color: C.fgMuted }}>
					<Github size={12} />
				</span>
			)}
			<span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
				<span style={{ fontSize: '12px', fontWeight: 600, color: C.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
					{gh.login ? `@${gh.login}` : 'GitHub'}
				</span>
				<span style={{ fontSize: '10px', color: C.fgMuted }}>{t('cloudAgents.github.connected')}</span>
			</span>
			<button
				type='button'
				disabled={gh.disconnecting}
				onClick={() => { void cloudAgentService.disconnectGitHub(); }}
				style={{ ...buttonStyle('ghost', gh.disconnecting), padding: '2px 6px', fontWeight: 400 }}
			>
				{gh.disconnecting && <Spinner size={11} />}
				{t('cloudAgents.github.disconnect')}
			</button>
		</div>
	);
};

const GitHubRepoRow = ({ repo, pushed, onSelect }: { repo: GitHubRepo; pushed: string; onSelect: () => void }) => {
	const { t } = useTranslation();
	const [hover, setHover] = useState(false);
	return (
		<button
			type='button'
			onClick={onSelect}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			title={repo.fullName}
			style={{
				display: 'flex', alignItems: 'flex-start', gap: '6px',
				width: '100%', boxSizing: 'border-box', textAlign: 'left',
				padding: '6px 8px', border: 'none', borderBottom: `1px solid ${C.border}`,
				background: hover ? C.hover : 'transparent', color: C.fg,
				cursor: 'pointer', fontFamily: 'inherit',
			}}
		>
			<span style={{ marginTop: '2px', flexShrink: 0, display: 'inline-flex', color: repo.private ? C.warning : C.fgMuted }} title={repo.private ? t('cloudAgents.github.private') : undefined}>
				{repo.private ? <Lock size={12} /> : <Book size={12} />}
			</span>
			<span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
				<span style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
					<span style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.name}</span>
					<span style={{ fontSize: '10px', color: C.fgMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{repo.owner}</span>
				</span>
				{repo.description && (
					<span style={{ fontSize: '11px', color: C.fgMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.description}</span>
				)}
			</span>
			{pushed && <span style={{ fontSize: '10px', color: C.fgMuted, flexShrink: 0, marginTop: '2px' }}>{pushed}</span>}
		</button>
	);
};

const GitHubRepoList = ({ onSelect, onCancel }: { onSelect: (repo: GitHubRepo) => void; onCancel?: () => void }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const repos = useCloudAgentState().githubRepos;
	// 行ごとにタイマーを持たせないよう、「◯分前」はここで 1 つだけ
	const relTime = useRelativeTime();
	const [query, setQuery] = useState(repos.q);
	const isFirstRun = useRef(true);

	// まだ読んでいない (初めて開いた / 連携し直した) ときは、すぐ 1 ページ目を読む
	useEffect(() => {
		if (!repos.loaded && !repos.loading && !repos.error) void cloudAgentService.searchGitHubRepos(query.trim(), 1);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [repos.loaded, repos.loading, repos.error]);

	// 検索語は入力が 300 ms 止まってからサーバーに問い合わせる
	useEffect(() => {
		if (isFirstRun.current) { isFirstRun.current = false; return; }
		const handle = setTimeout(() => { void cloudAgentService.searchGitHubRepos(query.trim(), 1); }, REPO_SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(handle);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [query]);

	const firstPageLoading = repos.loading && repos.page <= 1;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
				<div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
					<Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: C.fgMuted, pointerEvents: 'none' }} />
					<input
						value={query}
						onChange={e => setQuery(e.target.value)}
						placeholder={t('cloudAgents.github.search')}
						aria-label={t('cloudAgents.github.search')}
						spellCheck={false}
						style={{ ...inputStyle, paddingLeft: '26px' }}
					/>
				</div>
				{/* 検索し直している間は、前の結果を出したまま横にくるくるを出す */}
				{firstPageLoading && repos.repos.length > 0 && <Spinner size={11} color={C.fgMuted} />}
				{onCancel && (
					<button type='button' onClick={onCancel} style={{ ...buttonStyle('ghost'), padding: '2px 6px', fontWeight: 400 }}>
						{t('cloudAgents.github.cancel')}
					</button>
				)}
			</div>
			{repos.error && (
				<div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11px', color: C.error }}>
					<AlertTriangle size={12} style={{ marginTop: '1px', flexShrink: 0 }} />
					<span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap' }}>{repos.error}</span>
					<button type='button' onClick={() => { void cloudAgentService.searchGitHubRepos(query.trim(), 1); }} style={{ ...buttonStyle('ghost'), padding: '0 4px', fontWeight: 400 }}>
						{t('cloudAgents.github.retry')}
					</button>
				</div>
			)}
			<div style={{ maxHeight: '240px', overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: '6px', background: C.bg }}>
				{repos.repos.map(repo => <GitHubRepoRow key={repo.fullName} repo={repo} pushed={relTime(repo.pushedAt)} onSelect={() => onSelect(repo)} />)}
				{firstPageLoading && repos.repos.length === 0 && (
					<div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px', fontSize: '11px', color: C.fgMuted }}><Spinner size={11} /> {t('cloudAgents.list.loading')}</div>
				)}
				{!repos.loading && !repos.error && repos.loaded && repos.repos.length === 0 && (
					<div style={{ padding: '10px', fontSize: '11px', color: C.fgMuted }}>
						{repos.q ? t('cloudAgents.github.noMatch').replace('{q}', repos.q) : t('cloudAgents.github.noRepos')}
					</div>
				)}
				{repos.hasMore && (
					<div style={{ display: 'flex', justifyContent: 'center', padding: '4px' }}>
						<button
							type='button'
							disabled={repos.loading}
							onClick={() => { void cloudAgentService.searchGitHubRepos(repos.q, repos.page + 1); }}
							style={{ ...buttonStyle('ghost', repos.loading), fontWeight: 400 }}
						>
							{repos.loading && !firstPageLoading && <Spinner size={11} />}
							{t('cloudAgents.github.more')}
						</button>
					</div>
				)}
			</div>
		</div>
	);
};

const GitHubSelectedRepo = ({ pick, onChange }: { pick: CloudGitHubPick; onChange: () => void }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	const repo = pick.repo;
	const branchesState = state.githubBranchesByRepo[repo.fullName];
	const defaultBranch = branchesState?.defaultBranch || repo.defaultBranch;
	const branch = pick.branch || defaultBranch;

	useEffect(() => {
		void cloudAgentService.loadGitHubBranches(repo.fullName);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [repo.fullName]);

	// ブランチ一覧が来たら、未選択 / 前回のブランチが無くなっていれば既定のブランチにする
	useEffect(() => {
		const list = branchesState?.branches;
		if (!list) return;
		const fallback = branchesState?.defaultBranch || repo.defaultBranch;
		if ((!pick.branch || (list.length > 0 && !list.includes(pick.branch))) && fallback && fallback !== pick.branch) {
			cloudAgentService.setGitHubPick({ repo, branch: fallback });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [branchesState?.branches]);

	const options = branchesState?.branches?.length ? branchesState.branches : (branch ? [branch] : []);

	return (
		<div style={{ ...boxStyle, background: C.bg }}>
			<div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', minWidth: 0 }}>
				<span style={{ marginTop: '2px', flexShrink: 0, display: 'inline-flex', color: repo.private ? C.warning : C.fgMuted }} title={repo.private ? t('cloudAgents.github.private') : undefined}>
					{repo.private ? <Lock size={13} /> : <Book size={13} />}
				</span>
				<span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
					<span title={repo.fullName} style={{ fontSize: '12px', fontWeight: 600, color: C.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.fullName}</span>
					{repo.description && <span style={{ fontSize: '11px', color: C.fgMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.description}</span>}
				</span>
				<button type='button' onClick={onChange} style={{ ...buttonStyle('ghost'), padding: '2px 6px', fontWeight: 400 }}>
					{t('cloudAgents.github.change')}
				</button>
			</div>
			<label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.fg, minWidth: 0 }}>
				<GitBranch size={12} style={{ flexShrink: 0, color: C.fgMuted }} />
				<span style={{ flexShrink: 0 }}>{t('cloudAgents.github.branch')}</span>
				<select
					value={branch}
					disabled={!options.length}
					onChange={e => cloudAgentService.setGitHubPick({ repo, branch: e.target.value })}
					style={{ ...inputStyle, flex: 1, minWidth: 0, width: 'auto', padding: '3px 6px', fontFamily: C.monoFont }}
				>
					{options.map(name => (
						<option key={name} value={name}>{name === defaultBranch ? `${name} (${t('cloudAgents.github.defaultBranch')})` : name}</option>
					))}
				</select>
				{branchesState?.loading && <Spinner size={11} color={C.fgMuted} />}
			</label>
			{branchesState?.error && (
				<div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11px', color: C.warning }}>
					<AlertTriangle size={12} style={{ marginTop: '1px', flexShrink: 0 }} />
					<span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap' }}>{t('cloudAgents.github.branchesError').replace('{error}', branchesState.error)}</span>
					<button type='button' onClick={() => { void cloudAgentService.loadGitHubBranches(repo.fullName, true); }} style={{ ...buttonStyle('ghost'), padding: '0 4px', fontWeight: 400 }}>
						{t('cloudAgents.github.retry')}
					</button>
				</div>
			)}
		</div>
	);
};

/** 「GitHub のリポジトリ」を選んだときの中身 (連携していなければ連携から、連携中ならアカウント + リポジトリ) */
const GitHubSourceFields = ({ choosing, setChoosing }: { choosing: boolean; setChoosing: (v: boolean) => void }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	const gh = state.github;
	const pick = state.githubPick;

	let body: React.ReactNode;
	if (!gh.loaded) {
		body = gh.loading || !gh.error
			? <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: C.fgMuted }}><Spinner size={11} /> {t('cloudAgents.github.checking')}</div>
			: null;
	} else if (!gh.connected) {
		body = <GitHubConnectBox />;
	} else {
		body = (
			<>
				<GitHubAccountChip />
				{pick && !choosing
					? <GitHubSelectedRepo pick={pick} onChange={() => setChoosing(true)} />
					: (
						<GitHubRepoList
							onSelect={repo => { cloudAgentService.setGitHubPick({ repo, branch: repo.defaultBranch }); setChoosing(false); }}
							onCancel={pick ? () => setChoosing(false) : undefined}
						/>
					)}
			</>
		);
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
			{body}
			{gh.error && (
				<div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11px', color: C.error }}>
					<AlertTriangle size={12} style={{ marginTop: '1px', flexShrink: 0 }} />
					<span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap' }}>{gh.error}</span>
					{!gh.loaded && (
						<button type='button' onClick={() => { void cloudAgentService.refreshGitHubStatus(); }} style={{ ...buttonStyle('ghost'), padding: '0 4px', fontWeight: 400 }}>
							{t('cloudAgents.github.retry')}
						</button>
					)}
				</div>
			)}
		</div>
	);
};

/** 「URL を指定」のときの入力欄 (公開リポジトリの https URL + 任意のブランチ) */
const UrlSourceFields = ({ url, setUrl, branch, setBranch }: { url: string; setUrl: (v: string) => void; branch: string; setBranch: (v: string) => void }) => {
	const { t } = useTranslation();
	const urlInvalid = !!url.trim() && !!validateCloudRepoUrl(url);
	const branchInvalid = !!validateCloudRepoBranch(branch);
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
			<input
				value={url}
				onChange={e => setUrl(e.target.value)}
				placeholder={t('cloudAgents.url.placeholder')}
				aria-label={t('cloudAgents.source.url')}
				spellCheck={false}
				style={{ ...inputStyle, fontFamily: C.monoFont, ...(urlInvalid ? { borderColor: C.error } : {}) }}
			/>
			{urlInvalid && <div style={{ fontSize: '11px', color: C.error }}>{t('cloudAgents.url.invalid')}</div>}
			<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
				<GitBranch size={12} style={{ flexShrink: 0, color: C.fgMuted }} />
				<input
					value={branch}
					onChange={e => setBranch(e.target.value)}
					placeholder={t('cloudAgents.url.branchPlaceholder')}
					aria-label={t('cloudAgents.github.branch')}
					spellCheck={false}
					style={{ ...inputStyle, fontFamily: C.monoFont, ...(branchInvalid ? { borderColor: C.error } : {}) }}
				/>
			</div>
			{branchInvalid && <div style={{ fontSize: '11px', color: C.error }}>{t('cloudAgents.url.branchInvalid')}</div>}
		</div>
	);
};


// ---------------------------------------------------------------------------
// 入力欄 (Cursor 風の角丸の箱)。会話の追加の指示と、新しいエージェントの両方で使う
//
// Enter で送信、Shift+Enter で改行 (Ctrl / Cmd+Enter でも送信)。
// 日本語入力の変換確定の Enter (isComposing / keyCode 229) では送信しない。
// ---------------------------------------------------------------------------

const COMPOSER_MAX_HEIGHT = 240;

const ComposerBox = ({ value, onChange, onSubmit, placeholder, disabled, textareaRef, toolbar, actions, hintLeft, hintRight, above }: {
	value: string;
	onChange: (v: string) => void;
	onSubmit: () => void;
	placeholder: string;
	disabled?: boolean;
	textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
	toolbar?: React.ReactNode;
	actions?: React.ReactNode;
	hintLeft?: React.ReactNode;
	hintRight?: React.ReactNode;
	/** 入力欄の上に重ねて出すもの (ポップオーバー) */
	above?: React.ReactNode;
}) => {
	const localRef = useRef<HTMLTextAreaElement | null>(null);
	const setRef = (el: HTMLTextAreaElement | null) => {
		localRef.current = el;
		if (textareaRef) textareaRef.current = el;
	};

	// 中身に合わせて高さを伸ばす (上限を超えたらスクロール)
	useLayoutEffect(() => {
		const el = localRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
	}, [value]);

	return (
		<div style={{ padding: '6px 16px 12px', flexShrink: 0 }}>
			<div style={{ position: 'relative', maxWidth: '860px', margin: '0 auto' }}>
				{above}
				<div className='oca-composer' style={{ borderRadius: '12px', background: `linear-gradient(to bottom, ${C.bgInput}, color-mix(in srgb, var(--void-bg-1) 92%, var(--vscode-focusBorder) 8%))`, display: 'flex', flexDirection: 'column' }}>
					<textarea
						ref={setRef}
						className='oca-textarea'
						value={value}
						disabled={disabled}
						rows={1}
						onChange={e => onChange(e.target.value)}
						onKeyDown={e => {
							if (e.key !== 'Enter') return;
							if (e.nativeEvent.isComposing || e.keyCode === 229) return;
							if (e.shiftKey) return;
							e.preventDefault();
							onSubmit();
						}}
						placeholder={placeholder}
						spellCheck={false}
						style={{
							resize: 'none', border: 'none', outline: 'none', background: 'transparent',
							color: C.fgInput, fontFamily: 'inherit', fontSize: '13px', lineHeight: 1.5,
							padding: '10px 12px 4px', minHeight: '44px', maxHeight: `${COMPOSER_MAX_HEIGHT}px`, boxSizing: 'border-box', width: '100%',
						}}
					/>
					<div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '2px 6px 6px', minWidth: 0 }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>{toolbar}</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>{actions}</div>
					</div>
				</div>
				{(hintLeft || hintRight) && (
					<div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px', fontSize: '10.5px', color: C.fgMuted, minWidth: 0 }}>
						<span style={{ flex: 1, minWidth: 0, ...ellipsis }}>{hintLeft}</span>
						{hintRight && <span style={{ flexShrink: 1, minWidth: 0, ...ellipsis }}>{hintRight}</span>}
					</div>
				)}
			</div>
		</div>
	);
};

/** 送信 ↑ (丸ボタン) */
const SendButton = ({ disabled, busy, title, onClick }: { disabled: boolean; busy?: boolean; title: string; onClick: () => void }) => (
	<button
		type='button'
		title={title}
		aria-label={title}
		disabled={disabled}
		onClick={onClick}
		style={{
			width: '26px', height: '26px', borderRadius: '50%', border: 'none', flexShrink: 0,
			display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
			background: disabled ? C.sendDisabledBg : C.sendBg, color: disabled ? C.fgMuted : C.sendFg,
			cursor: disabled ? 'default' : 'pointer', opacity: disabled && !busy ? 0.6 : 1,
		}}
	>
		{busy ? <Spinner size={13} /> : <ArrowUp size={14} strokeWidth={2.5} />}
	</button>
);

/** 止める ■ (丸ボタン。実行中だけ) */
const StopButton = ({ title, onClick }: { title: string; onClick: () => void }) => (
	<button
		type='button'
		title={title}
		aria-label={title}
		onClick={onClick}
		style={{
			width: '26px', height: '26px', borderRadius: '50%', border: 'none', flexShrink: 0,
			display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
			background: C.sendBg, color: C.sendFg, cursor: 'pointer',
		}}
	>
		<Square size={10} fill='currentColor' strokeWidth={0} />
	</button>
);

/** 入力欄の上に出すポップオーバーの枠 */
const Popover = React.forwardRef<HTMLDivElement, { children: React.ReactNode; width?: string; onClose: () => void }>(({ children, width = '420px', onClose }, ref) => (
	<div
		ref={ref}
		role='dialog'
		onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
		style={{
			position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 30,
			width: `min(${width}, 100%)`, maxHeight: '60vh', overflowY: 'auto', boxSizing: 'border-box',
			background: C.bgWidget, color: C.fg, border: `1px solid ${C.border}`, borderRadius: '8px',
			boxShadow: `0 6px 24px ${C.shadow}`, padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px',
		}}
	>
		{children}
	</div>
));
Popover.displayName = 'Popover';

const PopoverTitle = ({ children }: { children: React.ReactNode }) => (
	<div style={{ fontSize: '11px', fontWeight: 600, color: C.fgMuted, padding: '0 2px' }}>{children}</div>
);


// ---------------------------------------------------------------------------
// 新しいエージェント: 入力欄 (作業する場所・並列数・プロジェクト・モデルのチップ付き)
// ---------------------------------------------------------------------------

export type NewAgentDraft = {
	prompt: string;
	count: number;
	source: CloudSessionSource;
	repoUrl: string;
	urlBranch: string;
	title: string;
	/**
	 * Division プロジェクトの ID。null は「使用中のプロジェクト (divisionProjectService の active) に従う」(既定)、
	 * '' は「指定しない」(サーバーの既定)。モデルに Division Project を選んでいるあいだは使わない (モデルのプロジェクトになる)。
	 * モデルの選択は下書きではなく ICloudAgentService の modelPick (覚えておいて次回の初期値にする)
	 */
	projectId: string | null;
};

const modelPicksEqual = (a: CloudModelPick, b: CloudModelPick) =>
	a.kind === b.kind
	&& (a.kind !== 'divisionProject' || a.projectId === (b as typeof a).projectId)
	&& (a.kind !== 'model' || a.model === (b as typeof a).model);

/**
 * 覚えているモデルの選択を、今の Division プロジェクトに合わせて解決する (覚えている値自体は書き換えない):
 *  - まだ選んだことがない → 使用中の Division プロジェクト (Division と同期済み) があれば「Division Project · 使用中」、無ければ既定
 *  - Division Project で、そのプロジェクトがもう無い → 使用中のプロジェクト (それも無ければ projectId 空 = 起動できない)
 */
const resolveModelPick = (stored: CloudModelPick | null, projects: DivisionProjectConfig[], activeProjectId: string): CloudModelPick => {
	const activeSynced = !!activeProjectId && projects.some(p => p.projectId === activeProjectId);
	if (!stored) return activeSynced ? { kind: 'divisionProject', projectId: activeProjectId } : { kind: 'default' };
	if (stored.kind === 'divisionProject' && !projects.some(p => p.projectId === stored.projectId)) {
		return { kind: 'divisionProject', projectId: activeSynced ? activeProjectId : '' };
	}
	return stored;
};

type ModelOptionRow = {
	key: string;
	/** グループの見出し (変わるところで出す) */
	group: string;
	pick: CloudModelPick;
	label: React.ReactNode;
	/** 検索の対象 */
	text: string;
	icon?: React.ReactNode;
	detail?: string;
	badge?: string;
	title?: string;
};

/** 一覧が長いときだけ検索欄を出す */
const MODEL_SEARCH_MIN_OPTIONS = 10;

/**
 * モデルの選択 (IDE のチャットのモデル選択と同じ並び):
 *   Division Project · <プロジェクト> (Division と同期済みのプロジェクトごと。使用中が先頭)
 *   既定 (プロジェクトの coder ロール)
 *   Division のモデル (プロバイダごと)
 * 下にタイトル (任意) の入力欄
 */
const ModelPickerPopover = React.forwardRef<HTMLDivElement, {
	pick: CloudModelPick;
	onPick: (pick: CloudModelPick) => void;
	projects: DivisionProjectConfig[];
	activeProjectId: string;
	title: string;
	setTitle: (v: string) => void;
	onClose: () => void;
}>(({ pick, onPick, projects, activeProjectId, title, setTitle, onClose }, ref) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const commandService = accessor.get('ICommandService');
	const refreshModelService = accessor.get('IRefreshModelService');
	const refreshState = useRefreshModelState();
	const groups = useDivisionModelGroups();
	const [query, setQuery] = useState('');
	const [focusIdx, setFocusIdx] = useState(-1);
	const listRef = useRef<HTMLDivElement | null>(null);

	const divisionGroup = t('cloudAgents.model.divisionProjectGroup');
	const allRows = useMemo((): ModelOptionRow[] => {
		const rows: ModelOptionRow[] = [];
		const ordered = [...projects].sort((a, b) => Number(b.projectId === activeProjectId) - Number(a.projectId === activeProjectId));
		for (const p of ordered) {
			const name = p.name || p.projectId;
			rows.push({
				key: `dp:${p.projectId}`,
				group: divisionGroup,
				pick: { kind: 'divisionProject', projectId: p.projectId },
				icon: <Workflow size={13} style={{ flexShrink: 0, color: C.fgMuted }} />,
				label: <><span style={{ fontWeight: 600 }}>Division Project</span><span style={{ color: C.fgMuted }}> · </span>{name}</>,
				text: `Division Project ${name}`,
				badge: p.projectId === activeProjectId ? t('cloudAgents.project.active') : undefined,
				title: `Division Project · ${name}`,
			});
		}
		rows.push({
			key: 'default',
			group: '',
			pick: { kind: 'default' },
			icon: <Cpu size={13} style={{ flexShrink: 0, color: C.fgMuted }} />,
			label: t('cloudAgents.model.default'),
			text: `${t('cloudAgents.model.default')} default coder`,
		});
		for (const g of groups) {
			for (const m of g.models) {
				rows.push({
					key: `m:${m.name}`,
					group: g.title,
					pick: { kind: 'model', model: m.name },
					label: <span style={{ fontFamily: C.monoFont, fontSize: '11.5px' }}>{m.modelId}</span>,
					text: `${m.name} ${g.title}`,
					title: m.name,
				});
			}
		}
		return rows;
	}, [projects, activeProjectId, groups, divisionGroup, t]);

	const q = query.trim().toLowerCase();
	const rows = useMemo(() => q ? allRows.filter(r => r.text.toLowerCase().includes(q)) : allRows, [allRows, q]);
	const modelCount = groups.reduce((n, g) => n + g.models.length, 0);
	const showSearch = allRows.length > MODEL_SEARCH_MIN_OPTIONS;
	const modelsLoading = refreshState?.divisionAPI?.state === 'refreshing' || refreshState?.divisionAPI?.state === 'init';

	useEffect(() => { setFocusIdx(q ? 0 : -1); }, [q]);
	useEffect(() => {
		if (focusIdx < 0) return;
		listRef.current?.querySelector<HTMLElement>(`[data-idx="${focusIdx}"]`)?.scrollIntoView({ block: 'nearest' });
	}, [focusIdx]);

	const onSearchKey = (e: React.KeyboardEvent) => {
		if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(rows.length - 1, i + 1)); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(0, i - 1)); }
		else if (e.key === 'Enter') {
			e.preventDefault();
			const row = rows[focusIdx >= 0 ? focusIdx : 0];
			if (row) onPick(row.pick);
		}
	};

	const lastDivisionKey = [...allRows].reverse().find(r => r.pick.kind === 'divisionProject')?.key;
	let lastGroup: string | null = null;
	return (
		<Popover ref={ref} onClose={onClose} width='420px'>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
				<PopoverTitle>{t('cloudAgents.model.label')}</PopoverTitle>
				<button type='button' className='oca-link' style={{ fontSize: '11px' }} onClick={() => { onClose(); void commandService.executeCommand(ORCHESTRA_OPEN_DIVISION_PROJECTS_ACTION_ID); }}>
					{t('cloudAgents.project.manage')}
				</button>
			</div>
			{showSearch && (
				<div style={{ position: 'relative' }}>
					<Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: C.fgMuted, pointerEvents: 'none' }} />
					<input
						className='oca-input'
						autoFocus
						value={query}
						onChange={e => setQuery(e.target.value)}
						onKeyDown={onSearchKey}
						placeholder={t('cloudAgents.model.search')}
						spellCheck={false}
						style={{ ...inputStyle, paddingLeft: '26px' }}
					/>
				</div>
			)}
			<div ref={listRef} role='listbox' style={{ display: 'flex', flexDirection: 'column', gap: '1px', maxHeight: '300px', overflowY: 'auto', margin: '0 -2px', padding: '0 2px' }}>
				{rows.map((row, idx) => {
					const header = row.group !== lastGroup && (row.group || lastGroup !== null) ? row.group : null;
					// 区切り線は「Division Project / 既定 / モデル」の大きな区切りだけ (プロバイダの間は見出しだけ)
					const showDivider = lastGroup !== null && row.group !== lastGroup && (lastGroup === divisionGroup || lastGroup === '');
					lastGroup = row.group;
					const selected = modelPicksEqual(row.pick, pick);
					return (
						<React.Fragment key={row.key}>
							{showDivider && <div style={{ height: '1px', flexShrink: 0, background: C.border, margin: '4px 2px' }} />}
							{header && <div style={{ fontSize: '10.5px', fontWeight: 600, color: C.fgMuted, padding: '4px 8px 2px', flexShrink: 0, ...ellipsis }}>{header}</div>}
							<button
								type='button'
								role='option'
								aria-selected={selected}
								data-idx={idx}
								className='oca-option'
								data-selected={selected}
								data-focused={idx === focusIdx}
								title={row.title}
								onClick={() => onPick(row.pick)}
								style={{ padding: '5px 8px', flexShrink: 0 }}
							>
								{row.icon ?? <span style={{ width: '13px', flexShrink: 0 }} />}
								<span style={{ flex: 1, minWidth: 0, ...ellipsis }}>{row.label}</span>
								{row.badge && <span style={{ fontSize: '10px', color: C.fgMuted, flexShrink: 0 }}>{row.badge}</span>}
								{selected && <CheckCircle2 size={12} style={{ flexShrink: 0 }} />}
							</button>
							{row.key === lastDivisionKey && !q && (
								<div style={{ fontSize: '10.5px', color: C.fgMuted, lineHeight: 1.45, padding: '2px 8px 2px 29px', flexShrink: 0 }}>{t('cloudAgents.model.divisionProjectHint')}</div>
							)}
						</React.Fragment>
					);
				})}
				{rows.length === 0 && <div style={{ fontSize: '11.5px', color: C.fgMuted, padding: '6px 8px' }}>{t('cloudAgents.model.noMatch')}</div>}
				{!q && projects.length === 0 && (
					<div style={{ fontSize: '11px', color: C.fgMuted, lineHeight: 1.45, padding: '2px 8px 4px' }}>{t('cloudAgents.model.noProjects')}</div>
				)}
				{!q && modelCount === 0 && (
					<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: C.fgMuted, padding: '6px 8px' }}>
						{modelsLoading ? <><Spinner size={10} /> {t('cloudAgents.model.loading')}</> : (
							<>
								<span>{t('cloudAgents.model.noModels')}</span>
								<button type='button' className='oca-link' style={{ fontSize: '11px' }} onClick={() => refreshModelService.startRefreshingModels('divisionAPI', { enableProviderOnSuccess: false, doNotFire: true })}>
									{t('cloudAgents.model.reload')}
								</button>
							</>
						)}
					</div>
				)}
			</div>
			<div style={{ height: '1px', background: C.border, margin: '0 -8px' }} />
			<label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: C.fgMuted }}>
				{t('cloudAgents.new.titleLabel')}
				<input className='oca-input' value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onClose(); } }} placeholder={t('cloudAgents.new.titlePlaceholder')} style={inputStyle} />
			</label>
		</Popover>
	);
});
ModelPickerPopover.displayName = 'ModelPickerPopover';

/** パネルが閉じている間に来た「入力欄にフォーカス」の要求も拾えるよう、最後に処理した番号を覚えておく */
let lastHandledFocusRequest = 0;

type ComposerMenu = 'source' | 'parallel' | 'project' | 'model' | null;

const NewAgentComposer = ({ draft, setDraft, textareaRef }: {
	draft: NewAgentDraft;
	setDraft: (patch: Partial<NewAgentDraft>) => void;
	textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
}) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const commandService = accessor.get('ICommandService');
	const state = useCloudAgentState();
	/** GitHub: 選んだリポジトリがあっても一覧から選び直している (「変更」) */
	const [choosingRepo, setChoosingRepo] = useState(false);
	const [menu, setMenu] = useState<ComposerMenu>(null);
	const popoverRef = useRef<HTMLDivElement | null>(null);
	const toolbarRef = useRef<HTMLDivElement | null>(null);
	useDismiss(menu !== null, [popoverRef, toolbarRef], () => setMenu(null));

	const { prompt, count, source, repoUrl, urlBranch, title } = draft;

	// プロジェクト: 選んでいなければ使用中のプロジェクト (チャットと同じもの)。サーバーの既定に任せることもできる
	const projects = useSyncedProjects();
	const activeProjectId = useDivisionProjectConfig()?.projectId?.trim() || '';
	const getProjectLabel = useProjectLabel();

	// モデル: 覚えている選択 (無ければ使用中の Division プロジェクトの Division Project)。
	// Division Project を選んでいるあいだは、プロジェクトはそのプロジェクトに固定する (チップを 2 つで食い違わせない)
	const modelPick = resolveModelPick(state.modelPick, projects, activeProjectId);
	const divisionMode = modelPick.kind === 'divisionProject';
	const projectId = divisionMode ? modelPick.projectId : (draft.projectId === null ? activeProjectId : draft.projectId);
	const projectLabel = getProjectLabel(projectId);
	const modelReady = !divisionMode || !!projectId;

	useEffect(() => {
		if (state.focusFormRequest > lastHandledFocusRequest) {
			lastHandledFocusRequest = state.focusFormRequest;
			textareaRef.current?.focus();
		}
	}, [state.focusFormRequest, textareaRef]);

	const gh = state.github;
	// GitHub の連携状態は GitHub を選んだときに初めて取りに行く (失敗したら再試行ボタンから)
	useEffect(() => {
		if (source === 'github' && state.isLoggedIn && !gh.loaded && !gh.loading && !gh.error) void cloudAgentService.refreshGitHubStatus();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [source, state.isLoggedIn, gh.loaded, gh.loading, gh.error]);

	// 実際に使う出どころ: フォルダが閉じられていたら空のフォルダ、サーバーに GitHub 連携が無ければ URL
	const githubUnavailable = source === 'github' && gh.loaded && !gh.configured;
	const effectiveSource: CloudSessionSource =
		source === 'workspace' && !state.workspaceName ? 'empty'
			: githubUnavailable ? 'url'
				: source;

	const sourceReady =
		effectiveSource === 'github' ? (gh.connected && !!state.githubPick && !choosingRepo)
			: effectiveSource === 'url' ? (!validateCloudRepoUrl(repoUrl) && !validateCloudRepoBranch(urlBranch))
				: true;
	const canLaunch = !!prompt.trim() && !state.creating && state.isLoggedIn && sourceReady && modelReady;

	const launch = useCallback(async () => {
		if (!canLaunch) {
			// 場所・モデルが決まっていなければ、どこが足りないか見せる
			if (prompt.trim() && !sourceReady) setMenu('source');
			else if (prompt.trim() && !modelReady) setMenu('model');
			return;
		}
		setMenu(null);
		const pick = state.githubPick;
		const model = modelPick.kind === 'divisionProject' ? CLOUD_DIVISION_PROJECT_MODEL
			: modelPick.kind === 'model' ? modelPick.model
				: undefined;
		const created = await cloudAgentService.createSession({
			prompt,
			title: title.trim() || undefined,
			model,
			...(projectId ? { projectId } : {}),
			source: effectiveSource,
			includeWorkspace: effectiveSource === 'workspace',
			...(effectiveSource === 'github' && pick ? { repo: { fullName: pick.repo.fullName, ...(pick.branch ? { branch: pick.branch } : {}) } } : {}),
			...(effectiveSource === 'url' ? { repo: { url: repoUrl.trim(), ...(urlBranch.trim() ? { branch: urlBranch.trim() } : {}) } } : {}),
			count,
		});
		if (created.length) {
			setDraft({ prompt: '', title: '' });
			// 並列で起動したときは 1 本目を開く
			cloudAgentService.select(created[0].id);
		}
	}, [canLaunch, sourceReady, modelReady, cloudAgentService, prompt, title, modelPick, projectId, effectiveSource, state.githubPick, repoUrl, urlBranch, count, setDraft]);

	const sourceHint =
		effectiveSource === 'workspace' && state.workspaceName ? t('cloudAgents.new.includeWorkspaceHint').replace('{name}', state.workspaceName)
			: effectiveSource === 'github' ? t('cloudAgents.source.githubHint')
				: effectiveSource === 'url' ? (githubUnavailable ? '' : t('cloudAgents.source.urlHint'))
					: source === 'workspace' ? t('cloudAgents.new.noWorkspace')
						: t('cloudAgents.new.emptyFolder');

	// 作業する場所のチップ
	const pick = state.githubPick;
	const sourceChip: { icon: React.ReactNode; label: string } =
		effectiveSource === 'workspace' ? { icon: <Folder size={12} />, label: state.workspaceName ?? t('cloudAgents.source.workspace') }
			: effectiveSource === 'github' ? { icon: <Github size={12} />, label: pick && !choosingRepo ? `${pick.repo.fullName}${pick.branch ? `@${pick.branch}` : ''}` : t('cloudAgents.source.github') }
				: effectiveSource === 'url' ? { icon: <Link size={12} />, label: repoUrl.trim() ? cloudRepoLabel(repoUrl) : t('cloudAgents.source.url') }
					: { icon: <FolderPlus size={12} />, label: t('cloudAgents.source.empty') };

	const toggleMenu = (m: Exclude<ComposerMenu, null>) => setMenu(prev => prev === m ? null : m);

	const sourceOptions: { id: CloudSessionSource; icon: React.ReactNode; label: string; disabled?: boolean }[] = [
		{ id: 'workspace', icon: <Folder size={13} />, label: state.workspaceName ? `${t('cloudAgents.source.workspace')} (${state.workspaceName})` : `${t('cloudAgents.source.workspace')} ${t('cloudAgents.source.noFolderOption')}`, disabled: !state.workspaceName },
		{ id: 'github', icon: <Github size={13} />, label: t('cloudAgents.source.github') },
		{ id: 'url', icon: <Link size={13} />, label: t('cloudAgents.source.url') },
		{ id: 'empty', icon: <FolderPlus size={13} />, label: t('cloudAgents.source.empty') },
	];

	let popover: React.ReactNode = null;
	if (menu === 'source') {
		popover = (
			<Popover ref={popoverRef} onClose={() => setMenu(null)} width='440px'>
				<PopoverTitle>{t('cloudAgents.source.label')}</PopoverTitle>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
					{sourceOptions.map(o => (
						<button
							key={o.id}
							type='button'
							className='oca-option'
							data-selected={source === o.id}
							disabled={o.disabled}
							onClick={() => { setDraft({ source: o.id }); setChoosingRepo(false); }}
						>
							<span style={{ display: 'inline-flex', color: C.fgMuted }}>{o.icon}</span>
							<span style={{ flex: 1, minWidth: 0, ...ellipsis }}>{o.label}</span>
							{source === o.id && <CheckCircle2 size={12} style={{ flexShrink: 0 }} />}
						</button>
					))}
				</div>
				{source === 'github' && !githubUnavailable && <GitHubSourceFields choosing={choosingRepo} setChoosing={setChoosingRepo} />}
				{githubUnavailable && <div style={{ fontSize: '11px', color: C.fgMuted, lineHeight: 1.4 }}>{t('cloudAgents.github.notConfigured')}</div>}
				{effectiveSource === 'url' && <UrlSourceFields url={repoUrl} setUrl={v => setDraft({ repoUrl: v })} branch={urlBranch} setBranch={v => setDraft({ urlBranch: v })} />}
				{sourceHint && <div style={{ fontSize: '11px', color: C.fgMuted, lineHeight: 1.4 }}>{sourceHint}</div>}
				<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
					<button type='button' onClick={() => { setMenu(null); textareaRef.current?.focus(); }} style={buttonStyle('secondary')}>{t('cloudAgents.composer.done')}</button>
				</div>
			</Popover>
		);
	} else if (menu === 'parallel') {
		popover = (
			<Popover ref={popoverRef} onClose={() => setMenu(null)} width='280px'>
				<PopoverTitle>{t('cloudAgents.new.parallel')}</PopoverTitle>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
					{Array.from({ length: CLOUD_AGENTS_MAX_PARALLEL }, (_, i) => i + 1).map(n => (
						<button
							key={n}
							type='button'
							className='oca-option'
							data-selected={count === n}
							onClick={() => { setDraft({ count: n }); setMenu(null); textareaRef.current?.focus(); }}
							style={{ justifyContent: 'center', fontFamily: C.monoFont }}
						>
							×{n}
						</button>
					))}
				</div>
				<div style={{ fontSize: '11px', color: C.fgMuted, lineHeight: 1.4 }}>{t('cloudAgents.new.parallelHint')}</div>
			</Popover>
		);
	} else if (menu === 'project') {
		const chooseProject = (id: string) => { setDraft({ projectId: id }); setMenu(null); textareaRef.current?.focus(); };
		popover = (
			<Popover ref={popoverRef} onClose={() => setMenu(null)} width='360px'>
				<PopoverTitle>{t('cloudAgents.project.label')}</PopoverTitle>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
					{projects.map(p => (
						<button key={p.projectId} type='button' className='oca-option' data-selected={projectId === p.projectId} onClick={() => chooseProject(p.projectId)}>
							<Layers size={13} style={{ color: C.fgMuted, flexShrink: 0 }} />
							<span style={{ flex: 1, minWidth: 0, ...ellipsis }}>{p.name || p.projectId}</span>
							{p.projectId === activeProjectId && <span style={{ fontSize: '10px', color: C.fgMuted, flexShrink: 0 }}>{t('cloudAgents.project.active')}</span>}
							{projectId === p.projectId && <CheckCircle2 size={12} style={{ flexShrink: 0 }} />}
						</button>
					))}
					<button type='button' className='oca-option' data-selected={!projectId} onClick={() => chooseProject('')}>
						<span style={{ width: '13px', flexShrink: 0 }} />
						<span style={{ flex: 1, minWidth: 0, ...ellipsis, color: C.fgMuted }}>{t('cloudAgents.project.noneOption')}</span>
						{!projectId && <CheckCircle2 size={12} style={{ flexShrink: 0 }} />}
					</button>
				</div>
				<div style={{ fontSize: '11px', color: C.fgMuted, lineHeight: 1.4 }}>{projects.length ? t('cloudAgents.project.hint') : t('cloudAgents.project.empty')}</div>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
					<button type='button' className='oca-link' style={{ fontSize: '11.5px' }} onClick={() => { setMenu(null); void commandService.executeCommand(ORCHESTRA_OPEN_DIVISION_PROJECTS_ACTION_ID); }}>
						{t('cloudAgents.project.manage')}
					</button>
					<button type='button' onClick={() => { setMenu(null); textareaRef.current?.focus(); }} style={buttonStyle('secondary')}>{t('cloudAgents.composer.done')}</button>
				</div>
			</Popover>
		);
	} else if (menu === 'model') {
		popover = (
			<ModelPickerPopover
				ref={popoverRef}
				pick={modelPick}
				onPick={p => { cloudAgentService.setModelPick(p); setMenu(null); textareaRef.current?.focus(); }}
				projects={projects}
				activeProjectId={activeProjectId}
				title={title}
				setTitle={v => setDraft({ title: v })}
				onClose={() => { setMenu(null); textareaRef.current?.focus(); }}
			/>
		);
	}

	// モデルのチップ
	const modelChip: { label: string; mono: boolean; title: string } =
		modelPick.kind === 'divisionProject'
			? { label: projectLabel ? `Division Project · ${projectLabel}` : 'Division Project', mono: false, title: t('cloudAgents.model.divisionProjectHint') }
			: modelPick.kind === 'model'
				? { label: splitDivisionModelName(modelPick.model).modelId, mono: true, title: modelPick.model }
				: { label: t('cloudAgents.composer.modelDefault'), mono: false, title: t('cloudAgents.model.default') };

	const needsRepo = effectiveSource === 'github' && gh.connected && (!state.githubPick || choosingRepo);
	const sourceWarn = !sourceReady && (effectiveSource === 'github' || (effectiveSource === 'url' && !!repoUrl.trim()));

	return (
		<ComposerBox
			value={prompt}
			onChange={v => setDraft({ prompt: v })}
			onSubmit={() => { void launch(); }}
			placeholder={t('cloudAgents.new.placeholder')}
			textareaRef={textareaRef}
			above={popover}
			toolbar={
				<div ref={toolbarRef} style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap', minWidth: 0 }}>
					<button type='button' className='oca-chip' data-active={menu === 'source'} data-warn={sourceWarn} title={`${t('cloudAgents.source.label')}: ${sourceChip.label}`} onClick={() => toggleMenu('source')}>
						{sourceChip.icon}
						<span style={ellipsis}>{sourceChip.label}</span>
						<ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
					</button>
					<button type='button' className='oca-chip' data-active={menu === 'parallel'} title={t('cloudAgents.new.parallelHint')} onClick={() => toggleMenu('parallel')}>
						<span style={{ fontFamily: C.monoFont }}>×{count}</span>
						<ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
					</button>
					<button type='button' className='oca-chip' data-active={menu === 'model'} data-warn={!modelReady} title={`${t('cloudAgents.model.label')}: ${modelChip.title}`} onClick={() => toggleMenu('model')}>
						<ModelIcon division={divisionMode} />
						<span style={{ ...ellipsis, fontFamily: modelChip.mono ? C.monoFont : 'inherit' }}>{modelChip.label}</span>
						<ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
					</button>
					{/* Division Project のときはプロジェクトもモデルで選んだものに決まるので、ここでは変えられない (鍵) */}
					<button
						type='button'
						className='oca-chip'
						data-active={menu === 'project'}
						disabled={divisionMode}
						title={divisionMode ? t('cloudAgents.project.lockedByModel') : `${t('cloudAgents.project.label')}: ${projectLabel ?? t('cloudAgents.project.none')}`}
						onClick={() => toggleMenu('project')}
					>
						<Layers size={12} />
						<span style={ellipsis}>{projectLabel ?? t('cloudAgents.project.none')}</span>
						{divisionMode ? <Lock size={10} style={{ flexShrink: 0, opacity: 0.7 }} /> : <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.7 }} />}
					</button>
				</div>
			}
			actions={
				<SendButton
					disabled={!canLaunch}
					busy={state.creating}
					title={state.creating ? t('cloudAgents.new.launching') : count > 1 ? t('cloudAgents.new.launchN').replace('{count}', String(count)) : t('cloudAgents.new.launch')}
					onClick={() => { void launch(); }}
				/>
			}
			hintLeft={state.creatingProgress
				? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Spinner size={10} /> {state.creatingProgress}</span>
				: needsRepo ? <span style={{ color: C.warning }}>{t('cloudAgents.github.pickRepo')}</span>
					: !modelReady ? <span style={{ color: C.warning }}>{t('cloudAgents.model.needsProject')}</span>
						: t('cloudAgents.composer.hintLaunch')}
			hintRight={t('cloudAgents.billing')}
		/>
	);
};


// ---------------------------------------------------------------------------
// 中央: 新しいエージェント (何を任せますか？)
// ---------------------------------------------------------------------------

const EXAMPLES: { label: TranslationKey; prompt: TranslationKey }[] = [
	{ label: 'cloudAgents.hero.example1.label', prompt: 'cloudAgents.hero.example1.prompt' },
	{ label: 'cloudAgents.hero.example2.label', prompt: 'cloudAgents.hero.example2.prompt' },
	{ label: 'cloudAgents.hero.example3.label', prompt: 'cloudAgents.hero.example3.prompt' },
];

const NewAgentView = ({ leftSlot, draft, setDraft }: {
	leftSlot?: React.ReactNode;
	draft: NewAgentDraft;
	setDraft: (patch: Partial<NewAgentDraft>) => void;
}) => {
	const { t } = useTranslation();
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	return (
		<div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 14px', height: '44px', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
				{leftSlot}
				<Plus size={14} style={{ color: C.fgMuted }} />
				<span style={{ fontSize: '13px', fontWeight: 600, color: C.fg }}>{t('cloudAgents.sidebar.newAgent')}</span>
			</div>
			<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
				<div style={{ maxWidth: '620px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
					<span style={{ width: '44px', height: '44px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: C.hover, color: C.fg }}>
						<Cloud size={22} />
					</span>
					<div style={{ fontSize: '20px', fontWeight: 600, color: C.fg }}>{t('cloudAgents.hero.title')}</div>
					<div style={{ fontSize: '12.5px', lineHeight: 1.6, color: C.fgMuted, maxWidth: '520px' }}>{t('cloudAgents.subtitle')} {t('cloudAgents.hero.subtitle')}</div>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginTop: '6px' }}>
						{EXAMPLES.map(ex => (
							<button
								key={ex.label}
								type='button'
								className='oca-example'
								title={t(ex.prompt)}
								onClick={() => { setDraft({ prompt: t(ex.prompt) }); textareaRef.current?.focus(); }}
							>
								{t(ex.label)}
							</button>
						))}
					</div>
				</div>
			</div>
			<NewAgentComposer draft={draft} setDraft={setDraft} textareaRef={textareaRef} />
		</div>
	);
};


// ---------------------------------------------------------------------------
// 左: エージェントの一覧
// ---------------------------------------------------------------------------

type SectionId = 'running' | 'done' | 'stopped';
const SECTIONS: { id: SectionId; label: TranslationKey }[] = [
	{ id: 'running', label: 'cloudAgents.section.running' },
	{ id: 'done', label: 'cloudAgents.section.done' },
	{ id: 'stopped', label: 'cloudAgents.section.stopped' },
];
const sectionOf = (s: CloudSessionStatus): SectionId => isCloudSessionActive(s) ? 'running' : s === 'idle' ? 'done' : 'stopped';

/** 変更の小さなチップ: 読み込み済みなら +N / −M、まだなら「N ファイル」 */
const ChangesChip = ({ session, changes }: { session: CloudSession; changes: CloudChangesState | undefined }) => {
	const { t } = useTranslation();
	const list = changes?.changes;
	if (list && list.length > 0) {
		const { additions, deletions } = sumChanges(list);
		return (
			<span title={t('cloudAgents.filesChanged').replace('{count}', String(list.length))} style={{ fontFamily: C.monoFont, fontSize: '10.5px', flexShrink: 0 }}>
				<span style={{ color: C.added }}>+{additions}</span>{' '}
				<span style={{ color: C.deleted }}>−{deletions}</span>
			</span>
		);
	}
	if (session.changedFiles > 0) {
		return (
			<span style={{ fontSize: '10px', padding: '0 5px', borderRadius: '8px', border: `1px solid ${C.border}`, flexShrink: 0, whiteSpace: 'nowrap' }}>
				{t('cloudAgents.detail.workspaceFiles').replace('{count}', String(session.changedFiles))}
			</span>
		);
	}
	return null;
};

const AgentRow = ({ session, selected, time, changes, projectLabel, onSelect }: {
	session: CloudSession;
	selected: boolean;
	time: string;
	changes: CloudChangesState | undefined;
	/** Division プロジェクトの名前 (起動時に指定したとき) */
	projectLabel: string | null;
	onSelect: () => void;
}) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const active = isCloudSessionActive(session.status);
	return (
		<div
			role='button'
			tabIndex={0}
			className='oca-row'
			data-selected={selected}
			aria-current={selected}
			onClick={onSelect}
			onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
			style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '7px 10px', margin: '0 6px', borderRadius: '6px' }}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
				<span title={t(statusKey(session.status))} style={{ display: 'inline-flex' }}><StatusDot status={session.status} /></span>
				<span title={session.prompt} style={{ flex: 1, minWidth: 0, fontSize: '12.5px', fontWeight: selected ? 600 : 500, ...ellipsis }}>{sessionTitle(session)}</span>
				{typeof session.costUsd === 'number' && <span className='oca-row-hide-on-hover' style={{ display: 'inline-flex', color: selected ? C.selectedFg : C.fgMuted, opacity: 0.85 }}><CostTag costUsd={session.costUsd} /></span>}
				<span className='oca-row-actions' style={{ alignItems: 'center', gap: '1px', flexShrink: 0 }}>
					{active && (
						<button type='button' className='oca-iconbtn' title={t('cloudAgents.detail.stop')} aria-label={t('cloudAgents.detail.stop')} onClick={e => { e.stopPropagation(); void cloudAgentService.stop(session.id); }} style={{ width: '20px', height: '20px' }}>
							<Square size={11} />
						</button>
					)}
					<button type='button' className='oca-iconbtn' title={t('cloudAgents.detail.archive')} aria-label={t('cloudAgents.detail.archive')} onClick={e => { e.stopPropagation(); void cloudAgentService.archive(session.id); }} style={{ width: '20px', height: '20px' }}>
						<Archive size={11} />
					</button>
				</span>
			</div>
			<div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '18px', fontSize: '11px', color: selected ? C.selectedFg : C.fgMuted, opacity: selected ? 0.85 : 1, minWidth: 0 }}>
				<span style={{ flex: 1, minWidth: 0, display: 'flex', gap: '6px' }}>
					<span style={{ flex: '0 1 auto', minWidth: '24px', display: 'flex' }}><SessionSource session={session} size={10} /></span>
					{projectLabel && <span style={{ flex: '0 3 auto', minWidth: '24px', display: 'flex' }}><ProjectTag label={projectLabel} /></span>}
				</span>
				<span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{time}</span>
				<ChangesChip session={session} changes={changes} />
			</div>
		</div>
	);
};

/**
 * 左の列の下に置く「ワークスペース」: Division プロジェクト / コスト管理 / カンバン。
 * クラウドエージェントモードではチャット (プロジェクトの選択・コスト調整・カンバンの開閉がある) が隠れるので、
 * ここから IDE モードと同じ画面 (設定画面のタブ・カンバンのボード) をエディタ領域に開く。
 */
const WorkspaceNav = ({ compact }: { compact?: boolean }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const commandService = accessor.get('ICommandService');
	const items: { id: string; icon: React.ReactNode; label: string; hint: string; command: string }[] = [
		{ id: 'division', icon: <Layers size={13} />, label: t('cloudAgents.nav.divisionProjects'), hint: t('cloudAgents.nav.divisionProjectsHint'), command: ORCHESTRA_OPEN_DIVISION_PROJECTS_ACTION_ID },
		{ id: 'cost', icon: <Coins size={13} />, label: t('cloudAgents.nav.cost'), hint: t('cloudAgents.nav.costHint'), command: ORCHESTRA_OPEN_COST_MANAGEMENT_ACTION_ID },
		{ id: 'kanban', icon: <Kanban size={13} />, label: t('cloudAgents.nav.kanban'), hint: t('cloudAgents.nav.kanbanHint'), command: VOID_OPEN_KANBAN_ACTION_ID },
	];
	if (compact) {
		return (
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center' }}>
				{items.map(it => (
					<button key={it.id} type='button' className='oca-chip' title={it.hint} onClick={() => { void commandService.executeCommand(it.command); }}>
						{it.icon}
						<span>{it.label}</span>
					</button>
				))}
			</div>
		);
	}
	return (
		<nav aria-label={t('cloudAgents.nav.label')} style={{ borderTop: `1px solid ${C.border}`, padding: '6px 0', display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
			{items.map(it => (
				<button key={it.id} type='button' className='oca-nav' title={it.hint} onClick={() => { void commandService.executeCommand(it.command); }}>
					<span style={{ display: 'inline-flex', color: C.fgMuted, flexShrink: 0 }}>{it.icon}</span>
					<span style={{ flex: 1, minWidth: 0, ...ellipsis }}>{it.label}</span>
				</button>
			))}
		</nav>
	);
};

const AgentSidebar = ({ width, onNew, onSelect, style }: {
	width: number | string;
	onNew: () => void;
	onSelect: (id: string) => void;
	style?: React.CSSProperties;
}) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	const settings = useSettingsState();
	// 行ごとにタイマーを持たせないよう、「◯分前」はここで 1 つだけ
	const relTime = useRelativeTime();
	const projectLabel = useProjectLabel();
	const commandService = accessor.get('ICommandService');
	const [query, setQuery] = useState('');
	const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>({ running: false, done: false, stopped: false });

	const q = query.trim().toLowerCase();
	const filtered = q
		? state.sessions.filter(s => [sessionTitle(s), s.prompt, sessionRepoLabel(s) ?? '', s.workspaceName ?? '', projectLabel(s.projectId) ?? ''].some(v => v.toLowerCase().includes(q)))
		: state.sessions;
	const sections = SECTIONS.map(sec => ({ ...sec, items: filtered.filter(s => sectionOf(s.status) === sec.id) })).filter(sec => sec.items.length > 0);
	const running = state.sessions.filter(s => isCloudSessionActive(s.status)).length;
	// 一覧に表示中 (検索で絞ったもの) の料金の合計。サーバーが料金を付けていなければ出さない
	const totalCost = sumCloudCostUsd(filtered);
	const email = settings.globalSettings.divisionUserEmail;
	const newSelected = state.selectedId === null;

	return (
		<div style={{ width, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border}`, background: C.bgSide, minHeight: 0, ...style }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '0 8px 0 14px', height: '44px', flexShrink: 0 }}>
				<Cloud size={14} style={{ color: C.fg, flexShrink: 0 }} />
				<span style={{ flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 600, color: C.fg, ...ellipsis }}>{t('cloudAgents.title')}</span>
				<button type='button' className='oca-iconbtn' title={t('cloudAgents.list.refresh')} aria-label={t('cloudAgents.list.refresh')} onClick={() => { void cloudAgentService.refresh(); }} style={{ width: '24px', height: '24px' }}>
					{state.loading ? <Spinner size={12} /> : <RefreshCw size={12} />}
				</button>
			</div>
			<div style={{ padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
				<button
					type='button'
					onClick={onNew}
					style={{
						display: 'flex', alignItems: 'center', gap: '7px', width: '100%', boxSizing: 'border-box',
						padding: '7px 10px', borderRadius: '7px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 600,
						background: newSelected ? C.buttonBg : C.button2Bg, color: newSelected ? C.buttonFg : C.button2Fg,
						border: `1px solid ${newSelected ? 'transparent' : C.borderInput}`,
					}}
				>
					<Plus size={14} />
					<span style={{ flex: 1, textAlign: 'left' }}>{t('cloudAgents.sidebar.newAgent')}</span>
					<span style={{ fontSize: '10.5px', fontWeight: 400, opacity: 0.75 }}>{isMac ? '⌘N' : 'Ctrl+N'}</span>
				</button>
				<div style={{ position: 'relative' }}>
					<Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: C.fgMuted, pointerEvents: 'none' }} />
					<input
						className='oca-input'
						value={query}
						onChange={e => setQuery(e.target.value)}
						onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}
						placeholder={t('cloudAgents.sidebar.search')}
						aria-label={t('cloudAgents.sidebar.search')}
						spellCheck={false}
						style={{ ...inputStyle, paddingLeft: '26px', borderRadius: '6px' }}
					/>
				</div>
			</div>
			<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: '8px' }}>
				{state.sessions.length === 0 ? (
					<div style={{ padding: '10px 16px', fontSize: '12px', color: C.fgMuted, display: 'flex', alignItems: 'center', gap: '6px' }}>
						{state.loading ? <><Spinner size={11} /> {t('cloudAgents.list.loading')}</> : t('cloudAgents.list.empty')}
					</div>
				) : sections.length === 0 ? (
					<div style={{ padding: '10px 16px', fontSize: '12px', color: C.fgMuted }}>{t('cloudAgents.sidebar.noMatch').replace('{q}', query.trim())}</div>
				) : sections.map(sec => (
					<div key={sec.id} style={{ marginBottom: '4px' }}>
						<button
							type='button'
							onClick={() => setCollapsed(prev => ({ ...prev, [sec.id]: !prev[sec.id] }))}
							style={{
								display: 'flex', alignItems: 'center', gap: '4px', width: '100%', boxSizing: 'border-box',
								padding: '6px 14px 4px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
								fontSize: '11px', fontWeight: 600, color: C.fgMuted, textAlign: 'left',
							}}
						>
							{collapsed[sec.id] ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
							<span>{t(sec.label)}</span>
							<span style={{ fontWeight: 400, opacity: 0.8 }}>{sec.items.length}</span>
						</button>
						{!collapsed[sec.id] && sec.items.map(s => (
							<AgentRow
								key={s.id}
								session={s}
								selected={s.id === state.selectedId}
								time={relTime(s.updatedAt || s.createdAt)}
								changes={state.changesById[s.id]}
								projectLabel={projectLabel(s.projectId)}
								onSelect={() => onSelect(s.id)}
							/>
						))}
					</div>
				))}
			</div>
			<WorkspaceNav />
			{totalCost !== null && (
				<div title={t('cloudAgents.cost.totalHint').replace('{count}', String(filtered.length))} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px 6px 14px', borderTop: `1px solid ${C.border}`, fontSize: '11px', color: C.fgMuted, flexShrink: 0, minWidth: 0 }}>
					<Coins size={11} style={{ flexShrink: 0 }} />
					<span style={{ flex: 1, minWidth: 0, ...ellipsis }}>
						{t('cloudAgents.cost.total').split('{cost}')[0]}
						<span style={{ fontFamily: C.monoFont, color: C.fg }}>{formatCloudCostUsd(totalCost)}</span>
						{t('cloudAgents.cost.total').split('{cost}')[1] ?? ''}
					</span>
					<button type='button' className='oca-link' style={{ fontSize: '11px', flexShrink: 0 }} onClick={() => { void commandService.executeCommand(ORCHESTRA_OPEN_COST_MANAGEMENT_ACTION_ID); }}>
						{t('cloudAgents.cost.manage')}
					</button>
				</div>
			)}
			<div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 10px 8px 14px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, minWidth: 0 }}>
				<span style={{ width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: C.hover, color: C.fg, fontSize: '10px', fontWeight: 700 }}>
					{(email || 'O').slice(0, 1).toUpperCase()}
				</span>
				<span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
					<span title={email} style={{ fontSize: '11.5px', color: C.fg, ...ellipsis }}>{email || 'Orchestra'}</span>
					<span style={{ fontSize: '10px', color: running > 0 ? statusColor.running : C.fgMuted }}>
						{running > 0 ? t('cloudAgents.list.running').replace('{count}', String(running)) : t('cloudAgents.sidebar.account')}
					</span>
				</span>
				{running > 0 && (
					<button type='button' className='oca-iconbtn' title={t('cloudAgents.list.stopAll')} onClick={() => { void cloudAgentService.stopAll(); }} style={{ padding: '3px 6px', fontSize: '11px', color: C.error, flexShrink: 0 }}>
						<Square size={10} />
						{t('cloudAgents.list.stopAll')}
					</button>
				)}
			</div>
		</div>
	);
};


// ---------------------------------------------------------------------------
// 中央: 会話 (指示・発言・ツールの実行・状態・完了カード)
// ---------------------------------------------------------------------------

type ToolKind = 'read' | 'edit' | 'command' | 'search' | 'list' | 'other';

/** ツール名から種類を決める (サーバー側のツール名は read_file / edit_file / write_file / run_command / search_* / list_dir など) */
const toolKindOf = (name: string): ToolKind => {
	const n = name.toLowerCase();
	if (/command|shell|exec|bash|terminal|run_/.test(n)) return 'command';
	if (/edit|write|create_file|replace|patch|insert|delete_file|rename|move_file|rewrite/.test(n)) return 'edit';
	if (/search|grep|find|glob/.test(n)) return 'search';
	if (/list|ls_|^ls$|dir|tree/.test(n)) return 'list';
	if (/read|view|cat|get_file|open_file/.test(n)) return 'read';
	return 'other';
};
/** まとめて 1 行にする「調べもの」の種類 */
const isExploreKind = (k: ToolKind) => k === 'read' || k === 'search' || k === 'list';

const toolIcon = (k: ToolKind, size = 12) => {
	const style = { flexShrink: 0, color: C.fgMuted } as const;
	switch (k) {
		case 'read': return <FileText size={size} style={style} />;
		case 'edit': return <FilePen size={size} style={style} />;
		case 'command': return <SquareTerminal size={size} style={style} />;
		case 'search': return <Search size={size} style={style} />;
		case 'list': return <FolderOpen size={size} style={style} />;
		default: return <Wrench size={size} style={style} />;
	}
};

/** ツール呼び出しの「何に対して」を 1 つだけ拾う (コマンド・パス・検索語など) */
const keyArgOf = (args: any): string => {
	if (!args || typeof args !== 'object') return typeof args === 'string' ? args : '';
	for (const k of ['command', 'cmd', 'path', 'file', 'filePath', 'file_path', 'uri', 'query', 'pattern', 'url', 'dir', 'directory']) {
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
	borderRadius: '6px', border: `1px solid ${C.border}`,
	fontFamily: C.monoFont, fontSize: '11px', lineHeight: 1.5,
	whiteSpace: 'pre-wrap', wordBreak: 'break-word',
	maxHeight: '320px', overflow: 'auto',
};

/** ツールの実行 1 件 (1 行。押すと出力が開く) */
const ToolRow = ({ data }: { data: any }) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const name = typeof data?.name === 'string' ? data.name : 'tool';
	const kind = toolKindOf(name);
	const keyArg = keyArgOf(data?.args);
	const ok = data?.ok !== false;
	const output = typeof data?.output === 'string' && data.output ? data.output : '';

	let label: React.ReactNode;
	switch (kind) {
		case 'command':
			label = <span style={{ fontFamily: C.monoFont, fontSize: '11.5px', color: C.fg, ...ellipsis }}>{keyArg || name}</span>;
			break;
		case 'read':
		case 'edit':
			label = (
				<span style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
					<span style={{ color: C.fgMuted, flexShrink: 0 }}>{t(kind === 'read' ? 'cloudAgents.tool.read' : 'cloudAgents.tool.edit')}</span>
					<span title={keyArg} style={{ color: C.fg, fontWeight: kind === 'edit' ? 600 : 400, ...ellipsis }}>{keyArg ? basename(keyArg) : name}</span>
					{keyArg && dirname(keyArg) && <span style={{ color: C.fgMuted, fontSize: '11px', ...ellipsis }}>{dirname(keyArg)}</span>}
				</span>
			);
			break;
		case 'search':
		case 'list':
			label = (
				<span style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
					<span style={{ color: C.fgMuted, flexShrink: 0 }}>{t(kind === 'search' ? 'cloudAgents.tool.search' : 'cloudAgents.tool.list')}</span>
					<span title={keyArg} style={{ color: C.fg, fontFamily: C.monoFont, fontSize: '11.5px', ...ellipsis }}>{keyArg || (kind === 'list' ? '.' : '')}</span>
				</span>
			);
			break;
		default:
			label = (
				<span style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
					<span style={{ color: C.fg, flexShrink: 0 }}>{name}</span>
					<span title={keyArg} style={{ color: C.fgMuted, fontFamily: C.monoFont, fontSize: '11px', ...ellipsis }}>{keyArg}</span>
				</span>
			);
	}

	return (
		<div>
			<button
				type='button'
				className='oca-tool'
				onClick={() => setOpen(v => !v)}
				aria-expanded={open}
				style={{
					display: 'flex', alignItems: 'center', gap: '7px', width: '100%', boxSizing: 'border-box',
					padding: '3px 6px', border: 'none', background: 'transparent', color: C.fg,
					cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', textAlign: 'left', minHeight: '24px',
				}}
			>
				{toolIcon(kind)}
				<span style={{ flex: 1, minWidth: 0, display: 'flex' }}>{label}</span>
				{typeof data?.durationMs === 'number' && <span style={{ color: C.fgMuted, fontSize: '10px', flexShrink: 0 }}>{(data.durationMs / 1000).toFixed(1)}s</span>}
				{!ok && <span title={t('cloudAgents.tool.failed')} style={{ display: 'inline-flex' }}><XCircle size={12} style={{ color: C.error, flexShrink: 0 }} /></span>}
				{open ? <ChevronDown size={12} style={{ flexShrink: 0, color: C.fgMuted }} /> : <ChevronRight size={12} style={{ flexShrink: 0, color: C.fgMuted, opacity: 0.6 }} />}
			</button>
			{open && (
				<div style={{ padding: '4px 6px 8px 25px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
					{kind === 'command' ? (
						<pre style={{ ...preStyle, color: ok ? C.fg : C.error }}>
							<span style={{ color: C.fgMuted }}>$ </span>{keyArg}{'\n'}{output || t('cloudAgents.transcript.noOutput')}
						</pre>
					) : (
						<>
							{(kind === 'other' || kind === 'edit') && (
								<>
									<div style={{ fontSize: '10px', color: C.fgMuted }}>{t('cloudAgents.transcript.args')}</div>
									<pre style={preStyle}>{safeJson(data?.args ?? {})}</pre>
								</>
							)}
							<div style={{ fontSize: '10px', color: C.fgMuted }}>{t('cloudAgents.transcript.output')}</div>
							<pre style={{ ...preStyle, color: ok ? C.fg : C.error }}>{output || t('cloudAgents.transcript.noOutput')}</pre>
						</>
					)}
				</div>
			)}
		</div>
	);
};

/** 続けて実行された「読み込み・一覧・検索」をまとめた 1 行 (「3 ファイルを読み込みました」) */
const ToolGroupRow = ({ events }: { events: CloudSessionEvent[] }) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const counts = { read: 0, search: 0, list: 0 };
	let failed = 0;
	for (const ev of events) {
		const k = toolKindOf(String(ev.data?.name ?? ''));
		if (k === 'read' || k === 'search' || k === 'list') counts[k]++;
		if (ev.data?.ok === false) failed++;
	}
	const parts: string[] = [];
	if (counts.read) parts.push(t('cloudAgents.tool.readN').replace('{n}', String(counts.read)));
	if (counts.list) parts.push(t('cloudAgents.tool.listN').replace('{n}', String(counts.list)));
	if (counts.search) parts.push(t('cloudAgents.tool.searchN').replace('{n}', String(counts.search)));
	const mainKind: ToolKind = counts.read >= counts.search && counts.read >= counts.list ? 'read' : counts.search >= counts.list ? 'search' : 'list';

	return (
		<div>
			<button
				type='button'
				className='oca-tool'
				onClick={() => setOpen(v => !v)}
				aria-expanded={open}
				style={{
					display: 'flex', alignItems: 'center', gap: '7px', width: '100%', boxSizing: 'border-box',
					padding: '3px 6px', border: 'none', background: 'transparent', color: C.fgMuted,
					cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', textAlign: 'left', minHeight: '24px',
				}}
			>
				{toolIcon(mainKind)}
				<span style={{ flex: 1, minWidth: 0, ...ellipsis }}>{parts.join(' · ')}</span>
				{failed > 0 && <XCircle size={12} style={{ color: C.error, flexShrink: 0 }} />}
				{open ? <ChevronDown size={12} style={{ flexShrink: 0 }} /> : <ChevronRight size={12} style={{ flexShrink: 0, opacity: 0.6 }} />}
			</button>
			{open && (
				<div style={{ marginLeft: '12px', paddingLeft: '6px', borderLeft: `1px solid ${C.border}` }}>
					{events.map(ev => <ToolRow key={ev.seq} data={ev.data} />)}
				</div>
			)}
		</div>
	);
};

const CompletionCard = ({ data, onReview }: { data: any; onReview: () => void }) => {
	const { t } = useTranslation();
	const changed = typeof data?.changedFiles === 'number' ? data.changedFiles : 0;
	return (
		<div style={{ border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', background: C.bgSide }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: C.success }}>
				<CheckCircle2 size={14} />
				{t('cloudAgents.done.title')}
				<span style={{ fontWeight: 400, color: C.fgMuted }}>
					· {changed > 0 ? t('cloudAgents.filesChanged').replace('{count}', String(changed)) : t('cloudAgents.done.noChanges')}
				</span>
			</div>
			{typeof data?.summary === 'string' && data.summary.trim() && (
				<div className='oca-md' style={{ fontSize: '13px', lineHeight: 1.6, color: C.fg }}>
					<ChatMarkdownRender string={data.summary} chatMessageLocation={undefined} isApplyEnabled={false} isLinkDetectionEnabled={false} />
				</div>
			)}
			{changed > 0 && (
				<div>
					<button type='button' onClick={onReview} style={buttonStyle('primary')}>
						<FileText size={12} />
						{t('cloudAgents.done.review')}
					</button>
				</div>
			)}
		</div>
	);
};

// --- Pull requests (GitHub-repo sessions only) ---

/** The PR to show: the newer of the session's (from the list poll) and the last GET / POST result */
const currentPullRequest = (session: CloudSession, pr: CloudPullRequestState | undefined): CloudPullRequest | null => {
	const candidates = [session.pullRequest, pr?.lastResult?.pullRequest, pr?.info?.pullRequest].filter((p): p is CloudPullRequest => !!p);
	let best: CloudPullRequest | null = null;
	for (const p of candidates) {
		if (!best || (Date.parse(p.updatedAt) || 0) > (Date.parse(best.updatedAt) || 0)) best = p;
	}
	return best;
};

/** Sessions that get PR actions: started from a GitHub repo and not working right now */
const isPullRequestEligible = (session: CloudSession) => isGitHubRepoSession(session) && !isCloudSessionActive(session.status);

/** Everything the PR buttons need for one session */
const usePullRequestView = (session: CloudSession) => {
	const state = useCloudAgentState();
	const pr = state.pullRequestById[session.id];
	const pullRequest = currentPullRequest(session, pr);
	const info = pr?.info;
	// GitHub state of the shown PR (only when the last GET described that same PR)
	const status: CloudPullRequestStatus | null = pullRequest && info?.pullRequest?.number === pullRequest.number ? info.pullRequestState : null;
	// The PR "PR を更新" pushes to; null when there is none or it was merged / closed (then the next submit opens a new PR)
	const updatable = updatablePullRequest(pullRequest, info);
	const infoError = pr?.errorFrom === 'info' ? pr.error : undefined;
	// Until the first GET answers we do not know canCreate: keep the button disabled (not hidden) meanwhile
	const checking = !info && !infoError && (!pr || pr.loading);
	const canCreate = !!info?.canCreate && !pr?.submitting;
	const reason = info && !info.canCreate ? (info.reason || null) : null;
	const reasonCode = info && !info.canCreate ? info.code : undefined;
	// Offer "GitHub と連携" when the server says so, or when our own status check says the account is not connected
	const githubDisconnected = reasonCode === GITHUB_NOT_CONNECTED || (state.github.loaded && state.github.configured && !state.github.connected);
	return { pr, pullRequest, status, updatable, info, infoError, checking, canCreate, reason, githubDisconnected, submitting: !!pr?.submitting };
};

const prTemplate = (key: TranslationKey, n: number, t: (k: TranslationKey) => string) => t(key).replace('{n}', String(n));

/** Inline "Connect GitHub" (the same flow as the repo picker), used when a PR call says GitHub is not connected */
const GitHubConnectInline = () => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const gh = useCloudAgentState().github;
	if (gh.waitingForAuth) {
		return (
			<span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: C.fgMuted, flexWrap: 'wrap' }} aria-live='polite'>
				<Spinner size={11} color={statusColor.running} />
				{t('cloudAgents.github.waiting')}
				<button type='button' className='oca-link' onClick={() => cloudAgentService.cancelGitHubConnect()}>{t('cloudAgents.github.cancel')}</button>
			</span>
		);
	}
	return (
		<button type='button' disabled={gh.starting} onClick={() => { void cloudAgentService.connectGitHub(); }} style={{ ...buttonStyle('secondary', gh.starting), padding: '3px 9px' }}>
			{gh.starting ? <Spinner size={11} /> : <Github size={11} />}
			{t('cloudAgents.github.connect')}
		</button>
	);
};

const prStatusColor: Record<CloudPullRequestStatus, string> = { open: C.success, merged: 'var(--vscode-charts-purple, #a371f7)', closed: C.error };

/** open / merged / closed next to the "PR #n" link */
const PullRequestStatusBadge = ({ status }: { status: CloudPullRequestStatus | null }) => {
	const { t } = useTranslation();
	if (!status) return null;
	const color = prStatusColor[status];
	return (
		<span style={{ fontSize: '10px', fontWeight: 600, lineHeight: 1.5, padding: '0 6px', borderRadius: '8px', background: tint(color, 13), color, border: `1px solid ${tint(color, 33)}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
			{t(`cloudAgents.pr.state.${status}` as TranslationKey)}
		</span>
	);
};

/** "PR #12 を開く" — opens the PR in the system browser */
const OpenPullRequestButton = ({ pullRequest, compact }: { pullRequest: CloudPullRequest; compact?: boolean }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const label = prTemplate('cloudAgents.pr.open', pullRequest.number, t);
	return (
		<button
			type='button'
			className={compact ? 'oca-iconbtn' : undefined}
			title={`${label}\n${pullRequest.url}`}
			onClick={() => { void cloudAgentService.openPullRequest(pullRequest.url); }}
			style={compact ? { height: '28px', padding: '0 8px', fontSize: '11.5px', flexShrink: 0 } : { ...buttonStyle('secondary'), padding: '3px 9px' }}
		>
			<GitPullRequest size={compact ? 13 : 12} />
			{label}
			<ExternalLink size={compact ? 10 : 11} style={{ opacity: 0.7 }} />
		</button>
	);
};

/** "PR を作成" / "PR を更新". Disabled with the server's reason as tooltip while a PR cannot be created */
const PullRequestActionButton = ({ session, onOpenForm, compact }: { session: CloudSession; onOpenForm: () => void; compact?: boolean }) => {
	const { t } = useTranslation();
	const v = usePullRequestView(session);
	const label = v.updatable ? t('cloudAgents.pr.update') : v.pullRequest ? t('cloudAgents.pr.createNew') : t('cloudAgents.pr.create');
	const disabled = !v.canCreate;
	const title = v.submitting
		? t(v.updatable ? 'cloudAgents.pr.submittingUpdate' : 'cloudAgents.pr.submittingCreate')
		: v.checking ? t('cloudAgents.pr.loading')
			: v.reason ?? (v.infoError ? t('cloudAgents.pr.loadError').replace('{error}', v.infoError) : disabled ? t('cloudAgents.pr.unavailable') : label);
	const busy = v.submitting || (v.checking && !!v.pr?.loading);
	return (
		<button
			type='button'
			className={compact ? 'oca-iconbtn' : undefined}
			disabled={disabled}
			aria-disabled={disabled}
			title={title}
			onClick={onOpenForm}
			style={compact
				? { height: '28px', padding: '0 8px', fontSize: '11.5px', flexShrink: 0, color: disabled ? C.fgMuted : C.fg }
				: { ...buttonStyle(v.updatable ? 'secondary' : 'primary', disabled), padding: '3px 9px' }}
		>
			{busy ? <Spinner size={compact ? 12 : 11} /> : v.updatable ? <RefreshCw size={compact ? 12 : 11} /> : <GitPullRequest size={compact ? 13 : 12} />}
			{label}
		</button>
	);
};

/** PR buttons in the conversation header */
const PullRequestHeaderActions = ({ session, onOpenForm }: { session: CloudSession; onOpenForm: () => void }) => {
	const { pullRequest, status } = usePullRequestView(session);
	if (!isPullRequestEligible(session)) return null;
	return (
		<>
			{pullRequest && <OpenPullRequestButton pullRequest={pullRequest} compact />}
			{pullRequest && <PullRequestStatusBadge status={status} />}
			<PullRequestActionButton session={session} onOpenForm={onOpenForm} compact />
		</>
	);
};

const prFieldLabel: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: C.fgMuted };
const prReadOnlyInput: React.CSSProperties = { ...inputStyle, color: C.fgMuted, background: 'transparent', cursor: 'default' };

/** The inline create / update form, prefilled from GET .../pull-request */
const PullRequestForm = ({ session, onClose }: { session: CloudSession; onClose: () => void }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const v = usePullRequestView(session);
	// Only an open PR is updated; after a merge / close the form creates a new one from the fresh suggestion
	const existing = v.updatable;
	const suggestion = v.info?.suggestion;

	const [title, setTitle] = useState('');
	const [body, setBody] = useState('');
	const [branch, setBranch] = useState('');
	const [draft, setDraft] = useState(false);
	const [localError, setLocalError] = useState<string | null>(null);
	const titleRef = useRef<HTMLInputElement | null>(null);
	// Fill the fields once, when the suggestion first arrives (the form may open before the GET answers)
	const filled = useRef(false);
	useEffect(() => {
		if (filled.current || !suggestion) return;
		filled.current = true;
		// While the PR is open the suggestion holds its current title / body on GitHub
		setTitle(suggestion.title || existing?.title || '');
		setBody(suggestion.body);
		setBranch(existing?.branch || suggestion.branch);
		setDraft(existing?.draft ?? false);
		setTimeout(() => titleRef.current?.focus(), 0);
	}, [suggestion, existing]);

	const base = existing?.base || suggestion?.base || session.workspaceInfo?.gitBranch || '';
	// Only show submit errors from this opening of the form (or a submit still running from before), not stale ones
	const attempted = useRef(false);
	if (v.submitting) attempted.current = true;
	const submitError = attempted.current && v.pr?.errorFrom === 'submit' ? v.pr.error : undefined;
	const submitCode = v.pr?.errorFrom === 'submit' ? v.pr.errorCode : undefined;
	const error = localError ?? submitError;
	const ready = !!suggestion && !v.submitting;

	const submit = async () => {
		if (!ready) return;
		const invalid = validateCloudPullRequestFields(title, body) ?? (!existing ? validateCloudPullRequestBranch(branch) : null);
		setLocalError(invalid);
		if (invalid) return;
		attempted.current = true;
		const res = await cloudAgentService.createPullRequest(session.id, {
			title: title.trim(),
			body,
			...(!existing ? { branch: branch.trim(), draft } : {}),
			...(base ? { base } : {}),
		});
		if (res.ok) onClose();
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && isModKey(e)) { e.preventDefault(); void submit(); }
		else if (e.key === 'Escape' && !v.submitting) { e.preventDefault(); onClose(); }
	};

	return (
		<div onKeyDown={onKeyDown} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: C.fg }}>
				<GitPullRequest size={14} />
				{existing ? prTemplate('cloudAgents.pr.formUpdate', existing.number, t) : t('cloudAgents.pr.formCreate')}
				{session.workspaceInfo?.repoFullName && <span style={{ fontWeight: 400, color: C.fgMuted, fontSize: '11.5px', minWidth: 0, ...ellipsis }}>· {session.workspaceInfo.repoFullName}</span>}
			</div>
			<div style={{ fontSize: '11px', lineHeight: 1.45, color: C.fgMuted }}>{t(existing ? 'cloudAgents.pr.updateHint' : 'cloudAgents.pr.createHint')}</div>

			{!suggestion ? (
				v.infoError ? (
					<div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: C.error, flexWrap: 'wrap' }}>
						<span>{t('cloudAgents.pr.loadError').replace('{error}', v.infoError)}</span>
						<button type='button' className='oca-link' onClick={() => { void cloudAgentService.getPullRequestInfo(session.id); }}>{t('cloudAgents.pr.reload')}</button>
					</div>
				) : (
					<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.fgMuted }}><Spinner /> {t('cloudAgents.pr.loading')}</div>
				)
			) : (
				<>
					<label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
						<span style={prFieldLabel}>{t('cloudAgents.pr.title')}</span>
						<input ref={titleRef} className='oca-input' value={title} maxLength={CLOUD_PR_TITLE_MAX} disabled={v.submitting} onChange={e => setTitle(e.target.value)} style={inputStyle} />
					</label>
					<label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
						<span style={prFieldLabel}>{t('cloudAgents.pr.body')}</span>
						<textarea
							className='oca-textarea'
							value={body}
							disabled={v.submitting}
							onChange={e => setBody(e.target.value)}
							rows={8}
							style={{ ...inputStyle, resize: 'vertical', minHeight: '96px', maxHeight: '360px', lineHeight: 1.5, fontFamily: C.monoFont, fontSize: '11.5px' }}
						/>
					</label>
					<div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
						<label style={{ flex: '2 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
							<span style={prFieldLabel}>{t('cloudAgents.pr.branch')}</span>
							<input
								className='oca-input'
								value={branch}
								readOnly={!!existing}
								disabled={v.submitting}
								title={existing ? t('cloudAgents.pr.branchLocked') : undefined}
								onChange={e => setBranch(e.target.value)}
								style={{ ...(existing ? prReadOnlyInput : inputStyle), fontFamily: C.monoFont }}
							/>
						</label>
						<label style={{ flex: '1 1 120px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
							<span style={prFieldLabel}>{t('cloudAgents.pr.base')}</span>
							<input className='oca-input' value={base} readOnly tabIndex={-1} style={{ ...prReadOnlyInput, fontFamily: C.monoFont }} />
						</label>
					</div>
					<label title={existing ? t('cloudAgents.pr.draftLocked') : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: existing ? C.fgMuted : C.fg, cursor: existing ? 'default' : 'pointer', alignSelf: 'flex-start' }}>
						<input type='checkbox' checked={draft} disabled={!!existing || v.submitting} onChange={e => setDraft(e.target.checked)} style={{ margin: 0 }} />
						<span style={{ fontWeight: 600 }}>{t('cloudAgents.pr.draft')}</span>
						<span style={{ color: C.fgMuted, fontSize: '11px' }}>{existing ? t('cloudAgents.pr.draftLocked') : t('cloudAgents.pr.draftHint')}</span>
					</label>
				</>
			)}

			{error && (
				<div role='alert' style={{
					display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '12px', padding: '6px 10px', borderRadius: '6px',
					background: tint(C.error, 8), border: `1px solid ${tint(C.error, 30)}`, flexWrap: 'wrap',
				}}>
					<AlertTriangle size={13} style={{ marginTop: '2px', flexShrink: 0, color: C.error }} />
					<span style={{ flex: '1 1 200px', color: C.fg, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</span>
					{!localError && submitCode === GITHUB_NOT_CONNECTED && <GitHubConnectInline />}
				</div>
			)}

			<div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
				<button type='button' disabled={!ready} onClick={() => { void submit(); }} style={buttonStyle('primary', !ready)}>
					{v.submitting ? <Spinner size={12} /> : existing ? <RefreshCw size={12} /> : <GitPullRequest size={12} />}
					{existing ? t('cloudAgents.pr.submitUpdate') : t('cloudAgents.pr.submitCreate')}
				</button>
				<button type='button' disabled={v.submitting} onClick={onClose} style={buttonStyle('secondary', v.submitting)}>{t('cloudAgents.pr.cancel')}</button>
				{v.submitting
					? <span style={{ fontSize: '11px', color: C.fgMuted }} aria-live='polite'>{t(existing ? 'cloudAgents.pr.submittingUpdate' : 'cloudAgents.pr.submittingCreate')}</span>
					: <span style={{ fontSize: '10.5px', color: C.fgFaint }}>{t(isMac ? 'cloudAgents.pr.shortcutMac' : 'cloudAgents.pr.shortcut')}</span>}
			</div>
		</div>
	);
};

/** "PR #12 を作成しました — GitHub で開く" after a successful submit */
const PullRequestSuccessLine = ({ session }: { session: CloudSession }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const pr = useCloudAgentState().pullRequestById[session.id];
	const result = pr?.lastResult;
	if (!result || !pr?.lastAction) return null;
	const key: TranslationKey = pr.lastAction === 'created' ? 'cloudAgents.pr.created' : pr.lastAction === 'updated' ? 'cloudAgents.pr.updated' : 'cloudAgents.pr.unchanged';
	return (
		<div aria-live='polite' style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: pr.lastAction === 'unchanged' ? C.fgMuted : C.success, flexWrap: 'wrap' }}>
			<CheckCircle2 size={13} style={{ flexShrink: 0 }} />
			<span>{prTemplate(key, result.pullRequest.number, t)}</span>
			<button type='button' className='oca-link' title={result.pullRequest.url} onClick={() => { void cloudAgentService.openPullRequest(result.pullRequest.url); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
				{t('cloudAgents.pr.openOnGitHub')}
				<ExternalLink size={11} />
			</button>
		</div>
	);
};

/**
 * PR card at the end of the transcript (right under the completion card): the actions, the reason when a PR cannot be
 * created, the inline form, and the result of the last submit.
 */
const PullRequestSection = ({ session, formOpen, onOpenForm, onCloseForm }: {
	session: CloudSession;
	formOpen: boolean;
	onOpenForm: () => void;
	onCloseForm: () => void;
}) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const v = usePullRequestView(session);
	const ref = useRef<HTMLDivElement | null>(null);
	// Bring the form into view when it is opened from the header
	useEffect(() => {
		if (formOpen) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}, [formOpen]);

	if (!isPullRequestEligible(session)) return null;
	const pullRequest = v.pullRequest;

	return (
		<div ref={ref} style={{ border: `1px solid ${formOpen ? C.focus : C.border}`, borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', background: C.bgSide }}>
			{formOpen ? (
				<PullRequestForm session={session} onClose={onCloseForm} />
			) : (
				<>
					<div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
						<span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flex: '1 1 200px', minWidth: 0, fontSize: '12px', color: C.fg }}>
							<GitPullRequest size={14} style={{ flexShrink: 0, color: pullRequest ? C.success : C.fgMuted }} />
							{pullRequest ? (
								<>
									<span style={{ fontWeight: 600, flexShrink: 0 }}>#{pullRequest.number}</span>
									<span title={pullRequest.title} style={{ minWidth: 0, ...ellipsis }}>{pullRequest.title}</span>
									<PullRequestStatusBadge status={v.status} />
									{pullRequest.draft && <span style={{ fontSize: '10px', padding: '0 6px', borderRadius: '8px', border: `1px solid ${C.border}`, color: C.fgMuted, flexShrink: 0 }}>{t('cloudAgents.pr.draftBadge')}</span>}
								</>
							) : v.checking ? (
								<span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: C.fgMuted }}><Spinner size={11} /> {t('cloudAgents.pr.loading')}</span>
							) : (
								<span style={{ color: C.fgMuted }}>{v.canCreate ? t('cloudAgents.pr.ready') : t('cloudAgents.pr.unavailable')}</span>
							)}
						</span>
						{pullRequest && <OpenPullRequestButton pullRequest={pullRequest} />}
						<PullRequestActionButton session={session} onOpenForm={onOpenForm} />
					</div>
					{pullRequest && (
						<div style={{ fontSize: '11px', color: C.fgMuted, fontFamily: C.monoFont, ...ellipsis }} title={`${pullRequest.branch} → ${pullRequest.base}`}>
							{pullRequest.branch} → {pullRequest.base}
						</div>
					)}
					{pullRequest && !v.updatable && v.status && (
						<div style={{ fontSize: '11.5px', color: C.fgMuted }}>
							{prTemplate('cloudAgents.pr.closedHint', pullRequest.number, t).replace('{state}', t(`cloudAgents.pr.state.${v.status}` as TranslationKey))}
						</div>
					)}
					{/* Why the button is disabled (the server's Japanese reason), with the GitHub connect flow when that is the cause */}
					{v.reason && (
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: C.warning, flexWrap: 'wrap' }}>
							<AlertTriangle size={12} style={{ flexShrink: 0 }} />
							<span style={{ flex: '1 1 200px', minWidth: 0 }}>{v.reason}</span>
							{v.githubDisconnected && <GitHubConnectInline />}
						</div>
					)}
					{!v.reason && !v.info && v.githubDisconnected && (
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: C.fgMuted, flexWrap: 'wrap' }}>
							<span style={{ flex: '1 1 200px', minWidth: 0 }}>{t('cloudAgents.pr.connectHint')}</span>
							<GitHubConnectInline />
						</div>
					)}
					{v.infoError && (
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: C.error, flexWrap: 'wrap' }}>
							<span style={{ flex: '1 1 200px', minWidth: 0 }}>{t('cloudAgents.pr.loadError').replace('{error}', v.infoError)}</span>
							{v.pr?.errorCode === GITHUB_NOT_CONNECTED
								? <GitHubConnectInline />
								: <button type='button' className='oca-link' onClick={() => { void cloudAgentService.getPullRequestInfo(session.id); }}>{t('cloudAgents.pr.reload')}</button>}
						</div>
					)}
					<PullRequestSuccessLine session={session} />
				</>
			)}
		</div>
	);
};

/** Transcript card for a pull_request event: "PR #12 を作成しました — <title>" with an open link */
const PullRequestEventCard = ({ data }: { data: CloudPullRequestEventData }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const number = typeof data?.number === 'number' ? data.number : 0;
	const url = typeof data?.url === 'string' ? data.url : '';
	const updated = data?.action === 'updated';
	const color = updated ? C.accent : C.success;
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, padding: '7px 10px', borderRadius: '6px', border: `1px solid ${tint(color, 35)}`, background: tint(color, 7), fontSize: '12px' }}>
			<GitPullRequest size={14} style={{ color, flexShrink: 0 }} />
			<span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
				<span style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
					<span style={{ fontWeight: 600, color: C.fg, flexShrink: 0 }}>{prTemplate(updated ? 'cloudAgents.pr.updated' : 'cloudAgents.pr.created', number, t)}</span>
					{data?.title && <span style={{ color: C.fgFaint, flexShrink: 0 }}>—</span>}
					{data?.title && <span title={data.title} style={{ color: C.fg, minWidth: 0, ...ellipsis }}>{data.title}</span>}
				</span>
				{data?.branch && <span style={{ fontSize: '10.5px', color: C.fgMuted, fontFamily: C.monoFont, ...ellipsis }}>{data.branch}{data.base ? ` → ${data.base}` : ''}</span>}
			</span>
			{/^https:\/\//i.test(url) && (
				<button type='button' className='oca-link' title={url} onClick={() => { void cloudAgentService.openPullRequest(url); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0, fontSize: '11.5px' }}>
					{t('cloudAgents.pr.openOnGitHub')}
					<ExternalLink size={11} />
				</button>
			)}
		</div>
	);
};

// --- Division Project モード (リーダーの計画 → ロールごとのタスク → まとめ) ---

type DivisionTaskState = CloudTaskEventData['status'];

type DivisionInfo = {
	/** plan イベントの seq → タスクの index → 最新の状態 (その計画のあとに来た task イベントから) */
	progressByPlan: Map<number, Map<number, DivisionTaskState>>;
	/** task イベントの seq → 計画の中で何番目か (1 始まり) と、計画のタスク数 */
	positionByTask: Map<number, { pos: number; total: number }>;
	/** ロールの slug → 表示名 (計画・タスクから) */
	roleNames: Map<string, string>;
};

/** イベント列から計画ごとの進み具合を作る。追加の指示のあとは新しい計画になるので、task は直前の plan に属する */
const buildDivisionInfo = (events: CloudSessionEvent[]): DivisionInfo => {
	const info: DivisionInfo = { progressByPlan: new Map(), positionByTask: new Map(), roleNames: new Map() };
	let plan: { seq: number; tasks: CloudPlanTask[] } | null = null;
	for (const ev of events) {
		if (ev.type === 'plan') {
			const tasks = Array.isArray(ev.data?.tasks) ? ev.data.tasks as CloudPlanTask[] : [];
			plan = { seq: ev.seq, tasks };
			info.progressByPlan.set(ev.seq, new Map());
			for (const task of tasks) if (task?.role && task.roleName) info.roleNames.set(task.role, task.roleName);
		} else if (ev.type === 'task') {
			const d = ev.data as CloudTaskEventData | undefined;
			if (!d || typeof d.index !== 'number') continue;
			if (d.role && d.roleName) info.roleNames.set(d.role, d.roleName);
			if (!plan) continue;
			info.progressByPlan.get(plan.seq)?.set(d.index, d.status);
			const pos = plan.tasks.findIndex(task => task?.index === d.index);
			if (pos >= 0) info.positionByTask.set(ev.seq, { pos: pos + 1, total: plan.tasks.length });
		}
	}
	return info;
};

/** 計画の 1 行の状態: ✓ 完了 / ✕ 失敗 / くるくる 作業中 / ○ まだ */
const PlanTaskStatusIcon = ({ state, active }: { state: DivisionTaskState | undefined; active: boolean }) => {
	const { t } = useTranslation();
	const box = (node: React.ReactNode, label: string) => <span title={label} style={{ width: '14px', height: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{node}</span>;
	if (state === 'done') return box(<CheckCircle2 size={13} style={{ color: C.success }} />, t('cloudAgents.task.done'));
	if (state === 'failed') return box(<XCircle size={13} style={{ color: C.error }} />, t('cloudAgents.task.failed'));
	if (state === 'start' && active) return box(<Spinner size={12} color={C.accent} />, t('cloudAgents.task.running'));
	return box(<Circle size={12} style={{ color: C.fgFaint }} />, t('cloudAgents.task.pending'));
};

/** plan イベント: リーダーが立てた計画のチェックリスト */
const PlanCard = ({ data, progress, active }: { data: CloudPlanEventData; progress: Map<number, DivisionTaskState> | undefined; active: boolean }) => {
	const { t } = useTranslation();
	const tasks = (Array.isArray(data?.tasks) ? data.tasks : []).filter(task => task && typeof task === 'object');
	const doneCount = tasks.filter(task => progress?.get(task.index) === 'done').length;
	const leader = typeof data?.leaderModel === 'string' ? data.leaderModel : '';
	return (
		<div style={{ border: `1px solid ${C.border}`, borderRadius: '8px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '2px', background: C.bgSide }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, paddingBottom: '4px' }}>
				<Workflow size={13} style={{ color: C.fgMuted, flexShrink: 0 }} />
				<span style={{ fontSize: '12.5px', fontWeight: 600, color: C.fg, flexShrink: 0 }}>{t('cloudAgents.plan.title')}</span>
				{leader && <span title={leader} style={{ fontSize: '11px', color: C.fgMuted, minWidth: 0, ...ellipsis }}>{t('cloudAgents.plan.leader').replace('{model}', leader)}</span>}
				<span style={{ flex: 1 }} />
				{tasks.length > 0 && (
					<span style={{ fontSize: '11px', color: C.fgMuted, flexShrink: 0, whiteSpace: 'nowrap' }}>
						{t('cloudAgents.plan.progress').replace('{done}', String(doneCount)).replace('{total}', String(tasks.length))}
					</span>
				)}
			</div>
			{tasks.map((task, i) => {
				const state = progress?.get(task.index);
				return (
					<div key={`${task.index}-${i}`} title={task.instruction || task.title} style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, minHeight: '24px', padding: '1px 2px' }}>
						<PlanTaskStatusIcon state={state} active={active} />
						<RoleChip role={task.role} name={task.roleName || task.role} />
						<span style={{
							flex: 1, minWidth: 0, fontSize: '12.5px', ...ellipsis,
							color: state === 'done' ? C.fgMuted : C.fg,
							fontWeight: state === 'start' && active ? 600 : 400,
						}}>
							{task.title}
						</span>
						{task.model && <span title={task.model} style={{ fontSize: '11px', color: C.fgMuted, flex: '0 1 auto', maxWidth: '40%', ...ellipsis }}>{task.model}</span>}
					</div>
				);
			})}
		</div>
	);
};

/** task イベント: start は区切りの見出し (「2/4 · 実装 (Claude Opus) — タイトル」)、done / failed は結果の短い行 */
const TaskEventRow = ({ data, position }: { data: CloudTaskEventData; position: { pos: number; total: number } | undefined }) => {
	const { t } = useTranslation();
	const roleName = data?.roleName || data?.role || '';
	if (data?.status === 'start') {
		return (
			<div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, marginTop: '10px', padding: '0 2px', fontSize: '12px' }}>
				{position && <span style={{ color: C.fgMuted, fontFamily: C.monoFont, fontSize: '11px', flexShrink: 0 }}>{position.pos}/{position.total}</span>}
				{position && <span style={{ color: C.fgFaint, flexShrink: 0 }}>·</span>}
				<RoleChip role={data.role} name={roleName} />
				{data.model && <span title={data.model} style={{ color: C.fgMuted, fontSize: '11px', flex: '0 2 auto', minWidth: '30px', ...ellipsis }}>({data.model})</span>}
				{data.title && <span style={{ color: C.fgFaint, flexShrink: 0 }}>—</span>}
				{data.title && <span title={data.title} style={{ color: C.fg, fontWeight: 600, flex: '0 1 auto', minWidth: '40px', ...ellipsis }}>{data.title}</span>}
				<span style={{ flex: 1, minWidth: '16px', height: '1px', background: C.border }} />
			</div>
		);
	}
	const failed = data?.status === 'failed';
	const summary = typeof data?.summary === 'string' ? data.summary.trim() : '';
	return (
		<div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', minWidth: 0, padding: '2px 6px', fontSize: '12px' }}>
			<span style={{ display: 'inline-flex', marginTop: '2px', flexShrink: 0 }}>
				{failed ? <XCircle size={13} style={{ color: C.error }} /> : <CheckCircle2 size={13} style={{ color: C.success }} />}
			</span>
			<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
				<span style={{ color: failed ? C.error : C.fgMuted, fontSize: '11.5px' }}>
					{(failed ? t('cloudAgents.task.failedLine') : t('cloudAgents.task.doneLine')).replace('{role}', roleName)}
				</span>
				{summary ? (
					<div className='oca-md' style={{ fontSize: '12px', lineHeight: 1.55, color: C.fg }}>
						<ChatMarkdownRender string={summary} chatMessageLocation={undefined} isApplyEnabled={false} isLinkDetectionEnabled={false} />
					</div>
				) : failed ? (
					<span style={{ color: C.fgMuted, fontSize: '11.5px' }}>{t('cloudAgents.task.failedNoSummary')}</span>
				) : null}
			</div>
		</div>
	);
};

const EventView = ({ event, onReview, division, active }: {
	event: CloudSessionEvent;
	onReview: () => void;
	/** Division Project モードの計画とタスクの進み具合 (plan / task / role 付きの発言の表示に使う) */
	division?: DivisionInfo;
	/** セッションが動いている (計画の「作業中」をくるくるにする) */
	active?: boolean;
}) => {
	const { t } = useTranslation();
	const data = event.data ?? {};
	switch (event.type) {
		case 'user':
			return (
				<div style={{
					padding: '8px 12px', borderRadius: '8px',
					background: C.bgInput, color: C.fgInput, border: `1px solid ${C.borderInput}`,
					fontSize: '13px', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
				}}>
					{String(data.text ?? '')}
				</div>
			);
		case 'assistant': {
			const text = typeof data.text === 'string' ? data.text.trim() : '';
			if (!text) return null;
			// Division Project モードでは、どのロールの発言かを小さなチップで横に出す
			const role = typeof data.role === 'string' ? data.role : '';
			return (
				<div className='oca-md' style={{ fontSize: '13px', lineHeight: 1.65, color: C.fg, padding: '0 2px' }}>
					{role && (
						<span style={{ float: 'left', margin: '2px 7px 0 0', display: 'inline-flex' }}>
							<RoleChip role={role} name={division?.roleNames.get(role) || role} />
						</span>
					)}
					<ChatMarkdownRender string={text} chatMessageLocation={undefined} isApplyEnabled={false} isLinkDetectionEnabled={false} />
					{role && <div style={{ clear: 'both' }} />}
				</div>
			);
		}
		case 'plan':
			return <PlanCard data={data as CloudPlanEventData} progress={division?.progressByPlan.get(event.seq)} active={!!active} />;
		case 'task':
			return <TaskEventRow data={data as CloudTaskEventData} position={division?.positionByTask.get(event.seq)} />;
		case 'tool':
			return <ToolRow data={data} />;
		case 'status': {
			const status = data.status as CloudSessionStatus | undefined;
			const text = `${status ? t('cloudAgents.transcript.status').replace('{status}', t(statusKey(status))) : ''}${data.message ? `${status ? ' — ' : ''}${data.message}` : ''}`;
			if (!text) return null;
			return (
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: C.fgMuted, padding: '0 6px' }}>
					<span style={{ width: '5px', height: '5px', borderRadius: '50%', background: status ? statusColor[status] : C.fgMuted, flexShrink: 0 }} />
					<span style={{ minWidth: 0, ...ellipsis }} title={text}>{text}</span>
				</div>
			);
		}
		case 'error':
			return (
				<div style={{
					display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '12px', color: C.error,
					whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '6px 10px', borderRadius: '6px',
					background: tint(C.error, 8), border: `1px solid ${tint(C.error, 30)}`,
				}}>
					<AlertTriangle size={13} style={{ marginTop: '2px', flexShrink: 0 }} />
					<span style={{ color: C.fg }}>{String(data.message ?? '')}</span>
				</div>
			);
		case 'done':
			return <CompletionCard data={data} onReview={onReview} />;
		case 'pull_request':
			return <PullRequestEventCard data={data as CloudPullRequestEventData} />;
		default:
			return null;
	}
};

type StreamItem =
	| { kind: 'event'; key: string; event: CloudSessionEvent }
	| { kind: 'tools'; key: string; events: CloudSessionEvent[] };

/**
 * done イベント自体には変更ファイル数が無い (サーバーは直後の status: idle イベントとセッションに載せる)。
 * 直後の status イベントから補い、まだ届いていない最新のものはセッションの値を使う。
 */
const withChangedFiles = (events: CloudSessionEvent[], sessionChangedFiles: number): CloudSessionEvent[] => {
	const lastDoneIdx = events.map(e => e.type).lastIndexOf('done');
	return events.map((ev, i) => {
		if (ev.type !== 'done' || typeof ev.data?.changedFiles === 'number') return ev;
		let changedFiles: number | undefined;
		for (let j = i + 1; j < events.length; j++) {
			if (events[j].type === 'user') break;
			if (events[j].type === 'status' && typeof events[j].data?.changedFiles === 'number') { changedFiles = events[j].data.changedFiles; break; }
		}
		if (changedFiles === undefined && i === lastDoneIdx) changedFiles = sessionChangedFiles;
		return changedFiles === undefined ? ev : { ...ev, data: { ...ev.data, changedFiles } };
	});
};

/** イベント列 → 表示する行。続けて実行された調べもの (読み込み・一覧・検索) は 1 行にまとめる */
const buildStreamItems = (events: CloudSessionEvent[]): StreamItem[] => {
	const items: StreamItem[] = [];
	let group: CloudSessionEvent[] = [];
	const flush = () => {
		if (group.length === 1) items.push({ kind: 'event', key: `e${group[0].seq}`, event: group[0] });
		else if (group.length > 1) items.push({ kind: 'tools', key: `g${group[0].seq}`, events: group });
		group = [];
	};
	for (const ev of events) {
		// 本文のない発言 (ツール呼び出しだけ) は表示しない。直後の tool イベントが同じ内容を出す
		if (ev.type === 'assistant' && !(typeof ev.data?.text === 'string' && ev.data.text.trim())) continue;
		if (ev.type === 'tool' && isExploreKind(toolKindOf(String(ev.data?.name ?? '')))) {
			group.push(ev);
			continue;
		}
		flush();
		items.push({ kind: 'event', key: `e${ev.seq}`, event: ev });
	}
	flush();
	return items;
};

const Stream = ({ session, events, onReview, footer }: {
	session: CloudSession;
	events: CloudSessionEvent[] | undefined;
	onReview: () => void;
	/** Shown after the last event (the pull request card) */
	footer?: React.ReactNode;
}) => {
	const { t } = useTranslation();
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const stickToBottom = useRef(true);
	const [atBottom, setAtBottom] = useState(true);
	const items = useMemo(() => buildStreamItems(withChangedFiles(events ?? [], session.changedFiles)), [events, session.changedFiles]);
	const division = useMemo(() => buildDivisionInfo(events ?? []), [events]);
	const lastSeq = events?.length ? events[events.length - 1].seq : -1;

	const scrollToBottom = useCallback(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
		stickToBottom.current = true;
		setAtBottom(true);
	}, []);

	// セッションを切り替えたら一番下から
	useLayoutEffect(() => { scrollToBottom(); }, [session.id, scrollToBottom]);
	// 一番下を見ているときだけ、新しいイベントで自動スクロールする (上にスクロールして読んでいるときは動かさない)
	useLayoutEffect(() => {
		if (stickToBottom.current) {
			const el = scrollRef.current;
			if (el) el.scrollTop = el.scrollHeight;
		}
	}, [lastSeq, items.length, session.status]);

	const active = isCloudSessionActive(session.status);

	return (
		<div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
			<div
				ref={scrollRef}
				onScroll={e => {
					const el = e.currentTarget;
					const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
					stickToBottom.current = bottom;
					if (bottom !== atBottom) setAtBottom(bottom);
				}}
				style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
			>
				<div style={{ maxWidth: '860px', margin: '0 auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
					{events === undefined ? (
						<div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.fgMuted }}><Spinner /> {t('cloudAgents.transcript.loading')}</div>
					) : events.length === 0 ? (
						<>
							{/* イベントが来る前でも、最初の指示は見せておく */}
							<EventView event={{ seq: -1, type: 'user', data: { text: session.prompt }, createdAt: session.createdAt }} onReview={onReview} />
							{!active && <div style={{ fontSize: '12px', color: C.fgMuted }}>{t('cloudAgents.transcript.empty')}</div>}
						</>
					) : items.map(item => item.kind === 'tools'
						? <ToolGroupRow key={item.key} events={item.events} />
						: <EventView key={item.key} event={item.event} onReview={onReview} division={division} active={active} />)}
					{events !== undefined && footer}
					{active && (
						<div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: C.fgMuted, padding: '2px 6px' }}>
							<Spinner color={statusColor[session.status]} />
							{session.status === 'running' ? t('cloudAgents.transcript.working') : t('cloudAgents.conversation.preparing')}
						</div>
					)}
					{session.status === 'failed' && session.errorMsg && !events?.some(e => e.type === 'error') && (
						<div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: C.error, padding: '0 6px' }}>
							<AlertTriangle size={13} style={{ marginTop: '2px', flexShrink: 0 }} />
							<span style={{ whiteSpace: 'pre-wrap' }}>{session.errorMsg}</span>
						</div>
					)}
				</div>
			</div>
			{!atBottom && (
				<button
					type='button'
					onClick={scrollToBottom}
					style={{
						position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
						display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '12px',
						border: `1px solid ${C.border}`, background: C.bgWidget, color: C.fg, fontSize: '11px', fontFamily: 'inherit',
						cursor: 'pointer', boxShadow: `0 2px 8px ${C.shadow}`,
					}}
				>
					<ArrowDown size={11} />
					{t('cloudAgents.conversation.jumpToLatest')}
				</button>
			)}
		</div>
	);
};

/** 会話の下の入力欄 (追加の指示)。実行中は ■ で止められる */
const FollowUpComposer = ({ session, value, setValue }: { session: CloudSession; value: string; setValue: (v: string) => void }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	const sending = !!state.sendingById[session.id];
	const active = isCloudSessionActive(session.status);
	const canSend = state.isLoggedIn && !sending && !!value.trim();
	const projectLabelOf = useProjectLabel();
	const modelLabel = sessionModelLabel(session, projectLabelOf(session.projectId), t('cloudAgents.detail.modelDefault'));

	const send = async () => {
		if (!canSend) return;
		const ok = await cloudAgentService.sendMessage(session.id, value);
		if (ok) setValue('');
	};

	return (
		<ComposerBox
			value={value}
			onChange={setValue}
			onSubmit={() => { void send(); }}
			disabled={!state.isLoggedIn}
			placeholder={state.isLoggedIn ? t('cloudAgents.followup.placeholder') : t('cloudAgents.followup.loginRequired')}
			toolbar={
				<span title={modelLabel} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: C.fgMuted, padding: '0 6px', minWidth: 0 }}>
					<ModelIcon division={isDivisionProjectSession(session)} size={11} />
					<span style={ellipsis}>{modelLabel}</span>
				</span>
			}
			actions={
				<>
					{active && <StopButton title={t('cloudAgents.composer.stop')} onClick={() => { void cloudAgentService.stop(session.id); }} />}
					{(!active || value.trim()) && <SendButton disabled={!canSend} busy={sending} title={t('cloudAgents.followup.send')} onClick={() => { void send(); }} />}
				</>
			}
			hintLeft={t('cloudAgents.composer.hintSend')}
			hintRight={!active && state.isLoggedIn ? t('cloudAgents.followup.restartHint') : undefined}
		/>
	);
};

const Conversation = ({ session, leftSlot, reviewOpen, onToggleReview, onReview, draft, setDraft }: {
	session: CloudSession;
	leftSlot?: React.ReactNode;
	reviewOpen: boolean;
	onToggleReview: () => void;
	onReview: () => void;
	draft: string;
	setDraft: (v: string) => void;
}) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	const active = isCloudSessionActive(session.status);
	const changes = state.changesById[session.id];
	const changedCount = changes?.changes?.length ?? session.changedFiles;
	const projectLabel = useProjectLabel();

	// Pull request form: open for at most one session at a time (kept while switching away and back)
	const [prFormFor, setPrFormFor] = useState<string | null>(null);
	const prFormOpen = prFormFor === session.id;
	const openPrForm = useCallback(() => setPrFormFor(session.id), [session.id]);
	const closePrForm = useCallback(() => setPrFormFor(null), []);
	const prEligible = isPullRequestEligible(session);
	// Ask the server whether a PR can be created whenever the session becomes eligible / is opened, and again
	// after GitHub gets connected (canCreate depends on it)
	const githubConnected = state.github.connected;
	useEffect(() => {
		if (!prEligible) return;
		// The GitHub status decides whether the card offers "GitHub と連携" next to the server's reason
		if (!cloudAgentService.state.github.loaded) void cloudAgentService.refreshGitHubStatus();
		if (cloudAgentService.state.pullRequestById[session.id]?.loading) return;
		void cloudAgentService.getPullRequestInfo(session.id);
	}, [prEligible, session.id, githubConnected, cloudAgentService]);
	useEffect(() => {
		if (!prEligible && prFormOpen) setPrFormFor(null);
	}, [prEligible, prFormOpen]);

	return (
		<div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px 0 14px', height: '44px', flexShrink: 0, borderBottom: `1px solid ${C.border}`, minWidth: 0 }}>
				{leftSlot}
				<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1px' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
						<span title={session.prompt} style={{ fontSize: '13px', fontWeight: 600, color: C.fg, minWidth: 0, ...ellipsis }}>{sessionTitle(session)}</span>
						<StatusPill status={session.status} />
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: C.fgMuted, minWidth: 0 }}>
						<span title={t('cloudAgents.detail.model')} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0, flexShrink: 1 }}>
							<ModelIcon division={isDivisionProjectSession(session)} size={10} />
							<span style={ellipsis}>{sessionModelLabel(session, projectLabel(session.projectId), t('cloudAgents.detail.modelDefault'))}</span>
						</span>
						{/* Division Project のときはモデル名 (Division Project · <名前>) にプロジェクトが入っている */}
						{!isDivisionProjectSession(session) && <ProjectTag label={projectLabel(session.projectId)} />}
						<span style={{ display: 'flex', minWidth: 0, flexShrink: 1 }}><SessionSource session={session} size={10} /></span>
						<CostTag costUsd={session.costUsd} withIcon />
						{session.workspaceInfo && session.workspaceInfo.skipped > 0 && !sessionRepoLabel(session) && (
							<span title={t('cloudAgents.detail.skipped').replace('{count}', String(session.workspaceInfo.skipped))} style={{ display: 'inline-flex', color: C.warning, flexShrink: 0 }}>
								<AlertTriangle size={10} />
							</span>
						)}
					</div>
				</div>
				{active && (
					<button type='button' className='oca-iconbtn' title={t('cloudAgents.detail.stop')} onClick={() => { void cloudAgentService.stop(session.id); }} style={{ padding: '4px 8px', fontSize: '11.5px', color: C.error, flexShrink: 0 }}>
						<Square size={11} />
						{t('cloudAgents.detail.stop')}
					</button>
				)}
				<PullRequestHeaderActions session={session} onOpenForm={openPrForm} />
				<button type='button' className='oca-iconbtn' title={t('cloudAgents.detail.archive')} aria-label={t('cloudAgents.detail.archive')} onClick={() => { void cloudAgentService.archive(session.id); }} style={{ width: '28px', height: '28px', flexShrink: 0 }}>
					<Archive size={14} />
				</button>
				<button
					type='button'
					className='oca-iconbtn'
					data-active={reviewOpen}
					title={t('cloudAgents.header.toggleReview')}
					aria-label={t('cloudAgents.header.toggleReview')}
					aria-pressed={reviewOpen}
					onClick={onToggleReview}
					style={{ height: '28px', padding: '0 7px', flexShrink: 0, fontSize: '11px' }}
				>
					<PanelRight size={14} />
					{changedCount > 0 && <span style={{ fontFamily: C.monoFont }}>{changedCount}</span>}
				</button>
			</div>
			<Stream
				session={session}
				events={state.eventsById[session.id]}
				onReview={onReview}
				footer={prEligible ? <PullRequestSection session={session} formOpen={prFormOpen} onOpenForm={openPrForm} onCloseForm={closePrForm} /> : undefined}
			/>
			<FollowUpComposer session={session} value={draft} setValue={setDraft} />
		</div>
	);
};


// ---------------------------------------------------------------------------
// 右: 変更 (ファイル一覧と差分)
// ---------------------------------------------------------------------------

/** 1 ファイルの差分で表示する行数の上限 (巨大な差分で固まらないように) */
const MAX_DIFF_LINES = 4000;

/** git diff の出力をファイルごとに分ける (キーは新しいほうのパス) */
const splitPatch = (patch: string): Map<string, string[]> => {
	const map = new Map<string, string[]>();
	let current: string[] | null = null;
	for (const line of patch.split('\n')) {
		if (line.startsWith('diff --git ')) {
			current = [];
			const i = line.lastIndexOf(' b/');
			const path = i >= 0 ? line.slice(i + 3).replace(/^"|"$/g, '') : '';
			if (path) map.set(path, current);
			continue;
		}
		current?.push(line);
	}
	return map;
};

type DiffLine = { type: 'add' | 'del' | 'ctx' | 'hunk' | 'meta'; text: string; oldNo?: number; newNo?: number };

const parseDiffLines = (lines: string[]): DiffLine[] => {
	const out: DiffLine[] = [];
	let oldNo = 0, newNo = 0, inHunk = false;
	for (const line of lines) {
		if (line.startsWith('@@')) {
			const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
			if (m) { oldNo = Number(m[1]); newNo = Number(m[2]); }
			inHunk = true;
			out.push({ type: 'hunk', text: line });
			continue;
		}
		if (!inHunk) {
			// ヘッダー (index / --- / +++ / new file mode …) は「Binary files … differ」だけ見せる
			if (/^Binary files /.test(line)) out.push({ type: 'meta', text: line });
			continue;
		}
		if (line.startsWith('+')) out.push({ type: 'add', text: line.slice(1), newNo: newNo++ });
		else if (line.startsWith('-')) out.push({ type: 'del', text: line.slice(1), oldNo: oldNo++ });
		else if (line.startsWith('\\')) out.push({ type: 'meta', text: line });
		else if (line === '') continue;
		else out.push({ type: 'ctx', text: line.slice(1), oldNo: oldNo++, newNo: newNo++ });
	}
	return out;
};

const DiffView = ({ lines }: { lines: string[] | undefined }) => {
	const { t } = useTranslation();
	const parsed = useMemo(() => parseDiffLines(lines ?? []), [lines]);
	if (!parsed.length) {
		return <div style={{ padding: '14px', fontSize: '12px', color: C.fgMuted, lineHeight: 1.5 }}>{t('cloudAgents.review.noDiff')}</div>;
	}
	const shown = parsed.length > MAX_DIFF_LINES ? parsed.slice(0, MAX_DIFF_LINES) : parsed;
	const gutter: React.CSSProperties = { display: 'inline-block', width: '34px', textAlign: 'right', paddingRight: '6px', color: C.fgMuted, opacity: 0.6, userSelect: 'none', flexShrink: 0 };
	return (
		<div style={{ fontFamily: C.monoFont, fontSize: '11.5px', lineHeight: '18px', minWidth: 'max-content', paddingBottom: '8px' }}>
			{shown.map((l, i) => (
				<div
					key={i}
					style={{
						display: 'flex', whiteSpace: 'pre', paddingRight: '12px',
						background: l.type === 'add' ? C.addedBg : l.type === 'del' ? C.deletedBg : l.type === 'hunk' ? C.codeBg : 'transparent',
						color: l.type === 'hunk' || l.type === 'meta' ? C.fgMuted : C.fg,
					}}
				>
					{l.type === 'hunk' || l.type === 'meta' ? (
						<span style={{ paddingLeft: '10px' }}>{l.text}</span>
					) : (
						<>
							<span style={gutter}>{l.oldNo ?? ''}</span>
							<span style={gutter}>{l.newNo ?? ''}</span>
							<span style={{ width: '14px', flexShrink: 0, color: l.type === 'add' ? C.added : l.type === 'del' ? C.deleted : C.fgMuted, userSelect: 'none' }}>{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}</span>
							<span>{l.text}</span>
						</>
					)}
				</div>
			))}
			{parsed.length > MAX_DIFF_LINES && (
				<div style={{ padding: '6px 10px', color: C.warning, fontFamily: 'inherit' }}>{t('cloudAgents.review.diffTruncated').replace('{n}', String(MAX_DIFF_LINES))}</div>
			)}
		</div>
	);
};

const ReviewPanel = ({ session, onClose, style }: { session: CloudSession; onClose: () => void; style?: React.CSSProperties }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	const changes = state.changesById[session.id];
	const [selectedPath, setSelectedPath] = useState<string | null>(null);

	useEffect(() => {
		if (!changes || (!changes.changes && !changes.loading && !changes.error)) void cloudAgentService.loadChanges(session.id);
		setSelectedPath(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session.id]);

	const list = changes?.changes ?? [];
	const fileDiffs = useMemo(() => splitPatch(changes?.patch ?? ''), [changes?.patch]);
	// 選んでいるファイルが一覧から消えたら (または未選択なら) 先頭を選ぶ
	const currentPath = selectedPath && list.some(c => c.path === selectedPath) ? selectedPath : (list[0]?.path ?? null);
	const current = list.find(c => c.path === currentPath);
	const { additions, deletions } = sumChanges(list);
	const conflicts = new Set(changes?.lastApply?.conflicts ?? []);
	const failed = new Map((changes?.lastApply?.failed ?? []).map(f => [f.path, f.error] as const));
	const noFolder = !state.workspaceName;
	const applying = !!changes?.applying;
	const applyDisabled = applying || noFolder || list.length === 0;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: C.bgSide, borderLeft: `1px solid ${C.border}`, ...style }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px 0 14px', height: '44px', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
				<span style={{ fontSize: '13px', fontWeight: 600, color: C.fg }}>{t('cloudAgents.review.title')}</span>
				{list.length > 0 && (
					<span style={{ fontSize: '11px', color: C.fgMuted, display: 'inline-flex', gap: '6px', fontFamily: C.monoFont }}>
						<span>{list.length}</span>
						<span style={{ color: C.added }}>+{additions}</span>
						<span style={{ color: C.deleted }}>−{deletions}</span>
					</span>
				)}
				<span style={{ flex: 1 }} />
				<button type='button' className='oca-iconbtn' title={changes?.changes ? t('cloudAgents.changes.reload') : t('cloudAgents.changes.load')} aria-label={t('cloudAgents.changes.reload')} onClick={() => { void cloudAgentService.loadChanges(session.id); }} style={{ width: '26px', height: '26px' }}>
					{changes?.loading ? <Spinner size={12} /> : <RefreshCw size={12} />}
				</button>
				<button type='button' className='oca-iconbtn' title={t('cloudAgents.review.close')} aria-label={t('cloudAgents.review.close')} onClick={onClose} style={{ width: '26px', height: '26px' }}>
					<X size={14} />
				</button>
			</div>

			<div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
				<button
					type='button'
					disabled={applyDisabled}
					title={noFolder ? t('cloudAgents.changes.noFolder') : undefined}
					onClick={() => { void cloudAgentService.applyChanges(session.id); }}
					style={{ ...buttonStyle('primary', applyDisabled), justifyContent: 'center', padding: '6px 10px' }}
				>
					{applying ? <Spinner /> : <Download size={12} />}
					{applying ? t('cloudAgents.changes.applying') : t('cloudAgents.review.applyAll')}
				</button>
				<div style={{ fontSize: '11px', lineHeight: 1.45, color: noFolder ? C.warning : C.fgMuted }}>
					{noFolder ? t('cloudAgents.changes.noFolder') : t('cloudAgents.changes.applyHint')}
				</div>
				{changes?.lastApply && (
					<div style={{ fontSize: '11px', color: C.fgMuted }}>
						{t('cloudAgents.changes.lastApply')
							.replace('{applied}', String(changes.lastApply.applied.length))
							.replace('{deleted}', String(changes.lastApply.deleted.length))
							.replace('{unchanged}', String(changes.lastApply.unchanged.length))
							.replace('{failed}', String(changes.lastApply.failed.length))}
					</div>
				)}
				{conflicts.size > 0 && (
					<div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: C.warning }}>
						<AlertTriangle size={12} style={{ marginTop: '1px', flexShrink: 0 }} />
						<span>{t('cloudAgents.changes.conflict')}: {[...conflicts].join(', ')}</span>
					</div>
				)}
				{changes?.changesTruncated && <div style={{ fontSize: '11px', color: C.warning }}>{t('cloudAgents.review.changesTruncated')}</div>}
				{changes?.patchTruncated && <div style={{ fontSize: '11px', color: C.warning }}>{t('cloudAgents.changes.patchTruncated')}</div>}
				{changes?.error && <div style={{ fontSize: '11.5px', color: C.error, whiteSpace: 'pre-wrap' }}>{changes.error}</div>}
			</div>

			{changes?.loading && !changes.changes ? (
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '14px', fontSize: '12px', color: C.fgMuted }}><Spinner /> {t('cloudAgents.changes.loading')}</div>
			) : list.length === 0 ? (
				changes?.changes ? (
					<div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '24px', color: C.fgMuted, textAlign: 'center' }}>
						<FileText size={24} style={{ opacity: 0.6 }} />
						<span style={{ fontSize: '12px' }}>{t('cloudAgents.changes.none')}</span>
					</div>
				) : null
			) : (
				<>
					<div style={{ maxHeight: '40%', overflowY: 'auto', borderBottom: `1px solid ${C.border}`, padding: '4px 0', flexShrink: 0 }}>
						{list.map(c => {
							const color = changeStatusColor[c.status] ?? C.fgFaint;
							const conflict = conflicts.has(c.path);
							const error = failed.get(c.path);
							const dir = dirname(c.path);
							return (
								<div
									key={c.path}
									role='button'
									tabIndex={0}
									className='oca-row'
									data-selected={c.path === currentPath}
									onClick={() => setSelectedPath(c.path)}
									onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPath(c.path); } }}
									title={c.oldPath ? `${c.oldPath} → ${c.path}` : c.path}
									style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '3px 10px 3px 12px', fontSize: '12px', minWidth: 0 }}
								>
									<span title={t(changeStatusKey(c.status))} style={{ width: '12px', flexShrink: 0, fontFamily: C.monoFont, fontWeight: 700, fontSize: '11px', color }}>{changeStatusLetter[c.status]}</span>
									<span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '6px' }}>
										<span style={{ ...ellipsis, textDecoration: c.status === 'deleted' ? 'line-through' : undefined }}>{basename(c.path)}</span>
										{dir && <span style={{ fontSize: '10.5px', color: C.fgMuted, ...ellipsis }}>{dir}</span>}
									</span>
									{conflict && <span title={t('cloudAgents.changes.conflict')} style={{ display: 'inline-flex', color: C.warning, flexShrink: 0 }}><AlertTriangle size={12} /></span>}
									{error && <span title={error} style={{ display: 'inline-flex', color: C.error, flexShrink: 0 }}><XCircle size={12} /></span>}
									<span className='oca-row-hide-on-hover' style={{ fontSize: '10.5px', fontFamily: C.monoFont, flexShrink: 0 }}>
										{c.binary || c.additions < 0
											? <span style={{ color: C.fgMuted }}>{t('cloudAgents.changes.binary')}</span>
											: <><span style={{ color: C.added }}>+{c.additions}</span> <span style={{ color: C.deleted }}>−{c.deletions}</span></>}
									</span>
									<span className='oca-row-actions' style={{ flexShrink: 0 }}>
										<button
											type='button'
											className='oca-iconbtn'
											disabled={applying || noFolder}
											title={t('cloudAgents.review.applyOne')}
											onClick={e => { e.stopPropagation(); void cloudAgentService.applyChanges(session.id, [c.path]); }}
											style={{ padding: '1px 6px', fontSize: '11px' }}
										>
											<Download size={11} />
											{t('cloudAgents.review.applyOne')}
										</button>
									</span>
								</div>
							);
						})}
					</div>
					{current && (
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px 6px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, minWidth: 0 }}>
							<span title={current.path} style={{ flex: 1, minWidth: 0, fontFamily: C.monoFont, fontSize: '11.5px', color: C.fg, ...ellipsis }}>
								{current.oldPath ? `${current.oldPath} → ${current.path}` : current.path}
							</span>
							<button
								type='button'
								disabled={applying || noFolder}
								onClick={() => { void cloudAgentService.applyChanges(session.id, [current.path]); }}
								style={{ ...buttonStyle('secondary', applying || noFolder), padding: '2px 8px', fontWeight: 500 }}
							>
								<Download size={11} />
								{t('cloudAgents.review.applyOne')}
							</button>
						</div>
					)}
					<div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: C.bg }}>
						{current
							? (current.binary ? <div style={{ padding: '14px', fontSize: '12px', color: C.fgMuted }}>{t('cloudAgents.changes.binary')}</div> : <DiffView lines={fileDiffs.get(current.path)} />)
							: <div style={{ padding: '14px', fontSize: '12px', color: C.fgMuted }}>{t('cloudAgents.review.selectFile')}</div>}
					</div>
				</>
			)}
		</div>
	);
};


// ---------------------------------------------------------------------------
// ログイン前・エラー
// ---------------------------------------------------------------------------

/** Orchestra の設定画面 (ログインボタンがある)。voidSettingsPane.ts の VOID_OPEN_SETTINGS_ACTION_ID と同じ */
const VOID_OPEN_SETTINGS_COMMAND_ID = 'workbench.action.openVoidSettings';

const LoginPrompt = () => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const commandService = accessor.get('ICommandService');
	// クラウドエージェントモードではチャット (ログイン画面がある) を隠しているので、設定画面のログインへ
	const uiMode = useOrchestraUiMode();
	return (
		<div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
			<div style={{ maxWidth: '460px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
				<Cloud size={36} style={{ color: C.fgMuted }} />
				<div style={{ fontSize: '16px', fontWeight: 600, color: C.fg }}>{t('cloudAgents.login.title')}</div>
				<div style={{ fontSize: '13px', lineHeight: 1.6, color: C.fgMuted }}>{t('cloudAgents.login.hint')}</div>
				<button type='button' onClick={() => { void commandService.executeCommand(uiMode === 'cloud' ? VOID_OPEN_SETTINGS_COMMAND_ID : 'orchestra.chat.logIn'); }} style={buttonStyle('primary')}>
					<LogIn size={12} />
					{t('cloudAgents.login.button')}
				</button>
				{/* カンバンなどはログインしなくても使える */}
				<div style={{ marginTop: '12px' }}><WorkspaceNav compact /></div>
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
			display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0,
			padding: '8px 14px', fontSize: '12px', color: C.error,
			background: tint(C.error, 8),
			borderBottom: `1px solid ${tint(C.error, 30)}`,
		}}>
			<AlertTriangle size={13} style={{ marginTop: '2px', flexShrink: 0 }} />
			<span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap', color: C.fg }}>{state.lastError}</span>
			<button type='button' className='oca-iconbtn' title={t('cloudAgents.error.dismiss')} aria-label={t('cloudAgents.error.dismiss')} onClick={() => cloudAgentService.dismissError()} style={{ width: '20px', height: '20px' }}>
				<X size={12} />
			</button>
		</div>
	);
};


// ---------------------------------------------------------------------------
// ルート
// ---------------------------------------------------------------------------

/** これより狭いと、右の変更パネルを最初は閉じ、開いたときは重ねて出す */
const NARROW_WIDTH = 1000;
/** これより狭いと、左の一覧も畳む */
const COMPACT_WIDTH = 700;
const SIDEBAR_WIDTH = 260;
const REVIEW_WIDTH = 360;

const CloudAgentsPanelInner = ({ width }: { width: number }) => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	const selected = useMemo(() => state.sessions.find(s => s.id === state.selectedId) ?? null, [state.sessions, state.selectedId]);

	const narrow = width > 0 && width < NARROW_WIDTH;
	const compact = width > 0 && width < COMPACT_WIDTH;

	const [reviewOpen, setReviewOpen] = useState(true);
	const [listOpen, setListOpen] = useState(false);
	// 幅のしきい値をまたいだときだけ、右パネルの既定 (広ければ開く / 狭ければ閉じる) に戻す
	const prevNarrow = useRef(narrow);
	useEffect(() => {
		if (prevNarrow.current !== narrow) {
			prevNarrow.current = narrow;
			setReviewOpen(!narrow);
		}
	}, [narrow]);
	useEffect(() => { if (!compact) setListOpen(false); }, [compact]);

	// 下書き: 新しいエージェントの入力欄と、エージェントごとの追加の指示 (切り替えても消えないように)
	const [draft, setDraftState] = useState<NewAgentDraft>(() => ({
		prompt: '',
		count: 1,
		// フォルダを開いていればそれを送るのが既定。開いていなければ、前回 GitHub のリポジトリを選んでいたらそれ
		source: state.workspaceName ? 'workspace' : state.githubPick ? 'github' : 'empty',
		repoUrl: '',
		urlBranch: '',
		title: '',
		projectId: null,
	}));
	const setDraft = useCallback((patch: Partial<NewAgentDraft>) => setDraftState(prev => ({ ...prev, ...patch })), []);
	const [followDrafts, setFollowDrafts] = useState<Record<string, string>>({});

	// 実行中 → 終わった を見て、変更を読み直す。選んでいるエージェントが変更付きで終わったら右パネルを開く
	const prevStatuses = useRef<Record<string, CloudSessionStatus>>({});
	useEffect(() => {
		const next: Record<string, CloudSessionStatus> = {};
		for (const s of state.sessions) {
			const prev = prevStatuses.current[s.id];
			next[s.id] = s.status;
			if (!prev || !isCloudSessionActive(prev) || isCloudSessionActive(s.status)) continue;
			if (s.id === state.selectedId && s.status === 'idle' && s.changedFiles > 0) {
				setReviewOpen(true);
				void cloudAgentService.loadChanges(s.id);
			} else if (state.changesById[s.id]?.changes) {
				void cloudAgentService.loadChanges(s.id);
			}
		}
		prevStatuses.current = next;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state.sessions]);

	const newAgent = useCallback(() => {
		cloudAgentService.select(null);
		cloudAgentService.requestFocusForm();
		setListOpen(false);
	}, [cloudAgentService]);

	const selectSession = useCallback((id: string) => {
		cloudAgentService.select(id);
		setListOpen(false);
	}, [cloudAgentService]);

	const openReview = useCallback(() => {
		setReviewOpen(true);
		if (selected) void cloudAgentService.loadChanges(selected.id);
	}, [cloudAgentService, selected]);

	if (!state.isLoggedIn) {
		return <LoginPrompt />;
	}

	const listToggle = compact ? (
		<button type='button' className='oca-iconbtn' data-active={listOpen} title={t('cloudAgents.header.showList')} aria-label={t('cloudAgents.header.showList')} onClick={() => setListOpen(v => !v)} style={{ width: '28px', height: '28px', flexShrink: 0 }}>
			<PanelLeft size={14} />
		</button>
	) : undefined;

	const overlayStyle: React.CSSProperties = { position: 'absolute', top: 0, bottom: 0, zIndex: 25, boxShadow: `0 0 24px ${C.shadow}` };

	return (
		<div
			style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
			onKeyDown={e => {
				// Ctrl / Cmd+N: 新しいエージェント (パネルにフォーカスがあるときだけ。VS Code の「新しいファイル」より先に拾う)
				if (isModKey(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') {
					e.preventDefault();
					e.stopPropagation();
					newAgent();
				}
			}}
		>
			<ErrorBanner />
			<div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
				{!compact && <AgentSidebar width={SIDEBAR_WIDTH} onNew={newAgent} onSelect={selectSession} />}
				{compact && listOpen && (
					<>
						<div onClick={() => setListOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 24, background: tint('var(--void-bg-3)', 60) }} />
						<AgentSidebar width={`min(${SIDEBAR_WIDTH}px, 85%)`} onNew={newAgent} onSelect={selectSession} style={{ ...overlayStyle, left: 0 }} />
					</>
				)}

				{selected ? (
					<Conversation
						session={selected}
						leftSlot={listToggle}
						reviewOpen={reviewOpen}
						onToggleReview={() => setReviewOpen(v => !v)}
						onReview={openReview}
						draft={followDrafts[selected.id] ?? ''}
						setDraft={v => setFollowDrafts(prev => ({ ...prev, [selected.id]: v }))}
					/>
				) : (
					<NewAgentView leftSlot={listToggle} draft={draft} setDraft={setDraft} />
				)}

				{selected && reviewOpen && (narrow
					? <ReviewPanel session={selected} onClose={() => setReviewOpen(false)} style={{ ...overlayStyle, right: 0, width: `min(${REVIEW_WIDTH}px, 92%)` }} />
					: <ReviewPanel session={selected} onClose={() => setReviewOpen(false)} style={{ width: `${REVIEW_WIDTH}px`, flexShrink: 0 }} />)}
			</div>
		</div>
	);
};

export const CloudAgentsPanel = () => {
	const isDark = useIsDark();
	const rootRef = useRef<HTMLDivElement | null>(null);
	const width = useElementWidth(rootRef);
	return (
		<div
			ref={rootRef}
			className={`@@void-scope ${isDark ? 'dark' : ''}`}
			style={{ height: '100%', width: '100%', overflow: 'hidden', background: C.bg, color: C.fg, fontSize: '13px' }}
		>
			<style>{PANEL_CSS}</style>
			<ErrorBoundary>
				<CloudAgentsPanelInner width={width} />
			</ErrorBoundary>
		</div>
	);
};
