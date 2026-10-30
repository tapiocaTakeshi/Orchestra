/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { getDivisionSupabase } from '../division-session/index.js';
import { restoreDivisionAuthSession } from '../../../../common/divisionSession.js';
export { getDivisionSupabase } from '../division-session/index.js';
import {
	DIVISION_API_BASE_URL,
	DIVISION_API_KEY_TABLE,
	DIVISION_PROFILES_TABLE,
} from '../../../../common/divisionAuthConfig.js';

let _profileUnsubscribe: (() => void) | null = null;

type RemoteSessionAuth = {
	userId: string;
	email: string;
	accessToken: string;
};

/**
 * Tells the local Electron gateway which signed-in Division account owns this
 * desktop. The gateway verifies the JWT against Supabase before publishing a
 * RemoteSession, so a phone only discovers desktops belonging to its own
 * Division account. This is intentionally a loopback request, never a cloud
 * request from another device.
 */
export const syncMobileRemoteSession = async (auth: RemoteSessionAuth | null): Promise<void> => {
	// Every React bundle calls this on every settings change, so only send when
	// the signed-in account actually changed. The key lives on globalThis because
	// each bundle has its own copy of this module.
	const key = auth ? `${auth.userId}\n${auth.accessToken}` : '';
	const g = globalThis as { __orchestraMobileSessionKey?: string };
	if (g.__orchestraMobileSessionKey === key) return;
	g.__orchestraMobileSessionKey = key;
	try {
		await fetch('http://127.0.0.1:39231/api/internal/division-session', {
			method: auth ? 'POST' : 'DELETE',
			headers: auth ? { 'Content-Type': 'application/json' } : undefined,
			body: auth ? JSON.stringify(auth) : undefined,
		});
	} catch {
		// The gateway is unavailable in the browser/web build. Login itself must
		// remain usable there; forget the key so the next change retries.
		g.__orchestraMobileSessionKey = undefined;
	}
};

export type DivisionAuthResult = {
	userId: string;
	email: string;
	accessToken: string;
	refreshToken: string;
	apiKey: string;
	plan: 'free' | 'plus';
};

/**
 * ユーザーのプラン情報を取得する（有料プランかどうかを判定するため）
 */
const fetchUserPlanAndApiKey = async (userId: string, accessToken: string): Promise<{ plan: 'free' | 'plus'; apiKey: string | null }> => {
	try {
		const sb = getDivisionSupabase();
		const { data, error } = await sb
			.from(DIVISION_PROFILES_TABLE)
			.select('plan, division_api_key')
			.eq('id', userId)
			.maybeSingle();

		if (error || !data) {
			return { plan: 'free', apiKey: null };
		}

		return {
			plan: (data.plan as 'free' | 'plus') ?? 'free',
			apiKey: (data.division_api_key as string) ?? null,
		};
	} catch {
		return { plan: 'free', apiKey: null };
	}
};

/**
 * Supabase の "ApiKey" テーブルから、現在ログイン中のユーザーの
 * 有効な API キーを 1 件取得する。1 件も無い場合は Division API
 * (`POST /api/api-keys`) を叩いて新規作成する。
 *
 * RLS (Row Level Security) が設定されていれば自分の userId に紐づく
 * 行しか select できない。RLS 未設定でも `userId` の where 句で絞る。
 */
