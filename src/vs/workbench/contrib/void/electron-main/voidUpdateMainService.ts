/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { extract } from '../../../../base/node/zip.js';
import { IEnvironmentMainService } from '../../../../platform/environment/electron-main/environmentMainService.js';
import { ILifecycleMainService } from '../../../../platform/lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IOrchestraUpdateUiService } from '../common/voidUpdateService.js';
import { OrchestraDownloadProgress, OrchestraDownloadResult, OrchestraInstallResult, OrchestraReleaseAsset, OrchestraReleaseInfo, OrchestraUpdateState, VoidCheckUpdateRespose } from '../common/voidUpdateServiceTypes.js';

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

// 現在の OS/アーキテクチャに対応するリリースアセットの名前に含まれるタグ (例: "darwin-arm64")。
// .github/workflows/release.yml のアーティファクト命名規則 (Orchestra-<tag>-<platform>-<arch>.<ext>) と対応させる。
const currentPlatformAssetTag = (): string | undefined => {
	const { platform, arch } = process
	if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64'
	if (platform === 'win32' && arch === 'x64') return 'win32-x64'
	if (platform === 'linux' && arch === 'x64') return 'linux-x64'
	return undefined
}

// 自動アップデートで扱える形式 (.exe インストーラー / .zip / .tar.gz) の中から
// 現在のプラットフォーム向けアセットを選ぶ。.dmg のようにマウントが必要な形式は使わない。
// Windows は Orchestra-<tag>-win32-x64.exe (Inno Setup installer) のみを配布するため .exe を最優先する。
const pickAssetForCurrentPlatform = (assets: OrchestraReleaseAsset[]): OrchestraReleaseAsset | undefined => {
	const tag = currentPlatformAssetTag()
	if (!tag) return undefined
	const candidates = assets.filter(a => a.name.includes(`-${tag}.`))
	const byExt = (ext: string) => candidates.find(a => a.name.toLowerCase().endsWith(ext))
	return byExt('.exe') ?? byExt('.zip') ?? byExt('.tar.gz') ?? byExt('.tgz')
}

// SHA256SUMS.txt (sha256sum 互換フォーマット: "<hex>  <filename>") から指定ファイルのハッシュを探す。
const findChecksum = (sumsText: string, fileName: string): string | undefined => {
	for (const rawLine of sumsText.split('\n')) {
		const line = rawLine.trim()
		if (!line || line.startsWith('#')) continue
		const parts = line.split(/\s+/)
		if (parts.length < 2) continue
		const hash = parts[0]
		const name = parts[parts.length - 1].replace(/^\*/, '')
		if (name === fileName || name.endsWith('/' + fileName)) return hash
	}
	return undefined
}

// quitAndInstall() が spawn する、アプリ終了後に実ファイルを差し替えて再起動するだけの
// 独立した Node スクリプト。ELECTRON_RUN_AS_NODE=1 を付けて electron バイナリ自身を
// Node ランタイムとして起動し、このファイルを実行させる。
const UPDATER_SCRIPT = `
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const [, , pidArg, sourceDir, targetDir, exePath] = process.argv;
const pid = parseInt(pidArg, 10);
const MAX_WAIT_MS = 10 * 60 * 1000; // 10分待っても終了しない場合はファイルを触らずに諦める

function isRunning(p) {
	try { process.kill(p, 0); return true; } catch (e) { return false; }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function logError(e) {
	try {
		fs.writeFileSync(path.join(os.tmpdir(), 'orchestra-update-error.log'), String((e && e.stack) || e));
	} catch (_e) { /* noop */ }
}

async function waitForExit() {
	const start = Date.now();
	while (isRunning(pid)) {
		if (Date.now() - start > MAX_WAIT_MS) return false;
		await sleep(200);
	}
	return true;
}

async function copyWithRetry() {
	let lastErr;
	for (let attempt = 0; attempt < 15; attempt++) {
		try {
			fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
			return;
		} catch (e) {
			lastErr = e;
			await sleep(500);
		}
	}
	throw lastErr;
}

async function clearMacQuarantine(dir) {
	await new Promise((resolve) => {
		const p = spawn('xattr', ['-cr', dir], { stdio: 'ignore' });
		p.once('close', resolve);
		p.once('error', resolve);
	});
}

(async () => {
	const exited = await waitForExit();
	if (!exited) {
		logError(new Error('Timed out waiting for the app to exit; aborting update to avoid touching a running install.'));
		return;
	}
	await sleep(300);
	await copyWithRetry();
	if (process.platform === 'darwin') {
		await clearMacQuarantine(targetDir);
		spawn('open', [targetDir], { detached: true, stdio: 'ignore' }).unref();
	} else {
		spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref();
	}
})().catch(logError);
`;

