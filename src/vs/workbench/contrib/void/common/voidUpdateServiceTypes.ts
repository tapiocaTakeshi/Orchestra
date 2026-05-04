/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

export type VoidCheckUpdateRespose = {
	message: string,
	action?: 'reinstall' | 'restart' | 'download' | 'apply' | 'open_release'
} | {
	message: null,
	actions?: undefined,
} | null


// GitHub Release から取得した最新リリース情報
export type OrchestraReleaseInfo = {
	// 例: "1.4.10" (先頭の "v" は除去済み)
	latestVersion: string
	// 例: "1.4.9"
	currentVersion: string
	// 例: "v1.4.10"
	tagName: string
	// リリースページの URL (https://github.com/owner/repo/releases/tag/v1.4.10)
	htmlUrl: string
	// リリースの Markdown 本文 (release notes)
	body: string
	// リリース作成日時 (ISO 8601)
	publishedAt: string | null
	// 名前 (例: "Orchestra 1.4.10")
	name: string | null
	// 取得を試みた owner/repo
	repo: string
	// このバージョンが現在より新しいか
	hasUpdate: boolean
	// チェックを実行したタイムスタンプ (UI で「最後に確認した時刻」を出すため)
	checkedAt: number
	// pre-release か?
	isPrerelease: boolean
}

export type OrchestraUpdateState =
	| { kind: 'idle' }
	| { kind: 'checking' }
	| { kind: 'ok'; info: OrchestraReleaseInfo }
	| { kind: 'error'; message: string; checkedAt: number }