const fetchOrCreateDivisionApiKey = async (
	userId: string,
	accessToken: string,
): Promise<string> => {
	const sb = getDivisionSupabase();

	const { data, error } = await sb
		.from(DIVISION_API_KEY_TABLE)
		.select('key, revoked, createdAt')
		.eq('userId', userId)
		.eq('revoked', false)
		.order('createdAt', { ascending: false })
		.limit(1);

	if (error) {
		throw new Error(`Supabase 上の ApiKey クエリに失敗しました: ${error.message}`);
	}

	const row = (data ?? [])[0] as { key?: string } | undefined;
	if (row?.key) {
		return row.key;
	}

	const res = await fetch(`${DIVISION_API_BASE_URL}/api/api-keys`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${accessToken}`,
		},
		body: JSON.stringify({ name: 'orchestra' }),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`Division API キーの作成に失敗しました (HTTP ${res.status}): ${text}`);
	}

	const json = (await res.json()) as { key?: string };
	if (!json.key) {
		throw new Error('Division API がキーを返しませんでした。');
	}
	return json.key;
};

/**
 * Division の Web サイトでのログイン (リダイレクト方式) を完了する。
 * サイトが orchestra://division-auth/callback に載せてきた 1 回限りの token_hash を
 * verifyOtp で IDE 専用の Supabase セッションに交換し、プランと API キーまで取得する。
 */
export const completeDivisionBrowserLogin = async (tokenHash: string): Promise<DivisionAuthResult> => {
	const sb = getDivisionSupabase();

	const { data, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
	if (error) throw new Error(error.message);

	const session = data.session;
	const user = data.user;
	if (!session || !user) {
		throw new Error('Supabase セッションを取得できませんでした。');
	}

	const { plan, apiKey: embeddedApiKey } = await fetchUserPlanAndApiKey(user.id, session.access_token);
	let apiKey = embeddedApiKey ?? '';

	// 有料プラン（Plus）の場合のみ API キーを自動設定
	if (plan === 'plus' && !apiKey) {
		apiKey = await fetchOrCreateDivisionApiKey(user.id, session.access_token);
	}

	return {
		userId: user.id,
		email: user.email ?? '',
		accessToken: session.access_token,
		refreshToken: session.refresh_token ?? '',
		apiKey,
		plan,
	};
};

/**
 * 既存の refreshToken からセッションを復元し、Division API キーを再取得する。
 * 設定の永続化済みトークンから無人で再ログインする用途。
 * 有料プラン（Plus）のユーザーのみ API キーを自動設定する。
 */
export const restoreDivisionSession = async (
	accessToken: string,
	refreshToken: string,
): Promise<DivisionAuthResult | null> => {
	if (!accessToken && !refreshToken) return null;
	try {
		if (!await restoreDivisionAuthSession(accessToken, refreshToken)) return null;
		const sb = getDivisionSupabase();
		const { data, error } = await sb.auth.getUser();
		if (error || !data.user) return null;
		const user = data.user;

		// セッションが refresh された可能性があるので最新を取り直す
		const { data: sessData } = await sb.auth.getSession();
		const newAccess = sessData.session?.access_token ?? accessToken;
		const newRefresh = sessData.session?.refresh_token ?? refreshToken;

		const { plan, apiKey: embeddedApiKey } = await fetchUserPlanAndApiKey(user.id, newAccess);
		let apiKey = embeddedApiKey ?? '';

		// 有料プラン（Plus）の場合のみ API キーを自動設定
		// 埋め込みキーがなければ、API キーを作成または取得
		if (plan === 'plus' && !apiKey) {
			apiKey = await fetchOrCreateDivisionApiKey(user.id, newAccess);
		}

		return {
			userId: user.id,
			email: user.email ?? '',
			accessToken: newAccess,
			refreshToken: newRefresh,
			apiKey,
			plan,
		};
	} catch {
		return null;
	}
};

export const signOutDivision = async (): Promise<void> => {
	try {
		const sb = getDivisionSupabase();
		await sb.auth.signOut();
	} catch {
		// best-effort
	}
};

export type ProfileChangeCallback = (update: {
	plan: 'free' | 'plus';
	apiKey: string | null;
}) => void;

/**
 * ユーザーのプロフィール変更をリアルタイムで監視し、
 * プランまたは API キーが変更されたときにコールバックを実行する。
 *
 * 既にログイン中のユーザーがプランをアップグレードした場合、
 * 再ログインなしに自動的に最新のプラン情報と API キーを取得できる。
 *
 * @param userId - 監視するユーザーID
 * @param callback - プロフィール変更時に実行するコールバック
 * @returns アンサブスクライブ関数
 */
export const subscribeToProfileChanges = (
	userId: string,
	callback: ProfileChangeCallback,
): (() => void) => {
	const sb = getDivisionSupabase();

	// 既存のサブスクリプションがあればクリア
	if (_profileUnsubscribe) {
		_profileUnsubscribe();
	}

	// リアルタイムリスナーを設定
	const channel = sb
		.channel(`profile-${userId}`)
		.on(
			'postgres_changes',
			{
				event: 'UPDATE',
				schema: 'public',
				table: DIVISION_PROFILES_TABLE,
				filter: `id=eq.${userId}`,
			},
			(payload) => {
				const newRecord = payload.new as { plan?: string; division_api_key?: string | null } | undefined;
				if (newRecord) {
					callback({
						plan: (newRecord.plan as 'free' | 'plus') ?? 'free',
						apiKey: (newRecord.division_api_key as string) ?? null,
					});
				}
			},
		)
		.subscribe();

	// アンサブスクライブ関数を作成
	const unsubscribe = () => {
		channel.unsubscribe();
		_profileUnsubscribe = null;
	};

	_profileUnsubscribe = unsubscribe;
	return unsubscribe;
};
