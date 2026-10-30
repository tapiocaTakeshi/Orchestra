/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// IDE のログインは Division の Web サイトで行う (リダイレクト方式)。
//
//  1. start() が state を作り、ブラウザで <DIVISION_WEBSITE_URL>/orchestra/login?state=... を開く
//  2. ユーザーはサイトでログインし「Orchestra にログイン」を押す
//  3. サイトが orchestra://division-auth/callback?state=...&token_hash=... へリダイレクトする
//  4. ここで受け取り、state が一致すれば onDidReceiveToken で token_hash を渡す
//
// ブラウザと IDE が別のマシンにあると orchestra:// が IDE に届かないので、
// デバイスコード方式 (startDeviceLogin) も用意している。
//
//  1. <DIVISION_WEBSITE_URL>/api/orchestra/device/start で device_code (秘密) と user_code を受け取る
//  2. ユーザーは任意の端末のブラウザで /orchestra/device を開き、user_code を入力して承認する
//  3. ここで /api/orchestra/device/poll をポーリングし、承認されたら token_hash を受け取る
//
// どちらの方式でも token_hash は 1 回だけ使える短命のトークンで、React 側 (divisionAuth.ts) が
// supabase.auth.verifyOtp で IDE 専用のセッションに交換する。Supabase SDK は
// tsup バンドルの中にしか無いので、交換はここではしない。

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IURLHandler, IURLService } from '../../../../platform/url/common/url.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { DIVISION_WEBSITE_URL } from '../common/divisionAuthConfig.js';

/** product.json の urlProtocol の後ろに付く authority。サイト側の ORCHESTRA_CALLBACK と合わせる */
export const DIVISION_AUTH_URL_AUTHORITY = 'division-auth';

export type DivisionBrowserLoginToken = { tokenHash: string };

export type DivisionDeviceLoginInfo = {
	/** ユーザーがブラウザで入力するコード (XXXX-XXXX) */
	userCode: string;
	/** コードを入力するページ */
	verificationUri: string;
	/** コードを埋め込んだページ (同じマシンでブラウザを開くとき用) */
	verificationUriComplete: string;
	/** この時刻 (ms) を過ぎるとコードは使えない */
	expiresAt: number;
};

export interface IDivisionBrowserLoginService {
	readonly _serviceBrand: undefined;

	/** サイトからトークンが届いたとき (state 一致済み) */
	readonly onDidReceiveToken: Event<DivisionBrowserLoginToken>;
	/** デバイスコード方式のログインが失敗・期限切れ・拒否で終わったとき */
	readonly onDidFailDeviceLogin: Event<string>;
	/** ブラウザでログインページを開き、返ってくるリダイレクトを待つ */
	start(): Promise<void>;
	/** デバイスコードを発行し、承認されるまでバックグラウンドでポーリングする */
	startDeviceLogin(): Promise<DivisionDeviceLoginInfo>;
	/** 待っているログインを取り消す。以後届いたリダイレクトやポーリング結果は無視する */
	cancel(): void;
}

export const IDivisionBrowserLoginService = createDecorator<IDivisionBrowserLoginService>('divisionBrowserLoginService');

type DeviceLoginState = { deviceCode: string; timer: ReturnType<typeof setTimeout> | undefined };

class DivisionBrowserLoginService extends Disposable implements IDivisionBrowserLoginService, IURLHandler {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidReceiveToken = this._register(new Emitter<DivisionBrowserLoginToken>());
	readonly onDidReceiveToken = this._onDidReceiveToken.event;

	private readonly _onDidFailDeviceLogin = this._register(new Emitter<string>());
	readonly onDidFailDeviceLogin = this._onDidFailDeviceLogin.event;

	/** 進行中のデバイスコードログイン。cancel() や再発行で入れ替わると古いポーリングは止まる */
	private _deviceLogin: DeviceLoginState | undefined;

	/** 開いたログインページに渡した state。届いたリダイレクトはこれと一致するものだけ受け付ける */
	private _pendingState: string | undefined;

