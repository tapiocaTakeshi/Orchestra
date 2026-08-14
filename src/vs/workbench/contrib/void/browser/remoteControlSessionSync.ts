/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Division アカウントにログイン中 & リモートコントロールが有効な間、自分の LAN 接続情報を
// Supabase の "RemoteSession" テーブルへ定期的に upsert (ハートビート) する。
// orchestra-mobile は同じアカウントでログインすると、この行を見て自動的に接続先候補として表示する。
//
// @supabase/supabase-js は使わず、raw fetch + PostgREST で叩く (divisionProjectService.ts の
// _supabaseUpsert/_supabaseRpc と同じ方針)。RemoteSession の RLS は `auth.uid() = "userId"` な
// ので、Authorization ヘッダには anon key ではなく「ユーザーの Supabase JWT」
// (voidSettingsService の divisionAccessToken) を渡す必要がある点に注意。

import { DIVISION_SUPABASE_ANON_KEY, DIVISION_SUPABASE_URL } from '../common/divisionAuthConfig.js';
import { RemoteControlConnectionInfo } from '../common/remoteControlTypes.js';

const REMOTE_SESSION_TABLE = 'RemoteSession';
const HEARTBEAT_INTERVAL_MS = 25_000;

export type RemoteSessionHeartbeatInput = {
	deviceId: string;
	userId: string;
	accessToken: string;
	deviceLabel: string;
	info: RemoteControlConnectionInfo;
};

const upsertRemoteSession = async (input: RemoteSessionHeartbeatInput): Promise<void> => {
	const row = {
		id: input.deviceId,
		userId: input.userId,
		deviceLabel: input.deviceLabel,
		lanUrl: input.info.url,
		token: input.info.token,
		protocolVersion: 1,
		lastSeenAt: new Date().toISOString(),
	};
	try {
		const res = await fetch(`${DIVISION_SUPABASE_URL}/rest/v1/${REMOTE_SESSION_TABLE}?on_conflict=id`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'apikey': DIVISION_SUPABASE_ANON_KEY,
				'Authorization': `Bearer ${input.accessToken}`,
				'Prefer': 'resolution=merge-duplicates,return=minimal',
			},
			body: JSON.stringify([row]),
		});
		if (!res.ok) {
			const body = await res.text().catch(() => '');
			console.error(`[remoteControl] RemoteSession upsert failed (${res.status}):`, body);
		}
	} catch (e) {
		console.error('[remoteControl] RemoteSession upsert error:', e);
	}
};

const deleteRemoteSession = async (deviceId: string, accessToken: string): Promise<void> => {
	try {
		const res = await fetch(`${DIVISION_SUPABASE_URL}/rest/v1/${REMOTE_SESSION_TABLE}?id=eq.${encodeURIComponent(deviceId)}`, {
			method: 'DELETE',
			headers: {
				'apikey': DIVISION_SUPABASE_ANON_KEY,
				'Authorization': `Bearer ${accessToken}`,
			},
		});
		if (!res.ok && res.status !== 404) {
			const body = await res.text().catch(() => '');
			console.error(`[remoteControl] RemoteSession delete failed (${res.status}):`, body);
		}
	} catch (e) {
		console.error('[remoteControl] RemoteSession delete error:', e);
	}
};

/** ハートビートループを管理するハンドル。stop() は直近の行の削除を試みてから止まる (best-effort)。 */
export class RemoteSessionHeartbeat {
	private _timer: ReturnType<typeof setInterval> | null = null;
	private _current: RemoteSessionHeartbeatInput | null = null;

	/** 既に同じ内容で動いていれば何もしない (設定変更のたびに呼ばれても再起動しないように)。 */
	start(input: RemoteSessionHeartbeatInput): void {
		const prev = this._current;
		const unchanged = !!prev
			&& prev.deviceId === input.deviceId
			&& prev.userId === input.userId
			&& prev.accessToken === input.accessToken
			&& prev.deviceLabel === input.deviceLabel
			&& prev.info.url === input.info.url
			&& prev.info.token === input.info.token;
		this._current = input;
		if (unchanged && this._timer) return;

		void upsertRemoteSession(input);
		if (!this._timer) {
			this._timer = setInterval(() => {
				if (this._current) void upsertRemoteSession(this._current);
			}, HEARTBEAT_INTERVAL_MS);
		}
	}

	stop(): void {
		if (this._timer) {
			clearInterval(this._timer);
			this._timer = null;
		}
		const current = this._current;
		this._current = null;
		if (current) void deleteRemoteSession(current.deviceId, current.accessToken);
	}
}
