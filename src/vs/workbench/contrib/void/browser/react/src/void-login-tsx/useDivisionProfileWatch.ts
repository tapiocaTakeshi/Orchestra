/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useEffect, useRef } from 'react';
import { subscribeToProfileChanges, ProfileChangeCallback } from './divisionAuth.js';

/**
 * ユーザーのプロフィール変更をリアルタイムで監視する React Hook。
 * ログイン後に呼び出すことで、プランやAPIキーの変更を自動的に検出できる。
 *
 * 使用例:
 * ```
 * const { plan, apiKey } = useAuth();
 * useDivisionProfileWatch(userId, (update) => {
 *   // プラン情報が変更されたときに実行される
 *   // 認証コンテキストを更新する
 *   setAuth({ ...auth, plan: update.plan, apiKey: update.apiKey });
 * });
 * ```
 *
 * @param userId - 監視するユーザーID（ログイン後に利用可能）
 * @param onProfileChange - プロフィール変更時のコールバック関数
 */
export const useDivisionProfileWatch = (
	userId: string | null,
	onProfileChange: ProfileChangeCallback,
): void => {
	const unsubscribeRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		// userIdがない場合は監視を開始しない
		if (!userId) {
			return;
		}

		// リアルタイム監視を開始
		unsubscribeRef.current = subscribeToProfileChanges(userId, onProfileChange);

		// クリーンアップ: コンポーネントがアンマウントされたときにリスナーを削除
		return () => {
			if (unsubscribeRef.current) {
				unsubscribeRef.current();
				unsubscribeRef.current = null;
			}
		};
	}, [userId, onProfileChange]);
};
