/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import { useAccessor, useIsDark, useSettingsState } from '../util/services.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { X, CreditCard, Loader2, CheckCircle2 } from 'lucide-react';
import {
	createDivisionCheckoutSession,
	createDivisionPortalSession,
	divisionPlans,
	fetchDivisionProfile,
	type DivisionPlanId,
	type DivisionProfile,
} from './divisionBilling.js';

export const BillingPanel = ({ onClose }: { onClose: () => void }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const openerService = accessor.get('IOpenerService');
	const settingsState = useSettingsState();

	const accessToken = settingsState.globalSettings.divisionAccessToken;
	const refreshToken = settingsState.globalSettings.divisionRefreshToken;

	const [profile, setProfile] = useState<DivisionProfile | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [pendingPlan, setPendingPlan] = useState<DivisionPlanId | null>(null);
	const [portalLoading, setPortalLoading] = useState(false);

	const loadProfile = async () => {
		setLoading(true);
		setError('');
		try {
			const p = await fetchDivisionProfile(accessToken, refreshToken);
			if (!p) throw new Error('プラン情報の取得に失敗しました。');
			setProfile(p);
		} catch (err: any) {
			setError(err?.message || 'プラン情報の取得に失敗しました。');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadProfile();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const openExternal = async (url: string) => {
		await openerService.open(URI.parse(url));
	};

	const handleChoosePlan = async (planId: Exclude<DivisionPlanId, 'free'>) => {
		if (pendingPlan) return;
		setError('');
		setPendingPlan(planId);
		try {
			const url = await createDivisionCheckoutSession(accessToken, planId);
			await openExternal(url);
		} catch (err: any) {
			setError(err?.message || 'Checkout の開始に失敗しました。');
		} finally {
			setPendingPlan(null);
		}
	};

	const handleManagePayment = async () => {
		if (portalLoading) return;
		setError('');
		setPortalLoading(true);
		try {
			const url = await createDivisionPortalSession(accessToken);
			await openExternal(url);
		} catch (err: any) {
			setError(err?.message || '支払い方法の管理画面を開けませんでした。');
		} finally {
			setPortalLoading(false);
		}
	};

	const currentPlan = profile?.plan ?? 'free';

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100000] p-4">
				<div className="bg-void-bg-1 border border-void-border-1 rounded-xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col p-8 gap-6 animate-in fade-in zoom-in duration-300">
					<button
						onClick={onClose}
						className="absolute top-4 right-4 text-void-fg-3 hover:text-void-fg-1 p-1 rounded-md transition-colors"
						type="button"
					>
						<X size={20} />
					</button>

					<div className="flex flex-col gap-1">
						<h1 className="text-xl font-bold text-void-fg-1">プラン・支払い方法</h1>
						<p className="text-sm text-void-fg-3">Orchestra のプランと Stripe 上の支払い方法を管理します。</p>
					</div>

					{loading ? (
						<div className="flex items-center justify-center gap-2 py-8 text-void-fg-3 text-sm">
							<Loader2 size={16} className="animate-spin" />
							読み込み中…
						</div>
					) : (
						<>
							{error && (
								<div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5">
									{error}
								</div>
							)}

							{profile && (
								<div className="text-xs text-void-fg-3 bg-void-bg-2 border border-void-border-2 rounded-lg px-3 py-2 flex flex-col gap-0.5">
									<div>
										現在のステータス:{' '}
										<span className="text-void-fg-1 font-medium">{profile.subscriptionStatus ?? '無料プラン'}</span>
									</div>
									{profile.currentPeriodEnd && (
										<div>次回更新日: {new Date(profile.currentPeriodEnd).toLocaleDateString('ja-JP')}</div>
									)}
									<div>
										クレジット残高: {profile.creditBalance.toFixed(2)} USD（使用済み {profile.creditUsed.toFixed(2)} USD）
									</div>
								</div>
							)}

							<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
								{divisionPlans.map((plan) => {
									const isCurrent = plan.id === currentPlan;
									return (
										<div
											key={plan.id}
											className={`flex flex-col gap-2 rounded-lg border p-3 ${
												isCurrent ? 'border-[#dc2626] bg-[#dc2626]/5' : 'border-void-border-2 bg-void-bg-2'
											}`}
										>
											<div className="flex items-center justify-between">
												<span className="font-semibold text-void-fg-1 text-sm">{plan.name}</span>
												{isCurrent && <CheckCircle2 size={14} className="text-[#dc2626]" />}
											</div>
											<div className="text-xs text-void-fg-3">{plan.priceLabel}</div>
											<ul className="text-[10px] text-void-fg-3 flex flex-col gap-0.5 list-disc list-inside">
												{plan.features.map((f) => (
													<li key={f}>{f}</li>
												))}
											</ul>
											{plan.id !== 'free' && !isCurrent && (
												<button
													type="button"
													disabled={pendingPlan !== null}
													onClick={() => handleChoosePlan(plan.id as Exclude<DivisionPlanId, 'free'>)}
													className="mt-1 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-[#dc2626] hover:bg-[#b91c1c] disabled:opacity-60 text-white text-xs font-medium transition-all"
												>
													{pendingPlan === plan.id ? (
														<Loader2 size={12} className="animate-spin" />
													) : (
														'このプランにする'
													)}
												</button>
											)}
										</div>
									);
								})}
							</div>

							<button
								type="button"
								disabled={portalLoading}
								onClick={handleManagePayment}
								className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-void-border-2 hover:bg-void-bg-3 disabled:opacity-60 text-void-fg-1 text-sm font-medium transition-all"
							>
								{portalLoading ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
								支払い方法・請求履歴を管理（Stripe）
							</button>

							<p className="text-[10px] text-void-fg-3 text-center">
								プラン変更・支払い方法の登録はブラウザで開く Stripe の安全な画面で行われます。
							</p>
						</>
					)}
				</div>
			</div>
		</div>
	);
};
