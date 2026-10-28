/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// 設定画面の「コスト管理」タブ。
//
// チャットの「コスト調整」チップ (SidebarChat.tsx の CostTuningDropdown) と同じ AutoRouting を、チャットを開かずに
// 使えるようにする (右のチャットを隠すクラウドエージェントモードでも、コマンド / タイトルバー / 左の列から開ける)。
// あわせて、クレジットの残高とプラン (divisionBilling)、クラウドエージェントごとの料金 (costUsd) をまとめて見せる。

import React, { useCallback, useEffect, useState } from 'react';
import { Coins, Loader2, RefreshCw } from 'lucide-react';
import { useAccessor, useCloudAgentState, useSettingsState } from '../util/services.js';
import { useTranslation } from '../util/i18n.js';
import { AutoRouting } from './AutoRouting.js';
import { fetchDivisionProfile, divisionPlans, type DivisionProfile } from '../void-login-tsx/divisionBilling.js';
import { formatCloudCostUsd, sumCloudCostUsd } from '../../../../common/cloudAgentTypes.js';

const DEFAULT_DIVISION_ENDPOINT = 'https://api.division.he-ro.io';

const Card = ({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) => (
	<div className='flex flex-col gap-3'>
		<div className='flex items-start justify-between gap-3'>
			<div className='flex flex-col gap-0.5'>
				<h3 className='text-xl text-void-fg-1'>{title}</h3>
				{subtitle && <span className='text-void-fg-3 text-sm'>{subtitle}</span>}
			</div>
			{action}
		</div>
		{children}
	</div>
);

/** クレジットの残高・使用済み・プラン */
const CreditsCard = ({ onOpenBilling }: { onOpenBilling: () => void }) => {
	const { t } = useTranslation();
	const settings = useSettingsState();
	const accessToken = settings.globalSettings.divisionAccessToken;
	const refreshToken = settings.globalSettings.divisionRefreshToken;
	const isLoggedIn = !!settings.globalSettings.isLoggedIn && !!accessToken;

	const [profile, setProfile] = useState<DivisionProfile | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);

	const load = useCallback(async () => {
		if (!isLoggedIn) return;
		setLoading(true);
		setError(false);
		try {
			const p = await fetchDivisionProfile(accessToken, refreshToken);
			setProfile(p);
			setError(!p);
		} catch {
			setError(true);
		} finally {
			setLoading(false);
		}
	}, [isLoggedIn, accessToken, refreshToken]);

	useEffect(() => { void load(); }, [load]);

	const planName = profile ? (divisionPlans.find(p => p.id === profile.plan)?.name ?? profile.plan) : '';

	return (
		<Card
			title={t('cost.credits.title')}
			action={isLoggedIn ? (
				<button type='button' onClick={() => { void load(); }} title={t('cost.credits.reload')} className='p-1 rounded text-void-fg-3 hover:text-void-fg-1 hover:bg-[color-mix(in_srgb,var(--void-fg-1)_6%,transparent)]'>
					{loading ? <Loader2 size={14} className='animate-spin' /> : <RefreshCw size={14} />}
				</button>
			) : undefined}
		>
			{!isLoggedIn ? (
				<span className='text-void-fg-3 text-sm'>{t('cost.loginRequired')}</span>
			) : error ? (
				<span className='text-sm text-[var(--vscode-errorForeground)]'>{t('cost.credits.error')}</span>
			) : !profile ? (
				<span className='text-void-fg-3 text-sm'>{t('cost.credits.loading')}</span>
			) : (
				<div className='grid grid-cols-3 gap-2 max-w-xl'>
					{[
						{ label: t('cost.credits.plan'), value: planName },
						{ label: t('cost.credits.balance'), value: `${profile.creditBalance.toFixed(2)} USD` },
						{ label: t('cost.credits.used'), value: `${profile.creditUsed.toFixed(2)} USD` },
					].map(item => (
						<div key={item.label} className='flex flex-col gap-1 p-3 rounded-lg bg-void-bg-1 border border-void-border-3'>
							<span className='text-xs text-void-fg-3'>{item.label}</span>
							<span className='text-lg text-void-fg-1 font-medium'>{item.value}</span>
						</div>
					))}
				</div>
			)}
			{isLoggedIn && (
				<button
					type='button'
					onClick={onOpenBilling}
					className='flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-void-border-2 hover:bg-void-bg-2 text-void-fg-1 text-sm font-medium transition-colors w-fit'
				>
					{t('general.account.manageBilling')}
				</button>
			)}
		</Card>
	);
};

