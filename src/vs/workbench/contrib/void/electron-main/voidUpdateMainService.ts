/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IEnvironmentMainService } from '../../../../platform/environment/electron-main/environmentMainService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IOrchestraUpdateUiService } from '../common/voidUpdateService.js';
import { OrchestraReleaseInfo, OrchestraUpdateState, VoidCheckUpdateRespose } from '../common/voidUpdateServiceTypes.js';

// オートアップデート用の GitHub リポジトリ (owner/repo)。
// product.json の `updateRepository` で上書き可能。
const DEFAULT_UPDATE_REPO = 'tapiocaTakeshi/Orchestra'

// シンプルな semver 比較。"v" や "-pre" などは除去してから比較する。
// a > b なら正の数, a < b なら負の数, 等しければ 0 を返す。
const compareVersions = (a: string, b: string): number => {
	const norm = (s: string) => s
		.trim()
		.replace(/^v/i, '')
		// "-rc.1" や "-beta" を取り除く (今は単純比較のみで十分)
		.split(/[-+]/)[0]
	const pa = norm(a).split('.').map(n => parseInt(n, 10) || 0)
	const pb = norm(b).split('.').map(n => parseInt(n, 10) || 0)
	const len = Math.max(pa.length, pb.length)
	for (let i = 0; i < len; i++) {
		const da = pa[i] ?? 0
		const db = pb[i] ?? 0
		if (da !== db) return da - db
	}
	return 0
}

export class VoidMainUpdateService extends Disposable implements IOrchestraUpdateUiService {
	_serviceBrand: undefined;

	// state / onDidChangeUpdateState はブラウザ側ラッパー(VoidUpdateService)で使う API。
	// main プロセスからは参照されないが、IPC 越しに同じインターフェースを満たすためスタブを置く。
	state: OrchestraUpdateState = { kind: 'idle' }
	private readonly _onDidChangeUpdateState = this._register(new Emitter<OrchestraUpdateState>())
	readonly onDidChangeUpdateState: Event<OrchestraUpdateState> = this._onDidChangeUpdateState.event

	constructor(
		@IProductService private readonly _productService: IProductService,
		@IEnvironmentMainService private readonly _envMainService: IEnvironmentMainService,
	) {
		super()
	}

	private _getRepo(): string {
		const p = this._productService as unknown as { updateRepository?: string }
		const fromProduct = typeof p.updateRepository === 'string' && p.updateRepository.includes('/')
			? p.updateRepository
			: undefined
		return fromProduct || DEFAULT_UPDATE_REPO
	}

	private _getCurrentVersion(): string {
		// product.json の voidVersion (Orchestra の表示バージョン) を優先し、
		// 存在しなければ標準の version を使う。
		const p = this._productService as unknown as { voidVersion?: string; version?: string }
		return (p.voidVersion ?? p.version ?? '0.0.0').trim()
	}

	async fetchLatestRelease(): Promise<OrchestraReleaseInfo | { error: string }> {
		const repo = this._getRepo()
		const url = `https://api.github.com/repos/${repo}/releases/latest`
		try {
			const response = await fetch(url, {
				headers: {
					'Accept': 'application/vnd.github+json',
					'User-Agent': 'Orchestra-Updater',
				},
			})
			if (!response.ok) {
				return { error: `GitHub API ${response.status} ${response.statusText} (${url})` }
			}
			const data = await response.json() as {
				tag_name?: string
				name?: string
				html_url?: string
				body?: string
				published_at?: string
				prerelease?: boolean
			}
			const tagName = data.tag_name ?? ''
			if (!tagName) {
				return { error: 'GitHub release does not include a tag_name.' }
			}
			const latestVersion = tagName.replace(/^v/i, '')
			const currentVersion = this._getCurrentVersion()
			const hasUpdate = compareVersions(latestVersion, currentVersion) > 0
			const info: OrchestraReleaseInfo = {
				latestVersion,
				currentVersion,
				tagName,
				htmlUrl: data.html_url ?? `https://github.com/${repo}/releases/latest`,
				body: data.body ?? '',
				publishedAt: data.published_at ?? null,
				name: data.name ?? null,
				repo,
				hasUpdate,
				checkedAt: Date.now(),
				isPrerelease: !!data.prerelease,
			}
			return info
		} catch (e) {
			return { error: e instanceof Error ? e.message : String(e) }
		}
	}

	async check(explicit: boolean): Promise<VoidCheckUpdateRespose> {
		const isDevMode = !this._envMainService.isBuilt
		if (isDevMode && !explicit) {
			return { message: null }
		}

		const res = await this.fetchLatestRelease()
		if ('error' in res) {
			if (explicit) {
				return {
					message: `アップデート確認時にエラーが発生しました: ${res.error}`,
					action: 'open_release',
				}
			}
			return { message: null }
		}

		if (res.hasUpdate) {
			const versionLabel = res.name && res.name.length > 0 ? res.name : `v${res.latestVersion}`
			return {
				message: `Orchestra の新しいバージョン ${versionLabel} が公開されました! (現在: v${res.currentVersion})`,
				action: 'open_release',
			}
		}

		// 最新の場合は明示チェック時のみ通知
		if (explicit) {
			return { message: `Orchestra は最新です (v${res.currentVersion})`, action: 'open_release' }
		}
		return { message: null }
	}
}
