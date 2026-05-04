/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useMemo } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Circle, Sparkles } from 'lucide-react';
import { AgentRole, RoleAssignment } from '../../../../common/voidSettingsTypes.js';
import { roleDisplayConfig } from '../conductor-tsx/ConductorTypes.js';

// ────────────────────────────────────────────────────────────────────────────
//   出力テキストのパース
// ────────────────────────────────────────────────────────────────────────────

/** sendDivisionAPIChat の出力中に現れるロール名（揺れ）を、AgentRole に正規化する */
const ROLE_NAME_NORMALIZATION: Record<string, AgentRole> = {
	leader: 'leader',
	coder: 'coder',
	writer: 'writing',
	writing: 'writing',
	search: 'search',
	searcher: 'search',
	research: 'research',
	researcher: 'research',
	ideaman: 'ideaman',
	designer: 'design',
	design: 'design',
	planner: 'planner',
	planning: 'planner',
	reviewer: 'review',
	review: 'review',
	filesearch: 'filesearch',
	'file-search': 'filesearch',
	'file_search': 'filesearch',
	image: 'image',
	imager: 'image',
};

const normalizeRole = (raw: string): AgentRole | undefined =>
	ROLE_NAME_NORMALIZATION[raw.toLowerCase().trim()];

/** `### N. {role} — {title}` 形式の進捗ヘッダー（番号は省略可、ハイフン/em-dash 双方対応） */
const HEADER_REGEX = /^###\s+(?:\d+\.\s+)?([\w-]+)\s*[—\-]\s*(.+?)\s*$/gm;

/** Leader が出力するタスク分解の行: `1. [wave2] **role** — title` 形式 */
const TASK_DECOMPOSITION_REGEX = /^\d+\.\s*\[wave(\d+)\+?\]\s*[📂]?\s*\*\*([\w-]+)\*\*\s*[—\-]\s*(.+?)\s*$/gm;

const LEADER_HINT_REGEX = /\*\*Leader AI\*\*\s*が/;
const REVIEWER_PASSED_REGEX = /✅\s*\*\*レビュー合格\*\*|\*\*全フロー承認完了\*\*|\*\*Synthesis Done\*\*/;
const ANY_ERROR_REGEX = /❌\s*\*\*[^*]*Error/;
const ABORTED_REGEX = /⏹\s*\*\*停止\*\*|aborted|Aborted/;

type RoleStatus = 'pending' | 'active' | 'done' | 'error';

interface ParsedTask {
	role: AgentRole;
	title: string;
	wave: number;
}

interface AppearedRoleInfo {
	role: AgentRole;
	title: string;
	order: number;
}

const parseTaskDecomposition = (text: string): ParsedTask[] => {
	const out: ParsedTask[] = [];
	TASK_DECOMPOSITION_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TASK_DECOMPOSITION_REGEX.exec(text)) !== null) {
		const wave = parseInt(match[1], 10);
		const role = normalizeRole(match[2]);
		const title = match[3].trim();
		if (role && Number.isFinite(wave)) {
			out.push({ role, title, wave });
		}
	}
	return out;
};

const parseAppearedRoles = (text: string): AppearedRoleInfo[] => {
	const out: AppearedRoleInfo[] = [];
	const seen = new Set<AgentRole>();
	HEADER_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;
	let order = 0;
	while ((match = HEADER_REGEX.exec(text)) !== null) {
		const role = normalizeRole(match[1]);
		const title = (match[2] || '').trim();
		if (!role) continue;
		if (seen.has(role)) continue;
		seen.add(role);
		out.push({ role, title, order: order++ });
	}
	return out;
};

// ────────────────────────────────────────────────────────────────────────────
//   フォールバックの Wave 推定（タスク分解行が無いとき用）
// ────────────────────────────────────────────────────────────────────────────

const FALLBACK_WAVE: Record<AgentRole, number> = {
	leader: 0,
	filesearch: 1,
	ideaman: 2,
	search: 2,
	research: 2,
	design: 3,
	image: 3,
	planner: 3,
	coder: 4,
	writing: 4,
	review: 5,
};

const inferWave = (role: AgentRole, parsed: ParsedTask[]): number => {
	const fromParsed = parsed.find(t => t.role === role)?.wave;
	if (typeof fromParsed === 'number') return fromParsed;
	if (role === 'leader') return 0;
	return FALLBACK_WAVE[role] ?? 4;
};

// ────────────────────────────────────────────────────────────────────────────
//   メインコンポーネント
// ────────────────────────────────────────────────────────────────────────────

