/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// アップデートしてもログインが切れないようにするための、ログイン情報の控え。
//
// 設定全体は safeStorage (macOS ではキーチェーン) で暗号化して保存している。
// macOS 版はアドホック署名なので、アップデートでアプリが置き換わると署名が変わり、
// キーチェーンの鍵を読めなくなって復号に失敗することがある。以前はその時点で設定が
// 初期値に戻り、ログインも切れていた。
//
// そこでログインに必要な項目だけを、暗号鍵に依存しない形で別キーにも保存しておき、
// 復号に失敗したときはそこから戻す。Supabase JS の既定 (localStorage に平文保存) と
// 同じ扱いで、ユーザーのプロファイルディレクトリの外には出ない。ログアウトすると消える。

import type { GlobalSettings } from './voidSettingsTypes.js';

export const DIVISION_AUTH_BACKUP_KEYS = [
	'isLoggedIn',
	'divisionUserId',
	'divisionUserEmail',
	'divisionAccessToken',
	'divisionRefreshToken',
	'divisionApiKey',
	'divisionUserApiKey',
] as const satisfies readonly (keyof GlobalSettings)[];

export type DivisionAuthBackup = Pick<GlobalSettings, typeof DIVISION_AUTH_BACKUP_KEYS[number]>;

/** ログイン中ならログイン情報の控えを JSON で返す。ログアウト中は undefined (控えを消す) */
export function serializeDivisionAuthBackup(g: GlobalSettings): string | undefined {
	if (!g.isLoggedIn || !g.divisionUserId || (!g.divisionAccessToken && !g.divisionRefreshToken)) return undefined;
	const backup = {} as Record<string, unknown>;
	for (const key of DIVISION_AUTH_BACKUP_KEYS) backup[key] = g[key];
	return JSON.stringify(backup);
}

/** 控えを読む。壊れている・ログイン情報として足りない場合は undefined */
export function parseDivisionAuthBackup(raw: string | undefined): DivisionAuthBackup | undefined {
	if (!raw) return undefined;
	try {
		const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
		if (!parsed || typeof parsed !== 'object') return undefined;
		const str = (v: unknown) => typeof v === 'string' ? v : '';
		const backup: DivisionAuthBackup = {
			isLoggedIn: parsed.isLoggedIn === true,
			divisionUserId: str(parsed.divisionUserId),
			divisionUserEmail: str(parsed.divisionUserEmail),
			divisionAccessToken: str(parsed.divisionAccessToken),
			divisionRefreshToken: str(parsed.divisionRefreshToken),
			divisionApiKey: str(parsed.divisionApiKey),
			divisionUserApiKey: str(parsed.divisionUserApiKey),
		};
		if (!backup.isLoggedIn || !backup.divisionUserId || (!backup.divisionAccessToken && !backup.divisionRefreshToken)) return undefined;
		return backup;
	} catch {
		return undefined;
	}
}