export class VoidMainUpdateService extends Disposable implements IOrchestraUpdateUiService {
	_serviceBrand: undefined;

	// state / onDidChangeUpdateState はブラウザ側ラッパー(VoidUpdateService)で使う API。
	// main プロセスからは参照されないが、IPC 越しに同じインターフェースを満たすためスタブを置く。
	state: OrchestraUpdateState = { kind: 'idle' }
	private readonly _onDidChangeUpdateState = this._register(new Emitter<OrchestraUpdateState>())
	readonly onDidChangeUpdateState: Event<OrchestraUpdateState> = this._onDidChangeUpdateState.event

	private readonly _onDownloadProgress = this._register(new Emitter<OrchestraDownloadProgress>())
	readonly onDownloadProgress: Event<OrchestraDownloadProgress> = this._onDownloadProgress.event

	// 直近に fetchLatestRelease() で取得したリリース情報 (downloadUpdate() が参照する)
	private _lastReleaseInfo: OrchestraReleaseInfo | undefined

	// downloadUpdate() が用意した適用待ちアップデートへの参照 (quitAndInstall() が使う)。
	// 'archive': zip/tar.gz を展開した中身をコピーして差し替える (mac/linux)。
	// 'installer': ダウンロードした setup.exe をサイレント実行する (windows)。
	private _pendingInstall:
		| { kind: 'archive'; contentRoot: string; tagName: string }
		| { kind: 'installer'; installerPath: string; tagName: string }
		| undefined

