/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { OrchestraDownloadProgress, OrchestraDownloadResult, OrchestraInstallResult, OrchestraReleaseInfo, OrchestraUpdateState, VoidCheckUpdateRespose } from './voidUpdateServiceTypes.js';


// IPC channel 越しに公開する API (main / browser 両側がこれだけを実装する)
export interface IVoidUpdateService {
	readonly _serviceBrand: undefined;
	check: (explicit: boolean) => Promise<VoidCheckUpdateRespose>;
	// GitHub Release を直接見て最新情報を返す (ネットワーク必須)
	fetchLatestRelease: () => Promise<OrchestraReleaseInfo | { error: string }>;
	// 直近に取得したリリースの、現在の OS/アーキテクチャ向けアセットをダウンロード・展開する
	downloadUpdate: () => Promise<OrchestraDownloadResult>;
	// ダウンロード済みの更新を適用する: アプリを終了し、展開済みファイルをインストール先に上書きしてから再起動する
	quitAndInstall: () => Promise<OrchestraInstallResult>;
	// ダウンロード進捗 (downloadUpdate 実行中のみ発火)
	readonly onDownloadProgress: Event<OrchestraDownloadProgress>;
}


// browser 側でのみ提供する追加 API (キャッシュされた state と購読)
export interface IOrchestraUpdateUiService extends IVoidUpdateService {
	readonly state: OrchestraUpdateState;
	readonly onDidChangeUpdateState: Event<OrchestraUpdateState>;
}


export const IVoidUpdateService = createDecorator<IOrchestraUpdateUiService>('VoidUpdateService');


// implemented by calling channel
export class VoidUpdateService extends Disposable implements IOrchestraUpdateUiService {

	readonly _serviceBrand: undefined;
	private readonly voidUpdateService: IVoidUpdateService;

	private _state: OrchestraUpdateState = { kind: 'idle' }
	get state(): OrchestraUpdateState { return this._state }

	private readonly _onDidChangeUpdateState = this._register(new Emitter<OrchestraUpdateState>())
	readonly onDidChangeUpdateState: Event<OrchestraUpdateState> = this._onDidChangeUpdateState.event

	readonly onDownloadProgress: Event<OrchestraDownloadProgress>;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService, // (only usable on client side)
	) {
		super()
		this.voidUpdateService = ProxyChannel.toService<IVoidUpdateService>(mainProcessService.getChannel('void-channel-update'));
		this.onDownloadProgress = this.voidUpdateService.onDownloadProgress

		this._register(this.onDownloadProgress((p) => {
			if (this._state.kind === 'downloading') {
				this._setState({ ...this._state, receivedBytes: p.receivedBytes, totalBytes: p.totalBytes })
			}
		}))
	}


	private _setState(s: OrchestraUpdateState) {
		this._state = s
		this._onDidChangeUpdateState.fire(s)
	}

	// 現在の state に紐づく OrchestraReleaseInfo があれば返す (downloadUpdate/quitAndInstall で使う)
	private _currentInfo(): OrchestraReleaseInfo | null {
		const s = this._state
		if (s.kind === 'ok' || s.kind === 'downloading' || s.kind === 'downloaded' || s.kind === 'installing') {
			return s.info
		}
		return null
	}

	// anything transmitted over a channel must be async even if it looks like it doesn't have to be
	check: IVoidUpdateService['check'] = async (explicit) => {
		const res = await this.voidUpdateService.check(explicit)
		return res
	}

	fetchLatestRelease: IVoidUpdateService['fetchLatestRelease'] = async () => {
		this._setState({ kind: 'checking' })
		try {
			const res = await this.voidUpdateService.fetchLatestRelease()
			if ('error' in res) {
				this._setState({ kind: 'error', message: res.error, checkedAt: Date.now() })
			} else {
				this._setState({ kind: 'ok', info: res })
			}
			return res
		} catch (e) {
			const message = (e instanceof Error ? e.message : String(e)) || 'Unknown error'
			this._setState({ kind: 'error', message, checkedAt: Date.now() })
			return { error: message }
		}
	}

	downloadUpdate: IVoidUpdateService['downloadUpdate'] = async () => {
		const info = this._currentInfo()
		if (!info) {
			return { error: 'アップデート情報がありません。先にアップデートを確認してください。' }
		}
		this._setState({ kind: 'downloading', info, receivedBytes: 0, totalBytes: 0 })
		try {
			const res = await this.voidUpdateService.downloadUpdate()
			if ('error' in res) {
				this._setState({ kind: 'error', message: res.error, checkedAt: Date.now() })
			} else {
				this._setState({ kind: 'downloaded', info })
			}
			return res
		} catch (e) {
			const message = (e instanceof Error ? e.message : String(e)) || 'Unknown error'
			this._setState({ kind: 'error', message, checkedAt: Date.now() })
			return { error: message }
		}
	}

	quitAndInstall: IVoidUpdateService['quitAndInstall'] = async () => {
		const info = this._currentInfo()
		if (this._state.kind !== 'downloaded' || !info) {
			return { error: 'まだアップデートがダウンロードされていません。' }
		}
		this._setState({ kind: 'installing', info })
		try {
			const res = await this.voidUpdateService.quitAndInstall()
			if ('error' in res) {
				this._setState({ kind: 'error', message: res.error, checkedAt: Date.now() })
			}
			// 成功時はここに到達する前にアプリが終了するのが正常系
			return res
		} catch (e) {
			const message = (e instanceof Error ? e.message : String(e)) || 'Unknown error'
			this._setState({ kind: 'error', message, checkedAt: Date.now() })
			return { error: message }
		}
	}
}

registerSingleton(IVoidUpdateService, VoidUpdateService, InstantiationType.Eager);
