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
import { OrchestraReleaseInfo, OrchestraUpdateState, VoidCheckUpdateRespose } from './voidUpdateServiceTypes.js';


// IPC channel 越しに公開する API (main / browser 両側がこれだけを実装する)
export interface IVoidUpdateService {
	readonly _serviceBrand: undefined;
	check: (explicit: boolean) => Promise<VoidCheckUpdateRespose>;
	// GitHub Release を直接見て最新情報を返す (ネットワーク必須)
	fetchLatestRelease: () => Promise<OrchestraReleaseInfo | { error: string }>;
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

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService, // (only usable on client side)
	) {
		super()
		this.voidUpdateService = ProxyChannel.toService<IVoidUpdateService>(mainProcessService.getChannel('void-channel-update'));
	}


	private _setState(s: OrchestraUpdateState) {
		this._state = s
		this._onDidChangeUpdateState.fire(s)
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
}

registerSingleton(IVoidUpdateService, VoidUpdateService, InstantiationType.Eager);
