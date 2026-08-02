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


// GitHub Release のアセット (ダウンロード対象候補)
export type OrchestraReleaseAsset = {
	// 例: "Orchestra-v1.4.10-darwin-arm64.zip"
	name: string
	// 直接ダウンロード可能な URL (リダイレクトを辿る)
	url: string
	// バイト数
	size: number
}

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
	// リリースに添付された全アセット (自動アップデートのダウンロード候補選定に使う)
	assets: OrchestraReleaseAsset[]
	// 現在の OS/アーキテクチャ向けのビルドがこのリリースに存在するか
	hasAssetForCurrentPlatform: boolean
}

// ダウンロードの進捗 (main プロセスから onDownloadProgress で push される)
export type OrchestraDownloadProgress = {
	receivedBytes: number
	// Content-Length が取れない場合は 0 (不定進捗として扱う)
	totalBytes: number
}

export type OrchestraDownloadResult = { ok: true } | { error: string }
export type OrchestraInstallResult = { ok: true } | { error: string }

export type OrchestraUpdateState =
	| { kind: 'idle' }
	| { kind: 'checking' }
	| { kind: 'ok'; info: OrchestraReleaseInfo }
	| { kind: 'error'; message: string; checkedAt: number }
	| { kind: 'downloading'; info: OrchestraReleaseInfo; receivedBytes: number; totalBytes: number }
	| { kind: 'downloaded'; info: OrchestraReleaseInfo }
	| { kind: 'installing'; info: OrchestraReleaseInfo }
