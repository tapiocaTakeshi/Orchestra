/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// チャットの `/remote-control` で、そのスレッドを Orchestra Mobile と同期する。
//
// 同期中のスレッドは、デスクトップで別のスレッドを開いていてもモバイルのチャット画面に
// 出続け、モバイルからの送信・承認・中断もそのスレッドに向かう。
//
// LAN サーバとの通信はデスクトップ (electron-sandbox/remoteControl.contribution.ts) だけが
// できるので、そちらが setGateway で差し込む。ブラウザ版ではゲートウェイが無いまま。
//
// chatThreadService から使うので、void の他のモジュールは import しない
// (chatThreadServiceInterface.ts にある循環 import の注意と同じ理由)。

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export type RemoteSessionSync = {
	threadId: string;
	/** 同期した時刻。モバイルはこれが変わったら「同期された」と知らせる */
	syncedAt: number;
};

/** ゲートウェイ (メインプロセスの LAN サーバ) の状態 */
export type RemoteGatewayStatus = {
	/** LAN サーバが待ち受けているか */
	listening: boolean;
	/** 例: http://192.168.0.12:39231 */
	url: string;
	/** モバイルの「見つかったデバイス」に出る名前 */
	deviceLabel: string;
	/** デスクトップでログイン中の Division アカウント。未ログインなら null */
	accountEmail: string | null;
	/** アカウントの RemoteSession に今回載せられたか (モバイルから見つけられるか) */
	published: boolean;
	error?: string;
};

export type RemoteGateway = {
	/** RemoteSession をすぐ更新して、モバイルから見つけられる状態にする */
	announce(): Promise<RemoteGatewayStatus>;
	/** ペアリングリンクをクリップボードへ (チャットにはトークンを出さない) */
	copyPairingLink(): Promise<void>;
};

export type RemoteControlCommand = { action: 'sync' } | { action: 'stop' } | { action: 'status' };

/** `/remote-control`, `/remote-control off`, `/remote-control status` を解釈する。それ以外は undefined */
export const parseRemoteControlCommand = (text: string): RemoteControlCommand | undefined => {
	const match = /^\/remote-control(?:\s+(\S+))?\s*$/i.exec(text.trim());
	if (!match) return undefined;
	const arg = (match[1] ?? '').toLowerCase();
	if (!arg || arg === 'on' || arg === 'sync' || arg === 'start') return { action: 'sync' };
	if (arg === 'off' || arg === 'stop') return { action: 'stop' };
	if (arg === 'status') return { action: 'status' };
	return undefined;
};

export interface IRemoteSessionSyncService {
	readonly _serviceBrand: undefined;

	/** 同期中のスレッド。無ければ undefined (モバイルはデスクトップの現在のスレッドを見る) */
	readonly synced: RemoteSessionSync | undefined;
	readonly onDidChangeSync: Event<void>;
	readonly hasGateway: boolean;

	/** スレッドを同期してモバイルに知らせる。ゲートウェイが無ければ status は undefined */
	sync(threadId: string): Promise<RemoteGatewayStatus | undefined>;
	/** 同期中のまま、対象スレッドだけ差し替える (モバイルでのスレッド切り替え用) */
	retarget(threadId: string): void;
	stop(): void;
	status(): Promise<RemoteGatewayStatus | undefined>;
	copyPairingLink(): Promise<void>;

	setGateway(gateway: RemoteGateway): IDisposable;
}

export const IRemoteSessionSyncService = createDecorator<IRemoteSessionSyncService>('remoteSessionSyncService');

class RemoteSessionSyncService extends Disposable implements IRemoteSessionSyncService {
	readonly _serviceBrand: undefined;

	private _synced: RemoteSessionSync | undefined;
	private _gateway: RemoteGateway | undefined;

	private readonly _onDidChangeSync = this._register(new Emitter<void>());
	readonly onDidChangeSync = this._onDidChangeSync.event;

	get synced(): RemoteSessionSync | undefined { return this._synced; }
	get hasGateway(): boolean { return !!this._gateway; }

	async sync(threadId: string): Promise<RemoteGatewayStatus | undefined> {
		this._synced = { threadId, syncedAt: Date.now() };
		this._onDidChangeSync.fire();
		return this._gateway?.announce();
	}

	retarget(threadId: string): void {
		if (!this._synced || this._synced.threadId === threadId) return;
		this._synced = { ...this._synced, threadId };
		this._onDidChangeSync.fire();
	}

	stop(): void {
		if (!this._synced) return;
		this._synced = undefined;
		this._onDidChangeSync.fire();
	}

	async status(): Promise<RemoteGatewayStatus | undefined> {
		return this._gateway?.announce();
	}

	async copyPairingLink(): Promise<void> {
		await this._gateway?.copyPairingLink();
	}

	setGateway(gateway: RemoteGateway): IDisposable {
		this._gateway = gateway;
		return toDisposable(() => { if (this._gateway === gateway) this._gateway = undefined; });
	}
}

registerSingleton(IRemoteSessionSyncService, RemoteSessionSyncService, InstantiationType.Delayed);
