import React, { useEffect, useRef, useState } from 'react';
import { fetchDivisionProfile } from '../void-login-tsx/divisionBilling.js';
import { useAccessor } from '../util/services.js';

type Policy = { minPerformance: number; maxCostUsd: number; maxOutputTokens: number };
type Quote = { role: string; model: string; totalCostUsd: number };
type Plan = { quotes: Quote[]; totalEstimateUsd: number };

const DEFAULT_POLICY: Policy = { minPerformance: 70, maxCostUsd: 0.05, maxOutputTokens: 4096 };

// スライダーの目盛り。金額と長さは桁が大きく変わるので、等間隔ではなく選びやすい値に刻む。
const COST_STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
const LENGTH_STEPS = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
const AMOUNT_STEPS = [500, 2000, 8000, 32000, 128000];
const AMOUNT_LABELS = ['少ない', 'ふつう', '多い', 'かなり多い', 'とても多い'];

const nearestIndex = (steps: number[], value: number) =>
	steps.reduce((best, v, i) => Math.abs(v - value) < Math.abs(steps[best] - value) ? i : best, 0);

const formatUsd = (n: number): string => {
	if (!Number.isFinite(n) || n <= 0) return '$0';
	if (n < 0.0001) return '$0.0001 未満';
	if (n >= 1) return `$${n.toFixed(2)}`;
	// 小数 4 桁まで出し、余分な 0 は落とす (ただしセントの 2 桁は残す): 0.1 → $0.10, 0.001 → $0.001
	return `$${n.toFixed(4).replace(/(\.\d\d\d*?)0+$/, '$1')}`;
};

const performanceLabel = (v: number) => v >= 85 ? '最高性能のモデルだけ' : v >= 65 ? '性能を重視' : v >= 40 ? 'バランス' : '料金を重視';
const lengthLabel = (v: number) => v <= 1024 ? '短め' : v <= 4096 ? 'ふつう' : v <= 16384 ? '長め' : 'とても長い';

const ROLE_LABELS: Record<string, string> = {
	leader: 'リーダー', coder: 'コーダー', review: 'レビュー', reviewer: 'レビュー', planner: 'プランナー',
	search: '検索', searcher: '検索', research: 'リサーチ', researcher: 'リサーチ', design: 'デザイン', designer: 'デザイン',
	writing: 'ライター', writer: 'ライター', ideaman: 'アイデア', image: '画像', imager: '画像',
};
const roleLabel = (role: string) => ROLE_LABELS[role.toLowerCase()] ?? role;

const friendlyError = (status: number, data: any, fallback?: string): string => {
	if (status === 0) return 'サーバーに接続できませんでした。ネットワークを確認して、もう一度お試しください。';
	if (status === 401) return 'ログインの有効期限が切れています。ログインし直してください。';
	if (status === 402) return 'クレジットが不足しています。';
	if (status === 403) return 'この機能は Plus プランで使えます。';
	return (data && typeof data.error === 'string' && data.error) || fallback || `エラーが発生しました（${status}）`;
};

const Slider = ({ label, valueText, hint, min, max, value, onChange, left, right }: {
	label: string; valueText: string; hint?: string; min: number; max: number; value: number;
	onChange: (v: number) => void; left: string; right: string;
}) => (
	<label className="flex flex-col gap-1">
		<span className="flex items-baseline justify-between gap-2">
			<span className="text-void-fg-2">{label}</span>
			<span className="text-void-fg-1 font-medium">{valueText}</span>
		</span>
		<input
			type="range" min={min} max={max} step={1} value={value}
			onChange={e => onChange(Number(e.target.value))}
			className="w-full cursor-pointer"
			style={{ accentColor: 'var(--vscode-button-background)' }}
		/>
		<span className="flex justify-between text-[10px] text-void-fg-4"><span>{left}</span>{hint && <span>{hint}</span>}<span>{right}</span></span>
	</label>
);

