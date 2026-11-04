/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// アップデートしても設定 (ログイン・API キー・モデル選択など) が消えないようにするための控え。
//
// 設定全体は safeStorage (macOS ではキーチェーン) で暗号化して保存している。
// macOS 版はアドホック署名なので、アップデートでアプリが置き換わると署名が変わり、
// キーチェーンの鍵を読めなくなって復号に失敗することがある。以前はその時点で設定が
// 初期値に戻り、ログインも切れていた。
//
// そこで同じ設定を、暗号鍵に依存しない形で別キーにも保存しておき、復号できないときは
// そちらから読む。保存先はユーザーのプロファイルディレクトリの中だけで、
// StorageTarget.MACHINE なので設定同期でも外に出ない。

export type ReadSettingsResult<T> =
	| { kind: 'encrypted'; state: T }
	| { kind: 'backup'; state: T }
	| { kind: 'none' };

/**
 * 暗号化された設定を優先して読み、読めなければ控えから読む。
 * どちらも無い・壊れているときは 'none' (呼び出し側で初期値にする)。
 */
export async function readSettingsWithFallback<T>(
	encrypted: string | undefined,
	backup: string | undefined,
	decrypt: (value: string) => Promise<string>,
): Promise<ReadSettingsResult<T>> {
	if (encrypted) {
		try {
			return { kind: 'encrypted', state: JSON.parse(await decrypt(encrypted)) as T };
		} catch (e) {
			console.warn('[VoidSettingsService] Could not decrypt settings; using the backup copy.', e);
		}
	}
	if (backup) {
		try {
			const state = JSON.parse(backup) as T;
			if (state && typeof state === 'object') return { kind: 'backup', state };
		} catch {
			// 壊れた控えは無視する
		}
	}
	return { kind: 'none' };
}
