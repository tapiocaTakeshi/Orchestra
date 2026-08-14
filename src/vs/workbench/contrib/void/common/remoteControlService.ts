/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { RemoteControlIdeInfoInput, RemoteControlServerState } from './remoteControlTypes.js';

// IPC channel 越しに公開する API (main / browser 両側がこれだけを実装する)
export interface IRemoteControlService {
	readonly _serviceBrand: undefined;
	/** 有効/無効とトークンをまとめて反映する (冪等)。token が空なら現在の値を維持する。 */
	configure: (opts: { enabled: boolean; token: string }) => Promise<RemoteControlServerState>;
	/** 新しいトークンを発行する。実行中なら再起動して即座に反映する。 */
	regenerateToken: () => Promise<{ token: string; state: RemoteControlServerState }>;
	setIdeInfo: (info: RemoteControlIdeInfoInput) => Promise<void>;
	getState: () => Promise<RemoteControlServerState>;
	readonly onDidChangeState: Event<RemoteControlServerState>;
}

// browser 側でのみ提供する追加 API (キャッシュされた state と購読)
export interface IRemoteControlUiService extends IRemoteControlService {
	readonly state: RemoteControlServerState;
}

export const IRemoteControlService = createDecorator<IRemoteControlUiService>('remoteControlService');

// implemented by calling channel
export class RemoteControlService extends Disposable implements IRemoteControlUiService {
	readonly _serviceBrand: undefined;
	private readonly _channel: IRemoteControlService;

	private _state: RemoteControlServerState = { kind: 'stopped' };
	get state(): RemoteControlServerState { return this._state; }

	private readonly _onDidChangeState = this._register(new Emitter<RemoteControlServerState>());
	readonly onDidChangeState: Event<RemoteControlServerState> = this._onDidChangeState.event;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService, // (only usable on client side)
	) {
		super();
		this._channel = ProxyChannel.toService<IRemoteControlService>(mainProcessService.getChannel('void-channel-remoteControl'));

		this._register(this._channel.onDidChangeState((s) => this._setState(s)));
		// 起動直後の state を取得しておく (main 側が既に起動していた場合に UI が古いまま出るのを防ぐ)
		this._channel.getState().then((s) => this._setState(s)).catch(() => { /* noop */ });
	}

	private _setState(s: RemoteControlServerState): void {
		this._state = s;
		this._onDidChangeState.fire(s);
	}

	configure: IRemoteControlService['configure'] = async (opts) => {
		const state = await this._channel.configure(opts);
		this._setState(state);
		return state;
	};

	regenerateToken: IRemoteControlService['regenerateToken'] = async () => {
		const res = await this._channel.regenerateToken();
		this._setState(res.state);
		return res;
	};

	setIdeInfo: IRemoteControlService['setIdeInfo'] = async (info) => {
		await this._channel.setIdeInfo(info);
	};

	getState: IRemoteControlService['getState'] = async () => {
		return this._channel.getState();
	};
}

registerSingleton(IRemoteControlService, RemoteControlService, InstantiationType.Eager);