	constructor(
		@IProductService private readonly _productService: IProductService,
		@IEnvironmentMainService private readonly _envMainService: IEnvironmentMainService,
		@ILifecycleMainService private readonly _lifecycleMainService: ILifecycleMainService,
		@ILogService private readonly _logService: ILogService,
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
				assets?: { name: string; browser_download_url: string; size: number }[]
			}
			const tagName = data.tag_name ?? ''
			if (!tagName) {
				return { error: 'GitHub release does not include a tag_name.' }
			}
			const latestVersion = tagName.replace(/^v/i, '')
			const currentVersion = this._getCurrentVersion()
			const hasUpdate = compareVersions(latestVersion, currentVersion) > 0
			const assets: OrchestraReleaseAsset[] = (data.assets ?? []).map(a => ({
				name: a.name,
				url: a.browser_download_url,
				size: a.size,
			}))
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
				assets,
				hasAssetForCurrentPlatform: !!pickAssetForCurrentPlatform(assets),
			}
			this._lastReleaseInfo = info
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
				action: res.hasAssetForCurrentPlatform ? 'download' : 'open_release',
			}
		}

		// 最新の場合は明示チェック時のみ通知
		if (explicit) {
			return { message: `Orchestra は最新です (v${res.currentVersion})`, action: 'open_release' }
		}
		return { message: null }
	}

	private async _downloadToFile(url: string, destPath: string, onProgress: (receivedBytes: number, totalBytes: number) => void): Promise<void> {
		const response = await fetch(url, { headers: { 'User-Agent': 'Orchestra-Updater' } })
		if (!response.ok || !response.body) {
			throw new Error(`ダウンロードに失敗しました: HTTP ${response.status} ${response.statusText}`)
		}
		const totalBytes = Number(response.headers.get('content-length') ?? 0)
		let receivedBytes = 0
		await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
		const nodeStream = Readable.fromWeb(response.body as unknown as import('stream/web').ReadableStream<Uint8Array>)
		nodeStream.on('data', (chunk: Buffer) => {
			receivedBytes += chunk.length
			onProgress(receivedBytes, totalBytes)
		})
		await pipeline(nodeStream, fs.createWriteStream(destPath))
	}

	private async _sha256File(filePath: string): Promise<string> {
		const hash = crypto.createHash('sha256')
		await pipeline(fs.createReadStream(filePath), hash)
		return hash.digest('hex')
	}

	private _extractTarGz(archivePath: string, destDir: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const child = spawn('tar', ['-xzf', archivePath, '-C', destDir]);
			let stderr = ''
			child.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
			child.once('error', reject)
			child.once('close', (code) => {
				if (code === 0) resolve()
				else reject(new Error(`tar の展開に失敗しました (code ${code}): ${stderr.trim()}`))
			})
		})
	}

	// 展開先ディレクトリ直下がラッパーフォルダ1つだけの場合 (linux tar.gz の "VSCode-linux-x64/" や
	// macOS zip の "Orchestra.app/" など) は、そのフォルダ自体を「実体のルート」とみなす。
	private async _resolveContentRoot(extractedDir: string): Promise<string> {
		const entries = await fs.promises.readdir(extractedDir, { withFileTypes: true })
		if (entries.length === 1 && entries[0].isDirectory()) {
			return path.join(extractedDir, entries[0].name)
		}
		return extractedDir
	}

	private _resolveInstallRoot(): string {
		const resourcesPath = process.resourcesPath
		if (!resourcesPath) {
			throw new Error('インストール先のパスを特定できませんでした (このビルドはソースから実行されている可能性があります)。')
		}
		if (process.platform === 'darwin') {
			// <Install>/Orchestra.app/Contents/Resources -> <Install>/Orchestra.app
			return path.dirname(path.dirname(resourcesPath))
		}
		// win32 / linux: <Install>/resources -> <Install>
		return path.dirname(resourcesPath)
	}

	async downloadUpdate(): Promise<OrchestraDownloadResult> {
		if (!this._envMainService.isBuilt) {
			return { error: 'ソースから実行中のため、自動アップデートは無効です。' }
		}
		const info = this._lastReleaseInfo
		if (!info) {
			return { error: 'アップデート情報がありません。先にアップデートを確認してください。' }
		}
		const asset = pickAssetForCurrentPlatform(info.assets)
		if (!asset) {
			return { error: `お使いのプラットフォーム (${process.platform}-${process.arch}) 向けのビルドはこのリリースにありません。GitHub のリリースページを確認してください。` }
		}

		const workDir = path.join(os.tmpdir(), 'orchestra-updates', info.tagName.replace(/[^\w.-]/g, '_'))
		try {
			await fs.promises.rm(workDir, { recursive: true, force: true })
			await fs.promises.mkdir(workDir, { recursive: true })
			const assetPath = path.join(workDir, asset.name)

			// 不安定なネットワーク環境ではダウンロードが途中で壊れてチェックサムが
			// 一致しないことがある。ユーザーに手動での再試行を強いる前に、ここで
			// 自動的に何度か再ダウンロードを試みる。
			const MAX_DOWNLOAD_ATTEMPTS = 3
			let checksumMismatch = false
			for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
				this._logService.info(`orchestra update: downloading ${asset.name} (attempt ${attempt}/${MAX_DOWNLOAD_ATTEMPTS}, ${asset.size} bytes) from ${asset.url}`)
				await this._downloadToFile(asset.url, assetPath, (receivedBytes, totalBytes) => {
					this._onDownloadProgress.fire({ receivedBytes, totalBytes: totalBytes || asset.size })
				})

				// 整合性チェック (リリースに SHA256SUMS.txt が添付されている場合のみ検証する)
				checksumMismatch = false
				const checksumAsset = info.assets.find(a => a.name.toLowerCase() === 'sha256sums.txt')
				if (checksumAsset) {
					try {
						const sumsRes = await fetch(checksumAsset.url, { headers: { 'User-Agent': 'Orchestra-Updater' } })
						if (sumsRes.ok) {
							const expected = findChecksum(await sumsRes.text(), asset.name)
							if (expected) {
								const actual = await this._sha256File(assetPath)
								if (actual.toLowerCase() !== expected.toLowerCase()) {
									checksumMismatch = true
									this._logService.warn(`orchestra update: checksum mismatch on attempt ${attempt}/${MAX_DOWNLOAD_ATTEMPTS} (expected ${expected}, actual ${actual})`)
								} else {
									this._logService.info('orchestra update: checksum verified OK')
								}
							}
						}
					} catch (e) {
						// チェックサムの取得/検証自体に失敗しても、ダウンロード本体が壊れているとは限らないので致命的にはしない
						this._logService.warn(`orchestra update: checksum verification skipped due to error: ${e instanceof Error ? e.message : String(e)}`)
					}
				}

				if (!checksumMismatch) break
				if (attempt < MAX_DOWNLOAD_ATTEMPTS) {
					await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
				}
			}

			if (checksumMismatch) {
				await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => { })
				return { error: 'ダウンロードしたファイルのチェックサムが一致しませんでした。ネットワークが不安定な可能性があります。もう一度お試しください。' }
			}

			const lowerName = asset.name.toLowerCase()

			// Windows は Inno Setup インストーラー (.exe) を配布している。展開はせず、
			// ダウンロードした setup.exe をそのまま quitAndInstall() でサイレント実行する。
			if (lowerName.endsWith('.exe')) {
				this._pendingInstall = { kind: 'installer', installerPath: assetPath, tagName: info.tagName }
				this._logService.info(`orchestra update: downloaded installer to ${assetPath}, ready to install`)
				return { ok: true }
			}

			const extractedDir = path.join(workDir, 'extracted')
			await fs.promises.mkdir(extractedDir, { recursive: true })

			if (lowerName.endsWith('.zip')) {
				await extract(assetPath, extractedDir, { overwrite: true }, CancellationToken.None)
			} else if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz')) {
				await this._extractTarGz(assetPath, extractedDir)
			} else {
				return { error: `未対応のアーカイブ形式です: ${asset.name}` }
			}

			const contentRoot = await this._resolveContentRoot(extractedDir)
			this._pendingInstall = { kind: 'archive', contentRoot, tagName: info.tagName }
			this._logService.info(`orchestra update: extracted to ${contentRoot}, ready to install`)
			return { ok: true }
		} catch (e) {
			return { error: e instanceof Error ? e.message : String(e) }
		}
	}

	async quitAndInstall(): Promise<OrchestraInstallResult> {
		const pending = this._pendingInstall
		if (!pending) {
			return { error: 'まだアップデートがダウンロードされていません。' }
		}

		// 先にライフサイクルへ終了確認を通す (未保存の変更などがあればここで veto=true が返る)。
		// veto された場合は更新用プロセスを一切起動しない (実行中のインストールに触れないため)。
		// ILifecycleMainService.quit() は内部で electron.app.quit() を呼ぶため、ここで改めて app.quit() は不要。
		const vetoed = await this._lifecycleMainService.quit(true /* will restart */)
		if (vetoed) {
			return { error: '保存されていない変更などにより、再起動がキャンセルされました。' }
		}

		if (pending.kind === 'installer') {
			// Inno Setup インストーラーをサイレント実行する。CloseApplications=force が設定されているため
			// アプリのプロセス終了はインストーラー自身が待ち受ける。runcode タスクはサイレント実行時に
			// 自動的に有効になるため、インストール完了後は自動的に再起動する。
			try {
				const child = spawn(pending.installerPath, [
					'/verysilent',
					'/suppressmsgboxes',
					'/norestart',
					'/mergetasks=runcode,!desktopicon,!quicklaunchicon',
				], {
					detached: true,
					stdio: 'ignore',
					windowsVerbatimArguments: true,
				})
				child.unref()
			} catch (e) {
				return { error: `インストーラーの起動に失敗しました: ${e instanceof Error ? e.message : String(e)}` }
			}

			return { ok: true }
		}

		let targetDir: string
		try {
			targetDir = this._resolveInstallRoot()
		} catch (e) {
			return { error: e instanceof Error ? e.message : String(e) }
		}

		try {
			const scriptPath = path.join(os.tmpdir(), `orchestra-apply-update-${Date.now()}.js`)
			await fs.promises.writeFile(scriptPath, UPDATER_SCRIPT, 'utf8')

			const child = spawn(process.execPath, [scriptPath, String(process.pid), pending.contentRoot, targetDir, process.execPath], {
				detached: true,
				stdio: 'ignore',
				env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			})
			child.unref()
		} catch (e) {
			return { error: `更新用プロセスの起動に失敗しました: ${e instanceof Error ? e.message : String(e)}` }
		}

		return { ok: true }
	}
}
