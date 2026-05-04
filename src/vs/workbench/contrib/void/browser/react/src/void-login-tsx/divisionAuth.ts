/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
	DIVISION_API_BASE_URL,
	DIVISION_API_KEY_TABLE,
	DIVISION_SUPABASE_ANON_KEY,
	DIVISION_SUPABASE_URL,
} from '../../../../common/divisionAuthConfig.js';

let _client: SupabaseClient | null = null;

/**
 * Division (Supabase) クライアントのシングルトン。
 * Anon Key で初期化し、ユーザーの JWT は signInWithPassword 等で
 * 内部的に保持される。
 */
export const getDivisionSupabase = (): SupabaseClient => {
	if (_client) return _client;
	_client = createClient(DIVISION_SUPABASE_URL, DIVISION_SUPABASE_ANON_KEY, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false,
		},
	});
	return _client;
};

export type DivisionAuthResult = {
	userId: string;
	email: string;
	accessToken: string;
	refreshToken: string;
	apiKey: string;
};

/**
 * 指定された access_token / refresh_token で Supabase クライアントの
 * セッションを復元する（次のクエリから JWT 認証として扱われる）。
 */
const restoreSession = async (accessToken: string, refreshToken: string) => {
	const sb = getDivisionSupabase();
	await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
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
 * Email / Password で Supabase にサインインし、Division API キーまで取得する。
 */
export const signInWithDivision = async (
	email: string,
	password: string,
): Promise<DivisionAuthResult> => {
	const sb = getDivisionSupabase();

	const { data, error } = await sb.auth.signInWithPassword({ email, password });
	if (error) throw new Error(error.message);

	const session = data.session;
	const user = data.user;
	if (!session || !user) {
		throw new Error('Supabase セッションを取得できませんでした。');
	}

	const apiKey = await fetchOrCreateDivisionApiKey(user.id, session.access_token);

	return {
		userId: user.id,
		email: user.email ?? email,
		accessToken: session.access_token,
		refreshToken: session.refresh_token ?? '',
		apiKey,
	};
};

/**
 * 既存の refreshToken からセッションを復元し、Division API キーを再取得する。
 * 設定の永続化済みトークンから無人で再ログインする用途。
 */
export const restoreDivisionSession = async (
	accessToken: string,
	refreshToken: string,
): Promise<DivisionAuthResult | null> => {
	if (!accessToken && !refreshToken) return null;
	try {
		await restoreSession(accessToken, refreshToken);
		const sb = getDivisionSupabase();
		const { data, error } = await sb.auth.getUser();
		if (error || !data.user) return null;
		const user = data.user;

		// セッションが refresh された可能性があるので最新を取り直す
		const { data: sessData } = await sb.auth.getSession();
		const newAccess = sessData.session?.access_token ?? accessToken;
		const newRefresh = sessData.session?.refresh_token ?? refreshToken;

		const apiKey = await fetchOrCreateDivisionApiKey(user.id, newAccess);
		return {
			userId: user.id,
			email: user.email ?? '',
			accessToken: newAccess,
			refreshToken: newRefresh,
			apiKey,
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