	constructor(
		@IURLService urlService: IURLService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IHostService private readonly _hostService: IHostService,
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async start(): Promise<void> {
		const state = generateUuid().replace(/-/g, '');
		this._pendingState = state;
		const url = `${DIVISION_WEBSITE_URL}/orchestra/login?state=${encodeURIComponent(state)}`;
		await this._openerService.open(URI.parse(url), { openExternal: true });
	}

	async startDeviceLogin(): Promise<DivisionDeviceLoginInfo> {
		this._stopDeviceLogin();
		const res = await fetch(`${DIVISION_WEBSITE_URL}/api/orchestra/device/start`, { method: 'POST' });
		const json = await res.json().catch(() => ({})) as {
			device_code?: string;
			user_code?: string;
			verification_uri?: string;
			verification_uri_complete?: string;
			expires_in?: number;
			interval?: number;
			error_description?: string;
		};
		if (!res.ok || !json.device_code || !json.user_code || !json.verification_uri) {
			throw new Error(json.error_description || 'ログインコードを発行できませんでした。');
		}

		const expiresAt = Date.now() + (json.expires_in ?? 600) * 1000;
		const login: DeviceLoginState = { deviceCode: json.device_code, timer: undefined };
		this._deviceLogin = login;
		this._scheduleDevicePoll(login, (json.interval ?? 5) * 1000, expiresAt);

		return {
			userCode: json.user_code,
			verificationUri: json.verification_uri,
			verificationUriComplete: json.verification_uri_complete ?? json.verification_uri,
			expiresAt,
		};
	}

	private _scheduleDevicePoll(login: DeviceLoginState, intervalMs: number, expiresAt: number): void {
		login.timer = setTimeout(async () => {
			if (this._deviceLogin !== login) return;
			if (Date.now() >= expiresAt) {
				this._failDeviceLogin('コードの有効期限が切れました。もう一度お試しください。');
				return;
			}

			let json: { token_hash?: string; error?: string } = {};
			try {
				const res = await fetch(`${DIVISION_WEBSITE_URL}/api/orchestra/device/poll`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ device_code: login.deviceCode }),
				});
				json = await res.json().catch(() => ({}));
			} catch {
				// 一時的な通信エラーは次の周期で再試行する
				json = { error: 'authorization_pending' };
			}
			if (this._deviceLogin !== login) return;

			if (json.token_hash) {
				this._deviceLogin = undefined;
				await this._hostService.focus(mainWindow, { force: true });
				this._onDidReceiveToken.fire({ tokenHash: json.token_hash });
				return;
			}
			switch (json.error) {
				case 'authorization_pending':
					this._scheduleDevicePoll(login, intervalMs, expiresAt);
					return;
				case 'slow_down':
					this._scheduleDevicePoll(login, intervalMs + 5000, expiresAt);
					return;
				case 'access_denied':
					this._failDeviceLogin('ブラウザでログインが拒否されました。');
					return;
				case 'expired_token':
					this._failDeviceLogin('コードの有効期限が切れました。もう一度お試しください。');
					return;
				default:
					this._failDeviceLogin('ログインに失敗しました。もう一度お試しください。');
			}
		}, intervalMs);
	}

	private _failDeviceLogin(message: string): void {
		this._stopDeviceLogin();
		this._onDidFailDeviceLogin.fire(message);
	}

	private _stopDeviceLogin(): void {
		if (this._deviceLogin?.timer) clearTimeout(this._deviceLogin.timer);
		this._deviceLogin = undefined;
	}

	cancel(): void {
		this._pendingState = undefined;
		this._stopDeviceLogin();
	}

	override dispose(): void {
		this._stopDeviceLogin();
		super.dispose();
	}

	async handleURL(uri: URI): Promise<boolean> {
		if (uri.authority !== DIVISION_AUTH_URL_AUTHORITY) return false;
		const params = new URLSearchParams(uri.query);
		const state = params.get('state');
		const tokenHash = params.get('token_hash');
		// 自分が始めたログイン以外 (古いタブ・他人が作ったリンク) は受け付けない
		if (!this._pendingState || state !== this._pendingState || !tokenHash) return true;
		this._pendingState = undefined;
		await this._hostService.focus(mainWindow, { force: true });
		this._onDidReceiveToken.fire({ tokenHash });
		return true;
	}
}

registerSingleton(IDivisionBrowserLoginService, DivisionBrowserLoginService, InstantiationType.Eager);
