/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// コスト管理の「Jev にプロジェクトを作ってもらう」。
//
// プロンプト (作りたいもの) と、エフォート・コスト (1 ロール 1 回あたりの上限)・性能 (ランキングのスコアの下限) の
// 3 つのスライダーの値を Jev に送る (POST /api/routing/project、Jev の料金は少額かかる)。
// Jev は Supabase のロール別ランキング (RoleRanking) を読み、3 つの値はそのまま使って、必要なロールと、
// 条件を満たすモデルの中からロールごとに目的に合うものを選ぶ。Division はその割り当てでプロジェクトを作る。
// 作ったプロジェクトは Supabase から取り込んで使うプロジェクトにし、「ソーシャルに共有」でそのまま投稿もできる
// (SocialSettings.tsx と同じ /api/social/posts)。

import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { useAccessor } from '../util/services.js';
import { fetchDivisionProfile } from '../void-login-tsx/divisionBilling.js';
import { COST_STEPS, PrimaryButton, Slider, formatUsd, friendlyError, nearestIndex, roleLabel } from './AutoRouting.js';
import { ORCHESTRA_OPEN_DIVISION_PROJECTS_ACTION_ID, ORCHESTRA_OPEN_SOCIAL_ACTION_ID } from '../../../actionIDs.js';
import { createSocialApi } from './socialApi.js';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = typeof EFFORTS[number];
const EFFORT_LABELS: Record<Effort, string> = { low: '低い', medium: 'ふつう', high: '高い', xhigh: 'とても高い', max: '最大' };

type Sliders = { effort: Effort; maxCostUsd: number; minPerformance: number };
type Status = 'ok' | 'below-performance' | 'over-budget';
type Assignment = {
	roleSlug: string; roleName: string; providerId: string; providerName: string; modelId: string; modelName: string;
	rank: number; score: number; effort: Effort | null; costUsd: number; status: Status;
};
type Plan = {
	assignments: Assignment[];
	totals: { costUsd: number; performance: number; minimumPerformance: number; unmet: number };
	roles: string[]; sliders: Sliders; picks?: Record<string, string>;
	jev: { model: string; costUsd: number } | null;
};
type Created = { id: string; name: string; plan: Plan };

const DEFAULT_SLIDERS: Sliders = { effort: 'medium', maxCostUsd: 0.05, minPerformance: 70 };

const STATUS_TEXT: Record<Exclude<Status, 'ok'>, string> = {
	'below-performance': '上限内に性能の下限を満たすモデルがないため、上限内でいちばん性能の高いモデルにしています',
	'over-budget': '上限に収まるモデルがないため、いちばん安いモデルにしています',
};

const performanceText = (v: number) => v >= 85 ? '最高性能' : v >= 65 ? '性能を重視' : v >= 40 ? 'バランス' : '料金を重視';
const nameOf = (slug: string, fallback: string) => { const l = roleLabel(slug); return l !== slug ? l : fallback || slug; };
/** Jev に送るエフォート・コスト・性能の 3 本のスライダー */
const SliderSet = ({ value, onChange }: { value: Sliders; onChange: (patch: Partial<Sliders>) => void }) => {
	const costIdx = nearestIndex(COST_STEPS, value.maxCostUsd);
	return <>
		<Slider
			label="エフォート" valueText={EFFORT_LABELS[value.effort]}
			hint="上げると推論が深くなり、料金も増えます"
			min={0} max={EFFORTS.length - 1} value={EFFORTS.indexOf(value.effort)}
			onChange={i => onChange({ effort: EFFORTS[i] })}
			left="低い" right="最大"
		/>
		<Slider
			label="コスト (1 ロール 1 回あたりの上限)" valueText={`${formatUsd(COST_STEPS[costIdx])} まで`}
			min={0} max={COST_STEPS.length - 1} value={costIdx}
			onChange={i => onChange({ maxCostUsd: COST_STEPS[i] })}
			left={formatUsd(COST_STEPS[0])} right={formatUsd(COST_STEPS[COST_STEPS.length - 1])}
		/>
		<Slider
			label="性能 (ランキングのスコアの下限)" valueText={`${performanceText(value.minPerformance)}（${value.minPerformance} 以上）`}
			min={0} max={100} value={value.minPerformance}
			onChange={v => onChange({ minPerformance: Math.round(v / 5) * 5 })}
			left="料金を重視" right="性能を重視"
		/>
	</>;
};