/** コストの自動調整 (チャットの「コスト調整」と同じ設定 divisionAutoRouting) */
const AutoRoutingCard = () => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const settingsState = useSettingsState();
	return (
		<Card title={t('cost.autoRouting.title')} subtitle={t('cost.autoRouting.subtitle')}>
			<div className='max-w-xl'>
				<AutoRouting
					endpoint={settingsState.settingsOfProvider.divisionAPI?.endpoint || DEFAULT_DIVISION_ENDPOINT}
					accessToken={settingsState.globalSettings.divisionAccessToken}
					refreshToken={settingsState.globalSettings.divisionRefreshToken}
					policy={settingsState.globalSettings.divisionAutoRouting}
					onChange={newPolicy => {
						const settings = accessor.get('IVoidSettingsService');
						settings.setGlobalSetting('divisionAutoRouting', newPolicy);
						// SidebarChat の CostTuningDropdown と同じ: 有効にしたら、チャットのモデルを Division (自動割り当て) にする
						if (newPolicy && settings.state.modelSelectionOfFeature.Chat?.providerName !== 'divisionAPI') {
							settings.setModelSelectionOfFeature('Chat', { providerName: 'divisionAPI', modelName: 'division-orchestrator' });
						}
					}}
				/>
			</div>
		</Card>
	);
};

/** クラウドエージェントごとの料金 (サーバーが costUsd を付けたものだけ) */
const CloudUsageCard = () => {
	const { t } = useTranslation();
	const accessor = useAccessor();
	const cloudAgentService = accessor.get('ICloudAgentService');
	const state = useCloudAgentState();
	const withCost = state.sessions
		.filter(s => typeof s.costUsd === 'number' && Number.isFinite(s.costUsd))
		.sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));
	const total = sumCloudCostUsd(withCost);

	const openAgent = (id: string | null) => {
		cloudAgentService.select(id);
		void cloudAgentService.openPane();
	};

	return (
		<Card
			title={t('cost.cloud.title')}
			subtitle={t('cost.cloud.subtitle')}
			action={state.isLoggedIn ? (
				<button type='button' onClick={() => { void cloudAgentService.refresh(); }} title={t('cost.credits.reload')} className='p-1 rounded text-void-fg-3 hover:text-void-fg-1 hover:bg-[color-mix(in_srgb,var(--void-fg-1)_6%,transparent)]'>
					{state.loading ? <Loader2 size={14} className='animate-spin' /> : <RefreshCw size={14} />}
				</button>
			) : undefined}
		>
			{!state.isLoggedIn ? (
				<span className='text-void-fg-3 text-sm'>{t('cost.loginRequired')}</span>
			) : withCost.length === 0 ? (
				<span className='text-void-fg-3 text-sm'>{t('cost.cloud.empty')}</span>
			) : (
				<div className='flex flex-col max-w-xl rounded-lg border border-void-border-3 bg-void-bg-1 overflow-hidden'>
					{withCost.slice(0, 50).map(s => (
						<button
							key={s.id}
							type='button'
							title={t('cost.cloud.openAgent')}
							onClick={() => openAgent(s.id)}
							className='flex items-center gap-3 px-3 py-2 text-left text-sm text-void-fg-1 hover:bg-[color-mix(in_srgb,var(--void-fg-1)_6%,transparent)] border-b border-[color-mix(in_srgb,var(--void-border-2)_60%,transparent)] last:border-b-0'
						>
							<span className='flex-1 min-w-0 truncate'>{s.title || s.prompt.split('\n')[0] || s.id}</span>
							<span className='text-xs text-void-fg-3 shrink-0'>{s.modelLabel || ''}</span>
							<span className='font-mono text-xs shrink-0'>{formatCloudCostUsd(s.costUsd ?? 0)}</span>
						</button>
					))}
					<div className='flex items-center gap-3 px-3 py-2 text-sm bg-void-bg-2'>
						<Coins size={13} className='text-void-fg-3' />
						<span className='flex-1 text-void-fg-2'>{t('cost.cloud.total')}</span>
						<span className='font-mono text-void-fg-1'>{formatCloudCostUsd(total ?? 0)}</span>
					</div>
				</div>
			)}
			<button type='button' onClick={() => openAgent(state.selectedId)} className='text-sm text-void-link-color hover:underline w-fit'>
				{t('cost.cloud.openAll')}
			</button>
		</Card>
	);
};

export const CostManagementSettings = ({ onOpenBilling }: { onOpenBilling: () => void }) => (
	<div className='flex flex-col gap-10'>
		<CreditsCard onOpenBilling={onOpenBilling} />
		<AutoRoutingCard />
		<CloudUsageCard />
	</div>
);
