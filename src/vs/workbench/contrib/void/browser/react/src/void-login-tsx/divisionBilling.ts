/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { getDivisionSupabase } from './divisionAuth.js';
import {
	DIVISION_FUNCTIONS_BASE_URL,
	DIVISION_PROFILES_TABLE,
} from '../../../../common/divisionAuthConfig.js';

export type DivisionPlanId = 'free' | 'plus';

export const divisionPlans: {
	id: DivisionPlanId;
	name: string;
	priceLabel: string;
	features: string[];
}[] = [
	{ id: 'free', name: 'Free', priceLabel: '¥0 / 月', features: ['基本機能', '個人利用向け'] },
	{ id: 'plus', name: 'Plus', priceLabel: '¥3,000 / 月', features: ['利用上限アップ', '優先サポート'] },
];

export type DivisionProfile = {
	plan: DivisionPlanId;
	subscriptionStatus: string | null;
	currentPeriodEnd: string | null;
	creditBalance: number;
	creditUsed: number;
	hasStripeCustomer: boolean;
};

/**
 * 保存済みの access/refresh トークンで Supabase セッションを復元し、
 * 現在ログイン中ユーザーの `profiles` 行（プラン・請求情報）を取得する。
 */
export const fetchDivisionProfile = async (
	accessToken: string,
	refreshToken: string,
): Promise<DivisionProfile | null> => {
	if (!accessToken) return null;
	const sb = getDivisionSupabase();
	await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

	const { data: userData, error: userError } = await sb.auth.getUser();
	if (userError || !userData.user) return null;

	const { data, error } = await sb
		.from(DIVISION_PROFILES_TABLE)
		.select('plan, subscription_status, current_period_end, credit_balance, credit_used, stripe_customer_id')
		.eq('id', userData.user.id)
		.maybeSingle();

	if (error || !data) return null;

	return {
		plan: (data.plan as DivisionPlanId) ?? 'free',
		subscriptionStatus: data.subscription_status ?? null,
		currentPeriodEnd: data.current_period_end ?? null,
		creditBalance: Number(data.credit_balance ?? 0),
		creditUsed: Number(data.credit_used ?? 0),
		hasStripeCustomer: !!data.stripe_customer_id,
	};
};

const callBillingFunction = async (path: string, accessToken: string, body?: unknown): Promise<{ url: string }> => {
	const res = await fetch(`${DIVISION_FUNCTIONS_BASE_URL}/${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${accessToken}`,
		},
		body: JSON.stringify(body ?? {}),
	});

	const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
	if (!res.ok || !json.url) {
		throw new Error(json.error || `リクエストに失敗しました (HTTP ${res.status})`);
	}
	return { url: json.url };
};

/**
 * 指定プランの Stripe Checkout セッションを作成し、遷移用 URL を返す。
 */
export const createDivisionCheckoutSession = async (
	accessToken: string,
	planId: Exclude<DivisionPlanId, 'free'>,
): Promise<string> => {
	const { url } = await callBillingFunction('create-checkout-session', accessToken, { planId });
	return url;
};

/**
 * 支払い方法の変更・請求履歴確認などを行う Stripe Billing Portal の URL を返す。
 */
export const createDivisionPortalSession = async (accessToken: string): Promise<string> => {
	const { url } = await callBillingFunction('create-billing-portal-session', accessToken);
	return url;
};