const defaultName = (goal: string) => {
	const line = goal.split('\n').map(s => s.trim()).find(Boolean) ?? '';
	return line.length > 60 ? `${line.slice(0, 60)}…` : line;
};

export const JevProjectPlanner = ({ endpoint, accessToken, refreshToken }: { endpoint: string; accessToken: string; refreshToken: string }) => {
	const accessor = useAccessor();
	const llmMessageService = accessor.get('ILLMMessageService');
	const divisionProjectService = accessor.get('IDivisionProjectService');
	const commandService = accessor.get('ICommandService');

	const [goal, setGoal] = useState('');
	const [name, setName] = useState('');
	const [sliders, setSliders] = useState<Sliders>(DEFAULT_SLIDERS);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [created, setCreated] = useState<Created | null>(null);
	const [shared, setShared] = useState<'idle' | 'busy' | 'done'>('idle');
	const [isPaid, setIsPaid] = useState<boolean | null>(null);

	useEffect(() => {
		let active = true;
		if (!accessToken) { setIsPaid(false); return () => { active = false; }; }
		setIsPaid(null);
		void fetchDivisionProfile(accessToken, refreshToken).then(p => { if (active) setIsPaid(p?.isPaid === true); }).catch(() => { if (active) setIsPaid(false); });
		return () => { active = false; };
	}, [accessToken, refreshToken]);

	// 送っている途中で画面を閉じたり、もう一度送ったりしたときに古い結果を出さない
	const requestSeq = useRef(0);

	/** プロンプトと 3 つの値を Jev に送り、そのまま Division プロジェクトを作る */
	const sendToJev = async () => {
		const seq = ++requestSeq.current;
		const projectName = name.trim() || defaultName(goal);
		setBusy(true); setError(''); setShared('idle');
		try {
			const res = await llmMessageService.divisionApiRequest({
				endpoint, accessToken, path: '/api/routing/project',
				body: { goal: goal.trim(), sliders, ...(projectName ? { name: projectName } : {}) },
			});
			if (!res.ok) throw new Error(friendlyError(res.status, res.data, res.error));
			if (seq !== requestSeq.current) return;
			const id = typeof res.data?.project?.id === 'string' ? res.data.project.id : '';
			const savedName = typeof res.data?.project?.name === 'string' ? res.data.project.name : projectName;
			setCreated({ id, name: savedName, plan: res.data.plan as Plan });
			// 作ったプロジェクトを Supabase から取り込み、使うプロジェクトにする
			await divisionProjectService.fetchFromSupabase();
			if (id && divisionProjectService.projects.some(p => p.projectId === id)) await divisionProjectService.setActiveProject(id);
		} catch (e) {
			if (seq === requestSeq.current) setError(e instanceof Error ? e.message : String(e));
		} finally {
			if (seq === requestSeq.current) setBusy(false);
		}
	};

	const shareToSocial = async () => {
		if (!created?.id) return;
		setShared('busy'); setError('');
		try {
			await createSocialApi(llmMessageService, accessToken, refreshToken).publish({
				projectId: created.id, title: created.name.slice(0, 80), description: goal.trim().slice(0, 280) || undefined,
			});
			setShared('done');
		} catch (e) {
			setShared('idle');
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const canSend = isPaid === true && !!goal.trim() && !busy;
	const plan = created?.plan;

	return <div onKeyDown={e => e.stopPropagation()} className="flex flex-col gap-4 border border-void-border-2 rounded-md p-3 text-xs max-w-xl">
		{/* 1. Jev に送るもの: プロンプトと 3 つの値 */}
		<div className="flex flex-col gap-3">
			<label className="flex flex-col gap-1">
				<span className="text-void-fg-2">プロンプト (作りたいもの)</span>
				<textarea
					aria-label="プロンプト" rows={3}
					placeholder="例: 社内向けの勉強会の申し込みページを作って、管理画面も付けたい"
					className="bg-void-bg-1 border border-void-border-2 rounded p-2 resize-y text-sm"
					value={goal} onChange={e => setGoal(e.target.value)}
				/>
			</label>
			<SliderSet value={sliders} onChange={patch => setSliders(s => ({ ...s, ...patch }))} />
			<label className="flex flex-col gap-1">
				<span className="text-void-fg-2">プロジェクト名 (空ならプロンプトの 1 行目)</span>
				<input
					className="bg-void-bg-1 border border-void-border-2 rounded px-2 py-1 text-sm"
					value={name} onChange={e => setName(e.target.value)} maxLength={200}
					placeholder={defaultName(goal) || '例: 勉強会の申し込みページ'}
				/>
			</label>
			<div className="flex items-center gap-2 flex-wrap">
				<PrimaryButton disabled={!canSend} onClick={() => { void sendToJev(); }}>
					<span className="inline-flex items-center gap-1">
						{busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
						{busy ? 'Jev が作成中…' : created ? 'もう一度 Jev に送って作る' : 'Jev に送って作る'}
					</span>
				</PrimaryButton>
				<span className="text-[10px] text-void-fg-4">
					3 つの値はそのまま使い、Jev がロールとモデルを選んでプロジェクトを作ります。Jev の料金が少額かかります。
					{created ? ' もう一度送ると、別のプロジェクトとして作ります。' : ''}
				</span>
			</div>
			{isPaid === false && <span className="text-void-fg-3">{accessToken ? 'この機能は Plus プランで使えます。' : 'Orchestra にログインすると使えます。'}</span>}
		</div>

		{/* 2. Jev が作ったプロジェクト */}
		{created && plan && <div className="flex flex-col gap-2 border-t border-void-border-2 pt-3">
			<div role="status" className="flex items-center gap-2 flex-wrap text-void-fg-2">
				<Check size={12} />「{created.name}」を作成して、使うプロジェクトにしました。
				<button type="button" className="text-void-link-color hover:underline" onClick={() => { void commandService.executeCommand(ORCHESTRA_OPEN_DIVISION_PROJECTS_ACTION_ID); }}>
					Division プロジェクトを開く
				</button>
				{created.id && (shared === 'done'
					? <button type="button" className="text-void-link-color hover:underline" onClick={() => { void commandService.executeCommand(ORCHESTRA_OPEN_SOCIAL_ACTION_ID); }}>
						ソーシャルに共有しました · 見る
					</button>
					: <button type="button" disabled={shared === 'busy'} className="text-void-link-color hover:underline disabled:opacity-50" onClick={() => { void shareToSocial(); }}>
						{shared === 'busy' ? '共有中…' : 'ソーシャルに共有'}
					</button>)}
			</div>
			<div className="flex flex-col gap-1.5 rounded bg-void-bg-2 p-2">
				<div className="flex items-baseline justify-between gap-2">
					<span className="text-sm text-void-fg-1">1 回の実行 約 <strong>{formatUsd(plan.totals.costUsd)}</strong></span>
					<span className="text-void-fg-3">
						{EFFORT_LABELS[plan.sliders.effort]} · {formatUsd(plan.sliders.maxCostUsd)} まで · スコア {plan.sliders.minPerformance} 以上 · 平均 {plan.totals.performance.toFixed(1)}
					</span>
				</div>
				{plan.assignments.map(a => <div key={a.roleSlug} className="flex flex-col gap-0.5 border-t border-[color-mix(in_srgb,var(--void-border-2)_60%,transparent)] pt-1.5">
					<div className="flex justify-between gap-2">
						<span className="text-void-fg-1">{nameOf(a.roleSlug, a.roleName)}</span>
						<span className="font-mono text-void-fg-2">{formatUsd(a.costUsd)}</span>
					</div>
					<div className="flex justify-between gap-2 text-void-fg-3">
						<span className="truncate">{a.modelName} <span className="text-void-fg-4">· {a.providerName}</span></span>
						<span className="shrink-0">{plan.picks?.[a.roleSlug] === `${a.providerId}/${a.modelId}` ? 'Jev が選択 · ' : ''}#{a.rank} · {a.score.toFixed(1)}{a.effort ? ` · ${EFFORT_LABELS[a.effort]}` : ''}</span>
					</div>
					{a.status !== 'ok' && <span className="text-[10px] text-[var(--vscode-editorWarning-foreground)]">{STATUS_TEXT[a.status]}</span>}
				</div>)}
				<span className="text-[10px] text-void-fg-4">
					各ロールが 1 回ずつ動いたときの目安です。エフォートによるトークンの増え方は見積もりで、実際の料金は内容で決まります。
					{plan.jev && plan.jev.costUsd > 0 ? ` Jev の料金 ${formatUsd(plan.jev.costUsd)}。` : ''}
				</span>
			</div>
		</div>}

		{error && <p role="alert" className="text-red-400">{error}</p>}
	</div>;
};
