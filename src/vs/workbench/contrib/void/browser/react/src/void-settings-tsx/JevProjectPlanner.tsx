/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// コスト管理の「Jev にプロジェクトを組んでもらう」。
//
// 作りたいものを書くと、Jev が Supabase のロール別ランキング (RoleRanking) を読んで、
// エフォート・コスト (1 ロール 1 回あたりの上限)・性能 (ランキングのスコアの下限) の 3 つのスライダーと
// 必要なロールを決める (POST /api/routing/project-plan、Jev の料金は少額かかる)。
// 各ロールには「性能の下限を満たし、上限に収まる、いちばん安いモデル」が入る。
// 「条件を指定」にすると、自分で決めた 3 つの値を作りたいものと一緒に Jev に送る (useJev)。
// Jev は値をそのまま使い、ロールと、条件を満たすモデルの中からロールごとに目的に合うものを選ぶ (picks)。
// スライダーやロールを動かすと、Jev を呼ばずに同じ API で組み直す (料金はかからない)。
// 「Division プロジェクトを作成」で POST /api/projects/from-plan に送り、Supabase から取り込んで使うプロジェクトにする。

import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { useAccessor } from '../util/services.js';
import { fetchDivisionProfile } from '../void-login-tsx/divisionBilling.js';
import { COST_STEPS, PrimaryButton, Slider, formatUsd, friendlyError, nearestIndex, roleLabel } from './AutoRouting.js';
import { ORCHESTRA_OPEN_DIVISION_PROJECTS_ACTION_ID } from '../../../actionIDs.js';

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
	roles: string[]; availableRoles: string[]; sliders: Sliders;
	adjustedBy: 'jev' | 'user'; slidersBy?: 'jev' | 'user'; picks?: Record<string, string>;
	jev: { model: string; costUsd: number } | null;
};

const DEFAULT_PRESET: Sliders = { effort: 'medium', maxCostUsd: 0.05, minPerformance: 70 };

const STATUS_TEXT: Record<Exclude<Status, 'ok'>, string> = {
	'below-performance': '上限内に性能の下限を満たすモデルがないため、上限内でいちばん性能の高いモデルにしています',
	'over-budget': '上限に収まるモデルがないため、いちばん安いモデルにしています',
};

const performanceText = (v: number) => v >= 85 ? '最高性能' : v >= 65 ? '性能を重視' : v >= 40 ? 'バランス' : '料金を重視';
const nameOf = (slug: string, fallback: string) => { const l = roleLabel(slug); return l !== slug ? l : fallback || slug; };
/** エフォート・コスト・性能の 3 本のスライダー (Jev に送る条件 / Jev の調整のあとの微調整で共通) */
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
	return line.length > 40 ? `${line.slice(0, 40)}…` : line;
};