// クラス名は className に直接書く (ビルド時の scope-tailwind は className の文字列しか書き換えない)
const PrimaryButton = (props: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
	<button type="button" {...props} className="rounded px-2.5 py-1 text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-40 disabled:cursor-not-allowed" />;

export const AutoRouting = ({ endpoint, accessToken, refreshToken, policy, onChange, prompt }: {
	endpoint: string; accessToken: string; refreshToken: string; policy?: Policy;
	onChange: (p: Policy | undefined) => void; prompt?: string;
}) => {
	const accessor = useAccessor();
	const llmMessageService = accessor.get('ILLMMessageService');

	const enabled = !!policy;
	const [draft, setDraft] = useState<Policy>(policy ?? DEFAULT_POLICY);
	useEffect(() => { if (policy) setDraft(policy); }, [policy]);

	// スライダーを動かしたら、有効なときはそのまま保存する (保存ボタンは置かない)
	const update = (patch: Partial<Policy>) => {
		const next = { ...draft, ...patch };
		setDraft(next);
		setPlan(null);
		if (enabled) onChange(next);
	};

	const [ownInput, setOwnInput] = useState('');
	const input = prompt ?? ownInput;
	const [amountIdx, setAmountIdx] = useState(1);
	const [plan, setPlan] = useState<Plan | null>(null);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [isPaid, setIsPaid] = useState<boolean | null>(null);

	const quoteKey = JSON.stringify([input, amountIdx, draft, accessToken, endpoint]);
	const latestQuoteKey = useRef(quoteKey);
	latestQuoteKey.current = quoteKey;
	useEffect(() => { setPlan(null); }, [input]);

	useEffect(() => {
		let active = true;
		if (!accessToken) { setIsPaid(false); return () => { active = false; }; }
		setIsPaid(null);
		void fetchDivisionProfile(accessToken, refreshToken).then(profile => {
			if (active) setIsPaid(profile?.isPaid === true);
		}).catch(() => { if (active) setIsPaid(false); });
		return () => { active = false; };
	}, [accessToken, refreshToken]);

	const api = async (path: string, body?: unknown) => {
		const res = await llmMessageService.divisionApiRequest({ endpoint, accessToken, path, body });
		if (!res.ok) throw new Error(friendlyError(res.status, res.data, res.error));
		return res.data;
	};
	const run = async (action: () => Promise<void>) => {
		setBusy(true); setError('');
		try { await action(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
	};
	const costIdx = nearestIndex(COST_STEPS, draft.maxCostUsd);
	const lengthIdx = nearestIndex(LENGTH_STEPS, draft.maxOutputTokens);
	const canEstimate = isPaid === true && !!input.trim() && !busy;

	return <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} className="flex flex-col gap-4 border border-void-border-2 rounded-md p-3 text-xs">
		{/* オン / オフ */}
		<div className="flex items-start justify-between gap-3">
			<div className="flex flex-col gap-0.5">
				<strong className="text-sm text-void-fg-1">コストを自動で調整</strong>
				<span className="text-void-fg-3">依頼ごとに、下の条件に合うモデルと回答の長さを選びます。</span>
			</div>
			<button
				type="button" role="switch" aria-checked={enabled} aria-label="コストを自動で調整"
				onClick={() => onChange(enabled ? undefined : draft)}
				className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${enabled ? 'bg-[var(--vscode-button-background)]' : 'bg-void-bg-3 border border-void-border-2'}`}
			>
				<span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
			</button>
		</div>

		{/* 条件 */}
		<div className={`flex flex-col gap-3 ${enabled ? '' : 'opacity-60'}`}>
			<Slider
				label="性能" valueText={`${performanceLabel(draft.minPerformance)}（${draft.minPerformance}）`}
				min={0} max={100} value={draft.minPerformance}
				onChange={v => update({ minPerformance: Math.round(v / 5) * 5 })}
				left="料金を重視" right="性能を重視"
			/>
			<Slider
				label="1 回あたりの上限" valueText={`${formatUsd(COST_STEPS[costIdx])} まで`}
				min={0} max={COST_STEPS.length - 1} value={costIdx}
				onChange={i => update({ maxCostUsd: COST_STEPS[i] })}
				left={formatUsd(COST_STEPS[0])} right={formatUsd(COST_STEPS[COST_STEPS.length - 1])}
			/>
			<Slider
				label="回答の長さ" valueText={`${lengthLabel(LENGTH_STEPS[lengthIdx])}（${LENGTH_STEPS[lengthIdx].toLocaleString()} トークンまで）`}
				min={0} max={LENGTH_STEPS.length - 1} value={lengthIdx}
				onChange={i => update({ maxOutputTokens: LENGTH_STEPS[i] })}
				left="短め" right="長め"
			/>
		</div>

		{/* 見積もり */}
		<div className="flex flex-col gap-2 border-t border-void-border-2 pt-3">
			<strong className="text-void-fg-1">料金の見積もり</strong>
			{prompt === undefined
				? <textarea aria-label="見積もりたい依頼" placeholder="見積もりたい依頼を入力" rows={2}
					className="bg-void-bg-1 border border-void-border-2 rounded p-2 resize-y"
					value={ownInput} onChange={e => setOwnInput(e.target.value)} />
				: <span className="text-void-fg-3">入力中の依頼を見積もります。</span>}
			<Slider
				label="添付ファイルや会話の量" valueText={AMOUNT_LABELS[amountIdx]}
				min={0} max={AMOUNT_STEPS.length - 1} value={amountIdx}
				onChange={i => { setAmountIdx(i); setPlan(null); }}
				left="少ない" right="とても多い"
			/>
			<div className="flex items-center gap-2 flex-wrap">
				<PrimaryButton disabled={!canEstimate} onClick={() => run(async () => {
					const key = quoteKey;
					const data = await api('/api/routing/quote', { input, inputTokens: AMOUNT_STEPS[amountIdx], roles: ['leader', 'coder', 'review'], policy: draft });
					if (latestQuoteKey.current === key) setPlan({ quotes: data?.quotes ?? [], totalEstimateUsd: Number(data?.totalEstimateUsd ?? 0) });
				})}>{busy ? '計算中…' : '見積もる'}</PrimaryButton>
				<span className="text-[10px] text-void-fg-4">見積もり自体にも少額の料金がかかります</span>
			</div>
			{isPaid === false && <span className="text-void-fg-3">見積もりは Plus プランで使えます。</span>}
			{!input.trim() && isPaid === true && <span className="text-void-fg-4">{prompt === undefined ? '依頼を入力すると見積もれます。' : '入力欄に依頼を書くと見積もれます。'}</span>}
			{plan && <div className="flex flex-col gap-1.5 rounded bg-void-bg-2 p-2">
				<span className="text-sm text-void-fg-1">合計 約 <strong>{formatUsd(plan.totalEstimateUsd)}</strong></span>
				{plan.quotes.map(q => <span key={q.role} className="flex justify-between gap-2 text-void-fg-3">
					<span>{roleLabel(q.role)}{q.model ? <span className="text-void-fg-4"> · {q.model}</span> : null}</span>
					<span>{formatUsd(q.totalCostUsd)}</span>
				</span>)}
				<span className="text-[10px] text-void-fg-4">目安です。実際の料金は実行時の内容で決まります。</span>
			</div>}
		</div>

		{error && <p role="alert" className="text-red-400">{error}</p>}
	</div>;
};