interface Props {
	text: string;
	isRunning: boolean;
	roleAssignments: RoleAssignment[];
}

export const DivisionPipelinePanel: React.FC<Props> = ({ text, isRunning, roleAssignments }) => {

	const parsedTasks = useMemo(() => parseTaskDecomposition(text), [text]);
	const appearedInfos = useMemo(() => parseAppearedRoles(text), [text]);
	const appearedRoles = useMemo(() => appearedInfos.map(a => a.role), [appearedInfos]);
	const lastAppeared = appearedRoles[appearedRoles.length - 1];

	const hasLeaderHint = useMemo(() => LEADER_HINT_REGEX.test(text), [text]);
	const hasError = useMemo(() => ANY_ERROR_REGEX.test(text), [text]);
	const wasAborted = useMemo(() => ABORTED_REGEX.test(text), [text]);
	const allDone = useMemo(() => REVIEWER_PASSED_REGEX.test(text), [text]);

	// 表示対象ロール: Leader + roleAssignments + parsedTasks + appearedRoles の和集合
	const displayedRoles = useMemo<AgentRole[]>(() => {
		const set = new Set<AgentRole>(['leader']);
		roleAssignments.forEach(r => set.add(r.role));
		parsedTasks.forEach(t => set.add(t.role));
		appearedRoles.forEach(r => set.add(r));
		return Array.from(set);
	}, [roleAssignments, parsedTasks, appearedRoles]);

	// Wave ごとに role をグルーピング
	const wavesMap = useMemo(() => {
		const map = new Map<number, AgentRole[]>();
		for (const role of displayedRoles) {
			const wave = inferWave(role, parsedTasks);
			const arr = map.get(wave) || [];
			if (!arr.includes(role)) arr.push(role);
			map.set(wave, arr);
		}
		return map;
	}, [displayedRoles, parsedTasks]);

	const sortedWaves = useMemo(() => Array.from(wavesMap.keys()).sort((a, b) => a - b), [wavesMap]);

	const titleByRole = useMemo(() => {
		const m = new Map<AgentRole, string>();
		for (const t of parsedTasks) {
			if (!m.has(t.role)) m.set(t.role, t.title);
		}
		return m;
	}, [parsedTasks]);

	if (!isRunning && appearedRoles.length === 0) return null;

	const statusFor = (role: AgentRole): RoleStatus => {
		if (allDone) return 'done';
		if (wasAborted && !appearedRoles.includes(role)) return 'pending';
		if (hasError && role === lastAppeared) return 'error';
		if (appearedRoles.includes(role)) {
			if (role === lastAppeared && isRunning) return 'active';
			return 'done';
		}
		if (isRunning && hasLeaderHint && role === 'leader' && appearedRoles.length === 0) return 'active';
		return 'pending';
	};

	const totalCount = displayedRoles.length;
	const doneCount = displayedRoles.filter(r => statusFor(r) === 'done').length;
	const activeRoles = displayedRoles.filter(r => statusFor(r) === 'active');
	const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

	// ヘッダー右側に出すサマリ用テキスト
	const summaryText = allDone
		? '完了'
		: hasError
			? 'エラーあり'
			: wasAborted
				? '停止'
				: isRunning
					? `${doneCount}/${totalCount} 完了`
					: `${doneCount}/${totalCount}`;

	const summaryColor = allDone
		? '#10b981'
		: hasError
			? '#ef4444'
			: wasAborted
				? '#9ca3af'
				: '#f59e0b';

	const waveLabel = (n: number): string => {
		if (n === 0) return 'Leader';
		return `Wave ${n}`;
	};

	const waveDescription = (n: number): string => {
		switch (n) {
			case 0: return 'タスクの分析と分解';
			case 1: return 'ワークスペース全件読み込み';
			case 2: return '情報収集（並列）';
			case 3: return '設計・計画（並列）';
			case 4: return '実装・執筆';
			case 5: return 'レビュー';
			default: return '';
		}
	};

	return (
		<div
			className="mx-2 mt-1 mb-2 rounded-xl border border-void-border-3/60 bg-gradient-to-b from-void-bg-2/60 to-void-bg-2/30 backdrop-blur-sm shadow-sm overflow-hidden"
		>
			{/* Header */}
			<div className="px-3 py-2 border-b border-void-border-3/40 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Sparkles
						size={12}
						className={`${isRunning && !allDone ? 'animate-pulse' : ''}`}
						style={{ color: summaryColor }}
					/>
					<div className="flex flex-col">
						<span className="text-[11px] font-semibold tracking-wide text-void-fg-2">
							Division Pipeline
						</span>
						{activeRoles.length > 0 && titleByRole.get(activeRoles[0]) && (
							<span
								className="text-[10px] text-void-fg-3 truncate max-w-[200px]"
								title={titleByRole.get(activeRoles[0])}
							>
								{roleDisplayConfig[activeRoles[0]]?.label}: {titleByRole.get(activeRoles[0])}
							</span>
						)}
					</div>
				</div>
				<div className="flex items-center gap-1.5 text-[10px] text-void-fg-3">
					<span style={{ color: summaryColor }}>{summaryText}</span>
				</div>
			</div>

			{/* Progress bar */}
			<div className="h-1 w-full bg-void-bg-3/60 relative overflow-hidden">
				<div
					className={`h-full transition-all duration-500 ease-out ${isRunning && !allDone && !hasError && !wasAborted ? 'animate-pulse' : ''}`}
					style={{
						width: `${progressPct}%`,
						backgroundColor: summaryColor,
						boxShadow: isRunning && !allDone ? `0 0 6px ${summaryColor}` : 'none',
					}}
				/>
			</div>

			{/* Waves */}
			<div className="px-3 py-2 flex flex-col gap-2">
				{sortedWaves.map((waveNum, waveIdx) => {
					const rolesInWave = wavesMap.get(waveNum) || [];
					const allDoneInWave = rolesInWave.every(r => statusFor(r) === 'done');
					const anyActiveInWave = rolesInWave.some(r => statusFor(r) === 'active');
					const anyErrorInWave = rolesInWave.some(r => statusFor(r) === 'error');

					const waveColor = anyErrorInWave
						? '#ef4444'
						: allDoneInWave
							? '#10b981'
							: anyActiveInWave
								? '#f59e0b'
								: '#6b7280';

					return (
						<div key={`wave-${waveNum}`} className="flex flex-col gap-1">
							{/* Wave label */}
							<div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider">
								<span
									className={`inline-block w-1.5 h-1.5 rounded-full ${anyActiveInWave ? 'animate-pulse' : ''}`}
									style={{ backgroundColor: waveColor }}
								/>
								<span style={{ color: waveColor }} className="font-semibold">
									{waveLabel(waveNum)}
								</span>
								<span className="text-void-fg-4 font-normal normal-case">
									{waveDescription(waveNum)}
								</span>
								{rolesInWave.length > 1 && (
									<span className="text-void-fg-4 font-normal normal-case ml-auto">
										並列実行
									</span>
								)}
							</div>

							{/* Role cards in this wave */}
							<div className="flex flex-wrap items-stretch gap-1.5 pl-3">
								{rolesInWave.map((role) => {
									const cfg = roleDisplayConfig[role];
									if (!cfg) return null;
									const status = statusFor(role);
									const taskTitle = titleByRole.get(role);

									const StatusIcon = status === 'done'
										? CheckCircle2
										: status === 'error'
											? AlertCircle
											: status === 'active'
												? Loader2
												: Circle;

									const baseStyle: React.CSSProperties = {
										backgroundColor: status === 'pending'
											? `${cfg.color}0a`
											: `${cfg.color}1f`,
										color: cfg.color,
										border: `1px solid ${cfg.color}${status === 'pending' ? '33' : '66'}`,
									};
									const activeStyle: React.CSSProperties = status === 'active'
										? { boxShadow: `0 0 10px ${cfg.glowColor}` }
										: {};

									return (
										<div
											key={`${role}-${waveNum}`}
											className={`
												group/chip
												flex items-center gap-1.5 px-2 py-1 rounded-md
												text-[10px] font-medium
												transition-all duration-300
												${status === 'pending' ? 'opacity-50' : 'opacity-100'}
											`}
											style={{ ...baseStyle, ...activeStyle }}
											title={taskTitle ? `${cfg.label} — ${taskTitle}` : cfg.label}
										>
											<StatusIcon
												size={11}
												className={status === 'active' ? 'animate-spin' : ''}
												style={{ color: cfg.color }}
											/>
											<span className="leading-none">{cfg.label}</span>
											{taskTitle && (
												<span
													className="ml-1 max-w-[140px] truncate text-void-fg-3 normal-case font-normal hidden md:inline"
													style={{ opacity: 0.85 }}
												>
													— {taskTitle}
												</span>
											)}
										</div>
									);
								})}
							</div>

							{/* Connecting line down to next wave */}
							{waveIdx < sortedWaves.length - 1 && (
								<div className="ml-1 h-2 w-px bg-gradient-to-b from-void-border-3/60 to-transparent"
									aria-hidden
								/>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
};