export const JevProjectPlanner = ({ endpoint, accessToken, refreshToken }: { endpoint: string; accessToken: string; refreshToken: string }) => {
	const accessor = useAccessor();
	const llmMessageService = accessor.get('ILLMMessageService');
	const divisionProjectService = accessor.get('IDivisionProjectService');
	const commandService = accessor.get('ICommandService');

	const [goal, setGoal] = useState('');
	/** おまかせ (Jev が 3 つの値も決める) / 条件を指定 (自分で決めた値を Jev に送る) */
	const [mode, setMode] = useState<'auto' | 'preset'>('auto');
	const [preset, setPreset] = useState<Sliders>(DEFAULT_PRESET);
	const [plan, setPlan] = useState<Plan | null>(null);
	/** Jev が決めたスライダーとロール (「Jev の設定に戻す」用) */
	const [jevChoice, setJevChoice] = useState<{ sliders: Sliders; roles: string[] } | null>(null);
	const [sliders, setSliders] = useState<Sliders | null>(null);
	const [roles, setRoles] = useState<string[]>([]);
	const [name, setName] = useState('');
	const [busy, setBusy] = useState<'jev' | 'replan' | 'create' | null>(null);
	const [error, setError] = useState('');
	const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
	const [isPaid, setIsPaid] = useState<boolean | null>(null);

	useEffect(() => {
		let active = true;
		if (!accessToken) { setIsPaid(false); return () => { active = false; }; }
		setIsPaid(null);
		void fetchDivisionProfile(accessToken, refreshToken).then(p => { if (active) setIsPaid(p?.isPaid === true); }).catch(() => { if (active) setIsPaid(false); });
		return () => { active = false; };
	}, [accessToken, refreshToken]);

	const api = async (path: string, body: unknown) => {
		const res = await llmMessageService.divisionApiRequest({ endpoint, accessToken, path, body });
		if (!res.ok) throw new Error(friendlyError(res.status, res.data, res.error));
		return res.data;
	};

	// 古い応答で新しい計画を上書きしない
	const requestSeq = useRef(0);

	const askJev = async () => {
		const seq = ++requestSeq.current;
		setBusy('jev'); setError(''); setCreated(null);
		try {
			const data = await api('/api/routing/project-plan', mode === 'preset' ? { goal, sliders: preset, useJev: true } : { goal }) as Plan;
			if (seq !== requestSeq.current) return;
			setPlan(data);
			setSliders(data.sliders);
			setRoles(data.roles);
			setJevChoice({ sliders: data.sliders, roles: data.roles });
			if (!name.trim()) setName(defaultName(goal));
		} catch (e) {
			if (seq === requestSeq.current) setError(e instanceof Error ? e.message : String(e));
		} finally {
			if (seq === requestSeq.current) setBusy(null);
		}
	};

	// スライダー・ロールを変えたら組み直す (Jev は呼ばない)。ドラッグ中に連打しないよう少し待つ。
	const replanKey = sliders ? JSON.stringify([sliders, roles]) : '';
	const lastPlannedKey = useRef('');
	useEffect(() => {
		if (!plan || !sliders || !roles.length) return;
		const key = JSON.stringify([plan.sliders, plan.roles]);
		if (key === replanKey || lastPlannedKey.current === replanKey) return;
		const timer = setTimeout(() => {
			const seq = ++requestSeq.current;
			lastPlannedKey.current = replanKey;
			setBusy('replan'); setError(''); setCreated(null);
			// Jev が選んだモデル (picks) は、条件を満たす間はそのまま残す
			api('/api/routing/project-plan', { goal, roles, sliders, picks: plan.picks ?? {} }).then((data: Plan) => {
				if (seq === requestSeq.current) setPlan(data);
			}).catch(e => {
				if (seq === requestSeq.current) { setError(e instanceof Error ? e.message : String(e)); lastPlannedKey.current = ''; }
			}).finally(() => {
				if (seq === requestSeq.current) setBusy(null);
			});
		}, 300);
		return () => clearTimeout(timer);
	}, [replanKey]); // eslint-disable-line react-hooks/exhaustive-deps

	const createProject = async () => {
		if (!plan) return;
		setBusy('create'); setError('');
		try {
			const data = await api('/api/projects/from-plan', {
				name: name.trim(),
				description: goal.trim().slice(0, 5000) || undefined,
				assignments: plan.assignments.map(a => ({ roleSlug: a.roleSlug, providerId: a.providerId, modelId: a.modelId, effort: a.effort })),
			});
			const id = typeof data?.id === 'string' ? data.id : '';
			setCreated({ id, name: name.trim() });
			// 作ったプロジェクトを Supabase から取り込み、使うプロジェクトにする
			await divisionProjectService.fetchFromSupabase();
			if (id && divisionProjectService.projects.some(p => p.projectId === id)) await divisionProjectService.setActiveProject(id);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	};

	const update = (patch: Partial<Sliders>) => { if (sliders) setSliders({ ...sliders, ...patch }); };
	const toggleRole = (slug: string) => {
		if (slug === 'leader') return; // リーダーは常に入れる
		setRoles(rs => rs.includes(slug) ? rs.filter(r => r !== slug) : [...rs, slug]);
	};
	const resetToJev = () => { if (jevChoice) { setSliders(jevChoice.sliders); setRoles(jevChoice.roles); } };

	const isJevSetting = !!jevChoice && !!sliders && JSON.stringify([jevChoice.sliders, jevChoice.roles]) === JSON.stringify([sliders, roles]);
	const stale = !!plan && !!sliders && JSON.stringify([plan.sliders, plan.roles]) !== JSON.stringify([sliders, roles]);
	const canAsk = isPaid === true && !!goal.trim() && busy === null;
	const canCreate = !!plan && !stale && busy === null && !!name.trim() && plan.assignments.length > 0;

	return <div onKeyDown={e => e.stopPropagation()} className="flex flex-col gap-4 border border-void-border-2 rounded-md p-3 text-xs max-w-xl">
		{/* 1. 作りたいもの */}
		<div className="flex flex-col gap-2">
			<textarea
				aria-label="作りたいもの" rows={3}
				placeholder="例: 社内向けの勉強会の申し込みページを作って、管理画面も付けたい"
				className="bg-void-bg-1 border border-void-border-2 rounded p-2 resize-y text-sm"
				value={goal} onChange={e => setGoal(e.target.value)}
			/>
			<div role="radiogroup" aria-label="エフォート・コスト・性能の決め方" className="flex gap-1">
				{([['auto', 'Jev におまかせ'], ['preset', '条件を指定して Jev に送る']] as const).map(([key, label]) =>
					<button
						key={key} type="button" role="radio" aria-checked={mode === key} onClick={() => setMode(key)}
						className={`px-2 py-0.5 rounded-full border text-[11px] ${mode === key ? 'border-[var(--vscode-button-background)] text-void-fg-1 bg-[color-mix(in_srgb,var(--vscode-button-background)_15%,transparent)]' : 'border-void-border-2 text-void-fg-3'}`}
					>{label}</button>)}
			</div>
			{mode === 'preset' && <div className="flex flex-col gap-3 rounded border border-void-border-2 p-2">
				<span className="text-void-fg-3">この値をそのまま使い、Jev がロールと、条件を満たすモデルの中から目的に合うものを選びます。</span>
				<SliderSet value={preset} onChange={patch => setPreset(p => ({ ...p, ...patch }))} />
			</div>}
			<div className="flex items-center gap-2 flex-wrap">
				<PrimaryButton disabled={!canAsk} onClick={() => { void askJev(); }}>
					<span className="inline-flex items-center gap-1">
						{busy === 'jev' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
						{busy === 'jev' ? 'Jev が調整中…'
							: mode === 'preset' ? (plan ? 'この条件で Jev にもう一度作ってもらう' : 'この条件で Jev に作ってもらう')
							: plan ? 'Jev にもう一度調整してもらう' : 'Jev に調整してもらう'}
					</span>
				</PrimaryButton>
				<span className="text-[10px] text-void-fg-4">Jev の調整には少額の料金がかかります。スライダーを動かすのは無料です</span>
			</div>
			{isPaid === false && <span className="text-void-fg-3">{accessToken ? 'この機能は Plus プランで使えます。' : 'Orchestra にログインすると使えます。'}</span>}
		</div>

		{/* 2. Jev が決めたスライダー */}
		{plan && sliders && <div className="flex flex-col gap-3 border-t border-void-border-2 pt-3">
			<div className="flex items-center justify-between gap-2">
				<strong className="text-void-fg-1">調整</strong>
				{isJevSetting
					? <span className="inline-flex items-center gap-1 text-void-fg-3"><Sparkles size={11} />{plan.slidersBy === 'user' ? '指定した条件で Jev が選びました' : 'Jev が調整しました'}</span>
					: <button type="button" onClick={resetToJev} className="inline-flex items-center gap-1 text-void-link-color hover:underline">
						<RotateCcw size={11} />Jev の設定に戻す
					</button>}
			</div>
			<SliderSet value={sliders} onChange={update} />
			<div className="flex flex-col gap-1">
				<span className="text-void-fg-2">ロール</span>
				<div className="flex flex-wrap gap-1">
					{plan.availableRoles.map(slug => {
						const on = roles.includes(slug);
						const known = plan.assignments.find(a => a.roleSlug === slug);
						return <button
							key={slug} type="button" aria-pressed={on} disabled={slug === 'leader'}
							onClick={() => toggleRole(slug)}
							title={slug === 'leader' ? 'リーダーは常に入ります' : on ? 'クリックで外す' : 'クリックで入れる'}
							className={`px-2 py-0.5 rounded-full border text-[11px] ${on ? 'border-[var(--vscode-button-background)] text-void-fg-1 bg-[color-mix(in_srgb,var(--vscode-button-background)_15%,transparent)]' : 'border-void-border-2 text-void-fg-3'} disabled:cursor-default`}
						>{nameOf(slug, known?.roleName ?? slug)}</button>;
					})}
				</div>
			</div>
		</div>}

		{/* 3. 割り当て */}
		{plan && <div className={`flex flex-col gap-1.5 rounded bg-void-bg-2 p-2 ${stale ? 'opacity-60' : ''}`}>
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-sm text-void-fg-1">1 回の実行 約 <strong>{formatUsd(plan.totals.costUsd)}</strong></span>
				<span className="text-void-fg-3">平均スコア {plan.totals.performance.toFixed(1)}{busy === 'replan' && <Loader2 size={11} className="inline ml-1 animate-spin" />}</span>
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
				{plan.jev && plan.jev.costUsd > 0 ? ` Jev の調整 ${formatUsd(plan.jev.costUsd)}。` : ''}
			</span>
		</div>}

		{/* 4. 作成 */}
		{plan && <div className="flex flex-col gap-2 border-t border-void-border-2 pt-3">
			<label className="flex flex-col gap-1">
				<span className="text-void-fg-2">プロジェクト名</span>
				<input
					className="bg-void-bg-1 border border-void-border-2 rounded px-2 py-1 text-sm"
					value={name} onChange={e => setName(e.target.value)} maxLength={200}
				/>
			</label>
			<div className="flex items-center gap-2 flex-wrap">
				<PrimaryButton disabled={!canCreate} onClick={() => { void createProject(); }}>
					{busy === 'create' ? '作成中…' : 'Division プロジェクトを作成'}
				</PrimaryButton>
				{stale && <span className="text-[10px] text-void-fg-4">組み直しています…</span>}
			</div>
			{created && <div role="status" className="flex items-center gap-2 flex-wrap text-void-fg-2">
				<Check size={12} />「{created.name}」を作成して、使うプロジェクトにしました。
				<button type="button" className="text-void-link-color hover:underline" onClick={() => { void commandService.executeCommand(ORCHESTRA_OPEN_DIVISION_PROJECTS_ACTION_ID); }}>
					Division プロジェクトを開く
				</button>
			</div>}
		</div>}

		{error && <p role="alert" className="text-red-400">{error}</p>}
	</div>;
};
